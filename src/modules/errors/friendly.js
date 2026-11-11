// Turns a technical error into a sentence a secretary or doctor can act on.
//
// Before: "تعذر تحميل السجل المركزي (TypeError: Failed to fetch)". The raw text is still recorded through
// logError (console + the in-memory error log) so support can see it; only what is shown changes.
// Messages that are not recognised as technical (the app's own Arabic/English messages, server-side business
// messages, the 'offline' sentinel) are returned unchanged.
import { t } from '../i18n/index.js';
import { logError } from '../../services/logger.js';

const RULES = [
  ['network', /failed to fetch|networkerror|network request failed|load failed|fetch failed|err_internet|err_network|econnrefused|enotfound|net::/i],
  ['timeout', /time(d)? ?out|aborterror|the (operation|user) (was )?aborted|signal is aborted/i],
  ['session', /jwt expired|invalid jwt|jwt (is )?malformed|refresh token|not authenticated|invalid claim|session (has )?expired|(status|http|code)\D{0,3}401\b/i],
  ['forbidden', /permission denied|row-level security|violates row level|\b42501\b|not authori[sz]ed|forbidden|(status|http|code)\D{0,3}403\b/i],
  ['duplicate', /duplicate key|unique constraint|\b23505\b/i],
  ['rate', /rate limit|too many requests|(status|http|code)\D{0,3}429\b/i],
  ['server', /internal server error|bad gateway|service unavailable|gateway time|(status|http|code)\D{0,3}50[0234]\b|upstream (connect|request)/i],
  ['unexpected', /^(type|reference|syntax|range)error\b|is not a function|is not defined|cannot read propert|of undefined|of null|unexpected token|is not iterable|\[object object\]/i]
];

export const rawErrorText = e => {
  if (e == null) return '';
  if (typeof e === 'string') return e;
  return String(e.message || e.hint || e.details || e.code || e);
};

// 'network' | 'timeout' | … | null (not a recognised technical error).
export function errorKind(e) {
  const text = rawErrorText(e);
  const name = e && typeof e === 'object' && e.name ? String(e.name) : '';
  if (name === 'AbortError') return 'timeout';
  const hit = RULES.find(([, re]) => re.test(text) || (name && re.test(name + ': ' + text)));
  return hit ? hit[0] : null;
}

let lastLogged = '';
export function friendlyError(e, lang) {
  const text = rawErrorText(e);
  const kind = errorKind(e);
  if (!kind) return text || t('g14.err.unexpected', lang);
  if (text !== lastLogged) { // keep the technical detail for support, once per distinct error
    lastLogged = text;
    logError('ui.error.' + kind, text);
  }
  return t('g14.err.' + kind, lang);
}
