import test from 'node:test';
import assert from 'node:assert/strict';
import { buildQueueView, estimateWait, fmtWait, transitions } from '../src/modules/queue/model.js';

const T = '2026-09-27';
const apts = [
  { id: 1, date: T, time: '10:00', patient: 'A', doctor: 'د1', waitStatus: 'waiting' },
  { id: 2, date: T, time: '09:00', patient: 'B', doctor: 'د2', waitStatus: 'waiting' },
  { id: 3, date: T, time: '08:00', patient: 'C', waitStatus: 'done', inAt: 1000, doneAt: 1000 + 10 * 60000 },
  { id: 4, date: T, time: '11:00', patient: 'D' },
  { id: 5, date: T, time: '12:00', patient: 'E', waitStatus: 'no-show' },
  { id: 6, date: '2026-09-25', time: '09:00', patient: 'F', waitStatus: 'called' },
  { id: 7, date: T, time: '13:00', patient: 'G', waitStatus: 'postponed' }
];

test('groups today by status and ignores other days', () => {
  const v = buildQueueView(apts, { today: T, doctorNames: ['د1', 'د2', 'د3'] });
  assert.deepEqual(v.waiting.map(a => a.id), [2, 1]);
  assert.equal(v.done.length, 1);
  assert.equal(v.pending.length, 1);
  assert.equal(v.noShow.length, 1);
  assert.equal(v.postponed.length, 1);
  assert.equal(v.called.length, 0);
  assert.deepEqual(v.priorityOptions, ['د1', 'د2']);
});

test('stale = past-day waiting/called/in only', () => {
  const v = buildQueueView(apts, { today: T });
  assert.deepEqual(v.stale.map(a => a.id), [6]);
});

test('priority doctor goes first', () => {
  const v = buildQueueView(apts, { today: T, priorityDoctor: 'د1' });
  assert.deepEqual(v.orderedWaiting.map(a => a.id), [1, 2]);
});

test('average exam duration, default 15 when none', () => {
  assert.equal(buildQueueView(apts, { today: T }).avgDurationMin, 10);
  assert.equal(buildQueueView([], { today: T }).avgDurationMin, 15);
  assert.equal(buildQueueView([], { today: T }).hasDurations, false);
});

test('handles non-array input', () => {
  assert.equal(buildQueueView(null, { today: T }).todayApts.length, 0);
});

test('fmtWait and estimateWait', () => {
  assert.equal(fmtWait(5), '5 د');
  assert.equal(fmtWait(75), '1س 15د');
  const a = { arrivedAt: 1000 };
  assert.equal(estimateWait(a, 0, { clock: 1000 + 7 * 60000, inRoomCount: 0, avgDurationMin: 15 }), 7);
  const b = { arrivedAt: 5 * 60000 };
  assert.equal(estimateWait(b, 2, { clock: 5 * 60000, inRoomCount: 1, avgDurationMin: 10 }), 30);
});

test('transitions do not mutate and set timestamps', () => {
  const a = { id: 1, waitStatus: 'waiting' };
  const c = transitions.call(a, 99);
  assert.equal(a.waitStatus, 'waiting');
  assert.deepEqual(c, { id: 1, waitStatus: 'called', calledAt: 99 });
  assert.equal(transitions.finish(a, 5).doneAt, 5);
  assert.equal(transitions.restoreNoShow({ waitStatus: 'no-show', noShowAt: 1 }).noShowAt, undefined);
  assert.equal(transitions.cancelArrival(a).waitStatus, undefined);
});

test('cancelStatus (admin) returns waiting / called / in-room to not-arrived and clears their timestamps', () => {
  for (const ws of ['waiting', 'called', 'in']) {
    const a = { id: 1, patient: 'x', waitStatus: ws, arrivedAt: 1, calledAt: 2, inAt: 3 };
    const r = transitions.cancelStatus(a);
    assert.equal(r.waitStatus, undefined);
    assert.equal(r.arrivedAt, undefined);
    assert.equal(r.calledAt, undefined);
    assert.equal(r.inAt, undefined);
    assert.equal(r.patient, 'x');
    assert.equal(a.waitStatus, ws); // input not mutated
  }
});
