import test from 'node:test';
import assert from 'node:assert/strict';
import { globalSearchResults } from '../src/components/global-search-model.js';

const patients = [
  { id: 1, name: 'Ahmed Sakr', patientCode: 'P-0001', phone: '0101234567' },
  { id: 2, name: 'Sara', patientCode: 'P-0002', phone: '0109999999' }
];
const prescriptions = [{ id: 1, patient: 'Ahmed Sakr', date: '2026-01-01', eye: 'OD' }];
const appointments = [{ id: 1, patient: 'Sara', time: '10:00', type: 'كشف' }];

test('globalSearchResults: empty query returns no results and is not "hasResults"', () => {
  const r = globalSearchResults(patients, prescriptions, appointments, '  ');
  assert.equal(r.trimmed, '');
  assert.deepEqual(r.pRes, []);
  assert.deepEqual(r.rRes, []);
  assert.deepEqual(r.aRes, []);
  assert.equal(r.hasResults, false);
});

test('globalSearchResults: matches patients by name, code, or phone', () => {
  assert.equal(globalSearchResults(patients, [], [], 'Ahmed').pRes.length, 1);
  assert.equal(globalSearchResults(patients, [], [], 'P-0002').pRes.length, 1);
  assert.equal(globalSearchResults(patients, [], [], '0109999999').pRes.length, 1);
});

test('globalSearchResults: matches prescriptions and appointments by patient name', () => {
  const r = globalSearchResults(patients, prescriptions, appointments, 'Sara');
  assert.equal(r.pRes.length, 1);
  assert.equal(r.rRes.length, 0); // the prescription belongs to Ahmed, not Sara
  assert.equal(r.aRes.length, 1);
  assert.equal(r.hasResults, true);
});

test('globalSearchResults: a query with no matches anywhere reports hasResults=false', () => {
  const r = globalSearchResults(patients, prescriptions, appointments, 'nonexistent-xyz');
  assert.equal(r.hasResults, false);
});

test('globalSearchResults: caps results at 5 patients, 3 prescriptions, 3 appointments', () => {
  const manyPatients = Array.from({ length: 10 }, (_, i) => ({ id: i, name: 'Test', patientCode: '', phone: '' }));
  const manyRx = Array.from({ length: 10 }, (_, i) => ({ id: i, patient: 'Test' }));
  const manyApt = Array.from({ length: 10 }, (_, i) => ({ id: i, patient: 'Test' }));
  const r = globalSearchResults(manyPatients, manyRx, manyApt, 'Test');
  assert.equal(r.pRes.length, 5);
  assert.equal(r.rRes.length, 3);
  assert.equal(r.aRes.length, 3);
});

test('globalSearchResults: tolerates missing/undefined arrays and fields', () => {
  const r = globalSearchResults(undefined, undefined, undefined, 'x');
  assert.deepEqual(r.pRes, []);
  assert.deepEqual(r.rRes, []);
  assert.deepEqual(r.aRes, []);
});
