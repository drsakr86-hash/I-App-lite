// Web Push without a payload: the service worker shows a fixed notice ("a chat is waiting"), so nothing about the patient ever travels through the push service.
// Auth = VAPID (RFC 8292): an ES256 JWT signed with the private key held ONLY in the Edge secret VAPID_PRIVATE_KEY.
const enc = new TextEncoder();
const b64uToBytes = s => { const b = atob(String(s).replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(String(s).length / 4) * 4, '=')); return Uint8Array.from(b, c => c.charCodeAt(0)); };
const bytesToB64u = bytes => btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const strB64u = s => bytesToB64u(enc.encode(s));

export async function vapidAuthHeader({ endpoint, publicKey, privateKey, subject, now = Date.now() }) {
  const pub = b64uToBytes(publicKey);                       // 65 bytes: 0x04 | X | Y
  if (pub.length !== 65 || pub[0] !== 4) throw new Error('bad VAPID public key');
  const jwk = { kty: 'EC', crv: 'P-256', x: bytesToB64u(pub.slice(1, 33)), y: bytesToB64u(pub.slice(33)), d: String(privateKey), ext: true };
  const key = await crypto.subtle.importKey('jwk', jwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  const head = strB64u(JSON.stringify({ typ: 'JWT', alg: 'ES256' }));
  const body = strB64u(JSON.stringify({ aud: new URL(endpoint).origin, exp: Math.floor(now / 1000) + 12 * 3600, sub: subject }));
  const sig = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, enc.encode(head + '.' + body));   // raw r|s, as JWS ES256 requires
  return `vapid t=${head}.${body}.${bytesToB64u(sig)}, k=${publicKey}`;
}

// -> 'ok' | 'gone' (subscription no longer valid: forget it) | 'error'
export async function sendPush(sub, vapid, fetchImpl = globalThis.fetch) {
  try {
    const res = await fetchImpl(sub.endpoint, { method: 'POST', headers: { Authorization: await vapidAuthHeader({ endpoint: sub.endpoint, ...vapid }), TTL: '3600', Urgency: 'high', 'Content-Length': '0' } });
    if (res.status === 404 || res.status === 410) return 'gone';
    return res.status >= 200 && res.status < 300 ? 'ok' : 'error';
  } catch { return 'error'; }
}

// Called by the worker after each run. Never throws. Does nothing unless the private key is configured.
export async function notifyWaiting({ store, privateKey, subject = 'mailto:dr.sakr86@gmail.com', fetchImpl, log = () => {} }) {
  if (!privateKey) return { skipped: 'no_key' };
  try {
    const job = await store.pushClaim();
    if (!job || !job.count || !Array.isArray(job.subs) || !job.subs.length) return { sent: 0 };
    const results = await Promise.all(job.subs.map(async s => [s.id, await sendPush(s, { publicKey: job.public_key, privateKey, subject }, fetchImpl)]));
    const gone = results.filter(r => r[1] === 'gone').map(r => r[0]);
    if (gone.length) await store.pushDrop(gone);
    const sent = results.filter(r => r[1] === 'ok').length;
    log('push_sent', { chats: job.count, sent, gone: gone.length, failed: results.length - sent - gone.length });
    return { sent, gone: gone.length };
  } catch (e) { log('push_error', { err: String(e && e.message || e).slice(0, 120) }); return { error: true }; }
}
