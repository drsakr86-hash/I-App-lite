import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { askConfirm, notify, setDialogHost } from '../src/modules/ui/dialogs.js';
import { friendlyError, errorKind, rawErrorText } from '../src/modules/errors/friendly.js';
import { t } from '../src/modules/i18n/index.js';

const SRC = fileURLToPath(new URL('../src', import.meta.url));
const walk = dir => readdirSync(dir).flatMap(n => {
  const p = join(dir, n);
  return statSync(p).isDirectory() ? walk(p) : /\.(js|jsx)$/.test(n) ? [p] : [];
});

test('no native alert()/confirm() call is left in src (use notify / askConfirm)', () => {
  const offenders = [];
  for (const file of walk(SRC)) {
    if (/modules[\\/]ui[\\/]dialogs\.js$/.test(file) || /i18n[\\/]dict/.test(file)) continue;
    readFileSync(file, 'utf8').split('\n').forEach((line, i) => {
      if (/^\s*(\/\/|\*)/.test(line)) return;
      if (/(?<![\w.$])(window\.)?(alert|confirm)\(/.test(line)) offenders.push(file.slice(SRC.length + 1) + ':' + (i + 1));
    });
  }
  assert.deepEqual(offenders, []);
});

test('askConfirm / notify: go through the mounted host', async () => {
  const seen = [];
  const off = setDialogHost({ confirm: async m => { seen.push(['c', m]); return true; }, alert: async m => { seen.push(['a', m]); } });
  assert.equal(await askConfirm('حذف؟'), true);
  await notify('تم');
  assert.deepEqual(seen, [['c', 'حذف؟'], ['a', 'تم']]);
  off();
});

test('askConfirm / notify: without a host fall back to the native dialog, and to "no" when there is none', async () => {
  const w = globalThis.window, c = globalThis.confirm, a = globalThis.alert;
  try {
    globalThis.window = undefined;
    const got = [];
    globalThis.confirm = m => { got.push(m); return 1; };
    globalThis.alert = m => { got.push(m); };
    assert.equal(await askConfirm('x'), true);
    await notify('y');
    assert.deepEqual(got, ['x', 'y']);
    globalThis.confirm = undefined;
    assert.equal(await askConfirm('x'), false, 'no way to ask -> do not perform the action');
  } finally { globalThis.window = w; globalThis.confirm = c; globalThis.alert = a; }
});

test('an unregistered host is not used again; a newer host is not removed by an older unregister', async () => {
  const offA = setDialogHost({ confirm: async () => true, alert: async () => {} });
  const offB = setDialogHost({ confirm: async () => false, alert: async () => {} });
  offA();
  assert.equal(await askConfirm('x'), false, 'host B still active');
  offB();
});

test('friendlyError: technical errors become readable, in the requested language', () => {
  const cases = [
    [new TypeError('Failed to fetch'), 'network'],
    [{ message: 'NetworkError when attempting to fetch resource.' }, 'network'],
    [Object.assign(new Error('The operation was aborted'), { name: 'AbortError' }), 'timeout'],
    [{ message: 'JWT expired' }, 'session'],
    [{ code: '42501', message: 'new row violates row-level security policy for table "x"' }, 'forbidden'],
    [{ message: 'duplicate key value violates unique constraint "p_pkey"' }, 'duplicate'],
    ['Too Many Requests', 'rate'],
    ['HTTP 503', 'server'],
    ["TypeError: Cannot read properties of undefined (reading 'id')", 'unexpected']
  ];
  for (const [e, kind] of cases) {
    assert.equal(errorKind(e), kind, rawErrorText(e));
    assert.equal(friendlyError(e, 'ar'), t('g14.err.' + kind, 'ar'));
    assert.equal(friendlyError(e, 'en'), t('g14.err.' + kind, 'en'));
    assert.doesNotMatch(friendlyError(e, 'ar'), /fetch|JWT|TypeError|constraint/i);
  }
});

test('friendlyError: the app\'s own messages, business text and sentinels pass through unchanged', () => {
  for (const m of ['offline', 'تعذر الحفظ', 'الموعد محجوز بالفعل', 'boom', 'المبلغ 500 جنيه', 'الرقم 401 غير صحيح', 'conversation_active'])
    assert.equal(friendlyError(m), m);
  assert.equal(friendlyError({ message: 'تعذر الحفظ' }), 'تعذر الحفظ');
  assert.equal(friendlyError(null, 'ar'), t('g14.err.unexpected', 'ar'));
});
