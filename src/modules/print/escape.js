// Shared HTML-escaping helpers for the print templates. Extracted verbatim
// from the legacy runtime (escHTML / escDeep / safeTemplate) — every printable
// document is built by escaping its arguments deeply first, so a stray "<" or
// "&" in patient data can never break out of the generated HTML.
export function escHTML(s) {
  return String(s).replace(/[&<>"']/g, c => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[c]);
}

export function escDeep(v, depth) {
  depth = depth || 0;
  if (typeof v === "string") return escHTML(v);
  if (v === null || typeof v !== "object" || depth > 8) return v;
  if (Array.isArray(v)) return v.map(x => escDeep(x, depth + 1));
  const o = {};
  for (const k in v) {
    if (Object.prototype.hasOwnProperty.call(v, k)) o[k] = escDeep(v[k], depth + 1);
  }
  return o;
}

export const safeTemplate = fn => (...args) => fn(...args.map(a => escDeep(a)));
