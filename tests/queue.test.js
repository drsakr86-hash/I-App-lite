import test from 'node:test';
import assert from 'node:assert/strict';
import { finishQueueEntries } from '../src/modules/appointments/queue.js';

const day = '2026-09-26';
const mk = o => ({ id: 1, date: day, patient: 'أحمد', patientId: 7, waitStatus: 'called', ...o });

test('called appointment of the same patient becomes done', () => {
  const out = finishQueueEntries([mk()], { patientId: 7, patient: 'أحمد', date: day }, 123);
  assert.equal(out[0].waitStatus, 'done');
  assert.equal(out[0].doneAt, 123);
});

test('in-room appointment is finished too', () => {
  const out = finishQueueEntries([mk({ waitStatus: 'in' })], { patientId: 7, date: day });
  assert.equal(out[0].waitStatus, 'done');
});

test('waiting / not-arrived / postponed / no-show appointments are finished when the patient is examined', () => {
  for (const ws of ['waiting', undefined, 'postponed', 'no-show']) {
    const out = finishQueueEntries([mk({ waitStatus: ws })], { patientId: 7, date: day }, 5);
    assert.equal(out[0].waitStatus, 'done', String(ws));
    assert.equal(out[0].doneAt, 5);
  }
});

test('other patient, other day, cancelled and already done stay unchanged', () => {
  const list = [mk({ id: 1, patientId: 8, patient: 'خالد' }), mk({ id: 2, date: '2026-09-25' }),
    mk({ id: 3, cancelled: true }), mk({ id: 4, waitStatus: 'done' })];
  assert.equal(finishQueueEntries(list, { patientId: 7, patient: 'أحمد', date: day }), list);
});

test('two bookings the same day: only the most advanced one is finished', () => {
  const list = [mk({ id: 1, waitStatus: undefined, time: '18:00' }), mk({ id: 2, waitStatus: 'in', time: '20:00' })];
  const out = finishQueueEntries(list, { patientId: 7, date: day });
  assert.equal(out[0].waitStatus, undefined);
  assert.equal(out[1].waitStatus, 'done');
});

test('falls back to the name when the appointment has no patient id', () => {
  const out = finishQueueEntries([mk({ patientId: null })], { patientId: 7, patient: ' أحمد ', date: day });
  assert.equal(out[0].waitStatus, 'done');
});

test('same name but a different id does not match', () => {
  const list = [mk({ patientId: 9 })];
  assert.equal(finishQueueEntries(list, { patientId: 7, patient: 'أحمد', date: day }), list);
});
