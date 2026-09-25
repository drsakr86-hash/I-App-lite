// Pure builder: imaging request (list of tests) -> iapp_create_investigation_workflow_order params.
export function imagingRequestParams({ patientId, visitId = null, tests, requestNotes, doctorName, sourceLegacyId }) {
  const eyes = [...new Set(tests.map(t => t.eye).filter(Boolean))];
  return {
    p_patient_id: Number(patientId),
    p_visit_id: visitId,
    p_investigation_type: 'imaging',
    p_test_name: tests.map(t => t.name || t.name_ar || t.id).join(' + '),
    p_eye: eyes.length === 1 ? eyes[0] : 'OU',
    p_priority: 'routine',
    p_requested_by: doctorName || '',
    p_doctor_name: doctorName || '',
    p_clinical_note: requestNotes || '',
    p_tests: tests,
    p_source_exam_legacy_id: String(sourceLegacyId)
  };
}

// Pure builder: single imaging upload -> iapp_create_investigation_workflow_order params.
export function singleImagingOrderParams({ patientId, typeName, type, eye, doctorName, notes, sourceLegacyId }) {
  return {
    p_patient_id: Number(patientId),
    p_visit_id: null,
    p_investigation_type: 'imaging',
    p_test_name: typeName,
    p_eye: eye || null,
    p_priority: 'routine',
    p_requested_by: doctorName || '',
    p_doctor_name: doctorName || '',
    p_clinical_note: String(notes || '').trim() || null,
    p_tests: [{ id: type, name: typeName, eye }],
    p_source_exam_legacy_id: String(sourceLegacyId)
  };
}
