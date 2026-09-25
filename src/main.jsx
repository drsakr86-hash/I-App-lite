import React from 'react';
import ReactDOM from 'react-dom/client';
import { createClient } from '@supabase/supabase-js';
import './styles/legacy.css';
import { getSupabaseClient, SUPABASE_URL, SUPABASE_KEY } from './services/supabase.js';
import { ensureSession } from './services/auth.js';
import { rpcSafe } from './services/rpc.js';
import { getPatient360, mapPatient360ToLegacyView } from './modules/patients/index.js';
import { createClinicalVisit } from './modules/visits/index.js';
import { syncExaminationCore } from './modules/examinations/index.js';
import { createPrescriptionCore, prescriptionParamsFromLegacy } from './modules/prescriptions/index.js';
import { createInvestigationWorkflow, completeInvestigation, imagingRequestParams, singleImagingOrderParams } from './modules/investigations/index.js';
import { createImagingStudy, imagingStudyParams } from './modules/imaging/index.js';
import { appointmentFromRow, appointmentToRow, diffAppointments } from './modules/appointments/index.js';
import { can, ROLES } from './app/permissions.js';
import { normalizeFileMeta, resolveFileUrl } from './services/storage.js';

// Migration bridge: keep the proven production runtime intact while the
// build system and service layer move to Vite. The legacy runtime reaches the
// new services only through globalThis.IAppModules and always keeps a
// fallback to its own inline implementation if a module is missing.
globalThis.React = React;
globalThis.ReactDOM = ReactDOM;
globalThis.supabase = { createClient };
// One shared Supabase client (legacy getSB() reuses this instance).
getSupabaseClient();

globalThis.IAppModules = globalThis.IAppModules || {};
globalThis.IAppModules.services = { supabase: getSupabaseClient() };
// rpc.safe never throws: resolves to { data, error } like supabase-js.
globalThis.IAppModules.rpc = { safe: rpcSafe };
globalThis.IAppModules.patients = { getPatient360, mapPatient360ToLegacyView };
globalThis.IAppModules.visits = { createClinicalVisit };
globalThis.IAppModules.examinations = { syncExaminationCore };
globalThis.IAppModules.prescriptions = { createPrescriptionCore, paramsFromLegacy: prescriptionParamsFromLegacy };
globalThis.IAppModules.investigations = { createInvestigationWorkflow, completeInvestigation, imagingRequestParams, singleImagingOrderParams };
globalThis.IAppModules.imaging = { createImagingStudy, studyParams: imagingStudyParams };

globalThis.IAppModules.appointments = { fromRow: appointmentFromRow, toRow: appointmentToRow, diff: diffAppointments };
globalThis.IAppModules.auth = {
  can,
  ROLES,
  // Verifies (and repairs) the login session before a sync reads or writes.
  ensureSession: () => ensureSession(getSupabaseClient(), { url: SUPABASE_URL, apiKey: SUPABASE_KEY })
};
globalThis.IAppModules.storage = { normalizeFileMeta, resolveFileUrl };

const legacyScript = document.createElement('script');
legacyScript.src = import.meta.env.BASE_URL + 'legacy/app-runtime.js';
legacyScript.async = false;
legacyScript.onload = () => console.log('I-App legacy runtime loaded');
legacyScript.onerror = (e) => console.error('I-App legacy runtime failed to load', e);
document.body.appendChild(legacyScript);

// Offline support (production build only; the dev server must not be cached).
if (import.meta.env.PROD && 'serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(import.meta.env.BASE_URL + 'sw.js?v=20260926')
      .catch(e => console.warn('SW register failed', e));
  });
}
