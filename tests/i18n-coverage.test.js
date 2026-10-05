import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { AR, EN } from '../src/modules/i18n/index.js';
import { AR_TO_EN, translateTerm } from '../src/modules/i18n/medical-terms.js';

const walk = d => readdirSync(d).flatMap(n => { const p = join(d, n); return statSync(p).isDirectory() ? walk(p) : [p]; });
const files = walk(new URL('../src', import.meta.url).pathname).filter(p => /\.jsx?$/.test(p) && !p.includes('/i18n/'));
const ARABIC = /[؀-ۿ]/;

test('i18n: every literal t("key") used in src exists in both languages', () => {
  const missing = [];
  for (const f of files) {
    const s = readFileSync(f, 'utf8');
    for (const m of s.matchAll(/\bt\(\s*['"]([A-Za-z0-9_.\-]+)['"]\s*[,)]/g)) {
      if (!(m[1] in AR) || !(m[1] in EN)) missing.push(m[1] + ' <- ' + f.split('/src/')[1]);
    }
  }
  assert.deepEqual(missing, []);
});

test('i18n: Arabic and English dictionaries have the same keys; English never contains Arabic letters', () => {
  assert.deepEqual(Object.keys(AR).sort(), Object.keys(EN).sort());
  const bad = Object.entries(EN).filter(([k, v]) => !['lang.toggle', 'report.lang.ar'].includes(k) && ARABIC.test(v)).map(([k]) => k);
  assert.deepEqual(bad, []);
});

test('i18n: term pairs are English-only on the English side and round-trip back to Arabic', () => {
  const bad = Object.entries(AR_TO_EN).filter(([, en]) => ARABIC.test(en)).map(([ar]) => ar);
  assert.deepEqual(bad, []);
  assert.equal(translateTerm('عين حمراء', 'en'), 'Red eye');
  assert.equal(translateTerm('Red eye', 'ar'), 'عين حمراء');
  assert.equal(translateTerm('نص حر غير معروف', 'en'), 'نص حر غير معروف');
});
