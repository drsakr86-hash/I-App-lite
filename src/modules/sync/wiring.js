// The flusher's orchestration layer — moved here from
// public/legacy/app-runtime.js (Phase 8, batch 9): getFlusher/flushKey/
// isFlushing/flushAll (single-flight per-app-instance flush of every dirty
// key), queueLocal/queueSave (marking a key dirty before/instead of writing
// it), and the online/offline/visibility/interval lifecycle that keeps
// flushing dirty keys in the background.
//
// The flusher itself (src/modules/sync/flush.js) already takes its remote
// read/write as injected functions (readRemote/writeRemote). Originally this
// module could not import the actual remote read/write directly, because
// they (_sbGetRaw/_sbSetRaw in the legacy runtime) dispatched to the
// per-table "Core" sync system (appointments, visits, exams, ...), which
// hadn't moved out of app-runtime.js yet — so the legacy runtime registered
// them once via setRawIO() instead. Now that the appointments Core (batch
// 11) and the generic ROW_TABLES Core (batch 12) have both moved, sbGetRaw/
// sbSetRaw below are real, directly-imported implementations (Phase 8,
// combined batch 19) — an exact copy of the old _sbGetRaw/_sbSetRaw, just
// living here instead of in the legacy runtime. setRawIO() is kept so any
// caller can still override the default wiring (e.g. tests), but the legacy
// runtime no longer needs to call it.

import { createFlusher } from './flush.js';
import { mergeData } from './merge.js';
import {
  LS, DIRTY_PREFIX, BASE_PREFIX, NOCACHE_KEYS, BACKUP_KEY, BACKUP_KEYS,
  ensureAuthed, SyncStore, busEmit,
  isDirty, dirtyKeys, refreshPending, offlineNow
} from './engine.js';
import { ROW_TABLES, rowList, rowMutate } from './row-tables.js';
import { sbGetStore, sbSetStore } from './store-io.js';
import { aptList, aptSetAll } from '../appointments/core.js';
import { APT_KEY } from '../appointments/appointment.mapper.js';

// ---- raw Supabase read/write (Phase 8, combined batch 19) ------------------
// Exact copy of the legacy runtime's _sbGetRaw/_sbSetRaw: decides where a
// given key's data actually lives (the appointments table, one of the
// generic ROW_TABLES, or the generic iapp_store key/value table) and
// reads/writes it there.

export async function sbGetRaw(key) {
  if (offlineNow()) {
    SyncStore.set({ reachable: false });
    return undefined;
  }
  if (key === APT_KEY) return await aptList();
  if (ROW_TABLES[key]) return await rowList(key);
  return await sbGetStore(key);
}

export async function sbSetRaw(key, value) {
  if (offlineNow()) {
    SyncStore.set({ reachable: false });
    return false;
  }
  if (key === APT_KEY) return await aptSetAll(Array.isArray(value) ? value : []);
  if (ROW_TABLES[key]) return (await rowMutate(key, () => Array.isArray(value) ? value : [])).ok;
  return await sbSetStore(key, value);
}

let _rawIO = { readRemote: sbGetRaw, writeRemote: sbSetRaw };
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

// ---- generic read/write for any synced key (Phase 8, batch 10) ------------
// sbGet/sbSet -- the layer above the flusher other code actually calls: read
// serves a dirty key from the local cache while kicking off its flush in the
// background, and write flushes an existing dirty write first so it does not
// get clobbered before writing the new value. Same _rawIO indirection as the
// flusher (see setRawIO above) for the actual remote read/write.

export async function sbGet(key) {
  if (isDirty(key)) {
    if (!isFlushing(key)) flushKey(key).then(refreshPending);
    const l = LS.get(key);
    if (l !== null) {
      try {
        return JSON.parse(l);
      } catch {}
    }
  }
  const v = await _rawIO.readRemote(key);
  if (v !== undefined && v !== null && !isDirty(key) && !NOCACHE_KEYS.includes(key) && BACKUP_KEYS.includes(key)) LS.set(key, JSON.stringify(v));
  return v;
}

export async function sbSet(key, value) {
  if (isDirty(key)) await flushKey(key);
  return await _rawIO.writeRemote(key, value);
}

// ---- mutate-with-retry for any synced key ----------------------------------
// sbMutateLocal: queue a mutation locally when we can't/shouldn't touch
// Supabase right now (offline, or a save decided to fall back).

export function sbMutateLocal(key, mutator) {
  if (key === BACKUP_KEY) return { ok: false, error: 'offline' };
  let cur = [];
  try {
    const l = LS.get(key);
    if (l !== null) {
      const p = JSON.parse(l);
      if (Array.isArray(p)) cur = p;
    }
  } catch {}
  const next = mutator(cur);
  if (next && !Array.isArray(next) && next.abort) return { ok: false, error: next.abort, data: cur };
  if (!queueLocal(key, next)) return { ok: false, error: 'offline', data: cur };
  busEmit(key, next);
  flushKey(key).then(refreshPending);
  return { ok: true, data: next, queued: true };
}

// sbMutate's online path dispatches to the per-table "Core" mutate
// (appointments/visits/exams/...) when the key is one of those tables --
// that system hasn't moved out of app-runtime.js yet, so, same pattern as
// setRawIO, the legacy runtime registers a dispatcher via setTableMutate()
// that returns undefined for any key it doesn't own, letting the generic
// read-modify-write-with-retry loop below handle everything else (settings,
// prices, doctors, expenses, audit, trash, backups, ...).
let _tableMutate = async () => undefined;
export function setTableMutate(fn) {
  _tableMutate = fn;
}

async function sbMutateOnline(key, mutator, verify) {
  const viaTable = await _tableMutate(key, mutator, verify);
  if (viaTable !== undefined) return viaTable;
  for (let attempt = 0; attempt < 4; attempt++) {
    const cur = await sbGet(key);
    if (cur === undefined) return { ok: false, error: 'offline' };
    const base = Array.isArray(cur) ? cur : [];
    const next = mutator(base);
    if (next && !Array.isArray(next) && next.abort) return { ok: false, error: next.abort, data: base };
    if (!(await sbSet(key, next))) return { ok: false, error: 'offline' };
    try {
      localStorage.setItem(key, JSON.stringify(next));
    } catch {}
    if (!verify) return { ok: true, data: next };
    const check = await sbGet(key);
    if (Array.isArray(check) && verify(check)) {
      try {
        localStorage.setItem(key, JSON.stringify(check));
      } catch {}
      return { ok: true, data: check };
    }
    await new Promise(r => setTimeout(r, 200 + Math.random() * 500));
  }
  return { ok: false, error: 'conflict' };
}

export async function sbMutate(key, mutator, verify) {
  if (!offlineNow() && !(await ensureAuthed()).ok) return sbMutateLocal(key, mutator);
  if (isDirty(key)) {
    const ok = await flushKey(key);
    if (!ok) return sbMutateLocal(key, mutator);
  }
  const res = await sbMutateOnline(key, mutator, verify);
  if (res.ok || res.error !== 'offline') return res;
  return sbMutateLocal(key, mutator);
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
