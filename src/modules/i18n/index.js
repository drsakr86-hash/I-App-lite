// Minimal bilingual (Arabic / English) layer.
//   * t(key, lang?)  -> text; falls back to Arabic, then to the key itself (never throws)
//   * useLang()      -> React hook; re-renders the caller when the language changes
//   * dirOf(lang)    -> 'rtl' | 'ltr'
// Scope (honest): only the screens that call t() switch language -- the patient file shell,
// clinical summary, comparison tab, the eye report and the exam drop-downs. Other screens stay
// Arabic until they are migrated. Stored clinical data is never translated or changed; the
// language only affects labels and the generated report.

import { useState, useEffect } from 'react';
import { AR, EN } from './dictionary.js';

export const LANGS = Object.freeze(['ar', 'en']);
const KEY = 'iapp_lang';

let _lang = 'ar';
try {
  const saved = localStorage.getItem(KEY);
  if (saved === 'en' || saved === 'ar') _lang = saved;
} catch { /* storage unavailable (private mode / node tests): default Arabic */ }

const subs = new Set();
export const getLang = () => _lang;
export const dirOf = lang => (lang === 'en' ? 'ltr' : 'rtl');

export function setLang(lang) {
  if (!LANGS.includes(lang) || lang === _lang) return;
  _lang = lang;
  try { localStorage.setItem(KEY, lang); } catch { /* storage unavailable: non-fatal */ }
  try {
    document.documentElement.setAttribute('lang', lang);
  } catch { /* no DOM (node tests): non-fatal */ }
  subs.forEach(fn => { try { fn(lang); } catch { /* a broken subscriber must not block the others */ } });
}

export function useLang() {
  const [lang, set] = useState(_lang);
  useEffect(() => {
    subs.add(set);
    set(_lang);
    return () => { subs.delete(set); };
  }, []);
  return lang;
}

export function t(key, lang = _lang) {
  const table = lang === 'en' ? EN : AR;
  if (table[key] != null) return table[key];
  if (AR[key] != null) return AR[key];
  return key;
}

export { AR, EN };
