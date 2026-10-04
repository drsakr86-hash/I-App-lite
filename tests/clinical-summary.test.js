// Patient 360 clinical summary: real values, "not recorded" states, no fabrication, patient isolation.
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildClinicalSummary, NOT_RECORDED, show, lateralityToEye } from '../src/modules/patient-file/clinical-summary.js';

const today = '2026-10-04';
const P = { id: 'p1', name: 'مريض تجريبي', patientCode: 'P-0001', age: 60, gender: 'ذكر' };

test('summary: totally empty input never throws and reports everything as missing', () => {
  const s = buildClinicalSummary({ today });
  assert.equal(s.lastVisit, null);
  assert.equal(s.diagnosis.primary, null);
  assert.deepEqual(s.va, { od: null, os: null });
  assert.deepEqual(s.iop, { od: null, os: null });
  assert.equal(s.treatment, null);
  assert.equal(s.followUp, null);
  assert.equal(s.trend.status, 'insufficient');
  for (const k of ['lastVisit', 'diagnosis', 'va', 'iop', 'cmt', 'treatment', 'followUp']) assert.ok(s.missing.includes(k), k);
});

test('summary: show() prints "غير مسجل" for null / empty / whitespace', () => {
  assert.equal(NOT_RECORDED, 'غير مسجل');
  assert.equal(show(null), NOT_RECORDED);
  assert.equal(show(''), NOT_RECORDED);
  assert.equal(show('   '), NOT_RECORDED);
  assert.equal(show('6/9'), '6/9');
});

test('summary: garbage inputs (null entries, wrong types) are tolerated', () => {
  const s = buildClinicalSummary({ patient: P, exams: [null, 5, 'x', {}], visits: [null], requests: 'nope', rxList: null, images: undefined, injections: [null], appointments: [null], today });
  assert.equal(s.counts.exams, 1); // only the object survives
  assert.equal(s.va.od, null);
});

test('summary: latest value per eye comes from different exams and keeps its own date', () => {
  const exams = [
    { id: 'e1', date: '2026-06-01', visualAcuityR: '6/18', visualAcuityL: '6/6', iopR: '18' },
    { id: 'e2', date: '2026-09-01', visualAcuityR: '6/9' }
  ];
  const s = buildClinicalSummary({ patient: P, exams, today });
  assert.equal(s.va.od.raw, '6/9'); assert.equal(s.va.od.date, '2026-09-01');
  assert.equal(s.va.os.raw, '6/6'); assert.equal(s.va.os.date, '2026-06-01');
  assert.equal(s.iop.os, null, 'no left IOP was ever recorded -> stays null');
});

test('summary: structured values (UCVA/CMT/method) are read from exam.ophth; missing stay null', () => {
  const exams = [{ id: 'e1', date: '2026-09-01', iopR: '16', ophth: { va: { od: { ucva: '6/36', ph: '' } }, cmt: { od: '312' }, iop: { method: 'iCare' } } }];
  const s = buildClinicalSummary({ patient: P, exams, today });
  assert.equal(s.ucva.od.raw, '6/36');
  assert.equal(s.cmt.od.value, 312);
  assert.equal(s.iop.od.method, 'iCare');
  assert.equal(s.cmt.os, null);
  assert.equal(s.cd.od, null);
});

test('summary: eye-specific diagnoses only from structured sources, never parsed from free text', () => {
  const exams = [{ id: 'e1', date: '2026-09-01', diagnosis: 'OD: DME\nOS: normal', ophth: { dx: { od: 'DME', os: '', ou: '' } } }];
  const s = buildClinicalSummary({ patient: P, exams, today });
  assert.equal(s.diagnosis.od.text, 'DME');
  assert.equal(s.diagnosis.os, null, 'left diagnosis must not be guessed from the free text');
  assert.ok(s.diagnosis.primary);
});

test('summary: Core diagnosis laterality maps to the right eye; inactive ones are ignored', () => {
  const coreFile = { diagnoses: [
    { diagnosis: 'Glaucoma', laterality: 'OS', status: 'active', created_at: '2026-08-01T00:00:00Z' },
    { diagnosis: 'Old', laterality: 'OD', status: 'resolved', created_at: '2026-09-01T00:00:00Z' }
  ] };
  const s = buildClinicalSummary({ patient: P, coreFile, today });
  assert.equal(s.diagnosis.os.text, 'Glaucoma');
  assert.equal(s.diagnosis.od, null);
  assert.equal(lateralityToEye('العين اليمنى'), 'od');
  assert.equal(lateralityToEye('weird'), null);
});

test('summary: the regenerated structured block is not duplicated into the primary diagnosis', () => {
  const exams = [{ id: 'e1', date: '2026-09-01', diagnosis: 'سكري\n— تفصيل منظّم —\nOD: DME', ophth: { dx: { od: 'DME' } } }];
  const s = buildClinicalSummary({ patient: P, exams, today });
  assert.equal(s.diagnosis.primary.text, 'سكري');
});

test('summary: next follow-up = nearest future date across sources; overdue only if nothing happened after', () => {
  const exams = [{ id: 'e1', date: '2026-06-01', followUp: '2026-07-01' }];
  const overdue = buildClinicalSummary({ patient: P, exams, today });
  assert.equal(overdue.followUp.overdue, true);
  assert.ok(overdue.alerts.some(a => a.id === 'followup-overdue'));

  const attended = buildClinicalSummary({ patient: P, exams, visits: [{ id: 'v', date: '2026-07-10' }], today });
  assert.equal(attended.followUp, null, 'a visit after the planned date closes the follow-up');

  const upcoming = buildClinicalSummary({ patient: P, exams, injections: [{ id: 'i', patientId: 'p1', date: '2026-09-01', eye: 'العين اليمنى', drug: 'X', nextDate: '2026-10-20' }], today });
  assert.equal(upcoming.followUp.date, '2026-10-20');
  assert.equal(upcoming.followUp.overdue, false);
  assert.equal(upcoming.followUp.daysUntil, 16);
});

test('summary: other patients\' injections and appointments never leak in', () => {
  const inj = [{ id: 'i', patientId: 'OTHER', date: '2026-09-01', eye: 'العين اليمنى', drug: 'X', nextDate: '2026-10-20' }];
  const apt = [{ patientId: 'OTHER', date: '2026-10-10' }];
  const s = buildClinicalSummary({ patient: P, injections: inj, appointments: apt, today });
  assert.equal(s.followUp, null);
  assert.equal(s.counts.injections, 0);
});

test('summary: high IOP raises an alert with the recorded value; normal IOP does not', () => {
  const hi = buildClinicalSummary({ patient: P, exams: [{ id: 'e', date: '2026-09-01', iopR: '28', iopL: '15' }], today });
  assert.ok(hi.alerts.some(a => a.id === 'iop-od' && a.text.includes('28')));
  assert.ok(!hi.alerts.some(a => a.id === 'iop-os'));
});

test('summary: allergy appears as a danger alert only when recorded', () => {
  assert.ok(buildClinicalSummary({ patient: { ...P, allergies: 'بنسلين' }, today }).alerts.some(a => a.id === 'allergy' && a.level === 'danger'));
  assert.ok(!buildClinicalSummary({ patient: P, today }).alerts.some(a => a.id === 'allergy'));
});

test('summary: pending investigations are listed from the request chains', () => {
  const requests = [
    { id: 'r1', requestedTests: [{ name: 'OCT', eye: 'OD' }], status: 'requested', date: '2026-09-01' },
    { id: 'r2', requestedTests: [{ name: 'VF' }], status: 'completed', date: '2026-09-01' }
  ];
  const s = buildClinicalSummary({ patient: P, requests, today });
  assert.equal(s.pending.length, 1);
  assert.deepEqual(s.pending[0].tests, ['OCT']);
  assert.equal(s.pending[0].days, 33);
  assert.ok(s.alerts.some(a => a.id === 'pending-old'));
});

test('summary: treatment is null until something is actually recorded', () => {
  assert.equal(buildClinicalSummary({ patient: P, exams: [{ id: 'e', date: '2026-09-01' }], today }).treatment, null);
  const s = buildClinicalSummary({ patient: P, exams: [{ id: 'e', date: '2026-09-01', treatmentPlan: 'قطرة' }], today });
  assert.equal(s.treatment.plan.text, 'قطرة');
});
