// The staff-login subsystem -- moved here from public/legacy/app-runtime.js
// (Phase 8, combined batch 19): the Supabase email/password sign-in flow
// (authenticateStaff), auto-provisioning on first successful login
// (resolveProfile), the local user list used for login/role lookups
// (getUsers/saveUsers/pushUsers/pullUsers), and the login-attempt lockout
// (lockRemaining/registerLoginFail/clearLoginFails/fmtWait). These were
// always tightly coupled -- authenticateStaff calls resolveProfile, which
// calls pullUsers/getUsers/saveUsers, and the lockout functions gate
// authenticateStaff directly -- so, unlike most Phase 8 batches, they move
// together as one unit instead of being split further.
//
// Exact copy of the legacy originals, with `window.*`/closure reads changed
// to direct imports -- every one of those dependencies (emailKey, newId,
// GUARD_KEY, SyncStore, dirtyKeys, offlineNow, flushAll, sbGet, sbSet,
// publicUser) was already moved to its own module in earlier batches.
// resolveProfile in particular went through a dedicated safety review in
// Phase 5 (see the roadmap: the auto-admin-provisioning behavior was
// deliberately left untouched after discussing the theoretical risk with the
// clinic owner). This move changes WHERE it lives, not what it does -- every
// line of that logic is unchanged.

import { getSB } from '../data-access/index.js';
import { emailKey, newId, GUARD_KEY } from '../constants/misc.js';
import { SyncStore, dirtyKeys, offlineNow } from '../sync/engine.js';
import { flushAll, sbGet, sbSet } from '../sync/wiring.js';
import { publicUser } from './session.js';
import { logError } from '../../services/logger.js';
import { t } from '../i18n/index.js';
import { purgeCachedPhi, requestImageCacheClear } from '../sync/phi-purge.js';

export const ADMIN_EMAILS = ['admin@sakr.clinic'];

export const DEFAULT_ROLES = {
  'admin@sakr.clinic': { role: 'admin', name: 'د. عبدالستار صقر' },
  'user1@sakr.clinic': { role: 'secretary', name: 'سكرتارية 1' },
  'user2@sakr.clinic': { role: 'secretary', name: 'سكرتارية 2' },
  'user3@sakr.clinic': { role: 'secretary', name: 'سكرتارية 3' }
};

export const KIOSK_EMAIL = '';

export const DEFAULT_USERS = [];

// ---- login-attempt lockout --------------------------------------------------

function _guards() {
  try {
    const g = JSON.parse(localStorage.getItem(GUARD_KEY));
    return g && typeof g === 'object' && !('fails' in g) ? g : {};
  } catch {
    return {};
  }
}
function _gkey(k) {
  return String(k || '_').trim().toLowerCase();
}
export function lockRemaining(k) {
  const g = _guards()[_gkey(k)];
  return g ? Math.max(0, Math.ceil((g.until - Date.now()) / 1000)) : 0;
}
export function registerLoginFail(k) {
  const all = _guards(), key = _gkey(k), g = all[key] || { fails: 0, until: 0 };
  g.fails++;
  if (g.fails >= 6) g.until = Date.now() + Math.min(300, 30 * Math.pow(2, g.fails - 6)) * 1000;
  all[key] = g;
  try {
    localStorage.setItem(GUARD_KEY, JSON.stringify(all));
  } catch { /* storage unavailable (private mode / quota): non-fatal */ }
  return lockRemaining(k);
}
export function clearLoginFails(k) {
  const all = _guards();
  delete all[_gkey(k)];
  try {
    localStorage.setItem(GUARD_KEY, JSON.stringify(all));
  } catch { /* storage unavailable (private mode / quota): non-fatal */ }
}
export const fmtWait = s => (s >= 60 ? t('g6.auth.minutes', { n: Math.ceil(s / 60) }) : t('g6.auth.seconds', { n: s }));

// ---- local user list ---------------------------------------------------------

export const isRealUser = u => !!u && (!!u.email || !!u.username);

export function getUsers() {
  try {
    const u = localStorage.getItem('iapp_users');
    if (u) {
      const list = JSON.parse(u);
      if (Array.isArray(list) && list.length) return list;
    }
  } catch { /* storage unavailable (private mode / quota): non-fatal */ }
  return [];
}

let _usersSynced = false;

export function saveUsers(list, opts) {
  try {
    localStorage.setItem('iapp_users', JSON.stringify(list));
  } catch { /* storage unavailable (private mode / quota): non-fatal */ }
  if (!(opts && opts.localOnly)) pushUsers(list);
}

async function pushUsers(list) {
  if (!_usersSynced) return false;
  const clean = (list || []).filter(isRealUser).map(({ password, pw, ...u }) => u);
  if (!clean.length) return false;
  return sbSet('iapp_users', clean);
}

export async function pullUsers() {
  const remote = await sbGet('iapp_users');
  if (remote === undefined) return false;
  if (Array.isArray(remote) && remote.some(isRealUser)) {
    try {
      localStorage.setItem('iapp_users', JSON.stringify(remote));
    } catch { /* storage unavailable (private mode / quota): non-fatal */ }
    _usersSynced = true;
    return true;
  }
  _usersSynced = true;
  let local = null;
  try {
    local = JSON.parse(localStorage.getItem('iapp_users') || 'null');
  } catch { /* storage unavailable (private mode / quota): non-fatal */ }
  if (Array.isArray(local) && local.some(u => u && u.email)) await pushUsers(local);
  return true;
}

// ---- login / auto-provisioning ------------------------------------------------

// Server-side truth about the signed-in account. `iapp_is_admin()` is an existing
// SECURITY DEFINER function (verified against the live project) that checks the
// JWT email against `iapp_staff.role = 'admin'`. The browser-held `iapp_users`
// record is writable by any staff session, so it can never be the authority for
// "admin". Returns true / false, or null when the answer is unknown (offline,
// timeout, RPC error, no client) -- unknown is NOT treated as "no".
export async function verifyServerAdmin({ timeoutMs = 5000 } = {}) {
  const sb = getSB();
  if (!sb || typeof sb.rpc !== 'function' || offlineNow()) return null;
  try {
    const r = await Promise.race([sb.rpc('iapp_is_admin'), new Promise(res => setTimeout(() => res(null), timeoutMs))]);
    if (!r || r.error) {
      if (r && r.error) logError('auth.verifyServerAdmin', r.error);
      return null;
    }
    return r.data === true ? true : r.data === false ? false : null;
  } catch (e) {
    logError('auth.verifyServerAdmin', e);
    return null;
  }
}

const DOWNGRADE_ROLE = 'secretary';

// An account that the browser record calls "admin" but the server says is not an
// admin keeps working as the least-privileged role the server knows about. The
// downgrade is applied to the local copy only (never pushed to the shared list).
async function enforceServerRole(user) {
  if (!user || user.role !== 'admin') return user;
  const isAdmin = await verifyServerAdmin();
  if (isAdmin !== false) return user;
  logError('auth.roleDowngrade', 'server denied admin', { op: 'resolveProfile' });
  try {
    const list = getUsers();
    const key = emailKey(user.email);
    saveUsers(list.map(x => (emailKey(x.email) === key ? { ...x, role: DOWNGRADE_ROLE } : x)), { localOnly: true });
  } catch (e) {
    logError('auth.roleDowngrade.persist', e);
  }
  return { ...user, role: DOWNGRADE_ROLE, roleDowngraded: true };
}

export async function resolveProfile(email) {
  // `pulled === true` only when the shared staff list was actually read from the server.
  const pulled = await Promise.race([pullUsers().catch(() => false), new Promise(r => setTimeout(() => r(false), 5000))]);
  const key = emailKey(email);
  if (key === emailKey(KIOSK_EMAIL)) return {
    error: t('g6.auth.kioskAccount')
  };
  const users = getUsers().filter(u => u && (u.email || u.username));
  let u = users.find(x => emailKey(x.email) === key) || users.find(x => emailKey(x.username) === key);
  if (u) return {
    user: await enforceServerRole({
      ...publicUser(u),
      email: u.email || email
    })
  };
  const preset = DEFAULT_ROLES[key];
  // First-ever login bootstrap is allowed only when the server list was read and is
  // genuinely empty. A failed/timed-out read must never make the next login an admin.
  const noAccounts = pulled === true && !users.some(x => x.email);
  const provision = async (rec) => {
    // Creating an admin locally also requires the server to confirm it.
    if (rec.role === 'admin' && (await verifyServerAdmin()) !== true) return {
      error: t('g6.auth.adminVerifyFailed')
    };
    saveUsers([...getUsers().filter(x => emailKey(x.email) !== key), rec]);
    return {
      user: {
        ...publicUser(rec),
        email: key
      }
    };
  };
  if (preset) return provision({
    id: newId(),
    email: key,
    username: key,
    name: preset.name || key.split('@')[0],
    role: preset.role
  });
  if (ADMIN_EMAILS.map(emailKey).includes(key) || noAccounts) return provision({
    id: newId(),
    email: key,
    username: key,
    name: key.split('@')[0],
    role: 'admin'
  });
  return {
    error: t('g6.auth.notProvisioned')
  };
}

export async function sbSignOut() {
  const sb = getSB();
  if (offlineNow()) {
    try {
      localStorage.removeItem('iapp_sb_auth');
    } catch (e) {
      logError('auth.signOut.clearToken', e);
    }
    try {
      if (sb) sb.auth.signOut({ scope: 'local' }).catch(e => logError('auth.signOut.local', e));
    } catch (e) {
      logError('auth.signOut.local', e);
    }
    purgeCachedPhi();
    requestImageCacheClear();
    return;
  }
  try {
    if (sb) await Promise.race([sb.auth.signOut(), new Promise(r => setTimeout(r, 4000))]);
  } catch (e) {
    logError('auth.signOut', e);
  }
  try {
    localStorage.removeItem('iapp_sb_auth');
  } catch (e) {
    logError('auth.signOut.clearToken', e);
  }
  // Cached PHI goes too, except keys that still hold unsynced changes (see phi-purge.js).
  purgeCachedPhi();
  requestImageCacheClear();
}

export async function authenticateStaff(email, password) {
  const key = emailKey(email);
  const wait = lockRemaining(key);
  if (wait) return {
    error: t('g6.auth.tooManyAccount', { wait: fmtWait(wait) })
  };
  const sb = getSB();
  if (!sb) return {
    error: t('g6.auth.dbUnreachable')
  };
  if (!key.includes('@')) return {
    error: t('g6.auth.emailFull')
  };
  let res;
  try {
    res = await sb.auth.signInWithPassword({ email: key, password });
  } catch (e) {
    return {
      error: t('g6.auth.serverUnreachable')
    };
  }
  if (res.error) {
    const m = String(res.error.message || '');
    const w = registerLoginFail(key);
    if (w) return {
      error: t('g6.auth.lockedAccount', { wait: fmtWait(w) })
    };
    if (/Email not confirmed/i.test(m)) return {
      error: t('g6.auth.emailUnconfirmed')
    };
    if (/Invalid login/i.test(m)) return {
      error: t('g6.auth.badCredentials')
    };
    return {
      error: '❌ ' + m
    };
  }
  clearLoginFails(key);
  SyncStore.set({ authError: false });
  setTimeout(() => {
    if (dirtyKeys().length) flushAll();
  }, 500);
  const prof = await resolveProfile(key);
  if (prof.error) {
    await sbSignOut();
    return prof;
  }
  return prof;
}
