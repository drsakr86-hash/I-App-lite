import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPatientFacingSummary, medicineLines } from '../src/modules/patient-file/patient-facing.js';

const today = '2026-10-04';
const P = { id: 'p1', name: 'مريض تجريبي', patientCode: 'P-1', age: 50, gender: 'ذكر' };

test('patient-facing: empty record gives safe defaults, nothing invented', () => {
  const v = buildPatientFacingSummary({ patient: P, today });
  assert.equal(v.diagnosis, null);
  assert.equal(v.medicines, null);
  assert.equal(v.treatment, null);
  assert.deepEqual(v.tests, []);
  assert.equal(v.returnWhen.date, null);
  assert.match(v.returnWhen.text, /لم يُحدَّد/);
});

test('patient-facing: next appointment, medicines (array and text) and pending tests in plain Arabic', () => {
  const v = buildPatientFacingSummary({
    patient: P, today,
    exams: [{ id: 'e', date: '2026-10-01', followUp: '2026-10-20', diagnosis: 'جفاف عين', treatmentPlan: 'قطرة مرطبة' }],
    rxList: [{ id: 'r', date: '2026-10-01', medicines: [{ name: 'Drop A', dose: '3x' }] }],
    requests: [{ id: 'q', requestedTests: [{ name: 'OCT' }], status: 'requested', date: '2026-10-01' }]
  });
  assert.equal(v.returnWhen.date, '2026-10-20');
  assert.deepEqual(v.medicines.lines, ['Drop A — 3x']);
  assert.equal(v.tests[0].name, 'OCT');
  assert.ok(v.nextSteps.length >= 3);
  assert.deepEqual(medicineLines({ medicines: 'قطرة 1\nقطرة 2' }), ['قطرة 1', 'قطرة 2']);
});

test('patient-facing: an overdue follow-up asks the patient to contact the clinic', () => {
  const v = buildPatientFacingSummary({ patient: P, today, exams: [{ id: 'e', date: '2026-06-01', followUp: '2026-07-01' }] });
  assert.match(v.returnWhen.text, /يُرجى التواصل/);
});

test('patient-facing: never exposes clinician-only data (alerts, trends, billing, other patients)', () => {
  const v = buildPatientFacingSummary({ patient: { ...P, allergies: 'x' }, today, exams: [{ id: 'e', date: '2026-06-01', iopR: '30' }], visits: [{ id: 'v', date: '2026-06-01', cost: 500, paid: true }] });
  const dump = JSON.stringify(v);
  for (const k of ['alerts', 'trend', 'cost', 'paid', 'mmHg', 'phone']) assert.ok(!dump.includes(k), k);
});
