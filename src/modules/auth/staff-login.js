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
  } catch {}
  return lockRemaining(k);
}
export function clearLoginFails(k) {
  const all = _guards();
  delete all[_gkey(k)];
  try {
    localStorage.setItem(GUARD_KEY, JSON.stringify(all));
  } catch {}
}
export const fmtWait = s => (s >= 60 ? Math.ceil(s / 60) + ' دقيقة' : s + ' ثانية');

// ---- local user list ---------------------------------------------------------

export const isRealUser = u => !!u && (!!u.email || !!u.username);

export function getUsers() {
  try {
    const u = localStorage.getItem('iapp_users');
    if (u) {
      const list = JSON.parse(u);
      if (Array.isArray(list) && list.length) return list;
    }
  } catch {}
  return [];
}

let _usersSynced = false;

export function saveUsers(list, opts) {
  try {
    localStorage.setItem('iapp_users', JSON.stringify(list));
  } catch {}
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
    } catch {}
    _usersSynced = true;
    return true;
  }
  _usersSynced = true;
  let local = null;
  try {
    local = JSON.parse(localStorage.getItem('iapp_users') || 'null');
  } catch {}
  if (Array.isArray(local) && local.some(u => u && u.email)) await pushUsers(local);
  return true;
}

// ---- login / auto-provisioning ------------------------------------------------

export async function resolveProfile(email) {
  await Promise.race([pullUsers().catch(() => false), new Promise(r => setTimeout(() => r(false), 5000))]);
  const key = emailKey(email);
  if (key === emailKey(KIOSK_EMAIL)) return {
    error: '❌ حساب الشاشة لا يُستخدم للدخول إلى البرنامج'
  };
  const users = getUsers().filter(u => u && (u.email || u.username));
  let u = users.find(x => emailKey(x.email) === key) || users.find(x => emailKey(x.username) === key);
  if (u) return {
    user: {
      ...publicUser(u),
      email: u.email || email
    }
  };
  const preset = DEFAULT_ROLES[key];
  const noAccounts = !users.some(x => x.email);
  if (preset) {
    const rec = {
      id: newId(),
      email: key,
      username: key,
      name: preset.name || key.split('@')[0],
      role: preset.role
    };
    saveUsers([...getUsers().filter(x => emailKey(x.email) !== key), rec]);
    return {
      user: {
        ...publicUser(rec),
        email: key
      }
    };
  }
  if (ADMIN_EMAILS.map(emailKey).includes(key) || noAccounts) {
    const rec = {
      id: newId(),
      email: key,
      username: key,
      name: key.split('@')[0],
      role: 'admin'
    };
    saveUsers([...getUsers().filter(x => emailKey(x.email) !== key), rec]);
    return {
      user: {
        ...publicUser(rec),
        email: key
      }
    };
  }
  return {
    error: '❌ هذا الحساب غير مضاف إلى صلاحيات البرنامج — اطلب من المدير إضافة بريدك من الإعدادات'
  };
}

export async function sbSignOut() {
  const sb = getSB();
  if (offlineNow()) {
    try {
      localStorage.removeItem('iapp_sb_auth');
    } catch (e) {}
    try {
      if (sb) sb.auth.signOut({ scope: 'local' }).catch(() => {});
    } catch (e) {}
    return;
  }
  try {
    if (sb) await Promise.race([sb.auth.signOut(), new Promise(r => setTimeout(r, 4000))]);
  } catch (e) {}
  try {
    localStorage.removeItem('iapp_sb_auth');
  } catch (e) {}
}

export async function authenticateStaff(email, password) {
  const key = emailKey(email);
  const wait = lockRemaining(key);
  if (wait) return {
    error: '⏳ محاولات خاطئة كثيرة لهذا الحساب — حاول مرة أخرى بعد ' + fmtWait(wait)
  };
  const sb = getSB();
  if (!sb) return {
    error: '❌ تعذر الاتصال بقاعدة البيانات — تأكد من الإنترنت'
  };
  if (!key.includes('@')) return {
    error: '❌ اكتب البريد الإلكتروني كاملاً (مثال: admin@sakr.clinic)'
  };
  let res;
  try {
    res = await sb.auth.signInWithPassword({ email: key, password });
  } catch (e) {
    return {
      error: '❌ تعذر الاتصال بالخادم — حاول مرة أخرى'
    };
  }
  if (res.error) {
    const m = String(res.error.message || '');
    const w = registerLoginFail(key);
    if (w) return {
      error: '⏳ تم إيقاف الدخول لهذا الحساب مؤقتاً — حاول بعد ' + fmtWait(w)
    };
    if (/Email not confirmed/i.test(m)) return {
      error: '❌ البريد غير مُفعّل — أكّده من رسالة Supabase أو أوقف تأكيد البريد من إعدادات Supabase'
    };
    if (/Invalid login/i.test(m)) return {
      error: '❌ البريد الإلكتروني أو كلمة المرور غير صحيحة'
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
