// Arabic -> English for the fixed choices the app itself offers (drop-down options, complaints,
// colour-vision values ...). Used to (a) show English labels in drop-downs and (b) write the
// English report. Stored values stay Arabic, so nothing already saved changes.
// Anything NOT in this table (free text typed by the doctor) is never machine-translated:
// translateTerm returns it unchanged and the report marks such text as "free text".

import { EXTRA_PAIRS } from './terms/index.js';
import { ANTERIOR_OPTIONS, POSTERIOR_OPTIONS, DX_OPTIONS, INVESTIGATION_OPTIONS, FOLLOWUP_REASON_OPTIONS } from '../patient-file/ophth.js';

const PAIRS = [
  // generic
  ['طبيعي', 'Normal'], ['طبيعية', 'Normal'], ['غير طبيعي', 'Abnormal'], ['إيجابي', 'Positive'], ['منخفض', 'Reduced'], ['صافية', 'Clear'], ['صافي', 'Clear'],
  ['ذكر', 'Male'], ['أنثى', 'Female'],
  // complaints
  ['ضعف النظر', 'Blurred / reduced vision'], ['التهاب العين', 'Eye inflammation'], ['صداع', 'Headache'], ['تغيير النظارة', 'Change of glasses'],
  ['صعوبة في القراءة', 'Difficulty reading'], ['مياه بيضاء', 'Cataract (patient complaint)'], ['شبورة بالعين', 'Hazy vision'], ['ألم في العين', 'Eye pain'],
  ['عين حمراء', 'Red eye'], ['إفرازات من العين', 'Eye discharge'], ['رؤية مزدوجة', 'Double vision'], ['وميض أو بقع سوداء', 'Flashes or floaters'],
  // eyes (injection records)
  ['العين اليمنى', 'Right eye (OD)'], ['العين اليسرى', 'Left eye (OS)'], ['كلتا العينين', 'Both eyes (OU)'],
  // anterior
  ['التهاب حافة الجفن (Blepharitis)', 'Blepharitis'], ['شعيرة / كيس دهني (Chalazion)', 'Chalazion'], ['تدلي الجفن (Ptosis)', 'Ptosis'],
  ['انقلاب للداخل (Entropion)', 'Entropion'], ['انقلاب للخارج (Ectropion)', 'Ectropion'], ['وذمة', 'Oedema'],
  ['احتقان', 'Congested'], ['التهاب ملتحمة تحسسي', 'Allergic conjunctivitis'], ['التهاب ملتحمة بكتيري / فيروسي', 'Bacterial / viral conjunctivitis'],
  ['ظفرة (Pterygium)', 'Pterygium'], ['نزيف تحت الملتحمة', 'Subconjunctival haemorrhage'], ['جفاف', 'Dryness'],
  ['تقرحات نقطية (SPK)', 'Superficial punctate keratitis (SPK)'], ['قرحة قرنية', 'Corneal ulcer'], ['ندبة قرنية', 'Corneal scar'], ['وذمة قرنية', 'Corneal oedema'],
  ['مخروط قرنية (Keratoconus)', 'Keratoconus'], ['عتامة', 'Opacity'], ['ترسبات خلفية (KPs)', 'Keratic precipitates (KPs)'],
  ['عميقة ورائقة', 'Deep and quiet'], ['ضحلة', 'Shallow'], ['خلايا / Flare', 'Cells / flare'], ['نزيف أمامي (Hyphema)', 'Hyphaema'], ['قيح أمامي (Hypopyon)', 'Hypopyon'],
  ['التصاقات خلفية', 'Posterior synechiae'], ['تضخم أوعية (Rubeosis)', 'Rubeosis iridis'], ['ضمور', 'Atrophy'], ['ثقب قزحية', 'Iris hole / iridotomy'],
  ['ماء أبيض بداية (NS +1)', 'Early nuclear sclerosis (NS +1)'], ['ماء أبيض (NS +2)', 'Nuclear sclerosis (NS +2)'], ['ماء أبيض ناضج', 'Mature cataract'],
  ['ماء أبيض تحت المحفظة الخلفية (PSC)', 'Posterior subcapsular cataract (PSC)'], ['عدسة داخل العين (IOL) في موضعها', 'Intraocular lens (IOL) in place'],
  ['IOL مع عتامة المحفظة الخلفية (PCO)', 'IOL with posterior capsule opacification (PCO)'], ['بلا عدسة (Aphakia)', 'Aphakia'],
  // posterior
  ['حفر القرص موسّعة (Cupping)', 'Enlarged cupping'], ['وذمة القرص', 'Disc oedema'], ['شحوب', 'Pallor'], ['تكوّن أوعية جديدة (NVD)', 'Neovascularisation of the disc (NVD)'],
  ['وذمة بقعية (DME / CME)', 'Macular oedema (DME / CME)'], ['ثقب بقعي', 'Macular hole'], ['غشاء أمام الشبكية (ERM)', 'Epiretinal membrane (ERM)'],
  ['تنكس بقعي (AMD)', 'Macular degeneration (AMD)'], ['ثؤلول (Drusen)', 'Drusen'], ['نزف بقعي', 'Macular haemorrhage'],
  ['اعتلال شبكية سكري خفيف (Mild NPDR)', 'Mild NPDR'], ['سكري متوسط (Moderate NPDR)', 'Moderate NPDR'], ['سكري شديد (Severe NPDR)', 'Severe NPDR'],
  ['سكري تكاثري (PDR)', 'Proliferative diabetic retinopathy (PDR)'], ['ضغط دم (Hypertensive)', 'Hypertensive retinopathy'], ['انسداد وريد (RVO)', 'Retinal vein occlusion (RVO)'],
  ['طبيعي', 'Normal'], ['تنكس شبكي (Lattice)', 'Lattice degeneration'], ['ثقب شبكية', 'Retinal hole'], ['تمزق شبكية', 'Retinal tear'], ['انفصال شبكية', 'Retinal detachment'], ['ليزر سابق', 'Previous laser'],
  // diagnoses
  ['قصر نظر (Myopia)', 'Myopia'], ['طول نظر (Hyperopia)', 'Hyperopia'], ['استجماتيزم', 'Astigmatism'], ['قصور تكيف / شيخوخة بصرية (Presbyopia)', 'Presbyopia'],
  ['جفاف العين (Dry eye)', 'Dry eye'], ['التهاب ملتحمة', 'Conjunctivitis'], ['ماء أبيض (Cataract)', 'Cataract'], ['مياه زرقاء (Glaucoma)', 'Glaucoma'], ['اشتباه جلوكوما', 'Glaucoma suspect'],
  ['اعتلال شبكية سكري (DR)', 'Diabetic retinopathy (DR)'], ['وذمة بقعية سكرية (DME)', 'Diabetic macular oedema (DME)'], ['تنكس بقعي مرتبط بالعمر (AMD)', 'Age-related macular degeneration (AMD)'],
  ['انسداد وريد شبكي (RVO)', 'Retinal vein occlusion (RVO)'], ['مخروط قرنية', 'Keratoconus'], ['التهاب قزحية (Uveitis)', 'Uveitis'], ['حول (Strabismus)', 'Strabismus'], ['كسل العين (Amblyopia)', 'Amblyopia'],
  // investigations
  ['OCT بقعة', 'Macular OCT'], ['OCT عصب بصري (RNFL)', 'Optic nerve OCT (RNFL)'], ['مجال بصري (VF)', 'Visual field (VF)'], ['تصوير قاع العين', 'Fundus photography'],
  ['FFA (تصوير الأوعية بالفلورسين)', 'Fluorescein angiography (FFA)'], ['OCTA', 'OCT angiography (OCTA)'], ['طبوغرافيا القرنية', 'Corneal topography'],
  ['قياس سُمك القرنية (Pachymetry)', 'Corneal pachymetry'], ['موجات صوتية (B-scan)', 'B-scan ultrasound'], ['قياس الانكسار بالتقطير (Cycloplegic)', 'Cycloplegic refraction'],
  // follow-up reasons
  ['متابعة ضغط العين', 'IOP follow-up'], ['تقييم الاستجابة بعد الحقن', 'Post-injection response assessment'], ['جرعة حقن قادمة', 'Next injection'],
  ['مراجعة نتيجة فحص', 'Review of test result'], ['متابعة سكري', 'Diabetic follow-up'], ['بعد عملية', 'Post-operative review'], ['متابعة روتينية', 'Routine follow-up'], ['قياس نظارة', 'Glasses prescription']
];

export const AR_TO_EN = Object.freeze(Object.fromEntries([...PAIRS, ...EXTRA_PAIRS]));
// English -> Arabic (case-insensitive) so data saved in English still shows in Arabic when Arabic is chosen.
const EN_TO_AR = (() => {
  const m = {};
  for (const [ar, en] of [...PAIRS, ...EXTRA_PAIRS]) { const k = String(en).toLowerCase(); if (!(k in m)) m[k] = ar; }
  return m;
})();

// Every option the form offers must have an English form (guarded by a test).
export const ALL_OFFERED_OPTIONS = [
  ...Object.values(ANTERIOR_OPTIONS).flat(), ...Object.values(POSTERIOR_OPTIONS).flat(),
  ...DX_OPTIONS, ...INVESTIGATION_OPTIONS, ...FOLLOWUP_REASON_OPTIONS
];

const clean = s => String(s == null ? '' : s).trim();

export function isKnownTerm(text) {
  return Object.prototype.hasOwnProperty.call(AR_TO_EN, clean(text));
}

// lang 'en' -> English form when the app offers one; lang 'ar' -> Arabic form of a known English value. Unknown free text is unchanged.
export function translateTerm(text, lang) {
  const s = clean(text);
  if (!s) return s;
  if (lang === 'en') {
    if (isKnownTerm(s)) return AR_TO_EN[s];
  } else {
    const k = s.toLowerCase();
    if (Object.prototype.hasOwnProperty.call(EN_TO_AR, k)) return EN_TO_AR[k];
  }
  // Multi-line values (medicine lists, treatment plans): translate each line on its own; unknown lines stay as typed.
  if (s.indexOf('\n') > -1) return s.split('\n').map(line => translateTerm(line, lang)).join('\n');
  return s;
}
