import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { handleSuggest, buildSuggestRequest, cleanDraft, SUGGEST_SYSTEM } from '../supabase/functions/_shared/suggest.js';
import { buildClinicInfo } from '../supabase/functions/_shared/clinicinfo.js';
import { editRatio, draftOutcome } from '../src/modules/whatsapp/draft.js';

const mkStore = (role = 'secretary', recent = [{ id: 1, direction: 'in', sender: 'patient', body: 'كام سعر الكشف؟', kind: 'text' }]) => {
  const audits = [];
  return { audits, staffRole: async () => role, getRecent: async () => recent, getReferenceData: async () => ({ prices: [{ name: 'كشف', price: 150, clinic: 'الرحمانية' }], doctors: [], faq: [{ topic: 'تحضير', answer: 'صيام 6 ساعات', active: true }] }), audit: async (...a) => { audits.push(a); } };
};
const llmOk = text => ({ complete: async req => { llmOk.last = req; return { content: [{ type: 'text', text }] }; } });
const user = { email: 'Sec@x.com' };

test('only admin/secretary may ask; anonymous and other roles are refused', async () => {
  assert.equal((await handleSuggest({ user: null, body: {}, store: mkStore(), llm: llmOk('x') })).status, 401);
  assert.equal((await handleSuggest({ user, body: { action: 'draft', conversation_id: 1 }, store: mkStore('doctor'), llm: llmOk('x') })).status, 403);
});
test('draft: returns cleaned text, audits without text, and the prompt holds approved info + the patient message', async () => {
  const store = mkStore();
  const r = await handleSuggest({ user, body: { action: 'draft', conversation_id: 5 }, store, llm: llmOk('```\n"الكشف 150 جنيه"\n```') });
  assert.equal(r.status, 200); assert.equal(r.body.draft, 'الكشف 150 جنيه');
  assert.deepEqual(store.audits[0], ['sec@x.com', 'draft.suggested', 5, null]);
  const prompt = llmOk.last.messages[0].content;
  assert.match(prompt, /المريض: كام سعر الكشف/); assert.match(prompt, /150 جنيه/); assert.match(prompt, /صيام 6 ساعات/);
  assert.equal(llmOk.last.system, SUGGEST_SYSTEM);
});
test('draft: no patient message -> 409; no LLM key -> 503; model failure -> 502 and nothing audited', async () => {
  assert.equal((await handleSuggest({ user, body: { action: 'draft', conversation_id: 1 }, store: mkStore('admin', []), llm: llmOk('x') })).status, 409);
  assert.equal((await handleSuggest({ user, body: { action: 'draft', conversation_id: 1 }, store: mkStore(), llm: null })).status, 503);
  const store = mkStore();
  const r = await handleSuggest({ user, body: { action: 'draft', conversation_id: 1 }, store, llm: { complete: async () => { throw new Error('llm http 500'); } } });
  assert.equal(r.status, 502); assert.equal(store.audits.length, 0);
});
test('feedback stores only a label and a ratio', async () => {
  const store = mkStore();
  const r = await handleSuggest({ user, body: { action: 'feedback', conversation_id: 5, outcome: 'edited', ratio: 0.3333, text: 'secret' }, store });
  assert.equal(r.status, 200); assert.deepEqual(store.audits[0], ['sec@x.com', 'draft.edited', 5, { ratio: 0.33 }]);
  assert.equal((await handleSuggest({ user, body: { action: 'feedback', conversation_id: 5, outcome: 'x', ratio: 0.1 }, store })).status, 400);
  assert.equal((await handleSuggest({ user, body: { action: 'feedback', conversation_id: 5, outcome: 'edited', ratio: 2 }, store })).status, 400);
});
test('system prompt forbids guessing, diagnosis/treatment advice and personal data; empty/long output handled', () => {
  for (const w of ['لا تخترع', 'لا تشخّص', 'طوارئ', 'لا تذكر اسم المريض']) assert.ok(SUGGEST_SYSTEM.includes(w), w);
  assert.equal(cleanDraft('x'.repeat(2000)).length, 900);
  const req = buildSuggestRequest({ recent: [], info: buildClinicInfo({}) });
  assert.match(req.messages[0].content, /غير متوفر/);
});
test('editRatio / draftOutcome: identical, small edit, rewrite, empty', () => {
  assert.equal(editRatio('الكشف 150 جنيه', 'الكشف 150 جنيه'), 0);
  assert.equal(draftOutcome('الكشف 150 جنيه', 'الكشف 150 جنيه').outcome, 'as_is');
  assert.equal(draftOutcome('الكشف 150 جنيه والإعادة 50', 'الكشف 150 جنيه والإعادة 50 جنيه').outcome, 'edited');
  assert.equal(draftOutcome('أهلا بحضرتك', 'تمام اتفقنا يوم السبت').outcome, 'rewritten');
  assert.equal(editRatio('', 'x'), 1);
});
test('function wiring: no auto-send in the UI, server checks the role, no message text in logs', () => {
  const ui = fs.readFileSync('src/screens/WhatsAppInbox.jsx', 'utf8');
  assert.match(ui, /setDraft\(r\.draft\)/); assert.doesNotMatch(ui, /sendManual\([^)]*r\.draft/);
  const fn = fs.readFileSync('supabase/functions/wa-suggest-reply/index.ts', 'utf8');
  assert.doesNotMatch(fn, /log\([^)]*draft[,:]/);
});
