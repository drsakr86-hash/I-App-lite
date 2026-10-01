// Exact copy of the legacy runtime's createClinicalVisitCore
// (public/legacy/app-runtime.js) -- used by both the Patients and
// PatientFile orchestration (src/modules/patients/patients-orchestration.js
// and src/modules/patient-file/use-patient-file.js) to create a "Core"
// clinical visit row alongside the legacy shadow record.
//
// Deliberately NOT merged with src/modules/visits/visit.service.js's
// createClinicalVisit, a differently-shaped (named-params, throws instead of
// returning {data,error}), currently-unused implementation of the same
// retry-on-unknown-param logic: reusing it here would be an unplanned
// calling-convention/behavior change. Both exist today; unifying them is a
// follow-up noted in the migration roadmap, out of scope for this batch.
import { iappRpc } from '../data-access/index.js';

// Phase 33 fix (H3): iapp_create_clinical_visit is called from several places without
// knowing for certain whether the deployed function accepts p_legacy_id (the review
// could not confirm the live signature). Rather than guessing — which could either
// silently fail forever if the param is required and missing, or break every call if
// added and the function doesn't have it — try the fuller call first and gracefully
// retry without p_legacy_id only if PostgREST reports it doesn't recognize the
// function/parameter shape. This is safe under either real signature.
export async function createClinicalVisitCore(sb, params, legacyId) {
  const withLegacy = { ...params, p_legacy_id: legacyId };
  const first = await iappRpc(sb, 'iapp_create_clinical_visit', withLegacy);
  if (!first.error) return first;
  const msg = String(first.error?.message || first.error?.hint || '');
  const looksLikeUnknownParam = first.error?.code === 'PGRST202' || /p_legacy_id|could not find|does not exist|no function matches/i.test(msg);
  if (!looksLikeUnknownParam) return first;
  console.warn('[iapp_create_clinical_visit] retrying without p_legacy_id (function may not accept it yet):', msg);
  return await iappRpc(sb, 'iapp_create_clinical_visit', params);
}
