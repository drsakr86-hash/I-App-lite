import test from 'node:test';
import assert from 'node:assert/strict';
import { findPatientForRx, eyeRows } from '../src/modules/prescriptions/list.js';

test('findPatientForRx matches by patientId or name', () => {
  const ps = [{ id: 1, name: 'أ' }, { id: 2, name: 'ب' }];
  assert.equal(findPatientForRx(ps, { patientId: 2, patient: 'x' }).id, 2);
  assert.equal(findPatientForRx(ps, { patient: 'أ' }).id, 1);
  assert.equal(findPatientForRx(ps, { patient: 'غير موجود' }), null);
  assert.equal(findPatientForRx(null, {}), null);
});

test('eyeRows returns right then left with sph/cyl/axis', () => {
  const rx = { sphR: '-1.00', cylR: '-0.5', axisR: 90, sphL: '-1.25', cylL: '', axisL: 0 };
  const rows = eyeRows(rx);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].eye, 'اليمنى');
  assert.equal(rows[0].sph, '-1.00');
  assert.equal(rows[1].eye, 'اليسرى');
  assert.equal(rows[1].axis, 0);
});
