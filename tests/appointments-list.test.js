import test from 'node:test';
import assert from 'node:assert/strict';
import { listAppointments, countDone, findPatientForApt, whatsappReminderUrl } from '../src/modules/appointments/list.js';

const apts = [
  { id: 1, doctor: 'A', waitStatus: 'done' },
  { id: 2, doctor: 'A' },
  { id: 3, doctor: 'B', waitStatus: 'waiting' }
];

test('hides finished by default, shows them on request', () => {
  assert.deepEqual(listAppointments(apts).map(a => a.id), [2, 3]);
  assert.deepEqual(listAppointments(apts, { showDone: true }).map(a => a.id), [1, 2, 3]);
});

test('filters by doctor', () => {
  assert.deepEqual(listAppointments(apts, { doctor: 'B' }).map(a => a.id), [3]);
  assert.deepEqual(listAppointments(apts, { doctor: 'A', showDone: true }).map(a => a.id), [1, 2]);
});

test('countDone and non-array input', () => {
  assert.equal(countDone(apts), 1);
  assert.deepEqual(listAppointments(null), []);
  assert.equal(countDone(undefined), 0);
});

test('findPatientForApt matches by name or patientId', () => {
  const ps = [{ id: 5, name: 'س' }, { id: 6, name: 'ص' }];
  assert.equal(findPatientForApt(ps, { patient: 'ص' }).id, 6);
  assert.equal(findPatientForApt(ps, { patient: 'x', patientId: 5 }).id, 5);
  assert.equal(findPatientForApt(ps, { patient: 'x' }), null);
});

test('whatsapp url strips leading zero and encodes text', () => {
  const u = whatsappReminderUrl({ phone: '01012345678', date: '2026-09-27', time: '09:00' }, 'عيادة');
  assert.ok(u.startsWith('https://wa.me/21012345678?text='));
  assert.ok(u.includes(encodeURIComponent('عيادة')));
  assert.equal(whatsappReminderUrl({}, 'x'), null);
});
