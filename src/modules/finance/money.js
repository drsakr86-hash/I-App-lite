// Money helpers for the finance domain. Amounts are held as INTEGER piastres
// (minor units) while calculating, and stored/transported as decimal strings
// ("350.00") that map 1:1 to PostgreSQL numeric(14,2). Never add floats.

const RE = /^\s*(-?)(\d+)(?:\.(\d+))?\s*$/;

// "350" | "350.5" | 350 | 0.1 → integer piastres; invalid / empty → null.
export function toMinor(v) {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'number') {
    if (!Number.isFinite(v)) return null;
    return Math.round(v * 100);
  }
  const m = RE.exec(String(v));
  if (!m) return null;
  const [, sign, whole, frac = ''] = m;
  const cents = Number(whole) * 100 + Number((frac + '00').slice(0, 2));
  const roundUp = frac.length > 2 && Number(frac[2]) >= 5 ? 1 : 0;
  const n = cents + roundUp;
  if (!Number.isSafeInteger(n)) return null;
  return sign ? -n : n;
}

// integer piastres → "350.00"
export function fromMinor(n) {
  const v = Math.trunc(Number(n) || 0);
  const abs = Math.abs(v);
  return (v < 0 ? '-' : '') + Math.floor(abs / 100) + '.' + String(abs % 100).padStart(2, '0');
}

// Canonical decimal string for any accepted input (null when invalid).
export function normMoney(v) {
  const m = toMinor(v);
  return m === null ? null : fromMinor(m);
}

export const sumMinor = (list, pick = x => x) => list.reduce((s, x) => s + (toMinor(pick(x)) || 0), 0);

// Round-half-up percentage of a minor amount (percent may have decimals, e.g. 12.5).
export function percentOfMinor(minor, percent) {
  const p = Math.round(Number(percent) * 100); // basis points
  if (!Number.isFinite(p)) return 0;
  return Math.floor((minor * p + 5000) / 10000);
}

// Display only (never feed back into calculations).
export function formatMinor(n) {
  const v = (Number(n) || 0) / 100;
  return v.toLocaleString(undefined, { minimumFractionDigits: Number.isInteger(v) ? 0 : 2, maximumFractionDigits: 2 });
}
