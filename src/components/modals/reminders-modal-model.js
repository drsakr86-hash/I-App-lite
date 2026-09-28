// Pure logic for RemindersModal (src/components/modals/RemindersModal.jsx).
// Every value and expression mirrors the legacy runtime's RemindersModal
// exactly (public/legacy/app-runtime.js).
import { isActiveApt } from '../../modules/secretary-app/model.js';

// The day after `now` (a Date), as a Date; the component formats it with the
// runtime's localISO. Recomputed on every render, like legacy.
export const tomorrowOf = now => {
  const d = new Date(now);
  d.setDate(d.getDate() + 1);
  return d;
};

// Tomorrow's non-cancelled appointments, earliest time first (times compared
// as strings; a missing time sorts first). Already-reminded ones stay listed.
export const reminderRows = (apts, tomorrow) =>
  (apts || []).filter(a => a.date === tomorrow && isActiveApt(a)).sort((a, b) => String(a.time || '').localeCompare(String(b.time || '')));

export const reminderButtonLabel = reminded => (reminded ? '✓ تم الإرسال — إعادة' : '💬 إرسال التذكير');
export const reminderTypeLabel = type => type || 'فحص';
