import test from 'node:test';
import assert from 'node:assert/strict';
import { sbGetRaw, sbSetRaw } from '../src/modules/sync/wiring.js';
import { SyncStore } from '../src/modules/sync/engine.js';

// sbGetRaw/sbSetRaw (Phase 8, combined batch 19) decide where a given key's
// data actually lives -- the appointments table, one of the generic
// ROW_TABLES, or the generic iapp_store key/value table -- and read/write it
// there. They are an exact copy of the legacy runtime's _sbGetRaw/_sbSetRaw,
// now real functions here instead of injected via setRawIO.

// A tiny in-memory localStorage polyfill, same approach as
// tests/sync-wiring.test.js (aptList/rowList/sbGetStore all touch it as a
// side effect of their own success paths).
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

globalThis.IAppModules = globalThis.IAppModules || {};
globalThis.IAppModules.appointments = {
  fromRow: r => r,
  toRow: r => r,
  diff: (base, next) => {
    const nextIds = new Set(next.map(x => x.id));
    return {
      changed: next.filter(n => JSON.stringify(base.find(b => b.id === n.id)) !== JSON.stringify(n)),
      removed: base.filter(b => !nextIds.has(b.id))
    };
  }
};

let fromImpl = () => { throw new Error('fromImpl not set for this test'); };
globalThis.__IAppSupabaseClient = { from: (...args) => fromImpl(...args) };

let onlineOverride = true;
Object.defineProperty(globalThis, 'navigator', {
  configurable: true,
  value: { get onLine() { return onlineOverride; } }
});

test.afterEach(() => {
  globalThis.localStorage = makeLocalStorage();
  SyncStore.set({ reachable: null });
  onlineOverride = true;
});

test('sbGetRaw: offline marks SyncStore unreachable and returns undefined without touching Supabase', async () => {
  onlineOverride = false;
  const result = await sbGetRaw('iapp_settings');
  assert.equal(result, undefined);
  assert.equal(SyncStore.st.reachable, false);
});

test('sbSetRaw: offline marks SyncStore unreachable and returns false without touching Supabase', async () => {
  onlineOverride = false;
  const result = await sbSetRaw('iapp_settings', { a: 1 });
  assert.equal(result, false);
  assert.equal(SyncStore.st.reachable, false);
});

function selectListReturning(result) {
  return () => ({
    select: () => ({
      gte: () => ({
        order: () => ({
          abortSignal: () => ({ retry: () => Promise.resolve(result) })
        })
      }),
      order: () => ({
        abortSignal: () => ({ retry: () => Promise.resolve(result) })
      })
    })
  });
}

test('sbGetRaw: the appointments key reads through aptList (the appointments Core)', async () => {
  fromImpl = table => {
    assert.equal(table, 'iapp_appointments');
    return selectListReturning({ data: [{ id: 1 }], error: null })();
  };
  const result = await sbGetRaw('iapp_appointments');
  assert.ok(Array.isArray(result));
  assert.equal(result[0].id, 1);
});

test('sbSetRaw: the appointments key writes through aptSetAll (the appointments Core) -- an empty list needs no upsert/delete', async () => {
  fromImpl = () => selectListReturning({ data: [], error: null })();
  const result = await sbSetRaw('iapp_appointments', []);
  assert.equal(result, true);
});

test('sbGetRaw: a generic key (not appointments, not a ROW_TABLES table) reads through sbGetStore (iapp_store)', async () => {
  fromImpl = table => {
    assert.equal(table, 'iapp_store');
    return {
      select: () => ({
        eq: () => ({
          abortSignal: () => ({ retry: () => ({ maybeSingle: () => Promise.resolve({ data: { value: { x: 1 } }, error: null }) }) })
        })
      })
    };
  };
  const result = await sbGetRaw('iapp_settings');
  assert.deepEqual(result, { x: 1 });
});

test('sbSetRaw: a generic key writes through sbSetStore (iapp_store)', async () => {
  let upserted = null;
  fromImpl = table => {
    assert.equal(table, 'iapp_store');
    return {
      upsert: row => {
        upserted = row;
        return { abortSignal: () => ({ retry: () => Promise.resolve({ error: null }) }) };
      }
    };
  };
  const result = await sbSetRaw('iapp_settings', { x: 2 });
  assert.equal(result, true);
  assert.equal(upserted.key, 'iapp_settings');
  assert.deepEqual(upserted.value, { x: 2 });
});

test('sbGetRaw: a ROW_TABLES key (e.g. visits) reads through rowList', async () => {
  fromImpl = table => {
    assert.equal(table, 'iapp_visits');
    return selectListReturning({ data: [{ id: 5, date: '2026-01-01' }], error: null })();
  };
  const result = await sbGetRaw('iapp_visits');
  assert.ok(Array.isArray(result));
  assert.equal(result[0].id, '5');
});

test('sbSetRaw: a ROW_TABLES key (e.g. visits) writes through rowMutate -- an empty list needs no upsert/delete', async () => {
  fromImpl = () => selectListReturning({ data: [], error: null })();
  const result = await sbSetRaw('iapp_visits', []);
  assert.equal(result, true);
});
