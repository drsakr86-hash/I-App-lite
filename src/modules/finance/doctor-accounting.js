// Doctor revenue allocation and settlements. Rules are DATA (iapp_doctor_share_rules),
// never constants in React. Allocation rows are a snapshot taken when a settlement is
// built, so changing a rule later never rewrites history.

import { fail } from './constants.js';
import { toMinor, fromMinor, percentOfMinor } from './money.js';
import { newFinId, receiptNoFor } from './ids.js';
import { entryForPayment } from './ledger.js';
import { buildAudit } from './audit.js';
import { emptyBatch } from './batch.js';
import { baseCharges, chargeNetMinor, chargeBalance, effectivePayments, reversePayment, isPeriodClosed } from './billing.js';
import { SELECTABLE_METHODS } from './constants.js';

const nowOf = ctx => ctx.now || new Date();
const todayOf = ctx => nowOf(ctx).toISOString().slice(0, 10);

// ---- rules ------------------------------------------------------------------

// rule: {id, doctorId?, doctor?, service?, clinic?, mode:'percent'|'fixed', value, active?, validFrom?, validTo?}
export function createShareRule(state, input, ctx = {}) {
  if (!['percent', 'fixed'].includes(input.mode)) fail('RULE_INVALID', 'mode must be percent or fixed');
  const v = input.mode === 'percent' ? Math.round(Number(input.value) * 100) : toMinor(input.value);
  if (!Number.isFinite(v) || v < 0 || (input.mode === 'percent' && v > 10000)) fail('RULE_INVALID', 'invalid rule value');
  const rule = {
    id: input.id || newFinId('rule'), doctorId: input.doctorId ?? null, doctor: input.doctor || '', service: input.service || '',
    clinic: input.clinic || '', mode: input.mode, value: input.mode === 'percent' ? String(Number(input.value)) : fromMinor(v),
    active: input.active !== false, validFrom: input.validFrom || '', validTo: input.validTo || '',
    createdAt: nowOf(ctx).toISOString(), createdBy: ctx.by || ''
  };
  const b = emptyBatch();
  b.rules.push(rule);
  b.audit.push(buildAudit({ entity: 'share_rule', entityId: rule.id, action: 'create', by: ctx.by, role: ctx.role, newValue: rule, now: ctx.now }));
  return b;
}

const sameDoctor = (rule, charge) =>
  (!rule.doctorId && !rule.doctor) ||
  (rule.doctorId != null && charge.doctorId != null && String(rule.doctorId) === String(charge.doctorId)) ||
  (!!rule.doctor && rule.doctor === charge.doctor);

// Most specific active rule wins: doctor+service > service > doctor > clinic-only/default.
export function resolveRule(rules, charge) {
  const date = charge.serviceDate || '';
  const cands = rules.filter(r =>
    r.active !== false && sameDoctor(r, charge) &&
    (!r.service || r.service === charge.service) && (!r.clinic || r.clinic === charge.clinic) &&
    (!r.validFrom || date >= r.validFrom) && (!r.validTo || date <= r.validTo));
  const score = r => (r.doctorId || r.doctor ? 4 : 0) + (r.service ? 2 : 0) + (r.clinic ? 1 : 0);
  cands.sort((a, b) => score(b) - score(a) || (b.validFrom || '').localeCompare(a.validFrom || '') || String(a.id).localeCompare(String(b.id)));
  return cands[0] || null;
}

// {basis, doctorShare, centerShare} in minor units for one charge's net.
export function allocate(netMinor, rule) {
  if (!rule || netMinor <= 0) return { basis: netMinor, doctorShare: 0, centerShare: netMinor };
  const share = rule.mode === 'percent' ? percentOfMinor(netMinor, rule.value) : Math.min(toMinor(rule.value), netMinor);
  return { basis: netMinor, doctorShare: share, centerShare: netMinor - share };
}

// ---- settlements ------------------------------------------------------------

const allocatedChargeIds = state => {
  const live = new Set(state.settlements.filter(s => s.status !== 'cancelled').map(s => s.id));
  return new Set(state.allocations.filter(a => live.has(a.settlementId)).map(a => a.chargeId));
};

const matchDoctor = (c, { doctorId, doctor }) =>
  doctorId != null && c.doctorId != null ? String(c.doctorId) === String(doctorId) : (!!doctor && c.doctor === doctor);

// Charges of a doctor in a period that are not yet part of a live settlement.
export function settleableCharges(state, { doctorId = null, doctor = '', periodFrom, periodTo, clinic = '', requirePaid = false }) {
  const taken = allocatedChargeIds(state);
  return baseCharges(state.charges).filter(c =>
    matchDoctor(c, { doctorId, doctor }) && !taken.has(c.id) &&
    c.serviceDate >= periodFrom && c.serviceDate <= periodTo && (!clinic || c.clinic === clinic) &&
    chargeNetMinor(c.id, state.charges) > 0 && (!requirePaid || chargeBalance(c.id, state).outstanding === 0));
}

function computeLines(state, charges) {
  return charges.map(c => {
    const net = chargeNetMinor(c.id, state.charges);
    const rule = resolveRule(state.rules, c);
    return { charge: c, rule, ...allocate(net, rule) };
  });
}

// Read-only preview (Gross / Doctor share / Center share) — nothing is written.
export function previewSettlement(state, query) {
  const lines = computeLines(state, settleableCharges(state, query));
  const sum = k => lines.reduce((s, l) => s + l[k], 0);
  return { lines, gross: sum('basis'), doctorShare: sum('doctorShare'), centerShare: sum('centerShare'), withoutRule: lines.filter(l => !l.rule).length };
}

export function createSettlement(state, input, ctx = {}) {
  const prev = previewSettlement(state, input);
  if (!prev.lines.length) fail('NOTHING_TO_SETTLE', 'no unsettled revenue for this doctor/period');
  const id = input.id || newFinId('set');
  const settlement = {
    id, doctorId: input.doctorId ?? null, doctor: input.doctor || '', clinic: input.clinic || '',
    periodFrom: input.periodFrom, periodTo: input.periodTo, grossRevenue: fromMinor(prev.gross),
    doctorShare: fromMinor(prev.doctorShare), centerShare: fromMinor(prev.centerShare), paidAmount: '0.00',
    remainingAmount: fromMinor(prev.doctorShare), status: 'draft', createdAt: nowOf(ctx).toISOString(), createdBy: ctx.by || ''
  };
  const b = emptyBatch();
  b.settlements.push(settlement);
  b.allocations.push(...prev.lines.map(l => ({
    id: 'alloc-' + id + '-' + l.charge.id, settlementId: id, chargeId: l.charge.id, ruleId: l.rule ? l.rule.id : null,
    doctorId: l.charge.doctorId ?? null, basisAmount: fromMinor(l.basis), doctorShare: fromMinor(l.doctorShare),
    centerShare: fromMinor(l.centerShare), createdAt: settlement.createdAt
  })));
  b.audit.push(buildAudit({ entity: 'settlement', entityId: id, action: 'create', by: ctx.by, role: ctx.role, newValue: settlement, source: 'SETTLEMENT', now: ctx.now }));
  return b;
}

export const settlementPaidMinor = (state, settlementId) =>
  effectivePayments(state.payments).filter(p => p.kind === 'doctor_payment' && p.settlementId === settlementId).reduce((s, p) => s + toMinor(p.amount), 0);

// Recompute paid/remaining/status from the payments (single source of truth).
export function refreshSettlement(state, settlementId) {
  const s = state.settlements.find(x => x.id === settlementId);
  if (!s || s.status === 'cancelled' || s.status === 'draft') return s;
  const paid = settlementPaidMinor(state, settlementId);
  const share = toMinor(s.doctorShare);
  return { ...s, paidAmount: fromMinor(paid), remainingAmount: fromMinor(Math.max(share - paid, 0)), status: paid <= 0 ? 'approved' : paid >= share ? 'paid' : 'partial' };
}

export function approveSettlement(state, input, ctx = {}) {
  const s = state.settlements.find(x => x.id === input.id);
  if (!s) fail('SETTLEMENT_NOT_FOUND', 'settlement not found');
  if (s.status !== 'draft') return emptyBatch();
  const next = { ...s, status: 'approved' };
  const b = emptyBatch();
  b.settlements.push(next);
  b.audit.push(buildAudit({ entity: 'settlement', entityId: s.id, action: 'approve', by: ctx.by, role: ctx.role, oldValue: { status: 'draft' }, newValue: { status: 'approved' }, source: 'SETTLEMENT', now: ctx.now }));
  return b;
}

export function cancelSettlement(state, input, ctx = {}) {
  const s = state.settlements.find(x => x.id === input.id);
  if (!s) fail('SETTLEMENT_NOT_FOUND', 'settlement not found');
  if (settlementPaidMinor(state, s.id) > 0) fail('SETTLEMENT_PAID', 'reverse the payments before cancelling');
  if (!input.reason || !String(input.reason).trim()) fail('REASON_REQUIRED', 'reason is required');
  const b = emptyBatch();
  b.settlements.push({ ...s, status: 'cancelled' });
  b.audit.push(buildAudit({ entity: 'settlement', entityId: s.id, action: 'cancel', by: ctx.by, role: ctx.role, oldValue: { status: s.status }, newValue: { status: 'cancelled' }, source: 'SETTLEMENT', reason: String(input.reason), now: ctx.now }));
  return b;
}

// Pay (part of) a settlement: outgoing money through an account → doctor_payment row + ledger.
export function paySettlement(state, input, ctx = {}) {
  if (input.id && state.payments.some(p => p.id === input.id)) return emptyBatch();
  const s = state.settlements.find(x => x.id === input.settlementId);
  if (!s) fail('SETTLEMENT_NOT_FOUND', 'settlement not found');
  if (!['approved', 'partial'].includes(s.status)) fail('SETTLEMENT_NOT_PAYABLE', 'settlement must be approved first');
  const amt = toMinor(input.amount);
  if (amt === null || amt <= 0) fail('AMOUNT_INVALID', 'amount must be positive');
  if (!SELECTABLE_METHODS.includes(input.method)) fail('METHOD_REQUIRED', 'payment method is required');
  const acc = state.accounts.find(a => a.id === input.accountId);
  if (!acc) fail('ACCOUNT_REQUIRED', 'a doctor payment needs an account');
  if (acc.active === false) fail('ACCOUNT_INACTIVE', 'account is inactive');
  const date = input.date || todayOf(ctx);
  if (isPeriodClosed(state, acc.id, date)) fail('PERIOD_CLOSED', 'cash period is reconciled and closed');
  const remaining = toMinor(s.doctorShare) - settlementPaidMinor(state, s.id);
  if (amt > remaining) fail('OVERPAYMENT', 'payment exceeds the remaining settlement');
  const id = input.id || newFinId('dpay');
  const p = {
    id, kind: 'doctor_payment', patientId: null, chargeId: null, settlementId: s.id, amount: fromMinor(amt), method: input.method,
    accountId: acc.id, toAccountId: null, paymentDate: date, receiptNo: receiptNoFor(id, date), receivedBy: s.doctor || '',
    status: 'posted', reversalOf: null, source: 'SETTLEMENT', sourceRef: s.id, reason: '', notes: input.notes || '', clinic: s.clinic || '',
    createdAt: nowOf(ctx).toISOString(), createdBy: ctx.by || ''
  };
  const e = entryForPayment(p, ctx);
  const b = emptyBatch();
  b.payments.push(p); b.entries.push(e.entry); b.lines.push(...e.lines);
  const after = applyPaid(state, s, p);
  b.settlements.push(after);
  b.audit.push(buildAudit({ entity: 'settlement', entityId: s.id, action: 'pay', by: ctx.by, role: ctx.role, oldValue: { paid: s.paidAmount }, newValue: { paid: after.paidAmount, paymentId: id }, source: 'SETTLEMENT', now: ctx.now }));
  return b;
}

function applyPaid(state, s, p) {
  const paid = settlementPaidMinor(state, s.id) + toMinor(p.amount);
  const share = toMinor(s.doctorShare);
  return { ...s, paidAmount: fromMinor(paid), remainingAmount: fromMinor(share - paid), status: paid >= share ? 'paid' : 'partial' };
}

export function reverseDoctorPayment(state, input, ctx = {}) {
  const orig = state.payments.find(p => p.id === input.paymentId && p.kind === 'doctor_payment');
  if (!orig) fail('PAYMENT_NOT_FOUND', 'doctor payment not found');
  const b = reversePayment(state, input, ctx);
  if (!b.payments.length) return b;
  const withRev = { ...state, payments: [...state.payments, ...b.payments] };
  const upd = refreshSettlement(withRev, orig.settlementId);
  if (upd) b.settlements.push(upd);
  return b;
}

// Doctor position: what the doctor earned (settled + not yet settled), what was paid, what is still owed.
export function doctorPosition(state, { doctorId = null, doctor = '', periodFrom = '0000-01-01', periodTo = '9999-12-31', clinic = '' }) {
  const unsettled = previewSettlement(state, { doctorId, doctor, periodFrom, periodTo, clinic });
  const mine = state.settlements.filter(s => s.status !== 'cancelled' && (doctorId != null && s.doctorId != null ? String(s.doctorId) === String(doctorId) : s.doctor === doctor) &&
    s.periodFrom >= periodFrom && s.periodTo <= periodTo && (!clinic || s.clinic === clinic));
  const sumS = k => mine.reduce((a, s) => a + toMinor(s[k]), 0);
  const paid = mine.reduce((a, s) => a + settlementPaidMinor(state, s.id), 0);
  const doctorShare = sumS('doctorShare') + unsettled.doctorShare;
  return {
    grossRevenue: sumS('grossRevenue') + unsettled.gross,
    doctorShare,
    centerShare: sumS('centerShare') + unsettled.centerShare,
    alreadyPaid: paid,
    outstanding: doctorShare - paid,
    unsettledShare: unsettled.doctorShare,
    chargesWithoutRule: unsettled.withoutRule
  };
}
