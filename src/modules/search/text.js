// One text-matching rule for every search box in the app (patients, global search, orders, imaging,
// secretary appointments, WhatsApp inbox). Pure: no React, no I/O.
//
// Arabic names are typed inconsistently (أحمد / احمد, فاطمة / فاطمه, مصطفى / مصطفي) and phones/file numbers
// are sometimes typed with Arabic-Indic digits (٠١٠…), so a plain String.includes() misses real matches.

// Arabic-Indic (٠-٩) and Persian (۰-۹) digits -> 0-9.
export function normDigits(s) {
  return String(s == null ? '' : s)
    .replace(/[٠-٩]/g, d => String(d.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, d => String(d.charCodeAt(0) - 0x06F0));
}

// Strip tashkeel + tatweel, unify alef/yaa/taa-marbuta forms, collapse spaces, lower-case.
export function normArabic(s) {
  return String(s || '').trim()
    .replace(/[ً-ْـ]/g, '')
    .replace(/[أإآ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

// The folded form used on both sides of a comparison.
export const foldText = s => normArabic(normDigits(s));

// true when `query` is empty or found in `value` after folding.
export function textIncludes(value, query) {
  const q = foldText(query);
  return !q || foldText(value).includes(q);
}

// Digits-only containment (phones, file numbers). An empty/letters-only query never matches.
export function digitsInclude(value, query) {
  const qd = normDigits(query).replace(/\D/g, '');
  return !!qd && normDigits(value).replace(/\D/g, '').includes(qd);
}

// Name / file code / phone match for a patient-like record ({name, patientCode, phone}).
export function personMatches(p, query) {
  const q = String(query || '').trim();
  if (!q) return true;
  if (!p) return false;
  return textIncludes(p.name, q) || textIncludes(p.patientCode, q) || digitsInclude(p.patientCode, q) || digitsInclude(p.phone, q);
}
