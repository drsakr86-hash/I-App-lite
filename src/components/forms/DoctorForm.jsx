import React, { useState } from 'react';
import { Btn } from '../common.jsx';
import { initialDoctorState, deriveDoctorNameFields, withDoctorName, togglePrimary, canSaveDoctor } from './settings-forms-model.js';
import { C } from '../../modules/theme/index.js';
import { Field, inp } from '../../modules/ui/atoms.jsx';
import { t, useLang } from '../../modules/i18n/index.js';

// Doctor add/edit form (Settings). Exact port of the legacy runtime's
// DoctorForm (public/legacy/app-runtime.js).
export default function DoctorForm({ initial, onSave, onClose }) {
  const lang = useLang();
  const [f, setF] = useState(() => initialDoctorState(initial));
  const s = k => e => setF(v => ({ ...v, [k]: e.target.value }));
  const handleName = e => {
    const name = e.target.value;
    const derived = deriveDoctorNameFields(name);
    setF(v => withDoctorName(v, name, derived));
  };
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <Field label={t('g3.doctor.fullName', lang)}>
        <input style={inp()} value={f.name} onChange={handleName} placeholder={t('g3.doctor.fullNamePh', lang)} />
      </Field>
      <Field label={t('g3.doctor.shortName', lang)}>
        <input style={inp()} value={f.short} onChange={s('short')} placeholder={t('g3.doctor.shortNamePh', lang)} />
      </Field>
      <Field label={t('g3.doctor.title', lang)}>
        <input style={inp()} value={f.title} onChange={s('title')} placeholder={t('g3.doctor.titlePh', lang)} />
      </Field>
      <Field label={t('g3.doctor.initial', lang)}>
        <input style={{ ...inp(), textAlign: 'center' }} value={f.initial} onChange={s('initial')} placeholder={t('g3.doctor.initialPh', lang)} maxLength={1} />
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
        <span style={{ color: f.isPrimary ? C.gold : C.muted, fontSize: 13, fontWeight: 600 }}>{t('g3.doctor.primary', lang)}</span>
      </div>
      <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
        <Btn outline full onClick={onClose}>{t('g3.common.cancel', lang)}</Btn>
        <Btn full onClick={() => canSaveDoctor(f) && onSave(f)}>{t('g3.common.save', lang)}</Btn>
      </div>
    </div>
  );
}
