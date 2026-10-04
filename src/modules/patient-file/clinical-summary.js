// Patient 360 clinical summary (pure: no React/DOM/Supabase).
//
// Builds the single "what is this patient's ophthalmic status?" object shown at the top of
// the patient file. Rules:
//   * every field is either a real recorded value (with the date it was recorded) or null --
//     the UI prints "غير مسجل" for null; nothing is estimated, defaulted or inferred;
//   * eye-specific diagnoses come only from structured sources (Core diagnosis laterality,
//     exam.ophth.dx); free text is never parsed for laterality;
//   * it works with any subset of the inputs, including none.

import { vaOf, iopOf, metricOf, refractionOf, examOphth, plainText } from './ophth.js';
import { buildLongitudinal, injectionEyes, normalizeInjections, injectionStats, THRESHOLDS, describeChange, daysBetween, METRIC_LABEL } from './longitudinal.js';
import { buildInvestigationLinks, statusGroup } from './investigation-links.js';

export const NOT_RECORDED = 'غير مسجل';
export const show = v => (v == null || String(v).trim() === '' ? NOT_RECORDED : String(v));

const str = v => (v == null ? '' : String(v));
const present = v => v !== undefined && v !== null && String(v).trim() !== '';
const day = v => str(v).slice(0, 10);
const validDay = d => /^\d{4}-\d{2}-\d{2}$/.test(d);

export function lateralityToEye(v) {
  const t = str(v).trim().toLowerCase();
  if (!t) return null;
  if (['od', 'r', 're', 'right', 'يمنى', 'اليمنى', 'العين اليمنى'].includes(t) || t.includes('right')) return 'od';
  if (['os', 'l', 'le', 'left', 'يسرى', 'اليسرى', 'العين اليسرى'].includes(t) || t.includes('left')) return 'os';
  if (['ou', 'both', 'bilateral', 'كلتا العينين', 'العينين'].includes(t) || t.includes('both') || t.includes('كلتا')) return 'ou';
  return null;
}

const INACTIVE_DX = ['resolved', 'inactive', 'ruled_out', 'ruled out', 'cancelled', 'canceled', 'closed'];
const newestFirst = (a, b) => str(b.date).localeCompare(str(a.date));

// Latest value per eye over exams (newest first). Returns { od: {value, raw, date, examId}, os: ... }
function latestPerEye(exams, pick) {
  const sorted = [...exams].filter(e => e && typeof e === 'object')
    .sort((a, b) => (str(b.date) + str(b.time)).localeCompare(str(a.date) + str(a.time)));
  const out = { od: null, os: null };
  for (const eye of ['od', 'os']) {
    for (const e of sorted) {
      const v = pick(e, eye);
      if (v && present(v.raw)) { out[eye] = { ...v, date: day(e.date), examId: e.id }; break; }
    }
  }
  return out;
}

function collectDiagnoses({ exams, coreFile }) {
  const entries = [];
  const list = Array.isArray(coreFile && coreFile.diagnoses) ? coreFile.diagnoses : [];
  for (const d of list) {
    if (!d || typeof d !== 'object') continue;
    const text = str(d.diagnosis || d.diagnosis_name || d.name).trim();
    if (!text) continue;
    if (INACTIVE_DX.includes(str(d.status).trim().toLowerCase())) continue;
    entries.push({ text, eye: lateralityToEye(d.laterality), date: day(d.created_at || d.diagnosed_at || d.diagnosis_date), source: 'core', primary: d.is_primary === true });
  }
  for (const e of exams) {
    if (!e || typeof e !== 'object') continue;
    const o = examOphth(e);
    const date = day(e.date);
    for (const eye of ['od', 'os', 'ou']) if (present(o.dx[eye])) entries.push({ text: o.dx[eye].trim(), eye, date, source: 'exam', primary: false });
    const flat = plainText(e.diagnosis).trim();
    if (flat) entries.push({ text: flat, eye: null, date, source: 'exam', primary: true });
  }
  return entries;
}

function pickDiagnosis(entries) {
  const rank = e => (e.source === 'exam' ? 1 : 0);
  const best = (list) => [...list].sort((a, b) => newestFirst(a, b) || rank(b) - rank(a))[0] || null;
  const unspecified = entries.filter(e => !e.eye);
  const primaryPool = unspecified.filter(e => e.primary);
  return {
    primary: best(primaryPool.length ? primaryPool : unspecified),
    od: best(entries.filter(e => e.eye === 'od')),
    os: best(entries.filter(e => e.eye === 'os')),
    ou: best(entries.filter(e => e.eye === 'ou'))
  };
}

function nextFollowUp({ exams, visits, coreFile, injections, appointments, today }) {
  const cands = [];
  const lastExam = [...exams].filter(e => e && day(e.date)).sort((a, b) => str(b.date).localeCompare(str(a.date)))[0];
  for (const e of exams) {
    const d = day(e && e.followUp);
    if (validDay(d)) cands.push({ date: d, reason: str(examOphth(e).plan.followUpReason).trim(), source: 'exam', ref: e.date });
  }
  for (const f of Array.isArray(coreFile && coreFile.followups) ? coreFile.followups : []) {
    const d = day(f && f.followup_date);
    const st = str(f && f.status).trim().toLowerCase();
    if (validDay(d) && !['cancelled', 'canceled', 'done', 'completed', 'missed'].includes(st)) cands.push({ date: d, reason: str(f.reason).trim(), source: 'core', ref: day(f.created_at) });
  }
  for (const v of visits) {
    const d = day(v && v.nextVisit);
    if (validDay(d)) cands.push({ date: d, reason: '', source: 'visit', ref: v.date });
  }
  for (const x of injections) {
    const d = day(x && x.nextDate);
    if (validDay(d)) cands.push({ date: d, reason: 'حقنة قادمة (' + str(x.drug) + ')', source: 'injection', ref: x.date });
  }
  for (const a of appointments) {
    const d = day(a && a.date);
    if (validDay(d) && d >= today && !a.cancelled && a.status !== 'cancelled' && a.waitStatus !== 'cancelled') cands.push({ date: d, reason: str(a.type), source: 'appointment', ref: d, time: str(a.time) });
  }
  const future = cands.filter(c => c.date >= today).sort((a, b) => a.date.localeCompare(b.date));
  if (future.length) {
    const c = future[0];
    return { ...c, overdue: false, daysUntil: daysBetween(today, c.date) };
  }
  // Nothing upcoming: report the most recent planned date only if no visit/exam happened on or after it.
  const lastEncounter = [...visits.map(v => day(v && v.date)), ...exams.map(e => day(e && e.date))].filter(validDay).sort().pop() || '';
  const past = cands.filter(c => c.date < today && (!lastEncounter || lastEncounter < c.date)).sort((a, b) => b.date.localeCompare(a.date));
  if (past.length) return { ...past[0], overdue: true, daysUntil: daysBetween(today, past[0].date) };
  return null;
}

export function buildClinicalSummary({
  patient = null, exams = [], visits = [], requests = [], rxList = [], images = [], imagingOrders = [],
  coreFile = null, injections = [], appointments = [], today = ''
} = {}) {
  const ex = Array.isArray(exams) ? exams.filter(e => e && typeof e === 'object' && !Array.isArray(e.requestedTests)) : [];
  const vs = Array.isArray(visits) ? visits.filter(v => v && typeof v === 'object') : [];
  const rx = Array.isArray(rxList) ? rxList.filter(r => r && typeof r === 'object') : [];
  const allInj = Array.isArray(injections) ? injections.filter(x => x && (!patient || x.patientId === patient.id)) : [];
  const apts = Array.isArray(appointments) ? appointments.filter(a => a && (!patient || a.patientId === patient.id)) : [];

  const va = latestPerEye(ex, (e, eye) => { const v = vaOf(e, eye); return v.bcva ? { raw: v.bcva, ucva: v.ucva, ph: v.ph, kind: 'BCVA' } : null; });
  const ucva = latestPerEye(ex, (e, eye) => { const v = vaOf(e, eye); return v.ucva ? { raw: v.ucva } : null; });
  const iop = latestPerEye(ex, (e, eye) => { const v = iopOf(e, eye); return v.raw ? { raw: v.raw, value: v.value, method: examOphth(e).iop.method.trim() } : null; });
  const cmt = latestPerEye(ex, (e, eye) => { const v = metricOf(e, 'cmt', eye); return v.raw ? { raw: v.raw, value: v.value } : null; });
  const cd = latestPerEye(ex, (e, eye) => { const v = metricOf(e, 'cd', eye); return v.raw ? { raw: v.raw, value: v.value } : null; });
  const vfMd = latestPerEye(ex, (e, eye) => { const v = metricOf(e, 'vfMd', eye); return v.raw ? { raw: v.raw, value: v.value } : null; });
  const refraction = latestPerEye(ex, (e, eye) => { const r = refractionOf(e, eye); const raw = [r.sph, r.cyl && 'x ' + r.cyl, r.axis && '@ ' + r.axis].filter(Boolean).join(' '); return raw ? { raw, ...r } : null; });

  const dxEntries = collectDiagnoses({ exams: ex, coreFile });
  const dx = pickDiagnosis(dxEntries);

  const lastVisitRec = [...vs].filter(v => v && day(v.date)).sort((a, b) => str(b.date).localeCompare(str(a.date)))[0] || null;
  const latestExam = [...ex].filter(e => day(e.date)).sort((a, b) => (str(b.date) + str(b.time)).localeCompare(str(a.date) + str(a.time)))[0] || null;
  const lastRx = [...rx].filter(r => r && day(r.date)).sort((a, b) => str(b.date).localeCompare(str(a.date)))[0] || null;

  const injNorm = normalizeInjections(allInj, patient ? patient.id : null);
  const lastInj = {};
  for (const eye of ['od', 'os']) { const s = injectionStats(injNorm[eye]); lastInj[eye] = s.last ? { date: s.last.date, drug: s.last.drug, doseNo: s.last.doseNo, count: s.count } : null; }

  const coreTreatments = (Array.isArray(coreFile && coreFile.treatments) ? coreFile.treatments : [])
    .filter(t => t && present(t.treatment || t.treatment_name || t.name))
    .sort((a, b) => str(b.created_at).localeCompare(str(a.created_at)));
  const planText = latestExam ? plainText(latestExam.treatmentPlan).trim() : '';
  const treatment = {
    plan: planText ? { text: planText, date: day(latestExam.date), source: 'exam' } : null,
    core: coreTreatments[0] ? { text: str(coreTreatments[0].treatment || coreTreatments[0].treatment_name || coreTreatments[0].name).trim(), eye: lateralityToEye(coreTreatments[0].eye), date: day(coreTreatments[0].created_at) } : null,
    rx: lastRx && present(lastRx.medicines) ? { date: day(lastRx.date), text: str(lastRx.medicines).trim() } : null,
    injections: lastInj
  };
  const hasTreatment = !!(treatment.plan || treatment.core || treatment.rx || lastInj.od || lastInj.os);

  const links = buildInvestigationLinks({ requests, images, imagingOrders, visits: vs, today });
  const pending = links.chains.filter(c => c.statusGroup === 'pending').map(c => ({
    key: c.key, tests: c.tests, eyes: c.eyes, date: c.orderedDate, days: c.pendingDays, why: c.why, doctor: c.orderedBy
  }));

  const followUp = nextFollowUp({ exams: ex, visits: vs, coreFile, injections: allInj, appointments: apts, today });
  const trend = buildLongitudinal({ exams: ex, injections: allInj, patientId: patient ? patient.id : null });

  // ---- alerts: each one is a recorded fact, phrased neutrally -----------------------------------
  const alerts = [];
  if (patient && present(patient.allergies)) alerts.push({ id: 'allergy', level: 'danger', text: 'حساسية: ' + str(patient.allergies).trim() });
  for (const eye of ['od', 'os']) {
    const r = iop[eye];
    if (r && r.value != null && r.value > THRESHOLDS.iopHigh) alerts.push({ id: 'iop-' + eye, level: 'warn', text: `IOP مرتفع ${eye.toUpperCase()}: ${r.raw} mmHg (${r.date || 'بدون تاريخ'})` });
  }
  if (followUp && followUp.overdue) alerts.push({ id: 'followup-overdue', level: 'warn', text: `موعد متابعة متأخر (${followUp.date}) ولا توجد زيارة بعده` });
  const oldPending = pending.filter(p => p.days != null && p.days > 14);
  if (oldPending.length) alerts.push({ id: 'pending-old', level: 'warn', text: `${oldPending.length} طلب فحص معلّق منذ أكثر من 14 يومًا` });
  if (links.chains.some(c => c.gaps.includes('core-sync-pending'))) alerts.push({ id: 'core-sync', level: 'info', text: 'طلب فحص لم يُزامَن مع السجل المركزي بعد' });
  for (const c of trend.changes.filter(c => c.significant && c.favorable === false)) {
    alerts.push({ id: `trend-${c.metric}-${c.eye}`, level: 'warn', text: `${METRIC_LABEL[c.metric]} ${c.eye.toUpperCase()}: ${describeChange(c)}` });
  }

  // ---- what is missing, for the "غير مسجل" states and completeness hint -------------------------------
  const missing = [];
  if (!patient || !present(patient.patientCode)) missing.push('patientCode');
  if (!patient || !(patient.age || patient.age === 0)) missing.push('age');
  if (!patient || !present(patient.gender)) missing.push('gender');
  if (!lastVisitRec) missing.push('lastVisit');
  if (!dx.primary && !dx.od && !dx.os && !dx.ou) missing.push('diagnosis');
  if (!va.od && !va.os) missing.push('va');
  if (!iop.od && !iop.os) missing.push('iop');
  if (!cmt.od && !cmt.os) missing.push('cmt');
  if (!hasTreatment) missing.push('treatment');
  if (!followUp) missing.push('followUp');

  return {
    identity: {
      name: patient ? str(patient.name) : '', code: patient ? str(patient.patientCode) : '', age: patient && (patient.age || patient.age === 0) ? patient.age : null,
      gender: patient ? str(patient.gender) : '', phone: patient ? str(patient.phone) : ''
    },
    lastVisit: lastVisitRec ? { date: day(lastVisitRec.date), type: str(lastVisitRec.type), doctor: str(lastVisitRec.doctor) } : null,
    latestExamDate: latestExam ? day(latestExam.date) : null,
    diagnosis: dx,
    va, ucva, iop, cmt, cd, vfMd, refraction,
    treatment: hasTreatment ? treatment : null,
    followUp,
    pending,
    alerts,
    missing,
    trend: { status: trend.status, changes: trend.changes, treatment: trend.treatment, progression: trend.progression, sufficiency: trend.sufficiency },
    counts: { exams: ex.length, visits: vs.length, requests: Array.isArray(requests) ? requests.length : 0, images: Array.isArray(images) ? images.length : 0, rx: rx.length, injections: allInj.length }
  };
}

export { injectionEyes, statusGroup };
