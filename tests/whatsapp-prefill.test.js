// Regression: production returned HTTP 400 "does not support assistant message prefill" when the
// request ended with an assistant turn, which produced the "حصلت مشكلة فنية" handoff.
import test from 'node:test';
import assert from 'node:assert/strict';
import { ensureEndsWithUser, toModelMessages } from '../supabase/functions/_shared/assistant.js';

test('history ending with an assistant turn gets the current patient message appended', () => {
  const history = toModelMessages([
    { direction: 'in', body: 'عايز احجز كشف', kind: 'text' },
    { direction: 'out', body: 'تمام، أي عيادة؟', kind: 'text' }
  ]);
  const out = ensureEndsWithUser(history, 'دمنهور');
  assert.equal(out[out.length - 1].role, 'user');
  assert.match(out[out.length - 1].content, /<patient_message>دمنهور<\/patient_message>/);
});

test('history already ending with the patient turn is left alone (no duplicate)', () => {
  const history = toModelMessages([
    { direction: 'out', body: 'أهلاً', kind: 'text' },
    { direction: 'in', body: 'عايز احجز', kind: 'text' }
  ]);
  const out = ensureEndsWithUser(history, 'عايز احجز');
  assert.equal(out.length, history.length);
});

test('empty history yields a single user turn', () => {
  const out = ensureEndsWithUser([], 'مرحبا');
  assert.deepEqual(out.map(m => m.role), ['user']);
});

test('never sends an assistant-last request, and wraps angle brackets', () => {
  const out = ensureEndsWithUser([{ role: 'assistant', content: 'x' }], 'a<b>');
  assert.equal(out[out.length - 1].role, 'user');
  assert.ok(!out[out.length - 1].content.includes('<b>'));
});
