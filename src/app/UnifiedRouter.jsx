import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { C } from '../modules/theme/index.js';
import { emailKey } from '../modules/constants/misc.js';
import { KIOSK_EMAIL, resolveProfile, sbSignOut } from '../modules/auth/staff-login.js';
import { sbSession, clearAllSessions, loadValidSession } from '../modules/auth/kiosk-session.js';
import {
  SESSION_TTL_REMEMBER, publicUser, isInvalidStaffSession, sessionExpiry,
  buildCompactSession, buildStaffSessionRecord, buildPatientSessionRecord
} from '../modules/auth/session.js';
import { routeViewFor, pathForRouteView } from '../modules/auth/router-view.js';
import { logAudit } from '../modules/sync/index.js';
import { maybeDailyBackup } from '../modules/datatools/index.js';
import { setCurrentUser } from '../modules/auth/current-user.js';
import UnifiedLogin from '../screens/UnifiedLogin.jsx';
import ForcePasswordChange from '../screens/ForcePasswordChange.jsx';
import PatientApp from '../screens/PatientApp.jsx';
import SecretaryApp from '../screens/SecretaryApp.jsx';
import App from '../screens/App.jsx';

// The app's single router/session gate. Exact port of the legacy runtime's
// UnifiedRouter (public/legacy/app-runtime.js): same session-restore flow,
// same periodic re-check, same login/logout wiring, same screen-by-routeView
// mapping -- just with real screen components in place of the legacy
// useNewScreen(...) ? window.IAppModules.screens.X : X ternaries, since
// those screens are no longer gated (there is no legacy fallback left).
export default function UnifiedRouter() {
  const [ready, setReady] = useState(false);
  const [session, setSession] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        const auth = await sbSession();
        if (auth && auth.user && auth.user.email && emailKey(auth.user.email) !== emailKey(KIOSK_EMAIL)) {
          const prof = await resolveProfile(auth.user.email);
          if (prof.user) {
            const s = { kind: 'staff', ...prof.user, exp: Date.now() + SESSION_TTL_REMEMBER };
            try {
              localStorage.setItem('iapp_unified_session', JSON.stringify(s));
              localStorage.setItem('iapp_session', JSON.stringify({ id: s.id, username: s.username, name: s.name, role: s.role }));
            } catch {}
            setCurrentUser(s);
            setSession(s);
            setReady(true);
            return;
          }
          await sbSignOut();
        }
        const local = loadValidSession();
        setSession(local && local.kind === 'patient' ? local : null);
        if (!local || local.kind !== 'patient') clearAllSessions();
      } catch (e) {
        console.warn('session check failed', e);
        setSession(null);
      }
      setReady(true);
    })();
  }, []);

  const logout = useCallback(() => {
    clearAllSessions();
    setCurrentUser(null);
    sbSignOut();
    setSession(null);
  }, []);

  useEffect(() => {
    window.__iappUnifiedLogout = logout;
    return () => {
      try { delete window.__iappUnifiedLogout; } catch {}
    };
  }, [logout]);

  useEffect(() => {
    if (!ready || !session || session.kind !== 'staff') return;
    const t = setTimeout(() => { maybeDailyBackup(); }, 4000);
    return () => clearTimeout(t);
  }, [ready, session && session.id]);

  useEffect(() => {
    if (!ready) return undefined;
    const check = async () => {
      const auth = await sbSession();
      setSession(prev => {
        if (prev && prev.kind === 'staff' && !auth) return null;
        const next = loadValidSession();
        if (!next) return prev && prev.kind === 'staff' ? prev : null;
        return JSON.stringify(next) === JSON.stringify(prev) ? prev : next;
      });
    };
    const iv = setInterval(check, 60000);
    const onVis = () => { if (document.visibilityState === 'visible') check(); };
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('storage', check);
    return () => {
      clearInterval(iv);
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('storage', check);
    };
  }, [ready]);

  const login = (payload, remember) => {
    if (payload.kind === 'staff') {
      setCurrentUser(publicUser(payload.user));
      logAudit('تسجيل دخول', payload.user.email || payload.user.username || '');
    }
    const store = remember ? localStorage : sessionStorage;
    const exp = sessionExpiry(remember);
    clearAllSessions();
    let s;
    if (payload.kind === 'staff') {
      s = buildStaffSessionRecord(payload.user, exp);
      try {
        store.setItem('iapp_session', JSON.stringify(buildCompactSession(publicUser(payload.user))));
      } catch {}
    } else {
      s = buildPatientSessionRecord(payload.patient, exp);
    }
    try {
      store.setItem('iapp_unified_session', JSON.stringify(s));
    } catch {}
    setSession(s);
  };

  const invalidRole = isInvalidStaffSession(session);
  useEffect(() => {
    if (invalidRole) logout();
  }, [invalidRole, logout]);

  const routeView = routeViewFor({ ready, session, invalidRole });

  const navigate = useNavigate();
  const location = useLocation();
  useEffect(() => {
    const path = pathForRouteView(routeView);
    if (location.pathname !== path) navigate(path, { replace: true });
  }, [routeView, location.pathname, navigate]);

  if (routeView === 'loading') {
    return (
      <div style={{ minHeight: '100vh', background: C.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.muted, fontFamily: "'Segoe UI','Tahoma',Arial,sans-serif" }}>
        ⏳
      </div>
    );
  }
  if (routeView === 'login') return <UnifiedLogin onLogin={login} />;

  setCurrentUser(session.kind === 'staff' ? session : null);

  if (routeView === 'patient') return <PatientApp patient={session.patient} onLogout={logout} />;
  if (routeView === 'blocked') return null;
  if (routeView === 'force-password-change') {
    return <ForcePasswordChange user={session} onLogout={logout} onDone={() => setSession(loadValidSession())} />;
  }
  if (routeView === 'secretary') return <SecretaryApp key={'sec-' + session.id + '-' + session.role} />;
  return <App key={'doc-' + session.id + '-' + session.role} />;
}
