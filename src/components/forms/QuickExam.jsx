import React from 'react';
import { C } from '../../modules/theme/index.js';
import { t, useLang } from '../../modules/i18n/index.js';
import { tv } from '../../modules/i18n/tv.js';
import { Field, inp } from '../../modules/ui/atoms.jsx';
import { EXAM_COMPLAINTS, VA_OPTIONS, anyIopHigh, isIopHigh } from './exam-form-model.js';
import { COMMON_DX, appendTerm, FOLLOW_UP_DAYS, followUpDate, followUpChoice, cleanIop } from '../../modules/quick-desk/model.js';

const chip = (on, color) => ({
  background: on ? color + '2a' : 'transparent',
  border: '1px solid ' + (on ? color : C.border),
  color: on ? color : C.muted,
  borderRadius: 999,
  padding: '6px 10px',
  fontSize: 12,
  fontWeight: 700,
  cursor: 'pointer',
  fontFamily: 'inherit',
  minHeight: 34,
  minWidth: 44
});

// One tap = one value. Tapping the selected chip again clears it.
function ChipRow({ options, value, onPick, color = C.accent, label = o => o }) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
      {options.map(o => (
        <button type="button" key={o} aria-pressed={value === o} onClick={() => onPick(value === o ? '' : o)} style={chip(value === o, color)}>{label(o)}</button>
      ))}
    </div>
  );
}

// Quick exam: the fields a busy clinic fills on paper (complaint, VA, IOP, diagnosis, plan, follow-up) on one page of
// tap chips. Writes into the same form state as the full exam, so saving, signing, the Core sync and printing are
// unchanged and the doctor can switch to the full form at any moment without losing anything.
export default function QuickExam({ f, setF, onPickGuide }) {
  const lang = useLang();
  const set = (k, v) => setF(x => ({ ...x, [k]: v }));
  const complaints = EXAM_COMPLAINTS.slice(0, -1);
  const iopHigh = anyIopHigh(f.iopR, f.iopL);
  const fuChoice = followUpChoice(f.date, f.followUp);
  const eyeHead = (txt, color) => <div style={{ color, fontSize: 12, fontWeight: 800, marginBottom: 4 }}>{txt}</div>;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <Field label={t('g2.exam.chiefComplaint', lang)}>
        <ChipRow options={complaints} value={f.chiefComplaint} onPick={v => set('chiefComplaint', v)} label={o => tv(o)} />
      </Field>

      <Field label={t('qd.ex.va', lang)}>
        {eyeHead(t('g2.exam.right', lang), C.teal)}
        <ChipRow options={VA_OPTIONS} value={f.visualAcuityR} onPick={v => set('visualAcuityR', v)} color={C.teal} />
        <div style={{ height: 8 }} />
        {eyeHead(t('g2.exam.left', lang), C.accent)}
        <ChipRow options={VA_OPTIONS} value={f.visualAcuityL} onPick={v => set('visualAcuityL', v)} />
      </Field>

      <Field label={t('qd.ex.iop', lang)}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          {[['iopR', 'g2.exam.right'], ['iopL', 'g2.exam.left']].map(([k, lk]) => (
            <label key={k} style={{ display: 'flex', flexDirection: 'column', gap: 4, color: C.muted, fontSize: 11 }}>
              {t(lk, lang)}
              <input
                style={{ ...inp(), textAlign: 'center', fontSize: 18, fontWeight: 800, color: isIopHigh(f[k]) ? C.danger : C.text }}
                inputMode="numeric"
                value={f[k] || ''}
                onChange={e => set(k, cleanIop(e.target.value))}
                placeholder="mmHg"
              />
            </label>
          ))}
        </div>
        {iopHigh && <div style={{ color: C.danger, fontSize: 12, marginTop: 6 }}>{t('qd.ex.iopHigh', lang)}</div>}
      </Field>

      <Field label={t('g2.exam.dx', lang)}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginBottom: 6 }}>
          {COMMON_DX.map(d => (
            <button type="button" key={d} onClick={() => set('diagnosis', appendTerm(f.diagnosis, d))} style={chip(String(f.diagnosis || '').toLowerCase().split('\n').map(s => s.trim()).includes(d.toLowerCase()), C.gold)}>{d}</button>
          ))}
        </div>
        <textarea style={{ ...inp(), resize: 'none' }} rows={2} value={f.diagnosis || ''} onChange={e => set('diagnosis', e.target.value)} placeholder={t('g2.exam.dxPh', lang)} />
      </Field>

      <Field label={t('g2.exam.plan', lang)}>
        {onPickGuide && <button type="button" onClick={onPickGuide} style={{ ...chip(false, C.accent), marginBottom: 6 }}>{t('rxg.pickBtn', lang)}</button>}
        <textarea style={{ ...inp(), resize: 'none' }} rows={3} value={f.treatmentPlan || ''} onChange={e => set('treatmentPlan', e.target.value)} placeholder={t('g2.exam.planPh', lang)} />
      </Field>

      <Field label={t('g2.common.followUpDate', lang)}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
          {FOLLOW_UP_DAYS.map(n => (
            <button type="button" key={n} aria-pressed={fuChoice === n} onClick={() => set('followUp', fuChoice === n ? '' : followUpDate(f.date, n))} style={chip(fuChoice === n, C.success)}>{t('qd.fu.' + n, lang)}</button>
          ))}
        </div>
        {f.followUp && <div style={{ color: C.muted, fontSize: 11, marginTop: 4 }}>{f.followUp}</div>}
      </Field>
    </div>
  );
}
