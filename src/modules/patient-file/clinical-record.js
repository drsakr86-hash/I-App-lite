// Package A: per-eye findings, draft/signed state and amendments for an examination (pure + thin RPC wrappers).
// Local exam fields (mirrored from the server, which is the authority):
//   recStatus 'signed' | undefined, recVersion, signedAt, signedBy, amendments[{v,at,by,reason}]
// A record with no recStatus is legacy/draft: it is never auto-signed and no author is invented.
import { examOphth, ANTERIOR_PARTS, POSTERIOR_PARTS } from './ophth.js';

const str = v => (v == null ? '' : String(v).trim());

export const isSigned = exam => !!exam && exam.recStatus === 'signed';
export const examStatus = exam => (isSigned(exam) ? 'signed' : exam && exam.recStatus === 'draft' ? 'draft' : 'legacy');
export const canSignExam = role => role === 'admin' || role === 'doctor';
export const MIN_AMEND_REASON = 5;
export const validAmendReason = r => str(r).length >= MIN_AMEND_REASON;

// One eye's findings only: nothing from the other eye is ever mixed in.
export function eyeFindings(exam, eye) {
  const e = eye === 'os' ? 'os' : 'od';
  const flat = e === 'od' ? { va: exam && exam.visualAcuityR, iop: exam && exam.iopR } : { va: exam && exam.visualAcuityL, iop: exam && exam.iopL };
  const o = examOphth(exam);
  const pick = (parts, group) => Object.fromEntries(parts.map(([k]) => [k, str(o[group][k] && o[group][k][e])]));
  return {
    va: str(flat.va), ucva: str(o.va[e].ucva), ph: str(o.va[e].ph), iop: str(flat.iop),
    refraction: { sph: str(o.refraction[e].sph), cyl: str(o.refraction[e].cyl), axis: str(o.refraction[e].axis) },
    anterior: pick(ANTERIOR_PARTS, 'anterior'), posterior: pick(POSTERIOR_PARTS, 'posterior'),
    cd: str(o.cd[e]), cmt: str(o.cmt[e]), vfMd: str(o.vfMd[e]), dx: str(o.dx[e])
  };
}

export const withEyeFindings = exam => ({ ...exam, findingsOd: eyeFindings(exam, 'od'), findingsOs: eyeFindings(exam, 'os') });

// Column names of iapp_amend_examination (only fields the form edits).
export function amendChanges(exam) {
  const x = withEyeFindings(exam);
  return {
    visual_acuity_od: str(x.visualAcuityR), visual_acuity_os: str(x.visualAcuityL),
    iop_od: str(x.iopR), iop_os: str(x.iopL),
    anterior_segment: str(x.anteriorSegment), posterior_segment: str(x.posteriorSegment),
    color_vision: str(x.colorVision), contrast: str(x.contrast), cover_test: str(x.coverTest),
    notes: str(x.notes), diagnosis_summary: str(x.diagnosis), treatment_plan: str(x.treatmentPlan),
    followup_date: str(x.followUp).slice(0, 10), findings_od: x.findingsOd, findings_os: x.findingsOs
  };
}

const errText = e => (e && (e.message || e.hint || e.details)) || String(e || 'error');

export async function signExamination(call, exam) {
  const r = await call('iapp_sign_examination', { p_legacy_id: String(exam.id) });
  return r && r.error ? { ok: false, error: errText(r.error) } : { ok: true, result: r.data };
}

export async function amendExamination(call, exam, reason) {
  if (!validAmendReason(reason)) return { ok: false, error: 'reason' };
  const r = await call('iapp_amend_examination', { p_legacy_id: String(exam.id), p_changes: amendChanges(exam), p_reason: str(reason) });
  return r && r.error ? { ok: false, error: errText(r.error) } : { ok: true, result: r.data };
}

export const signedFields = (result, email) => ({
  recStatus: 'signed', recVersion: Number(result && result.version_no) || 1,
  signedAt: (result && result.signed_at) || new Date().toISOString(), signedBy: (result && result.signed_by) || email || ''
});

export const withAmendment = (exam, result, email, reason, now = new Date().toISOString()) => {
  const v = Number(result && result.version_no) || (Number(exam.recVersion) || 1) + 1;
  return { ...exam, recStatus: 'signed', recVersion: v, amendments: [...(exam.amendments || []), { v, at: now, by: email || '', reason: str(reason) }] };
};
