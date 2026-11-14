// Printable sheet of Rx-guide cards (one card, or the cards of a search). Builds the HTML itself and escapes every
// piece of text it inserts; no patient data is involved.
import { escHTML } from './escape.js';
import { t, getLang, dirOf } from '../i18n/index.js';
import { KIND_ICON, orderedSections } from '../rx-guide/model.js';

const KIND_COLOR = { check: '#1f7a8c', rx: '#2f6fa8', warn: '#b7791f', avoid: '#c0392b', follow: '#2f855a' };

export function getGuideHTML(cards, clinic, credit) {
  const lang = getLang();
  const dir = dirOf(lang);
  const tr = k => t(k, lang);
  const cl = clinic || {};
  const e = escHTML;
  const body = (cards || []).map(card => `<section class="card">
  <h2><span class="num" dir="ltr">${e(card.num || '')}</span> ${e(card.title)}${card.urgent ? ' 🚨' : ''}</h2>
  ${orderedSections(card).map(s => `<div class="sec" style="border-inline-start-color:${KIND_COLOR[s.kind]}">
    <div class="lbl" style="color:${KIND_COLOR[s.kind]}">${KIND_ICON[s.kind]} ${e(tr('rxg.kind.' + s.kind))}</div>
    ${s.lines.map(l => `<div class="ln" dir="auto">${e(l)}</div>`).join('')}
  </div>`).join('')}
</section>`).join('');
  return `<!DOCTYPE html><html dir="${dir}" lang="${lang}"><head><meta charset="UTF-8"><title>${e(tr('rxg.title'))}</title>
<style>
  @page{size:A4;margin:14mm}
  *{box-sizing:border-box;-webkit-print-color-adjust:exact;print-color-adjust:exact}
  body{font-family:'Segoe UI',Tahoma,Arial,sans-serif;color:#1d2b36;margin:0;font-size:13px;line-height:1.7}
  header{border-bottom:2px solid #2f6fa8;padding-bottom:6px;margin-bottom:10px}
  header .nm{font-size:17px;font-weight:800;color:#2f6fa8}
  header .meta{font-size:11px;color:#5b6b78}
  h1{font-size:15px;margin:6px 0 0}
  .card{border:1px solid #cfd8df;border-radius:8px;padding:8px 12px;margin:0 0 10px;break-inside:avoid;page-break-inside:avoid}
  h2{font-size:14px;margin:0 0 4px}
  .num{color:#7a8a97;font-size:11px;margin-inline-end:6px}
  .sec{border-inline-start:3px solid;padding-inline-start:9px;margin:5px 0}
  .lbl{font-weight:800;font-size:11px}
  .ln{font-size:12.5px}
  footer{margin-top:10px;border-top:1px solid #cfd8df;padding-top:5px;font-size:10px;color:#7a8a97}
</style></head><body>
<header><div class="nm">${e(tr('rxg.printClinic'))}</div><div class="meta">${e([cl.address, cl.phone].filter(Boolean).join(' · '))}</div><h1>${e(tr('rxg.title'))}</h1></header>
${body}
<footer><div>${e(tr('rxg.printNote'))}</div>${credit ? `<div dir="ltr">${e(credit)}</div>` : ''}</footer>
</body></html>`;
}
