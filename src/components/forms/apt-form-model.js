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

// What trySave() should do, given the current form and appointment list.
// Legacy quirk kept: an empty patient name is a silent no-op -- it does NOT
// clear a conflict message left over from a previous attempt.
//   { type: 'noop' }              -- nothing happens (patient name is empty)
//   { type: 'error', message }    -- show this message, don't save
//   { type: 'save' }              -- clear any error and call onSave(f)
export const aptSaveOutcome = (appointments, f, today) => {
  if (!f.patient) return { type: 'noop' };
  if (hasSchedulingConflict(appointments, f, today)) return { type: 'error', message: t('g3.apt.conflict') };
  return { type: 'save' };
};
