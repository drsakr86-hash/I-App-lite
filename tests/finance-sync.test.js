import test from 'node:test';
import assert from 'node:assert/strict';
import { ROW_TABLES, rowList, rowUpsert, rowDelete, rowMutate } from '../src/modules/sync/row-tables.js';
import { FINANCE_ROW_TABLES } from '../src/modules/sync/finance-tables.js';
import { BACKUP_KEYS, SyncStore } from '../src/modules/sync/engine.js';
import { FIN_KEYS } from '../src/modules/finance/constants.js';
import { upsertById, COMMIT_ORDER, SCOPES } from '../src/modules/finance/store.js';

function makeLocalStorage() {
  const store = new Map();
  return { getItem: k => (store.has(k) ? store.get(k) : null), setItem: (k, v) => { store.set(k, String(v)); }, removeItem: k => { store.delete(k); }, get length() { return store.size; }, key: i => Array.from(store.keys())[i] ?? null };
}
globalThis.localStorage = makeLocalStorage();
// ensureAuthed() reads window.IAppModules.auth (set AFTER the imports so wiring.js starts no timers).
globalThis.window = globalThis.window || {};
globalThis.window.IAppModules = { auth: { ensureSession: async () => ({ ok: true }) } };

// Chainable fake PostgREST builder. `script(call)` decides the result of the terminal retry().
let calls = [];
let script = () => ({ data: [], error: null });
const builder = (table, op) => {
  const rec = { table, op, args: [], ranges: [], opts: null, payload: null };
  calls.push(rec);
  const b = {
    select: () => b, order: () => b, eq: () => b, abortSignal: () => b,
    range: (a, z) => { rec.ranges.push([a, z]); return b; },
    retry: () => Promise.resolve(script(rec))
  };
  return b;
};
globalThis.__IAppSupabaseClient = {
  from: table => ({
    select: () => builder(table, 'select'),
    insert: payload => { const b = builder(table, 'insert'); calls[calls.length - 1].payload = payload; return b; },
    upsert: (payload, opts) => { const b = builder(table, 'upsert'); calls[calls.length - 1].payload = payload; calls[calls.length - 1].opts = opts; return b; },
    delete: () => builder(table, 'delete')
  })
};
test.beforeEach(() => { calls = []; script = () => ({ data: [], error: null }); globalThis.localStorage = makeLocalStorage(); SyncStore.set({ reachable: null }); });

const KEYS = Object.values(FIN_KEYS).filter(k => k !== FIN_KEYS.lines);

test('finance tables: the ledger-lines table is NOT synced from the client; every other finance key is', () => {
  assert.ok(!(FIN_KEYS.lines in ROW_TABLES));
  for (const k of KEYS) assert.ok(ROW_TABLES[k], k);
  assert.deepEqual(Object.keys(FINANCE_ROW_TABLES).sort(), [...KEYS].sort());
});

test('append-only flags: money/ledger/audit tables are insertOnly+noDelete; mutable ones are only noDelete', () => {
  for (const k of [FIN_KEYS.charges, FIN_KEYS.payments, FIN_KEYS.entries, FIN_KEYS.allocations, FIN_KEYS.reconciliations, FIN_KEYS.audit]) {
    assert.equal(ROW_TABLES[k].insertOnly, true, k);
    assert.equal(ROW_TABLES[k].noDelete, true, k);
  }
  for (const k of [FIN_KEYS.accounts, FIN_KEYS.rules, FIN_KEYS.settlements]) {
    assert.equal(!!ROW_TABLES[k].insertOnly, false, k);
    assert.equal(ROW_TABLES[k].noDelete, true, k);
  }
});

test('mappers round-trip: payment, charge, entry (embedded lines), settlement', () => {
  const pay = { id: 'p1', kind: 'payment', patientId: 5, chargeId: 'c1', settlementId: null, amount: '150.50', method: 'cash', accountId: 'a1', toAccountId: null, paymentDate: '2026-10-08', receiptNo: 'R1', receivedBy: 'sara', status: 'posted', reversalOf: null, origKind: null, source: 'COLLECT_MODAL', sourceRef: null, reason: '', notes: '', clinic: 'دمنهور', createdAt: '2026-10-08T10:00:00.000Z', createdBy: 'sara' };
  const row = ROW_TABLES[FIN_KEYS.payments].toRow(pay);
  assert.equal(row.amount, '150.50');
  assert.equal(row.patient_id, 5);
  assert.equal(row.settlement_id, null);
  const back = ROW_TABLES[FIN_KEYS.payments].fromRow(row);
  assert.equal(back.amount, '150.50');
  assert.equal(back.chargeId, 'c1');
  const lines = [{ id: 'l1', entryId: 'ent-p1', ledger: 'ASSET', accountId: 'a1', debit: '150.50', credit: '0.00' }];
  const ent = ROW_TABLES[FIN_KEYS.entries].toRow({ id: 'ent-p1', date: '2026-10-08', type: 'payment', source: 'COLLECT_MODAL', sourceRef: 'p1', memo: '', status: 'posted', clinic: '', lines, createdBy: 'sara' });
  assert.deepEqual(ent.lines, lines);
  assert.deepEqual(ROW_TABLES[FIN_KEYS.entries].fromRow(ent).lines, lines);
  assert.equal(ROW_TABLES[FIN_KEYS.settlements].fromRow({ id: 's1', do_not_exist: 1, doctor_share: 12.5 }).doctorShare, '12.50');
});

test('toRow omits created_at when absent so the DB default applies (stable ts when present)', () => {
  assert.equal('created_at' in ROW_TABLES[FIN_KEYS.charges].toRow({ id: 'c1' }), false);
  assert.equal(ROW_TABLES[FIN_KEYS.charges].toRow({ id: 'c1', createdAt: '2026-01-01T00:00:00.000Z' }).created_at, '2026-01-01T00:00:00.000Z');
});

test('legacy expense/recurring rows serialise EXACTLY as before when the new fields are absent', () => {
  const exp = ROW_TABLES.iapp_expenses.toRow({ id: 9, date: '2026-01-01', category: 'إيجار', amount: '500', notes: '', clinic: '' });
  assert.deepEqual(Object.keys(exp).sort(), ['amount', 'category', 'clinic', 'date', 'id', 'notes', 'recurring_id', 'updated_at'].sort());
  const rec = ROW_TABLES.iapp_recurring_expenses.toRow({ id: 3, category: 'إيجار', amount: '500', notes: '', clinic: '' });
  assert.ok(!('frequency' in rec) && !('account_id' in rec) && !('active' in rec));
  const full = ROW_TABLES.iapp_expenses.toRow({ id: 'e1', date: '2026-10-01', category: 'إيجار', amount: '500.00', notes: '', clinic: '', status: 'paid', accountId: 'a1', paymentMethod: 'cash', paidAt: '2026-10-01' });
  assert.equal(full.status, 'paid');
  assert.equal(full.account_id, 'a1');
  assert.equal(ROW_TABLES.iapp_expenses.fromRow({ id: 'e1', date: '2026-10-01', category: 'x', amount: 5, status: 'paid', account_id: 'a1' }).accountId, 'a1');
});

test('rowList pages finance tables past the 1000-row PostgREST cap', async () => {
  const mk = (from, n) => Array.from({ length: n }, (_, i) => ({ id: 'c' + (from + i), kind: 'charge', amount: '1.00', net_amount: '1.00' }));
  script = rec => (rec.ranges[0][0] === 0 ? { data: mk(0, 1000), error: null } : rec.ranges[0][0] === 1000 ? { data: mk(1000, 250), error: null } : { data: [], error: null });
  const list = await rowList(FIN_KEYS.charges);
  assert.equal(list.length, 1250);
  assert.deepEqual(calls.map(c => c.ranges[0]), [[0, 999], [1000, 1999]]);
});

test('rowList: a page error returns undefined (never a truncated list)', async () => {
  let n = 0;
  script = () => (n++ === 0 ? { data: Array.from({ length: 1000 }, (_, i) => ({ id: 'c' + i })), error: null } : { data: null, error: { message: 'boom' } });
  assert.equal(await rowList(FIN_KEYS.charges), undefined);
});

test('rowUpsert on an insertOnly table is a plain INSERT (no ON CONFLICT: the secretary has no SELECT policy); mutable tables still upsert', async () => {
  script = () => ({ error: null });
  assert.equal(await rowUpsert(FIN_KEYS.payments, { id: 'p1', amount: '5.00' }), true);
  assert.equal(calls[0].op, 'insert');
  assert.equal(calls[0].opts, null);
  calls = [];
  await rowUpsert(FIN_KEYS.accounts, { id: 'a1', name: 'x' });
  assert.equal(calls[0].op, 'upsert');
  assert.deepEqual(calls[0].opts, { onConflict: 'id' });
});

test('rowUpsert: re-sending an existing insertOnly row (primary-key duplicate) is success; any other failure is not', async () => {
  script = () => ({ error: { code: '23505', message: 'duplicate key value violates unique constraint "iapp_payments_pkey"' } });
  assert.equal(await rowUpsert(FIN_KEYS.payments, { id: 'p1', amount: '5.00' }), true);
  script = () => ({ error: { code: '23505', message: 'duplicate key value violates unique constraint "iapp_payments_source_uq"' } });
  assert.equal(await rowUpsert(FIN_KEYS.payments, { id: 'p2', amount: '5.00' }), false);
  script = () => ({ error: { code: '42501', message: 'new row violates row-level security policy' } });
  assert.equal(await rowUpsert(FIN_KEYS.payments, { id: 'p3', amount: '5.00' }), false);
});

test('rowDelete refuses on noDelete tables without calling the server', async () => {
  assert.equal(await rowDelete(FIN_KEYS.payments, 'p1'), false);
  assert.equal(await rowDelete(FIN_KEYS.accounts, 'a1'), false);
  assert.equal(calls.length, 0);
});

test('rowMutate on a noDelete table keeps rows missing from the proposed list and never issues a delete', async () => {
  const existing = [{ id: 'p1', kind: 'payment', amount: '5.00' }, { id: 'p2', kind: 'payment', amount: '7.00' }];
  script = rec => (rec.op === 'select' ? { data: existing.map(r => ({ ...r })), error: null } : { error: null });
  const res = await rowMutate(FIN_KEYS.payments, () => [{ id: 'p3', kind: 'payment', amount: '9.00' }]);
  assert.equal(res.ok, true);
  assert.ok(calls.every(c => c.op !== 'delete'), 'no delete');
  assert.equal(calls.filter(c => c.op === 'insert').length, 1, 'only the new row is written');
  assert.deepEqual(JSON.parse(globalThis.localStorage.getItem(FIN_KEYS.payments)).map(r => r.id).sort(), ['p1', 'p2', 'p3']);
});

test('store: upsertById never drops rows; commit order is parents-first; scopes are consistent', () => {
  const out = upsertById([{ id: 'a', v: 1 }, { id: 'b', v: 1 }], [{ id: 'b', v: 2 }, { id: 'c', v: 1 }]);
  assert.deepEqual(out.map(r => r.id + r.v), ['a1', 'b2', 'c1']);
  assert.deepEqual(upsertById(undefined, [{ id: 'x' }]).map(r => r.id), ['x']);
  const names = COMMIT_ORDER.map(([n]) => n);
  const before = (a, b) => assert.ok(names.indexOf(a) < names.indexOf(b), a + ' before ' + b);
  before('accounts', 'charges'); before('charges', 'payments'); before('payments', 'entries'); before('expenses', 'entries');
  before('reconciliations', 'entries'); before('charges', 'entries'); before('payments', 'settlements'); before('settlements', 'allocations');
  assert.equal(names.at(-1), 'audit');
  assert.ok(!('collect' in SCOPES), 'the secretary has no finance read scope: she uses the collection RPC');
});

test('flush order matches the commit order for every key (entries after every origin row, audit last)', async () => {
  const { FINANCE_FLUSH_ORDER } = await import('../src/modules/sync/finance-tables.js');
  const commitKeys = COMMIT_ORDER.map(([, k]) => k);
  assert.deepEqual(FINANCE_FLUSH_ORDER.filter(k => commitKeys.includes(k)), commitKeys.filter(k => FINANCE_FLUSH_ORDER.includes(k)));
  assert.equal(FINANCE_FLUSH_ORDER.at(-1), 'iapp_fin_audit');
  assert.equal(FINANCE_FLUSH_ORDER.at(-2), 'iapp_accounting_entries');
});

test('commitBatch with verify:false (secretary) never re-reads the table and still writes every row', async () => {
  const { commitBatch } = await import('../src/modules/finance/store.js');
  script = rec => (rec.op === 'select' ? { data: [], error: null } : { error: null });   // RLS: she reads nothing back
  const batch = { accounts: [], charges: [{ id: 'c1', kind: 'charge', amount: '10.00' }], payments: [{ id: 'p1', kind: 'payment', amount: '10.00' }], entries: [], lines: [], rules: [], allocations: [], settlements: [], reconciliations: [], audit: [], expenses: [], recurring: [] };
  const strict = await commitBatch(batch, undefined, { verify: true });
  assert.equal(strict.ok, false, 'with verify the read-back finds nothing and reports a conflict');
  const strictReads = calls.filter(c => c.op === 'select').length;
  calls = [];
  const res = await commitBatch(batch, undefined, { verify: false });
  assert.equal(res.ok, true);
  for (const t of ['iapp_charges', 'iapp_payments']) {
    const ops = calls.filter(c => c.table === t).map(c => c.op);
    assert.ok(ops.includes('insert') && ops.lastIndexOf('select') < ops.indexOf('insert'), t + ': no read after the write (' + ops.join(',') + ')');
  }
  assert.ok(strictReads > 0);
  assert.deepEqual(calls.filter(c => c.op === 'insert').map(c => c.table), ['iapp_charges', 'iapp_payments']);
});

test('collection state RPC → state: aggregates become serverBalances, old payments are never needed, pending local rows are layered once', async () => {
  const { stateFromCollectionRpc } = await import('../src/modules/finance/store.js');
  const { chargeBalance, effectivePayments } = await import('../src/modules/finance/billing.js');
  const rpc = {
    accounts: [{ id: 'cash', name: 'Cash', type: 'cash', clinic: null, active: true, is_legacy: false }],
    charges: [{ charge: { id: 'chg-1', kind: 'charge', amount: 500, discount: 0, net_amount: 500, service_date: '2026-10-01', source: 'COLLECT_MODAL', source_ref: 'apt-A1', appointment_id: 'A1', visit_id: 'apt-A1', status: 'posted' },
      adjustments: [{ id: 'adj-1', kind: 'adjustment', parent_id: 'chg-1', amount: 0, discount: 0, net_amount: 50, service_date: '2026-10-02', source: 'MANUAL', status: 'posted', reason: 'x' }],
      net: 550, paid: 350, refunded: 0, outstanding: 200 }],
    known_ids: ['pay-confirmed']
  };
  const local = { charges: [], payments: [
    { id: 'pay-confirmed', kind: 'payment', chargeId: 'chg-1', amount: '350.00' },     // the server already holds it → ignored
    { id: 'pay-pending', kind: 'payment', chargeId: 'chg-1', amount: '100.00' }       // queued offline, not on the server yet → counted
  ] };
  const st = stateFromCollectionRpc(rpc, local);
  assert.equal(st.accounts.length, 1);
  assert.deepEqual(st.charges.map(c => c.id), ['chg-1', 'adj-1']);
  assert.deepEqual(st.serverBalances['chg-1'], { paid: 35000, refunded: 0 });
  assert.deepEqual(effectivePayments(st.payments).map(p => p.id), ['pay-pending']);
  const b = chargeBalance('chg-1', st);
  assert.equal(b.net, 55000);
  assert.equal(b.paid, 45000);
  assert.equal(b.outstanding, 10000);
  assert.deepEqual(stateFromCollectionRpc({ accounts: [], charges: [], known_ids: [] }).charges, []);
});

test('loadCollectionState: offline → {offline:true} without calling the server; RPC error → offline; success maps the RPC', async () => {
  const { loadCollectionState } = await import('../src/modules/finance/store.js');
  const rpcCalls = [];
  let rpcResult = { data: { accounts: [], charges: [], known_ids: [] }, error: null };
  const sb = globalThis.__IAppSupabaseClient;
  sb.rpc = (fn, args) => { rpcCalls.push({ fn, args }); const b = { abortSignal: () => b, retry: () => Promise.resolve(rpcResult) }; return b; };
  const ok = await loadCollectionState(['A1']);
  assert.equal(ok.offline, false);
  assert.deepEqual(rpcCalls[0], { fn: 'iapp_fin_collection_state', args: { p_apt_ids: ['A1'], p_pending_ids: [] } });
  rpcResult = { data: null, error: { message: 'not allowed' } };
  assert.equal((await loadCollectionState(['A1'])).offline, true);
  const navDesc = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  Object.defineProperty(globalThis, 'navigator', { value: { onLine: false }, configurable: true, writable: true });
  try {
    rpcCalls.length = 0;
    assert.equal((await loadCollectionState(['A1'])).offline, true);
    assert.equal(rpcCalls.length, 0);
  } finally {
    if (navDesc) Object.defineProperty(globalThis, 'navigator', navDesc); else delete globalThis.navigator;
    delete sb.rpc;
  }
});

test('backup keys include the small finance tables that must survive the weekly export', () => {
  for (const k of [FIN_KEYS.accounts, FIN_KEYS.rules, FIN_KEYS.settlements]) assert.ok(BACKUP_KEYS.includes(k), k);
});

test('offline: commitBatch queues rows locally through the existing sync queue (dirty key) and does not lose them', async () => {
  const { commitBatch } = await import('../src/modules/finance/store.js');
  const { isDirty } = await import('../src/modules/sync/engine.js');
  const navDesc = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  Object.defineProperty(globalThis, 'navigator', { value: { onLine: false }, configurable: true, writable: true });
  SyncStore.set({ online: false });
  try {
    const batch = { accounts: [], charges: [{ id: 'c1', kind: 'charge', amount: '10.00' }], payments: [{ id: 'p1', kind: 'payment', amount: '10.00' }], entries: [], lines: [], rules: [], allocations: [], settlements: [], reconciliations: [], audit: [], expenses: [], recurring: [] };
    const res = await commitBatch(batch);
    assert.equal(res.ok, true);
    assert.equal(isDirty(FIN_KEYS.charges), true);
    assert.equal(isDirty(FIN_KEYS.payments), true);
    assert.deepEqual(JSON.parse(globalThis.localStorage.getItem(FIN_KEYS.payments)).map(r => r.id), ['p1']);
    assert.ok(calls.every(c => c.op !== 'delete'));
  } finally {
    if (navDesc) Object.defineProperty(globalThis, 'navigator', navDesc); else delete globalThis.navigator;
    SyncStore.set({ online: true });
  }
});

test('flush order: finance keys are flushed parents-first, other keys keep their order and go first', async () => {
  const { sortForFlush } = await import('../src/modules/sync/finance-tables.js');
  const out = sortForFlush(['iapp_fin_audit', 'iapp_payments', 'iapp_patients', 'iapp_accounting_entries', 'iapp_charges', 'iapp_fin_accounts', 'iapp_exams']);
  assert.deepEqual(out, ['iapp_patients', 'iapp_exams', 'iapp_fin_accounts', 'iapp_charges', 'iapp_payments', 'iapp_accounting_entries', 'iapp_fin_audit']);
});
