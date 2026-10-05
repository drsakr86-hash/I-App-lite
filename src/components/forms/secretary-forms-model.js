// Pure logic for the secretary app's forms: SecretaryAptForm and
// CollectModal (src/components/forms/*.jsx). Every value and expression
// mirrors the legacy runtime's forms exactly (public/legacy/app-runtime.js);
// legacy quirks are kept on purpose.
//
// The form's own double-booking check (secretaryAptConflict) is deliberately
// NOT the save-time check in src/modules/secretary-app/model.js: this one
// does not skip cancelled appointments. Both are kept exactly as legacy has
// them.

// ---- SecretaryAptForm ------------------------------------------------------

import { t } from '../../modules/i18n/index.js';

export const SECRETARY_APT_TYPES = ['فحص روتيني', 'متابعة', 'استشارة', 'قياس نظر', 'فحص شبكية', 'عملية'];
export const SECRETARY_DEFAULT_CLINIC = 'دمنهور';
export const PATIENT_PICKER_PLACEHOLDER = '— اختر مريض —';
export const SECRETARY_NAME_ERROR = 'اكتب اسم المريض';
export const SECRETARY_CONFLICT_ERROR = '⚠ يوجد موعد آخر لنفس الطبيب في هذا التاريخ والوقت';

// Add mode. `today` is localISO().
export const blankSecretaryApt = today => ({
  patient: '',
  patientId: null,
  phone: '',
  time: '09:00',
  date: today,
  type: 'فحص روتيني',
  doctor: 'د. عبدالستار',
  clinic: SECRETARY_DEFAULT_CLINIC,
  cost: '',
  paid: false,
  notes: ''
});

// Edit mode: blank defaults overlaid with every stored field.
export const initialSecretaryAptState = (initial, today) =>
  initial ? { ...blankSecretaryApt(today), ...initial } : blankSecretaryApt(today);

// "existing" (registered patient picker) only when the appointment has a
// truthy patientId.
export const initialSecretaryAptMode = initial => (initial?.patientId ? 'existing' : 'new');

// A stored cost counts as already typed, so changing the type never
// overwrites it.
export const initialCostTouched = initial => !!(initial && initial.cost);

// Price-list entry for a type (first match wins; substring both ways).
// Quirks kept: a price named "" matches every type; a price with no name
// throws (p.name.includes).
export const matchSecretaryPrice = (prices, t) => prices.find(p => p.name === t || p.name.includes(t) || t.includes(p.name));

// Choosing a type fills the cost from the price list unless the cost was
// ever typed by hand (or came with the edited appointment).
export const withSecretaryAptType = (v, t, m, costTouched) => ({ ...v, type: t, cost: !costTouched && m ? m.price : v.cost });

// Switching to "new" clears the patient, id and phone; switching to
// "existing" clears only the patient and id (the phone is kept).
export const withNewPatientMode = v => ({ ...v, patient: '', patientId: null, phone: '' });
export const withExistingPatientMode = v => ({ ...v, patient: '', patientId: null });

// The picker's option values are strings; ids are compared as numbers
// (a patient with a non-numeric id can never be picked — legacy).
export const findPickedPatient = (patients, value) => patients.find(p => p.id === Number(value));
export const withPickedPatient = (v, p) => ({ ...v, patientId: p.id, patient: p.name, phone: p.phone || '' });

export const toggleSecretaryPaid = v => ({ ...v, paid: !v.paid });

// Same doctor + date + time on any other appointment, cancelled or not.
export const secretaryAptConflict = (appointments, f) =>
  appointments.some(a => a.id !== f.id && a.doctor === f.doctor && a.date === f.date && a.time === f.time);

// Error shown on save, or null when the form may be saved. Order: patient
// name first, then the conflict check. (f.patient must be a string.)
export const secretaryAptError = (f, appointments) => {
  if (!f.patient.trim()) return t('g3.sec.nameError');
  if (secretaryAptConflict(appointments, f)) return t('g3.apt.conflict');
  return null;
};

// Save payload: the whole form, id kept in edit mode (new id = Date.now()).
export const buildSecretaryAptPayload = (f, now) => ({ ...f, id: f.id || now });

// ---- CollectModal ----------------------------------------------------------

// Quirks kept: a price with no name throws; apt.type undefined matches a
// price whose name contains "undefined" only.
export const matchCollectPrice = (prices, type) =>
  prices.find(p => p.name === type || p.name.includes(type) || (type || '').includes(p.name));

// The stored cost wins when truthy (a stored 0 falls through to the price
// list), then the matched price, else empty.
export const initialCollectCost = (apt, matched) => apt.cost || (matched ? matched.price : '');
export const initialCollectPaid = apt => !!apt.paid;
