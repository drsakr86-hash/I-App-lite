import test from 'node:test';
import assert from 'node:assert/strict';
import { waOpen, waReminderText, waFollowUpText } from '../src/modules/notifications/whatsapp.js';

test.afterEach(() => {
  delete globalThis.window;
  delete globalThis.alert;
});

test('waOpen: normalizes an Egyptian local number and opens wa.me with the encoded text', () => {
  let opened = null;
  globalThis.window = { open: (url, target) => { opened = { url, target }; } };
  const ok = waOpen('01012345678', 'مرحباً');
  assert.equal(ok, true);
  assert.equal(opened.url, 'https://wa.me/201012345678?text=' + encodeURIComponent('مرحباً'));
  assert.equal(opened.target, '_blank');
});

test('waOpen: a number already in international form (with or without 00) is not double-prefixed', () => {
  let opened = null;
  globalThis.window = { open: (url) => { opened = url; } };
  waOpen('0020101234 5678', 'x');
  assert.equal(opened, 'https://wa.me/201012345678?text=x');
  waOpen('+201012345678', 'x');
  assert.equal(opened, 'https://wa.me/201012345678?text=x');
});

test('waOpen: no usable phone number alerts and returns false without opening anything', () => {
  let opened = false;
  let alerted = null;
  globalThis.window = { open: () => { opened = true; } };
  globalThis.alert = msg => { alerted = msg; };
  const ok = waOpen('', 'x');
  assert.equal(ok, false);
  assert.equal(opened, false);
  assert.equal(alerted, 'لا يوجد رقم هاتف صحيح لهذا المريض');
});

test('waReminderText: builds the Arabic reminder message with first name, date/time and clinic label', () => {
  const text = waReminderText({ patient: 'أحمد محمد', date: '2026-10-05', time: '14:00', clinic: 'دمنهور' });
  assert.match(text, /^أهلاً أحمد 🌿/);
  assert.match(text, /عيادة دمنهور/);
  assert.match(text, /2026-10-05/);
  assert.match(text, /14:00/);
});

test('waReminderText: missing date/time/clinic degrade gracefully (empty, not "undefined")', () => {
  const text = waReminderText({ patient: 'سارة' });
  assert.ok(!text.includes('undefined'));
});

test('waFollowUpText: builds the follow-up message with first name, date and the given reason', () => {
  const text = waFollowUpText('محمد علي', '2026-11-01', 'موعد المتابعة بعد العملية');
  assert.match(text, /^أهلاً محمد 🌿/);
  assert.match(text, /موعد المتابعة بعد العملية/);
  assert.match(text, /2026-11-01/);
});

test('waFollowUpText: falls back to the default reason text when none is given', () => {
  const text = waFollowUpText('محمد', '2026-11-01', '');
  assert.match(text, /موعد المتابعة الخاص بك/);
});
