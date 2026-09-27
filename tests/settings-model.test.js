import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  sameName, adminCount, addUserError, buildNewUserRecord, canRemoveAdminRole, editUserError,
  buildEditedUserRecord, replaceUser, canDeleteUser, userAuditDetail, withAdded, withUpdated,
  withoutId, withPrimaryDoctor, primaryDoctor, passwordFormError, computeTotalRevenue,
  buildDatabaseSummaryRows, STATIC_INFO_ROWS,
  DUPLICATE_EMAIL_ERR, USER_NOT_FOUND_ERR, LAST_ADMIN_ROLE_ERR
} from '../src/modules/settings/model.js';

// Same as the legacy runtime's emailKey.
const emailKey = e => String(e || '').trim().toLowerCase();
const ROLE_LABEL = { admin: 'مدير', doctor: 'طبيب', secretary: 'سكرتارية', employee: 'موظف' };

const users = [
  { id: 1, email: 'boss@sakr.clinic', username: 'boss@sakr.clinic', name: 'Boss', role: 'admin' },
  { id: 2, email: 'Doc@Sakr.Clinic', username: 'doc@sakr.clinic', name: 'Doc', role: 'doctor' },
  { id: 3, username: 'legacy@sakr.clinic', name: 'Old', role: 'employee', pw: 'x', password: 'y', mustChange: true }
];

test('sameName ignores case and surrounding whitespace, tolerates null', () => {
  assert.equal(sameName('  Ali ', 'ali'), true);
  assert.equal(sameName('Ali', 'Aly'), false);
  assert.equal(sameName(null, ''), true);
  assert.equal(sameName(undefined, 'x'), false);
});

test('adminCount counts role === "admin" only', () => {
  assert.equal(adminCount(users), 1);
  assert.equal(adminCount([]), 0);
  assert.equal(adminCount([{ role: 'Admin' }, { role: 'admin' }, { role: 'admin' }]), 2);
});

test('addUserError: duplicate by email (normalized) or by username', () => {
  assert.equal(addUserError(users, 'doc@sakr.clinic', emailKey), DUPLICATE_EMAIL_ERR);
  assert.equal(addUserError(users, 'legacy@sakr.clinic', emailKey), DUPLICATE_EMAIL_ERR); // username-only match
  assert.equal(addUserError(users, 'new@sakr.clinic', emailKey), null);
  assert.equal(addUserError([], 'a@b.c', emailKey), null);
});

test('buildNewUserRecord trims name and uses the normalized email for email+username', () => {
  assert.deepEqual(buildNewUserRecord({ name: '  Sara ', role: 'secretary', email: ' X@Y.z ' }, 'x@y.z', 77), {
    id: 77, email: 'x@y.z', username: 'x@y.z', name: 'Sara', role: 'secretary'
  });
});

test('canRemoveAdminRole blocks demoting the only admin', () => {
  assert.equal(canRemoveAdminRole(users[0], 'doctor', users), false);
  assert.equal(canRemoveAdminRole(users[0], 'admin', users), true);
  assert.equal(canRemoveAdminRole(users[1], 'employee', users), true);
  const twoAdmins = [...users, { id: 9, role: 'admin' }];
  assert.equal(canRemoveAdminRole(users[0], 'doctor', twoAdmins), true);
});

test('editUserError checks duplicate (email only, other ids) -> not found -> last admin, in that order', () => {
  // own email is fine
  assert.equal(editUserError(users, { id: 2, role: 'doctor' }, 'doc@sakr.clinic', emailKey), null);
  // another user's email
  assert.equal(editUserError(users, { id: 2, role: 'doctor' }, 'boss@sakr.clinic', emailKey), DUPLICATE_EMAIL_ERR);
  // username-only match is NOT a duplicate on edit (legacy behaviour)
  assert.equal(editUserError(users, { id: 2, role: 'doctor' }, 'legacy@sakr.clinic', emailKey), null);
  // missing user
  assert.equal(editUserError(users, { id: 99, role: 'doctor' }, 'z@z.z', emailKey), USER_NOT_FOUND_ERR);
  // duplicate wins over not-found
  assert.equal(editUserError(users, { id: 99, role: 'doctor' }, 'boss@sakr.clinic', emailKey), DUPLICATE_EMAIL_ERR);
  // demote last admin
  assert.equal(editUserError(users, { id: 1, role: 'doctor' }, 'boss@sakr.clinic', emailKey), LAST_ADMIN_ROLE_ERR);
});

test('buildEditedUserRecord keeps other fields but strips pw/password/mustChange', () => {
  const rec = buildEditedUserRecord({ ...users[2], extra: 1 }, { name: ' New ', role: 'doctor' }, 'n@n.n');
  assert.deepEqual(rec, { id: 3, username: 'n@n.n', email: 'n@n.n', name: 'New', role: 'doctor', extra: 1 });
  assert.ok(!('pw' in rec) && !('password' in rec) && !('mustChange' in rec));
  assert.equal(users[2].pw, 'x'); // input not mutated
});

test('replaceUser swaps by id', () => {
  const next = replaceUser(users, 2, { id: 2, name: 'Z' });
  assert.equal(next[1].name, 'Z');
  assert.equal(next.length, 3);
  assert.equal(next[0], users[0]);
});

test('canDeleteUser: ignore unknown/self, block last admin, else delete', () => {
  assert.deepEqual(canDeleteUser(users, 99, 1), { action: 'ignore' });
  assert.deepEqual(canDeleteUser(users, 2, 2), { action: 'ignore' });
  assert.deepEqual(canDeleteUser(users, 1, 2), { action: 'blocked' });
  const r = canDeleteUser(users, 2, 1);
  assert.equal(r.action, 'delete');
  assert.deepEqual(r.next.map(u => u.id), [1, 3]);
  const twoAdmins = [...users, { id: 9, role: 'admin' }];
  assert.equal(canDeleteUser(twoAdmins, 1, 2).action, 'delete');
});

test('userAuditDetail uses role label, falls back to raw role', () => {
  assert.equal(userAuditDetail('a@b.c', 'admin', ROLE_LABEL), 'a@b.c · مدير');
  assert.equal(userAuditDetail('a@b.c', 'nurse', ROLE_LABEL), 'a@b.c · nurse');
});

test('doctor/price array helpers', () => {
  const docs = [{ id: 1, name: 'A', isPrimary: true }, { id: 2, name: 'B' }];
  assert.deepEqual(withAdded(docs, { name: 'C', id: 5 }, 10).at(-1), { name: 'C', id: 10 });
  assert.equal(withAdded(docs, { name: 'C' }, 10).length, 3);
  assert.deepEqual(withUpdated(docs, { id: 2, name: 'BB' })[1], { id: 2, name: 'BB' });
  assert.deepEqual(withoutId(docs, 1).map(d => d.id), [2]);
  assert.deepEqual(withPrimaryDoctor(docs, 2).map(d => d.isPrimary), [false, true]);
  assert.equal(primaryDoctor(docs).name, 'A');
  assert.equal(primaryDoctor([{ id: 3, name: 'X' }]).name, 'X');
  assert.deepEqual(primaryDoctor([]), {});
});

test('passwordFormError: length first, then mismatch', () => {
  assert.equal(passwordFormError({ old: '', new1: '123', new2: '999' }, 6), '❌ يجب أن تكون كلمة المرور الجديدة 6 أحرف على الأقل');
  assert.equal(passwordFormError({ old: '', new1: '123456', new2: '1234567' }, 6), '❌ كلمتا المرور الجديدتان غير متطابقتين');
  assert.equal(passwordFormError({ old: '', new1: '123456', new2: '123456' }, 6), null);
});

test('database summary rows and revenue', () => {
  const visits = [{ paid: true, cost: '100' }, { paid: false, cost: 50 }, { paid: true, cost: 1000 }, { paid: true }];
  assert.equal(computeTotalRevenue(visits), 1100);
  const rows = buildDatabaseSummaryRows({ patients: [1, 2], appointments: [1], visits, prescriptions: [], exams: [1, 2, 3] });
  assert.deepEqual(rows.map(r => r[1]), [2, 1, 4, 0, 3, (1100).toLocaleString() + ' ج.م']);
  assert.equal(rows[0][0], '👥 المرضى');
  assert.equal(STATIC_INFO_ROWS.length, 3);
});
