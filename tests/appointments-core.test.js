import test from 'node:test';
import assert from 'node:assert/strict';
import { APT_KEY, appointmentFromRow, appointmentToRow, diffAppointments } from '../src/modules/appointments/index.js';
import { aptList, aptUpsert, aptDelete, aptMutate, aptSetAll } from '../src/modules/appointments/core.js';
import { SyncStore, isDirty, DIRTY_PREFIX } from '../src/modules/sync/engine.js';

// aptList/aptUpsert/aptDelete/aptMutate reach the appointment mapping helpers
// (fromRow/toRow/diff) through globalThis.IAppModules.appointments, exactly
// like the legacy runtime did before this batch and exactly like main.jsx
// wires it today -- so tests install the real mapper functions there.
globalThis.IAppModules = globalThis.IAppModules || {};
globalThis.IAppModules.appointments = {
  fromRow: appointmentFromRow,
  toRow: appointmentToRow,
  diff: diffAppointments
};

// A tiny in-memory localStorage polyfill, same approach as tests/sync-wiring.test.js.
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
// tests/sync-store-io.test.js: install one wrapper client and swap what it
// delegates to per test.
let fromImpl = () => { throw new Error('fromImpl not set for this test'); };
globalThis.__IAppSupabaseClient = { from: (...args) => fromImpl(...args) };

test.afterEach(() => {
  globalThis.localStorage = makeLocalStorage();
  SyncStore.set({ reachable: null });
});

function selectListReturning(result) {
  return () => ({
    select: () => ({
      gte: () => ({
        order: () => ({
          abortSignal: () => ({ retry: () => Promise.resolve(result) })
        })
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

const row1 = { id: 1, patient_id: 5, patient: 'Ali', phone: '', date: '2026-01-01', time: '10:00', type: '', doctor: '', clinic: '', notes: '' };

test('aptList: maps rows, caches to localStorage when not dirty, returns the list', async () => {
  fromImpl = selectListReturning({ data: [row1], error: null });
  const list = await aptList();
  assert.equal(list.length, 1);
  assert.equal(list[0].id, 1);
  assert.equal(list[0].patient, 'Ali');
  assert.equal(globalThis.localStorage.getItem(APT_KEY), JSON.stringify(list));
});

test('aptList: does not overwrite localStorage cache while the key is dirty', async () => {
  globalThis.localStorage.setItem(DIRTY_PREFIX + APT_KEY, '1');
  globalThis.localStorage.setItem(APT_KEY, 'preexisting');
  fromImpl = selectListReturning({ data: [row1], error: null });
  await aptList();
  assert.equal(globalThis.localStorage.getItem(APT_KEY), 'preexisting');
  globalThis.localStorage.removeItem(DIRTY_PREFIX + APT_KEY);
});

test('aptList: a query error returns undefined without throwing', async () => {
  fromImpl = selectListReturning({ data: null, error: { message: 'boom' } });
  assert.equal(await aptList(), undefined);
});

test('aptList: a thrown exception returns undefined without throwing', async () => {
  fromImpl = () => { throw new Error('network down'); };
  assert.equal(await aptList(), undefined);
});

test('aptUpsert: successful upsert returns true', async () => {
  fromImpl = upsertReturning({ error: null });
  assert.equal(await aptUpsert({ id: 1, patient: 'Ali' }), true);
});

test('aptUpsert: an upsert error returns false without throwing', async () => {
  fromImpl = upsertReturning({ error: { message: 'boom' } });
  assert.equal(await aptUpsert({ id: 1, patient: 'Ali' }), false);
});

test('aptDelete: successful delete returns true', async () => {
  fromImpl = deleteReturning({ error: null });
  assert.equal(await aptDelete(1), true);
});

test('aptDelete: a delete error returns false without throwing', async () => {
  fromImpl = deleteReturning({ error: { message: 'boom' } });
  assert.equal(await aptDelete(1), false);
});

test('aptMutate: offline (aptList -> undefined) returns { ok: false, error: "offline" }', async () => {
  fromImpl = () => { throw new Error('down'); };
  const res = await aptMutate(list => list);
  assert.equal(res.ok, false);
  assert.equal(res.error, 'offline');
});

test('aptMutate: an abort object from the mutator returns { ok: false, error, data: base }', async () => {
  fromImpl = selectListReturning({ data: [row1], error: null });
  const res = await aptMutate(() => ({ abort: 'busy' }));
  assert.equal(res.ok, false);
  assert.equal(res.error, 'busy');
  assert.equal(res.data.length, 1);
});

test('aptMutate: upserts changed rows and deletes removed rows, then returns the new list (no verify)', async () => {
  const calls = { upserts: [], deletes: [] };
  fromImpl = (...args) => {
    void args;
    return {
      select: () => ({ gte: () => ({ order: () => ({ abortSignal: () => ({ retry: () => Promise.resolve({ data: [row1], error: null }) }) }) }) }),
      upsert: rec => { calls.upserts.push(rec); return { abortSignal: () => ({ retry: () => Promise.resolve({ error: null }) }) }; },
      delete: () => ({ eq: (_field, id) => { calls.deletes.push(id); return { abortSignal: () => ({ retry: () => Promise.resolve({ error: null }) }) }; } })
    };
  };
  const added = { id: 2, patientId: null, patient: 'Sara', phone: '', date: '2026-01-02', time: '11:00', type: '', doctor: '', clinic: '', notes: '' };
  const res = await aptMutate(list => [...list.filter(a => a.id !== 1), added]);
  assert.equal(res.ok, true);
  assert.equal(res.data.length, 1);
  assert.equal(res.data[0].patient, 'Sara');
  assert.equal(calls.upserts.length, 1);
  assert.equal(calls.deletes.length, 1);
  assert.equal(calls.deletes[0], 1);
});

test('aptMutate: a failed upsert/delete returns { ok: false, error: "offline", data: base }', async () => {
  fromImpl = (...args) => {
    void args;
    return {
      select: () => ({ gte: () => ({ order: () => ({ abortSignal: () => ({ retry: () => Promise.resolve({ data: [row1], error: null }) }) }) }) }),
      upsert: () => ({ abortSignal: () => ({ retry: () => Promise.resolve({ error: { message: 'boom' } }) }) })
    };
  };
  const added = { id: 2, patientId: null, patient: 'Sara', phone: '', date: '2026-01-02', time: '11:00', type: '', doctor: '', clinic: '', notes: '' };
  const res = await aptMutate(list => [...list, added]);
  assert.equal(res.ok, false);
  assert.equal(res.error, 'offline');
  assert.equal(res.data.length, 1);
});

test('aptMutate: with verify, a re-fetch that satisfies verify() returns { ok: true, data: check }', async () => {
  fromImpl = (...args) => {
    void args;
    return {
      select: () => ({ gte: () => ({ order: () => ({ abortSignal: () => ({ retry: () => Promise.resolve({ data: [row1], error: null }) }) }) }) }),
      upsert: () => ({ abortSignal: () => ({ retry: () => Promise.resolve({ error: null }) }) })
    };
  };
  const added = { id: 2, patientId: null, patient: 'Sara', phone: '', date: '2026-01-02', time: '11:00', type: '', doctor: '', clinic: '', notes: '' };
  const res = await aptMutate(list => [...list, added], check => check.some(a => a.patient === 'Ali'));
  assert.equal(res.ok, true);
  assert.equal(res.data.length, 1);
});

test('aptMutate: with verify, a re-fetch that fails verify() returns { ok: false, error: "conflict" }', async () => {
  fromImpl = (...args) => {
    void args;
    return {
      select: () => ({ gte: () => ({ order: () => ({ abortSignal: () => ({ retry: () => Promise.resolve({ data: [row1], error: null }) }) }) }) }),
      upsert: () => ({ abortSignal: () => ({ retry: () => Promise.resolve({ error: null }) }) })
    };
  };
  const added = { id: 2, patientId: null, patient: 'Sara', phone: '', date: '2026-01-02', time: '11:00', type: '', doctor: '', clinic: '', notes: '' };
  const res = await aptMutate(list => [...list, added], () => false);
  assert.equal(res.ok, false);
  assert.equal(res.error, 'conflict');
});

test('aptSetAll: replaces the whole list via aptMutate and returns its ok flag', async () => {
  const calls = { upserts: 0, deletes: 0 };
  fromImpl = (...args) => {
    void args;
    return {
      select: () => ({ gte: () => ({ order: () => ({ abortSignal: () => ({ retry: () => Promise.resolve({ data: [row1], error: null }) }) }) }) }),
      upsert: () => { calls.upserts++; return { abortSignal: () => ({ retry: () => Promise.resolve({ error: null }) }) }; },
      delete: () => ({ eq: () => { calls.deletes++; return { abortSignal: () => ({ retry: () => Promise.resolve({ error: null }) }) }; } })
    };
  };
  const ok = await aptSetAll([]);
  assert.equal(ok, true);
  assert.equal(calls.deletes, 1);
  assert.equal(calls.upserts, 0);
});
