import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  PRICE_ICONS, blankPrice, initialPriceState, canSavePrice, blankDoctor, initialDoctorState,
  deriveDoctorNameFields, withDoctorName, togglePrimary, canSaveDoctor, USER_ROLE_OPTIONS, USER_PASSWORD_NOTE,
  blankUser, initialUserState, isUserFormValid, buildUserPayload, userSaveLabel
} from '../src/components/forms/settings-forms-model.js';
import { legacyFunctionSource, legacyConst } from './forms-legacy-source.js';

const PRICE_SRC = legacyFunctionSource('PriceForm');
const DOC_SRC = legacyFunctionSource('DoctorForm');
const USER_SRC = legacyFunctionSource('UserForm');

// ---- PriceForm
test('PRICE_ICONS and blankPrice equal legacy', () => {
  assert.deepEqual(PRICE_ICONS, legacyConst('PRICE_ICONS'));
  assert.deepEqual(blankPrice(), legacyConst('blank', PRICE_SRC));
  assert.deepEqual(Object.keys(blankPrice()), ['name', 'price', 'icon']);
});

test('initialPriceState: add vs edit', () => {
  assert.deepEqual(initialPriceState(null), blankPrice());
  const p = { id: 4, name: 'كشف', price: 300, icon: '💬' };
  assert.deepEqual(initialPriceState(p), p);
  assert.notEqual(initialPriceState(p), p);
});

test('canSavePrice: name and price required', () => {
  assert.equal(!!canSavePrice({ name: '', price: '' }), false);
  assert.equal(!!canSavePrice({ name: 'كشف', price: '' }), false);
  assert.equal(!!canSavePrice({ name: '', price: '300' }), false);
  assert.equal(!!canSavePrice({ name: 'كشف', price: '300' }), true);
  assert.equal(!!canSavePrice({ name: 'كشف', price: '0' }), true); // "0" string passes
  assert.equal(!!canSavePrice({ name: 'كشف', price: 0 }), false); // stored number 0 does not (legacy)
  assert.equal(!!canSavePrice({ name: ' ', price: '-5' }), true); // no trim / sign check (legacy gap)
});

// ---- DoctorForm
test('blankDoctor equals legacy', () => {
  assert.deepEqual(blankDoctor(), legacyConst('blank', DOC_SRC));
  assert.deepEqual(Object.keys(blankDoctor()), ['name', 'short', 'title', 'initial', 'isPrimary']);
  assert.deepEqual(initialDoctorState(null), blankDoctor());
  const d = { id: 1, name: 'د. أ', short: 'د. أ', isPrimary: true };
  assert.deepEqual(initialDoctorState(d), d);
  assert.notEqual(initialDoctorState(d), d);
});

test('deriveDoctorNameFields', () => {
  assert.deepEqual(deriveDoctorNameFields('د. محمد أحمد'), { ini: 'م', short: 'د. محمد' });
  assert.deepEqual(deriveDoctorNameFields('محمد أحمد'), { ini: 'م', short: 'د. محمد' });
  assert.deepEqual(deriveDoctorNameFields(''), { ini: '', short: 'د. ' });
  assert.deepEqual(deriveDoctorNameFields('د'), { ini: 'د', short: 'د. د' });
  assert.deepEqual(deriveDoctorNameFields('د.محمد'), { ini: 'م', short: 'د.محمد' });
  // Double space: split yields an empty word.
  assert.deepEqual(deriveDoctorNameFields('د.  سلمى'), { ini: 'س', short: 'د. ' });
});

test('withDoctorName latches initial/short on the first non-empty derivation', () => {
  let v = blankDoctor();
  for (const name of ['م', 'مح', 'محمد', 'محمد أحمد']) v = withDoctorName(v, name, deriveDoctorNameFields(name));
  assert.equal(v.name, 'محمد أحمد');
  assert.equal(v.initial, 'م');
  assert.equal(v.short, 'د. م'); // legacy quirk: short latched at the first keystroke
  // Existing values are never overwritten.
  const e = withDoctorName({ name: 'x', initial: 'ع', short: 'د. ع', title: 't' }, 'سلمى', deriveDoctorNameFields('سلمى'));
  assert.deepEqual(e, { name: 'سلمى', initial: 'ع', short: 'د. ع', title: 't' });
  // Clearing the name keeps them too.
  assert.equal(withDoctorName(v, '', deriveDoctorNameFields('')).short, 'د. م');
});

test('togglePrimary and canSaveDoctor', () => {
  assert.deepEqual(togglePrimary({ isPrimary: false, a: 1 }), { isPrimary: true, a: 1 });
  assert.deepEqual(togglePrimary({}), { isPrimary: true });
  assert.equal(!!canSaveDoctor({ name: '', short: 'x' }), false);
  assert.equal(!!canSaveDoctor({ name: 'x', short: '' }), false);
  assert.equal(!!canSaveDoctor({ name: 'x', short: 'y' }), true);
});

// ---- UserForm
test('role options and password note appear verbatim in legacy UserForm', () => {
  for (const o of USER_ROLE_OPTIONS) {
    assert.ok(USER_SRC.includes(`value: "${o.v}"\n  }, "${o.l}")`), o.v);
  }
  assert.deepEqual(USER_ROLE_OPTIONS.map(o => o.v), ['admin', 'doctor', 'secretary', 'employee']);
  assert.ok(USER_SRC.includes(JSON.stringify(USER_PASSWORD_NOTE)));
  assert.deepEqual(blankUser(), legacyConst('blank', USER_SRC));
});

test('initialUserState: email falls back to username', () => {
  assert.deepEqual(initialUserState(null), { email: '', name: '', role: 'employee' });
  assert.deepEqual(initialUserState({ id: 1, name: 'a', email: 'a@x', role: 'admin' }), { id: 1, name: 'a', email: 'a@x', role: 'admin' });
  assert.equal(initialUserState({ id: 1, username: 'old@x' }).email, 'old@x');
  assert.equal(initialUserState({ id: 1 }).email, '');
  assert.equal(initialUserState({ id: 1, email: '', username: 'u' }).email, 'u');
  // email key keeps its original position when present, else is appended.
  assert.deepEqual(Object.keys(initialUserState({ email: 'a@x', id: 1 })), ['email', 'id']);
  assert.deepEqual(Object.keys(initialUserState({ id: 1, username: 'u' })), ['id', 'username', 'email']);
});

test('isUserFormValid: "@" in email, non-blank name, not saving', () => {
  assert.equal(!!isUserFormValid({ email: 'a@b', name: 'x' }, false), true);
  assert.equal(!!isUserFormValid({ email: 'a@b', name: 'x' }, true), false);
  assert.equal(!!isUserFormValid({ email: 'ab', name: 'x' }, false), false);
  assert.equal(!!isUserFormValid({ email: 'a@b', name: '   ' }, false), false);
  assert.equal(!!isUserFormValid({ email: '@', name: 'x' }, false), true); // no real format check (legacy)
  assert.equal(!!isUserFormValid({ email: undefined, name: 'x' }, false), false);
  // Legacy crash kept: a record without a name throws.
  assert.throws(() => isUserFormValid({ email: 'a@b' }, false), TypeError);
});

test('buildUserPayload and userSaveLabel', () => {
  assert.deepEqual(buildUserPayload({ email: 'a@b', name: 'x', role: 'doctor' }, 55), { email: 'a@b', name: 'x', role: 'doctor', id: 55 });
  assert.deepEqual(buildUserPayload({ id: 3, email: 'a@b' }, 55), { id: 3, email: 'a@b' });
  assert.equal(userSaveLabel(true, true), '⏳ جاري الحفظ...');
  assert.equal(userSaveLabel(false, { id: 1 }), '✓ حفظ التعديل');
  assert.equal(userSaveLabel(false, null), '✓ إضافة مستخدم');
  assert.equal(userSaveLabel(false, undefined), '✓ إضافة مستخدم');
});
