import test from 'node:test';
import assert from 'node:assert/strict';
import { prescriptionParamsFromLegacy } from '../src/modules/prescriptions/index.js';
import { imagingRequestParams, singleImagingOrderParams } from '../src/modules/investigations/index.js';
import { imagingStudyParams } from '../src/modules/imaging/index.js';

test('prescription params: nulls, eye default, medicines normalisation', () => {
  const p = prescriptionParamsFromLegacy({ id: 9, patientId: '4', sphR: '-1.5', medicines: 'drops' }, { visitId: 12, today: '2026-09-26' });
  assert.equal(p.p_patient_id, 4);
  assert.equal(p.p_prescription_date, '2026-09-26');
  assert.equal(p.p_eye, 'OU');
  assert.equal(p.p_sph_od, '-1.5');
  assert.equal(p.p_cyl_od, null);
  assert.deepEqual(p.p_medicines, [{ name: 'drops' }]);
  assert.equal(p.p_legacy_id, '9');
  assert.equal(p.p_visit_id, 12);
});

test('imaging request: eye is OU unless every test shares one eye', () => {
  const base = { patientId: 1, visitId: 2, requestNotes: '', doctorName: 'Dr', sourceLegacyId: 5 };
  assert.equal(imagingRequestParams({ ...base, tests: [{ id: 'oct', name: 'OCT', eye: 'OD' }, { id: 'fa', name: 'FA', eye: 'OS' }] }).p_eye, 'OU');
  const one = imagingRequestParams({ ...base, tests: [{ id: 'oct', name: 'OCT', eye: 'OD' }] });
  assert.equal(one.p_eye, 'OD');
  assert.equal(one.p_test_name, 'OCT');
  assert.equal(one.p_source_exam_legacy_id, '5');
});

test('single imaging order and study params', () => {
  const o = singleImagingOrderParams({ patientId: 1, typeName: 'OCT', type: 'oct', eye: 'OD', doctorName: '', notes: '  ', sourceLegacyId: 7 });
  assert.equal(o.p_clinical_note, null);
  assert.equal(o.p_visit_id, null);
  const s = imagingStudyParams({ orderId: '3', typeName: 'OCT', modality: 'oct', eye: 'OD', uploaded: [{ public_id: 'a', src: 'u' }], report: ' r ', notes: '' });
  assert.equal(s.p_investigation_order_id, 3);
  assert.equal(s.p_cloudinary_public_id, 'a');
  assert.equal(s.p_report, 'r');
  assert.equal(s.p_notes, null);
});
