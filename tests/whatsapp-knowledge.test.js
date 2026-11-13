import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { looksPersonal, suggestTopic, checkApproval } from '../src/modules/whatsapp/knowledge.js';

test('looksPersonal catches phones (also Arabic digits), e-mail and links, not prices', () => {
  assert.equal(looksPersonal('كلمنا على 01012345678'), true);
  assert.equal(looksPersonal('٠١٠١٢٣٤٥٦٧٨'), true);
  assert.equal(looksPersonal('010 1234 5678'), true);
  assert.equal(looksPersonal('a@b.com'), true);
  assert.equal(looksPersonal('https://x.y/z'), true);
  assert.equal(looksPersonal('الكشف 300 جنيه والإعادة 100'), false);
});
test('suggestTopic uses the first line of the question, trimmed to 80 chars; falls back to the answer', () => {
  assert.equal(suggestTopic('هل في تحضير للعملية؟\nشكرا', 'x'), 'هل في تحضير للعملية؟');
  assert.ok(suggestTopic('س'.repeat(200), '').length <= 80);
  assert.equal(suggestTopic('', 'الصيام 6 ساعات'), 'الصيام 6 ساعات');
});
test('checkApproval enforces column limits and blocks personal data', () => {
  assert.equal(checkApproval('الصيام', 'الصيام قبل العملية 6 ساعات'), null);
  assert.equal(checkApproval('', 'نص'), 'topic');
  assert.equal(checkApproval('عنوان', 'x'.repeat(1201)), 'answer');
  assert.equal(checkApproval('عنوان', 'اتصل بنا 01012345678'), 'personal');
});
test('migration: prepared only, admin-only, no destructive statements, rollback exists', () => {
  const sql = fs.readFileSync('docs/sql/wa-knowledge-review.sql', 'utf8');
  assert.match(sql, /NOT APPLIED/);
  assert.equal((sql.match(/iapp_has_role\(array\['admin'\]\)/g) || []).length, 3);
  assert.doesNotMatch(sql, /\bdelete\s+from\b|\btruncate\b|drop\s+table|alter\s+table\s+public\.wa_(messages|faq)/i);
  assert.match(sql, /revoke all on function public\.wa_reply_candidates/);
  assert.ok(fs.existsSync('docs/sql/wa-knowledge-review-rollback.sql'));
});
