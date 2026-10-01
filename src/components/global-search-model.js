// Pure logic behind src/components/GlobalSearch.jsx -- moved here from
// public/legacy/app-runtime.js (Phase 8, combined batch 19). Exact copy of
// the original filtering logic (same limits, same fields), separated out so
// it can be unit-tested directly without rendering anything.

export function globalSearchResults(patients, prescriptions, appointments, query) {
  const trimmed = (query || '').trim();
  const pRes = trimmed
    ? (patients || []).filter(p => (p.name || '').includes(trimmed) || (p.patientCode || '').includes(trimmed) || (p.phone || '').includes(trimmed)).slice(0, 5)
    : [];
  const rRes = trimmed ? (prescriptions || []).filter(r => (r.patient || '').includes(trimmed)).slice(0, 3) : [];
  const aRes = trimmed ? (appointments || []).filter(a => (a.patient || '').includes(trimmed)).slice(0, 3) : [];
  const hasResults = pRes.length > 0 || rRes.length > 0 || aRes.length > 0;
  return { trimmed, pRes, rRes, aRes, hasResults };
}
