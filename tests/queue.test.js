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

test('waiting patients are not touched (not called yet)', () => {
  const list = [mk({ waitStatus: 'waiting' })];
  assert.equal(finishQueueEntries(list, { patientId: 7, date: day }), list);
});

test('other patient, other day, cancelled and already done stay unchanged', () => {
  const list = [mk({ id: 1, patientId: 8, patient: 'خالد' }), mk({ id: 2, date: '2026-09-25' }),
    mk({ id: 3, cancelled: true }), mk({ id: 4, waitStatus: 'done' })];
  assert.equal(finishQueueEntries(list, { patientId: 7, patient: 'أحمد', date: day }), list);
});

test('falls back to the name when the appointment has no patient id', () => {
  const out = finishQueueEntries([mk({ patientId: null })], { patientId: 7, patient: ' أحمد ', date: day });
  assert.equal(out[0].waitStatus, 'done');
});

test('same name but a different id does not match', () => {
  const list = [mk({ patientId: 9 })];
  assert.equal(finishQueueEntries(list, { patientId: 7, patient: 'أحمد', date: day }), list);
});
