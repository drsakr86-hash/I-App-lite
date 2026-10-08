import React, { useState } from 'react';
import { Modal, Btn } from '../../components/common.jsx';
import { C } from '../../modules/theme/index.js';
import { t, useLang } from '../../modules/i18n/index.js';
import { tv } from '../../modules/i18n/tv.js';
import { clinicLabel, CLINICS, EXP_CATS, localISO } from '../../modules/constants/index.js';
import { createExpense, editExpense, cancelExpense, payExpense, reverseExpense, generateDueExpenses } from '../../modules/finance/expenses.js';
import { mergeBatches } from '../../modules/finance/batch.js';
import { newFinId } from '../../modules/finance/ids.js';
import { Money, Card, Section, Empty, SmallBtn, FieldsForm } from './parts.jsx';
import { expenseListModel, dueListModel, accountOptions, methodOptions, defaultPay, amountOk } from './view-model.js';

const STATUS_COLOR = { paid: C.danger, pending: C.gold, cancelled: C.muted, reversed: C.muted, reversal: C.success };

export default function Expenses({ state, filters, session, run, notify }) {
  const lang = useLang();
  const tr = k => t(k, lang);
  const [modal, setModal] = useState(null);
  const today = localISO();
  const ctx = { by: session.name || session.username, role: session.role };
  const list = expenseListModel(state, filters);
  const due = dueListModel(state, today);
  const catOpts = EXP_CATS.map(([n, icon]) => [n, icon + ' ' + tv(n)]);
  const clinicOpts = CLINICS.map(c => [c.v, tv(c.l)]);
  const payDefaults = defaultPay(state);
  const exec = async (planner, close = true) => { const r = await run(planner); notify(r); if (r.ok && close) setModal(null); };

  const expenseFields = [
    { k: 'date', label: tr('common.date'), type: 'date', required: true },
    { k: 'category', label: tr('g3.expense.category'), type: 'select', options: catOpts, required: true },
    { k: 'clinic', label: tr('g3.expense.clinicOpt'), type: 'select', options: clinicOpts, allowEmpty: true },
    { k: 'amount', label: tr('g3.expense.amount'), type: 'number', required: true },
    { k: 'notes', label: tr('g3.expense.notes') }
  ];
  const payFields = [
    { k: 'method', label: tr('g8.exp.method'), type: 'select', options: methodOptions(tr), required: true },
    { k: 'accountId', label: tr('g8.exp.account'), type: 'select', options: accountOptions(state), required: true }
  ];

  return (
    <div>
      {due.length > 0 && (
        <Section title={tr('g8.exp.dueTitle').replace('{n}', due.length)}>
          <Card>
            {due.slice(0, 6).map(d => (
              <div key={d.recurring.id + d.dueDate} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: C.text, padding: '3px 0' }}>
                <span>{tv(d.recurring.category)} · {d.dueDate}</span><Money minor={Math.round(Number(d.recurring.amount) * 100)} />
              </div>
            ))}
            <div style={{ marginTop: 8 }}><Btn full color={C.purple} onClick={() => exec(s => generateDueExpenses(s, today, ctx), false)}>{tr('g8.exp.generate')}</Btn></div>
            <div style={{ color: C.muted, fontSize: 10, marginTop: 4 }}>{tr('g8.exp.generateNote')}</div>
          </Card>
        </Section>
      )}

      <Section title={tr('g8.exp.listTitle').replace('{n}', list.length)} right={<Btn small color={C.danger} onClick={() => setModal({ type: 'add' })}>{tr('g4.acc.addExpense')}</Btn>}>
        {list.length === 0 && <Empty text={tr('g4.acc.noExpenses')} />}
        {list.map(e => {
          const cat = EXP_CATS.find(c => c[0] === e.category);
          const st = e._status;
          return (
            <Card key={e.id}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ fontSize: 18 }}>{(cat && cat[1]) || '📦'}</div>
                <div style={{ flex: 1 }}>
                  <div style={{ color: C.text, fontSize: 13, fontWeight: 600 }}>{tv(e.category)}{e.clinic ? ' · ' + tv(clinicLabel(e.clinic)) : ''}</div>
                  <div dir="auto" style={{ color: C.muted, fontSize: 11 }}>{e.date}{e.notes ? ` · ${tv(e.notes)}` : ''}</div>
                </div>
                <div style={{ textAlign: 'end' }}>
                  <Money minor={Math.round(Number(e.amount || 0) * 100)} color={e.reversalOf ? C.success : C.danger} />
                  <div style={{ color: STATUS_COLOR[st] || C.muted, fontSize: 10, fontWeight: 700 }}>{tr('g8.exp.st.' + st)}</div>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 6, marginTop: 8, justifyContent: 'flex-end' }}>
                {st === 'pending' && <SmallBtn color={C.success} onClick={() => setModal({ type: 'pay', e })}>{tr('g8.exp.pay')}</SmallBtn>}
                {st === 'pending' && <SmallBtn onClick={() => setModal({ type: 'edit', e })}>✏</SmallBtn>}
                {st === 'pending' && <SmallBtn color={C.danger} onClick={() => setModal({ type: 'cancel', e })}>{tr('g8.exp.cancel')}</SmallBtn>}
                {st === 'paid' && <SmallBtn color={C.danger} onClick={() => setModal({ type: 'reverse', e })}>{tr('g8.exp.reverse')}</SmallBtn>}
              </div>
            </Card>
          );
        })}
      </Section>

      <RecurringSection state={state} run={run} notify={notify} catOpts={catOpts} clinicOpts={clinicOpts} accountOpts={accountOptions(state)} />

      {modal && modal.type === 'add' && (
        <Modal title={tr('g4.acc.addExpTitle')} onClose={() => setModal(null)}>
          <FieldsForm
            color={C.danger}
            initial={{ date: today, category: EXP_CATS[0][0], clinic: '', amount: '', notes: '', payNow: 'no', ...payDefaults }}
            fields={[...expenseFields, { k: 'payNow', label: tr('g8.exp.payNow'), type: 'select', options: [['no', tr('g8.exp.payLater')], ['yes', tr('g8.exp.payToday')]] },
              ...payFields.map(f => ({ ...f, show: v => v.payNow === 'yes' }))]}
            submitLabel={tr('g3.expense.add')}
            onCancel={() => setModal(null)}
            onSubmit={v => amountOk(v.amount) && exec(s => createExpense(s, {
              id: newFinId('exp'), date: v.date, category: v.category, amount: v.amount, notes: v.notes, clinic: v.clinic,
              pay: v.payNow === 'yes' ? { accountId: v.accountId, method: v.method } : undefined
            }, ctx))}
          />
        </Modal>
      )}
      {modal && modal.type === 'edit' && (
        <Modal title={tr('g4.acc.editExpTitle')} onClose={() => setModal(null)}>
          <FieldsForm initial={modal.e} fields={expenseFields} submitLabel={tr('g3.expense.saveEdit')} onCancel={() => setModal(null)}
            onSubmit={v => amountOk(v.amount) && exec(s => editExpense(s, { id: modal.e.id, date: v.date, category: v.category, amount: v.amount, notes: v.notes, clinic: v.clinic }, ctx))} />
        </Modal>
      )}
      {modal && modal.type === 'pay' && (
        <Modal title={tr('g8.exp.pay')} onClose={() => setModal(null)}>
          <FieldsForm initial={payDefaults} fields={payFields} submitLabel={tr('g8.exp.pay')} color={C.success} onCancel={() => setModal(null)}
            onSubmit={v => exec(s => payExpense(s, { id: modal.e.id, accountId: v.accountId, method: v.method }, ctx))} />
        </Modal>
      )}
      {modal && (modal.type === 'cancel' || modal.type === 'reverse') && (
        <Modal title={tr(modal.type === 'cancel' ? 'g8.exp.cancel' : 'g8.exp.reverse')} onClose={() => setModal(null)}>
          <FieldsForm fields={[{ k: 'reason', label: tr('g8.common.reason'), type: 'textarea', required: true }]} color={C.danger}
            submitLabel={tr(modal.type === 'cancel' ? 'g8.exp.cancel' : 'g8.exp.reverse')} onCancel={() => setModal(null)}
            onSubmit={v => exec(s => (modal.type === 'cancel' ? cancelExpense : reverseExpense)(s, { id: modal.e.id, reason: v.reason }, ctx))} />
        </Modal>
      )}
    </div>
  );
}

function RecurringSection({ state, run, notify, catOpts, clinicOpts, accountOpts }) {
  const lang = useLang();
  const tr = k => t(k, lang);
  const [modal, setModal] = useState(null);
  const today = localISO();
  const freqOpts = ['weekly', 'monthly', 'yearly'].map(f => [f, tr('g8.rec.' + f)]);
  const fields = [
    { k: 'category', label: tr('g3.expense.category'), type: 'select', options: catOpts, required: true },
    { k: 'amount', label: tr('g3.expense.amount'), type: 'number', required: true },
    { k: 'frequency', label: tr('g8.rec.frequency'), type: 'select', options: freqOpts, required: true },
    { k: 'startDate', label: tr('g8.rec.start'), type: 'date', required: true },
    { k: 'endDate', label: tr('g8.rec.end'), type: 'date' },
    { k: 'clinic', label: tr('g3.expense.clinicOpt'), type: 'select', options: clinicOpts, allowEmpty: true },
    { k: 'accountId', label: tr('g8.exp.account'), type: 'select', options: accountOpts, allowEmpty: true },
    { k: 'notes', label: tr('g3.expense.notes') }
  ];
  const save = async v => {
    const prev = modal && modal.r;
    const rec = {
      ...(prev || {}), id: prev ? prev.id : newFinId('rec'), category: v.category, amount: String(v.amount), frequency: v.frequency,
      startDate: v.startDate, endDate: v.endDate || '', nextDueDate: prev && prev.nextDueDate ? prev.nextDueDate : v.startDate,
      clinic: v.clinic || '', accountId: v.accountId || '', notes: v.notes || '', active: prev ? prev.active !== false : true
    };
    const r = await run(() => ({ ...emptyRecBatch(), recurring: [rec] }));
    notify(r);
    if (r.ok) setModal(null);
  };
  const toggle = async r => notify(await run(() => ({ ...emptyRecBatch(), recurring: [{ ...r, active: r.active === false }] })));
  return (
    <Section title={tr('g4.acc.recurringTitle').replace('{n}', state.recurring.length)} right={<Btn small color={C.purple} onClick={() => setModal({ r: null })}>{tr('g4.acc.add')}</Btn>}>
      {state.recurring.length === 0 && <Empty text={tr('g4.acc.noRecurring')} />}
      {state.recurring.map(r => (
        <Card key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 10, opacity: r.active === false ? 0.55 : 1 }}>
          <div style={{ flex: 1 }}>
            <div style={{ color: C.text, fontSize: 12, fontWeight: 600 }}>{tv(r.category)}{r.clinic ? ' · ' + tv(clinicLabel(r.clinic)) : ''}</div>
            <div style={{ color: C.muted, fontSize: 10 }}>{r.frequency ? tr('g8.rec.' + r.frequency) : tr('g8.rec.monthly')}{r.nextDueDate ? ' · ' + tr('g8.rec.next') + ' ' + r.nextDueDate : ''}</div>
          </div>
          <Money minor={Math.round(Number(r.amount || 0) * 100)} color={C.purple} />
          <SmallBtn onClick={() => setModal({ r })}>✏</SmallBtn>
          <SmallBtn color={C.muted} onClick={() => toggle(r)}>{r.active === false ? tr('g8.rec.resume') : tr('g8.rec.pause')}</SmallBtn>
        </Card>
      ))}
      {modal && (
        <Modal title={tr(modal.r ? 'g4.acc.editRecTitle' : 'g4.acc.addRecTitle')} onClose={() => setModal(null)}>
          <FieldsForm
            initial={modal.r ? { ...modal.r, frequency: modal.r.frequency || 'monthly', startDate: modal.r.startDate || today } : { category: EXP_CATS[0][0], amount: '', frequency: 'monthly', startDate: today, endDate: '', clinic: '', accountId: '', notes: '' }}
            fields={fields} submitLabel={tr('g3.expense.saveEdit')} onCancel={() => setModal(null)}
            onSubmit={v => amountOk(v.amount) && save(v)}
          />
        </Modal>
      )}
    </Section>
  );
}

const emptyRecBatch = () => mergeBatches();
