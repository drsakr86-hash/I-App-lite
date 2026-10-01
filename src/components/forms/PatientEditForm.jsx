import React, { useState } from 'react';
import { Btn } from '../common.jsx';
import {
  GENDERS, BLOOD_TYPES, PATIENT_STATUSES, PATIENT_EDIT_TABS, PATIENT_EDIT_DEFAULT_TAB,
  initialPatientEditState, buildPatientEditPayload
} from './patient-form-model.js';
import { C } from '../../modules/theme/index.js';
import { Field, inp } from '../../modules/ui/atoms.jsx';

// Tabbed "edit medical file" form of the patient file. Exact port of the
// legacy runtime's PatientEditForm (public/legacy/app-runtime.js).
export default function PatientEditForm({ patient, onSave, onClose }) {
  const [tab, setTab] = useState(PATIENT_EDIT_DEFAULT_TAB);
  const [f, setF] = useState(() => initialPatientEditState(patient));
  const s = k => e => setF(v => ({ ...v, [k]: e.target.value }));
  return (
    <div>
      <div style={{ display: 'flex', marginBottom: 18, background: C.card, borderRadius: 12, padding: 4 }}>
        {PATIENT_EDIT_TABS.map(t => (
          <div
            key={t.id}
            onClick={() => setTab(t.id)}
            style={{
              flex: 1,
              textAlign: 'center',
              padding: '8px 2px',
              background: tab === t.id ? `linear-gradient(135deg,${C.accent},${C.teal})` : 'transparent',
              borderRadius: 9,
              cursor: 'pointer',
              color: tab === t.id ? C.bg : C.muted,
              fontSize: 10,
              fontWeight: 700
            }}
          >{t.icon}{' '}{t.label}</div>
        ))}
      </div>
      {tab === 'basic' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <Field label="الاسم الكامل">
            <input style={inp()} value={f.name} onChange={s('name')} placeholder="الاسم" />
          </Field>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <Field label="العمر">
              <input style={inp()} type="number" value={f.age} onChange={s('age')} />
            </Field>
            <Field label="الجنس">
              <select style={inp()} value={f.gender} onChange={s('gender')}>
                {GENDERS.map(g => <option key={g}>{g}</option>)}
              </select>
            </Field>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <Field label="الهاتف">
              <input style={inp()} value={f.phone} onChange={s('phone')} />
            </Field>
            <Field label="فصيلة الدم">
              <select style={inp()} value={f.bloodType} onChange={s('bloodType')}>
                {BLOOD_TYPES.map(b => <option key={b}>{b}</option>)}
              </select>
            </Field>
          </div>
          <Field label="العنوان">
            <input style={inp()} value={f.address} onChange={s('address')} />
          </Field>
          <Field label="المهنة">
            <input style={inp()} value={f.occupation || ''} onChange={s('occupation')} placeholder="المهنة" />
          </Field>
          <Field label="آخر زيارة">
            <input style={inp()} type="date" value={f.lastVisit} onChange={s('lastVisit')} />
          </Field>
          <Field label="الحالة">
            <select style={inp()} value={f.status} onChange={s('status')}>
              {PATIENT_STATUSES.map(x => <option key={x}>{x}</option>)}
            </select>
          </Field>
        </div>
      )}
      {tab === 'medical' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <Field label="التشخيص الرئيسي">
            <input style={inp()} value={f.condition} onChange={s('condition')} placeholder="قصر نظر، ماء أبيض..." />
          </Field>
          <Field label="التاريخ المرضي">
            <textarea
              style={{ ...inp(), resize: 'none' }}
              rows={3}
              value={f.history || ''}
              onChange={s('history')}
              placeholder="أمراض سابقة، عمليات..."
            />
          </Field>
          <Field label="الحساسية للأدوية">
            <textarea
              style={{ ...inp(), resize: 'none' }}
              rows={2}
              value={f.allergies || ''}
              onChange={s('allergies')}
              placeholder="بنسلين، سلفا..."
            />
          </Field>
        </div>
      )}
      {tab === 'contact' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <Field label="رقم الهاتف">
            <input style={inp()} value={f.phone} onChange={s('phone')} />
          </Field>
          <Field label="جهة الاتصال في الطوارئ">
            <input style={inp()} value={f.emergencyContact || ''} onChange={s('emergencyContact')} placeholder="الاسم والعلاقة والرقم" />
          </Field>
          <Field label="العنوان الكامل">
            <textarea
              style={{ ...inp(), resize: 'none' }}
              rows={3}
              value={f.address}
              onChange={s('address')}
              placeholder="المدينة - الحي - الشارع"
            />
          </Field>
        </div>
      )}
      <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
        <Btn outline full onClick={onClose}>إلغاء</Btn>
        <Btn full onClick={() => onSave(buildPatientEditPayload(f))}>✓ حفظ التعديلات</Btn>
      </div>
    </div>
  );
}
