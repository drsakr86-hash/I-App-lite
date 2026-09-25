import test from 'node:test';
import assert from 'node:assert/strict';
import { appointmentFromRow, appointmentToRow, diffAppointments } from '../src/modules/appointments/index.js';

test('row -> appointment -> row keeps the data', () => {
  const row = { id: 7, patient_id: 3, patient: 'أحمد', phone: '0100', date: '2026-09-26', time: '10:30',
    type: 'كشف', doctor: 'د. صقر', clinic: 'dam', notes: null, confirmed: true, from_patient: false,
    cancelled: false, wait_status: 'waiting', arrived_at: 1700000000000, queue_number: 4, cost: '200', paid: true };
  const apt = appointmentFromRow(row);
  assert.equal(apt.patientId, 3);
  assert.equal(apt.queueNumber, 4);
  assert.equal(apt.calledAt, undefined);
  const back = appointmentToRow(apt);
  for (const k of ['id', 'patient_id', 'patient', 'phone', 'date', 'time', 'wait_status', 'arrived_at', 'queue_number', 'cost', 'paid']) {
    assert.equal(back[k], row[k], k);
  }
  assert.equal(back.called_at, null);
});

test('diff finds changed, added and removed appointments', () => {
  const base = [{ id: 1, time: '10:00' }, { id: 2, time: '11:00' }];
  const next = [{ id: 1, time: '10:30' }, { id: 3, time: '12:00' }];
  const { changed, removed } = diffAppointments(base, next);
  assert.deepEqual(changed.map(a => a.id), [1, 3]);
  assert.deepEqual(removed.map(a => a.id), [2]);
});

test('diff is empty when nothing changed', () => {
  const list = [{ id: 1, time: '10:00' }];
  const { changed, removed } = diffAppointments(list, [{ ...list[0] }]);
  assert.equal(changed.length + removed.length, 0);
});
