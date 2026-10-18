// MOCKED: Meta client outcome classification (fake fetch), the worker's outbound handling, takeover, staff send and the shared-code drift checks.
// No real Meta call is made anywhere in this file.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createMetaClient, classifyError } from '../supabase/functions/_shared/meta.js';
import { runWorker, handleStaffSend } from '../supabase/functions/_shared/handlers.js';
import { CLINICS as SHARED } from '../supabase/functions/_shared/schedule.js';
import { PATIENT_CLINICS } from '../src/modules/constants/clinics.js';
import { fakeStore, scriptedLlm, say, NOW } from './whatsapp-helpers.js';

const resp = (status, body) => async () => ({ ok: status >= 200 && status < 300, status, json: async () => { if (body === undefined) throw new Error('no body'); return body; } });
const client = f => createMetaClient({ token: 'T', phoneNumberId: '123', fetchImpl: f, timeoutMs: 50 });

test('Meta client: success needs a message id; the token travels only in the Authorization header', async () => {
  let seen; const c = client(async (url, init) => { seen = { url, init }; return { ok: true, status: 200, json: async () => ({ messages: [{ id: 'wamid.X' }] }) }; });
  assert.deepEqual(await c.sendText('2010', 'hi'), { outcome: 'sent', id: 'wamid.X' });
  assert.match(seen.url, /graph\.facebook\.com\/v[\d.]+\/123\/messages$/); assert.equal(seen.init.headers.Authorization, 'Bearer T'); assert.ok(!seen.url.includes('T') || !seen.url.includes('access_token'));
  assert.equal((await client(resp(200, {})).sendText('2010', 'hi')).outcome, 'uncertain');
});
test('Meta client: error classification (transient=retry, permanent=failed, no answer=uncertain)', async () => {
  assert.equal((await client(resp(400, { error: { code: 131047, message: 'x' } })).sendText('a', 'b')).code, 'WINDOW_CLOSED');
  assert.equal((await client(resp(429, { error: { code: 130429 } })).sendText('a', 'b')).outcome, 'retry');
  assert.equal((await client(resp(500, { error: { code: 2 } })).sendText('a', 'b')).outcome, 'retry');
  assert.equal((await client(resp(401, { error: { code: 190 } })).sendText('a', 'b')).outcome, 'failed');
  assert.equal((await client(resp(400, { error: { code: 131026, message: 'undeliverable' } })).sendText('a', 'b')).outcome, 'failed');
  assert.equal((await client(resp(502, undefined)).sendText('a', 'b')).outcome, 'uncertain');
  assert.equal((await client(async () => { throw new Error('ECONNRESET'); }).sendText('a', 'b')).outcome, 'uncertain');
  assert.equal(classifyError(404, null).outcome, 'failed');
});
test('Meta client: a hanging request times out as uncertain (never retried blindly)', async () => {
  const c = client((url, init) => new Promise((_, rej) => init.signal.addEventListener('abort', () => rej(Object.assign(new Error('aborted'), { name: 'AbortError' })))));
  const r = await c.sendText('a', 'b'); assert.equal(r.outcome, 'uncertain'); assert.equal(r.detail, 'timeout');
});
test('Meta client: template payload shape', async () => {
  let body; const c = client(async (u, i) => { body = JSON.parse(i.body); return { ok: true, status: 200, json: async () => ({ messages: [{ id: 'w' }] }) }; });
  await c.sendTemplate('2010', 'appointment_reminder', 'ar', ['الخميس', '20:10']);
  assert.equal(body.type, 'template'); assert.equal(body.template.name, 'appointment_reminder'); assert.equal(body.template.language.code, 'ar'); assert.equal(body.template.components[0].parameters.length, 2);
});

const queued = (over = {}) => ({ id: 1, conversation_id: 1, wa_id: '2010', kind: 'text', body: 'hi', purpose: 'reply', sender: 'ai', consent: 'unknown', last_inbound_at: new Date(NOW.getTime() - 3600000).toISOString(), ai_active: true, ...over });
const meta = out => ({ calls: [], async sendText(...a) { this.calls.push(['text', ...a]); return out; }, async sendTemplate(...a) { this.calls.push(['tpl', ...a]); return out; } });
const work = async (st, m, now = NOW) => runWorker({ store: st, meta: m, llm: scriptedLlm([say('x')]), now: () => now, log: () => {} });

test('worker: sends inside the 24h window and records the provider id', async () => {
  const st = fakeStore({ claimed: [queued()] }); const m = meta({ outcome: 'sent', id: 'wamid.1' });
  const out = await work(st, m); assert.equal(out.sent, 1); assert.deepEqual(st.finished[0].slice(0, 3), [1, 'sent', 'wamid.1']); assert.equal(m.calls.length, 1);
});
test('worker: free text outside the 24h window is NOT sent (template required)', async () => {
  const st = fakeStore({ claimed: [queued({ last_inbound_at: new Date(NOW.getTime() - 25 * 3600000).toISOString() })] }); const m = meta({ outcome: 'sent', id: 'x' });
  await work(st, m); assert.equal(m.calls.length, 0); assert.equal(st.finished[0][1], 'failed'); assert.equal(st.finished[0][3], 'WINDOW_CLOSED');
});
test('worker: template messages are allowed outside the window; opted-out contacts never get reminders', async () => {
  const tpl = queued({ kind: 'template', purpose: 'reminder', sender: 'system', template_name: 'appointment_reminder', template_lang: 'ar', template_params: ['x'], last_inbound_at: null });
  const st = fakeStore({ claimed: [tpl] }); const m = meta({ outcome: 'sent', id: 'w' }); await work(st, m); assert.equal(m.calls[0][0], 'tpl');
  const st2 = fakeStore({ claimed: [{ ...tpl, consent: 'opted_out' }] }); const m2 = meta({ outcome: 'sent', id: 'w' }); await work(st2, m2);
  assert.equal(m2.calls.length, 0); assert.equal(st2.finished[0][1], 'cancelled');
});
test('worker: an AI message is cancelled when a human took over meanwhile', async () => {
  const st = fakeStore({ claimed: [queued({ ai_active: false })] }); const m = meta({ outcome: 'sent', id: 'w' }); await work(st, m);
  assert.equal(m.calls.length, 0); assert.equal(st.finished[0][3], 'HUMAN_TAKEOVER');
});
test('worker: transient error -> retry; uncertain -> uncertain (no auto-resend); missing credentials -> retry later, no crash', async () => {
  const st = fakeStore({ claimed: [queued()] }); await work(st, meta({ outcome: 'retry', code: '130429' })); assert.equal(st.finished[0][1], 'retry');
  const st2 = fakeStore({ claimed: [queued()] }); await work(st2, meta({ outcome: 'uncertain', code: 'UNCERTAIN_NETWORK' })); assert.equal(st2.finished[0][1], 'uncertain');
  const st3 = fakeStore({ claimed: [queued()] }); await work(st3, null); assert.equal(st3.finished[0][3], 'NOT_CONFIGURED');
  const st4 = fakeStore({ claimed: [queued()] }); await work(st4, { sendText: async () => { throw new Error('boom'); } }); assert.equal(st4.finished[0][1], 'uncertain');
});
test('worker: master switch off does nothing; AI off still delivers queued staff messages', async () => {
  const st = fakeStore({ claimed: [queued()] }); st.cfg.enabled = false; const m = meta({ outcome: 'sent', id: 'w' });
  assert.equal((await work(st, m)).disabled, true); assert.equal(m.calls.length, 0);
  const st2 = fakeStore({ claimed: [queued({ sender: 'staff', ai_active: false })] }); st2.cfg.ai_enabled = false; const m2 = meta({ outcome: 'sent', id: 'w' }); await work(st2, m2); assert.equal(m2.calls.length, 1);
});
test('worker: a conversation owned by a human is not processed by the AI', async () => {
  const llm = scriptedLlm([say('x')]);
  const st = fakeStore({ work: [{ conversation_id: 1, max_message_id: 5, attempts: 1 }], bundle: { conv: { id: 1, ai_enabled: false, status: 'handoff', flow_state: {} }, contact: { wa_id: '2010' } } });
  await runWorker({ store: st, meta: null, llm, now: () => NOW, log: () => {} });
  assert.equal(llm.calls.length, 0); assert.equal(st.processed[0].upTo, 5); assert.equal(st.out.length, 0);
});

test('staff send: only admin/secretary, inside the window, idempotent by client id', async () => {
  const st = fakeStore({ roles: { 'sec@x.com': 'secretary', 'doc@x.com': 'doctor' }, window: { id: 1, last_inbound_at: new Date(NOW.getTime() - 3600000).toISOString() } });
  const body = { conversation_id: 1, text: 'أهلا', client_id: 'c1' };
  assert.equal((await handleStaffSend({ user: null, body, store: st, now: () => NOW })).status, 401);
  assert.equal((await handleStaffSend({ user: { email: 'doc@x.com' }, body, store: st, now: () => NOW })).status, 403);
  assert.equal((await handleStaffSend({ user: { email: 'nobody@x.com' }, body, store: st, now: () => NOW })).status, 403);
  assert.equal((await handleStaffSend({ user: { email: 'sec@x.com' }, body: { ...body, text: '' }, store: st, now: () => NOW })).status, 400);
  const ok = await handleStaffSend({ user: { email: 'sec@x.com' }, body, store: st, now: () => NOW }); assert.equal(ok.status, 202); assert.equal(st.out.length, 1);
  assert.equal(st.out[0].sentBy, 'sec@x.com'); assert.equal(st.out[0].sender, 'staff');
  const dup = await handleStaffSend({ user: { email: 'sec@x.com' }, body, store: st, now: () => NOW }); assert.equal(dup.body.duplicate, true); assert.equal(st.out.length, 1);
  st.window = { id: 1, last_inbound_at: new Date(NOW.getTime() - 25 * 3600000).toISOString() };
  assert.equal((await handleStaffSend({ user: { email: 'sec@x.com' }, body: { ...body, client_id: 'c2' }, store: st, now: () => NOW })).status, 409);
});

test('drift: the assistant\'s clinic schedules equal the patient booking portal (PATIENT_CLINICS)', () => {
  const byName = Object.fromEntries(PATIENT_CLINICS.map(c => [c.name, c]));
  assert.equal(SHARED.length, PATIENT_CLINICS.length);
  for (const c of SHARED) {
    const p = byName[c.name]; assert.ok(p, c.name);
    for (const k of ['address', 'phone']) assert.equal(c[k], p[k], c.name + ' ' + k);
    assert.deepEqual(c.days || null, p.days || null, c.name + ' days'); assert.deepEqual(c.sessions || null, p.sessions || null, c.name + ' sessions'); assert.deepEqual(c.schedule || null, p.schedule || null, c.name + ' schedule');
  }
});
test('secrets: no credential-looking value in the new source/config files, and the env template has names only', () => {
  const walk = d => fs.readdirSync(d, { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(d + '/' + e.name) : [d + '/' + e.name]);
  for (const f of walk('supabase')) {
    const t = fs.readFileSync(f, 'utf8');
    assert.ok(!/EAA[A-Za-z0-9]{40,}|sk-ant-[A-Za-z0-9_-]{20,}|eyJ[A-Za-z0-9_-]{30,}\./.test(t), f);
    if (f.endsWith('.env.example')) for (const l of t.split('\n').filter(l => l && !l.startsWith('#'))) assert.match(l, /^[A-Z_]+=$/, f);
  }
  const src = walk('src').filter(f => /\.(js|jsx)$/.test(f)).map(f => fs.readFileSync(f, 'utf8')).join('\n');
  assert.ok(!/META_(APP_SECRET|ACCESS_TOKEN)|SERVICE_ROLE_KEY|ANTHROPIC_API_KEY/.test(src), 'browser code must not reference server secrets');
});
