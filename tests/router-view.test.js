import test from 'node:test';
import assert from 'node:assert/strict';
import { routeViewFor, pathForRouteView } from '../src/modules/auth/router-view.js';

test('router view: not ready yet -> loading', () => {
  assert.equal(routeViewFor({ ready: false, session: null, invalidRole: false }), 'loading');
});

test('router view: ready but no session -> login', () => {
  assert.equal(routeViewFor({ ready: true, session: null, invalidRole: false }), 'login');
});

test('router view: patient session always wins, even if invalidRole/mustChange were somehow set', () => {
  const session = { kind: 'patient', mustChange: true };
  assert.equal(routeViewFor({ ready: true, session, invalidRole: true }), 'patient');
});

test('router view: invalid staff role -> blocked', () => {
  const session = { kind: 'staff', role: 'ghost' };
  assert.equal(routeViewFor({ ready: true, session, invalidRole: true }), 'blocked');
});

test('router view: must change password (and no email yet) -> force-password-change', () => {
  const session = { kind: 'staff', role: 'admin', mustChange: true, email: '' };
  assert.equal(routeViewFor({ ready: true, session, invalidRole: false }), 'force-password-change');
});

test('router view: mustChange is ignored once the account has an email on file', () => {
  const session = { kind: 'staff', role: 'admin', mustChange: true, email: 'a@b.com' };
  assert.equal(routeViewFor({ ready: true, session, invalidRole: false }), 'doctor');
});

test('router view: secretary and employee roles both route to secretary', () => {
  assert.equal(routeViewFor({ ready: true, session: { kind: 'staff', role: 'secretary' }, invalidRole: false }), 'secretary');
  assert.equal(routeViewFor({ ready: true, session: { kind: 'staff', role: 'employee' }, invalidRole: false }), 'secretary');
});

test('router view: admin/doctor roles fall through to the doctor app', () => {
  assert.equal(routeViewFor({ ready: true, session: { kind: 'staff', role: 'admin' }, invalidRole: false }), 'doctor');
  assert.equal(routeViewFor({ ready: true, session: { kind: 'staff', role: 'doctor' }, invalidRole: false }), 'doctor');
});

// ---- pathForRouteView ----
test('pathForRouteView: every known routeViewFor() result maps to its own path', () => {
  assert.equal(pathForRouteView('loading'), '/loading');
  assert.equal(pathForRouteView('login'), '/login');
  assert.equal(pathForRouteView('patient'), '/patient');
  assert.equal(pathForRouteView('blocked'), '/blocked');
  assert.equal(pathForRouteView('force-password-change'), '/force-password-change');
  assert.equal(pathForRouteView('secretary'), '/secretary');
  assert.equal(pathForRouteView('doctor'), '/doctor');
});

test('pathForRouteView: an unrecognized key falls back to /login rather than throwing', () => {
  assert.equal(pathForRouteView('something-unexpected'), '/login');
  assert.equal(pathForRouteView(undefined), '/login');
});
