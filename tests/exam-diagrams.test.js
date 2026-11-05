// Exam diagrams: vector strokes stored on the exam record, tolerant normalisation, print SVG.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  blankDiagram, makeStroke, simplifyFlat, strokePath, hitStroke, normalizeDiagrams, finalizeExamDiagrams,
  diagramIsEmpty, templateShapes, diagramToSvg, TEMPLATES, MAX_DIAGRAMS, MAX_STROKES, INK
} from '../src/modules/exam-diagrams/model.js';

test('diagrams: a stroke is simplified, rounded and clamped to the 0..1000 square', () => {
  const raw = [];
  for (let i = 0; i <= 100; i++) raw.push(i * 5 + 0.4, 200.2); // a straight line sampled 101 times
  const s = makeStroke(raw, 'b', 3);
  assert.equal(s.c, 'b');
  assert.equal(s.w, 3);
  assert.equal(s.p.length, 4); // collinear points collapse to the two endpoints
  assert.deepEqual(s.p, [0, 200, 500, 200]);
  assert.deepEqual(makeStroke([-50, 2000], 'r', 2).p, [0, 1000]);
  assert.equal(makeStroke([], 'r', 2), null);
  assert.equal(makeStroke([5, 5], 'zzz', 9).c, 'k'); // unknown ink / width fall back
  assert.equal(makeStroke([5, 5], 'zzz', 9).w, 2);
});

test('diagrams: simplification keeps real corners', () => {
  const out = simplifyFlat([0, 0, 100, 0, 100, 100], 2);
  assert.deepEqual(out, [0, 0, 100, 0, 100, 100]);
});

test('diagrams: a tap becomes a dot and a path is a polyline', () => {
  assert.match(strokePath({ p: [10, 20] }), /^M10 20l/);
  assert.equal(strokePath({ p: [0, 0, 10, 10, 20, 0] }), 'M0 0L10 10L20 0');
  assert.equal(strokePath({ p: [] }), '');
});

test('diagrams: the eraser finds the top-most stroke near a point', () => {
  const strokes = [{ c: 'r', w: 1, p: [0, 500, 1000, 500] }, { c: 'b', w: 1, p: [500, 0, 500, 1000] }];
  assert.equal(hitStroke(strokes, 300, 505), 0);
  assert.equal(hitStroke(strokes, 505, 300), 1);
  assert.equal(hitStroke(strokes, 500, 500), 1); // crossing point: later (top) stroke wins
  assert.equal(hitStroke(strokes, 100, 100), -1);
});

test('diagrams: malformed or hostile stored data never throws and is cleaned', () => {
  assert.deepEqual(normalizeDiagrams(null), []);
  assert.deepEqual(normalizeDiagrams('x'), []);
  const n = normalizeDiagrams([
    null, 5, { tpl: 'nope', strokes: [] },
    { id: 7, tpl: 'amsler', note: 12, strokes: [{ c: 'zz', w: 9, p: [1, 2, 3] }, { p: 'bad' }, { c: 'r', w: 1, p: [-5, 5000, 10, 10] }] }
  ]);
  assert.equal(n.length, 1);
  assert.equal(n[0].note, '12');
  assert.equal(n[0].strokes.length, 2);
  assert.deepEqual(n[0].strokes[0], { c: 'k', w: 2, p: [1, 2] }); // odd trailing coordinate dropped
  assert.deepEqual(n[0].strokes[1].p, [0, 1000, 10, 10]);
  assert.equal(normalizeDiagrams(new Array(20).fill(blankDiagram('blank', 1))).length, MAX_DIAGRAMS);
  const many = { tpl: 'blank', strokes: new Array(MAX_STROKES + 50).fill({ c: 'r', w: 1, p: [1, 1, 2, 2] }) };
  assert.equal(normalizeDiagrams([many])[0].strokes.length, MAX_STROKES);
});

test('diagrams: records without drawings stay byte-for-byte unchanged on save', () => {
  const old = { id: 1, date: '2026-01-01', diagnosis: 'x' };
  assert.deepEqual(finalizeExamDiagrams(old), old);
  assert.equal('diagrams' in finalizeExamDiagrams({ ...old, diagrams: [blankDiagram('fundus-od', 1)] }), false); // empty template is dropped
  assert.equal('diagrams' in finalizeExamDiagrams({ ...old, diagrams: [] }), false);
  const drawn = { ...blankDiagram('fundus-os', 2), strokes: [makeStroke([10, 10, 300, 300], 'r', 2)] };
  const saved = finalizeExamDiagrams({ ...old, diagrams: [drawn, blankDiagram('blank', 3)] });
  assert.equal(saved.diagrams.length, 1);
  assert.equal(saved.diagrams[0].tpl, 'fundus-os');
  assert.ok(!diagramIsEmpty(saved.diagrams[0]));
  assert.ok(diagramIsEmpty({ tpl: 'blank', note: '  ', strokes: [] }));
  assert.ok(!diagramIsEmpty({ tpl: 'blank', note: 'x', strokes: [] }));
});

test('diagrams: every template draws; fundus disc is nasal (OD right, OS left)', () => {
  for (const tpl of TEMPLATES) assert.ok(templateShapes(tpl).length > 0, tpl);
  const disc = tpl => templateShapes(tpl).find(s => s.k === 'circle' && s.r === 46);
  assert.ok(disc('fundus-od').cx > 500);
  assert.ok(disc('fundus-os').cx < 500);
  assert.equal(templateShapes('amsler').filter(s => s.k === 'line').length, 38); // 19 vertical + 19 horizontal
});

test('diagrams: print SVG is a complete, safe element', () => {
  const d = { ...blankDiagram('fundus-od', 1), strokes: [makeStroke([100, 100, 400, 400], 'b', 2)] };
  const svg = diagramToSvg(d, 190);
  assert.ok(svg.startsWith('<svg ') && svg.endsWith('</svg>'));
  assert.ok(svg.includes(INK.b));
  assert.ok(svg.includes('width="190"'));
  assert.equal(diagramToSvg({ tpl: 'bad' }), '');
  const hostile = diagramToSvg({ tpl: 'blank', strokes: [{ c: '"><script>', w: 1, p: [1, 1, 2, 2] }] });
  assert.ok(!hostile.includes('<script'));
});
