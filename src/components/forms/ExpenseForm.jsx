import React, { useState } from 'react';
import { Btn } from '../common.jsx';
import { C } from '../../modules/theme/index.js';
import { Field, inp } from '../../modules/ui/atoms.jsx';
import { CLINICS, EXP_CATS, localISO } from '../../modules/constants/index.js';
import { initialExpenseState, isValidExpense, buildExpenseSavePayload } from './accounting-forms-model.js';

// One-off expense add/edit form. Exact port of the legacy runtime's
// ExpenseForm (public/legacy/app-runtime.js).
export default function ExpenseForm({ initial, onSave, onClose }) {
  const [f, setF] = useState(() => initialExpenseState(initial, localISO(), EXP_CATS[0][0]));
  const s = k => e => setF(v => ({ ...v, [k]: e.target.value }));
  const valid = isValidExpense(f);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <Field label="التاريخ">
        <input style={inp()} type="date" value={f.date} onChange={s('date')} />
      </Field>
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
      <Field label="المبلغ (ج.م)">
        <input style={inp({ textAlign: 'center' })} type="number" value={f.amount} onChange={s('amount')} placeholder="0" />
      </Field>
      <Field label="ملاحظات">
        <input style={inp()} value={f.notes} onChange={s('notes')} placeholder="اختياري" />
      </Field>
      <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
        <Btn outline full onClick={onClose}>إلغاء</Btn>
        <Btn full color={C.danger} onClick={() => valid && onSave(buildExpenseSavePayload(f))}>
          {initial ? '✓ حفظ التعديل' : '✓ إضافة المصروف'}
        </Btn>
      </div>
    </div>
  );
}
