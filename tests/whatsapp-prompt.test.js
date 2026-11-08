// Prompt contract for the WhatsApp receptionist. Checks the rules added after the Nov 2026 conversation review
// (complaints about waiting, unknown info such as doctor schedules and insurance paperwork, hours only from the tool).
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSystemPrompt } from '../supabase/functions/_shared/assistant.js';

const prompt = buildSystemPrompt({ info: {}, now: new Date('2026-01-15T18:00:00Z'), config: { booking_mode: 'direct', clinic_tz: 'Africa/Cairo' }, flow: {}, channel: 'whatsapp' });

test('rules are numbered 1..14 in order with no gaps', () => {
  const nums = [...prompt.matchAll(/^(\d{1,2})\) /gm)].map(m => Number(m[1]));
  assert.deepEqual(nums, Array.from({ length: 14 }, (_, i) => i + 1));
});

test('complaint about waiting: short apology and request_human(complaint)', () => {
  assert.match(prompt, /12\) .*complaint/);
  assert.match(prompt, /لا تعد بموعد رد/);
});

test('unknown info (doctor schedule, insurance paperwork): request_human(unknown_info), never guess a day', () => {
  assert.match(prompt, /13\) .*unknown_info/);
  assert.match(prompt, /ممنوع تقول إن الدكتور/);
});

test('clinic hours come only from get_clinic_info', () => {
  assert.match(prompt, /14\) .*get_clinic_info/);
});

test('every request_human reason used in the prompt is in the tool enum', () => {
  const allowed = ['patient_requested', 'unknown_info', 'medical_question', 'complaint', 'unsure', 'other'];
  for (const r of prompt.matchAll(/بسبب (\w+)/g)) assert.ok(allowed.includes(r[1]) || r[1] === 'other', r[1]);
});
