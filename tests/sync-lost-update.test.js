// KNOWN LIMITATION (audit F-18), kept as a documented `todo` test so it shows up in every run without failing the build.
// Keys that live as ONE jsonb blob in iapp_store (patients, exams, prescriptions, imaging orders...) are written with an
// unconditional upsert after a client-side read+merge. Two devices that flush the same key at the same moment can
// overwrite each other (last writer wins) and the first device's NEW record disappears from the server.
// Real fix needs a server-side compare-and-swap (see docs/audit/DATABASE-AND-MIGRATION-REVIEW.md section F).
import test from 'node:test';
import assert from 'node:assert/strict';
import { mergeData, createFlusher } from '../src/modules/sync/index.js';

function device(server, name, hooks) {
  const store = new Map();
  const storage = { get: k => (store.has(k) ? store.get(k) : null), set: (k, v) => (store.set(k, v), true), del: k => store.delete(k) };
  const flusher = createFlusher({
    storage, dirtyPrefix: 'd_', basePrefix: 'b_', noCacheKeys: [],
    ensureAuthed: async () => ({ ok: true }),
    readRemote: async () => { const v = JSON.parse(JSON.stringify(server.value)); await hooks.afterRead(name); return v; },
    writeRemote: async (k, v) => { server.value = JSON.parse(JSON.stringify(v)); return true; },
    merge: mergeData
  });
  return { storage, flusher };
}

test('two devices adding a record to the same blob key at the same time keep BOTH records', { todo: 'F-18: needs server-side compare-and-swap' }, async () => {
  const server = { value: [{ id: 1, n: 'existing' }] };
  let release; const gate = new Promise(r => { release = r; });
  let reads = 0;
  const hooks = { afterRead: async () => { reads++; if (reads === 2) release(); await gate; } }; // both devices read before either writes
  const A = device(server, 'A', hooks), B = device(server, 'B', hooks);
  for (const [d, rec] of [[A, { id: 2, n: 'from A' }], [B, { id: 3, n: 'from B' }]]) {
    d.storage.set('k', JSON.stringify([{ id: 1, n: 'existing' }, rec]));
    d.storage.set('b_k', JSON.stringify([{ id: 1, n: 'existing' }]));
    d.storage.set('d_k', 'stamp');
  }
  await Promise.all([A.flusher.flushKey('k'), B.flusher.flushKey('k')]);
  assert.deepEqual(server.value.map(x => x.id).sort(), [1, 2, 3]);
});
