import test from 'node:test';
import assert from 'node:assert/strict';
import { RULESET, rulesetReviewed, validDismissal, makeReview, appendReview, reviewState } from '../src/modules/ddx/review.js';

test('rule set is versioned and honestly reports that no clinician review is recorded', () => {
  assert.match(RULESET.version, /^\d+\.\d+\.\d+$/);
  assert.equal(rulesetReviewed(), false);
  assert.equal(rulesetReviewed({ reviewedBy: 'Dr X', reviewedAt: '2026-11-12' }), true);
});

test('dismissal needs a reason; "other" needs text', () => {
  assert.equal(validDismissal('', ''), false);
  assert.equal(validDismissal('clinicallyUnlikely', ''), true);
  assert.equal(validDismissal('other', 'abc'), false);
  assert.equal(validDismissal('other', 'already treated'), true);
  assert.throws(() => makeReview({ itemId: 'a', label: 'A', action: 'dismissed' }));
});

test('history is append-only, latest decision wins, restore clears dismissal', () => {
  let l = [];
  l = appendReview(l, makeReview({ itemId: 'x', label: 'X', action: 'dismissed', reasonKey: 'notApplicable', by: 'd@x', at: 't1' }));
  assert.equal(reviewState(l, 'x'), 'dismissed');
  assert.equal(l[0].reason, 'notApplicable'); assert.match(l[0].ruleset, /^ddx-rules@/);
  const before = l;
  l = appendReview(l, makeReview({ itemId: 'x', label: 'X', action: 'restored', at: 't2' }));
  assert.equal(before.length, 1); assert.equal(l.length, 2); assert.equal(reviewState(l, 'x'), null);
  l = appendReview(l, makeReview({ itemId: 'x', label: 'X', action: 'accepted', at: 't3' }));
  assert.equal(reviewState(l, 'x'), 'accepted'); assert.equal(reviewState(l, 'other'), null);
});
