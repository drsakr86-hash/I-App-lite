// The flusher's orchestration layer — moved here from
// public/legacy/app-runtime.js (Phase 8, batch 9): getFlusher/flushKey/
// isFlushing/flushAll (single-flight per-app-instance flush of every dirty
// key), queueLocal/queueSave (marking a key dirty before/instead of writing
// it), and the online/offline/visibility/interval lifecycle that keeps
// flushing dirty keys in the background.
//
// The flusher itself (src/modules/sync/flush.js) already takes its remote
// read/write as injected functions (readRemote/writeRemote), so this module
// does not need to import them directly. Those two functions
// (_sbGetRaw/_sbSetRaw in the legacy runtime) still dispatch to the
// per-table "Core" sync system (appointments, visits, exams, ...) that
// hasn't moved out of app-runtime.js yet — so instead of hard-importing
// them here (which this module can't yet satisfy), the legacy runtime
// registers them once via setRawIO() right after it defines them. This
// keeps the flusher's actual read/write behavior byte-identical to before:
// it is the exact same _sbGetRaw/_sbSetRaw functions, just wired in instead
// of referenced by closure. Once the per-table "Core" system moves in a
// later batch, _sbGetRaw/_sbSetRaw can move too and this indirection can be
// dropped in favor of a direct import.

import { createFlusher } from './flush.js';
import { mergeData } from './merge.js';
import {
  LS, DIRTY_PREFIX, BASE_PREFIX, NOCACHE_KEYS,
  ensureAuthed, SyncStore, busEmit,
  isDirty, dirtyKeys, refreshPending, offlineNow
} from './engine.js';

// ---- raw Supabase read/write, injected by the legacy runtime --------------

let _rawIO = { readRemote: async () => undefined, writeRemote: async () => false };
export function setRawIO(io) {
  _rawIO = io;
}

// ---- the flusher itself -----------------------------------------------------

let _flusher = null;
function getFlusher() {
  if (!_flusher) _flusher = createFlusher({
    storage: LS,
    dirtyPrefix: DIRTY_PREFIX,
    basePrefix: BASE_PREFIX,
    noCacheKeys: NOCACHE_KEYS,
    ensureAuthed,
    readRemote: key => _rawIO.readRemote(key),
    writeRemote: (key, value) => _rawIO.writeRemote(key, value),
    merge: mergeData,
    setError: (key, msg) => SyncStore.set({ errors: { ...SyncStore.st.errors, [key]: msg } }),
    clearError: key => {
      const nextErrors = { ...SyncStore.st.errors };
      delete nextErrors[key];
      SyncStore.set({ errors: nextErrors });
    },
    markSynced: () => SyncStore.set({ lastSyncAt: Date.now() }),
    emitChange: busEmit
  });
  return _flusher;
}

export function flushKey(key) {
  return getFlusher().flushKey(key);
}
export function isFlushing(key) {
  return getFlusher().isFlushing(key);
}

let _flushAllBusy = false;
export async function flushAll() {
  if (_flushAllBusy) return;
  const keys = dirtyKeys();
  if (!keys.length) {
    SyncStore.set({ pending: 0, pendingKeys: [], syncing: false });
    return;
  }
  _flushAllBusy = true;
  SyncStore.set({ syncing: true, pending: keys.length });
  try {
    for (const k of keys) {
      await flushKey(k);
    }
  } finally {
    _flushAllBusy = false;
    const remaining = dirtyKeys();
    SyncStore.set({ syncing: false, pending: remaining.length, pendingKeys: remaining });
  }
}

// ---- marking a key dirty before/instead of writing it ----------------------

export function queueLocal(key, val) {
  if (!isDirty(key)) {
    const prev = LS.get(key);
    if (prev !== null) LS.set(BASE_PREFIX + key, prev);
    else LS.del(BASE_PREFIX + key);
  }
  if (!LS.set(key, JSON.stringify(val))) return false;
  LS.set(DIRTY_PREFIX + key, Date.now() + '-' + Math.random());
  refreshPending();
  return true;
}

export async function queueSave(key, val) {
  if (!queueLocal(key, val)) return await _rawIO.writeRemote(key, val);
  const ok = await flushKey(key);
  refreshPending();
  return ok;
}

// ---- background flush lifecycle --------------------------------------------

if (typeof window !== 'undefined' && !window.__iappSyncInit) {
  window.__iappSyncInit = true;
  window.addEventListener('online', () => {
    SyncStore.set({ online: true, reachable: null });
    flushAll();
  });
  window.addEventListener('offline', () => {
    SyncStore.set({ online: false });
  });
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && dirtyKeys().length) flushAll();
  });
  setInterval(() => {
    if (dirtyKeys().length) flushAll();
    else if (SyncStore.st.reachable === false && !offlineNow()) _rawIO.readRemote('iapp_ping');
  }, 20000);
  refreshPending();
}
