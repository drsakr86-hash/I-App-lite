// Clinic-related constants and lookups — moved here from
// public/legacy/app-runtime.js (Phase 8, batch 2). Exact copies of the
// original values; app-runtime.js now delegates to this module instead of
// defining its own.

export const CLINICS = [
  { v: 'دمنهور', l: 'عيادة دمنهور' },
  { v: 'الرحمانية', l: 'عيادة الرحمانية' },
  { v: 'مركز دمنهور للعيون', l: 'مركز دمنهور للعيون' }
];

export const clinicLabel = v => (CLINICS.find(c => c.v === v) || {}).l || v || '—';

// "All clinics" filter option, prepended to the CLINICS list (used in
// dropdown filters, e.g. Appointments/Accounting).
export const CLINIC_FILTERS = [{ v: '', l: 'كل العيادات' }, ...CLINICS];

// Plain clinic name list (no labels) — used where only the raw names matter.
export const CLINICS_LIST = ['دمنهور', 'الرحمانية', 'مركز دمنهور للعيون'];

// Clinics as the patient-facing booking screen presents them (address, phone,
// opening days/sessions for slot generation).
export const PATIENT_CLINICS = [
  {
    id: 'damnhour',
    name: 'عيادة دمنهور',
    address: 'برج المنتزه بجوار حديقة الجمهورية',
    phone: '0453333313',
    icon: '🏥',
    days: [0, 1, 3, 4, 6],
    dayNames: ['الأحد', 'الاثنين', 'الأربعاء', 'الخميس', 'السبت'],
    sessions: [{ slots: ['20:00', '20:30', '21:00', '21:30', '22:00'] }]
  },
  {
    id: 'rahmania',
    name: 'عيادة الرحمانية',
    address: 'ش أحمد محمود بجوار فرع we',
    phone: '01111480137',
    icon: '🏨',
    days: [6, 1, 3],
    dayNames: ['السبت', 'الاثنين', 'الأربعاء'],
    sessions: [{ slots: ['16:00', '16:30', '17:00', '17:30', '18:00'] }]
  },
  {
    id: 'center',
    name: 'مركز دمنهور للعيون',
    address: 'دمنهور',
    phone: '0453333313',
    icon: '👁',
    schedule: {
      0: { slots: ['13:00', '13:30', '14:00', '14:30', '15:00', '15:30'] },
      1: { slots: ['13:00', '13:30', '14:00', '14:30', '15:00', '15:30'] },
      2: { slots: ['15:00', '15:30', '16:00', '16:30', '17:00', '17:30', '18:00', '18:30', '19:00', '19:30', '20:00', '20:30'] },
      4: { slots: ['09:00', '09:30', '10:00', '10:30', '11:00', '11:30', '12:00', '12:30', '13:00', '13:30', '14:00', '14:30'] }
    },
    dayNames: ['الأحد', 'الاثنين', 'الثلاثاء', 'الخميس']
  }
];

// Maps a PATIENT_CLINICS full display name to the short clinic name used
// elsewhere in the app (matches the CLINICS `v` values).
export const CLINIC_CODE = {
  'عيادة دمنهور': 'دمنهور',
  'عيادة الرحمانية': 'الرحمانية',
  'مركز دمنهور للعيون': 'مركز دمنهور للعيون'
};

// The inverse of CLINIC_CODE: short name -> full display name.
const SHORT_TO_NAME = {
  'دمنهور': 'عيادة دمنهور',
  'الرحمانية': 'عيادة الرحمانية',
  'مركز دمنهور للعيون': 'مركز دمنهور للعيون'
};

export const clinicDisplay = v => SHORT_TO_NAME[v] || v || '';
