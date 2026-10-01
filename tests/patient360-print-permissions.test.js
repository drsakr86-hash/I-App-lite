import test from 'node:test';
import assert from 'node:assert/strict';
import { getPatientFileHTML } from '../src/modules/print/index.js';
import { can, PERMISSIONS, ROLES } from '../src/app/permissions.js';

const P = { id: 7, name: 'مريض <b>تجريبي</b>', patientCode: 'T-0007', age: 40, gender: 'ذكر', phone: '010' };
const PRIMARY = { name: 'د. تجريبي' };

test('print: a visit without a date and an exam without a date do not crash the printout', () => {
  const html = getPatientFileHTML(P, [{ patientId: 7, type: 'كشف' }, { patientId: 7, date: '2026-01-01' }], [{ patientId: 7, diagnosis: 'x' }], [], PRIMARY, {});
  assert.match(html, /T-0007/);
});

test('print: patient identity, code, clinician and print date are present and HTML-escaped', () => {
  const html = getPatientFileHTML(P, [], [{ patientId: 7, date: '2026-03-01', doctor: 'د. فحص', diagnosis: 'DME' }], [], PRIMARY, {});
  assert.match(html, /T-0007/);
  assert.match(html, /د\. تجريبي/);                 // clinic doctor in header
  assert.match(html, /آخر فحص سريري \(2026-03-01\) · د\. فحص/); // examining clinician
  assert.match(html, /تقرير بتاريخ/);
  assert.doesNotMatch(html, /<b>تجريبي<\/b>/);       // escaped
  assert.match(html, /&lt;b&gt;/);
});

test('print: investigation requests are not printed as the "last examination"', () => {
  const exams = [
    { patientId: 7, date: '2026-02-01', diagnosis: 'real exam' },
    { patientId: 7, date: '2026-09-01', status: 'requested', requestedTests: [{ name: 'OCT' }] }
  ];
  const html = getPatientFileHTML(P, [], exams, [], PRIMARY, {});
  assert.match(html, /آخر فحص سريري \(2026-02-01\)/);
});

test('print: full exam history, prescriptions (text or Core array) and other patients\' data', () => {
  const exams = [
    { patientId: 7, date: '2026-02-01', diagnosis: 'A', treatmentPlan: 'T1', followUp: '2026-03-01', doctor: 'د. 1' },
    { patientId: 7, date: '2026-01-01', diagnosis: 'B' },
    { patientId: 8, date: '2026-01-01', diagnosis: 'OTHER-PATIENT-SECRET' }
  ];
  const rx = [{ patientId: 7, date: '2026-02-02', medicines: [{ name: 'Drop A' }] }, { patientId: 7, date: '2026-01-02', medicines: 'نص' }];
  const html = getPatientFileHTML(P, [], exams, rx, PRIMARY, {});
  assert.match(html, /سجل الفحوصات \(2\)/);
  assert.match(html, /T1/);
  assert.match(html, /الوصفات \(2\)/);
  assert.match(html, /Drop A/);
  assert.doesNotMatch(html, /OTHER-PATIENT-SECRET/);
});

// Permission matrix (UI-level only: backend RLS is verified separately, see docs/SECURITY.md).
test('permission matrix: roles and protected operations', () => {
  assert.equal(can(ROLES.ADMIN, 'users', 'write'), true);
  assert.equal(can(ROLES.DOCTOR, 'examinations', 'write'), true);
  assert.equal(can(ROLES.DOCTOR, 'users', 'write'), false);
  assert.equal(can(ROLES.DOCTOR, 'payments', 'write'), false);
  assert.equal(can(ROLES.SECRETARY, 'examinations', 'read'), false);
  assert.equal(can(ROLES.SECRETARY, 'prescriptions', 'write'), false);
  assert.equal(can(ROLES.SECRETARY, 'payments', 'write'), true);
  assert.equal(can(ROLES.EMPLOYEE, 'patients', 'write'), false);
  assert.equal(can(ROLES.EMPLOYEE, 'visits', 'read'), true);
  assert.equal(can('unknown-role', 'patients', 'read'), false);
  assert.equal(can(ROLES.ADMIN, 'nonexistent-resource', 'read'), false);
  assert.deepEqual(Object.keys(PERMISSIONS).sort(), ['admin', 'doctor', 'employee', 'secretary']);
});
