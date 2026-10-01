import { mapCoreExams, mapCoreVisits, mapCoreRx } from '../patient-file/normalize.js';

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

// Kept for the IAppModules.patients bridge. The single canonical mapping lives in
// src/modules/patient-file/normalize.js; this delegates to it so the two can never diverge.
export function mapPatient360ToLegacyView(file, patient = {}) {
  return {
    coreExams: mapCoreExams(file, patient),
    coreVisits: mapCoreVisits(file, patient),
    coreRx: mapCoreRx(file, patient)
  };
}
