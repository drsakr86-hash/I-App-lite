import test from 'node:test';
import assert from 'node:assert/strict';
import { visibleInterval } from '../src/app/visible-interval.js';

const fakeDoc = () => {
  const ls = new Set();
  return { hidden: false, addEventListener: (_t, f) => ls.add(f), removeEventListener: (_t, f) => ls.delete(f), fire: () => ls.forEach(f => f()), count: () => ls.size };
};
const wait = ms => new Promise(r => setTimeout(r, ms));

test('visibleInterval: ticks while visible, pauses while hidden, fires at once on return, stop() cleans up', async () => {
  const doc = fakeDoc();
  let n = 0;
  const stop = visibleInterval(() => { n += 1; }, 20, doc);
  await wait(70);
  assert.ok(n >= 2, 'ticks while visible');
  doc.hidden = true;
  const frozen = n;
  await wait(70);
  assert.equal(n, frozen, 'no ticks while hidden');
  doc.fire();
  assert.equal(n, frozen, 'a visibilitychange to hidden does not fire');
  doc.hidden = false;
  doc.fire();
  assert.equal(n, frozen + 1, 'fires immediately when visible again');
  stop();
  const end = n;
  await wait(60);
  assert.equal(n, end);
  assert.equal(doc.count(), 0);
});

test('visibleInterval: works without a document (node / tests)', async () => {
  let n = 0;
  const stop = visibleInterval(() => { n += 1; }, 10, null);
  await wait(35);
  stop();
  assert.ok(n >= 1);
});
