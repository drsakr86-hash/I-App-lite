// Recovery from a STALE build: after a deploy the hashed chunk files of the previous build no longer exist on the
// server, so a page (or service-worker cache) that still points at them fails with
// "Failed to fetch dynamically imported module". The fix is to drop the stale service worker + shell caches and reload
// ONCE so the new index.html / chunks are used. A guard stops any reload loop: a second failure inside the guard window
// is shown to the user (with a manual button) instead of reloading again.

export const RECOVER_KEY = 'iapp_chunk_recover_at';
export const RECOVER_WINDOW_MS = 120000;

const CHUNK_RE = /Failed to fetch dynamically imported module|error loading dynamically imported module|Importing a module script failed|Loading (CSS )?chunk [\w-]+ failed|ChunkLoadError|Unable to preload CSS/i;

export const isChunkLoadError = e => !!e && CHUNK_RE.test(String((e && e.message) || e));

// Drops service workers and the app-shell caches (NOT localStorage: the offline queue and patient data stay untouched).
export async function clearStaleShell(env = globalThis) {
  try {
    const nav = env.navigator;
    if (nav && nav.serviceWorker && nav.serviceWorker.getRegistrations) {
      const regs = await nav.serviceWorker.getRegistrations();
      await Promise.all(regs.map(r => r.unregister().catch(() => false)));
    }
  } catch { /* best effort */ }
  try {
    const c = env.caches;
    if (c && c.keys) {
      const keys = await c.keys();
      await Promise.all(keys.filter(k => /^iapp-shell-/.test(k)).map(k => c.delete(k)));
    }
  } catch { /* best effort */ }
}

// Returns true when a reload was started (the caller should then just wait), false when recovery is not allowed
// (already tried in the last RECOVER_WINDOW_MS) — the caller rethrows / shows the error.
export async function recoverFromStaleChunk(env = globalThis, { now = Date.now(), force = false } = {}) {
  let store = null;
  try { store = env.sessionStorage; } catch { store = null; }
  if (!force) {
    let last = 0;
    try { last = Number(store && store.getItem(RECOVER_KEY)) || 0; } catch { last = 0; }
    if (last && now - last < RECOVER_WINDOW_MS) return false;
    if (!store) return false;               // cannot remember the attempt → never risk a loop
  }
  try { if (store) store.setItem(RECOVER_KEY, String(now)); } catch { if (!force) return false; }
  await clearStaleShell(env);
  env.location.reload();
  return true;
}

// Wraps a dynamic import for React.lazy: a stale-chunk failure triggers the one-time recovery; the promise then never
// settles (the page is reloading) so React does not flash an error. Any other failure, or a repeat, is rethrown.
export function retryImport(factory, env = globalThis) {
  return factory().catch(async e => {
    if (isChunkLoadError(e) && await recoverFromStaleChunk(env)) return new Promise(() => {});
    throw e;
  });
}

// Vite fires this when a preload of a lazy chunk/CSS fails.
export function installPreloadErrorHandler(env = globalThis) {
  if (!env.addEventListener) return;
  env.addEventListener('vite:preloadError', ev => {
    if (ev && ev.preventDefault) ev.preventDefault();
    recoverFromStaleChunk(env);
  });
}
