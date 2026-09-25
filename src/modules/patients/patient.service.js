const DEFAULT_TIMEOUT_MS = 6000;

function withTimeout(promise, ms = DEFAULT_TIMEOUT_MS, label = 'Patient request') {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timeout`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

export async function getPatient360(client, patientCode, options = {}) {
  if (!client) throw new Error('Supabase client is required');
  const code = String(patientCode || '').trim();
  if (!code) throw new Error('Patient code is required');

  const timeoutMs = Number(options.timeoutMs || DEFAULT_TIMEOUT_MS);
  const attempts = [
    ['iapp_get_patient_360_timeline', '360'],
    ['iapp_get_patient_file_summary', 'summary'],
    ['iapp_get_patient_file_by_code', 'legacy']
  ];

  let lastError = null;
  for (const [rpcName, source] of attempts) {
    try {
      const result = await withTimeout(
        client.rpc(rpcName, { p_patient_code: code }),
        timeoutMs,
        rpcName
      );
      if (result.error) throw result.error;
      if (result.data?.found) {
        const raw = result.data;
        return {
          ...raw,
          ...(raw.patient || {}),
          _source: source,
          _loadedAt: new Date().toISOString()
        };
      }
      lastError = new Error(`${rpcName}: patient not found`);
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError || new Error('Patient 360 unavailable');
}

export function mapPatient360ToLegacyView(file, patient = {}) {
  const safe = file || {};
  const coreExams = (safe.examinations || []).map(e => ({
    id: e.legacy_id && /^\d+$/.test(String(e.legacy_id)) ? Number(e.legacy_id) : e.id,
    patientId: patient.id,
    date: e.examination_date || String(e.created_at || '').slice(0, 10),
    doctor: e.doctor_name || '',
    visualAcuityR: e.visual_acuity_od || '',
    visualAcuityL: e.visual_acuity_os || '',
    iopR: e.iop_od || '',
    iopL: e.iop_os || '',
    anteriorSegment: e.anterior_segment || '',
    posteriorSegment: e.posterior_segment || '',
    colorVision: e.color_vision || '',
    contrast: e.contrast || '',
    coverTest: e.cover_test || '',
    diagnosis: e.diagnosis_summary || '',
    treatmentPlan: e.treatment_plan || '',
    followUp: e.followup_date || '',
    notes: e.notes || '',
    _core: true
  }));

  const coreVisits = (safe.visits || []).map(v => ({
    id: v.id,
    patientId: patient.id,
    date: v.visit_date || String(v.created_at || '').slice(0, 10),
    type: v.visit_type || 'visit',
    doctor: v.doctor_name || '',
    complaint: v.chief_complaint || '',
    result: v.clinical_summary || '',
    notes: v.notes || '',
    cost: v.cost || 0,
    paid: !!v.paid,
    nextVisit: v.next_visit || '',
    _core: true,
    _coreId: v.id
  }));

  const coreRx = (safe.prescriptions || []).map(r => ({
    id: r.legacy_id && /^\d+$/.test(String(r.legacy_id)) ? Number(r.legacy_id) : r.id,
    patientId: patient.id,
    date: r.prescription_date || r.date || '',
    eye: r.eye || 'OU',
    sphR: r.sph_od || r.sphR || '', sphL: r.sph_os || r.sphL || '',
    cylR: r.cyl_od || r.cylR || '', cylL: r.cyl_os || r.cylL || '',
    axisR: r.axis_od || r.axisR || '', axisL: r.axis_os || r.axisL || '',
    add: r.add_power || r.add || '',
    medicines: r.medicines || [],
    notes: r.notes || '',
    patient: patient.name,
    _core: true
  }));

  return { coreExams, coreVisits, coreRx };
}
