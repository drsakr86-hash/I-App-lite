// Pure helpers for the "clinic knowledge" review screen: staff replies become FAQ rows only after the admin edits and approves them.
// The FAQ is read by the assistant, so personal data must never be approved into it.

const AR_DIGITS = /[٠-٩]/g;
const toLatin = s => String(s || '').replace(AR_DIGITS, d => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)));

// True when the text still holds something that identifies a person (phone/long number, e-mail, link): the admin must edit it out first.
export function looksPersonal(text) {
  const s = toLatin(text);
  if (/[\w.+-]+@[\w-]+\.[\w.-]+/.test(s)) return true;
  if (/https?:\/\/|www\./i.test(s)) return true;
  return /\d[\d\s-]{6,}\d/.test(s);
}

// Suggested FAQ topic: the patient's question, first line, trimmed to the 80-character column limit.
export function suggestTopic(question, answer) {
  const base = String(question || '').split('\n')[0].replace(/\s+/g, ' ').trim() || String(answer || '').split('\n')[0].replace(/\s+/g, ' ').trim();
  return base.length > 80 ? base.slice(0, 79).trimEnd() + '…' : base;
}

// Validates what the admin is about to approve. Returns an error key or null.
export function checkApproval(topic, answer) {
  const tp = String(topic || '').trim(), an = String(answer || '').trim();
  if (tp.length < 2 || tp.length > 80) return 'topic';
  if (an.length < 2 || an.length > 1200) return 'answer';
  if (looksPersonal(tp) || looksPersonal(an)) return 'personal';
  return null;
}
