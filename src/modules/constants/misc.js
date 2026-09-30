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
