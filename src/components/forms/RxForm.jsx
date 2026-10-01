import React, { useState } from 'react';
import { Btn } from '../common.jsx';
import { C } from '../../modules/theme/index.js';
import { Field, inp } from '../../modules/ui/atoms.jsx';
import { localISO } from '../../modules/constants/index.js';
import MedicinesStep from './MedicinesStep.jsx';
import { DEFAULT_DOCTOR_NAMES } from './visit-form-model.js';
import {
  RX_EYES, RX_LAST_STEP, SPH_OPTIONS, CYL_OPTIONS, AXIS_OPTIONS, ADD_OPTIONS, IPD_OPTIONS,
  SPH_DISPLAY_DEFAULT, CYL_DISPLAY_DEFAULT, AXIS_DISPLAY_DEFAULT, ADD_DISPLAY_DEFAULT, IPD_DISPLAY_DEFAULT,
  AXIS_FIELD_ERR_TEXT, AXIS_BANNER_TEXT, NO_PATIENTS_WARNING,
  autoPatientOf, initialRxState, initialRxStep, rxStepLabels, rxRealStep,
  validateRx, isRxValid, patientStepBlocked, findRxPatient, withRxPatient, axisStarShown, clearsAxisError,
  axisBannerEye, refractionSides
} from './rx-form-model.js';

// Three-step prescription add/edit form (patient → refraction → medicines).
// Port of the legacy runtime's RxForm (public/legacy/app-runtime.js), which
// stays in place for the legacy screens. Theme C, Field, inp and localISO are
// imported directly (Phase 8, batches 1/2/3), and MedicinesStep (the drug
// list + Rx templates step) directly from its own moved module (batch 15) --
// no more reads from the IAppLegacy bridge. `doctorNames` is accepted but
// unused, as in legacy.
export default function RxForm({ initial, patients, onSave, onClose, doctorNames = DEFAULT_DOCTOR_NAMES }) {
  const autoPatient = autoPatientOf(patients);
  const [f, setF] = useState(() => initialRxState(initial, autoPatient, localISO()));
  const [step, setStep] = useState(() => initialRxStep(autoPatient, initial));
  const [errors, setErrors] = useState({});
  const s = k => e => setF(v => ({ ...v, [k]: e.target.value }));
  const validate = () => {
    const e = validateRx(f);
    setErrors(e);
    return isRxValid(e);
  };
  const handleNext = () => {
    if (patientStepBlocked(step, f)) return;
    if (step === 1 && !validate()) return;
    setStep(p => p + 1);
  };
  const handleSave = () => {
    if (!validate()) {
      setStep(1);
      return;
    }
    onSave(f);
  };
  const sideSelectStyle = extra => ({ ...inp({ textAlign: 'center', padding: '8px 4px', fontSize: 13, ...extra }) });
  return (
    <div>
      {autoPatient && (
        <div
          style={{
            background: C.accent + '22',
            border: '1px solid ' + C.accent + '44',
            borderRadius: 10,
            padding: '8px 14px',
            marginBottom: 12,
            display: 'flex',
            alignItems: 'center',
            gap: 8
          }}
        >
          <span style={{ fontSize: 16 }}>👤</span>
          <span style={{ color: C.accent, fontWeight: 700, fontSize: 13 }}>{autoPatient.name}</span>
          <span style={{ color: C.muted, fontSize: 11, marginRight: 'auto' }}>{autoPatient.patientCode || ''}</span>
        </div>
      )}
      <div style={{ display: 'flex', marginBottom: 18, background: C.card, borderRadius: 12, padding: 4 }}>
        {rxStepLabels(autoPatient).map((st, i) => {
          const realStep = rxRealStep(autoPatient, i);
          return (
            <div
              key={i}
              onClick={() => setStep(realStep)}
              style={{
                flex: 1,
                textAlign: 'center',
                padding: '8px 4px',
                background: step === realStep ? 'linear-gradient(135deg,' + C.accent + ',' + C.teal + ')' : 'transparent',
                borderRadius: 9,
                cursor: 'pointer',
                color: step === realStep ? C.bg : C.muted,
                fontSize: 11,
                fontWeight: 700
              }}
            >{st}</div>
          );
        })}
      </div>
      {step === 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <Field label="المريض">
            <select
              style={inp()}
              value={f.patientId || ''}
              onChange={e => {
                const p = findRxPatient(patients, e.target.value);
                setF(v => withRxPatient(v, e.target.value, p));
              }}
            >
              <option value="">اختر مريض</option>
              {patients.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </Field>
          {patients.length === 0 && (
            <div style={{ color: C.gold, fontSize: 12, textAlign: 'center', padding: '8px', background: C.gold + '11', borderRadius: 8 }}>
              {NO_PATIENTS_WARNING}
            </div>
          )}
          <Field label="تاريخ الوصفة">
            <input style={inp()} type="date" value={f.date} onChange={s('date')} />
          </Field>
          <Field label="العين المعالجة">
            <div style={{ display: 'flex', gap: 8 }}>
              {RX_EYES.map(opt => (
                <div
                  key={opt}
                  onClick={() => setF(v => ({ ...v, eye: opt }))}
                  style={{
                    flex: 1,
                    textAlign: 'center',
                    padding: '9px 4px',
                    background: f.eye === opt ? C.accent + '22' : C.card,
                    border: `1px solid ${f.eye === opt ? C.accent : C.border}`,
                    borderRadius: 10,
                    cursor: 'pointer',
                    color: f.eye === opt ? C.accent : C.muted,
                    fontSize: 10,
                    fontWeight: 600
                  }}
                >{opt}</div>
              ))}
            </div>
          </Field>
          <Field label="ملاحظات">
            <textarea style={{ ...inp(), resize: 'none' }} rows={2} value={f.notes} onChange={s('notes')} placeholder="ملاحظات..." />
          </Field>
        </div>
      )}
      {step === 1 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {refractionSides(f.eye).map(([lbl, side, needed]) => (
            <div
              key={side}
              style={{
                background: C.card,
                border: `1px solid ${needed ? C.border : C.border + '55'}`,
                borderRadius: 14,
                padding: 14,
                opacity: needed ? 1 : 0.45
              }}
            >
              <div style={{ color: C.accent, fontWeight: 700, fontSize: 13, marginBottom: 12 }}>
                {'👁 العين '}{lbl}{' '}{!needed && <span style={{ color: C.muted, fontSize: 10, fontWeight: 400 }}>(غير مختارة)</span>}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
                <div>
                  <label style={{ color: C.muted, fontSize: 11, display: 'block', marginBottom: 5 }}>SPH</label>
                  <select
                    disabled={!needed}
                    style={sideSelectStyle()}
                    value={f['sph' + side] || SPH_DISPLAY_DEFAULT}
                    onChange={e => {
                      setF(v => ({ ...v, ['sph' + side]: e.target.value }));
                    }}
                  >
                    {SPH_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
                  </select>
                </div>
                <div>
                  <label style={{ color: C.muted, fontSize: 11, display: 'block', marginBottom: 5 }}>CYL</label>
                  <select
                    disabled={!needed}
                    style={sideSelectStyle()}
                    value={f['cyl' + side] || CYL_DISPLAY_DEFAULT}
                    onChange={e => {
                      const cylVal = e.target.value;
                      setF(v => ({ ...v, ['cyl' + side]: cylVal }));
                      if (clearsAxisError(cylVal)) setErrors(v => ({ ...v, ['axis' + side]: undefined }));
                    }}
                  >
                    {CYL_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
                  </select>
                </div>
                <div>
                  <label style={{ color: errors['axis' + side] ? C.danger : C.muted, fontSize: 11, display: 'block', marginBottom: 5, fontWeight: '700' }}>
                    {'AXIS '}{axisStarShown(f['cyl' + side]) && <span style={{ color: C.danger }}>*</span>}
                  </label>
                  <select
                    disabled={!needed}
                    style={sideSelectStyle({
                      border: `1px solid ${errors['axis' + side] ? C.danger : C.border}`,
                      background: errors['axis' + side] ? C.danger + '11' : C.bg
                    })}
                    value={f['axis' + side] || AXIS_DISPLAY_DEFAULT}
                    onChange={e => {
                      setF(v => ({ ...v, ['axis' + side]: e.target.value }));
                      setErrors(v => ({ ...v, ['axis' + side]: undefined }));
                    }}
                  >
                    {AXIS_OPTIONS.map(o => <option key={o} value={o}>{o}{'°'}</option>)}
                  </select>
                  {errors['axis' + side] && <div style={{ color: C.danger, fontSize: 9, marginTop: 3 }}>{AXIS_FIELD_ERR_TEXT}</div>}
                </div>
              </div>
            </div>
          ))}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <Field label="ADD (الإضافة)">
              <select style={inp({ textAlign: 'center' })} value={f.add || ADD_DISPLAY_DEFAULT} onChange={s('add')}>
                {ADD_OPTIONS.map(o => <option key={o} value={o}>{'+'}{o}</option>)}
              </select>
            </Field>
            <Field label="I.P.D (mm)">
              <select style={{ ...inp(), textAlign: 'center' }} value={f.ipd || IPD_DISPLAY_DEFAULT} onChange={s('ipd')}>
                {IPD_OPTIONS.map(v => <option key={v} value={v}>{v}</option>)}
              </select>
            </Field>
          </div>
          {(errors.axisR || errors.axisL) && (
            <div
              style={{
                background: C.danger + '11',
                border: `1px solid ${C.danger}44`,
                borderRadius: 10,
                padding: '10px 14px',
                display: 'flex',
                alignItems: 'center',
                gap: 8
              }}
            >
              <span style={{ fontSize: 16 }}>⚠️</span>
              <span style={{ color: C.danger, fontSize: 12, fontWeight: 600 }}>{AXIS_BANNER_TEXT}{axisBannerEye(errors)}</span>
            </div>
          )}
        </div>
      )}
      {step === 2 && <MedicinesStep medicines={f.medicines} onChange={val => setF(v => ({ ...v, medicines: val }))} />}
      <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
        {step > 0 && <Btn outline onClick={() => setStep(p => p - 1)}>السابق</Btn>}
        {step < RX_LAST_STEP ? (
          <Btn full onClick={handleNext}>التالي →</Btn>
        ) : (
          <>
            <Btn outline full onClick={onClose}>إلغاء</Btn>
            <Btn full onClick={handleSave}>✓ حفظ</Btn>
          </>
        )}
      </div>
    </div>
  );
}
