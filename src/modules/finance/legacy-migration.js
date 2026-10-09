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
import { entryIdFor } from './ids.js';
import { baseCharges, chargeBalance } from './billing.js';
import { buildAudit } from './audit.js';
import { emptyBatch, applyBatch } from './batch.js';
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
  const report = { chargesCreated: 0, paymentsCreated: 0, expensesConverted: 0, recurringConverted: 0, skippedNoAmount: 0, alreadyMigrated: 0, entriesRepaired: 0, needsReview: [] };
  const accounts = systemAccounts(state, now);
  b.accounts.push(...accounts);
  const payments = state.payments || [];
  const paymentIds = new Set(payments.map(p => p.id));
  const entryIds = new Set((state.entries || []).map(e => e.id));
  const have = sourceId => entryIds.has(entryIdFor(sourceId));
  const today = now.toISOString().slice(0, 10);
  const base = baseCharges(state.charges);
  const byId = new Map(base.map(c => [c.id, c]));
  // A visit may already be billed by the collection flow (charge.visitId / sourceRef = the visit id, e.g. 'apt-77'):
  // that charge is the single source of truth, so the migration must never add a second (legacy) one for it.
  const byVisit = new Map();
  for (const c of base) for (const k of [c.visitId, c.sourceRef]) if (k != null && k !== '') byVisit.set(String(k), c);
  let working = state; // grows as we plan, so balances account for what this run already adds

  // RESUMABLE: every record is checked independently — charge, charge entry, payment, payment entry. A run that
  // died half-way (charge written, payment not; payment written, entry not) is completed by the next run, and a
  // complete run adds nothing. Deterministic ids make double-posting impossible even if two devices run it.
  for (const v of data.visits || []) {
    const cost = toMinor(v.cost);
    const paid = !!v.paid;
    if (cost === null || cost <= 0) {
      if (paid) report.needsReview.push({ type: 'PAID_WITHOUT_AMOUNT', visitId: v.id, patient: v.patient });
      else report.skippedNoAmount++;
      continue;
    }
    const cid = legacyChargeId(v.id);
    const date = v.date || today;
    const foreign = byVisit.get(String(v.id));
    if (foreign && foreign.id !== cid) {
      // billed by the collection flow (or manually): leave its money alone; only flag a disagreement.
      const bal = chargeBalance(foreign.id, working);
      if (bal.net !== cost || (paid && bal.outstanding !== 0)) report.needsReview.push({ type: 'VISIT_DIFFERS_FROM_CHARGE', visitId: v.id, patient: v.patient, chargeId: foreign.id });
      report.alreadyMigrated++;
      continue;
    }
    let charge = byId.get(cid);
    const chargeExisted = !!charge;
    let touched = false;
    if (!charge) {
      charge = {
        id: cid, kind: 'charge', parentId: null, patientId: v.patientId ?? null, visitId: String(v.id), appointmentId: null,
        service: v.type || '', amount: fromMinor(cost), discount: '0.00', netAmount: fromMinor(cost), doctorId: resolveDoctor(data.doctors, v.doctor),
        doctor: v.doctor || '', clinic: v.clinic || '', status: 'posted', serviceDate: date, source: 'LEGACY_VISIT', sourceRef: String(v.id),
        reason: '', createdAt: now.toISOString(), createdBy: SYS
      };
      b.charges.push(charge);
      b.audit.push(buildAudit({ entity: 'charge', entityId: cid, action: 'migrate', by: SYS, newValue: { visitId: v.id, cost: charge.netAmount }, source: 'LEGACY_VISIT', now }));
      working = applyBatch(working, { ...emptyBatch(), charges: [charge] });
      report.chargesCreated++;
      touched = true;
    } else if (chargeBalance(cid, working).net !== cost) {
      report.needsReview.push({ type: 'VISIT_DIFFERS_FROM_CHARGE', visitId: v.id, patient: v.patient, chargeId: cid });
    }
    if (!have(cid)) {
      const ce = entryForCharge(charge, { by: SYS });
      b.entries.push(ce.entry); b.lines.push(...ce.lines);
      if (chargeExisted) report.entriesRepaired++;
      touched = true;
    }
    if (paid) {
      const pid = legacyPaymentId(v.id);
      let pay = payments.find(p => p.id === pid);
      if (!pay) {
        const bal = chargeBalance(cid, working);
        if (bal.netPaid === 0) {
          pay = {
            id: pid, kind: 'payment', patientId: charge.patientId, chargeId: cid, settlementId: null, amount: fromMinor(cost), method: 'legacy',
            accountId: LEGACY_ACCOUNT_ID, toAccountId: null, paymentDate: charge.serviceDate, receiptNo: 'LEG-' + String(v.id), receivedBy: SYS, status: 'posted',
            reversalOf: null, source: 'LEGACY_VISIT', sourceRef: String(v.id), reason: '', notes: 'LEGACY: payment date taken from the visit date; method unknown',
            clinic: charge.clinic, createdAt: now.toISOString(), createdBy: SYS
          };
          b.payments.push(pay);
          working = applyBatch(working, { ...emptyBatch(), payments: [pay] });
          report.paymentsCreated++;
          touched = true;
        } else if (bal.outstanding !== 0) {
          // some other (real) payment already exists and does not cover the visit: don't guess.
          report.needsReview.push({ type: 'PAID_BUT_PARTLY_RECORDED', visitId: v.id, patient: v.patient, chargeId: cid });
        }
      }
      if (pay && !have(pid)) {
        const pe = entryForPayment(pay, { by: SYS });
        b.entries.push(pe.entry); b.lines.push(...pe.lines);
        if (paymentIds.has(pid)) report.entriesRepaired++;
        touched = true;
      }
    }
    if (!touched) report.alreadyMigrated++;
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
  const stateExp = new Map((state.expenses || []).map(x => [String(x.id), x]));
  const stateRec = new Map((state.recurring || []).map(x => [String(x.id), x]));
  for (const e0 of data.expenses || []) {
    // the finance state is authoritative: a row it already holds with the new fields counts as converted even if the caller's list is stale
    const e = stateExp.has(String(e0.id)) && stateExp.get(String(e0.id)).status ? stateExp.get(String(e0.id)) : e0;
    if (e.status) {
      // already converted: if its row made it but the ledger entry did not, complete it (resume)
      if (e.status === 'paid' && !e.reversalOf && e.source === 'LEGACY_EXPENSE' && !have(e.id)) {
        const en = entryForExpense(e, { by: SYS });
        b.entries.push(en.entry); b.lines.push(...en.lines);
        report.entriesRepaired++;
      }
      continue;
    }
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
    if (r.frequency || (stateRec.get(String(r.id)) || {}).frequency) continue;
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
