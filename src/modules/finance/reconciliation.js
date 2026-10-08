// Cash reconciliation:
//   Opening + Payments + Transfers In − Expenses − Refunds − Doctor Payments − Transfers Out = Expected closing
// Expected figures are derived from the ledger. Closing a period is a controlled act: it locks the
// period (no backdated money rows) and books any counted-vs-expected difference as an adjustment.

import { fail, LEDGER } from './constants.js';
import { toMinor, fromMinor } from './money.js';
import { newFinId } from './ids.js';
import { buildEntry } from './ledger.js';
import { buildAudit } from './audit.js';
import { emptyBatch } from './batch.js';
import { assetMovement } from './ledger.js';

const nowOf = ctx => ctx.now || new Date();

export function accountBalance(state, accountId, { asOf = null } = {}) {
  const acc = state.accounts.find(a => a.id === accountId);
  if (!acc) return 0;
  return (toMinor(acc.openingBalance) || 0) + assetMovement(state.entries, state.lines, { accountId, to: asOf });
}

// Period report for one account. All values minor units. Reversals are folded into the
// category they reverse (a reversed payment reduces "payments").
export function expectedClosing(state, accountId, { from, to }) {
  const acc = state.accounts.find(a => a.id === accountId);
  if (!acc) fail('ACCOUNT_REQUIRED', 'account not found');
  const opening = (toMinor(acc.openingBalance) || 0) + assetMovement(state.entries, state.lines, { accountId, before: from });
  const out = { payments: 0, transfersIn: 0, expenses: 0, refunds: 0, doctorPayments: 0, transfersOut: 0, adjustments: 0 };
  const byId = new Map(state.entries.map(e => [e.id, e]));
  for (const l of state.lines) {
    if (l.ledger !== LEDGER.ASSET || l.accountId !== accountId) continue;
    const e = byId.get(l.entryId);
    if (!e || e.status !== 'posted' || e.date < from || e.date > to) continue;
    const delta = toMinor(l.debit) - toMinor(l.credit); // + = cash in
    const type = e.type === 'reversal' ? e.reversalOfType : e.type;
    if (type === 'payment') out.payments += delta;
    else if (type === 'refund') out.refunds += delta;
    else if (type === 'expense') out.expenses += delta;
    else if (type === 'doctor_payment') out.doctorPayments += delta;
    else if (type === 'transfer') { if (delta >= 0) out.transfersIn += delta; else out.transfersOut += delta; }
    else out.adjustments += delta;
  }
  // Signs: outflow categories are already negative; report them as positive "amounts out" too.
  const expected = opening + out.payments + out.transfersIn + out.expenses + out.refunds + out.doctorPayments + out.transfersOut + out.adjustments;
  return { opening, ...out, expectedClosing: expected };
}

export const lastClosedDate = (state, accountId) =>
  state.reconciliations.filter(r => r.accountId === accountId && r.status === 'closed').reduce((m, r) => (r.periodTo > m ? r.periodTo : m), '');

// input: {accountId, periodFrom, periodTo, counted, note?}
export function closeReconciliation(state, input, ctx = {}) {
  const counted = toMinor(input.counted);
  if (counted === null || counted < 0) fail('AMOUNT_INVALID', 'counted balance is required');
  const last = lastClosedDate(state, input.accountId);
  if (last && input.periodFrom <= last) fail('PERIOD_CLOSED', 'period overlaps an already closed period');
  if (input.periodTo < input.periodFrom) fail('PERIOD_INVALID', 'invalid period');
  const exp = expectedClosing(state, input.accountId, { from: input.periodFrom, to: input.periodTo });
  const diff = counted - exp.expectedClosing;
  if (diff !== 0 && (!input.note || !String(input.note).trim())) fail('REASON_REQUIRED', 'a note is required when counted differs from expected');
  const id = input.id || newFinId('rec');
  const rec = {
    id, accountId: input.accountId, periodFrom: input.periodFrom, periodTo: input.periodTo,
    opening: fromMinor(exp.opening), expected: fromMinor(exp.expectedClosing), counted: fromMinor(counted), difference: fromMinor(diff),
    status: 'closed', note: input.note || '', createdAt: nowOf(ctx).toISOString(), createdBy: ctx.by || ''
  };
  const b = emptyBatch();
  b.reconciliations.push(rec);
  if (diff !== 0) {
    const abs = Math.abs(diff);
    const e = buildEntry({
      sourceId: 'recadj-' + id, date: input.periodTo, type: 'adjustment', source: 'RECONCILIATION', memo: rec.note, createdBy: ctx.by || '',
      lines: diff > 0
        ? [{ ledger: LEDGER.ASSET, accountId: input.accountId, debit: abs }, { ledger: LEDGER.OVER_SHORT, credit: abs }]
        : [{ ledger: LEDGER.OVER_SHORT, debit: abs }, { ledger: LEDGER.ASSET, accountId: input.accountId, credit: abs }]
    });
    b.entries.push(e.entry); b.lines.push(...e.lines);
  }
  b.audit.push(buildAudit({ entity: 'reconciliation', entityId: id, action: 'close', by: ctx.by, role: ctx.role, newValue: rec, source: 'RECONCILIATION', reason: rec.note, now: ctx.now }));
  return b;
}
