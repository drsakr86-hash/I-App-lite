import test from 'node:test';
import assert from 'node:assert/strict';
import { mergeData, createFlusher } from '../src/modules/sync/index.js';

const D = 'd_', B = 'b_';
function env({ local, remote, base, dirty = 'stamp1', authed = { ok: true }, writeOk = true, noCache = [] } = {}) {
  const store = new Map();
  if (local !== undefined) store.set('k', JSON.stringify(local));
  if (dirty) store.set(D + 'k', dirty);
  if (base !== undefined) store.set(B + 'k', JSON.stringify(base));
  const log = { errors: {}, synced: 0, changes: [], writes: [], reads: 0 };
  const storage = { get: k => (store.has(k) ? store.get(k) : null), set: (k, v) => (store.set(k, v), true), del: k => store.delete(k) };
  const flusher = createFlusher({
    storage, dirtyPrefix: D, basePrefix: B, noCacheKeys: noCache,
    ensureAuthed: async () => authed,
    readRemote: async () => { log.reads++; return typeof remote === 'function' ? remote() : remote; },
    writeRemote: async (k, v) => { log.writes.push(v); if (typeof writeOk === 'function') return writeOk(store); return writeOk; },
    merge: mergeData,
    setError: (k, m) => { log.errors[k] = m; },
    clearError: k => { delete log.errors[k]; },
    markSynced: () => { log.synced++; },
    emitChange: (k, v) => log.changes.push(v)
  });
  return { store, storage, flusher, log };
}

// ---- mergeData ----
test('merge: untouched local record takes the remote copy', () => {
  const base = [{ id: 1, n: 'a' }], local = [{ id: 1, n: 'a' }], remote = [{ id: 1, n: 'b' }];
  assert.deepEqual(mergeData(base, local, remote), [{ id: 1, n: 'b' }]);
});
test('merge: local edit wins over remote', () => {
  const base = [{ id: 1, n: 'a' }], local = [{ id: 1, n: 'mine' }], remote = [{ id: 1, n: 'theirs' }];
  assert.deepEqual(mergeData(base, local, remote), [{ id: 1, n: 'mine' }]);
});
test('merge: keeps a record added offline and one added remotely', () => {
  const out = mergeData([], [{ id: 2 }], [{ id: 3 }]);
  assert.deepEqual(out.map(x => x.id).sort(), [2, 3]);
});
test('merge: record deleted locally is not resurrected from an unchanged remote', () => {
  const base = [{ id: 1, n: 'a' }], local = [], remote = [{ id: 1, n: 'a' }];
  assert.deepEqual(mergeData(base, local, remote), []);
});
test('merge: record deleted remotely disappears if local did not touch it', () => {
  const base = [{ id: 1, n: 'a' }], local = [{ id: 1, n: 'a' }], remote = [];
  assert.deepEqual(mergeData(base, local, remote), []);
});
test('merge: non-list data falls back to local', () => {
  assert.deepEqual(mergeData(null, { x: 1 }, { x: 2 }), { x: 1 });
});

// ---- flusher ----
test('flush: nothing dirty is a no-op success', async () => {
  const e = env({ local: [], dirty: null });
  assert.equal(await e.flusher.flushKey('k'), true);
  assert.equal(e.log.reads, 0);
});
test('flush: remote empty (null) uploads local as is and clears dirty', async () => {
  const e = env({ local: [{ id: 1 }], remote: null });
  assert.equal(await e.flusher.flushKey('k'), true);
  assert.deepEqual(e.log.writes[0], [{ id: 1 }]);
  assert.equal(e.storage.get(D + 'k'), null);
  assert.equal(e.log.synced, 1);
});
test('flush: merges an offline addition with remote changes and tells the UI', async () => {
  const e = env({ local: [{ id: 1, n: 'a' }, { id: 9, n: 'new' }], base: [{ id: 1, n: 'a' }], remote: [{ id: 1, n: 'a' }, { id: 2, n: 'x' }] });
  assert.equal(await e.flusher.flushKey('k'), true);
  assert.deepEqual(e.log.writes[0].map(r => r.id).sort(), [1, 2, 9]);
  assert.equal(e.log.changes.length, 1);
  assert.equal(JSON.parse(e.storage.get('k')).length, 3);
});
test('flush: expired session never reads or writes and keeps the change queued', async () => {
  const e = env({ local: [{ id: 1 }], remote: [], authed: { ok: false, reason: 'expired' } });
  assert.equal(await e.flusher.flushKey('k'), false);
  assert.equal(e.log.reads, 0);
  assert.equal(e.log.writes.length, 0);
  assert.notEqual(e.storage.get(D + 'k'), null);
  assert.match(e.log.errors.k, /الجلسة/);
});
test('flush: network failure during auth is reported as connection error', async () => {
  const e = env({ local: [], authed: { ok: false, reason: 'network' } });
  await e.flusher.flushKey('k');
  assert.match(e.log.errors.k, /الاتصال/);
});
test('flush: failed remote read never overwrites the server', async () => {
  const e = env({ local: [{ id: 1 }], remote: undefined });
  assert.equal(await e.flusher.flushKey('k'), false);
  assert.equal(e.log.writes.length, 0);
  assert.notEqual(e.storage.get(D + 'k'), null);
});
test('flush: failed write keeps the dirty flag', async () => {
  const e = env({ local: [{ id: 1 }], remote: null, writeOk: false });
  assert.equal(await e.flusher.flushKey('k'), false);
  assert.notEqual(e.storage.get(D + 'k'), null);
  assert.match(e.log.errors.k, /حفظ/);
});
test('flush: corrupt local data is reported, not uploaded', async () => {
  const e = env({ dirty: 's' });
  e.store.set('k', '{not json');
  assert.equal(await e.flusher.flushKey('k'), false);
  assert.equal(e.log.writes.length, 0);
});
test('flush: edit made while writing keeps dirty, moves base, and flushes again', async () => {
  let first = true;
  const e = env({ local: [{ id: 1, n: 'a' }], remote: null, writeOk: store => {
    if (first) { first = false; store.set(D + 'k', 'stamp2'); store.set('k', JSON.stringify([{ id: 1, n: 'b' }])); }
    return true;
  } });
  assert.equal(await e.flusher.flushKey('k'), true);
  assert.equal(e.log.writes.length, 2);
  assert.equal(e.storage.get(D + 'k'), null);
});
test('flush: noCache keys are removed locally after a successful sync', async () => {
  const e = env({ local: [{ id: 1 }], remote: null, noCache: ['k'] });
  await e.flusher.flushKey('k');
  assert.equal(e.storage.get('k'), null);
});
test('flush: concurrent calls share one run and isFlushing reports it', async () => {
  const e = env({ local: [{ id: 1 }], remote: null });
  const p1 = e.flusher.flushKey('k');
  assert.equal(e.flusher.isFlushing('k'), true);
  const p2 = e.flusher.flushKey('k');
  assert.deepEqual(await Promise.all([p1, p2]), [true, true]);
  assert.equal(e.flusher.isFlushing('k'), false);
});
