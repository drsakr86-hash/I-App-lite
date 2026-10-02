import test from 'node:test';
import assert from 'node:assert/strict';
import { acceptBookingRequest, rejectBookingRequest, findExistingForRequest, loadPendingRequests, setRequestStatus, BOOKING_MESSAGES } from '../src/modules/appointments/booking-requests.js';

const REQ = { id: 12, patient_name: 'مريض تجريبي', phone: '01000000000', date: '2026-10-10', time: '10:00', clinic: 'dmn', visit_type: 'فحص روتيني', note: 'ن' };

// emulates sbMutate over an in-memory list (mutator may return {abort})
const mkDeps = ({ list = [], status = { ok: true, already: false }, fail = null } = {}) => {
  const state = { list: [...list], statusCalls: [] };
  return {
    state,
    mutateAppointments: async (fn, verify) => {
      if (fail) return { ok: false, error: fail };
      const next = fn(state.list);
      if (next && next.abort) return { ok: false, error: next.abort };
      state.list = next;
      return verify(next) ? { ok: true, data: next } : { ok: false, error: 'conflict' };
    },
    setStatus: async (id, st) => { state.statusCalls.push([id, st]); return status; },
    newId: () => 555
  };
};

test('accept creates one appointment from the request and marks it accepted', async () => {
  const d = mkDeps();
  const r = await acceptBookingRequest(d, REQ);
  assert.equal(r.status, 'accepted');
  assert.equal(d.state.list.length, 1);
  assert.equal(d.state.list[0].fromPatient, true);
  assert.equal(d.state.list[0].confirmed, true);
  assert.deepEqual(d.state.statusCalls, [[12, 'accepted']]);
});

test('accept does not create a second appointment when one already exists (retry / second device)', async () => {
  const existing = { id: 1, fromPatient: true, phone: REQ.phone, date: REQ.date, time: REQ.time, doctor: 'x' };
  const d = mkDeps({ list: [existing] });
  const r = await acceptBookingRequest(d, REQ);
  assert.equal(d.state.list.length, 1);
  assert.equal(r.status, 'accepted');
  assert.ok(findExistingForRequest([existing], REQ));
  assert.equal(findExistingForRequest([{ ...existing, cancelled: true }], REQ), null);
});

test('status update failure after the appointment was saved is reported, not hidden', async () => {
  const d = mkDeps({ status: { ok: false, error: 'x' } });
  const r = await acceptBookingRequest(d, REQ);
  assert.equal(r.status, 'accepted-unmarked');
  assert.equal(r.message, BOOKING_MESSAGES.acceptedUnmarked);
  assert.equal(d.state.list.length, 1);
});

test('request already handled elsewhere is reported', async () => {
  const d = mkDeps({ status: { ok: true, already: true } });
  assert.equal((await acceptBookingRequest(d, REQ)).status, 'already-handled');
  assert.equal((await rejectBookingRequest(d, REQ)).status, 'already-handled');
});

test('appointment save failure leaves the request pending (status never touched)', async () => {
  const d = mkDeps({ fail: 'offline' });
  const r = await acceptBookingRequest(d, REQ);
  assert.equal(r.status, 'failed');
  assert.equal(d.state.statusCalls.length, 0);
});

test('same doctor/date/time conflict aborts and leaves the request pending', async () => {
  const clash = { id: 9, doctor: 'د. عبدالستار', date: REQ.date, time: REQ.time };
  const d = mkDeps({ list: [clash] });
  const r = await acceptBookingRequest(d, REQ);
  assert.equal(r.status, 'failed');
  assert.match(r.message, /موعد آخر/);
  assert.equal(d.state.statusCalls.length, 0);
});

test('reject reports a failed status write', async () => {
  assert.equal((await rejectBookingRequest(mkDeps({ status: { ok: false } }), REQ)).status, 'failed');
  assert.equal((await rejectBookingRequest(mkDeps(), REQ)).status, 'rejected');
});

test('loadPendingRequests / setRequestStatus honour Supabase error fields and never throw', async () => {
  const q = res => ({ select: () => q(res), eq: () => q(res), order: () => Promise.resolve(res), update: () => q(res), then: undefined });
  const sbOk = { from: () => ({ select: () => ({ eq: () => ({ order: async () => ({ data: [REQ], error: null }) }) }) }) };
  assert.deepEqual((await loadPendingRequests(sbOk)).data, [REQ]);
  const sbErr = { from: () => ({ select: () => ({ eq: () => ({ order: async () => ({ data: null, error: { message: 'rls' } }) }) }) }) };
  const l = await loadPendingRequests(sbErr);
  assert.equal(l.ok, false);
  assert.equal((await loadPendingRequests(null)).ok, false);
  const upd = res => ({ from: () => ({ update: () => ({ eq: () => ({ eq: () => ({ select: async () => res }) }) }) }) });
  assert.deepEqual(await setRequestStatus(upd({ data: [{ id: 12 }], error: null }), 12, 'accepted'), { ok: true, already: false, error: null });
  assert.equal((await setRequestStatus(upd({ data: [], error: null }), 12, 'accepted')).already, true);
  assert.equal((await setRequestStatus(upd({ data: null, error: { message: 'x' } }), 12, 'accepted')).ok, false);
  void q;
});
