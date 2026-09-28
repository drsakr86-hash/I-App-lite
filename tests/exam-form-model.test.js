import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  EXAM_STEPS, EXAM_LAST_STEP, EXAM_COMPLAINTS, VA_OPTIONS, IOP_OPTIONS, IOP_HIGH_LIMIT, EXAM_SELECT_ROWS,
  blankExam, initialExamState, chiefComplaintSelectValue, withChiefComplaintSelect, chiefComplaintInputShown,
  chiefComplaintBadgeShown, isIopHigh, anyIopHigh, prevStep, nextStep, buildExamPayload
} from '../src/components/forms/exam-form-model.js';
import { legacyFunctionSource, legacyConst } from './forms-legacy-source.js';

const SRC = legacyFunctionSource('ExamForm');
const TODAY = '2026-09-28';

test('option lists are the legacy ExamForm lists', () => {
  assert.deepEqual(EXAM_STEPS, legacyConst('STEPS', SRC));
  assert.equal(EXAM_LAST_STEP, 2);
  assert.deepEqual(EXAM_COMPLAINTS, legacyConst('EXAM_COMPLAINTS', SRC));
  assert.deepEqual(VA_OPTIONS, legacyConst('VA_OPTIONS', SRC));
  assert.deepEqual(IOP_OPTIONS, legacyConst('IOP_OPTIONS', SRC));
  assert.equal(IOP_OPTIONS[0], '10');
  assert.equal(IOP_OPTIONS.at(-1), '30');
  assert.equal(IOP_OPTIONS.length, 21);
  assert.ok(SRC.includes('[["رؤية الألوان", "colorVision", ["طبيعي", "غير طبيعي"]], ["Cover Test", "coverTest", ["طبيعي", "إيجابي"]], ["Contrast", "contrast", ["طبيعي", "منخفض"]]]'));
  assert.deepEqual(EXAM_SELECT_ROWS, [
    ['رؤية الألوان', 'colorVision', ['طبيعي', 'غير طبيعي']],
    ['Cover Test', 'coverTest', ['طبيعي', 'إيجابي']],
    ['Contrast', 'contrast', ['طبيعي', 'منخفض']]
  ]);
});

test('blankExam equals the legacy blank (values and key order)', () => {
  const legacy = legacyConst('blank', SRC, { localISO: () => TODAY });
  assert.deepEqual(blankExam(TODAY), legacy);
  assert.deepEqual(Object.keys(blankExam(TODAY)), Object.keys(legacy));
  assert.equal(blankExam(TODAY).doctor, 'د. عبدالستار');
});

test('initialExamState: add vs edit (plain copy, no defaults)', () => {
  assert.deepEqual(initialExamState(null, TODAY), blankExam(TODAY));
  const old = { id: 3, date: '2025-02-02', iopR: 25 };
  const s = initialExamState(old, TODAY);
  assert.deepEqual(s, old);
  assert.notEqual(s, old);
  assert.equal('colorVision' in s, false);
});

test('chief complaint select / input / badge', () => {
  assert.equal(chiefComplaintSelectValue('مياه بيضاء'), 'مياه بيضاء');
  assert.equal(chiefComplaintSelectValue(''), 'أخرى...');
  assert.equal(chiefComplaintSelectValue('نص'), 'أخرى...');
  assert.deepEqual(withChiefComplaintSelect({ chiefComplaint: 'a', x: 1 }, 'صداع'), { chiefComplaint: 'صداع', x: 1 });
  assert.deepEqual(withChiefComplaintSelect({ chiefComplaint: 'a' }, 'أخرى...'), { chiefComplaint: '' });
  assert.deepEqual(withChiefComplaintSelect({ chiefComplaint: 'a' }, ''), { chiefComplaint: '' });
  for (const c of EXAM_COMPLAINTS.slice(0, -1)) {
    assert.equal(chiefComplaintInputShown(c), false, c);
    assert.equal(chiefComplaintBadgeShown(c), c);
  }
  for (const c of ['', 'أخرى...', 'نص حر', undefined]) assert.equal(chiefComplaintInputShown(c), true, String(c));
  assert.equal(chiefComplaintBadgeShown(''), false);
  assert.equal(chiefComplaintBadgeShown('نص حر'), false);
});

test('IOP high flag: strictly above 21 mmHg, numeric strings', () => {
  assert.equal(IOP_HIGH_LIMIT, 21);
  assert.equal(isIopHigh('21'), false);
  assert.equal(isIopHigh('22'), true);
  assert.equal(isIopHigh(30), true);
  assert.equal(isIopHigh(''), false);
  assert.equal(isIopHigh(undefined), false);
  assert.equal(isIopHigh('abc'), false);
  assert.equal(anyIopHigh('10', '22'), true);
  assert.equal(anyIopHigh('22', ''), true);
  assert.equal(anyIopHigh('21', '21'), false);
  assert.equal(anyIopHigh('', ''), false);
});

test('step navigation helpers', () => {
  assert.equal(nextStep(0), 1);
  assert.equal(prevStep(2), 1);
});

test('buildExamPayload: add vs edit, key order', () => {
  const f = blankExam(TODAY);
  const add = buildExamPayload(f, 9, 123);
  assert.deepEqual(add, { ...f, patientId: 9, id: 123 });
  assert.deepEqual(Object.keys(add), [...Object.keys(f), 'patientId', 'id']);
  const edit = buildExamPayload({ id: 50, patientId: 1, diagnosis: 'x' }, 9, 123);
  assert.deepEqual(edit, { id: 50, patientId: 9, diagnosis: 'x' });
  assert.deepEqual(Object.keys(edit), ['id', 'patientId', 'diagnosis']);
});
