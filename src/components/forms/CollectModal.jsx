import React, { useState } from 'react';
import { matchCollectPrice, initialCollectCost, initialCollectPaid } from './secretary-forms-model.js';

const L = () => globalThis.IAppLegacy;

// Payment collection form (secretary app, "💰 تحصيل"). Port of the legacy
// runtime's CollectModal (public/legacy/app-runtime.js), which stays in place
// for the legacy screens. onSave(cost, paid) receives the cost exactly as
// typed (a string, or the stored/matched value when untouched) and the paid
// flag — the contract SecretaryApp's handleSaveCollect expects. Theme C and
// inp are read from the bridge.
export default function CollectModal({ apt, prices = [], onSave, onClose }) {
  const { C, inp } = L();
  const matched = matchCollectPrice(prices, apt.type);
  const [cost, setCost] = useState(initialCollectCost(apt, matched));
  const [paid, setPaid] = useState(initialCollectPaid(apt));
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ color: C.text, fontSize: 13, fontWeight: 700 }}>{apt.patient}</div>
      <div>
        <label style={{ color: C.muted, fontSize: 11, display: 'block', marginBottom: 4 }}>قيمة الكشف (ج.م)</label>
        <input
          style={{ ...inp(), textAlign: 'center', fontSize: 18, fontWeight: 700 }}
          type="number"
          value={cost}
          onChange={e => setCost(e.target.value)}
          placeholder="0"
          autoFocus
        />
      </div>
      <div
        onClick={() => setPaid(p => !p)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          background: C.card,
          border: '1px solid ' + (paid ? C.success : C.border),
          borderRadius: 10,
          padding: '10px 14px',
          cursor: 'pointer'
        }}
      >
        <div
          style={{
            width: 20,
            height: 20,
            borderRadius: 6,
            background: paid ? C.success : C.bg,
            border: '2px solid ' + (paid ? C.success : C.border),
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 12,
            color: C.bg,
            fontWeight: 700
          }}
        >{paid ? '✓' : ''}</div>
        <span style={{ color: paid ? C.success : C.muted, fontSize: 13, fontWeight: 600 }}>تم تحصيل المبلغ نقداً</span>
      </div>
      <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
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
        >إلغاء</button>
        <button
          onClick={() => onSave(cost, paid)}
          style={{
            flex: 2,
            background: 'linear-gradient(135deg,' + C.gold + ',#e0951f)',
            border: 'none',
            borderRadius: 10,
            padding: 11,
            color: C.bg,
            fontWeight: 700,
            fontSize: 13,
            cursor: 'pointer',
            fontFamily: 'inherit'
          }}
        >💰 حفظ التحصيل</button>
      </div>
    </div>
  );
}
