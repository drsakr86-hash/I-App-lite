// Reusable prescription ("Rx") templates -- a small saved-medicines-list
// feature used by MedicinesStep. Moved here from
// public/legacy/app-runtime.js (Phase 8, batch 15). Exact copy of the
// original logic; app-runtime.js now delegates to the moved MedicinesStep
// component instead of redefining any of this.
//
// addRxTemplate needs to stamp "who saved this" (actorName() in the legacy
// original). Rather than add a separate setActor() registration for this
// one field, it reads the actor already registered by the sync engine
// (batch 13's setActor, wired up once in app-runtime.js) through
// getActorName() -- no new wiring needed in app-runtime.js for this batch.

import { newId } from '../constants/misc.js';
import { sbGet, sbMutate } from '../sync/wiring.js';
import { logAudit, getActorName } from '../sync/audit-trash-backup.js';

export const RX_TPL_KEY = 'iapp_rx_templates';

export function loadRxTemplates() {
  try {
    const l = localStorage.getItem(RX_TPL_KEY);
    if (l) return JSON.parse(l) || [];
  } catch {}
  return [];
}

export async function refreshRxTemplates() {
  const r = await sbGet(RX_TPL_KEY);
  if (Array.isArray(r)) {
    try {
      localStorage.setItem(RX_TPL_KEY, JSON.stringify(r));
    } catch {}
    return r;
  }
  return loadRxTemplates();
}

export async function addRxTemplate(t) {
  const rec = {
    id: newId(),
    name: t.name,
    medicines: t.medicines || '',
    notes: t.notes || '',
    by: getActorName()
  };
  const res = await sbMutate(RX_TPL_KEY, list => [...list.filter(x => x.name !== rec.name), rec]);
  if (res.ok) {
    try {
      localStorage.setItem(RX_TPL_KEY, JSON.stringify(res.data));
    } catch {}
    logAudit('حفظ قالب روشتة', rec.name);
  }
  return res.ok ? res.data : null;
}

export async function deleteRxTemplate(id) {
  const res = await sbMutate(RX_TPL_KEY, list => list.filter(x => x.id !== id));
  if (res.ok) {
    try {
      localStorage.setItem(RX_TPL_KEY, JSON.stringify(res.data));
    } catch {}
  }
  return res.ok ? res.data : null;
}
