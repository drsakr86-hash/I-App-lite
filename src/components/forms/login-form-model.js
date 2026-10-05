// Pure logic for the staff LoginScreen form shell (src/components/forms/
// LoginScreen.jsx). Every value and expression mirrors the legacy runtime's
// LoginScreen exactly (public/legacy/app-runtime.js).
//
// Authentication itself is NOT here and is not re-implemented anywhere in
// src/: the component calls the legacy runtime's authenticateStaff (Supabase
// signInWithPassword, login-attempt lockout, Arabic error mapping) through the
// IAppLegacy bridge, unchanged.

import { t } from '../../modules/i18n/index.js';

// Authentication error texts come back from staff-login.js in Arabic; show them in the current language.
const LOGIN_ERRORS = [
  ['❌ حساب الشاشة لا يُستخدم للدخول إلى البرنامج', 'screenAccount'],
  ['❌ تعذر التحقق من صلاحية المدير من الخادم — تأكد من الاتصال وأن الحساب مسجل كمدير', 'adminVerify'],
  ['❌ هذا الحساب غير مضاف إلى صلاحيات البرنامج — اطلب من المدير إضافة بريدك من الإعدادات', 'notAdded'],
  ['❌ تعذر الاتصال بقاعدة البيانات — تأكد من الإنترنت', 'noDb'],
  ['❌ اكتب البريد الإلكتروني كاملاً (مثال: admin@sakr.clinic)', 'fullEmail'],
  ['❌ تعذر الاتصال بالخادم — حاول مرة أخرى', 'noServer'],
  ['❌ البريد الإلكتروني أو كلمة المرور غير صحيحة', 'invalid'],
  ['❌ من فضلك أدخل البريد الإلكتروني وكلمة المرور', 'empty']
];
const WAIT_ERRORS = [
  ['⏳ محاولات خاطئة كثيرة لهذا الحساب — حاول مرة أخرى بعد ', 'tooMany'],
  ['⏳ تم إيقاف الدخول لهذا الحساب مؤقتاً — حاول بعد ', 'paused']
];
function waitText(w) {
  let m = w.match(/^(\d+) دقيقة$/);
  if (m) return t('g3.login.wait.minutes', { n: m[1] });
  m = w.match(/^(\d+) ثانية$/);
  if (m) return t('g3.login.wait.seconds', { n: m[1] });
  return w;
}
export function loginErrorText(error) {
  if (typeof error !== 'string' || !error) return error;
  for (const [ar, key] of LOGIN_ERRORS) {
    if (error === ar) return t('g3.login.' + (key === 'empty' ? 'emptyError' : 'err.' + key));
  }
  if (error.startsWith('❌ البريد غير مُفعّل')) return t('g3.login.err.unconfirmed');
  for (const [prefix, key] of WAIT_ERRORS) {
    if (error.startsWith(prefix)) return t('g3.login.err.' + key, { wait: waitText(error.slice(prefix.length)) });
  }
  return error;
}

export const LOGIN_EMPTY_ERROR = '❌ من فضلك أدخل البريد الإلكتروني وكلمة المرور';

// Remember-me starts checked.
export const LOGIN_REMEMBER_DEFAULT = true;

// Submit is blocked (with LOGIN_EMPTY_ERROR) when the email is blank after
// trimming or the password is empty. The password is NOT trimmed: a password
// of only spaces passes this check (legacy).
export const loginFieldsMissing = (username, password) => !username.trim() || !password;

export const passwordInputType = showPass => (showPass ? 'text' : 'password');
export const showPassIcon = showPass => (showPass ? '🙈' : '👁');
export const loginButtonLabel = loading => (loading ? t('g3.login.submitting') : t('g3.login.submit'));
export const loginButtonOpacity = loading => (loading ? 0.7 : 1);
