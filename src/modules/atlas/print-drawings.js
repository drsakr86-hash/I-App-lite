// Printing approved atlas drawings in the patient report. The doctor chose per drawing ("include in report");
// only approved drawings with that choice are printed, only for roles that may see clinical drawings, at most
// MAX_PRINT_DRAWINGS, at the end of the exam section. Images are fetched through the private signed-URL cache and
// embedded as data URLs, so the printed page never depends on a link that can expire.
import { reportDrawings } from './drawings.js';

export const MAX_PRINT_DRAWINGS = 6;
export const MAX_PRINT_BYTES = 6 * 1024 * 1024; // per image
const DATA_IMG = /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/;
export const isPrintableDataUrl = s => typeof s === 'string' && s.length < MAX_PRINT_BYTES * 1.4 && DATA_IMG.test(s);

export const printDrawingsOf = (exam, role) => reportDrawings(exam && exam.atlasDrawings, role).slice(0, MAX_PRINT_DRAWINGS);

const toDataUrl = blob => new Promise((resolve, reject) => {
  const r = new FileReader(); r.onload = () => resolve(r.result); r.onerror = reject; r.readAsDataURL(blob);
});

// -> { [drawingId]: dataUrl } ; a drawing whose image cannot be loaded is simply left out (printing never fails because of it).
export async function prepareDrawingImages({ exam, role, cache, fetchImpl = globalThis.fetch, asDataUrl = toDataUrl }) {
  const out = {};
  if (!cache) return out;
  for (const d of printDrawingsOf(exam, role)) {
    try {
      const blob = await cache.open(d.image.path, async url => {
        const res = await fetchImpl(url);
        if (!res.ok) throw new Error('http ' + res.status);
        return res.blob();
      });
      if (!blob || blob.size > MAX_PRINT_BYTES) continue;
      const data = await asDataUrl(blob);
      if (isPrintableDataUrl(data)) out[d.id] = data;
    } catch { /* skip this drawing */ }
  }
  return out;
}
