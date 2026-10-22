import test from 'node:test';
import assert from 'node:assert/strict';
import { QUICK_REPLIES, applyQuickReply } from '../src/modules/whatsapp/quickReplies.js';

test('quick replies have unique ids, labels and short non-empty texts', () => {
  assert.ok(QUICK_REPLIES.length >= 5);
  assert.equal(new Set(QUICK_REPLIES.map(q => q.id)).size, QUICK_REPLIES.length);
  for (const q of QUICK_REPLIES) { assert.ok(q.label && q.text); assert.ok(q.text.length < 900); }
});
test('applyQuickReply: fills an empty box, appends on a new line, respects the limit', () => {
  assert.equal(applyQuickReply('', 'مرحبا'), 'مرحبا');
  assert.equal(applyQuickReply('أهلا  ', 'مرحبا'), 'أهلا\nمرحبا');
  assert.equal(applyQuickReply('x'.repeat(3990), 'y'.repeat(50)), 'x'.repeat(3990));
});
test('no opening hours are sent as a ready reply until the schedule is confirmed', () => {
  assert.ok(!QUICK_REPLIES.some(q => /مواعيد العمل|من \d+ (مساء|صباح)/.test(q.text)));
});
