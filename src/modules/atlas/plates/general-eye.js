// Plate 1 -- General eye anatomy (schematic horizontal section, not to scale).
// Original vector artwork drawn for this project; see docs/ATLAS.md for provenance. Content status: draft until a doctor approves it.
const M = y => 420 - y; // mirror a y coordinate around the optic axis (y = 210)
const ln = (x1, y1, x2, y2, extra = {}) => ({ t: 'line', x1, y1, x2, y2, s: '#8a8a8a', sw: 1.3, hit: 9, ...extra });

export default {
  id: 'general-eye',
  title: { ar: 'تشريح العين العام', en: 'General eye anatomy' },
  subtitle: { ar: 'مقطع أفقي تخطيطي (غير مقيّس)', en: 'Schematic horizontal section (not to scale)' },
  viewBox: [0, 0, 660, 420],
  status: 'draft',
  source: { type: 'original', author: 'Sakr Eye Clinic / I-App-lite', license: 'Original project artwork (all rights reserved by the clinic)' },
  references: ['AAO BCSC Section 2: Fundamentals and Principles of Ophthalmology', "Kanski's Clinical Ophthalmology (anatomy chapter)"],
  // drawn first, behind every part
  decor: [],
  parts: [
    {
      id: 'optic-nerve', z: 0,
      name: { ar: 'العصب البصري', en: 'Optic nerve' }, short: { ar: 'العصب البصري', en: 'Optic nerve' },
      desc: {
        ar: 'العصب القحفي الثاني؛ يحمل محاور الخلايا العقدية الشبكية (نحو مليون ليف) إلى الدماغ. يمرّ بأربعة أجزاء: داخل المقلة وداخل الحجاج وداخل القناة البصرية وداخل القحف.',
        en: 'Cranial nerve II; carries about one million retinal ganglion cell axons to the brain. Four parts: intraocular, intraorbital, intracanalicular and intracranial.'
      },
      shapes: [{ t: 'polygon', points: '463,277 475,245 541,269 529,301', f: '#e8dcc0', s: '#a89a72', sw: 1.5 }],
      anchor: [520, 282], label: [560, 330, 's']
    },
    {
      id: 'sclera', z: 1,
      name: { ar: 'الصلبة', en: 'Sclera' }, short: { ar: 'الصلبة', en: 'Sclera' },
      desc: {
        ar: 'الغلاف الخارجي الأبيض المتين من الكولاجين؛ يحفظ شكل المقلة وتلتصق به العضلات الخارجية. أرقّ ما تكون خلف مواضع اندغام العضلات وأسمكها عند القطب الخلفي.',
        en: 'Tough white collagenous outer coat that keeps the globe shape and receives the extraocular muscle insertions. Thinnest behind the muscle insertions, thickest at the posterior pole.'
      },
      shapes: [{ t: 'path', d: 'M200,135 A150,150 0 1 1 200,285 C155,265 155,155 200,135 Z', f: '#efe8d8', s: '#8d8570', sw: 2 }],
      anchor: [330, 65], label: [330, 24, 'm']
    },
    {
      id: 'cornea', z: 2,
      name: { ar: 'القرنية', en: 'Cornea' }, short: { ar: 'القرنية', en: 'Cornea' },
      desc: {
        ar: 'النافذة الأمامية الشفافة عديمة الأوعية؛ تمنح نحو ثلثي القدرة الكاسرة للعين (≈43 ديوبتر). خمس طبقات: الظهارة، غشاء بومان، السدى، غشاء ديسميه، البطانة.',
        en: 'Transparent avascular front window of the eye; provides about two thirds of its refractive power (about 43 D). Five layers: epithelium, Bowman layer, stroma, Descemet membrane and endothelium.'
      },
      shapes: [{ t: 'path', d: 'M200,135 C140,155 140,265 200,285 C155,265 155,155 200,135 Z', f: '#cfe9f2', o: 0.9, s: '#6fa3b8', sw: 2, hit: 6 }],
      anchor: [159, 185], label: [118, 120, 'e']
    },
    {
      id: 'choroid', z: 3,
      name: { ar: 'المشيمية', en: 'Choroid' }, short: { ar: 'المشيمية', en: 'Choroid' },
      desc: {
        ar: 'طبقة وعائية غنية بالصبغة بين الصلبة والشبكية، تغذّي الشبكية الخارجية (الظهارة الصباغية والمستقبِلات الضوئية). أعمق طبقاتها الشعيرات المشيمية.',
        en: 'Highly vascular pigmented layer between sclera and retina that nourishes the outer retina (RPE and photoreceptors). Its innermost layer is the choriocapillaris.'
      },
      shapes: [{ t: 'path', d: 'M214,143 A134,134 0 1 1 214,277', f: 'none', s: '#6e4332', sw: 8, hit: 12 }],
      anchor: [407, 100], label: [452, 36, 's']
    },
    {
      id: 'vitreous', z: 3,
      name: { ar: 'الجسم الزجاجي', en: 'Vitreous body' }, short: { ar: 'الزجاجي', en: 'Vitreous' },
      desc: {
        ar: 'هلام شفاف يشغل نحو 80% من حجم المقلة (≈4 مل)، أغلبه ماء مع الكولاجين وحمض الهيالورونيك. أشدّ التصاقاته عند قاعدة الزجاجي وحول القرص البصري وفي البقعة.',
        en: 'Transparent gel filling about 80% of the globe volume (about 4 mL): mostly water with collagen and hyaluronan. Strongest attachments are at the vitreous base, around the optic disc and at the macula.'
      },
      shapes: [{ t: 'path', d: 'M243,122 A123,123 0 1 1 243,298 L228,279 L235,269 A25,59 0 0 0 235,151 L228,141 Z', f: '#e6f3ea', s: '#a7c8b3', sw: 1 }],
      anchor: [365, 200], label: [560, 150, 's']
    },
    {
      id: 'retina', z: 4,
      name: { ar: 'الشبكية', en: 'Retina' }, short: { ar: 'الشبكية', en: 'Retina' },
      desc: {
        ar: 'النسيج العصبي الحسّي الذي يحوّل الضوء إلى إشارات عصبية؛ عشر طبقات (تسع عصبية حسّية + الظهارة الصباغية). تنتهي أماماً عند الحافة المسننة (ora serrata).',
        en: 'Neurosensory tissue that converts light into neural signals; ten layers (nine neurosensory plus the RPE). It ends anteriorly at the ora serrata.'
      },
      shapes: [{ t: 'path', d: 'M243,122 A126,126 0 1 1 243,298', f: 'none', s: '#f0a58f', sw: 8, hit: 12 }],
      anchor: [426, 129], label: [520, 90, 's']
    },
    {
      id: 'ciliary-body', z: 5,
      name: { ar: 'الجسم الهدبي', en: 'Ciliary body' }, short: { ar: 'الجسم الهدبي', en: 'Ciliary body' },
      desc: {
        ar: 'يفرز الخلط المائي (النتوءات الهدبية) ويتحكم بشكل العدسة أثناء التكيّف (العضلة الهدبية). يمتد من المهماز الصلب إلى الحافة المسننة.',
        en: 'Produces aqueous humour (ciliary processes) and changes lens shape for accommodation (ciliary muscle). It extends from the scleral spur to the ora serrata.'
      },
      shapes: [
        { t: 'path', d: 'M205,151 L222,124 L240,105 L243,122 L228,141 L215,160 Z', f: '#c98f6b', s: '#8b5a3c', sw: 1.2 },
        { t: 'path', d: `M205,${M(151)} L222,${M(124)} L240,${M(105)} L243,${M(122)} L228,${M(141)} L215,${M(160)} Z`, f: '#c98f6b', s: '#8b5a3c', sw: 1.2 }
      ],
      anchor: [226, 121], label: [215, 40, 'e']
    },
    {
      id: 'anterior-chamber', z: 6,
      name: { ar: 'الغرفة الأمامية', en: 'Anterior chamber' }, short: { ar: 'الغرفة الأمامية', en: 'Ant. chamber' },
      desc: {
        ar: 'حيّز مملوء بالخلط المائي بين بطانة القرنية والقزحية والحدقة، بعمق نحو 3 مم في المركز. يتصرّف الخلط المائي عبر الشبكة التربيقية في الزاوية.',
        en: 'Aqueous-filled space between the corneal endothelium and the iris/pupil, about 3 mm deep centrally. Aqueous leaves through the trabecular meshwork in the angle.'
      },
      shapes: [{ t: 'path', d: 'M200,285 C155,265 155,155 200,135 L203,146 L203,187 L210,196 L210,224 L203,233 L203,274 Z', f: '#dff0f8', s: 'none' }],
      anchor: [184, 212], label: [118, 212, 'e']
    },
    {
      id: 'iris', z: 7,
      name: { ar: 'القزحية', en: 'Iris' }, short: { ar: 'القزحية', en: 'Iris' },
      desc: {
        ar: 'حجاب ملوّن يتحكم بحجم الحدقة بعضلتين: المصرّة (بإمداد نظير ودي) والموسِّعة (بإمداد ودي).',
        en: 'Pigmented diaphragm that controls pupil size with two muscles: the sphincter (parasympathetic) and the dilator (sympathetic).'
      },
      shapes: [
        { t: 'path', d: 'M203,144 L219,148 L214,162 L212,187 L204,187 Z', f: '#6f8fa8', s: '#41607a', sw: 1.2 },
        { t: 'path', d: `M203,${M(144)} L219,${M(148)} L214,${M(162)} L212,${M(187)} L204,${M(187)} Z`, f: '#6f8fa8', s: '#41607a', sw: 1.2 }
      ],
      anchor: [208, 258], label: [118, 292, 'e']
    },
    {
      id: 'zonules', z: 8,
      name: { ar: 'الأربطة المعلِّقة', en: 'Zonular fibres' }, short: { ar: 'الأربطة المعلِّقة', en: 'Zonules' },
      desc: {
        ar: 'ألياف دقيقة تصل الجسم الهدبي بمحفظة العدسة؛ يؤدي انقباض العضلة الهدبية إلى ارتخائها فتزداد تحدّب العدسة (التكيّف).',
        en: 'Fine fibres that suspend the lens from the ciliary body; ciliary muscle contraction relaxes them so the lens becomes more convex (accommodation).'
      },
      shapes: [
        ln(224, 141, 219, 166), ln(232, 138, 235, 152), ln(240, 134, 249, 162),
        ln(224, M(141), 219, M(166)), ln(232, M(138), 235, M(152)), ln(240, M(134), 249, M(162))
      ],
      anchor: [233, M(146)], label: [118, 345, 'e']
    },
    {
      id: 'lens', z: 8,
      name: { ar: 'العدسة', en: 'Lens' }, short: { ar: 'العدسة', en: 'Lens' },
      desc: {
        ar: 'بنية شفافة محدّبة الوجهين (≈15–20 ديوبتر) معلّقة بالأربطة؛ محفظة وظهارة أمامية وقشرة ونواة. تستمر في النمو طوال العمر.',
        en: 'Transparent biconvex structure (about 15–20 D) held by the zonules: capsule, anterior epithelium, cortex and nucleus. It keeps growing throughout life.'
      },
      shapes: [{ t: 'ellipse', cx: 235, cy: 210, rx: 25, ry: 59, f: '#f6edc0', s: '#c5b25b', sw: 1.5 }],
      anchor: [242, 215], label: [300, 396, 'm']
    },
    {
      id: 'macula', z: 9,
      name: { ar: 'البقعة (والنقرة)', en: 'Macula (and fovea)' }, short: { ar: 'البقعة', en: 'Macula' },
      desc: {
        ar: 'الشبكية المركزية (قطرها ≈5.5 مم) بأعلى كثافة للمخاريط؛ مركزها النقرة (≈1.5 مم) المسؤولة عن الرؤية المركزية الحادة. تقع صدغي القرص البصري.',
        en: 'Central retina (about 5.5 mm across) with the highest cone density; its centre is the fovea (about 1.5 mm), responsible for sharp central vision. It lies temporal to the optic disc.'
      },
      shapes: [
        { t: 'ellipse', cx: 458, cy: 210, rx: 6, ry: 15, f: '#d8a420', o: 0.95, s: '#9a7410', sw: 1, hit: 6 },
        { t: 'circle', cx: 455, cy: 210, r: 3, f: '#7a4b00' }
      ],
      anchor: [458, 210], label: [560, 205, 's']
    },
    {
      id: 'optic-disc', z: 9,
      name: { ar: 'القرص البصري', en: 'Optic disc' }, short: { ar: 'القرص البصري', en: 'Optic disc' },
      desc: {
        ar: 'موضع خروج محاور الخلايا العقدية؛ خالٍ من المستقبِلات الضوئية (البقعة العمياء الفسيولوجية). قطره ≈1.5 مم ويقع أنفي النقرة بنحو 15 درجة.',
        en: 'Where ganglion cell axons leave the eye; it has no photoreceptors (the physiological blind spot). About 1.5 mm across, roughly 15° nasal to the fovea.'
      },
      shapes: [{ t: 'ellipse', cx: 448, cy: 253, rx: 5, ry: 11, tf: 'rotate(20 448 253)', f: '#f3d77e', s: '#c49a1c', sw: 1.2, hit: 6 }],
      anchor: [448, 253], label: [560, 262, 's']
    }
  ]
};
