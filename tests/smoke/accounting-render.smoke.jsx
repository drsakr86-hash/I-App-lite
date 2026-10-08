// Render smoke test: mounts the real Accounting screen (every tab, set-up and not set-up) and the
// finance-mode CollectModal with a mocked Supabase client holding domain-generated rows.
// Run with:  npm run test:smoke:accounting
import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';

const store = new Map();
globalThis.localStorage = { getItem: k => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: k => store.delete(k), get length() { return store.size; }, key: i => [...store.keys()][i] ?? null };
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
globalThis.window = globalThis.window || { __iappSyncInit: true };
globalThis.window.IAppModules = { auth: { ensureSession: async () => ({ ok: true }) } };

const fin = await import('../../src/modules/finance/index.js');
const { ROW_TABLES } = await import('../../src/modules/sync/row-tables.js');

const NOW = new Date();
const today = NOW.toISOString().slice(0, 10);
const ctx = { by: 'admin', role: 'admin', now: NOW };
let s = fin.emptyState();
const rows = {};
const withData = process.argv[2] !== 'empty';
if (withData) {
  s = fin.applyBatch(s, { accounts: [{ id: fin.DEFAULT_ACCOUNT_ID, name: 'Main cashbox', type: 'cash', clinic: '', active: true, openingBalance: '0.00', isLegacy: false }] });
  const c = fin.createCharge(s, { patientId: 1, service: 'كشف', amount: '300', doctor: 'د. أحمد', doctorId: 1, clinic: 'دمنهور', serviceDate: today, source: 'MANUAL', sourceRef: 'a' }, ctx);
  s = fin.applyBatch(s, c);
  s = fin.applyBatch(s, fin.recordPayment(s, { chargeId: c.charges[0].id, amount: '100', method: 'cash', accountId: fin.DEFAULT_ACCOUNT_ID, source: 'MANUAL' }, ctx));
  s = fin.applyBatch(s, fin.createExpense(s, { date: today, category: 'إيجار', amount: '50', pay: { accountId: fin.DEFAULT_ACCOUNT_ID, method: 'cash' } }, ctx));
  s = fin.applyBatch(s, fin.createExpense(s, { date: today, category: 'رواتب', amount: '70' }, ctx));
  s = fin.applyBatch(s, fin.createShareRule(s, { doctorId: 1, doctor: 'د. أحمد', mode: 'percent', value: 40 }, ctx));
}
const tableOf = { iapp_fin_accounts: 'accounts', iapp_charges: 'charges', iapp_payments: 'payments', iapp_accounting_entries: 'entries', iapp_doctor_share_rules: 'rules', iapp_doctor_settlements: 'settlements', iapp_revenue_allocations: 'allocations', iapp_cash_reconciliations: 'reconciliations', iapp_fin_audit: 'audit', iapp_expenses: 'expenses', iapp_recurring_expenses: 'recurring' };
for (const [key, name] of Object.entries(tableOf)) rows[ROW_TABLES[key].table] = (s[name] || []).map(ROW_TABLES[key].toRow);
const b = table => { const x = { select: () => x, eq: () => x, order: () => x, range: () => x, upsert: () => x, delete: () => x, abortSignal: () => x, retry: () => x, then: (r, j) => Promise.resolve({ data: rows[table] || [], error: null }).then(r, j) }; return x; };
globalThis.__IAppSupabaseClient = { from: b, channel: () => { const c = { on: () => c, subscribe: () => c }; return c; }, removeChannel() {} };

const { default: Accounting } = await import('../../src/screens/Accounting.jsx');
const { CollectModal } = await import('../../src/components/forms/index.js');
const wait = ms => new Promise(r => setTimeout(r, ms));
const text = n => JSON.stringify(n.toJSON());

const props = { visits: [], expenses: [], recurringExpenses: [], appointments: [], doctors: [{ id: 1, name: 'د. أحمد', isPrimary: true }], clinic: {}, session: { name: 'admin', role: 'admin' } };
let r;
await act(async () => { r = TestRenderer.create(<Accounting {...props} />); await wait(50); });
const out = [];
if (!withData) {
  if (!/g8\.|الكشف|الترحيل|المالي|Financial|migrat/i.test(text(r))) throw new Error('setup panel not rendered');
  console.log('accounting (not set up): ok');
} else {
  for (const label of ['نظرة عامة', 'المصروفات', 'الأطباء', 'الخزينة', 'الإعداد والمراجعة']) {
    const tab = r.root.findAll(n => n.props && n.props.onClick && n.children && n.children.includes(label))[0];
    if (!tab) throw new Error('tab not found: ' + label);
    await act(async () => { tab.props.onClick(); await wait(10); });
    out.push(label + ':' + text(r).length);
  }
  console.log('accounting tabs: ok', out.join(' '));
  if (!/Main cashbox/.test(text(r)) && !/المصروفات|الإعداد/.test(text(r))) throw new Error('unexpected content');
}
const apt = { id: 1, patient: 'منى', type: 'كشف', cost: '', paid: false };
let m;
const accounts = [{ id: 'a1', name: 'Cash', type: 'cash' }, { id: 'a2', name: 'POS', type: 'pos' }];
await act(async () => { m = TestRenderer.create(<CollectModal apt={apt} prices={[{ name: 'كشف', price: 300 }]} finance={{ accounts, snapshot: { charge: null, fee: 0, paid: 0, outstanding: 0 } }} onSave={() => {}} onClose={() => {}} />); });
if (!/300/.test(text(m))) throw new Error('finance collect modal did not prefill the price');
let legacy;
await act(async () => { legacy = TestRenderer.create(<CollectModal apt={apt} prices={[]} onSave={() => {}} onClose={() => {}} />); });
console.log('collect modal (finance + legacy): ok');
process.exit(0);
