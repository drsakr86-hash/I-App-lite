// Charges and payments. Pure functions: (state, input, ctx) → batch.
// ctx = { by, role, now?: Date }.  Invariants enforced here AND by DB triggers.

import { fail, SELECTABLE_METHODS, PAYMENT_METHODS } from './constants.js';
import { toMinor, fromMinor } from './money.js';
import { newFinId, receiptNoFor } from './ids.js';
import { entryForCharge, entryForPayment, entryForReversal } from './ledger.js';
import { buildAudit } from './audit.js';
import { emptyBatch } from './batch.js';

const today = ctx => (ctx.now || new Date()).toISOString().slice(0, 10);

// ---- derived views --------------------------------------------------------

// Payments that still count: not reversed, not themselves reversal rows.
export function effectivePayments(payments) {
  const reversed = new Set(payments.filter(p => p.kind === 'reversal').map(p => p.reversalOf));
  return payments.filter(p => p.kind !== 'reversal' && !reversed.has(p.id));
}

export function chargeNetMinor(chargeId, charges) {
  return charges
    .filter(c => c.id === chargeId || c.parentId === chargeId)
    .reduce((s, c) => s + (toMinor(c.netAmount) || 0), 0);
}

// {net, paid, refunded, outstanding} in minor units for one charge.
// `state.serverBalances[chargeId] = {paid, refunded}` (minor units) is the baseline the secretary gets from the server RPC
// (computed over the FULL ledger; she cannot read the payment rows). Payments in `state.payments` are then only the ones
// created/pending on this device, and are added on top.
export function chargeBalance(chargeId, state) {
  const net = chargeNetMinor(chargeId, state.charges);
  const eff = effectivePayments(state.payments).filter(p => p.chargeId === chargeId);
  const base = (state.serverBalances && state.serverBalances[chargeId]) || { paid: 0, refunded: 0 };
  const paid = (base.paid || 0) + eff.filter(p => p.kind === 'payment').reduce((s, p) => s + toMinor(p.amount), 0);
  const refunded = (base.refunded || 0) + eff.filter(p => p.kind === 'refund').reduce((s, p) => s + toMinor(p.amount), 0);
  return { net, paid, refunded, netPaid: paid - refunded, outstanding: net - (paid - refunded) };
}

export const baseCharges = charges => charges.filter(c => c.kind === 'charge');

export const findChargeBySource = (charges, source, sourceRef) =>
  baseCharges(charges).find(c => c.source === source && String(c.sourceRef) === String(sourceRef));

// Legacy-compatible mirror for the clinical screens that still read visit.cost / visit.paid.
export function legacyMirror(chargeId, state) {
  const b = chargeBalance(chargeId, state);
  return { cost: fromMinor(b.net).replace(/\.00$/, ''), paid: b.net > 0 && b.outstanding === 0 };
}

// ---- guards ---------------------------------------------------------------

function activeAccount(state, accountId) {
  const acc = state.accounts.find(a => a.id === accountId);
  if (!acc) fail('ACCOUNT_REQUIRED', 'payment needs an account/cashbox');
  if (acc.active === false) fail('ACCOUNT_INACTIVE', 'account is inactive');
  return acc;
}

export function isPeriodClosed(state, accountId, date) {
  return (state.reconciliations || []).some(r => r.accountId === accountId && r.status === 'closed' && date <= r.periodTo);
}

function assertMethod(method, { allowLegacy = false } = {}) {
  const ok = allowLegacy ? PAYMENT_METHODS : SELECTABLE_METHODS;
  if (!ok.includes(method)) fail('METHOD_REQUIRED', 'invalid payment method');
}

// ---- charges --------------------------------------------------------------

// Create a charge (idempotent on source+sourceRef). input: {patientId, visitId?, appointmentId?, service,
// amount, discount?, doctorId?, doctor?, clinic?, serviceDate?, source, sourceRef}
export function createCharge(state, input, ctx = {}) {
  const source = input.source || 'MANUAL';
  const sourceRef = input.sourceRef != null ? String(input.sourceRef) : null;
  if (sourceRef) {
    const existing = findChargeBySource(state.charges, source, sourceRef);
    if (existing) return emptyBatch();
  }
  const amount = toMinor(input.amount);
  const discount = toMinor(input.discount ?? 0);
  if (amount === null || amount <= 0) fail('AMOUNT_INVALID', 'charge amount must be positive');
  if (discount === null || discount < 0 || discount > amount) fail('DISCOUNT_INVALID', 'discount must be between 0 and amount');
  // Deterministic id for a charge that has a source reference: two devices (or a retry) creating the charge for the same
  // appointment produce the SAME row, so the second insert is a harmless duplicate instead of a second receivable.
  const id = input.id || (sourceRef ? 'chg-' + source.toLowerCase() + '-' + sourceRef : newFinId('chg'));
  const charge = {
    id, kind: 'charge', parentId: null, patientId: input.patientId ?? null, visitId: input.visitId ?? null,
    appointmentId: input.appointmentId ?? null, service: input.service || '', amount: fromMinor(amount),
    discount: fromMinor(discount), netAmount: fromMinor(amount - discount), doctorId: input.doctorId ?? null,
    doctor: input.doctor || '', clinic: input.clinic || '', status: 'posted',
    serviceDate: input.serviceDate || today(ctx), source, sourceRef, reason: '',
    createdAt: (ctx.now || new Date()).toISOString(), createdBy: ctx.by || ''
  };
  const e = entryForCharge(charge, ctx);
  const b = emptyBatch();
  b.charges.push(charge); b.entries.push(e.entry); b.lines.push(...e.lines);
  b.audit.push(buildAudit({ entity: 'charge', entityId: id, action: 'create', by: ctx.by, role: ctx.role, newValue: charge, source, now: ctx.now }));
  return b;
}

// Change a charge's net by `delta` (signed minor) through an adjustment row. A charge can never
// drop below what is already paid; use refund first. input: {chargeId, newNet | delta, reason}
export function adjustCharge(state, input, ctx = {}) {
  const base = state.charges.find(c => c.id === input.chargeId && c.kind === 'charge');
  if (!base) fail('CHARGE_NOT_FOUND', 'charge not found');
  if (!input.reason || !String(input.reason).trim()) fail('REASON_REQUIRED', 'reason is required');
  const bal = chargeBalance(base.id, state);
  const target = input.newNet !== undefined ? toMinor(input.newNet) : bal.net + toMinor(input.delta);
  if (target === null || target < 0) fail('AMOUNT_INVALID', 'invalid amount');
  if (target < bal.netPaid) fail('BELOW_PAID', 'charge cannot go below the amount already paid');
  const delta = target - bal.net;
  if (delta === 0) return emptyBatch();
  const id = input.id || newFinId('adj');
  const adj = {
    id, kind: 'adjustment', parentId: base.id, patientId: base.patientId, visitId: base.visitId,
    appointmentId: base.appointmentId, service: base.service, amount: '0.00', discount: '0.00', netAmount: fromMinor(delta),
    doctorId: base.doctorId, doctor: base.doctor, clinic: base.clinic, status: 'posted',
    serviceDate: today(ctx), source: base.source, sourceRef: base.sourceRef, reason: String(input.reason),
    createdAt: (ctx.now || new Date()).toISOString(), createdBy: ctx.by || ''
  };
  const e = entryForCharge(adj, ctx);
  const b = emptyBatch();
  b.charges.push(adj); b.entries.push(e.entry); b.lines.push(...e.lines);
  b.audit.push(buildAudit({ entity: 'charge', entityId: base.id, action: 'adjust', by: ctx.by, role: ctx.role, oldValue: { net: fromMinor(bal.net) }, newValue: { net: fromMinor(target) }, source: base.source, reason: adj.reason, now: ctx.now }));
  return b;
}

// Void = adjust to zero (only possible when nothing is left paid).
export const voidCharge = (state, input, ctx) => adjustCharge(state, { chargeId: input.chargeId, newNet: 0, reason: input.reason, id: input.id }, ctx);

// ---- payments -------------------------------------------------------------

// input: {id?, chargeId, amount, method, accountId, paymentDate?, source?, notes?, receivedBy?}
export function recordPayment(state, input, ctx = {}) {
  if (input.id && state.payments.some(p => p.id === input.id)) return emptyBatch(); // double-submit / retry
  const charge = state.charges.find(c => c.id === input.chargeId && c.kind === 'charge');
  if (!charge) fail('CHARGE_NOT_FOUND', 'payment must belong to a charge');
  const amt = toMinor(input.amount);
  if (amt === null || amt <= 0) fail('AMOUNT_INVALID', 'payment amount must be positive');
  assertMethod(input.method, { allowLegacy: input.source === 'LEGACY_VISIT' });
  if (!input.source) fail('SOURCE_REQUIRED', 'payment needs a source');
  const acc = activeAccount(state, input.accountId);
  const date = input.paymentDate || today(ctx);
  if (isPeriodClosed(state, acc.id, date)) fail('PERIOD_CLOSED', 'cash period is reconciled and closed');
  const bal = chargeBalance(charge.id, state);
  if (amt > bal.outstanding) fail('OVERPAYMENT', 'payment exceeds the outstanding balance');
  const id = input.id || newFinId('pay');
  const p = {
    id, kind: 'payment', patientId: charge.patientId, chargeId: charge.id, settlementId: null, amount: fromMinor(amt),
    method: input.method, accountId: acc.id, toAccountId: null, paymentDate: date, receiptNo: receiptNoFor(id, date),
    receivedBy: input.receivedBy || ctx.by || '', status: 'posted', reversalOf: null, source: input.source,
    sourceRef: input.sourceRef != null ? String(input.sourceRef) : null, reason: '', notes: input.notes || '',
    clinic: charge.clinic || '', createdAt: (ctx.now || new Date()).toISOString(), createdBy: ctx.by || ''
  };
  const e = entryForPayment(p, ctx);
  const b = emptyBatch();
  b.payments.push(p); b.entries.push(e.entry); b.lines.push(...e.lines);
  b.audit.push(buildAudit({ entity: 'payment', entityId: id, action: 'create', by: ctx.by, role: ctx.role, newValue: p, source: p.source, now: ctx.now }));
  return b;
}

// input: {id?, chargeId, amount, method, accountId, reason, refundDate?}
export function recordRefund(state, input, ctx = {}) {
  if (input.id && state.payments.some(p => p.id === input.id)) return emptyBatch();
  const charge = state.charges.find(c => c.id === input.chargeId && c.kind === 'charge');
  if (!charge) fail('CHARGE_NOT_FOUND', 'refund must belong to a charge');
  if (!input.reason || !String(input.reason).trim()) fail('REASON_REQUIRED', 'refund needs a reason');
  const amt = toMinor(input.amount);
  if (amt === null || amt <= 0) fail('AMOUNT_INVALID', 'refund amount must be positive');
  assertMethod(input.method);
  const acc = activeAccount(state, input.accountId);
  const date = input.refundDate || today(ctx);
  if (isPeriodClosed(state, acc.id, date)) fail('PERIOD_CLOSED', 'cash period is reconciled and closed');
  const bal = chargeBalance(charge.id, state);
  if (amt > bal.netPaid) fail('REFUND_EXCEEDS_PAID', 'refund exceeds what was paid');
  const id = input.id || newFinId('ref');
  const p = {
    id, kind: 'refund', patientId: charge.patientId, chargeId: charge.id, settlementId: null, amount: fromMinor(amt),
    method: input.method, accountId: acc.id, toAccountId: null, paymentDate: date, receiptNo: receiptNoFor(id, date),
    receivedBy: ctx.by || '', status: 'posted', reversalOf: null, source: input.source || 'MANUAL', sourceRef: null,
    reason: String(input.reason), notes: input.notes || '', clinic: charge.clinic || '',
    createdAt: (ctx.now || new Date()).toISOString(), createdBy: ctx.by || ''
  };
  const e = entryForPayment(p, ctx);
  const b = emptyBatch();
  b.payments.push(p); b.entries.push(e.entry); b.lines.push(...e.lines);
  b.audit.push(buildAudit({ entity: 'payment', entityId: id, action: 'refund', by: ctx.by, role: ctx.role, newValue: p, source: p.source, reason: p.reason, now: ctx.now }));
  return b;
}

// Reverse any posted money row (payment / refund / doctor_payment / transfer) with a mirror entry.
export function reversePayment(state, input, ctx = {}) {
  const orig = state.payments.find(p => p.id === input.paymentId);
  if (!orig || orig.kind === 'reversal') fail('PAYMENT_NOT_FOUND', 'payment not found');
  if (!input.reason || !String(input.reason).trim()) fail('REASON_REQUIRED', 'reason is required');
  if (state.payments.some(p => p.kind === 'reversal' && p.reversalOf === orig.id)) fail('ALREADY_REVERSED', 'payment already reversed');
  const date = input.date || today(ctx);
  for (const accId of [orig.accountId, orig.toAccountId].filter(Boolean)) {
    if (isPeriodClosed(state, accId, date)) fail('PERIOD_CLOSED', 'cash period is reconciled and closed');
  }
  const origEntry = state.entries.find(e => e.id === 'ent-' + orig.id);
  const origLines = state.lines.filter(l => l.entryId === 'ent-' + orig.id);
  if (!origEntry || !origLines.length) fail('ENTRY_MISSING', 'original ledger entry is missing');
  const id = input.id || newFinId('rev');
  const row = {
    ...orig, id, kind: 'reversal', reversalOf: orig.id, paymentDate: date, receiptNo: receiptNoFor(id, date),
    reason: String(input.reason), notes: '', status: 'posted', settlementId: orig.settlementId || null,
    createdAt: (ctx.now || new Date()).toISOString(), createdBy: ctx.by || '', origKind: orig.kind
  };
  const e = entryForReversal({ rowId: id, original: origEntry, originalLines: origLines, date, createdBy: ctx.by || '', memo: row.reason });
  const b = emptyBatch();
  b.payments.push(row); b.entries.push(e.entry); b.lines.push(...e.lines);
  b.audit.push(buildAudit({ entity: 'payment', entityId: orig.id, action: 'reverse', by: ctx.by, role: ctx.role, oldValue: { amount: orig.amount, kind: orig.kind }, newValue: { reversalId: id }, source: orig.source, reason: row.reason, now: ctx.now }));
  return b;
}

// Move money between two accounts (cash ↔ bank …).
export function recordTransfer(state, input, ctx = {}) {
  if (input.id && state.payments.some(p => p.id === input.id)) return emptyBatch();
  const amt = toMinor(input.amount);
  if (amt === null || amt <= 0) fail('AMOUNT_INVALID', 'transfer amount must be positive');
  if (!input.fromAccountId || input.fromAccountId === input.toAccountId) fail('ACCOUNT_REQUIRED', 'two different accounts are required');
  const from = activeAccount(state, input.fromAccountId);
  const to = activeAccount(state, input.toAccountId);
  const date = input.date || today(ctx);
  if (isPeriodClosed(state, from.id, date) || isPeriodClosed(state, to.id, date)) fail('PERIOD_CLOSED', 'cash period is reconciled and closed');
  const id = input.id || newFinId('trf');
  const p = {
    id, kind: 'transfer', patientId: null, chargeId: null, settlementId: null, amount: fromMinor(amt), method: 'cash',
    accountId: from.id, toAccountId: to.id, paymentDate: date, receiptNo: receiptNoFor(id, date), receivedBy: ctx.by || '',
    status: 'posted', reversalOf: null, source: 'TRANSFER', sourceRef: null, reason: '', notes: input.notes || '', clinic: '',
    createdAt: (ctx.now || new Date()).toISOString(), createdBy: ctx.by || ''
  };
  const e = entryForPayment(p, ctx);
  const b = emptyBatch();
  b.payments.push(p); b.entries.push(e.entry); b.lines.push(...e.lines);
  b.audit.push(buildAudit({ entity: 'payment', entityId: id, action: 'transfer', by: ctx.by, role: ctx.role, newValue: p, source: 'TRANSFER', now: ctx.now }));
  return b;
}

export const outstandingReceivables = (state, { clinic = '', doctor = '' } = {}) =>
  baseCharges(state.charges)
    .filter(c => (!clinic || c.clinic === clinic) && (!doctor || c.doctor === doctor))
    .map(c => ({ charge: c, ...chargeBalance(c.id, state) }))
    .filter(r => r.outstanding > 0);

