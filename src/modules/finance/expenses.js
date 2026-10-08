// Expenses: Expense → (pending) → pay with account + method → ledger.
// Paid expenses are immutable; a mistake is fixed with reverseExpense().
// Recurring templates only PRODUCE due/pending items when asked — never on screen open.

import { fail, SELECTABLE_METHODS, RECURRENCE } from './constants.js';
import { toMinor, fromMinor } from './money.js';
import { newFinId } from './ids.js';
import { entryForExpense } from './ledger.js';
import { buildAudit } from './audit.js';
import { emptyBatch } from './batch.js';
import { isPeriodClosed } from './billing.js';

const nowOf = ctx => ctx.now || new Date();
const todayOf = ctx => nowOf(ctx).toISOString().slice(0, 10);

function payFields(state, { accountId, method, paidAt }, ctx) {
  if (!SELECTABLE_METHODS.includes(method)) fail('METHOD_REQUIRED', 'payment method is required');
  const acc = state.accounts.find(a => a.id === accountId);
  if (!acc) fail('ACCOUNT_REQUIRED', 'an expense payment needs an account');
  if (acc.active === false) fail('ACCOUNT_INACTIVE', 'account is inactive');
  const date = (paidAt || todayOf(ctx)).slice(0, 10);
  if (isPeriodClosed(state, acc.id, date)) fail('PERIOD_CLOSED', 'cash period is reconciled and closed');
  return { accountId: acc.id, paymentMethod: method, paidAt: date };
}

// input: {id?, date, category, amount, notes?, clinic?, recurringId?, dueDate?, pay?: {accountId, method, paidAt?}}
export function createExpense(state, input, ctx = {}) {
  if (input.id && state.expenses.some(e => e.id === input.id)) return emptyBatch();
  const amt = toMinor(input.amount);
  if (amt === null || amt <= 0) fail('AMOUNT_INVALID', 'expense amount must be positive');
  if (!input.category) fail('CATEGORY_REQUIRED', 'category is required');
  const date = input.date || todayOf(ctx);
  const id = input.id || newFinId('exp');
  let exp = {
    id, date, category: input.category, amount: fromMinor(amt), notes: input.notes || '', clinic: input.clinic || '',
    recurringId: input.recurringId ?? undefined, dueDate: input.dueDate || date, status: 'pending', accountId: null,
    paymentMethod: null, createdBy: ctx.by || '', approvedBy: null, paidAt: null, reversalOf: null, source: input.source || 'MANUAL'
  };
  const b = emptyBatch();
  if (input.pay) {
    exp = { ...exp, ...payFields(state, input.pay, ctx), status: 'paid', approvedBy: ctx.by || '' };
    const e = entryForExpense(exp, ctx);
    b.entries.push(e.entry); b.lines.push(...e.lines);
  }
  b.expenses.push(exp);
  b.audit.push(buildAudit({ entity: 'expense', entityId: id, action: input.pay ? 'create_paid' : 'create', by: ctx.by, role: ctx.role, newValue: exp, source: exp.source, now: ctx.now }));
  return b;
}

// Edit is allowed only while pending.
export function editExpense(state, input, ctx = {}) {
  const old = state.expenses.find(e => e.id === input.id);
  if (!old) fail('EXPENSE_NOT_FOUND', 'expense not found');
  if (old.status !== 'pending') fail('EXPENSE_LOCKED', 'only pending expenses can be edited; reverse a paid expense instead');
  const amt = input.amount !== undefined ? toMinor(input.amount) : toMinor(old.amount);
  if (amt === null || amt <= 0) fail('AMOUNT_INVALID', 'expense amount must be positive');
  const next = {
    ...old, category: input.category ?? old.category, amount: fromMinor(amt), notes: input.notes ?? old.notes,
    clinic: input.clinic ?? old.clinic, date: input.date ?? old.date, dueDate: input.dueDate ?? old.dueDate
  };
  const b = emptyBatch();
  b.expenses.push(next);
  b.audit.push(buildAudit({ entity: 'expense', entityId: old.id, action: 'edit', by: ctx.by, role: ctx.role, oldValue: old, newValue: next, source: old.source, now: ctx.now }));
  return b;
}

export function cancelExpense(state, input, ctx = {}) {
  const old = state.expenses.find(e => e.id === input.id);
  if (!old) fail('EXPENSE_NOT_FOUND', 'expense not found');
  if (old.status !== 'pending') fail('EXPENSE_LOCKED', 'only pending expenses can be cancelled');
  if (!input.reason || !String(input.reason).trim()) fail('REASON_REQUIRED', 'reason is required');
  const next = { ...old, status: 'cancelled' };
  const b = emptyBatch();
  b.expenses.push(next);
  b.audit.push(buildAudit({ entity: 'expense', entityId: old.id, action: 'cancel', by: ctx.by, role: ctx.role, oldValue: { status: old.status }, newValue: { status: 'cancelled' }, source: old.source, reason: String(input.reason), now: ctx.now }));
  return b;
}

// pending → paid (ledger entry created here).
export function payExpense(state, input, ctx = {}) {
  const old = state.expenses.find(e => e.id === input.id);
  if (!old) fail('EXPENSE_NOT_FOUND', 'expense not found');
  if (old.status === 'paid') return emptyBatch(); // idempotent retry
  if (old.status !== 'pending') fail('EXPENSE_LOCKED', 'expense is not payable');
  const next = { ...old, ...payFields(state, input, ctx), status: 'paid', approvedBy: ctx.by || '' };
  const e = entryForExpense(next, ctx);
  const b = emptyBatch();
  b.expenses.push(next); b.entries.push(e.entry); b.lines.push(...e.lines);
  b.audit.push(buildAudit({ entity: 'expense', entityId: old.id, action: 'pay', by: ctx.by, role: ctx.role, oldValue: { status: old.status }, newValue: { status: 'paid', accountId: next.accountId, method: next.paymentMethod }, source: old.source, now: ctx.now }));
  return b;
}

// Reverse a paid expense: a new mirror row + mirror ledger entry; the original is untouched.
export function reverseExpense(state, input, ctx = {}) {
  const orig = state.expenses.find(e => e.id === input.id);
  if (!orig || orig.status !== 'paid' || orig.reversalOf) fail('EXPENSE_NOT_FOUND', 'paid expense not found');
  if (!input.reason || !String(input.reason).trim()) fail('REASON_REQUIRED', 'reason is required');
  if (state.expenses.some(e => e.reversalOf === orig.id)) fail('ALREADY_REVERSED', 'expense already reversed');
  const date = (input.date || todayOf(ctx)).slice(0, 10);
  if (isPeriodClosed(state, orig.accountId, date)) fail('PERIOD_CLOSED', 'cash period is reconciled and closed');
  const id = input.rowId || newFinId('expr');
  const row = { ...orig, id, date, paidAt: date, reversalOf: orig.id, notes: String(input.reason), createdBy: ctx.by || '' };
  const e = entryForExpense(row, ctx);
  const b = emptyBatch();
  b.expenses.push(row); b.entries.push(e.entry); b.lines.push(...e.lines);
  b.audit.push(buildAudit({ entity: 'expense', entityId: orig.id, action: 'reverse', by: ctx.by, role: ctx.role, oldValue: { amount: orig.amount }, newValue: { reversalId: id }, source: orig.source, reason: String(input.reason), now: ctx.now }));
  return b;
}

// ---- recurring ------------------------------------------------------------

const pad = n => String(n).padStart(2, '0');
export function addInterval(dateISO, frequency) {
  const [y, m, d] = dateISO.split('-').map(Number);
  if (frequency === 'weekly') {
    const t = new Date(Date.UTC(y, m - 1, d + 7));
    return t.getUTCFullYear() + '-' + pad(t.getUTCMonth() + 1) + '-' + pad(t.getUTCDate());
  }
  if (frequency === 'yearly') return (y + 1) + '-' + pad(m) + '-' + pad(Math.min(d, daysIn(y + 1, m)));
  const nm = m === 12 ? 1 : m + 1;
  const ny = m === 12 ? y + 1 : y;
  return ny + '-' + pad(nm) + '-' + pad(Math.min(d, daysIn(ny, nm)));
}
const daysIn = (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate();

export function recurringDueDates(rec, todayStr, { max = 12 } = {}) {
  if (!rec || rec.active === false || !RECURRENCE.includes(rec.frequency) || !rec.nextDueDate) return [];
  const out = [];
  let d = rec.nextDueDate;
  while (d <= todayStr && (!rec.endDate || d <= rec.endDate) && out.length < max) {
    out.push(d);
    d = addInterval(d, rec.frequency);
  }
  return out;
}

export const recurringExpenseId = (recId, dueDate) => 'rexp-' + recId + '-' + dueDate;

// Read-only view for the screen: which occurrences are due and not yet turned into an expense.
export function dueRecurring(state, todayStr) {
  const out = [];
  for (const rec of state.recurring) {
    for (const due of recurringDueDates(rec, todayStr)) {
      if (!state.expenses.some(e => e.id === recurringExpenseId(rec.id, due))) out.push({ recurring: rec, dueDate: due });
    }
  }
  return out;
}

// Explicit action (button): turn due occurrences into PENDING expenses (deterministic ids ⇒ no duplicates,
// even if two devices run it) and advance each template's nextDueDate. Nothing is paid here.
export function generateDueExpenses(state, todayStr, ctx = {}) {
  const b = emptyBatch();
  for (const rec of state.recurring) {
    const dues = recurringDueDates(rec, todayStr);
    if (!dues.length) continue;
    for (const due of dues) {
      const id = recurringExpenseId(rec.id, due);
      if (state.expenses.some(e => e.id === id)) continue;
      const one = createExpense(state, {
        id, date: due, dueDate: due, category: rec.category, amount: rec.amount, notes: rec.notes || '',
        clinic: rec.clinic || '', recurringId: rec.id, source: 'RECURRING'
      }, ctx);
      b.expenses.push(...one.expenses); b.audit.push(...one.audit);
    }
    let next = dues[dues.length - 1];
    next = addInterval(next, rec.frequency);
    b.recurring.push({ ...rec, nextDueDate: next });
  }
  return b;
}
