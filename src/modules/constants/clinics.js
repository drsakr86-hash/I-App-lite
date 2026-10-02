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

// Length of one patient-booking slot, in minutes. Slots are generated from each
// clinic's opening window (first start .. last start, both included).
export const SLOT_MINUTES = 10;

export function slotRange(start, end, step = SLOT_MINUTES) {
  const toMin = t => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
  const out = [];
  for (let m = toMin(start); m <= toMin(end); m += step) {
    out.push(String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0'));
  }
  return out;
}

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
    sessions: [{ slots: slotRange('20:00', '22:00') }]
  },
  {
    id: 'rahmania',
    name: 'عيادة الرحمانية',
    address: 'ش أحمد محمود بجوار فرع we',
    phone: '01111480137',
    icon: '🏨',
    days: [6, 1, 3],
    dayNames: ['السبت', 'الاثنين', 'الأربعاء'],
    sessions: [{ slots: slotRange('16:00', '18:00') }]
  },
  {
    id: 'center',
    name: 'مركز دمنهور للعيون',
    address: 'دمنهور',
    phone: '0453333313',
    icon: '👁',
    schedule: {
      0: { slots: slotRange('13:00', '15:30') },
      1: { slots: slotRange('13:00', '15:30') },
      2: { slots: slotRange('15:00', '20:30') },
      4: { slots: slotRange('09:00', '14:30') }
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
