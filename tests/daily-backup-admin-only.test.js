import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

// F-06: iapp_store is role-restricted (docs/sql/store-role-rls.sql). The daily auto-backup snapshots clinical keys and writes
// iapp_backups, which a secretary can neither read nor write, so it must only run for an admin session.
test('daily auto-backup is scheduled for admin sessions only', () => {
  const src = fs.readFileSync(new URL('../src/app/UnifiedRouter.jsx', import.meta.url), 'utf8');
  const i = src.indexOf('maybeDailyBackup();');
  assert.ok(i > 0);
  const guard = src.slice(Math.max(0, i - 400), i);
  assert.match(guard, /session\.role !== 'admin'/);
});

test('the store policy file grants a secretary exactly the keys her app uses', () => {
  const sql = fs.readFileSync(new URL('../docs/sql/store-role-rls.sql', import.meta.url), 'utf8');
  const rw = /store_secretary_rw[\s\S]*?key = any \(array\[([^\]]+)\]/.exec(sql)[1].match(/iapp_[a-z_]+/g).sort();
  assert.deepEqual(rw, ['iapp_appointments', 'iapp_audit', 'iapp_patients', 'iapp_prices', 'iapp_trash', 'iapp_visits']);
  const ro = /store_secretary_ro[\s\S]*?key = any \(array\[([^\]]+)\]/.exec(sql)[1].match(/iapp_[a-z_]+/g).sort();
  assert.deepEqual(ro, ['iapp_clinic', 'iapp_doctors', 'iapp_users']);
  for (const clinical of ['iapp_exams', 'iapp_prescriptions', 'iapp_backups', 'iapp_imaging_orders', 'iapp_injections']) {
    assert.ok(!rw.includes(clinical) && !ro.includes(clinical), clinical);
  }
});
