import React, { useState } from 'react';
import { Btn } from '../common.jsx';
import {
  GENDERS, BLOOD_TYPES, PATIENT_STATUSES, PATIENT_EDIT_TABS, PATIENT_EDIT_DEFAULT_TAB,
  initialPatientEditState, buildPatientEditPayload
} from './patient-form-model.js';
import { C } from '../../modules/theme/index.js';
import { Field, inp } from '../../modules/ui/atoms.jsx';
import { useLang, t } from '../../modules/i18n/index.js';
import { tv } from '../../modules/i18n/tv.js';

// Tabbed "edit medical file" form of the patient file. Exact port of the
// legacy runtime's PatientEditForm (public/legacy/app-runtime.js).
export default function PatientEditForm({ patient, onSave, onClose }) {
  const lang = useLang();
  const [tab, setTab] = useState(PATIENT_EDIT_DEFAULT_TAB);
  const [f, setF] = useState(() => initialPatientEditState(patient));
  const s = k => e => setF(v => ({ ...v, [k]: e.target.value }));
  return (
    <div>
      <div style={{ display: 'flex', marginBottom: 18, background: C.card, borderRadius: 12, padding: 4 }}>
        {PATIENT_EDIT_TABS.map(tb => (
          <div
            key={tb.id}
            onClick={() => setTab(tb.id)}
            style={{
              flex: 1,
              textAlign: 'center',
              padding: '8px 2px',
              background: tab === tb.id ? `linear-gradient(135deg,${C.accent},${C.teal})` : 'transparent',
              borderRadius: 9,
              cursor: 'pointer',
              color: tab === tb.id ? C.bg : C.muted,
              fontSize: 10,
              fontWeight: 700
            }}
          >{tb.icon}{' '}{t('g2.patient.tab.' + tb.id, lang)}</div>
        ))}
      </div>
      {tab === 'basic' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <Field label={t('g2.patient.fullName', lang)}>
            <input style={inp()} value={f.name} onChange={s('name')} placeholder={t('g2.patient.namePh2', lang)} />
          </Field>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <Field label={t('g2.patient.age', lang)}>
              <input style={inp()} type="number" value={f.age} onChange={s('age')} />
            </Field>
            <Field label={t('g2.patient.gender', lang)}>
              <select style={inp()} value={f.gender} onChange={s('gender')}>
                {GENDERS.map(g => <option key={g} value={g}>{tv(g)}</option>)}
              </select>
            </Field>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <Field label={t('g2.patient.phone', lang)}>
              <input style={inp()} value={f.phone} onChange={s('phone')} />
            </Field>
            <Field label={t('g2.patient.bloodType', lang)}>
              <select style={inp()} value={f.bloodType} onChange={s('bloodType')}>
                {BLOOD_TYPES.map(b => <option key={b}>{b}</option>)}
              </select>
            </Field>
          </div>
          <Field label={t('g2.patient.address', lang)}>
            <input style={inp()} value={f.address} onChange={s('address')} />
          </Field>
          <Field label={t('g2.patient.occupation', lang)}>
            <input style={inp()} value={f.occupation || ''} onChange={s('occupation')} placeholder={t('g2.patient.occupation', lang)} />
          </Field>
          <Field label={t('g2.patient.lastVisit', lang)}>
            <input style={inp()} type="date" value={f.lastVisit} onChange={s('lastVisit')} />
          </Field>
          <Field label={t('g2.patient.status', lang)}>
            <select style={inp()} value={f.status} onChange={s('status')}>
              {PATIENT_STATUSES.map(x => <option key={x} value={x}>{tv(x)}</option>)}
            </select>
          </Field>
        </div>
      )}
      {tab === 'medical' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <Field label={t('g2.patient.mainDx', lang)}>
            <input style={inp()} value={f.condition} onChange={s('condition')} placeholder={t('g2.exam.dxPh', lang)} />
          </Field>
          <Field label={t('g2.patient.history', lang)}>
            <textarea
              style={{ ...inp(), resize: 'none' }}
              rows={3}
              value={f.history || ''}
              onChange={s('history')}
              placeholder={t('g2.patient.historyPh2', lang)}
            />
          </Field>
          <Field label={t('g2.patient.allergies', lang)}>
            <textarea
              style={{ ...inp(), resize: 'none' }}
              rows={2}
              value={f.allergies || ''}
              onChange={s('allergies')}
              placeholder={t('g2.patient.allergiesPh', lang)}
            />
          </Field>
        </div>
      )}
      {tab === 'contact' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <Field label={t('g2.patient.phoneNo', lang)}>
            <input style={inp()} value={f.phone} onChange={s('phone')} />
          </Field>
          <Field label={t('g2.patient.emergency', lang)}>
            <input style={inp()} value={f.emergencyContact || ''} onChange={s('emergencyContact')} placeholder={t('g2.patient.emergencyPh', lang)} />
          </Field>
          <Field label={t('g2.patient.fullAddress', lang)}>
            <textarea
              style={{ ...inp(), resize: 'none' }}
              rows={3}
              value={f.address}
              onChange={s('address')}
              placeholder={t('g2.patient.fullAddressPh', lang)}
            />
          </Field>
        </div>
      )}
      <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
        <Btn outline full onClick={onClose}>{t('g2.common.cancel', lang)}</Btn>
        <Btn full onClick={() => onSave(buildPatientEditPayload(f))}>{t('g2.patient.saveEdits', lang)}</Btn>
      </div>
    </div>
  );
}
