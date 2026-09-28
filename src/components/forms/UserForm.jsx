import React, { useState } from 'react';
import { Btn } from '../common.jsx';
import {
  USER_ROLE_OPTIONS, USER_PASSWORD_NOTE, initialUserState, isUserFormValid, buildUserPayload, userSaveLabel
} from './settings-forms-model.js';

const L = () => globalThis.IAppLegacy;

// Staff user add/edit form (Settings). Port of the legacy runtime's UserForm
// (public/legacy/app-runtime.js), which stays in place for the legacy
// screens. Theme C, Field and inp are read from the bridge. The form only
// checks email/name shape; duplicate and last-admin checks happen in the
// awaited onSave (the Settings screen), whose message comes back as `error`.
export default function UserForm({ initial, onSave, onClose, error }) {
  const { C, Field, inp } = L();
  const [f, setF] = useState(() => initialUserState(initial));
  const s = k => e => setF(v => ({ ...v, [k]: e.target.value }));
  const [saving, setSaving] = useState(false);
  const valid = isUserFormValid(f, saving);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <Field label="الاسم">
        <input style={inp()} value={f.name} onChange={s('name')} placeholder="اسم المستخدم الكامل" />
      </Field>
      <Field label="البريد الإلكتروني (للدخول)">
        <input
          type="email"
          style={{ ...inp(), direction: 'ltr', textAlign: 'left' }}
          value={f.email}
          onChange={s('email')}
          placeholder="name@sakr.clinic"
        />
      </Field>
      <div
        style={{
          background: C.gold + '11',
          border: `1px solid ${C.gold}33`,
          borderRadius: 10,
          padding: '9px 12px',
          color: C.gold,
          fontSize: 11,
          lineHeight: 1.7
        }}
      >{USER_PASSWORD_NOTE}</div>
      <Field label="الصلاحية">
        <select style={inp()} value={f.role} onChange={s('role')}>
          {USER_ROLE_OPTIONS.map(o => <option key={o.v} value={o.v}>{o.l}</option>)}
        </select>
      </Field>
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
        >{error}</div>
      )}
      <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
        <Btn outline full onClick={onClose}>إلغاء</Btn>
        <Btn
          full
          color={C.purple}
          onClick={async () => {
            if (!valid) return;
            setSaving(true);
            try {
              await onSave(buildUserPayload(f, Date.now()));
            } finally {
              setSaving(false);
            }
          }}
        >{userSaveLabel(saving, initial)}</Btn>
      </div>
    </div>
  );
}
