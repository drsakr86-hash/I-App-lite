// Read-only aggregates for the Accounting screen. Everything comes from the finance
// domain (charges / payments / ledger / expenses) — never from visits.

import { toMinor } from './money.js';
import { LEDGER } from './constants.js';
import { baseCharges, effectivePayments, outstandingReceivables } from './billing.js';
import { ledgerTotal } from './ledger.js';
import { accountBalance } from './reconciliation.js';

const inRange = (d, from, to) => (!from || d >= from) && (!to || d <= to);

// filters: {from, to, clinic, doctor, method, accountId}
export function periodFilters(period, { today, month }) {
  if (period === 'today') return { from: today, to: today };
  if (period === 'month') return { from: month + '-01', to: month + '-31' };
  return { from: '', to: '' };
}

// Signed cash effect rows (collections): + payment, − refund, − reversed payment, + reversed refund.
function cashRows(state, f) {
  const orig = new Map(state.payments.map(p => [p.id, p]));
  const rows = [];
  for (const p of state.payments) {
    let sign = 0;
    const kind = p.kind === 'reversal' ? p.origKind || (orig.get(p.reversalOf) || {}).kind : p.kind;
    if (kind === 'payment') sign = p.kind === 'reversal' ? -1 : 1;
    else if (kind === 'refund') sign = p.kind === 'reversal' ? 1 : -1;
    if (!sign) continue;
    if (!inRange(p.paymentDate, f.from, f.to)) continue;
    if (f.clinic && p.clinic !== f.clinic) continue;
    if (f.method && p.method !== f.method) continue;
    if (f.accountId && p.accountId !== f.accountId) continue;
    rows.push({ p, minor: sign * toMinor(p.amount) });
  }
  return rows;
}

const chargeRows = (state, f) =>
  state.charges.filter(c => inRange(c.serviceDate, f.from, f.to) && (!f.clinic || c.clinic === f.clinic) && (!f.doctor || c.doctor === f.doctor));

const group = (rows, keyFn, valFn) => {
  const m = new Map();
  for (const r of rows) m.set(keyFn(r), (m.get(keyFn(r)) || 0) + valFn(r));
  return [...m.entries()].map(([key, minor]) => ({ key, minor })).sort((a, b) => b.minor - a.minor);
};

const expenseRows = (state, f) =>
  state.expenses.filter(e => e.status === 'paid' && inRange(e.paidAt || e.date, f.from, f.to) && (!f.clinic || e.clinic === f.clinic) && (!f.accountId || e.accountId === f.accountId) && (!f.method || e.paymentMethod === f.method));

const expenseMinor = e => (e.reversalOf ? -1 : 1) * toMinor(e.amount);

export function dashboard(state, f) {
  const revenue = chargeRows(state, f).reduce((s, c) => s + toMinor(c.netAmount), 0);
  const collections = cashRows(state, f).reduce((s, r) => s + r.minor, 0);
  const expenses = expenseRows(state, f).reduce((s, e) => s + expenseMinor(e), 0);
  const cash = state.accounts.filter(a => a.active !== false && !a.isLegacy).reduce((s, a) => s + accountBalance(state, a.id), 0);
  const legacyCash = state.accounts.filter(a => a.isLegacy).reduce((s, a) => s + accountBalance(state, a.id), 0);
  const receivables = outstandingReceivables(state, { clinic: f.clinic, doctor: f.doctor }).reduce((s, r) => s + r.outstanding, 0);
  return { revenue, collections, expenses, net: collections - expenses, accrualNet: revenue - expenses, cashBalance: cash, legacyBalance: legacyCash, receivables };
}

export const revenueByDoctor = (state, f) => group(chargeRows(state, f), c => c.doctor || '—', c => toMinor(c.netAmount));
export const revenueByService = (state, f) => group(chargeRows(state, f), c => c.service || '—', c => toMinor(c.netAmount));
export const revenueByClinic = (state, f) => group(chargeRows(state, f), c => c.clinic || '—', c => toMinor(c.netAmount));
export const collectionsByMethod = (state, f) => group(cashRows(state, f), r => r.p.method, r => r.minor);
export const expensesByCategory = (state, f) => group(expenseRows(state, f), e => e.category || '—', expenseMinor);

// Cash movement list (newest first): every posted asset line with its entry.
export function cashMovement(state, f) {
  const byId = new Map(state.entries.map(e => [e.id, e]));
  const out = [];
  for (const l of state.lines) {
    if (l.ledger !== LEDGER.ASSET) continue;
    if (f.accountId && l.accountId !== f.accountId) continue;
    const e = byId.get(l.entryId);
    if (!e || !inRange(e.date, f.from, f.to) || (f.clinic && e.clinic && e.clinic !== f.clinic)) continue;
    out.push({ date: e.date, type: e.type === 'reversal' ? 'reversal:' + e.reversalOfType : e.type, accountId: l.accountId, minor: toMinor(l.debit) - toMinor(l.credit), memo: e.memo, entryId: e.id });
  }
  return out.sort((a, b) => b.date.localeCompare(a.date));
}

export const receivablesList = (state, f) => outstandingReceivables(state, { clinic: f.clinic, doctor: f.doctor });
export const settlementsList = (state, f) => state.settlements.filter(s => inRange(s.periodTo, f.from, f.to) && (!f.clinic || s.clinic === f.clinic) && (!f.doctor || s.doctor === f.doctor));

export const ledgerRevenue = (state, f) => ledgerTotal(state.entries, state.lines, LEDGER.REVENUE, { from: f.from, to: f.to, clinic: f.clinic });
