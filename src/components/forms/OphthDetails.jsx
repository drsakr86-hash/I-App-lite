import React from 'react';
import { C } from '../../modules/theme/index.js';
import { inp } from '../../modules/ui/atoms.jsx';
import { normalizeOphth, ANTERIOR_PARTS, POSTERIOR_PARTS, IOP_METHODS, VA_PLACEHOLDER } from '../../modules/patient-file/ophth.js';

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

function PairInputs({ o, onChange, group, part, label, placeholder, unit, inputMode }) {
  const val = eye => (part ? o[group][part][eye] : o[group][eye]);
  const path = eye => (part ? [group, part, eye] : [group, eye]);
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
      {['od', 'os'].map(eye => (
        <Eye key={eye} label={`${label} ${eye.toUpperCase()}${unit ? ' (' + unit + ')' : ''}`}>
          <input className="ds-field" style={inp()} inputMode={inputMode} dir="auto" value={val(eye)} placeholder={placeholder}
            onChange={e => onChange(setPath(o, path(eye), e.target.value))} />
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
  const o = normalizeOphth(value);
  return (
    <Group title="➕ تفاصيل منظّمة للفحص (اختياري)">
      <div className="ds-sub">UCVA / PH / انكسار / تفصيل القطعتين / C/D / CMT / المجال البصري. اترك أي حقل فارغًا إذا لم يُقَس.</div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        {['od', 'os'].map(eye => (
          <Eye key={'u' + eye} label={`UCVA ${eye.toUpperCase()} (بدون نظارة)`}>
            <input className="ds-field" style={inp()} dir="ltr" value={o.va[eye].ucva} placeholder={VA_PLACEHOLDER} onChange={e => onChange(setPath(o, ['va', eye, 'ucva'], e.target.value))} />
          </Eye>
        ))}
        {['od', 'os'].map(eye => (
          <Eye key={'p' + eye} label={`PH ${eye.toUpperCase()} (Pinhole)`}>
            <input className="ds-field" style={inp()} dir="ltr" value={o.va[eye].ph} placeholder={VA_PLACEHOLDER} onChange={e => onChange(setPath(o, ['va', eye, 'ph'], e.target.value))} />
          </Eye>
        ))}
      </div>
      <Eye label="طريقة قياس IOP">
        <select className="ds-field" style={inp()} value={o.iop.method} onChange={e => onChange(setPath(o, ['iop', 'method'], e.target.value))}>
          <option value="">— غير محدد —</option>
          {IOP_METHODS.map(m => <option key={m}>{m}</option>)}
        </select>
      </Eye>
      {['od', 'os'].map(eye => (
        <div key={'r' + eye} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
          {[['sph', 'SPH'], ['cyl', 'CYL'], ['axis', 'AXIS']].map(([k, l]) => (
            <Eye key={k} label={`${l} ${eye.toUpperCase()}`}>
              <input className="ds-field" style={inp()} dir="ltr" inputMode="decimal" value={o.refraction[eye][k]} onChange={e => onChange(setPath(o, ['refraction', eye, k], e.target.value))} />
            </Eye>
          ))}
        </div>
      ))}
      <div className="ds-h" style={{ marginTop: 4 }}>القطعة الأمامية</div>
      {ANTERIOR_PARTS.map(([k, l]) => <PairInputs key={k} o={o} onChange={onChange} group="anterior" part={k} label={l} />)}
      <div className="ds-h" style={{ marginTop: 4 }}>القطعة الخلفية</div>
      {POSTERIOR_PARTS.map(([k, l]) => <PairInputs key={k} o={o} onChange={onChange} group="posterior" part={k} label={l} />)}
      <PairInputs o={o} onChange={onChange} group="cd" label="C/D" inputMode="decimal" placeholder="0.3" />
      <PairInputs o={o} onChange={onChange} group="cmt" label="CMT" unit="µm" inputMode="decimal" />
      <PairInputs o={o} onChange={onChange} group="vfMd" label="MD" unit="dB" inputMode="decimal" />
    </Group>
  );
}

// Step 3 (diagnosis / plan)
export function OphthPlan({ value, onChange }) {
  const o = normalizeOphth(value);
  return (
    <Group title="➕ تشخيص لكل عين وتفاصيل الخطة (اختياري)">
      {[['od', 'تشخيص العين اليمنى OD'], ['os', 'تشخيص العين اليسرى OS'], ['ou', 'تشخيص العينين OU']].map(([k, l]) => (
        <Eye key={k} label={l}>
          <input className="ds-field" style={inp()} dir="auto" value={o.dx[k]} onChange={e => onChange(setPath(o, ['dx', k], e.target.value))} />
        </Eye>
      ))}
      <Eye label="فحوصات مطلوبة">
        <input className="ds-field" style={inp()} dir="auto" value={o.plan.investigation} onChange={e => onChange(setPath(o, ['plan', 'investigation'], e.target.value))} placeholder="OCT، مجال بصري..." />
      </Eye>
      <Eye label="سبب المتابعة">
        <input className="ds-field" style={inp()} dir="auto" value={o.plan.followUpReason} onChange={e => onChange(setPath(o, ['plan', 'followUpReason'], e.target.value))} />
      </Eye>
    </Group>
  );
}
