import React from 'react';
import { C } from '../../modules/theme/index.js';
import { useLang, t } from '../../modules/i18n/index.js';
import { inp } from '../../modules/ui/atoms.jsx';
import {
  CASES, MAX_TEXT, caseById, caseLabel, fieldLabel, blankCase, normalizeSpecial, caseIsEmpty,
  specialSummary
} from '../../modules/special-exam/model.js';
import { suggest, workupLine } from '../../modules/special-exam/ddx.js';

const chip = (active, color) => ({
  minHeight: 40, padding: '6px 12px', borderRadius: 10, cursor: 'pointer', font: 'inherit', fontSize: 12, fontWeight: 700,
  border: `2px solid ${active ? (color || C.accent) : C.border}`, background: active ? (color || C.accent) + '22' : 'transparent', color: active ? (color || C.accent) : C.muted
});
const small = { color: C.muted, fontSize: 11, marginBottom: 4 };

// One input: a drop-down when the field has options, otherwise free text.
function Input({ f, value, onChange, label, placeholder }) {
  if (f.opts) {
    // A stored value that is no longer in the list (older sheet) is still shown, never lost.
    const opts = value && !f.opts.includes(value) ? [value, ...f.opts] : f.opts;
    return (
      <select style={inp()} aria-label={label} value={value} onChange={e => onChange(e.target.value)}>
        <option value="">{placeholder}</option>
        {opts.map(o => <option key={o} value={o}>{o}</option>)}
      </select>
    );
  }
  return <input style={inp()} dir="auto" maxLength={MAX_TEXT} aria-label={label} placeholder={placeholder} value={value} onChange={e => onChange(e.target.value)} />;
}

// Live differential diagnosis + work-up from the findings ticked in this sheet.
function Suggestions({ id, values, plan, onWorkup }) {
  const lang = useLang();
  const { ddx, workup } = suggest(id, values);
  const box = { background: C.bg, borderRadius: 10, padding: 10 };
  if (!ddx.length && !workup.length) return <div style={{ ...box, color: C.muted, fontSize: 11 }}>🔎 {t('g11.sp.ddxEmpty', lang)}</div>;
  const added = String(plan || '').includes(workupLine(workup));
  const list = items => (
    <ul style={{ margin: 0, paddingInlineStart: 18, color: C.text, fontSize: 12, lineHeight: 1.6 }} dir="ltr">
      {items.map(x => <li key={x} style={{ textAlign: 'start' }}>{x}</li>)}
    </ul>
  );
  return (
    <div style={{ ...box, border: `1px solid ${C.gold}55`, display: 'flex', flexDirection: 'column', gap: 8 }}>
      {ddx.length > 0 && (
        <div>
          <div style={{ color: C.gold, fontSize: 12, fontWeight: 700, marginBottom: 4 }}>🔎 {t('g11.sp.ddx', lang)}</div>
          {list(ddx)}
        </div>
      )}
      {workup.length > 0 && (
        <div>
          <div style={{ color: C.teal, fontSize: 12, fontWeight: 700, marginBottom: 4 }}>🧪 {t('g11.sp.workup', lang)}</div>
          {list(workup)}
          {onWorkup && (added
            ? <div style={{ color: C.success, fontSize: 11, marginTop: 6 }}>✓ {t('g11.sp.workupAdded', lang)}</div>
            : <button type="button" onClick={() => onWorkup(workup)} style={{ ...chip(true, C.teal), marginTop: 6 }}>+ {t('g11.sp.workupAdd', lang)}</button>)}
        </div>
      )}
      <div style={{ color: C.muted, fontSize: 10 }}>{t('g11.sp.ddxNote', lang)}</div>
    </div>
  );
}

function CaseSheet({ id, values, onChange, onRemove, plan, onWorkup }) {
  const lang = useLang();
  const c = caseById(id);
  const set = (k, v) => onChange({ ...values, [k]: v });
  const eyeFields = c.fields.filter(f => f.eyes);
  const oneFields = c.fields.filter(f => !f.eyes);
  return (
    <div style={{ borderTop: `1px solid ${C.border}`, padding: '12px 0', display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span aria-hidden="true">{c.icon}</span>
        <span style={{ color: C.accent, fontWeight: 700, fontSize: 13, flex: 1 }}>{caseLabel(id, lang)}</span>
        <button type="button" aria-label={t('g11.sp.remove', lang)} onClick={onRemove} style={chip(false, C.danger)}>🗑</button>
      </div>

      {oneFields.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 8 }}>
          {oneFields.map(f => {
            const label = fieldLabel(id, f.k, lang);
            return (
              <div key={f.k} style={{ minWidth: 0 }}>
                <div style={small}>{label}</div>
                <Input f={f} value={values[f.k]} onChange={v => set(f.k, v)} label={label} placeholder={f.opts ? t('g2.common.select', lang) : '…'} />
              </div>
            );
          })}
        </div>
      )}

      {eyeFields.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, color: C.teal, fontSize: 11, fontWeight: 700, textAlign: 'center' }}>
            <span>{t('g11.sp.od', lang)}</span><span>{t('g11.sp.os', lang)}</span>
          </div>
          {eyeFields.map(f => {
            const label = fieldLabel(id, f.k, lang);
            const v = values[f.k];
            return (
              <div key={f.k}>
                <div style={small}>{label}</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  <Input f={f} value={v.od} onChange={x => set(f.k, { ...v, od: x })} label={label + ' OD'} placeholder="OD" />
                  <Input f={f} value={v.os} onChange={x => set(f.k, { ...v, os: x })} label={label + ' OS'} placeholder="OS" />
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Suggestions id={id} values={values} plan={plan} onWorkup={onWorkup} />

    </div>
  );
}

// Form section inside the examination. `value` is exam.special.
export default function SpecialExamSheets({ value, onChange, plan, onWorkup }) {
  const lang = useLang();
  const special = normalizeSpecial(value);
  const active = CASES.filter(c => special[c.id]);
  const inactive = CASES.filter(c => !special[c.id]);
  const remove = id => {
    if (!caseIsEmpty(id, special[id]) && !window.confirm(t('g11.sp.removeConfirm', lang))) return;
    const next = { ...special };
    delete next[id];
    onChange(next);
  };
  return (
    <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 12 }}>
      <div style={{ color: C.text, fontWeight: 700, fontSize: 13, marginBottom: 4 }}>🩺 {t('g11.sp.title', lang)}</div>
      <div style={{ color: C.muted, fontSize: 11, marginBottom: 10 }}>{t('g11.sp.hint', lang)}</div>
      {active.map(c => (
        <CaseSheet
          key={c.id}
          id={c.id}
          values={special[c.id]}
          onChange={v => onChange({ ...special, [c.id]: v })}
          onRemove={() => remove(c.id)}
          plan={plan}
          onWorkup={onWorkup}
        />
      ))}
      {inactive.length > 0 && (
        <div style={{ borderTop: active.length ? `1px solid ${C.border}` : 'none', paddingTop: active.length ? 10 : 0 }}>
          <div style={small}>{t('g11.sp.add', lang)}</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {inactive.map(c => (
              <button type="button" key={c.id} onClick={() => onChange({ ...special, [c.id]: blankCase(c.id) })} style={chip(false)}>
                {c.icon} {caseLabel(c.id, lang)}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// Read-only view for the patient file / exam card: filled rows only.
export function SpecialExamView({ exam }) {
  const lang = useLang();
  const list = specialSummary(exam);
  if (!list.length) return null;
  return (
    <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 8 }}>
      {list.map(s => (
        <div key={s.id} style={{ background: C.bg, borderRadius: 10, padding: 10 }}>
          <div style={{ color: C.accent, fontSize: 11, fontWeight: 700, marginBottom: 6 }}>{caseById(s.id).icon} {caseLabel(s.id, lang)}</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.2fr) minmax(0, 1fr) minmax(0, 1fr)', gap: '4px 8px', fontSize: 11 }}>
            <span />
            <span style={{ color: C.teal, fontWeight: 700 }}>OD</span>
            <span style={{ color: C.teal, fontWeight: 700 }}>OS</span>
            {s.rows.map(r => (
              <React.Fragment key={r.k}>
                <span style={{ color: C.muted }}>{fieldLabel(s.id, r.k, lang)}</span>
                {r.eyes
                  ? <><span style={{ color: C.text }} dir="auto">{r.od || '—'}</span><span style={{ color: C.text }} dir="auto">{r.os || '—'}</span></>
                  : <span style={{ color: C.text, gridColumn: 'span 2' }} dir="auto">{r.value}</span>}
              </React.Fragment>
            ))}
          </div>
          {(() => {
            const { ddx } = suggest(s.id, exam.special[s.id]);
            return ddx.length ? <div style={{ color: C.gold, fontSize: 11, marginTop: 6 }} dir="ltr">DDx: {ddx.join(' · ')}</div> : null;
          })()}
        </div>
      ))}
    </div>
  );
}
