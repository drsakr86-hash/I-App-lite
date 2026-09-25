import { rpc } from '../../services/rpc.js';

export async function createPrescriptionCore(client, {
  patientId, prescriptionDate, visitId = null, eye = null,
  sphOd = null, cylOd = null, axisOd = null,
  sphOs = null, cylOs = null, axisOs = null,
  addPower = null, medicines = [], notes = null,
  legacyId = null, prescriptionType = 'mixed'
}) {
  return rpc(client, 'iapp_create_prescription_core', {
    p_patient_id: Number(patientId),
    p_prescription_date: prescriptionDate,
    p_visit_id: visitId == null ? null : Number(visitId),
    p_eye: eye,
    p_sph_od: sphOd, p_cyl_od: cylOd, p_axis_od: axisOd,
    p_sph_os: sphOs, p_cyl_os: cylOs, p_axis_os: axisOs,
    p_add_power: addPower,
    p_medicines: medicines || [],
    p_notes: notes,
    p_legacy_id: legacyId == null ? null : String(legacyId),
    p_prescription_type: prescriptionType
  }, { timeoutMs: 20000, dedupe: true });
}
