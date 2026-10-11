import test from 'node:test';
import assert from 'node:assert/strict';
import { tv } from '../src/modules/i18n/tv.js';

test('tv translates each segment of a " · " composite value', () => {
  assert.equal(tv('راتب شهري · مصروف شهري ثابت', 'en'), 'راتب شهري · Fixed monthly expense');
});
test('tv leaves unknown free text and single terms unchanged / translated as before', () => {
  assert.equal(tv('مصروف شهري ثابت', 'en'), 'Fixed monthly expense');
  assert.equal(tv('free text · more text', 'en'), 'free text · more text');
  assert.equal(tv(undefined, 'en'), '');
});
