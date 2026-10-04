import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ADMIN_EMAILS, DEFAULT_ROLES, KIOSK_EMAIL, DEFAULT_USERS,
  lockRemaining, registerLoginFail, clearLoginFails, fmtWait,
  getUsers, saveUsers, resolveProfile, sbSignOut, authenticateStaff, verifyServerAdmin
} from '../src/modules/auth/staff-login.js';
import { SyncStore } from '../src/modules/sync/engine.js';
import { setRawIO, sbGetRaw, sbSetRaw } from '../src/modules/sync/wiring.js';

// The staff-login subsystem (Phase 8, combined batch 19) -- exact copies of
// the legacy originals (see the module for the full rationale). resolveProfile
// in particular went through a dedicated safety review in Phase 5: this
// batch only moves WHERE it lives, so these tests pin down the exact
// behavior that review signed off on (auto-admin-provisioning only when no
// real accounts exist yet, or for a preset/admin email).

function makeLocalStorage() {
  const store = new Map();
  return {
    getItem: k => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => { store.set(k, String(v)); },
    removeItem: k => { store.delete(k); },
    get length() { return store.size; },
    key: i => Array.from(store.keys())[i] ?? null
  };
}
globalThis.localStorage = makeLocalStorage();

let onlineOverride = true;
Object.defineProperty(globalThis, 'navigator', {
  configurable: true,
  value: { get onLine() { return onlineOverride; } }
});

// getSB() (src/modules/data-access/index.js) caches its resolved client the
// first time globalThis.__IAppSupabaseClient is truthy, so -- same pattern
// as tests/sync-store-io.test.js -- the very first test below exercises the
// "no client" path, and only afterwards is a wrapper installed and swapped
// per test by reassigning what it delegates to.
let fromImpl = () => ({
  select: () => ({ eq: () => ({ abortSignal: () => ({ retry: () => ({ maybeSingle: () => Promise.resolve({ data: null, error: null }) }) }) }) }),
  upsert: () => ({ abortSignal: () => ({ retry: () => Promise.resolve({ error: null }) }) })
});
let authImpl = {
  signInWithPassword: () => Promise.resolve({ data: {}, error: { message: 'Invalid login credentials' } }),
  signOut: () => Promise.resolve({ error: null })
};

test.afterEach(() => {
  globalThis.localStorage = makeLocalStorage();
  SyncStore.set({ reachable: null, authError: false });
  onlineOverride = true;
  fromImpl = () => ({
    select: () => ({ eq: () => ({ abortSignal: () => ({ retry: () => ({ maybeSingle: () => Promise.resolve({ data: null, error: null }) }) }) }) }),
    upsert: () => ({ abortSignal: () => ({ retry: () => Promise.resolve({ error: null }) }) })
  });
  authImpl = {
    signInWithPassword: () => Promise.resolve({ data: {}, error: { message: 'Invalid login credentials' } }),
    signOut: () => Promise.resolve({ error: null })
  };
});

test('constants are unchanged from the legacy originals', () => {
  assert.deepEqual(ADMIN_EMAILS, ['admin@sakr.clinic']);
  assert.equal(DEFAULT_ROLES['admin@sakr.clinic'].role, 'admin');
  assert.equal(DEFAULT_ROLES['user1@sakr.clinic'].role, 'secretary');
  assert.equal(KIOSK_EMAIL, '');
  assert.deepEqual(DEFAULT_USERS, []);
});

test('lockRemaining: zero for a key with no recorded failures', () => {
  assert.equal(lockRemaining('fresh@x.com'), 0);
});

test('registerLoginFail: locks out after the 6th failure, and clearLoginFails lifts it', () => {
  const key = 'lockout-test@x.com';
  for (let i = 0; i < 5; i++) assert.equal(registerLoginFail(key), 0);
  const wait = registerLoginFail(key);
  assert.ok(wait > 0, 'should be locked after the 6th failure');
  assert.ok(lockRemaining(key) > 0);
  clearLoginFails(key);
  assert.equal(lockRemaining(key), 0);
});

test('fmtWait: seconds under a minute are shown in seconds, a minute or more in minutes (rounded up)', () => {
  assert.equal(fmtWait(45), '45 ثانية');
  assert.equal(fmtWait(90), '2 دقيقة');
  assert.equal(fmtWait(60), '1 دقيقة');
});

test('getUsers: empty/missing localStorage returns []', () => {
  assert.deepEqual(getUsers(), []);
  globalThis.localStorage.setItem('iapp_users', 'not json');
  assert.deepEqual(getUsers(), []);
});

test('saveUsers/getUsers: round-trips through localStorage', () => {
  const list = [{ id: 1, email: 'a@b.com', name: 'A', role: 'admin' }];
  saveUsers(list, { localOnly: true }); // localOnly skips the Supabase push, same as the legacy original
  assert.deepEqual(getUsers(), list);
});

test('resolveProfile: an existing local user is returned as-is (profile shape only, via publicUser)', async () => {
  saveUsers([{ id: 1, email: 'doc@sakr.clinic', username: 'doc@sakr.clinic', name: 'Dr X', role: 'doctor', pw: { hash: 'secret' } }], { localOnly: true });
  const res = await resolveProfile('doc@sakr.clinic');
  assert.equal(res.error, undefined);
  assert.equal(res.user.email, 'doc@sakr.clinic');
  assert.equal(res.user.role, 'doctor');
  assert.equal('pw' in res.user, false); // publicUser strips internal fields
});

test('resolveProfile: the kiosk email is rejected for login', async () => {
  const res = await resolveProfile('');
  assert.ok(res.error);
  assert.match(res.error, /حساب الشاشة/);
});

test('resolveProfile: a DEFAULT_ROLES preset email with no existing account is auto-provisioned with its preset role/name', async () => {
  saveUsers([{ id: 1, email: 'someone-else@x.com' }], { localOnly: true }); // so noAccounts is false -- this is specifically the preset path
  const res = await resolveProfile('user1@sakr.clinic');
  assert.equal(res.error, undefined);
  assert.equal(res.user.role, 'secretary');
  assert.equal(res.user.name, 'سكرتارية 1');
  assert.ok(getUsers().some(u => u.email === 'user1@sakr.clinic' && u.role === 'secretary'));
});

// Phase "clinical refinement" (P0-3): the first-login bootstrap used to run even when the
// staff list could not be read. It now needs (a) a confirmed-empty server read AND
// (b) the server's own iapp_is_admin() answer.
let rpcAdmin = null;
function withRemoteUsers(value, fn) {
  return async () => {
    setRawIO({ readRemote: async k => (k === 'iapp_users' ? value : undefined), writeRemote: async () => true });
    installClient();
    try { await fn(); } finally { setRawIO({ readRemote: sbGetRaw, writeRemote: sbSetRaw }); rpcAdmin = null; }
  };
}

test('resolveProfile: first login with a confirmed-empty server list AND server-confirmed admin becomes admin', withRemoteUsers(null, async () => {
  rpcAdmin = true;
  assert.deepEqual(getUsers(), []);
  const res = await resolveProfile('brand-new-doctor@clinic.com');
  assert.equal(res.error, undefined);
  assert.equal(res.user.role, 'admin');
}));

test('resolveProfile: first login is NOT promoted to admin when the server list could not be read', withRemoteUsers(undefined, async () => {
  rpcAdmin = true;
  const res = await resolveProfile('brand-new-doctor@clinic.com');
  assert.ok(res.error);
  assert.deepEqual(getUsers(), []);
}));

test('resolveProfile: first login is NOT promoted to admin when the server says the account is not an admin', withRemoteUsers(null, async () => {
  rpcAdmin = false;
  const res = await resolveProfile('secretary-who-logs-in-first@clinic.com');
  assert.match(res.error, /تعذر التحقق من صلاحية المدير/);
  assert.deepEqual(getUsers(), []);
}));

test('resolveProfile: first login is NOT promoted when the admin check is unknown (offline/error)', withRemoteUsers(null, async () => {
  rpcAdmin = null;
  const res = await resolveProfile('brand-new-doctor@clinic.com');
  assert.ok(res.error);
}));

test('resolveProfile: a local "admin" record is downgraded when the server definitively says not admin', withRemoteUsers(undefined, async () => {
  rpcAdmin = false;
  saveUsers([{ id: 1, email: 'sec@sakr.clinic', username: 'sec@sakr.clinic', name: 'S', role: 'admin' }], { localOnly: true });
  const res = await resolveProfile('sec@sakr.clinic');
  assert.equal(res.user.role, 'secretary');
  assert.equal(res.user.roleDowngraded, true);
  assert.equal(getUsers().find(u => u.email === 'sec@sakr.clinic').role, 'secretary');
}));

test('resolveProfile: a local "admin" record is kept when the server answer is unknown (offline tolerance)', withRemoteUsers(undefined, async () => {
  rpcAdmin = null;
  saveUsers([{ id: 1, email: 'boss@sakr.clinic', username: 'boss@sakr.clinic', name: 'B', role: 'admin' }], { localOnly: true });
  const res = await resolveProfile('boss@sakr.clinic');
  assert.equal(res.user.role, 'admin');
  assert.equal(res.user.roleDowngraded, undefined);
}));

test('resolveProfile: doctor/secretary records are never touched by the server admin check', withRemoteUsers(undefined, async () => {
  rpcAdmin = false;
  saveUsers([{ id: 1, email: 'doc@sakr.clinic', username: 'doc@sakr.clinic', name: 'D', role: 'doctor' }], { localOnly: true });
  const res = await resolveProfile('doc@sakr.clinic');
  assert.equal(res.user.role, 'doctor');
}));

test('verifyServerAdmin: true / false / null mapping', withRemoteUsers(undefined, async () => {
  rpcAdmin = true; assert.equal(await verifyServerAdmin(), true);
  rpcAdmin = false; assert.equal(await verifyServerAdmin(), false);
  rpcAdmin = 'error'; assert.equal(await verifyServerAdmin(), null);
  rpcAdmin = null; assert.equal(await verifyServerAdmin(), null);
}));

test('resolveProfile: an unrecognized email is rejected once real accounts already exist', async () => {
  saveUsers([{ id: 1, email: 'existing@x.com', role: 'admin' }], { localOnly: true });
  const res = await resolveProfile('unknown-person@x.com');
  assert.ok(res.error);
  assert.match(res.error, /غير مضاف/);
  assert.equal(getUsers().some(u => u.email === 'unknown-person@x.com'), false);
});

test('sbSignOut: offline clears the local Supabase auth token without awaiting the network', async () => {
  onlineOverride = false;
  globalThis.localStorage.setItem('iapp_sb_auth', '{"x":1}');
  let localSignOutCalled = false;
  authImpl.signOut = opts => {
    if (opts && opts.scope === 'local') localSignOutCalled = true;
    return Promise.resolve({ error: null });
  };
  // Install the real client for this call (resolveProfile tests above never required getSB()).
  installClient();
  await sbSignOut();
  assert.equal(globalThis.localStorage.getItem('iapp_sb_auth'), null);
  assert.equal(localSignOutCalled, true);
});

test('sbSignOut: online awaits the real sign-out and still clears the local token', async () => {
  installClient();
  let signOutCalled = false;
  authImpl.signOut = () => {
    signOutCalled = true;
    return Promise.resolve({ error: null });
  };
  globalThis.localStorage.setItem('iapp_sb_auth', '{"x":1}');
  await sbSignOut();
  assert.equal(signOutCalled, true);
  assert.equal(globalThis.localStorage.getItem('iapp_sb_auth'), null);
});

test('authenticateStaff: a locked-out account is rejected before any network call', async () => {
  const key = 'locked@x.com';
  for (let i = 0; i < 6; i++) registerLoginFail(key);
  let called = false;
  authImpl.signInWithPassword = () => {
    called = true;
    return Promise.resolve({ data: {}, error: null });
  };
  const res = await authenticateStaff(key, 'whatever');
  assert.ok(res.error);
  assert.match(res.error, /محاولات خاطئة كثيرة/);
  assert.equal(called, false);
});

test('authenticateStaff: an email without "@" is rejected before signing in (client must exist first)', async () => {
  installClient();
  const res = await authenticateStaff('notanemail', 'pw');
  assert.ok(res.error);
  assert.match(res.error, /البريد الإلكتروني كاملاً/);
});

test('authenticateStaff: invalid credentials register a failure and return the Arabic message', async () => {
  installClient();
  authImpl.signInWithPassword = () => Promise.resolve({ data: {}, error: { message: 'Invalid login credentials' } });
  const res = await authenticateStaff('baduser@x.com', 'wrong');
  assert.ok(res.error);
  assert.match(res.error, /البريد الإلكتروني أو كلمة المرور غير صحيحة/);
});

test('authenticateStaff: an unconfirmed email returns its own Arabic message', async () => {
  installClient();
  authImpl.signInWithPassword = () => Promise.resolve({ data: {}, error: { message: 'Email not confirmed' } });
  const res = await authenticateStaff('unconfirmed@x.com', 'pw');
  assert.match(res.error, /البريد غير مُفعّل/);
});

test('authenticateStaff: a successful sign-in clears the lockout and resolves the user profile', async () => {
  installClient();
  const key = 'success@x.com';
  registerLoginFail(key); // one prior failure, should be cleared on success
  saveUsers([{ id: 1, email: key, username: key, name: 'Success User', role: 'doctor' }], { localOnly: true });
  authImpl.signInWithPassword = () => Promise.resolve({ data: { user: { email: key } }, error: null });
  const res = await authenticateStaff(key, 'correct-password');
  assert.equal(res.error, undefined);
  assert.equal(res.user.email, key);
  assert.equal(lockRemaining(key), 0);
  assert.equal(SyncStore.st.authError, false);
});

test('authenticateStaff: when resolveProfile itself fails after a successful sign-in, it signs the session back out', async () => {
  installClient();
  let signedOut = false;
  authImpl.signOut = () => {
    signedOut = true;
    return Promise.resolve({ error: null });
  };
  authImpl.signInWithPassword = () => Promise.resolve({ data: {}, error: null });
  // Force the resolveProfile-failure branch directly via an unrecognized
  // email with an existing account already present (making it NOT the
  // first-ever-login admin case).
  saveUsers([{ id: 1, email: 'someone@x.com', role: 'admin' }], { localOnly: true });
  const res2 = await authenticateStaff('rejected@x.com', 'pw');
  assert.ok(res2.error);
  assert.equal(signedOut, true);
});

function installClient() {
  globalThis.__IAppSupabaseClient = {
    rpc: async name => {
      if (name !== 'iapp_is_admin') return { data: null, error: { message: 'unexpected rpc' } };
      if (rpcAdmin === 'error') return { data: null, error: { message: 'boom' } };
      return { data: rpcAdmin, error: null };
    },
    from: (...args) => fromImpl(...args),
    auth: {
      signInWithPassword: (...args) => authImpl.signInWithPassword(...args),
      signOut: (...args) => authImpl.signOut(...args)
    }
  };
}
