import test from 'node:test';
import assert from 'node:assert/strict';
import { screenPreferenceToStore, isNewScreenPreferred } from '../src/modules/ui/screen-preference.js';

// ---- screenPreferenceToStore ----
test('screenPreferenceToStore: ?ui=react stores "react"', () => {
  assert.equal(screenPreferenceToStore('react'), 'react');
});

test('screenPreferenceToStore: ?ui=legacy stores "legacy"', () => {
  assert.equal(screenPreferenceToStore('legacy'), 'legacy');
});

test('screenPreferenceToStore: no ?ui param (or any other value) writes nothing', () => {
  assert.equal(screenPreferenceToStore(null), null);
  assert.equal(screenPreferenceToStore(undefined), null);
  assert.equal(screenPreferenceToStore(''), null);
  assert.equal(screenPreferenceToStore('something-else'), null);
});

// ---- isNewScreenPreferred ----
test('isNewScreenPreferred: defaults to true (React) when nothing was ever stored', () => {
  assert.equal(isNewScreenPreferred(null), true);
  assert.equal(isNewScreenPreferred(undefined), true);
});

test('isNewScreenPreferred: "legacy" is the only opt-out', () => {
  assert.equal(isNewScreenPreferred('legacy'), false);
});

test('isNewScreenPreferred: an explicit "react" (from earlier testing) still means React', () => {
  assert.equal(isNewScreenPreferred('react'), true);
});

test('isNewScreenPreferred: any unrecognized stored value defaults to React, not legacy', () => {
  assert.equal(isNewScreenPreferred('something-unexpected'), true);
});
