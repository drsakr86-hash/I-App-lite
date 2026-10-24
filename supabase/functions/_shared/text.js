// Pure text helpers shared by the WhatsApp functions (no I/O, no Deno/Node APIs: runs in Deno, Node tests and the browser).

// Same normalisation as src/modules/patients/list.js (kept in sync by tests/whatsapp-shared.test.js).
export const normArabic = s => String(s || '').trim()
  .replace(/[ً-ْـ]/g, '')
  .replace(/[أإآ]/g, 'ا')
  .replace(/ى/g, 'ي')
  .replace(/ة/g, 'ه')
  .replace(/\s+/g, ' ')
  .toLowerCase();
export const normPhone = s => String(s || '').replace(/\D/g, '').replace(/^(20|0020)/, '0');

// Arabic-Indic digits -> ASCII, so "٢٠:١٠" and "20:10" compare equal.
export const asciiDigits = s => String(s || '').replace(/[٠-٩]/g, d => String(d.charCodeAt(0) - 0x0660)).replace(/[۰-۹]/g, d => String(d.charCodeAt(0) - 0x06F0));

// Incoming text is untrusted: drop control/bidi-override characters, collapse whitespace, cap the length.
export function sanitizeIncoming(s, max = 1000) {
  return asciiDigits(String(s == null ? '' : s))
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F​-‏‪-‮⁦-⁩]/g, '')
    .replace(/[ \t]+/g, ' ')
    .trim()
    .slice(0, max);
}

const has = (n, list) => list.some(w => n.includes(normArabic(w)));
const hasWord = (n, list) => list.some(w => new RegExp('(^|[^\\p{L}])' + normArabic(w).replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '($|[^\\p{L}])', 'u').test(n));

// ---- deterministic safety layer (runs BEFORE the model; the model is never asked whether something is an emergency) ----
const OPT_OUT = ['stop', 'unsubscribe', 'وقف الرسائل', 'ايقاف الرسائل', 'إيقاف الرسائل', 'لا ترسل', 'متبعتش', 'بلاش رسائل', 'الغاء الاشتراك', 'إلغاء الاشتراك', 'الغاء الاشتراك', 'توقف', 'وقف التذكير', 'ايقاف التذكير'];
// Opt-out must be a SHORT message ('stop', 'وقف الرسائل'); a long sentence that merely contains the word is not an opt-out.
export const isOptOut = text => { const n = normArabic(sanitizeIncoming(text)); return n.length > 0 && n.length <= 40 && ((n.split(' ').length <= 2 && hasWord(n, ['stop', 'unsubscribe'])) || has(n, OPT_OUT.slice(2))); };

const HUMAN = ['موظف', 'سكرتير', 'سكرتيره', 'كلم حد', 'كلمني حد', 'عايز اتكلم مع', 'عاوز اتكلم مع', 'عايزه اتكلم مع', 'اتكلم مع حد', 'مع انسان', 'شخص حقيقي', 'مسؤول', 'مدير', 'human', 'agent', 'representative', 'اكلم حد', 'حد يرد عليا', 'عايز حد'];
export const wantsHuman = text => { const n = normArabic(sanitizeIncoming(text)); return has(n, HUMAN.filter(w => w.length > 5)) || hasWord(n, ['human', 'agent', 'موظف', 'سكرتير', 'سكرتيره']); };

// Sudden/severe eye symptoms and eye injuries. Over-triggering is safe (a human looks at it); under-triggering is not.
const URGENT = [
  'فقدت النظر', 'فقدان النظر', 'نظري راح', 'نظري وقع', 'مش شايف فجاه', 'مش شايفه فجاه', 'مش شايف فجأة', 'مبقتش شايف', 'معدتش شايف', 'عيني ما بتشوفش', 'ما بشوفش', 'مش بشوف',
  'ستاره سوداء', 'ستارة سوداء', 'ستاره في نظري', 'ستارة في نظري', 'ظل اسود', 'ظل أسود', 'ومضات', 'نقط سوداء كتير', 'ذباب طائر', 'شعاع ضوء',
  'ضربه في عيني', 'ضربة في عيني', 'ضربت في عيني', 'اتضربت في عيني', 'حاجه دخلت عيني', 'حاجة دخلت عيني', 'جسم غريب', 'شظيه', 'شظية', 'مسمار', 'دخل في عيني',
  'مادة كيماويه', 'مادة كيماوية', 'كلور', 'حمض', 'مبيد', 'ماده كاويه', 'نزيف في عيني', 'نزيف العين', 'عيني بتنزف', 'دم في عيني', 'عيني بتنزل دم',
  'الم شديد في عيني', 'ألم شديد في عيني', 'وجع شديد في عيني', 'عيني بتوجعني جدا', 'وجع فظيع', 'ألم فظيع', 'احمرار شديد', 'ازدواج مفاجئ', 'شايف ضبابي فجاه', 'نظري ضعف فجاه', 'نظري ضعف فجأة',
  'بعد العمليه', 'بعد العملية', 'بعد الحقن', 'بعد الليزر', 'عيني الوارمه', 'صديد', 'جرح في عيني', 'جرح في العين', 'ماء ساخن في عيني', 'emergency', 'urgent', 'طوارئ', 'طارئ', 'حالة طارئة', 'حاله طارئه', 'عاجل', 'ضروري جدا', 'اغماء', 'تشنج'
];
export const isUrgent = text => { const n = normArabic(sanitizeIncoming(text)); return has(n, URGENT); };

// "Yes" / "no" to a confirmation question. Deliberately strict: a long message that merely contains "ok" is not a confirmation.
const YES = ['ايوه', 'ايوا', 'أيوه', 'اه', 'آه', 'نعم', 'تمام', 'موافق', 'موافقه', 'اكد', 'أكد', 'اكدي', 'أكدي', 'تأكيد', 'تاكيد', 'اكيد', 'أكيد', 'ماشي', 'ماشى', 'اوكي', 'اوك', 'ok', 'okay', 'yes', 'y', 'اه تمام', 'ايوه تمام', 'تمام اكد', 'تمام أكد', 'اكد الحجز', 'أكد الحجز', 'اه اكد', 'ايوه اكد', 'يلا', 'برافو', 'صح', 'مظبوط', 'ينفع', 'عظيم', 'حاضر', 'اتفقنا'];
const NO = ['لا', 'لأ', 'لاا', 'مش عايز', 'مش عاوز', 'مش عايزه', 'الغي', 'الغاء', 'إلغاء', 'بلاش', 'مش موافق', 'غير موافق', 'no', 'n', 'cancel', 'مش مناسب', 'مش مظبوط', 'غلط', 'لا شكرا', 'لا شكرًا', 'مش تمام', 'خلاص مش عايز', 'مش دلوقتي', 'ارفض', 'رفض'];
const clean = s => normArabic(sanitizeIncoming(s)).replace(/[.!؟?،,؛;:"'()]/g, ' ').replace(/\s+/g, ' ').trim();
// Filler words patients put in front of a yes ("طب ماشي", "خلاص تمام"); they are ignored, but a filler alone is NOT a yes.
const FILLERS = ['طب', 'طيب', 'خلاص', 'بقا', 'بقى', 'يا', 'كده'].map(normArabic);
export const isAffirmative = text => { let n = clean(text); if (!n || n.length > 30) return false; const core = n.split(' ').filter(t => !FILLERS.includes(t)); if (core.length && core.length < n.split(' ').length) n = core.join(' '); return YES.some(w => n === normArabic(w)) || (n.split(' ').length <= 3 && n.split(' ').every(t => YES.some(w => t === normArabic(w)))); };
export const isNegative = text => { const n = clean(text); if (!n || n.length > 40) return false; return NO.some(w => n === normArabic(w) || n.startsWith(normArabic(w) + ' ')); };

// Names typed by a patient: letters/spaces only, 2..60 chars, at least two letters. Never trusted for authorisation (the phone is).
export function cleanPatientName(s) {
  const n = sanitizeIncoming(s, 80).replace(/[^\p{L}\p{M}\s'.-]/gu, '').replace(/\s+/g, ' ').replace(/^[^\p{L}]+|[^\p{L}\p{M}]+$/gu, '').trim();
  return n.length >= 2 && n.length <= 60 && (n.match(/\p{L}/gu) || []).length >= 2 ? n : null;
}
export const firstToken = s => normArabic(s).split(' ')[0] || '';

// WhatsApp message limits: split a long text into chunks <= 3800 chars on paragraph/line boundaries.
export function chunkText(s, max = 3800) {
  const out = []; let rest = String(s || '').trim();
  while (rest.length > max) {
    let cut = rest.lastIndexOf('\n', max); if (cut < max * 0.5) cut = rest.lastIndexOf(' ', max); if (cut < max * 0.5) cut = max;
    out.push(rest.slice(0, cut).trim()); rest = rest.slice(cut).trim();
  }
  if (rest) out.push(rest);
  return out;
}

// WhatsApp bold is a single asterisk; models write **bold** (Markdown), which shows literal stars.
export const toWhatsAppBold = s => String(s || '').replace(/\*\*([^*\n]+?)\*\*/g, '*$1*').replace(/^#{1,6}\s+/gm, '');
