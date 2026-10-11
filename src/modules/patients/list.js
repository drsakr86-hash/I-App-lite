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

// Highest file number in a list (P-0062-D1 counts as 62).
export function maxPatientNumber(patients) {
  const list = Array.isArray(patients) ? patients : [];
  return Math.max(0, ...list.map(p => parseInt(String((p && p.patientCode) || '').replace('P-', ''), 10) || 0));
}

// Server counter (docs/sql/patient-code-seq.sql). Returns 'P-00NN' or null (no client, offline, timeout, RPC missing, bad answer) -> caller falls
// back to nextPatientCode(). `sb` is the Supabase client; the call is abandoned after `ms`.
export async function fetchServerPatientCode(sb, floor, ms = 3000) {
  try {
    if (!sb || typeof sb.rpc !== 'function') return null;
    let timer;
    const timeout = new Promise(res => { timer = setTimeout(() => res(null), ms); });
    const r = await Promise.race([Promise.resolve(sb.rpc('iapp_next_patient_code', { p_floor: Math.max(0, Math.floor(Number(floor) || 0)) })), timeout]);
    clearTimeout(timer);
    const code = r && !r.error ? r.data : null;
    return typeof code === 'string' && /^P-\d{4,}$/.test(code) ? code : null;
  } catch {
    return null;
  }
}

// Next sequential file code: P-0001, P-0002, ...
// `floor` = highest number ever seen on this device (code-floor.js): numbers of deleted/merged patients are never re-issued.
export function nextPatientCode(patients, floor = 0) {
  const list = Array.isArray(patients) ? patients : [];
  const nums = list.map(p => parseInt((p.patientCode || 'P-0000').replace('P-', '')) || 0);
  return 'P-' + String(Math.max(0, Number(floor) || 0, ...nums) + 1).padStart(4, '0');
}
