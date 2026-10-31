// MOCKED tests: Messenger / Instagram webhook parsing, Send API client, channel-aware worker and assistant. No network, no database.
import test from 'node:test';
import assert from 'node:assert/strict';
import { handleMessengerWebhook, runWorker } from '../supabase/functions/_shared/handlers.js';
import { parseMessengerPayload, createMessengerClient, classifyMessengerError } from '../supabase/functions/_shared/messenger.js';
import { processConversation } from '../supabase/functions/_shared/assistant.js';
import { toolDefinitionsFor, createToolRuntime } from '../supabase/functions/_shared/tools.js';
import { egyptMobile, toPlainText } from '../supabase/functions/_shared/text.js';
import { fakeStore, scriptedLlm, say, useTool, sign, NOW } from './whatsapp-helpers.js';

const SECRET = 'test-app-secret';
const PSID = '24816357900112233';
const ev = (mid, text, extra = {}) => ({ sender: { id: PSID }, recipient: { id: 'PAGE1' }, timestamp: 1768471200000, message: { mid, text, ...extra } });
const page = (...messaging) => ({ object: 'page', entry: [{ id: 'PAGE1', time: 1, messaging }] });

const mstore = (over = {}) => {
  const st = fakeStore(over);
  st.inCh = []; st.echoCh = []; st.phones = [];
  st.ingestInboundCh = async m => { if (st.inCh.some(x => x.mid === m.mid)) return { duplicate: true }; st.inCh.push(m); return { duplicate: false, conversation_id: 5, message_id: st.inCh.length }; };
  st.ingestEchoCh = async m => { st.echoCh.push(m); return { duplicate: false }; };
  st.setContactPhone = async (c, p) => { st.phones.push([c, p]); };
  return st;
};

test('parse: Messenger text + postback, Instagram, echoes, deletes and other accounts', () => {
  const p = parseMessengerPayload(page(ev('m1', 'السلام عليكم'), { sender: { id: PSID }, recipient: { id: 'PAGE1' }, timestamp: 1, postback: { mid: 'm2', title: 'احجز موعد' } },
    { sender: { id: PSID }, recipient: { id: 'PAGE1' }, timestamp: 1, message: { mid: 'm3', attachments: [{ type: 'image' }] } },
    { sender: { id: PSID }, recipient: { id: 'PAGE1' }, timestamp: 1, message: { mid: 'm4', is_deleted: true } }), { page_id: 'PAGE1' });
  assert.equal(p.inbound.length, 3);
  assert.deepEqual(p.inbound.map(x => [x.channel, x.extId, x.kind, x.body]), [['messenger', PSID, 'text', 'السلام عليكم'], ['messenger', PSID, 'text', 'احجز موعد'], ['messenger', PSID, 'other', null]]);
  assert.equal(p.ignored, 1);
  // events for another page are ignored when the page id is configured
  assert.equal(parseMessengerPayload(page(ev('m1', 'x')), { page_id: 'OTHER' }).inbound.length, 0);
  // Instagram
  const ig = parseMessengerPayload({ object: 'instagram', entry: [{ id: 'IG1', messaging: [{ sender: { id: '1789' + '0'.repeat(13) }, recipient: { id: 'IG1' }, timestamp: 1, message: { mid: 'ig1', text: 'hi' } }] }] }, { ig_account_id: 'IG1' });
  assert.equal(ig.inbound[0].channel, 'instagram');
  // echoes: ours (our app id) ignored, Business Suite echo kept as a human reply
  const e = parseMessengerPayload(page({ sender: { id: 'PAGE1' }, recipient: { id: PSID }, timestamp: 1, message: { mid: 'e1', text: 'رد', is_echo: true, app_id: 111 } },
    { sender: { id: 'PAGE1' }, recipient: { id: PSID }, timestamp: 1, message: { mid: 'e2', text: 'رد من الصفحة', is_echo: true } }), {}, { ownAppId: '111' });
  assert.deepEqual(e.echoes.map(x => [x.mid, x.to]), [['e2', PSID]]);
  // whatsapp payloads are not this handler's business
  assert.equal(parseMessengerPayload({ object: 'whatsapp_business_account', entry: [] }).inbound.length, 0);
});

test('webhook: signature required, ingest is idempotent, worker kicked only for new messages', async () => {
  const st = mstore(); let kicks = 0; const raw = JSON.stringify(page(ev('m1', 'مرحبا')));
  const env = { META_APP_SECRET: SECRET };
  assert.equal((await handleMessengerWebhook({ rawBody: raw, signature: 'sha256=00', env, store: st })).status, 401);
  assert.equal(st.inCh.length, 0);
  const ok = await handleMessengerWebhook({ rawBody: raw, signature: sign(SECRET, raw), env, store: st, kickWorker: () => kicks++ });
  assert.deepEqual([ok.status, ok.body.received, kicks], [200, 1, 1]);
  const dup = await handleMessengerWebhook({ rawBody: raw, signature: sign(SECRET, raw), env, store: st, kickWorker: () => kicks++ });
  assert.deepEqual([dup.body.received, kicks, st.inCh.length], [0, 1, 1]);
  st.ingestInboundCh = async () => { throw new Error('db down'); };
  const raw2 = JSON.stringify(page(ev('m9', 'x')));
  assert.equal((await handleMessengerWebhook({ rawBody: raw2, signature: sign(SECRET, raw2), env, store: st })).status, 500);   // Meta retries
});

test('Send API client: success, window closed, transient, network, long text split and partial failure', async () => {
  const calls = [];
  const fetchOk = async (url, o) => { calls.push(JSON.parse(o.body)); return { ok: true, status: 200, json: async () => ({ recipient_id: PSID, message_id: 'mid.' + calls.length }) }; };
  const c = createMessengerClient({ token: 'T', fetchImpl: fetchOk });
  assert.deepEqual(await c.sendText('messenger', PSID, 'أهلا'), { outcome: 'sent', id: 'mid.1' });
  assert.equal(calls[0].recipient.id, PSID); assert.equal(calls[0].messaging_type, 'RESPONSE');
  calls.length = 0;
  const long = ('سطر طويل '.repeat(30) + '\n').repeat(6);
  const r = await c.sendText('instagram', PSID, long);
  assert.equal(r.outcome, 'sent'); assert.ok(calls.length >= 2); assert.ok(calls.every(x => x.message.text.length <= 1000));
  assert.equal(classifyMessengerError(400, { error: { code: 10, error_subcode: 2018278 } }).code, 'WINDOW_CLOSED');
  assert.equal(classifyMessengerError(400, { error: { code: 613 } }).outcome, 'retry');
  const net = createMessengerClient({ token: 'T', fetchImpl: async () => { throw new Error('boom'); } });
  assert.equal((await net.sendText('messenger', PSID, 'x')).outcome, 'uncertain');
  let n = 0;
  const half = createMessengerClient({ token: 'T', fetchImpl: async () => (++n === 1 ? { ok: true, status: 200, json: async () => ({ message_id: 'a' }) } : { ok: false, status: 500, json: async () => null }) });
  const p = await half.sendText('instagram', PSID, long);
  assert.equal(p.outcome, 'failed'); assert.match(p.code, /^PARTIAL_/);    // never auto-resent
});

test('worker: Messenger rows go to the Send API, WhatsApp rows to the Cloud API; no templates and no closed window off WhatsApp', async () => {
  const fresh = new Date(NOW.getTime() - 3600e3).toISOString(), old = new Date(NOW.getTime() - 30 * 3600e3).toISOString();
  const st = mstore({ claimed: [
    { id: 1, channel: 'messenger', wa_id: PSID, kind: 'text', body: 'أهلا', sender: 'staff', purpose: 'manual', last_inbound_at: fresh, ai_active: false },
    { id: 2, channel: 'instagram', wa_id: PSID, kind: 'text', body: 'x', sender: 'staff', purpose: 'manual', last_inbound_at: old, ai_active: false },
    { id: 3, channel: 'messenger', wa_id: PSID, kind: 'template', template_name: 't', sender: 'system', purpose: 'reminder', last_inbound_at: fresh, ai_active: false },
    { id: 4, wa_id: '201000000001', kind: 'text', body: 'wa', sender: 'staff', purpose: 'manual', last_inbound_at: fresh, ai_active: false }
  ] });
  st.cfg.ai_enabled = false;
  const sentM = [], sentW = [];
  const messenger = { async sendText(ch, to, body) { sentM.push([ch, to, body]); return { outcome: 'sent', id: 'mid.x' }; } };
  const meta = { async sendText(to, body) { sentW.push([to, body]); return { outcome: 'sent', id: 'wamid.x' }; } };
  await runWorker({ store: st, meta, messenger, llm: null, now: () => NOW, log: () => {} });
  assert.deepEqual(sentM, [['messenger', PSID, 'أهلا']]);
  assert.deepEqual(sentW, [['201000000001', 'wa']]);
  const by = id => st.finished.find(f => f[0] === id);
  assert.equal(by(1)[1], 'sent'); assert.equal(by(2)[3], 'WINDOW_CLOSED'); assert.equal(by(3)[3], 'TEMPLATE_WHATSAPP_ONLY'); assert.equal(by(4)[1], 'sent');
  // no page token yet: kept for later, not failed
  const st2 = mstore({ claimed: [{ id: 9, channel: 'messenger', wa_id: PSID, kind: 'text', body: 'x', sender: 'staff', last_inbound_at: fresh }] }); st2.cfg.ai_enabled = false;
  await runWorker({ store: st2, meta, messenger: null, llm: null, now: () => NOW, log: () => {} });
  assert.deepEqual([st2.finished[0][1], st2.finished[0][3]], ['retry', 'NOT_CONFIGURED']);
});

test('tools: off WhatsApp there is no lookup/cancel/reschedule, and a booking needs a valid mobile number', async () => {
  const names = ch => toolDefinitionsFor(ch).map(t => t.name);
  assert.ok(names('whatsapp').includes('list_my_appointments'));
  for (const ch of ['messenger', 'instagram']) {
    assert.deepEqual(names(ch).filter(n => /my_appointments|cancel|reschedule/.test(n)), []);
    assert.ok(toolDefinitionsFor(ch).find(t => t.name === 'propose_booking').input_schema.required.includes('phone'));
  }
  const st = mstore(); const flow = {};
  const rt = createToolRuntime({ store: st, conv: { id: 5 }, waId: PSID, channel: 'messenger', config: st.cfg, now: () => NOW, flow, latestMsgId: 3, info: {} });
  assert.equal((await rt.execute('list_my_appointments', { patient_name: 'أحمد علي' })).error, 'UNKNOWN_TOOL');
  assert.equal((await rt.execute('propose_cancel', { ref: 'A1' })).error, 'UNKNOWN_TOOL');
  const base = { clinic: 'دمنهور', date: '2026-01-18', time: '20:10', patient_name: 'أحمد علي' };
  assert.equal((await rt.execute('propose_booking', base)).error, 'PHONE_REQUIRED');
  assert.equal((await rt.execute('propose_booking', { ...base, phone: '12345' })).error, 'PHONE_REQUIRED');
  const ok = await rt.execute('propose_booking', { ...base, phone: '٠١٠٩٨٧٦٥٤٣٢' });
  assert.equal(ok.ok, true); assert.equal(flow.pending.args.phone, '01098765432');
  assert.equal(egyptMobile('+20 109 876 5432'), '01098765432'); assert.equal(egyptMobile('0453333313'), '');
});

test('assistant on Messenger: confirmed request uses the typed phone, never direct booking, no reminder offer, plain text', async () => {
  const st = mstore(); st.cfg.booking_mode = 'direct';
  const contact = { wa_id: PSID, channel: 'messenger', consent: 'service', reminders_opt_in: false };
  const flow = { pending: { kind: 'book', args: { clinic: 'دمنهور', date: '2026-01-18', time: '20:10', name: 'أحمد علي', type: 'فحص روتيني', phone: '01098765432' }, created_msg_id: 9, expires_at: new Date(NOW.getTime() + 3600e3).toISOString() } };
  await processConversation({ store: st, llm: scriptedLlm([say('x')]), conv: { id: 5 }, contact, waId: PSID, channel: 'messenger', config: st.cfg, now: () => NOW, log: () => {}, flow, unprocessed: [{ id: 10, body: 'تأكيد', kind: 'text' }], attempts: 1 });
  assert.equal(st.booked.length, 0);
  assert.equal(st.created.length, 1); assert.equal(st.created[0].waId, '01098765432');
  assert.deepEqual(st.phones, [[5, '01098765432']]);
  const text = st.out.map(o => o.body).join('\n');
  assert.match(text, /طلب حجزك/); assert.match(text, /01098765432/); assert.doesNotMatch(text, /تذكير/);
  // a cancel proposal smuggled into the flow is refused off WhatsApp
  const st2 = mstore();
  const flow2 = { pending: { kind: 'cancel', args: { id: 1, clinic: 'دمنهور', date: '2026-01-18', time: '20:10' }, created_msg_id: 9, expires_at: new Date(NOW.getTime() + 3600e3).toISOString() } };
  await processConversation({ store: st2, llm: scriptedLlm([say('x')]), conv: { id: 5 }, contact, waId: PSID, channel: 'messenger', config: st2.cfg, now: () => NOW, log: () => {}, flow: flow2, unprocessed: [{ id: 10, body: 'تأكيد', kind: 'text' }], attempts: 1 });
  assert.equal(st2.cancelled.length, 0); assert.equal(st2.handoffs[0].reason, 'bad_pending');
  // model text: Markdown removed, prompt names the channel, phone-based tools not offered
  const st3 = mstore(); const llm = scriptedLlm([say('أهلا بيك في **عيادات** صقر')]);
  await processConversation({ store: st3, llm, conv: { id: 5 }, contact, waId: PSID, channel: 'instagram', config: st3.cfg, now: () => NOW, log: () => {}, flow: {}, unprocessed: [{ id: 10, body: 'السلام عليكم', kind: 'text' }], attempts: 1 });
  assert.equal(st3.out[0].body, 'أهلا بيك في عيادات صقر');
  assert.match(llm.calls[0].system, /إنستجرام/);
  assert.equal(llm.calls[0].tools.some(t => t.name === 'list_my_appointments'), false);
  assert.equal(toPlainText('*مهم* و **جدا**'), 'مهم و جدا');
});

test('assistant on WhatsApp is unchanged: lookup tools offered, prompt says واتساب', async () => {
  const st = mstore(); const llm = scriptedLlm([say('أهلا')]);
  await processConversation({ store: st, llm, conv: { id: 1 }, contact: { wa_id: '201000000001', consent: 'service' }, waId: '201000000001', config: st.cfg, now: () => NOW, log: () => {}, flow: {}, unprocessed: [{ id: 10, body: 'السلام عليكم', kind: 'text' }], attempts: 1 });
  assert.ok(llm.calls[0].tools.some(t => t.name === 'list_my_appointments'));
  assert.match(llm.calls[0].system, /على واتساب/);
});

test('inbox model: channel, label and lookup phone never treat a Messenger id as a phone', async () => {
  const { channelOf, contactLabel, lookupPhone } = await import('../src/modules/whatsapp/model.js');
  const wa = { contact: { wa_id: '201012345678' } }, ms = { contact: { wa_id: PSID, channel: 'messenger', phone: '01098765432' } }, ig = { contact: { wa_id: PSID, channel: 'instagram' } };
  assert.deepEqual([channelOf(wa), channelOf(ms), channelOf(ig)], ['whatsapp', 'messenger', 'instagram']);
  assert.equal(contactLabel(ms, 'ماسنجر'), 'ماسنجر #2233');
  assert.equal(contactLabel({ contact: { ...ig.contact, profile_name: 'منى' } }, 'x'), 'منى');
  assert.deepEqual([lookupPhone(wa), lookupPhone(ms), lookupPhone(ig)], ['201012345678', '01098765432', '']);
});
