import React, { useState } from 'react';
import { Btn } from '../common.jsx';
import { C } from '../../modules/theme/index.js';
import { Field, inp } from '../../modules/ui/atoms.jsx';
import { CLINICS, EXP_CATS } from '../../modules/constants/index.js';
import { initialRecurringExpenseState, isValidRecurringExpense, buildExpenseSavePayload } from './accounting-forms-model.js';
import { t, useLang } from '../../modules/i18n/index.js';
import { tv } from '../../modules/i18n/tv.js';

// Recurring (monthly) expense add/edit form. Port of the legacy runtime's
// RecurringExpenseForm (public/legacy/app-runtime.js), which stays in place
// for the legacy screens.
export default function RecurringExpenseForm({ initial, onSave, onClose }) {
  const lang = useLang();
  const [f, setF] = useState(() => initialRecurringExpenseState(initial, EXP_CATS[0][0]));
  const s = k => e => setF(v => ({ ...v, [k]: e.target.value }));
  const valid = isValidRecurringExpense(f);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
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
      <Field label={t('g3.expense.monthlyAmount', lang)}>
        <input style={inp({ textAlign: 'center' })} type="number" value={f.amount} onChange={s('amount')} placeholder="0" />
      </Field>
      <Field label={t('g3.expense.notes', lang)}>
        <input style={inp()} value={f.notes} onChange={s('notes')} placeholder={t('g3.expense.notesPh', lang)} />
      </Field>
      <div style={{ color: C.muted, fontSize: 11 }}>{t('g3.expense.recurringNote', lang)}</div>
      <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
        <Btn outline full onClick={onClose}>{t('g3.common.cancel', lang)}</Btn>
        <Btn full color={C.purple} onClick={() => valid && onSave(buildExpenseSavePayload(f))}>
          {initial ? t('g3.expense.saveEdit', lang) : t('g3.expense.addRecurring', lang)}
        </Btn>
      </div>
    </div>
  );
}
