// Pure logic for the patient-facing app (PatientApp + its RatingPrompt).
// No DOM / React / Supabase / localStorage here. The screen component keeps
// every side effect — sbGet/sbSet/sbMutate, the booking-requests insert, the
// 20 s appointment polling, the rating auto-popup timer, alert() — and only
// asks these helpers "which records are mine?", "is the form complete?" and
// "what row do we send?". Every function mirrors the legacy PatientApp() /
// RatingPrompt() expressions exactly (quirks included — see the QUIRK notes).

// normArabic / normPhone are the already-verified exact copies of the legacy
// runtime's helpers (see src/modules/patients/list.js).
import { normArabic, normPhone } from '../patients/list.js';
import { t } from '../i18n/index.js';

export { normArabic, normPhone };

// ---- Constants (exact legacy strings / numbers) ----------------------------

export const DEFAULT_VISIT_TYPE = 'فحص روتيني';
export const POLL_INTERVAL_MS = 20000;
export const RATING_POPUP_DELAY_MS = 1500;
export const RATING_WINDOW_DAYS = 3;
export const RATING_DONE_DELAY_MS = 1800;
export const BOOKING_NOTE_MAX = 300;

export const BOOK_MSG_CLINIC = 'اختر المكان';
export const BOOK_MSG_DATE = 'اختر التاريخ';
export const BOOK_MSG_TIME = 'اختر الوقت';
export const BOOK_MSG_NAME = 'اكتب اسمك';
export const BOOK_MSG_PHONE = 'اكتب رقم هاتفك';
export const BOOK_DUPLICATE_MSG = '⚠ هذا الموعد تم حجزه للتو — اختر وقتاً آخر من فضلك';
export const BOOK_FAILED_MSG = '❌ تعذر إرسال الطلب — تأكد من الاتصال بالإنترنت ثم حاول مرة أخرى';

// Same as the legacy runtime's isActiveApt (also duplicated in
// secretary-app/model.js and dashboard/model.js).
export const isActiveApt = a => !!a && !a.cancelled && a.status !== 'cancelled' && a.waitStatus !== 'cancelled';

// ---- Tabs / initial state --------------------------------------------------

export const initialTab = patient => patient.isGuest ? 'book' : 'home';

export function patientTabs(isGuest) {
  return isGuest ? [{
    id: 'book',
    label: t('g6.pa.tabBook'),
    icon: '➕'
  }] : [{
    id: 'home',
    label: t('g6.pa.tabHome'),
    icon: '🏠'
  }, {
    id: 'book',
    label: t('g6.pa.tabBook'),
    icon: '➕'
  }, {
    id: 'apts',
    label: t('g6.pa.tabApts'),
    icon: '📅'
  }, {
    id: 'rx',
    label: t('g6.pa.tabRx'),
    icon: '💊'
  }, {
    // QUIRK: English label in an otherwise Arabic tab bar (legacy text, kept).
    id: 'exams',
    label: t('g6.pa.tabExams'),
    icon: '🔬'
  }];
}

// The empty booking form (initial state and the "حجز موعد آخر" reset).
//
// FIX (bug found during the PatientApp migration, confirmed pre-existing):
// a registered patient's booking form has no name/phone step (BookingForm only
// shows "بياناتك" for guests), yet bookFormError() requires both — so every
// registered patient's booking used to dead-end on "اكتب اسمك". We now prefill
// newName/newPhone from the patient's own record for non-guests, exactly like
// a guest who had already typed them in. A patient with no phone on file still
// has to be reachable, so an empty stored phone still blocks with "اكتب رقم
// هاتفك" — same message as always, just now correctly gated on missing data
// rather than firing unconditionally.
export function blankBookForm(patient) {
  return {
    clinic: '',
    date: '',
    time: '',
    type: DEFAULT_VISIT_TYPE,
    notes: '',
    isNew: patient.isGuest,
    newName: patient.isGuest ? '' : (patient.name || ''),
    newPhone: patient.isGuest ? '' : (patient.phone || '')
  };
}

// ---- Ownership / filtering -------------------------------------------------

// Is appointment `x` this patient's? Guests (and id-less sessions) never match.
// Records with a patientId match by id only; otherwise normalized name AND
// normalized phone must both match (and the patient must have a phone).
export function isMyApt(patient, x) {
  if (patient.isGuest || patient.id == null) return false;
  if (x.patientId != null) return x.patientId === patient.id;
  return normArabic(x.patient) === normArabic(patient.name) && !!patient.phone && normPhone(x.phone) === normPhone(patient.phone);
}

export const myAppointments = (list, patient) => list.filter(x => isMyApt(patient, x));

// Prescriptions / exams / visits: strict patientId equality.
// QUIRK: for a guest (id null) this keeps every record whose patientId is null;
// they are loaded into state but never shown (guests only get the booking tab).
export const ownRecords = (list, patientId) => list.filter(x => x.patientId === patientId);

// Upcoming: today or later AND not cancelled, sorted by date only.
// QUIRK: same-day appointments are not ordered by time, so "next appointment"
// is whichever same-day record comes first in the stored list.
export const upcomingAppointments = (appointments, today) =>
  appointments.filter(a => a.date >= today && isActiveApt(a)).sort((a, b) => a.date.localeCompare(b.date));

// Past: before today, newest first.
// QUIRK: cancelled appointments are NOT filtered out here (unlike upcoming),
// so they appear under "السابقة" and count in "زيارات سابقة".
export const pastAppointments = (appointments, today) =>
  appointments.filter(a => a.date < today).sort((a, b) => b.date.localeCompare(a.date));

// "موعد قريب" badge: next appointment starts within the next 24 h (0 <= h < 24).
// Returns the legacy `nextApt && (...)` value (undefined when there is none).
export const isAptSoon = (nextApt, now = new Date()) => nextApt && (() => {
  const h = (new Date(nextApt.date + 'T' + (nextApt.time || '00:00')) - now) / (1000 * 3600);
  return h >= 0 && h < 24;
})();

// The first of the patient's visits that is at most 3 days old and not rated.
// QUIRK: "YYYY-MM-DD" parses as UTC midnight, and future-dated visits give a
// negative diff so they also qualify (diff <= 3 has no lower bound).
export function findUnratedVisit(visits, nowMs = Date.now()) {
  return visits.find(x => {
    const d = new Date(x.date);
    const diff = (nowMs - d.getTime()) / (1000 * 3600 * 24);
    return diff <= 3 && !x.rated;
  });
}

// The auto-popup only fires for registered patients.
export const shouldAutoPromptRating = (unrated, patient) => !!(unrated && !patient.isGuest);

// ---- Booking ---------------------------------------------------------------

// First failing check, in the legacy order (clinic → date → time → name →
// phone), or null when the form may be submitted. Name/phone are required for
// everyone, but only guests type them in — for a registered patient they now
// come prefilled from the patient record by blankBookForm() (see the FIX note
// there), so this only blocks a registered patient who has no phone on file.
export function bookFormError(f) {
  // BOOK_MSG_* above stay the canonical Arabic strings; t() returns the same text in Arabic and the translation in English.
  if (!f.clinic) return t('g6.pa.msgClinic');
  if (!f.date) return t('g6.pa.msgDate');
  if (!f.time) return t('g6.pa.msgTime');
  if (!f.newName?.trim()) return t('g6.pa.msgName');
  if (!f.newPhone?.trim()) return t('g6.pa.msgPhone');
  return null;
}

// The iapp_booking_requests row. `clinicCode` is the legacy CLINIC_CODE map
// (clinic display name → table code), passed in so there is one source of truth.
export function buildBookingRow(f, clinicCode) {
  return {
    patient_name: f.newName.trim(),
    phone: normPhone(f.newPhone),
    clinic: clinicCode[f.clinic] || f.clinic,
    date: f.date,
    time: f.time,
    visit_type: f.type || DEFAULT_VISIT_TYPE,
    note: (f.notes || '').slice(0, BOOKING_NOTE_MAX)
  };
}

// Unique-slot violation from the insert → "slot just taken" recovery path.
export const isDuplicateBookingError = error => /duplicate|unique/i.test(error.message || '');

// Duplicate recovery: only the time is cleared.
export const clearBookTime = v => ({
  ...v,
  time: ''
});

// Summary rows on the "تم إرسال طلب الحجز!" card.
export const bookDoneSummary = f => [['📍', f.clinic], ['📅', f.date], ['⏰', f.time], ['🔬', f.type]];

// ---- Ratings ---------------------------------------------------------------

// iapp_visits mutator: set rated on the matching visit only.
export const markVisitRatedIn = (visits, visitId) => visits.map(x => x.id === visitId ? {
  ...x,
  rated: true
} : x);

// The submit button is enabled only once a star is chosen.
export const canSubmitRating = rating => !!rating;

// The row appended to iapp_ratings. `id` (Date.now()) and `date` (localISO())
// come from the caller so this stays pure.
export function buildRatingRecord({ id, patient, visit, rating, comment, date }) {
  return {
    id,
    patientId: patient.id,
    patient: patient.name,
    visitId: visit.id,
    rating,
    comment,
    date
  };
}

// RatingPrompt submit: append to the existing list (legacy pushes in place).
export function appendRating(ratings, record) {
  const list = ratings || [];
  list.push(record);
  return list;
}

export const RATING_STARS = [1, 2, 3, 4, 5];

// ---- Display helpers -------------------------------------------------------

export const headerAvatar = patient => patient.isGuest ? '🆕' : patient.name?.charAt(0);
export const headerName = patient => patient.isGuest ? t('g6.pa.newPatient') : patient.name;
export const headerSub = patient => patient.isGuest ? t('g6.pa.bookFirst') : patient.patientCode;
export const firstName = patient => patient.name?.split(' ')[0];

// Next-appointment card location line: clinic display name, else the doctor.
export const nextAptPlace = (nextApt, clinicDisplay) => clinicDisplay(nextApt.clinic) || nextApt.doctor;

export const clinicWaHref = phone => 'https://wa.me/2' + phone.replace(/^0/, '');

export const rxMedicineLines = medicines => medicines.split('\n').filter(Boolean);

// Exam vitals grid: only the filled values, in legacy order.
export const examVitals = ex =>
  [[t('g6.pa.vaR'), ex.visualAcuityR], [t('g6.pa.vaL'), ex.visualAcuityL], [t('g6.pa.iopR'), ex.iopR], [t('g6.pa.iopL'), ex.iopL]].filter(([, v]) => v);
