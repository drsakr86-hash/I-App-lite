// Ready-made lesion symbols for fundus / retina charting, placed with one tap. Colours follow the usual retinal-chart
// convention (red = haemorrhage, break, new vessels; blue = detachment, lattice, break outline; yellow = exudates, oedema;
// brown/black = pigment, laser; green = vitreous). Each glyph is plain data drawn in a 40x40 box centred on (0,0);
// the colour token '@' means "use the colour the doctor picked" (point and small circle only).
const RED = '#c62828', DARK_RED = '#7f1d1d', BLUE = '#1d4ed8', YEL = '#e0a800', DYEL = '#8a6500', BRN = '#78350f', BLK = '#111827', GRN = '#15803d', GRY = '#64748b';
const bi = (ar, en) => ({ ar, en });

const BASE = [
  { id: 'dot', name: bi('نقطة', 'Point'), color: '@', shapes: [{ t: 'circle', cx: 0, cy: 0, r: 4.5, f: '@' }] },
  { id: 'ring', name: bi('دائرة صغيرة', 'Small circle'), color: '@', shapes: [{ t: 'circle', cx: 0, cy: 0, r: 10, s: '@', sw: 2.4 }] },
  { id: 'hemorrhage', name: bi('نزف (نقطي/بقعي)', 'Dot-blot haemorrhage'), color: RED, shapes: [{ t: 'circle', cx: 0, cy: 0, r: 8, f: RED, s: DARK_RED, sw: 1.2 }] },
  { id: 'flame', name: bi('نزف شعلي', 'Flame haemorrhage'), color: RED, shapes: [{ t: 'path', d: 'M-15,0 C-8,-9 6,-9 15,-2 C7,2 -2,9 -15,0 Z', f: RED, s: DARK_RED, sw: 1.2 }] },
  { id: 'microaneurysm', name: bi('أمّ دم دقيقة', 'Microaneurysm'), color: RED, shapes: [{ t: 'circle', cx: 0, cy: 0, r: 3.2, f: RED }] },
  { id: 'exudate', name: bi('إفرازات صلبة', 'Hard exudates'), color: YEL, shapes: [
    { t: 'circle', cx: -7, cy: -3, r: 3.6, f: YEL, s: DYEL, sw: 0.8 }, { t: 'circle', cx: 2, cy: -7, r: 3, f: YEL, s: DYEL, sw: 0.8 },
    { t: 'circle', cx: 8, cy: 1, r: 3.8, f: YEL, s: DYEL, sw: 0.8 }, { t: 'circle', cx: -2, cy: 4, r: 3.2, f: YEL, s: DYEL, sw: 0.8 },
    { t: 'circle', cx: -9, cy: 8, r: 2.4, f: YEL, s: DYEL, sw: 0.8 }
  ] },
  { id: 'cotton-wool', name: bi('بقعة قطنية', 'Cotton-wool spot'), color: '#e2e8f0', shapes: [{ t: 'ellipse', cx: 0, cy: 0, rx: 13, ry: 7, f: '#f8fafc', s: GRY, sw: 1.6, dash: '3 2', tf: 'rotate(-20)' }] },
  { id: 'tear', name: bi('تمزق شبكي (حدوة حصان)', 'Horseshoe tear'), color: RED, shapes: [{ t: 'path', d: 'M-11,9 C-13,-13 13,-13 11,9 L5,9 C6,-4 -6,-4 -5,9 Z', f: RED, s: BLUE, sw: 2 }] },
  { id: 'hole', name: bi('ثقب شبكي مستدير', 'Round hole'), color: RED, shapes: [{ t: 'circle', cx: 0, cy: 0, r: 5.5, f: RED }, { t: 'circle', cx: 0, cy: 0, r: 10, s: BLUE, sw: 2 }] },
  { id: 'lattice', name: bi('تنكّس شبكي (Lattice)', 'Lattice degeneration'), color: BLUE, shapes: [
    { t: 'ellipse', cx: 0, cy: 0, rx: 16, ry: 8, f: '#dbeafe', s: BLUE, sw: 1.8 },
    { t: 'line', x1: -9, y1: -5, x2: -3, y2: 5, s: BLUE, sw: 1.1 }, { t: 'line', x1: -3, y1: -7, x2: 3, y2: 7, s: BLUE, sw: 1.1 },
    { t: 'line', x1: 3, y1: -7, x2: 9, y2: 5, s: BLUE, sw: 1.1 }, { t: 'line', x1: 9, y1: -5, x2: 13, y2: 2, s: BLUE, sw: 1.1 }
  ] },
  { id: 'laser', name: bi('ندبة ليزر', 'Laser scar'), color: BRN, shapes: [{ t: 'circle', cx: 0, cy: 0, r: 7, f: '#fde68a', s: BRN, sw: 2 }, { t: 'circle', cx: 0, cy: 0, r: 2.6, f: BRN }] },
  { id: 'nv', name: bi('أوعية جديدة (NV)', 'Neovascularisation'), color: RED, shapes: [
    { t: 'path', d: 'M0,14 L0,2 M0,2 L-8,-6 M0,2 L8,-6 M0,2 L0,-12 M-8,-6 L-13,-9 M8,-6 L13,-9 M0,-12 L-4,-16 M0,-12 L4,-16', s: RED, sw: 2 },
    { t: 'circle', cx: -13, cy: -9, r: 2.2, f: RED }, { t: 'circle', cx: 13, cy: -9, r: 2.2, f: RED }
  ] },
  { id: 'cnv', name: bi('غشاء وعائي مشيمي (CNV)', 'Choroidal neovascular membrane'), color: '#6b8e5a', shapes: [
    { t: 'ellipse', cx: 0, cy: 0, rx: 12, ry: 9, f: '#a3b18a', s: '#4b5563', sw: 1.4 }, { t: 'circle', cx: 0, cy: 0, r: 4, s: RED, sw: 1.6 }
  ] },
  { id: 'edema', name: bi('وذمة', 'Oedema'), color: YEL, shapes: [{ t: 'circle', cx: 0, cy: 0, r: 15, f: '#fde68a', o: 0.55, s: YEL, sw: 2.2, dash: '4 3' }] },
  { id: 'pigment', name: bi('صبغ', 'Pigment'), color: BLK, shapes: [{ t: 'path', d: 'M-7,-1 C-6,-8 4,-8 7,-3 C10,2 4,8 -2,7 C-6,6 -8,3 -7,-1 Z', f: BLK }] },
  { id: 'atrophy', name: bi('ضمور / ندبة', 'Atrophy / scar'), color: GRY, shapes: [{ t: 'ellipse', cx: 0, cy: 0, rx: 12, ry: 8, f: '#f1f5f9', s: GRY, sw: 1.8 }, { t: 'path', d: 'M-8,0 L8,0 M0,-5 L0,5', s: '#cbd5e1', sw: 1 }] },
  { id: 'detach', name: bi('انفصال شبكي', 'Retinal detachment'), color: BLUE, shapes: [
    { t: 'path', d: 'M-17,2 C-19,-9 -8,-15 0,-11 C9,-16 18,-9 16,1 C19,11 6,16 -2,12 C-11,16 -19,11 -17,2 Z', f: '#93c5fd', o: 0.7, s: BLUE, sw: 2 },
    { t: 'path', d: 'M-10,6 L-3,-6 M-3,9 L5,-8 M4,10 L11,-3', s: BLUE, sw: 1.1 }
  ] },
  { id: 'vitreous', name: bi('عتامة زجاجية', 'Vitreous opacity'), color: GRN, shapes: [{ t: 'path', d: 'M-15,2 C-10,-9 -6,9 -1,-2 C4,-11 8,9 15,-3', s: GRN, sw: 2.4 }] }
];

// More retinal lesions (peripheral degenerations, breaks, haemorrhage types, laser, drusen) and the anterior-segment set.
const CARD = '#475569', LGR = '#65a30d', DBR = '#451a03';
const MORE = [
  { id: 'pavingstone', name: bi('تنكّس حصوي (Pavingstone)', 'Pavingstone degeneration'), color: BLUE, shapes: [
    { t: 'ellipse', cx: 0, cy: 0, rx: 13, ry: 9, f: '#e0e7ff', s: BLUE, sw: 1.8 }, { t: 'line', x1: -8, y1: -3, x2: 8, y2: -3, s: BLUE, sw: 1 }, { t: 'line', x1: -9, y1: 2, x2: 9, y2: 2, s: BLUE, sw: 1 }
  ] },
  { id: 'snowflake', name: bi('تنكّس ندفي (Snowflake)', 'Snowflake degeneration'), color: BLUE, shapes: [
    { t: 'circle', cx: -8, cy: -6, r: 2.4, f: BLUE }, { t: 'circle', cx: 0, cy: -9, r: 2.4, f: BLUE }, { t: 'circle', cx: 8, cy: -5, r: 2.4, f: BLUE }, { t: 'circle', cx: -4, cy: 0, r: 2.4, f: BLUE },
    { t: 'circle', cx: 5, cy: 2, r: 2.4, f: BLUE }, { t: 'circle', cx: -9, cy: 7, r: 2.4, f: BLUE }, { t: 'circle', cx: 0, cy: 8, r: 2.4, f: BLUE }, { t: 'circle', cx: 9, cy: 9, r: 2.4, f: BLUE }
  ] },
  { id: 'tear-flap', name: bi('تمزق بغطاء (Operculum)', 'Tear with flap (operculum)'), color: RED, shapes: [
    { t: 'path', d: 'M-11,9 C-13,-11 13,-11 11,9 L5,9 C6,-3 -6,-3 -5,9 Z', f: RED, s: BLUE, sw: 2 }, { t: 'ellipse', cx: 0, cy: -16.5, rx: 4.5, ry: 2.8, f: RED, s: BLUE, sw: 1.2 }
  ] },
  { id: 'tear-rolled', name: bi('تمزق بحواف ملتفة', 'Tear with rolled edges'), color: RED, shapes: [
    { t: 'path', d: 'M-11,9 C-13,-13 13,-13 11,9 L5,9 C6,-4 -6,-4 -5,9 Z', f: RED, s: BLUE, sw: 3.6 }, { t: 'path', d: 'M-8,6 C-9,-8 9,-8 8,6', s: DARK_RED, sw: 1 }
  ] },
  { id: 'preretinal-heme', name: bi('نزف أمام الشبكية / تحت الهيالويد', 'Pre-retinal / subhyaloid haemorrhage'), color: RED, shapes: [{ t: 'path', d: 'M-15,-3 L15,-3 C12,8 -12,8 -15,-3 Z', f: RED, s: DARK_RED, sw: 1.2 }] },
  { id: 'vitreous-heme', name: bi('نزف زجاجي', 'Vitreous haemorrhage'), color: LGR, shapes: [{ t: 'path', d: 'M-16,-5 C-11,-12 -6,-3 -1,-8 C4,-13 9,-4 16,-7 L16,6 C11,12 6,3 1,9 C-4,14 -10,5 -16,8 Z', f: LGR, o: 0.75, s: GRN, sw: 1.4 }] },
  { id: 'weiss-ring', name: bi('حلقة فايس (Weiss ring)', 'Weiss ring'), color: GRN, shapes: [{ t: 'ellipse', cx: 0, cy: 0, rx: 10, ry: 8, s: GRN, sw: 2.8, dash: '12 5' }] },
  { id: 'asteroid', name: bi('تحلّل نجمي (Asteroid hyalosis)', 'Asteroid hyalosis'), color: GRN, shapes: [
    { t: 'circle', cx: -10, cy: -8, r: 1.8, f: GRN }, { t: 'circle', cx: -2, cy: -11, r: 1.8, f: GRN }, { t: 'circle', cx: 7, cy: -9, r: 1.8, f: GRN }, { t: 'circle', cx: -6, cy: -2, r: 1.8, f: GRN }, { t: 'circle', cx: 3, cy: -3, r: 1.8, f: GRN },
    { t: 'circle', cx: 11, cy: 0, r: 1.8, f: GRN }, { t: 'circle', cx: -11, cy: 5, r: 1.8, f: GRN }, { t: 'circle', cx: -2, cy: 4, r: 1.8, f: GRN }, { t: 'circle', cx: 7, cy: 7, r: 1.8, f: GRN }, { t: 'circle', cx: 0, cy: 12, r: 1.8, f: GRN }
  ] },
  { id: 'choroidal-detach', name: bi('انفصال مشيمي', 'Choroidal detachment'), color: BRN, shapes: [{ t: 'path', d: 'M-17,9 C-14,-12 14,-12 17,9 Z', f: BRN, o: 0.75, s: DBR, sw: 1.6 }] },
  { id: 'wwp', name: bi('أبيض بدون ضغط', 'White without pressure'), color: '#60a5fa', shapes: [{ t: 'ellipse', cx: 0, cy: 0, rx: 15, ry: 8, f: '#f1f5f9', s: '#60a5fa', sw: 1.6, dash: '2 2' }] },
  { id: 'laser-fresh', name: bi('ليزر حديث', 'Fresh laser burns'), color: '#ca8a04', shapes: [
    { t: 'circle', cx: -8, cy: -4, r: 5.5, f: '#fef9c3', s: '#ca8a04', sw: 1.4 }, { t: 'circle', cx: 8, cy: -4, r: 5.5, f: '#fef9c3', s: '#ca8a04', sw: 1.4 }, { t: 'circle', cx: 0, cy: 8, r: 5.5, f: '#fef9c3', s: '#ca8a04', sw: 1.4 }
  ] },
  { id: 'laser-grid', name: bi('شبكة ليزر (بقع متجاورة)', 'Laser grid / PRP spots'), color: BRN, shapes: [-12, 0, 12].flatMap(y => [-12, 0, 12].map(x => ({ t: 'circle', cx: x, cy: y, r: 3, f: '#fde68a', s: BRN, sw: 1.1 }))) },
  { id: 'thin-retina', name: bi('شبكية رقيقة', 'Thin retina'), color: '#e11d48', shapes: [{ t: 'ellipse', cx: 0, cy: 0, rx: 14, ry: 7, f: '#fecdd3', s: '#e11d48', sw: 1.6, dash: '3 2' }] },
  { id: 'drusen', name: bi('دروزن', 'Drusen'), color: YEL, shapes: [
    { t: 'ellipse', cx: -8, cy: -5, rx: 5, ry: 4, f: '#fde047', s: '#ca8a04', sw: 0.7 }, { t: 'ellipse', cx: 3, cy: -8, rx: 3.4, ry: 3, f: '#fde047', s: '#ca8a04', sw: 0.7 }, { t: 'ellipse', cx: 9, cy: 1, rx: 5.5, ry: 4.4, f: '#fde047', s: '#ca8a04', sw: 0.7 },
    { t: 'ellipse', cx: -3, cy: 5, rx: 4.4, ry: 3.6, f: '#fde047', s: '#ca8a04', sw: 0.7 }, { t: 'ellipse', cx: -11, cy: 9, rx: 3, ry: 2.6, f: '#fde047', s: '#ca8a04', sw: 0.7 }
  ] },
  // anterior segment
  { id: 'kp', name: bi('ترسبات خلفية بالقرنية (KPs)', 'Keratic precipitates (KPs)'), color: CARD, shapes: [[-9, -6], [0, -9], [9, -5], [-5, 1], [5, 3], [-10, 8], [0, 9], [10, 10]].map(([x, y]) => ({ t: 'circle', cx: x, cy: y, r: 2.6, f: CARD })) },
  { id: 'infiltrate', name: bi('ارتشاح / قرحة قرنية', 'Corneal infiltrate / ulcer'), color: '#c2850c', shapes: [{ t: 'circle', cx: 0, cy: 0, r: 11, f: '#fff3c4', s: '#c2850c', sw: 2 }, { t: 'circle', cx: 0, cy: 0, r: 5, f: '#fde68a' }] },
  { id: 'fluorescein', name: bi('تلوّن بالفلوريسين', 'Fluorescein staining'), color: GRN, shapes: [{ t: 'ellipse', cx: 0, cy: 0, rx: 13, ry: 10, f: LGR, o: 0.6, s: GRN, sw: 1.4, dash: '3 2' }] },
  { id: 'corneal-scar', name: bi('ندبة قرنية', 'Corneal scar'), color: GRY, shapes: [{ t: 'path', d: 'M-13,0 C-12,-9 -2,-12 6,-9 C14,-6 14,5 7,9 C-1,13 -12,9 -13,0 Z', f: '#e5e7eb', s: GRY, sw: 1.4 }] },
  { id: 'corneal-vessels', name: bi('أوعية قرنية جديدة', 'Corneal new vessels'), color: RED, shapes: [{ t: 'path', d: 'M-16,12 L-4,0 M-4,0 L8,-10 M-4,0 L10,6 M-10,6 L-12,-4', s: RED, sw: 2 }] },
  { id: 'synechia', name: bi('التصاق خلفي', 'Posterior synechia'), color: '#57534e', shapes: [{ t: 'path', d: 'M-9,10 L0,-10 L9,10 Z', f: '#a8a29e', s: '#57534e', sw: 1.4 }] },
  { id: 'cataract', name: bi('عتامة عدسية', 'Lens opacity'), color: GRY, shapes: [
    { t: 'circle', cx: 0, cy: 0, r: 12, f: '#e5e7eb', o: 0.9, s: GRY, sw: 1.6 }, { t: 'line', x1: -9, y1: 0, x2: 9, y2: 0, s: '#94a3b8', sw: 1 }, { t: 'line', x1: 0, y1: -9, x2: 0, y2: 9, s: '#94a3b8', sw: 1 },
    { t: 'line', x1: -6, y1: -6, x2: 6, y2: 6, s: '#94a3b8', sw: 1 }, { t: 'line', x1: -6, y1: 6, x2: 6, y2: -6, s: '#94a3b8', sw: 1 }
  ] },
  { id: 'foreign-body', name: bi('جسم غريب', 'Foreign body'), color: BLK, shapes: [{ t: 'circle', cx: 0, cy: 0, r: 4, f: BLK }, { t: 'circle', cx: 0, cy: 0, r: 9, s: BRN, sw: 1.6, dash: '3 2' }] }
];

// Which palette a stamp belongs to. The point and the small circle are neutral and appear in every group.
const ANTERIOR_IDS = ['kp', 'infiltrate', 'fluorescein', 'corneal-scar', 'corneal-vessels', 'synechia', 'cataract', 'foreign-body'];
const GENERAL_IDS = ['dot', 'ring'];
export const STAMP_GROUPS = Object.freeze(['retina', 'anterior']);
const groupOf = id => (GENERAL_IDS.includes(id) ? 'general' : ANTERIOR_IDS.includes(id) ? 'anterior' : 'retina');
export const STAMPS = Object.freeze([...BASE, ...MORE].map(s => Object.freeze({ ...s, group: groupOf(s.id) })));
// 'all' shows everything; a group shows its own symbols and the neutral ones.
export const stampsFor = group => STAMPS.filter(s => !STAMP_GROUPS.includes(group) || s.group === group || s.group === 'general');

export const STAMP_IDS = Object.freeze(STAMPS.map(s => s.id));
export const getStamp = id => STAMPS.find(s => s.id === id) || null;
export const STAMP_SIZES = Object.freeze({ s: 44, m: 72, l: 112 }); // plate units for the 40-unit glyph box
export const STAMP_ROTATIONS = Object.freeze([0, 90, 180, 270]);
export const nextRotation = r => STAMP_ROTATIONS[(STAMP_ROTATIONS.indexOf(r) + 1) % STAMP_ROTATIONS.length];
// Colour for a new stamp: its convention colour, or the doctor's picked colour for the neutral point/circle.
export const stampColor = (stamp, picked) => (stamp.color === '@' ? picked : stamp.color);
