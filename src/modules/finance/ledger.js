// Double-entry ledger (internal). Entries and their lines are APPEND-ONLY:
// a correction is a new mirror entry (`reversalOf`), never an edit or delete.
// Entry ids are derived from the business row id, so committing twice is idempotent.

import { LEDGER, fail } from './constants.js';
import { toMinor, fromMinor } from './money.js';
import { entryIdFor, lineIdFor } from './ids.js';

const line = (entryId, n, { ledger, accountId = null, category = null, debit = 0, credit = 0 }) => ({
  id: lineIdFor(entryId, n),
  entryId,
  ledger,
  accountId,
  category,
  debit: fromMinor(debit),
  credit: fromMinor(credit)
});

// Build {entry, lines} (entry.lines === lines). `lines` = [{ledger, accountId?, category?, debit?, credit?}] in minor units.
export function buildEntry({ sourceId, date, type, source, memo = '', createdBy = '', reversalOf = null, reversalOfType = null, clinic = null, lines }) {
  const id = entryIdFor(sourceId);
  const built = lines.map((l, i) => line(id, i + 1, l));
  const d = built.reduce((s, l) => s + toMinor(l.debit), 0);
  const c = built.reduce((s, l) => s + toMinor(l.credit), 0);
  if (d !== c || d === 0) fail('ENTRY_UNBALANCED', 'entry must balance and be non-zero');
  // Lines travel INSIDE the entry (one atomic row → no orphan/unbalanced entry can ever sync);
  // the server expands them into iapp_accounting_entry_lines and re-validates the balance.
  return {
    entry: {
      id, date, type, source, sourceRef: sourceId, memo, status: 'posted',
      reversalOf, reversalOfType, clinic, createdAt: new Date().toISOString(), createdBy, lines: built
    },
    lines: built
  };
}

export const entryForCharge = (charge, ctx = {}) => {
  const net = toMinor(charge.netAmount);
  const abs = Math.abs(net);
  return buildEntry({
    sourceId: charge.id, date: charge.serviceDate, type: 'charge', source: charge.source || 'MANUAL',
    memo: charge.service || '', createdBy: ctx.by || charge.createdBy || '', clinic: charge.clinic || null,
    lines: net >= 0
      ? [{ ledger: LEDGER.RECEIVABLE, debit: abs }, { ledger: LEDGER.REVENUE, credit: abs }]
      : [{ ledger: LEDGER.REVENUE, debit: abs }, { ledger: LEDGER.RECEIVABLE, credit: abs }]
  });
};

// payment / refund / doctor_payment / transfer rows (never 'reversal' — see entryForReversal).
export function entryForPayment(p, ctx = {}) {
  const amt = toMinor(p.amount);
  const base = { sourceId: p.id, date: p.paymentDate, type: p.kind, source: p.source || 'MANUAL', memo: p.notes || '', createdBy: ctx.by || p.receivedBy || '', clinic: p.clinic || null };
  if (p.kind === 'payment') {
    return buildEntry({ ...base, lines: [{ ledger: LEDGER.ASSET, accountId: p.accountId, debit: amt }, { ledger: LEDGER.RECEIVABLE, credit: amt }] });
  }
  if (p.kind === 'refund') {
    return buildEntry({ ...base, lines: [{ ledger: LEDGER.RECEIVABLE, debit: amt }, { ledger: LEDGER.ASSET, accountId: p.accountId, credit: amt }] });
  }
  if (p.kind === 'doctor_payment') {
    return buildEntry({ ...base, lines: [{ ledger: LEDGER.DOCTOR_SHARE, debit: amt }, { ledger: LEDGER.ASSET, accountId: p.accountId, credit: amt }] });
  }
  if (p.kind === 'transfer') {
    return buildEntry({ ...base, lines: [{ ledger: LEDGER.ASSET, accountId: p.toAccountId, debit: amt }, { ledger: LEDGER.ASSET, accountId: p.accountId, credit: amt }] });
  }
  return fail('BAD_KIND', 'unsupported payment kind ' + p.kind);
}

// A paid expense (or an expense reversal) → ledger.
export function entryForExpense(e, ctx = {}) {
  const amt = toMinor(e.amount);
  const reversal = !!e.reversalOf;
  return buildEntry({
    sourceId: e.id, date: (e.paidAt || e.date || '').slice(0, 10), type: reversal ? 'reversal' : 'expense',
    source: e.source || 'MANUAL', memo: e.category || '', createdBy: ctx.by || e.createdBy || '', clinic: e.clinic || null,
    reversalOf: reversal ? entryIdFor(e.reversalOf) : null, reversalOfType: reversal ? 'expense' : null,
    lines: reversal
      ? [{ ledger: LEDGER.ASSET, accountId: e.accountId, debit: amt }, { ledger: LEDGER.EXPENSE, category: e.category, credit: amt }]
      : [{ ledger: LEDGER.EXPENSE, category: e.category, debit: amt }, { ledger: LEDGER.ASSET, accountId: e.accountId, credit: amt }]
  });
}

// Mirror of an existing entry (swap debit/credit). `rowId` is the id of the reversal business row.
export function entryForReversal({ rowId, original, originalLines, date, createdBy = '', memo = '' }) {
  return buildEntry({
    sourceId: rowId, date, type: 'reversal', source: original.source, memo, createdBy,
    reversalOf: original.id, reversalOfType: original.type, clinic: original.clinic || null,
    lines: originalLines.map(l => ({
      ledger: l.ledger, accountId: l.accountId, category: l.category,
      debit: toMinor(l.credit), credit: toMinor(l.debit)
    }))
  });
}

// Net debit−credit of ASSET lines per account (cash/bank balance movement), in minor units.
export function assetMovement(entries, lines, { accountId, from = null, to = null, before = null } = {}) {
  const byId = new Map(entries.map(e => [e.id, e]));
  let total = 0;
  for (const l of lines) {
    if (l.ledger !== LEDGER.ASSET || (accountId && l.accountId !== accountId)) continue;
    const e = byId.get(l.entryId);
    if (!e || e.status !== 'posted') continue;
    if (from && e.date < from) continue;
    if (to && e.date > to) continue;
    if (before && e.date >= before) continue;
    total += toMinor(l.debit) - toMinor(l.credit);
  }
  return total;
}

// Net (credit−debit) of a ledger code, optionally per category / period. Minor units.
export function ledgerTotal(entries, lines, ledger, { from = null, to = null, clinic = null, category = null } = {}) {
  const byId = new Map(entries.map(e => [e.id, e]));
  let total = 0;
  for (const l of lines) {
    if (l.ledger !== ledger) continue;
    if (category && l.category !== category) continue;
    const e = byId.get(l.entryId);
    if (!e || e.status !== 'posted') continue;
    if (from && e.date < from) continue;
    if (to && e.date > to) continue;
    if (clinic && e.clinic !== clinic) continue;
    total += toMinor(l.credit) - toMinor(l.debit);
  }
  return total;
}

// Integrity check: every entry balances and has lines. Returns a list of problems ([] = healthy).
export function verifyLedger(entries, lines) {
  const problems = [];
  const sums = new Map();
  for (const l of lines) {
    const s = sums.get(l.entryId) || { d: 0, c: 0, n: 0 };
    s.d += toMinor(l.debit); s.c += toMinor(l.credit); s.n += 1;
    sums.set(l.entryId, s);
  }
  for (const e of entries) {
    const s = sums.get(e.id);
    if (!s) problems.push({ entryId: e.id, code: 'NO_LINES' });
    else if (s.d !== s.c) problems.push({ entryId: e.id, code: 'UNBALANCED' });
  }
  for (const id of sums.keys()) if (!entries.some(e => e.id === id)) problems.push({ entryId: id, code: 'ORPHAN_LINES' });
  return problems;
}

export const linesOf = entries => entries.flatMap(e => e.lines || []);

export const hasEntryFor = (entries, sourceId) => entries.some(e => e.id === entryIdFor(sourceId));
