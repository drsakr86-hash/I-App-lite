// Kiosk sign-in and unified-session storage (Phase 8, final batch). Exact
// copy of the legacy runtime's sbSession/ensureKiosk/clearAllSessions/
// loadValidSession (public/legacy/app-runtime.js) -- the parts of the login/
// session-restore flow that read/write storage or talk to Supabase. The pure
// decisions these lean on (expiry, drift, role shape) already live in
// src/modules/auth/session.js.
import { getSB } from '../data-access/index.js';
import { offlineNow, SyncStore } from '../sync/engine.js';
import { KIOSK_EMAIL, getUsers } from './staff-login.js';
import { emailKey } from '../constants/misc.js';
import {
  STAFF_ROLES, isSessionExpired, mergeFreshStaffSession, staffSessionDrifted, buildCompactSession
} from './session.js';

// Both are always empty/false in production today (see the legacy
// constants of the same name) -- kept as named constants, not inlined, so a
// future change to either only needs to happen here.
export const KIOSK_PASSWORD = '';
export const PATIENT_FILE_LOGIN = false;

export async function sbSession() {
  let failed = offlineNow();
  if (!failed) {
    try {
      const sb = getSB();
      if (!sb) return null;
      const r = await Promise.race([
        sb.auth.getSession(),
        new Promise(res => setTimeout(() => res({ timeout: true }), 6000))
      ]);
      if (r.timeout) failed = true;
      else {
        if (r.data && r.data.session) return r.data.session;
        failed = !!r.error;
      }
    } catch (e) {
      failed = true;
    }
  }
  try {
    if (failed || SyncStore.st.reachable === false) {
      const raw = localStorage.getItem('iapp_sb_auth');
      if (raw) {
        const p = JSON.parse(raw);
        const s = p && (p.currentSession || p);
        if (s && s.user && s.refresh_token) return s;
      }
    }
  } catch (e) { /* storage unavailable (private mode / quota): non-fatal */ }
  return null;
}

let _kioskTried = false;
export async function ensureKiosk() {
  if (!KIOSK_EMAIL || !KIOSK_PASSWORD) return false;
  if (await sbSession()) return true;
  if (_kioskTried) return false;
  _kioskTried = true;
  try {
    const { error } = await getSB().auth.signInWithPassword({ email: KIOSK_EMAIL, password: KIOSK_PASSWORD });
    return !error;
  } catch (e) {
    return false;
  }
}

export function clearAllSessions() {
  ['iapp_unified_session', 'iapp_session'].forEach(k => {
    try { localStorage.removeItem(k); } catch { /* storage unavailable (private mode / quota): non-fatal */ }
    try { sessionStorage.removeItem(k); } catch { /* storage unavailable (private mode / quota): non-fatal */ }
  });
}

export function loadValidSession() {
  let s = null, store = null;
  try {
    const l = localStorage.getItem('iapp_unified_session');
    const t = sessionStorage.getItem('iapp_unified_session');
    if (l) { s = JSON.parse(l); store = localStorage; }
    else if (t) { s = JSON.parse(t); store = sessionStorage; }
  } catch {
    s = null;
  }
  if (!s) return null;
  if (isSessionExpired(s)) {
    clearAllSessions();
    return null;
  }
  if (s.kind === 'staff') {
    const u = getUsers().find(x => x.id === s.id) || getUsers().find(x => emailKey(x.email) && emailKey(x.email) === emailKey(s.email));
    if (!u || !STAFF_ROLES.includes(u.role)) {
      clearAllSessions();
      return null;
    }
    const fresh = mergeFreshStaffSession(s, u);
    if (staffSessionDrifted(fresh, s)) {
      try {
        store.setItem('iapp_unified_session', JSON.stringify(fresh));
        store.setItem('iapp_session', JSON.stringify(buildCompactSession(fresh)));
      } catch { /* storage unavailable (private mode / quota): non-fatal */ }
    }
    return fresh;
  }
  if (s.kind === 'patient' && s.patient) return s;
  clearAllSessions();
  return null;
}
