import React, { useState } from 'react';
import { Btn } from '../common.jsx';
import { DEFAULT_DOCTOR_NAMES } from './visit-form-model.js';
import {
  EXAM_STEPS, EXAM_LAST_STEP, EXAM_COMPLAINTS, VA_OPTIONS, IOP_OPTIONS, EXAM_SELECT_ROWS,
  initialExamState, chiefComplaintSelectValue, withChiefComplaintSelect, chiefComplaintInputShown,
  chiefComplaintBadgeShown, isIopHigh, anyIopHigh, prevStep, nextStep, buildExamPayload
} from './exam-form-model.js';
import { C } from '../../modules/theme/index.js';
import { Field, SecHead, inp } from '../../modules/ui/atoms.jsx';
import { localISO } from '../../modules/constants/misc.js';

// Three-step examination add/edit form. Exact port of the legacy runtime's
// ExamForm (public/legacy/app-runtime.js).
export default function ExamForm({ initial, patientId, onSave, onClose, doctorNames = DEFAULT_DOCTOR_NAMES }) {
  const [f, setF] = useState(() => initialExamState(initial, localISO()));
  const [step, setStep] = useState(0);
  const s = k => e => setF(v => ({ ...v, [k]: e.target.value }));
  const iopHigh = anyIopHigh(f.iopR, f.iopL);
  return (
    <div>
      <div style={{ display: 'flex', marginBottom: 18, background: C.card, borderRadius: 12, padding: 4 }}>
        {EXAM_STEPS.map((st, i) => (
          <div
            key={i}
            onClick={() => setStep(i)}
            style={{
              flex: 1,
              textAlign: 'center',
              padding: '8px 2px',
              background: step === i ? `linear-gradient(135deg,${C.accent},${C.teal})` : 'transparent',
              borderRadius: 9,
              cursor: 'pointer',
              color: step === i ? C.bg : C.muted,
              fontSize: 10,
              fontWeight: 700
            }}
          >{st}</div>
        ))}
      </div>
      {step === 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <Field label="تاريخ الفحص">
            <input style={inp()} type="date" value={f.date} onChange={s('date')} />
          </Field>
          <Field label="الطبيب">
            <select style={inp()} value={f.doctor} onChange={s('doctor')}>
              {doctorNames.map(d => <option key={d}>{d}</option>)}
            </select>
          </Field>
          <Field label="الشكوى الرئيسية">
            <select
              style={inp()}
              value={chiefComplaintSelectValue(f.chiefComplaint)}
              onChange={e => {
                const v = e.target.value;
                setF(fv => withChiefComplaintSelect(fv, v));
              }}
            >
              <option value="">— اختر الشكوى —</option>
              {EXAM_COMPLAINTS.map(c => <option key={c}>{c}</option>)}
            </select>
            {chiefComplaintInputShown(f.chiefComplaint) && (
              <input
                style={{ ...inp(), marginTop: 6 }}
                value={f.chiefComplaint}
                onChange={s('chiefComplaint')}
                placeholder="اكتب الشكوى بالتفصيل..."
              />
            )}
            {chiefComplaintBadgeShown(f.chiefComplaint) && (
              <div
                style={{
                  background: C.accent + '22',
                  border: `1px solid ${C.accent}33`,
                  borderRadius: 8,
                  padding: '6px 10px',
                  marginTop: 6,
                  color: C.accent,
                  fontSize: 12
                }}
              >{'✓ '}{f.chiefComplaint}</div>
            )}
          </Field>
        </div>
      )}
      {step === 1 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <SecHead icon="👁" label="حدة الإبصار (Visual Acuity)" />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <Field label="اليمنى">
              <select style={{ ...inp(), textAlign: 'center' }} value={f.visualAcuityR} onChange={s('visualAcuityR')}>
                <option value="">— اختر —</option>
                {VA_OPTIONS.map(v => <option key={v}>{v}</option>)}
              </select>
            </Field>
            <Field label="اليسرى">
              <select style={{ ...inp(), textAlign: 'center' }} value={f.visualAcuityL} onChange={s('visualAcuityL')}>
                <option value="">— اختر —</option>
                {VA_OPTIONS.map(v => <option key={v}>{v}</option>)}
              </select>
            </Field>
          </div>
          {(f.visualAcuityR || f.visualAcuityL) && (
            <div
              style={{
                background: C.teal + '11',
                border: `1px solid ${C.teal}33`,
                borderRadius: 10,
                padding: '8px 12px',
                display: 'flex',
                justifyContent: 'space-around'
              }}
            >
              {f.visualAcuityR && (
                <div style={{ textAlign: 'center' }}>
                  <div style={{ color: C.muted, fontSize: 10 }}>يمنى</div>
                  <div style={{ color: C.teal, fontWeight: 800, fontSize: 16 }}>{f.visualAcuityR}</div>
                </div>
              )}
              {f.visualAcuityR && f.visualAcuityL && <div style={{ color: C.border }}>|</div>}
              {f.visualAcuityL && (
                <div style={{ textAlign: 'center' }}>
                  <div style={{ color: C.muted, fontSize: 10 }}>يسرى</div>
                  <div style={{ color: C.teal, fontWeight: 800, fontSize: 16 }}>{f.visualAcuityL}</div>
                </div>
              )}
            </div>
          )}
          <SecHead icon="🔵" label="ضغط العين IOP (mmHg)" color={C.teal} />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <Field label="اليمنى">
              <select style={{ ...inp(), textAlign: 'center' }} value={f.iopR} onChange={s('iopR')}>
                <option value="">— اختر —</option>
                {IOP_OPTIONS.map(v => <option key={v}>{v}</option>)}
              </select>
            </Field>
            <Field label="اليسرى">
              <select style={{ ...inp(), textAlign: 'center' }} value={f.iopL} onChange={s('iopL')}>
                <option value="">— اختر —</option>
                {IOP_OPTIONS.map(v => <option key={v}>{v}</option>)}
              </select>
            </Field>
          </div>
          {(f.iopR || f.iopL) && (
            <div
              style={{
                background: iopHigh ? C.danger + '11' : C.success + '11',
                border: `1px solid ${iopHigh ? C.danger : C.success}33`,
                borderRadius: 10,
                padding: '8px 12px',
                display: 'flex',
                justifyContent: 'space-around',
                alignItems: 'center'
              }}
            >
              {f.iopR && (
                <div style={{ textAlign: 'center' }}>
                  <div style={{ color: C.muted, fontSize: 10 }}>يمنى</div>
                  <div style={{ color: isIopHigh(f.iopR) ? C.danger : C.success, fontWeight: 800, fontSize: 16 }}>
                    {f.iopR}{' '}<span style={{ fontSize: 10 }}>mmHg</span>
                  </div>
                </div>
              )}
              {f.iopR && f.iopL && <div style={{ color: C.border }}>|</div>}
              {f.iopL && (
                <div style={{ textAlign: 'center' }}>
                  <div style={{ color: C.muted, fontSize: 10 }}>يسرى</div>
                  <div style={{ color: isIopHigh(f.iopL) ? C.danger : C.success, fontWeight: 800, fontSize: 16 }}>
                    {f.iopL}{' '}<span style={{ fontSize: 10 }}>mmHg</span>
                  </div>
                </div>
              )}
              {iopHigh && <div style={{ color: C.danger, fontSize: 11, fontWeight: 700 }}>⚠ مرتفع</div>}
            </div>
          )}
          <SecHead icon="🔍" label="المصباح الشقي" color={C.gold} />
          <Field label="القطعة الأمامية">
            <textarea
              style={{ ...inp(), resize: 'none' }}
              rows={2}
              value={f.anteriorSegment}
              onChange={s('anteriorSegment')}
              placeholder="القرنية، القزحية، العدسة..."
            />
          </Field>
          <Field label="القطعة الخلفية">
            <textarea
              style={{ ...inp(), resize: 'none' }}
              rows={2}
              value={f.posteriorSegment}
              onChange={s('posteriorSegment')}
              placeholder="القرص البصري، الشبكية..."
            />
          </Field>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
            {EXAM_SELECT_ROWS.map(([lbl, key, opts]) => (
              <Field key={key} label={lbl}>
                <select style={inp()} value={f[key]} onChange={s(key)}>
                  {opts.map(o => <option key={o}>{o}</option>)}
                </select>
              </Field>
            ))}
          </div>
        </div>
      )}
      {step === 2 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <Field label="التشخيص النهائي">
            <textarea
              style={{ ...inp(), resize: 'none' }}
              rows={3}
              value={f.diagnosis}
              onChange={s('diagnosis')}
              placeholder="قصر نظر، ماء أبيض..."
            />
          </Field>
          <Field label="خطة العلاج">
            <textarea
              style={{ ...inp(), resize: 'none' }}
              rows={4}
              value={f.treatmentPlan}
              onChange={s('treatmentPlan')}
              placeholder="نظارة طبية - قطرات - جراحة..."
            />
          </Field>
          <Field label="موعد المتابعة">
            <input style={inp()} type="date" value={f.followUp} onChange={s('followUp')} />
          </Field>
          <Field label="ملاحظات">
            <textarea
              style={{ ...inp(), resize: 'none' }}
              rows={2}
              value={f.notes}
              onChange={s('notes')}
              placeholder="توصيات للمريض..."
            />
          </Field>
        </div>
      )}
      <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
        {step > 0 && <Btn outline onClick={() => setStep(prevStep)}>السابق</Btn>}
        {step < EXAM_LAST_STEP ? (
          <Btn full onClick={() => setStep(nextStep)}>التالي →</Btn>
        ) : (
          <>
            <Btn outline full onClick={onClose}>إلغاء</Btn>
            <Btn full onClick={() => onSave(buildExamPayload(f, patientId, Date.now()))}>✓ حفظ الفحص</Btn>
          </>
        )}
      </div>
    </div>
  );
}
