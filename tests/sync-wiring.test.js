import test from 'node:test';
import assert from 'node:assert/strict';
import { setRawIO, flushKey, isFlushing, flushAll, queueLocal, queueSave } from '../src/modules/sync/wiring.js';
import { SyncStore, DIRTY_PREFIX, BASE_PREFIX, dirtyKeys } from '../src/modules/sync/engine.js';

// A tiny in-memory localStorage polyfill -- LS (src/modules/sync/engine.js)
// gracefully no-ops without one (see tests/sync-engine.test.js), so to
// actually exercise queueLocal/flushKey/flushAll end to end here we install
// one for the duration of this file, same idea as mocking navigator.onLine.
function makeLocalStorage() {
  const store = new Map();
  return {
    getItem: k => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => { store.set(k, String(v)); },
    removeItem: k => { store.delete(k); },
    get length() { return store.size; },
    key: i => Array.from(store.keys())[i] ?? null
  };
}
globalThis.localStorage = makeLocalStorage();

// ensureAuthed() (src/modules/sync/engine.js) reads window.IAppModules.auth.
// The lifecycle init block in wiring.js only runs when `window` exists at
// import time, which it did not here, so installing it now is safe.
globalThis.window = globalThis.window || {};
globalThis.window.IAppModules = globalThis.window.IAppModules || {};
globalThis.window.IAppModules.auth = { ensureSession: async () => ({ ok: true }) };

test.afterEach(() => {
  globalThis.localStorage.clear?.();
  // Our polyfill has no clear(); rebuild it fresh between tests instead.
  globalThis.localStorage = makeLocalStorage();
  SyncStore.set({ pending: 0, pendingKeys: [], syncing: false, errors: {}, lastSyncAt: null });
});

test('queueLocal: marks a key dirty, snapshots the previous value as its base, and updates SyncStore.pending', () => {
  globalThis.localStorage.setItem('k', JSON.stringify({ n: 1 }));
  assert.equal(queueLocal('k', { n: 2 }), true);
  assert.equal(JSON.parse(globalThis.localStorage.getItem('k')).n, 2);
  assert.equal(JSON.parse(globalThis.localStorage.getItem(BASE_PREFIX + 'k')).n, 1);
  assert.ok(globalThis.localStorage.getItem(DIRTY_PREFIX + 'k'));
  assert.equal(SyncStore.st.pending, 1);
  assert.deepEqual(SyncStore.st.pendingKeys, ['k']);
});

test('queueLocal: a second queue while already dirty does not overwrite the original base snapshot', () => {
  globalThis.localStorage.setItem('k', JSON.stringify({ n: 1 }));
  queueLocal('k', { n: 2 });
  queueLocal('k', { n: 3 });
  assert.equal(JSON.parse(globalThis.localStorage.getItem(BASE_PREFIX + 'k')).n, 1);
  assert.equal(JSON.parse(globalThis.localStorage.getItem('k')).n, 3);
});

test('flushKey: reads remote via the injected readRemote, merges, writes back via writeRemote, and clears the dirty flag', async () => {
  const writes = [];
  setRawIO({
    readRemote: async () => null, // nothing remote yet -> upload local as-is
    writeRemote: async (key, value) => { writes.push({ key, value }); return true; }
  });
  globalThis.localStorage.setItem('k', JSON.stringify({ n: 1 }));
  queueLocal('k', { n: 1 });

  const ok = await flushKey('k');
  assert.equal(ok, true);
  assert.equal(writes.length, 1);
  assert.deepEqual(writes[0], { key: 'k', value: { n: 1 } });
  assert.equal(globalThis.localStorage.getItem(DIRTY_PREFIX + 'k'), null);
  assert.equal(SyncStore.st.lastSyncAt !== null, true);
});

test('flushKey: a failed remote read leaves the key dirty and records an error on SyncStore', async () => {
  setRawIO({
    readRemote: async () => undefined, // undefined = read failed
    writeRemote: async () => true
  });
  globalThis.localStorage.setItem('k', JSON.stringify({ n: 1 }));
  queueLocal('k', { n: 1 });

  const ok = await flushKey('k');
  assert.equal(ok, false);
  assert.ok(SyncStore.st.errors.k);
  assert.ok(globalThis.localStorage.getItem(DIRTY_PREFIX + 'k')); // still dirty
});

test('isFlushing: true while a flush is in flight for that key, false once it settles', async () => {
  // ensureAuthed() resolves over a couple of microtask turns before
  // readRemote is actually called, so rather than guess how many, have
  // readRemote itself signal that it was invoked (assigning resolveRead
  // synchronously first, so it is always set by the time that signal is
  // awaited below).
  let resolveRead;
  let signalInvoked;
  const invoked = new Promise(res => { signalInvoked = res; });
  setRawIO({
    readRemote: () => {
      const p = new Promise(res => { resolveRead = res; });
      signalInvoked();
      return p;
    },
    writeRemote: async () => true
  });
  globalThis.localStorage.setItem('k', JSON.stringify({ n: 1 }));
  queueLocal('k', { n: 1 });

  assert.equal(isFlushing('k'), false);
  const p = flushKey('k');
  assert.equal(isFlushing('k'), true);
  await invoked;
  resolveRead(null);
  await p;
  assert.equal(isFlushing('k'), false);
});

test('flushAll: nothing dirty is a no-op that resets pending to 0', async () => {
  await flushAll();
  assert.equal(SyncStore.st.pending, 0);
  assert.equal(SyncStore.st.syncing, false);
});

test('flushAll: flushes every dirty key and reports syncing=false with pending=0 when done', async () => {
  const flushed = [];
  setRawIO({
    readRemote: async () => null,
    writeRemote: async (key, value) => { flushed.push(key); return true; }
  });
  globalThis.localStorage.setItem('a', '1');
  globalThis.localStorage.setItem('b', '2');
  queueLocal('a', 1);
  queueLocal('b', 2);

  await flushAll();
  assert.deepEqual(flushed.sort(), ['a', 'b']);
  assert.equal(SyncStore.st.syncing, false);
  assert.equal(SyncStore.st.pending, 0);
  assert.deepEqual(dirtyKeys(), []);
});

test('queueSave: queues locally then flushes, returning the flush result', async () => {
  setRawIO({
    readRemote: async () => null,
    writeRemote: async () => true
  });
  globalThis.localStorage.setItem('k', '1');
  const result = await queueSave('k', 2);
  assert.equal(result, true);
  assert.equal(dirtyKeys().length, 0);
});

test('queueSave: falls back to writing remote directly when the local queue itself fails', async () => {
  let wroteDirect = null;
  setRawIO({
    readRemote: async () => null,
    writeRemote: async (key, value) => { wroteDirect = { key, value }; return true; }
  });
  // No localStorage installed for this one call -> LS.set fails -> queueLocal returns false.
  const saved = globalThis.localStorage;
  delete globalThis.localStorage;
  try {
    const result = await queueSave('k', { n: 9 });
    assert.equal(result, true);
    assert.deepEqual(wroteDirect, { key: 'k', value: { n: 9 } });
  } finally {
    globalThis.localStorage = saved;
  }
});
