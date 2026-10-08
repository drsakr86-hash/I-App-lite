import React from 'react';
import { C } from '../../modules/theme/index.js';
import { inp } from '../../modules/ui/atoms.jsx';
import {
  normalizeOphth, ANTERIOR_PARTS, POSTERIOR_PARTS, IOP_METHODS,
  SPH_OPTIONS, CYL_OPTIONS, AXIS_OPTIONS, CD_OPTIONS, ANTERIOR_OPTIONS, POSTERIOR_OPTIONS,
  DX_OPTIONS, INVESTIGATION_OPTIONS, FOLLOWUP_REASON_OPTIONS
} from '../../modules/patient-file/ophth.js';
import { VA_OPTIONS } from './exam-form-model.js';
import { useLang, t } from '../../modules/i18n/index.js';
import { tv } from '../../modules/i18n/tv.js';

const OTHER = '__other__';

// Drop-down with an "أخرى…" escape hatch. The stored value is always plain text:
// a value that is not in the list (old record, or typed under "أخرى…") is kept and shown.
function Pick({ value, onChange, options, label, ltr, startAt }) {
  const lang = useLang();
  const v = value || '';
  const inList = v === '' || options.includes(v);
  const [typing, setTyping] = React.useState(!inList);
  const showText = typing || !inList;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
      <select
        className="ds-field"
        style={inp()}
        aria-label={label}
        dir={ltr ? 'ltr' : undefined}
        onBlur={() => { if (!showText && !v && startAt && options.includes(startAt)) onChange(startAt); }}
        value={showText ? OTHER : (v || (startAt && options.includes(startAt) ? startAt : ''))}
        onChange={e => {
          if (e.target.value === OTHER) { setTyping(true); return; }
          setTyping(false);
          onChange(e.target.value);
        }}
      >
        <option value="">{t('g2.common.select', lang)}</option>
        {options.map(o => <option key={o} value={o}>{tv(o)}</option>)}
        <option value={OTHER}>{t('g2.ophth.other', lang)}</option>
      </select>
      {showText && (
        <input
          className="ds-field"
          style={inp()}
          dir="auto"
          aria-label={label + ' (' + t('g2.ophth.freeText', lang) + ')'}
          value={v}
          placeholder={t('g2.ophth.typeHere', lang)}
          onChange={e => onChange(e.target.value)}
        />
      )}
    </div>
  );
}

// Optional structured ophthalmic details (stored in exam.ophth -- see modules/patient-file/ophth.js).
// Every field is optional and starts empty; nothing is pre-filled or computed.
// The flat BCVA / IOP / diagnosis / plan fields of the exam form remain the primary source.

const setPath = (o, path, value) => {
  const next = normalizeOphth(o);
  let cur = next;
  for (let i = 0; i < path.length - 1; i++) cur = cur[path[i]];
  cur[path[path.length - 1]] = value;
  return next;
};

function Eye({ label, children }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
      <span className="ds-sub">{label}</span>
      {children}
    </label>
  );
}

function PairInputs({ o, onChange, group, part, label, placeholder, unit, inputMode, options }) {
  const lang = useLang();
  const val = eye => (part ? o[group][part][eye] : o[group][eye]);
  const path = eye => (part ? [group, part, eye] : [group, eye]);
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
      {['od', 'os'].map(eye => (
        <Eye key={eye} label={`${label} ${eye.toUpperCase()}${unit ? ' (' + unit + ')' : ''}`}>
          {options ? (
            <Pick ltr={!!unit || group === 'cd'} label={`${label} ${eye.toUpperCase()}`} options={options} value={val(eye)} onChange={v => onChange(setPath(o, path(eye), v))} />
          ) : (
            <input className="ds-field" style={inp()} inputMode={inputMode} dir="auto" value={val(eye)} placeholder={placeholder}
              onChange={e => onChange(setPath(o, path(eye), e.target.value))} />
          )}
        </Eye>
      ))}
    </div>
  );
}

function Group({ title, children, open }) {
  return (
    <details open={open} style={{ border: `1px solid ${C.border}`, borderRadius: 10, padding: '4px 10px 10px', background: C.card }}>
      <summary style={{ cursor: 'pointer', minHeight: 44, display: 'flex', alignItems: 'center', color: C.text, fontWeight: 700, fontSize: 13 }}>{title}</summary>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>{children}</div>
    </details>
  );
}

// Step 2 of the exam form (examination findings)
export function OphthFindings({ value, onChange }) {
  const lang = useLang();
  const o = normalizeOphth(value);
  return (
    <Group title={t('g2.ophth.findingsTitle', lang)}>
      <div className="ds-sub">{t('g2.ophth.findingsHint', lang)}</div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        {['od', 'os'].map(eye => (
          <Eye key={'u' + eye} label={t('g2.ophth.ucva', lang, { eye: eye.toUpperCase() })}>
            <Pick ltr label={`UCVA ${eye.toUpperCase()}`} options={VA_OPTIONS} value={o.va[eye].ucva} onChange={val => onChange(setPath(o, ['va', eye, 'ucva'], val))} />
          </Eye>
        ))}
        {['od', 'os'].map(eye => (
          <Eye key={'p' + eye} label={`PH ${eye.toUpperCase()} (Pinhole)`}>
            <Pick ltr label={`PH ${eye.toUpperCase()}`} options={VA_OPTIONS} value={o.va[eye].ph} onChange={val => onChange(setPath(o, ['va', eye, 'ph'], val))} />
          </Eye>
        ))}
      </div>
      <Eye label={t('g2.ophth.iopMethod', lang)}>
        <select className="ds-field" style={inp()} value={o.iop.method} onChange={e => onChange(setPath(o, ['iop', 'method'], e.target.value))}>
          <option value="">{t('g2.ophth.unspecified', lang)}</option>
          {IOP_METHODS.map(m => <option key={m}>{m}</option>)}
        </select>
      </Eye>
      {['od', 'os'].map(eye => (
        <div key={'r' + eye} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
          {[['sph', 'SPH', SPH_OPTIONS], ['cyl', 'CYL', CYL_OPTIONS], ['axis', 'AXIS', AXIS_OPTIONS]].map(([k, l, opts]) => (
            <Eye key={k} label={`${l} ${eye.toUpperCase()}`}>
              <Pick ltr startAt={k === 'sph' ? 'Plano' : undefined} label={`${l} ${eye.toUpperCase()}`} options={opts} value={o.refraction[eye][k]} onChange={val => onChange(setPath(o, ['refraction', eye, k], val))} />
            </Eye>
          ))}
        </div>
      ))}
      <div className="ds-h" style={{ marginTop: 4 }}>{t('g2.exam.anterior', lang)}</div>
      {ANTERIOR_PARTS.map(([k, l]) => <PairInputs key={k} o={o} onChange={onChange} group="anterior" part={k} label={tv(l)} options={ANTERIOR_OPTIONS[k]} />)}
      <div className="ds-h" style={{ marginTop: 4 }}>{t('g2.exam.posterior', lang)}</div>
      {POSTERIOR_PARTS.map(([k, l]) => <PairInputs key={k} o={o} onChange={onChange} group="posterior" part={k} label={tv(l)} options={POSTERIOR_OPTIONS[k]} />)}
      <PairInputs o={o} onChange={onChange} group="cd" label="C/D" options={CD_OPTIONS} />
      <PairInputs o={o} onChange={onChange} group="cmt" label="CMT" unit="µm" inputMode="decimal" />
      <PairInputs o={o} onChange={onChange} group="vfMd" label="MD" unit="dB" inputMode="decimal" />
    </Group>
  );
}

// Step 3 (diagnosis / plan)
export function OphthPlan({ value, onChange }) {
  const lang = useLang();
  const o = normalizeOphth(value);
  return (
    <Group title={t('g2.ophth.planTitle', lang)}>
      {[['od', t('g2.ophth.dxOd', lang)], ['os', t('g2.ophth.dxOs', lang)], ['ou', t('g2.ophth.dxOu', lang)]].map(([k, l]) => (
        <Eye key={k} label={l}>
          <Pick label={l} options={DX_OPTIONS} value={o.dx[k]} onChange={v => onChange(setPath(o, ['dx', k], v))} />
        </Eye>
      ))}
      <Eye label={t('g2.ophth.investigations', lang)}>
        <Pick label={t('g2.ophth.investigations', lang)} options={INVESTIGATION_OPTIONS} value={o.plan.investigation} onChange={v => onChange(setPath(o, ['plan', 'investigation'], v))} />
      </Eye>
      <Eye label={t('g2.ophth.followUpReason', lang)}>
        <Pick label={t('g2.ophth.followUpReason', lang)} options={FOLLOWUP_REASON_OPTIONS} value={o.plan.followUpReason} onChange={v => onChange(setPath(o, ['plan', 'followUpReason'], v))} />
      </Eye>
    </Group>
  );
}
