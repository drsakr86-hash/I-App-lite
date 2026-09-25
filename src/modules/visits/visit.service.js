import { rpc } from '../../services/rpc.js';

const WRITE = { timeoutMs: 20000, dedupe: true };

// The deployed function may or may not accept p_legacy_id. Try the fuller
// call first and retry without it only when PostgREST reports an unknown
// function/parameter shape (same behaviour as the legacy runtime).
export async function createClinicalVisit(client, {
  patientId,
  appointmentId = null,
  doctorName = null,
  visitDate,
  visitType = 'clinic',
  chiefComplaint = null,
  clinicalSummary = null,
  notes = null,
  status = 'completed',
  legacyId = null
}) {
  const params = {
    p_patient_id: Number(patientId),
    p_appointment_id: appointmentId == null ? null : Number(appointmentId),
    p_doctor_name: doctorName,
    p_visit_date: visitDate,
    p_visit_type: visitType,
    p_chief_complaint: chiefComplaint,
    p_clinical_summary: clinicalSummary,
    p_notes: notes,
    p_status: status
  };
  if (legacyId == null) return rpc(client, 'iapp_create_clinical_visit', params, WRITE);
  try {
    return await rpc(client, 'iapp_create_clinical_visit', { ...params, p_legacy_id: String(legacyId) }, WRITE);
  } catch (error) {
    const msg = String(error?.message || error?.hint || '');
    const unknownShape = error?.code === 'PGRST202' ||
      /p_legacy_id|could not find|does not exist|no function matches/i.test(msg);
    if (!unknownShape) throw error;
    return rpc(client, 'iapp_create_clinical_visit', params, WRITE);
  }
}
