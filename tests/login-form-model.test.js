import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  LOGIN_EMPTY_ERROR, LOGIN_REMEMBER_DEFAULT, loginFieldsMissing, passwordInputType, showPassIcon,
  loginButtonLabel, loginButtonOpacity
} from '../src/components/forms/login-form-model.js';
import { legacyFunctionSource } from './forms-legacy-source.js';

const SRC = legacyFunctionSource('LoginScreen');

test('strings and defaults are the legacy LoginScreen ones', () => {
  assert.equal(LOGIN_EMPTY_ERROR, '❌ من فضلك أدخل البريد الإلكتروني وكلمة المرور');
  assert.ok(SRC.includes('setError("' + LOGIN_EMPTY_ERROR + '")'));
  assert.equal(LOGIN_REMEMBER_DEFAULT, true);
  assert.ok(SRC.includes('const [remember, setRemember] = useState(true);'));
  assert.ok(SRC.includes('if (!username.trim() || !password) {'));
  assert.ok(SRC.includes('type: showPass ? "text" : "password"'));
  assert.ok(SRC.includes('showPass ? "🙈" : "👁"'));
  assert.ok(SRC.includes('loading ? "جاري الدخول..." : "تسجيل الدخول"'));
  assert.ok(SRC.includes('opacity: loading ? 0.7 : 1'));
});

test('loginFieldsMissing: email trimmed, password not', () => {
  assert.equal(loginFieldsMissing('', ''), true);
  assert.equal(loginFieldsMissing('a@b.c', ''), true);
  assert.equal(loginFieldsMissing('', 'pw'), true);
  assert.equal(loginFieldsMissing('   ', 'pw'), true);
  assert.equal(loginFieldsMissing('\t\n', 'pw'), true);
  assert.equal(loginFieldsMissing('a@b.c', 'pw'), false);
  // Legacy: a whitespace-only password is not "missing".
  assert.equal(loginFieldsMissing('a@b.c', '   '), false);
  // No format check here (authenticateStaff reports a missing "@").
  assert.equal(loginFieldsMissing('admin', 'x'), false);
});

test('password visibility, button label and opacity', () => {
  assert.equal(passwordInputType(false), 'password');
  assert.equal(passwordInputType(true), 'text');
  assert.equal(showPassIcon(false), '👁');
  assert.equal(showPassIcon(true), '🙈');
  assert.equal(loginButtonLabel(false), 'تسجيل الدخول');
  assert.equal(loginButtonLabel(true), 'جاري الدخول...');
  assert.equal(loginButtonOpacity(false), 1);
  assert.equal(loginButtonOpacity(true), 0.7);
});

// Final batch: the component now imports authenticateStaff directly from
// src/modules/auth/staff-login.js (no more legacy bridge) but calls it with
// exactly the same arguments/result handling as the legacy LoginScreen did.
test('LoginScreen port calls authenticateStaff, same shape as legacy', () => {
  const jsx = readFileSync(new URL('../src/components/forms/LoginScreen.jsx', import.meta.url), 'utf8');
  const model = readFileSync(new URL('../src/components/forms/login-form-model.js', import.meta.url), 'utf8');
  assert.ok(jsx.includes("import { authenticateStaff } from '../../modules/auth/staff-login.js';"));
  assert.ok(SRC.includes('authenticateStaff(username, password).then(r => {'));
  assert.ok(jsx.includes('authenticateStaff(username, password).then(r => {'));
  assert.ok(SRC.includes('onLogin(r.user, remember);') && jsx.includes('onLogin(r.user, remember);'));
  assert.ok(SRC.includes('} else setError(r.error);') && jsx.includes('} else setError(r.error);'));
  // The component itself still has no inline auth logic -- it only calls
  // the imported authenticateStaff (login-form-model.js never touches this).
  const code = s => s.split('\n').filter(l => !l.trim().startsWith('//')).join('\n');
  for (const s of [jsx, model]) {
    assert.ok(!/signInWithPassword|registerLoginFail|lockRemaining|resolveProfile|sb\.auth|supabase/i.test(code(s)));
  }
});
