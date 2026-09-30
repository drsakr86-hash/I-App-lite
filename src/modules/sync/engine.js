// The generic sync-status/dirty-tracking layer — moved here from
// public/legacy/app-runtime.js (Phase 8, batch 8). This is the state and
// bookkeeping side of the sync engine: which local keys have unsynced
// changes, what the sync status badge should say, and the small pub/sub
// primitives other code hooks into. It is NOT the part that actually reads
// or writes rows in Supabase (sbGet/sbSet/sbMutate, the per-table "Core"
// read/write for appointments/visits/exams/..., and the flusher's own wiring
// to those) — that still lives in app-runtime.js and is a separate,
// later batch, since it needs its own careful extraction. Splitting the
// batch this way keeps each one small and independently verifiable, same
// principle as every other Phase 8 batch.
//
// Behavior is an exact copy of the original: same localStorage key prefixes,
// same Arabic status labels, same "offline" definition. localStorage/
// navigator access is wrapped in try/catch (or naturally tolerant of a
// missing global) exactly as it was in legacy, so this module loads safely
// under node:test — see tests/sync-engine.test.js.

import { useState, useEffect } from 'react';
import { C } from '../theme/index.js';
import { syncStatusView } from './status-view.js';

// ---- localStorage wrapper ------------------------------------------------

export const LS = {
  get(k) {
    try {
      return localStorage.getItem(k);
    } catch {
      return null;
    }
  },
  set(k, v) {
    try {
      localStorage.setItem(k, v);
      return true;
    } catch {
      return false;
    }
  },
  del(k) {
    try {
      localStorage.removeItem(k);
    } catch {}
  }
};

export const DIRTY_PREFIX = 'iapp_dirty_';
export const BASE_PREFIX = 'iapp_base_';
export const NOCACHE_KEYS = ['iapp_audit', 'iapp_trash', 'iapp_backups'];

// ---- audit/trash/backup key config (Phase 8, batch 10) --------------------
// Plain config moved alongside sbGet/sbSet/sbMutate (see wiring.js), which
// need BACKUP_KEY/BACKUP_KEYS. The functions that actually build audit/trash/
// backup entries (logAudit/trashPut/saveAutoBackup) still live in
// app-runtime.js -- that's a later batch -- but the key names and limits
// they (and sbGet/sbMutateLocal) share are plain data, so there is no reason
// to keep two copies of them around in the meantime.
export const AUDIT_KEY = 'iapp_audit';
export const TRASH_KEY = 'iapp_trash';
export const BACKUP_KEY = 'iapp_backups';
export const AUDIT_MAX = 1500;
export const TRASH_MAX = 400;
export const TRASH_DAYS = 30;
export const BACKUP_KEEP = 5;
export const BACKUP_KEYS = [
  'iapp_patients', 'iapp_visits', 'iapp_exams', 'iapp_prescriptions',
  'iapp_appointments', 'iapp_prices', 'iapp_doctors', 'iapp_clinic',
  'iapp_expenses', 'iapp_recurring_expenses', 'iapp_custom_tests', 'iapp_imaging_orders'
];

// ---- sync-key display labels ---------------------------------------------

export const SYNC_KEY_LABELS = {
  patients: 'المرضى',
  visits: 'الزيارات',
  exams: 'الفحوصات',
  prescriptions: 'الوصفات الطبية',
  appointments: 'المواعيد',
  expenses: 'المصروفات',
  recurring_expenses: 'المصروفات المتكررة',
  imaging: 'الفحوصات والصور',
  imaging_studies: 'دراسات الصور',
  audit: 'سجل المراجعة',
  backups: 'النسخ الاحتياطية',
  trash: 'المحذوفات'
};

export function syncKeyLabel(key) {
  return SYNC_KEY_LABELS[key] || key;
}

// ---- online/offline -------------------------------------------------------

export const offlineNow = () => typeof navigator !== 'undefined' && navigator.onLine === false;

// ---- the sync status store -------------------------------------------------

export const SyncStore = {
  st: {
    online: !offlineNow(),
    reachable: null,
    pending: 0,
    pendingKeys: [],
    syncing: false,
    errors: {},
    lastSyncAt: null
  },
  subs: new Set(),
  set(p) {
    this.st = { ...this.st, ...p };
    this.subs.forEach(f => f(this.st));
  }
};

export function useSyncStatus() {
  const [s, setS] = useState(SyncStore.st);
  useEffect(() => {
    SyncStore.subs.add(setS);
    setS(SyncStore.st);
    return () => {
      SyncStore.subs.delete(setS);
    };
  }, []);
  const view = syncStatusView(s);
  return {
    ...s,
    offline: view.offline,
    failedCount: view.failedCount,
    label: view.label,
    color: C[view.colorKey],
    busy: view.busy
  };
}

// ---- a tiny generic pub/sub used for live cross-component updates ---------

const dbBus = {};
export function busOn(key, fn) {
  (dbBus[key] = dbBus[key] || new Set()).add(fn);
  return () => {
    dbBus[key].delete(fn);
  };
}
export function busEmit(key, val) {
  if (dbBus[key]) dbBus[key].forEach(fn => fn(val));
}

// ---- dirty-key tracking -----------------------------------------------------

export const isDirty = key => LS.get(DIRTY_PREFIX + key) !== null;

export function dirtyKeys() {
  const out = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(DIRTY_PREFIX)) out.push(k.slice(DIRTY_PREFIX.length));
    }
  } catch {}
  return out;
}

export function refreshPending() {
  const keys = dirtyKeys();
  SyncStore.set({ pending: keys.length, pendingKeys: keys });
}

// ---- session guard used before every sync read/write -----------------------

// A sync must never read or write without a valid login session: RLS makes an
// anonymous read look like an empty table, and anonymous writes are denied.
export async function ensureAuthed() {
  const r = await window.IAppModules.auth.ensureSession();
  if (r.ok) {
    if (SyncStore.st.authError) SyncStore.set({ authError: false });
  } else {
    SyncStore.set({ authError: r.reason === 'expired' || r.reason === 'no-session' });
  }
  return r;
}

// ---- a small timeout/abort wrapper around a Supabase query builder --------

export async function tq(q, fin, ms) {
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), ms || 12000);
  try {
    let b = q.abortSignal(c.signal).retry(false);
    if (fin) b = fin(b);
    const r = await b;
    if (r && r.error) {
      SyncStore.set({ reachable: r.error.code ? true : false });
    } else {
      SyncStore.set({ reachable: true });
    }
    return r;
  } finally {
    clearTimeout(t);
  }
}
