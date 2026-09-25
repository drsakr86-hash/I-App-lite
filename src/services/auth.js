// Session guard for the sync layer.
//
// RLS on iapp_store only allows authenticated users, so a write made while the
// Supabase client has lost its session (typically after being offline longer
// than the access-token lifetime) is denied for good. Worse, an anonymous READ
// looks like "empty table", which must never be merged and written back.
// ensureSession() makes sure a valid session exists BEFORE a sync reads or
// writes, and repairs it from the stored refresh token when the SDK is stuck.

function withTimeout(promise, ms) {
  let timer;
  const timeout = new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('timeout')), ms); });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

export async function ensureSession(client, {
  url,
  apiKey,
  storageKey = 'iapp_sb_auth',
  timeoutMs = 8000,
  minValidMs = 15000,
  fetchImpl = (...a) => globalThis.fetch(...a),
  storage = globalThis.localStorage,
  now = () => Date.now()
} = {}) {
  if (!client) return { ok: false, reason: 'no-client' };

  try {
    const r = await withTimeout(client.auth.getSession(), timeoutMs);
    const s = r && r.data && r.data.session;
    if (s && s.expires_at * 1000 - now() > minValidMs) return { ok: true };
  } catch (_) { /* fall through to manual recovery */ }

  let refreshToken = null;
  try {
    const stored = JSON.parse(storage.getItem(storageKey));
    const s = stored && (stored.currentSession || stored);
    refreshToken = s && s.refresh_token;
  } catch (_) {}
  if (!refreshToken) return { ok: false, reason: 'no-session' };

  let res;
  try {
    res = await withTimeout(fetchImpl(`${url}/auth/v1/token?grant_type=refresh_token`, {
      method: 'POST',
      headers: { apikey: apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: refreshToken })
    }), timeoutMs);
  } catch (_) {
    return { ok: false, reason: 'network' };
  }
  if (!res.ok) return { ok: false, reason: res.status >= 400 && res.status < 500 ? 'expired' : 'server' };

  try {
    const j = await res.json();
    const { error } = await withTimeout(client.auth.setSession({
      access_token: j.access_token,
      refresh_token: j.refresh_token
    }), timeoutMs);
    if (error) return { ok: false, reason: 'set-failed' };
  } catch (_) {
    return { ok: false, reason: 'set-failed' };
  }
  return { ok: true, refreshed: true };
}
