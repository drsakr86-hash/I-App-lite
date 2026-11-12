import test from 'node:test';
import assert from 'node:assert/strict';
import { buildNewUserRecord, buildEditedUserRecord, staffRpcArgs } from '../src/modules/settings/model.js';
import { pushStaffRole, removeStaffRole } from '../src/modules/settings/staff-sync.js';

test('doctor record carries the linked doctor profile; other roles do not', () => {
  const d = buildNewUserRecord({ name: ' Dr B ', role: 'doctor', doctorId: 7 }, 'b@x.io', 'u1');
  assert.equal(d.doctorId, 7);
  const s = buildNewUserRecord({ name: 'Sec', role: 'secretary', doctorId: 7 }, 's@x.io', 'u2');
  assert.equal('doctorId' in s, false);
  const e = buildEditedUserRecord(d, { name: 'Dr B', role: 'secretary' }, 'b@x.io');
  assert.equal('doctorId' in e, false);
});

test('staffRpcArgs normalizes email and only sends doctor_key for doctors', () => {
  assert.deepEqual(staffRpcArgs({ email: ' A@X.io ', role: 'doctor', doctorId: 3, name: 'A' }),
    { p_email: 'a@x.io', p_role: 'doctor', p_doctor_key: '3', p_display_name: 'A' });
  assert.equal(staffRpcArgs({ email: 'a@x.io', role: 'secretary', doctorId: 3, name: 'A' }).p_doctor_key, null);
});

test('pushStaffRole / removeStaffRole call the admin RPCs and never throw', async () => {
  const calls = [];
  const sb = { rpc: async (n, a) => { calls.push([n, a]); return { error: null }; } };
  assert.equal((await pushStaffRole({ email: 'a@x.io', role: 'doctor', doctorId: 1, name: 'A' }, sb)).ok, true);
  assert.equal((await removeStaffRole('A@x.io', sb)).ok, true);
  assert.deepEqual(calls.map(c => c[0]), ['iapp_admin_set_staff', 'iapp_admin_remove_staff']);
  assert.equal(calls[1][1].p_email, 'a@x.io');
  const bad = { rpc: async () => ({ error: { message: 'admin only' } }) };
  assert.deepEqual(await pushStaffRole({ email: 'a@x.io', role: 'admin' }, bad), { ok: false, error: 'admin only' });
  const boom = { rpc: async () => { throw new Error('net'); } };
  assert.equal((await removeStaffRole('a@x.io', boom)).ok, false);
  assert.equal((await pushStaffRole({ email: 'a@x.io', role: 'admin' }, null)).ok, false);
});
