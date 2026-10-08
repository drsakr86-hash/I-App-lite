import React, { useState } from 'react';
import { Modal, Btn } from '../../components/common.jsx';
import { C } from '../../modules/theme/index.js';
import { t, useLang } from '../../modules/i18n/index.js';
import { tv } from '../../modules/i18n/tv.js';
import { localISO, CLINICS } from '../../modules/constants/index.js';
import { ACCOUNT_TYPES } from '../../modules/finance/constants.js';
import { accountBalance, expectedClosing, closeReconciliation, lastClosedDate } from '../../modules/finance/reconciliation.js';
import { recordTransfer } from '../../modules/finance/billing.js';
import { createAccountBatch } from '../../modules/finance/accounts.js';
import { newFinId } from '../../modules/finance/ids.js';
import { selectableAccounts } from '../../modules/finance/accounts.js';
import { Money, Card, Section, Empty, SmallBtn, FieldsForm } from './parts.jsx';
import { amountOk } from './view-model.js';

export default function Cash({ state, session, run, notify }) {
  const lang = useLang();
  const tr = k => t(k, lang);
  const [modal, setModal] = useState(null);
  const today = localISO();
  const ctx = { by: session.name || session.username, role: session.role };
  const accounts = state.accounts.filter(a => !a.isLegacy);
  const exec = async planner => { const r = await run(planner); notify(r); if (r.ok) setModal(null); };
  const accOpts = selectableAccounts(state.accounts).map(a => [a.id, a.name]);
  const clinicOpts = CLINICS.map(c => [c.v, tv(c.l)]);

  return (
    <div>
      <Section title={tr('g8.cash.accounts')} right={<Btn small color={C.teal} onClick={() => setModal({ type: 'account' })}>{tr('g4.acc.add')}</Btn>}>
        {accounts.map(a => (
          <Card key={a.id}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ color: C.text, fontSize: 13, fontWeight: 700 }}>{a.name}{a.active === false ? ' ⛔' : ''}</div>
                <div style={{ color: C.muted, fontSize: 10 }}>{tr('g8.acctype.' + a.type)}{lastClosedDate(state, a.id) ? ' · ' + tr('g8.cash.closedTo') + ' ' + lastClosedDate(state, a.id) : ''}</div>
              </div>
              <Money minor={accountBalance(state, a.id)} size={16} color={C.success} />
            </div>
            {a.active !== false && <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 6 }}><SmallBtn color={C.purple} onClick={() => setModal({ type: 'close', a })}>{tr('g8.cash.reconcile')}</SmallBtn></div>}
          </Card>
        ))}
      </Section>

      {accOpts.length > 1 && (
        <Section title={tr('g8.cash.transfer')}>
          <Btn full outline onClick={() => setModal({ type: 'transfer' })}>{tr('g8.cash.transfer')}</Btn>
        </Section>
      )}

      <Section title={tr('g8.cash.history')}>
        {state.reconciliations.length === 0 && <Empty text={tr('g8.common.none')} />}
        {[...state.reconciliations].sort((a, b) => String(b.periodTo).localeCompare(String(a.periodTo))).map(r => {
          const diff = Math.round(Number(r.difference) * 100);
          const acc = state.accounts.find(a => a.id === r.accountId);
          return (
            <Card key={r.id}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: C.text }}><span>{acc ? acc.name : r.accountId} · {r.periodFrom} → {r.periodTo}</span><Money minor={Math.round(Number(r.counted) * 100)} /></div>
              <div style={{ fontSize: 11, color: diff === 0 ? C.success : C.danger }}>{tr('g8.cash.difference')}: <Money minor={diff} size={12} color={diff === 0 ? C.success : C.danger} />{r.note ? ' · ' + r.note : ''}</div>
            </Card>
          );
        })}
      </Section>

      {modal && modal.type === 'account' && (
        <Modal title={tr('g8.cash.newAccount')} onClose={() => setModal(null)}>
          <FieldsForm initial={{ name: '', type: 'cash', clinic: '', openingBalance: '0' }} submitLabel={tr('g4.acc.add')} onCancel={() => setModal(null)}
            fields={[
              { k: 'name', label: tr('g8.cash.accName'), required: true },
              { k: 'type', label: tr('g8.cash.accType'), type: 'select', options: ACCOUNT_TYPES.map(x => [x, tr('g8.acctype.' + x)]), required: true },
              { k: 'clinic', label: tr('g3.expense.clinicOpt'), type: 'select', options: clinicOpts, allowEmpty: true },
              { k: 'openingBalance', label: tr('g8.cash.opening'), type: 'number', required: true }
            ]}
            onSubmit={v => exec(() => createAccountBatch({ id: newFinId('acc'), ...v }, ctx))} />
        </Modal>
      )}
      {modal && modal.type === 'transfer' && (
        <Modal title={tr('g8.cash.transfer')} onClose={() => setModal(null)}>
          <FieldsForm initial={{ fromAccountId: accOpts[0][0], toAccountId: accOpts[1][0], amount: '', date: today }} submitLabel={tr('g8.cash.transfer')} onCancel={() => setModal(null)}
            fields={[
              { k: 'fromAccountId', label: tr('g8.cash.from'), type: 'select', options: accOpts, required: true },
              { k: 'toAccountId', label: tr('g8.cash.to'), type: 'select', options: accOpts, required: true },
              { k: 'amount', label: tr('g3.expense.amount'), type: 'number', required: true },
              { k: 'date', label: tr('common.date'), type: 'date', required: true }
            ]}
            onSubmit={v => amountOk(v.amount) && exec(st => recordTransfer(st, { id: newFinId('trf'), ...v }, ctx))} />
        </Modal>
      )}
      {modal && modal.type === 'close' && <CloseForm state={state} account={modal.a} today={today} tr={tr} onClose={() => setModal(null)} onSubmit={v => exec(st => closeReconciliation(st, { id: newFinId('rec'), accountId: modal.a.id, ...v }, ctx))} />}
    </div>
  );
}

function CloseForm({ state, account, today, tr, onClose, onSubmit }) {
  const last = lastClosedDate(state, account.id);
  const [v, setV] = useState({ periodFrom: last ? nextDay(last) : today.slice(0, 7) + '-01', periodTo: today, counted: '', note: '' });
  const set = k => e => setV(x => ({ ...x, [k]: e.target.value }));
  let exp = null;
  try { exp = v.periodTo >= v.periodFrom ? expectedClosing(state, account.id, { from: v.periodFrom, to: v.periodTo }) : null; } catch { exp = null; }
  const counted = v.counted === '' ? null : Math.round(Number(v.counted) * 100);
  const diff = exp && counted !== null ? counted - exp.expectedClosing : null;
  const inputStyle = { padding: 10, borderRadius: 8, width: '100%', boxSizing: 'border-box' };
  return (
    <Modal title={tr('g8.cash.reconcile') + ' · ' + account.name} onClose={onClose}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <input type="date" value={v.periodFrom} onChange={set('periodFrom')} style={inputStyle} />
        <input type="date" value={v.periodTo} onChange={set('periodTo')} style={inputStyle} />
        {exp && (
          <Card>
            <div style={{ fontSize: 11, color: C.muted }}>{tr('g8.cash.opening')}: <Money minor={exp.opening} size={12} /> · {tr('g8.cash.payments')}: <Money minor={exp.payments} size={12} color={C.success} /> · {tr('g8.cash.outflow')}: <Money minor={exp.expenses + exp.refunds + exp.doctorPayments} size={12} color={C.danger} /></div>
            <div style={{ fontSize: 13, color: C.text, marginTop: 4 }}>{tr('g8.cash.expected')}: <Money minor={exp.expectedClosing} /></div>
          </Card>
        )}
        <input type="number" inputMode="decimal" placeholder={tr('g8.cash.counted')} value={v.counted} onChange={set('counted')} style={{ ...inputStyle, textAlign: 'center' }} />
        {diff !== null && <div style={{ textAlign: 'center', color: diff === 0 ? C.success : C.danger, fontSize: 12, fontWeight: 700 }}>{tr('g8.cash.difference')}: <Money minor={diff} color={diff === 0 ? C.success : C.danger} /></div>}
        {diff !== null && diff !== 0 && <textarea placeholder={tr('g8.common.reason')} value={v.note} onChange={set('note')} style={{ ...inputStyle, minHeight: 56 }} />}
        <div style={{ color: C.muted, fontSize: 10 }}>{tr('g8.cash.closeWarn')}</div>
        <div style={{ display: 'flex', gap: 10 }}>
          <Btn outline full onClick={onClose}>{tr('g3.common.cancel')}</Btn>
          <Btn full color={C.purple} onClick={() => counted !== null && onSubmit(v)}>{tr('g8.cash.closeBtn')}</Btn>
        </div>
      </div>
    </Modal>
  );
}

const nextDay = d => { const x = new Date(d + 'T00:00:00Z'); x.setUTCDate(x.getUTCDate() + 1); return x.toISOString().slice(0, 10); };
