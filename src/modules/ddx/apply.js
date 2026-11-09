// Writing a suggestion into the exam: only ever by the doctor's tap, only appending, never duplicating.
import { t } from '../i18n/index.js';

export function appendDiagnosis(current, label) {
  const cur = current == null ? '' : String(current);
  const lab = String(label || '').trim();
  if (!lab) return cur;
  if (cur.split('\n').some(l => l.trim().toLowerCase() === lab.toLowerCase())) return cur;
  return cur.trim() ? cur.replace(/\s+$/, '') + '\n' + lab : lab;
}
export const hasDiagnosis = (current, label) => appendDiagnosis(current, label) === (current == null ? '' : String(current));

// Reason line in the current language: dictionary text with {param} placeholders filled in.
export function reasonText(why, lang) {
  const raw = t('g13.ddx.r.' + why.k, lang);
  const p = why.p || {};
  return raw.replace(/\{(\w+)\}/g, (m, k) => (k in p ? String(p[k]) : m));
}
