// Official WhatsApp Business Platform (Cloud API) client. Token/phone-number-id come from server secrets, never from the browser.
// Outcome classification is what keeps the queue honest:
//   sent       Meta accepted it (we have the wamid)
//   retry      Meta answered with a transient error => the message was NOT accepted, safe to try again later
//   failed     permanent error (window closed, bad number, template problem, auth)
//   uncertain  no usable answer (timeout / network / 5xx without a body): it MAY have been sent => never auto-retried
export const TRANSIENT_CODES = new Set([1, 2, 4, 17, 80007, 130429, 131016, 131056, 133016, 131000]);
export const GRAPH_DEFAULT = 'v23.0';

export function classifyError(status, body) {
  const code = body && body.error && Number(body.error.code);
  const detail = body && body.error ? String(body.error.message || body.error.error_user_msg || '').slice(0, 250) : '';
  if (status === 401 || code === 190) return { outcome: 'failed', code: 'AUTH_' + (code || 401), detail: detail || 'access token invalid or expired' };
  if (status === 429 || TRANSIENT_CODES.has(code)) return { outcome: 'retry', code: String(code || status), detail };
  if (code) {
    if (code === 131047) return { outcome: 'failed', code: 'WINDOW_CLOSED', detail };   // 24 h customer-service window closed: a template is required
    return { outcome: 'failed', code: String(code), detail };
  }
  if (status >= 500 || status === 0) return { outcome: 'uncertain', code: 'UNCERTAIN_' + status, detail: detail || 'no usable answer from Meta' };
  return { outcome: 'failed', code: 'HTTP_' + status, detail };
}

export function createMetaClient({ token, phoneNumberId, version = GRAPH_DEFAULT, fetchImpl = globalThis.fetch, timeoutMs = 10000 }) {
  if (!token || !phoneNumberId) throw new Error('meta client: token and phoneNumberId are required');
  const url = `https://graph.facebook.com/${version}/${encodeURIComponent(phoneNumberId)}/messages`;
  async function post(payload) {
    const ctl = new AbortController(); const timer = setTimeout(() => ctl.abort(), timeoutMs);
    let res;
    try {
      res = await fetchImpl(url, { method: 'POST', signal: ctl.signal, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ messaging_product: 'whatsapp', recipient_type: 'individual', ...payload }) });
    } catch (e) {
      return { outcome: 'uncertain', code: 'UNCERTAIN_NETWORK', detail: String(e && e.name === 'AbortError' ? 'timeout' : (e && e.message) || e).slice(0, 120) };
    } finally { clearTimeout(timer); }
    let json = null; try { json = await res.json(); } catch { /* body missing/invalid */ }
    const id = json && json.messages && json.messages[0] && json.messages[0].id;
    if (res.ok && id) return { outcome: 'sent', id };
    if (res.ok) return { outcome: 'uncertain', code: 'UNCERTAIN_NO_ID', detail: 'accepted without a message id' };
    return classifyError(res.status, json);
  }
  return {
    sendText: (to, body) => post({ to, type: 'text', text: { body: String(body).slice(0, 4096), preview_url: false } }),
    sendTemplate: (to, name, lang, params = []) => post({ to, type: 'template', template: { name, language: { code: lang || 'ar' }, components: params.length ? [{ type: 'body', parameters: params.map(p => ({ type: 'text', text: String(p).slice(0, 200) })) }] : [] } })
  };
}
