import React, { useState } from 'react';
import { C } from '../modules/theme/index.js';
import { getTheme } from '../modules/theme/index.js';
import { Field, inp } from '../modules/ui/atoms.jsx';
import {
  KIOSK_EMAIL, authenticateStaff, lockRemaining, registerLoginFail, clearLoginFails, fmtWait
} from '../modules/auth/staff-login.js';
import { ensureKiosk, PATIENT_FILE_LOGIN } from '../modules/auth/kiosk-session.js';
import { sbGet } from '../modules/sync/wiring.js';
import {
  nextLoginMode, staffLoginFieldsMissing, patientLoginFieldsMissing, patientLoginLockKey,
  findPatientByCodeAndName
} from '../modules/auth/unified-login-view.js';
import { t, useLang, dirOf } from '../modules/i18n/index.js';

// The app's single entry gate: staff (email/password via Supabase), patient
// (file number + name) or guest. Exact port of the legacy runtime's
// UnifiedLogin (public/legacy/app-runtime.js) -- same modes, same lockouts,
// same Arabic copy. choose()/submit()'s side-effect-free decisions already
// live in src/modules/auth/unified-login-view.js; this keeps only what
// touches state, Supabase, or storage.
export default function UnifiedLogin({ onLogin }) {
  const lang = useLang();
  const [mode, setMode] = useState('staff');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [remember, setRemember] = useState(true);
  const [showPass, setShowPass] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const choose = m => {
    setMode(nextLoginMode(PATIENT_FILE_LOGIN, m));
    setError('');
  };

  const submit = async e => {
    if (e && e.preventDefault) e.preventDefault();
    setError('');
    if (loading) return;
    if (mode === 'staff') {
      if (staffLoginFieldsMissing(username, password)) {
        setError(t('g6.login.emptyStaff', lang));
        return;
      }
      setLoading(true);
      const r = await authenticateStaff(username, password);
      setLoading(false);
      if (!r.user) {
        setError(r.error);
        return;
      }
      setPassword('');
      onLogin({ kind: 'staff', user: r.user }, remember);
    } else if (mode === 'patient') {
      if (patientLoginFieldsMissing(code, name)) {
        setError(t('g6.login.emptyPatient', lang));
        return;
      }
      const pkey = patientLoginLockKey(code);
      const wait = lockRemaining(pkey);
      if (wait) {
        setError(t('g6.login.tooMany', lang, { wait: fmtWait(wait) }));
        return;
      }
      setLoading(true);
      await ensureKiosk();
      const patients = await sbGet('iapp_patients');
      setLoading(false);
      if (!Array.isArray(patients)) {
        setError(KIOSK_EMAIL ? t('g6.login.dbUnreachable', lang) : t('g6.login.portalDisabled', lang));
        return;
      }
      const p = findPatientByCodeAndName(patients, code, name);
      if (!p) {
        const w = registerLoginFail(pkey);
        setError(w ? t('g6.login.locked', lang, { wait: fmtWait(w) }) : t('g6.login.badPatient', lang));
        return;
      }
      clearLoginFails(pkey);
      onLogin({ kind: 'patient', patient: { id: p.id, name: p.name, patientCode: p.patientCode, phone: p.phone || '' } }, remember);
    } else {
      await ensureKiosk();
      onLogin({ kind: 'patient', patient: { id: null, name: 'زائر', patientCode: null, isGuest: true } }, remember);
    }
  };

  return (
    <div
      style={{
        minHeight: '100vh', background: C.bg, display: 'flex', alignItems: 'center', justifyContent: 'center',
        direction: dirOf(lang), fontFamily: "'Segoe UI','Tahoma',Arial,sans-serif", padding: '24px 20px', overflowY: 'auto'
      }}
    >
      <div style={{ width: '100%', maxWidth: 430 }}>
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <div
            style={{
              width: 82, height: 82, borderRadius: 24, background: `linear-gradient(135deg,${C.accent},${C.teal})`,
              display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 38, margin: '0 auto 14px',
              boxShadow: `0 0 28px ${C.accent}55`
            }}
          >👁</div>
          <div style={{ color: C.accent, fontWeight: 900, fontSize: 28, letterSpacing: 1 }}>I App</div>
          <div style={{ color: C.text, fontSize: 14, fontWeight: 600, marginTop: 4 }}>{t('g6.login.appName', lang)}</div>
          <div style={{ color: C.muted, fontSize: 11, marginTop: 5 }}>{t('g6.login.subtitle', lang)}</div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 14 }}>
          <button
            onClick={() => choose('staff')}
            style={{
              background: mode === 'staff' ? C.accent + '22' : C.card, border: '1px solid ' + (mode === 'staff' ? C.accent : C.border),
              borderRadius: 12, padding: '11px 8px', color: mode === 'staff' ? C.accent : C.muted, fontWeight: 800,
              fontFamily: 'inherit', cursor: 'pointer'
            }}
          >{t('g6.login.tabStaff', lang)}</button>
          <button
            onClick={() => choose('patient')}
            style={{
              background: mode !== 'staff' ? C.teal + '22' : C.card, border: '1px solid ' + (mode !== 'staff' ? C.teal : C.border),
              borderRadius: 12, padding: '11px 8px', color: mode !== 'staff' ? C.teal : C.muted, fontWeight: 800,
              fontFamily: 'inherit', cursor: 'pointer'
            }}
          >{t('g6.login.tabPatient', lang)}</button>
        </div>
        <div
          style={{
            background: 'linear-gradient(135deg,' + C.card + ',' + C.surface + ')', border: '1px solid ' + C.border,
            borderRadius: 20, padding: '20px 18px', boxShadow: '0 20px 60px ' + (getTheme() === 'dark' ? '#0008' : '#1B2B4A22')
          }}
        >
          {mode === 'staff' ? (
            <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ color: C.text, fontWeight: 800, fontSize: 15, marginBottom: 2 }}>{t('g6.login.staffTitle', lang)}</div>
              <div style={{ color: C.muted, fontSize: 11, marginTop: -4 }}>{t('g6.login.staffHint', lang)}</div>
              <Field label={t('g6.login.email', lang)}>
                <input
                  autoFocus type="email" autoComplete="username"
                  style={{ ...inp(), background: C.bg2, direction: 'ltr', textAlign: 'start' }}
                  value={username}
                  onChange={e => { setUsername(e.target.value); setError(''); }}
                  placeholder="admin@sakr.clinic"
                />
              </Field>
              <Field label={t('g6.login.password', lang)}>
                <div style={{ position: 'relative' }}>
                  <input
                    style={{ ...inp(), background: C.bg2, paddingInlineEnd: 40, direction: 'ltr', textAlign: 'center' }}
                    type={showPass ? 'text' : 'password'}
                    value={password}
                    onChange={e => { setPassword(e.target.value); setError(''); }}
                    placeholder="••••••••"
                  />
                  <span
                    onClick={() => setShowPass(v => !v)}
                    style={{ position: 'absolute', insetInlineEnd: 12, top: '50%', transform: 'translateY(-50%)', cursor: 'pointer', color: C.muted }}
                  >{showPass ? '🙈' : '👁'}</span>
                </div>
              </Field>
              <div onClick={() => setRemember(v => !v)} style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                <div
                  style={{
                    width: 18, height: 18, borderRadius: 5, background: remember ? C.accent : C.bg,
                    border: '2px solid ' + (remember ? C.accent : C.border), display: 'flex', alignItems: 'center',
                    justifyContent: 'center', fontSize: 11, color: C.bg, fontWeight: 700
                  }}
                >{remember ? '✓' : ''}</div>
                <span style={{ color: C.muted, fontSize: 12 }}>{t('g6.login.remember', lang)}</span>
              </div>
              {error && (
                <div style={{ background: C.danger + '22', border: '1px solid ' + C.danger + '44', borderRadius: 10, padding: '9px 12px', color: C.danger, fontSize: 12, textAlign: 'center' }}>
                  {error}
                </div>
              )}
              <button
                type="submit" disabled={loading}
                style={{
                  background: `linear-gradient(135deg,${C.accent},${C.teal})`, border: 'none', borderRadius: 11, padding: 13,
                  color: C.bg, fontWeight: 800, fontSize: 14, cursor: 'pointer', fontFamily: 'inherit', opacity: loading ? 0.7 : 1
                }}
              >{loading ? t('g6.login.verifying', lang) : t('g6.login.signIn', lang)}</button>
            </form>
          ) : PATIENT_FILE_LOGIN ? (
            <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ color: C.text, fontWeight: 800, fontSize: 15, marginBottom: 2 }}>{t('g6.login.patientTitle', lang)}</div>
              <Field label={t('g6.login.fileNo', lang)}>
                <input
                  autoFocus
                  style={{ ...inp(), background: C.bg2, direction: 'ltr', textAlign: 'center' }}
                  value={code}
                  onChange={e => { setCode(e.target.value); setError(''); }}
                  placeholder="P-0001"
                />
              </Field>
              <Field label={t('g6.login.fullName', lang)}>
                <input
                  style={{ ...inp(), background: C.bg2 }}
                  value={name}
                  onChange={e => { setName(e.target.value); setError(''); }}
                  placeholder={t('g6.login.namePh', lang)}
                />
              </Field>
              {error && (
                <div style={{ background: C.danger + '22', border: '1px solid ' + C.danger + '44', borderRadius: 10, padding: '9px 12px', color: C.danger, fontSize: 12, textAlign: 'center' }}>
                  {error}
                </div>
              )}
              <button
                type="submit" disabled={loading}
                style={{
                  background: `linear-gradient(135deg,${C.teal},${C.accent})`, border: 'none', borderRadius: 11, padding: 13,
                  color: C.bg, fontWeight: 800, fontSize: 14, cursor: 'pointer', fontFamily: 'inherit', opacity: loading ? 0.7 : 1
                }}
              >{loading ? t('g6.login.verifying', lang) : t('g6.login.patientSignIn', lang)}</button>
              <button
                type="button"
                onClick={() => { setMode('guest'); setError(''); }}
                style={{ background: 'transparent', border: '1px solid ' + C.border, borderRadius: 11, padding: 11, color: C.muted, fontWeight: 700, fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }}
              >{t('g6.login.newNoAccount', lang)}</button>
            </form>
          ) : null}
          {mode !== 'staff' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ color: C.text, fontWeight: 800, fontSize: 15 }}>{t('g6.login.newPatient', lang)}</div>
              <div style={{ color: C.muted, fontSize: 12, lineHeight: 1.7 }}>{t('g6.login.newPatientHint', lang)}</div>
              <button
                onClick={submit} disabled={loading}
                style={{
                  background: `linear-gradient(135deg,${C.teal},${C.accent})`, border: 'none', borderRadius: 11, padding: 13,
                  color: C.bg, fontWeight: 800, fontSize: 14, cursor: 'pointer', fontFamily: 'inherit'
                }}
              >{t('g6.login.continueBooking', lang)}</button>
              {PATIENT_FILE_LOGIN && (
                <button
                  onClick={() => choose('patient')}
                  style={{ background: 'transparent', border: '1px solid ' + C.border, borderRadius: 11, padding: 11, color: C.muted, fontWeight: 700, fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }}
                >{t('g6.login.backToPatient', lang)}</button>
              )}
            </div>
          )}
        </div>
        <div style={{ textAlign: 'center', color: '#40536b', fontSize: 10, marginTop: 14 }}>{t('g6.login.footer', lang)}</div>
      </div>
    </div>
  );
}
