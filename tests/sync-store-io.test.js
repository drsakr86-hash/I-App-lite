import test from 'node:test';
import assert from 'node:assert/strict';
import { sbGetStore, sbSetStore } from '../src/modules/sync/store-io.js';
import { SyncStore } from '../src/modules/sync/engine.js';

// getSB() (src/modules/data-access/index.js) caches its resolved client in a
// module-private variable the first time globalThis.__IAppSupabaseClient is
// truthy, exactly like tests/data-access.test.js relies on -- so, like that
// file, these tests run in order: the first exercises the "no client" path
// (before anything is installed), then a single wrapper client is installed
// once and its behavior is swapped per test by reassigning what it
// delegates to, since replacing globalThis.__IAppSupabaseClient again later
// would have no effect on the already-cached client.

let fromImpl = () => { throw new Error('fromImpl not set for this test'); };
const wrapperClient = { from: (...args) => fromImpl(...args) };

function selectReturning(result) {
  return () => ({
    select: () => ({
      eq: () => ({
        abortSignal: () => ({
          retry: () => ({
            maybeSingle: () => Promise.resolve(result)
          })
        })
      })
    })
  });
}
function upsertReturning(result) {
  return () => ({
    upsert: () => ({
      abortSignal: () => ({
        retry: () => Promise.resolve(result)
      })
    })
  });
}

test('sbGetStore: no client configured -> undefined, does not throw', async () => {
  delete globalThis.__IAppSupabaseClient;
  delete globalThis.supabase;
  assert.equal(await sbGetStore('some_key'), undefined);
});

test('sbGetStore: row missing (maybeSingle -> null data) returns null', async () => {
  globalThis.__IAppSupabaseClient = wrapperClient; // cached by getSB() from here on
  fromImpl = selectReturning({ data: null, error: null });
  assert.equal(await sbGetStore('missing_key'), null);
});

test('sbGetStore: returns the stored value as-is for primitives, and a deep copy for objects/arrays', async () => {
  fromImpl = selectReturning({ data: { value: 'plain-string' }, error: null });
  assert.equal(await sbGetStore('k'), 'plain-string');

  const original = [{ id: 1, n: 'a' }];
  fromImpl = selectReturning({ data: { value: original }, error: null });
  const got = await sbGetStore('k');
  assert.deepEqual(got, original);
  assert.notEqual(got, original); // deep-copied, not the same reference
});

test('sbGetStore: a query error returns undefined without throwing', async () => {
  fromImpl = selectReturning({ data: null, error: { message: 'boom' } });
  assert.equal(await sbGetStore('k'), undefined);
});

test('sbGetStore: a thrown exception marks reachable=false and returns undefined', async () => {
  fromImpl = () => { throw new Error('network down'); };
  SyncStore.set({ reachable: null });
  assert.equal(await sbGetStore('k'), undefined);
  assert.equal(SyncStore.st.reachable, false);
  SyncStore.set({ reachable: null });
});

test('sbSetStore: successful upsert returns true', async () => {
  fromImpl = upsertReturning({ error: null });
  assert.equal(await sbSetStore('k', { a: 1 }), true);
});

test('sbSetStore: an upsert error returns false without throwing', async () => {
  fromImpl = upsertReturning({ error: { message: 'boom' } });
  assert.equal(await sbSetStore('k', { a: 1 }), false);
});

test('sbSetStore: a thrown exception marks reachable=false and returns false', async () => {
  fromImpl = () => { throw new Error('network down'); };
  SyncStore.set({ reachable: null });
  assert.equal(await sbSetStore('k', 1), false);
  assert.equal(SyncStore.st.reachable, false);
  SyncStore.set({ reachable: null });
});
