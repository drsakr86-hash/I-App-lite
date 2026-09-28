// Pure logic for ExamForm (src/components/forms/ExamForm.jsx). Every value
// and expression mirrors the legacy runtime's ExamForm exactly
// (public/legacy/app-runtime.js); legacy quirks are kept on purpose.
import { DEFAULT_DOCTOR, OTHER_COMPLAINT } from './visit-form-model.js';

export const EXAM_STEPS = ['البيانات', 'الفحص السريري', 'التشخيص والعلاج'];
export const EXAM_LAST_STEP = EXAM_STEPS.length - 1;
export const EXAM_COMPLAINTS = [
  'ضعف النظر', 'التهاب العين', 'صداع', 'تغيير النظارة', 'صعوبة في القراءة', 'مياه بيضاء', 'شبورة بالعين',
  'ألم في العين', 'عين حمراء', 'إفرازات من العين', 'رؤية مزدوجة', 'وميض أو بقع سوداء', OTHER_COMPLAINT
];
export const VA_OPTIONS = ['1.00', '0.9', '0.8', '0.7', '0.6', '0.5', '0.4', '0.3', '0.2', '0.1', 'CF', 'HM', 'PL', 'NPL'];
// IOP select: "10" … "30" mmHg.
export const IOP_OPTIONS = Array.from({ length: 21 }, (_, i) => String(i + 10));
// IOP above this (mmHg) is flagged "⚠ مرتفع".
export const IOP_HIGH_LIMIT = 21;
// The three small selects at the end of the clinical step: [label, key, options].
export const EXAM_SELECT_ROWS = [
  ['رؤية الألوان', 'colorVision', ['طبيعي', 'غير طبيعي']],
  ['Cover Test', 'coverTest', ['طبيعي', 'إيجابي']],
  ['Contrast', 'contrast', ['طبيعي', 'منخفض']]
];

export const blankExam = today => ({
  date: today,
  doctor: DEFAULT_DOCTOR,
  chiefComplaint: '',
  visualAcuityR: '',
  visualAcuityL: '',
  iopR: '',
  iopL: '',
  colorVision: 'طبيعي',
  contrast: 'طبيعي',
  coverTest: 'طبيعي',
  anteriorSegment: '',
  posteriorSegment: '',
  diagnosis: '',
  treatmentPlan: '',
  followUp: '',
  notes: ''
});

// Edit mode is a plain copy of the stored exam (no defaults filled in).
export const initialExamState = (initial, today) => (initial ? { ...initial } : blankExam(today));

export const chiefComplaintSelectValue = c => (EXAM_COMPLAINTS.includes(c) ? c : OTHER_COMPLAINT);
// "أخرى..." clears the complaint so it can be typed in the free-text input.
export const withChiefComplaintSelect = (fv, v) => (v !== OTHER_COMPLAINT ? { ...fv, chiefComplaint: v } : { ...fv, chiefComplaint: '' });
export const chiefComplaintInputShown = c => !EXAM_COMPLAINTS.slice(0, -1).includes(c) || c === '';
// Value kept as the legacy short-circuit expression.
export const chiefComplaintBadgeShown = c => EXAM_COMPLAINTS.slice(0, -1).includes(c) && c;

export const isIopHigh = v => Number(v) > IOP_HIGH_LIMIT;
export const anyIopHigh = (r, l) => isIopHigh(r) || isIopHigh(l);

// Step navigation (tabs are freely clickable; buttons move one step).
export const prevStep = p => p - 1;
export const nextStep = p => p + 1;

// Save payload (no validation — every field is optional).
export const buildExamPayload = (f, patientId, now) => ({ ...f, patientId, id: f.id || now });
