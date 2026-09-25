import { rpc } from '../../services/rpc.js';

export async function createInvestigationWorkflow(client, {
  patientId, visitId = null, investigationType = 'imaging', testName = null,
  eye = null, priority = 'routine', requestedBy = null, doctorName = null,
  clinicalNote = null, tests = [], sourceExamLegacyId = null
}) {
  return rpc(client, 'iapp_create_investigation_workflow_order', {
    p_patient_id: Number(patientId),
    p_visit_id: visitId == null ? null : Number(visitId),
    p_investigation_type: investigationType,
    p_test_name: testName,
    p_eye: eye,
    p_priority: priority,
    p_requested_by: requestedBy,
    p_doctor_name: doctorName,
    p_clinical_note: clinicalNote,
    p_tests: tests || [],
    p_source_exam_legacy_id: sourceExamLegacyId == null ? null : String(sourceExamLegacyId)
  }, { timeoutMs: 20000, dedupe: true });
}

export async function completeInvestigation(client, orderId, resultSummary = null) {
  return rpc(client, 'iapp_complete_investigation_order', {
    p_order_id: Number(orderId),
    p_result_summary: resultSummary
  }, { timeoutMs: 20000, dedupe: true });
}
