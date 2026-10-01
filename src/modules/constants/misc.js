// Small standalone constants/helpers — moved here from
// public/legacy/app-runtime.js (Phase 8, batch 2). Exact copies of the
// original values; app-runtime.js now delegates to this module instead of
// defining its own.

// localStorage key for the patient booking-request queue.
export const BOOKING_TABLE = 'iapp_booking_requests';

export const localDateStr = () => {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
};

export const localTimeStr = () => {
  const d = new Date();
  return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
};

// Phase 8, batch 14 — exact copies of the original bare values/helpers from
// public/legacy/app-runtime.js. These have no dependency on any other
// legacy state (unlike the login-lockout/migration logic that reads some of
// them, which stays in app-runtime.js for a later batch).

// Local calendar-day string in YYYY-MM-DD, in the browser's own timezone
// (not UTC) — used throughout the sync layer and several screens to key
// date-range queries and date comparisons.
export function localISO(d) {
  d = d || new Date();
  const z = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return z.toISOString().slice(0, 10);
}

// Client-generated id for new local records before they're synced (not a
// real UUID — just unique-enough for this app's scale).
export const newId = () => Date.now() + Math.floor(Math.random() * 997);

// Normalizes an email for use as a case/whitespace-insensitive lookup key.
export const emailKey = e => String(e || '').trim().toLowerCase();

// Arabic display labels for each staff role.
export const ROLE_LABEL = {
  admin: 'مدير',
  doctor: 'طبيب',
  secretary: 'سكرتارية',
  employee: 'موظف'
};

// Minimum password length enforced at password-set/change time.
export const MIN_PW_LEN = 6;

// localStorage key for the login-attempt lockout guard records.
export const GUARD_KEY = 'iapp_login_guard';
