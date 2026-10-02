import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  SLOTS_VIEW, SLOT_CAPACITY, WEEK_DAY_NAMES, BOOKING_DAYS_AHEAD, BOOKING_DATES_SHOWN, BOOK_VISIT_TYPES, GUEST_STEPS,
  PATIENT_STEPS, GUEST_NAME_ALERT, GUEST_PHONE_ALERT, initialBookingStep, bookingSteps, currentStepIndex,
  getAvailableDates, getSlots, getSlotsForDate, BOOKING_MIN_LEAD_MIN, slotsClinicCode, addTakenRows, isSlotFull, canPickSlot, withClinicPicked,
  withDatePicked, withTimePicked, withDateTimeCleared, withTimeCleared, shouldReturnToTimeStep, guestInfoError,
  bookingSummaryRows, bookButtonLabel
} from '../src/components/forms/booking-form-model.js';
import { blankBookForm, bookFormError } from '../src/modules/patient-app/model.js';
import { legacyFunctionSource, legacyConst } from './forms-legacy-source.js';
// PATIENT_CLINICS/CLINIC_CODE moved out of app-runtime.js in Phase 8, batch 2
// (src/modules/constants/clinics.js is now their one source of truth), so
// they're imported directly rather than scraped from the legacy source text.
import { PATIENT_CLINICS, CLINIC_CODE } from '../src/modules/constants/clinics.js';

const SRC = legacyFunctionSource('BookingForm');
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

test('getAvailableDates: today onward, 30 days, clinic weekdays only', () => {
  const now = new Date(2026, 8, 28, 10); // Monday 10:00
  const damnhour = getAvailableDates(PATIENT_CLINICS[0], now, localISO);
  assert.equal(damnhour[0].date, '2026-09-28'); // Monday is a Damanhour day, slots 20:00+ still ahead
  assert.ok(damnhour.every(d => PATIENT_CLINICS[0].days.includes(d.dayOfWeek)));
  assert.ok(damnhour.every(d => d.date >= '2026-09-28' && d.date <= '2026-10-28'));
  assert.deepEqual(damnhour[0], { date: '2026-09-28', dayName: 'الاثنين', dayOfWeek: 1 });
  const center = getAvailableDates(PATIENT_CLINICS[2], now, localISO);
  assert.ok(center.every(d => [0, 1, 2, 4].includes(d.dayOfWeek)));
  assert.equal(center[0].date, '2026-09-28'); // Monday 13:00-15:30 still ahead at 10:00
  assert.deepEqual(getAvailableDates({}, now, localISO), []);
  assert.deepEqual(Object.keys(damnhour[0]), ['date', 'dayName', 'dayOfWeek']);
});

test('same-day booking: today is offered only while a slot is still ahead', () => {
  const damnhour = PATIENT_CLINICS[0]; // 20:00-22:00
  const at = (h, m) => new Date(2026, 8, 28, h, m); // Monday
  assert.equal(getAvailableDates(damnhour, at(21, 0), localISO)[0].date, '2026-09-28');
  // after the last slot (22:00) today disappears and the next clinic day is first
  assert.equal(getAvailableDates(damnhour, at(22, 1), localISO)[0].date, '2026-09-30');
  // a non-clinic weekday never offers today
  const tuesday = new Date(2026, 8, 29, 8, 0);
  assert.equal(getAvailableDates(damnhour, tuesday, localISO)[0].date, '2026-09-30');
});

test('getSlotsForDate: today keeps only slots at least BOOKING_MIN_LEAD_MIN ahead; other days keep all', () => {
  const damnhour = PATIENT_CLINICS[0];
  const now = new Date(2026, 8, 28, 20, 25);
  const today = getSlotsForDate(damnhour, 1, '2026-09-28', now, localISO);
  assert.equal(BOOKING_MIN_LEAD_MIN, 10);
  assert.equal(today[0], '20:40'); // 20:30 is too close (needs >= 20:35), 20:40 is the first valid
  assert.equal(today[today.length - 1], '22:00');
  assert.equal(getSlotsForDate(damnhour, 1, '2026-09-29', now, localISO).length, 13);
  assert.deepEqual(getSlotsForDate(damnhour, 1, '2026-09-28', new Date(2026, 8, 28, 22, 5), localISO), []);
});

test('slots are 10 minutes apart inside each clinic window', () => {
  const damnhour = getSlots(PATIENT_CLINICS[0], 3);
  assert.deepEqual(damnhour.slice(0, 4), ['20:00', '20:10', '20:20', '20:30']);
  assert.equal(damnhour.length, 13); // 20:00 .. 22:00
  assert.equal(damnhour[damnhour.length - 1], '22:00');
  assert.equal(getSlots(PATIENT_CLINICS[1], 1).length, 13); // 16:00 .. 18:00
  assert.equal(getSlots(PATIENT_CLINICS[2], 0).length, 16); // 13:00 .. 15:30
  assert.equal(getSlots(PATIENT_CLINICS[2], 2).length, 34); // 15:00 .. 20:30
  assert.equal(getSlots(PATIENT_CLINICS[2], 4).length, 34); // 09:00 .. 14:30
  for (const c of PATIENT_CLINICS) {
    const all = c.sessions ? c.sessions[0].slots : Object.values(c.schedule).flatMap(x => x.slots);
    for (let i = 1; i < all.length; i++) {
      const [h1, m1] = all[i - 1].split(':').map(Number), [h2, m2] = all[i].split(':').map(Number);
      const d = h2 * 60 + m2 - (h1 * 60 + m1);
      assert.ok(d === 10 || d < 0, c.id + ' ' + all[i - 1] + '->' + all[i]); // negative = next weekday's list starts
    }
  }
});

test('getSlots: sessions clinic same every day, schedule clinic per weekday, empty otherwise', () => {
  assert.deepEqual(getSlots({}, 1), []);
  assert.deepEqual(getSlots(PATIENT_CLINICS[2], 3), []);
  assert.equal(getSlots(PATIENT_CLINICS[0], 0), PATIENT_CLINICS[0].sessions[0].slots);
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
