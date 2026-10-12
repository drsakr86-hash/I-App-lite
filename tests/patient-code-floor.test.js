// Audit F-19: file numbers (patientCode) were re-issued after the highest-numbered patient was deleted or merged,
// because nextPatientCode() looked only at the CURRENT list. Production had P-0062..P-0064 each assigned to 3 different people.
import test from 'node:test';
import assert from 'node:assert/strict';
import { nextPatientCode } from '../src/modules/patients/list.js';
import { raiseCodeFloor, readCodeFloor, FLOOR_KEY } from '../src/modules/patients/code-floor.js';
import { PHI_KEEP_KEYS } from '../src/modules/sync/phi-purge.js';

const mem = () => { const m = new Map(); return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => void m.set(k, String(v)), removeItem: k => void m.delete(k) }; };

test('baseline behaviour is unchanged without a floor', () => {
  assert.equal(nextPatientCode([]), 'P-0001');
  assert.equal(nextPatientCode([{ patientCode: 'P-0005' }, { patientCode: 'P-0002' }]), 'P-0006');
});
test('BUG (before fix): deleting the last patient makes the code reusable', () => {
  const before = [{ patientCode: 'P-0001' }, { patientCode: 'P-0002' }];
  const s = mem();
  raiseCodeFloor(before, s);                       // list was seen with P-0002
  const after = [{ patientCode: 'P-0001' }];        // P-0002 deleted / merged away
  assert.equal(nextPatientCode(after), 'P-0002', 'without the floor the number is reused');
  assert.equal(nextPatientCode(after, readCodeFloor(s)), 'P-0003', 'with the floor it is not');
});
test('floor never goes down and ignores junk', () => {
  const s = mem();
  raiseCodeFloor([{ patientCode: 'P-0010' }], s);
  raiseCodeFloor([{ patientCode: 'P-0003' }, { patientCode: 'abc' }, {}, null], s);
  assert.equal(readCodeFloor(s), 10);
  assert.equal(nextPatientCode([], readCodeFloor(s)), 'P-0011');
});
test('unavailable / corrupt storage degrades to the old behaviour instead of throwing', () => {
  const broken = { getItem() { throw new Error('denied'); }, setItem() { throw new Error('denied'); } };
  assert.doesNotThrow(() => raiseCodeFloor([{ patientCode: 'P-0004' }], broken));
  assert.equal(readCodeFloor(broken), 0);
  const junk = mem(); junk.setItem(FLOOR_KEY, 'NaN');
  assert.equal(readCodeFloor(junk), 0);
});
test('the floor survives sign-out (it is not patient data)', () => {
  assert.ok(PHI_KEEP_KEYS.has(FLOOR_KEY));
});

import { fetchServerPatientCode, maxPatientNumber } from '../src/modules/patients/list.js';

test('F-19b: server patient code is used when valid, otherwise null (caller falls back to the local rule)', async () => {
  const ok = { rpc: (n, a) => Promise.resolve({ data: 'P-0065', error: null, _a: [n, a] }) };
  assert.equal(await fetchServerPatientCode(ok, 64), 'P-0065');
  assert.equal(await fetchServerPatientCode({ rpc: () => Promise.resolve({ data: null, error: { code: 'PGRST202' } }) }, 1), null);
  assert.equal(await fetchServerPatientCode({ rpc: () => Promise.resolve({ data: 'garbage', error: null }) }, 1), null);
  assert.equal(await fetchServerPatientCode({ rpc: () => { throw new Error('offline'); } }, 1), null);
  assert.equal(await fetchServerPatientCode(null, 1), null);
  assert.equal(await fetchServerPatientCode({ rpc: () => new Promise(() => {}) }, 1, 20), null, 'timeout');
  let seen; await fetchServerPatientCode({ rpc: (n, a) => { seen = [n, a]; return Promise.resolve({ data: 'P-0010', error: null }); } }, 9.7);
  assert.deepEqual(seen, ['iapp_next_patient_code', { p_floor: 9 }]);
});

test('maxPatientNumber counts archived suffix codes by their number', () => {
  assert.equal(maxPatientNumber([{ patientCode: 'P-0007' }, { patientCode: 'P-0062-D1' }, {}]), 62);
  assert.equal(maxPatientNumber(null), 0);
});
