// Patient reminders (docs/sql/wa-patient-reminders.sql): "تأكيد الحضور" button, bare "إيقاف" opt-out, worker gates, patient-form phone check.
// The SQL scheduler itself is covered by docs/whatsapp/sql-tests/reminders-assertions.sql (throwaway PostgreSQL).
import test from 'node:test';
import assert from 'node:assert/strict';
import { processConversation, isConfirmButton } from '../supabase/functions/_shared/assistant.js';
import { isOptOut } from '../supabase/functions/_shared/text.js';
import { runWorker } from '../supabase/functions/_shared/handlers.js';
import { hasReminderPhone, CHECKUP_OPTIONS } from '../src/components/forms/patient-form-model.js';
import { fakeStore, scriptedLlm, say, NOW } from './whatsapp-helpers.js';

const WA = '201000000001';
const run = async (st, llm, text) => {
  const env = { store: st, llm, conv: { id: 1 }, contact: { wa_id: WA, consent: 'service', reminders_opt_in: true }, waId: WA, config: st.cfg, now: () => NOW, log: () => {}, flow: {}, unprocessed: [{ id: 10, body: text, kind: 'text' }], attempts: 1 };
  return processConversation(env);
};

test('reminders: confirm button marks attendance without the model', async () => {
  const st = fakeStore(), llm = scriptedLlm([say('x')]);
  let called = 0;
  st.confirmFromReminder = async conv => { called++; assert.equal(conv, 1); return { ok: true, clinic: 'عيادة دمنهور', date_text: 'الثلاثاء 3 نوفمبر', time_text: '8:30 مساءً' }; };
  await run(st, llm, 'تأكيد الحضور');
  assert.equal(called, 1); assert.equal(llm.calls.length, 0);
  assert.match(st.out.at(-1).body, /شكرًا لتأكيد حضورك/); assert.match(st.out.at(-1).body, /8:30 مساءً/);
});

test('reminders: confirm button with no delivered reminder falls through to the model', async () => {
  const st = fakeStore(), llm = scriptedLlm([say('أهلاً بحضرتك، تحب أساعدك في إيه؟')]);
  st.confirmFromReminder = async () => ({ ok: false });
  await run(st, llm, 'تأكيد الحضور');
  assert.equal(llm.calls.length, 1);
});

test('reminders: button texts and opt-out words', () => {
  assert.ok(isConfirmButton('تأكيد الحضور')); assert.ok(isConfirmButton(' تاكيد الحضور ')); assert.ok(!isConfirmButton('عايز أأكد الحضور بكرة ولا لأ؟'));
  for (const w of ['إيقاف', 'ايقاف', 'وقف', 'STOP', 'وقف الرسائل']) assert.ok(isOptOut(w), w);
  for (const w of ['إلغاء', 'تغيير الموعد', 'احجز موعد المتابعة', 'احجز الكشف', 'تأكيد الحضور', 'ايقاف العلاج امتى؟']) assert.ok(!isOptOut(w), w);
});

test('reminders: worker runs the scheduler when only follow-ups are on, and drops opted-out reminders of every kind', async () => {
  let enq = 0; const fins = [];
  const queued = ['reminder', 'followup', 'checkup'].map((purpose, i) => ({ id: i + 1, purpose, consent: 'opted_out', kind: 'template', wa_id: WA, template_name: 't', sender: 'system' }));
  const store = {
    getConfig: async () => ({ enabled: true, reminders_enabled: false, followups_enabled: true, ai_enabled: false }),
    reapStuck: async () => {}, retryPending: async () => {}, enqueueReminders: async () => { enq++; return 0; },
    claimOutbound: async () => queued, finishOutbound: async (id, o, p, code) => { fins.push([id, o, code]); }
  };
  const meta = { sendTemplate: async () => { throw new Error('must not send'); } };
  await runWorker({ store, meta, llm: null, now: () => NOW });
  assert.equal(enq, 1);
  assert.deepEqual(fins, [[1, 'cancelled', 'OPTED_OUT'], [2, 'cancelled', 'OPTED_OUT'], [3, 'cancelled', 'OPTED_OUT']]);
});

test('reminders: patient form phone rule matches the server (Egyptian mobiles only)', () => {
  for (const p of ['01012345678', '+20 101 234 5678', '00201512345678', '٠١٢٠٠٠٠٠٠٠١']) assert.ok(hasReminderPhone(p), p);
  for (const p of ['0453333313', '01312345678', '', null, '0101234567']) assert.ok(!hasReminderPhone(p), String(p));
  assert.deepEqual(CHECKUP_OPTIONS, [3, 6, 12]);
});

test('reminders: a bare "إيقاف" reaching the worker opts the patient out without the model', async () => {
  const st = fakeStore(), llm = scriptedLlm([say('x')]); const calls = [];
  st.setConsent = async (...a) => { calls.push(a); };
  await run(st, llm, 'إيقاف');
  assert.equal(llm.calls.length, 0); assert.deepEqual(calls[0], [WA, null, true, 'chat']); assert.match(st.out.at(-1).body, /تم إيقاف/);
});

test('booking confirmation: friendly Arabic date/time, and no reminder offer for a same-day booking', async () => {
  const { arDate, arTime } = await import('../supabase/functions/_shared/schedule.js');
  assert.equal(arDate('2026-11-04'), 'الأربعاء 4 نوفمبر'); assert.equal(arTime('20:00'), '8:00 مساءً'); assert.equal(arTime('12:10'), '12:10 ظهرًا'); assert.equal(arTime('09:30'), '9:30 صباحًا');
  const today = NOW.toISOString().slice(0, 10);
  const mk = date => ({ pending: { kind: 'book', args: { clinic: 'دمنهور', date, time: '20:10', name: 'سارة أحمد', type: 'x' }, created_msg_id: 9, expires_at: new Date(NOW.getTime() + 600000).toISOString() } });
  const go = async date => {
    const st = fakeStore(); st.cfg.reminders_enabled = true;
    const env = { store: st, llm: scriptedLlm([say('x')]), conv: { id: 1 }, contact: { wa_id: WA, consent: 'service', reminders_opt_in: false }, waId: WA, config: st.cfg, now: () => NOW, log: () => {}, flow: mk(date), unprocessed: [{ id: 10, body: 'تأكيد', kind: 'text' }], attempts: 1 };
    await processConversation(env); return { text: st.out.at(-1).body, flow: env.flow };
  };
  const same = await go(today);
  assert.match(same.text, /8:10 مساءً/); assert.doesNotMatch(same.text, /2026-/); assert.doesNotMatch(same.text, /تذكير/); assert.ok(!same.flow.reminder_offer);
  const later = await go('2026-01-18');
  assert.match(later.text, /الأحد 18 يناير/); assert.match(later.text, /تذكير/); assert.ok(later.flow.reminder_offer);
});

test('a reply cut by the token limit is trimmed to its last complete sentence', async () => {
  const { cutToLastSentence } = await import('../supabase/functions/_shared/assistant.js');
  const cut = 'أهلاً بحضرتك. عشان أساعدك في الحجز، محتاج:\n\n1. العيادة؟\n2. اليوم المناسب.\n3. اسم حضرتك بالكامل.\n\nولاحظت إن طلب الحج';
  assert.equal(cutToLastSentence(cut), 'أهلاً بحضرتك. عشان أساعدك في الحجز، محتاج:\n\n1. العيادة؟\n2. اليوم المناسب.\n3. اسم حضرتك بالكامل.');
  const st = fakeStore(), llm = { calls: [], async complete(a) { this.calls.push(a); return { content: [{ type: 'text', text: cut }], stop_reason: 'max_tokens' }; } };
  await run(st, llm, 'عايز حجز');
  assert.doesNotMatch(st.out.at(-1).body, /طلب الحج$/);
});

// ---- "احجز موعد المتابعة" / "احجز الكشف": the patient is not asked again for what the clinic already knows -----------------------
import { buildSystemPrompt, isBookButton } from '../supabase/functions/_shared/assistant.js';

const runFlow = async (st, llm, text, flow = {}) => {
  const env = { store: st, llm, conv: { id: 1 }, contact: { wa_id: WA, consent: 'service', reminders_opt_in: true }, waId: WA, config: st.cfg, now: () => NOW, log: () => {}, flow, unprocessed: [{ id: 50, body: text, kind: 'text' }] };
  await processConversation(env);
  return env.flow;
};

test('follow-up button: name and last-visit clinic come from the reminder; the reply asks only for the day, without the model', async () => {
  const st = fakeStore(), llm = scriptedLlm([say('x')]);
  st.reminderContext = async conv => { assert.equal(conv, 1); return { kind: 'followup', name: 'عبدالستار سالم صقر', clinic: 'الرحمانية' }; };
  const flow = await runFlow(st, llm, 'احجز موعد المتابعه');
  assert.equal(llm.calls.length, 0);
  const body = st.out.at(-1).body;
  assert.match(body, /باسم عبدالستار سالم صقر/);
  assert.match(body, /عيادة الرحمانية/);
  assert.match(body, /اليوم/);
  assert.doesNotMatch(body, /أنهي عيادة|اسم المريض|رقم/);
  assert.equal(flow.booking_context.clinic, 'الرحمانية');
  assert.equal(flow.booking_context.name, 'عبدالستار سالم صقر');
  assert.equal(st.flow.booking_context.kind, 'followup', 'saved with the conversation');
});

test('follow-up button: unknown clinic -> asks only for the clinic and the day (name already known)', async () => {
  const st = fakeStore(), llm = scriptedLlm([say('x')]);
  st.reminderContext = async () => ({ kind: 'checkup', name: 'منى أحمد', clinic: null });
  const flow = await runFlow(st, llm, 'احجز الكشف');
  const body = st.out.at(-1).body;
  assert.match(body, /الكشف الدوري باسم منى أحمد/);
  assert.match(body, /أنهي عيادة/);
  assert.doesNotMatch(body, /اسم المريض/);
  assert.equal(flow.booking_context.clinic, null);
});

test('follow-up button: placeholder name ("حضرتك") is not used as a name', async () => {
  const st = fakeStore(), llm = scriptedLlm([say('x')]);
  st.reminderContext = async () => ({ kind: 'followup', name: 'حضرتك', clinic: 'دمنهور' });
  const flow = await runFlow(st, llm, 'احجز موعد المتابعة');
  assert.equal(flow.booking_context.name, null);
  assert.match(st.out.at(-1).body, /اسم المريض بالكامل/);
});

test('follow-up button with no reminder found (or a lookup error) falls through to the model', async () => {
  for (const ctx of [async () => null, async () => { throw new Error('db'); }]) {
    const st = fakeStore(), llm = scriptedLlm([say('أهلاً بحضرتك')]);
    st.reminderContext = ctx;
    await runFlow(st, llm, 'احجز موعد المتابعة');
    assert.equal(llm.calls.length, 1);
  }
});

test('follow-up context reaches the model on the next messages and stops it asking again; it expires', () => {
  const info = { topics: {} };
  const config = { clinic_tz: 'Africa/Cairo', booking_mode: 'request' };
  const ctx = { kind: 'followup', name: 'عبدالستار سالم صقر', clinic: 'الرحمانية', expires_at: new Date(NOW.getTime() + 3600000).toISOString() };
  const p = buildSystemPrompt({ info, now: NOW, config, flow: { booking_context: ctx } });
  assert.match(p, /الاسم المسجل "عبدالستار سالم صقر"/);
  assert.match(p, /العيادة "الرحمانية"/);
  assert.match(p, /لا تسأله عن الاسم أو العيادة أو رقم التليفون/);
  const old = buildSystemPrompt({ info, now: NOW, config, flow: { booking_context: { ...ctx, expires_at: new Date(NOW.getTime() - 1).toISOString() } } });
  assert.doesNotMatch(old, /الاسم المسجل/);
});

test('follow-up context is cleared once the booking is done', async () => {
  const st = fakeStore(), llm = scriptedLlm([say('x')]);
  const flow = {
    booking_context: { kind: 'followup', name: 'عبدالستار سالم صقر', clinic: 'الرحمانية', expires_at: new Date(NOW.getTime() + 3600000).toISOString() },
    pending: { kind: 'book', created_msg_id: 10, expires_at: new Date(NOW.getTime() + 3600000).toISOString(), args: { clinic: 'الرحمانية', date: '2026-01-17', time: '16:00', name: 'عبدالستار سالم صقر', type: 'متابعة' } }
  };
  const out = await runFlow(st, llm, 'تمام');
  void out;
  const after = await runFlow(st, llm, 'تمام', flow);
  assert.equal(st.created.length, 1);
  assert.equal(after.booking_context, undefined);
});

test('book buttons are recognised exactly (not free text)', () => {
  for (const w of ['احجز موعد المتابعة', 'احجز موعد المتابعه', ' احجز الكشف ']) assert.ok(isBookButton(w), w);
  for (const w of ['عايز احجز موعد المتابعة بكرة', 'احجز', 'تأكيد الحضور']) assert.ok(!isBookButton(w), w);
});
