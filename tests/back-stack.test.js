import test from 'node:test';
import assert from 'node:assert/strict';
import { createBackStack } from '../src/app/back-stack.js';

// Minimal window/history double: entries + index, asynchronous back() like a real browser.
function fakeWindow() {
  const entries = [{ usr: null, key: 'k0', idx: 0 }];
  let i = 0;
  const listeners = new Set();
  const tasks = [];
  const win = {
    history: {
      get state() { return entries[i]; },
      pushState(st) { entries.length = i + 1; entries.push(st); i += 1; },
      replaceState(st) { entries[i] = st; },
      back() { tasks.push(() => { if (i > 0) { i -= 1; listeners.forEach(l => l({ state: entries[i] })); } }); }
    },
    addEventListener(type, fn) { if (type === 'popstate') listeners.add(fn); },
    removeEventListener(type, fn) { listeners.delete(fn); },
    // test helpers
    run() { while (tasks.length) tasks.shift()(); },
    userBack() { win.history.back(); win.run(); },
    get length() { return entries.length; },
    get index() { return i; }
  };
  return win;
}

test('back closes the top overlay first, then nothing is left open', () => {
  const w = fakeWindow(), bs = createBackStack(w);
  const closed = [];
  bs.pushLayer(() => closed.push('a'));
  bs.pushLayer(() => closed.push('b'));
  assert.equal(w.index, 2);
  w.userBack();
  assert.deepEqual(closed, ['b']);
  w.userBack();
  assert.deepEqual(closed, ['b', 'a']);
  assert.equal(w.index, 0);
  assert.equal(bs.depth(), 0);
});

test('closing an overlay from the UI consumes its history entry and never calls onBack', () => {
  const w = fakeWindow(), bs = createBackStack(w);
  let backs = 0;
  const release = bs.pushLayer(() => { backs += 1; });
  assert.equal(w.index, 1);
  release(); w.run();
  assert.equal(w.index, 0);
  assert.equal(backs, 0);
  release(); w.run(); // idempotent
  assert.equal(w.index, 0);
});

test('release after a back press is a no-op (no second back)', () => {
  const w = fakeWindow(), bs = createBackStack(w);
  let release;
  release = bs.pushLayer(() => release());
  w.userBack();
  w.run();
  assert.equal(w.index, 0);
});

test('router state fields survive our pushes', () => {
  const w = fakeWindow(), bs = createBackStack(w);
  bs.pushLayer(() => {});
  assert.equal(w.history.state.idx, 0);
  assert.equal(w.history.state.key, 'k0');
});

test('tabs: changing tab adds an entry; back restores the previous tab', () => {
  const w = fakeWindow(), bs = createBackStack(w);
  const seen = [];
  bs.watchTabs('dashboard', t => seen.push(t));
  assert.equal(w.history.state.iappTab, 'dashboard');
  assert.equal(w.index, 0, 'the initial tab replaces, it does not push');
  bs.pushTab('patients');
  bs.pushTab('patients'); // same tab twice: one entry
  bs.pushTab('settings');
  assert.equal(w.index, 2);
  w.userBack();
  w.userBack();
  assert.deepEqual(seen, ['patients', 'dashboard']);
});

test('a search result that switches tab while its overlay closes leaves a clean history', () => {
  const w = fakeWindow(), bs = createBackStack(w);
  const seen = [];
  bs.watchTabs('dashboard', t => seen.push(t));
  const release = bs.pushLayer(() => assert.fail('overlay was closed by the UI, not by back'));
  // React order: unmount cleanup (release) first, then the tab effect (pushTab).
  release();
  bs.pushTab('patients');
  assert.equal(w.history.state.iappTab, 'dashboard', 'the tab push waits for our own back() to land');
  w.run();
  assert.equal(w.index, 1);
  assert.equal(w.history.state.iappTab, 'patients');
  assert.equal(w.length, 2, 'dashboard -> patients, no dead overlay entry');
  w.userBack();
  assert.deepEqual(seen, ['dashboard']);
});

test('nested overlays closed together by the UI consume both entries', () => {
  const w = fakeWindow(), bs = createBackStack(w);
  const r1 = bs.pushLayer(() => assert.fail());
  const r2 = bs.pushLayer(() => assert.fail());
  r2(); r1(); w.run();
  assert.equal(w.index, 0);
  assert.equal(bs.depth(), 0);
});

test('an overlay under a tab change keeps working: back restores the tab, then closes it', () => {
  const w = fakeWindow(), bs = createBackStack(w);
  const seen = [], closed = [];
  bs.watchTabs('dashboard', t => seen.push(t));
  bs.pushLayer(() => closed.push('file'));
  bs.pushTab('settings');
  w.userBack();
  assert.deepEqual(closed, ['file']);
});

test('no history API: every call is a harmless no-op', () => {
  const bs = createBackStack(null);
  const release = bs.pushLayer(() => {});
  release();
  bs.pushTab('x');
  bs.watchTabs('x', () => {})();
  assert.equal(bs.depth(), 0);
});
