// Suggested reply for the secretary (path A, step 4). A DRAFT only: it is shown in the reply box, the secretary edits and sends it
// (or ignores it). Nothing is sent automatically and nothing is stored. Answers come only from the clinic's approved information
// (schedule, prices, doctors, wa_faq). Pure logic (no Deno APIs) so it runs under node:test.
import { buildClinicInfo, getInfo } from './clinicinfo.js';
import { sanitizeIncoming } from './text.js';

const json = (status, body) => ({ status, body });
export const FEEDBACK_OUTCOMES = ['as_is', 'edited', 'rewritten', 'discarded'];

export const SUGGEST_SYSTEM = [
  'أنت تساعد سكرتارية عيادات د. عبدالستار صقر للعيون على كتابة مسودة رد على رسالة مريض في واتساب. ستراجع السكرتيرة المسودة وتعدّلها قبل الإرسال.',
  'اكتب بالعامية المصرية المهذبة، قصيرة (٢–٤ جمل)، دافئة ومباشرة.',
  'قواعد صارمة:',
  '1. استخدم فقط "معلومات العيادة المعتمدة" أدناه (العناوين، المواعيد، الأسعار، الأطباء، أسئلة شائعة). لا تخترع سعرًا أو موعدًا أو عنوانًا أو سياسة.',
  '2. إن لم تجد المعلومة في المعتمد فاكتب أن السكرتارية ستراجع وترد قريبًا، ولا تخمّن.',
  '3. لا تشخّص ولا تنصح بدواء أو علاج أو جرعة. لأي سؤال طبي قل إن الطبيب سيقيّم الحالة في الكشف واقترح الحجز.',
  '4. للطوارئ (ألم شديد، فقدان نظر مفاجئ، إصابة، كيماويات في العين) انصح بالتوجه فورًا لأقرب طوارئ ولا تنتظر حجزًا.',
  '5. لا تذكر اسم المريض ولا رقمه، ولا تطلب بيانات شخصية حساسة.',
  '6. لا تعد بشيء لا تملك تأكيده (حجز، خصم، نتيجة).',
  'اكتب نص الرد فقط، بدون مقدمة أو شرح أو علامات اقتباس.'
].join('\n');

const TOPIC_LABEL = { location: 'العناوين', hours: 'مواعيد العمل', prices: 'الأسعار', doctors: 'الأطباء', faq: 'أسئلة شائعة معتمدة' };

// Conversation (last messages, oldest first) + approved info -> the single request sent to the model.
export function buildSuggestRequest({ recent, info }) {
  const lines = (recent || []).filter(m => m && m.kind !== 'other' && m.body).map(m => (m.direction === 'in' ? 'المريض: ' : 'العيادة: ') + sanitizeIncoming(m.body, 600));
  const known = getInfo(info, 'all');
  const infoText = Object.keys(TOPIC_LABEL).map(k => (known[k] && known[k].available ? `## ${TOPIC_LABEL[k]}\n${known[k].text}` : `## ${TOPIC_LABEL[k]}\n(غير متوفر)`)).join('\n\n');
  return {
    system: SUGGEST_SYSTEM,
    messages: [{ role: 'user', content: `معلومات العيادة المعتمدة:\n${infoText}\n\nالمحادثة (الأقدم أولًا):\n${lines.join('\n')}\n\nاكتب مسودة رد على آخر رسالة من المريض.` }]
  };
}

export function cleanDraft(text) {
  const s = String(text == null ? '' : text).replace(/```[a-z]*/gi, '').trim().replace(/^["“«]+|["”»]+$/g, '').replace(/[ \t]+\n/g, '\n').trim();
  return s.length > 900 ? s.slice(0, 900).trimEnd() : s;
}

// body: { action: 'draft', conversation_id } | { action: 'feedback', conversation_id, outcome, ratio }
export async function handleSuggest({ user, body, store, llm }) {
  if (!user || !user.email) return json(401, { error: 'not signed in' });
  const role = await store.staffRole(user.email);
  if (role !== 'admin' && role !== 'secretary') return json(403, { error: 'forbidden' });
  const convId = Number(body && body.conversation_id);
  if (!Number.isInteger(convId) || convId <= 0) return json(400, { error: 'invalid request' });
  const actor = String(user.email).toLowerCase();

  if (body.action === 'feedback') {
    const ratio = Number(body.ratio);
    if (!FEEDBACK_OUTCOMES.includes(body.outcome) || !Number.isFinite(ratio) || ratio < 0 || ratio > 1) return json(400, { error: 'invalid request' });
    await store.audit(actor, 'draft.' + body.outcome, convId, { ratio: Math.round(ratio * 100) / 100 });   // no message text, ever
    return json(200, { ok: true });
  }
  if (body.action !== 'draft') return json(400, { error: 'invalid request' });
  if (!llm) return json(503, { error: 'LLM_NOT_CONFIGURED' });
  const recent = await store.getRecent(convId, 12);
  if (!recent.some(m => m.direction === 'in' && m.body)) return json(409, { error: 'NO_PATIENT_MESSAGE' });
  const info = buildClinicInfo(await store.getReferenceData());
  let res;
  try { res = await llm.complete(buildSuggestRequest({ recent, info })); }
  catch (e) { return json(502, { error: 'LLM_FAILED', detail: String(e && e.message || e).slice(0, 200) }); }
  const text = cleanDraft((res.content || []).filter(b => b.type === 'text').map(b => b.text).join('\n'));
  if (!text) return json(502, { error: 'EMPTY_DRAFT' });
  await store.audit(actor, 'draft.suggested', convId, null);
  return json(200, { draft: text });
}
