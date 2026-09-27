import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildDashboardStats, averageRating, todayQueueGroups, recentAppointments,
  emergencyPatients, buildDashboardData
} from '../src/modules/dashboard/model.js';

const T = '2026-09-27';
const visits = [
  { date: T, paid: true, cost: '300' },
  { date: T, paid: false, cost: '200' },
  { date: '2026-09-20', paid: true, cost: '500' },
  { date: '2026-08-15', paid: true, cost: '999' }
];

test('today and month revenue, unpaid count', () => {
  const s = buildDashboardStats(visits, { today: T });
  assert.equal(s.todayRevenue, 300);
  assert.equal(s.monthRevenue, 800);
  assert.equal(s.todayVisitCount, 2);
  assert.equal(s.pendingPayment, 1);
});

test('handles empty/non-array visits', () => {
  assert.deepEqual(buildDashboardStats(null, { today: T }), { todayRevenue: 0, monthRevenue: 0, todayVisitCount: 0, pendingPayment: 0 });
});

test('averageRating rounds to one decimal, null when empty', () => {
  assert.equal(averageRating([{ rating: 5 }, { rating: 4 }]), '4.5');
  assert.equal(averageRating([]), null);
  assert.equal(averageRating(undefined), null);
});

test('todayQueueGroups splits by wait status and date', () => {
  const apts = [
    { date: T, waitStatus: 'called', patient: 'A' },
    { date: T, waitStatus: 'waiting', patient: 'B' },
    { date: T, waitStatus: 'in', patient: 'C' },
    { date: '2026-01-01', waitStatus: 'called', patient: 'D' }
  ];
  const g = todayQueueGroups(apts, T);
  assert.equal(g.called.length, 1);
  assert.equal(g.waiting.length, 1);
  assert.equal(g.inRoom.length, 1);
});

test('recentAppointments hides done/cancelled and caps at limit', () => {
  const apts = [
    { id: 1, waitStatus: 'done' },
    { id: 2, cancelled: true },
    { id: 3 }, { id: 4 }, { id: 5 }, { id: 6 }
  ];
  assert.deepEqual(recentAppointments(apts).map(a => a.id), [3, 4, 5, 6]);
  assert.deepEqual(recentAppointments(apts, 2).map(a => a.id), [3, 4]);
});

test('emergencyPatients filters by status', () => {
  assert.deepEqual(emergencyPatients([{ id: 1, status: 'طارئ' }, { id: 2 }]).map(p => p.id), [1]);
});

test('buildDashboardData composes everything', () => {
  const d = buildDashboardData({ patients: [{ id: 1, status: 'طارئ' }], appointments: [{ id: 2, date: T, waitStatus: 'waiting' }], visits, ratings: [{ rating: 3 }] }, { today: T });
  assert.equal(d.todayRevenue, 300);
  assert.equal(d.avgRating, '3.0');
  assert.equal(d.queue.waiting.length, 1);
  assert.equal(d.counts.patients, 1);
  assert.equal(d.counts.emergencies, 1);
  assert.equal(d.counts.appointmentsToday, 1);
});
