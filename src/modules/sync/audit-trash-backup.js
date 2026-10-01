// logAudit / trashPut / saveAutoBackup -- moved here from
// public/legacy/app-runtime.js (Phase 8, batch 13). These are the last
// pieces of the sync engine that build actual audit/trash/backup entries
// using the AUDIT_KEY/TRASH_KEY/BACKUP_KEY config moved in batch 10, and
// write them through the already-moved sbMutate/sbGet (batch 10).
//
// All three need to stamp each entry with "who did this" (actorName()/
// CURRENT_USER in the legacy runtime) -- but CURRENT_USER is a legacy
// module-level session variable mutated from many places across the login/
// session-restore flow, far outside this batch's scope. Exactly like
// setRawIO (batch 9) and setTableMutate (batch 10), this module exposes a
// setActor() registration function with a safe default, and the legacy
// runtime registers the real lookup once, right where actorName()/
// CURRENT_USER are already in scope. Once CURRENT_USER itself moves in a
// much later phase, this indirection can be dropped in favor of a direct
// import.
//
// Exact copy of the legacy originals otherwise, with `window.*` reads
// changed to `globalThis.*` -- same approach as every other Phase 8 module.

import { AUDIT_KEY, TRASH_KEY, BACKUP_KEY, AUDIT_MAX, TRASH_MAX, TRASH_DAYS, BACKUP_KEEP, BACKUP_KEYS } from './engine.js';
import { sbGet, sbMutate } from './wiring.js';

// Local copy of the legacy runtime's newId -- a tiny pure id generator used
// all over app-runtime.js (including by code well outside this batch's
// scope), so it isn't moved itself, just duplicated here like localISO was
// for aptList in batch 11.
const newId = () => Date.now() + Math.floor(Math.random() * 997);

let _actor = () => ({ name: '—', role: '' });
export function setActor(fn) {
  _actor = fn;
}

export async function logAudit(action, details) {
  try {
    const actor = _actor();
    const entry = {
      id: newId(),
      ts: Date.now(),
      by: actor.name,
      role: actor.role,
      action,
      details: String(details || '').slice(0, 200)
    };
    await sbMutate(AUDIT_KEY, list => [entry, ...list].slice(0, AUDIT_MAX));
  } catch (e) {
    console.warn('audit failed', e);
  }
}

function slimForTrash(rec) {
  try {
    if (JSON.stringify(rec).length < 200000) return rec;
    const { image, img, data, thumb, ...rest } = rec;
    return { ...rest, _imageDropped: true };
  } catch {
    return rec;
  }
}

export async function trashPut(storeKey, items, label) {
  const arr = (Array.isArray(items) ? items : [items]).filter(Boolean);
  if (!arr.length) return false;
  const cutoff = Date.now() - TRASH_DAYS * 24 * 3600 * 1000;
  const actor = _actor();
  const stamped = arr.map(r => ({
    id: newId(),
    storeKey,
    label: label || '',
    deletedAt: Date.now(),
    by: actor.name,
    record: slimForTrash(r)
  }));
  const res = await sbMutate(TRASH_KEY, list => [...stamped, ...list.filter(t => t.deletedAt > cutoff)].slice(0, TRASH_MAX));
  return res.ok;
}

async function buildSnapshot() {
  const data = {};
  for (const k of BACKUP_KEYS) {
    const v = await sbGet(k);
    if (v !== undefined && v !== null) data[k] = v;
    else {
      try {
        const l = localStorage.getItem(k);
        if (l) data[k] = JSON.parse(l);
      } catch {}
    }
  }
  return data;
}

export async function saveAutoBackup(reason) {
  const data = await buildSnapshot();
  const size = JSON.stringify(data).length;
  if (size > 4000000) {
    console.warn('backup too large, skipped');
    return false;
  }
  const actor = _actor();
  const snap = {
    id: newId(),
    at: Date.now(),
    by: actor.name,
    reason: reason || 'تلقائي',
    size,
    data
  };
  const res = await sbMutate(BACKUP_KEY, list => [snap, ...list].slice(0, BACKUP_KEEP));
  return res.ok;
}
