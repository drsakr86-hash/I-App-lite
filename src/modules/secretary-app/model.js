// Pure logic for the Secretary front-desk app (no DOM / React / Supabase /
// localStorage). The screen component keeps every side effect — sbGet/sbMutate,
// the booking-requests table, the realtime channel + 5 s polling, logAudit,
// alert/confirm, toasts — and only asks these helpers "which appointments are
// shown?", "is this slot taken?" and "what should the new record look like?".
// Every function mirrors the legacy SecretaryApp() expressions exactly.

// ---- Constants (exact legacy strings) --------------------------------------

export const DEFAULT_VISIT_TYPE = 'فحص روتيني';
// Booking requests accepted from the front desk are always assigned to this doctor.
export const REQUEST_DOCTOR = 'د. عبدالستار';
export const REQUEST_CONFLICT_MSG = '⚠ يوجد موعد آخر لنفس الطبيب في هذا الوقت';
export const SLOT_TAKEN_MSG = '⚠ تم حجز نفس الموعد لنفس الطبيب للتو من جهاز آخر';
export const SAVE_FAILED_MSG = '❌ لم يتم الحفظ — تحقق من الاتصال وحاول مرة أخرى';
export const STATS_VISIT_TYPES = ['فحص روتيني', 'متابعة', 'استشارة', 'قياس نظر', 'فحص شبكية', 'عملية'];

// Same as the legacy runtime's isActiveApt.
export const isActiveApt = a => !!a && !a.cancelled && a.status !== 'cancelled' && a.waitStatus !== 'cancelled';

// ---- Conflict detection ----------------------------------------------------

// Double-booking: another active appointment (different id) for the same
// doctor on the same date at the same time.
export const aptConflict = (list, f) =>
  list.some(a => a.id !== f.id && isActiveApt(a) && a.doctor === f.doctor && a.date === f.date && a.time === f.time);

// The alert text mutateApts shows for a failed save.
export const mutateErrorMessage = error =>
  error === 'offline' || error === 'conflict' ? SAVE_FAILED_MSG : error;

// ---- List transforms used as sbMutate mutators -----------------------------

// addApt mutator: abort on conflict, else append.
export const addAptMutation = (list, f) => aptConflict(list, f) ? { abort: SLOT_TAKEN_MSG } : [...list, f];

// editApt mutator: abort on conflict, else replace by id.
export const editAptMutation = (list, f) => aptConflict(list, f) ? { abort: SLOT_TAKEN_MSG } : list.map(a => a.id === f.id ? f : a);

// acceptRequest mutator: abort on conflict (different message), else append.
export const acceptAptMutation = (list, apt) => aptConflict(list, apt) ? { abort: REQUEST_CONFLICT_MSG } : [...list, apt];

// updateApt mutator: merge into the existing row, or append if missing.
export const mergeApt = (list, apt) =>
  list.some(a => a.id === apt.id) ? list.map(a => a.id === apt.id ? { ...a, ...apt } : a) : [...list, apt];

export const markRemindedIn = (list, id, dateISO) => list.map(x => x.id === id ? { ...x, reminded: dateISO } : x);

export const withoutAptId = (list, id) => list.filter(x => x.id !== id);

// ---- Record builders -------------------------------------------------------

// The appointment created when a patient booking request is accepted.
// `id` comes from the legacy newId() (kept outside so this stays pure).
export function buildAcceptedAppointment(r, id, doctor = REQUEST_DOCTOR) {
  return {
    id,
    patientId: null,
    patient: r.patient_name,
    phone: r.phone || '',
    date: r.date,
    time: r.time,
    type: r.visit_type || DEFAULT_VISIT_TYPE,
    notes: r.note || '',
    doctor,
    clinic: r.clinic,
    confirmed: true,
    fromPatient: true
  };
}

export const requestAuditDetail = r => r.patient_name + ' · ' + r.date + ' ' + r.time;

export const collectionVisitId = apt => 'apt-' + apt.id;

// The iapp_visits row written when the front desk records a payment (تحصيل).
// `clinicLabel` is the legacy helper, passed in so the label stays identical.
export function buildCollectionVisitRecord(apt, cost, paid, clinicLabel) {
  return {
    id: collectionVisitId(apt),
    patientId: apt.patientId || null,
    patient: apt.patient,
    date: apt.date,
    type: apt.type || DEFAULT_VISIT_TYPE,
    doctor: apt.doctor || '',
    clinic: apt.clinic || '',
    complaint: '',
    result: '',
    cost: String(cost || 0),
    paid: !!paid,
    nextVisit: '',
    notes: 'تحصيل من السكرتارية · ' + clinicLabel(apt.clinic)
  };
}

// iapp_visits mutator: replace the row with the same id, or append.
export const upsertVisit = (visits, rec) =>
  visits.some(v => v.id === rec.id) ? visits.map(v => v.id === rec.id ? rec : v) : [...visits, rec];

export const collectAudit = (apt, cost, paid) => [
  paid ? 'تحصيل مبلغ' : 'تسجيل قيمة كشف',
  (apt.patient || '') + ' · ' + cost + ' ج.م'
];

export const collectToast = (cost, paid) => paid ? '✓ تم تحصيل ' + cost + ' ج.م' : 'تم حفظ قيمة الكشف';

// Detail string for the "حذف موعد" audit entry (legacy precedence preserved).
export const deleteAuditDetail = (rec, id) => rec && rec.date + ' ' + (rec.time || '') + ' · ' + (rec.patient || '') || id;

// ---- Counts, filters, stats ------------------------------------------------

export const countPendingFromPatient = apts => apts.filter(a => a.fromPatient && !a.confirmed).length;

export const countWaitingToday = (apts, today) => apts.filter(a => a.date === today && a.waitStatus === 'waiting').length;

export const countToday = (apts, today) => apts.filter(a => a.date === today).length;

export const countConfirmed = list => list.filter(a => a.confirmed).length;

// The appointments list: date / name search / patient-request / clinic filters,
// sorted by date then time.
export function filterSecretaryApts(apts, { filterDate, search, filterFromPatient, filterClinic }) {
  return apts.filter(a => {
    const dateOk = filterDate ? a.date === filterDate : true;
    const searchOk = search ? a.patient?.includes(search) : true;
    const fromOk = filterFromPatient ? a.fromPatient : true;
    const clinicOk = filterClinic ? a.clinic === filterClinic : true;
    return dateOk && searchOk && fromOk && clinicOk;
  }).sort((a, b) => a.date.localeCompare(b.date) || (a.time || '').localeCompare(b.time || ''));
}

// Doctors booked today (order of first appearance) — WaitingRoom doctorNames.
export const todayDoctorNames = (apts, today) => [...new Set(apts.filter(a => a.date === today && a.doctor).map(a => a.doctor))];

export const collectedToday = (apts, today) => apts.filter(a => a.date === today && a.paid).reduce((s, a) => s + Number(a.cost || 0), 0);

export const unpaidTodayCount = (apts, today) => apts.filter(a => a.date === today && !a.paid && a.cost).length;

// Per-clinic rows for the stats tab; clinics with no appointments are null
// (the legacy map returns null for them, rendering nothing).
export function clinicStats(apts, clinics, today) {
  return clinics.map(c => {
    const cnt = apts.filter(a => a.clinic === c).length;
    const todayCnt = apts.filter(a => a.clinic === c && a.date === today).length;
    if (!cnt && !todayCnt) return null;
    return { clinic: c, cnt, todayCnt, width: cnt / Math.max(apts.length, 1) * 100 + '%' };
  });
}

export function typeStats(apts, types = STATS_VISIT_TYPES) {
  return types.map(t => {
    const cnt = apts.filter(a => a.type === t).length;
    if (!cnt) return null;
    return { type: t, cnt };
  });
}

export const requestsTabLabel = n => 'طلبات الحجز' + (n ? ' (' + n + ')' : '');

// WhatsApp link on each appointment card.
export const waCardHref = (a, clinicLabel) =>
  'https://wa.me/2' + a.phone.replace(/^0/, '') + '?text=' + encodeURIComponent('تذكير بموعدك في ' + clinicLabel(a.clinic) + ' يوم ' + a.date + ' الساعة ' + a.time);
