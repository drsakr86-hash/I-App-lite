// Pure annotation model for the atlas canvas: freehand pen strokes, arrows, text notes and ready-made lesion stamps drawn on top of a plate.
// Annotations live in plate coordinates (so they follow zoom), are kept per plate in this browser only, and never
// contain patient data -- attaching a drawing to a patient/exam is a later, doctor-approved step (see docs/ATLAS.md).
export const ANNOTATION_TYPES = Object.freeze(['pen', 'arrow', 'text', 'stamp']);
export const ANNOTATION_COLORS = Object.freeze(['#d62828', '#1d4ed8', '#15803d', '#111827']);
// Spoken names of the colours above (i18n keys atlas.color.<name>), for screen readers.
export const ANNOTATION_COLOR_NAMES = Object.freeze(['red', 'blue', 'green', 'black']);
export const MAX_ANNOTATIONS = 200;
export const MAX_POINTS = 600;
export const MAX_TEXT = 80;
export const STORAGE_PREFIX = 'iapp_atlas_ann_v1:';

import { STAMP_IDS, STAMP_ROTATIONS } from './stamps.js';

const num = v => typeof v === 'number' && Number.isFinite(v);
const COORD_LIMIT = 5000;
const okPoint = p => Array.isArray(p) && p.length === 2 && num(p[0]) && num(p[1]) && Math.abs(p[0]) <= COORD_LIMIT && Math.abs(p[1]) <= COORD_LIMIT;
const r1 = n => Math.round(n * 10) / 10;

let counter = 0;
export const newId = () => `a${Date.now().toString(36)}${(counter++).toString(36)}${Math.floor(Math.random() * 1296).toString(36)}`;

// strip control characters and clamp length
export const cleanText = s => String(s == null ? '' : s).replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, MAX_TEXT);

export const pen = (points, color) => ({ id: newId(), type: 'pen', color, points: simplify(points) });
export const arrow = (from, to, color) => ({ id: newId(), type: 'arrow', color, points: [[r1(from.x), r1(from.y)], [r1(to.x), r1(to.y)]] });
export const STAMP_MIN = 10, STAMP_MAX = 200;
const HEX = /^#[0-9a-f]{6}$/i;
export const stamp = (at, symbol, size, rot, color) => ({ id: newId(), type: 'stamp', symbol, color, size: Math.round(size), rot: STAMP_ROTATIONS.includes(rot) ? rot : 0, points: [[r1(at.x), r1(at.y)]] });
export const note = (at, text, color) => ({ id: newId(), type: 'text', color, points: [[r1(at.x), r1(at.y)]], text: cleanText(text) });

// Drop points closer than `min` plate units to the previous one (keeps strokes light), always keep the last point.
export function simplify(points, min = 1.5) {
  const out = [];
  for (const p of points) {
    const q = Array.isArray(p) ? p : [p.x, p.y];
    if (!okPoint(q)) continue;
    const last = out[out.length - 1];
    if (!last || Math.hypot(q[0] - last[0], q[1] - last[1]) >= min) out.push([r1(q[0]), r1(q[1])]);
  }
  const lastIn = points[points.length - 1];
  const lq = Array.isArray(lastIn) ? lastIn : lastIn && [lastIn.x, lastIn.y];
  if (lq && okPoint(lq) && out.length) {
    const last = out[out.length - 1];
    if (last[0] !== r1(lq[0]) || last[1] !== r1(lq[1])) out.push([r1(lq[0]), r1(lq[1])]);
  }
  return out.slice(0, MAX_POINTS);
}

export const pathFromPoints = points => (points.length ? points.map((p, i) => `${i ? 'L' : 'M'}${p[0]},${p[1]}`).join(' ') : '');

// A pen tap (single point) is drawn as a dot, so give it a degenerate segment.
export const penPath = points => (points.length === 1 ? `M${points[0][0]},${points[0][1]} l0.01,0` : pathFromPoints(points));

// Arrow head as a polygon "points" string; `size` in plate units.
export function arrowHead(from, to, size = 12) {
  const [x1, y1] = from; const [x2, y2] = to;
  const a = Math.atan2(y2 - y1, x2 - x1);
  const p = k => [r1(x2 - size * Math.cos(a + k)), r1(y2 - size * Math.sin(a + k))];
  const l = p(0.45); const r = p(-0.45);
  return `${r1(x2)},${r1(y2)} ${l[0]},${l[1]} ${r[0]},${r[1]}`;
}

export const add = (list, item) => (item ? [...list, item].slice(-MAX_ANNOTATIONS) : list);
export const undo = list => list.slice(0, -1);
export const remove = (list, id) => list.filter(a => a.id !== id);
export const clear = () => [];

// Accepts anything read from storage; returns only well-formed annotations.
export function sanitize(raw) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  for (const a of raw) {
    if (!a || typeof a !== 'object' || !ANNOTATION_TYPES.includes(a.type)) continue;
    if (a.type === 'stamp') {
      if (!STAMP_IDS.includes(a.symbol) || !HEX.test(String(a.color)) || typeof a.id !== 'string' || !/^[a-z0-9]{3,40}$/i.test(a.id)) continue;
      if (!Array.isArray(a.points) || a.points.length !== 1 || !okPoint(a.points[0]) || !num(a.size) || a.size < STAMP_MIN || a.size > STAMP_MAX) continue;
      out.push({ id: a.id, type: 'stamp', symbol: a.symbol, color: a.color, size: Math.round(a.size), rot: STAMP_ROTATIONS.includes(a.rot) ? a.rot : 0, points: [[a.points[0][0], a.points[0][1]]] });
      continue;
    }
    if (!ANNOTATION_COLORS.includes(a.color) || typeof a.id !== 'string' || !/^[a-z0-9]{3,40}$/i.test(a.id)) continue;
    if (!Array.isArray(a.points) || !a.points.every(okPoint)) continue;
    if (a.type === 'pen' && (a.points.length < 1 || a.points.length > MAX_POINTS)) continue;
    if (a.type === 'arrow' && a.points.length !== 2) continue;
    if (a.type === 'text') {
      if (a.points.length !== 1) continue;
      const text = cleanText(a.text);
      if (!text) continue;
      out.push({ id: a.id, type: 'text', color: a.color, points: [[a.points[0][0], a.points[0][1]]], text });
      continue;
    }
    out.push({ id: a.id, type: a.type, color: a.color, points: a.points.map(p => [p[0], p[1]]) });
  }
  return out.slice(-MAX_ANNOTATIONS);
}

// Storage scope of a canvas. Standalone: one per plate. Inside an exam (context = { patient, exam }) the unsaved sketch
// belongs to that patient's exam only, so a drawing made for one patient never reappears on another patient's exam.
export function annotationScope(plateId, context) {
  const pid = context && context.patient ? context.patient.id : null;
  const eid = context && context.exam ? context.exam.id : null;
  if ((pid == null || pid === '') && (eid == null || eid === '')) return String(plateId);
  const safe = v => String(v == null ? '' : v).replace(/[^0-9A-Za-z_-]/g, '').slice(0, 40);
  return `${plateId}@p${safe(pid)}.e${safe(eid)}`;
}

// Per-scope persistence in browser storage (`iapp_` prefix: removed by the sign-out PHI purge).
export function loadAnnotations(storage, plateId) {
  try { return sanitize(JSON.parse(storage.getItem(STORAGE_PREFIX + plateId) || '[]')); } catch { return []; }
}
export function saveAnnotations(storage, plateId, list) {
  try {
    if (!list.length) storage.removeItem(STORAGE_PREFIX + plateId);
    else storage.setItem(STORAGE_PREFIX + plateId, JSON.stringify(sanitize(list)));
    return true;
  } catch { return false; }
}
