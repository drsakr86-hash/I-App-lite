// Pure builder: legacy prescription record -> iapp_create_prescription_core params.
export function prescriptionParamsFromLegacy(rx, { visitId = null, today = '' } = {}) {
  return {
    p_patient_id: Number(rx.patientId),
    p_prescription_date: rx.date || today,
    p_visit_id: visitId,
    p_eye: rx.eye || 'OU',
    p_sph_od: rx.sphR || null, p_cyl_od: rx.cylR || null, p_axis_od: rx.axisR || null,
    p_sph_os: rx.sphL || null, p_cyl_os: rx.cylL || null, p_axis_os: rx.axisL || null,
    p_add_power: rx.add || null,
    p_medicines: Array.isArray(rx.medicines) ? rx.medicines : (rx.medicines ? [{ name: rx.medicines }] : []),
    p_notes: rx.notes || null,
    p_legacy_id: String(rx.id),
    p_prescription_type: 'mixed'
  };
}
