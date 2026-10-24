// In-app handoff alert + admin error panel: pure logic and wiring (static).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { waitingSummary, waitingBannerText, buildErrorRows, unreadIncreased } from '../src/modules/whatsapp/model.js';

const NOW = Date.parse('2026-10-25T12:00:00Z');
const min = m => new Date(NOW - m * 60000).toISOString();

test('waitingSummary counts only handed-over chats with unread messages and reports the oldest wait', () => {
  const rows = [
    { status: 'handoff', unread_count: 2, last_inbound_at: min(23) },
    { status: 'handoff', unread_count: 1, last_inbound_at: min(5) },
    { status: 'handoff', unread_count: 0, last_inbound_at: min(90) },   // already read
    { status: 'ai', unread_count: 3, last_inbound_at: min(60) },        // assistant is handling it
    { status: 'closed', unread_count: 1, last_inbound_at: min(60) },
    null
  ];
  assert.deepEqual(waitingSummary(rows, NOW), { count: 2, oldestMin: 23 });
  assert.deepEqual(waitingSummary([], NOW), { count: 0, oldestMin: 0 });
  assert.deepEqual(waitingSummary(undefined, NOW), { count: 0, oldestMin: 0 });
});

test('banner text: singular, plural, with/without wait, empty', () => {
  assert.equal(waitingBannerText({ count: 0, oldestMin: 0 }), '');
  assert.equal(waitingBannerText({ count: 1, oldestMin: 0 }), 'محادثة واتساب واحدة تنتظر السكرتارية');
  assert.equal(waitingBannerText({ count: 3, oldestMin: 12 }), '3 محادثات واتساب تنتظر السكرتارية — أقدمها من 12 دقيقة');
});

test('alert sounds only when the count goes up (never on first reading)', () => {
  assert.equal(unreadIncreased(null, 2), false); assert.equal(unreadIncreased(1, 2), true); assert.equal(unreadIncreased(2, 2), false); assert.equal(unreadIncreased(2, 1), false);
});

test('buildErrorRows merges the three sources newest first, with no message text', () => {
  const rows = buildErrorRows({
    audits: [{ id: 1, at: '2026-10-25T10:00:00Z', conversation_id: 5, detail: { error: 'llm http 429: rate_limit_error - slow down', attempts: 3 } }],
    failed: [{ id: 9, created_at: '2026-10-25T11:00:00Z', conversation_id: 5, error_code: '131030', error_detail: 'not in allowed list' }],
    retrying: [{ id: 7, created_at: '2026-10-25T09:00:00Z', conversation_id: 6, process_error: 'llm: llm http 400' }]
  });
  assert.deepEqual(rows.map(r => r.kind), ['meta', 'ai', 'process']);
  assert.equal(rows[0].text, '131030 — not in allowed list');
  assert.match(rows[1].text, /llm http 429.*\(3\)/);
  assert.equal(buildErrorRows({}).length, 0);
});

test('wiring: banner on both apps, admin-only error button, strings in both languages', () => {
  const sec = fs.readFileSync(new URL('../src/screens/SecretaryApp.jsx', import.meta.url), 'utf8');
  const app = fs.readFileSync(new URL('../src/screens/App.jsx', import.meta.url), 'utf8');
  const inbox = fs.readFileSync(new URL('../src/screens/WhatsAppInbox.jsx', import.meta.url), 'utf8');
  const dict = fs.readFileSync(new URL('../src/modules/i18n/dict/g9.js', import.meta.url), 'utf8');
  assert.match(sec, /<WaWaitingBanner summary=\{waWaiting\}/);
  assert.match(app, /session\.role === "admin" && effectiveTab !== "whatsapp" && <WaWaitingBanner/);
  assert.match(inbox, /session && session\.role === 'admin' && <button onClick=\{toggleErrors\}/);
  for (const k of ['g9.wa.errors', 'g9.wa.errors.empty', 'g9.wa.errors.k.ai', 'g9.wa.errors.k.meta', 'g9.wa.errors.k.process', 'g9.wa.errors.conv']) assert.equal(dict.split('"' + k + '"').length - 1, 2, k);
});
