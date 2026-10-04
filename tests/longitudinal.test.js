// Longitudinal comparison: trends, injection intervals, treatment response, insufficient data.
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildLongitudinal, describeChange, THRESHOLDS } from '../src/modules/patient-file/longitudinal.js';
import { vaToLogMar, toNumber } from '../src/modules/patient-file/ophth.js';

const inj = (id, date, eye = 'العين اليمنى', extra = {}) => ({ id, patientId: 'p1', date, eye, drug: 'Eylea', doseNo: 1, ...extra });

test('longitudinal: no data -> insufficient, nothing invented', () => {
  const L = buildLongitudinal({ exams: [], injections: [], patientId: 'p1' });
  assert.equal(L.status, 'insufficient');
  assert.equal(L.rows.length, 0);
  assert.deepEqual(L.changes, []);
  assert.equal(L.sufficiency.va, false);
});

test('longitudinal: a single exam is not enough for any change', () => {
  const L = buildLongitudinal({ exams: [{ id: 'e1', date: '2026-06-01', visualAcuityR: '6/18', iopR: '18' }], patientId: 'p1' });
  assert.equal(L.changes.length, 0);
  assert.equal(L.status, 'insufficient');
});

test('longitudinal: improving VA + falling CMT after injections = responding', () => {
  const exams = [
    { id: 'e1', date: '2026-06-01', visualAcuityR: '6/18', ophth: { cmt: { od: '400' } } },
    { id: 'e2', date: '2026-09-01', visualAcuityR: '6/9', ophth: { cmt: { od: '280' } } }
  ];
  const L = buildLongitudinal({ exams, injections: [inj('i1', '2026-06-05'), inj('i2', '2026-07-05', undefined, { doseNo: 2 })], patientId: 'p1' });
  assert.equal(L.status, 'improving');
  assert.equal(L.treatment[0].status, 'responding');
  const va = L.changes.find(c => c.metric === 'va' && c.eye === 'od');
  assert.equal(va.favorable, true);
  assert.match(describeChange(va), /تحسنت الرؤية/);
});

test('longitudinal: rising IOP is flagged as unfavourable; below threshold is not significant', () => {
  const up = buildLongitudinal({ exams: [{ id: 'a', date: '2026-06-01', iopR: '16' }, { id: 'b', date: '2026-07-01', iopR: '24' }], patientId: 'p1' });
  const c = up.changes.find(x => x.metric === 'iop');
  assert.equal(c.significant, true); assert.equal(c.favorable, false);
  const flat = buildLongitudinal({ exams: [{ id: 'a', date: '2026-06-01', iopR: '16' }, { id: 'b', date: '2026-07-01', iopR: '17' }], patientId: 'p1' });
  assert.equal(flat.changes.find(x => x.metric === 'iop').significant, false);
  assert.equal(THRESHOLDS.iop, 3);
});

test('longitudinal: exams without a valid date are counted as undated and never plotted', () => {
  const L = buildLongitudinal({ exams: [{ id: 'a', visualAcuityR: '6/9' }, { id: 'b', date: 'garbage', visualAcuityR: '6/6' }], patientId: 'p1' });
  assert.equal(L.series.va.od.length, 0);
  assert.ok(L.undated >= 1);
});

test('longitudinal: injection intervals per eye, both-eyes injection counts for each', () => {
  const L = buildLongitudinal({ exams: [], injections: [inj('1', '2026-06-01'), inj('2', '2026-07-01', 'كلتا العينين'), inj('3', '2026-08-15')], patientId: 'p1' });
  assert.deepEqual(L.injectionStats.od.intervals.map(i => i.days), [30, 45]);
  assert.equal(L.injectionStats.os.count, 1);
  assert.equal(L.injectionStats.os.intervals.length, 0);
});

test('longitudinal: injections of another patient are ignored', () => {
  const L = buildLongitudinal({ exams: [], injections: [{ ...inj('x', '2026-06-01'), patientId: 'other' }], patientId: 'p1' });
  assert.equal(L.injectionStats.od.count, 0);
});

test('VA conversion: Snellen/decimal -> logMAR for trend only; unparseable -> null', () => {
  assert.equal(vaToLogMar('6/6').logmar, 0);
  assert.equal(vaToLogMar('6/60').logmar, 1);
  assert.equal(vaToLogMar('CF').logmar, 2);
  assert.equal(vaToLogMar('???'), null);
  assert.equal(vaToLogMar(''), null);
  assert.equal(toNumber('١٨'), 18);
  assert.equal(toNumber('abc'), null);
});
