// Patient-facing summary (view-model only; pure: no React/DOM/Supabase).
//
// What a patient needs to know after a visit, in plain Arabic: when to come back, what treatment
// they are on, which medicines to use, which tests are still due, and what to do next.
// It is built ONLY from recorded data and never includes clinician-only content (internal
// notes, billing, alerts, trend verdicts, other patients). Missing parts are omitted or marked
// "لم يُسجَّل بعد" -- never filled in.
//
// IMPORTANT: this is not wired to the patient portal. The portal stays disabled until a
// patient-scoped server function exists (docs/SECURITY-RELEASE-CHECKLIST.md). It is used for the
// printable visit summary and is ready for the portal once the backend allows it.

import { buildClinicalSummary } from './clinical-summary.js';
import { t, getLang } from '../i18n/index.js';
import { tv } from '../i18n/tv.js';

const sepList = () => (getLang() === 'en' ? ', ' : '، ');
const str = v => (v == null ? '' : String(v).trim());

export function medicineLines(rx) {
  if (!rx) return [];
  const raw = rx.medicines;
  if (Array.isArray(raw)) {
    return raw.map(m => (m && typeof m === 'object' ? [m.name, m.dose, m.duration].map(str).filter(Boolean).join(' — ') : str(m))).filter(Boolean);
  }
  return str(raw).split(/\r?\n/).map(s => s.trim()).filter(Boolean);
}

export function buildPatientFacingSummary(input = {}) {
  const s = buildClinicalSummary(input);
  const rxList = Array.isArray(input.rxList) ? input.rxList.filter(r => r && typeof r === 'object' && str(r.date)) : [];
  const lastRx = [...rxList].sort((a, b) => str(b.date).localeCompare(str(a.date)))[0] || null;
  const meds = medicineLines(lastRx);

  const returnWhen = s.followUp
    ? (s.followUp.overdue
      ? { date: s.followUp.date, text: t('g1.pf.overdue', { date: s.followUp.date }) }
      : { date: s.followUp.date, text: t('g1.pf.nextVisit', { date: s.followUp.date }) + (s.followUp.reason ? ' — ' + tv(s.followUp.reason) : '') + '.' })
    : { date: null, text: t('g1.pf.noFollowUp') };

  const treatment = [];
  if (s.treatment && s.treatment.plan) treatment.push(s.treatment.plan.text);
  if (s.treatment) for (const eye of ['od', 'os']) {
    const inj = s.treatment.injections[eye];
    if (inj) treatment.push(t(eye === 'od' ? 'g1.pf.injOd' : 'g1.pf.injOs', { date: inj.date }));
  }

  const tests = s.pending.map(p => ({
    name: p.tests.map(x => tv(x)).join(sepList()),
    note: p.why || '',
    text: t('g1.pf.required') + ': ' + p.tests.map(x => tv(x)).join(sepList()) + (p.date ? ' (' + t('g1.pf.requestedOn', { date: p.date }) + ')' : '')
  }));

  const nextSteps = [];
  if (tests.length) nextSteps.push(t('g1.pf.stepTests'));
  if (meds.length) nextSteps.push(t('g1.pf.stepMeds'));
  if (returnWhen.date && !(s.followUp && s.followUp.overdue)) nextSteps.push(t('g1.pf.stepAttend'));
  if (s.followUp && s.followUp.overdue) nextSteps.push(t('g1.pf.stepContact'));

  return {
    name: s.identity.name,
    lastVisit: s.lastVisit ? s.lastVisit.date : null,
    diagnosis: s.diagnosis.primary ? s.diagnosis.primary.text : null,
    treatment: treatment.length ? treatment : null,
    medicines: meds.length ? { date: lastRx.date, lines: meds } : null,
    tests,
    returnWhen,
    nextSteps,
    emergency: t('g1.pf.emergency'),
    notRecorded: t('g1.pf.notYet')
  };
}
