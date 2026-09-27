import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_VISIT_TYPE, REQUEST_DOCTOR, REQUEST_CONFLICT_MSG, SLOT_TAKEN_MSG, SAVE_FAILED_MSG, STATS_VISIT_TYPES,
  isActiveApt, aptConflict, mutateErrorMessage,
  addAptMutation, editAptMutation, acceptAptMutation, mergeApt, markRemindedIn, withoutAptId,
  buildAcceptedAppointment, requestAuditDetail, collectionVisitId, buildCollectionVisitRecord, upsertVisit,
  collectAudit, collectToast, deleteAuditDetail,
  countPendingFromPatient, countWaitingToday, countToday, countConfirmed, filterSecretaryApts,
  todayDoctorNames, collectedToday, unpaidTodayCount, clinicStats, typeStats, requestsTabLabel, waCardHref
} from '../src/modules/secretary-app/model.js';

// Same shape as the legacy runtime's clinicLabel (CLINICS lookup, falls back to the value / "—").
const CLINICS = [{ v: 'دمنهور', l: 'عيادة دمنهور' }, { v: 'الرحمانية', l: 'عيادة الرحمانية' }];
const clinicLabel = v => (CLINICS.find(c => c.v === v) || {}).l || v || '—';
const CLINICS_LIST = ['دمنهور', 'الرحمانية', 'مركز دمنهور للعيون'];

const TODAY = '2026-09-27';
const apts = [
  { id: 1, patient: 'أحمد علي', date: TODAY, time: '10:00', doctor: 'د. عبدالستار', clinic: 'دمنهور', type: 'متابعة', confirmed: true, paid: true, cost: '300', waitStatus: 'waiting' },
  { id: 2, patient: 'منى حسن', date: TODAY, time: '09:30', doctor: 'د. عبدالستار', clinic: 'الرحمانية', type: 'فحص روتيني', fromPatient: true, cost: '200' },
  { id: 3, patient: 'سعيد', date: '2026-09-28', time: '11:00', doctor: 'د. سمير', clinic: 'دمنهور', type: 'متابعة', confirmed: true },
  { id: 4, patient: 'هدى', date: TODAY, time: '12:00', doctor: 'د. سمير', clinic: 'دمنهور', type: 'عملية', paid: true, cost: 1500, cancelled: true },
  { id: 5, patient: 'أحمد سمير', date: '2026-09-26', clinic: 'دمنهور', type: 'استشارة', fromPatient: true, confirmed: true }
];

test('isActiveApt matches the legacy definition', () => {
  assert.equal(isActiveApt(null), false);
  assert.equal(isActiveApt({}), true);
  assert.equal(isActiveApt({ cancelled: true }), false);
  assert.equal(isActiveApt({ status: 'cancelled' }), false);
  assert.equal(isActiveApt({ waitStatus: 'cancelled' }), false);
  assert.equal(isActiveApt({ waitStatus: 'done' }), true);
});

test('aptConflict: same doctor/date/time on another active appointment', () => {
  const f = { id: 99, doctor: 'د. عبدالستار', date: TODAY, time: '10:00' };
  assert.equal(aptConflict(apts, f), true);
  assert.equal(aptConflict(apts, { ...f, id: 1 }), false, 'editing the same appointment is not a conflict');
  assert.equal(aptConflict(apts, { ...f, time: '10:15' }), false);
  assert.equal(aptConflict(apts, { ...f, doctor: 'د. سمير' }), false);
  // id 4 is cancelled — its slot is free.
  assert.equal(aptConflict(apts, { id: 100, doctor: 'د. سمير', date: TODAY, time: '12:00' }), false);
  assert.equal(aptConflict([], f), false);
});

test('mutation helpers abort with the exact legacy messages', () => {
  const clash = { id: 99, doctor: 'د. عبدالستار', date: TODAY, time: '10:00' };
  assert.deepEqual(addAptMutation(apts, clash), { abort: SLOT_TAKEN_MSG });
  assert.deepEqual(editAptMutation(apts, clash), { abort: SLOT_TAKEN_MSG });
  assert.deepEqual(acceptAptMutation(apts, clash), { abort: REQUEST_CONFLICT_MSG });
  assert.equal(SLOT_TAKEN_MSG, '⚠ تم حجز نفس الموعد لنفس الطبيب للتو من جهاز آخر');
  assert.equal(REQUEST_CONFLICT_MSG, '⚠ يوجد موعد آخر لنفس الطبيب في هذا الوقت');
  const free = { ...clash, time: '15:00' };
  assert.deepEqual(addAptMutation(apts, free), [...apts, free]);
  assert.deepEqual(acceptAptMutation(apts, free), [...apts, free]);
  const edited = { ...apts[2], time: '11:30' };
  const out = editAptMutation(apts, edited);
  assert.equal(out[2], edited);
  assert.equal(out.length, apts.length);
});

test('mutateErrorMessage: offline/conflict -> generic alert, else raw', () => {
  assert.equal(mutateErrorMessage('offline'), SAVE_FAILED_MSG);
  assert.equal(mutateErrorMessage('conflict'), SAVE_FAILED_MSG);
  assert.equal(mutateErrorMessage(SLOT_TAKEN_MSG), SLOT_TAKEN_MSG);
  assert.equal(SAVE_FAILED_MSG, '❌ لم يتم الحفظ — تحقق من الاتصال وحاول مرة أخرى');
});

test('mergeApt merges into existing row or appends; markRemindedIn / withoutAptId', () => {
  const merged = mergeApt(apts, { id: 2, paid: true, cost: '250' });
  assert.deepEqual(merged[1], { ...apts[1], paid: true, cost: '250' });
  assert.equal(merged[0], apts[0]);
  const appended = mergeApt(apts, { id: 77, patient: 'x' });
  assert.equal(appended.length, apts.length + 1);
  assert.deepEqual(appended.at(-1), { id: 77, patient: 'x' });
  assert.equal(markRemindedIn(apts, 3, TODAY)[2].reminded, TODAY);
  assert.equal(markRemindedIn(apts, 3, TODAY)[0], apts[0]);
  assert.deepEqual(withoutAptId(apts, 3).map(a => a.id), [1, 2, 4, 5]);
});

test('buildAcceptedAppointment maps a booking request exactly', () => {
  const r = { id: 'r1', patient_name: 'فاطمة', phone: '01000000000', date: TODAY, time: '13:00', visit_type: 'استشارة', note: 'ألم', clinic: 'دمنهور' };
  assert.deepEqual(buildAcceptedAppointment(r, 555), {
    id: 555, patientId: null, patient: 'فاطمة', phone: '01000000000', date: TODAY, time: '13:00',
    type: 'استشارة', notes: 'ألم', doctor: 'د. عبدالستار', clinic: 'دمنهور', confirmed: true, fromPatient: true
  });
  const bare = buildAcceptedAppointment({ patient_name: 'ب', date: TODAY, time: '14:00', clinic: 'الرحمانية' }, 7);
  assert.equal(bare.phone, '');
  assert.equal(bare.notes, '');
  assert.equal(bare.type, DEFAULT_VISIT_TYPE);
  assert.equal(bare.doctor, REQUEST_DOCTOR);
  assert.deepEqual(Object.keys(bare), ['id', 'patientId', 'patient', 'phone', 'date', 'time', 'type', 'notes', 'doctor', 'clinic', 'confirmed', 'fromPatient']);
  assert.equal(requestAuditDetail(r), 'فاطمة · 2026-09-27 13:00');
});

test('buildCollectionVisitRecord: exact iapp_visits row for a payment', () => {
  const apt = { id: 42, patientId: 'p9', patient: 'أحمد', date: TODAY, type: 'متابعة', doctor: 'د. عبدالستار', clinic: 'دمنهور' };
  assert.equal(collectionVisitId(apt), 'apt-42');
  assert.deepEqual(buildCollectionVisitRecord(apt, 300, true, clinicLabel), {
    id: 'apt-42', patientId: 'p9', patient: 'أحمد', date: TODAY, type: 'متابعة', doctor: 'د. عبدالستار', clinic: 'دمنهور',
    complaint: '', result: '', cost: '300', paid: true, nextVisit: '', notes: 'تحصيل من السكرتارية · عيادة دمنهور'
  });
  const bare = buildCollectionVisitRecord({ id: 1, patient: 'x', date: TODAY }, '', 0, clinicLabel);
  assert.equal(bare.patientId, null);
  assert.equal(bare.type, DEFAULT_VISIT_TYPE);
  assert.equal(bare.doctor, '');
  assert.equal(bare.clinic, '');
  assert.equal(bare.cost, '0');
  assert.equal(bare.paid, false);
  assert.equal(bare.notes, 'تحصيل من السكرتارية · —');
});

test('upsertVisit replaces by id or appends', () => {
  const visits = [{ id: 'apt-1', cost: '100' }, { id: 'v2' }];
  const rec = { id: 'apt-1', cost: '200' };
  assert.deepEqual(upsertVisit(visits, rec), [rec, { id: 'v2' }]);
  assert.deepEqual(upsertVisit([{ id: 'v2' }], rec), [{ id: 'v2' }, rec]);
});

test('collect audit / toast and delete audit strings', () => {
  assert.deepEqual(collectAudit({ patient: 'أحمد' }, '300', true), ['تحصيل مبلغ', 'أحمد · 300 ج.م']);
  assert.deepEqual(collectAudit({}, '300', false), ['تسجيل قيمة كشف', ' · 300 ج.م']);
  assert.equal(collectToast('300', true), '✓ تم تحصيل 300 ج.م');
  assert.equal(collectToast('300', false), 'تم حفظ قيمة الكشف');
  assert.equal(deleteAuditDetail({ date: TODAY, time: '10:00', patient: 'أ' }, 1), '2026-09-27 10:00 · أ');
  assert.equal(deleteAuditDetail({ date: TODAY }, 1), '2026-09-27  · ');
  assert.equal(deleteAuditDetail(undefined, 9), 9);
});

test('counts', () => {
  assert.equal(countPendingFromPatient(apts), 1);
  assert.equal(countWaitingToday(apts, TODAY), 1);
  assert.equal(countToday(apts, TODAY), 3);
  assert.equal(countConfirmed(apts), 3);
});

test('filterSecretaryApts: date / search / fromPatient / clinic, sorted by date then time', () => {
  const f = o => filterSecretaryApts(apts, { filterDate: '', search: '', filterFromPatient: false, filterClinic: '', ...o }).map(a => a.id);
  assert.deepEqual(f({ filterDate: TODAY }), [2, 1, 4]);
  assert.deepEqual(f({}), [5, 2, 1, 4, 3]);
  assert.deepEqual(f({ search: 'أحمد' }), [5, 1]);
  assert.deepEqual(f({ filterFromPatient: true }), [5, 2]);
  assert.deepEqual(f({ filterClinic: 'الرحمانية' }), [2]);
  assert.deepEqual(f({ filterDate: TODAY, filterClinic: 'دمنهور' }), [1, 4]);
  assert.deepEqual(filterSecretaryApts([{ id: 1, date: TODAY }], { search: 'x' }), [], 'missing patient never matches a search');
  assert.equal(apts.map(a => a.id).join(), '1,2,3,4,5', 'input not reordered');
});

test('todayDoctorNames keeps first-appearance order, unique', () => {
  assert.deepEqual(todayDoctorNames(apts, TODAY), ['د. عبدالستار', 'د. سمير']);
});

test('stats: collected / unpaid today', () => {
  // Cancelled-but-paid appointments still count (legacy behaviour).
  assert.equal(collectedToday(apts, TODAY), 1800);
  assert.equal(unpaidTodayCount(apts, TODAY), 1);
  assert.equal(collectedToday([], TODAY), 0);
});

test('stats: clinicStats and typeStats', () => {
  assert.deepEqual(clinicStats(apts, CLINICS_LIST, TODAY), [
    { clinic: 'دمنهور', cnt: 4, todayCnt: 2, width: 4 / 5 * 100 + '%' },
    { clinic: 'الرحمانية', cnt: 1, todayCnt: 1, width: 1 / 5 * 100 + '%' },
    null
  ]);
  assert.deepEqual(typeStats(apts), [
    { type: 'فحص روتيني', cnt: 1 }, { type: 'متابعة', cnt: 2 }, { type: 'استشارة', cnt: 1 }, null, null, { type: 'عملية', cnt: 1 }
  ]);
  assert.deepEqual(STATS_VISIT_TYPES, ['فحص روتيني', 'متابعة', 'استشارة', 'قياس نظر', 'فحص شبكية', 'عملية']);
});

test('requestsTabLabel and waCardHref', () => {
  assert.equal(requestsTabLabel(0), 'طلبات الحجز');
  assert.equal(requestsTabLabel(3), 'طلبات الحجز (3)');
  const href = waCardHref({ phone: '01012345678', clinic: 'دمنهور', date: TODAY, time: '10:00' }, clinicLabel);
  assert.equal(href, 'https://wa.me/21012345678?text=' + encodeURIComponent('تذكير بموعدك في عيادة دمنهور يوم 2026-09-27 الساعة 10:00'));
});
