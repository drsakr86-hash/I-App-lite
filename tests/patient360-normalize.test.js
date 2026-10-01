import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizePatientFile, buildPatientTimeline, filterPatientTimeline, mergeByIdentity, visitKeys, requestKeys,
  coreFileMatchesPatient, medicinesToText, mapCoreRx, mapCoreRequests
} from '../src/modules/patient-file/normalize.js';

// Synthetic fixtures only (no real patient data).
const P = { id: 7, name: 'مريض تجريبي', patientCode: 'T-0007' };
const COLORS = { teal: '#t', gold: '#g', accent: '#a', purple: '#p' };
const core = (extra = {}) => ({ found: true, patient_code: 'T-0007', full_name: 'مريض تجريبي', ...extra });

test('exam present in both sources appears once, legacy wins, provenance kept', () => {
  const legacy = { exams: [{ id: 101, patientId: 7, date: '2026-03-01', diagnosis: 'edited locally', doctor: 'د. أ' }] };
  const file = core({ examinations: [{ id: 'uuid-1', legacy_id: '101', examination_date: '2026-03-01', diagnosis_summary: 'old core text', visit_id: 'v-1' }] });
  const n = normalizePatientFile({ patient: P, coreFile: file, legacy });
  assert.equal(n.exams.length, 1);
  assert.equal(n.exams[0].diagnosis, 'edited locally');
  assert.deepEqual(n.exams[0]._sources, ['legacy', 'core']);
  assert.equal(n.exams[0]._coreId, 'uuid-1');
  assert.equal(n.exams[0]._coreVisitId, 'v-1');
});

test('core-only exam is kept and linked to the patient and its encounter', () => {
  const file = core({ examinations: [{ id: 'uuid-2', examination_date: '2026-02-01', visit_id: 'v-9' }] });
  const n = normalizePatientFile({ patient: P, coreFile: file, legacy: { exams: [] } });
  assert.equal(n.exams.length, 1);
  assert.equal(n.exams[0].patientId, 7);
  assert.equal(n.exams[0]._coreVisitId, 'v-9');
  assert.deepEqual(n.exams[0]._sources, ['core']);
});

test('shadow visit (exam-visit:<id>) and its Core visit (legacy_id exam:<id>) are one visit even without _coreId', () => {
  const legacy = { visits: [{ id: 'exam-visit:55', patientId: 7, date: '2026-04-01', type: 'clinic' }] };
  const file = core({ visits: [{ id: 'cv-1', legacy_id: 'exam:55', visit_date: '2026-04-01', visit_type: 'clinic' }] });
  const n = normalizePatientFile({ patient: P, coreFile: file, legacy });
  assert.equal(n.visits.length, 1);
  assert.equal(n.visits[0]._coreId, 'cv-1');
});

test('numeric legacy visit matches Core visit by legacy_id; different visits on the same date stay separate', () => {
  const legacy = { visits: [{ id: 12, patientId: 7, date: '2026-04-01' }, { id: 13, patientId: 7, date: '2026-04-01' }] };
  const file = core({ visits: [{ id: 'cv-a', legacy_id: '12', visit_date: '2026-04-01' }, { id: 'cv-b', visit_date: '2026-04-01' }] });
  const n = normalizePatientFile({ patient: P, coreFile: file, legacy });
  assert.equal(n.visits.length, 3); // 12 (merged with cv-a), 13, cv-b (unrelated, no legacy id)
  assert.equal(n.visits.filter(v => v._sources.length === 2).length, 1);
});

test('visitKeys only alias known shadow prefixes', () => {
  assert.ok(visitKeys({ id: 'rx-visit:9' }).includes('lid:rx:9'));
  assert.ok(visitKeys({ id: 'radiology-visit:9' }).includes('lid:radiology:9'));
  assert.ok(!visitKeys({ id: 'weird-visit:9' }).includes('lid:weird:9'));
  assert.ok(visitKeys({ id: 'core-visit:abc' }).includes('core:abc'));
});

test('legacy investigation request and Core order are one request (matched by Core order id, not by text)', () => {
  const legacy = { exams: [{ id: 900, patientId: 7, date: '2026-05-01', status: 'requested', requestedTests: [{ id: 'oct', name: 'OCT' }], imagingOrderId: 'ORD-900', coreInvestigationOrderId: '31', coreImagingOrderId: '8' }] };
  const file = core({
    investigation_orders: [{ id: 31, ordered_at: '2026-05-01T09:30:00Z', test_name: 'OCT', status: 'requested' }],
    imaging_orders: [{ id: 8, investigation_order_id: 31 }]
  });
  const n = normalizePatientFile({ patient: P, coreFile: file, legacy });
  assert.equal(n.requests.length, 1);
  assert.deepEqual(n.requests[0]._sources, ['legacy', 'core']);
});

test('requests with the same test and date but different order ids are NOT merged', () => {
  const legacy = { exams: [{ id: 901, patientId: 7, date: '2026-05-01', requestedTests: [{ id: 'oct', name: 'OCT' }], coreInvestigationOrderId: '31' }] };
  const file = core({ investigation_orders: [{ id: 32, ordered_at: '2026-05-01T09:30:00Z', test_name: 'OCT' }] });
  assert.equal(normalizePatientFile({ patient: P, coreFile: file, legacy }).requests.length, 2);
});

test('Core order carrying source_exam_legacy_id matches the legacy request even if the legacy copy lacks Core ids', () => {
  const legacy = { exams: [{ id: 902, patientId: 7, date: '2026-05-02', requestedTests: [{ id: 'ffa', name: 'FFA' }], coreSyncError: 'timeout' }] };
  const file = core({ investigation_orders: [{ id: 40, ordered_at: '2026-05-02T10:00:00Z', source_exam_legacy_id: '902' }] });
  assert.equal(normalizePatientFile({ patient: P, coreFile: file, legacy }).requests.length, 1);
  assert.ok(requestKeys({ id: 902 }).includes('src:902'));
});

test('invalid ordered_at never produces "Invalid Date"', () => {
  const r = mapCoreRequests(core({ investigation_orders: [{ id: 1, ordered_at: 'not-a-date' }] }), P, '2026-01-01');
  assert.equal(r[0].time, '');
});

test('rows that explicitly belong to another patient are dropped, a foreign Core file is ignored', () => {
  const file = core({ examinations: [{ id: 'a', patient_id: 7 }, { id: 'b', patient_id: 8 }] });
  assert.equal(normalizePatientFile({ patient: P, coreFile: file }).exams.length, 1);
  const foreign = core({ patient_code: 'T-0099', examinations: [{ id: 'c' }] });
  assert.equal(coreFileMatchesPatient(foreign, P), false);
  const n = normalizePatientFile({ patient: P, coreFile: foreign, legacy: { exams: [{ id: 1, patientId: 7, date: '2026-01-01' }] } });
  assert.equal(n.coreMatched, false);
  assert.equal(n.exams.length, 1); // legacy still shown
});

test('legacy records of another patient are never shown', () => {
  const n = normalizePatientFile({ patient: P, legacy: { exams: [{ id: 1, patientId: 8, date: '2026-01-01' }], visits: [{ id: 2, patientId: 8 }], rx: [{ id: 3, patientId: 8 }] } });
  assert.equal(n.exams.length + n.visits.length + n.rxList.length, 0);
});

test('missing / malformed payloads do not throw', () => {
  const bad = [null, undefined, {}, { found: true }, core({ examinations: 'x', visits: [null, 5, {}], prescriptions: {}, investigation_orders: [null], imaging_studies: [{ files: 'no' }], journey: 7 })];
  for (const f of bad) {
    const n = normalizePatientFile({ patient: P, coreFile: f, legacy: { exams: [null, { id: 1, patientId: 7 }], visits: undefined, rx: 'x' }, metaImages: 'nope' });
    assert.ok(Array.isArray(n.exams) && Array.isArray(n.images));
    assert.doesNotThrow(() => buildPatientTimeline({ ...n, coreFile: f, patient: P }, COLORS));
  }
  assert.throws(() => normalizePatientFile({}), /patient is required/);
});

test('Core medicines array becomes text (an array of objects would crash React rendering)', () => {
  assert.equal(medicinesToText([{ name: 'Drop A', frequency: '3x' }, { name: 'Drop B' }]), 'Drop A — 3x\nDrop B');
  assert.equal(medicinesToText('plain'), 'plain');
  assert.equal(medicinesToText(null), '');
  const rx = mapCoreRx(core({ prescriptions: [{ id: 'r1', legacy_id: '5', medicines: [{ name: 'X' }] }] }), P);
  assert.equal(typeof rx[0].medicines, 'string');
  assert.equal(rx[0].id, 5);
});

test('images de-duplicate by public_id / id / url; metadata wins; core study order link is kept', () => {
  const meta = [{ id: 'pid1', public_id: 'pid1', src: 'https://x/1.jpg', notes: 'my note', orderId: 'ORD-1' }];
  const file = core({ imaging_studies: [{ id: 4, investigation_order_id: 31, cloudinary_public_id: 'pid1', cloudinary_url: 'https://x/1.jpg', study_type: 'OCT' }, { id: 5, cloudinary_public_id: 'pid2', cloudinary_url: 'https://x/2.jpg' }] });
  const n = normalizePatientFile({ patient: P, coreFile: file, metaImages: meta });
  assert.equal(n.images.length, 2);
  assert.equal(n.images.find(i => i.public_id === 'pid1').notes, 'my note');
  assert.equal(n.images.find(i => i.public_id === 'pid2').coreStudyId, '5');
});

test('timeline: each clinical event once, newest first, undated last, stable keys, source tab', () => {
  const legacy = {
    exams: [{ id: 1, patientId: 7, date: '2026-03-01', diagnosis: 'DME', doctor: 'د. أ' }],
    visits: [{ id: 'exam-visit:1', patientId: 7, date: '2026-03-01', type: 'clinic' }, { id: 20, patientId: 7 }],
    rx: [{ id: 3, patientId: 7, date: '2026-03-02', notes: 'drops' }]
  };
  const file = core({
    visits: [{ id: 'cv-1', legacy_id: 'exam:1', visit_date: '2026-03-01' }],
    examinations: [{ id: 'cx-1', legacy_id: '1', examination_date: '2026-03-01', visit_id: 'cv-1' }]
  });
  const n = normalizePatientFile({ patient: P, coreFile: file, legacy });
  const ev = buildPatientTimeline({ ...n, coreFile: file, patient: P }, COLORS);
  assert.deepEqual(ev.map(e => e.kind), ['prescription', 'examination', 'visit', 'visit']);
  assert.equal(new Set(ev.map(e => e.key)).size, ev.length);
  assert.equal(ev[ev.length - 1].date, ''); // undated last
  assert.equal(ev.find(e => e.kind === 'examination').source.tab, 'exams');
  assert.equal(ev.find(e => e.kind === 'prescription').source.tab, 'rx');
});

test('timeline: Core diagnosis that mirrors the exam on the same encounter is not shown twice; a different one is', () => {
  const legacy = { exams: [{ id: 1, patientId: 7, date: '2026-03-01', diagnosis: 'DME', treatmentPlan: 'Anti-VEGF', followUp: '2026-04-01' }] };
  const file = core({
    examinations: [{ id: 'cx', legacy_id: '1', visit_id: 'cv-1' }],
    diagnoses: [{ id: 1, visit_id: 'cv-1', diagnosis: ' dme ' }, { id: 2, visit_id: 'cv-1', diagnosis: 'Cataract', created_at: '2026-03-01T10:00:00Z' }],
    treatments: [{ id: 1, visit_id: 'cv-1', treatment: 'Anti-VEGF' }],
    followups: [{ id: 1, visit_id: 'cv-1', followup_date: '2026-04-01' }, { id: 2, visit_id: 'cv-2', followup_date: '2026-06-01', reason: 'IOP check' }]
  });
  const n = normalizePatientFile({ patient: P, coreFile: file, legacy });
  const ev = buildPatientTimeline({ ...n, coreFile: file, patient: P }, COLORS);
  assert.deepEqual(ev.filter(e => e.kind === 'diagnosis').map(e => e.detail), ['Cataract']);
  assert.equal(ev.filter(e => e.kind === 'treatment').length, 0);
  assert.deepEqual(ev.filter(e => e.kind === 'followup').map(e => e.date), ['2026-06-01']);
});

test('timeline: offline-only local records still appear while Core is loaded (no longer replaced by the journey)', () => {
  const legacy = { exams: [{ id: 77, patientId: 7, date: '2026-09-01', diagnosis: 'saved offline' }] };
  const file = core({ examinations: [{ id: 'cx', legacy_id: '5', examination_date: '2026-01-01' }], journey: [{ event_type: 'visit', event_date: '2026-01-01' }] });
  const n = normalizePatientFile({ patient: P, coreFile: file, legacy });
  const ev = buildPatientTimeline({ ...n, coreFile: file, patient: P }, COLORS);
  assert.ok(ev.some(e => e.detail.includes('saved offline')));
});

test('timeline filter + search', () => {
  const ev = [
    { type: 'فحص', title: 'A', detail: 'Glaucoma', doctor: '' },
    { type: 'زيارة', title: 'B', detail: '', doctor: 'Dr X' }
  ];
  assert.equal(filterPatientTimeline(ev, 'فحص', '').length, 1);
  assert.equal(filterPatientTimeline(ev, 'All', 'dr x').length, 1);
  assert.equal(filterPatientTimeline(ev, 'All', '').length, 2);
});

test('mergeByIdentity does not mutate its inputs', () => {
  const l = [{ id: 1 }]; const c = [{ id: 1, _core: true, _coreId: 'z' }];
  const copy = JSON.stringify([l, c]);
  mergeByIdentity(l, c, r => ['lid:' + r.id]);
  assert.equal(JSON.stringify([l, c]), copy);
});
