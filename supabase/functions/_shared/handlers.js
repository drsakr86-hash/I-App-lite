// Request/worker logic with every dependency injected (store, meta, llm, clock, logger), so it runs in Deno (the Edge Functions) and is
// unit-tested in Node with fakes. Nothing here touches the network or the database directly.
import { verifyMetaSignature, safeEqual } from './signature.js';
import { isOptOut, sanitizeIncoming } from './text.js';
import { processConversation } from './assistant.js';
import { parseMessengerPayload } from './messenger.js';

const MAX_BODY = 1_000_000;
const WINDOW_MS = 24 * 3600 * 1000;
const json = (status, body) => ({ status, body });

// ---------------------------------------------------------------- GET: Meta's subscription handshake
export function handleVerify(query, env) {
  const mode = query['hub.mode'], token = query['hub.verify_token'], challenge = query['hub.challenge'];
  if (mode === 'subscribe' && env.META_VERIFY_TOKEN && safeEqual(String(token || ''), env.META_VERIFY_TOKEN) && challenge) return { status: 200, body: String(challenge), text: true };
  return json(403, { error: 'verification failed' });
}

// ---------------------------------------------------------------- POST: incoming events. Durable ingest first, then 200.
const textOf = m => {
  if (m.type === 'text') return m.text && m.text.body;
  if (m.type === 'button') return m.button && (m.button.text || m.button.payload);
  if (m.type === 'interactive') return m.interactive && ((m.interactive.button_reply && m.interactive.button_reply.title) || (m.interactive.list_reply && m.interactive.list_reply.title));
  return null;
};
const tsOf = s => { const n = Number(s); return Number.isFinite(n) && n > 0 ? new Date(n * 1000).toISOString() : new Date().toISOString(); };

export async function handleWebhook({ rawBody, signature, env, store, kickWorker, log = () => {} }) {
  if (typeof rawBody !== 'string' || rawBody.length > MAX_BODY) return json(413, { error: 'too large' });
  if (!env.META_APP_SECRET) { log('webhook_no_secret', {}); return json(500, { error: 'not configured' }); }
  if (!(await verifyMetaSignature(rawBody, signature, env.META_APP_SECRET))) { log('webhook_bad_signature', {}); return json(401, { error: 'invalid signature' }); }
  let payload; try { payload = JSON.parse(rawBody); } catch { return json(400, { error: 'invalid json' }); }
  if (!payload || payload.object !== 'whatsapp_business_account' || !Array.isArray(payload.entry)) return json(200, { ignored: true });

  let cfg; try { cfg = await store.getConfig(); } catch (e) { log('webhook_config_error', { err: String(e.message) }); return json(500, { error: 'temporary' }); }
  let fresh = 0, failures = 0;
  for (const entry of payload.entry) for (const ch of (entry.changes || [])) {
    const v = ch.value || {};
    if (cfg && cfg.phone_number_id && v.metadata && v.metadata.phone_number_id && String(v.metadata.phone_number_id) !== String(cfg.phone_number_id)) { log('webhook_other_number', {}); continue; }
    try {
      if (ch.field === 'messages') {
        const names = Object.fromEntries((v.contacts || []).map(c => [String(c.wa_id), c.profile && c.profile.name]));
        for (const m of (v.messages || [])) {
          if (!m || !m.id || !m.from || m.type === 'reaction' || m.type === 'system') continue;
          const body = textOf(m);
          const r = await store.ingestInbound({ waId: String(m.from), name: names[String(m.from)], wamid: m.id, kind: body ? 'text' : 'other', body: body ? sanitizeIncoming(body, 4000) : null, ts: tsOf(m.timestamp) });
          if (r && r.duplicate) continue;
          fresh++;
          if (body && isOptOut(body)) {      // opt-out is honoured here, independent of the AI/human state of the conversation
            await store.setConsent(String(m.from), null, true, 'chat');
            await store.enqueueText({ conv: r.conversation_id, sender: 'system', purpose: 'reply', body: 'تم إيقاف رسائل التذكير. لو احتجت حاجة تقدر تكلمنا في أي وقت.', idem: 'optout:' + m.id });
            await store.markProcessed(r.conversation_id, r.message_id, null);
          }
        }
        for (const s of (v.statuses || [])) {
          if (!s || !s.id || !['sent', 'delivered', 'read', 'failed'].includes(s.status)) continue;
          const e0 = Array.isArray(s.errors) && s.errors[0];
          await store.recordStatus({ wamid: s.id, status: s.status, ts: tsOf(s.timestamp), code: e0 ? String(e0.code) : null, detail: e0 ? String((e0.error_data && e0.error_data.details) || e0.title || '') : null });
        }
      } else if (ch.field === 'smb_message_echoes') {
        for (const m of (v.message_echoes || [])) {
          if (!m || !m.id || !m.to) continue;
          await store.ingestEcho({ to: String(m.to), wamid: m.id, kind: textOf(m) ? 'text' : 'other', body: textOf(m) ? sanitizeIncoming(textOf(m), 4000) : null, ts: tsOf(m.timestamp) });
        }
      } else if (ch.field === 'account_update' || ch.field === 'phone_number_quality_update' || ch.field === 'message_template_status_update') {
        log('webhook_account_event', { field: ch.field, event: v.event || v.current_limit || null });
        await store.audit('system', 'meta.' + ch.field + (v.event ? ':' + String(v.event).slice(0, 40) : ''), null);
      } else log('webhook_field_ignored', { field: ch.field });
    } catch (e) { failures++; log('webhook_item_error', { field: ch.field, err: String(e && e.message || e).slice(0, 160) }); }
  }
  if (failures) return json(500, { error: 'temporary' });     // Meta retries (with decreasing frequency, up to 7 days); every write above is idempotent
  if (fresh && kickWorker) { try { kickWorker(); } catch { /* the cron run will pick it up */ } }
  return json(200, { ok: true, received: fresh });
}

// ---------------------------------------------------------------- POST: Messenger / Instagram events (same Meta app, same signature)
export async function handleMessengerWebhook({ rawBody, signature, env, store, kickWorker, log = () => {} }) {
  if (typeof rawBody !== 'string' || rawBody.length > MAX_BODY) return json(413, { error: 'too large' });
  if (!env.META_APP_SECRET) { log('mwebhook_no_secret', {}); return json(500, { error: 'not configured' }); }
  if (!(await verifyMetaSignature(rawBody, signature, env.META_APP_SECRET))) { log('mwebhook_bad_signature', {}); return json(401, { error: 'invalid signature' }); }
  let payload; try { payload = JSON.parse(rawBody); } catch { return json(400, { error: 'invalid json' }); }
  if (!payload || (payload.object !== 'page' && payload.object !== 'instagram') || !Array.isArray(payload.entry)) return json(200, { ignored: true });
  let cfg; try { cfg = await store.getConfig(); } catch (e) { log('mwebhook_config_error', { err: String(e.message) }); return json(500, { error: 'temporary' }); }
  const ev = parseMessengerPayload(payload, cfg || {}, { ownAppId: env.META_APP_ID });
  if (ev.ignored) log('mwebhook_ignored', { n: ev.ignored });
  let fresh = 0, failures = 0;
  for (const m of ev.inbound) {
    try { const r = await store.ingestInboundCh(m); if (r && !r.duplicate) fresh++; }
    catch (e) { failures++; log('mwebhook_item_error', { channel: m.channel, err: String(e && e.message || e).slice(0, 160) }); }
  }
  for (const m of ev.echoes) {
    try { await store.ingestEchoCh(m); }
    catch (e) { failures++; log('mwebhook_echo_error', { channel: m.channel, err: String(e && e.message || e).slice(0, 160) }); }
  }
  if (failures) return json(500, { error: 'temporary' });     // Meta retries; every write is idempotent per message id
  if (fresh && kickWorker) { try { kickWorker(); } catch { /* the cron run will pick it up */ } }
  return json(200, { ok: true, received: fresh });
}

// ---------------------------------------------------------------- worker (cron every minute + kicked by the webhook)
export async function runWorker({ store, meta, messenger = null, llm, now = () => new Date(), log = () => {}, budgetMs = 50000 }) {
  const started = Date.now(), over = () => Date.now() - started > budgetMs;
  const cfg = await store.getConfig();
  const out = { disabled: false, reminders: 0, processed: 0, sent: 0, failed: 0, retried: 0 };
  if (!cfg || !cfg.enabled) return { ...out, disabled: true };
  await store.reapStuck(); await store.retryPending();
  if (cfg.reminders_enabled) out.reminders = await store.enqueueReminders();

  if (cfg.ai_enabled && llm) {
    const work = await store.claimInbound(5);
    for (const w of (work || [])) {
      if (over()) break;
      try {
        const b = await store.getBundle(w.conversation_id);
        if (!b || !b.conv.ai_enabled || b.conv.status !== 'ai') { await store.markProcessed(w.conversation_id, w.max_message_id, null); continue; }   // a human owns it: the AI stays silent
        const unprocessed = await store.getUnprocessed(w.conversation_id, w.max_message_id);
        if (!unprocessed.length) continue;
        const r = await processConversation({ store, llm, conv: b.conv, contact: b.contact, waId: b.contact.wa_id, channel: b.contact.channel || 'whatsapp', config: cfg, now, log, flow: { ...(b.conv.flow_state || {}) }, unprocessed, attempts: w.attempts });
        if (r && r.ok) out.processed++;
      } catch (e) {
        log('process_error', { conv: w.conversation_id, err: String(e && e.message || e).slice(0, 160) });
        try { await store.markProcessed(w.conversation_id, w.max_message_id, 'worker: ' + String(e && e.message || e).slice(0, 200)); } catch { /* released by the claim timeout */ }
      }
    }
  }

  const claimed = await store.claimOutbound(20);
  for (const m of (claimed || [])) {
    const fin = async (o, id, code, detail, secs) => { await store.finishOutbound(m.id, o, id, code, detail, secs); if (o === 'sent') out.sent++; else if (o === 'retry') out.retried++; else out.failed++; };
    try {
      if (over()) { await fin('retry', null, 'BUDGET', 'worker time budget reached', 15); continue; }
      if (m.purpose === 'reminder' && m.consent === 'opted_out') { await fin('cancelled', null, 'OPTED_OUT', 'contact opted out'); continue; }
      if (m.sender === 'ai' && !m.ai_active) { await fin('cancelled', null, 'HUMAN_TAKEOVER', 'conversation no longer belongs to the AI'); continue; }
      const ch = m.channel || 'whatsapp';
      if (ch !== 'whatsapp') {       // Messenger / Instagram: free text inside the 24 h window only (no templates there)
        if (m.kind === 'template') { await fin('failed', null, 'TEMPLATE_WHATSAPP_ONLY', 'templates exist on WhatsApp only'); continue; }
        if (!messenger) { await fin('retry', null, 'NOT_CONFIGURED', 'page token missing', 300); continue; }
        const openM = m.last_inbound_at && now().getTime() - new Date(m.last_inbound_at).getTime() < WINDOW_MS;
        if (!openM) { await fin('failed', null, 'WINDOW_CLOSED', '24h messaging window closed'); continue; }
        const rm = await messenger.sendText(ch, m.wa_id, m.body);
        await fin(rm.outcome, rm.id, rm.code, rm.detail, 60);
        continue;
      }
      if (!meta) { await fin('retry', null, 'NOT_CONFIGURED', 'Meta credentials missing', 300); continue; }
      let r;
      if (m.kind === 'template') r = await meta.sendTemplate(m.wa_id, m.template_name, m.template_lang, Array.isArray(m.template_params) ? m.template_params : []);
      else {
        const open = m.last_inbound_at && now().getTime() - new Date(m.last_inbound_at).getTime() < WINDOW_MS;
        if (!open) { await fin('failed', null, 'WINDOW_CLOSED', '24h customer-service window closed; a template is required'); continue; }
        r = await meta.sendText(m.wa_id, m.body);
      }
      await fin(r.outcome, r.id, r.code, r.detail, 60);
    } catch (e) { log('send_error', { id: m.id, err: String(e && e.message || e).slice(0, 160) }); try { await fin('uncertain', null, null, 'worker error while sending'); } catch { /* reaped later */ } }
  }
  return out;
}

// ---------------------------------------------------------------- staff manual reply (called by the app with the staff member's JWT)
export async function handleStaffSend({ user, body, store, kickWorker, now = () => new Date() }) {
  if (!user || !user.email) return json(401, { error: 'not signed in' });
  const role = await store.staffRole(user.email);
  if (role !== 'admin' && role !== 'secretary') return json(403, { error: 'forbidden' });
  const convId = Number(body && body.conversation_id), text = sanitizeIncoming(body && body.text, 4000), clientId = String((body && body.client_id) || '').replace(/[^\w-]/g, '').slice(0, 64);
  if (!Number.isInteger(convId) || convId <= 0 || !text || !clientId) return json(400, { error: 'invalid request' });
  const conv = await store.getConversationWindow(convId);
  if (!conv) return json(404, { error: 'conversation not found' });
  if (!conv.last_inbound_at || now().getTime() - new Date(conv.last_inbound_at).getTime() >= WINDOW_MS) return json(409, { error: 'WINDOW_CLOSED', message: 'مرّت 24 ساعة على آخر رسالة من المريض: الرد الحر غير مسموح من هنا. استخدم تطبيق واتساب للأعمال (أو صندوق رسائل الصفحة لماسنجر/إنستجرام).' });
  const id = await store.enqueueText({ conv: convId, sender: 'staff', purpose: 'manual', body: text, idem: `man:${convId}:${clientId}`, sentBy: String(user.email).toLowerCase() });
  if (kickWorker) { try { kickWorker(); } catch { /* cron will send */ } }
  return json(202, { ok: true, queued: id !== null, duplicate: id === null });
}
