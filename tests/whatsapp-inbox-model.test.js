import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { filterConversations, ownerOf, windowOpen, windowLeftMin, deliveryKey, canRetry, isUncertain, bookingState, maskWa, isNotInstalled, newClientId } from '../src/modules/whatsapp/model.js';
import { primaryNavItems, moreNavItems } from '../src/components/bottomnav-model.js';

const NOW = Date.parse('2026-01-15T10:00:00Z'), ago = h => new Date(NOW - h * 3600000).toISOString();
const rows = [
  { id: 1, status: 'ai', ai_enabled: true, unread_count: 0, last_message_at: ago(5), last_inbound_at: ago(5), last_preview: 'الكشف بكام', contact: { wa_id: '201000000001', profile_name: 'سارة' } },
  { id: 2, status: 'handoff', ai_enabled: false, unread_count: 2, assigned_to: 'Sec@x.com', last_message_at: ago(1), last_inbound_at: ago(1), contact: { wa_id: '201000000002', profile_name: 'منى' } },
  { id: 3, status: 'closed', ai_enabled: true, unread_count: 0, last_message_at: ago(30), last_inbound_at: ago(30), contact: { wa_id: '201000000003' } }
];
test('owner: AI only while status=ai and ai_enabled; closed is closed', () => { assert.deepEqual(rows.map(ownerOf), ['ai', 'human', 'closed']); assert.equal(ownerOf({ status: 'ai', ai_enabled: false }), 'human'); });
test('24h window math', () => { assert.equal(windowOpen(rows[0], NOW), true); assert.equal(windowOpen(rows[2], NOW), false); assert.equal(windowOpen({}, NOW), false); assert.equal(windowLeftMin(rows[1], NOW), 23 * 60); });
test('filters, search (name/number/preview) and newest-first order', () => {
  assert.deepEqual(filterConversations(rows, {}).map(c => c.id), [2, 1, 3]);
  assert.deepEqual(filterConversations(rows, { filter: 'unread' }).map(c => c.id), [2]);
  assert.deepEqual(filterConversations(rows, { filter: 'handoff' }).map(c => c.id), [2]);
  assert.deepEqual(filterConversations(rows, { filter: 'mine', me: 'sec@x.com' }).map(c => c.id), [2]);
  assert.deepEqual(filterConversations(rows, { filter: 'failed', failedIds: new Set([3]) }).map(c => c.id), [3]);
  assert.deepEqual(filterConversations(rows, { search: 'سارة' }).map(c => c.id), [1]);
  assert.deepEqual(filterConversations(rows, { search: '0100000000 02' }).map(c => c.id), []);
  assert.deepEqual(filterConversations(rows, { search: '000000002' }).map(c => c.id), [2]);
  assert.deepEqual(filterConversations(rows, { search: 'بكام' }).map(c => c.id), [1]);
});
test('delivery state, retry rules and the "may have been delivered" warning', () => {
  assert.equal(deliveryKey({ direction: 'in' }), null); assert.equal(deliveryKey({ direction: 'out', status: 'read' }), 'read');
  assert.equal(canRetry({ direction: 'out', status: 'failed', error_code: '131026' }), true);
  assert.equal(canRetry({ direction: 'out', status: 'failed', error_code: 'WINDOW_CLOSED' }), false);
  assert.equal(canRetry({ direction: 'out', status: 'sent' }), false);
  assert.equal(isUncertain({ direction: 'out', status: 'failed', error_code: 'UNCERTAIN_NETWORK' }), true);
});
test('a booking is "confirmed" only when the appointment says so; otherwise it is a request', () => {
  assert.equal(bookingState({ confirmed: true }), 'confirmed'); assert.equal(bookingState({ confirmed: false }), 'requested'); assert.equal(bookingState({ confirmed: true, cancelled: true }), 'cancelled'); assert.equal(bookingState(null), null);
});
test('helpers', () => {
  assert.equal(maskWa('201000000001'), '2010••••001'); assert.ok(newClientId().length > 8);
  assert.equal(isNotInstalled({ code: '42P01' }), true); assert.equal(isNotInstalled({ message: 'Could not find the table public.wa_conversations' }), true); assert.equal(isNotInstalled({ message: 'JWT expired' }), false);
});
test('WhatsApp entry is in the More menu, admin only; the secretary app has its own tab and the screen is never part of the public queue display', () => {
  assert.ok(moreNavItems('admin').some(i => i.id === 'whatsapp')); assert.ok(!moreNavItems('secretary').some(i => i.id === 'whatsapp')); assert.ok(!primaryNavItems('admin').some(i => i.id === 'whatsapp'));
  assert.match(fs.readFileSync(new URL('../src/screens/SecretaryApp.jsx', import.meta.url), 'utf8'), /tab === "whatsapp"/);
  for (const f of fs.readdirSync(new URL('../src/screens', import.meta.url)).filter(f => /Tv|Queue|Display/i.test(f))) assert.ok(!/WhatsApp/i.test(fs.readFileSync(new URL('../src/screens/' + f, import.meta.url), 'utf8')), f);
});
