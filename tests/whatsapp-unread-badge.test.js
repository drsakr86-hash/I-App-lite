import test from 'node:test';
import assert from 'node:assert/strict';
import { unreadConversationCount, waTabLabel, withTitleBadge, unreadIncreased } from '../src/modules/whatsapp/model.js';

test('unreadConversationCount counts conversations with unread messages only', () => {
  assert.equal(unreadConversationCount([{ unread_count: 2 }, { unread_count: 0 }, { unread_count: 1 }, null]), 2);
  assert.equal(unreadConversationCount(undefined), 0);
});
test('waTabLabel shows the count only when there is one', () => {
  assert.equal(waTabLabel('واتساب', 0), 'واتساب');
  assert.equal(waTabLabel('واتساب', 3), 'واتساب (3)');
});
test('withTitleBadge adds, replaces and removes the prefix without stacking', () => {
  assert.equal(withTitleBadge('I App', 2), '(2) I App');
  assert.equal(withTitleBadge('(2) I App', 5), '(5) I App');
  assert.equal(withTitleBadge('(5) I App', 0), 'I App');
});
test('unreadIncreased: first reading never alerts, later only on increase', () => {
  assert.equal(unreadIncreased(null, 4), false);
  assert.equal(unreadIncreased(2, 3), true);
  assert.equal(unreadIncreased(3, 3), false);
  assert.equal(unreadIncreased(3, 1), false);
});
