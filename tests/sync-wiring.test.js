import test from 'node:test';
import assert from 'node:assert/strict';
import {
  setRawIO, flushKey, isFlushing, flushAll, queueLocal, queueSave,
  sbGet, sbSet, sbMutateLocal, sbMutate, setTableMutate
} from '../src/modules/sync/wiring.js';
import { SyncStore, DIRTY_PREFIX, BASE_PREFIX, BACKUP_KEY, dirtyKeys, busOn } from '../src/modules/sync/engine.js';

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
  setTableMutate(async () => undefined);
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

// ---- sbGet / sbSet ----------------------------------------------------------

test('sbGet: not dirty -> reads remote, and caches locally only for a BACKUP_KEYS entry', async () => {
  setRawIO({ readRemote: async () => ({ n: 7 }), writeRemote: async () => true });
  const v = await sbGet('iapp_patients'); // a BACKUP_KEYS entry
  assert.deepEqual(v, { n: 7 });
  assert.deepEqual(JSON.parse(globalThis.localStorage.getItem('iapp_patients')), { n: 7 });
});

test('sbGet: not dirty -> a key outside BACKUP_KEYS is not cached locally', async () => {
  setRawIO({ readRemote: async () => ({ n: 7 }), writeRemote: async () => true });
  await sbGet('some_other_key');
  assert.equal(globalThis.localStorage.getItem('some_other_key'), null);
});

test('sbGet: a dirty key is served from the local cache and kicks off a background flush', async () => {
  const reads = [];
  setRawIO({
    readRemote: async k => { reads.push(k); return null; },
    writeRemote: async () => true
  });
  globalThis.localStorage.setItem('k', JSON.stringify({ n: 1 }));
  queueLocal('k', { n: 2 });

  const v = await sbGet('k');
  assert.deepEqual(v, { n: 2 }); // served from LS, not remote
  // flushKey was kicked off in the background (fire-and-forget) -- give it a tick.
  await new Promise(r => setTimeout(r, 0));
  await new Promise(r => setTimeout(r, 0));
  assert.ok(reads.includes('k'));
});

test('sbSet: not dirty -> writes remote directly', async () => {
  const writes = [];
  setRawIO({ readRemote: async () => null, writeRemote: async (k, v) => { writes.push({ k, v }); return true; } });
  const ok = await sbSet('k', { n: 5 });
  assert.equal(ok, true);
  assert.deepEqual(writes, [{ k: 'k', v: { n: 5 } }]);
});

test('sbSet: a dirty key is flushed first so the new write does not get clobbered', async () => {
  const writes = [];
  setRawIO({
    readRemote: async () => null,
    writeRemote: async (k, v) => { writes.push(v); return true; }
  });
  globalThis.localStorage.setItem('k', JSON.stringify({ n: 1 }));
  queueLocal('k', { n: 1 });

  await sbSet('k', { n: 2 });
  // The dirty flush (uploading {n:1}) happens before the new write ({n:2}).
  assert.deepEqual(writes, [{ n: 1 }, { n: 2 }]);
});

// ---- sbMutateLocal -----------------------------------------------------------

test('sbMutateLocal: BACKUP_KEY always refuses (no offline queueing for backups)', () => {
  const res = sbMutateLocal(BACKUP_KEY, list => list);
  assert.deepEqual(res, { ok: false, error: 'offline' });
});

test('sbMutateLocal: queues the mutated value locally, emits the change, and kicks off a background flush', async () => {
  setRawIO({ readRemote: async () => null, writeRemote: async () => true });
  globalThis.localStorage.setItem('list_key', JSON.stringify([{ id: 1 }]));
  const seen = [];
  const off = busOn('list_key', v => seen.push(v));
  try {
    const res = sbMutateLocal('list_key', list => [...list, { id: 2 }]);
    assert.equal(res.ok, true);
    assert.equal(res.queued, true);
    assert.deepEqual(res.data, [{ id: 1 }, { id: 2 }]);
    assert.deepEqual(seen, [[{ id: 1 }, { id: 2 }]]);
    assert.ok(globalThis.localStorage.getItem(DIRTY_PREFIX + 'list_key'));
  } finally {
    off();
  }
});

test('sbMutateLocal: a mutator that returns {abort} leaves the stored value untouched', () => {
  globalThis.localStorage.setItem('k', JSON.stringify([1, 2]));
  const res = sbMutateLocal('k', () => ({ abort: 'busy' }));
  assert.deepEqual(res, { ok: false, error: 'busy', data: [1, 2] });
  assert.equal(globalThis.localStorage.getItem(DIRTY_PREFIX + 'k'), null);
});

// ---- sbMutate ----------------------------------------------------------------

test('sbMutate: falls back to sbMutateLocal when the session cannot be confirmed (and not offline)', async () => {
  const origAuth = globalThis.window.IAppModules.auth;
  globalThis.window.IAppModules.auth = { ensureSession: async () => ({ ok: false, reason: 'network' }) };
  try {
    const res = await sbMutate('k', list => [...list, 1]);
    assert.equal(res.ok, true);
    assert.equal(res.queued, true);
  } finally {
    globalThis.window.IAppModules.auth = origAuth;
  }
});

test('sbMutate: dispatches to a registered table mutate for a key that table owns', async () => {
  const calls = [];
  setTableMutate(async (key, mutator, verify) => {
    if (key !== 'iapp_appointments') return undefined;
    calls.push({ key, verify });
    return { ok: true, data: mutator([]) };
  });
  const res = await sbMutate('iapp_appointments', () => ['apt1']);
  assert.equal(res.ok, true);
  assert.deepEqual(res.data, ['apt1']);
  assert.equal(calls.length, 1);
});

test('sbMutate: a key the table dispatcher does not own falls through to the generic read-modify-write loop', async () => {
  setTableMutate(async () => undefined); // owns nothing
  setRawIO({
    readRemote: async () => [1, 2],
    writeRemote: async () => true
  });
  const res = await sbMutate('generic_key', list => [...list, 3]);
  assert.equal(res.ok, true);
  assert.deepEqual(res.data, [1, 2, 3]);
});

test('sbMutate: the generic loop accepts the write once verify() sees it reflected back', async () => {
  let stored = [1, 2];
  let writeCount = 0;
  setRawIO({
    readRemote: async () => stored,
    writeRemote: async (k, v) => { writeCount++; stored = v; return true; }
  });
  const res = await sbMutate('generic_key', list => [...list, 3], check => check.includes(3));
  assert.equal(res.ok, true);
  assert.deepEqual(res.data, [1, 2, 3]);
  assert.equal(writeCount, 1);
});

test('sbMutate: the generic loop retries when verify() rejects a stale post-write read, then succeeds', async () => {
  let stored = [1, 2];
  let writeCount = 0;
  let readCount = 0;
  setRawIO({
    readRemote: async () => {
      readCount++;
      // The verify-check read right after the first write (the 2nd read
      // overall) comes back stale/conflicting once, forcing exactly one
      // retry; every other read reflects the latest write.
      if (readCount === 2) return [9, 9];
      return stored;
    },
    writeRemote: async (k, v) => { writeCount++; stored = v; return true; }
  });
  const res = await sbMutate('generic_key', list => (list.includes(3) ? list : [...list, 3]), check => check.includes(3));
  assert.equal(res.ok, true);
  assert.ok(res.data.includes(3));
  assert.equal(writeCount, 2);
});

test('sbMutate: the generic loop falls back to sbMutateLocal when the remote write fails (offline)', async () => {
  setTableMutate(async () => undefined);
  setRawIO({
    readRemote: async () => undefined, // offline read
    writeRemote: async () => true
  });
  const res = await sbMutate('generic_key', list => [...(list || []), 1]);
  assert.equal(res.ok, true);
  assert.equal(res.queued, true);
});
