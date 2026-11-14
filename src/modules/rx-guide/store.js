// Storage of the clinic's edits to the Rx guide (see applyOverlay in model.js). One synced key in the generic
// key/value store (no table of its own), same pattern as the prescription templates: local copy first, remote refresh,
// every change goes through sbMutate (queued while offline).
import { newId } from '../constants/misc.js';
import { sbGet, sbMutate } from '../sync/wiring.js';
import { logAudit, getActorName } from '../sync/audit-trash-backup.js';
import { overrideId } from './model.js';

export const RX_GUIDE_KEY = 'iapp_rx_guide';

const keep = data => {
  try { localStorage.setItem(RX_GUIDE_KEY, JSON.stringify(data)); } catch { /* storage unavailable: non-fatal */ }
  return data;
};

export function loadGuideOverlay() {
  try {
    const l = JSON.parse(localStorage.getItem(RX_GUIDE_KEY) || '[]');
    return Array.isArray(l) ? l : [];
  } catch { return []; }
}

export async function refreshGuideOverlay() {
  const r = await sbGet(RX_GUIDE_KEY);
  return Array.isArray(r) ? keep(r) : loadGuideOverlay();
}

async function write(mutator, auditAction, auditDetails) {
  const res = await sbMutate(RX_GUIDE_KEY, mutator);
  if (!res.ok) return null;
  keep(res.data);
  logAudit(auditAction, auditDetails);
  return res.data;
}

// value = { title, chapter, urgent, sections } from normalizeCardInput. baseId = the guide card edited, or null for a new card.
export function saveGuideCard(value, baseId, existingId) {
  const rec = { ...value, id: baseId ? overrideId(baseId) : (existingId || 'u:' + newId()), base: baseId || null, by: getActorName(), at: new Date().toISOString() };
  return write(list => [...list.filter(x => x.id !== rec.id), rec], baseId || existingId ? 'تعديل كارت في دليل الروشتة' : 'إضافة كارت لدليل الروشتة', value.title);
}

// Hides a guide card (the original stays in the guide and can be shown again).
export function hideGuideCard(baseId, title) {
  const rec = { id: overrideId(baseId), base: baseId, deleted: true, by: getActorName(), at: new Date().toISOString() };
  return write(list => [...list.filter(x => x.id !== rec.id), rec], 'إخفاء كارت من دليل الروشتة', title);
}

// Removes a record: the original card comes back (edited / hidden base) or the clinic's own card disappears.
export function removeGuideRecord(id, title) {
  return write(list => list.filter(x => x.id !== id), 'حذف تعديل في دليل الروشتة', title);
}

// Shows every hidden guide card again.
export function restoreHiddenCards() {
  return write(list => list.filter(x => !(x.base && x.deleted)), 'إظهار كروت دليل الروشتة المخفية', '');
}
