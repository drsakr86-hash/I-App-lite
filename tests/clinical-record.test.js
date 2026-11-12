import test from 'node:test';
import assert from 'node:assert/strict';
import { eyeFindings, withEyeFindings, amendChanges, isSigned, examStatus, canSignExam, validAmendReason, signExamination, amendExamination, withAmendment, signedFields } from '../src/modules/patient-file/clinical-record.js';

const exam = { id: 'e1', visualAcuityR: '6/6', visualAcuityL: '6/60', iopR: '14', iopL: '30', diagnosis: 'x',
  ophth: { v: 1, va: { od: { ucva: '6/9', ph: '' }, os: { ucva: '6/60', ph: '6/36' } }, cmt: { od: '250', os: '410' }, dx: { od: '', os: 'CRVO', ou: '' } } };

test('OD and OS findings are independent', () => {
  const od = eyeFindings(exam, 'od'), os = eyeFindings(exam, 'os');
  assert.equal(od.va, '6/6'); assert.equal(os.va, '6/60');
  assert.equal(od.cmt, '250'); assert.equal(os.cmt, '410');
  assert.equal(od.dx, ''); assert.equal(os.dx, 'CRVO');
  assert.equal(os.ph, '6/36'); assert.equal(od.ph, '');
  const w = withEyeFindings(exam); assert.deepEqual(w.findingsOd, od); assert.deepEqual(w.findingsOs, os);
});

test('legacy exam without ophth still yields flat values and never invents data', () => {
  const o = eyeFindings({ visualAcuityR: '6/6' }, 'os');
  assert.equal(o.va, ''); assert.equal(o.cmt, '');
});

test('status helpers and roles', () => {
  assert.equal(examStatus({}), 'legacy'); assert.equal(examStatus({ recStatus: 'draft' }), 'draft');
  assert.equal(isSigned({ recStatus: 'signed' }), true);
  assert.equal(canSignExam('doctor'), true); assert.equal(canSignExam('admin'), true); assert.equal(canSignExam('secretary'), false);
  assert.equal(validAmendReason('abcd'), false); assert.equal(validAmendReason(' abcde '), true);
});

test('amend payload carries both eyes and rpc wrappers never throw', async () => {
  const c = amendChanges(exam); assert.equal(c.visual_acuity_od, '6/6'); assert.equal(c.findings_os.dx, 'CRVO');
  const calls = [];
  const ok = async (n, a) => { calls.push([n, a]); return { data: { version_no: 2 }, error: null }; };
  assert.equal((await signExamination(ok, exam)).ok, true);
  assert.equal((await amendExamination(ok, exam, 'abc')).error, 'reason');
  assert.equal((await amendExamination(ok, exam, 'fix typo')).ok, true);
  assert.deepEqual(calls.map(x => x[0]), ['iapp_sign_examination', 'iapp_amend_examination']);
  assert.equal((await signExamination(async () => ({ error: { message: 'nope' } }), exam)).error, 'nope');
  const e2 = withAmendment({ ...exam, recStatus: 'signed', recVersion: 1 }, { version_no: 2 }, 'a@x', 'fix typo', 'T');
  assert.deepEqual(e2.amendments, [{ v: 2, at: 'T', by: 'a@x', reason: 'fix typo' }]); assert.equal(e2.recVersion, 2);
  assert.equal(signedFields({ version_no: 1, signed_at: 'S', signed_by: 'd@x' }).signedBy, 'd@x');
});
