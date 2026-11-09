// Special-case examination sheets (neuro-ophthalmology, uveitis, squint, glaucoma, diabetic
// retinopathy). Part of the examination itself, not a separate screen.
// Pure module: no React / DOM / Supabase, so it is unit-testable and shared by the form, the
// patient-file view and the print template.
//
// WHERE IT LIVES: an optional `special` object on the examination record in the existing
// `iapp_exams` store (whole records as JSON -- no database change; old records without it keep
// working untouched):
//   special: { uveitis: { acCells: { od: '2+', os: '' }, location: 'Anterior', ... }, ... }
// A per-eye field stores { od, os }; a single field stores a string. Drawings are made in the exam's own anatomy-drawing step (atlas), not here.
// The Core examination table never sees it (the Core sync only reads named fields).

import { t } from '../i18n/index.js';

export const MAX_TEXT = 300;

const GRADE_0_4 = ['0', '0.5+', '1+', '2+', '3+', '4+'];
const PRESENT = ['None', 'Present'];

// Field kinds: `eyes: true` -> { od, os }; `opts` -> drop-down; no `opts` -> free text.
// Option values are the clinical shorthand clinicians already write; they are stored as typed.
export const CASES = Object.freeze([
  {
    id: 'neuro',
    icon: '🧠',
    fields: [
      { k: 'rapd', eyes: true, opts: ['None', '1+', '2+', '3+', '4+'] },
      { k: 'pupil', eyes: true, opts: ['Normal', 'Sluggish', 'Fixed dilated', 'Miotic', 'Irregular'] },
      { k: 'color', eyes: true },
      { k: 'disc', eyes: true, opts: ['Normal', 'Swollen', 'Pale', 'Temporal pallor', 'Cupped', 'Hyperaemic', 'Tilted'] },
      { k: 'field', eyes: true, opts: ['Full', 'Constricted', 'Central scotoma', 'Altitudinal', 'Hemianopia', 'Quadrantanopia', 'Enlarged blind spot'] },
      { k: 'ptosis', eyes: true, opts: ['None', 'Mild', 'Moderate', 'Severe'] },
      { k: 'motility' },
      { k: 'nystagmus', opts: ['None', 'Horizontal', 'Vertical', 'Rotatory', 'Gaze-evoked'] },
      { k: 'imaging' }
    ]
  },
  {
    id: 'uveitis',
    icon: '🔥',
    fields: [
      { k: 'location', opts: ['Anterior', 'Intermediate', 'Posterior', 'Panuveitis'] },
      { k: 'course', opts: ['Acute', 'Recurrent', 'Chronic'] },
      { k: 'laterality', opts: ['Unilateral', 'Bilateral', 'Alternating'] },
      { k: 'acCells', eyes: true, opts: GRADE_0_4 },
      { k: 'acFlare', eyes: true, opts: ['0', '1+', '2+', '3+', '4+'] },
      { k: 'kp', eyes: true, opts: ['None', 'Fine', 'Mutton-fat', 'Stellate'] },
      { k: 'synechiae', eyes: true, opts: ['None', 'Posterior', 'Anterior', 'Both'] },
      { k: 'hypopyon', eyes: true, opts: PRESENT },
      { k: 'vitreousHaze', eyes: true, opts: GRADE_0_4 },
      { k: 'cme', eyes: true, opts: PRESENT },
      { k: 'workup' }
    ]
  },
  {
    id: 'squint',
    icon: '👀',
    fields: [
      { k: 'type', opts: ['Esotropia', 'Exotropia', 'Hypertropia', 'Hypotropia', 'Esophoria', 'Exophoria', 'Orthophoria'] },
      { k: 'constancy', opts: ['Constant', 'Intermittent', 'Alternating'] },
      { k: 'fixation', opts: ['OD', 'OS', 'Alternating'] },
      { k: 'pdNear' },
      { k: 'pdDistance' },
      { k: 'pattern', opts: ['None', 'A pattern', 'V pattern', 'X pattern'] },
      { k: 'amblyopia', opts: ['None', 'OD', 'OS', 'Bilateral'] },
      { k: 'cycloRefraction', eyes: true },
      { k: 'stereo' },
      { k: 'headPosture' }
    ]
  },
  {
    id: 'glaucoma',
    icon: '🎯',
    fields: [
      { k: 'type', opts: ['POAG', 'PACG', 'PAC / PACS', 'NTG', 'Secondary', 'Suspect', 'Ocular hypertension'] },
      { k: 'cct', eyes: true },
      { k: 'gonio', eyes: true, opts: ['Shaffer 0', 'Shaffer 1', 'Shaffer 2', 'Shaffer 3', 'Shaffer 4'] },
      { k: 'cd', eyes: true, opts: ['0.1', '0.2', '0.3', '0.4', '0.5', '0.6', '0.7', '0.8', '0.9', '1.0'] },
      { k: 'discHaem', eyes: true, opts: PRESENT },
      { k: 'vfMd', eyes: true },
      { k: 'rnfl', eyes: true },
      { k: 'targetIop' }
    ]
  },
  {
    id: 'dr',
    icon: '🩸',
    fields: [
      { k: 'grade', eyes: true, opts: ['No DR', 'Mild NPDR', 'Moderate NPDR', 'Severe NPDR', 'PDR', 'High-risk PDR'] },
      { k: 'dme', eyes: true, opts: ['None', 'Non-centre', 'Centre-involving'] },
      { k: 'cmt', eyes: true },
      { k: 'prior', eyes: true, opts: ['None', 'Anti-VEGF', 'PRP', 'Focal laser', 'Vitrectomy'] },
      { k: 'hba1c' },
      { k: 'duration' }
    ]
  }
]);

export const CASE_IDS = Object.freeze(CASES.map(c => c.id));
const BY_ID = Object.fromEntries(CASES.map(c => [c.id, c]));
export const caseById = id => BY_ID[id] || null;

const str = v => (v == null ? '' : String(v)).slice(0, MAX_TEXT);
const filled = v => str(v).trim() !== '';

export const caseLabel = (id, lang) => t('g11.sp.case.' + id, lang);
export const fieldLabel = (caseId, k, lang) => t('g11.sp.f.' + caseId + '.' + k, lang);

export function blankCase(id) {
  const c = caseById(id);
  if (!c) return null;
  const out = {};
  for (const f of c.fields) out[f.k] = f.eyes ? { od: '', os: '' } : '';
  return out;
}

// Malformed / old / hostile stored data never breaks rendering: unknown cases and fields are
// dropped, every value becomes a capped string.
export function normalizeCase(id, raw) {
  const c = caseById(id);
  if (!c) return null;
  const src = raw && typeof raw === 'object' ? raw : {};
  const out = {};
  for (const f of c.fields) {
    const v = src[f.k];
    if (f.eyes) {
      const o = v && typeof v === 'object' ? v : {};
      out[f.k] = { od: str(o.od), os: str(o.os) };
    } else {
      out[f.k] = v && typeof v === 'object' ? '' : str(v);
    }
  }
  return out;
}

export function normalizeSpecial(raw) {
  const out = {};
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
  for (const id of CASE_IDS) {
    if (Object.prototype.hasOwnProperty.call(raw, id)) out[id] = normalizeCase(id, raw[id]);
  }
  return out;
}

export function caseIsEmpty(id, values) {
  const c = caseById(id);
  if (!c) return true;
  const v = normalizeCase(id, values);
  return c.fields.every(f => (f.eyes ? !filled(v[f.k].od) && !filled(v[f.k].os) : !filled(v[f.k])));
}

// Save step: the exam only gets a `special` key when a case actually has a value, so records
// that never used the feature stay byte-for-byte what they were.
export function finalizeExamSpecial(exam) {
  if (!exam) return exam;
  const norm = normalizeSpecial(exam.special);
  const kept = {};
  for (const id of Object.keys(norm)) if (!caseIsEmpty(id, norm[id])) kept[id] = norm[id];
  const { special, ...rest } = exam; // eslint-disable-line no-unused-vars
  return Object.keys(kept).length ? { ...rest, special: kept } : rest;
}

// Filled rows only, in sheet order: [{ id, rows: [{ k, eyes, od, os } | { k, eyes:false, value }] }].
export function specialSummary(exam) {
  const norm = normalizeSpecial(exam && exam.special);
  const out = [];
  for (const c of CASES) {
    if (!norm[c.id]) continue;
    const v = norm[c.id];
    const rows = [];
    for (const f of c.fields) {
      if (f.eyes) {
        const { od, os } = v[f.k];
        if (filled(od) || filled(os)) rows.push({ k: f.k, eyes: true, od: od.trim(), os: os.trim() });
      } else if (filled(v[f.k])) {
        rows.push({ k: f.k, eyes: false, value: v[f.k].trim() });
      }
    }
    if (rows.length) out.push({ id: c.id, rows });
  }
  return out;
}
