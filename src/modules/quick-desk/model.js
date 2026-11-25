// Quick desk (phase 1 "from paper to app", Damanhour first).
// Pure logic for the two fast paths that have to beat paper on speed:
//   - Quick arrival (secretary): one search box -> tap -> the patient is in today's waiting list.
//   - Quick exam (doctor): one page of tap chips instead of three steps of dropdowns.
// No React, no I/O (storage is passed in), so everything here is unit-tested.

import { personMatches, foldText } from '../search/text.js';
import { localISO } from '../constants/misc.js';
import { CLINICS_LIST } from '../constants/clinics.js';
import { aptConflict } from '../secretary-app/model.js';

// ---- the site this device works at --------------------------------------------------------------------------

export const MY_SITE_KEY = 'iapp_my_site';

// The site saved on this device, or '' when none was chosen yet (or it is no longer a known site).
export function readMySite(storage) {
  let v = '';
  try { v = (storage && storage.getItem(MY_SITE_KEY)) || ''; } catch { v = ''; }
  return CLINICS_LIST.includes(v) ? v : '';
}

export function saveMySite(storage, site) {
  if (!CLINICS_LIST.includes(site)) return false;
  try { storage.setItem(MY_SITE_KEY, site); return true; } catch { return false; }
}

// ---- quick arrival -----------------------------------------------------------------------------------------

export const ARRIVAL_DOCTOR = 'د. عبدالستار';
export const ARRIVAL_TYPES = ['فحص روتيني', 'متابعة', 'استشارة', 'قياس نظر', 'فحص شبكية'];

// A returning patient most often comes for a follow-up; a new one for a first exam. The secretary can change it.
export const defaultArrivalType = isExisting => (isExisting ? 'متابعة' : 'فحص روتيني');

const pad = n => String(n).padStart(2, '0');
export const hhmm = d => pad(d.getHours()) + ':' + pad(d.getMinutes());

// Walk-ins arrive at "now". Two arrivals in the same minute would collide with the double-booking rule, so the
// time moves forward one minute at a time until it is free (at most an hour; then "now" is kept).
export function freeArrivalTime(appointments, { doctor, date, time }) {
  let [h, m] = String(time).split(':').map(Number);
  for (let i = 0; i < 60; i++) {
    const t = pad(h) + ':' + pad(m);
    if (!aptConflict(appointments || [], { id: null, doctor, date, time: t })) return t;
    m += 1;
    if (m === 60) { m = 0; h = (h + 1) % 24; }
  }
  return time;
}

// Up to `limit` patients matching the typed text (name with any alef/yaa/taa form, phone, file code; Arabic-Indic
// digits too). Names that START with the text come first, then the rest in list order. Empty text -> [].
export function matchPatients(patients, query, limit = 6) {
  const q = String(query || '').trim();
  if (!q) return [];
  const fq = foldText(q);
  const hits = (patients || []).filter(p => p && personMatches(p, q));
  const starts = hits.filter(p => foldText(p.name).startsWith(fq));
  const rest = hits.filter(p => !foldText(p.name).startsWith(fq));
  return [...starts, ...rest].slice(0, limit);
}

// Patient already in today's list (not cancelled)? Used to warn before adding the same person twice.
export function alreadyToday(appointments, { patientId, name }, today) {
  const n = foldText(name);
  return (appointments || []).some(a => a && a.date === today && !a.cancelled && a.waitStatus !== 'cancelled' && a.status !== 'cancelled'
    && ((patientId != null && a.patientId === patientId) || (!a.patientId && n && foldText(a.patient) === n)));
}

// Error key (i18n) or null. A new patient needs a name of 2+ letters; a phone, when typed, needs 11 digits (01…).
export function arrivalError({ name, phone, site }) {
  if (!CLINICS_LIST.includes(site)) return 'qd.err.site';
  if (String(name || '').trim().length < 2) return 'qd.err.name';
  const d = String(phone || '').replace(/[٠-٩]/g, c => String(c.charCodeAt(0) - 0x0660)).replace(/\D/g, '');
  if (d && !/^01\d{9}$/.test(d)) return 'qd.err.phone';
  return null;
}

// The appointment written for an arrival: today, now (first free minute), this device's site, already marked
// "arrived" so it shows in the waiting list at once. Same shape as the secretary's normal appointment form.
export function buildArrival({ patient = null, name, phone, site, type, price, appointments, now = new Date(), id = Date.now() }) {
  const date = localISO(now);
  const time = freeArrivalTime(appointments, { doctor: ARRIVAL_DOCTOR, date, time: hhmm(now) });
  const digits = String((patient && patient.phone) || phone || '').replace(/[٠-٩]/g, c => String(c.charCodeAt(0) - 0x0660)).replace(/\D/g, '');
  return {
    id,
    patient: patient ? patient.name : String(name || '').trim(),
    patientId: patient ? patient.id : null,
    phone: digits,
    date,
    time,
    type,
    doctor: ARRIVAL_DOCTOR,
    clinic: site,
    cost: price != null && price !== '' ? price : '',
    paid: false,
    notes: '',
    waitStatus: 'waiting',
    arrivedAt: now.getTime(),
    source: 'quick-arrival'
  };
}

// ---- quick exam ---------------------------------------------------------------------------------------------

export const EXAM_MODE_KEY = 'iapp_exam_mode'; // 'quick' | 'full'

export function readExamMode(storage) {
  let v = '';
  try { v = (storage && storage.getItem(EXAM_MODE_KEY)) || ''; } catch { v = ''; }
  return v === 'full' ? 'full' : 'quick';
}

export function saveExamMode(storage, mode) {
  try { storage.setItem(EXAM_MODE_KEY, mode === 'full' ? 'full' : 'quick'); } catch { /* not remembered: non-fatal */ }
}

// The diagnoses seen most in a general eye clinic, as tap chips. Tapping adds the term to the diagnosis text.
export const COMMON_DX = [
  'Refractive error', 'Presbyopia', 'Cataract', 'Dry eye', 'Allergic conjunctivitis', 'Bacterial conjunctivitis',
  'Blepharitis', 'Chalazion', 'Pterygium', 'Glaucoma suspect', 'POAG', 'Diabetic retinopathy', 'DME', 'AMD',
  'Pseudophakia', 'Normal eye exam'
];

// Add a term to free text on its own line; a term already present (any case) is not added twice.
export function appendTerm(text, term) {
  const cur = String(text || '');
  const lines = cur.split('\n').map(s => s.trim().toLowerCase());
  if (lines.includes(String(term).trim().toLowerCase())) return cur;
  return cur.trim() ? cur.replace(/\s+$/, '') + '\n' + term : term;
}

// Follow-up shortcuts, in days from the exam date.
export const FOLLOW_UP_DAYS = [7, 14, 30, 90, 180];

export function followUpDate(examDate, days) {
  const [y, m, d] = String(examDate || '').split('-').map(Number);
  const base = y && m && d ? new Date(y, m - 1, d) : new Date();
  base.setDate(base.getDate() + days);
  return localISO(base);
}

// Which shortcut (if any) the current follow-up date equals, so its chip shows as selected.
export function followUpChoice(examDate, followUp) {
  return FOLLOW_UP_DAYS.find(n => followUpDate(examDate, n) === followUp) || null;
}

// IOP typed as a number (mmHg). '' stays ''. Arabic-Indic digits are accepted. Kept as a string like the full form.
export function cleanIop(v) {
  const s = String(v == null ? '' : v).replace(/[٠-٩]/g, c => String(c.charCodeAt(0) - 0x0660)).replace(/[^\d]/g, '').slice(0, 2);
  return s;
}
