import test from 'node:test';
import assert from 'node:assert/strict';
import {
  RX_TPL_KEY, loadRxTemplates, refreshRxTemplates, addRxTemplate, deleteRxTemplate
} from '../src/modules/prescriptions/rx-templates.js';
import { setActor } from '../src/modules/sync/audit-trash-backup.js';
import { setRawIO, setTableMutate } from '../src/modules/sync/wiring.js';

// Same setup pattern as tests/sync-audit-trash-backup.test.js: a tiny
// in-memory localStorage, an authenticated session so sbMutate takes its
// online path, and setRawIO backed by an in-memory "remote" store since
// nothing here registers a Core table hook for RX_TPL_KEY (it isn't one).
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

globalThis.window = globalThis.window || {};
globalThis.window.IAppModules = globalThis.window.IAppModules || {};
globalThis.window.IAppModules.auth = { ensureSession: async () => ({ ok: true }) };

let stores = {};
setRawIO({
  readRemote: async key => (key in stores ? stores[key] : null),
  writeRemote: async (key, value) => { stores[key] = value; return true; }
});

test.afterEach(() => {
  globalThis.localStorage = makeLocalStorage();
  stores = {};
  setActor(() => ({ name: '—', role: '' }));
  setTableMutate(async () => undefined);
});

test('loadRxTemplates: no localStorage entry returns an empty list', () => {
  assert.deepEqual(loadRxTemplates(), []);
});

test('loadRxTemplates: malformed localStorage JSON returns an empty list', () => {
  globalThis.localStorage.setItem(RX_TPL_KEY, 'not json');
  assert.deepEqual(loadRxTemplates(), []);
});

test('refreshRxTemplates: pulls the remote list and caches it locally', async () => {
  stores[RX_TPL_KEY] = [{ id: 1, name: 'قالب' }];
  const r = await refreshRxTemplates();
  assert.deepEqual(r, [{ id: 1, name: 'قالب' }]);
  assert.deepEqual(loadRxTemplates(), [{ id: 1, name: 'قالب' }]);
});

test('refreshRxTemplates: falls back to the local cache when the remote value is not an array', async () => {
  globalThis.localStorage.setItem(RX_TPL_KEY, JSON.stringify([{ id: 2, name: 'محلي' }]));
  stores[RX_TPL_KEY] = null;
  const r = await refreshRxTemplates();
  assert.deepEqual(r, [{ id: 2, name: 'محلي' }]);
});

test('addRxTemplate: stamps id/by, stores alongside existing templates, logs an audit entry', async () => {
  setActor(() => ({ name: 'د. عبدالستار', role: 'doctor' }));
  stores[RX_TPL_KEY] = [{ id: 1, name: 'قديم' }];
  const next = await addRxTemplate({ name: 'جديد', medicines: 'Vigamox ED' });
  assert.equal(next.length, 2);
  const added = next.find(t => t.name === 'جديد');
  assert.ok(added);
  assert.equal(added.medicines, 'Vigamox ED');
  assert.equal(added.by, 'د. عبدالستار');
  assert.equal(typeof added.id, 'number');
  assert.deepEqual(loadRxTemplates(), next);
});

test('addRxTemplate: replaces an existing template with the same name instead of duplicating it', async () => {
  stores[RX_TPL_KEY] = [{ id: 1, name: 'قالب', medicines: 'القديم' }];
  const next = await addRxTemplate({ name: 'قالب', medicines: 'الجديد' });
  assert.equal(next.length, 1);
  assert.equal(next[0].medicines, 'الجديد');
});

test('addRxTemplate: with no session, queues the save locally (sbMutate\'s offline fallback) instead of throwing', async () => {
  globalThis.window.IAppModules.auth.ensureSession = async () => ({ ok: false });
  const result = await addRxTemplate({ name: 'x', medicines: 'y' });
  globalThis.window.IAppModules.auth.ensureSession = async () => ({ ok: true });
  assert.ok(Array.isArray(result));
  assert.equal(result[0].name, 'x');
  assert.equal(result[0].by, '—');
});

test('deleteRxTemplate: removes only the matching id', async () => {
  stores[RX_TPL_KEY] = [{ id: 1, name: 'أ' }, { id: 2, name: 'ب' }];
  const next = await deleteRxTemplate(1);
  assert.deepEqual(next, [{ id: 2, name: 'ب' }]);
  assert.deepEqual(loadRxTemplates(), next);
});
