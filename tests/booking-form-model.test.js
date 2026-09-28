import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  SLOTS_VIEW, SLOT_CAPACITY, WEEK_DAY_NAMES, BOOKING_DAYS_AHEAD, BOOKING_DATES_SHOWN, BOOK_VISIT_TYPES, GUEST_STEPS,
  PATIENT_STEPS, GUEST_NAME_ALERT, GUEST_PHONE_ALERT, initialBookingStep, bookingSteps, currentStepIndex,
  getAvailableDates, getSlots, slotsClinicCode, addTakenRows, isSlotFull, canPickSlot, withClinicPicked,
  withDatePicked, withTimePicked, withDateTimeCleared, withTimeCleared, shouldReturnToTimeStep, guestInfoError,
  bookingSummaryRows, bookButtonLabel
} from '../src/components/forms/booking-form-model.js';
import { blankBookForm, bookFormError } from '../src/modules/patient-app/model.js';
import { legacyFunctionSource, legacyConst } from './forms-legacy-source.js';

const SRC = legacyFunctionSource('BookingForm');
const PATIENT_CLINICS = legacyConst('PATIENT_CLINICS');
const CLINIC_CODE = legacyConst('CLINIC_CODE');
// The runtime's localISO, verbatim.
function localISO(d) {
  d = d || new Date();
  const z = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return z.toISOString().slice(0, 10);
}
// Legacy getAvailableDates / getSlots evaluated from the runtime source, with
// `new Date()` pinned to `now`.
const legacyDates = (c, now) => {
  const RealDate = Date;
  class FixedDate extends RealDate {
    constructor(...a) { if (a.length) super(...a); else super(now.getTime()); }
  }
  const fn = new Function('localISO', 'Date', legacyFunctionSource('getAvailableDates') + '\nreturn getAvailableDates;')(localISO, FixedDate);
  return fn(c);
};
const legacySlots = new Function(legacyFunctionSource('getSlots') + '\nreturn getSlots;')();

test('constants are the legacy values', () => {
  assert.equal(SLOTS_VIEW, legacyConst('SLOTS_VIEW'));
  assert.equal(SLOTS_VIEW, 'iapp_slots_taken');
  assert.equal(SLOT_CAPACITY, legacyConst('SLOT_CAPACITY'));
  assert.equal(SLOT_CAPACITY, 1);
  assert.ok(legacyFunctionSource('getAvailableDates').includes(JSON.stringify(WEEK_DAY_NAMES).replace(/,/g, ', ')));
  assert.ok(legacyFunctionSource('getAvailableDates').includes('i <= ' + BOOKING_DAYS_AHEAD));
  assert.ok(SRC.includes('availDates.slice(0, ' + BOOKING_DATES_SHOWN + ')'));
  assert.ok(SRC.includes(JSON.stringify(BOOK_VISIT_TYPES).replace(/,/g, ', ') + '.map('));
  assert.ok(SRC.includes('const steps = patient.isGuest ? ' + JSON.stringify(GUEST_STEPS).replace(/,/g, ', ') + ' : ' + JSON.stringify(PATIENT_STEPS).replace(/,/g, ', ') + ';'));
  assert.ok(SRC.includes('alert("' + GUEST_NAME_ALERT + '")'));
  assert.ok(SRC.includes('alert("' + GUEST_PHONE_ALERT + '")'));
  assert.ok(SRC.includes('.from(SLOTS_VIEW).select("time,taken").eq("clinic", code).eq("date", selDate.date)'));
});

test('steps: guest starts at info, registered patient at clinic', () => {
  assert.equal(initialBookingStep(true), 1);
  assert.equal(initialBookingStep(false), 2);
  assert.equal(initialBookingStep(undefined), 2);
  assert.equal(bookingSteps(true), GUEST_STEPS);
  assert.equal(bookingSteps(false), PATIENT_STEPS);
  assert.equal(GUEST_STEPS.length, 5);
  assert.equal(PATIENT_STEPS.length, 4);
  for (let step = 1; step <= 5; step++) {
    assert.equal(currentStepIndex(true, step), step - 1);
    assert.equal(currentStepIndex(false, step), step - 2);
  }
});

test('getAvailableDates equals legacy for every clinic over two months of start days', () => {
  for (let day = 0; day < 60; day++) {
    for (const hour of [0, 12, 23]) {
      const now = new Date(2026, 8, 1 + day, hour, 30);
      for (const c of PATIENT_CLINICS) {
        assert.deepEqual(getAvailableDates(c, now, localISO), legacyDates(c, now), c.id + ' ' + now);
      }
    }
  }
});

test('getAvailableDates: tomorrow onward, 30 days, clinic weekdays only', () => {
  const now = new Date(2026, 8, 28, 10); // Monday
  const damnhour = getAvailableDates(PATIENT_CLINICS[0], now, localISO);
  assert.equal(damnhour[0].date, '2026-09-30'); // Tue is not a Damanhour day; Wed is
  assert.ok(damnhour.every(d => PATIENT_CLINICS[0].days.includes(d.dayOfWeek)));
  assert.ok(damnhour.every(d => d.date > '2026-09-28' && d.date <= '2026-10-28'));
  assert.deepEqual(damnhour[0], { date: '2026-09-30', dayName: 'الأربعاء', dayOfWeek: 3 });
  const center = getAvailableDates(PATIENT_CLINICS[2], now, localISO);
  assert.ok(center.every(d => [0, 1, 2, 4].includes(d.dayOfWeek)));
  assert.equal(center[0].date, '2026-09-29'); // Tuesday
  assert.deepEqual(getAvailableDates({}, now, localISO), []);
  assert.deepEqual(Object.keys(damnhour[0]), ['date', 'dayName', 'dayOfWeek']);
});

test('getSlots equals legacy', () => {
  for (const c of [...PATIENT_CLINICS, {}]) {
    for (const dow of [0, 1, 2, 3, 4, 5, 6, undefined]) assert.deepEqual(getSlots(c, dow), legacySlots(c, dow));
  }
  assert.deepEqual(getSlots(PATIENT_CLINICS[0], 3), ['20:00', '20:30', '21:00', '21:30', '22:00']);
  assert.deepEqual(getSlots(PATIENT_CLINICS[2], 3), []);
  assert.equal(getSlots(PATIENT_CLINICS[2], 4).length, 12);
  // A sessions clinic returns its own array (not a copy), like legacy.
  assert.equal(getSlots(PATIENT_CLINICS[1], 1), PATIENT_CLINICS[1].sessions[0].slots);
});

test('slotsClinicCode: short code else the name', () => {
  assert.equal(slotsClinicCode(CLINIC_CODE, 'عيادة دمنهور'), 'دمنهور');
  assert.equal(slotsClinicCode(CLINIC_CODE, 'عيادة الرحمانية'), 'الرحمانية');
  assert.equal(slotsClinicCode(CLINIC_CODE, 'مركز دمنهور للعيون'), 'مركز دمنهور للعيون');
  assert.equal(slotsClinicCode(CLINIC_CODE, 'أخرى'), 'أخرى');
  assert.ok(SRC.includes('const code = CLINIC_CODE[selClinic.name] || selClinic.name;'));
});

test('addTakenRows: counts by time, bad counts become 1, mutates in place', () => {
  const m = {};
  const r = addTakenRows(m, [{ time: '20:00', taken: 2 }, { time: '20:30', taken: '1' }, { time: '21:00', taken: 0 }, { time: '21:30', taken: null }, { time: '22:00', taken: 'x' }]);
  assert.equal(r, m);
  assert.deepEqual(m, { '20:00': 2, '20:30': 1, '21:00': 1, '21:30': 1, '22:00': 1 });
  assert.deepEqual(addTakenRows({}, null), {});
  assert.deepEqual(addTakenRows({}, { time: '1' }), {});
  // Legacy: rows before a malformed one are kept when a later row throws.
  const p = {};
  assert.throws(() => addTakenRows(p, [{ time: '20:00', taken: 1 }, null]), TypeError);
  assert.deepEqual(p, { '20:00': 1 });
});

test('isSlotFull / canPickSlot', () => {
  assert.equal(isSlotFull({}, '20:00'), false);
  assert.equal(isSlotFull({ '20:00': 1 }, '20:00'), true);
  assert.equal(isSlotFull({ '20:00': 3 }, '20:00'), true);
  assert.equal(isSlotFull({ '20:00': 1 }, '20:30'), false);
  assert.equal(canPickSlot(false, false), true);
  assert.equal(canPickSlot(true, false), false);
  assert.equal(canPickSlot(false, true), false);
  assert.equal(canPickSlot(true, true), false);
});

test('bookForm transitions', () => {
  const v = { ...blankBookForm({ id: 1, name: 'أحمد', phone: '010' }), clinic: 'x', date: 'd', time: 't', notes: 'n' };
  const c = PATIENT_CLINICS[1];
  assert.deepEqual(withClinicPicked(v, c), { ...v, clinic: 'عيادة الرحمانية', date: '', time: '' });
  assert.deepEqual(withDatePicked(v, { date: '2026-10-03' }), { ...v, date: '2026-10-03', time: '' });
  assert.deepEqual(withTimePicked(v, '16:30'), { ...v, time: '16:30' });
  assert.deepEqual(withDateTimeCleared(v), { ...v, date: '', time: '' });
  assert.deepEqual(withTimeCleared(v), { ...v, time: '' });
  assert.notEqual(withTimeCleared(v), v);
});

test('shouldReturnToTimeStep: confirm step with the time cleared', () => {
  assert.ok(SRC.includes('if (step >= 5 && !bookForm.time) setStep(4);\n  }, [bookForm.time]);'));
  assert.equal(shouldReturnToTimeStep(5, ''), true);
  assert.equal(shouldReturnToTimeStep(5, undefined), true);
  assert.equal(shouldReturnToTimeStep(5, '20:00'), false);
  assert.equal(shouldReturnToTimeStep(4, ''), false);
  assert.equal(shouldReturnToTimeStep(3, ''), false);
  assert.equal(shouldReturnToTimeStep(6, ''), true);
});

test('guestInfoError: name, then phone (raw length >= 10)', () => {
  assert.equal(guestInfoError({}), GUEST_NAME_ALERT);
  assert.equal(guestInfoError({ newName: '  ', newPhone: '01012345678' }), GUEST_NAME_ALERT);
  assert.equal(guestInfoError({ newName: 'منى' }), GUEST_PHONE_ALERT);
  assert.equal(guestInfoError({ newName: 'منى', newPhone: '   ' }), GUEST_PHONE_ALERT);
  assert.equal(guestInfoError({ newName: 'منى', newPhone: '012345678' }), GUEST_PHONE_ALERT); // 9 chars
  assert.equal(guestInfoError({ newName: 'منى', newPhone: '0123456789' }), null); // 10 chars
  // Legacy: raw length, so spaces/letters count.
  assert.equal(guestInfoError({ newName: 'منى', newPhone: '01 234 567' }), null);
  assert.equal(guestInfoError({ newName: 'منى', newPhone: 'abcdefghij' }), null);
});

test('guest step check vs doBook (both kept as legacy)', () => {
  // Neither the form's guest step nor PatientApp's doBook validation
  // (bookFormError, unchanged) checks that the phone is digits: a 10-char
  // non-numeric phone passes both.
  const f = { ...blankBookForm({ isGuest: true }), newName: 'منى', newPhone: 'abcdefghij', clinic: 'عيادة دمنهور', date: '2026-09-30', time: '20:00' };
  assert.equal(guestInfoError(f), null);
  assert.equal(bookFormError(f), null);
  // A short phone is stopped by the guest step, not by doBook.
  assert.equal(guestInfoError({ ...f, newPhone: '0101' }), GUEST_PHONE_ALERT);
  assert.equal(bookFormError({ ...f, newPhone: '0101' }), null);
});

test('bookingSummaryRows equals the legacy summary expression', () => {
  const m = SRC.match(/\}, "📋 ملخص الحجز"\), (\[\["🏥".*?\.filter\(\(\[, v\]\) => v\))/);
  assert.ok(m);
  const legacy = new Function('bookForm', 'patient', 'return ' + m[1]);
  const forms = [
    { clinic: 'عيادة دمنهور', date: '2026-09-30', time: '20:00', type: 'متابعة', newName: 'منى', newPhone: '0101' },
    { clinic: 'عيادة دمنهور', date: '', time: '', type: 'فحص روتيني' },
    {}
  ];
  for (const f of forms) {
    for (const isGuest of [true, false, undefined]) {
      assert.deepEqual(bookingSummaryRows(f, isGuest), legacy(f, { isGuest }));
    }
  }
  assert.deepEqual(bookingSummaryRows(forms[0], false).map(r => r[0]), ['🏥', '📅', '⏰', '🔬']);
  assert.deepEqual(bookingSummaryRows(forms[0], true).map(r => r[0]), ['🏥', '📅', '⏰', '🔬', '👤', '📞']);
});

test('bookButtonLabel', () => {
  assert.equal(bookButtonLabel(false), '📅 تأكيد الحجز');
  assert.equal(bookButtonLabel(true), '⏳ جاري الإرسال...');
});
