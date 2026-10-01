import React, { useState } from 'react';
import { Btn } from '../common.jsx';
import { initialDoctorState, deriveDoctorNameFields, withDoctorName, togglePrimary, canSaveDoctor } from './settings-forms-model.js';
import { C } from '../../modules/theme/index.js';
import { Field, inp } from '../../modules/ui/atoms.jsx';

// Doctor add/edit form (Settings). Exact port of the legacy runtime's
// DoctorForm (public/legacy/app-runtime.js).
export default function DoctorForm({ initial, onSave, onClose }) {
  const [f, setF] = useState(() => initialDoctorState(initial));
  const s = k => e => setF(v => ({ ...v, [k]: e.target.value }));
  const handleName = e => {
    const name = e.target.value;
    const derived = deriveDoctorNameFields(name);
    setF(v => withDoctorName(v, name, derived));
  };
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <Field label="الاسم الكامل">
        <input style={inp()} value={f.name} onChange={handleName} placeholder="د. محمد أحمد" />
      </Field>
      <Field label="الاسم المختصر (يظهر في القوائم)">
        <input style={inp()} value={f.short} onChange={s('short')} placeholder="د. محمد" />
      </Field>
      <Field label="اللقب / التخصص">
        <input style={inp()} value={f.title} onChange={s('title')} placeholder="طبيب عيون" />
      </Field>
      <Field label="الحرف الأول (للصورة الرمزية)">
        <input style={{ ...inp(), textAlign: 'center' }} value={f.initial} onChange={s('initial')} placeholder="م" maxLength={1} />
      </Field>
      <div
        onClick={() => setF(togglePrimary)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          background: C.card,
          border: `1px solid ${f.isPrimary ? C.gold : C.border}`,
          borderRadius: 10,
          padding: '10px 14px',
          cursor: 'pointer'
        }}
      >
        <div
          style={{
            width: 20,
            height: 20,
            borderRadius: 6,
            background: f.isPrimary ? C.gold : C.bg,
            border: `2px solid ${f.isPrimary ? C.gold : C.border}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 12,
            color: C.bg,
            fontWeight: 700
          }}
        >{f.isPrimary ? '✓' : ''}</div>
        <span style={{ color: f.isPrimary ? C.gold : C.muted, fontSize: 13, fontWeight: 600 }}>الطبيب الرئيسي للعيادة</span>
      </div>
      <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
        <Btn outline full onClick={onClose}>إلغاء</Btn>
        <Btn full onClick={() => canSaveDoctor(f) && onSave(f)}>حفظ</Btn>
      </div>
    </div>
  );
}
