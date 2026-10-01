import React, { useState } from 'react';
import { Btn } from '../common.jsx';
import {
  GENDERS, BLOOD_TYPES, PATIENT_STATUSES, initialPatientState, canSavePatient, buildPatientPayload
} from './patient-form-model.js';
import { Field, inp } from '../../modules/ui/atoms.jsx';
import { localISO } from '../../modules/constants/misc.js';

// New/edit patient form of the Patients screen. Exact port of the legacy
// runtime's PatientForm (public/legacy/app-runtime.js).
export default function PatientForm({ initial, onSave, onClose }) {
  const [f, setF] = useState(() => initialPatientState(initial, localISO()));
  const s = k => e => setF(v => ({ ...v, [k]: e.target.value }));
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <Field label="الاسم الكامل">
        <input style={inp()} value={f.name} onChange={s('name')} placeholder="اسم المريض" />
      </Field>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <Field label="العمر">
          <input style={inp()} type="number" value={f.age} onChange={s('age')} placeholder="سنة" />
        </Field>
        <Field label="الجنس">
          <select style={inp()} value={f.gender} onChange={s('gender')}>
            {GENDERS.map(g => <option key={g}>{g}</option>)}
          </select>
        </Field>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <Field label="الهاتف">
          <input style={inp()} value={f.phone} onChange={s('phone')} placeholder="01xxxxxxxxx" />
        </Field>
        <Field label="فصيلة الدم">
          <select style={inp()} value={f.bloodType} onChange={s('bloodType')}>
            {BLOOD_TYPES.map(b => <option key={b}>{b}</option>)}
          </select>
        </Field>
      </div>
      <Field label="العنوان">
        <input style={inp()} value={f.address} onChange={s('address')} placeholder="المدينة" />
      </Field>
      <Field label="التشخيص">
        <input style={inp()} value={f.condition} onChange={s('condition')} placeholder="قصر نظر، ماء أبيض..." />
      </Field>
      <Field label="التاريخ المرضي">
        <input style={inp()} value={f.history || ''} onChange={s('history')} placeholder="سكري، ضغط..." />
      </Field>
      <Field label="الحساسية للأدوية">
        <input style={inp()} value={f.allergies || ''} onChange={s('allergies')} placeholder="بنسلين، سلفا..." />
      </Field>
      <Field label="آخر زيارة">
        <input style={inp()} type="date" value={f.lastVisit} onChange={s('lastVisit')} />
      </Field>
      <Field label="الحالة">
        <select style={inp()} value={f.status} onChange={s('status')}>
          {PATIENT_STATUSES.map(x => <option key={x}>{x}</option>)}
        </select>
      </Field>
      <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
        <Btn outline full onClick={onClose}>إلغاء</Btn>
        <Btn full onClick={() => canSavePatient(f) && onSave(buildPatientPayload(f))}>حفظ</Btn>
      </div>
    </div>
  );
}
