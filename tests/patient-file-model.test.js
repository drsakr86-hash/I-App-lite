import test from 'node:test';
import assert from 'node:assert/strict';
import {
  latestExamByDateTime, latestExamByDate, compareRows, buildTimelineEvents, timelineSourceEvents, filterTimeline
} from '../src/modules/patient-file/model.js';

const C = { teal: '#t', gold: '#g', accent: '#a', purple: '#p' };

test('latestExamByDateTime uses date+time and does not mutate input', () => {
  const ex = [
    { id: 1, date: '2026-01-01', time: '09:00' },
    { id: 2, date: '2026-01-01', time: '10:00' },
    { id: 3, date: '2025-12-31', time: '23:00' }
  ];
  assert.equal(latestExamByDateTime(ex).id, 2);
  assert.deepEqual(ex.map(e => e.id), [1, 2, 3]);
  assert.equal(latestExamByDateTime([]), undefined);
  assert.equal(latestExamByDateTime([{ id: 9 }]).id, 9);
});

test('latestExamByDate ignores time (stable: first of equal dates wins)', () => {
  const ex = [
    { id: 1, date: '2026-01-01', time: '09:00' },
    { id: 2, date: '2026-01-01', time: '10:00' },
    { id: 3, date: '2025-05-05' }
  ];
  assert.equal(latestExamByDate(ex).id, 1);
  assert.equal(latestExamByDate([]), undefined);
});

test('compareRows keeps exams with VA/IOP only, oldest first', () => {
  const ex = [
    { id: 1, date: '2026-03-01', iopR: '15' },
    { id: 2, date: '2026-01-01', visualAcuityL: '6/9' },
    { id: 3, date: '2026-02-01', diagnosis: 'only dx' },
    { id: 4, visualAcuityR: '6/6' }
  ];
  assert.deepEqual(compareRows(ex).map(e => e.id), [4, 2, 1]);
  assert.deepEqual(compareRows([]), []);
});

test('buildTimelineEvents maps every source with type, icon and colour', () => {
  const ev = buildTimelineEvents({
    visits: [{ date: '2026-01-02', type: 'كشف', complaint: 'ألم' }],
    requests: [{ date: '2026-01-03', requestedTests: [{ name: 'OCT', eye: 'OD' }, { name: 'FFA' }], notes: 'urgent', doctor: 'د. أ' }],
    exams: [{ date: '2026-01-04', diagnosis: 'DME' }],
    rxList: [{ date: '2026-01-05', notes: 'drops' }],
    images: [{ date: '2026-01-06', type: 'OCT', eye: 'OS', name: 'a.png', notes: 'n' }, { eye: 'OU', name: 'b' }]
  }, C);
  assert.equal(ev.length, 6);
  assert.deepEqual(ev.map(e => e.type), ['زيارة', 'طلب أشعة', 'فحص', 'وصفة', 'صورة', 'صورة']);
  assert.deepEqual(ev.map(e => e.color), ['#t', '#g', '#a', '#g', '#p', '#p']);
  assert.equal(ev[0].title, 'كشف');
  assert.equal(ev[0].detail, 'ألم');
  assert.equal(ev[1].detail, 'المطلوب: OCT (OD)، FFA (OU) · urgent');
  assert.equal(ev[2].title, 'فحص عيون');
  assert.equal(ev[4].detail, 'OS · a.png · n');
  assert.equal(ev[5].detail, 'b');
  assert.equal(ev[5].title, 'صورة طبية');
  assert.deepEqual(buildTimelineEvents({}, C), []);
});

test('timelineSourceEvents prefers the Core 360 journey only when non-empty', () => {
  const journey = [{ type: 'x' }];
  const arrays = { visits: [{ date: '1' }] };
  assert.equal(timelineSourceEvents({ coreSource: '360', coreJourneyEvents: journey, ...arrays }, C), journey);
  assert.equal(timelineSourceEvents({ coreSource: '360', coreJourneyEvents: [], ...arrays }, C).length, 1);
  assert.equal(timelineSourceEvents({ coreSource: 'summary', coreJourneyEvents: journey, ...arrays }, C)[0].type, 'زيارة');
});

test('filterTimeline filters by type and search, newest first then by time', () => {
  const ev = [
    { date: '2026-01-01', time: '08:00', type: 'زيارة', title: 'A', detail: 'Glaucoma check', doctor: '' },
    { date: '2026-01-02', time: '', type: 'فحص', title: 'B', detail: 'dme', doctor: 'Dr X' },
    { date: '2026-01-01', time: '09:00', type: 'فحص', title: 'C', detail: '', doctor: '' }
  ];
  assert.deepEqual(filterTimeline(ev, 'All', '').map(e => e.title), ['B', 'C', 'A']);
  assert.deepEqual(filterTimeline(ev, 'فحص', '').map(e => e.title), ['B', 'C']);
  assert.deepEqual(filterTimeline(ev, 'All', 'GLAUCOMA').map(e => e.title), ['A']);
  assert.deepEqual(filterTimeline(ev, 'All', 'dr x').map(e => e.title), ['B']);
  assert.deepEqual(filterTimeline(ev, 'علاج', '').map(e => e.title), []);
});
