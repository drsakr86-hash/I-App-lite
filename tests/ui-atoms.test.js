import test from 'node:test';
import assert from 'node:assert/strict';
import { applyTheme, C } from '../src/modules/theme/index.js';
import { SC, inp, fieldLabelStyle, secHeadLabelColor, tagStyle, XRAY_ICON } from '../src/modules/ui/atoms-model.js';

test('SC: reads the live theme colors for each known status', () => {
  applyTheme('dark');
  assert.equal(SC['مكتمل'], C.success);
  assert.equal(SC['متابعة'], C.gold);
  assert.equal(SC['طارئ'], C.danger);

  applyTheme('light');
  assert.equal(SC['مكتمل'], C.success);
  assert.equal(SC['متابعة'], C.gold);
  assert.equal(SC['طارئ'], C.danger);
  applyTheme('dark');
});

test('SC: an unknown status key is not present (legacy falls back to C.muted at the call site)', () => {
  assert.equal(SC['غير معروف'], undefined);
});

test('inp: base style reads the live theme, extra styles are merged in and can override', () => {
  applyTheme('dark');
  const base = inp();
  assert.equal(base.background, C.bg);
  assert.equal(base.border, `1px solid ${C.border}`);
  assert.equal(base.color, C.text);
  assert.equal(base.direction, 'rtl');

  const merged = inp({ textAlign: 'center', background: '#000' });
  assert.equal(merged.textAlign, 'center');
  assert.equal(merged.background, '#000');
});

test('fieldLabelStyle: reads the live muted color', () => {
  applyTheme('light');
  assert.equal(fieldLabelStyle().color, C.muted);
  applyTheme('dark');
  assert.equal(fieldLabelStyle().color, C.muted);
});

test('secHeadLabelColor: given color wins, otherwise falls back to the accent color', () => {
  assert.equal(secHeadLabelColor('#ABC'), '#ABC');
  assert.equal(secHeadLabelColor(undefined), C.accent);
  assert.equal(secHeadLabelColor(''), C.accent);
});

test('tagStyle: pill background is the color at ~13% opacity ("22" suffix)', () => {
  const s = tagStyle('#112233');
  assert.equal(s.background, '#11223322');
  assert.equal(s.color, '#112233');
  assert.equal(s.borderRadius, 8);
});

test('XRAY_ICON: a data-URI SVG', () => {
  assert.match(XRAY_ICON, /^data:image\/svg\+xml,/);
});
