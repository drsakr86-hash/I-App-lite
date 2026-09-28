// Pure logic for UnifiedLogin (public/legacy/app-runtime.js) — the app's
// single entry gate (staff / patient / guest). Extracted verbatim from its
// choose()/submit() logic. Everything that touches the network, Supabase,
// login-attempt lockout, or localStorage stays in the legacy runtime
// unchanged: this only covers the parts that need no side effect.
import { normArabic } from '../patients/list.js';

export const STAFF_LOGIN_EMPTY_ERROR = '❌ أدخل البريد الإلكتروني وكلمة المرور';
export const PATIENT_LOGIN_EMPTY_ERROR = '❌ أدخل رقم الملف والاسم الكامل';

// The "patient" tab button collapses to guest-only unless the
// PATIENT_FILE_LOGIN flag is on (it is off in production today — see
// app-runtime.js). Staff mode is never affected by the flag.
export function nextLoginMode(patientFileLoginEnabled, requestedMode) {
  return patientFileLoginEnabled ? requestedMode : requestedMode === 'patient' ? 'guest' : requestedMode;
}

export const staffLoginFieldsMissing = (username, password) => !username.trim() || !password;
export const patientLoginFieldsMissing = (code, name) => !code.trim() || !name.trim();

// The typed code IS trimmed before normalizing; a patient's own stored code
// is NOT trimmed first (pre-existing asymmetry, preserved exactly).
export const normalizeTypedPatientCode = code => String(code || '').trim().toUpperCase().replace(/^P-?/, '').replace(/^0+/, '');
export const normalizeStoredPatientCode = patientCode => String(patientCode || '').toUpperCase().replace(/^P-?/, '').replace(/^0+/, '');

// Same match the legacy submit() does: normalized code AND Arabic-normalized
// name must both match. Returns null (not undefined) when nothing matches.
export function findPatientByCodeAndName(patients, code, name) {
  const codeKey = normalizeTypedPatientCode(code);
  const nameKey = normArabic(name);
  const found = (patients || []).find(
    x => normalizeStoredPatientCode(x.patientCode) === codeKey && normArabic(x.name) === nameKey
  );
  return found || null;
}

// The localStorage key used to rate-limit patient-code login attempts —
// built from the typed code exactly as legacy does (trimmed, uppercased,
// NOT stripped of a leading "P"/zeros — different normalization than the
// match above, preserved exactly).
export const patientLoginLockKey = code => 'patient:' + code.trim().toUpperCase();
