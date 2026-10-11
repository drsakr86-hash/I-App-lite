// Printable HTML of one imaging study. EVERY stored value (patient name, report, notes, file name, file url) is escaped:
// the page is written into a same-origin window (document.write), so an unescaped "<" would run with the app's session.
import { escHTML } from './escape.js';

// Only http(s) (and the app's own relative/blob/data-image URLs) may appear in src/href; anything else (javascript:, ...) is dropped.
export function safeUrl(u) {
  const s = String(u == null ? '' : u).trim();
  if (!s) return '';
  if (/^https?:\/\//i.test(s) || /^blob:/i.test(s) || /^data:image\/(png|jpe?g|gif|webp);base64,/i.test(s)) return s;
  return '';
}

// labels: { typeName, openFile, reportHeading } already translated (plain text); dir: 'rtl' | 'ltr'
export function buildStudyPrintHTML(view, labels, dir) {
  const v = view || {};
  const L = labels || {};
  const files = (v.files || []).map(f => {
    const src = safeUrl(f && f.src);
    if (!src) return '';
    if (f.resource_type !== 'raw') return `<img src="${escHTML(src)}"/>`;
    return `<p><a href="${escHTML(src)}">${escHTML(L.openFile || '')}: ${escHTML(f.name || 'file')}</a></p>`;
  }).join('');
  return `<!DOCTYPE html><html dir="${dir === 'ltr' ? 'ltr' : 'rtl'}"><head><meta charset="UTF-8"><title>${escHTML(L.typeName || '')}</title>`
    + `<style>body{font-family:Arial;padding:20px}img{max-width:100%;max-height:500px}pre{white-space:pre-wrap;line-height:1.7}</style></head>`
    + `<body><h2>${escHTML(L.typeName || '')}</h2><p>${escHTML(v.patient || '')} · ${escHTML(v.patientCode || '')} · ${escHTML(v.date || '')}</p>`
    + `${files}<h3>${escHTML(L.reportHeading || '')}</h3><pre>${escHTML(v.report || '')}</pre><p>${escHTML(v.notes || '')}</p></body></html>`;
}
