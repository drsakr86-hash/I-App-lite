import React, { useState } from 'react';
import {
  LOGIN_EMPTY_ERROR, LOGIN_REMEMBER_DEFAULT, loginErrorText, loginFieldsMissing, passwordInputType, showPassIcon,
  loginButtonLabel, loginButtonOpacity
} from './login-form-model.js';
import { C } from '../../modules/theme/index.js';
import { Field, inp } from '../../modules/ui/atoms.jsx';
import { authenticateStaff } from '../../modules/auth/staff-login.js';
import { t, useLang, dirOf } from '../../modules/i18n/index.js';

// Staff login form (used by the secretary app). Exact port of the legacy
// runtime's LoginScreen (public/legacy/app-runtime.js). The credential check
// is authenticateStaff, called with the same arguments and result handling.
export default function LoginScreen({ onLogin }) {
  const lang = useLang();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [remember, setRemember] = useState(LOGIN_REMEMBER_DEFAULT);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const submit = e => {
    if (e && e.preventDefault) e.preventDefault();
    if (loginFieldsMissing(username, password)) {
      setError(LOGIN_EMPTY_ERROR); // raw Arabic canonical text; translated at render by loginErrorText
      return;
    }
    if (loading) return;
    setLoading(true);
    authenticateStaff(username, password).then(r => {
      setLoading(false);
      if (r.user) {
        setError('');
        onLogin(r.user, remember);
      } else setError(r.error);
    });
  };
  return (
    <div
      style={{
        minHeight: '100vh',
        background: C.bg,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        direction: dirOf(lang),
        fontFamily: "'Segoe UI','Tahoma',Arial,sans-serif",
        padding: '24px 20px'
      }}
    >
      <div
        style={{
          width: 76,
          height: 76,
          borderRadius: 20,
          background: `linear-gradient(135deg,${C.accent},${C.teal})`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 34,
          marginBottom: 18,
          boxShadow: `0 0 24px ${C.accent}55`
        }}
      >👁</div>
      <div style={{ color: C.accent, fontWeight: 800, fontSize: 22, marginBottom: 4 }}>I App</div>
      <div style={{ color: C.muted, fontSize: 12, marginBottom: 32, textAlign: 'center' }}>{t('g3.login.subtitle', lang)}</div>
      <form onSubmit={submit} style={{ width: '100%', maxWidth: 300, display: 'flex', flexDirection: 'column', gap: 14 }}>
        <Field label={t('g3.login.email', lang)}>
          <input
            autoFocus
            type="email"
            style={{ ...inp(), direction: 'ltr', textAlign: 'start' }}
            value={username}
            onChange={e => {
              setUsername(e.target.value);
              setError('');
            }}
            placeholder="admin@sakr.clinic"
          />
        </Field>
        <Field label={t('g3.login.password', lang)}>
          <div style={{ position: 'relative' }}>
            <input
              style={{ ...inp(), paddingInlineEnd: 38 }}
              type={passwordInputType(showPass)}
              value={password}
              onChange={e => {
                setPassword(e.target.value);
                setError('');
              }}
              placeholder="••••••••"
            />
            <span
              onClick={() => setShowPass(s => !s)}
              role="button"
              aria-label={t('g3.login.togglePass', lang)}
              style={{
                position: 'absolute',
                insetInlineEnd: 12,
                top: '50%',
                transform: 'translateY(-50%)',
                cursor: 'pointer',
                color: C.muted,
                fontSize: 14
              }}
            >{showPassIcon(showPass)}</span>
          </div>
        </Field>
        <div onClick={() => setRemember(r => !r)} style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
          <div
            style={{
              width: 18,
              height: 18,
              borderRadius: 5,
              background: remember ? C.accent : C.bg,
              border: `2px solid ${remember ? C.accent : C.border}`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 11,
              color: C.bg,
              fontWeight: 700
            }}
          >{remember ? '✓' : ''}</div>
          <span style={{ color: C.muted, fontSize: 12 }}>{t('g3.login.remember', lang)}</span>
        </div>
        {error && (
          <div
            style={{
              background: C.danger + '22',
              border: `1px solid ${C.danger}44`,
              borderRadius: 10,
              padding: '9px 12px',
              color: C.danger,
              fontSize: 12,
              textAlign: 'center'
            }}
          >{loginErrorText(error)}</div>
        )}
        <button
          type="submit"
          onClick={submit}
          style={{
            background: `linear-gradient(135deg,${C.accent},${C.teal})`,
            border: 'none',
            borderRadius: 10,
            padding: '12px 18px',
            color: C.bg,
            fontWeight: 700,
            fontSize: 14,
            cursor: 'pointer',
            marginTop: 6,
            opacity: loginButtonOpacity(loading)
          }}
        >{loginButtonLabel(loading)}</button>
      </form>
    </div>
  );
}
