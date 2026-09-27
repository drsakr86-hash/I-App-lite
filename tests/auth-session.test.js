import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  STAFF_ROLES, SESSION_TTL_REMEMBER, SESSION_TTL_TEMP,
  publicUser, buildCompactSession, isStaffRole, isInvalidStaffSession,
  isSessionExpired, sessionExpiry, mergeFreshStaffSession, staffSessionDrifted,
  buildStaffSessionRecord, buildPatientSessionRecord
} from '../src/modules/auth/session.js';

test('STAFF_ROLES lists exactly the four staff roles', () => {
  assert.deepEqual(STAFF_ROLES, ['admin', 'doctor', 'secretary', 'employee']);
});

test('publicUser strips internal fields and normalizes mustChange', () => {
  const u = { id: 1, username: 'a@b.com', email: 'a@b.com', name: 'Ali', role: 'doctor', pw: 'secret', password: 'x' };
  const pub = publicUser(u);
  assert.deepEqual(pub, { id: 1, username: 'a@b.com', email: 'a@b.com', name: 'Ali', role: 'doctor', mustChange: false });
  assert.equal('pw' in pub, false);
});

test('publicUser defaults email to empty string and mustChange to boolean', () => {
  const pub = publicUser({ id: 2, username: 'x', name: 'X', role: 'admin', mustChange: 1 });
  assert.equal(pub.email, '');
  assert.equal(pub.mustChange, true);
});

test('publicUser returns null for a falsy user', () => {
  assert.equal(publicUser(null), null);
  assert.equal(publicUser(undefined), null);
});

test('buildCompactSession keeps only the four toolbar fields', () => {
  const u = { id: 1, username: 'a', name: 'Ali', role: 'admin', email: 'a@b.com', mustChange: false };
  assert.deepEqual(buildCompactSession(u), { id: 1, username: 'a', name: 'Ali', role: 'admin' });
});

test('isStaffRole / isInvalidStaffSession', () => {
  assert.equal(isStaffRole('admin'), true);
  assert.equal(isStaffRole('patient'), false);
  assert.equal(isInvalidStaffSession({ kind: 'staff', role: 'admin' }), false);
  assert.equal(isInvalidStaffSession({ kind: 'staff', role: 'banned' }), true);
  assert.equal(isInvalidStaffSession({ kind: 'patient', role: 'anything' }), false);
  assert.equal(isInvalidStaffSession(null), false);
});

test('isSessionExpired', () => {
  const now = 1_000_000;
  assert.equal(isSessionExpired(null, now), true);
  assert.equal(isSessionExpired({}, now), true);
  assert.equal(isSessionExpired({ exp: now - 1 }, now), true);
  assert.equal(isSessionExpired({ exp: now + 1 }, now), false);
});

test('sessionExpiry picks the remember-me vs temporary TTL', () => {
  const now = 1_000_000;
  assert.equal(sessionExpiry(true, now), now + SESSION_TTL_REMEMBER);
  assert.equal(sessionExpiry(false, now), now + SESSION_TTL_TEMP);
});

test('mergeFreshStaffSession overlays the current user profile onto the stored session', () => {
  const stored = { kind: 'staff', id: 1, username: 'old', name: 'Old Name', role: 'secretary', exp: 999, mustChange: false };
  const currentUser = { id: 1, username: 'old', email: 'old@b.com', name: 'New Name', role: 'admin', mustChange: true };
  const fresh = mergeFreshStaffSession(stored, currentUser);
  assert.equal(fresh.name, 'New Name');
  assert.equal(fresh.role, 'admin');
  assert.equal(fresh.exp, 999); // exp comes from the stored session, not the user record
  assert.equal(fresh.kind, 'staff');
});

test('staffSessionDrifted detects role/name/username/mustChange changes only', () => {
  const stored = { role: 'secretary', name: 'A', username: 'a', mustChange: false };
  assert.equal(staffSessionDrifted({ ...stored }, stored), false);
  assert.equal(staffSessionDrifted({ ...stored, role: 'admin' }, stored), true);
  assert.equal(staffSessionDrifted({ ...stored, name: 'B' }, stored), true);
  assert.equal(staffSessionDrifted({ ...stored, username: 'b' }, stored), true);
  assert.equal(staffSessionDrifted({ ...stored, mustChange: true }, stored), true);
});

test('buildStaffSessionRecord / buildPatientSessionRecord', () => {
  const user = { id: 5, username: 'u', email: 'u@b.com', name: 'U', role: 'doctor', mustChange: false };
  assert.deepEqual(buildStaffSessionRecord(user, 12345), {
    kind: 'staff', id: 5, username: 'u', email: 'u@b.com', name: 'U', role: 'doctor', mustChange: false, exp: 12345
  });
  const patient = { id: 9, name: 'Patient X' };
  assert.deepEqual(buildPatientSessionRecord(patient, 999), { kind: 'patient', patient, exp: 999 });
});
