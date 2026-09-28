// Pure logic for the staff LoginScreen form shell (src/components/forms/
// LoginScreen.jsx). Every value and expression mirrors the legacy runtime's
// LoginScreen exactly (public/legacy/app-runtime.js).
//
// Authentication itself is NOT here and is not re-implemented anywhere in
// src/: the component calls the legacy runtime's authenticateStaff (Supabase
// signInWithPassword, login-attempt lockout, Arabic error mapping) through the
// IAppLegacy bridge, unchanged.

export const LOGIN_EMPTY_ERROR = '❌ من فضلك أدخل البريد الإلكتروني وكلمة المرور';

// Remember-me starts checked.
export const LOGIN_REMEMBER_DEFAULT = true;

// Submit is blocked (with LOGIN_EMPTY_ERROR) when the email is blank after
// trimming or the password is empty. The password is NOT trimmed: a password
// of only spaces passes this check (legacy).
export const loginFieldsMissing = (username, password) => !username.trim() || !password;

export const passwordInputType = showPass => (showPass ? 'text' : 'password');
export const showPassIcon = showPass => (showPass ? '🙈' : '👁');
export const loginButtonLabel = loading => (loading ? 'جاري الدخول...' : 'تسجيل الدخول');
export const loginButtonOpacity = loading => (loading ? 0.7 : 1);
