// Save-state honesty, connection indicator, PHI purge, logger sanitising, permission boundaries.
import test from 'node:test';
import assert from 'node:assert/strict';
import { interpretSaveResult, interpretWriteOk, connectionState, CONNECTION_STATES } from '../src/modules/patient-file/save-state.js';
import { purgeCachedPhi, PHI_KEEP_KEYS } from '../src/modules/sync/phi-purge.js';
import { logError, getRecentErrors, clearRecentErrors } from '../src/services/logger.js';
import { can, PERMISSIONS } from '../src/app/permissions.js';

test('save-state: success is reported only when every destination succeeded', () => {
  assert.equal(interpretSaveResult('الفحص', { legacyResult: true, status: 'saved' }).kind, 'saved');
  assert.equal(interpretSaveResult('الفحص', { legacyResult: true }).kind, 'saved');
});

test('save-state: unknown / empty results are never "saved"', () => {
  assert.notEqual(interpretSaveResult('الفحص', undefined).kind, 'saved');
  assert.notEqual(interpretSaveResult('الفحص', null).kind, 'saved');
  assert.notEqual(interpretSaveResult('الفحص', 'ok').kind, 'saved');
  assert.equal(interpretSaveResult('الفحص', true).kind, 'saved');
});

test('save-state: Core failure after main store success = partial (never "تم الحفظ")', () => {
  const r = interpretSaveResult('الفحص', { legacyResult: true, coreError: 'rpc failed' });
  assert.equal(r.kind, 'partial');
  assert.ok(!r.message.startsWith('تم حفظ'));
});

test('save-state: offline Core failure = local-only; server pending = partial/local-only', () => {
  assert.equal(interpretSaveResult('الفحص', { legacyResult: true, coreError: 'offline' }).kind, 'local-only');
  assert.equal(interpretSaveResult('الفحص', { legacyResult: false, coreError: 'offline' }).kind, 'local-only');
  assert.equal(interpretSaveResult('الفحص', { legacyResult: false }).kind, 'partial');
  assert.equal(interpretSaveResult('الفحص', { status: 'partial' }).kind, 'partial');
});

test('save-state: plain write false means local only', () => {
  assert.equal(interpretWriteOk('الملف', false).kind, 'local-only');
  assert.equal(interpretWriteOk('الملف', true).kind, 'saved');
});

test('connection: five required states with priority failed > saving > partial > pending > online', () => {
  assert.deepEqual(['online', 'saving', 'pending', 'partial', 'failed'].every(k => CONNECTION_STATES[k]), true);
  assert.equal(connectionState({}).id, 'online');
  assert.equal(connectionState({ sync: { pending: 2 } }).id, 'pending');
  assert.equal(connectionState({ sync: { pending: 2, syncing: true } }).id, 'saving');
  assert.equal(connectionState({ saveStatus: { kind: 'partial', message: 'x' }, sync: { pending: 2 } }).id, 'partial');
  assert.equal(connectionState({ saveStatus: { kind: 'failed', message: 'x' }, sync: { pending: 2, syncing: true } }).id, 'failed');
  assert.equal(connectionState({ saveStatus: { kind: 'saving' } }).id, 'saving');
  assert.equal(connectionState({ sync: { online: false } }).id, 'offline');
  assert.equal(connectionState({ sync: { online: false, pending: 1 } }).id, 'pending');
  assert.equal(connectionState({ sync: { authError: true } }).id, 'failed');
});

function fakeStorage(init) {
  const m = new Map(Object.entries(init));
  return { get length() { return m.size; }, key: i => [...m.keys()][i] ?? null, getItem: k => (m.has(k) ? m.get(k) : null), removeItem: k => m.delete(k), keys: () => [...m.keys()] };
}

test('purge: removes cached patient data on logout but keeps unsynced work and non-PHI settings', () => {
  const st = fakeStorage({
    iapp_patients: '[]', iapp_exams: '[]', iapp_visits: '[]', iapp_base_iapp_exams: '[]',
    iapp_dirty_iapp_visits: '1', iapp_base_iapp_visits: '[]',
    iapp_theme: 'dark', iapp_users: '[]', iapp_sb_auth: 'tok', other_app: 'x'
  });
  const r = purgeCachedPhi(st);
  const left = st.keys();
  assert.ok(!left.includes('iapp_patients'));
  assert.ok(!left.includes('iapp_exams'));
  assert.ok(!left.includes('iapp_base_iapp_exams'));
  assert.ok(left.includes('iapp_visits'), 'a dataset with unsynced changes is kept');
  assert.ok(left.includes('iapp_dirty_iapp_visits'), 'unsynced marker kept');
  assert.ok(left.includes('iapp_base_iapp_visits'), 'unsynced base kept');
  assert.ok(left.includes('iapp_theme') && left.includes('iapp_users') && left.includes('other_app'));
  assert.ok(r.keptDirty >= 2);
  assert.ok(PHI_KEEP_KEYS.has('iapp_theme'));
});

test('purge: a storage that throws does not crash sign-out', () => {
  const bad = { get length() { throw new Error('denied'); }, key() { return null; }, removeItem() {} };
  assert.equal(purgeCachedPhi(bad).errors, 1);
  assert.equal(purgeCachedPhi(null).removed, 0);
});

test('logger: strips e-mails and long digit runs, keeps only allow-listed ids', () => {
  clearRecentErrors();
  logError('test.op', new Error('failed for a@b.com phone 01012345678 end'), { patientId: 'p1', name: 'سر', phone: '0101234567' });
  const [e] = getRecentErrors();
  const dump = JSON.stringify(e);
  assert.ok(!dump.includes('a@b.com'));
  assert.ok(!dump.includes('01012345678'));
  assert.ok(!dump.includes('سر'));
  assert.ok(dump.includes('p1'));
});

test('permissions: secretary cannot write clinical data; employee is read-only; unknown role gets nothing', () => {
  for (const r of ['examinations', 'prescriptions']) {
    assert.equal(can('secretary', r, 'write'), false, r);
    assert.equal(can('secretary', r, 'read'), false, r);
  }
  assert.equal(can('secretary', 'investigations', 'write'), false);
  assert.equal(can('secretary', 'investigations', 'read'), true);
  assert.equal(can('secretary', 'imaging', 'write'), false);
  assert.equal(can('employee', 'patients', 'write'), false);
  assert.equal(can('doctor', 'settings', 'read'), false);
  assert.equal(can('doctor', 'users', 'write'), false);
  assert.equal(can('admin', 'users', 'write'), true);
  assert.equal(can('hacker', 'patients', 'read'), false);
  assert.equal(can(undefined, 'patients', 'read'), false);
  assert.ok(Object.isFrozen(PERMISSIONS));
});
