// Pure logic for VisitForm (src/components/forms/VisitForm.jsx). Every value
// and expression mirrors the legacy runtime's VisitForm exactly
// (public/legacy/app-runtime.js); legacy quirks are kept on purpose.

// Default doctor list used by VisitForm / ExamForm / RxForm when the caller
// passes no doctorNames prop.
export const DEFAULT_DOCTOR_NAMES = ['د. عبدالستار', 'د. سلمى', 'د. ليلى'];
// The blank visit/exam always starts with this doctor, even when it is not in
// doctorNames (the <select> then shows its first option but keeps this value).
export const DEFAULT_DOCTOR = 'د. عبدالستار';

export const VISIT_TYPES = ['فحص روتيني', 'متابعة', 'فحص شبكية', 'قياس نظر', 'استشارة', 'عملية', 'طوارئ'];
export const OTHER_COMPLAINT = 'أخرى...';
export const COMPLAINT_PLACEHOLDER = '— اختر الشكوى —';
export const VISIT_COMPLAINTS = [
  'ضعف النظر', 'التهاب العين', 'تغيير النظارة', 'صعوبة في القراءة', 'صداع', 'ألم في العين', 'عين حمراء',
  'إفرازات من العين', 'رؤية مزدوجة', 'وميض أو بقع سوداء', OTHER_COMPLAINT
];
export const DEFAULT_VISIT_COST = '350';

// Add mode. `today` is localISO(), `defaultClinic` is CLINICS[0].v.
export const blankVisit = (today, defaultClinic) => ({
  date: today,
  type: 'فحص روتيني',
  doctor: DEFAULT_DOCTOR,
  clinic: defaultClinic,
  complaint: '',
  result: '',
  cost: DEFAULT_VISIT_COST,
  paid: false,
  nextVisit: '',
  notes: ''
});

// Edit mode keeps every stored field; a visit saved before clinics existed
// gets the first clinic. No other defaults are filled in.
export const initialVisitState = (initial, today, defaultClinic) =>
  initial ? { clinic: defaultClinic, ...initial } : blankVisit(today, defaultClinic);

// Price-list entry matched to a chosen visit type (first match wins). Quirk
// kept: `type.includes("")` is always true, so a price with an empty/missing
// name matches every type, and substring matches go both ways.
export const matchPriceForType = (prices, type) =>
  prices.find(p => (p.name || '') === type || type.includes(p.name || '') || (p.name || '').includes(type));

// State after choosing a type: the cost follows the matched price, otherwise
// the typed cost is kept.
export const withVisitType = (v, type, matched) => ({ ...v, type, cost: matched ? matched.price : v.cost });

// Type options: the clinic's price list names when it has any, else the fixed list.
export const visitTypeOptions = prices => (prices.length > 0 ? prices.map(p => p.name) : VISIT_TYPES);

// The "reference price" hint under the type select (exact-name match only).
export const referencePriceShown = (prices, type) => prices.length > 0 && prices.find(p => p.name === type);
export const referencePriceText = (prices, type) =>
  Number((prices.find(p => p.name === type) || {}).price || 0).toLocaleString();

// Complaint select handler: "أخرى..." clears the complaint so it can be typed.
export const withComplaintSelect = (v, val) => (val === OTHER_COMPLAINT ? { ...v, complaint: '' } : { ...v, complaint: val });

// The select shows the complaint when it is a known one, otherwise "أخرى..."
// (so an empty complaint also shows "أخرى...", never the placeholder).
export const complaintSelectValue = complaint => (VISIT_COMPLAINTS.includes(complaint) ? complaint : OTHER_COMPLAINT);

// Free-text complaint input: shown for anything that is not one of the fixed
// complaints (including empty).
export const customComplaintShown = complaint =>
  complaint === OTHER_COMPLAINT || !VISIT_COMPLAINTS.includes(complaint) && complaint !== '' || !VISIT_COMPLAINTS.slice(0, -1).includes(complaint);
export const customComplaintValue = complaint => (complaint === OTHER_COMPLAINT ? '' : complaint);

// "✓ <complaint>" badge for a fixed complaint (value kept as the legacy
// short-circuit expression, so falsy complaints render nothing).
export const complaintBadgeShown = complaint =>
  complaint && complaint !== COMPLAINT_PLACEHOLDER && VISIT_COMPLAINTS.slice(0, -1).includes(complaint);

export const togglePaid = v => ({ ...v, paid: !v.paid });

// Save payload (no validation — legacy saves whatever is in the form). The
// cost stays a string as typed; the id is kept in edit mode.
export const buildVisitPayload = (f, patientId, now) => ({ ...f, patientId, id: f.id || now, cost: f.cost });
