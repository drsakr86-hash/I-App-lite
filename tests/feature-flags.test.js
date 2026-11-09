import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveFlag, parseFlagQuery, persistQueryFlags, isEnabled, FLAG_DEFS } from '../src/modules/feature-flags/index.js';

test('flags: on by default (since 2026-11-10), can be switched off, unknown flags always off', () => {
  assert.equal(resolveFlag('atlas', {}), true);
  assert.equal(resolveFlag('atlas', { query: '?ff=-atlas' }), false);
  assert.equal(resolveFlag('nope', { env: '1', stored: '1', query: '?ff=nope' }), false);
  assert.equal(isEnabled('atlas'), true); // node: no window, no env -> default
});
test('flags: precedence is query > stored > env > default', () => {
  assert.equal(resolveFlag('atlas', { env: '1' }), true);
  assert.equal(resolveFlag('atlas', { env: '1', stored: '0' }), false);
  assert.equal(resolveFlag('atlas', { env: '0', stored: '1' }), true);
  assert.equal(resolveFlag('atlas', { env: '1', stored: '1', query: '?ff=-atlas' }), false);
  assert.equal(resolveFlag('atlas', { stored: '0', query: '?ff=atlas' }), true);
});
test('flags: query parsing handles lists, negation and junk', () => {
  assert.deepEqual(parseFlagQuery('?ff=atlas,-other'), { atlas: true, other: false });
  assert.deepEqual(parseFlagQuery(''), {});
  assert.deepEqual(parseFlagQuery('?x=1'), {});
});
test('flags: an explicit query choice is remembered; storage errors are swallowed', () => {
  const mem = new Map();
  const storage = { setItem: (k, v) => mem.set(k, v) };
  persistQueryFlags('?ff=atlas', storage);
  assert.equal(mem.get(FLAG_DEFS.atlas.storageKey), '1');
  persistQueryFlags('?ff=-atlas', storage);
  assert.equal(mem.get(FLAG_DEFS.atlas.storageKey), '0');
  persistQueryFlags('?ff=atlas', { setItem() { throw new Error('quota'); } });
});
