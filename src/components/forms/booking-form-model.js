// Pure logic for the patient app's BookingForm (src/components/forms/
// BookingForm.jsx). Mirrors the legacy BookingForm except for two deliberate,
// clinic-requested changes: bookings are allowed for TODAY (only slots that
// still lie ahead) and slots are 10 minutes apart (SLOT_MINUTES in
// constants/clinics.js).
//
// The clinic list (PATIENT_CLINICS) and CLINIC_CODE stay single instances on
// the IAppLegacy bridge (PatientApp reads the same ones); they are passed in.
// Submitting the booking (validation, insert, duplicate handling) is
// PatientApp's doBook — unchanged — not the form's.

import { t } from '../../modules/i18n/index.js';

// Supabase view read for the taken-slot counts, and how many bookings fill a slot.
export const SLOTS_VIEW = 'iapp_slots_taken';
export const SLOT_CAPACITY = 1;

export const WEEK_DAY_NAMES = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
export const BOOKING_DAYS_AHEAD = 30;
// Same-day booking: a slot is offered today only if it starts at least this many
// minutes from now.
export const BOOKING_MIN_LEAD_MIN = 10;
// Only the first 14 available dates are offered.
export const BOOKING_DATES_SHOWN = 14;

export const BOOK_VISIT_TYPES = ['فحص روتيني', 'متابعة', 'استشارة', 'قياس نظر', 'فحص شبكية'];

export const GUEST_STEPS = ['بياناتك', 'العيادة', 'التاريخ', 'الوقت', 'تأكيد'];
export const PATIENT_STEPS = ['العيادة', 'التاريخ', 'الوقت', 'تأكيد'];

export const GUEST_NAME_ALERT = 'اكتب اسمك الكامل';
export const GUEST_PHONE_ALERT = 'اكتب رقم هاتف صحيح (10 أرقام على الأقل)';

// Steps: 1 guest info, 2 clinic, 3 date, 4 time, 5 confirm. A registered
// patient starts at the clinic step.
export const initialBookingStep = isGuest => (isGuest ? 1 : 2);
export const bookingSteps = isGuest => (isGuest ? GUEST_STEPS : PATIENT_STEPS);
export const currentStepIndex = (isGuest, step) => (isGuest ? step - 1 : step - 2);

// Days 1..30 from `now` (never today) on which the clinic works: `days` list,
// else a `schedule` entry for that weekday. `localISO` is the runtime's.
export const getAvailableDates = (c, now, localISO) => {
  const dates = [];
  for (let i = 0; i <= BOOKING_DAYS_AHEAD; i++) {
    const d = new Date(now);
    d.setDate(now.getDate() + i);
    const dow = d.getDay();
    const ok = c.days ? c.days.includes(dow) : c.schedule && c.schedule[dow] !== undefined;
    if (!ok) continue;
    const iso = localISO(d);
    // Today is offered only while at least one slot is still ahead.
    if (i === 0 && !getSlotsForDate(c, dow, iso, now, localISO).length) continue;
    dates.push({ date: iso, dayName: WEEK_DAY_NAMES[dow], dayOfWeek: dow });
  }
  return dates;
};

// Time slots for a clinic on a weekday: a sessions clinic has the same
// first-session slots every day; a schedule clinic has per-weekday slots.
export const getSlots = (c, dow) => {
  if (c.sessions) return c.sessions[0].slots;
  if (c.schedule) return c.schedule[dow]?.slots || [];
  return [];
};

// Slots of a specific date: for today only those starting at least
// BOOKING_MIN_LEAD_MIN minutes from `now`; other dates get every slot.
export const getSlotsForDate = (c, dow, dateISO, now, localISO) => {
  const all = getSlots(c, dow);
  if (dateISO !== localISO(now)) return all;
  const limit = now.getHours() * 60 + now.getMinutes() + BOOKING_MIN_LEAD_MIN;
  return all.filter(t => {
    const [h, m] = t.split(':').map(Number);
    return h * 60 + m >= limit;
  });
};

// Clinic value stored in the slots view (short code, else the name as-is).
export const slotsClinicCode = (clinicCode, name) => clinicCode[name] || name;

// Adds the slots view rows to the taken-count map `m` (mutated in place, as
// legacy does, so rows before a malformed one are kept if a later row
// throws); a missing/zero/non-numeric count still counts as 1.
export const addTakenRows = (m, data) => {
  if (Array.isArray(data)) data.forEach(r => {
    m[r.time] = Number(r.taken) || 1;
  });
  return m;
};

export const isSlotFull = (taken, t) => (taken[t] || 0) >= SLOT_CAPACITY;
// A slot is clickable only when it is not full and the counts are loaded.
export const canPickSlot = (full, slotsLoading) => !full && !slotsLoading;

// bookForm transitions.
export const withClinicPicked = (v, c) => ({ ...v, clinic: c.name, date: '', time: '' });
export const withDatePicked = (v, d) => ({ ...v, date: d.date, time: '' });
export const withTimePicked = (v, t) => ({ ...v, time: t });
export const withDateTimeCleared = v => ({ ...v, date: '', time: '' });
export const withTimeCleared = v => ({ ...v, time: '' });

// The confirm step falls back to the time step whenever the time is cleared
// (e.g. PatientApp clears it after a "slot already taken" error). Runs only
// when bookForm.time changes.
export const shouldReturnToTimeStep = (step, time) => step >= 5 && !time;

// Guest "your info" step: alert text for the first problem, or null to go
// on. The phone length counts raw characters (spaces included) — legacy.
export const guestInfoError = bookForm => {
  if (!bookForm.newName?.trim()) return t('g3.booking.nameAlert');
  if (!bookForm.newPhone?.trim() || bookForm.newPhone.length < 10) return t('g3.booking.phoneAlert');
  return null;
};

// "📋 ملخص الحجز" rows, empty values dropped.
export const bookingSummaryRows = (bookForm, isGuest) =>
  [
    ['🏥', bookForm.clinic],
    ['📅', bookForm.date],
    ['⏰', bookForm.time],
    ['🔬', bookForm.type],
    ...(isGuest ? [['👤', bookForm.newName], ['📞', bookForm.newPhone]] : [])
  ].filter(([, v]) => v);

export const bookButtonLabel = booking => (booking ? t('g3.booking.sending') : t('g3.booking.confirmBtn'));
