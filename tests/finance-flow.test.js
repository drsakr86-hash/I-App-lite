import test from 'node:test';
import assert from 'node:assert/strict';
import {
  emptyState, applyBatch, verifyLedger, chargeBalance, createCharge, recordPayment, planCollection, collectionSnapshot, findChargeForApt,
  missingEntries, planLegacyMigration, selectableAccounts, defaultAccountFor, createAccountBatch, FinanceError, DEFAULT_ACCOUNT_ID, LEGACY_ACCOUNT_ID, isEmptyBatch
} from '../src/modules/finance/index.js';
import { can, canDo, FINANCE_PERMISSIONS, PERMISSIONS } from '../src/app/permissions.js';
import { expenseListModel, healthModel, isSetUp } from '../src/screens/accounting/view-model.js';

const NOW = new Date('2026-10-08T10:00:00Z');
const admin = { by: 'admin', role: 'admin', now: NOW };
const sec = { by: 'sara', role: 'secretary', now: NOW };
const acc = (id, extra = {}) => ({ id, name: id, type: 'cash', clinic: '', active: true, openingBalance: '0.00', isLegacy: false, ...extra });
const base = () => applyBatch(emptyState(), { accounts: [acc(DEFAULT_ACCOUNT_ID), acc('pos1', { type: 'pos' })] });
const apt = { id: 77, patientId: 5, patient: 'منى', type: 'كشف', doctor: 'د. أحمد', clinic: 'دمنهور', date: '2026-10-08' };
const code = (fn, c) => assert.throws(fn, e => e instanceof FinanceError && e.code === c, 'expected ' + c);

test('collection: fee + partial payment, then the rest — balances, mirror and ledger stay consistent', () => {
  let s = base();
  const p1 = planCollection(s, { apt, cost: '300', collected: '100', method: 'cash', accountId: DEFAULT_ACCOUNT_ID, paymentId: 'pay-a' }, sec);
  s = p1.state;
  assert.deepEqual(p1.mirror, { cost: '300', paid: false });
  assert.equal(chargeBalance(p1.chargeId, s).outstanding, 20000);
  assert.equal(p1.batch.charges.length, 1);
  assert.equal(p1.batch.payments.length, 1);
  const snap = collectionSnapshot(s, apt);
  assert.equal(snap.paid, 10000);
  assert.equal(snap.outstanding, 20000);
  const p2 = planCollection(s, { apt, cost: '300', collected: '200', method: 'pos', accountId: 'pos1', paymentId: 'pay-b' }, sec);
  s = p2.state;
  assert.deepEqual(p2.mirror, { cost: '300', paid: true });
  assert.equal(p2.batch.charges.length, 0, 'same fee → no new charge or adjustment');
  assert.deepEqual(verifyLedger(s.entries, s.lines), []);
});

test('collection: retry with the same paymentId posts nothing twice', () => {
  let s = base();
  const a = planCollection(s, { apt, cost: '300', collected: '300', method: 'cash', accountId: DEFAULT_ACCOUNT_ID, paymentId: 'pay-x' }, sec);
  s = a.state;
  const again = planCollection(s, { apt, cost: '300', collected: '300', method: 'cash', accountId: DEFAULT_ACCOUNT_ID, paymentId: 'pay-x' }, sec);
  assert.ok(isEmptyBatch(again.batch));
});

test('collection: secretary cannot change an existing fee (matches RLS); admin can, as an adjustment', () => {
  let s = base();
  s = planCollection(s, { apt, cost: '300', collected: '0', method: 'cash', accountId: DEFAULT_ACCOUNT_ID }, sec).state;
  code(() => planCollection(s, { apt, cost: '250', collected: '0', method: 'cash', accountId: DEFAULT_ACCOUNT_ID }, sec), 'ADJUST_FORBIDDEN');
  const r = planCollection(s, { apt, cost: '250', collected: '0', method: 'cash', accountId: DEFAULT_ACCOUNT_ID, reason: 'خصم' }, admin);
  assert.equal(r.batch.charges[0].kind, 'adjustment');
  assert.deepEqual(r.mirror, { cost: '250', paid: false });
});

test('collection: guards — overpayment, collecting with no fee, unknown account/method', () => {
  const s = base();
  code(() => planCollection(s, { apt, cost: '100', collected: '150', method: 'cash', accountId: DEFAULT_ACCOUNT_ID }, sec), 'OVERPAYMENT');
  code(() => planCollection(s, { apt, cost: '', collected: '50', method: 'cash', accountId: DEFAULT_ACCOUNT_ID }, sec), 'CHARGE_NOT_FOUND');
  code(() => planCollection(s, { apt, cost: '100', collected: '50', method: 'cash', accountId: 'nope' }, sec), 'ACCOUNT_REQUIRED');
  code(() => planCollection(s, { apt, cost: '100', collected: '50', method: 'barter', accountId: DEFAULT_ACCOUNT_ID }, sec), 'METHOD_REQUIRED');
});

test('collection: fee only (nothing collected) creates a receivable and no payment', () => {
  const r = planCollection(base(), { apt, cost: '400', collected: '', method: 'cash', accountId: DEFAULT_ACCOUNT_ID }, sec);
  assert.equal(r.batch.payments.length, 0);
  assert.deepEqual(r.mirror, { cost: '400', paid: false });
});

test('collection reuses the charge migrated from a legacy visit (no double revenue)', () => {
  const data = { visits: [{ id: 'apt-77', patientId: 5, patient: 'منى', cost: '300', paid: false, date: '2026-10-08', doctor: 'د. أحمد', clinic: 'دمنهور', type: 'كشف' }], expenses: [], recurringExpenses: [], appointments: [], doctors: [] };
  let s = emptyState();
  s = applyBatch(s, planLegacyMigration(data, s, { now: NOW }).batch);
  assert.ok(findChargeForApt(s, apt), 'legacy charge is found through apt-<id>');
  const r = planCollection(s, { apt, cost: '300', collected: '300', method: 'cash', accountId: DEFAULT_ACCOUNT_ID }, sec);
  assert.equal(r.batch.charges.length, 0);
  assert.deepEqual(r.mirror, { cost: '300', paid: true });
});

test('repair: a payment without its ledger entry is healed with deterministic ids, twice is a no-op', () => {
  let s = base();
  const c = createCharge(s, { patientId: 1, service: 'كشف', amount: '200', serviceDate: '2026-10-08', source: 'MANUAL', sourceRef: 'r1' }, admin);
  s = applyBatch(s, c);
  const p = recordPayment(s, { chargeId: c.charges[0].id, amount: '200', method: 'cash', accountId: DEFAULT_ACCOUNT_ID, source: 'MANUAL' }, admin);
  // simulate the offline half-commit: payment row arrived, entry did not
  const half = applyBatch(s, { ...p, entries: [], lines: [] });
  const miss = missingEntries(half, admin);
  assert.equal(miss.entries.length, 1);
  const healed = applyBatch(half, miss);
  assert.deepEqual(verifyLedger(healed.entries, healed.lines), []);
  assert.ok(isEmptyBatch(missingEntries(healed, admin)));
  assert.equal(missingEntries(half, admin).entries[0].id, miss.entries[0].id, 'same id on every device');
});

test('accounts: selectable excludes legacy/inactive; default follows the method; creation validates', () => {
  const s = applyBatch(base(), { accounts: [acc(LEGACY_ACCOUNT_ID, { isLegacy: true }), acc('old', { active: false })] });
  assert.deepEqual(selectableAccounts(s.accounts).map(a => a.id).sort(), [DEFAULT_ACCOUNT_ID, 'pos1']);
  assert.equal(defaultAccountFor(s.accounts, 'pos').id, 'pos1');
  assert.equal(defaultAccountFor(s.accounts, 'wallet').id, DEFAULT_ACCOUNT_ID);
  assert.equal(isSetUp(emptyState()), false);
  assert.equal(isSetUp(s), true);
  const b = createAccountBatch({ name: ' Bank ', type: 'bank', openingBalance: '1000' }, admin);
  assert.equal(b.accounts[0].name, 'Bank');
  assert.equal(b.accounts[0].openingBalance, '1000.00');
  assert.equal(b.audit.length, 1);
  code(() => createAccountBatch({ name: '', type: 'cash' }, admin), 'ACCOUNT_REQUIRED');
  code(() => createAccountBatch({ name: 'x', type: 'crypto' }, admin), 'ACCOUNT_REQUIRED');
});

test('screen view-models: expense list flags reversed rows; health reports missing entries', () => {
  const exps = [
    { id: 'e1', date: '2026-10-01', category: 'إيجار', amount: '100.00', status: 'paid' },
    { id: 'e1r', date: '2026-10-02', category: 'إيجار', amount: '100.00', status: 'paid', reversalOf: 'e1' },
    { id: 'e2', date: '2026-09-01', category: 'رواتب', amount: '50.00', status: 'pending' }
  ];
  const s = applyBatch(base(), { expenses: exps });
  const list = expenseListModel(s, { from: '2026-10-01', to: '2026-10-31', clinic: '' });
  assert.deepEqual(list.map(e => [e.id, e._status]), [['e1r', 'reversal'], ['e1', 'reversed']]);
  const withPaid = applyBatch(base(), { expenses: [exps[0]] });
  assert.equal(healthModel(withPaid).missing, 1);
  assert.equal(healthModel(withPaid).ok, false);
  assert.equal(healthModel(base()).ok, true);
});

test('permissions: every finance permission is explicit; only admin has all; doctor/employee none; secretary is controlled', () => {
  for (const p of FINANCE_PERMISSIONS) {
    assert.equal(canDo('admin', p), true, 'admin ' + p);
    assert.equal(canDo('doctor', p), false, 'doctor ' + p);
    assert.equal(canDo('employee', p), false, 'employee ' + p);
  }
  const allowedForSecretary = FINANCE_PERMISSIONS.filter(p => canDo('secretary', p)).sort();
  assert.deepEqual(allowedForSecretary, ['cash_accounts.read', 'payments.create', 'payments.read']);
  assert.equal(canDo('secretary', 'payments.reverse'), false);
  assert.equal(can('secretary', 'expenses', 'read'), false);
  assert.equal(canDo('ghost', 'payments.read'), false);
  assert.equal(canDo('admin', 'nodot'), false);
  assert.ok(PERMISSIONS.admin.accounting.includes('*'));
});
