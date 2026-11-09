// Rule-based differential diagnosis / work-up suggestions from the STRUCTURED fields of the general exam
// (chief complaint, VA, pin-hole, IOP, C/D, CMT, VF MD, refraction, colour vision, contrast, cover test).
// Decision support only: it lists what to CONSIDER and why; the doctor decides and nothing is written automatically.
// Free-text fields are never read. Pure module (no React / DOM / Supabase).
//
// suggestGeneral(exam) -> { items: [{ id, label, tier: 'urgent'|'consider', why: [{ k, p }] , workup: string[] }] }
// `why` is a list of reasons (dictionary key under g13.ddx.r.* + parameters), so every suggestion shows the finding behind it.
import { examOphth, vaToLogMar, toNumber } from '../patient-file/ophth.js';
import { IOP_HIGH_LIMIT } from '../../components/forms/exam-form-model.js';

const str = v => (v == null ? '' : String(v)).trim();
// difference of two readings rounded to 0.01, so 0.7 - 0.5 counts as 0.2 (binary floating point says 0.19999999999999996)
const gap = (a, b) => Math.round(Math.abs(a - b) * 100) / 100;
const EYES = ['od', 'os'];
const FLAT = { va: { od: 'visualAcuityR', os: 'visualAcuityL' }, iop: { od: 'iopR', os: 'iopL' } };

export const TIER = Object.freeze({ URGENT: 'urgent', CONSIDER: 'consider' });

// thresholds (named so a doctor can review and change them in one place)
export const T = Object.freeze({
  VA_REDUCED_LOGMAR: 0.3,   // ~0.5 decimal or worse
  PH_GAIN_LOGMAR: 0.2,      // two lines
  VA_ASYM_LOGMAR: 0.3,
  IOP_HIGH: IOP_HIGH_LIMIT, // mmHg, flagged above this in the form
  IOP_ASYM: 5,
  CD_HIGH: 0.6,
  CD_ASYM: 0.2,
  VF_MD_DAMAGE: -6,         // dB
  CMT_HIGH: 320,            // micrometres
  CMT_LOW: 200,
  MYOPIA_HIGH: -6,          // dioptres (spherical equivalent not computed: sphere only)
  HYPEROPIA_HIGH: 4,
  CYL_HIGH: 3,
  ANISO: 2
});

// Physiologically possible ranges. A value outside them is a typing slip (e.g. C/D "6" for 0.6) and is ignored, never guessed.
export const RANGE = Object.freeze({ iop: [0, 80], cd: [0, 1], cmt: [50, 1500], vfMd: [-40, 10], sph: [-40, 40], cyl: [-15, 15] });
const within = (n, [lo, hi]) => (n != null && n >= lo && n <= hi ? n : null);

const C = Object.freeze({
  VISION: 'ضعف النظر', INFLAM: 'التهاب العين', HEADACHE: 'صداع', GLASSES: 'تغيير النظارة', READING: 'صعوبة في القراءة',
  CATARACT: 'مياه بيضاء', HAZY: 'شبورة بالعين', PAIN: 'ألم في العين', RED: 'عين حمراء', DISCHARGE: 'إفرازات من العين',
  DIPLOPIA: 'رؤية مزدوجة', FLASHES: 'وميض أو بقع سوداء'
});

export function findingsOf(exam) {
  const o = examOphth(exam || {});
  const f = { complaint: str(exam && exam.chiefComplaint), eyes: {}, colorAbn: str(exam && exam.colorVision) === 'غير طبيعي', contrastLow: str(exam && exam.contrast) === 'منخفض', coverPos: str(exam && exam.coverTest) === 'إيجابي' };
  for (const e of EYES) {
    const bcva = str(exam && exam[FLAT.va[e]]);
    const ucva = str(o.va[e].ucva); const ph = str(o.va[e].ph);
    const b = vaToLogMar(bcva); const u = vaToLogMar(ucva); const p = vaToLogMar(ph);
    f.eyes[e] = {
      bcva, ucva, ph, bcvaL: b, ucvaL: u, phL: p,
      iop: within(toNumber(exam && exam[FLAT.iop[e]]), RANGE.iop),
      cd: within(toNumber(o.cd[e]), RANGE.cd), cmt: within(toNumber(o.cmt[e]), RANGE.cmt), vfMd: within(toNumber(o.vfMd[e]), RANGE.vfMd),
      sph: within(toNumber(o.refraction[e].sph), RANGE.sph), cyl: within(toNumber(o.refraction[e].cyl), RANGE.cyl)
    };
  }
  return f;
}

export function suggestGeneral(exam) {
  const f = findingsOf(exam);
  const map = new Map();
  const add = (id, label, tier, why, workup = []) => {
    const cur = map.get(id) || { id, label, tier, why: [], workup: [] };
    if (tier === TIER.URGENT) cur.tier = TIER.URGENT;
    if (!cur.why.some(x => x.k === why.k && JSON.stringify(x.p) === JSON.stringify(why.p))) cur.why.push(why);
    for (const w of workup) if (!cur.workup.includes(w)) cur.workup.push(w);
    map.set(id, cur);
  };
  const up = e => e.toUpperCase();
  const both = (fn) => EYES.forEach(e => fn(e, f.eyes[e]));
  const cx = f.complaint;

  both((e, v) => {
    const best = v.bcvaL || v.ucvaL; // BCVA first, otherwise the uncorrected value
    if (best && best.categorical) {
      add('media-or-severe', 'Dense media opacity (cataract, vitreous haemorrhage) or severe retinal / optic nerve disease', TIER.URGENT, { k: 'vaSevere', p: { e: up(e), v: v.bcva || v.ucva } }, ['B-scan ultrasound', 'Dilated fundus examination', 'RAPD check']);
    } else if (best && best.logmar >= T.VA_REDUCED_LOGMAR) {
      const value = v.bcva || v.ucva;
      add('organic-va', 'Organic cause of reduced vision (media, macula or optic nerve)', TIER.CONSIDER, { k: 'vaLow', p: { e: up(e), v: value } }, ['Dilated fundus examination', 'OCT macula']);
      if (v.ucvaL && v.phL && v.ucvaL.logmar > v.phL.logmar && gap(v.ucvaL.logmar, v.phL.logmar) >= T.PH_GAIN_LOGMAR) {
        add('refractive', 'Uncorrected refractive error', TIER.CONSIDER, { k: 'phImprove', p: { e: up(e), a: v.ucva, b: v.ph } }, ['Cycloplegic refraction']);
      } else if (v.ucvaL && v.phL) {
        add('organic-va', 'Organic cause of reduced vision (media, macula or optic nerve)', TIER.CONSIDER, { k: 'phNoImprove', p: { e: up(e) } }, ['Dilated fundus examination', 'OCT macula']);
      }
    }
    if (v.iop != null && v.iop > T.IOP_HIGH) {
      add('ocular-htn-glaucoma', 'Ocular hypertension / primary open-angle glaucoma', TIER.CONSIDER, { k: 'iopHigh', p: { e: up(e), v: v.iop } }, ['Gonioscopy', 'CCT (pachymetry)', 'OCT RNFL', 'Visual field 24-2', 'Repeat IOP / diurnal curve']);
      if ([C.PAIN, C.RED].includes(cx)) add('acute-angle-closure', 'Acute angle closure (painful red eye with high IOP)', TIER.URGENT, { k: 'iopHigh', p: { e: up(e), v: v.iop } }, ['Gonioscopy / AS-OCT', 'Urgent IOP lowering per protocol']);
    }
    if (v.cd != null && v.cd >= T.CD_HIGH) add('glaucoma-optic-neuropathy', 'Glaucomatous optic neuropathy (vs physiological cupping)', TIER.CONSIDER, { k: 'cdHigh', p: { e: up(e), v: v.cd } }, ['OCT RNFL', 'Visual field 24-2', 'Optic disc photo']);
    if (v.vfMd != null && v.vfMd <= T.VF_MD_DAMAGE) add('established-field-loss', 'Established visual field loss: glaucoma, optic neuropathy or retinal disease', TIER.CONSIDER, { k: 'vfMd', p: { e: up(e), v: v.vfMd } }, ['OCT RNFL and macula', 'Neuro-imaging if the pattern is not glaucomatous']);
    if (v.cmt != null && v.cmt >= T.CMT_HIGH) add('macular-oedema', 'Macular oedema (diabetic, RVO, uveitic or post-operative CME, wet AMD) or VMT / ERM', TIER.CONSIDER, { k: 'cmtHigh', p: { e: up(e), v: v.cmt } }, ['OCT macula', 'FFA', 'HbA1c and blood pressure']);
    if (v.cmt != null && v.cmt > 0 && v.cmt <= T.CMT_LOW) add('macular-thinning', 'Macular atrophy, ischaemia or thinning', TIER.CONSIDER, { k: 'cmtLow', p: { e: up(e), v: v.cmt } }, ['OCT macula', 'Fundus autofluorescence', 'OCT-A']);
    if (v.sph != null && v.sph <= T.MYOPIA_HIGH) add('high-myopia', 'High myopia: lattice / retinal detachment risk, myopic maculopathy, glaucoma risk', TIER.CONSIDER, { k: 'sphMyopia', p: { e: up(e), v: v.sph } }, ['Dilated peripheral retinal examination', 'OCT macula', 'OCT RNFL']);
    if (v.sph != null && v.sph >= T.HYPEROPIA_HIGH) add('high-hyperopia', 'High hyperopia: angle-closure risk, amblyopia, accommodative esotropia', TIER.CONSIDER, { k: 'sphHyperopia', p: { e: up(e), v: v.sph } }, ['Gonioscopy / AS-OCT', 'Cycloplegic refraction']);
    if (v.cyl != null && Math.abs(v.cyl) >= T.CYL_HIGH) add('astigmatism-ectasia', 'High or irregular astigmatism: keratoconus or corneal ectasia', TIER.CONSIDER, { k: 'cylHigh', p: { e: up(e), v: v.cyl } }, ['Corneal topography / tomography']);
  });

  // between the two eyes
  const [od, os] = [f.eyes.od, f.eyes.os];
  const ba = od.bcvaL || od.ucvaL; const bb = os.bcvaL || os.ucvaL;
  if (ba && bb && gap(ba.logmar, bb.logmar) >= T.VA_ASYM_LOGMAR) add('organic-va', 'Organic cause of reduced vision (media, macula or optic nerve)', TIER.CONSIDER, { k: 'vaAsym', p: { a: od.bcva || od.ucva, b: os.bcva || os.ucva } }, ['RAPD check', 'Dilated fundus examination']);
  if (od.iop != null && os.iop != null && gap(od.iop, os.iop) >= T.IOP_ASYM && Math.max(od.iop, os.iop) > T.IOP_HIGH) {
    add('secondary-glaucoma', 'Secondary glaucoma (steroid, uveitic, pseudoexfoliation, pigment dispersion, angle recession)', TIER.CONSIDER, { k: 'iopAsym', p: { a: od.iop, b: os.iop } }, ['Gonioscopy', 'Slit-lamp examination', 'Steroid and trauma history']);
  }
  if (od.cd != null && os.cd != null && gap(od.cd, os.cd) >= T.CD_ASYM) add('glaucoma-optic-neuropathy', 'Glaucomatous optic neuropathy (vs physiological cupping)', TIER.CONSIDER, { k: 'cdAsym', p: { a: od.cd, b: os.cd } }, ['OCT RNFL', 'Visual field 24-2']);
  if (od.sph != null && os.sph != null && gap(od.sph, os.sph) >= T.ANISO) add('anisometropia', 'Anisometropia: amblyopia risk', TIER.CONSIDER, { k: 'aniso', p: { d: Math.abs(od.sph - os.sph).toFixed(2).replace(/\.?0+$/, '') } }, ['Cycloplegic refraction', 'Cover test']);

  // complaint and screening tests
  if (cx === C.FLASHES) add('rd-tear', 'Retinal tear / detachment, posterior vitreous detachment or vitreous haemorrhage', TIER.URGENT, { k: 'complaint', p: { c: cx } }, ['Dilated peripheral fundus examination', 'B-scan if the view is poor']);
  if (cx === C.FLASHES) add('migraine-aura', 'Migraine aura (diagnosis of exclusion)', TIER.CONSIDER, { k: 'complaint', p: { c: cx } });
  if (cx === C.DIPLOPIA) add('diplopia-strabismus', 'Diplopia: decompensated phoria, cranial nerve III / IV / VI palsy, thyroid eye disease, myasthenia, restrictive strabismus', TIER.CONSIDER, { k: 'complaint', p: { c: cx } }, ['Prism cover test in all gaze positions', 'Use the Squint / Neuro sheet', 'Neuro-imaging if a new palsy']);
  if (f.coverPos) add('diplopia-strabismus', 'Strabismus or decompensated phoria', TIER.CONSIDER, { k: 'coverPos' }, ['Prism cover test in all gaze positions', 'Use the Squint sheet']);
  if ([C.CATARACT, C.HAZY].includes(cx)) add('cataract-media', 'Cataract, media opacity or corneal pathology', TIER.CONSIDER, { k: 'complaint', p: { c: cx } }, ['Slit-lamp examination', 'Dilated lens examination', 'Glare / contrast testing']);
  if ([C.GLASSES, C.READING].includes(cx)) add('refractive', 'Uncorrected refractive error or presbyopia', TIER.CONSIDER, { k: 'complaint', p: { c: cx } }, ['Refraction (cycloplegic if young)']);
  if (cx === C.HEADACHE) add('headache-asthenopia', 'Refractive / binocular-vision cause of headache (exclude raised ICP if disc swelling)', TIER.CONSIDER, { k: 'complaint', p: { c: cx } }, ['Cycloplegic refraction', 'Dilated fundus (disc)', 'Blood pressure']);
  if ([C.INFLAM, C.RED, C.DISCHARGE, C.PAIN].includes(cx)) {
    add('red-eye', 'Red eye: conjunctivitis, keratitis, uveitis, episcleritis / scleritis, dry eye or blepharitis', TIER.CONSIDER, { k: 'complaint', p: { c: cx } }, ['Slit-lamp with fluorescein', 'IOP', 'Swab if discharge is purulent']);
    const lowVa = EYES.some(e => { const b = f.eyes[e].bcvaL || f.eyes[e].ucvaL; return b && b.logmar >= T.VA_REDUCED_LOGMAR; });
    if (lowVa && [C.PAIN, C.RED, C.INFLAM].includes(cx)) add('keratitis-uveitis', 'Keratitis or uveitis (inflamed eye with reduced vision)', TIER.URGENT, { k: 'redLowVa', p: { c: cx } }, ['Fluorescein stain', 'Anterior chamber cells / flare']);
  }
  if (f.colorAbn) add('optic-neuropathy-colour', 'Optic nerve disease (optic neuritis, compressive, toxic / nutritional) or macular disease; congenital colour deficiency', TIER.CONSIDER, { k: 'colorAbn' }, ['RAPD check', 'Visual field', 'OCT RNFL', 'MRI orbits / brain if suspected']);
  if (f.contrastLow) add('low-contrast', 'Reduced contrast: optic neuropathy, glaucoma, cataract, macular disease or amblyopia', TIER.CONSIDER, { k: 'contrastLow' }, ['Dilated fundus examination', 'Visual field']);

  const items = [...map.values()].sort((a, b) => (a.tier === b.tier ? 0 : a.tier === TIER.URGENT ? -1 : 1));
  return { items };
}

// Everything the assistant offers for an exam, general rules first. `sheets` come from the special-case sheets (exam.special).
export const hasFindings = exam => suggestGeneral(exam).items.length > 0;
