import React, { useState } from 'react';
import { Btn } from '../common.jsx';
import { C } from '../../modules/theme/index.js';
import { Field, inp } from '../../modules/ui/atoms.jsx';
import { CLINICS, localISO } from '../../modules/constants/index.js';
import { DEFAULT_APT_DOCTOR_NAMES, initialAptState, aptSaveOutcome } from './apt-form-model.js';
import { t, useLang } from '../../modules/i18n/index.js';
import { tv } from '../../modules/i18n/tv.js';

// Appointment add/edit form. Exact port of the legacy runtime's AptForm
// (public/legacy/app-runtime.js).
export default function AptForm({ initial, onSave, onClose, doctorNames = DEFAULT_APT_DOCTOR_NAMES, appointments = [] }) {
  const lang = useLang();
  const [f, setF] = useState(() => initialAptState(initial, localISO(), CLINICS[0].v));
  const [err, setErr] = useState('');
  const s = k => e => setF(v => ({ ...v, [k]: e.target.value }));
  const trySave = () => {
    const outcome = aptSaveOutcome(appointments, f, localISO());
    if (outcome.type === 'noop') return;
    if (outcome.type === 'error') { setErr(outcome.message); return; }
    setErr('');
    onSave(f);
  };
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <Field label={t('g3.apt.patientName', lang)}>
        <input style={inp()} value={f.patient} onChange={s('patient')} placeholder={t('g3.apt.patientName', lang)} />
      </Field>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <Field label={t('common.date', lang)}>
          <input style={inp()} type="date" value={f.date} onChange={s('date')} />
        </Field>
        <Field label={t('g3.apt.time', lang)}>
          <input style={inp()} type="time" value={f.time} onChange={s('time')} />
        </Field>
      </div>
      <Field label={t('g3.apt.clinic', lang)}>
        <select style={inp()} value={f.clinic} onChange={s('clinic')}>
          {CLINICS.map(c => <option key={c.v} value={c.v}>{tv(c.l, lang)}</option>)}
        </select>
      </Field>
      <Field label={t('g3.apt.visitType', lang)}>
        <input style={inp()} value={f.type} onChange={s('type')} placeholder={t('g3.apt.visitTypePh', lang)} />
      </Field>
      <Field label={t('g3.apt.doctor', lang)}>
        <select style={inp()} value={f.doctor} onChange={s('doctor')}>
          {doctorNames.map(d => <option key={d} value={d}>{tv(d, lang)}</option>)}
        </select>
      </Field>
      {err && (
        <div style={{ background: C.danger + '22', border: `1px solid ${C.danger}44`, borderRadius: 10, padding: '9px 12px', color: C.danger, fontSize: 12, textAlign: 'center' }}>
          {err}
        </div>
      )}
      <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
        <Btn outline full onClick={onClose}>{t('g3.common.cancel', lang)}</Btn>
        <Btn full onClick={trySave}>{t('g3.common.save', lang)}</Btn>
      </div>
    </div>
  );
}
