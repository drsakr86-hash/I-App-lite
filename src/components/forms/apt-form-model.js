// Pure logic for AptForm (src/components/forms/AptForm.jsx). Every value and
// expression mirrors the legacy runtime's AptForm exactly
// (public/legacy/app-runtime.js); legacy quirks are kept on purpose.

import { t } from '../../modules/i18n/index.js';

export const DEFAULT_APT_DOCTOR_NAMES = ['د. عبدالستار', 'د. سلمى', 'د. ليلى'];
const DEFAULT_APT_DOCTOR = 'د. عبدالستار';
export const APT_CONFLICT_MESSAGE = '⚠ يوجد موعد آخر لنفس الطبيب في هذا التاريخ والوقت';

// Add mode. `today` is localISO(), `defaultClinic` is CLINICS[0].v.
export const blankApt = (today, defaultClinic) => ({
  patient: '',
  date: today,
  time: '09:00',
  type: '',
  doctor: DEFAULT_APT_DOCTOR,
  clinic: defaultClinic
});

export const initialAptState = (initial, today, defaultClinic) =>
  initial ? { ...blankApt(today, defaultClinic), ...initial } : blankApt(today, defaultClinic);

// Same doctor, same time, same date (missing date treated as today) as an
// existing appointment other than the one being edited (matched by id).
export const hasSchedulingConflict = (appointments, f, today) =>
  appointments.some(a => a.id !== f.id && a.doctor === f.doctor && a.time === f.time && (a.date || today) === (f.date || today));

// A real calendar date in YYYY-MM-DD form. The `date` column of iapp_appointments is NOT NULL, so an
// empty/invalid value must be stopped here, with a message, instead of failing in the database.
export const hasValidAptDate = d => {
  if (typeof d !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(d)) return false;
  const [y, m, day] = d.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, day));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === day;
};

// What trySave() should do, given the current form and appointment list.
// Legacy quirk kept: an empty patient name is a silent no-op -- it does NOT
// clear a conflict message left over from a previous attempt.
//   { type: 'noop' }              -- nothing happens (patient name is empty)
//   { type: 'error', message }    -- show this message, don't save
//   { type: 'save' }              -- clear any error and call onSave(f)
export const aptSaveOutcome = (appointments, f, today) => {
  if (!f.patient) return { type: 'noop' };
  if (!hasValidAptDate(f.date)) return { type: 'error', message: t('g3.apt.dateRequired') };
  if (hasSchedulingConflict(appointments, f, today)) return { type: 'error', message: t('g3.apt.conflict') };
  return { type: 'save' };
};
