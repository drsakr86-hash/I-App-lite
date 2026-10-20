// Clinic schedules + slot arithmetic for the assistant.
// SOURCE OF TRUTH today = src/modules/constants/clinics.js (PATIENT_CLINICS / SLOT_MINUTES), which the patient booking portal uses.
// This is a verbatim copy so the Edge Functions (Deno) don't import browser code; tests/whatsapp-shared.test.js fails if the two drift.
import { asciiDigits } from './text.js';

export const SLOT_MINUTES = 10;
export const BOOKING_DAYS_AHEAD = 30;
export const BOOKING_MIN_LEAD_MIN = 10;
export const DEFAULT_DOCTOR = 'د. عبدالستار';        // the app's REQUEST_DOCTOR (src/modules/secretary-app/model.js): the clinic has one doctor today
export const DEFAULT_VISIT_TYPE = 'فحص روتيني';
export const WEEK_DAY_NAMES = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];

export function slotRange(start, end, step = SLOT_MINUTES) {
  const toMin = t => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
  const out = [];
  for (let m = toMin(start); m <= toMin(end); m += step) out.push(String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0'));
  return out;
}

// code = the value stored in iapp_appointments.clinic / iapp_booking_requests.clinic
export const CLINICS = [
  { code: 'دمنهور', name: 'عيادة دمنهور', address: 'برج المنتزه بجوار حديقة الجمهورية', phone: '0453333313', days: [0, 1, 3, 4, 6], sessions: [{ slots: slotRange('20:00', '22:00') }] },
  { code: 'الرحمانية', name: 'عيادة الرحمانية', address: 'ش أحمد محمود بجوار فرع we', phone: '01111480137', days: [6, 1, 3], sessions: [{ slots: slotRange('16:00', '18:00') }] },
  {
    code: 'مركز دمنهور للعيون', name: 'مركز دمنهور للعيون', address: 'دمنهور', phone: '0453333313',
    schedule: { 0: { slots: slotRange('13:00', '15:30') }, 1: { slots: slotRange('13:00', '15:30') }, 2: { slots: slotRange('15:00', '20:30') }, 4: { slots: slotRange('09:00', '14:30') } }
  }
];

export const findClinic = input => {
  const n = String(input || '').trim();
  return CLINICS.find(c => c.code === n || c.name === n) || null;
};

export const clinicDays = c => (c.days ? c.days : Object.keys(c.schedule || {}).map(Number)).slice().sort((a, b) => a - b);
export const slotsForDow = (c, dow) => (c.sessions ? c.sessions[0].slots : c.schedule ? (c.schedule[dow] && c.schedule[dow].slots) || [] : []);

// Wall-clock parts in the clinic's timezone (the server runs in UTC).
export function clinicNow(now = new Date(), tz = 'Africa/Cairo') {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
    .formatToParts(now).filter(x => x.type !== 'literal').map(x => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, minutes: Number(p.hour) * 60 + Number(p.minute) };
}
export const isoDow = iso => new Date(iso + 'T00:00:00Z').getUTCDay();
export const addDaysISO = (iso, n) => { const d = new Date(iso + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
export const isISODate = s => /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s + 'T00:00:00Z')) && new Date(s + 'T00:00:00Z').toISOString().slice(0, 10) === s;
export const normTime = s => { const m = asciiDigits(s).trim().match(/^(\d{1,2}):(\d{2})$/); return m && Number(m[1]) < 24 && Number(m[2]) < 60 ? String(m[1]).padStart(2, '0') + ':' + m[2] : null; };

// Slots offered on `date`: the clinic works that weekday, the date is inside the booking window, today only from now+lead, minus taken times.
// `taken` = array of 'HH:MM' strings (appointments + pending requests, from wa_taken_times).
export function availableSlots(clinic, date, taken = [], now = new Date(), { tz = 'Africa/Cairo', leadMin = BOOKING_MIN_LEAD_MIN, holidays = [] } = {}) {
  if (!clinic || !isISODate(date)) return [];
  const cn = clinicNow(now, tz);
  if (date < cn.date || date > addDaysISO(cn.date, BOOKING_DAYS_AHEAD) || holidays.includes(date)) return [];
  if (!clinicDays(clinic).includes(isoDow(date))) return [];     // closed that weekday
  const takenSet = new Set(taken.map(normTime).filter(Boolean));
  return slotsForDow(clinic, isoDow(date)).filter(t => {
    if (takenSet.has(t)) return false;
    if (date === cn.date) { const [h, m] = t.split(':').map(Number); if (h * 60 + m < cn.minutes + leadMin) return false; }
    return true;
  });
}

// Is (date,time) a real slot of this clinic (regardless of whether it is taken)? Used to validate before any write.
export function isScheduledSlot(clinic, date, time, now = new Date(), opts = {}) {
  const t = normTime(time);
  if (!clinic || !t || !isISODate(date)) return false;
  return availableSlots(clinic, date, [], now, opts).includes(t);
}

export const workingDaysText = c => clinicDays(c).map(d => WEEK_DAY_NAMES[d]).join('، ');
export function hoursText(c) {
  if (c.sessions) { const s = c.sessions[0].slots; return `من ${s[0]} إلى ${s[s.length - 1]}`; }
  return clinicDays(c).map(d => { const s = slotsForDow(c, d); return `${WEEK_DAY_NAMES[d]} من ${s[0]} إلى ${s[s.length - 1]}`; }).join('، ');
}
