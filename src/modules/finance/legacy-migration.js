// Legacy → finance migration. Pure and IDEMPOTENT: every migrated row has a deterministic id derived
// from its source row (and source/sourceRef for traceability), so running it twice yields an empty
// batch the second time. Nothing in iapp_visits / iapp_expenses is deleted or rewritten except for
// ADDING the new financial columns to expenses/recurring templates.
//
//   visit.cost>0, paid=true   → Charge + Payment (method 'legacy', account 'acc-legacy', source LEGACY_VISIT)
//   visit.cost>0, paid=false  → Charge only (outstanding receivable)
//   visit.cost≤0 / empty      → skipped (no money involved); paid with zero cost → needs review
//   appointment fee without a collection visit → NOT migrated; listed for review (decision D1)

import { LEGACY_ACCOUNT_ID, DEFAULT_ACCOUNT_ID, RECURRENCE } from './constants.js';
import { toMinor, fromMinor } from './money.js';
import { entryForCharge, entryForPayment, entryForExpense } from './ledger.js';
import { buildAudit } from './audit.js';
import { emptyBatch } from './batch.js';
import { addInterval } from './expenses.js';

const SYS = 'legacy-migration';
export const legacyChargeId = visitId => 'chg-legacy-visit-' + visitId;
export const legacyPaymentId = visitId => 'pay-legacy-visit-' + visitId;

function resolveDoctor(doctors, name) {
  const d = (doctors || []).find(x => x.short === name || x.name === name);
  return d ? d.id : null;
}

export function systemAccounts(state, now = new Date()) {
  const have = new Set(state.accounts.map(a => a.id));
  const mk = (id, name, type, extra = {}) => ({
    id, name, type, clinic: '', active: true, openingBalance: '0.00', isLegacy: false, createdAt: now.toISOString(), createdBy: SYS, ...extra
  });
  const out = [];
  if (!have.has(LEGACY_ACCOUNT_ID)) out.push(mk(LEGACY_ACCOUNT_ID, 'Legacy (unclassified)', 'cash', { isLegacy: true }));
  if (!have.has(DEFAULT_ACCOUNT_ID)) out.push(mk(DEFAULT_ACCOUNT_ID, 'Main cashbox', 'cash'));
  return out;
}

// data: {visits, expenses, recurringExpenses, appointments, doctors}; state: current finance state.
export function planLegacyMigration(data, state, { now = new Date() } = {}) {
  const b = emptyBatch();
  const report = { chargesCreated: 0, paymentsCreated: 0, expensesConverted: 0, recurringConverted: 0, skippedNoAmount: 0, alreadyMigrated: 0, needsReview: [] };
  const accounts = systemAccounts(state, now);
  b.accounts.push(...accounts);
  const chargeIds = new Set(state.charges.map(c => c.id));
  const paymentIds = new Set(state.payments.map(p => p.id));
  const today = now.toISOString().slice(0, 10);

  for (const v of data.visits || []) {
    const cost = toMinor(v.cost);
    const paid = !!v.paid;
    if (cost === null || cost <= 0) {
      if (paid) report.needsReview.push({ type: 'PAID_WITHOUT_AMOUNT', visitId: v.id, patient: v.patient });
      else report.skippedNoAmount++;
      continue;
    }
    const cid = legacyChargeId(v.id);
    if (chargeIds.has(cid)) { report.alreadyMigrated++; continue; }
    const date = v.date || today;
    const charge = {
      id: cid, kind: 'charge', parentId: null, patientId: v.patientId ?? null, visitId: String(v.id), appointmentId: null,
      service: v.type || '', amount: fromMinor(cost), discount: '0.00', netAmount: fromMinor(cost), doctorId: resolveDoctor(data.doctors, v.doctor),
      doctor: v.doctor || '', clinic: v.clinic || '', status: 'posted', serviceDate: date, source: 'LEGACY_VISIT', sourceRef: String(v.id),
      reason: '', createdAt: now.toISOString(), createdBy: SYS
    };
    const ce = entryForCharge(charge, { by: SYS });
    b.charges.push(charge); b.entries.push(ce.entry); b.lines.push(...ce.lines);
    b.audit.push(buildAudit({ entity: 'charge', entityId: cid, action: 'migrate', by: SYS, newValue: { visitId: v.id, cost: charge.netAmount }, source: 'LEGACY_VISIT', now }));
    report.chargesCreated++;
    if (paid) {
      const pid = legacyPaymentId(v.id);
      if (!paymentIds.has(pid)) {
        const p = {
          id: pid, kind: 'payment', patientId: charge.patientId, chargeId: cid, settlementId: null, amount: fromMinor(cost), method: 'legacy',
          accountId: LEGACY_ACCOUNT_ID, toAccountId: null, paymentDate: date, receiptNo: 'LEG-' + String(v.id), receivedBy: SYS, status: 'posted',
          reversalOf: null, source: 'LEGACY_VISIT', sourceRef: String(v.id), reason: '', notes: 'LEGACY: payment date taken from the visit date; method unknown',
          clinic: charge.clinic, createdAt: now.toISOString(), createdBy: SYS
        };
        const pe = entryForPayment(p, { by: SYS });
        b.payments.push(p); b.entries.push(pe.entry); b.lines.push(...pe.lines);
        report.paymentsCreated++;
      }
    }
  }

  // Appointments carrying a fee but with no collection visit: never counted by Accounting before → review, don't invent revenue.
  const visitIds = new Set((data.visits || []).map(v => String(v.id)));
  for (const a of data.appointments || []) {
    const cost = toMinor(a.cost);
    if (cost && cost > 0 && !visitIds.has('apt-' + a.id)) {
      report.needsReview.push({ type: 'APPOINTMENT_FEE_WITHOUT_VISIT', appointmentId: a.id, patient: a.patient, cost: fromMinor(cost), paid: !!a.paid });
    }
  }

  // Legacy expenses: each is a past, already-paid cost with no account → book against the legacy account.
  for (const e of data.expenses || []) {
    if (e.status) continue; // already carries the new fields
    const amt = toMinor(e.amount);
    if (amt === null || amt <= 0) { report.needsReview.push({ type: 'EXPENSE_BAD_AMOUNT', expenseId: e.id }); continue; }
    const upgraded = {
      ...e, amount: fromMinor(amt), dueDate: e.date || today, status: 'paid', accountId: LEGACY_ACCOUNT_ID, paymentMethod: 'legacy',
      createdBy: SYS, approvedBy: SYS, paidAt: e.date || today, reversalOf: null, source: 'LEGACY_EXPENSE'
    };
    const en = entryForExpense(upgraded, { by: SYS });
    b.expenses.push(upgraded); b.entries.push(en.entry); b.lines.push(...en.lines);
    report.expensesConverted++;
  }

  // Recurring templates: add schedule fields. NEVER back-fill expenses.
  const month = today.slice(0, 7);
  for (const r of data.recurringExpenses || []) {
    if (r.frequency) continue;
    const materializedThisMonth = (data.expenses || []).some(e => e.recurringId === r.id && (e.date || '').startsWith(month));
    const first = month + '-01';
    b.recurring.push({
      ...r, frequency: RECURRENCE[1], startDate: '', endDate: '', active: true, accountId: DEFAULT_ACCOUNT_ID,
      nextDueDate: materializedThisMonth ? addInterval(first, 'monthly') : first
    });
    report.recurringConverted++;
  }
  return { batch: b, report };
}
