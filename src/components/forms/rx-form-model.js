// Pure logic for RxForm (src/components/forms/RxForm.jsx). Every value and
// expression mirrors the legacy runtime's RxForm and its refraction option
// lists exactly (public/legacy/app-runtime.js); legacy quirks are kept.

export const EYE_RIGHT = 'العين اليمنى';
export const EYE_LEFT = 'العين اليسرى';
export const EYE_BOTH = 'كلتا العينين';
export const RX_EYES = [EYE_RIGHT, EYE_LEFT, EYE_BOTH];

export const RX_STEPS = ['المريض', 'قياسات النظر', 'الأدوية'];
export const RX_LAST_STEP = 2;

// SPH +20.00 … -20.00 in 0.25 steps; CYL 0.00 … -6.00; AXIS 0 … 180.
export const SPH_OPTIONS = (() => {
  const opts = [];
  for (let i = 80; i >= -80; i--) {
    const v = i / 4;
    opts.push((v >= 0 ? '+' : '') + v.toFixed(2));
  }
  return opts;
})();
export const CYL_OPTIONS = (() => {
  const opts = [];
  for (let i = 0; i <= 24; i++) {
    const v = -(i / 4);
    opts.push(v === 0 ? '0.00' : v.toFixed(2));
  }
  return opts;
})();
export const AXIS_OPTIONS = Array.from({ length: 181 }, (_, i) => String(i));
export const ADD_OPTIONS = ['0.00', '0.25', '0.50', '0.75', '1.00', '1.25', '1.50', '1.75', '2.00', '2.25', '2.50', '2.75', '3.00', '3.25', '3.50'];
// I.P.D 50.0 … 75.0 mm in 0.5 steps.
export const IPD_OPTIONS = Array.from({ length: Math.round((75 - 50) / 0.5) + 1 }, (_, i) => (50 + i * 0.5).toFixed(1));

// What the selects show when the field is empty (the stored value stays "").
export const SPH_DISPLAY_DEFAULT = '+0.00';
export const CYL_DISPLAY_DEFAULT = '0.00';
export const AXIS_DISPLAY_DEFAULT = '0';
export const ADD_DISPLAY_DEFAULT = '0.00';
export const IPD_DISPLAY_DEFAULT = '62';

export const AXIS_REQUIRED_ERR = 'مطلوب عند وجود CYL';
export const AXIS_FIELD_ERR_TEXT = '⚠ مطلوب مع CYL';
export const AXIS_BANNER_TEXT = 'عند إدخال CYL يجب إدخال AXIS للعين ';
export const NO_PATIENTS_WARNING = '⚠️ لا يوجد مرضى — أضف مريضاً أولاً من شاشة المرضى';

// A single-patient list (the patient file) locks the form to that patient.
export const autoPatientOf = patients => (patients && patients.length === 1 ? patients[0] : null);

export const blankRx = (autoPatient, today) => ({
  patient: autoPatient && autoPatient.name || '',
  patientId: autoPatient && autoPatient.id || null,
  eye: EYE_BOTH,
  sphR: '',
  cylR: '',
  axisR: '',
  sphL: '',
  cylL: '',
  axisL: '',
  add: '',
  medicines: '',
  notes: '',
  date: today
});

// Edit mode is a plain copy of the stored prescription (the auto patient is
// NOT applied over it).
export const initialRxState = (initial, autoPatient, today) => (initial ? { ...initial } : blankRx(autoPatient, today));

// Add mode with an auto patient skips the patient step.
export const initialRxStep = (autoPatient, initial) => (autoPatient && !initial ? 1 : 0);

// Tab labels and the real step index each tab jumps to.
export const rxStepLabels = autoPatient => (autoPatient ? RX_STEPS.slice(1) : RX_STEPS);
export const rxRealStep = (autoPatient, i) => (autoPatient ? i + 1 : i);

export const needsRight = eye => eye === EYE_RIGHT || eye === EYE_BOTH;
export const needsLeft = eye => eye === EYE_LEFT || eye === EYE_BOTH;

// The only validation rule: AXIS is required when a selected eye has a CYL.
// Quirk kept: CYL "0.00" (picked explicitly) is a truthy string, so it also
// requires an AXIS; only an untouched (empty) CYL does not.
export const validateRx = f => {
  const e = {};
  if (needsRight(f.eye) && f.cylR && !f.axisR) e.axisR = AXIS_REQUIRED_ERR;
  if (needsLeft(f.eye) && f.cylL && !f.axisL) e.axisL = AXIS_REQUIRED_ERR;
  return e;
};
export const isRxValid = errors => Object.keys(errors).length === 0;

// "Next" from the patient step needs a patient name (silently blocked).
export const patientStepBlocked = (step, f) => step === 0 && !f.patient;

// Patient <select>: ids are compared as numbers.
export const findRxPatient = (patients, rawValue) => patients.find(p => p.id === Number(rawValue));
export const withRxPatient = (v, rawValue, p) => ({ ...v, patientId: Number(rawValue), patient: p && p.name || '' });

// The AXIS column shows a red "*" once a non-zero CYL is chosen.
export const axisStarShown = cyl => cyl && cyl !== '0.00';
// Choosing CYL 0.00 clears that side's AXIS error.
export const clearsAxisError = cyl => cyl === '0.00';

// Which eye the red banner names.
export const axisBannerEye = errors => (errors.axisR && errors.axisL ? 'كلتيهما' : errors.axisR ? 'اليمنى' : 'اليسرى');

// Refraction cards: [label, side, needed].
export const refractionSides = eye => [['اليمنى', 'R', needsRight(eye)], ['اليسرى', 'L', needsLeft(eye)]];
