// AI scribe (Gemini): the doctor's recording of the visit -> a DRAFT of the general exam sheet (ExamForm).
// Pure logic, no Deno APIs, so it runs under node:test. Nothing here writes to the patient record: the browser shows the
// draft, the doctor reviews it, and only the normal "save exam" button stores anything.
// The option lists mirror src/components/forms/exam-form-model.js (tests/ai-scribe.test.js keeps them in sync).

export const SCRIBE_COMPLAINTS = [
  'ضعف النظر', 'التهاب العين', 'صداع', 'تغيير النظارة', 'صعوبة في القراءة', 'مياه بيضاء', 'شبورة بالعين',
  'ألم في العين', 'عين حمراء', 'إفرازات من العين', 'رؤية مزدوجة', 'وميض أو بقع سوداء'
];
export const SCRIBE_VA = ['1.00', '0.9', '0.8', '0.7', '0.6', '0.5', '0.4', '0.3', '0.2', '0.1', 'CF', 'HM', 'PL', 'NPL'];
export const SCRIBE_IOP_MIN = 10;
export const SCRIBE_IOP_MAX = 30;
export const SCRIBE_SELECTS = { colorVision: ['طبيعي', 'غير طبيعي'], coverTest: ['طبيعي', 'إيجابي'], contrast: ['طبيعي', 'منخفض'] };
export const SCRIBE_TEXT_FIELDS = ['chiefComplaint', 'anteriorSegment', 'posteriorSegment', 'diagnosis', 'treatmentPlan', 'notes'];
export const SCRIBE_FIELDS = ['chiefComplaint', 'visualAcuityR', 'visualAcuityL', 'iopR', 'iopL', 'colorVision', 'coverTest', 'contrast',
  'anteriorSegment', 'posteriorSegment', 'diagnosis', 'treatmentPlan', 'followUp', 'notes'];

export const SCRIBE_MAX_AUDIO_BYTES = 12 * 1024 * 1024; // ~ 20+ minutes of phone audio; Gemini inline limit is 20 MB per request
export const SCRIBE_MIME = ['audio/webm', 'audio/ogg', 'audio/mp4', 'audio/mpeg', 'audio/wav', 'audio/aac', 'audio/x-m4a'];

const str = { type: 'STRING' };
// Gemini structured output (OpenAPI subset). Every field is a string; '' means "not said in the recording".
export const SCRIBE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    transcript: { type: 'STRING', description: 'تفريغ كامل للحوار بالعربية كما قيل، مع ذكر المتحدث (الطبيب/المريض)' },
    chiefComplaint: str, visualAcuityR: str, visualAcuityL: str, iopR: str, iopL: str,
    colorVision: str, coverTest: str, contrast: str,
    anteriorSegment: str, posteriorSegment: str, diagnosis: str, treatmentPlan: str,
    followUpDays: { type: 'INTEGER', description: 'بعد كم يوم المتابعة، 0 إن لم تُذكر' },
    notes: str,
    evidence: {
      type: 'ARRAY',
      items: { type: 'OBJECT', properties: { field: str, quote: str }, required: ['field', 'quote'] }
    },
    warnings: { type: 'ARRAY', items: str }
  },
  required: ['transcript', 'chiefComplaint', 'visualAcuityR', 'visualAcuityL', 'iopR', 'iopL', 'colorVision', 'coverTest', 'contrast',
    'anteriorSegment', 'posteriorSegment', 'diagnosis', 'treatmentPlan', 'followUpDays', 'notes', 'evidence', 'warnings']
};

export const SCRIBE_SYSTEM = [
  'أنت مساعد تسجيل طبي (scribe) في عيادة عيون في مصر. تسمع تسجيلًا لكشف بين الطبيب والمريض بالعامية المصرية مع مصطلحات إنجليزية.',
  'مهمتك: تفريغ الحوار، ثم ملء حقول شيت الفحص العام كمسودة يراجعها الطبيب.',
  'قواعد صارمة:',
  '1. لا تملأ أي حقل لم يُذكر صراحة في التسجيل. اتركه نصًا فارغًا "". لا تخمّن ولا تستنتج قيمًا لم تُقل.',
  '2. العين اليمنى = R = OD، واليسرى = L = OS. حدّد العين من الكلام فقط؛ إن لم تتضح العين اترك الحقل فارغًا وأضف تحذيرًا.',
  '3. حدة الإبصار بالصيغة العشرية من هذه القائمة فقط: ' + SCRIBE_VA.join(', ') + '. حوّل 6/6 إلى 1.00 و6/12 إلى 0.5 و6/60 إلى 0.1. "عدّ صوابع" = CF، "حركة يد" = HM، "يرى الضوء" = PL، "لا يرى الضوء" = NPL.',
  '4. ضغط العين رقم صحيح بالمليمتر زئبق فقط (مثال "17").',
  '5. رؤية الألوان: "طبيعي" أو "غير طبيعي". Cover test: "طبيعي" أو "إيجابي". Contrast: "طبيعي" أو "منخفض". اتركها "" إن لم تُذكر.',
  '6. الشكوى الرئيسية: إن طابقت إحدى هذه فاكتبها حرفيًا: ' + SCRIBE_COMPLAINTS.join('، ') + '. وإلا اكتب الشكوى بكلمات قليلة بالعربية مع مدتها إن ذُكرت.',
  '7. القطعة الأمامية والخلفية والتشخيص والخطة: بالإنجليزية الطبية المختصرة كما يكتبها طبيب العيون (مثال: "Quiet AC, clear cornea", "Mild NPDR OU")، وفقط مما قاله الطبيب.',
  '8. التشخيص والخطة يُكتبان فقط إن نطق بهما الطبيب. لا تقترح تشخيصًا من عندك في هذه الحقول.',
  '9. موعد المتابعة: followUpDays عدد الأيام ("بعد أسبوعين" = 14، "بعد شهر" = 30)، و0 إن لم يُذكر.',
  '10. أي معلومة مهمة لا مكان لها (أدوية حالية، أمراض مزمنة، حساسية، عمليات سابقة) تُكتب في notes باختصار.',
  '11. evidence: لكل حقل ملأته، اقتبس الجملة القصيرة من الحوار التي أخذت منها القيمة.',
  '12. warnings: أي غموض (عين غير محددة، رقم غير واضح، قيمة خارج القوائم، صوت غير مسموع) بجملة عربية قصيرة.',
  'لا تذكر اسم المريض أو رقم هاتفه في أي حقل حتى لو قيل في التسجيل.'
].join('\n');

export function scribeUserPrompt(today) {
  return 'تاريخ اليوم ' + today + '. فرّغ التسجيل المرفق واملأ الحقول حسب القواعد. أعد JSON فقط.';
}

// Gemini generateContent request body for one inline recording.
export function buildScribeRequest({ audioBase64, mimeType, today }) {
  return {
    systemInstruction: { parts: [{ text: SCRIBE_SYSTEM }] },
    contents: [{ role: 'user', parts: [{ inline_data: { mime_type: mimeType, data: audioBase64 } }, { text: scribeUserPrompt(today) }] }],
    generationConfig: { temperature: 0, responseMimeType: 'application/json', responseSchema: SCRIBE_SCHEMA }
  };
}

const clean = (v, max = 600) => String(v == null ? '' : v).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').replace(/\s+/g, ' ').trim().slice(0, max);

export function addDays(isoDate, days) {
  const [y, m, d] = String(isoDate).split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return dt.toISOString().slice(0, 10);
}

export function normalizeVa(v) {
  const s = clean(v, 20).toUpperCase().replace(',', '.');
  if (!s) return '';
  if (s === '1' || s === '1.0' || s === '1.00' || s === '6/6') return '1.00';
  const snellen = s.match(/^6\/(\d+(?:\.\d+)?)$/);
  if (snellen) { const dec = 6 / Number(snellen[1]); const pick = SCRIBE_VA.filter(x => /^\d/.test(x)).find(x => Math.abs(Number(x) - dec) < 0.051); return pick || null; }
  if (/^0?\.\d$/.test(s)) { const x = '0.' + s.split('.')[1]; return SCRIBE_VA.includes(x) ? x : null; }
  return SCRIBE_VA.includes(s) ? s : null;
}

export function normalizeIop(v) {
  const s = clean(v, 10).replace(/[٠-٩]/g, d => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)));
  if (!s) return { value: '' };
  const n = Number(s.replace(/[^\d.]/g, ''));
  if (!Number.isFinite(n) || n <= 0) return { value: '', bad: s };
  const r = Math.round(n);
  if (r < SCRIBE_IOP_MIN || r > SCRIBE_IOP_MAX) return { value: '', bad: String(r) };
  return { value: String(r) };
}

// Model output -> safe draft. Only values that fit the sheet's own options survive; everything else becomes a warning,
// so a doubtful value is never put silently into a select the doctor may not look at.
export function sanitizeScribe(raw, today) {
  const o = raw && typeof raw === 'object' ? raw : {};
  const fields = {}; const warnings = [];
  for (const k of SCRIBE_TEXT_FIELDS) { const v = clean(o[k], k === 'notes' || k === 'treatmentPlan' ? 1200 : 600); if (v) fields[k] = v; }
  for (const [k, eye] of [['visualAcuityR', 'اليمنى'], ['visualAcuityL', 'اليسرى']]) {
    const v = normalizeVa(o[k]);
    if (v) fields[k] = v; else if (v === null) warnings.push('حدة إبصار العين ' + eye + ' "' + clean(o[k], 20) + '" ليست من قائمة الشيت، لم تُملأ');
  }
  for (const [k, eye] of [['iopR', 'اليمنى'], ['iopL', 'اليسرى']]) {
    const r = normalizeIop(o[k]);
    if (r.value) fields[k] = r.value; else if (r.bad) warnings.push('ضغط العين ' + eye + ' ' + r.bad + ' خارج قائمة الشيت (10–30)، سجّله يدويًا في الملاحظات');
  }
  for (const [k, opts] of Object.entries(SCRIBE_SELECTS)) { const v = clean(o[k], 20); if (v && opts.includes(v)) fields[k] = v; }
  const days = Number(o.followUpDays);
  if (Number.isInteger(days) && days > 0 && days <= 730 && /^\d{4}-\d{2}-\d{2}$/.test(String(today))) fields.followUp = addDays(today, days);
  for (const w of Array.isArray(o.warnings) ? o.warnings : []) { const v = clean(w, 200); if (v) warnings.push(v); }
  const evidence = {};
  for (const e of Array.isArray(o.evidence) ? o.evidence : []) {
    const f = e && String(e.field || ''); const q = clean(e && e.quote, 240);
    const key = f === 'followUpDays' ? 'followUp' : f;
    if (q && SCRIBE_FIELDS.includes(key) && fields[key] && !evidence[key]) evidence[key] = q;
  }
  return { transcript: clean(o.transcript, 20000), fields, evidence, warnings: warnings.slice(0, 20) };
}

const json = (status, body) => ({ status, body });
const isIsoDay = s => /^\d{4}-\d{2}-\d{2}$/.test(String(s || ''));

// Request handler: only an admin (the doctor) may use the scribe. The audio is passed through to Gemini and never stored.
export async function handleScribe({ user, body, store, gemini, todayFallback = () => new Date().toISOString().slice(0, 10) }) {
  if (!user || !user.email) return json(401, { error: 'not signed in' });
  const role = await store.staffRole(user.email);
  if (role !== 'admin') return json(403, { error: 'forbidden' });
  if (!gemini) return json(503, { error: 'NOT_CONFIGURED', message: 'مفتاح Gemini غير مضبوط على الخادم بعد.' });
  const b = body && typeof body === 'object' ? body : {};
  const mimeType = String(b.mime_type || '').split(';')[0].trim().toLowerCase();
  const audio = typeof b.audio === 'string' ? b.audio.replace(/^data:[^,]*,/, '') : '';
  if (b.consent !== true) return json(400, { error: 'NO_CONSENT', message: 'يلزم تأكيد موافقة المريض على التسجيل.' });
  if (!SCRIBE_MIME.includes(mimeType) || !audio || !/^[A-Za-z0-9+/]+=*$/.test(audio)) return json(400, { error: 'invalid request' });
  if (audio.length * 0.75 > SCRIBE_MAX_AUDIO_BYTES) return json(413, { error: 'TOO_LONG', message: 'التسجيل أطول من المسموح، قسّمه لجزأين.' });
  const today = isIsoDay(b.today) ? b.today : todayFallback();
  let raw;
  try { raw = await gemini.generateJson(buildScribeRequest({ audioBase64: audio, mimeType, today })); }
  catch (e) { return json(502, { error: 'AI_FAILED', message: 'تعذّر تحليل التسجيل الآن، حاول مرة أخرى.', detail: String(e && e.message || e).slice(0, 200) }); }
  return json(200, { ok: true, model: gemini.model, ...sanitizeScribe(raw, today) });
}
