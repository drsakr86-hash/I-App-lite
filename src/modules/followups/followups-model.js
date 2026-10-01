// Pure logic behind src/components/FollowUpCentre.jsx -- moved here from
// public/legacy/app-runtime.js (Phase 8, combined batch 19). Exact copies of
// the original logic; app-runtime.js now delegates to this module instead of
// redefining any of it.
//
// INJ_KEY/INJ_DRUGS are also used by the legacy runtime's InjectionsSection
// (out of this batch's scope -- it isn't rendered through any bridge and
// isn't part of the "no React equivalent" discovery list), so they move here
// (a trivial self-contained constant/array) and app-runtime.js delegates to
// them instead of redefining them, same as every other shared constant in
// Phase 8.

import { localISO } from '../constants/misc.js';

export const INJ_KEY = 'iapp_injections';
export const INJ_DRUGS = ['Avastin', 'Lucentis', 'Eylea', 'Ozurdex', 'Triamcinolone', 'Vabysmo'];

export function dueInjections(list, days) {
  const limit = new Date();
  limit.setDate(limit.getDate() + (days == null ? 7 : days));
  const latest = {};
  (list || []).forEach(x => {
    const k = String(x.patientId || x.patient) + '|' + (x.eye || '');
    if (!latest[k] || String(x.date || '') > String(latest[k].date || '')) latest[k] = x;
  });
  return Object.values(latest).filter(x => x.nextDate && new Date(x.nextDate) <= limit).sort((a, b) => String(a.nextDate).localeCompare(String(b.nextDate)));
}

export function overdueFollowUps(visits, patients) {
  const today = localISO();
  const lastVisit = {};
  (visits || []).forEach(v => {
    const k = String(v.patientId);
    if (!lastVisit[k] || String(v.date || '') > String(lastVisit[k])) lastVisit[k] = String(v.date || '');
  });
  const seen = {};
  return (visits || []).filter(v => {
    if (!v.nextVisit || String(v.nextVisit) >= today) return false;
    const k = String(v.patientId);
    if (String(lastVisit[k] || '') > String(v.nextVisit)) return false;
    if (seen[k]) return false;
    seen[k] = true;
    return true;
  }).map(v => {
    const p = (patients || []).find(p => p.id === v.patientId) || {};
    const late = Math.floor((new Date(today) - new Date(v.nextVisit)) / 86400000);
    return {
      ...v,
      patientName: p.name || v.patient || '—',
      patientPhone: p.phone || '',
      late
    };
  }).sort((a, b) => b.late - a.late);
}
