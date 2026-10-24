// Regression for the real conversation of 2026-10-24: the patient answered the booking summary with two quick messages
// ("ايوة" then "طب ماشي"), the bot only looked at the last one, did not recognise it, and re-sent the summary; the patient
// confirmed 15 min later and found the request expired. Also: addresses must come from the approved FAQ rows.
import test from 'node:test';
import assert from 'node:assert/strict';
import { processConversation, MSG } from '../supabase/functions/_shared/assistant.js';
import { isAffirmative, isNegative } from '../supabase/functions/_shared/text.js';
import { PENDING_TTL_MIN } from '../supabase/functions/_shared/tools.js';
import { buildClinicInfo } from '../supabase/functions/_shared/clinicinfo.js';
import { fakeStore, scriptedLlm, say, NOW } from './whatsapp-helpers.js';

const WA = '201000000002', DATE = '2026-01-15';
const pendingFlow = () => ({ pending: { kind: 'book', args: { clinic: 'دمنهور', date: DATE, time: '20:10', name: 'حبيبة طه', type: 'فحص روتيني' }, created_msg_id: 10, expires_at: new Date(NOW.getTime() + 600000).toISOString() } });
const runBurst = async (st, llm, bodies, flow) => {
  const unprocessed = bodies.map((body, i) => ({ id: 11 + i, body, kind: 'text' }));
  const env = { store: st, llm, conv: { id: 1 }, contact: { wa_id: WA, consent: 'unknown', reminders_opt_in: false }, waId: WA, config: st.cfg, now: () => NOW, log: () => {}, flow, unprocessed, attempts: 1 };
  await processConversation(env); return env;
};

test('two quick messages "ايوة" + "طب ماشي" confirm the proposal (no second summary, no model call)', async () => {
  const st = fakeStore(); const llm = scriptedLlm([say('should not be called')]);
  const env = await runBurst(st, llm, ['ايوة', 'طب ماشي'], pendingFlow());
  assert.equal(llm.calls.length, 0); assert.equal(st.created.length, 1); assert.equal(env.flow.pending, undefined);
});

test('a "no" anywhere in the burst wins over a "yes"', async () => {
  const st = fakeStore(); const llm = scriptedLlm([say('x')]);
  await runBurst(st, llm, ['ايوة', 'لا'], pendingFlow());
  assert.equal(st.created.length, 0);
});

test('a burst that does not contain a yes does not confirm', async () => {
  const st = fakeStore(); const llm = scriptedLlm([say('تمام، قولي الساعة')]);
  await runBurst(st, llm, ['استني', 'عايزة اغير الساعة'], pendingFlow());
  assert.equal(st.created.length, 0);
});

test('filler words are ignored in front of a yes, but a filler alone is not a yes', () => {
  assert.equal(isAffirmative('طب ماشي'), true);
  assert.equal(isAffirmative('خلاص تمام'), true);
  assert.equal(isAffirmative('طيب أكد'), true);
  assert.equal(isAffirmative('طب'), false);
  assert.equal(isAffirmative('طيب'), false);
  assert.equal(isAffirmative('طب مش عايزة'), false);
});

test('the proposal lives long enough for a real patient (>= 60 min) and is stamped with that expiry', () => {
  assert.ok(PENDING_TTL_MIN >= 60 && PENDING_TTL_MIN <= 240, 'TTL ' + PENDING_TTL_MIN);
});

test('an expired proposal still never executes', async () => {
  const st = fakeStore(); const f = pendingFlow(); f.pending.expires_at = new Date(NOW.getTime() - 1000).toISOString();
  await runBurst(st, scriptedLlm([say('x')]), ['تأكيد'], f);
  assert.equal(st.created.length, 0); assert.equal(st.out.at(-1).body, MSG.expired);
});

const FAQ = [
  { topic: 'عنوان فرع الرحمانية', answer: 'الرحمانية: شارع أحمد محمود بجوار فرع we.', active: true },
  { topic: 'عنوان فرع دمنهور', answer: 'دمنهور: برج المنتزه بجوار حديقة الجمهورية، أمام بنك مصر.', active: true },
  { topic: 'عنوان مركز دمنهور للعيون', answer: 'مركز دمنهور للعيون: شارع عبدالسلام الشاذلي بجوار مدرسة الصفوة.', active: true },
  { topic: 'سعر الكشف في دمنهور', answer: 'الكشف 300 جنيه.', active: true }
];

test('addresses come from the approved FAQ rows, each row to the right clinic', () => {
  const lines = buildClinicInfo({ faq: FAQ }).location.text.split('\n');
  const dam = lines.find(l => l.startsWith('دمنهور')), rah = lines.find(l => l.startsWith('الرحمانية')), center = lines.find(l => l.startsWith('مركز دمنهور'));
  assert.match(dam, /أمام بنك مصر/); assert.doesNotMatch(dam, /الصفوة/);
  assert.match(center, /عبدالسلام الشاذلي بجوار مدرسة الصفوة/); assert.doesNotMatch(center, /بنك مصر/);
  assert.match(rah, /بجوار فرع we/);
  for (const l of lines) assert.match(l, /هاتف \d+/);
});

test('without FAQ rows (or inactive ones) the built-in addresses are used', () => {
  for (const faq of [[], FAQ.map(f => ({ ...f, active: false }))]) {
    const t = buildClinicInfo({ faq }).location.text;
    assert.match(t, /برج المنتزه بجوار حديقة الجمهورية/); assert.match(t, /مركز دمنهور للعيون: دمنهور/);
  }
});
