// MOCKED tests: webhook verification, signature, parsing, duplicates, failures. No network, no database.
import test from 'node:test';
import assert from 'node:assert/strict';
import { handleVerify, handleWebhook } from '../supabase/functions/_shared/handlers.js';
import { verifyMetaSignature } from '../supabase/functions/_shared/signature.js';
import { fakeStore, sign } from './whatsapp-helpers.js';

const SECRET = 'test-app-secret';
const env = { META_APP_SECRET: SECRET };
const payload = (value, field = 'messages') => JSON.stringify({ object: 'whatsapp_business_account', entry: [{ id: 'W', changes: [{ field, value: { metadata: { phone_number_id: 'PNID' }, ...value } }] }] });
const msg = (id, text, from = '201000000001') => ({ contacts: [{ wa_id: from, profile: { name: 'مريض تجريبي' } }], messages: [{ id, from, timestamp: '1768471200', type: 'text', text: { body: text } }] });
const post = (raw, store, extra = {}) => handleWebhook({ rawBody: raw, signature: sign(SECRET, raw), env, store, ...extra });

test('GET handshake: correct token echoes the challenge, wrong/missing token is refused', () => {
  const e = { META_VERIFY_TOKEN: 'vt' };
  assert.deepEqual(handleVerify({ 'hub.mode': 'subscribe', 'hub.verify_token': 'vt', 'hub.challenge': '123' }, e), { status: 200, body: '123', text: true });
  assert.equal(handleVerify({ 'hub.mode': 'subscribe', 'hub.verify_token': 'x', 'hub.challenge': '123' }, e).status, 403);
  assert.equal(handleVerify({ 'hub.mode': 'subscribe', 'hub.challenge': '123' }, e).status, 403);
  assert.equal(handleVerify({ 'hub.mode': 'subscribe', 'hub.verify_token': '', 'hub.challenge': '123' }, { META_VERIFY_TOKEN: '' }).status, 403);
});

test('signature: valid passes; tampered body, wrong secret, missing/malformed header all fail', async () => {
  const raw = '{"a":1}';
  assert.equal(await verifyMetaSignature(raw, sign(SECRET, raw), SECRET), true);
  assert.equal(await verifyMetaSignature(raw + ' ', sign(SECRET, raw), SECRET), false);
  assert.equal(await verifyMetaSignature(raw, sign('other', raw), SECRET), false);
  assert.equal(await verifyMetaSignature(raw, null, SECRET), false);
  assert.equal(await verifyMetaSignature(raw, 'sha256=zz', SECRET), false);
  assert.equal(await verifyMetaSignature(raw, sign(SECRET, raw), ''), false);
});

test('invalid requests: bad signature 401 (nothing stored), bad JSON 400, oversize 413, missing secret 500', async () => {
  const st = fakeStore(); const raw = payload(msg('w1', 'مرحبا'));
  assert.equal((await handleWebhook({ rawBody: raw, signature: 'sha256=00', env, store: st })).status, 401);
  assert.equal(st.msgs.length, 0);
  assert.equal((await handleWebhook({ rawBody: raw, signature: null, env, store: st })).status, 401);
  assert.equal((await post('not json', st)).status, 400);
  assert.equal((await post('x'.repeat(1_000_001), st)).status, 413);
  assert.equal((await handleWebhook({ rawBody: raw, signature: sign(SECRET, raw), env: {}, store: st })).status, 500);
});

test('a valid message is stored once; Meta redelivery of the same message id is a no-op', async () => {
  const st = fakeStore(); let kicks = 0; const raw = payload(msg('w1', 'عايز احجز'));
  const r1 = await post(raw, st, { kickWorker: () => kicks++ });
  assert.equal(r1.status, 200); assert.equal(r1.body.received, 1); assert.equal(st.msgs.length, 1); assert.equal(kicks, 1);
  assert.equal(st.msgs[0].waId, '201000000001'); assert.equal(st.msgs[0].body, 'عايز احجز');
  const r2 = await post(raw, st, { kickWorker: () => kicks++ });
  assert.equal(r2.status, 200); assert.equal(r2.body.received, 0); assert.equal(st.msgs.length, 1); assert.equal(kicks, 1);
});

test('events for another phone number id are ignored', async () => {
  const st = fakeStore(); const raw = JSON.stringify({ object: 'whatsapp_business_account', entry: [{ changes: [{ field: 'messages', value: { metadata: { phone_number_id: 'OTHER' }, ...msg('w9', 'hi') } }] }] });
  assert.equal((await post(raw, st)).status, 200); assert.equal(st.msgs.length, 0);
});

test('non-text messages are stored as kind=other without a body; reactions are skipped', async () => {
  const st = fakeStore();
  const v = { contacts: [], messages: [{ id: 'i1', from: '201000000001', timestamp: '1768471200', type: 'image', image: { id: 'x' } }, { id: 'r1', from: '201000000001', timestamp: '1768471200', type: 'reaction', reaction: { emoji: '👍' } }] };
  await post(payload(v), st);
  assert.equal(st.msgs.length, 1); assert.equal(st.msgs[0].kind, 'other'); assert.equal(st.msgs[0].body, null);
});

test('status updates are recorded, with the Meta error code on failures', async () => {
  const st = fakeStore();
  await post(payload({ statuses: [{ id: 'wamid.A', status: 'delivered', timestamp: '1768471200' }, { id: 'wamid.B', status: 'failed', timestamp: '1768471200', errors: [{ code: 131047, title: 'Re-engagement message' }] }, { id: 'wamid.C', status: 'bogus' }] }), st);
  assert.equal(st.statuses.length, 2); assert.equal(st.statuses[1].code, '131047'); assert.equal(st.statuses[1].status, 'failed');
});

test('coexistence echoes (messages typed in the WhatsApp Business app) are ingested as staff messages', async () => {
  const st = fakeStore();
  await post(payload({ message_echoes: [{ id: 'e1', to: '201000000001', timestamp: '1768471200', type: 'text', text: { body: 'أهلا بحضرتك' } }] }, 'smb_message_echoes'), st);
  assert.equal(st.echoes.length, 1); assert.equal(st.echoes[0].to, '201000000001');
});

test('opt-out words are honoured at ingest, even before the AI runs', async () => {
  const st = fakeStore();
  await post(payload(msg('o1', 'وقف الرسائل')), st);
  assert.equal(st.consent.length, 1); assert.deepEqual(st.consent[0].slice(0, 3), ['201000000001', null, true]);
  assert.equal(st.out.length, 1); assert.equal(st.processed.length, 1);
  const st2 = fakeStore(); await post(payload(msg('o2', 'ممكن تقولي مواعيد الدكتور وبعدها لو سمحت stop بس مش دلوقتي')), st2);
  assert.equal(st2.consent.length, 0);   // a long sentence is not an opt-out
});

test('a database failure answers 500 so Meta retries (nothing is silently dropped)', async () => {
  const st = fakeStore({ ingestFail: true });
  assert.equal((await post(payload(msg('d1', 'مرحبا')), st)).status, 500);
  st.cfg = null; st.ingestFail = false;
  const st2 = fakeStore(); st2.getConfig = async () => { throw new Error('down'); };
  assert.equal((await post(payload(msg('d2', 'x')), st2)).status, 500);
});

test('logs never contain message text or phone numbers', async () => {
  const lines = []; const st = fakeStore({ ingestFail: true });
  await post(payload(msg('l1', 'سري جدا 0100')), st, { log: (e, d) => lines.push(e + JSON.stringify(d)) });
  assert.ok(lines.length); assert.ok(!lines.join('').includes('سري')); assert.ok(!lines.join('').includes('201000000001'));
});
