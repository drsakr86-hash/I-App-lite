import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  filterImagingPatients, filterStudies, pendingOrdersForPatient, findImagingType, buildTypeFilters,
  resolveStudyTarget, buildStudyRecord, buildImageMeta, buildImagingExamRecord
} from '../src/modules/imaging/model.js';

const TYPES = [
  { id: 'oct', name: 'OCT' },
  { id: 'octa', name: 'OCTA' },
  { id: 'ffa', name: 'FFA' }
];
const patient = { id: 'P1', name: 'Ahmed Ali', patientCode: 'SK-001', phone: '0100' };
const now = { date: '2026-09-27', time: '10:30' };

test('filterImagingPatients matches name/code case-insensitively, phone raw, max 8', () => {
  const list = [patient, { id: 'P2', name: 'Mona', patientCode: 'sk-002', phone: '0122' }];
  assert.deepEqual(filterImagingPatients(list, '  ahmed ').map(p => p.id), ['P1']);
  assert.deepEqual(filterImagingPatients(list, 'SK-00').map(p => p.id), ['P1', 'P2']);
  assert.deepEqual(filterImagingPatients(list, '0122').map(p => p.id), ['P2']);
  const many = Array.from({ length: 12 }, (_, i) => ({ id: i, name: 'n' + i }));
  assert.equal(filterImagingPatients(many, '').length, 8);
});

test('filterStudies filters by type and search and sorts newest first', () => {
  const studies = [
    { id: 1, type: 'oct', patient: 'Ahmed', patientCode: 'A1', date: '2026-01-01', time: '09:00' },
    { id: 2, type: 'ffa', patient: 'Mona', patientCode: 'B2', date: '2026-02-01', time: '09:00' },
    { id: 3, type: 'oct', patient: 'Omar', patientCode: 'C3', date: '2026-01-01', time: '11:00' }
  ];
  assert.deepEqual(filterStudies(studies, { filter: 'all', search: '' }).map(s => s.id), [2, 3, 1]);
  assert.deepEqual(filterStudies(studies, { filter: 'oct', search: '' }).map(s => s.id), [3, 1]);
  assert.deepEqual(filterStudies(studies, { filter: 'all', search: 'B2' }).map(s => s.id), [2]);
  assert.equal(studies[0].id, 1, 'input order untouched by default sort path');
});

test('pendingOrdersForPatient keeps only open orders of that patient', () => {
  const orders = [
    { id: 'a', patientId: 'P1', status: 'requested' },
    { id: 'b', patientId: 'P1', status: 'reported' },
    { id: 'c', patientId: 'P1', status: 'cancelled' },
    { id: 'd', patientId: 'P2', status: 'scheduled' },
    { id: 'e', patientId: 'P1', status: 'in_progress' }
  ];
  assert.deepEqual(pendingOrdersForPatient(orders, 'P1').map(o => o.id), ['a', 'e']);
});

test('findImagingType matches by name or id', () => {
  assert.equal(findImagingType(TYPES, { name: 'FFA' }).id, 'ffa');
  assert.equal(findImagingType(TYPES, { name: 'x', id: 'octa' }).id, 'octa');
  assert.equal(findImagingType(TYPES, { name: 'x', id: 'y' }), undefined);
});

test('buildTypeFilters prepends الكل to every type', () => {
  assert.deepEqual(buildTypeFilters(TYPES), [
    { id: 'all', l: 'الكل' }, { id: 'oct', l: 'OCT' }, { id: 'octa', l: 'OCTA' }, { id: 'ffa', l: 'FFA' }
  ]);
});

test('resolveStudyTarget without an order uses manual type and eye', () => {
  assert.deepEqual(resolveStudyTarget({ selectedOrder: null, selectedOrderTest: null, type: 'oct', eye: 'OD', imagingTypes: TYPES }),
    { chosenTest: null, finalType: 'oct', finalEye: 'OD' });
});

test('resolveStudyTarget with an order picks the selected test (or the first)', () => {
  const order = { id: 'O1', tests: [{ id: 't1', name: 'FFA', eye: 'OS' }, { id: 'octa', name: 'Other' }] };
  let r = resolveStudyTarget({ selectedOrder: order, selectedOrderTest: 'octa', type: 'oct', eye: 'OU', imagingTypes: TYPES });
  assert.equal(r.chosenTest.id, 'octa');
  assert.equal(r.finalType, 'octa');
  assert.equal(r.finalEye, 'OU', 'test without eye falls back to manual eye');
  r = resolveStudyTarget({ selectedOrder: order, selectedOrderTest: 'missing', type: 'oct', eye: 'OU', imagingTypes: TYPES });
  assert.equal(r.chosenTest.id, 't1');
  assert.equal(r.finalType, 'ffa');
  assert.equal(r.finalEye, 'OS');
  const unknown = { tests: [{ id: 'zz', name: 'Unknown' }] };
  r = resolveStudyTarget({ selectedOrder: unknown, selectedOrderTest: null, type: 'oct', eye: 'OD', imagingTypes: TYPES });
  assert.equal(r.finalType, 'oct', 'unknown order test keeps the manual type');
});

test('buildStudyRecord reproduces the legacy record, preferring Core workflow ids', () => {
  const uploaded = [{ id: 'f1', public_id: 'f1', name: 'a.jpg', src: 'https://x/a.jpg', resource_type: 'image' }];
  const rec = buildStudyRecord({
    id: 'IMG-1', selectedPatient: patient, now, primary: { name: 'Dr. Sakr' }, finalType: 'oct', typeName: 'OCT',
    finalEye: 'OU', uploaded, notes: '  note ', report: ' rep ', selectedOrder: { id: 'O1', coreInvestigationOrderId: 'ci-old', coreImagingOrderId: 'cm-old' },
    chosenTest: { id: 't1' }, coreVisitId: 'v1', coreWorkflow: { investigation_order_id: 'ci-new' }, coreStudyId: 's1',
    coreSyncError: null, createdAt: '2026-09-27T08:00:00.000Z'
  });
  assert.deepEqual(rec, {
    id: 'IMG-1', patientId: 'P1', patient: 'Ahmed Ali', patientCode: 'SK-001', date: now.date, time: now.time,
    doctor: 'Dr. Sakr', type: 'oct', typeName: 'OCT', eye: 'OU', files: uploaded, notes: 'note', report: 'rep',
    status: 'reported', orderId: 'O1', orderTestId: 't1', coreVisitId: 'v1', coreInvestigationOrderId: 'ci-new',
    coreImagingOrderId: 'cm-old', coreImagingStudyId: 's1', coreSyncError: null, createdAt: '2026-09-27T08:00:00.000Z'
  });
  assert.deepEqual(Object.keys(rec), ['id', 'patientId', 'patient', 'patientCode', 'date', 'time', 'doctor', 'type', 'typeName', 'eye', 'files', 'notes', 'report', 'status', 'orderId', 'orderTestId', 'coreVisitId', 'coreInvestigationOrderId', 'coreImagingOrderId', 'coreImagingStudyId', 'coreSyncError', 'createdAt']);
});

test('buildStudyRecord offline / no order / blank report defaults', () => {
  const rec = buildStudyRecord({
    id: 'IMG-2', selectedPatient: { id: 'P9', name: 'X' }, now, primary: null, finalType: 'ffa', typeName: 'FFA',
    finalEye: 'OD', uploaded: [], notes: '', report: '   ', selectedOrder: null, chosenTest: null, coreVisitId: null,
    coreWorkflow: null, coreStudyId: null, coreSyncError: 'offline', createdAt: 'T'
  });
  assert.equal(rec.patientCode, '');
  assert.equal(rec.doctor, '');
  assert.equal(rec.status, 'completed');
  assert.equal(rec.orderId, null);
  assert.equal(rec.orderTestId, null);
  assert.equal(rec.coreInvestigationOrderId, null);
  assert.equal(rec.coreImagingOrderId, null);
  assert.equal(rec.coreSyncError, 'offline');
});

test('buildImageMeta maps each uploaded file to a metadata entry', () => {
  const uploaded = [{ id: 'f1', public_id: 'p1', name: 'a.jpg', src: 's1', resource_type: 'image' }, { id: 'f2', public_id: 'p2', name: 'b.pdf', src: 's2' }];
  const meta = buildImageMeta({ uploaded, now, notes: ' n ', typeName: 'OCT', finalEye: 'OS', examId: 'IMG-1' });
  assert.deepEqual(meta[0], { id: 'f1', public_id: 'p1', name: 'a.jpg', date: now.date, time: now.time, src: 's1', notes: 'n', type: 'OCT', eye: 'OS', examId: 'IMG-1' });
  assert.equal(meta.length, 2);
  assert.deepEqual(buildImageMeta({ uploaded: [], now, notes: '', typeName: 'OCT', finalEye: 'OU', examId: 'x' }), []);
});

test('buildImagingExamRecord reproduces the legacy exam record', () => {
  const ex = buildImagingExamRecord({
    id: 'IMG-1', selectedPatient: patient, now, primary: { name: 'Dr' }, typeName: 'OCT', finalEye: 'OU',
    report: ' r ', notes: ' n ', selectedOrder: { id: 'O1' }, uploaded: []
  });
  assert.deepEqual(ex, {
    id: 'EX-IMG-1', patientId: 'P1', date: now.date, time: now.time, doctor: 'Dr', testType: 'OCT', eye: 'OU',
    report: 'r', notes: 'n', status: 'completed', imagingStudyId: 'IMG-1', imagingOrderId: 'O1', files: []
  });
  const ex2 = buildImagingExamRecord({ id: 'I', selectedPatient: patient, now, primary: undefined, typeName: 'T', finalEye: 'OD', report: '', notes: '', selectedOrder: null, uploaded: [] });
  assert.equal(ex2.doctor, '');
  assert.equal(ex2.imagingOrderId, null);
});
