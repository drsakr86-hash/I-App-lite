// Illustrative diagrams on an examination (retina chart, anterior segment, Amsler grid, free sketch).
// Pure module: no React / DOM / Supabase, so it is unit-testable and shared by the form, the
// patient-file view and the print template.
//
// WHERE IT LIVES: an optional `diagrams` array on the examination record in the existing
// `iapp_exams` store (whole records as JSON -- no database change; old records without it keep
// working untouched). Diagrams are VECTOR strokes, not bitmaps, so a drawing costs a few KB:
//   { id, tpl, note, strokes: [ { c: 'r', w: 2, p: [x1, y1, x2, y2, ...] } ] }
// Coordinates are integers on a 0..1000 square; `c` is a key of INK; `w` is 1|2|3 (thin..thick).
// The Core examination table never sees it (the Core sync only reads named fields).

export const VIEW = 1000;
export const MAX_DIAGRAMS = 6;
export const MAX_STROKES = 200;
export const MAX_POINTS = 600;        // per stroke, after simplification
export const MAX_NOTE = 300;          // input limit in the form
const NOTE_CAP = 2000;                // storage guard when normalising (never cut an escaped entity in print)
export const MIN_ERASE_RADIUS = 18;

// Retina-drawing colour convention (the standard one clinicians already use on paper charts).
export const INK = Object.freeze({
  r: '#dc2626', // red: attached retina, arteries, tears / holes
  b: '#2563eb', // blue: detached retina, veins, lattice outline
  g: '#16a34a', // green: media opacities (vitreous haemorrhage, cataract)
  y: '#ca8a04', // yellow: oedema, exudates
  n: '#92400e', // brown: choroidal lesions
  k: '#111827'  // black: pigment, laser, general
});
export const INK_KEYS = Object.freeze(Object.keys(INK));
export const WIDTHS = Object.freeze({ 1: 4, 2: 8, 3: 14 }); // stroke-width in view units

export const TEMPLATES = Object.freeze(['fundus-od', 'fundus-os', 'anterior-od', 'anterior-os', 'amsler', 'blank']);
const TPL_SET = new Set(TEMPLATES);

const clampInt = (n, lo, hi) => Math.min(hi, Math.max(lo, Math.round(Number(n) || 0)));
const str = v => (v == null ? '' : String(v));

export function blankDiagram(tpl, id) {
  return { id: id == null ? Date.now() : id, tpl: TPL_SET.has(tpl) ? tpl : 'blank', note: '', strokes: [] };
}

// ---- stroke geometry -------------------------------------------------------------------------
// Ramer-Douglas-Peucker on a flat [x1,y1,x2,y2,...] array. Keeps endpoints; tolerance in view units.
export function simplifyFlat(flat, tol = 2) {
  const n = flat.length / 2;
  if (n <= 2) return flat.slice();
  const keep = new Uint8Array(n);
  keep[0] = 1; keep[n - 1] = 1;
  const stack = [[0, n - 1]];
  while (stack.length) {
    const [a, b] = stack.pop();
    let maxD = 0; let idx = -1;
    const ax = flat[a * 2], ay = flat[a * 2 + 1], bx = flat[b * 2], by = flat[b * 2 + 1];
    for (let i = a + 1; i < b; i++) {
      const d = distToSeg(flat[i * 2], flat[i * 2 + 1], ax, ay, bx, by);
      if (d > maxD) { maxD = d; idx = i; }
    }
    if (idx !== -1 && maxD > tol) { keep[idx] = 1; stack.push([a, idx], [idx, b]); }
  }
  const out = [];
  for (let i = 0; i < n; i++) if (keep[i]) out.push(flat[i * 2], flat[i * 2 + 1]);
  return out;
}

export function distToSeg(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay;
  const l2 = dx * dx + dy * dy;
  let t = l2 ? ((px - ax) * dx + (py - ay) * dy) / l2 : 0;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

// Build a stored stroke from raw pointer points. Returns null for an empty stroke.
export function makeStroke(rawFlat, ink, width) {
  if (!Array.isArray(rawFlat) || rawFlat.length < 2) return null;
  const rounded = [];
  for (let i = 0; i + 1 < rawFlat.length; i += 2) rounded.push(clampInt(rawFlat[i], 0, VIEW), clampInt(rawFlat[i + 1], 0, VIEW));
  let p = simplifyFlat(rounded, 2);
  if (p.length / 2 > MAX_POINTS) p = simplifyFlat(rounded, 6).slice(0, MAX_POINTS * 2);
  return { c: INK[ink] ? ink : 'k', w: WIDTHS[width] ? Number(width) : 2, p };
}

export function strokePath(s) {
  const p = s && s.p;
  if (!Array.isArray(p) || p.length < 2) return '';
  if (p.length === 2) return `M${p[0]} ${p[1]}l0.1 0`; // a tap draws a dot (round caps)
  let d = `M${p[0]} ${p[1]}`;
  for (let i = 2; i + 1 < p.length; i += 2) d += `L${p[i]} ${p[i + 1]}`;
  return d;
}

// Index of the top-most stroke within `radius` of (x, y), or -1. Used by the eraser.
export function hitStroke(strokes, x, y, radius = MIN_ERASE_RADIUS) {
  for (let k = (strokes || []).length - 1; k >= 0; k--) {
    const s = strokes[k];
    const p = s && s.p;
    if (!Array.isArray(p) || p.length < 2) continue;
    const r = radius + (WIDTHS[s.w] || 8) / 2;
    if (p.length === 2) { if (Math.hypot(x - p[0], y - p[1]) <= r) return k; continue; }
    for (let i = 0; i + 3 < p.length; i += 2) {
      if (distToSeg(x, y, p[i], p[i + 1], p[i + 2], p[i + 3]) <= r) return k;
    }
  }
  return -1;
}

// ---- normalisation (malformed / old / hostile input never breaks rendering) -------------------
export function normalizeDiagram(raw) {
  if (!raw || typeof raw !== 'object') return null;
  if (!TPL_SET.has(raw.tpl)) return null;
  const strokes = [];
  for (const s of Array.isArray(raw.strokes) ? raw.strokes : []) {
    if (strokes.length >= MAX_STROKES) break;
    if (!s || typeof s !== 'object' || !Array.isArray(s.p) || s.p.length < 2) continue;
    const p = [];
    for (let i = 0; i + 1 < s.p.length && p.length < MAX_POINTS * 2; i += 2) p.push(clampInt(s.p[i], 0, VIEW), clampInt(s.p[i + 1], 0, VIEW));
    if (p.length < 2) continue;
    strokes.push({ c: INK[s.c] ? s.c : 'k', w: WIDTHS[s.w] ? Number(s.w) : 2, p });
  }
  return { id: raw.id == null ? 0 : raw.id, tpl: raw.tpl, note: str(raw.note).slice(0, NOTE_CAP), strokes };
}

export function normalizeDiagrams(raw) {
  return (Array.isArray(raw) ? raw : []).slice(0, MAX_DIAGRAMS).map(normalizeDiagram).filter(Boolean);
}

// A diagram that is only the empty template (no strokes, no note) carries no information.
export const diagramIsEmpty = d => !d || (!(d.strokes && d.strokes.length) && !str(d.note).trim());
export const examDiagrams = exam => normalizeDiagrams(exam && exam.diagrams);

// Save step: the exam only gets a `diagrams` key when something was actually drawn, so records
// that never used the feature stay byte-for-byte what they were.
export function finalizeExamDiagrams(exam) {
  if (!exam) return exam;
  const list = normalizeDiagrams(exam.diagrams).filter(d => !diagramIsEmpty(d));
  const { diagrams, ...rest } = exam; // eslint-disable-line no-unused-vars
  return list.length ? { ...rest, diagrams: list } : rest;
}

// ---- template backgrounds as plain shape lists (rendered by React in the form, by string in print) ----
// Shape kinds: circle {cx,cy,r,fill?,dash?,w?,col?}, line {x1,y1,x2,y2,...}, path {d,...}, rect {x,y,w,h,...},
// text {x,y,s,text}. Lines default to a light grey so strokes drawn on top stay readable.
const GRID = '#cbd5e1';
const LINE = '#64748b';

function clock(cx, cy, rIn, rOut, rLabel) {
  const out = [];
  for (let h = 1; h <= 12; h++) {
    const a = (h * 30 - 90) * Math.PI / 180;
    out.push({ k: 'line', x1: cx + rIn * Math.cos(a), y1: cy + rIn * Math.sin(a), x2: cx + rOut * Math.cos(a), y2: cy + rOut * Math.sin(a), col: GRID, w: 2 });
    out.push({ k: 'text', x: cx + rLabel * Math.cos(a), y: cy + rLabel * Math.sin(a) + 12, s: 34, text: String(h), col: LINE });
  }
  return out;
}

export function templateShapes(tpl) {
  const eye = tpl && tpl.endsWith('-os') ? 'OS' : 'OD';
  const corner = { k: 'text', x: 60, y: 60, s: 44, text: eye, col: LINE, bold: true };
  if (tpl === 'fundus-od' || tpl === 'fundus-os') {
    const dir = eye === 'OD' ? 1 : -1; // fundus-photo convention: OD disc on the right, OS on the left
    return [
      { k: 'circle', cx: 500, cy: 500, r: 430, col: LINE, w: 4 },              // ora serrata
      { k: 'circle', cx: 500, cy: 500, r: 290, col: GRID, w: 3, dash: '14 10' }, // equator
      { k: 'circle', cx: 500, cy: 500, r: 150, col: GRID, w: 3, dash: '14 10' }, // posterior pole
      ...clock(500, 500, 150, 430, 468),
      { k: 'circle', cx: 500, cy: 500, r: 24, col: LINE, w: 3 },                // macula
      { k: 'circle', cx: 500, cy: 500, r: 5, col: LINE, fill: LINE },           // fovea
      { k: 'circle', cx: 500 + dir * 140, cy: 480, r: 46, col: LINE, w: 4 },    // optic disc
      { k: 'circle', cx: 500 + dir * 140, cy: 480, r: 18, col: GRID, w: 3 },    // cup
      corner
    ];
  }
  if (tpl === 'anterior-od' || tpl === 'anterior-os') {
    return [
      { k: 'path', d: 'M40 500Q500 80 960 500Q500 920 40 500Z', col: LINE, w: 4 }, // lid margins
      { k: 'circle', cx: 500, cy: 500, r: 300, col: LINE, w: 4 },                  // limbus
      { k: 'circle', cx: 500, cy: 500, r: 190, col: GRID, w: 3, dash: '14 10' },   // collarette
      { k: 'circle', cx: 500, cy: 500, r: 110, col: LINE, w: 4 },                  // pupil
      corner
    ];
  }
  if (tpl === 'amsler') {
    const out = [{ k: 'rect', x: 100, y: 100, w: 800, h: 800, col: LINE, w2: 4 }];
    for (let i = 1; i < 20; i++) {
      const v = 100 + i * 40;
      out.push({ k: 'line', x1: v, y1: 100, x2: v, y2: 900, col: GRID, w: 2 }, { k: 'line', x1: 100, y1: v, x2: 900, y2: v, col: GRID, w: 2 });
    }
    out.push({ k: 'circle', cx: 500, cy: 500, r: 9, col: LINE, fill: LINE });
    return out;
  }
  return [{ k: 'rect', x: 20, y: 20, w: 960, h: 960, col: GRID, w2: 3 }]; // blank
}

// ---- static SVG string (print / report). Everything interpolated is a number, a fixed colour,
// or escaped text, so it is safe to embed in the print HTML. ----
const escHtml = s => str(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const num = n => (Number.isFinite(Number(n)) ? Math.round(Number(n) * 10) / 10 : 0);

export function shapeToSvg(sh) {
  const col = escHtml(sh.col || LINE);
  const dash = sh.dash ? ` stroke-dasharray="${escHtml(sh.dash)}"` : '';
  if (sh.k === 'circle') return `<circle cx="${num(sh.cx)}" cy="${num(sh.cy)}" r="${num(sh.r)}" fill="${sh.fill ? escHtml(sh.fill) : 'none'}" stroke="${col}" stroke-width="${num(sh.w || 3)}"${dash}/>`;
  if (sh.k === 'line') return `<line x1="${num(sh.x1)}" y1="${num(sh.y1)}" x2="${num(sh.x2)}" y2="${num(sh.y2)}" stroke="${col}" stroke-width="${num(sh.w || 2)}"/>`;
  if (sh.k === 'rect') return `<rect x="${num(sh.x)}" y="${num(sh.y)}" width="${num(sh.w)}" height="${num(sh.h)}" fill="none" stroke="${col}" stroke-width="${num(sh.w2 || 3)}"/>`;
  if (sh.k === 'path') return `<path d="${escHtml(sh.d)}" fill="none" stroke="${col}" stroke-width="${num(sh.w || 3)}"/>`;
  if (sh.k === 'text') return `<text x="${num(sh.x)}" y="${num(sh.y)}" font-size="${num(sh.s || 30)}" fill="${col}" text-anchor="middle" font-family="sans-serif"${sh.bold ? ' font-weight="700"' : ''}>${escHtml(sh.text)}</text>`;
  return '';
}

export function strokeToSvg(s) {
  const d = strokePath(s);
  if (!d) return '';
  return `<path d="${escHtml(d)}" fill="none" stroke="${INK[s.c] || INK.k}" stroke-width="${WIDTHS[s.w] || 8}" stroke-linecap="round" stroke-linejoin="round"/>`;
}

export function diagramToSvg(diagram, px = 260) {
  const d = normalizeDiagram(diagram);
  if (!d) return '';
  const size = Math.max(60, Math.min(900, Math.round(Number(px) || 260)));
  const body = templateShapes(d.tpl).map(shapeToSvg).join('') + d.strokes.map(strokeToSvg).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${VIEW} ${VIEW}" width="${size}" height="${size}" style="background:#fff;border:1px solid #cbd5e1;border-radius:6px">${body}</svg>`;
}
