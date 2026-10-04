// Core write-through for one examination, split from saveExam() so it can be
// tested with a mocked RPC and so repeated saves do not re-create rows.
//
// Why: iapp_create_diagnosis_core / iapp_create_treatment_core /
// iapp_create_followup_core are create-only RPCs. The previous code called all
// three on EVERY save of an examination, so editing a note on an old exam
// created a second diagnosis, treatment and follow-up row. We now remember (on
// the exam record itself, `_coreSync`) the exact value that was last written
// successfully and only create a row when that value is new or changed.
//
// Each step is independent: one failing step no longer aborts the others, and
// the result lists every step so the UI can report an accurate partial success.
// Nothing here retries automatically -- the RPCs are not known to be idempotent.

import { stripDerived, normalizeOphth } from './ophth.js';

const trim = v => String(v == null ? '' : v).trim();
const DEFAULT_FOLLOWUP_REASON = 'متابعة';
const LATERAL = [['od', 'OD'], ['os', 'OS'], ['ou', 'OU']];

// The server's create RPCs are idempotent on their natural keys (verified against the live
// definitions: diagnosis = visit+text+laterality, treatment = visit+text+eye, follow-up =
// patient+visit+date+reason). The markers below remain as the first line of defence so an
// unchanged value does not even cost a round trip.
function followKeyOf(exam) {
  const followup = trim(exam && exam.followUp).slice(0, 10);
  const reason = trim(normalizeOphth(exam && exam.ophth).plan.followUpReason);
  return { followup, reason, key: followup ? (reason ? followup + '|' + reason : followup) : '' };
}

export function planExamSteps(exam) {
  const prev = (exam && exam._coreSync) || {};
  // The regenerated "تفصيل منظّم" block is mirrored into the exam summary only; the
  // diagnosis/treatment rows sent to Core carry the clinician's own text.
  const diagnosis = trim(stripDerived(exam && exam.diagnosis));
  const treatment = trim(stripDerived(exam && exam.treatmentPlan));
  const f = followKeyOf(exam);
  return {
    diagnosis: diagnosis && diagnosis !== prev.diagnosis ? diagnosis : null,
    treatment: treatment && treatment !== prev.treatment ? treatment : null,
    followup: f.followup && f.key !== prev.followup ? f.followup : null
  };
}

// Eye-specific diagnoses (structured exam.ophth.dx) and the follow-up reason. Kept apart from
// planExamSteps so that function's contract (three keys) is unchanged for old callers.
export function planStructuredSteps(exam) {
  const prev = (exam && exam._coreSync) || {};
  const o = normalizeOphth(exam && exam.ophth);
  const lateral = {};
  for (const [k, label] of LATERAL) {
    const text = trim(o.dx[k]);
    lateral['dx_' + k] = text && text !== prev['dx_' + k] ? { text, laterality: label } : null;
  }
  const f = followKeyOf(exam);
  return { lateral, followupKey: f.key, followupReason: f.reason || DEFAULT_FOLLOWUP_REASON };
}

const errText = e => (e && (e.message || e.hint || e.details)) || String(e || 'error');

// call(name, args) -> { data, error }  (never throws; same contract as iappRpc)
export async function runExamCoreSync({ exam, patientCode = '', call, findVisitId = null }) {
  const steps = [];
  const markers = { ...((exam && exam._coreSync) || {}) };
  const plan = planExamSteps(exam);
  const structured = planStructuredSteps(exam);

  const base = await call('iapp_sync_examination_core', { p_exam: exam, p_patient_code: patientCode });
  if (base.error) {
    steps.push({ name: 'examination', ok: false, error: errText(base.error) });
    return { status: 'failed', coreSynced: false, visitId: null, steps, markers, markersChanged: false, error: steps[0].error };
  }
  steps.push({ name: 'examination', ok: true });

  // iapp_sync_examination_core returns the EXAMINATION row id, not the visit id
  // (verified against the live function definition). Using it as p_visit_id
  // caused FK violations, so the visit is always resolved by its legacy id.
  let visitId = null;
  if (findVisitId) {
    try { visitId = (await findVisitId(`exam:${exam.id}`)) || null; } catch { visitId = null; }
  }

  const run = async (name, rpcName, args, markerKey, markerValue, needsVisit) => {
    if (!markerValue) return;
    if (needsVisit && !visitId) {
      steps.push({ name, ok: false, error: 'no-core-visit' });
      return;
    }
    const r = await call(rpcName, args);
    if (r.error) { steps.push({ name, ok: false, error: errText(r.error) }); return; }
    markers[markerKey] = markerValue;
    steps.push({ name, ok: true });
  };

  await run('diagnosis', 'iapp_create_diagnosis_core', {
    p_visit_id: visitId, p_diagnosis: plan.diagnosis, p_laterality: null, p_is_primary: true, p_status: 'active', p_notes: null
  }, 'diagnosis', plan.diagnosis, true);
  await run('treatment', 'iapp_create_treatment_core', {
    p_visit_id: visitId, p_treatment: plan.treatment, p_eye: null, p_instructions: null, p_notes: null
  }, 'treatment', plan.treatment, true);
  // Eye-specific diagnoses use the existing p_laterality parameter (OD / OS / OU).
  for (const [k] of LATERAL) {
    const l = structured.lateral['dx_' + k];
    if (!l) continue;
    await run('diagnosis-' + k, 'iapp_create_diagnosis_core', {
      p_visit_id: visitId, p_diagnosis: l.text, p_laterality: l.laterality, p_is_primary: false, p_status: 'active', p_notes: null
    }, 'dx_' + k, l.text, true);
  }
  await run('followup', 'iapp_create_followup_core', {
    p_patient_id: Number(exam.patientId), p_followup_date: plan.followup, p_visit_id: visitId,
    p_reason: structured.followupReason, p_notes: null, p_status: 'planned', p_doctor_name: exam.doctor || ''
  }, 'followup', plan.followup ? structured.followupKey : null, false);

  const failed = steps.filter(s => !s.ok);
  return {
    status: failed.length ? 'partial' : 'synced',
    coreSynced: true,
    visitId,
    steps,
    markers,
    markersChanged: JSON.stringify(markers) !== JSON.stringify((exam && exam._coreSync) || {}),
    error: failed.length ? failed.map(s => `${s.name}: ${s.error}`).join(' | ') : null
  };
}

// Device-local copy of the markers. The in-memory exam record can be a render
// behind the iapp_store copy (realtime echo), so the marker map in localStorage
// is merged in as well; it only ever suppresses a duplicate create, never adds one.
const MARKER_KEY = 'iapp_exam_coresync';

export function readExamMarkers(examId, storage = globalThis.localStorage) {
  try {
    const all = JSON.parse(storage.getItem(MARKER_KEY) || '{}');
    const m = all && all[String(examId)];
    return m && typeof m === 'object' ? m : {};
  } catch { return {}; }
}

export function writeExamMarkers(examId, markers, storage = globalThis.localStorage) {
  try {
    const all = JSON.parse(storage.getItem(MARKER_KEY) || '{}') || {};
    all[String(examId)] = markers;
    storage.setItem(MARKER_KEY, JSON.stringify(all));
    return true;
  } catch { return false; }
}
