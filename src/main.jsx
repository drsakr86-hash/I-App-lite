import React from 'react';
import ReactDOM from 'react-dom/client';
import { HashRouter, useNavigate, useLocation } from 'react-router-dom';
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
import { mergeData, createFlusher, syncStatusView } from './modules/sync/index.js';
import {
  getDailyReportHTML, getPatientFileHTML, getRxHTML, getGlassesHTML,
  getRadiologyHTML, getAccountingReportHTML
} from './modules/print/index.js';
import { appointmentFromRow, appointmentToRow, diffAppointments, finishQueueEntries } from './modules/appointments/index.js';
import { can, ROLES } from './app/permissions.js';
import {
  STAFF_ROLES, SESSION_TTL_REMEMBER, SESSION_TTL_TEMP, publicUser, buildCompactSession,
  isStaffRole, isInvalidStaffSession, isSessionExpired, sessionExpiry,
  mergeFreshStaffSession, staffSessionDrifted, buildStaffSessionRecord, buildPatientSessionRecord
} from './modules/auth/session.js';
import { routeViewFor, pathForRouteView } from './modules/auth/router-view.js';
import {
  nextLoginMode, staffLoginFieldsMissing, patientLoginFieldsMissing,
  findPatientByCodeAndName, patientLoginLockKey
} from './modules/auth/unified-login-view.js';
import WaitingRoomScreen from './screens/WaitingRoom.jsx';
import AppointmentsScreen from './screens/Appointments.jsx';
import DashboardScreen from './screens/Dashboard.jsx';
import PatientsScreen from './screens/Patients.jsx';
import PatientFileScreen from './screens/PatientFile.jsx';
import PrescriptionsScreen from './screens/Prescriptions.jsx';
import RadiologyScreen from './screens/Radiology.jsx';
import ImagingCenterScreen from './screens/ImagingCenter.jsx';
import AccountingScreen from './screens/Accounting.jsx';
import SettingsScreen from './screens/Settings.jsx';
import SecretaryAppScreen from './screens/SecretaryApp.jsx';
import PatientAppScreen from './screens/PatientApp.jsx';
import AppScreen from './screens/App.jsx';
import { normalizeFileMeta, resolveFileUrl } from './services/storage.js';
import { screenPreferenceToStore, isNewScreenPreferred } from './modules/ui/screen-preference.js';
import { THEMES, C, applyTheme, setTheme, useTheme, getTheme } from './modules/theme/index.js';
import * as sharedConstants from './modules/constants/index.js';
import { SC, inp, Field, SecHead, Tag, XRAY_ICON } from './modules/ui/atoms.jsx';
import { getSB, iappRpc } from './modules/data-access/index.js';

// Migration bridge: keep the proven production runtime intact while the
// build system and service layer move to Vite. The legacy runtime reaches the
// new services only through globalThis.IAppModules and always keeps a
// fallback to its own inline implementation if a module is missing.
globalThis.React = React;
globalThis.ReactDOM = ReactDOM;
// Phase 6, batch 2 (real routing, part A): HashRouter needs no server-side
// rewrite rules, so it works as-is on GitHub Pages (unlike a path-based
// BrowserRouter, which would 404 on a hard refresh/direct link without one).
globalThis.HashRouter = HashRouter;
globalThis.useNavigate = useNavigate;
globalThis.useLocation = useLocation;
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

globalThis.IAppModules.sync = { mergeData, createFlusher, syncStatusView };
globalThis.IAppModules.print = {
  getDailyReportHTML, getPatientFileHTML, getRxHTML, getGlassesHTML,
  getRadiologyHTML, getAccountingReportHTML
};
globalThis.IAppModules.appointments = { fromRow: appointmentFromRow, toRow: appointmentToRow, diff: diffAppointments, finishQueue: finishQueueEntries };
globalThis.IAppModules.auth = {
  can,
  ROLES,
  // Verifies (and repairs) the login session before a sync reads or writes.
  ensureSession: () => ensureSession(getSupabaseClient(), { url: SUPABASE_URL, apiKey: SUPABASE_KEY }),
  // Pure session/role decisions used by the legacy UnifiedRouter — see
  // src/modules/auth/session.js. These do not change today's login/session
  // behavior; they only move the logic out of app-runtime.js so it is
  // unit-tested and ready for the eventual standalone auth flow.
  STAFF_ROLES, SESSION_TTL_REMEMBER, SESSION_TTL_TEMP, publicUser, buildCompactSession,
  isStaffRole, isInvalidStaffSession, isSessionExpired, sessionExpiry,
  mergeFreshStaffSession, staffSessionDrifted, buildStaffSessionRecord, buildPatientSessionRecord,
  // Pure routing/login-form decisions used by the legacy UnifiedRouter and
  // UnifiedLogin (Phase 5, part A) — see src/modules/auth/router-view.js and
  // unified-login-view.js. resolveProfile's auto-admin-provisioning and every
  // actual network/Supabase/localStorage call stay untouched in the legacy
  // runtime; nothing here changes today's login/session behavior.
  routeViewFor, nextLoginMode, staffLoginFieldsMissing, patientLoginFieldsMissing,
  findPatientByCodeAndName, patientLoginLockKey,
  // Phase 6, batch 2 (real routing, part A) — maps routeViewFor()'s result to
  // a URL path so UnifiedRouter can keep the address bar in sync with the
  // session-derived view. Doesn't change which component renders.
  pathForRouteView
};
globalThis.IAppModules.screens = { WaitingRoom: WaitingRoomScreen, Appointments: AppointmentsScreen, Dashboard: DashboardScreen, Patients: PatientsScreen, PatientFile: PatientFileScreen, Prescriptions: PrescriptionsScreen, Radiology: RadiologyScreen, ImagingCenter: ImagingCenterScreen, Accounting: AccountingScreen, Settings: SettingsScreen, SecretaryApp: SecretaryAppScreen, PatientApp: PatientAppScreen, App: AppScreen };
globalThis.IAppModules.storage = { normalizeFileMeta, resolveFileUrl };
// Phase 7 — pure decision logic behind useNewScreen()'s default flip; see
// src/modules/ui/screen-preference.js.
// Phase 8, batch 3 — a handful of dependency-light shared UI atoms (a status-
// color lookup, an input-style helper, and three small presentational
// components) that used to be defined inline in app-runtime.js; see
// src/modules/ui/atoms.jsx / atoms-model.js. The legacy runtime now
// delegates to these instead of redefining them, so legacy and every React
// screen reading them via the IAppLegacy bridge share the exact same
// functions/objects.
globalThis.IAppModules.ui = { screenPreferenceToStore, isNewScreenPreferred, SC, inp, Field, SecHead, Tag, XRAY_ICON };
// Phase 8, batch 1 — the shared color theme (was legacy's own C/_theme/
// themeSubs singleton); see src/modules/theme/index.js. The legacy runtime
// now delegates to this module, so `C` is the exact same object everywhere
// (legacy closures and every React screen reading it via the IAppLegacy
// bridge) — nothing about how a component reads or toggles the theme changes.
globalThis.IAppModules.theme = { THEMES, C, applyTheme, setTheme, useTheme, getTheme };
// Phase 8, batch 2 — shared domain constants (clinics, imaging, exam
// catalog, accounting categories, a couple of small standalone helpers)
// that used to be defined inline in app-runtime.js; see
// src/modules/constants/. Spread as one object so the legacy runtime can
// destructure whichever names each spot needs, same as the other bridges.
globalThis.IAppModules.constants = { ...sharedConstants };
// Phase 8, batch 4 — a couple of small, self-contained data-access helpers
// (the lazily-cached Supabase client getter and the RPC wrapper) that used
// to be defined inline in app-runtime.js; see src/modules/data-access/. The
// legacy runtime now delegates to these instead of redefining them. The rest
// of the originally-scoped batch 4 helpers (sbGet/sbSet/sbMutate/trashPut/
// logAudit/saveAutoBackup) turned out to be inseparable from the sync engine
// (SyncStore, the flusher, the dirty/base localStorage caching scheme) that
// Phase 3 deliberately left alone for the same reason -- see the roadmap.
globalThis.IAppModules.db = { getSB, iappRpc };

const legacyScript = document.createElement('script');
legacyScript.src = import.meta.env.BASE_URL + 'legacy/app-runtime.js?v=' + __BUILD_ID__;
legacyScript.async = false;
legacyScript.onload = () => console.log('I-App legacy runtime loaded');
legacyScript.onerror = (e) => console.error('I-App legacy runtime failed to load', e);
document.body.appendChild(legacyScript);

// Offline support (production build only; the dev server must not be cached).
if (import.meta.env.PROD && 'serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(import.meta.env.BASE_URL + 'sw.js?v=20260928')
      .catch(e => console.warn('SW register failed', e));
  });
}
