import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  DEFAULT_VISIT_TYPE, POLL_INTERVAL_MS, RATING_POPUP_DELAY_MS, RATING_WINDOW_DAYS, RATING_DONE_DELAY_MS, BOOKING_NOTE_MAX,
  BOOK_MSG_CLINIC, BOOK_MSG_DATE, BOOK_MSG_TIME, BOOK_MSG_NAME, BOOK_MSG_PHONE, BOOK_DUPLICATE_MSG, BOOK_FAILED_MSG,
  normArabic, normPhone, isActiveApt,
  initialTab, patientTabs, blankBookForm,
  isMyApt, myAppointments, ownRecords, upcomingAppointments, pastAppointments, isAptSoon,
  findUnratedVisit, shouldAutoPromptRating,
  bookFormError, buildBookingRow, isDuplicateBookingError, clearBookTime, bookDoneSummary,
  markVisitRatedIn, canSubmitRating, buildRatingRecord, appendRating, RATING_STARS,
  headerAvatar, headerName, headerSub, firstName, nextAptPlace, clinicWaHref, rxMedicineLines, examVitals
} from '../src/modules/patient-app/model.js';

// Legacy constants/helpers pulled straight from the runtime so these tests
// fail if the runtime and the module ever drift apart.
const RUNTIME = readFileSync(new URL('../public/legacy/app-runtime.js', import.meta.url), 'utf8');
const grab = re => { const m = RUNTIME.match(re); assert.ok(m, 'legacy source not found: ' + re); return m[0]; };
const legacy = new Function(
  grab(/function normArabic\(s\) \{[\s\S]*?\n\}/) + '\n' +
  grab(/const normPhone = .*;/) + '\n' +
  grab(/const isActiveApt = .*;/) + '\n' +
  grab(/const CLINIC_CODE = \{[\s\S]*?\n\};/) + '\n' +
  grab(/const SHORT_TO_NAME = \{[\s\S]*?\n\};/) + '\n' +
  grab(/const clinicDisplay = .*;/) + '\n' +
  'return { normArabic, normPhone, isActiveApt, CLINIC_CODE, clinicDisplay };'
)();
const { CLINIC_CODE, clinicDisplay } = legacy;

const PATIENT = { id: 501, name: 'أحمد محمود السيد', patientCode: 'P-0501', phone: '01011112222' };
const GUEST = { id: null, name: 'زائر', patientCode: null, isGuest: true };

test('constants mirror the legacy literals', () => {
  assert.equal(DEFAULT_VISIT_TYPE, 'فحص روتيني');
  assert.equal(POLL_INTERVAL_MS, 20000);
  assert.equal(RATING_POPUP_DELAY_MS, 1500);
  assert.equal(RATING_WINDOW_DAYS, 3);
  assert.equal(RATING_DONE_DELAY_MS, 1800);
  assert.equal(BOOKING_NOTE_MAX, 300);
  assert.deepEqual([BOOK_MSG_CLINIC, BOOK_MSG_DATE, BOOK_MSG_TIME, BOOK_MSG_NAME, BOOK_MSG_PHONE],
    ['اختر المكان', 'اختر التاريخ', 'اختر الوقت', 'اكتب اسمك', 'اكتب رقم هاتفك']);
  assert.equal(BOOK_DUPLICATE_MSG, '⚠ هذا الموعد تم حجزه للتو — اختر وقتاً آخر من فضلك');
  assert.equal(BOOK_FAILED_MSG, '❌ تعذر إرسال الطلب — تأكد من الاتصال بالإنترنت ثم حاول مرة أخرى');
  // The messages appear verbatim in the legacy PatientApp.
  for (const m of [BOOK_MSG_CLINIC, BOOK_MSG_DATE, BOOK_MSG_TIME, BOOK_MSG_NAME, BOOK_MSG_PHONE, BOOK_DUPLICATE_MSG, BOOK_FAILED_MSG]) {
    assert.ok(RUNTIME.includes('alert("' + m + '")'), m);
  }
});

test('normArabic / normPhone / isActiveApt behave exactly like the runtime copies', () => {
  const names = ['أحمد', 'احمد', ' إيمان  فاطمة ', 'مُحَمَّد', 'هدى', 'هدي', 'نـــور', 'Ali', null, undefined, '', 'سارة'];
  for (const n of names) assert.equal(normArabic(n), legacy.normArabic(n), String(n));
  const phones = ['01011112222', '+201011112222', '00201011112222', '201011112222', '010-1111 2222', '', null, 12345];
  for (const p of phones) assert.equal(normPhone(p), legacy.normPhone(p), String(p));
  const apts = [null, undefined, {}, { cancelled: true }, { status: 'cancelled' }, { waitStatus: 'cancelled' }, { waitStatus: 'done' }];
  for (const a of apts) assert.equal(isActiveApt(a), legacy.isActiveApt(a));
});

test('initialTab / patientTabs: guest gets only the booking tab', () => {
  assert.equal(initialTab(PATIENT), 'home');
  assert.equal(initialTab(GUEST), 'book');
  assert.deepEqual(patientTabs(true), [{ id: 'book', label: 'احجز', icon: '➕' }]);
  assert.deepEqual(patientTabs(undefined).map(t => t.id), ['home', 'book', 'apts', 'rx', 'exams']);
  assert.deepEqual(patientTabs(false).map(t => t.label), ['الرئيسية', 'احجز', 'مواعيدي', 'روشتاتي', 'My Investigations']);
});

test('blankBookForm: isNew mirrors isGuest (undefined for registered patients)', () => {
  assert.deepEqual(blankBookForm(GUEST), { clinic: '', date: '', time: '', type: 'فحص روتيني', notes: '', isNew: true, newName: '', newPhone: '' });
  const f = blankBookForm(PATIENT);
  assert.equal(f.isNew, undefined);
  assert.ok('isNew' in f);
});

test('isMyApt: guests / id-less sessions never match', () => {
  assert.equal(isMyApt(GUEST, { patientId: null, patient: 'زائر' }), false);
  assert.equal(isMyApt({ ...PATIENT, isGuest: true }, { patientId: 501 }), false);
  assert.equal(isMyApt({ ...PATIENT, id: null }, { patientId: null, patient: PATIENT.name, phone: PATIENT.phone }), false);
  assert.equal(isMyApt({ ...PATIENT, id: undefined }, { patient: PATIENT.name, phone: PATIENT.phone }), false);
});

test('isMyApt: id match wins whenever the record has a patientId', () => {
  assert.equal(isMyApt(PATIENT, { patientId: 501 }), true);
  assert.equal(isMyApt(PATIENT, { patientId: '501' }), false, 'strict equality');
  // Same name + phone but a different patientId → not mine (no fallback).
  assert.equal(isMyApt(PATIENT, { patientId: 777, patient: PATIENT.name, phone: PATIENT.phone }), false);
  assert.equal(isMyApt({ ...PATIENT, id: 0 }, { patientId: 0 }), true, 'id 0 is a real id');
});

test('isMyApt: name + phone fallback (normalized) when the record has no patientId', () => {
  assert.equal(isMyApt(PATIENT, { patient: 'احمد محمود السيد', phone: '+20 101 111 2222' }), true);
  assert.equal(isMyApt(PATIENT, { patientId: null, patient: ' أحمد  محمود السيد ', phone: '00201011112222' }), true);
  assert.equal(isMyApt(PATIENT, { patient: PATIENT.name, phone: '01099999999' }), false);
  assert.equal(isMyApt(PATIENT, { patient: 'محمد', phone: PATIENT.phone }), false);
  // Patient without a phone never matches by name.
  assert.equal(isMyApt({ ...PATIENT, phone: '' }, { patient: PATIENT.name, phone: '' }), false);
});

test('myAppointments / ownRecords', () => {
  const list = [{ id: 1, patientId: 501 }, { id: 2, patientId: 9 }, { id: 3, patient: PATIENT.name, phone: PATIENT.phone }];
  assert.deepEqual(myAppointments(list, PATIENT).map(a => a.id), [1, 3]);
  assert.deepEqual(myAppointments(list, GUEST), []);
  const rx = [{ id: 1, patientId: 501 }, { id: 2, patientId: null }, { id: 3 }, { id: 4, patientId: '501' }];
  assert.deepEqual(ownRecords(rx, 501).map(r => r.id), [1]);
  // Guest quirk: patientId === null records are kept (never displayed).
  assert.deepEqual(ownRecords(rx, null).map(r => r.id), [2]);
});

const TODAY = '2026-09-28';
const APTS = [
  { id: 1, date: '2026-10-05', time: '10:00' },
  { id: 2, date: '2026-09-28', time: '20:00' },
  { id: 3, date: '2026-09-28', time: '09:00' },
  { id: 4, date: '2026-09-30', cancelled: true },
  { id: 5, date: '2026-09-29', status: 'cancelled' },
  { id: 6, date: '2026-09-27', time: '11:00' },
  { id: 7, date: '2026-08-01', cancelled: true },
  { id: 8, date: '2026-09-01' },
  { id: 9, date: '2026-09-29', waitStatus: 'cancelled' }
];

test('upcomingAppointments: today or later, active only, date-sorted (stable within a day)', () => {
  assert.deepEqual(upcomingAppointments(APTS, TODAY).map(a => a.id), [2, 3, 1]);
});

test('pastAppointments: before today, newest first, cancelled included', () => {
  assert.deepEqual(pastAppointments(APTS, TODAY).map(a => a.id), [6, 8, 7]);
  assert.deepEqual(pastAppointments([{ id: 1 }], TODAY), [], 'missing date is neither past nor upcoming');
  assert.deepEqual(upcomingAppointments([{ id: 1 }], TODAY), []);
});

test('isAptSoon: 0 <= hours < 24 from now, local time, time defaults to 00:00', () => {
  const now = new Date(2026, 8, 28, 12, 0, 0);
  assert.equal(isAptSoon(undefined, now), undefined);
  assert.equal(isAptSoon({ date: '2026-09-28', time: '12:00' }, now), true, 'exactly now');
  assert.equal(isAptSoon({ date: '2026-09-28', time: '11:59' }, now), false, 'already started');
  assert.equal(isAptSoon({ date: '2026-09-29', time: '11:59' }, now), true);
  assert.equal(isAptSoon({ date: '2026-09-29', time: '12:00' }, now), false, '24 h is not soon');
  assert.equal(isAptSoon({ date: '2026-09-29' }, now), true, 'midnight tomorrow');
  assert.equal(isAptSoon({ date: '2026-09-29', time: '' }, now), true);
  assert.equal(isAptSoon({ date: '2026-10-05', time: '10:00' }, now), false);
  assert.equal(isAptSoon({ date: 'bad', time: '10:00' }, now), false, 'invalid date → NaN → false');
});

test('findUnratedVisit: first visit ≤ 3 days old and not rated', () => {
  const now = Date.parse('2026-09-28T12:00:00Z');
  const visits = [
    { id: 1, date: '2026-09-24' }, // 4.5 days
    { id: 2, date: '2026-09-26', rated: true },
    { id: 3, date: '2026-09-26' }, // 2.5 days
    { id: 4, date: '2026-09-27' }
  ];
  assert.equal(findUnratedVisit(visits, now).id, 3);
  assert.equal(findUnratedVisit([{ id: 1, date: '2026-09-25T12:00:00Z' }], now).id, 1, 'exactly 3 days qualifies');
  assert.equal(findUnratedVisit([{ id: 1, date: '2026-09-25T11:59:59Z' }], now), undefined, 'just over 3 days');
  assert.equal(findUnratedVisit([{ id: 1, date: '2026-09-24' }], now), undefined);
  assert.equal(findUnratedVisit([{ id: 1, date: '2026-09-27', rated: true }], now), undefined);
  assert.equal(findUnratedVisit([{ id: 1, date: '2026-10-20' }], now).id, 1, 'QUIRK: future visits qualify');
  assert.equal(findUnratedVisit([{ id: 1, date: '' }, { id: 2 }], now), undefined, 'invalid dates never qualify');
  assert.equal(findUnratedVisit([], now), undefined);
});

test('shouldAutoPromptRating: suppressed for guests and when nothing is due', () => {
  assert.equal(shouldAutoPromptRating({ id: 1 }, PATIENT), true);
  assert.equal(shouldAutoPromptRating({ id: 1 }, GUEST), false);
  assert.equal(shouldAutoPromptRating(undefined, PATIENT), false);
});

test('bookFormError: clinic → date → time → name → phone', () => {
  const full = { clinic: 'عيادة دمنهور', date: '2026-10-01', time: '20:00', newName: 'منى', newPhone: '0100' };
  assert.equal(bookFormError({}), 'اختر المكان');
  assert.equal(bookFormError({ ...full, clinic: '', date: '' }), 'اختر المكان');
  assert.equal(bookFormError({ clinic: full.clinic }), 'اختر التاريخ');
  assert.equal(bookFormError({ clinic: full.clinic, date: full.date }), 'اختر الوقت');
  assert.equal(bookFormError({ clinic: full.clinic, date: full.date, time: full.time }), 'اكتب اسمك');
  assert.equal(bookFormError({ ...full, newName: '   ' }), 'اكتب اسمك');
  assert.equal(bookFormError({ ...full, newPhone: undefined }), 'اكتب رقم هاتفك');
  assert.equal(bookFormError({ ...full, newPhone: ' ' }), 'اكتب رقم هاتفك');
  assert.equal(bookFormError(full), null);
  // QUIRK: a registered patient's blank form stops at the name check.
  assert.equal(bookFormError({ ...blankBookForm(PATIENT), clinic: full.clinic, date: full.date, time: full.time }), 'اكتب اسمك');
});

test('buildBookingRow: exact payload shape', () => {
  const f = { clinic: 'عيادة دمنهور', date: '2026-10-01', time: '20:00', type: 'متابعة', notes: 'x'.repeat(350), newName: '  منى حسن ', newPhone: '+20 100 123 4567' };
  const row = buildBookingRow(f, CLINIC_CODE);
  assert.deepEqual(Object.keys(row), ['patient_name', 'phone', 'clinic', 'date', 'time', 'visit_type', 'note']);
  assert.deepEqual(row, { patient_name: 'منى حسن', phone: '01001234567', clinic: 'دمنهور', date: '2026-10-01', time: '20:00', visit_type: 'متابعة', note: 'x'.repeat(300) });
  assert.equal(buildBookingRow({ ...f, clinic: 'عيادة الرحمانية' }, CLINIC_CODE).clinic, 'الرحمانية');
  assert.equal(buildBookingRow({ ...f, clinic: 'مركز دمنهور للعيون' }, CLINIC_CODE).clinic, 'مركز دمنهور للعيون');
  assert.equal(buildBookingRow({ ...f, clinic: 'عيادة أخرى' }, CLINIC_CODE).clinic, 'عيادة أخرى', 'unknown clinic passes through');
  const r2 = buildBookingRow({ ...f, type: '', notes: undefined }, CLINIC_CODE);
  assert.equal(r2.visit_type, 'فحص روتيني');
  assert.equal(r2.note, '');
});

test('isDuplicateBookingError: /duplicate|unique/i on error.message', () => {
  assert.equal(isDuplicateBookingError({ message: 'duplicate key value violates unique constraint "x"' }), true);
  assert.equal(isDuplicateBookingError({ message: 'UNIQUE violation' }), true);
  assert.equal(isDuplicateBookingError({ message: 'Duplicate' }), true);
  assert.equal(isDuplicateBookingError({ message: 'permission denied' }), false);
  assert.equal(isDuplicateBookingError({ code: '23505' }), false, 'code alone is not checked');
  assert.equal(isDuplicateBookingError({ message: null }), false);
});

test('clearBookTime only clears the time', () => {
  const f = { clinic: 'c', date: 'd', time: 't', newName: 'n' };
  assert.deepEqual(clearBookTime(f), { clinic: 'c', date: 'd', time: '', newName: 'n' });
  assert.equal(f.time, 't', 'no mutation');
});

test('bookDoneSummary rows', () => {
  assert.deepEqual(bookDoneSummary({ clinic: 'c', date: 'd', time: 't', type: 'y' }), [['📍', 'c'], ['📅', 'd'], ['⏰', 't'], ['🔬', 'y']]);
});

test('markVisitRatedIn: rated:true on the matching id only', () => {
  const v = [{ id: 1, date: 'a' }, { id: 2, date: 'b', rated: false }, { id: '2' }];
  const out = markVisitRatedIn(v, 2);
  assert.deepEqual(out, [{ id: 1, date: 'a' }, { id: 2, date: 'b', rated: true }, { id: '2' }]);
  assert.equal(out[0], v[0], 'untouched rows keep identity');
  assert.equal(v[1].rated, false, 'no mutation');
});

test('RatingPrompt helpers', () => {
  assert.deepEqual(RATING_STARS, [1, 2, 3, 4, 5]);
  assert.equal(canSubmitRating(0), false);
  assert.equal(canSubmitRating(1), true);
  assert.equal(canSubmitRating(5), true);
  const rec = buildRatingRecord({ id: 123, patient: PATIENT, visit: { id: 9, date: 'x' }, rating: 4, comment: 'جيد', date: '2026-09-28' });
  assert.deepEqual(rec, { id: 123, patientId: 501, patient: 'أحمد محمود السيد', visitId: 9, rating: 4, comment: 'جيد', date: '2026-09-28' });
  assert.deepEqual(Object.keys(rec), ['id', 'patientId', 'patient', 'visitId', 'rating', 'comment', 'date']);
  const existing = [{ id: 1 }];
  const out = appendRating(existing, rec);
  assert.equal(out, existing, 'appends in place like the legacy push');
  assert.deepEqual(out, [{ id: 1 }, rec]);
  assert.deepEqual(appendRating(null, rec), [rec]);
});

test('header / display helpers', () => {
  assert.equal(headerAvatar(GUEST), '🆕');
  assert.equal(headerAvatar(PATIENT), 'أ');
  assert.equal(headerAvatar({ name: undefined }), undefined);
  assert.equal(headerName(GUEST), 'مريض جديد');
  assert.equal(headerName(PATIENT), PATIENT.name);
  assert.equal(headerSub(GUEST), 'احجز موعدك الأول');
  assert.equal(headerSub(PATIENT), 'P-0501');
  assert.equal(firstName(PATIENT), 'أحمد');
  assert.equal(firstName({}), undefined);
  assert.equal(nextAptPlace({ clinic: 'دمنهور', doctor: 'د. س' }, clinicDisplay), 'عيادة دمنهور');
  assert.equal(nextAptPlace({ clinic: 'أخرى', doctor: 'د. س' }, clinicDisplay), 'أخرى');
  assert.equal(nextAptPlace({ clinic: '', doctor: 'د. س' }, clinicDisplay), 'د. س');
  assert.equal(nextAptPlace({}, clinicDisplay), undefined);
  assert.equal(clinicWaHref('0453333313'), 'https://wa.me/2453333313');
  assert.equal(clinicWaHref('01111480137'), 'https://wa.me/21111480137');
  assert.deepEqual(rxMedicineLines('A 3x1\n\nB 4x1\n'), ['A 3x1', 'B 4x1']);
  assert.deepEqual(examVitals({ visualAcuityR: '6/12', iopR: '16', iopL: 0, visualAcuityL: '' }), [['حدة الإبصار يمنى', '6/12'], ['ضغط العين يمنى', '16']]);
  assert.deepEqual(examVitals({}), []);
});
