import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  TOAST_MS, TOAST_WARN_MS, isWarnToast, toastDuration, toastText,
  btnStyle, nextTheme, themeToggleTitle, themeToggleIcon
} from '../src/components/common-model.js';

const C = { accent: '#0AF', teal: '#0DC', danger: '#F24', border: '#223', muted: '#789', bg: '#010' };

// Legacy Btn style, copied verbatim from public/legacy/app-runtime.js.
const legacyBtnStyle = ({ danger, full, small, outline, color }) => {
  const bg = color || C.accent;
  return {
    background: outline ? "transparent" : danger ? `linear-gradient(135deg,${C.danger},#aa0020)` : `linear-gradient(135deg,${bg},${C.teal})`,
    border: outline ? `1px solid ${C.border}` : "none",
    borderRadius: 10,
    padding: small ? "6px 14px" : "11px 18px",
    color: outline ? C.muted : C.bg,
    fontWeight: 700,
    fontSize: small ? 11 : 13,
    cursor: "pointer",
    width: full ? "100%" : "auto",
    whiteSpace: "nowrap",
    fontFamily: "inherit"
  };
};

test('toast durations are the legacy 2200 / 4000 ms', () => {
  assert.equal(TOAST_MS, 2200);
  assert.equal(TOAST_WARN_MS, 4000);
  assert.equal(toastDuration(false), 2200);
  assert.equal(toastDuration(true), 4000);
});

test('isWarnToast: only strings starting with ⚠', () => {
  assert.equal(isWarnToast('⚠ يوجد موعد آخر'), true);
  assert.equal(isWarnToast('⚠'), true);
  assert.equal(isWarnToast('تم الحفظ'), false);
  assert.equal(isWarnToast(' ⚠ مسافة'), false);
  assert.equal(isWarnToast('❌ لم يتم الحفظ'), false);
  assert.equal(isWarnToast('✓ تم تحصيل 300 ج.م'), false);
  assert.equal(isWarnToast(''), false);
  assert.equal(isWarnToast(null), false);
  assert.equal(isWarnToast(undefined), false);
  assert.equal(isWarnToast(42), false);
});

test('toastText: warnings as-is, everything else gets the "✓ " prefix', () => {
  assert.equal(toastText('⚠ تحذير', true), '⚠ تحذير');
  assert.equal(toastText('تم الحفظ', false), '✓ تم الحفظ');
  // Legacy quirk kept: a message that already has ✓ gets a second one.
  assert.equal(toastText('✓ تم تحصيل 300 ج.م', false), '✓ ✓ تم تحصيل 300 ج.م');
  assert.equal(toastText('❌ فشل', false), '✓ ❌ فشل');
  assert.equal(toastText(5, false), '✓ 5');
  assert.equal(toastText(undefined, false), '✓ undefined');
});

test('btnStyle matches the legacy Btn style for every prop combination', () => {
  const flags = ['danger', 'full', 'small', 'outline'];
  for (let mask = 0; mask < 16; mask++) {
    for (const color of [undefined, '', '#ABC']) {
      const p = { color };
      flags.forEach((f, i) => { if (mask & (1 << i)) p[f] = true; });
      assert.deepEqual(btnStyle(C, p), legacyBtnStyle(p), JSON.stringify(p));
      assert.deepEqual(Object.keys(btnStyle(C, p)), Object.keys(legacyBtnStyle(p)));
    }
  }
});

test('btnStyle precedence: outline > danger > color', () => {
  assert.equal(btnStyle(C, { outline: true, danger: true, color: '#ABC' }).background, 'transparent');
  assert.equal(btnStyle(C, { danger: true, color: '#ABC' }).background, 'linear-gradient(135deg,#F24,#aa0020)');
  assert.equal(btnStyle(C, { color: '#ABC' }).background, 'linear-gradient(135deg,#ABC,#0DC)');
  assert.equal(btnStyle(C, {}).background, 'linear-gradient(135deg,#0AF,#0DC)');
  assert.equal(btnStyle(C).width, 'auto');
});

test('btnStyle reads C at call time (theme object is mutated in place)', () => {
  const T = { ...C };
  const before = btnStyle(T, {}).color;
  T.bg = '#FFF';
  assert.notEqual(btnStyle(T, {}).color, before);
  assert.equal(btnStyle(T, {}).color, '#FFF');
});

test('theme toggle helpers', () => {
  assert.equal(nextTheme('dark'), 'light');
  assert.equal(nextTheme('light'), 'dark');
  assert.equal(nextTheme(undefined), 'dark');
  assert.equal(themeToggleTitle('dark'), 'الوضع النهاري');
  assert.equal(themeToggleTitle('light'), 'الوضع الليلي');
  assert.equal(themeToggleIcon('dark'), '☀️');
  assert.equal(themeToggleIcon('light'), '🌙');
});
