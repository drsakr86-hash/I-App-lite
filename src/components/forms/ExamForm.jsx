import React, { useState, lazy, Suspense } from 'react';
import { Btn } from '../common.jsx';
import { isSigned, canSignExam, validAmendReason, examStatus } from '../../modules/patient-file/clinical-record.js';
import { DEFAULT_DOCTOR_NAMES } from './visit-form-model.js';
import {
  examStepLabels, EXAM_LAST_STEP, EXAM_COMPLAINTS, VA_OPTIONS, IOP_OPTIONS, EXAM_SELECT_ROWS,
  initialExamState, chiefComplaintSelectValue, withChiefComplaintSelect, chiefComplaintInputShown,
  chiefComplaintBadgeShown, isIopHigh, anyIopHigh, prevStep, nextStep, buildExamPayload
} from './exam-form-model.js';
import { C } from '../../modules/theme/index.js';
import { useLang, t } from '../../modules/i18n/index.js';
import { tv } from '../../modules/i18n/tv.js';
import { Field, SecHead, inp } from '../../modules/ui/atoms.jsx';
import { localISO } from '../../modules/constants/misc.js';
import { OphthFindings, OphthPlan } from './OphthDetails.jsx';
import { examForEditing, applyOphthToExam } from '../../modules/patient-file/ophth.js';
import ScribePanel from './ScribePanel.jsx';
import SpecialExamSheets from './SpecialExamSheets.jsx';
import DdxPanel from './DdxPanel.jsx';
import { finalizeExamSpecial } from '../../modules/special-exam/model.js';
import { appendWorkup } from '../../modules/special-exam/ddx.js';
import { isEnabled } from '../../modules/feature-flags/index.js';
import { can } from '../../app/permissions.js';
// loaded only when the atlas flag is on and the role may use it (keeps the sync layer out of the plain exam form)
const ExamAtlasStep = lazy(() => import('../atlas/ExamAtlasStep.jsx'));

// Three-step examination add/edit form. Exact port of the legacy runtime's
// ExamForm (public/legacy/app-runtime.js).
export default function ExamForm({ initial, patientId, patient = null, session = null, onSave, onClose, doctorNames = DEFAULT_DOCTOR_NAMES }) {
  const lang = useLang();
  const [f, setF] = useState(() => initialExamState(initial ? examForEditing(initial) : initial, localISO()));
  const atlasOn = isEnabled('atlas') && can(session && session.role, 'atlas', 'read');
  // steps: data, clinical, [anatomy sketch], diagnosis. The sketch step exists only with the atlas flag on, for doctor/admin.
  const keys = atlasOn ? ['data', 'clinical', 'atlas', 'dx'] : ['data', 'clinical', 'dx'];
  const labels = examStepLabels();
  const stepLabels = atlasOn ? [labels[0], labels[1], t('atlas.exam.step', lang), labels[2]] : labels;
  const [step, setStep] = useState(0);
  const cur = keys[step];
  const lastStep = keys.length - 1;
  // an exam that is still new gets its id now, so a drawing approved while examining can point at it
  const [draftId] = useState(() => (initial && initial.id) || Date.now());
  const s = k => e => setF(v => ({ ...v, [k]: e.target.value }));
  const setOphth = o => setF(v => ({ ...v, ophth: o }));
  const iopHigh = anyIopHigh(f.iopR, f.iopL);
  const signed = isSigned(initial);
  const [amendReason, setAmendReason] = useState('');
  const payload = () => finalizeExamSpecial(applyOphthToExam(buildExamPayload({ ...f, id: f.id || draftId }, patientId, Date.now())));
  const stLabel = examStatus(initial);
  return (
    <div>
      {initial && initial.id && (
        <div style={{ background: signed ? C.success + '18' : C.gold + '14', border: `1px solid ${signed ? C.success : C.gold}44`, borderRadius: 10, padding: '8px 12px', marginBottom: 10, fontSize: 12, lineHeight: 1.7 }}>
          {t('g3.rec.status.' + stLabel, lang)}
          {signed && ` · v${initial.recVersion || 1} · ${initial.signedBy || ''} · ${String(initial.signedAt || '').slice(0, 16).replace('T', ' ')}`}
          {signed && <div>{t('g3.rec.amendNote', lang)}</div>}
        </div>
      )}
      {!signed && <ScribePanel form={f} onApply={setF} />}
      <div role="tablist" aria-label={t('g2.exam.stepsAria', lang)} style={{ display: 'flex', marginBottom: 18, background: C.card, borderRadius: 12, padding: 4 }}>
        {stepLabels.map((st, i) => (
          <button
            type="button"
            role="tab"
            aria-selected={step === i}
            key={i}
            onClick={() => setStep(i)}
            style={{
              flex: 1,
              minHeight: 44,
              border: 'none',
              font: 'inherit',
              textAlign: 'center',
              padding: '8px 2px',
              background: step === i ? C.accent : 'transparent',
              borderRadius: 9,
              cursor: 'pointer',
              color: step === i ? '#fff' : C.muted,
              fontSize: 12,
              fontWeight: 700
            }}
          >{st}</button>
        ))}
      </div>
      {cur === 'data' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <Field label={t('g2.exam.date', lang)}>
            <input style={inp()} type="date" value={f.date} onChange={s('date')} />
          </Field>
          <Field label={t('g2.common.doctor', lang)}>
            <select style={inp()} value={f.doctor} onChange={s('doctor')}>
              {doctorNames.map(d => <option key={d} value={d}>{tv(d)}</option>)}
            </select>
          </Field>
          <Field label={t('g2.exam.chiefComplaint', lang)}>
            <select
              style={inp()}
              value={chiefComplaintSelectValue(f.chiefComplaint)}
              onChange={e => {
                const v = e.target.value;
                setF(fv => withChiefComplaintSelect(fv, v));
              }}
            >
              <option value="">{t('g2.common.pickComplaint', lang)}</option>
              {EXAM_COMPLAINTS.map(c => <option key={c} value={c}>{tv(c)}</option>)}
            </select>
            {chiefComplaintInputShown(f.chiefComplaint) && (
              <input
                style={{ ...inp(), marginTop: 6 }}
                value={f.chiefComplaint}
                onChange={s('chiefComplaint')}
                placeholder={t('g2.exam.complaintPh', lang)}
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
              >{'✓ '}{tv(f.chiefComplaint)}</div>
            )}
          </Field>
        </div>
      )}
      {cur === 'clinical' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <SecHead icon="👁" label={t('g2.exam.bcvaHead', lang)} />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <Field label={t('g2.exam.right', lang)}>
              <select style={{ ...inp(), textAlign: 'center' }} value={f.visualAcuityR} onChange={s('visualAcuityR')}>
                <option value="">{t('g2.common.select', lang)}</option>
                {VA_OPTIONS.map(v => <option key={v}>{v}</option>)}
              </select>
            </Field>
            <Field label={t('g2.exam.left', lang)}>
              <select style={{ ...inp(), textAlign: 'center' }} value={f.visualAcuityL} onChange={s('visualAcuityL')}>
                <option value="">{t('g2.common.select', lang)}</option>
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
                  <div style={{ color: C.muted, fontSize: 10 }}>{t('g2.exam.rightShort', lang)}</div>
                  <div style={{ color: C.teal, fontWeight: 800, fontSize: 16 }}>{f.visualAcuityR}</div>
                </div>
              )}
              {f.visualAcuityR && f.visualAcuityL && <div style={{ color: C.border }}>|</div>}
              {f.visualAcuityL && (
                <div style={{ textAlign: 'center' }}>
                  <div style={{ color: C.muted, fontSize: 10 }}>{t('g2.exam.leftShort', lang)}</div>
                  <div style={{ color: C.teal, fontWeight: 800, fontSize: 16 }}>{f.visualAcuityL}</div>
                </div>
              )}
            </div>
          )}
          <SecHead icon="🔵" label={t('g2.exam.iopHead', lang)} color={C.teal} />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <Field label={t('g2.exam.right', lang)}>
              <select style={{ ...inp(), textAlign: 'center' }} value={f.iopR} onChange={s('iopR')}>
                <option value="">{t('g2.common.select', lang)}</option>
                {IOP_OPTIONS.map(v => <option key={v}>{v}</option>)}
              </select>
            </Field>
            <Field label={t('g2.exam.left', lang)}>
              <select style={{ ...inp(), textAlign: 'center' }} value={f.iopL} onChange={s('iopL')}>
                <option value="">{t('g2.common.select', lang)}</option>
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
                  <div style={{ color: C.muted, fontSize: 10 }}>{t('g2.exam.rightShort', lang)}</div>
                  <div style={{ color: isIopHigh(f.iopR) ? C.danger : C.success, fontWeight: 800, fontSize: 16 }}>
                    {f.iopR}{' '}<span style={{ fontSize: 10 }}>mmHg</span>
                  </div>
                </div>
              )}
              {f.iopR && f.iopL && <div style={{ color: C.border }}>|</div>}
              {f.iopL && (
                <div style={{ textAlign: 'center' }}>
                  <div style={{ color: C.muted, fontSize: 10 }}>{t('g2.exam.leftShort', lang)}</div>
                  <div style={{ color: isIopHigh(f.iopL) ? C.danger : C.success, fontWeight: 800, fontSize: 16 }}>
                    {f.iopL}{' '}<span style={{ fontSize: 10 }}>mmHg</span>
                  </div>
                </div>
              )}
              {iopHigh && <div style={{ color: C.danger, fontSize: 11, fontWeight: 700 }}>{t('g2.exam.high', lang)}</div>}
            </div>
          )}
          <SecHead icon="🔍" label={t('g2.exam.slitLamp', lang)} color={C.gold} />
          <Field label={t('g2.exam.anterior', lang)}>
            <textarea
              style={{ ...inp(), resize: 'none' }}
              rows={2}
              value={f.anteriorSegment}
              onChange={s('anteriorSegment')}
              placeholder={t('g2.exam.anteriorPh', lang)}
            />
          </Field>
          <Field label={t('g2.exam.posterior', lang)}>
            <textarea
              style={{ ...inp(), resize: 'none' }}
              rows={2}
              value={f.posteriorSegment}
              onChange={s('posteriorSegment')}
              placeholder={t('g2.exam.posteriorPh', lang)}
            />
          </Field>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
            {EXAM_SELECT_ROWS.map(([, key, opts]) => (
              <Field key={key} label={t('g2.exam.sel.' + key, lang)}>
                <select style={inp()} value={f[key]} onChange={s(key)}>
                  {opts.map(o => <option key={o} value={o}>{tv(o)}</option>)}
                </select>
              </Field>
            ))}
          </div>
          <OphthFindings value={f.ophth} onChange={setOphth} />
          {isEnabled('special_sheets') ? (
            <SpecialExamSheets
              value={f.special}
              onChange={sp => setF(v => ({ ...v, special: sp }))}
              plan={f.treatmentPlan}
              onWorkup={list => setF(v => ({ ...v, treatmentPlan: appendWorkup(v.treatmentPlan, list) }))}
            />
          ) : null}
        </div>
      )}
      {cur === 'atlas' && (
        <Suspense fallback={<div style={{ color: C.muted, padding: 12 }}>…</div>}>
          <ExamAtlasStep
            patient={patient || { id: patientId, name: '' }}
            exam={{ id: draftId, patientId, date: f.date, visitId: f.visitId ?? null }}
            session={session}
            drawings={Array.isArray(f.atlasDrawings) ? f.atlasDrawings : []}
            onChange={list => setF(v => ({ ...v, atlasDrawings: list }))}
          />
        </Suspense>
      )}
      {cur === 'dx' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {isEnabled('ddx') && can(session && session.role, 'ddx', 'read') ? (
            <DdxPanel
              exam={f}
              by={(session && session.email) || ''}
              onReviews={list => setF(v => ({ ...v, ddxReview: list }))}
              onDiagnosis={dx => setF(v => ({ ...v, diagnosis: dx }))}
              onWorkup={list => setF(v => ({ ...v, treatmentPlan: appendWorkup(v.treatmentPlan, list) }))}
            />
          ) : null}
          <Field label={t('g2.exam.dx', lang)}>
            <textarea
              style={{ ...inp(), resize: 'none' }}
              rows={3}
              value={f.diagnosis}
              onChange={s('diagnosis')}
              placeholder={t('g2.exam.dxPh', lang)}
            />
          </Field>
          <Field label={t('g2.exam.plan', lang)}>
            <textarea
              style={{ ...inp(), resize: 'none' }}
              rows={4}
              value={f.treatmentPlan}
              onChange={s('treatmentPlan')}
              placeholder={t('g2.exam.planPh', lang)}
            />
          </Field>
          <Field label={t('g2.common.followUpDate', lang)}>
            <input style={inp()} type="date" value={f.followUp} onChange={s('followUp')} />
          </Field>
          <OphthPlan value={f.ophth} onChange={setOphth} />
          <Field label={t('g2.common.notes', lang)}>
            <textarea
              style={{ ...inp(), resize: 'none' }}
              rows={2}
              value={f.notes}
              onChange={s('notes')}
              placeholder={t('g2.exam.notesPh', lang)}
            />
          </Field>
        </div>
      )}
      <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
        {step > 0 && <Btn outline onClick={() => setStep(p => Math.max(0, prevStep(p)))}>{t('g2.common.prev', lang)}</Btn>}
        {step < lastStep ? (
          <Btn full onClick={() => setStep(p => Math.min(lastStep, nextStep(p)))}>{t('g2.common.next', lang)}</Btn>
        ) : (
          <>
            <Btn outline full onClick={onClose}>{t('g2.common.cancel', lang)}</Btn>
            {signed ? (
              <>
                <input style={{ flex: 2, minWidth: 0 }} value={amendReason} onChange={e => setAmendReason(e.target.value)} placeholder={t('g3.rec.reasonPh', lang)} />
                <Btn full disabled={!validAmendReason(amendReason)} onClick={() => validAmendReason(amendReason) && onSave(payload(), { amend: true, reason: amendReason })}>{t('g3.rec.saveAmend', lang)}</Btn>
              </>
            ) : (
              <>
                <Btn full onClick={() => onSave(payload())}>{t('g2.exam.save', lang)}</Btn>
                {canSignExam(session && session.role) && <Btn full color={C.success} onClick={() => onSave(payload(), { sign: true })}>{t('g3.rec.saveSign', lang)}</Btn>}
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
