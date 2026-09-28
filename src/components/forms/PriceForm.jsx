import React, { useState } from 'react';
import { Btn } from '../common.jsx';
import { PRICE_ICONS, initialPriceState, canSavePrice } from './settings-forms-model.js';

const L = () => globalThis.IAppLegacy;

// Service price add/edit form (Settings). Port of the legacy runtime's
// PriceForm (public/legacy/app-runtime.js), which stays in place for the
// legacy screens. Theme C, Field and inp are read from the bridge.
export default function PriceForm({ initial, onSave, onClose }) {
  const { C, Field, inp } = L();
  const [f, setF] = useState(() => initialPriceState(initial));
  const s = k => e => setF(v => ({ ...v, [k]: e.target.value }));
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <Field label="اسم الخدمة">
        <input style={inp()} value={f.name} onChange={s('name')} placeholder="كشف روتيني، استشارة..." />
      </Field>
      <Field label="السعر (ج.م)">
        <input
          style={inp({ textAlign: 'center', fontSize: 18, fontWeight: 700, color: C.gold })}
          type="number"
          value={f.price}
          onChange={s('price')}
          placeholder="0"
        />
      </Field>
      <Field label="الأيقونة">
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {PRICE_ICONS.map(ico => (
            <div
              key={ico}
              onClick={() => setF(v => ({ ...v, icon: ico }))}
              style={{
                width: 40,
                height: 40,
                borderRadius: 10,
                background: f.icon === ico ? C.gold + '33' : C.bg,
                border: `2px solid ${f.icon === ico ? C.gold : C.border}`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 20,
                cursor: 'pointer'
              }}
            >{ico}</div>
          ))}
        </div>
      </Field>
      <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
        <Btn outline full onClick={onClose}>إلغاء</Btn>
        <Btn full onClick={() => canSavePrice(f) && onSave(f)}>حفظ</Btn>
      </div>
    </div>
  );
}
