import test from 'node:test';
import assert from 'node:assert/strict';
import {
  emptyState, emptyBatch, applyBatch, isEmptyBatch, verifyLedger, chargeBalance, planLegacyMigration, planCollection, ledgerTotal, LEDGER,
  legacyChargeId, legacyPaymentId, DEFAULT_ACCOUNT_ID, LEGACY_ACCOUNT_ID
} from '../src/modules/finance/index.js';

const NOW = new Date('2026-10-08T10:00:00Z');
const data = () => ({
  visits: [
    { id: 'v1', patientId: 1, patient: 'A', cost: '300', paid: true, date: '2026-09-01', type: 'كشف', doctor: 'د. أحمد', clinic: 'دمنهور' },
    { id: 'v2', patientId: 2, patient: 'B', cost: '500', paid: false, date: '2026-09-02', type: 'متابعة', doctor: 'د. أحمد', clinic: 'دمنهور' },
    { id: 'v3', patientId: 3, patient: 'C', cost: '150', paid: true, date: '2026-09-03', type: 'كشف', doctor: '', clinic: 'الرحمانية' },
    { id: 'v4', patientId: 4, patient: 'D', cost: '', paid: false, date: '2026-09-04', type: 'كشف', doctor: '', clinic: '' }
  ],
  expenses: [{ id: 11, date: '2026-09-05', category: 'إيجار', amount: '1000', notes: '', clinic: '' }, { id: 12, date: '2026-09-06', category: 'رواتب', amount: '400', notes: '', clinic: 'دمنهور' }],
  recurringExpenses: [{ id: 21, category: 'إيجار', amount: '1000', notes: '', clinic: '' }],
  appointments: [], doctors: [{ id: 1, name: 'د. أحمد', short: 'د. أحمد' }]
});
const full = () => { let s = emptyState(); const r = planLegacyMigration(data(), s, { now: NOW }); return { batch: r.batch, state: applyBatch(s, r.batch), report: r.report }; };
const counts = s => ({ charges: s.charges.length, payments: s.payments.length, entries: s.entries.length, expenses: s.expenses.length });

// Simple deterministic PRNG so the "random partial failure" test is reproducible.
const rng = seed => () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };

test('migration resume: charge exists but payment is missing → payment is created, revenue is NOT duplicated', () => {
  const { batch } = full();
  const partial = applyBatch(emptyState(), { ...emptyBatch(), accounts: batch.accounts, charges: batch.charges }); // died after charges
  const r = planLegacyMigration(data(), partial, { now: NOW });
  assert.equal(r.report.chargesCreated, 0, 'no second charge');
  assert.equal(r.batch.charges.length, 0);
  assert.deepEqual(r.batch.payments.map(p => p.id).sort(), [legacyPaymentId('v1'), legacyPaymentId('v3')].sort());
  const done = applyBatch(partial, r.batch);
  assert.deepEqual(verifyLedger(done.entries, done.lines), []);
  assert.equal(chargeBalance(legacyChargeId('v1'), done).outstanding, 0);
  assert.equal(chargeBalance(legacyChargeId('v2'), done).outstanding, 50000);
  // revenue is exactly the 3 charges, once each
  assert.equal(ledgerTotal(done.entries, done.lines, LEDGER.REVENUE, {}), 95000);
  assert.ok(isEmptyBatch(planLegacyMigration(data(), done, { now: NOW }).batch), 'third run adds nothing');
});

test('migration resume: payment row exists without its ledger entry → entry is added once', () => {
  const { batch } = full();
  const noEntries = applyBatch(emptyState(), { ...emptyBatch(), accounts: batch.accounts, charges: batch.charges, payments: batch.payments, expenses: batch.expenses });
  const r = planLegacyMigration(data(), noEntries, { now: NOW });
  assert.equal(r.batch.charges.length + r.batch.payments.length, 0);
  assert.equal(r.report.entriesRepaired > 0, true);
  const done = applyBatch(noEntries, r.batch);
  assert.deepEqual(verifyLedger(done.entries, done.lines), []);
  assert.equal(done.entries.length, full().state.entries.length);
});

test('migration converges from ANY partial failure and never duplicates money (80 random partial states)', () => {
  const ref = full();
  const rand = rng(7);
  const pick = (rows, p) => rows.filter(() => rand() < p);
  for (let i = 0; i < 80; i++) {
    const b = ref.batch;
    const charges = pick(b.charges, rand());
    const cIds = new Set(charges.map(c => c.id));
    const payments = pick(b.payments.filter(p => cIds.has(p.chargeId)), rand());
    const entries = pick(b.entries, rand()).filter(e => !e.sourceRef || [...cIds].includes(e.sourceRef) || payments.some(p => p.id === e.sourceRef) || b.expenses.some(x => x.id === e.sourceRef));
    const expenses = pick(b.expenses, rand());
    const partial = applyBatch(emptyState(), { ...emptyBatch(), accounts: i % 2 ? b.accounts : [], charges, payments, entries, expenses });
    const acct = partial.accounts.length ? partial : applyBatch(partial, { ...emptyBatch(), accounts: b.accounts });
    const r = planLegacyMigration(data(), acct, { now: NOW });
    const done = applyBatch(acct, r.batch);
    assert.deepEqual(counts(done), counts(ref.state), 'run ' + i + ' converged to the full state');
    assert.deepEqual(verifyLedger(done.entries, done.lines), [], 'run ' + i + ' ledger healthy');
    assert.equal(ledgerTotal(done.entries, done.lines, LEDGER.REVENUE, {}), 95000, 'run ' + i + ' revenue exact');
    assert.equal(new Set(done.charges.map(c => c.id)).size, done.charges.length);
    const again = planLegacyMigration(data(), done, { now: NOW });
    assert.ok(again.batch.charges.length + again.batch.payments.length + again.batch.entries.length + again.batch.expenses.length === 0, 'run ' + i + ' idempotent');
  }
});

test('migration never double-bills a visit already billed by the collection flow (apt-<id> mirror)', () => {
  // collection flow: charge for appointment 77 (source COLLECT_MODAL), then the visit mirror 'apt-77' is written
  let s = applyBatch(emptyState(), { ...emptyBatch(), accounts: [{ id: DEFAULT_ACCOUNT_ID, name: 'Main', type: 'cash', active: true, openingBalance: '0.00', isLegacy: false }] });
  const apt = { id: 77, patientId: 5, patient: 'منى', type: 'كشف', doctor: 'د. أحمد', clinic: 'دمنهور', date: '2026-10-08' };
  s = planCollection(s, { apt, cost: '300', collected: '300', method: 'cash', accountId: DEFAULT_ACCOUNT_ID }, { by: 'sara', role: 'secretary', now: NOW }).state;
  const d = { ...data(), visits: [{ id: 'apt-77', patientId: 5, patient: 'منى', cost: '300', paid: true, date: '2026-10-08', type: 'كشف', doctor: 'د. أحمد', clinic: 'دمنهور' }] };
  const r = planLegacyMigration(d, s, { now: NOW });
  assert.equal(r.batch.charges.length, 0, 'no legacy charge for a visit the collection flow already billed');
  assert.equal(r.batch.payments.length, 0);
  assert.equal(r.report.needsReview.length, 0, 'amounts agree → nothing to review');
  const done = applyBatch(s, r.batch);
  assert.equal(done.charges.filter(c => c.kind === 'charge').length, 1);
});

test('migration flags (does not silently adjust) a visit whose amount differs from its charge', () => {
  const ref = full();
  const d = data(); d.visits[0].cost = '350';
  const r = planLegacyMigration(d, ref.state, { now: NOW });
  assert.equal(r.batch.charges.length, 0);
  assert.ok(r.report.needsReview.some(x => x.type === 'VISIT_DIFFERS_FROM_CHARGE' && x.visitId === 'v1'));
});

test('migration: converted expense without its ledger entry is completed once; unconverted ones still convert', () => {
  const ref = full();
  const converted = ref.batch.expenses[0];
  const s = applyBatch(emptyState(), { ...emptyBatch(), accounts: ref.batch.accounts, expenses: [converted] });
  const d = data(); d.expenses = [converted, d.expenses[1]];
  const r = planLegacyMigration(d, s, { now: NOW });
  assert.equal(r.batch.expenses.length, 1, 'only the unconverted expense is converted');
  assert.equal(r.batch.entries.filter(e => e.type === 'expense').length, 2, 'entry for the converted one + entry for the new one');
  const done = applyBatch(s, r.batch);
  assert.deepEqual(verifyLedger(done.entries, done.lines), []);
});

test('migration: legacy account stays the only account used for legacy money', () => {
  const { batch } = full();
  assert.ok(batch.payments.every(p => p.accountId === LEGACY_ACCOUNT_ID && p.method === 'legacy'));
});

// ---- secretary balances: the server baseline (full ledger) + this device's own rows -------------------------------------------

const secState = (paidMinor, { refunded = 0, accounts = [{ id: 'cash', name: 'Cash', type: 'cash', active: true, isLegacy: false }] } = {}) => ({
  ...emptyState(),
  accounts,
  charges: [{ id: 'chg-1', kind: 'charge', parentId: null, patientId: 1, visitId: 'apt-A1', appointmentId: 'A1', amount: '500.00', discount: '0.00', netAmount: '500.00', status: 'posted', serviceDate: '2026-10-01', source: 'COLLECT_MODAL', sourceRef: 'apt-A1', clinic: 'دمنهور' }],
  serverBalances: { 'chg-1': { paid: paidMinor, refunded } }
});
const apt = { id: 'A1', patientId: 1, date: '2026-10-01', clinic: 'دمنهور', type: 'كشف', doctor: '' };
const SEC = { by: 'sara', role: 'secretary', now: NOW };

test('secretary balance: old + multiple payments counted from the server baseline (the 36h window no longer matters)', () => {
  const st = secState(35000);                                     // 350 paid over three payments, two of them days old
  const b = chargeBalance('chg-1', st);
  assert.deepEqual([b.net, b.paid, b.outstanding], [50000, 35000, 15000]);
  const ok = planCollection(st, { apt, cost: '500', collected: '150', method: 'cash', accountId: 'cash', paymentId: 'pay-1' }, SEC);
  assert.equal(ok.batch.payments.length, 1);
  assert.throws(() => planCollection(st, { apt, cost: '500', collected: '151', method: 'cash', accountId: 'cash', paymentId: 'pay-2' }, SEC), /outstanding/);
});

test('secretary balance: partial collection then the rest; the second collection sees the first (baseline + local rows)', () => {
  let st = secState(20000);
  const a = planCollection(st, { apt, cost: '500', collected: '100', method: 'cash', accountId: 'cash', paymentId: 'pay-a' }, SEC);
  st = a.state;
  assert.equal(chargeBalance('chg-1', st).outstanding, 20000);
  const b = planCollection(st, { apt, cost: '500', collected: '200', method: 'cash', accountId: 'cash', paymentId: 'pay-b' }, SEC);
  assert.equal(chargeBalance('chg-1', b.state).outstanding, 0);
  assert.throws(() => planCollection(b.state, { apt, cost: '500', collected: '1', method: 'cash', accountId: 'cash', paymentId: 'pay-c' }, SEC), /outstanding/);
  assert.equal(b.mirror.paid, true);
});

test('secretary balance: server refunds lower the paid amount; fully paid charge accepts nothing more', () => {
  const st = secState(50000, { refunded: 10000 });                // paid 500, refunded 100 → netPaid 400, outstanding 100
  const b = chargeBalance('chg-1', st);
  assert.deepEqual([b.netPaid, b.outstanding], [40000, 10000]);
  assert.throws(() => planCollection(secState(50000), { apt, cost: '500', collected: '1', method: 'cash', accountId: 'cash', paymentId: 'p' }, SEC), /outstanding/);
});

test('secretary cannot change an already charged fee (server RLS also refuses adjustments)', () => {
  assert.throws(() => planCollection(secState(0), { apt, cost: '400', collected: '0', method: 'cash', accountId: 'cash' }, SEC), /admin/);
});

test('charge id is deterministic per source: two devices / a retry produce the SAME charge row (no second receivable)', () => {
  const mk = () => planCollection({ ...emptyState(), accounts: [{ id: 'cash', name: 'Cash', type: 'cash', active: true, isLegacy: false }] }, { apt, cost: '500', collected: '100', method: 'cash', accountId: 'cash', paymentId: 'pay-x' }, SEC);
  const a = mk(), b = mk();
  assert.equal(a.batch.charges[0].id, 'chg-collect_modal-apt-A1');
  assert.equal(a.batch.charges[0].id, b.batch.charges[0].id);
  assert.equal(a.batch.entries.find(e => e.type === 'charge').id, b.batch.entries.find(e => e.type === 'charge').id);
});

test('every entry the client builds satisfies the server integrity rules (id/sourceRef/type/date/source/clinic/lines)', () => {
  const s = full();
  const { entries } = s.state;
  const bySrc = new Map(entries.map(e => [e.sourceRef, e]));
  assert.equal(bySrc.size, entries.length, 'one entry per origin row');
  for (const e of entries) {
    assert.equal(e.id, 'ent-' + e.sourceRef);
    assert.ok(['charge', 'payment', 'expense'].includes(e.type));
    assert.equal(e.lines.length, 2);
    const dr = e.lines.reduce((x, l) => x + Number(l.debit), 0), cr = e.lines.reduce((x, l) => x + Number(l.credit), 0);
    assert.equal(dr, cr);
  }
  for (const c of s.state.charges) {
    const e = bySrc.get(c.id);
    assert.equal(e.type, 'charge'); assert.equal(e.date, c.serviceDate); assert.equal(e.source, c.source);
    assert.deepEqual(e.lines.map(l => l.ledger).sort(), ['RECEIVABLE', 'REVENUE']);
  }
  for (const p of s.state.payments) {
    const e = bySrc.get(p.id);
    assert.equal(e.type, p.kind); assert.equal(e.date, p.paymentDate); assert.equal(e.source, p.source);
    assert.equal(e.lines.find(l => l.ledger === 'ASSET').accountId, p.accountId);
  }
});
