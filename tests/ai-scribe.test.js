import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  SCRIBE_COMPLAINTS, SCRIBE_VA, SCRIBE_SELECTS, SCRIBE_IOP_MIN, SCRIBE_IOP_MAX, SCRIBE_SCHEMA,
  buildScribeRequest, sanitizeScribe, normalizeVa, normalizeIop, addDays, handleScribe
} from '../supabase/functions/_shared/scribe.js';
import { createGeminiClient } from '../supabase/functions/_shared/gemini.js';
import { EXAM_COMPLAINTS, VA_OPTIONS, IOP_OPTIONS, EXAM_SELECT_ROWS, blankExam } from '../src/components/forms/exam-form-model.js';
import { draftRows, defaultSelection, applyDraft, pickMime, formatClock } from '../src/modules/ai-scribe/model.js';

const TODAY = '2026-10-26';

test('scribe option lists match the exam sheet', () => {
  assert.deepEqual(SCRIBE_COMPLAINTS, EXAM_COMPLAINTS.slice(0, -1));
  assert.deepEqual(SCRIBE_VA, VA_OPTIONS);
  assert.equal(String(SCRIBE_IOP_MIN), IOP_OPTIONS[0]);
  assert.equal(String(SCRIBE_IOP_MAX), IOP_OPTIONS.at(-1));
  for (const [, key, opts] of EXAM_SELECT_ROWS) assert.deepEqual(SCRIBE_SELECTS[key], opts);
  for (const k of Object.keys(blankExam(TODAY)).filter(k => !['date', 'doctor', 'followUp'].includes(k))) assert.ok(SCRIBE_SCHEMA.properties[k], k);
});

test('request carries the audio inline and asks for schema JSON', () => {
  const r = buildScribeRequest({ audioBase64: 'QUJD', mimeType: 'audio/webm', today: TODAY });
  assert.equal(r.contents[0].parts[0].inline_data.mime_type, 'audio/webm');
  assert.equal(r.contents[0].parts[0].inline_data.data, 'QUJD');
  assert.ok(r.contents[0].parts[1].text.includes(TODAY));
  assert.equal(r.generationConfig.responseMimeType, 'application/json');
  assert.equal(r.generationConfig.temperature, 0);
  assert.ok(r.systemInstruction.parts[0].text.includes('لا تخمّن'));
});

test('visual acuity normalisation', () => {
  assert.equal(normalizeVa('6/6'), '1.00');
  assert.equal(normalizeVa('1'), '1.00');
  assert.equal(normalizeVa('6/12'), '0.5');
  assert.equal(normalizeVa('6/60'), '0.1');
  assert.equal(normalizeVa('.4'), '0.4');
  assert.equal(normalizeVa('cf'), 'CF');
  assert.equal(normalizeVa(''), '');
  assert.equal(normalizeVa('6/5'), null);
  assert.equal(normalizeVa('20/20 ish'), null);
});

test('IOP normalisation keeps 10-30 only', () => {
  assert.deepEqual(normalizeIop('17'), { value: '17' });
  assert.deepEqual(normalizeIop('١٨'), { value: '18' });
  assert.deepEqual(normalizeIop('16.6 mmHg'), { value: '17' });
  assert.deepEqual(normalizeIop('35'), { value: '', bad: '35' });
  assert.deepEqual(normalizeIop(''), { value: '' });
});

test('sanitize keeps valid values, drops unknown ones with warnings, computes follow-up date', () => {
  const out = sanitizeScribe({
    transcript: 'د: عندك ايه؟ م: نظري ضعف',
    chiefComplaint: 'ضعف النظر', visualAcuityR: '6/12', visualAcuityL: '6/5', iopR: '18', iopL: '40',
    colorVision: 'غير طبيعي', coverTest: 'maybe', contrast: '',
    anteriorSegment: 'Quiet AC', posteriorSegment: '', diagnosis: '', treatmentPlan: '', followUpDays: 14, notes: '',
    evidence: [{ field: 'iopR', quote: 'الضغط يمين ١٨' }, { field: 'followUpDays', quote: 'تعالى بعد أسبوعين' }, { field: 'diagnosis', quote: 'x' }],
    warnings: ['صوت غير واضح']
  }, TODAY);
  assert.deepEqual(out.fields, { chiefComplaint: 'ضعف النظر', anteriorSegment: 'Quiet AC', visualAcuityR: '0.5', iopR: '18', colorVision: 'غير طبيعي', followUp: '2026-11-09' });
  assert.deepEqual(out.evidence, { iopR: 'الضغط يمين ١٨', followUp: 'تعالى بعد أسبوعين' });
  assert.equal(out.warnings.length, 3);
  assert.ok(out.warnings.some(w => w.includes('40')));
  assert.equal(out.transcript, 'د: عندك ايه؟ م: نظري ضعف');
});

test('sanitize tolerates garbage', () => {
  assert.deepEqual(sanitizeScribe(null, TODAY), { transcript: '', fields: {}, evidence: {}, warnings: [] });
  assert.deepEqual(sanitizeScribe({ followUpDays: -3, evidence: 'x', warnings: 5 }, TODAY).fields, {});
  assert.equal(addDays('2026-12-25', 10), '2027-01-04');
});

const store = role => ({ staffRole: async () => role });
const gem = (out) => ({ model: 'm', generateJson: async () => { if (out instanceof Error) throw out; return out; } });
const body = { audio: 'QUJD', mime_type: 'audio/webm;codecs=opus', today: TODAY, consent: true };

test('handler: auth, role, consent and validation', async () => {
  assert.equal((await handleScribe({ user: null, body, store: store('admin'), gemini: gem({}) })).status, 401);
  assert.equal((await handleScribe({ user: { email: 's@x' }, body, store: store('secretary'), gemini: gem({}) })).status, 403);
  assert.equal((await handleScribe({ user: { email: 'a@x' }, body, store: store('admin'), gemini: null })).status, 503);
  assert.equal((await handleScribe({ user: { email: 'a@x' }, body: { ...body, consent: false }, store: store('admin'), gemini: gem({}) })).body.error, 'NO_CONSENT');
  assert.equal((await handleScribe({ user: { email: 'a@x' }, body: { ...body, mime_type: 'video/mp4' }, store: store('admin'), gemini: gem({}) })).status, 400);
  assert.equal((await handleScribe({ user: { email: 'a@x' }, body: { ...body, audio: 'not base64!' }, store: store('admin'), gemini: gem({}) })).status, 400);
  assert.equal((await handleScribe({ user: { email: 'a@x' }, body: { ...body, audio: 'A'.repeat(17 * 1024 * 1024) }, store: store('admin'), gemini: gem({}) })).status, 413);
});

test('handler: success and model failure', async () => {
  const ok = await handleScribe({ user: { email: 'a@x' }, body, store: store('admin'), gemini: gem({ iopL: '22', followUpDays: 30 }) });
  assert.equal(ok.status, 200);
  assert.deepEqual(ok.body.fields, { iopL: '22', followUp: '2026-11-25' });
  assert.equal(ok.body.model, 'm');
  const bad = await handleScribe({ user: { email: 'a@x' }, body, store: store('admin'), gemini: gem(new Error('gemini http 500')) });
  assert.equal(bad.status, 502);
  assert.equal(bad.body.error, 'AI_FAILED');
});

test('gemini client parses the first candidate and reports API errors', async () => {
  let sent;
  const okFetch = async (url, init) => { sent = { url, init }; return { ok: true, json: async () => ({ candidates: [{ content: { parts: [{ text: '{"iopR":' }, { text: '"15"}' }] } }] }) }; };
  const c = createGeminiClient({ apiKey: 'k', model: 'gemini-x', fetchImpl: okFetch });
  assert.deepEqual(await c.generateJson({ a: 1 }), { iopR: '15' });
  assert.ok(sent.url.endsWith('/models/gemini-x:generateContent'));
  assert.equal(sent.init.headers['x-goog-api-key'], 'k');
  const errFetch = async () => ({ ok: false, status: 400, text: async () => JSON.stringify({ error: { status: 'INVALID_ARGUMENT', message: 'bad audio' } }) });
  await assert.rejects(createGeminiClient({ apiKey: 'k', fetchImpl: errFetch }).generateJson({}), /gemini http 400: INVALID_ARGUMENT - bad audio/);
  const emptyFetch = async () => ({ ok: true, json: async () => ({ candidates: [{ finishReason: 'SAFETY' }] }) });
  await assert.rejects(createGeminiClient({ apiKey: 'k', fetchImpl: emptyFetch }).generateJson({}), /empty response \(SAFETY\)/);
  assert.throws(() => createGeminiClient({ apiKey: '' }), /GEMINI_API_KEY/);
});

test('panel model: rows, conflicts, apply', () => {
  const form = { ...blankExam(TODAY), iopR: '15', chiefComplaint: 'صداع' };
  const draft = { model: 'm', fields: { chiefComplaint: 'صداع', iopR: '18', iopL: '19', colorVision: 'غير طبيعي' }, evidence: { iopL: 'الشمال ١٩' } };
  const rows = draftRows(form, draft);
  assert.deepEqual(rows.map(r => r.key), ['chiefComplaint', 'iopR', 'iopL', 'colorVision']);
  const by = Object.fromEntries(rows.map(r => [r.key, r]));
  assert.equal(by.chiefComplaint.same, true);
  assert.equal(by.iopR.conflict, true);
  assert.equal(by.iopR.checked, false);
  assert.equal(by.iopL.checked, true);
  assert.equal(by.iopL.quote, 'الشمال ١٩');
  assert.equal(by.colorVision.checked, true); // 'طبيعي' default counts as empty
  const res = applyDraft(form, rows, defaultSelection(rows), { model: 'm', at: 'T' });
  assert.equal(res.applied, 2);
  assert.equal(res.form.iopR, '15');
  assert.equal(res.form.iopL, '19');
  assert.equal(res.form.colorVision, 'غير طبيعي');
  assert.deepEqual(res.form.aiScribe, { used: true, consent: true, model: 'm', at: 'T' });
  const none = applyDraft(form, rows, {}, {});
  assert.equal(none.applied, 0);
  assert.equal(none.form.aiScribe, undefined);
});

test('recorder helpers', () => {
  assert.equal(pickMime(m => m === 'audio/mp4'), 'audio/mp4');
  assert.equal(pickMime(() => true), 'audio/webm;codecs=opus');
  assert.equal(pickMime(() => false), '');
  assert.equal(formatClock(125.7), '02:05');
});
