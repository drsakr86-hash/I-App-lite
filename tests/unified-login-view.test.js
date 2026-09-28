import test from 'node:test';
import assert from 'node:assert/strict';
import {
  nextLoginMode, staffLoginFieldsMissing, patientLoginFieldsMissing,
  normalizeTypedPatientCode, normalizeStoredPatientCode, findPatientByCodeAndName,
  patientLoginLockKey
} from '../src/modules/auth/unified-login-view.js';

// ---- nextLoginMode ----
test('nextLoginMode: patient tab collapses to guest when the flag is off', () => {
  assert.equal(nextLoginMode(false, 'patient'), 'guest');
});

test('nextLoginMode: staff tab is unaffected by the flag either way', () => {
  assert.equal(nextLoginMode(false, 'staff'), 'staff');
  assert.equal(nextLoginMode(true, 'staff'), 'staff');
});

test('nextLoginMode: patient tab stays "patient" when the flag is on', () => {
  assert.equal(nextLoginMode(true, 'patient'), 'patient');
});

test('nextLoginMode: guest requests pass through unchanged regardless of flag', () => {
  assert.equal(nextLoginMode(false, 'guest'), 'guest');
  assert.equal(nextLoginMode(true, 'guest'), 'guest');
});

// ---- field validation ----
test('staffLoginFieldsMissing: blank username (after trim) or blank password blocks submit', () => {
  assert.equal(staffLoginFieldsMissing('', 'x'), true);
  assert.equal(staffLoginFieldsMissing('   ', 'x'), true);
  assert.equal(staffLoginFieldsMissing('a@b.com', ''), true);
  assert.equal(staffLoginFieldsMissing('a@b.com', 'pw'), false);
});

test('staffLoginFieldsMissing: a password of only spaces is NOT trimmed (legacy quirk, preserved)', () => {
  assert.equal(staffLoginFieldsMissing('a@b.com', '   '), false);
});

test('patientLoginFieldsMissing: blank code or blank name (after trim) blocks submit', () => {
  assert.equal(patientLoginFieldsMissing('', 'سارة'), true);
  assert.equal(patientLoginFieldsMissing('P-1', '   '), true);
  assert.equal(patientLoginFieldsMissing('P-1', 'سارة'), false);
});

// ---- code normalization ----
test('normalizeTypedPatientCode: trims, uppercases, strips a leading P/P- and leading zeros', () => {
  assert.equal(normalizeTypedPatientCode('  p-007 '), '7');
  assert.equal(normalizeTypedPatientCode('P12'), '12');
  assert.equal(normalizeTypedPatientCode('0099'), '99');
  assert.equal(normalizeTypedPatientCode(''), '');
});

test('normalizeStoredPatientCode: same normalization but does NOT trim first (legacy asymmetry, preserved)', () => {
  assert.equal(normalizeStoredPatientCode('P-007'), '7');
  // A code with leading whitespace fails to strip the "P" prefix because the
  // regex is anchored at the very start of the (untrimmed) string — this is
  // the pre-existing behavior, kept exactly as-is.
  assert.equal(normalizeStoredPatientCode(' P-007'), ' P-007');
});

// ---- findPatientByCodeAndName ----
const PATIENTS = [
  { id: 1, name: 'سارة أحمد', patientCode: 'P-0012' },
  { id: 2, name: 'محمد علي', patientCode: 'P-0034' }
];

test('findPatientByCodeAndName: matches on normalized code AND Arabic-normalized name', () => {
  const p = findPatientByCodeAndName(PATIENTS, '12', 'ساره احمد');
  assert.equal(p.id, 1);
});

test('findPatientByCodeAndName: code matches but name does not -> null', () => {
  assert.equal(findPatientByCodeAndName(PATIENTS, '12', 'شخص آخر'), null);
});

test('findPatientByCodeAndName: no patients or no match -> null (never undefined)', () => {
  assert.equal(findPatientByCodeAndName([], '12', 'سارة'), null);
  assert.equal(findPatientByCodeAndName(PATIENTS, '999', 'غير موجود'), null);
  assert.equal(findPatientByCodeAndName(null, '12', 'سارة'), null);
});

// ---- lock key ----
test('patientLoginLockKey: trims and uppercases the typed code, keeps the "P" (different normalization than the match above)', () => {
  assert.equal(patientLoginLockKey('  p-12 '), 'patient:P-12');
});
