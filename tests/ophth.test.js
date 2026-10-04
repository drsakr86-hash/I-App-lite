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
