import React, { useState } from 'react';
import { C } from '../modules/theme/index.js';
import { Field, inp } from '../modules/ui/atoms.jsx';
import { MIN_PW_LEN } from '../modules/constants/misc.js';
import { getUsers, saveUsers } from '../modules/auth/staff-login.js';
import { hashPassword, DEFAULT_ADMIN_PW } from '../modules/auth/password.js';
import { t, useLang, dirOf } from '../modules/i18n/index.js';

// Forces a weak/default password to be changed before the app is usable.
// Exact port of the legacy runtime's ForcePasswordChange
// (public/legacy/app-runtime.js) -- same validation, same Arabic copy.
export default function ForcePasswordChange({ user, onDone, onLogout }) {
  const lang = useLang();
  const [p1, setP1] = useState('');
  const [p2, setP2] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const save = async e => {
    if (e && e.preventDefault) e.preventDefault();
    if (busy) return;
    if (p1.length < MIN_PW_LEN) {
      setErr(t('g6.fpc.tooShort', lang, { n: MIN_PW_LEN }));
      return;
    }
    if (p1 === DEFAULT_ADMIN_PW || p1.toLowerCase() === String(user.username).toLowerCase()) {
      setErr(t('g6.fpc.notDefault', lang));
      return;
    }
    if (p1 !== p2) {
      setErr(t('g6.fpc.mismatch', lang));
      return;
    }
    setBusy(true);
    const pw = await hashPassword(p1);
    saveUsers(getUsers().map(u => {
      if (u.id !== user.id) return u;
      const { password: _x, ...r } = u;
      return { ...r, pw, mustChange: false };
    }));
    setBusy(false);
    onDone();
  };

  return (
    <div style={{ minHeight: '100vh', background: C.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', direction: dirOf(lang), fontFamily: "'Segoe UI','Tahoma',Arial,sans-serif", padding: '24px 20px' }}>
      <form
        onSubmit={save}
        style={{ width: '100%', maxWidth: 380, background: C.card, border: '1px solid ' + C.border, borderRadius: 20, padding: '22px 18px', display: 'flex', flexDirection: 'column', gap: 12 }}
      >
        <div style={{ color: C.gold, fontWeight: 800, fontSize: 16 }}>{t('g6.fpc.title', lang)}</div>
        <div style={{ color: C.muted, fontSize: 12, lineHeight: 1.8 }}>
          {t('g6.fpc.body', lang, { name: user.name })}
        </div>
        <Field label={t('g6.fpc.newPw', lang, { n: MIN_PW_LEN })}>
          <input
            autoFocus type="password" style={{ ...inp(), direction: 'ltr', textAlign: 'center' }}
            value={p1} onChange={e => { setP1(e.target.value); setErr(''); }}
          />
        </Field>
        <Field label={t('g6.fpc.confirmPw', lang)}>
          <input
            type="password" style={{ ...inp(), direction: 'ltr', textAlign: 'center' }}
            value={p2} onChange={e => { setP2(e.target.value); setErr(''); }}
          />
        </Field>
        {err && (
          <div style={{ background: C.danger + '22', border: '1px solid ' + C.danger + '44', borderRadius: 10, padding: '9px 12px', color: C.danger, fontSize: 12, textAlign: 'center' }}>
            {err}
          </div>
        )}
        <button
          type="submit" disabled={busy}
          style={{ background: `linear-gradient(135deg,${C.accent},${C.teal})`, border: 'none', borderRadius: 11, padding: 13, color: C.bg, fontWeight: 800, fontSize: 14, cursor: 'pointer', fontFamily: 'inherit', opacity: busy ? 0.7 : 1 }}
        >{busy ? t('g6.fpc.saving', lang) : t('g6.fpc.saveContinue', lang)}</button>
        <button
          type="button" onClick={onLogout}
          style={{ background: 'transparent', border: '1px solid ' + C.border, borderRadius: 11, padding: 10, color: C.muted, fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }}
        >{t('g6.fpc.logout', lang)}</button>
      </form>
    </div>
  );
}
