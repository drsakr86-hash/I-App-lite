import React, { useState } from 'react';
import { Btn } from '../common.jsx';
import {
  GENDERS, BLOOD_TYPES, PATIENT_STATUSES, initialPatientState, canSavePatient, buildPatientPayload
} from './patient-form-model.js';
import { Field, inp } from '../../modules/ui/atoms.jsx';
import { useLang, t } from '../../modules/i18n/index.js';
import { tv } from '../../modules/i18n/tv.js';
import { localISO } from '../../modules/constants/misc.js';

// New/edit patient form of the Patients screen. Exact port of the legacy
// runtime's PatientForm (public/legacy/app-runtime.js).
export default function PatientForm({ initial, onSave, onClose }) {
  const lang = useLang();
  const [f, setF] = useState(() => initialPatientState(initial, localISO()));
  const s = k => e => setF(v => ({ ...v, [k]: e.target.value }));
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <Field label={t('g2.patient.fullName', lang)}>
        <input style={inp()} value={f.name} onChange={s('name')} placeholder={t('g2.patient.namePh', lang)} />
      </Field>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <Field label={t('g2.patient.age', lang)}>
          <input style={inp()} type="number" value={f.age} onChange={s('age')} placeholder={t('g2.patient.agePh', lang)} />
        </Field>
        <Field label={t('g2.patient.gender', lang)}>
          <select style={inp()} value={f.gender} onChange={s('gender')}>
            {GENDERS.map(g => <option key={g} value={g}>{tv(g)}</option>)}
          </select>
        </Field>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <Field label={t('g2.patient.phone', lang)}>
          <input style={inp()} value={f.phone} onChange={s('phone')} placeholder="01xxxxxxxxx" />
        </Field>
        <Field label={t('g2.patient.bloodType', lang)}>
          <select style={inp()} value={f.bloodType} onChange={s('bloodType')}>
            {BLOOD_TYPES.map(b => <option key={b}>{b}</option>)}
          </select>
        </Field>
      </div>
      <Field label={t('g2.patient.address', lang)}>
        <input style={inp()} value={f.address} onChange={s('address')} placeholder={t('g2.patient.addressPh', lang)} />
      </Field>
      <Field label={t('g2.patient.dx', lang)}>
        <input style={inp()} value={f.condition} onChange={s('condition')} placeholder={t('g2.exam.dxPh', lang)} />
      </Field>
      <Field label={t('g2.patient.history', lang)}>
        <input style={inp()} value={f.history || ''} onChange={s('history')} placeholder={t('g2.patient.historyPh', lang)} />
      </Field>
      <Field label={t('g2.patient.allergies', lang)}>
        <input style={inp()} value={f.allergies || ''} onChange={s('allergies')} placeholder={t('g2.patient.allergiesPh', lang)} />
      </Field>
      <Field label={t('g2.patient.lastVisit', lang)}>
        <input style={inp()} type="date" value={f.lastVisit} onChange={s('lastVisit')} />
      </Field>
      <Field label={t('g2.patient.status', lang)}>
        <select style={inp()} value={f.status} onChange={s('status')}>
          {PATIENT_STATUSES.map(x => <option key={x} value={x}>{tv(x)}</option>)}
        </select>
      </Field>
      <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
        <Btn outline full onClick={onClose}>{t('g2.common.cancel', lang)}</Btn>
        <Btn full onClick={() => canSavePatient(f) && onSave(buildPatientPayload(f))}>{t('g2.common.save', lang)}</Btn>
      </div>
    </div>
  );
}
