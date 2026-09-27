import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  inPeriod, inClinic, filterPeriodVisits, filterPeriodExpenses, computeRevenue,
  computeTotalExpenses, periodLabel, buildClinicComparison, buildMissingRecurringExpenseEntries,
  reportDateLabel
} from '../src/modules/accounting/model.js';

const ctx = { today: '2026-09-27', month: '2026-09' };

test('inPeriod: today/month/all', () => {
  assert.equal(inPeriod('2026-09-27', 'today', ctx), true);
  assert.equal(inPeriod('2026-09-01', 'today', ctx), false);
  assert.equal(inPeriod('2026-09-15', 'month', ctx), true);
  assert.equal(inPeriod('2026-08-15', 'month', ctx), false);
  assert.equal(inPeriod('2020-01-01', 'all', ctx), true);
});

test('inClinic: empty filter matches everything', () => {
  assert.equal(inClinic('دمنهور', ''), true);
  assert.equal(inClinic('دمنهور', 'دمنهور'), true);
  assert.equal(inClinic('دمنهور', 'الرحمانية'), false);
});

test('filterPeriodVisits filters by period and clinic', () => {
  const visits = [
    { date: '2026-09-27', clinic: 'دمنهور' },
    { date: '2026-09-27', clinic: 'الرحمانية' },
    { date: '2026-08-01', clinic: 'دمنهور' }
  ];
  const result = filterPeriodVisits(visits, { period: 'today', ...ctx, clinicFilter: 'دمنهور' });
  assert.equal(result.length, 1);
});

test('filterPeriodExpenses filters and sorts newest date first', () => {
  const expenses = [
    { date: '2026-09-01', amount: 10 },
    { date: '2026-09-20', amount: 20 },
    { date: '2026-08-01', amount: 30 }
  ];
  const result = filterPeriodExpenses(expenses, { period: 'month', ...ctx, clinicFilter: '' });
  assert.deepEqual(result.map(e => e.date), ['2026-09-20', '2026-09-01']);
});

test('computeRevenue only counts paid visits', () => {
  const visits = [{ paid: true, cost: 100 }, { paid: false, cost: 200 }, { paid: true, cost: '50' }];
  assert.equal(computeRevenue(visits), 150);
});

test('computeTotalExpenses sums amounts', () => {
  assert.equal(computeTotalExpenses([{ amount: 10 }, { amount: '5' }, {}]), 15);
});

test('periodLabel returns the Arabic label', () => {
  assert.equal(periodLabel('today'), 'اليوم');
  assert.equal(periodLabel('month'), 'هذا الشهر');
  assert.equal(periodLabel('all'), 'كل الفترة');
});

test('buildClinicComparison computes per-clinic revenue/expense/net', () => {
  const clinics = [{ v: 'دمنهور', l: 'عيادة دمنهور' }, { v: 'الرحمانية', l: 'عيادة الرحمانية' }];
  const visits = [{ date: '2026-09-27', clinic: 'دمنهور', paid: true, cost: 100 }];
  const expenses = [{ date: '2026-09-27', clinic: 'دمنهور', amount: 30 }];
  const result = buildClinicComparison(visits, expenses, clinics, { period: 'month', ...ctx });
  assert.equal(result[0].revenue, 100);
  assert.equal(result[0].expense, 30);
  assert.equal(result[0].net, 70);
  assert.equal(result[1].revenue, 0);
});

test('buildMissingRecurringExpenseEntries creates one entry per not-yet-materialized recurring expense', () => {
  const recurring = [{ id: 'r1', category: 'إيجار', amount: 500, clinic: 'دمنهور', notes: '' }];
  const expenses = [];
  const entries = buildMissingRecurringExpenseEntries(recurring, expenses, {
    monthStr: '2026-09', todayStr: '2026-09-27', makeId: () => 'fixed-id'
  });
  assert.equal(entries.length, 1);
  assert.equal(entries[0].recurringId, 'r1');
  assert.equal(entries[0].notes, 'مصروف شهري ثابت');
  assert.equal(entries[0].id, 'fixed-id');
});

test('buildMissingRecurringExpenseEntries skips ones already materialized this month', () => {
  const recurring = [{ id: 'r1', category: 'إيجار', amount: 500 }];
  const expenses = [{ recurringId: 'r1', date: '2026-09-05' }];
  const entries = buildMissingRecurringExpenseEntries(recurring, expenses, { monthStr: '2026-09', todayStr: '2026-09-27' });
  assert.equal(entries.length, 0);
});

test('buildMissingRecurringExpenseEntries returns empty for no recurring expenses', () => {
  assert.deepEqual(buildMissingRecurringExpenseEntries([], [], { monthStr: '2026-09', todayStr: '2026-09-27' }), []);
  assert.deepEqual(buildMissingRecurringExpenseEntries(null, [], { monthStr: '2026-09', todayStr: '2026-09-27' }), []);
});

test('reportDateLabel formats by period', () => {
  const fixedNow = new Date('2026-09-27T10:00:00Z');
  assert.equal(reportDateLabel('month', '2026-09', fixedNow), 'شهر 2026-09');
  assert.equal(reportDateLabel('all', '2026-09', fixedNow), 'كل الفترة');
  assert.match(reportDateLabel('today', '2026-09', fixedNow), /سبتمبر/);
});
