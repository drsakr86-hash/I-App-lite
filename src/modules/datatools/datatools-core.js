// The data-tools orchestration logic behind src/components/DataTools.jsx --
// moved here from public/legacy/app-runtime.js (Phase 8, combined batch 19):
// finding/merging duplicate patients, restoring a full backup snapshot, and
// restoring/permanently-dropping a trash entry. Exact copies of the
// originals; every dependency they used (sbGet, sbMutate, trashPut, logAudit,
// saveAutoBackup, GUARD_KEY/BACKUP_KEY/TRASH_KEY/AUDIT_KEY) was already moved
// to its own module in earlier batches.
//
// normPhone/normArabic are used all over app-runtime.js well outside this
// batch's scope (patient search, patient matching, booking...), so they
// aren't moved themselves -- duplicated here exactly, same approach as
// normPhone was duplicated for the notifications module in batch 16.

import { sbGet, sbSet, sbMutate } from '../sync/wiring.js';
import { trashPut, logAudit, saveAutoBackup } from '../sync/audit-trash-backup.js';
import { GUARD_KEY, localISO } from '../constants/misc.js';
import { BACKUP_KEY, TRASH_KEY, AUDIT_KEY } from '../sync/engine.js';

const normPhone = s => String(s || '').replace(/\D/g, '').replace(/^(20|0020)/, '0');
const normArabic = s => String(s || '').trim().replace(/[ً-ْـ]/g, '').replace(/[أإآ]/g, 'ا').replace(/ى/g, 'ي').replace(/ة/g, 'ه').replace(/\s+/g, ' ').toLowerCase();

export const MERGE_KEYS = ['iapp_visits', 'iapp_exams', 'iapp_prescriptions', 'iapp_appointments', 'iapp_injections', 'iapp_imaging_studies', 'iapp_imaging_orders'];

export function findDuplicatePatients(patients) {
  const groups = {};
  (patients || []).forEach(p => {
    const phone = normPhone(p.phone);
    const key = phone ? 'p:' + phone : 'n:' + normArabic(p.name);
    if (!normArabic(p.name) && !phone) return;
    (groups[key] = groups[key] || []).push(p);
  });
  return Object.values(groups).filter(g => g.length > 1).map(g => [...g].sort((a, b) => (a.id || 0) - (b.id || 0)));
}

export async function mergePatients(keep, drop) {
  for (const key of MERGE_KEYS) {
    const cur = await sbGet(key);
    if (!Array.isArray(cur) || !cur.length) continue;
    const touched = cur.some(r => r && r.patientId === drop.id);
    if (!touched) continue;
    await sbMutate(key, list => list.map(r => r && r.patientId === drop.id ? { ...r, patientId: keep.id, patient: keep.name } : r));
  }
  await trashPut('iapp_patients', drop, 'مريض مدمج: ' + (drop.name || ''));
  const res = await sbMutate('iapp_patients', list => list.filter(p => p.id !== drop.id));
  await logAudit('دمج ملفين', (drop.patientCode || drop.id) + ' ← ' + (keep.patientCode || keep.id) + ' · ' + (keep.name || ''));
  return res.ok;
}

export async function trashRestore(entry) {
  if (!entry || !entry.storeKey || !entry.record) return false;
  const rec = entry.record;
  const put = await sbMutate(entry.storeKey, list => list.some(x => x.id === rec.id) ? list.map(x => x.id === rec.id ? rec : x) : [...list, rec], list => list.some(x => x.id === rec.id));
  if (!put.ok) return false;
  try {
    localStorage.setItem(entry.storeKey, JSON.stringify(put.data));
  } catch {}
  await sbMutate(TRASH_KEY, list => list.filter(t => t.id !== entry.id));
  await logAudit('استعادة من سلة المحذوفات', entry.label || entry.storeKey);
  return true;
}

export async function trashDrop(entryId) {
  await sbMutate(TRASH_KEY, list => list.filter(t => t.id !== entryId));
}

export async function maybeDailyBackup() {
  try {
    const list = await sbGet(BACKUP_KEY);
    if (list === undefined) return;
    const arr = Array.isArray(list) ? list : [];
    if (arr.some(b => localISO(new Date(b.at)) === localISO())) return;
    await saveAutoBackup('نسخة يومية تلقائية');
  } catch (e) {
    console.warn('daily backup failed', e);
  }
}

export async function restoreSnapshot(data, label) {
  const keys = Object.keys(data || {}).filter(k => k.indexOf('iapp_') === 0 && !['iapp_session', 'iapp_unified_session', GUARD_KEY, BACKUP_KEY, TRASH_KEY, AUDIT_KEY].includes(k));
  if (!keys.length) return {
    ok: false,
    error: 'الملف لا يحتوي على بيانات I App'
  };
  await saveAutoBackup('قبل الاستعادة');
  let done = 0;
  for (const k of keys) {
    const v = data[k];
    if (v === undefined) continue;
    const ok = await sbSet(k, v);
    try {
      localStorage.setItem(k, JSON.stringify(v));
    } catch {}
    if (ok) done++;
  }
  await logAudit('استعادة نسخة احتياطية', (label || '') + ' · ' + done + ' مجموعة بيانات');
  return {
    ok: true,
    count: done
  };
}
