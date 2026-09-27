// Pure helpers for the patients list screen — no React, no I/O.
// normArabic / normPhone / nextPatientCode are exact copies of the legacy
// runtime's normArabic / normPhone / genCode (all pure there too).

const DAY_MS = 86400000;

// Strip tashkeel + tatweel, unify alef/yaa/taa-marbuta forms, collapse spaces.
export function normArabic(s) {
  return String(s || '').trim()
    .replace(/[ً-ْـ]/g, '')
    .replace(/[أإآ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

// Digits only, with the Egyptian country prefix (20 / 0020) turned into a leading 0.
export const normPhone = s => String(s || '').replace(/\D/g, '').replace(/^(20|0020)/, '0');

// Newest first (ids are creation timestamps).
export function sortPatients(patients) {
  const list = Array.isArray(patients) ? patients : [];
  return [...list].sort((a, b) => (b.id || 0) - (a.id || 0));
}

// Match name/condition (Arabic-normalised), file code (text or digits) and phone digits.
export function matchesPatient(p, search) {
  const q = String(search || '').trim();
  if (!q) return true;
  const qn = normArabic(q);
  const qd = q.replace(/\D/g, '');
  return normArabic(p.name).includes(qn) ||
    normArabic(p.condition).includes(qn) ||
    String(p.patientCode || '').toUpperCase().includes(q.toUpperCase()) ||
    (!!qd && String(p.patientCode || '').replace(/\D/g, '').includes(qd)) ||
    (!!qd && normPhone(p.phone).includes(qd));
}

export function listPatients(patients, search) {
  const sorted = sortPatients(patients);
  return String(search || '').trim() ? sorted.filter(p => matchesPatient(p, search)) : sorted;
}

// Added within the last 24h (id is Date.now() at creation).
export const isNewToday = (p, now = Date.now()) => !!(p && p.id && now - p.id < DAY_MS);

// Next sequential file code: P-0001, P-0002, ...
export function nextPatientCode(patients) {
  const list = Array.isArray(patients) ? patients : [];
  const nums = list.map(p => parseInt((p.patientCode || 'P-0000').replace('P-', '')) || 0);
  return 'P-' + String(Math.max(0, ...nums) + 1).padStart(4, '0');
}
