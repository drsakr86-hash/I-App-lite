// Audit F-18: keys stored as ONE jsonb blob in iapp_store used to be written with an unconditional upsert after a client-side
// read+merge, so two devices flushing the same key at the same moment could overwrite each other. The flusher now reads with a token
// and writes through a server compare-and-swap (docs/sql/store-cas.sql); on 'conflict' it re-reads, re-merges and retries.
// These tests use a fake server that behaves like the iapp_store_cas RPC (rev counter), plus the pre-SQL fallback (no CAS).
import test from 'node:test';
import assert from 'node:assert/strict';
import { mergeData, createFlusher } from '../src/modules/sync/index.js';

const clone = v => JSON.parse(JSON.stringify(v));

function makeServer(initial, { cas = true } = {}) {
  return { value: clone(initial), rev: 0, cas, conflicts: 0 };
}

function device(server, hooks = {}, opts = {}) {
  const store = new Map();
  const storage = { get: k => (store.has(k) ? store.get(k) : null), set: (k, v) => (store.set(k, v), true), del: k => store.delete(k) };
  const flusher = createFlusher({
    storage, dirtyPrefix: 'd_', basePrefix: 'b_', noCacheKeys: [],
    ensureAuthed: async () => ({ ok: true }),
    readRemote: async (k, token) => {
      const v = clone(server.value);
      if (token && server.cas) { token.rev = server.rev; token.cas = true; }
      if (hooks.afterRead) await hooks.afterRead();
      return v;
    },
    writeRemote: async (k, v, token) => {
      if (token && token.cas && server.cas) {
        if (token.rev !== server.rev) { server.conflicts++; return 'conflict'; }
        server.value = clone(v); server.rev++; return true;
      }
      server.value = clone(v); server.rev++; return true; // legacy unconditional upsert
    },
    merge: mergeData,
    setError: opts.setError
  });
  return { storage, flusher };
}

function dirty(d, base, local) {
  d.storage.set('k', JSON.stringify(local));
  d.storage.set('b_k', JSON.stringify(base));
  d.storage.set('d_k', 'stamp');
}

function racingPair(server) {
  let release; const gate = new Promise(r => { release = r; });
  let reads = 0;
  // the first two reads happen before either device writes
  const hooks = { afterRead: async () => { reads++; if (reads === 2) release(); if (reads <= 2) await gate; } };
  return [device(server, hooks), device(server, hooks)];
}

const base = [{ id: 1, n: 'existing' }];

test('two devices adding a record to the same blob key at the same time keep BOTH records', async () => {
  const server = makeServer(base);
  const [A, B] = racingPair(server);
  dirty(A, base, [...base, { id: 2, n: 'from A' }]);
  dirty(B, base, [...base, { id: 3, n: 'from B' }]);
  await Promise.all([A.flusher.flushKey('k'), B.flusher.flushKey('k')]);
  assert.deepEqual(server.value.map(x => x.id).sort(), [1, 2, 3]);
  assert.equal(server.conflicts, 1, 'exactly one device lost the race and retried');
  assert.equal(A.storage.get('d_k'), null);
  assert.equal(B.storage.get('d_k'), null);
});

test('three simultaneous devices all converge (bounded retries)', async () => {
  const server = makeServer(base);
  let release; const gate = new Promise(r => { release = r; }); let reads = 0;
  const hooks = { afterRead: async () => { reads++; if (reads === 3) release(); if (reads <= 3) await gate; } };
  const ds = [2, 3, 4].map(id => { const d = device(server, hooks); dirty(d, base, [...base, { id, n: 'x' + id }]); return d; });
  await Promise.all(ds.map(d => d.flusher.flushKey('k')));
  assert.deepEqual(server.value.map(x => x.id).sort(), [1, 2, 3, 4]);
});

test('persistent conflicts stop after the retry bound, keep the data dirty and report an error', async () => {
  const server = makeServer(base);
  const errors = [];
  const d = device(server, { afterRead: async () => { server.rev++; } }, { setError: (k, m) => errors.push(m) }); // someone else always writes first
  dirty(d, base, [...base, { id: 2 }]);
  const ok = await d.flusher.flushKey('k');
  assert.equal(ok, false);
  assert.ok(errors.length >= 1);
  assert.equal(d.storage.get('d_k'), 'stamp', 'local change is not lost');
  assert.equal(server.conflicts, 6); // first attempt + 5 retries
});

test('before store-cas.sql is applied (no CAS) the flusher still writes like before', async () => {
  const server = makeServer(base, { cas: false });
  const d = device(server);
  dirty(d, base, [...base, { id: 2 }]);
  assert.equal(await d.flusher.flushKey('k'), true);
  assert.deepEqual(server.value.map(x => x.id), [1, 2]);
  assert.equal(server.conflicts, 0);
});
