import React, { useState } from 'react';
import {
  SECRETARY_APT_TYPES, SECRETARY_DEFAULT_CLINIC, initialSecretaryAptState, initialSecretaryAptMode, initialCostTouched,
  matchSecretaryPrice, withSecretaryAptType, withNewPatientMode, withExistingPatientMode, findPickedPatient,
  withPickedPatient, toggleSecretaryPaid, secretaryAptError, buildSecretaryAptPayload
} from './secretary-forms-model.js';
import { C } from '../../modules/theme/index.js';
import { inp } from '../../modules/ui/atoms.jsx';
import { localISO, clinicLabel, CLINICS_LIST } from '../../modules/constants/index.js';
import { t, useLang } from '../../modules/i18n/index.js';
import { tv } from '../../modules/i18n/tv.js';

// Front-desk appointment add/edit form (secretary app). Exact port of the
// legacy runtime's SecretaryAptForm (public/legacy/app-runtime.js).
export default function SecretaryAptForm({ initial, patients, appointments = [], prices = [], onSave, onClose }) {
  const lang = useLang();
  const [mode, setMode] = useState(() => initialSecretaryAptMode(initial));
  const [f, setF] = useState(() => initialSecretaryAptState(initial, localISO()));
  const [costTouched, setCostTouched] = useState(() => initialCostTouched(initial));
  const [err, setErr] = useState('');
  const s = k => e => setF(v => ({ ...v, [k]: e.target.value }));
  const setType = e => {
    const type = e.target.value;
    const m = matchSecretaryPrice(prices, type, f.clinic);
    setF(v => withSecretaryAptType(v, type, m, costTouched));
  };
  const label = { color: C.muted, fontSize: 11, display: 'block', marginBottom: 4 };
  const save = () => {
    const e = secretaryAptError(f, appointments);
    if (e) {
      setErr(e);
      return;
    }
    setErr('');
    onSave(buildSecretaryAptPayload(f, Date.now()));
  };
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        <div
          onClick={() => {
            setMode('new');
            setF(withNewPatientMode);
          }}
          style={{
            padding: '10px',
            borderRadius: 10,
            border: '2px solid ' + (mode === 'new' ? C.accent : C.border),
            background: mode === 'new' ? C.accent + '22' : C.card,
            textAlign: 'center',
            cursor: 'pointer',
            color: mode === 'new' ? C.accent : C.muted,
            fontSize: 12,
            fontWeight: 700
          }}
        >{t('g3.sec.newPatient', lang)}</div>
        <div
          onClick={() => {
            setMode('existing');
            setF(withExistingPatientMode);
          }}
          style={{
            padding: '10px',
            borderRadius: 10,
            border: '2px solid ' + (mode === 'existing' ? C.teal : C.border),
            background: mode === 'existing' ? C.teal + '22' : C.card,
            textAlign: 'center',
            cursor: 'pointer',
            color: mode === 'existing' ? C.teal : C.muted,
            fontSize: 12,
            fontWeight: 700
          }}
        >{t('g3.sec.registeredPatient', lang)}</div>
      </div>
      {mode === 'new' ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div>
            <label style={label}>{t('g3.apt.patientName', lang)}</label>
            <input style={inp()} value={f.patient} onChange={s('patient')} placeholder={t('g3.sec.newPatientPh', lang)} />
          </div>
          <div>
            <label style={label}>{t('g3.sec.phone', lang)}</label>
            <input style={inp()} value={f.phone || ''} onChange={s('phone')} placeholder="01xxxxxxxxx" type="tel" />
          </div>
        </div>
      ) : (
        <div>
          <label style={label}>{t('g3.sec.pickRegistered', lang)}</label>
          <select
            style={inp()}
            value={f.patientId || ''}
            onChange={e => {
              const p = findPickedPatient(patients, e.target.value);
              if (p) setF(v => withPickedPatient(v, p));
            }}
          >
            <option value="">{t('g3.sec.pickerPlaceholder', lang)}</option>
            {patients.map(p => <option key={p.id} value={p.id}>{p.name}{' - '}{p.patientCode}</option>)}
          </select>
        </div>
      )}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <div>
          <label style={label}>{t('common.date', lang)}</label>
          <input style={inp()} type="date" value={f.date} onChange={s('date')} />
        </div>
        <div>
          <label style={label}>{t('g3.apt.time', lang)}</label>
          <input style={inp()} type="time" value={f.time} onChange={s('time')} />
        </div>
      </div>
      <div>
        <label style={label}>{t('g3.apt.clinic', lang)}</label>
        <select style={inp()} value={f.clinic || SECRETARY_DEFAULT_CLINIC} onChange={e => { const clinic = e.target.value; setF(v => withSecretaryAptType({ ...v, clinic }, v.type, matchSecretaryPrice(prices, v.type || '', clinic), costTouched)); }}>
          {CLINICS_LIST.map(c => <option key={c} value={c}>{tv(clinicLabel(c), lang)}</option>)}
        </select>
      </div>
      <div>
        <label style={label}>{t('g3.sec.aptType', lang)}</label>
        <select style={inp()} value={f.type} onChange={setType}>
          {SECRETARY_APT_TYPES.map(type => <option key={type} value={type}>{tv(type, lang)}</option>)}
        </select>
      </div>
      <div>
        <label style={label}>{t('g3.apt.doctor', lang)}</label>
        <input style={inp()} value={tv(f.doctor, lang)} onChange={s('doctor')} />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <div>
          <label style={label}>{t('g3.collect.cost', lang)}</label>
          <input
            style={inp()}
            type="number"
            value={f.cost || ''}
            onChange={e => {
              setCostTouched(true);
              setF(v => ({ ...v, cost: e.target.value }));
            }}
            placeholder="0"
          />
        </div>
        <div
          onClick={() => setF(toggleSecretaryPaid)}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            background: C.card,
            border: '1px solid ' + (f.paid ? C.success : C.border),
            borderRadius: 10,
            padding: '0 12px',
            cursor: 'pointer',
            marginTop: 19
          }}
        >
          <div
            style={{
              width: 18,
              height: 18,
              borderRadius: 5,
              background: f.paid ? C.success : C.bg,
              border: '2px solid ' + (f.paid ? C.success : C.border),
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 11,
              color: C.bg,
              fontWeight: 700
            }}
          >{f.paid ? '✓' : ''}</div>
          <span style={{ color: f.paid ? C.success : C.muted, fontSize: 12, fontWeight: 600 }}>{t('g3.sec.collected', lang)}</span>
        </div>
      </div>
      <div>
        <label style={label}>{t('g3.expense.notes', lang)}</label>
        <textarea style={{ ...inp(), minHeight: 55, resize: 'none' }} value={f.notes || ''} onChange={s('notes')} />
      </div>
      {err && (
        <div
          style={{
            background: C.danger + '22',
            border: '1px solid ' + C.danger + '44',
            borderRadius: 10,
            padding: '9px 12px',
            color: C.danger,
            fontSize: 12,
            textAlign: 'center'
          }}
        >{err}</div>
      )}
      <div style={{ display: 'flex', gap: 10 }}>
        <button
          onClick={onClose}
          style={{
            flex: 1,
            background: 'transparent',
            border: '1px solid ' + C.border,
            borderRadius: 10,
            padding: 11,
            color: C.muted,
            fontWeight: 700,
            fontSize: 13,
            cursor: 'pointer',
            fontFamily: 'inherit'
          }}
        >{t('g3.common.cancel', lang)}</button>
        <button
          onClick={save}
          style={{
            flex: 2,
            background: 'linear-gradient(135deg,' + C.accent + ',' + C.teal + ')',
            border: 'none',
            borderRadius: 10,
            padding: 11,
            color: C.bg,
            fontWeight: 700,
            fontSize: 13,
            cursor: 'pointer',
            fontFamily: 'inherit'
          }}
        >{t('g3.sec.saveApt', lang)}</button>
      </div>
    </div>
  );
}
