import test from 'node:test';
import assert from 'node:assert/strict';
import { ROW_TABLES, rowList, rowUpsert, rowDelete, rowMutate } from '../src/modules/sync/row-tables.js';
import { SyncStore, DIRTY_PREFIX } from '../src/modules/sync/engine.js';

// A tiny in-memory localStorage polyfill, same approach as tests/sync-wiring.test.js
// and tests/appointments-core.test.js.
function makeLocalStorage() {
  const store = new Map();
  return {
    getItem: k => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => { store.set(k, String(v)); },
    removeItem: k => { store.delete(k); },
    get length() { return store.size; },
    key: i => Array.from(store.keys())[i] ?? null
  };
}
globalThis.localStorage = makeLocalStorage();

// getSB() (src/modules/data-access/index.js) caches its resolved client the
// first time globalThis.__IAppSupabaseClient is truthy -- same pattern as
// tests/sync-store-io.test.js and tests/appointments-core.test.js: install
// one wrapper client and swap what it delegates to per test.
let fromImpl = () => { throw new Error('fromImpl not set for this test'); };
globalThis.__IAppSupabaseClient = { from: (...args) => fromImpl(...args) };

test.afterEach(() => {
  globalThis.localStorage = makeLocalStorage();
  SyncStore.set({ reachable: null });
});

function selectListReturning(result) {
  return () => ({
    select: () => ({
      order: () => ({
        abortSignal: () => ({ retry: () => Promise.resolve(result) })
      })
    })
  });
}
function upsertReturning(result) {
  return () => ({
    upsert: () => ({
      abortSignal: () => ({ retry: () => Promise.resolve(result) })
    })
  });
}
function deleteReturning(result) {
  return () => ({
    delete: () => ({
      eq: () => ({
        abortSignal: () => ({ retry: () => Promise.resolve(result) })
      })
    })
  });
}

const visitRow = { id: 1, patient_id: 5, patient: 'Ali', date: '2026-01-01', type: 'كشف', doctor: '', clinic: '', complaint: '', result: '', cost: '100', paid: true, next_visit: '', notes: '', rated: false };

test('ROW_TABLES: the three legacy keys plus the accounting-core tables, with table names and order columns', () => {
  const FIN = ['iapp_accounting_entries', 'iapp_cash_reconciliations', 'iapp_charges', 'iapp_doctor_settlements', 'iapp_doctor_share_rules', 'iapp_fin_accounts', 'iapp_fin_audit', 'iapp_payments', 'iapp_revenue_allocations'];
  assert.deepEqual(Object.keys(ROW_TABLES).sort(), ['iapp_expenses', 'iapp_recurring_expenses', 'iapp_visits', ...FIN].sort());
  assert.equal(ROW_TABLES.iapp_visits.table, 'iapp_visits');
  assert.equal(ROW_TABLES.iapp_visits.order, 'date');
  assert.equal(ROW_TABLES.iapp_expenses.table, 'iapp_expenses');
  assert.equal(ROW_TABLES.iapp_recurring_expenses.order, 'id');
});

test('ROW_TABLES.iapp_visits: fromRow/toRow round-trip the key fields', () => {
  const mapped = ROW_TABLES.iapp_visits.fromRow(visitRow);
  assert.equal(mapped.id, '1');
  assert.equal(mapped.patientId, 5);
  assert.equal(mapped.paid, true);
  const back = ROW_TABLES.iapp_visits.toRow(mapped);
  assert.equal(back.patient_id, 5);
  assert.equal(back.cost, '100');
});

test('ROW_TABLES.iapp_expenses: recurringId falls back to undefined when missing', () => {
  const mapped = ROW_TABLES.iapp_expenses.fromRow({ id: 2, date: '2026-01-01', category: 'rent', amount: 500, notes: '', clinic: '' });
  assert.equal(mapped.recurringId, undefined);
});

test('rowList: unknown key returns undefined without touching Supabase', async () => {
  assert.equal(await rowList('not_a_real_key'), undefined);
});

test('rowList: maps rows, caches to localStorage when not dirty, returns the list', async () => {
  fromImpl = selectListReturning({ data: [visitRow], error: null });
  const list = await rowList('iapp_visits');
  assert.equal(list.length, 1);
  assert.equal(list[0].patient, 'Ali');
  assert.equal(globalThis.localStorage.getItem('iapp_visits'), JSON.stringify(list));
});

test('rowList: does not overwrite localStorage cache while the key is dirty', async () => {
  globalThis.localStorage.setItem(DIRTY_PREFIX + 'iapp_visits', '1');
  globalThis.localStorage.setItem('iapp_visits', 'preexisting');
  fromImpl = selectListReturning({ data: [visitRow], error: null });
  await rowList('iapp_visits');
  assert.equal(globalThis.localStorage.getItem('iapp_visits'), 'preexisting');
  globalThis.localStorage.removeItem(DIRTY_PREFIX + 'iapp_visits');
});

test('rowList: a query error returns undefined without throwing', async () => {
  fromImpl = selectListReturning({ data: null, error: { message: 'boom' } });
  assert.equal(await rowList('iapp_expenses'), undefined);
});

test('rowList: a thrown exception returns undefined without throwing', async () => {
  fromImpl = () => { throw new Error('network down'); };
  assert.equal(await rowList('iapp_recurring_expenses'), undefined);
});

test('rowUpsert: successful upsert returns true', async () => {
  fromImpl = upsertReturning({ error: null });
  assert.equal(await rowUpsert('iapp_visits', { id: '1', patient: 'Ali' }), true);
});

test('rowUpsert: unknown key returns false without touching Supabase', async () => {
  assert.equal(await rowUpsert('not_a_real_key', { id: '1' }), false);
});

test('rowUpsert: an upsert error returns false without throwing', async () => {
  fromImpl = upsertReturning({ error: { message: 'boom' } });
  assert.equal(await rowUpsert('iapp_visits', { id: '1', patient: 'Ali' }), false);
});

test('rowDelete: successful delete returns true', async () => {
  fromImpl = deleteReturning({ error: null });
  assert.equal(await rowDelete('iapp_visits', '1'), true);
});

test('rowDelete: an delete error returns false without throwing', async () => {
  fromImpl = deleteReturning({ error: { message: 'boom' } });
  assert.equal(await rowDelete('iapp_visits', '1'), false);
});

test('rowMutate: offline (rowList -> undefined) returns { ok: false, error: "offline" }', async () => {
  fromImpl = () => { throw new Error('down'); };
  const res = await rowMutate('iapp_visits', list => list);
  assert.equal(res.ok, false);
  assert.equal(res.error, 'offline');
});

test('rowMutate: an abort object from the mutator returns { ok: false, error, data: base }', async () => {
  fromImpl = selectListReturning({ data: [visitRow], error: null });
  const res = await rowMutate('iapp_visits', () => ({ abort: 'busy' }));
  assert.equal(res.ok, false);
  assert.equal(res.error, 'busy');
  assert.equal(res.data.length, 1);
});

test('rowMutate: upserts changed rows and deletes removed rows, then returns the new list (no verify)', async () => {
  const calls = { upserts: [], deletes: [] };
  fromImpl = (...args) => {
    void args;
    return {
      select: () => ({ order: () => ({ abortSignal: () => ({ retry: () => Promise.resolve({ data: [visitRow], error: null }) }) }) }),
      upsert: rec => { calls.upserts.push(rec); return { abortSignal: () => ({ retry: () => Promise.resolve({ error: null }) }) }; },
      delete: () => ({ eq: (_field, id) => { calls.deletes.push(id); return { abortSignal: () => ({ retry: () => Promise.resolve({ error: null }) }) }; } })
    };
  };
  const added = { id: '2', patientId: null, patient: 'Sara', date: '2026-01-02', type: '', doctor: '', clinic: '', complaint: '', result: '', cost: '', paid: false, nextVisit: '', notes: '', rated: false };
  const res = await rowMutate('iapp_visits', list => [...list.filter(r => r.id !== '1'), added]);
  assert.equal(res.ok, true);
  assert.equal(res.data.length, 1);
  assert.equal(res.data[0].patient, 'Sara');
  assert.equal(calls.upserts.length, 1);
  assert.equal(calls.deletes.length, 1);
  assert.equal(calls.deletes[0], '1');
});

test('rowMutate: a failed upsert returns { ok: false, error: "offline", data: base }', async () => {
  fromImpl = (...args) => {
    void args;
    return {
      select: () => ({ order: () => ({ abortSignal: () => ({ retry: () => Promise.resolve({ data: [visitRow], error: null }) }) }) }),
      upsert: () => ({ abortSignal: () => ({ retry: () => Promise.resolve({ error: { message: 'boom' } }) }) })
    };
  };
  const added = { id: '2', patient: 'Sara' };
  const res = await rowMutate('iapp_visits', list => [...list, added]);
  assert.equal(res.ok, false);
  assert.equal(res.error, 'offline');
  assert.equal(res.data.length, 1);
});

test('rowMutate: with verify, a re-fetch that satisfies verify() returns { ok: true, data: check }', async () => {
  fromImpl = (...args) => {
    void args;
    return {
      select: () => ({ order: () => ({ abortSignal: () => ({ retry: () => Promise.resolve({ data: [visitRow], error: null }) }) }) }),
      upsert: () => ({ abortSignal: () => ({ retry: () => Promise.resolve({ error: null }) }) })
    };
  };
  const added = { id: '2', patient: 'Sara' };
  const res = await rowMutate('iapp_visits', list => [...list, added], check => check.some(r => r.patient === 'Ali'));
  assert.equal(res.ok, true);
  assert.equal(res.data.length, 1);
});

test('rowMutate: with verify, a re-fetch that fails verify() returns { ok: false, error: "conflict" }', async () => {
  fromImpl = (...args) => {
    void args;
    return {
      select: () => ({ order: () => ({ abortSignal: () => ({ retry: () => Promise.resolve({ data: [visitRow], error: null }) }) }) }),
      upsert: () => ({ abortSignal: () => ({ retry: () => Promise.resolve({ error: null }) }) })
    };
  };
  const added = { id: '2', patient: 'Sara' };
  const res = await rowMutate('iapp_visits', list => [...list, added], () => false);
  assert.equal(res.ok, false);
  assert.equal(res.error, 'conflict');
});
