// Phase 2 (inert until wired): short-lived signed URL cache with automatic renewal.
// Only a storage path is ever persisted; a URL is created when a file is opened and renewed when it
// expires, so an expired link can never make a file or the patient file unusable.
// The actual signing call is injected (`sign`), so this module has no Supabase dependency and is testable.

export const DEFAULT_TTL_S = 3600;      // link lifetime requested from storage
export const RENEW_SKEW_MS = 5 * 60 * 1000; // renew this long before expiry

export function createSignedUrlCache({ sign, now = () => Date.now(), ttlSeconds = DEFAULT_TTL_S, skewMs = RENEW_SKEW_MS } = {}) {
  if (typeof sign !== 'function') throw new Error('sign required');
  const cache = new Map();    // path -> { url, exp }
  const inflight = new Map(); // path -> Promise<string>

  const fresh = e => e && e.exp - skewMs > now();

  async function fetchOne(path) {
    const res = await sign(path, ttlSeconds);
    const url = typeof res === 'string' ? res : res && res.url;
    if (!url) throw new Error('no url for ' + path);
    cache.set(path, { url, exp: now() + ttlSeconds * 1000 });
    return url;
  }

  function get(path, { force = false } = {}) {
    if (!path) return Promise.reject(new Error('path required'));
    const hit = cache.get(path);
    if (!force && fresh(hit)) return Promise.resolve(hit.url);
    if (inflight.has(path)) return inflight.get(path);
    const p = fetchOne(path).finally(() => inflight.delete(path));
    inflight.set(path, p);
    return p;
  }

  // Many files at once (a gallery): one failure never blocks the others.
  async function getMany(paths) {
    const out = {};
    await Promise.all([...new Set(paths || [])].map(async p => {
      try { out[p] = { ok: true, url: await get(p) }; } catch (e) { out[p] = { ok: false, error: String(e && e.message || e) }; }
    }));
    return out;
  }

  // Open a file; if loading fails (expired / revoked link) renew once and retry, then report a clear error.
  async function open(path, load) {
    const url = await get(path);
    try { return await load(url); } catch {
      const url2 = await get(path, { force: true });
      try { return await load(url2); } catch (e2) { const err = new Error('file unavailable'); err.cause = e2; err.path = path; throw err; }
    }
  }

  return { get, getMany, open, invalidate: path => { cache.delete(path); }, clear: () => cache.clear(), size: () => cache.size };
}

// A resolver shaped for `registerUrlResolver` in services/storage.js. Not registered anywhere yet.
export function makeSupabaseResolver(cache) {
  return meta => cache.get(meta && (meta.key || meta.path));
}
