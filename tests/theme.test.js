import test from 'node:test';
import assert from 'node:assert/strict';
import { THEMES, C, applyTheme, getTheme } from '../src/modules/theme/index.js';

test('applyTheme: switches C to the light palette and back to dark', () => {
  applyTheme('light');
  assert.equal(C.bg, THEMES.light.bg);
  assert.equal(C.accent, THEMES.light.accent);
  assert.equal(getTheme(), 'light');

  applyTheme('dark');
  assert.equal(C.bg, THEMES.dark.bg);
  assert.equal(C.accent, THEMES.dark.accent);
  assert.equal(getTheme(), 'dark');
});

test('C keeps the same object identity across applyTheme calls (shared by reference)', () => {
  const ref = C;
  applyTheme('light');
  assert.equal(C, ref);
  applyTheme('dark');
  assert.equal(C, ref);
});

test('THEMES: dark and light palettes define exactly the same set of color keys', () => {
  assert.deepEqual(Object.keys(THEMES.dark).sort(), Object.keys(THEMES.light).sort());
});
