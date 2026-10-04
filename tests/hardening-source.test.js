// Static guards for the clinical-refinement pass. These read source files, so they prove the
// code shape (no silent catches, lazy screens, responsive/a11y markup) -- NOT runtime behaviour;
// runtime behaviour is covered by the other test files and the render smoke test.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const root = new URL('..', import.meta.url).pathname;
const read = p => readFileSync(join(root, p), 'utf8');
function walk(dir, out = []) {
  for (const n of readdirSync(join(root, dir))) {
    const rel = join(dir, n);
    if (statSync(join(root, rel)).isDirectory()) walk(rel, out);
    else if (/\.(js|jsx)$/.test(n)) out.push(rel);
  }
  return out;
}

test('no empty catch blocks anywhere in src or the service worker', () => {
  const bad = [];
  for (const f of [...walk('src'), 'public/sw.js']) {
    const src = read(f).replace(/\/\*[\s\S]*?\*\//g, m => (m.trim() ? 'C' : '')); // a comment inside the block counts as a documented reason
    if (/catch\s*(\([^)]*\))?\s*\{\s*\}/.test(src)) bad.push(f);
  }
  assert.deepEqual(bad, []);
});

test('heavy screens are code-split with React.lazy (not imported statically)', () => {
  const app = read('src/screens/App.jsx');
  for (const n of ['Radiology', 'ImagingCenter', 'Accounting', 'Settings']) {
    assert.match(app, new RegExp(`const ${n} = lazy\\(`), n);
    assert.doesNotMatch(app, new RegExp(`import ${n} from`), n);
  }
  assert.match(read('src/screens/PatientsContainer.jsx'), /const PatientFileContainer = lazy\(/);
  const router = read('src/app/UnifiedRouter.jsx');
  assert.match(router, /const PatientApp = lazy\(/);
  assert.match(router, /const SecretaryApp = lazy\(/);
  const main = read('src/main.jsx');
  for (const n of ['PatientFile', 'ImagingCenter', 'Accounting', 'Settings', 'Radiology']) assert.doesNotMatch(main, new RegExp(`import ${n}Screen`), n);
});

test('service worker precaches the code-split chunks and the build emits the manifest', () => {
  assert.match(read('public/sw.js'), /precache\.json/);
  assert.match(read('vite.config.js'), /precache\.json/);
});

test('patient file layout: no fixed phone width, responsive classes, ARIA tabs', () => {
  const pf = read('src/screens/PatientFile.jsx');
  assert.doesNotMatch(pf, /maxWidth:\s*480/);
  assert.match(pf, /className="pf-grid"/);
  assert.match(pf, /role="tablist"/);
  assert.match(pf, /aria-controls="pf-panel"/);
  assert.match(pf, /role="tabpanel"/);
  const css = read('src/styles/tokens.css');
  assert.match(css, /@media \(min-width:768px\)/);
  assert.match(css, /@media \(min-width:1100px\)/);
  assert.match(css, /--tap:44px/);
  assert.match(css, /:focus-visible/);
  assert.match(css, /prefers-reduced-motion/);
});

test('Modal is an accessible dialog (role, aria-modal, ESC, focus return, real close button)', () => {
  const c = read('src/components/common.jsx');
  assert.match(c, /role="dialog"/);
  assert.match(c, /aria-modal="true"/);
  assert.match(c, /aria-labelledby/);
  assert.match(c, /e\.key === 'Escape'/);
  assert.match(c, /opener\.focus/);
  assert.match(c, /<button\s[\s\S]*?aria-label="إغلاق"/);
});

test('decorative glow / float / orb keyframes are gone', () => {
  const css = read('src/styles/legacy.css');
  for (const k of ['glow', 'float', 'orb']) assert.doesNotMatch(css, new RegExp(`@keyframes ${k}\\b`));
});

test('success text is never produced without going through the honest save-state helpers', () => {
  const hook = read('src/modules/patient-file/use-patient-file.js');
  assert.match(hook, /interpretSaveResult/);
  assert.match(hook, /interpretWriteOk/);
  assert.doesNotMatch(hook, /message:\s*'تم الحفظ'/);
});
