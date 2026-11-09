// Plate 7 -- Lens (cross-section) and pupil/iris (front view). Schematic, not to scale.
// Original vector artwork drawn for this project; see docs/ATLAS.md. Content status: draft until a doctor approves it.
const R = (cx, cy, r, n, r0, r1, extra) => { // radial lines
  const out = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    out.push({ t: 'line', x1: Math.round((cx + r0 * Math.cos(a)) * 10) / 10, y1: Math.round((cy + r0 * Math.sin(a)) * 10) / 10, x2: Math.round((cx + r1 * Math.cos(a)) * 10) / 10, y2: Math.round((cy + r1 * Math.sin(a)) * 10) / 10, ...extra });
  }
  return out;
};
const ring = (cx, cy, ro, ri) => `M${cx},${cy - ro} A${ro},${ro} 0 1 0 ${cx},${cy + ro} A${ro},${ro} 0 1 0 ${cx},${cy - ro} Z M${cx},${cy - ri} A${ri},${ri} 0 1 1 ${cx},${cy + ri} A${ri},${ri} 0 1 1 ${cx},${cy - ri} Z`;
const LENS = 'M215,110 C183,112 152,168 152,232 C152,296 183,348 215,350 C252,350 282,296 282,232 C282,168 252,108 215,110 Z';
const IX = 560, IY = 230;
const zl = (x1, y1, x2, y2) => ({ t: 'line', x1, y1, x2, y2, s: '#8a8a8a', sw: 1.4, hit: 9 });

export default {
  id: 'lens-pupil',
  title: { ar: 'العدسة والحدقة', en: 'Lens and pupil' },
  subtitle: { ar: 'مقطع في العدسة ومنظر أمامي للقزحية والحدقة (تخطيطي)', en: 'Lens cross-section and front view of the iris and pupil (schematic)' },
  viewBox: [0, 0, 860, 460],
  status: 'draft',
  source: { type: 'original', author: 'Sakr Eye Clinic / I-App-lite', license: 'Original project artwork (all rights reserved by the clinic)' },
  references: ['AAO BCSC Section 11: Lens and Cataract', 'AAO BCSC Section 5: Neuro-Ophthalmology (pupil pathways)'],
  decor: [
    { t: 'polygon', points: '150,44 290,44 276,78 164,78', f: '#c98f6b', s: '#8b5a3c', sw: 1.2 },
    { t: 'polygon', points: '150,416 290,416 276,382 164,382', f: '#c98f6b', s: '#8b5a3c', sw: 1.2 },
    { t: 'text', x: 220, y: 34, text: { ar: 'الجسم الهدبي', en: 'Ciliary body' }, size: 11, anchor: 'middle', f: '#777' },
    // front view: sclera / cornea rim behind the iris
    { t: 'circle', cx: IX, cy: IY, r: 136, f: '#f1ece0', s: '#8d8570', sw: 2 },
    { t: 'circle', cx: IX, cy: IY, r: 108, f: '#e9f1f4', s: '#6fa3b8', sw: 1.5 },
    { t: 'text', x: IX, y: 40, text: { ar: 'منظر أمامي', en: 'Front view' }, size: 12, anchor: 'middle', f: '#555' }
  ],
  parts: [
    {
      id: 'cortex', z: 1,
      name: { ar: 'قشرة العدسة', en: 'Lens cortex' }, short: { ar: 'القشرة', en: 'Cortex' },
      desc: {
        ar: 'ألياف عدسية أحدث وألين تحيط بالنواة؛ تتولد باستمرار من خلايا خط الاستواء. أساس إعتام العدسة القشري (cortical cataract).',
        en: 'Younger, softer lens fibres surrounding the nucleus, continually generated from the equatorial cells. The site of cortical cataract.'
      },
      shapes: [{ t: 'path', d: LENS, f: '#f7efc9', s: '#c5b25b', sw: 1 }],
      anchor: [262, 160], label: [330, 130, 's']
    },
    {
      id: 'adult-nucleus', z: 2,
      name: { ar: 'النواة البالغة', en: 'Adult nucleus' }, short: { ar: 'النواة البالغة', en: 'Adult nucleus' },
      desc: {
        ar: 'طبقات تُضاف بعد البلوغ. تصلّب النواة يغيّر معامل الانكسار (انحراف قصر النظر) ويؤدي إلى إعتام نووي (nuclear sclerosis).',
        en: 'Layers added after puberty. Nuclear sclerosis changes the refractive index (a myopic shift) and leads to nuclear cataract.'
      },
      shapes: [{ t: 'ellipse', cx: 222, cy: 230, rx: 44, ry: 76, f: '#efd98a', s: '#c9a94a', sw: 1 }],
      anchor: [252, 190], label: [330, 180, 's']
    },
    {
      id: 'fetal-nucleus', z: 3,
      name: { ar: 'النواة الجنينية', en: 'Fetal nucleus' }, short: { ar: 'النواة الجنينية', en: 'Fetal nucleus' },
      desc: {
        ar: 'تتكوّن في الحياة الجنينية؛ تميّزها دروز على شكل Y (Y قائمة في الأمام و Y مقلوبة في الخلف) حيث تلتقي نهايات الألياف.',
        en: 'Formed during fetal life; marked by Y-shaped sutures (erect Y anteriorly, inverted Y posteriorly) where the fibre ends meet.'
      },
      shapes: [{ t: 'ellipse', cx: 222, cy: 230, rx: 29, ry: 52, f: '#e6c565', s: '#b8923a', sw: 1 }],
      overlay: [
        { t: 'path', d: 'M200,212 L207,230 M214,200 L207,230 M207,230 L207,246', f: 'none', s: '#9a7a22', sw: 1.2 }
      ],
      anchor: [236, 262], label: [330, 230, 's']
    },
    {
      id: 'embryonic-nucleus', z: 4,
      name: { ar: 'النواة الجنينية المبكرة (الجِنّية)', en: 'Embryonic nucleus' }, short: { ar: 'النواة الأولية', en: 'Embryonic nucleus' },
      desc: {
        ar: 'اللب المركزي الأقدم، يتكوّن في الأشهر الأولى من الحمل من الألياف الأولية لحويصلة العدسة. قد يقتصر عليه الإعتام الخلقي المركزي.',
        en: 'The oldest central core, formed in the first trimester from the primary fibres of the lens vesicle. Some congenital central cataracts are confined to it.'
      },
      shapes: [{ t: 'ellipse', cx: 222, cy: 230, rx: 9, ry: 15, f: '#d8a838', s: '#9a7418', sw: 1 }],
      anchor: [222, 230], label: [330, 280, 's']
    },
    {
      id: 'epithelium', z: 5,
      name: { ar: 'ظهارة العدسة الأمامية', en: 'Anterior lens epithelium' }, short: { ar: 'الظهارة الأمامية', en: 'Epithelium' },
      desc: {
        ar: 'طبقة واحدة من خلايا مكعبة على السطح الأمامي فقط. تتمايز خلايا خط الاستواء إلى ألياف جديدة طوال العمر، وتنشأ من بقاياها الظهارية إعتامات المحفظة الخلفية (PCO) بعد جراحة المياه البيضاء.',
        en: 'A single layer of cuboidal cells on the anterior surface only. Equatorial cells differentiate into new fibres throughout life; residual epithelial cells cause posterior capsule opacification (PCO) after cataract surgery.'
      },
      shapes: [{ t: 'path', d: 'M215,118 C190,120 162,172 162,232 C162,292 190,340 215,342', f: 'none', s: '#7d5a9c', sw: 5, hit: 12 }],
      anchor: [162, 290], label: [118, 330, 'e']
    },
    {
      id: 'capsule', z: 6,
      name: { ar: 'محفظة العدسة', en: 'Lens capsule' }, short: { ar: 'المحفظة', en: 'Capsule' },
      desc: {
        ar: 'غشاء قاعدي سميك (كولاجين النوع الرابع) تفرزه خلايا الظهارة؛ أسمك أمامياً وأرق ما يكون عند القطب الخلفي، ما يفسّر خطر تمزق المحفظة الخلفية أثناء جراحة المياه البيضاء.',
        en: 'Thick basement membrane (type IV collagen) secreted by the epithelium; thicker anteriorly and thinnest at the posterior pole, which explains the risk of posterior capsule rupture during cataract surgery.'
      },
      shapes: [{ t: 'path', d: LENS, f: 'none', s: '#b58b2a', sw: 3.5, hit: 12 }],
      anchor: [152, 200], label: [118, 170, 'e']
    },
    {
      id: 'zonules', z: 7,
      name: { ar: 'الأربطة المعلِّقة', en: 'Zonular fibres' }, short: { ar: 'الأربطة المعلِّقة', en: 'Zonules' },
      desc: {
        ar: 'ألياف دقيقة بين النتوءات الهدبية وخط استواء العدسة؛ انقباض العضلة الهدبية يرخيها فتزداد تحدّب العدسة (التكيّف).',
        en: 'Fine fibres between the ciliary processes and the lens equator; ciliary muscle contraction relaxes them so the lens becomes more curved (accommodation).'
      },
      shapes: [
        zl(172, 78, 188, 124), zl(218, 78, 216, 111), zl(262, 78, 246, 124),
        zl(172, 382, 188, 336), zl(218, 382, 216, 349), zl(262, 382, 246, 336)
      ],
      anchor: [262, 80], label: [330, 60, 's']
    },
    // ----- pupil and iris (front view) -----
    {
      id: 'iris-ciliary-zone', z: 1,
      name: { ar: 'المنطقة الهدبية للقزحية (الموسِّعة)', en: 'Iris ciliary zone (dilator)' }, short: { ar: 'المنطقة الهدبية', en: 'Ciliary zone' },
      desc: {
        ar: 'المنطقة الخارجية للقزحية: سدى غني بالصباغ (يحدد لون العين) وأخاديد انقباض. تتبعها العضلة الموسِّعة (ألياف شعاعية، إمداد ودي عبر الأعصاب الهدبية الطويلة، مستقبلات ألفا-1). متلازمة هورنر تعطي تضيقاً بسبب فقد الإمداد الودي.',
        en: 'The outer iris zone: pigment-rich stroma (determines eye colour) with contraction furrows. It contains the dilator muscle (radial fibres, sympathetic supply through the long ciliary nerves, alpha-1 receptors). Horner syndrome gives miosis because of the lost sympathetic supply.'
      },
      shapes: [{ t: 'path', d: ring(IX, IY, 100, 54), f: '#7a9db6', s: '#41607a', sw: 1.2, fr: 'evenodd' }],
      overlay: R(IX, IY, 0, 36, 58, 96, { s: '#a9c3d6', sw: 1 }),
      anchor: [IX + 72, IY - 48], label: [705, 120, 's']
    },
    {
      id: 'collarette', z: 2,
      name: { ar: 'الطوق (Collarette)', en: 'Collarette' }, short: { ar: 'الطوق', en: 'Collarette' },
      desc: {
        ar: 'أسمك جزء من القزحية وحلقة بارزة تبعد نحو 1.5 مم عن حافة الحدقة وتفصل المنطقة الحدقية عن الهدبية؛ بقية الغشاء الحدقي الجنيني (الدائرة الشريانية الصغرى).',
        en: 'The thickest part of the iris, a ridge about 1.5 mm from the pupil margin that separates the pupillary and ciliary zones; a remnant of the embryonic pupillary membrane (lesser arterial circle).'
      },
      shapes: [{ t: 'circle', cx: IX, cy: IY, r: 54, f: 'none', s: '#33506a', sw: 3, hit: 12 }],
      anchor: [IX + 38, IY - 38], label: [705, 170, 's']
    },
    {
      id: 'sphincter', z: 3,
      name: { ar: 'العضلة المصرّة', en: 'Sphincter pupillae' }, short: { ar: 'المصرّة', en: 'Sphincter' },
      desc: {
        ar: 'عضلة ملساء حلقية حول الحدقة، إمدادها نظير ودي (العصب الثالث ← العقدة الهدبية ← الأعصاب الهدبية القصيرة؛ مستقبلات مسكارينية). تقبضها يضيّق الحدقة؛ البيلوكاربين يقبضها والأتروبين يشلّها. تمزقها شائع في الرضح الكليل.',
        en: 'Circular smooth muscle around the pupil with parasympathetic supply (CN III, ciliary ganglion, short ciliary nerves; muscarinic receptors). It constricts the pupil; pilocarpine contracts it and atropine paralyses it. Sphincter tears are common after blunt trauma.'
      },
      shapes: [{ t: 'path', d: ring(IX, IY, 40, 24), f: '#4f7490', s: '#2c4a63', sw: 1.2, fr: 'evenodd' }],
      anchor: [IX - 32, IY + 6], label: [705, 220, 's']
    },
    {
      id: 'pupil', z: 4,
      name: { ar: 'الحدقة', en: 'Pupil' }, short: { ar: 'الحدقة', en: 'Pupil' },
      desc: {
        ar: 'فتحة القزحية المركزية. يحدد قطرها توازن المصرّة (نظيرة ودية) والموسِّعة (ودية)؛ منعكس الضوء: العصب البصري ← النواة قبل السقيفية ← نواة إدنجر-وستفال ← العصب الثالث. العيب الحدقي الوارد النسبي (RAPD) علامة لاضطراب في المسار الوارد.',
        en: 'The central aperture of the iris. Its size results from the balance of the sphincter (parasympathetic) and dilator (sympathetic); light reflex: optic nerve → pretectal nucleus → Edinger-Westphal nucleus → CN III. A relative afferent pupillary defect (RAPD) signals a disorder of the afferent pathway.'
      },
      shapes: [{ t: 'circle', cx: IX, cy: IY, r: 24, f: '#0f1a24', s: '#3a2a1a', sw: 2, hit: 6 }],
      anchor: [IX, IY], label: [705, 270, 's']
    }
  ]
};
