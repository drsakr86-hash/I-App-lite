import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { isChunkLoadError, recoverFromStaleChunk, retryImport, RECOVER_KEY, RECOVER_WINDOW_MS } from '../src/app/chunk-recovery.js';

// ---------- chunk recovery (no reload loop) ----------
const mkEnv = ({ session = true } = {}) => {
  const store = new Map();
  const calls = { reload: 0, unregistered: 0, deleted: [] };
  const env = {
    sessionStorage: session ? { getItem: k => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)) } : undefined,
    location: { reload: () => { calls.reload++; } },
    navigator: { serviceWorker: { getRegistrations: async () => [{ unregister: async () => { calls.unregistered++; return true; } }] } },
    caches: { keys: async () => ['iapp-shell-a', 'iapp-img-v13', 'iapp-shell-b'], delete: async k => { calls.deleted.push(k); return true; } }
  };
  return { env, calls, store };
};

test('isChunkLoadError recognises the browser messages of a missing lazy chunk and nothing else', () => {
  for (const m of ['Failed to fetch dynamically imported module: https://x/assets/SecretaryApp-DRchu2iq.js', 'error loading dynamically imported module', 'Importing a module script failed.', 'Loading chunk 12 failed.', 'Unable to preload CSS for /a.css'])
    assert.equal(isChunkLoadError(new TypeError(m)), true, m);
  assert.equal(isChunkLoadError(new Error('Cannot read properties of undefined')), false);
  assert.equal(isChunkLoadError(null), false);
});

test('recovery: first stale-chunk failure clears shell caches + service worker (not app data) and reloads ONCE', async () => {
  const { env, calls, store } = mkEnv();
  assert.equal(await recoverFromStaleChunk(env, { now: 1000 }), true);
  assert.equal(calls.reload, 1);
  assert.equal(calls.unregistered, 1);
  assert.deepEqual(calls.deleted.sort(), ['iapp-shell-a', 'iapp-shell-b']);   // image/font caches untouched
  assert.equal(store.get(RECOVER_KEY), '1000');
});

test('recovery: no reload loop — a second failure inside the window is NOT reloaded; after the window it may retry', async () => {
  const { env, calls } = mkEnv();
  assert.equal(await recoverFromStaleChunk(env, { now: 1000 }), true);
  assert.equal(await recoverFromStaleChunk(env, { now: 1000 + RECOVER_WINDOW_MS - 1 }), false);
  assert.equal(calls.reload, 1);
  assert.equal(await recoverFromStaleChunk(env, { now: 1000 + RECOVER_WINDOW_MS + 1 }), true);
  assert.equal(calls.reload, 2);
});

test('recovery: when the attempt cannot be remembered (no sessionStorage) it never reloads; the manual button (force) still works', async () => {
  const { env, calls } = mkEnv({ session: false });
  assert.equal(await recoverFromStaleChunk(env, { now: 1 }), false);
  assert.equal(calls.reload, 0);
  assert.equal(await recoverFromStaleChunk(env, { now: 1, force: true }), true);
  assert.equal(calls.reload, 1);
});

test('retryImport: success passes through; other errors are rethrown; a stale chunk reloads once and then surfaces the error', async () => {
  const { env, calls } = mkEnv();
  assert.deepEqual(await retryImport(async () => ({ default: 1 }), env), { default: 1 });
  await assert.rejects(retryImport(async () => { throw new Error('boom'); }, env), /boom/);
  assert.equal(calls.reload, 0);
  const stale = async () => { throw new TypeError('Failed to fetch dynamically imported module: /assets/X-1.js'); };
  const pending = retryImport(stale, env);
  const res = await Promise.race([pending.then(() => 'settled', () => 'settled'), new Promise(r => setTimeout(() => r('pending'), 30))]);
  assert.equal(res, 'pending', 'while reloading the lazy promise never settles (no error flash)');
  assert.equal(calls.reload, 1);
  await assert.rejects(retryImport(stale, env), /dynamically imported/);       // second time: error shown, no loop
  assert.equal(calls.reload, 1);
});

// ---------- service worker: consistent install / activation / routing ----------
function loadSW({ build = 'b2', list = ['./assets/index-A.js', './assets/Chunk-B.js'], origin = 'https://h.io/I-App-lite/', net = () => new Response('ok', { status: 200 }), existing = {} } = {}) {
  const handlers = {};
  const stores = new Map(Object.entries(existing).map(([k, v]) => [k, new Map(Object.entries(v))]));
  const abs = u => new URL(typeof u === 'string' ? u : u.url, origin + 'sw.js').href;
  const mkCache = name => ({
    put: async (k, r) => { stores.get(name).set(abs(k), r); },
    match: async k => { const r = stores.get(name).get(abs(k)); return r ? r.clone() : undefined; },
    keys: async () => [...stores.get(name).keys()].map(u => ({ url: u })),
    delete: async k => stores.get(name).delete(abs(k))
  });
  const caches = {
    open: async n => { if (!stores.has(n)) stores.set(n, new Map()); return mkCache(n); },
    keys: async () => [...stores.keys()],
    delete: async n => stores.delete(n),
    match: async k => { for (const n of stores.keys()) { const r = stores.get(n).get(abs(k)); if (r) return r.clone(); } return undefined; }
  };
  const fetched = [];
  const ctx = {
    self: { addEventListener: (t, f) => { handlers[t] = f; }, location: new URL(origin + 'sw.js'), skipWaiting: () => { ctx.skipped = true; }, clients: { claim: async () => {} } },
    caches, URL, Request: class extends Request { constructor(u, o) { super(new URL(typeof u === 'string' ? u : u.url, origin + 'sw.js').href, o); } }, Response, AbortController, setTimeout, clearTimeout, Promise, console,
    fetch: async (req, opts) => { fetched.push(typeof req === 'string' ? req : req.url); return net(typeof req === 'string' ? req : req.url); },
    skipped: false
  };
  const src = readFileSync('public/sw.js', 'utf8').replace('"__BUILD_ID__"', JSON.stringify(build)).replace('/*__PRECACHE_LIST__*/ []', JSON.stringify(list));
  vm.runInNewContext(src, ctx);
  const lifecycle = async type => { let p; handlers[type]({ waitUntil: x => { p = x; } }); return p; };
  const fetchEvt = async (url, mode = 'cors') => { let p; handlers.fetch({ request: { url, method: 'GET', mode, clone() { return this; } }, respondWith: x => { p = x; } }); return p; };
  return { ctx, stores, install: () => lifecycle('install'), activate: () => lifecycle('activate'), fetchEvt, fetched };
}

test('sw install: precaches index.html + every chunk of THIS build under iapp-shell-<build>', async () => {
  const sw = loadSW();
  await sw.install();
  assert.equal(sw.ctx.skipped, true);
  const cached = [...sw.stores.get('iapp-shell-b2').keys()].map(u => u.replace('https://h.io/I-App-lite/', ''));
  for (const f of ['', 'index.html', 'queue-display.html', 'assets/index-A.js', 'assets/Chunk-B.js']) assert.ok(cached.includes(f), f);
});

test('sw install: if ANY file of the build cannot be fetched the install FAILS (old worker + cache stay; no half-filled cache is activated)', async () => {
  const sw = loadSW({ net: u => (u.includes('Chunk-B') ? new Response('nf', { status: 404 }) : new Response('ok')) });
  await assert.rejects(sw.install(), /precache failed/);
  assert.equal(sw.ctx.skipped, false);
});

test('sw activate: keeps the current and the previous shell (a tab on the old build still finds its chunks), drops older ones, keeps image/font caches', async () => {
  const sw = loadSW({ build: 'b3', existing: { 'iapp-shell-b1': {}, 'iapp-shell-b2': {}, 'iapp-shell-b3': {}, 'iapp-img-iapp-v13-20261004': {}, 'iapp-font-iapp-v13-20261004': {}, 'iapp-old-junk': {} } });
  await sw.activate();
  assert.deepEqual([...sw.stores.keys()].sort(), ['iapp-font-iapp-v13-20261004', 'iapp-img-iapp-v13-20261004', 'iapp-shell-b2', 'iapp-shell-b3']);
});

test('sw navigation: network index.html is served but NEVER written into the cache (cached html must match cached chunks); offline falls back to the precached one', async () => {
  let online = true;
  const sw = loadSW({ net: u => { if (!online) throw new Error('offline'); return new Response(u.endsWith('/') ? 'NEW-HTML' : 'x'); } });
  await sw.install();
  const before = await (sw.stores.get('iapp-shell-b2').get('https://h.io/I-App-lite/index.html')).clone().text();
  const res = await sw.fetchEvt('https://h.io/I-App-lite/', 'navigate');
  assert.equal(await res.text(), 'NEW-HTML');
  assert.equal(await (sw.stores.get('iapp-shell-b2').get('https://h.io/I-App-lite/index.html')).clone().text(), before, 'cached index.html untouched');
  online = false;
  const off = await sw.fetchEvt('https://h.io/I-App-lite/', 'navigate');
  assert.equal(await off.text(), before);
});

test('sw assets: a chunk of the previous build is served from the previous cache; a missing chunk is a real 404, never index.html', async () => {
  const old = { 'https://h.io/I-App-lite/assets/Secretary-OLD.js': new Response('old-chunk') };
  const sw = loadSW({ existing: { 'iapp-shell-b1': old }, net: u => (u.includes('assets/') ? new Response('nf', { status: 404 }) : new Response('<html>')) });
  assert.equal(await (await sw.fetchEvt('https://h.io/I-App-lite/assets/Secretary-OLD.js')).text(), 'old-chunk');
  const missing = await sw.fetchEvt('https://h.io/I-App-lite/assets/Secretary-GONE.js');
  assert.equal(missing.status, 404);
  assert.equal(await missing.text(), 'nf');
});

test('sw source + build wiring: placeholders exist in public/sw.js and the vite plugin stamps them; registration bypasses the HTTP cache', () => {
  const sw = readFileSync('public/sw.js', 'utf8');
  assert.match(sw, /"__BUILD_ID__"/);
  assert.match(sw, /\/\*__PRECACHE_LIST__\*\/ \[\]/);
  const vite = readFileSync('vite.config.js', 'utf8');
  assert.match(vite, /closeBundle/);
  assert.match(vite, /precache\.json/);
  assert.doesNotMatch(vite, /Date\.now/, 'no per-build random define');
  const main = readFileSync('src/main.jsx', 'utf8');
  assert.match(main, /register\(import\.meta\.env\.BASE_URL \+ 'sw\.js', \{ updateViaCache: 'none' \}\)/);
  assert.match(main, /installPreloadErrorHandler\(\)/);
});
