import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_APT_DOCTOR_NAMES, blankApt, initialAptState, hasSchedulingConflict, aptSaveOutcome, APT_CONFLICT_MESSAGE
} from '../src/components/forms/apt-form-model.js';
import {
  blankExpense, initialExpenseState, blankRecurringExpense, initialRecurringExpenseState,
  isValidExpense, isValidRecurringExpense, buildExpenseSavePayload
} from '../src/components/forms/accounting-forms-model.js';

// ---- AptForm ----

test('blankApt / initialAptState: add mode gets the fixed defaults, edit mode merges over them', () => {
  const blank = blankApt('2026-10-01', 'دمنهور');
  assert.deepEqual(blank, {
    patient: '', date: '2026-10-01', time: '09:00', type: '', doctor: 'د. عبدالستار', clinic: 'دمنهور'
  });
  assert.deepEqual(initialAptState(null, '2026-10-01', 'دمنهور'), blank);

  const edited = initialAptState({ id: 1, patient: 'أحمد', date: '2026-09-01', time: '10:00', type: 'متابعة', doctor: 'د. سلمى', clinic: 'الرحمانية' }, '2026-10-01', 'دمنهور');
  assert.deepEqual(edited, { id: 1, patient: 'أحمد', date: '2026-09-01', time: '10:00', type: 'متابعة', doctor: 'د. سلمى', clinic: 'الرحمانية' });
});

test('DEFAULT_APT_DOCTOR_NAMES matches the legacy fallback list', () => {
  assert.deepEqual(DEFAULT_APT_DOCTOR_NAMES, ['د. عبدالستار', 'د. سلمى', 'د. ليلى']);
});

test('hasSchedulingConflict: same doctor+time+date is a conflict, editing itself is not', () => {
  const appointments = [{ id: 1, doctor: 'د. سلمى', time: '10:00', date: '2026-10-01' }];
  const f = { id: 2, doctor: 'د. سلمى', time: '10:00', date: '2026-10-01' };
  assert.equal(hasSchedulingConflict(appointments, f, '2026-10-01'), true);
  assert.equal(hasSchedulingConflict(appointments, { ...f, id: 1 }, '2026-10-01'), false);
  assert.equal(hasSchedulingConflict(appointments, { ...f, time: '11:00' }, '2026-10-01'), false);
});

test('hasSchedulingConflict: a missing date is treated as today on both sides', () => {
  const appointments = [{ id: 1, doctor: 'د. سلمى', time: '10:00', date: '' }];
  const f = { id: 2, doctor: 'د. سلمى', time: '10:00', date: undefined };
  assert.equal(hasSchedulingConflict(appointments, f, '2026-10-01'), true);
});

test('aptSaveOutcome: empty patient name is a silent no-op', () => {
  assert.deepEqual(aptSaveOutcome([], { patient: '' }, '2026-10-01'), { type: 'noop' });
});

test('aptSaveOutcome: a real conflict blocks the save with the legacy message', () => {
  const appointments = [{ id: 1, doctor: 'د. سلمى', time: '10:00', date: '2026-10-01' }];
  const f = { id: 2, patient: 'أحمد', doctor: 'د. سلمى', time: '10:00', date: '2026-10-01' };
  assert.deepEqual(aptSaveOutcome(appointments, f, '2026-10-01'), { type: 'error', message: APT_CONFLICT_MESSAGE });
});

test('aptSaveOutcome: no conflict and a patient name saves', () => {
  const f = { patient: 'أحمد', doctor: 'د. سلمى', time: '10:00', date: '2026-10-01' };
  assert.deepEqual(aptSaveOutcome([], f, '2026-10-01'), { type: 'save' });
});

// ---- ExpenseForm / RecurringExpenseForm ----

test('blankExpense / initialExpenseState: add mode gets defaults, edit mode uses initial as-is (no merge)', () => {
  const blank = blankExpense('2026-10-01', 'إيجار');
  assert.deepEqual(blank, { date: '2026-10-01', category: 'إيجار', amount: '', notes: '', clinic: '' });
  assert.deepEqual(initialExpenseState(null, '2026-10-01', 'إيجار'), blank);

  const initial = { id: 5, date: '2026-08-01', category: 'رواتب', amount: '500', notes: 'ملاحظة' };
  assert.equal(initialExpenseState(initial, '2026-10-01', 'إيجار'), initial);
});

test('blankRecurringExpense / initialRecurringExpenseState: same shape minus date', () => {
  const blank = blankRecurringExpense('إيجار');
  assert.deepEqual(blank, { category: 'إيجار', amount: '', notes: '', clinic: '' });
  assert.equal(Object.prototype.hasOwnProperty.call(blank, 'date'), false);
  assert.deepEqual(initialRecurringExpenseState(null, 'إيجار'), blank);

  const initial = { id: 5, category: 'رواتب', amount: '500', notes: '' };
  assert.equal(initialRecurringExpenseState(initial, 'إيجار'), initial);
});

test('isValidExpense requires a positive amount AND a date; isValidRecurringExpense does not need a date', () => {
  assert.equal(isValidExpense({ amount: '100', date: '2026-10-01' }), true);
  assert.equal(isValidExpense({ amount: '100', date: '' }), false);
  assert.equal(isValidExpense({ amount: '0', date: '2026-10-01' }), false);
  assert.equal(isValidExpense({ amount: '-5', date: '2026-10-01' }), false);
  assert.equal(isValidExpense({ amount: '', date: '2026-10-01' }), false);

  assert.equal(isValidRecurringExpense({ amount: '100' }), true);
  assert.equal(isValidRecurringExpense({ amount: '0' }), false);
  assert.equal(isValidRecurringExpense({ amount: '' }), false);
});

test('buildExpenseSavePayload: keeps an existing id, assigns a fresh one otherwise', () => {
  const withId = buildExpenseSavePayload({ id: 7, amount: '100' });
  assert.equal(withId.id, 7);

  const withoutId = buildExpenseSavePayload({ amount: '100' });
  assert.equal(typeof withoutId.id, 'number');
});
