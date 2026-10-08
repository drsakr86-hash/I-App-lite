import test from 'node:test';
import assert from 'node:assert/strict';
import {
  toMinor, fromMinor, percentOfMinor, emptyState, applyBatch, mergeBatches,
  createCharge, adjustCharge, voidCharge, recordPayment, recordRefund, reversePayment, recordTransfer, chargeBalance, outstandingReceivables,
  createExpense, editExpense, payExpense, reverseExpense, cancelExpense, generateDueExpenses, dueRecurring, recurringDueDates, addInterval,
  createShareRule, resolveRule, previewSettlement, createSettlement, approveSettlement, paySettlement, reverseDoctorPayment, doctorPosition,
  accountBalance, expectedClosing, closeReconciliation, verifyLedger,
  planLegacyMigration, dashboard, revenueByDoctor, revenueByService, revenueByClinic, collectionsByMethod, expensesByCategory,
  LEGACY_ACCOUNT_ID, DEFAULT_ACCOUNT_ID, FinanceError
} from '../src/modules/finance/index.js';

const NOW = new Date('2026-10-08T10:00:00Z');
const ctx = { by: 'admin', role: 'admin', now: NOW };
const mkAcc = (id, extra = {}) => ({ id, name: id, type: 'cash', clinic: '', active: true, openingBalance: '0.00', isLegacy: false, ...extra });
const baseState = () => applyBatch(emptyState(), { accounts: [mkAcc('cash'), mkAcc('bank', { type: 'bank', openingBalance: '1000.00' })] });
const run = (state, batch) => applyBatch(state, batch);
const throwsCode = (fn, code) => assert.throws(fn, e => e instanceof FinanceError && e.code === code, 'expected ' + code);
const charge = (state, over = {}) => createCharge(state, { patientId: 1, service: 'كشف', amount: '500', doctor: 'د. عبدالستار', clinic: 'دمنهور', serviceDate: '2026-10-08', source: 'MANUAL', sourceRef: 'x1', ...over }, ctx);

test('money: parsing is exact (no float drift) and rounds half-up', () => {
  assert.equal(toMinor('350'), 35000);
  assert.equal(toMinor('0.1') + toMinor('0.2'), toMinor('0.3'));
  assert.equal(toMinor('10.005'), 1001);
  assert.equal(toMinor(''), null);
  assert.equal(toMinor('abc'), null);
  assert.equal(fromMinor(35005), '350.05');
  assert.equal(fromMinor(-5), '-0.05');
  assert.equal(percentOfMinor(10000, 12.5), 1250);
});

test('charge creation: posts balanced ledger entry, is idempotent on source+ref', () => {
  let s = baseState();
  const b = charge(s);
  assert.equal(b.charges.length, 1);
  assert.equal(b.charges[0].netAmount, '500.00');
  s = run(s, b);
  assert.deepEqual(verifyLedger(s.entries, s.lines), []);
  assert.equal(chargeBalance(b.charges[0].id, s).outstanding, 50000);
  const again = charge(s);
  assert.equal(again.charges.length, 0, 'same source/sourceRef must not create a second charge');
  throwsCode(() => charge(s, { sourceRef: 'x2', amount: '-5' }), 'AMOUNT_INVALID');
  throwsCode(() => charge(s, { sourceRef: 'x3', discount: '600' }), 'DISCOUNT_INVALID');
});

test('discount reduces net; partial and multiple payments; overpayment rejected', () => {
  let s = baseState();
  const cb = charge(s, { discount: '100' });
  s = run(s, cb);
  const id = cb.charges[0].id;
  assert.equal(chargeBalance(id, s).net, 40000);
  s = run(s, recordPayment(s, { chargeId: id, amount: '150', method: 'cash', accountId: 'cash', source: 'COLLECT_MODAL' }, ctx));
  assert.equal(chargeBalance(id, s).outstanding, 25000);
  s = run(s, recordPayment(s, { chargeId: id, amount: '200', method: 'pos', accountId: 'bank', source: 'COLLECT_MODAL' }, ctx));
  assert.equal(chargeBalance(id, s).outstanding, 5000);
  throwsCode(() => recordPayment(s, { chargeId: id, amount: '60', method: 'cash', accountId: 'cash', source: 'COLLECT_MODAL' }, ctx), 'OVERPAYMENT');
  s = run(s, recordPayment(s, { chargeId: id, amount: '50', method: 'cash', accountId: 'cash', source: 'COLLECT_MODAL' }, ctx));
  assert.equal(chargeBalance(id, s).outstanding, 0);
  assert.equal(accountBalance(s, 'cash'), 20000);
  assert.deepEqual(verifyLedger(s.entries, s.lines), []);
});

test('payment invariants: needs account, method, source, existing charge; double-submit is a no-op', () => {
  let s = baseState();
  const cb = charge(s); s = run(s, cb); const id = cb.charges[0].id;
  const ok = { chargeId: id, amount: '100', method: 'cash', accountId: 'cash', source: 'COLLECT_MODAL' };
  throwsCode(() => recordPayment(s, { ...ok, accountId: undefined }, ctx), 'ACCOUNT_REQUIRED');
  throwsCode(() => recordPayment(s, { ...ok, accountId: 'nope' }, ctx), 'ACCOUNT_REQUIRED');
  throwsCode(() => recordPayment(s, { ...ok, method: 'legacy' }, ctx), 'METHOD_REQUIRED');
  throwsCode(() => recordPayment(s, { ...ok, method: undefined }, ctx), 'METHOD_REQUIRED');
  throwsCode(() => recordPayment(s, { ...ok, source: undefined }, ctx), 'SOURCE_REQUIRED');
  throwsCode(() => recordPayment(s, { ...ok, chargeId: 'ghost' }, ctx), 'CHARGE_NOT_FOUND');
  s = applyBatch(s, { accounts: [mkAcc('off', { active: false })] });
  throwsCode(() => recordPayment(s, { ...ok, accountId: 'off' }, ctx), 'ACCOUNT_INACTIVE');
  const first = recordPayment(s, { ...ok, id: 'pay-1' }, ctx);
  s = run(s, first);
  assert.equal(recordPayment(s, { ...ok, id: 'pay-1' }, ctx).payments.length, 0);
  assert.match(first.payments[0].receiptNo, /^R-20261008-/);
});

test('refund: needs reason, capped by amount paid, reopens the balance', () => {
  let s = baseState();
  const cb = charge(s); s = run(s, cb); const id = cb.charges[0].id;
  s = run(s, recordPayment(s, { chargeId: id, amount: '500', method: 'cash', accountId: 'cash', source: 'COLLECT_MODAL' }, ctx));
  throwsCode(() => recordRefund(s, { chargeId: id, amount: '100', method: 'cash', accountId: 'cash' }, ctx), 'REASON_REQUIRED');
  throwsCode(() => recordRefund(s, { chargeId: id, amount: '600', method: 'cash', accountId: 'cash', reason: 'x' }, ctx), 'REFUND_EXCEEDS_PAID');
  s = run(s, recordRefund(s, { chargeId: id, amount: '120', method: 'cash', accountId: 'cash', reason: 'خدمة لم تتم' }, ctx));
  const b = chargeBalance(id, s);
  assert.equal(b.netPaid, 38000);
  assert.equal(b.outstanding, 12000);
  assert.equal(accountBalance(s, 'cash'), 38000);
  assert.deepEqual(verifyLedger(s.entries, s.lines), []);
});

test('reversal: payment reversed by mirror entry, original untouched, cannot reverse twice', () => {
  let s = baseState();
  const cb = charge(s); s = run(s, cb); const id = cb.charges[0].id;
  const pb = recordPayment(s, { chargeId: id, amount: '500', method: 'cash', accountId: 'cash', source: 'COLLECT_MODAL' }, ctx);
  s = run(s, pb);
  const pid = pb.payments[0].id;
  throwsCode(() => reversePayment(s, { paymentId: pid, reason: '' }, ctx), 'REASON_REQUIRED');
  const rb = reversePayment(s, { paymentId: pid, reason: 'مبلغ خاطئ' }, ctx);
  s = run(s, rb);
  assert.equal(s.payments.find(p => p.id === pid).amount, '500.00', 'original row must be unchanged');
  assert.equal(chargeBalance(id, s).outstanding, 50000);
  assert.equal(accountBalance(s, 'cash'), 0);
  throwsCode(() => reversePayment(s, { paymentId: pid, reason: 'again' }, ctx), 'ALREADY_REVERSED');
  assert.equal(s.audit.filter(a => a.action === 'reverse').length, 1);
  assert.deepEqual(verifyLedger(s.entries, s.lines), []);
});

test('charge adjustment / void: cannot go below paid; void only when nothing is paid', () => {
  let s = baseState();
  const cb = charge(s); s = run(s, cb); const id = cb.charges[0].id;
  s = run(s, adjustCharge(s, { chargeId: id, newNet: '450', reason: 'خصم' }, ctx));
  assert.equal(chargeBalance(id, s).net, 45000);
  s = run(s, recordPayment(s, { chargeId: id, amount: '100', method: 'cash', accountId: 'cash', source: 'COLLECT_MODAL' }, ctx));
  throwsCode(() => adjustCharge(s, { chargeId: id, newNet: '50', reason: 'x' }, ctx), 'BELOW_PAID');
  throwsCode(() => voidCharge(s, { chargeId: id, reason: 'x' }, ctx), 'BELOW_PAID');
  throwsCode(() => adjustCharge(s, { chargeId: id, newNet: '400' }, ctx), 'REASON_REQUIRED');
  const cb2 = charge(s, { sourceRef: 'x9' }); s = run(s, cb2);
  s = run(s, voidCharge(s, { chargeId: cb2.charges[0].id, reason: 'خطأ إدخال' }, ctx));
  assert.equal(chargeBalance(cb2.charges[0].id, s).net, 0);
  assert.deepEqual(verifyLedger(s.entries, s.lines), []);
});

test('expense: pending → pay (account+method required) → ledger; reversal; locks', () => {
  let s = baseState();
  const eb = createExpense(s, { date: '2026-10-05', category: 'إيجار', amount: '3000', clinic: 'دمنهور' }, ctx);
  s = run(s, eb);
  const id = eb.expenses[0].id;
  assert.equal(eb.expenses[0].status, 'pending');
  assert.equal(eb.entries.length, 0, 'a pending expense posts nothing to the ledger');
  s = run(s, editExpense(s, { id, amount: '3200' }, ctx));
  throwsCode(() => payExpense(s, { id, method: 'cash' }, ctx), 'ACCOUNT_REQUIRED');
  throwsCode(() => payExpense(s, { id, accountId: 'bank' }, ctx), 'METHOD_REQUIRED');
  s = run(s, payExpense(s, { id, accountId: 'bank', method: 'bank_transfer', paidAt: '2026-10-08' }, ctx));
  assert.equal(s.expenses.find(e => e.id === id).status, 'paid');
  assert.equal(accountBalance(s, 'bank'), 100000 - 320000);
  assert.equal(payExpense(s, { id, accountId: 'bank', method: 'bank_transfer' }, ctx).expenses.length, 0, 'retry is a no-op');
  throwsCode(() => editExpense(s, { id, amount: '1' }, ctx), 'EXPENSE_LOCKED');
  s = run(s, reverseExpense(s, { id, reason: 'سُدد مرتين' }, ctx));
  assert.equal(accountBalance(s, 'bank'), 100000);
  throwsCode(() => reverseExpense(s, { id, reason: 'again' }, ctx), 'ALREADY_REVERSED');
  const pb = createExpense(s, { date: '2026-10-08', category: 'صيانة', amount: '50', pay: { accountId: 'cash', method: 'cash' } }, ctx);
  s = run(s, pb);
  assert.equal(accountBalance(s, 'cash'), -5000);
  const cb = createExpense(s, { date: '2026-10-08', category: 'أخرى', amount: '5' }, ctx);
  s = run(s, cb);
  s = run(s, cancelExpense(s, { id: cb.expenses[0].id, reason: 'لا حاجة' }, ctx));
  assert.equal(s.expenses.find(e => e.id === cb.expenses[0].id).status, 'cancelled');
  assert.deepEqual(verifyLedger(s.entries, s.lines), []);
});

test('recurring: due by schedule, generated only on request, pending only, no duplicates', () => {
  let s = baseState();
  s = applyBatch(s, { recurring: [{ id: 'r1', category: 'إيجار', amount: '2000', clinic: 'دمنهور', frequency: 'monthly', nextDueDate: '2026-08-01', active: true, endDate: '' }] });
  assert.deepEqual(recurringDueDates(s.recurring[0], '2026-10-08'), ['2026-08-01', '2026-09-01', '2026-10-01']);
  assert.equal(dueRecurring(s, '2026-10-08').length, 3, 'reading due items creates nothing');
  assert.equal(s.expenses.length, 0);
  const b = generateDueExpenses(s, '2026-10-08', ctx);
  assert.equal(b.expenses.length, 3);
  assert.ok(b.expenses.every(e => e.status === 'pending' && e.accountId === null));
  assert.equal(b.entries.length, 0, 'generation must not move money');
  s = run(s, b);
  assert.equal(s.recurring[0].nextDueDate, '2026-11-01');
  assert.equal(generateDueExpenses(s, '2026-10-08', ctx).expenses.length, 0);
  // a second device generating from the pre-generation state yields the SAME ids → upsert, no duplicates
  const other = generateDueExpenses(applyBatch(baseState(), { recurring: [{ ...s.recurring[0], nextDueDate: '2026-08-01' }] }), '2026-10-08', ctx);
  assert.deepEqual(other.expenses.map(e => e.id).sort(), b.expenses.map(e => e.id).sort());
  assert.equal(addInterval('2026-01-31', 'monthly'), '2026-02-28');
  assert.equal(recurringDueDates({ ...s.recurring[0], active: false }, '2026-12-01').length, 0);
});

test('doctor settlement: flexible rules, snapshot allocations, partial payment, reversal, no double settling', () => {
  let s = baseState();
  const mk = (ref, over) => charge(s, { sourceRef: ref, ...over });
  for (const [ref, over] of [['a', { amount: '500' }], ['b', { amount: '1000', service: 'ليزر' }], ['c', { amount: '300', doctor: 'د. آخر', doctorId: 9 }]]) s = run(s, mk(ref, over));
  s = run(s, createShareRule(s, { mode: 'percent', value: 40 }, ctx)); // default
  s = run(s, createShareRule(s, { mode: 'percent', value: 50, service: 'ليزر' }, ctx));
  s = run(s, createShareRule(s, { mode: 'fixed', value: '100', doctor: 'د. عبدالستار', service: 'كشف' }, ctx));
  const charges = s.charges;
  assert.equal(resolveRule(s.rules, charges[0]).mode, 'fixed');
  assert.equal(resolveRule(s.rules, charges[1]).value, '50');
  assert.equal(resolveRule(s.rules, charges[2]).value, '40');
  const q = { doctor: 'د. عبدالستار', periodFrom: '2026-10-01', periodTo: '2026-10-31' };
  const prev = previewSettlement(s, q);
  assert.equal(prev.gross, 150000);
  assert.equal(prev.doctorShare, 10000 + 50000);
  assert.equal(prev.centerShare, 150000 - 60000);
  const sb = createSettlement(s, q, ctx);
  s = run(s, sb);
  const sid = sb.settlements[0].id;
  assert.equal(sb.settlements[0].status, 'draft');
  assert.equal(sb.allocations.length, 2);
  throwsCode(() => createSettlement(s, q, ctx), 'NOTHING_TO_SETTLE');
  throwsCode(() => paySettlement(s, { settlementId: sid, amount: '10', method: 'cash', accountId: 'cash' }, ctx), 'SETTLEMENT_NOT_PAYABLE');
  s = run(s, approveSettlement(s, { id: sid }, ctx));
  s = run(s, createShareRule(s, { mode: 'percent', value: 90 }, ctx)); // later rule change must not alter history
  assert.equal(s.settlements.find(x => x.id === sid).doctorShare, '600.00');
  const p1 = paySettlement(s, { settlementId: sid, amount: '250', method: 'cash', accountId: 'cash' }, ctx);
  s = run(s, p1);
  assert.equal(s.settlements.find(x => x.id === sid).status, 'partial');
  throwsCode(() => paySettlement(s, { settlementId: sid, amount: '400', method: 'cash', accountId: 'cash' }, ctx), 'OVERPAYMENT');
  const pos = doctorPosition(s, { doctor: 'د. عبدالستار' });
  assert.equal(pos.alreadyPaid, 25000);
  assert.equal(pos.outstanding, 35000);
  s = run(s, paySettlement(s, { settlementId: sid, amount: '350', method: 'cash', accountId: 'cash' }, ctx));
  assert.equal(s.settlements.find(x => x.id === sid).status, 'paid');
  s = run(s, reverseDoctorPayment(s, { paymentId: p1.payments[0].id, reason: 'خطأ' }, ctx));
  const after = s.settlements.find(x => x.id === sid);
  assert.equal(after.status, 'partial');
  assert.equal(after.paidAmount, '350.00');
  assert.deepEqual(verifyLedger(s.entries, s.lines), []);
});

test('cash reconciliation: formula, lock, difference booked as adjustment', () => {
  let s = baseState();
  const cb = charge(s); s = run(s, cb); const id = cb.charges[0].id;
  s = run(s, recordPayment(s, { chargeId: id, amount: '500', method: 'cash', accountId: 'cash', source: 'COLLECT_MODAL', paymentDate: '2026-10-08' }, ctx));
  s = run(s, createExpense(s, { date: '2026-10-08', category: 'أخرى', amount: '40', pay: { accountId: 'cash', method: 'cash', paidAt: '2026-10-08' } }, ctx));
  s = run(s, recordTransfer(s, { fromAccountId: 'cash', toAccountId: 'bank', amount: '100', date: '2026-10-08' }, ctx));
  const cb2 = charge(s, { sourceRef: 'y' }); s = run(s, cb2);
  s = run(s, recordPayment(s, { chargeId: cb2.charges[0].id, amount: '100', method: 'cash', accountId: 'cash', source: 'COLLECT_MODAL', paymentDate: '2026-10-08' }, ctx));
  s = run(s, recordRefund(s, { chargeId: cb2.charges[0].id, amount: '30', method: 'cash', accountId: 'cash', reason: 'ر', refundDate: '2026-10-08' }, ctx));
  const r = expectedClosing(s, 'cash', { from: '2026-10-08', to: '2026-10-08' });
  assert.equal(r.opening, 0);
  assert.equal(r.payments, 60000);
  assert.equal(r.expenses, -4000);
  assert.equal(r.refunds, -3000);
  assert.equal(r.transfersOut, -10000);
  assert.equal(r.expectedClosing, 60000 - 4000 - 3000 - 10000);
  assert.equal(r.expectedClosing, accountBalance(s, 'cash'), 'period formula must agree with the ledger balance');
  const bank = expectedClosing(s, 'bank', { from: '2026-10-08', to: '2026-10-08' });
  assert.equal(bank.opening, 100000);
  assert.equal(bank.transfersIn, 10000);
  throwsCode(() => closeReconciliation(s, { accountId: 'cash', periodFrom: '2026-10-08', periodTo: '2026-10-08', counted: '500' }, ctx), 'REASON_REQUIRED');
  const cl = closeReconciliation(s, { accountId: 'cash', periodFrom: '2026-10-08', periodTo: '2026-10-08', counted: '410', note: 'عجز في الدرج' }, ctx);
  assert.equal(cl.reconciliations[0].difference, '-20.00');
  s = run(s, cl);
  assert.equal(accountBalance(s, 'cash'), 41000);
  throwsCode(() => recordPayment(s, { chargeId: id, amount: '1', method: 'cash', accountId: 'cash', source: 'X', paymentDate: '2026-10-08' }, ctx), 'PERIOD_CLOSED'); // closed period is rejected before anything else
  const cb3 = charge(s, { sourceRef: 'z' }); s = run(s, cb3);
  throwsCode(() => recordPayment(s, { chargeId: cb3.charges[0].id, amount: '5', method: 'cash', accountId: 'cash', source: 'X', paymentDate: '2026-10-07' }, ctx), 'PERIOD_CLOSED');
  throwsCode(() => closeReconciliation(s, { accountId: 'cash', periodFrom: '2026-10-08', periodTo: '2026-10-09', counted: '500' }, ctx), 'PERIOD_CLOSED');
  assert.deepEqual(verifyLedger(s.entries, s.lines), []);
});

test('legacy migration: traceable, no invented methods, never counts unpaid as paid', () => {
  const data = {
    visits: [
      { id: 'v1', patientId: 1, patient: 'أ', date: '2026-09-01', type: 'كشف', doctor: 'د. عبدالستار', clinic: 'دمنهور', cost: '500', paid: true },
      { id: 'v2', patientId: 2, patient: 'ب', date: '2026-09-02', type: 'كشف', doctor: 'د. عبدالستار', clinic: '', cost: '500', paid: false },
      { id: 'v3', patientId: 3, patient: 'ج', date: '2026-09-03', type: 'متابعة', doctor: 'x', clinic: '', cost: '', paid: false },
      { id: 'v4', patientId: 4, patient: 'د', date: '2026-09-04', type: 'متابعة', doctor: 'x', clinic: '', cost: '0', paid: true },
      { id: 'apt-7', patientId: 5, patient: 'هـ', date: '2026-09-05', type: 'كشف', doctor: 'x', clinic: 'الرحمانية', cost: '250.50', paid: true }
    ],
    appointments: [{ id: 7, cost: '250.50', paid: true, patient: 'هـ' }, { id: 8, cost: '300', paid: true, patient: 'و' }],
    expenses: [{ id: 'e1', date: '2026-09-10', category: 'إيجار', amount: '3000', notes: '', clinic: 'دمنهور' }],
    recurringExpenses: [{ id: 'r1', category: 'إيجار', amount: '3000', notes: '', clinic: '' }],
    doctors: [{ id: 11, short: 'د. عبدالستار', name: 'د. عبدالستار صقر' }]
  };
  const { batch, report } = planLegacyMigration(data, emptyState(), { now: NOW });
  assert.equal(report.chargesCreated, 3);
  assert.equal(report.paymentsCreated, 2);
  assert.equal(report.skippedNoAmount, 1);
  assert.deepEqual(report.needsReview.map(x => x.type).sort(), ['APPOINTMENT_FEE_WITHOUT_VISIT', 'PAID_WITHOUT_AMOUNT']);
  assert.ok(batch.payments.every(p => p.method === 'legacy' && p.accountId === LEGACY_ACCOUNT_ID && p.source === 'LEGACY_VISIT'));
  assert.ok(batch.charges.every(c => c.source === 'LEGACY_VISIT' && data.visits.some(v => v.id === c.sourceRef && c.visitId === v.id)));
  assert.equal(batch.charges.find(c => c.sourceRef === 'v1').doctorId, 11);
  assert.ok(batch.accounts.some(a => a.id === LEGACY_ACCOUNT_ID && a.isLegacy) && batch.accounts.some(a => a.id === DEFAULT_ACCOUNT_ID));
  const s = applyBatch(emptyState(), batch);
  assert.equal(chargeBalance('chg-legacy-visit-v1', s).outstanding, 0);
  assert.equal(chargeBalance('chg-legacy-visit-v2', s).outstanding, 50000, 'unpaid visit stays outstanding');
  assert.equal(outstandingReceivables(s).length, 1);
  assert.equal(accountBalance(s, LEGACY_ACCOUNT_ID), 50000 + 25050 - 300000);
  assert.equal(s.expenses[0].status, 'paid');
  assert.equal(s.expenses[0].accountId, LEGACY_ACCOUNT_ID);
  assert.equal(s.recurring[0].frequency, 'monthly');
  assert.equal(s.recurring[0].nextDueDate, '2026-10-01');
  assert.equal(s.expenses.length, 1, 'recurring templates are never back-filled');
  assert.deepEqual(verifyLedger(s.entries, s.lines), []);
});

test('legacy migration is idempotent: second run (and a partial prior run) add nothing', () => {
  const data = {
    visits: [{ id: 'v1', patientId: 1, date: '2026-09-01', type: 'كشف', doctor: 'x', clinic: '', cost: '500', paid: true }, { id: 'v2', patientId: 2, date: '2026-09-02', type: 'كشف', doctor: 'x', clinic: '', cost: '200', paid: false }],
    expenses: [{ id: 'e1', date: '2026-09-10', category: 'إيجار', amount: '30', notes: '', clinic: '' }],
    recurringExpenses: [{ id: 'r1', category: 'إيجار', amount: '30' }], appointments: [], doctors: []
  };
  const first = planLegacyMigration(data, emptyState(), { now: NOW });
  const s1 = applyBatch(emptyState(), first.batch);
  // the migrated expense/recurring rows come back from sync with their new fields
  const data2 = { ...data, expenses: s1.expenses, recurringExpenses: s1.recurring };
  const second = planLegacyMigration(data2, s1, { now: NOW });
  for (const [k, rows] of Object.entries(second.batch)) assert.equal(rows.length, 0, `second run must add no ${k}`);
  assert.equal(second.report.alreadyMigrated, 2);
  const s2 = applyBatch(s1, second.batch);
  assert.equal(s2.charges.length, 2); assert.equal(s2.payments.length, 1);
  // same batch applied twice is still the same state (upsert by id)
  const s3 = applyBatch(s1, first.batch);
  assert.equal(s3.charges.length, 2); assert.equal(s3.entries.length, s1.entries.length); assert.equal(s3.lines.length, s1.lines.length);
  // partial prior run (charge synced, payment not): only the missing payment is added
  const partial = applyBatch(emptyState(), { accounts: first.batch.accounts, charges: first.batch.charges, entries: first.batch.entries.filter(e => e.type === 'charge'), lines: first.batch.lines.filter(l => l.ledger !== 'ASSET') });
  const heal = planLegacyMigration(data, partial, { now: NOW });
  assert.equal(heal.batch.charges.length, 0);
});

test('multi-clinic and reports come from the finance domain, not visits', () => {
  let s = baseState();
  const rows = [['a', 'دمنهور', 'د. عبدالستار', 'كشف', '500'], ['b', 'الرحمانية', 'د. عبدالستار', 'ليزر', '1000'], ['c', 'دمنهور', 'د. آخر', 'كشف', '300']];
  for (const [ref, clinic, doctor, service, amount] of rows) s = run(s, charge(s, { sourceRef: ref, clinic, doctor, service, amount }));
  const ids = s.charges.map(c => c.id);
  s = run(s, recordPayment(s, { chargeId: ids[0], amount: '500', method: 'cash', accountId: 'cash', source: 'COLLECT_MODAL', paymentDate: '2026-10-08' }, ctx));
  s = run(s, recordPayment(s, { chargeId: ids[1], amount: '400', method: 'pos', accountId: 'bank', source: 'COLLECT_MODAL', paymentDate: '2026-10-08' }, ctx));
  s = run(s, createExpense(s, { date: '2026-10-08', category: 'صيانة', amount: '100', clinic: 'الرحمانية', pay: { accountId: 'cash', method: 'cash', paidAt: '2026-10-08' } }, ctx));
  const all = { from: '2026-10-08', to: '2026-10-08' };
  const d = dashboard(s, all);
  assert.deepEqual([d.revenue, d.collections, d.expenses, d.net, d.receivables], [180000, 90000, 10000, 80000, 90000]);
  const dm = dashboard(s, { ...all, clinic: 'دمنهور' });
  assert.deepEqual([dm.revenue, dm.collections, dm.expenses, dm.receivables], [80000, 50000, 0, 30000]);
  const dr = dashboard(s, { ...all, clinic: 'الرحمانية' });
  assert.deepEqual([dr.revenue, dr.collections, dr.expenses, dr.receivables], [100000, 40000, 10000, 60000]);
  assert.equal(dashboard(s, { ...all, doctor: 'د. آخر' }).revenue, 30000);
  assert.deepEqual(revenueByClinic(s, all).map(r => [r.key, r.minor]), [['الرحمانية', 100000], ['دمنهور', 80000]]);
  assert.deepEqual(revenueByDoctor(s, all).map(r => [r.key, r.minor]), [['د. عبدالستار', 150000], ['د. آخر', 30000]]);
  assert.deepEqual(revenueByService(s, all).map(r => r.key), ['ليزر', 'كشف']);
  assert.deepEqual(collectionsByMethod(s, { ...all, accountId: 'bank' }).map(r => [r.key, r.minor]), [['pos', 40000]]);
  assert.deepEqual(expensesByCategory(s, all).map(r => [r.key, r.minor]), [['صيانة', 10000]]);
  assert.equal(dashboard(s, { from: '2026-10-09', to: '2026-10-09' }).revenue, 0);
  // reversal shows up in collections
  s = run(s, reversePayment(s, { paymentId: s.payments[0].id, reason: 'x', date: '2026-10-08' }, ctx));
  assert.equal(dashboard(s, all).collections, 40000);
});

test('mergeBatches / applyBatch never drop rows', () => {
  const a = { charges: [{ id: '1' }], payments: [] };
  const m = mergeBatches(a, { charges: [{ id: '2' }] });
  const s = applyBatch(applyBatch(emptyState(), a), m);
  assert.deepEqual(s.charges.map(c => c.id).sort(), ['1', '2']);
});
