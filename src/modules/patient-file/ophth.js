// Structured ophthalmic examination -- front-end data contract (pure: no React/DOM/Supabase).
//
// WHERE IT LIVES: an optional `ophth` object on the examination record in the existing
// `iapp_exams` store. The store keeps whole records as JSON, so no database change is needed
// and old records (without `ophth`) keep working untouched.
//
// WHAT CORE SEES: Core's examination table has no UCVA/PH/CMT/cup-disc/VF columns (verified
// against the live schema, see docs/SECURITY-RELEASE-CHECKLIST.md). To avoid losing the
// clinical meaning on the Core side, `applyOphthToExam` mirrors the structured findings into
// the flat text fields Core already receives (`anteriorSegment`, `posteriorSegment`,
// `diagnosis`, `treatmentPlan`) inside a clearly delimited, regenerated block. The numeric
// fields (UCVA, PH, CMT, C/D, VF MD, refraction) stay in `ophth` until a backend migration
// (docs/sql/NOT-APPLIED-structured-ophthalmology.sql) is applied.
//
// FLAT FIELDS REMAIN THE SOURCE FOR: BCVA/VA (`visualAcuityR/L`), IOP value (`iopR/L`),
// treatment plan (`treatmentPlan`) and follow-up date (`followUp`). The structured panel adds
// only what the flat form cannot express. Nothing is ever invented: an empty field stays empty.

export const OPHTH_VERSION = 1;
export const DERIVED_MARK = '— تفصيل منظّم —';

export const ANTERIOR_PARTS = Object.freeze([
  ['lids', 'الجفون'], ['conjunctiva', 'الملتحمة'], ['cornea', 'القرنية'],
  ['ac', 'الحجرة الأمامية'], ['iris', 'القزحية'], ['lens', 'العدسة']
]);
export const POSTERIOR_PARTS = Object.freeze([
  ['disc', 'القرص البصري'], ['macula', 'البقعة'], ['vessels', 'الأوعية'], ['periphery', 'المحيط']
]);
export const IOP_METHODS = Object.freeze(['Goldmann', 'Non-contact (air puff)', 'iCare', 'Tono-Pen', 'Schiøtz', 'Digital']);

const EYES = ['od', 'os'];
const str = v => (v == null ? '' : String(v));
const eyePair = () => ({ od: '', os: '' });

export function blankOphth() {
  const part = () => eyePair();
  return {
    v: OPHTH_VERSION,
    va: { od: { ucva: '', ph: '' }, os: { ucva: '', ph: '' } },
    iop: { method: '' },
    refraction: { od: { sph: '', cyl: '', axis: '' }, os: { sph: '', cyl: '', axis: '' } },
    anterior: Object.fromEntries(ANTERIOR_PARTS.map(([k]) => [k, part()])),
    posterior: Object.fromEntries(POSTERIOR_PARTS.map(([k]) => [k, part()])),
    cd: eyePair(),
    cmt: eyePair(),
    vfMd: eyePair(),
    dx: { od: '', os: '', ou: '' },
    plan: { investigation: '', followUpReason: '' }
  };
}

// Merge unknown/old/malformed input onto the blank shape. Only known keys survive and every
// value becomes a string, so a corrupted record can never break rendering.
export function normalizeOphth(raw) {
  const b = blankOphth();
  if (!raw || typeof raw !== 'object') return b;
  const take = (target, src) => {
    if (!src || typeof src !== 'object') return;
    for (const k of Object.keys(target)) {
      if (k === 'v') continue;
      if (target[k] && typeof target[k] === 'object') take(target[k], src[k]);
      else if (src[k] != null && typeof src[k] !== 'object') target[k] = str(src[k]);
    }
  };
  take(b, raw);
  return b;
}

const hasText = v => str(v).trim() !== '';
function anyLeaf(o) {
  if (o == null) return false;
  if (typeof o !== 'object') return hasText(o);
  return Object.entries(o).some(([k, v]) => k !== 'v' && anyLeaf(v));
}
export const ophthIsEmpty = o => !anyLeaf(o);

// ---- numeric reading -----------------------------------------------------------------------
const AR_DIGITS = { '٠': '0', '١': '1', '٢': '2', '٣': '3', '٤': '4', '٥': '5', '٦': '6', '٧': '7', '٨': '8', '٩': '9', '٫': '.', '،': '.' };
export function toNumber(v) {
  if (v == null) return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  const s = String(v).replace(/[٠-٩٫،]/g, c => AR_DIGITS[c]).replace(',', '.').trim();
  const m = /^[-+]?\d+(\.\d+)?/.exec(s);
  if (!m) return null;
  const n = Number(m[0]);
  return Number.isFinite(n) ? n : null;
}

// Visual acuity -> logMAR (lower is better) for TREND DETECTION only; the original text is
// always what gets displayed. Unparseable strings return null (never guessed).
// Categorical low vision uses the conventional logMAR equivalents (CF 2.0, HM 2.3, LP 2.7, NLP 3.0).
const LOW_VISION = { CF: 2.0, HM: 2.3, PL: 2.7, LP: 2.7, NPL: 3.0, NLP: 3.0 };
export function vaToLogMar(raw) {
  const t = str(raw).trim().toUpperCase().replace(/\s+/g, '');
  if (!t) return null;
  if (t in LOW_VISION) return { logmar: LOW_VISION[t], categorical: true };
  const frac = /^(\d+(?:\.\d+)?)\/(\d+(?:\.\d+)?)$/.exec(t);
  if (frac) {
    const dec = Number(frac[1]) / Number(frac[2]);
    return dec > 0 && dec <= 3 ? { logmar: round2(-Math.log10(dec)), categorical: false } : null;
  }
  const dec = toNumber(t);
  if (dec != null && dec > 0 && dec <= 3 && /^[\d.]+$/.test(t.replace(/[٠-٩٫]/g, c => AR_DIGITS[c]))) {
    return { logmar: round2(-Math.log10(dec)), categorical: false };
  }
  return null;
}
const round2 = n => (Math.round(n * 100) / 100) || 0; // `|| 0` turns -0 into 0

// ---- accessors that work for old (flat) and new (structured) records -------------------------
export function examOphth(exam) {
  return normalizeOphth(exam && exam.ophth);
}

const flatKey = { va: { od: 'visualAcuityR', os: 'visualAcuityL' }, iop: { od: 'iopR', os: 'iopL' } };

export function vaOf(exam, eye) {
  const o = examOphth(exam);
  const bcva = str(exam && exam[flatKey.va[eye]]).trim();
  return { bcva, ucva: o.va[eye].ucva.trim(), ph: o.va[eye].ph.trim() };
}
export function iopOf(exam, eye) {
  const raw = str(exam && exam[flatKey.iop[eye]]).trim();
  return { raw, value: toNumber(raw) };
}
export function metricOf(exam, key, eye) {
  const o = examOphth(exam);
  const raw = o[key][eye].trim();
  return { raw, value: toNumber(raw) };
}
export function refractionOf(exam, eye) {
  const r = examOphth(exam).refraction[eye];
  return { sph: r.sph.trim(), cyl: r.cyl.trim(), axis: r.axis.trim() };
}

// ---- mirroring structured findings into the flat text Core already receives -------------------
export function stripDerived(text) {
  const t = str(text);
  const i = t.indexOf(DERIVED_MARK);
  return (i === -1 ? t : t.slice(0, i)).replace(/\s+$/, '');
}
function joinDerived(note, lines) {
  const base = stripDerived(note);
  return lines.length ? [base, DERIVED_MARK, ...lines].filter((x, idx) => idx !== 0 || x !== '').join('\n') : base;
}
function partLines(parts, data) {
  const lines = [];
  for (const [k, label] of parts) {
    const { od, os } = data[k];
    if (hasText(od) || hasText(os)) lines.push(`${label}: OD ${hasText(od) ? od.trim() : '—'} · OS ${hasText(os) ? os.trim() : '—'}`);
  }
  return lines;
}
export function composeAnterior(o) { return partLines(ANTERIOR_PARTS, o.anterior); }
export function composePosterior(o) {
  const lines = partLines(POSTERIOR_PARTS, o.posterior);
  if (hasText(o.cd.od) || hasText(o.cd.os)) lines.push(`C/D: OD ${hasText(o.cd.od) ? o.cd.od.trim() : '—'} · OS ${hasText(o.cd.os) ? o.cd.os.trim() : '—'}`);
  return lines;
}
export function composeDiagnosis(o) {
  const lines = [];
  if (hasText(o.dx.od)) lines.push('OD: ' + o.dx.od.trim());
  if (hasText(o.dx.os)) lines.push('OS: ' + o.dx.os.trim());
  if (hasText(o.dx.ou)) lines.push('OU: ' + o.dx.ou.trim());
  return lines;
}

// Returns a NEW exam: `ophth` pruned (removed when empty) and the flat mirrors regenerated.
// Idempotent: applying twice yields the same record.
export function applyOphthToExam(exam) {
  const e = { ...exam };
  const o = normalizeOphth(e.ophth);
  const empty = ophthIsEmpty(o);
  if (empty) delete e.ophth; else e.ophth = o;
  // Free text typed by the clinician is preserved; only the regenerated block changes.
  e.anteriorSegment = joinDerived(e.anteriorSegment, empty ? [] : composeAnterior(o));
  e.posteriorSegment = joinDerived(e.posteriorSegment, empty ? [] : composePosterior(o));
  e.diagnosis = joinDerived(e.diagnosis, empty ? [] : composeDiagnosis(o));
  if (!empty && hasText(o.plan.investigation)) {
    e.treatmentPlan = joinDerived(e.treatmentPlan, ['فحوصات مطلوبة: ' + o.plan.investigation.trim()]);
  } else {
    e.treatmentPlan = joinDerived(e.treatmentPlan, []);
  }
  return e;
}

// For the edit form: show the clinician's own text, without the regenerated block.
export function examForEditing(exam) {
  if (!exam) return exam;
  const out = { ...exam };
  for (const k of ['anteriorSegment', 'posteriorSegment', 'diagnosis', 'treatmentPlan']) {
    if (typeof out[k] === 'string') out[k] = stripDerived(out[k]);
  }
  return out;
}

// Text for display/Core planning that excludes the regenerated block (so the same diagnosis is
// not shown twice next to the structured OD/OS/OU lines).
export const plainText = stripDerived;
export const EYE_KEYS = EYES;
export const VA_PLACEHOLDER = '6/12 أو CF أو HM';
