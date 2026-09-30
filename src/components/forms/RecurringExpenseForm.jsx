import React, { useState } from 'react';
import { Btn } from '../common.jsx';
import { C } from '../../modules/theme/index.js';
import { Field, inp } from '../../modules/ui/atoms.jsx';
import { CLINICS, EXP_CATS } from '../../modules/constants/index.js';
import { initialRecurringExpenseState, isValidRecurringExpense, buildExpenseSavePayload } from './accounting-forms-model.js';

// Recurring (monthly) expense add/edit form. Port of the legacy runtime's
// RecurringExpenseForm (public/legacy/app-runtime.js), which stays in place
// for the legacy screens.
export default function RecurringExpenseForm({ initial, onSave, onClose }) {
  const [f, setF] = useState(() => initialRecurringExpenseState(initial, EXP_CATS[0][0]));
  const s = k => e => setF(v => ({ ...v, [k]: e.target.value }));
  const valid = isValidRecurringExpense(f);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <Field label="البند">
        <select style={inp()} value={f.category} onChange={s('category')}>
          {EXP_CATS.map(([name, icon]) => <option key={name} value={name}>{icon} {name}</option>)}
        </select>
      </Field>
      <Field label="العيادة (اختياري)">
        <select style={inp()} value={f.clinic || ''} onChange={s('clinic')}>
          <option value="">عام / كل العيادات</option>
          {CLINICS.map(c => <option key={c.v} value={c.v}>{c.l}</option>)}
        </select>
      </Field>
      <Field label="المبلغ الشهري (ج.م)">
        <input style={inp({ textAlign: 'center' })} type="number" value={f.amount} onChange={s('amount')} placeholder="0" />
      </Field>
      <Field label="ملاحظات">
        <input style={inp()} value={f.notes} onChange={s('notes')} placeholder="اختياري" />
      </Field>
      <div style={{ color: C.muted, fontSize: 11 }}>سيُضاف هذا المصروف تلقائياً أول كل شهر.</div>
      <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
        <Btn outline full onClick={onClose}>إلغاء</Btn>
        <Btn full color={C.purple} onClick={() => valid && onSave(buildExpenseSavePayload(f))}>
          {initial ? '✓ حفظ التعديل' : '✓ إضافة مصروف ثابت'}
        </Btn>
      </div>
    </div>
  );
}
