import React, { useState } from 'react';
import { Btn } from '../../components/common.jsx';
import { C } from '../../modules/theme/index.js';
import { Field, inp } from '../../modules/ui/atoms.jsx';
import { t, useLang } from '../../modules/i18n/index.js';
import { formatMinor } from '../../modules/finance/money.js';

export const Money = ({ minor, color, size = 14, bold = true }) => (
  <span style={{ color: color || C.text, fontWeight: bold ? 800 : 500, fontSize: size }}>{formatMinor(minor)}</span>
);

export const Card = ({ children, style }) => (
  <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: '10px 12px', marginBottom: 8, ...style }}>{children}</div>
);

export const Section = ({ title, right, children }) => (
  <div style={{ marginBottom: 18 }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
      <div style={{ color: C.text, fontWeight: 700, fontSize: 13 }}>{title}</div>
      {right}
    </div>
    {children}
  </div>
);

// Underline tab bar (one clean strip instead of a row of boxed chips). Each tab is a plain
// element whose only child is the label.
export const TabBar = ({ tabs, value, onChange }) => (
  <div style={{ display: 'flex', gap: 4, overflowX: 'auto', borderBottom: `1px solid ${C.border}`, marginBottom: 12 }}>
    {tabs.map(([id, label]) => (
      <div key={id} onClick={() => onChange(id)} style={{
        flexShrink: 0, padding: '9px 12px', cursor: 'pointer', fontSize: 13, fontWeight: value === id ? 800 : 600, whiteSpace: 'nowrap',
        color: value === id ? C.accent : C.muted, borderBottom: `2px solid ${value === id ? C.accent : 'transparent'}`, marginBottom: -1
      }}>{label}</div>
    ))}
  </div>
);

// Segmented control: one rounded container, the active option filled.
export const Segmented = ({ options, value, onChange }) => (
  <div style={{ display: 'flex', background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, padding: 3, gap: 2 }}>
    {options.map(([id, label]) => (
      <div key={id} onClick={() => onChange(id)} style={{
        flex: 1, textAlign: 'center', padding: '6px 8px', borderRadius: 8, cursor: 'pointer', fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap',
        background: value === id ? C.accent : 'transparent', color: value === id ? C.bg : C.muted
      }}>{label}</div>
    ))}
  </div>
);

// One card holding many rows separated by hairlines, with an optional share bar under each row
// (rows: [{key, label, minor}]). Replaces "one boxed card per row".
export function RowList({ rows, color, limit = 5, moreLabel, lessLabel }) {
  const [all, setAll] = useState(false);
  const shown = all ? rows : rows.slice(0, limit);
  const top = Math.max(1, ...rows.map(r => Math.abs(r.minor)));
  return (
    <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, overflow: 'hidden' }}>
      {shown.map((r, i) => (
        <div key={r.key} style={{ padding: '9px 12px', borderTop: i ? `1px solid ${C.border}` : 'none' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
            <span style={{ color: C.text, fontSize: 12, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.label}</span>
            <Money minor={r.minor} color={color} size={13} />
          </div>
          {r.minor !== undefined && (
            <div style={{ height: 3, borderRadius: 2, background: C.border, marginTop: 6, overflow: 'hidden' }}>
              <div style={{ height: '100%', width: Math.max(2, Math.round(Math.abs(r.minor) / top * 100)) + '%', background: color || C.accent, opacity: 0.7 }} />
            </div>
          )}
        </div>
      ))}
      {rows.length > limit && (
        <div onClick={() => setAll(a => !a)} style={{ textAlign: 'center', padding: 8, borderTop: `1px solid ${C.border}`, color: C.accent, fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>
          {all ? lessLabel : moreLabel}
        </div>
      )}
    </div>
  );
}

export const Empty = ({ text }) => (
  <div style={{ color: C.muted, fontSize: 12, textAlign: 'center', padding: 16, background: C.card, border: `1px solid ${C.border}`, borderRadius: 12 }}>{text}</div>
);

export const Chip = ({ active, onClick, children, color }) => (
  <div onClick={onClick} style={{
    flexShrink: 0, textAlign: 'center', padding: '6px 12px', borderRadius: 8, cursor: 'pointer', fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap',
    background: active ? (color || C.accent) + '33' : 'transparent', color: active ? (color || C.accent) : C.muted, border: `1px solid ${active ? (color || C.accent) : C.border}`
  }}>{children}</div>
);

export const SmallBtn = ({ onClick, children, color, disabled }) => (
  <div onClick={disabled ? undefined : onClick} style={{
    background: (color || C.accent) + '22', borderRadius: 8, padding: '5px 9px', color: color || C.accent, fontSize: 11, cursor: disabled ? 'default' : 'pointer', opacity: disabled ? 0.5 : 1, fontWeight: 700
  }}>{children}</div>
);

// Declarative form: fields = [{k, label, type: text|number|date|select|textarea, options?: [[value,label]], required?, show?: values => bool}].
export function FieldsForm({ fields, initial = {}, submitLabel, onSubmit, onCancel, color }) {
  const lang = useLang();
  const [v, setV] = useState(initial);
  const set = k => e => setV(x => ({ ...x, [k]: e.target.value }));
  const visible = fields.filter(f => !f.show || f.show(v));
  const ok = visible.every(f => !f.required || (v[f.k] !== undefined && v[f.k] !== ''));
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {visible.map(f => (
        <Field key={f.k} label={f.label}>
          {f.type === 'select' ? (
            <select style={inp()} value={v[f.k] ?? ''} onChange={set(f.k)}>
              {f.allowEmpty && <option value="">—</option>}
              {f.options.map(([val, lbl]) => <option key={val} value={val}>{lbl}</option>)}
            </select>
          ) : f.type === 'textarea' ? (
            <textarea style={{ ...inp(), minHeight: 60 }} value={v[f.k] ?? ''} onChange={set(f.k)} />
          ) : (
            <input style={inp(f.type === 'number' ? { textAlign: 'center' } : {})} type={f.type || 'text'} inputMode={f.type === 'number' ? 'decimal' : undefined} value={v[f.k] ?? ''} onChange={set(f.k)} />
          )}
        </Field>
      ))}
      <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
        <Btn outline full onClick={onCancel}>{t('g3.common.cancel', lang)}</Btn>
        <Btn full color={color} onClick={() => ok && onSubmit(v)}>{submitLabel}</Btn>
      </div>
    </div>
  );
}
