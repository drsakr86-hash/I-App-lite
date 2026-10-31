// Facebook Messenger + Instagram Direct (Messenger Platform, Send API). Same Meta app as WhatsApp; the PAGE access token comes from the
// Edge secret META_PAGE_TOKEN, never from the browser. Instagram messages go through the Facebook Page linked to the Instagram account.
import { classifyError, GRAPH_DEFAULT } from './meta.js';
import { chunkText, sanitizeIncoming } from './text.js';

export const CHANNELS = ['whatsapp', 'messenger', 'instagram'];
export const TEXT_LIMIT = { messenger: 2000, instagram: 1000 };

// ---------------------------------------------------------------- incoming webhook payload -> normalised events
const tsMs = n => { const v = Number(n); return Number.isFinite(v) && v > 0 ? new Date(v).toISOString() : new Date().toISOString(); };
const textOf = ev => {
  const m = ev.message;
  if (m && typeof m.text === 'string' && m.text.trim()) return m.text;
  if (m && m.quick_reply && m.quick_reply.payload) return String(m.quick_reply.payload);
  if (ev.postback) return ev.postback.title || ev.postback.payload || null;
  return null;
};

// payload.object: 'page' (Messenger) | 'instagram'. cfg: { page_id, ig_account_id } (when set, events for other accounts are ignored).
// opts.ownAppId: echoes created by our own app (the Send API) are ignored; a reply typed in Meta Business Suite is a human reply.
export function parseMessengerPayload(payload, cfg = {}, opts = {}) {
  const out = { inbound: [], echoes: [], ignored: 0 };
  if (!payload || !Array.isArray(payload.entry)) return out;
  const channel = payload.object === 'page' ? 'messenger' : payload.object === 'instagram' ? 'instagram' : null;
  if (!channel) return out;
  const own = channel === 'messenger' ? cfg.page_id : cfg.ig_account_id;
  for (const entry of payload.entry) {
    const acct = String(entry && entry.id || '');
    if (own && acct && acct !== String(own)) { out.ignored++; continue; }
    for (const ev of (entry.messaging || [])) {
      if (!ev || !ev.sender || !ev.recipient) continue;
      const m = ev.message || {};
      const mid = m.mid || (ev.postback && ev.postback.mid);
      if (!mid || m.is_deleted || m.is_unsupported) { out.ignored++; continue; }
      const body = textOf(ev);
      const item = { channel, mid: String(mid), kind: body ? 'text' : 'other', body: body ? sanitizeIncoming(body, 4000) : null, ts: tsMs(ev.timestamp) };
      if (m.is_echo) {
        if (opts.ownAppId ? String(m.app_id || '') === String(opts.ownAppId) : m.app_id) { out.ignored++; continue; }   // sent by the Send API (ours)
        out.echoes.push({ ...item, to: String(ev.recipient.id) });
      } else {
        if (String(ev.sender.id) === acct) { out.ignored++; continue; }
        out.inbound.push({ ...item, extId: String(ev.sender.id) });
      }
    }
  }
  return out;
}

// ---------------------------------------------------------------- Send API client
// Window closed / person unreachable are permanent for this message; anything else follows the WhatsApp classification.
export function classifyMessengerError(status, body) {
  const e = body && body.error, code = e && Number(e.code), sub = e && Number(e.error_subcode);
  const detail = e ? String(e.message || '').slice(0, 250) : '';
  if (code === 10 && sub === 2018278) return { outcome: 'failed', code: 'WINDOW_CLOSED', detail };
  if (code === 551 || (code === 100 && sub === 2018001)) return { outcome: 'failed', code: 'USER_UNAVAILABLE', detail };
  if (code === 613 || code === 32) return { outcome: 'retry', code: String(code), detail };
  return classifyError(status, body);
}

export function createMessengerClient({ token, version = GRAPH_DEFAULT, fetchImpl = globalThis.fetch, timeoutMs = 10000 }) {
  if (!token) throw new Error('messenger client: page token required');
  const url = `https://graph.facebook.com/${version}/me/messages`;
  async function post(recipientId, text) {
    const ctl = new AbortController(); const timer = setTimeout(() => ctl.abort(), timeoutMs);
    let res;
    try {
      res = await fetchImpl(url, { method: 'POST', signal: ctl.signal, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ recipient: { id: String(recipientId) }, messaging_type: 'RESPONSE', message: { text } }) });
    } catch (e) {
      return { outcome: 'uncertain', code: 'UNCERTAIN_NETWORK', detail: String(e && e.name === 'AbortError' ? 'timeout' : (e && e.message) || e).slice(0, 120) };
    } finally { clearTimeout(timer); }
    let json = null; try { json = await res.json(); } catch { /* body missing/invalid */ }
    if (res.ok && json && json.message_id) return { outcome: 'sent', id: String(json.message_id) };
    if (res.ok) return { outcome: 'uncertain', code: 'UNCERTAIN_NO_ID', detail: 'accepted without a message id' };
    return classifyMessengerError(res.status, json);
  }
  return {
    // Long texts are split to the channel limit. If a later part fails after an earlier one went out, the message is reported
    // 'failed' (PARTIAL) and never retried automatically, so the patient never receives the first part twice.
    async sendText(channel, recipientId, body) {
      const parts = chunkText(String(body || ''), TEXT_LIMIT[channel] || 1000);
      if (!parts.length) return { outcome: 'failed', code: 'EMPTY', detail: 'empty message' };
      let last = null;
      for (let i = 0; i < parts.length; i++) {
        const r = await post(recipientId, parts[i]);
        if (r.outcome !== 'sent') return i === 0 ? r : { outcome: 'failed', code: 'PARTIAL_' + (r.code || r.outcome), detail: `part ${i + 1}/${parts.length}: ${r.detail || ''}`.slice(0, 250) };
        last = r;
      }
      return last;
    }
  };
}
