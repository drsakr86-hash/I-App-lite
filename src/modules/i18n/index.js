// Minimal bilingual (Arabic / English) layer.
//   * t(key, lang?)  -> text; falls back to Arabic, then to the key itself (never throws)
//   * useLang()      -> React hook; re-renders the caller when the language changes
//   * dirOf(lang)    -> 'rtl' | 'ltr'
// Scope (honest): only the screens that call t() switch language -- the patient file shell,
// clinical summary, comparison tab, the eye report and the exam drop-downs. Other screens stay
// Arabic until they are migrated. Stored clinical data is never translated or changed; the
// language only affects labels and the generated report.

import { useState, useEffect } from 'react';
import { AR as BASE_AR, EN as BASE_EN } from './dictionary.js';
import { EXTRA_AR, EXTRA_EN } from './dict/index.js';

const AR = { ...BASE_AR, ...EXTRA_AR };
const EN = { ...BASE_EN, ...EXTRA_EN };

export const LANGS = Object.freeze(['ar', 'en']);
const KEY = 'iapp_lang';

let _lang = 'ar';
try {
  const saved = localStorage.getItem(KEY);
  if (saved === 'en' || saved === 'ar') _lang = saved;
} catch { /* storage unavailable (private mode / node tests): default Arabic */ }

const subs = new Set();
function applyDocLang(lang) {
  try {
    document.documentElement.setAttribute('lang', lang);
    document.documentElement.setAttribute('dir', lang === 'en' ? 'ltr' : 'rtl');
  } catch { /* no DOM (node tests): non-fatal */ }
}
applyDocLang(_lang);
export const getLang = () => _lang;
export const dirOf = lang => (lang === 'en' ? 'ltr' : 'rtl');

export function setLang(lang) {
  if (!LANGS.includes(lang) || lang === _lang) return;
  _lang = lang;
  try { localStorage.setItem(KEY, lang); } catch { /* storage unavailable: non-fatal */ }
  applyDocLang(lang);
  try {
    void 0;
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

// t(key[, lang][, vars]) -- vars replace {name} placeholders. lang defaults to the CURRENT language, so pure
// model functions can call t('key') and still be Arabic in node tests.
export function t(key, lang, vars) {
  if (lang && typeof lang === 'object') { vars = lang; lang = undefined; }
  if (!lang) lang = _lang;
  let out = raw(key, lang);
  if (vars) out = out.replace(/\{(\w+)\}/g, (m, k) => (vars[k] == null ? m : String(vars[k])));
  return out;
}
function raw(key, lang) {
  const table = lang === 'en' ? EN : AR;
  if (table[key] != null) return table[key];
  if (AR[key] != null) return AR[key];
  return key;
}

export { AR, EN };
