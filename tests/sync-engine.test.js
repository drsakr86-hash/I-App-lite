import test from 'node:test';
import assert from 'node:assert/strict';
import {
  syncKeyLabel, offlineNow, SyncStore, LS, DIRTY_PREFIX,
  isDirty, dirtyKeys, refreshPending, ensureAuthed, tq, busOn, busEmit
} from '../src/modules/sync/engine.js';

test('syncKeyLabel: known keys return their Arabic label, unknown keys pass through', () => {
  assert.equal(syncKeyLabel('patients'), 'المرضى');
  assert.equal(syncKeyLabel('appointments'), 'المواعيد');
  assert.equal(syncKeyLabel('some_unlisted_key'), 'some_unlisted_key');
});

test('offlineNow: true only when navigator.onLine is exactly false', () => {
  const orig = Object.getOwnPropertyDescriptor(globalThis.navigator, 'onLine');
  try {
    Object.defineProperty(globalThis.navigator, 'onLine', { value: false, configurable: true });
    assert.equal(offlineNow(), true);
    Object.defineProperty(globalThis.navigator, 'onLine', { value: true, configurable: true });
    assert.equal(offlineNow(), false);
    Object.defineProperty(globalThis.navigator, 'onLine', { value: undefined, configurable: true });
    assert.equal(offlineNow(), false); // undefined !== false -> reported online
  } finally {
    if (orig) Object.defineProperty(globalThis.navigator, 'onLine', orig);
  }
});

test('SyncStore.set: merges partial state and notifies subscribers with the new state', () => {
  const seen = [];
  const sub = s => seen.push(s.pending);
  SyncStore.subs.add(sub);
  try {
    SyncStore.set({ pending: 3 });
    assert.equal(SyncStore.st.pending, 3);
    assert.equal(seen[seen.length - 1], 3);
    // Unrelated fields survive a partial update.
    SyncStore.set({ syncing: true });
    assert.equal(SyncStore.st.pending, 3);
    assert.equal(SyncStore.st.syncing, true);
  } finally {
    SyncStore.subs.delete(sub);
    SyncStore.set({ pending: 0, pendingKeys: [], syncing: false });
  }
});

test('SyncStore.set: an unsubscribed listener stops receiving updates', () => {
  let calls = 0;
  const sub = () => { calls++; };
  SyncStore.subs.add(sub);
  SyncStore.set({ pending: 1 });
  SyncStore.subs.delete(sub);
  SyncStore.set({ pending: 2 });
  assert.equal(calls, 1);
  SyncStore.set({ pending: 0 });
});

test('LS: falls back to a safe no-op/null when localStorage is unavailable (e.g. under node:test)', () => {
  assert.equal(typeof localStorage, 'undefined'); // sanity check of the test environment
  assert.equal(LS.get('anything'), null);
  assert.equal(LS.set('anything', 'x'), false);
  assert.doesNotThrow(() => LS.del('anything'));
});

test('isDirty / dirtyKeys: report nothing dirty when localStorage is unavailable, without throwing', () => {
  assert.equal(isDirty('patients'), false);
  assert.deepEqual(dirtyKeys(), []);
});

test('refreshPending: reflects dirtyKeys() into SyncStore.pending/pendingKeys', () => {
  refreshPending();
  // No real localStorage in this environment, so dirtyKeys() is always [].
  assert.equal(SyncStore.st.pending, 0);
  assert.deepEqual(SyncStore.st.pendingKeys, []);
});

test('ensureAuthed: clears a stale authError once the session is confirmed ok', async () => {
  SyncStore.set({ authError: true });
  const origAuth = globalThis.window?.IAppModules?.auth;
  globalThis.window = globalThis.window || {};
  globalThis.window.IAppModules = globalThis.window.IAppModules || {};
  globalThis.window.IAppModules.auth = { ensureSession: async () => ({ ok: true }) };
  try {
    const r = await ensureAuthed();
    assert.equal(r.ok, true);
    assert.equal(SyncStore.st.authError, false);
  } finally {
    globalThis.window.IAppModules.auth = origAuth;
    SyncStore.set({ authError: false });
  }
});

test('ensureAuthed: sets authError=true for an expired/no-session failure, false for other failures', async () => {
  globalThis.window = globalThis.window || {};
  globalThis.window.IAppModules = globalThis.window.IAppModules || {};

  globalThis.window.IAppModules.auth = { ensureSession: async () => ({ ok: false, reason: 'expired' }) };
  await ensureAuthed();
  assert.equal(SyncStore.st.authError, true);

  globalThis.window.IAppModules.auth = { ensureSession: async () => ({ ok: false, reason: 'network' }) };
  await ensureAuthed();
  assert.equal(SyncStore.st.authError, false);
});

test('tq: marks reachable=true on a clean response and reachable=false on a non-coded error', async () => {
  const fakeBuilder = (result) => ({
    abortSignal: () => ({
      retry: () => Promise.resolve(result)
    })
  });

  SyncStore.set({ reachable: null });
  await tq(fakeBuilder({ data: [1, 2], error: null }));
  assert.equal(SyncStore.st.reachable, true);

  await tq(fakeBuilder({ data: null, error: { message: 'boom' } }));
  assert.equal(SyncStore.st.reachable, false);

  await tq(fakeBuilder({ data: null, error: { code: '42P01', message: 'no such table' } }));
  assert.equal(SyncStore.st.reachable, true);

  SyncStore.set({ reachable: null });
});

test('busOn/busEmit: emits only to subscribers of the matching key, and unsubscribe stops delivery', () => {
  const seenA = [];
  const seenB = [];
  const offA = busOn('keyA', v => seenA.push(v));
  busOn('keyB', v => seenB.push(v));
  busEmit('keyA', 1);
  busEmit('keyB', 2);
  assert.deepEqual(seenA, [1]);
  assert.deepEqual(seenB, [2]);
  offA();
  busEmit('keyA', 3);
  assert.deepEqual(seenA, [1]);
});
