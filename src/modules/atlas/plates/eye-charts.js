// Eye charts for diagnosis and follow-up, one sheet per eye (OD = right, OS = left):
//   1. Fundus chart   - clock-hour meridians, posterior pole / mid-periphery / far periphery, ora serrata, disc, macula, arcades
//   2. Macula chart   - ETDRS grid (1, 3 and 6 mm), quadrants, disc and arcades
//   3. Anterior chart - front view with the hyphema grade guide (1/3, 1/2, 3/4, total) for the blood / pus level tool
// Original vector artwork drawn for this project (the reference pictures were used only as a guide for content and
// conventions; no third-party artwork is reproduced). The left-eye sheets are the right-eye sheets mirrored, with the
// text re-placed so it is never reversed. Every sheet shows the eye (OD / OS) and which side is nasal / temporal.
// Content status: draft until the doctor approves it (see docs/ATLAS.md).
const bi = (ar, en) => ({ ar, en });
const n1 = v => Math.round(v * 10) / 10;
const SOURCE = { type: 'original', author: 'Sakr Eye Clinic / I-App-lite', license: 'Original project artwork (all rights reserved by the clinic)' };
const TXT = '#334155';
const ROMAN = ['XII', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI'];

// a point at `deg` degrees clockwise from 12 o'clock
const polar = (cx, cy, r, deg) => { const a = deg * Math.PI / 180; return [n1(cx + r * Math.sin(a)), n1(cy - r * Math.cos(a))]; };

// the ora serrata: a ring of small bumps
function scallop(cx, cy, r, n, amp) {
  let d = `M${polar(cx, cy, r, 0).join(',')}`;
  for (let i = 0; i < n; i++) {
    const c = polar(cx, cy, r + amp, (360 / n) * (i + 0.5));
    const p = polar(cx, cy, r, (360 / n) * (i + 1));
    d += ` Q${c.join(',')} ${p.join(',')}`;
  }
  return `${d} Z`;
}

// cubic path from a start point and curve segments; `dx, dy` shift the whole path (used to draw the vein beside the artery)
const curve = (start, ...segs) => ({ start, segs });
const pathOf = (p, dx = 0, dy = 0) => `M${n1(p.start[0] + dx)},${n1(p.start[1] + dy)} ` + p.segs.map(s => 'C' + s.map((v, i) => n1(v + (i % 2 === 0 ? dx : dy))).join(',')).join(' ');

// Everything is drawn once for the right eye; the left eye mirrors the geometry and re-places the text.
function kit(eye, W) {
  const od = eye === 'OD';
  const X = x => (od ? x : W - x);
  const mirror = sh => (od || sh.t === 'text' ? sh : { ...sh, tf: `translate(${W},0) scale(-1,1)` });
  const flip = s => (od ? s : s === 's' ? 'e' : s === 'e' ? 's' : s);
  const anchorOf = a => (od ? a : a === 'start' ? 'end' : a === 'end' ? 'start' : a);
  const txt = (x, y, text, size, f = TXT, anchor = 'middle') => ({ t: 'text', x: X(x), y, text, size, f, anchor: anchorOf(anchor) });
  // Clock-hour numerals are NOT mirrored: the face is fixed on the sheet (12 up, 3 right) for both eyes, as meridians are recorded,
  // so 3 o'clock is nasal in the right eye and temporal in the left eye.
  const clock = (x, y, text, size, f = TXT) => ({ t: 'text', x, y, text, size, f, anchor: 'middle' });
  const neutral = s => bi(s, s); // numerals and symbols read the same in both languages
  const part = (id, name, short, desc, shapes, anchor, label, z = 0, overlay = null) => {
    const p = { id, name, short, desc, z, shapes: shapes.map(mirror), anchor: [X(anchor[0]), anchor[1]], label: [X(label[0]), label[1], flip(label[2])] };
    if (overlay) p.overlay = overlay.map(mirror);
    return p;
  };
  return { od, X, mirror, txt, clock, neutral, part };
}

const eyeTitle = (eye, ar, en) => ({ ar: `${ar} — ${eye === 'OD' ? 'العين اليمنى (OD)' : 'العين اليسرى (OS)'}`, en: `${en} — ${eye === 'OD' ? 'right eye (OD)' : 'left eye (OS)'}` });
const badge = (k, eye, x, y) => k.txt(x, y, eye === 'OD' ? bi('العين اليمنى · OD', 'Right eye · OD') : bi('العين اليسرى · OS', 'Left eye · OS'), 44, '#1f2937');
const sideTags = (k, xNasal, xTemporal, y) => [k.txt(xNasal, y, bi('أنفي', 'Nasal'), 28, '#64748b'), k.txt(xTemporal, y, bi('صدغي', 'Temporal'), 28, '#64748b')];

// A zone is a translucent tint plus a crisp outline: one shape cannot have a faint fill and a solid edge (opacity covers both).
const zone = (cx, cy, r, tint, tintO, edge) => [{ t: 'circle', cx, cy, r, f: tint, o: tintO }, { t: 'circle', cx, cy, r, f: 'none', ...edge }];

// Retinal colour convention, shown under the chart (the same colours the lesion symbols use).
const RETINA_LEGEND = [
  { c: '#c62828', ar: 'أحمر: شبكية ملتصقة، شرايين، نزف، تمزقات (بحدود زرقاء)', en: 'Red: attached retina, arteries, haemorrhage, breaks (with a blue outline)' },
  { c: '#1d4ed8', ar: 'أزرق: انفصال الشبكية والسائل تحتها، أوردة، تنكّس Lattice، حدود التمزق', en: 'Blue: detached retina and subretinal fluid, veins, lattice, outline of breaks' },
  { c: '#15803d', ar: 'أخضر: عتامات زجاجية أو أمام الشبكية (نزف زجاجي، أغشية)', en: 'Green: vitreous or pre-retinal opacities (vitreous haemorrhage, membranes)' },
  { c: '#e0a800', ar: 'أصفر: إفرازات، دروزن، غشاء وعائي مشيمي (CNV)، ندبات', en: 'Yellow: exudates, drusen, choroidal neovascular membrane (CNV), scars' },
  { c: '#78350f', ar: 'بني: المشيمية (وحمة، ورم، انفصال مشيمي)', en: 'Brown: choroid (naevus, tumour, choroidal detachment)' },
  { c: '#111827', ar: 'أسود: صبغ ظهارة الشبكية (RPE) وفرط التصبغ', en: 'Black: RPE pigment and hyperplasia' }
];

const REFS_RETINA = [
  'Standard retinal charting conventions: clock-hour meridians and the red / blue / green / yellow / brown / black colour code',
  'Reference pictures supplied by the clinic owner were used as a guide for content only; no third-party artwork is reproduced',
  'Content not yet reviewed by the clinic doctor'
];

const DISC_AR = 'نقطة خروج ألياف العصب البصري ودخول الأوعية المركزية، وتقع أنفياً من النقرة. سجّل هنا نسبة الكأس إلى القرص (C/D) ولون الحافة والوذمة أو الشحوب والأوعية الجديدة على القرص (NVD).';
const DISC_EN = 'Where the optic nerve fibres leave and the central vessels enter; nasal to the fovea. Record the cup/disc ratio, rim colour, oedema or pallor, and new vessels on the disc (NVD).';
const ARC_AR = 'الشرايين (أحمر) والأوردة (أزرق) تتفرع من القرص إلى الأعلى والأسفل حول البقعة، والأوردة أعرض من الشرايين. سجّل النزوف وتغيّر القطر والالتفاف والأوعية الجديدة (NVE) على امتدادها.';
const ARC_EN = 'Arteries (red) and veins (blue) branch from the disc upwards and downwards around the macula; veins are wider than arteries. Record haemorrhages, calibre change, tortuosity and new vessels elsewhere (NVE) along them.';

// ---------------------------------------------------------------------------------------------------------------
// 1. Fundus chart
// ---------------------------------------------------------------------------------------------------------------
const FW = 1300, FH = 1080, CX = 650, CY = 520;

function fundusChart(eye) {
  const k = kit(eye, FW);
  const disc = [CX + 92, CY - 12];
  const stA = curve([736, 494], [736, 440, 700, 398, 648, 398], [596, 398, 548, 430, 520, 468], [492, 506, 440, 500, 396, 460]);
  const itA = curve([736, 524], [738, 590, 702, 640, 648, 642], [594, 644, 546, 610, 518, 574], [490, 538, 440, 540, 396, 580]);
  const snA = curve([760, 492], [810, 470, 880, 440, 960, 420]);
  const inA = curve([760, 524], [812, 548, 884, 584, 964, 612]);
  const arcs = [stA, itA, snA, inA];

  const numerals = ROMAN.map((rn, h) => { const [x, y] = polar(CX, CY, 462, h * 30); return k.clock(x, y + 13, k.neutral(rn), 38); });
  const decor = [
    { t: 'circle', cx: CX, cy: CY, r: 440, f: '#f1ebe1', s: '#d6ccbb', sw: 1.5 },
    { t: 'path', d: scallop(CX, CY, 400, 48, 22), f: '#fdf0e8', s: '#b89484', sw: 1.5 },
    ...numerals,
    ...sideTags(k, 1150, 150, 590),
    badge(k, eye, CX, 1052)
  ].map(k.mirror);

  const meridians = Array.from({ length: 12 }, (_, h) => {
    const [x1, y1] = polar(CX, CY, 140, h * 30); const [x2, y2] = polar(CX, CY, 400, h * 30);
    return { t: 'line', x1, y1, x2, y2, s: '#cdb6a8', sw: 1.2, hit: 12 };
  });
  const vortex = [45, 135, 225, 315].flatMap(a => {
    const c = polar(CX, CY, 262, a);
    return [
      { t: 'circle', cx: c[0], cy: c[1], r: 8, f: '#2563eb', o: 0.55 },
      ...[-7, 0, 7].map(d => { const e = polar(CX, CY, 292, a + d); return { t: 'line', x1: c[0], y1: c[1], x2: e[0], y2: e[1], s: '#2563eb', sw: 2.2, o: 0.6 }; })
    ];
  });
  const zoneEdge = { s: '#b45309', sw: 1.6, dash: '7 5' };
  const dp = polar(CX, CY, 360, 120); const mp = polar(CX, CY, 270, 60); const op = polar(CX, CY, 400, 160); const vp = polar(CX, CY, 262, 135); const pp = polar(CX, CY, 140, 0);

  const parts = [
    k.part('far-periphery', bi('المحيط البعيد', 'Far periphery'), bi('المحيط البعيد', 'Far periphery'),
      bi('المنطقة بين خط الاستواء والحافة المسننة. تُرى هنا تغيّرات المحيط مثل تنكّس Lattice والتمزقات والثقوب؛ افحصها بالتنظير غير المباشر مع الضغط على الصلبة.',
        'The zone between the equator and the ora serrata, where peripheral changes such as lattice degeneration, tears and holes are found; examine it with indirect ophthalmoscopy and scleral indentation.'),
      [{ t: 'circle', cx: CX, cy: CY, r: 400, f: '#f7c9b6', o: 0.08 }], dp, [1150, 880, 's'], 0),
    k.part('mid-periphery', bi('منتصف المحيط', 'Mid-periphery'), bi('منتصف المحيط', 'Mid-periphery'),
      bi('المنطقة بين القطب الخلفي وخط الاستواء وتُفحص بالتنظير غير المباشر. سجّل الآفة بساعة الوجه (I–XII) وبعدها عن خط الاستواء.',
        'The zone between the posterior pole and the equator, examined with indirect ophthalmoscopy. Record a lesion by clock hour (I–XII) and its distance from the equator.'),
      zone(CX, CY, 270, '#f7c9b6', 0.16, zoneEdge), mp, [1100, 190, 's'], 1),
    k.part('posterior-pole', bi('القطب الخلفي', 'Posterior pole'), bi('القطب الخلفي', 'Posterior pole'),
      bi('المنطقة داخل الدائرة الداخلية وتضم القرص والبقعة. يُوصف موضع الآفة فيها بعدد أقطار القرص (DD) من النقرة أو من حافة القرص.',
        'The area inside the inner circle, containing the disc and macula. Describe a lesion here by its distance in disc diameters (DD) from the fovea or from the disc edge.'),
      zone(CX, CY, 140, '#f7c9b6', 0.3, zoneEdge), pp, [1000, 80, 's'], 2),
    k.part('meridians', bi('ساعة الوجه (المحاور الشعاعية)', 'Clock-hour meridians'), bi('ساعة الوجه', 'Clock hours'),
      bi('يُحدَّد موضع الآفة بالمحور الشعاعي من XII (أعلى) إلى XI، ثم ببعدها عن خط الاستواء. الأرقام ثابتة على الورقة للعينين: III يمين الورقة و IX يسارها، فهو أنفي في العين اليمنى وصدغي في اليسرى.',
        'Locate a lesion by its radial meridian from XII (top) to XI, then by its distance from the equator. The numerals are fixed on the sheet for both eyes: III is on the right and IX on the left, so III is nasal in the right eye and temporal in the left.'),
      meridians, polar(CX, CY, 330, 330), [330, 70, 'e'], 3),
    k.part('vortex-veins', bi('الأوردة الدوّامية', 'Vortex veins'), bi('الأوردة الدوّامية', 'Vortex veins'),
      bi('تصرّف الدم من المشيمية، وعددها أربعة عادةً (واحد في كل ربع) قرب خط الاستواء عند الساعات المائلة ١:٣٠ و ٤:٣٠ و ٧:٣٠ و ١٠:٣٠. معلم مفيد لتحديد الموضع.',
        'They drain the choroid; usually four, one per quadrant, near the equator at the oblique meridians (1:30, 4:30, 7:30 and 10:30). A useful landmark for localising lesions.'),
      vortex, vp, [1100, 800, 's'], 4),
    k.part('vascular-arcades', bi('القوسان الوعائيان', 'Vascular arcades'), bi('القوسان الوعائيان', 'Vascular arcades'), bi(ARC_AR, ARC_EN),
      [...arcs.map(p => ({ t: 'path', d: pathOf(p, 5, 6), f: 'none', s: '#1d4ed8', sw: 6.5, o: 0.85 })), ...arcs.map(p => ({ t: 'path', d: pathOf(p), f: 'none', s: '#c62828', sw: 3.8, hit: 16 }))],
      [560, 410], [330, 160, 'e'], 5),
    k.part('macula', bi('البقعة والنقرة', 'Macula and fovea'), bi('البقعة والنقرة', 'Macula and fovea'),
      bi('مركز الإبصار الحاد، وتقع صدغياً من القرص في مركز القطب الخلفي. سجّل هنا الوذمة والدروزن والأغشية والثقوب والغشاء الوعائي المشيمي (CNV).',
        'The centre of sharp vision, temporal to the disc at the centre of the posterior pole. Record oedema, drusen, membranes, holes and choroidal neovascularisation (CNV) here.'),
      [{ t: 'circle', cx: CX, cy: CY, r: 46, f: '#f6d9a8', o: 0.4, s: '#a16207', sw: 1.8, dash: '5 4' }, { t: 'circle', cx: CX, cy: CY, r: 8, f: '#b45309', o: 0.65 }],
      [CX, CY], [190, 640, 'e'], 6),
    k.part('optic-disc', bi('القرص البصري', 'Optic disc'), bi('القرص البصري', 'Optic disc'), bi(DISC_AR, DISC_EN),
      [{ t: 'circle', cx: disc[0], cy: disc[1], r: 27, f: '#f7c9a0', s: '#c2410c', sw: 2 }, { t: 'circle', cx: disc[0], cy: disc[1], r: 11, f: '#fff7ed' }],
      disc, [1150, 470, 's'], 7),
    k.part('ora-serrata', bi('الحافة المسننة (Ora serrata)', 'Ora serrata'), bi('الحافة المسننة', 'Ora serrata'),
      bi('الحد الأمامي للشبكية العصبية الحسية، ويليه الجزء المسطح من الجسم الهدبي (pars plana). سجّل هنا تمزقات الحافة (ora dialysis) والانفصال الذي يصل إليها.',
        'The anterior limit of the neurosensory retina, followed by the pars plana of the ciliary body. Record dialyses at the ora and any detachment that reaches it.'),
      [{ t: 'path', d: scallop(CX, CY, 400, 48, 22), f: 'none', s: '#8b5a4a', sw: 3, hit: 18 }], op, [1000, 1000, 's'], 8)
  ];

  return {
    id: `fundus-chart-${eye.toLowerCase()}`, chart: 'fundus', eye,
    title: eyeTitle(eye, 'خريطة قاع العين', 'Fundus chart'),
    subtitle: bi('ساعة الوجه والمناطق والحافة المسننة؛ ارسم الآفات بالرموز والقلم وأضف الملاحظات', 'Clock hours, zones and ora serrata; mark lesions with symbols, pen and notes'),
    viewBox: [0, 0, FW, FH], status: 'draft', source: SOURCE, references: REFS_RETINA, legend: RETINA_LEGEND, decor, parts
  };
}

// ---------------------------------------------------------------------------------------------------------------
// 2. Macula chart (ETDRS grid: circles of 1, 3 and 6 mm across, 80 plate units per mm)
// ---------------------------------------------------------------------------------------------------------------
const MW = 1100, MH = 900, FX = 400, FY = 430, MM = 80;

function maculaChart(eye) {
  const k = kit(eye, MW);
  const disc = [FX + 360, FY - 65];
  const stA = curve([764, 340], [748, 230, 640, 150, 520, 150], [400, 150, 300, 200, 190, 280], [140, 316, 100, 320, 60, 300]);
  const itA = curve([764, 392], [750, 520, 650, 700, 520, 712], [400, 722, 300, 660, 190, 580], [140, 544, 100, 540, 60, 560]);
  const snA = curve([830, 350], [900, 320, 960, 290, 1040, 270]);
  const inA = curve([830, 385], [910, 420, 970, 450, 1040, 480]);
  const arcs = [stA, itA, snA, inA];
  const ring = { s: '#475569', sw: 2.6 };
  const diag = [45, 135, 225, 315].map(a => { const [x1, y1] = polar(FX, FY, 0.5 * MM, a); const [x2, y2] = polar(FX, FY, 3 * MM, a); return { t: 'line', x1, y1, x2, y2, s: '#475569', sw: 2, hit: 12 }; });

  const decor = [
    { t: 'rect', x: 20, y: 20, width: 1060, height: 780, rx: 40, f: '#fdf1ea', s: '#e1cfc3', sw: 1.5 },
    k.txt(40, 62, bi('شبكة ETDRS: 1 · 3 · 6 مم', 'ETDRS grid: 1 · 3 · 6 mm'), 26, '#64748b', 'start'),
    ...sideTags(k, 940, 150, 770),
    badge(k, eye, MW / 2, 862)
  ].map(k.mirror);

  // the S / I / N / T letters sit above the tinted rings (a part's overlay is drawn after the part, never under a ring)
  const quadrantLetters = [
    k.txt(FX, FY - 70, bi('علوي', 'S'), 26, '#475569'), k.txt(FX, FY + 88, bi('سفلي', 'I'), 26, '#475569'),
    k.txt(FX + 82, FY + 9, bi('أنفي', 'N'), 26, '#475569'), k.txt(FX - 82, FY + 9, bi('صدغي', 'T'), 26, '#475569')
  ];
  const parts = [
    k.part('outer-ring', bi('الحلقة الخارجية (6 مم)', 'Outer ring (6 mm)'), bi('الحلقة الخارجية', 'Outer ring'),
      bi('الحلقة بين قطر 3 و 6 مم، مقسومة إلى أربعة أرباع: علوي وسفلي وأنفي وصدغي. تُسجَّل فيها الوذمة والإفرازات والنزوف بحسب الربع.',
        'The ring between 3 and 6 mm across, divided into four quadrants: superior, inferior, nasal and temporal. Record oedema, exudates and haemorrhages by quadrant.'),
      zone(FX, FY, 3 * MM, '#f2b9a5', 0.16, ring), polar(FX, FY, 200, 135), [60, 740, 's'], 2),
    k.part('inner-ring', bi('الحلقة الداخلية (3 مم)', 'Inner ring (3 mm)'), bi('الحلقة الداخلية', 'Inner ring'),
      bi('الحلقة بين قطر 1 و 3 مم، مقسومة إلى أربعة أرباع: علوي وسفلي وأنفي وصدغي. تُسجَّل فيها الوذمة والإفرازات والنزوف بحسب الربع.',
        'The ring between 1 and 3 mm across, divided into four quadrants: superior, inferior, nasal and temporal. Record oedema, exudates and haemorrhages by quadrant.'),
      zone(FX, FY, 1.5 * MM, '#f2b9a5', 0.28, ring), polar(FX, FY, 100, 225), [60, 700, 's'], 3),
    k.part('quadrant-lines', bi('خطوط الأرباع', 'Quadrant lines'), bi('خطوط الأرباع', 'Quadrant lines'),
      bi('خطان قطريان يقسمان الحلقتين إلى أرباع علوية وسفلية وأنفية وصدغية. الربع الأنفي هو دائماً جهة القرص البصري، في العين اليمنى واليسرى.',
        'Two diagonal lines split the rings into superior, inferior, nasal and temporal quadrants. The nasal quadrant is always on the side of the optic disc, in both eyes.'),
      diag, polar(FX, FY, 200, 45), [60, 660, 's'], 4),
    k.part('central-subfield', bi('المجال المركزي (1 مم)', 'Central subfield (1 mm)'), bi('المجال المركزي', 'Central subfield'),
      bi('الدائرة المركزية بقطر 1 مم حول النقرة، ويُقاس فيها سُمك الشبكية المركزي بالـ OCT. وجود الوذمة فيها يعني أنها وذمة مركزية (centre-involving).',
        'The central circle, 1 mm across, around the fovea; OCT central thickness is measured here. Oedema inside it is centre-involving.'),
      zone(FX, FY, 0.5 * MM, '#f6d9a8', 0.5, ring), [FX, FY], [60, 620, 's'], 5,
      [{ t: 'circle', cx: FX, cy: FY, r: 5, f: '#b45309', o: 0.7 }, ...quadrantLetters]),
    k.part('vascular-arcades', bi('القوسان الوعائيان', 'Vascular arcades'), bi('القوسان الوعائيان', 'Vascular arcades'), bi(ARC_AR, ARC_EN),
      [...arcs.map(p => ({ t: 'path', d: pathOf(p, 5, 6), f: 'none', s: '#1d4ed8', sw: 6.5, o: 0.85 })), ...arcs.map(p => ({ t: 'path', d: pathOf(p), f: 'none', s: '#c62828', sw: 3.8, hit: 16 }))],
      [520, 154], [330, 100, 'e'], 6),
    k.part('optic-disc', bi('القرص البصري', 'Optic disc'), bi('القرص البصري', 'Optic disc'), bi(DISC_AR, DISC_EN),
      [{ t: 'circle', cx: disc[0], cy: disc[1], r: 72, f: '#f7c9a0', s: '#c2410c', sw: 2.4 }, { t: 'circle', cx: disc[0], cy: disc[1], r: 28, f: '#fff7ed' }],
      disc, [1040, 150, 'e'], 7)
  ];

  return {
    id: `macula-chart-${eye.toLowerCase()}`, chart: 'macula', eye,
    title: eyeTitle(eye, 'خريطة البقعة (ETDRS)', 'Macula chart (ETDRS)'),
    subtitle: bi('شبكة ETDRS بأقطار 1 و 3 و 6 مم؛ لمتابعة الوذمة والدروزن والـ CNV والإفرازات', 'ETDRS grid at 1, 3 and 6 mm, for following oedema, drusen, CNV and exudates'),
    viewBox: [0, 0, MW, MH], status: 'draft', source: SOURCE, references: REFS_RETINA, legend: RETINA_LEGEND, decor, parts
  };
}

// ---------------------------------------------------------------------------------------------------------------
// 3. Anterior segment chart with the hyphema grade guide
// ---------------------------------------------------------------------------------------------------------------
const AW = 1000, AH = 1100;
export const AC_CIRCLE = Object.freeze({ cx: 500, cy: 500, r: 300 }); // the anterior chamber as seen from the front; the level tool draws inside it

function anteriorChart(eye) {
  const k = kit(eye, AW);
  const { cx, cy, r } = AC_CIRCLE;
  const guideY = f => cy + r - 2 * r * f;
  const half = y => Math.sqrt(Math.max(0, r * r - (y - cy) * (y - cy)));
  const guide = f => { const y = n1(guideY(f)); const d = n1(half(y)); return { t: 'line', x1: cx - d, y1: y, x2: cx + d, y2: y, s: '#475569', sw: 2.4, dash: '9 6', o: 0.9, hit: 18 }; };
  const label = (f, text) => { const y = guideY(f); return k.txt(cx - half(y) + 14, y - 8, k.neutral(text), 26, '#334155', 'start'); };
  const almond = 'M60,500 C200,200 370,150 500,150 C630,150 800,200 940,500 C800,800 630,850 500,850 C370,850 200,800 60,500 Z';
  const numerals = Array.from({ length: 12 }, (_, h) => { const [x, y] = polar(cx, cy, 376, h * 30); return k.clock(x, y + 9, k.neutral(String(h === 0 ? 12 : h)), 26, '#94a3b8'); });

  const decor = [
    { t: 'path', d: almond, f: '#fffdfa', s: '#cbb8a3', sw: 2.5 },
    { t: 'ellipse', cx: 914, cy: 520, rx: 20, ry: 17, f: '#efa79d', s: '#c9776d', sw: 1.5 }, // the caruncle marks the nasal side
    ...numerals,
    ...sideTags(k, 860, 140, 930),
    badge(k, eye, AW / 2, 1060)
  ].map(k.mirror);

  const spokes = Array.from({ length: 36 }, (_, i) => { const [x1, y1] = polar(cx, cy, 78, i * 10); const [x2, y2] = polar(cx, cy, 284, i * 10); return { t: 'line', x1, y1, x2, y2, s: '#b59f80', sw: 1.2, o: 0.6 }; });
  const parts = [
    k.part('sclera', bi('الملتحمة والصلبة', 'Conjunctiva and sclera'), bi('الملتحمة والصلبة', 'Conjunctiva and sclera'),
      bi('سجّل الاحتقان (ملتحمي أو هدبي عميق) والنزف تحت الملتحمة والأجسام الغريبة وأي آفة بساعة الوجه. الجهة الأنفية هي جهة الزاوية الداخلية (الكاروندكل) على الورقة.',
        'Record injection (conjunctival or ciliary), subconjunctival haemorrhage, foreign bodies and any lesion by clock hour. The nasal side is the side of the inner canthus (caruncle) on the sheet.'),
      [{ t: 'path', d: almond, f: '#ffffff', o: 0.01 }], [150, 560], [30, 660, 's'], 0),
    k.part('iris', bi('القزحية', 'Iris'), bi('القزحية', 'Iris'),
      bi('سجّل لون القزحية والالتصاقات الخلفية والضمور والتصبغ والأوعية الجديدة (rubeosis) وأي ثقب أو عيب في النفاذية الضوئية.',
        'Record iris colour, posterior synechiae, atrophy, pigmentation, new vessels (rubeosis) and any hole or transillumination defect.'),
      [{ t: 'circle', cx, cy, r: 292, f: '#cdb89a', s: '#8b7355', sw: 2 }], [380, 400], [30, 150, 's'], 1,
      [...spokes, { t: 'circle', cx, cy, r: 140, f: 'none', s: '#a38b6b', sw: 1.4, dash: '5 4' }]),
    k.part('pupil', bi('الحدقة', 'Pupil'), bi('الحدقة', 'Pupil'),
      bi('سجّل الحجم والشكل (مستديرة أو غير منتظمة) والاستجابة للضوء ووجود عيب حدقي وارد نسبي (RAPD).',
        'Record size, shape (round or irregular), light reaction and any relative afferent pupillary defect (RAPD).'),
      [{ t: 'circle', cx, cy, r: 72, f: '#0f172a' }], [cx, cy], [870, 150, 'e'], 2),
    k.part('cornea', bi('القرنية', 'Cornea'), bi('القرنية', 'Cornea'),
      bi('الحلقة هي الحافة الصلبية القرنية (limbus). سجّل العتامات والارتشاحات والقرحات والندبات والأوعية الجديدة، وحدّد الموضع بساعة الوجه والقطر بالمليمتر.',
        'The ring marks the limbus. Record opacities, infiltrates, ulcers, scars and new vessels, giving the position by clock hour and the size in millimetres.'),
      [{ t: 'circle', cx, cy, r: 306, f: 'none', s: '#6c9bbd', sw: 5, hit: 22 }], polar(cx, cy, 306, 300), [30, 250, 's'], 3),
    k.part('hyphema-i', bi('خط الثلث (الدرجة I)', 'One-third line (grade I)'), bi('الدرجة I', 'Grade I'),
      bi('الدرجة I: مستوى الدم أقل من ثلث الحجرة الأمامية. حالة خفيفة وتتحسن غالباً تلقائياً. الـ Microhyphema أخف منها: خلايا دم حمراء معلقة لا تُرى إلا بالمصباح الشقي ودون مستوى دم.',
        'Grade I: blood level below one third of the anterior chamber; mild, and often resolves on its own. Microhyphema is milder still: red cells suspended in the aqueous, seen only at the slit lamp, with no blood level.'),
      [guide(1 / 3)], [700, guideY(1 / 3)], [900, 660, 'e'], 4, [label(1 / 3, '⅓ · I')]),
    k.part('hyphema-ii', bi('خط النصف (الدرجة II)', 'One-half line (grade II)'), bi('الدرجة II', 'Grade II'),
      bi('الدرجة II: مستوى الدم بين ثلث الحجرة الأمامية ونصفها. حالة متوسطة وتحتاج متابعة أدق.',
        'Grade II: blood level between one third and one half of the anterior chamber; moderate, and needs closer monitoring.'),
      [guide(0.5)], [740, guideY(0.5)], [960, 540, 'e'], 4, [label(0.5, '½ · II')]),
    k.part('hyphema-iii', bi('خط ثلاثة الأرباع (الدرجة III)', 'Three-quarter line (grade III)'), bi('الدرجة III', 'Grade III'),
      bi('الدرجة III: الدم يشغل أكثر من نصف الحجرة الأمامية دون أن يملأها كلياً. حالة شديدة وخطر المضاعفات فيها أعلى.',
        'Grade III: blood fills more than half of the anterior chamber but not all of it; significant, with a higher risk of complications.'),
      [guide(0.75)], [720, guideY(0.75)], [940, 300, 'e'], 4, [label(0.75, '¾ · III')]),
    k.part('hyphema-iv', bi('أعلى الحجرة (الدرجة IV)', 'Top of the chamber (grade IV)'), bi('الدرجة IV', 'Grade IV'),
      bi('الدرجة IV: الدم يملأ الحجرة الأمامية كلياً، ويسمى eight-ball hyphema حين يكون الدم داكناً بين الأحمر والأسود. خطر مرتفع لإعادة النزف والمضاعفات وتحتاج اهتماماً عاجلاً.',
        'Grade IV: blood fills the whole anterior chamber; called an eight-ball hyphema when the blood is dark red to black. High risk of rebleeding and complications; needs urgent attention.'),
      [{ t: 'line', x1: cx - 60, y1: cy - r, x2: cx + 60, y2: cy - r, s: '#475569', sw: 2.4, dash: '9 6', o: 0.9, hit: 18 }], [cx + 30, cy - r], [900, 190, 'e'], 4, [k.txt(cx + 72, 200 + 40, k.neutral('IV'), 26, '#334155', 'start')])
  ];

  const LEGEND = [
    { c: '#b91c1c', ar: 'أحمر: دم (Hyphema)، يُضاف بأداة «مستوى الدم/القيح» وتُحسب الدرجة تلقائياً', en: 'Red: blood (hyphema), added with the level tool; the grade is worked out automatically' },
    { c: '#d6b656', ar: 'أصفر شاحب: قيح (Hypopyon)', en: 'Pale yellow: pus (hypopyon)' },
    { c: '#475569', ar: 'خطوط التدرج: ⅓ (I) · ½ (II) · ¾ (III) · أعلى الحجرة (IV كاملة)', en: 'Guide lines: 1/3 (I) · 1/2 (II) · 3/4 (III) · top of the chamber (IV, total)' }
  ];
  const REFS = [
    'Hyphema grading by the fraction of the anterior chamber filled: microhyphema, grades I to IV (eight-ball)',
    'Reference pictures supplied by the clinic owner were used as a guide for content only; no third-party artwork is reproduced',
    'Content not yet reviewed by the clinic doctor'
  ];

  return {
    id: `anterior-chart-${eye.toLowerCase()}`, chart: 'anterior', eye,
    title: eyeTitle(eye, 'خريطة الجزء الأمامي', 'Anterior segment chart'),
    subtitle: bi('منظر أمامي بالمصباح الشقي مع تدرج الـ Hyphema؛ سجّل القرنية والقزحية والحدقة والدم أو القيح', 'Front view at the slit lamp with the hyphema grade guide; record the cornea, iris, pupil and any blood or pus'),
    viewBox: [0, 0, AW, AH], status: 'draft', source: SOURCE, references: REFS, legend: LEGEND, ac: AC_CIRCLE, decor, parts
  };
}

export default [fundusChart('OD'), fundusChart('OS'), maculaChart('OD'), maculaChart('OS'), anteriorChart('OD'), anteriorChart('OS')];
