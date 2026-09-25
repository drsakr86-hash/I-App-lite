import { rpc } from '../../services/rpc.js';

export async function syncExaminationCore(client, examination, patientCode = null) {
  return rpc(client, 'iapp_sync_examination_core', {
    p_exam: examination || {},
    p_patient_code: patientCode == null ? null : String(patientCode)
  }, { timeoutMs: 20000, dedupe: true });
}
