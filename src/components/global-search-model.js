// Pure logic behind src/components/GlobalSearch.jsx -- moved here from
// public/legacy/app-runtime.js (Phase 8, combined batch 19). Exact copy of
// the original filtering logic (same limits, same fields), separated out so
// it can be unit-tested directly without rendering anything.

import { matchesPatient } from '../modules/patients/list.js';
import { textIncludes } from '../modules/search/text.js';

// Matching is Arabic-aware (أحمد = احمد, فاطمة = فاطمه, ٠١٠ = 010) and identical to the patients list:
// name, condition, file code (text or digits) and phone digits.
export function globalSearchResults(patients, prescriptions, appointments, query) {
  const trimmed = (query || '').trim();
  const pRes = trimmed ? (patients || []).filter(p => p && matchesPatient(p, trimmed)).slice(0, 5) : [];
  const rRes = trimmed ? (prescriptions || []).filter(r => r && r.patient && textIncludes(r.patient, trimmed)).slice(0, 3) : [];
  const aRes = trimmed ? (appointments || []).filter(a => a && a.patient && textIncludes(a.patient, trimmed)).slice(0, 3) : [];
  const hasResults = pRes.length > 0 || rRes.length > 0 || aRes.length > 0;
  return { trimmed, pRes, rRes, aRes, hasResults };
}

// The patient a prescription/appointment result belongs to (by id, else by exact name), or null.
// Lets a search result open the patient file directly instead of only switching tab.
export function patientForResult(patients, rec) {
  if (!rec) return null;
  const list = patients || [];
  return list.find(p => p && rec.patientId != null && p.id === rec.patientId) ||
    list.find(p => p && rec.patient && p.name === rec.patient) || null;
}
