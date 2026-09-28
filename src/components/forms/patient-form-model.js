// Pure logic for PatientForm and PatientEditForm
// (src/components/forms/PatientForm.jsx, PatientEditForm.jsx). Every value
// mirrors the legacy runtime's forms exactly (public/legacy/app-runtime.js).

export const GENDERS = ['ذكر', 'أنثى'];
export const BLOOD_TYPES = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];
export const PATIENT_STATUSES = ['مكتمل', 'متابعة', 'طارئ'];

// Tabs of the patient-file edit form.
export const PATIENT_EDIT_TABS = [
  { id: 'basic', label: 'البيانات', icon: '👤' },
  { id: 'medical', label: 'الطبي', icon: '🏥' },
  { id: 'contact', label: 'التواصل', icon: '📞' }
];
export const PATIENT_EDIT_DEFAULT_TAB = 'basic';

// Add mode (Patients screen "+"). `today` is localISO().
export const blankPatient = today => ({
  name: '',
  age: '',
  phone: '',
  gender: 'ذكر',
  bloodType: 'O+',
  address: '',
  lastVisit: today,
  condition: '',
  status: 'مكتمل',
  history: '',
  allergies: '',
  occupation: '',
  emergencyContact: ''
});

// Any `initial` (edit mode, or the "add from search" { name } seed) is used
// as-is, without the blank defaults.
export const initialPatientState = (initial, today) => (initial ? { ...initial } : blankPatient(today));

// Age is stored as a number, or "" when empty/missing ("abc" → NaN is kept).
export const normalizeAge = age => (age === '' || age == null ? '' : Number(age));

// The only rule: a non-empty name (spaces count). Returns the legacy
// short-circuit value, not a boolean.
export const canSavePatient = f => f.name;

export const buildPatientPayload = f => ({ ...f, age: normalizeAge(f.age) });

// PatientEditForm: plain copy of the patient, no validation at all.
export const initialPatientEditState = patient => ({ ...patient });
export const buildPatientEditPayload = f => ({ ...f, age: normalizeAge(f.age) });
