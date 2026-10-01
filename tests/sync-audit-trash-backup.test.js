import test from 'node:test';
import assert from 'node:assert/strict';
import { setActor, logAudit, trashPut, saveAutoBackup } from '../src/modules/sync/audit-trash-backup.js';
import { setRawIO, setTableMutate } from '../src/modules/sync/wiring.js';
import { BACKUP_KEYS } from '../src/modules/sync/engine.js';

// A tiny in-memory localStorage polyfill, same approach as the other sync
// test files.
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

// sbMutate (which logAudit/trashPut/saveAutoBackup all write through) needs
// a session before it will try the online path -- same setup as
// tests/sync-wiring.test.js.
globalThis.window = globalThis.window || {};
globalThis.window.IAppModules = globalThis.window.IAppModules || {};
globalThis.window.IAppModules.auth = { ensureSession: async () => ({ ok: true }) };

// sbMutate's online path goes through sbMutateOnline -> _tableMutate (the
// injected setTableMutate hook) -> falls through to the generic retry loop
// if that returns undefined -- exactly like every other key that isn't a
// Core table. We never register a table hook here, so every write below
// exercises the generic loop, with setRawIO as the actual (in-memory)
// remote.
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

test('logAudit: default actor (no setActor call) stamps "—" with an empty role', async () => {
  await logAudit('فحص', 'تفاصيل');
  const list = stores['iapp_audit'];
  assert.equal(list.length, 1);
  assert.equal(list[0].by, '—');
  assert.equal(list[0].role, '');
  assert.equal(list[0].action, 'فحص');
  assert.equal(list[0].details, 'تفاصيل');
});

test('logAudit: uses the actor registered via setActor()', async () => {
  setActor(() => ({ name: 'Abdo', role: 'admin' }));
  await logAudit('دخول', '');
  const entry = stores['iapp_audit'][0];
  assert.equal(entry.by, 'Abdo');
  assert.equal(entry.role, 'admin');
});

test('logAudit: prepends new entries and caps the list at AUDIT_MAX', async () => {
  stores['iapp_audit'] = Array.from({ length: 1500 }, (_, i) => ({ id: i, action: 'old' }));
  await logAudit('جديد', '');
  const list = stores['iapp_audit'];
  assert.equal(list.length, 1500);
  assert.equal(list[0].action, 'جديد');
});

test('logAudit: truncates details to 200 characters', async () => {
  await logAudit('فحص', 'x'.repeat(500));
  assert.equal(stores['iapp_audit'][0].details.length, 200);
});

test('logAudit: swallows a failing write without throwing', async () => {
  setRawIO({ readRemote: async () => { throw new Error('down'); }, writeRemote: async () => false });
  await assert.doesNotReject(() => logAudit('فحص', ''));
  setRawIO({ readRemote: async key => (key in stores ? stores[key] : null), writeRemote: async (key, value) => { stores[key] = value; return true; } });
});

test('trashPut: wraps items with metadata and writes them, returns true on success', async () => {
  const ok = await trashPut('iapp_patients', { id: 1, name: 'Ali' }, 'مريض: Ali');
  assert.equal(ok, true);
  const list = stores['iapp_trash'];
  assert.equal(list.length, 1);
  assert.equal(list[0].storeKey, 'iapp_patients');
  assert.equal(list[0].label, 'مريض: Ali');
  assert.equal(list[0].record.name, 'Ali');
  assert.equal(list[0].by, '—');
});

test('trashPut: accepts an array of items and filters out falsy entries', async () => {
  await trashPut('iapp_visits', [{ id: 1 }, null, { id: 2 }], 'زيارات');
  assert.equal(stores['iapp_trash'].length, 2);
});

test('trashPut: an empty/falsy items list returns false without writing', async () => {
  const ok = await trashPut('iapp_patients', [null, undefined], 'لا شيء');
  assert.equal(ok, false);
  assert.equal(stores['iapp_trash'], undefined);
});

test('trashPut: drops oversized image-like fields via slimForTrash', async () => {
  const big = { id: 1, name: 'Ali', image: 'x'.repeat(250000) };
  await trashPut('iapp_patients', big, 'مريض');
  const rec = stores['iapp_trash'][0].record;
  assert.equal(rec.image, undefined);
  assert.equal(rec._imageDropped, true);
  assert.equal(rec.name, 'Ali');
});

test('trashPut: caps the list at TRASH_MAX and drops entries older than TRASH_DAYS', async () => {
  const old = Date.now() - 40 * 24 * 3600 * 1000; // 40 days ago, older than TRASH_DAYS (30)
  stores['iapp_trash'] = [{ id: 'old', storeKey: 'x', label: '', deletedAt: old, by: '—', record: {} }];
  await trashPut('iapp_patients', { id: 1 }, 'مريض');
  const list = stores['iapp_trash'];
  assert.equal(list.length, 1);
  assert.equal(list[0].storeKey, 'iapp_patients');
});

test('saveAutoBackup: snapshots every BACKUP_KEYS value available remotely, caps at BACKUP_KEEP', async () => {
  stores['iapp_patients'] = [{ id: 1 }];
  stores['iapp_visits'] = [{ id: 2 }];
  const ok = await saveAutoBackup('يدوي');
  assert.equal(ok, true);
  const snap = stores['iapp_backups'][0];
  assert.equal(snap.reason, 'يدوي');
  assert.deepEqual(snap.data.iapp_patients, [{ id: 1 }]);
  assert.deepEqual(snap.data.iapp_visits, [{ id: 2 }]);
  assert.equal(snap.by, '—');
  assert.ok(BACKUP_KEYS.includes('iapp_patients'));
});

test('saveAutoBackup: falls back to localStorage for a key missing remotely', async () => {
  globalThis.localStorage.setItem('iapp_expenses', JSON.stringify([{ id: 9 }]));
  await saveAutoBackup('يدوي');
  const snap = stores['iapp_backups'][0];
  assert.deepEqual(snap.data.iapp_expenses, [{ id: 9 }]);
});

test('saveAutoBackup: defaults the reason to "تلقائي" when none is given', async () => {
  await saveAutoBackup();
  assert.equal(stores['iapp_backups'][0].reason, 'تلقائي');
});

test('saveAutoBackup: refuses an oversized snapshot and returns false', async () => {
  stores['iapp_patients'] = [{ id: 1, blob: 'x'.repeat(4500000) }];
  const ok = await saveAutoBackup('يدوي');
  assert.equal(ok, false);
  assert.equal(stores['iapp_backups'], undefined);
});
