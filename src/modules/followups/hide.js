// Persistence for hidden follow-ups (shared across devices through the generic iapp_store key).
import { sbGet, sbMutate } from '../sync/index.js';
import { localISO } from '../constants/misc.js';
import { FOLLOWUP_HIDE_KEY, SNOOZE_DAYS, followUpKey, addDaysISO } from './followups-model.js';

export async function loadHidden() {
  const r = await sbGet(FOLLOWUP_HIDE_KEY);
  return Array.isArray(r) ? r : [];
}

// Replace any earlier record for the same follow-up, so repeated taps never pile up.
const upsert = rec => list => [...list.filter(x => x.key !== rec.key), rec];

export function hideRecord(type, v, now = new Date()) {
  const today = localISO(now);
  return {
    key: followUpKey(v.patientId, v.nextVisit),
    patientId: v.patientId,
    nextVisit: v.nextVisit,
    type,
    ...(type === 'snoozed' ? { until: addDaysISO(today, SNOOZE_DAYS) } : {}),
    at: now.getTime()
  };
}

export async function hideFollowUp(type, v) {
  const rec = hideRecord(type, v);
  const res = await sbMutate(FOLLOWUP_HIDE_KEY, upsert(rec), list => list.some(x => x.key === rec.key && x.type === type));
  return res.ok ? rec : null;
}

export async function unhideFollowUp(v) {
  const key = followUpKey(v.patientId, v.nextVisit);
  const res = await sbMutate(FOLLOWUP_HIDE_KEY, list => list.filter(x => x.key !== key), list => !list.some(x => x.key === key));
  return !!res.ok;
}
