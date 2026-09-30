import React, { useState } from 'react';
import { Btn } from '../common.jsx';
import { C } from '../../modules/theme/index.js';
import { Field, inp } from '../../modules/ui/atoms.jsx';
import { CLINICS } from '../../modules/constants/index.js';
import { DEFAULT_APT_DOCTOR_NAMES, initialAptState, aptSaveOutcome } from './apt-form-model.js';

const L = () => globalThis.IAppLegacy;

// Appointment add/edit form. Port of the legacy runtime's AptForm
// (public/legacy/app-runtime.js), which stays in place for the legacy
// screens. localISO is read from the bridge (not yet moved to a module).
export default function AptForm({ initial, onSave, onClose, doctorNames = DEFAULT_APT_DOCTOR_NAMES, appointments = [] }) {
  const { localISO } = L();
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
      <Field label="اسم المريض">
        <input style={inp()} value={f.patient} onChange={s('patient')} placeholder="اسم المريض" />
      </Field>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <Field label="التاريخ">
          <input style={inp()} type="date" value={f.date} onChange={s('date')} />
        </Field>
        <Field label="الوقت">
          <input style={inp()} type="time" value={f.time} onChange={s('time')} />
        </Field>
      </div>
      <Field label="العيادة">
        <select style={inp()} value={f.clinic} onChange={s('clinic')}>
          {CLINICS.map(c => <option key={c.v} value={c.v}>{c.l}</option>)}
        </select>
      </Field>
      <Field label="نوع الكشف">
        <input style={inp()} value={f.type} onChange={s('type')} placeholder="فحص روتيني..." />
      </Field>
      <Field label="الطبيب">
        <select style={inp()} value={f.doctor} onChange={s('doctor')}>
          {doctorNames.map(d => <option key={d}>{d}</option>)}
        </select>
      </Field>
      {err && (
        <div style={{ background: C.danger + '22', border: `1px solid ${C.danger}44`, borderRadius: 10, padding: '9px 12px', color: C.danger, fontSize: 12, textAlign: 'center' }}>
          {err}
        </div>
      )}
      <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
        <Btn outline full onClick={onClose}>إلغاء</Btn>
        <Btn full onClick={trySave}>حفظ</Btn>
      </div>
    </div>
  );
}
