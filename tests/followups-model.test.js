import test from 'node:test';
import assert from 'node:assert/strict';
import { INJ_KEY, INJ_DRUGS, dueInjections, overdueFollowUps, followUpKey, addDaysISO, hiddenState } from '../src/modules/followups/index.js';

test('INJ_KEY/INJ_DRUGS: unchanged constants', () => {
  assert.equal(INJ_KEY, 'iapp_injections');
  assert.deepEqual(INJ_DRUGS, ['Avastin', 'Lucentis', 'Eylea', 'Ozurdex', 'Triamcinolone', 'Vabysmo']);
});

test('dueInjections: only the latest injection per patient+eye counts, and only when its nextDate is within the window', () => {
  const list = [
    { id: 1, patientId: 1, eye: 'OD', date: '2026-01-01', nextDate: '2026-02-01' },
    { id: 2, patientId: 1, eye: 'OD', date: '2026-02-01', nextDate: '2026-03-01' }, // latest for patient1/OD
    { id: 3, patientId: 2, eye: 'OS', date: '2026-01-01', nextDate: '2099-01-01' } // far future, excluded by the window
  ];
  const today = new Date();
  const soon = new Date(today);
  soon.setDate(soon.getDate() + 5);
  list[1].nextDate = soon.toISOString().slice(0, 10);
  const due = dueInjections(list, 7);
  assert.equal(due.length, 1);
  assert.equal(due[0].id, 2);
});

test('dueInjections: defaults to a 7-day window when days is null', () => {
  const today = new Date();
  const soon = new Date(today);
  soon.setDate(soon.getDate() + 3);
  const list = [{ id: 1, patientId: 1, eye: 'OD', date: '2026-01-01', nextDate: soon.toISOString().slice(0, 10) }];
  assert.equal(dueInjections(list, null).length, 1);
});

test('dueInjections: sorts by nextDate ascending', () => {
  const list = [
    { id: 1, patientId: 1, eye: 'OD', nextDate: '2026-06-05' },
    { id: 2, patientId: 2, eye: 'OD', nextDate: '2026-06-01' }
  ];
  const due = dueInjections(list, 365);
  assert.deepEqual(due.map(x => x.id), [2, 1]);
});

test('overdueFollowUps: a visit with a past nextVisit and no later visit for that patient is overdue', () => {
  const today = new Date().toISOString().slice(0, 10);
  const past = '2020-01-01';
  const visits = [{ id: 1, patientId: 1, date: '2019-12-01', nextVisit: past }];
  const patients = [{ id: 1, name: 'Ahmed', phone: '0100' }];
  const late = overdueFollowUps(visits, patients);
  assert.equal(late.length, 1);
  assert.equal(late[0].patientName, 'Ahmed');
  assert.equal(late[0].patientPhone, '0100');
  assert.ok(late[0].late >= 0);
});

test('overdueFollowUps: a patient who already came back after their due date is not overdue', () => {
  const visits = [
    { id: 1, patientId: 1, date: '2020-01-01', nextVisit: '2020-02-01' },
    { id: 2, patientId: 1, date: '2020-03-01', nextVisit: '' } // came back after the due date
  ];
  const late = overdueFollowUps(visits, []);
  assert.equal(late.length, 0);
});

test('overdueFollowUps: a future nextVisit is not overdue, and a patient appears at most once', () => {
  const future = '2099-01-01';
  const past = '2020-01-01';
  const visits = [
    { id: 1, patientId: 1, date: '2019-01-01', nextVisit: future },
    { id: 2, patientId: 2, date: '2019-01-01', nextVisit: past },
    { id: 3, patientId: 2, date: '2019-06-01', nextVisit: past }
  ];
  const late = overdueFollowUps(visits, []);
  assert.equal(late.length, 1);
  assert.equal(late[0].patientId, 2);
});

test('overdueFollowUps: missing patient record falls back to the visit\'s own patient name and empty phone', () => {
  const visits = [{ id: 1, patientId: 99, patient: 'Sara', date: '2020-01-01', nextVisit: '2020-02-01' }];
  const late = overdueFollowUps(visits, []);
  assert.equal(late[0].patientName, 'Sara');
  assert.equal(late[0].patientPhone, '');
});

test('overdueFollowUps: sorted most-late first', () => {
  const visits = [
    { id: 1, patientId: 1, date: '2020-01-01', nextVisit: '2024-01-01' },
    { id: 2, patientId: 2, date: '2020-01-01', nextVisit: '2020-01-01' }
  ];
  const late = overdueFollowUps(visits, []);
  assert.equal(late[0].patientId, 2); // more days late
});

test('hidden follow-ups: dismissed stays hidden, snoozed hides until its date, a NEW due date shows again', () => {
  const visits = [{ id: 1, patientId: 7, date: '2000-01-01', nextVisit: '2000-02-01' }];
  const key = followUpKey(7, '2000-02-01');
  assert.equal(overdueFollowUps(visits, [], []).length, 1);
  assert.equal(overdueFollowUps(visits, [], [{ key, type: 'dismissed' }]).length, 0);
  assert.equal(overdueFollowUps(visits, [], [{ key, type: 'snoozed', until: '2999-01-01' }]).length, 0);
  assert.equal(overdueFollowUps(visits, [], [{ key, type: 'snoozed', until: '2000-03-01' }]).length, 1); // expired
  const next = [{ id: 2, patientId: 7, date: '2000-01-01', nextVisit: '2000-05-01' }];
  assert.equal(overdueFollowUps(next, [], [{ key, type: 'dismissed' }]).length, 1); // different due date
});

test('hiddenState / addDaysISO', () => {
  assert.equal(hiddenState(null, '2026-10-04'), null);
  assert.equal(hiddenState({ type: 'snoozed', until: '2026-10-04' }, '2026-10-04'), null);
  assert.equal(hiddenState({ type: 'snoozed', until: '2026-10-05' }, '2026-10-04'), 'snoozed');
  assert.equal(addDaysISO('2026-10-28', 7), '2026-11-04');
});
