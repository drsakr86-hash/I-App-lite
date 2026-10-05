import React, { useState } from 'react';
import { Btn } from '../common.jsx';
import { C } from '../../modules/theme/index.js';
import { Field, inp } from '../../modules/ui/atoms.jsx';
import { CLINICS, EXP_CATS, localISO } from '../../modules/constants/index.js';
import { initialExpenseState, isValidExpense, buildExpenseSavePayload } from './accounting-forms-model.js';
import { t, useLang } from '../../modules/i18n/index.js';
import { tv } from '../../modules/i18n/tv.js';

// One-off expense add/edit form. Exact port of the legacy runtime's
// ExpenseForm (public/legacy/app-runtime.js).
export default function ExpenseForm({ initial, onSave, onClose }) {
  const lang = useLang();
  const [f, setF] = useState(() => initialExpenseState(initial, localISO(), EXP_CATS[0][0]));
  const s = k => e => setF(v => ({ ...v, [k]: e.target.value }));
  const valid = isValidExpense(f);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <Field label={t('common.date', lang)}>
        <input style={inp()} type="date" value={f.date} onChange={s('date')} />
      </Field>
      <Field label={t('g3.expense.category', lang)}>
        <select style={inp()} value={f.category} onChange={s('category')}>
          {EXP_CATS.map(([name, icon]) => <option key={name} value={name}>{icon} {tv(name, lang)}</option>)}
        </select>
      </Field>
      <Field label={t('g3.expense.clinicOpt', lang)}>
        <select style={inp()} value={f.clinic || ''} onChange={s('clinic')}>
          <option value="">{t('g3.expense.allClinics', lang)}</option>
          {CLINICS.map(c => <option key={c.v} value={c.v}>{tv(c.l, lang)}</option>)}
        </select>
      </Field>
      <Field label={t('g3.expense.amount', lang)}>
        <input style={inp({ textAlign: 'center' })} type="number" value={f.amount} onChange={s('amount')} placeholder="0" />
      </Field>
      <Field label={t('g3.expense.notes', lang)}>
        <input style={inp()} value={f.notes} onChange={s('notes')} placeholder={t('g3.expense.notesPh', lang)} />
      </Field>
      <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
        <Btn outline full onClick={onClose}>{t('g3.common.cancel', lang)}</Btn>
        <Btn full color={C.danger} onClick={() => valid && onSave(buildExpenseSavePayload(f))}>
          {initial ? t('g3.expense.saveEdit', lang) : t('g3.expense.add', lang)}
        </Btn>
      </div>
    </div>
  );
}
