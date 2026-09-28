import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  GENDERS, BLOOD_TYPES, PATIENT_STATUSES, PATIENT_EDIT_TABS, PATIENT_EDIT_DEFAULT_TAB, blankPatient,
  initialPatientState, normalizeAge, canSavePatient, buildPatientPayload, initialPatientEditState,
  buildPatientEditPayload
} from '../src/components/forms/patient-form-model.js';
import { legacyFunctionSource, legacyConst } from './forms-legacy-source.js';

const SRC_ADD = legacyFunctionSource('PatientForm');
const SRC_EDIT = legacyFunctionSource('PatientEditForm');
const TODAY = '2026-09-28';

test('option lists appear verbatim in both legacy patient forms', () => {
  for (const src of [SRC_ADD, SRC_EDIT]) {
    assert.ok(src.includes('["ذكر", "أنثى"]'));
    assert.ok(src.includes('["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"]'));
    assert.ok(src.includes('["مكتمل", "متابعة", "طارئ"]'));
  }
  assert.deepEqual(GENDERS, ['ذكر', 'أنثى']);
  assert.deepEqual(BLOOD_TYPES, ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-']);
  assert.deepEqual(PATIENT_STATUSES, ['مكتمل', 'متابعة', 'طارئ']);
  assert.deepEqual(PATIENT_EDIT_TABS, legacyConst('TABS', SRC_EDIT));
  assert.equal(PATIENT_EDIT_DEFAULT_TAB, 'basic');
  assert.ok(SRC_EDIT.includes('useState("basic")'));
});

test('blankPatient equals the legacy blank (values and key order)', () => {
  const legacy = legacyConst('blank', SRC_ADD, { localISO: () => TODAY });
  assert.deepEqual(blankPatient(TODAY), legacy);
  assert.deepEqual(Object.keys(blankPatient(TODAY)), Object.keys(legacy));
});

test('initialPatientState: add, edit and the "add from search" seed', () => {
  assert.deepEqual(initialPatientState(null, TODAY), blankPatient(TODAY));
  const p = { id: 1, name: 'أحمد', age: 45 };
  assert.deepEqual(initialPatientState(p, TODAY), p);
  assert.notEqual(initialPatientState(p, TODAY), p);
  // Legacy quirk: the search-name seed replaces the whole blank.
  assert.deepEqual(initialPatientState({ name: 'منى' }, TODAY), { name: 'منى' });
});

test('normalizeAge: "" / null / undefined → "", else Number()', () => {
  assert.equal(normalizeAge(''), '');
  assert.equal(normalizeAge(null), '');
  assert.equal(normalizeAge(undefined), '');
  assert.equal(normalizeAge('45'), 45);
  assert.equal(normalizeAge(45), 45);
  assert.equal(normalizeAge('0'), 0);
  assert.equal(normalizeAge(' 7 '), 7);
  assert.ok(Number.isNaN(normalizeAge('abc')));
  assert.equal(normalizeAge('-3'), -3);
});

test('canSavePatient: name required (legacy truthiness)', () => {
  assert.equal(canSavePatient({ name: '' }), '');
  assert.equal(canSavePatient({}), undefined);
  assert.equal(canSavePatient({ name: 'أحمد' }), 'أحمد');
  assert.equal(canSavePatient({ name: '   ' }), '   '); // whitespace-only passes (legacy gap)
});

test('buildPatientPayload / buildPatientEditPayload: only age changes, key order kept', () => {
  const f = { ...blankPatient(TODAY), name: 'أحمد', age: '45' };
  const out = buildPatientPayload(f);
  assert.deepEqual(out, { ...f, age: 45 });
  assert.deepEqual(Object.keys(out), Object.keys(f));
  assert.deepEqual(buildPatientPayload({ name: 'منى' }), { name: 'منى', age: '' });
  assert.deepEqual(Object.keys(buildPatientPayload({ name: 'منى' })), ['name', 'age']);
  const p = { id: 2, name: 'x', age: '', patientCode: 'P-0002' };
  assert.deepEqual(buildPatientEditPayload(p), p);
  assert.deepEqual(buildPatientEditPayload({ id: 2, age: '30' }), { id: 2, age: 30 });
});

test('initialPatientEditState is a shallow copy of the patient', () => {
  const p = { id: 1, name: 'x', phone: '01' };
  const s = initialPatientEditState(p);
  assert.deepEqual(s, p);
  assert.notEqual(s, p);
});
