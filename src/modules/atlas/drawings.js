// Phase 2 (inert until wired): the record of an approved atlas drawing attached to a patient exam.
// Pure data logic only: no Supabase, no storage, no React. Records live inside the exam's optional
// `ophth.atlasDrawings[]` array. Each item is flat and has a stable id, so the array can later be
// unnested into a standalone table without losing anything (see toRows / fromRows).
// Rules (agreed with the doctor): nothing is attached without an explicit approval by a doctor/admin;
// an approved drawing is never edited in place (a change creates a new version and supersedes the old
// one, which stays readable); report inclusion is a per-drawing choice, off by default; secretary,
// employee and the patient portal never see any of it.
import { can } from '../../app/permissions.js';

export const DRAWING_SCHEMA = 1;
export const DRAWING_STATUS = Object.freeze({ APPROVED: 'approved', SUPERSEDED: 'superseded' });
export const DRAWING_ACTION = Object.freeze({ APPROVE: 'approve', EDIT: 'edit', SUPERSEDE: 'supersede', TOGGLE_REPORT: 'toggleReport' });
export const DRAWING_KINDS = Object.freeze(['atlas', 'imaging']);
export const DRAWING_EXTS = Object.freeze(['png', 'jpg', 'jpeg', 'webp']);
export const ATLAS_DRAWINGS_KEY = 'atlasDrawings';

const UUID = /^[0-9a-f-]{8,64}$/i;

// ---- permissions ------------------------------------------------------------
export const canViewDrawings = role => can(role, 'atlas', 'read');
export const canApproveDrawing = role => can(role, 'atlas', 'write');

// ---- storage path (what is stored instead of a URL) -------------------------
export function drawingPath(kind, patientId, uuid, ext) {
  if (!DRAWING_KINDS.includes(kind)) throw new Error('bad kind');
  const pid = String(patientId == null ? '' : patientId);
  if (!/^\d{1,20}$/.test(pid)) throw new Error('bad patientId');
  if (!UUID.test(String(uuid || ''))) throw new Error('bad uuid');
  const e = String(ext || '').toLowerCase();
  if (!DRAWING_EXTS.includes(e)) throw new Error('bad ext');
  return kind + '/' + pid + '/' + uuid + '.' + e;
}

// Which area a path belongs to (the future storage policy keys on the first segment).
export const pathKind = p => { const k = String(p || '').split('/')[0]; return DRAWING_KINDS.includes(k) ? k : null; };

// ---- stable hashing (change detection only, not security) -------------------
export function stableStringify(v) {
  if (v === null || typeof v !== 'object') return JSON.stringify(v === undefined ? null : v);
  if (Array.isArray(v)) return '[' + v.map(stableStringify).join(',') + ']';
  return '{' + Object.keys(v).sort().map(k => JSON.stringify(k) + ':' + stableStringify(v[k])).join(',') + '}';
}
export function fingerprint(v) {
  const s = stableStringify(v);
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return 'f' + h.toString(16).padStart(8, '0') + '.' + s.length;
}

// ---- helpers ---------------------------------------------------------------
const iso = now => (now instanceof Date ? now : new Date(now == null ? Date.now() : now)).toISOString();
const clone = v => (v == null ? v : JSON.parse(JSON.stringify(v)));
export const drawingsOf = ophth => (ophth && Array.isArray(ophth[ATLAS_DRAWINGS_KEY]) ? ophth[ATLAS_DRAWINGS_KEY] : []);

function userOf(user) {
  const id = user && user.id != null ? String(user.id) : '';
  if (!id) throw new Error('user required');
  return { id, name: String((user && user.name) || '') };
}
const revision = (rev, action, user, now, d) => ({
  rev, at: iso(now), by: user.id, byName: user.name, action,
  annotationsSha: fingerprint(d.annotations), imagePath: d.image && d.image.path || ''
});

function checkImage(image) {
  if (!image || image.provider !== 'supabase' || image.bucket !== 'clinical-private') throw new Error('image must be in the private bucket');
  if (pathKind(image.path) !== 'atlas') throw new Error('bad image path');
  return {
    provider: 'supabase', bucket: 'clinical-private', path: String(image.path),
    thumbPath: image.thumbPath ? String(image.thumbPath) : '', bytes: Number(image.bytes) || 0,
    sha256: String(image.sha256 || ''), mime: String(image.mime || 'image/png')
  };
}

// ---- approve & attach -------------------------------------------------------
// The only way a drawing becomes part of the patient record.
export function approveDrawing({ id, plateId, plateVersion = 1, annotations = [], image, patientId, visitId = null, examId = null, user, role, now }) {
  if (!canApproveDrawing(role)) throw new Error('not allowed');
  if (!UUID.test(String(id || ''))) throw new Error('bad id');
  if (!plateId) throw new Error('plateId required');
  if (patientId == null || patientId === '') throw new Error('patientId required');
  if (visitId == null && examId == null) throw new Error('visit or exam required');
  const u = userOf(user);
  const d = {
    id: String(id), schema: DRAWING_SCHEMA, plateId: String(plateId), plateVersion: Number(plateVersion) || 1,
    annotations: clone(annotations), image: checkImage(image),
    patientId, visitId, examId, status: DRAWING_STATUS.APPROVED,
    approvedBy: u.id, approvedByName: u.name, approvedAt: iso(now),
    includeInReport: false, supersedes: null, supersededBy: null, revisions: []
  };
  d.revisions.push(revision(1, DRAWING_ACTION.APPROVE, u, now, d));
  return d;
}

export function addDrawing(list, drawing) {
  const base = Array.isArray(list) ? list : [];
  if (base.some(x => x.id === drawing.id)) throw new Error('duplicate id');
  return [...base, drawing];
}

// Never edits in place: the old version becomes superseded (still readable), a new version is added.
export function reviseDrawing(list, id, { newId, annotations, image, user, role, now }) {
  if (!canApproveDrawing(role)) throw new Error('not allowed');
  const base = Array.isArray(list) ? list : [];
  const old = base.find(x => x.id === id);
  if (!old) throw new Error('not found');
  if (old.status !== DRAWING_STATUS.APPROVED) throw new Error('only an approved version can be revised');
  if (!UUID.test(String(newId || '')) || base.some(x => x.id === newId)) throw new Error('bad newId');
  const u = userOf(user);
  const fresh = {
    ...clone(old), id: String(newId), annotations: clone(annotations || []), image: checkImage(image),
    approvedBy: u.id, approvedByName: u.name, approvedAt: iso(now), status: DRAWING_STATUS.APPROVED,
    supersedes: old.id, supersededBy: null, includeInReport: false // a new version needs a fresh report decision
  };
  fresh.revisions = [...old.revisions, revision(old.revisions.length + 1, DRAWING_ACTION.EDIT, u, now, fresh)];
  const closed = {
    ...clone(old), status: DRAWING_STATUS.SUPERSEDED, supersededBy: fresh.id, includeInReport: false,
    revisions: [...old.revisions, revision(old.revisions.length + 1, DRAWING_ACTION.SUPERSEDE, u, now, old)]
  };
  return base.map(x => (x.id === id ? closed : x)).concat([fresh]);
}

export function setIncludeInReport(list, id, value, { user, role, now }) {
  if (!canApproveDrawing(role)) throw new Error('not allowed');
  const base = Array.isArray(list) ? list : [];
  const d = base.find(x => x.id === id);
  if (!d) throw new Error('not found');
  if (d.status !== DRAWING_STATUS.APPROVED) throw new Error('only an approved version can be printed');
  const u = userOf(user);
  const next = { ...clone(d), includeInReport: !!value };
  next.revisions = [...d.revisions, revision(d.revisions.length + 1, DRAWING_ACTION.TOGGLE_REPORT, u, now, next)];
  return base.map(x => (x.id === id ? next : x));
}

// ---- reading ---------------------------------------------------------------
// Roles without permission get nothing, so a screen can never render clinical drawings for them.
export const visibleDrawings = (list, role) => (canViewDrawings(role) && Array.isArray(list) ? list : []);
export const reportDrawings = (list, role) => visibleDrawings(list, role).filter(d => d.status === DRAWING_STATUS.APPROVED && d.includeInReport === true);
export const currentDrawings = (list, role) => visibleDrawings(list, role).filter(d => d.status === DRAWING_STATUS.APPROVED);

// Version chain of one drawing, oldest first.
export function versionChain(list, id) {
  const base = Array.isArray(list) ? list : [];
  let cur = base.find(x => x.id === id);
  while (cur && cur.supersedes) { const p = base.find(x => x.id === cur.supersedes); if (!p) break; cur = p; }
  const out = [];
  const seen = new Set();
  while (cur && !seen.has(cur.id)) { out.push(cur); seen.add(cur.id); cur = base.find(x => x.id === cur.supersededBy); }
  return out;
}

// ---- privacy: what may leave towards the patient portal / non-clinical roles --
export function stripClinicalDrawings(ophth) {
  if (!ophth || typeof ophth !== 'object') return ophth;
  const { [ATLAS_DRAWINGS_KEY]: _omit, ...rest } = ophth;
  return rest;
}

// ---- concurrent edits (the exam is one JSON record: never overwrite the other side) --
// Union by id. For the same id keep the copy with more revisions (history only grows).
export function mergeDrawings(a, b) {
  const map = new Map();
  for (const d of [...(Array.isArray(a) ? a : []), ...(Array.isArray(b) ? b : [])]) {
    const cur = map.get(d.id);
    if (!cur || (d.revisions || []).length > (cur.revisions || []).length) map.set(d.id, d);
  }
  return [...map.values()].sort((x, y) => String(x.approvedAt).localeCompare(String(y.approvedAt)) || String(x.id).localeCompare(String(y.id)));
}

// ---- migration readiness: array <-> table rows, lossless ---------------------
export function toRows(list) {
  return (Array.isArray(list) ? list : []).map(d => ({
    id: d.id, schema: d.schema, patient_id: d.patientId, visit_id: d.visitId, exam_id: d.examId,
    plate_id: d.plateId, plate_version: d.plateVersion, status: d.status,
    approved_by: d.approvedBy, approved_by_name: d.approvedByName, approved_at: d.approvedAt,
    include_in_report: d.includeInReport, supersedes: d.supersedes, superseded_by: d.supersededBy,
    image: d.image, annotations: d.annotations, revisions: d.revisions
  }));
}
export function fromRows(rows) {
  return (Array.isArray(rows) ? rows : []).map(r => ({
    id: r.id, schema: r.schema, plateId: r.plate_id, plateVersion: r.plate_version,
    annotations: r.annotations, image: r.image, patientId: r.patient_id, visitId: r.visit_id, examId: r.exam_id,
    status: r.status, approvedBy: r.approved_by, approvedByName: r.approved_by_name, approvedAt: r.approved_at,
    includeInReport: r.include_in_report, supersedes: r.supersedes, supersededBy: r.superseded_by, revisions: r.revisions
  }));
}
