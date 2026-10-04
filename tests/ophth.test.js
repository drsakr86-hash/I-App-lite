// Structured ophthalmic exam contract: backward compatible, idempotent, Core mirroring.
import test from 'node:test';
import assert from 'node:assert/strict';
import { blankOphth, normalizeOphth, ophthIsEmpty, applyOphthToExam, examForEditing, stripDerived, DERIVED_MARK, vaOf, iopOf } from '../src/modules/patient-file/ophth.js';

test('ophth: old records without ophth work unchanged', () => {
  const old = { id: 1, date: '2026-01-01', visualAcuityR: '6/9', iopR: '15', diagnosis: 'قصر نظر' };
  assert.equal(vaOf(old, 'od').bcva, '6/9');
  assert.equal(vaOf(old, 'od').ucva, '');
  assert.equal(iopOf(old, 'od').value, 15);
  const saved = applyOphthToExam(old);
  assert.equal(saved.ophth, undefined);
  assert.equal(saved.diagnosis, 'قصر نظر');
});

test('ophth: malformed input is normalised to strings and never throws', () => {
  const n = normalizeOphth({ va: { od: { ucva: 5, ph: { x: 1 } } }, junk: 1, cmt: 'bad' });
  assert.equal(n.va.od.ucva, '5');
  assert.equal(n.va.od.ph, '');
  assert.equal(n.v, 1);
  assert.equal(normalizeOphth(null).v, 1);
  assert.ok(ophthIsEmpty(blankOphth()));
});

test('ophth: apply is idempotent and keeps the clinician\'s own text', () => {
  const exam = { diagnosis: 'سكري', ophth: { dx: { od: 'DME' }, cmt: { od: '300' } } };
  const once = applyOphthToExam(exam);
  const twice = applyOphthToExam(once);
  assert.deepEqual(twice, once);
  assert.ok(once.diagnosis.startsWith('سكري'));
  assert.ok(once.diagnosis.includes(DERIVED_MARK));
  assert.ok(once.diagnosis.includes('OD: DME'));
  assert.equal(stripDerived(once.diagnosis), 'سكري');
});

test('ophth: editing view hides the generated block; clearing the structure removes it on save', () => {
  const saved = applyOphthToExam({ diagnosis: 'سكري', ophth: { dx: { od: 'DME' } } });
  const forEdit = examForEditing(saved);
  assert.equal(forEdit.diagnosis, 'سكري');
  const cleared = applyOphthToExam({ ...forEdit, ophth: blankOphth() });
  assert.equal(cleared.ophth, undefined);
  assert.equal(cleared.diagnosis, 'سكري');
});

test('ophth: structured follow-up reason and investigations are kept in ophth / treatment plan mirror', () => {
  const e = applyOphthToExam({ treatmentPlan: 'حقن', ophth: { plan: { investigation: 'OCT', followUpReason: 'تقييم' } } });
  assert.ok(e.treatmentPlan.includes('فحوصات مطلوبة: OCT'));
  assert.equal(e.ophth.plan.followUpReason, 'تقييم');
});

import { SPH_OPTIONS, CYL_OPTIONS, AXIS_OPTIONS, CD_OPTIONS, ANTERIOR_OPTIONS, POSTERIOR_OPTIONS, ANTERIOR_PARTS as AP, POSTERIOR_PARTS as PP, DX_OPTIONS, INVESTIGATION_OPTIONS, FOLLOWUP_REASON_OPTIONS } from '../src/modules/patient-file/ophth.js';

test('ophth: drop-down lists are complete, unique and numerically sane', () => {
  for (const [k] of AP) assert.ok(ANTERIOR_OPTIONS[k]?.length > 2, 'anterior ' + k);
  for (const [k] of PP) assert.ok(POSTERIOR_OPTIONS[k]?.length > 2, 'posterior ' + k);
  for (const list of [SPH_OPTIONS, CYL_OPTIONS, AXIS_OPTIONS, CD_OPTIONS, DX_OPTIONS, INVESTIGATION_OPTIONS, FOLLOWUP_REASON_OPTIONS, ...Object.values(ANTERIOR_OPTIONS), ...Object.values(POSTERIOR_OPTIONS)]) {
    assert.equal(new Set(list).size, list.length, 'duplicates in list');
  }
  assert.equal(SPH_OPTIONS[0], '-20.00');
  assert.equal(SPH_OPTIONS.at(-1), '+20.00');
  assert.ok(SPH_OPTIONS.includes('Plano') && SPH_OPTIONS.includes('-2.75'));
  assert.ok(!CYL_OPTIONS.includes('0.00') && !CYL_OPTIONS.includes('+0.00'));
  assert.deepEqual([AXIS_OPTIONS[0], AXIS_OPTIONS.at(-1)], ['0', '180']);
  assert.deepEqual([CD_OPTIONS[0], CD_OPTIONS.at(-1)], ['0.1', '1.0']);
});

test('ophth: values from the lists are read back as numbers where numeric (CMT/CD/refraction pipeline)', async () => {
  const { toNumber } = await import('../src/modules/patient-file/ophth.js');
  assert.equal(toNumber('-2.75'), -2.75);
  assert.equal(toNumber('+1.50'), 1.5);
  assert.equal(toNumber('0.7'), 0.7);
});
