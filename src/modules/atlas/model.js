// Pure model of the anatomy atlas (no React, no DOM): plate lookup, bilingual text, label placement, search, validation.
// A plate is plain data. Every plate carries its source and licence so provenance is never separated from the artwork.
import { PLATES } from './plates/index.js';

export const CONTENT_STATUS = Object.freeze({ DRAFT: 'draft', APPROVED: 'approved' });
export const LABEL_SIDES = Object.freeze(['s', 'e', 'm']); // s = text starts at the label point, e = text ends there, m = centred
export const SHAPE_TYPES = Object.freeze(['path', 'circle', 'ellipse', 'rect', 'line', 'polygon', 'text']);
// The only keys a shape may carry; the renderer passes the geometry ones through to SVG, so anything else is rejected here.
export const SHAPE_KEYS = Object.freeze(['t', 'f', 's', 'sw', 'o', 'dash', 'tf', 'hit', 'sym', 'fr', 'd', 'cx', 'cy', 'r', 'rx', 'ry', 'x', 'y', 'width', 'height', 'x1', 'y1', 'x2', 'y2', 'points', 'text', 'size', 'anchor']);

const ARABIC = /[؀-ۿ]/;
const COLOR = /^(none|#[0-9a-fA-F]{3,8}|rgba?\([\d\s.,%]+\))$/;
const TRANSFORM = /^[a-zA-Z]+\([\d\s.,-]+\)(\s+[a-zA-Z]+\([\d\s.,-]+\))*$/;
const PATHDATA = /^[MmLlHhVvCcSsQqTtAaZz0-9\s.,-]+$/;
const POINTS = /^[\d\s.,-]+$/;
const DASH = /^[\d\s.,]+$/;

export const listPlates = () => PLATES.map(p => ({ id: p.id, title: p.title, subtitle: p.subtitle, count: p.parts.length, status: p.status }));
export const getPlate = id => PLATES.find(p => p.id === id) || null;
export const getPart = (plate, partId) => (plate ? plate.parts.find(p => p.id === partId) || null : null);
export const firstPlateId = () => (PLATES[0] ? PLATES[0].id : null);

export const pick = (obj, lang) => (obj ? obj[lang] || obj.ar || obj.en || '' : '');
export const partName = (part, lang) => pick(part.name, lang);
export const partShort = (part, lang) => pick(part.short || part.name, lang);

// Text shown beside a structure: the current language, or both ("القرنية · Cornea").
export function labelText(part, lang, both = false) {
  if (both) {
    const ar = partShort(part, 'ar');
    const en = partShort(part, 'en');
    return ar === en ? ar : `${ar} · ${en}`;
  }
  return partShort(part, lang);
}

export function labelPlacement(part) {
  const [ax, ay] = part.anchor;
  const [lx, ly, side] = part.label;
  const anchor = side === 'e' ? 'end' : side === 'm' ? 'middle' : 'start';
  // the leader line stops just short of the text so it never crosses the glyphs
  const gap = side === 'm' ? 0 : side === 'e' ? 4 : -4;
  return { ax, ay, lx, ly, anchor, lineX: lx + gap, lineY: side === 'm' ? (ly > ay ? ly - 13 : ly + 5) : ly - 4 };
}

export const plateVBox = plate => { const [x, y, w, h] = plate.viewBox; return { x, y, w, h }; };
export const symAxis = plate => { const [x, , w] = plate.viewBox; return x + w / 2; }; // mirror axis for shapes flagged `sym`

// Parts in drawing order (z, then declaration order) -- the renderer paints in this order so higher z is on top.
export function partsInDrawOrder(plate) {
  return plate.parts.map((p, i) => ({ p, i })).sort((a, b) => ((a.p.z || 0) - (b.p.z || 0)) || (a.i - b.i)).map(o => o.p);
}

// Search -----------------------------------------------------------------
export function normalizeText(s) {
  return String(s == null ? '' : s)
    .toLowerCase()
    .replace(/[ً-ٰٟـ]/g, '') // Arabic diacritics + tatweel
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/\s+/g, ' ')
    .trim();
}

export function searchParts(query, plates = PLATES, limit = 30) {
  const q = normalizeText(query);
  if (q.length < 2) return [];
  const hits = [];
  for (const plate of plates) {
    for (const part of plate.parts) {
      const names = [part.name.ar, part.name.en, partShort(part, 'ar'), partShort(part, 'en')].map(normalizeText);
      let score = 0;
      if (names.some(n => n === q)) score = 4;
      else if (names.some(n => n.startsWith(q))) score = 3;
      else if (names.some(n => n.includes(q))) score = 2;
      else if (normalizeText(part.desc.ar).includes(q) || normalizeText(part.desc.en).includes(q)) score = 1;
      if (score) hits.push({ plateId: plate.id, partId: part.id, score });
    }
  }
  return hits.sort((a, b) => b.score - a.score).slice(0, limit);
}

// Validation (used by tests and by the content owner before approving a plate) --------------------------------
const num = v => typeof v === 'number' && Number.isFinite(v);
const bilingual = (o, label, out, { arabicRequired = true } = {}) => {
  if (!o || typeof o.ar !== 'string' || typeof o.en !== 'string' || !o.ar.trim() || !o.en.trim()) { out.push(`${label}: needs non-empty ar and en`); return; }
  if (arabicRequired && !ARABIC.test(o.ar)) out.push(`${label}: ar has no Arabic letters`);
  if (ARABIC.test(o.en)) out.push(`${label}: en contains Arabic letters`);
};

function validateShape(sh, where, out) {
  if (!sh || typeof sh !== 'object') { out.push(`${where}: shape is not an object`); return; }
  if (!SHAPE_TYPES.includes(sh.t)) { out.push(`${where}: unknown shape type ${sh.t}`); return; }
  for (const k of Object.keys(sh)) if (!SHAPE_KEYS.includes(k)) out.push(`${where}: key "${k}" is not allowed`);
  for (const k of ['f', 's']) if (sh[k] != null && !COLOR.test(String(sh[k]))) out.push(`${where}: bad colour ${k}=${sh[k]}`);
  if (sh.tf != null && !TRANSFORM.test(sh.tf)) out.push(`${where}: bad transform`);
  if (sh.dash != null && !DASH.test(sh.dash)) out.push(`${where}: bad dash`);
  for (const k of ['sw', 'o', 'hit', 'cx', 'cy', 'r', 'rx', 'ry', 'x', 'y', 'width', 'height', 'x1', 'y1', 'x2', 'y2', 'size']) if (sh[k] != null && !num(sh[k])) out.push(`${where}: ${k} must be a finite number`);
  if (sh.fr != null && !['evenodd', 'nonzero'].includes(sh.fr)) out.push(`${where}: bad fill rule`);
  if (sh.t === 'path' && !(typeof sh.d === 'string' && PATHDATA.test(sh.d))) out.push(`${where}: bad path data`);
  if (sh.t === 'polygon' && !(typeof sh.points === 'string' && POINTS.test(sh.points))) out.push(`${where}: bad points`);
  const need = { circle: ['cx', 'cy', 'r'], ellipse: ['cx', 'cy', 'rx', 'ry'], rect: ['x', 'y', 'width', 'height'], line: ['x1', 'y1', 'x2', 'y2'], text: ['x', 'y'] }[sh.t] || [];
  for (const k of need) if (!num(sh[k])) out.push(`${where}: ${sh.t} needs ${k}`);
  if (sh.t === 'text') bilingual(sh.text, `${where}.text`, out);
}

export function validatePlate(plate) {
  const out = [];
  if (!plate || typeof plate !== 'object') return ['plate is not an object'];
  const id = plate.id;
  if (typeof id !== 'string' || !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(id)) out.push(`bad plate id ${id}`);
  bilingual(plate.title, `${id}.title`, out);
  bilingual(plate.subtitle, `${id}.subtitle`, out);
  const vb = plate.viewBox;
  if (!Array.isArray(vb) || vb.length !== 4 || !vb.every(num) || vb[2] <= 0 || vb[3] <= 0) out.push(`${id}: bad viewBox`);
  if (!Object.values(CONTENT_STATUS).includes(plate.status)) out.push(`${id}: bad status ${plate.status}`);
  if (!plate.source || plate.source.type !== 'original' && !(plate.source.license && plate.source.url)) out.push(`${id}: source/licence missing`);
  if (!plate.source || !plate.source.license || !plate.source.author) out.push(`${id}: source needs author and licence`);
  if (!Array.isArray(plate.references) || !plate.references.length) out.push(`${id}: references missing`);
  (plate.decor || []).forEach((sh, i) => validateShape(sh, `${id}.decor[${i}]`, out));
  if (!Array.isArray(plate.parts) || !plate.parts.length) { out.push(`${id}: no parts`); return out; }
  const seen = new Set();
  const inside = ([x, y], margin = 0) => Array.isArray(vb) && num(x) && num(y) && x >= vb[0] - margin && x <= vb[0] + vb[2] + margin && y >= vb[1] - margin && y <= vb[1] + vb[3] + margin;
  for (const part of plate.parts) {
    const w = `${id}/${part.id}`;
    if (typeof part.id !== 'string' || !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(part.id)) out.push(`${w}: bad part id`);
    if (seen.has(part.id)) out.push(`${w}: duplicate part id`);
    seen.add(part.id);
    bilingual(part.name, `${w}.name`, out);
    bilingual(part.short, `${w}.short`, out);
    bilingual(part.desc, `${w}.desc`, out);
    if (part.desc && part.desc.ar && part.desc.ar.length < 30) out.push(`${w}: description too short`);
    if (!Array.isArray(part.shapes) || !part.shapes.length) out.push(`${w}: no shapes`);
    (part.shapes || []).forEach((sh, i) => validateShape(sh, `${w}.shapes[${i}]`, out));
    (part.overlay || []).forEach((sh, i) => validateShape(sh, `${w}.overlay[${i}]`, out));
    if (part.z != null && !num(part.z)) out.push(`${w}: z must be a number`);
    if (!Array.isArray(part.anchor) || part.anchor.length !== 2 || !inside(part.anchor)) out.push(`${w}: anchor outside the plate`);
    if (!Array.isArray(part.label) || part.label.length !== 3 || !LABEL_SIDES.includes(part.label[2]) || !inside(part.label)) out.push(`${w}: label missing or outside the plate`);
  }
  return out;
}

export const plateAttribution = plate => `${plate.source.author} — ${plate.source.license}`;
export const isApproved = plate => plate.status === CONTENT_STATUS.APPROVED;
