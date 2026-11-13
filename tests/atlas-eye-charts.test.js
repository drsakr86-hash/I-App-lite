import test from 'node:test';
import assert from 'node:assert/strict';
import { PLATES } from '../src/modules/atlas/plates/index.js';
import { validatePlate, visiblePlates, chartsOf, getPlate, searchParts, CHART_KINDS } from '../src/modules/atlas/model.js';
import { STAMPS, STAMP_IDS, stampsFor, getStamp } from '../src/modules/atlas/stamps.js';
import { levelPath, hyphemaGrade, clampLevel, levelPercent, LEVEL_PRESETS } from '../src/modules/atlas/levels.js';
import { level, setLevel, removeLevel, levelOf, sanitize, loadAnnotations, saveAnnotations, newId, ANNOTATION_COLORS, ANNOTATION_COLOR_NAMES, ANNOTATION_TYPES } from '../src/modules/atlas/annotations.js';
import { priorDrawing, carryForward } from '../src/modules/atlas/followup.js';
import { AR, EN } from '../src/modules/i18n/index.js';

const CHARTS = PLATES.filter(p => p.chart);
const mirrored = sh => typeof sh.tf === 'string' && sh.tf.includes('scale(-1,1)');

test('charts: six sheets, a right and a left eye of each kind, all valid and still draft', () => {
  assert.deepEqual(CHARTS.map(p => p.id), ['fundus-chart-od', 'fundus-chart-os', 'macula-chart-od', 'macula-chart-os', 'anterior-chart-od', 'anterior-chart-os']);
  for (const p of CHARTS) { assert.deepEqual(validatePlate(p), [], p.id); assert.equal(p.status, 'draft'); assert.equal(p.source.type, 'original'); assert.ok(CHART_KINDS.includes(p.chart)); }
  for (const k of CHART_KINDS) assert.deepEqual(chartsOf(k).map(p => p.eye), ['OD', 'OS']);
});

test('charts: the title and the sheet itself name the eye (OD / OS), so a drawing can never be taken for the other eye', () => {
  for (const p of CHARTS) {
    const od = p.eye === 'OD';
    assert.match(p.title.en, od ? /right eye \(OD\)/ : /left eye \(OS\)/); assert.match(p.title.ar, od ? /اليمنى/ : /اليسرى/);
    const badge = p.decor.find(sh => sh.t === 'text' && /· O[DS]$/.test(sh.text.en));
    assert.ok(badge, p.id); assert.match(badge.text.en, od ? /OD$/ : /OS$/);
    assert.ok(p.decor.some(sh => sh.t === 'text' && sh.text.en === 'Nasal') && p.decor.some(sh => sh.t === 'text' && sh.text.en === 'Temporal'), p.id);
  }
});

test('charts: the left sheet is the right sheet mirrored; text is moved, never mirrored', () => {
  for (const kind of CHART_KINDS) {
    const [od, os] = chartsOf(kind);
    assert.equal(od.viewBox.join(), os.viewBox.join()); assert.equal(od.parts.length, os.parts.length);
    assert.ok(od.parts.flatMap(p => p.shapes).every(sh => !mirrored(sh)));
    assert.ok(os.parts.flatMap(p => p.shapes).every(sh => !mirrored(sh) === false), `${os.id} part shapes are mirrored`);
    assert.ok(os.decor.filter(sh => sh.t !== 'text').every(mirrored)); assert.ok(os.decor.filter(sh => sh.t === 'text').every(sh => !mirrored(sh)));
    const W = od.viewBox[2];
    const nasal = sh => sh.t === 'text' && sh.text.en === 'Nasal';
    const xo = od.decor.find(nasal).x; const xs = os.decor.find(nasal).x;
    assert.equal(xo + xs, W); assert.ok(xo > W / 2 && xs < W / 2, 'nasal is on the right for OD and on the left for OS');
    for (let i = 0; i < od.parts.length; i++) { assert.equal(od.parts[i].id, os.parts[i].id); assert.equal(od.parts[i].anchor[0] + os.parts[i].anchor[0], W); }
  }
});

test('charts: the optic disc is nasal to the fovea in both eyes (right of it for OD, left of it for OS)', () => {
  for (const kind of ['fundus', 'macula']) {
    const [od, os] = chartsOf(kind);
    const x = (p, id) => p.parts.find(q => q.id === id).anchor[0];
    const macula = kind === 'fundus' ? 'macula' : 'central-subfield';
    assert.ok(x(od, 'optic-disc') > x(od, macula)); assert.ok(x(os, 'optic-disc') < x(os, macula));
  }
});

test('fundus chart: twelve clock-hour numerals XII..XI, three zones, the ora serrata and the meridian lines', () => {
  for (const p of chartsOf('fundus')) {
    const nums = p.decor.filter(sh => sh.t === 'text' && /^[IVX]+$/.test(sh.text.en)).map(sh => sh.text.en);
    assert.deepEqual(nums, ['XII', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI']);
    for (const id of ['posterior-pole', 'mid-periphery', 'far-periphery', 'ora-serrata', 'meridians', 'optic-disc', 'macula', 'vascular-arcades', 'vortex-veins']) assert.ok(p.parts.some(q => q.id === id), id);
    assert.equal(p.parts.find(q => q.id === 'meridians').shapes.length, 12);
    assert.equal(p.legend.length, 6);
  }
  const od = chartsOf('fundus')[0];
  const III = od.decor.find(sh => sh.t === 'text' && sh.text.en === 'III'); const IX = od.decor.find(sh => sh.t === 'text' && sh.text.en === 'IX');
  assert.ok(III.x > IX.x, 'numerals are fixed on the sheet: III on the right, IX on the left, in both eyes');
  const os = chartsOf('fundus')[1];
  assert.ok(os.decor.find(sh => sh.text && sh.text.en === 'III').x > os.decor.find(sh => sh.text && sh.text.en === 'IX').x);
  // the same clock face on both sheets, so III is nasal in the right eye and temporal in the left eye
  assert.deepEqual(od.decor.filter(sh => sh.t === 'text' && /^[IVX]+$/.test(sh.text.en)).map(sh => [sh.text.en, sh.x, sh.y]), os.decor.filter(sh => sh.t === 'text' && /^[IVX]+$/.test(sh.text.en)).map(sh => [sh.text.en, sh.x, sh.y]));
});

test('anterior chart: slit-lamp clock hours use the same fixed face on both eyes (3 on the right, 9 on the left)', () => {
  const [od, os] = chartsOf('anterior');
  const hour = (p, h) => p.decor.find(sh => sh.t === 'text' && sh.text.en === String(h));
  for (const p of [od, os]) { assert.ok(hour(p, 3).x > hour(p, 9).x); assert.ok(hour(p, 12).y < hour(p, 6).y); }
  assert.equal(hour(od, 3).x, hour(os, 3).x);
});

test('macula chart: ETDRS grid of 1, 3 and 6 mm (radii 0.5, 1.5, 3 mm at one scale)', () => {
  for (const p of chartsOf('macula')) {
    const r = id => Math.max(...p.parts.find(q => q.id === id).shapes.filter(sh => sh.t === 'circle').map(sh => sh.r));
    assert.equal(r('central-subfield') * 2 / 80, 1); assert.equal(r('inner-ring') * 2 / 80, 3); assert.equal(r('outer-ring') * 2 / 80, 6);
    assert.equal(p.parts.find(q => q.id === 'quadrant-lines').shapes.length, 4);
    const letters = p.parts.find(q => q.id === 'central-subfield').overlay.filter(sh => sh.t === 'text').map(sh => sh.text.en).sort();
    assert.deepEqual(letters, ['I', 'N', 'S', 'T']);
  }
});

test('anterior chart: hyphema guide lines sit at 1/3, 1/2, 3/4 of the chamber height and the top, inside the chamber circle', () => {
  for (const p of chartsOf('anterior')) {
    const { cx, cy, r } = p.ac;
    const yOf = id => p.parts.find(q => q.id === id).shapes[0].y1;
    assert.ok(Math.abs(yOf('hyphema-i') - (cy + r - 2 * r / 3)) < 0.1); assert.ok(Math.abs(yOf('hyphema-ii') - cy) < 0.1); assert.ok(Math.abs(yOf('hyphema-iii') - (cy - r / 2)) < 0.1); assert.ok(Math.abs(yOf('hyphema-iv') - (cy - r)) < 0.1);
    for (const id of ['hyphema-i', 'hyphema-ii', 'hyphema-iii']) { const sh = p.parts.find(q => q.id === id).shapes[0]; assert.ok(sh.x1 >= cx - r && sh.x2 <= cx + r); }
    assert.ok(p.decor.some(sh => sh.t === 'ellipse'), 'caruncle marks the nasal side');
    assert.equal(chartsOf('anterior').length, 2);
  }
  const [od, os] = chartsOf('anterior');
  const car = p => p.decor.find(sh => sh.t === 'ellipse');
  assert.ok(car(od).cx > 500 && !mirrored(car(od)));
  assert.ok(mirrored(car(os)), 'the caruncle moves to the left for the left eye');
});

test('charts are offered in the exam atlas next to the blank canvas; the old plate library stays hidden', () => {
  const ids = visiblePlates().map(p => p.id);
  assert.deepEqual(ids, ['blank-canvas', ...CHARTS.map(p => p.id)]);
  assert.equal(ids[0], 'blank-canvas', 'the default is the blank canvas: no eye is implied until one is chosen');
  assert.ok(!ids.includes('general-eye'));
  const hidden = searchParts('cornea', visiblePlates().map(p => getPlate(p.id)));
  assert.ok(hidden.every(h => ids.includes(h.plateId)));
  assert.ok(hidden.some(h => h.plateId === 'anterior-chart-od' && h.partId === 'cornea'));
});

test('stamps: the chart symbols exist, grouped, and the palette can be limited to retina or anterior segment', () => {
  assert.ok(STAMPS.length >= 40);
  for (const id of ['pavingstone', 'snowflake', 'tear-flap', 'tear-rolled', 'preretinal-heme', 'vitreous-heme', 'weiss-ring', 'asteroid', 'choroidal-detach', 'wwp', 'laser-fresh', 'laser-grid', 'thin-retina', 'drusen', 'kp', 'infiltrate', 'fluorescein', 'corneal-scar', 'corneal-vessels', 'synechia', 'cataract', 'foreign-body']) assert.ok(getStamp(id), id);
  assert.equal(new Set(STAMP_IDS).size, STAMPS.length);
  const ant = stampsFor('anterior').map(s => s.id); const ret = stampsFor('retina').map(s => s.id);
  assert.ok(ant.includes('kp') && !ant.includes('tear') && ant.includes('dot'));
  assert.ok(ret.includes('tear') && !ret.includes('kp') && ret.includes('ring'));
  assert.equal(stampsFor('all').length, STAMPS.length);
});

test('annotation colours follow the retinal convention: yellow and brown were added with their names and translations', () => {
  assert.equal(ANNOTATION_COLORS.length, ANNOTATION_COLOR_NAMES.length);
  assert.ok(ANNOTATION_COLOR_NAMES.includes('yellow') && ANNOTATION_COLOR_NAMES.includes('brown'));
  for (const n of ANNOTATION_COLOR_NAMES) assert.ok(AR['atlas.color.' + n] && EN['atlas.color.' + n], n);
});

test('levels: the layer is the part of the chamber below the line; grade follows the fraction', () => {
  assert.equal(levelPath({ cx: 500, cy: 500, r: 300 }, 1 / 3), 'M217.2,600.2 A300,300 0 0 0 782.8,600.2 Z');
  assert.match(levelPath({ cx: 500, cy: 500, r: 300 }, 0.75), /A300,300 0 1 0/); // above the middle: the long way round
  assert.match(levelPath({ cx: 500, cy: 500, r: 300 }, 0.2), /A300,300 0 0 0/);
  assert.match(levelPath({ cx: 500, cy: 500, r: 300 }, 1), /^M200,500 A300,300 0 1 0 800,500 A300,300 0 1 0 200,500 Z$/); // total: the whole chamber
  assert.deepEqual([0.1, 1 / 3, 0.35, 0.5, 0.55, 0.75, 0.98, 1].map(hyphemaGrade), [1, 1, 2, 2, 3, 3, 3, 4]);
  assert.equal(hyphemaGrade(0), 0); assert.equal(hyphemaGrade(NaN), 0);
  assert.equal(clampLevel(5), 1); assert.equal(clampLevel(-1), 0.05); assert.equal(clampLevel('x'), 0.05); assert.equal(levelPercent(0.333), 33);
  assert.equal(LEVEL_PRESETS.length, 4);
});

test('levels: one per kind (a new level replaces the old), removable, survive save and load, and bad ones are dropped', () => {
  let l = setLevel([], 'hyphema', 0.3);
  l = setLevel(l, 'hypopyon', 0.1); l = setLevel(l, 'hyphema', 0.6);
  assert.equal(l.filter(a => a.type === 'level').length, 2); assert.equal(levelOf(l, 'hyphema').frac, 0.6);
  assert.deepEqual(removeLevel(l, 'hypopyon').map(a => a.kind), ['hyphema']);
  assert.deepEqual(setLevel([], 'nope', 0.5), []);
  assert.ok(ANNOTATION_TYPES.includes('level'));
  const mem = {}; const st = { getItem: k => (k in mem ? mem[k] : null), setItem: (k, v) => { mem[k] = v; }, removeItem: k => { delete mem[k]; } };
  assert.ok(saveAnnotations(st, 'anterior-chart-od', l)); assert.deepEqual(loadAnnotations(st, 'anterior-chart-od'), l);
  const good = level('hyphema', 0.5);
  assert.deepEqual(sanitize([good, { ...good, id: 'bbbb', kind: 'x' }, { ...good, id: 'cccc', frac: 0 }, { ...good, id: 'dddd', frac: 2 }, { ...good, id: 'ee', frac: 0.5 }, { ...good, id: 'ffff', frac: '0.5' }]).map(a => a.id), [good.id]);
});

const drawing = (id, plateId, at, annotations, status = 'approved') => ({ id, plateId, status, approvedAt: at, annotations });
test('follow-up: the newest approved drawing of the same chart for the same patient, never the exam being edited', () => {
  const a1 = [setLevel([], 'hyphema', 0.3)[0]];
  const a2 = [level('hyphema', 0.1)];
  const exams = [
    { id: 1, patientId: 7, date: '2026-10-01', atlasDrawings: [drawing('d1', 'anterior-chart-od', '2026-10-01T09:00:00Z', a1), drawing('d0', 'anterior-chart-os', '2026-10-01T09:00:00Z', a2)] },
    { id: 2, patientId: 7, date: '2026-10-10', atlasDrawings: [drawing('d2', 'anterior-chart-od', '2026-10-10T09:00:00Z', a2)] },
    { id: 3, patientId: 8, date: '2026-10-12', atlasDrawings: [drawing('d3', 'anterior-chart-od', '2026-10-12T09:00:00Z', a1)] },
    { id: 4, patientId: 7, date: '2026-10-20', atlasDrawings: [drawing('d4', 'anterior-chart-od', '2026-10-20T09:00:00Z', a1, 'superseded')] }
  ];
  const q = { exams, patientId: 7, plateId: 'anterior-chart-od', role: 'doctor' };
  const p = priorDrawing(q);
  assert.equal(p.examId, 2); assert.equal(p.examDate, '2026-10-10'); assert.equal(p.annotations[0].frac, 0.1);
  assert.equal(priorDrawing({ ...q, excludeExamId: 2 }).examId, 1);
  assert.equal(priorDrawing({ ...q, plateId: 'fundus-chart-od' }), null);
  assert.equal(priorDrawing({ ...q, patientId: 9 }), null);
  assert.equal(priorDrawing({ ...q, role: 'secretary' }), null, 'only roles that may see clinical drawings');
  assert.equal(priorDrawing({ ...q, exams: null }), null);
});

test('follow-up: copied markings get fresh ids and are sanitised; the old drawing is untouched', () => {
  const src = [level('hyphema', 0.4), { id: 'zz', type: 'pen', color: 'red', points: [[1, 1]] }];
  const before = JSON.stringify(src);
  const copy = carryForward(src);
  assert.equal(copy.length, 1); assert.notEqual(copy[0].id, src[0].id); assert.equal(copy[0].frac, 0.4);
  assert.equal(JSON.stringify(src), before); assert.ok(newId().length > 3);
});

test('i18n: every key the chart screens use exists in both languages', () => {
  for (const k of ['atlas.legend', 'atlas.level.title', 'atlas.level.hyphema', 'atlas.level.hypopyon', 'atlas.level.height', 'atlas.level.grade', 'atlas.level.g1', 'atlas.level.g2', 'atlas.level.g3', 'atlas.level.g4', 'atlas.level.p.third', 'atlas.level.p.half', 'atlas.level.p.three', 'atlas.level.p.total', 'atlas.prior.title', 'atlas.prior.show', 'atlas.prior.hide', 'atlas.prior.copy', 'atlas.prior.copyConfirm', 'atlas.stamp.group.all', 'atlas.stamp.group.retina', 'atlas.stamp.group.anterior']) assert.ok(AR[k] && EN[k], k);
});
