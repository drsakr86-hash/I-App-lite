// Ready-made lesion symbols for fundus / retina charting, placed with one tap. Colours follow the usual retinal-chart
// convention (red = haemorrhage, break, new vessels; blue = detachment, lattice, break outline; yellow = exudates, oedema;
// brown/black = pigment, laser; green = vitreous). Each glyph is plain data drawn in a 40x40 box centred on (0,0);
// the colour token '@' means "use the colour the doctor picked" (point and small circle only).
const RED = '#c62828', DARK_RED = '#7f1d1d', BLUE = '#1d4ed8', YEL = '#e0a800', DYEL = '#8a6500', BRN = '#78350f', BLK = '#111827', GRN = '#15803d', GRY = '#64748b';
const bi = (ar, en) => ({ ar, en });

export const STAMPS = Object.freeze([
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
]);

export const STAMP_IDS = Object.freeze(STAMPS.map(s => s.id));
export const getStamp = id => STAMPS.find(s => s.id === id) || null;
export const STAMP_SIZES = Object.freeze({ s: 44, m: 72, l: 112 }); // plate units for the 40-unit glyph box
export const STAMP_ROTATIONS = Object.freeze([0, 90, 180, 270]);
export const nextRotation = r => STAMP_ROTATIONS[(STAMP_ROTATIONS.indexOf(r) + 1) % STAMP_ROTATIONS.length];
// Colour for a new stamp: its convention colour, or the doctor's picked colour for the neutral point/circle.
export const stampColor = (stamp, picked) => (stamp.color === '@' ? picked : stamp.color);
