import test from 'node:test';
import assert from 'node:assert/strict';
import { pen, arrow, note, simplify, sanitize, add, undo, remove, penPath, arrowHead, cleanText, loadAnnotations, saveAnnotations, STORAGE_PREFIX, MAX_ANNOTATIONS, ANNOTATION_COLORS } from '../src/modules/atlas/annotations.js';

const C0 = ANNOTATION_COLORS[0];
test('annotations: pen strokes are simplified, rounded and keep the last point', () => {
  const s = simplify([[0, 0], [0.3, 0.3], [5, 5], [5.2, 5.1]]);
  assert.deepEqual(s, [[0, 0], [5, 5], [5.2, 5.1]]);
  assert.deepEqual(simplify([{ x: 1.26, y: 2 }]), [[1.3, 2]]);
  assert.deepEqual(simplify([[1, 1], [NaN, 2], [1e9, 0]]), [[1, 1]]);
});
test('annotations: add / undo / remove / cap', () => {
  let l = [];
  l = add(l, pen([[0, 0], [10, 10]], C0)); l = add(l, arrow({ x: 0, y: 0 }, { x: 9, y: 9 }, C0));
  assert.equal(l.length, 2); assert.equal(undo(l).length, 1); assert.equal(remove(l, l[0].id).length, 1);
  for (let i = 0; i < MAX_ANNOTATIONS + 10; i++) l = add(l, note({ x: 1, y: 1 }, 'x', C0));
  assert.equal(l.length, MAX_ANNOTATIONS);
});
test('annotations: text is cleaned and limited', () => {
  assert.equal(cleanText('  a\u0000b \n c '), 'a b c');
  assert.equal(cleanText('x'.repeat(200)).length, 80);
  assert.equal(note({ x: 0, y: 0 }, '<img onerror=1>', C0).text, '<img onerror=1>'); // kept as plain text; rendered as a text node, never as HTML
});
test('annotations: sanitize drops anything malformed or out of range', () => {
  const good = pen([[1, 1], [20, 20]], C0);
  const bad = [
    null, 5, { type: 'x' }, { ...good, color: 'red' }, { ...good, id: '<bad>' }, { ...good, points: [[1, 'a']] }, { ...good, points: [[99999, 0]] },
    { id: 'a1b2c', type: 'arrow', color: C0, points: [[0, 0]] }, { id: 'a1b2d', type: 'text', color: C0, points: [[0, 0]], text: '   ' }
  ];
  assert.deepEqual(sanitize([good, ...bad]).map(a => a.id), [good.id]);
  assert.deepEqual(sanitize('nope'), []);
});
test('annotations: path and arrow-head builders', () => {
  assert.equal(penPath([[1, 2], [3, 4]]), 'M1,2 L3,4');
  assert.ok(penPath([[1, 2]]).startsWith('M1,2'));
  assert.equal(arrowHead([0, 0], [10, 0], 4).split(' ').length, 3);
});
test('annotations: per-plate storage round trip, empty list removes the key, errors never throw', () => {
  const mem = new Map();
  const st = { getItem: k => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, v), removeItem: k => mem.delete(k) };
  const l = [pen([[1, 1], [9, 9]], C0), note({ x: 5, y: 5 }, 'hi', C0)];
  assert.equal(saveAnnotations(st, 'p1', l), true);
  assert.ok(mem.has(STORAGE_PREFIX + 'p1'));
  assert.deepEqual(loadAnnotations(st, 'p1'), l);
  assert.deepEqual(loadAnnotations(st, 'other'), []);
  saveAnnotations(st, 'p1', []); assert.equal(mem.has(STORAGE_PREFIX + 'p1'), false);
  mem.set(STORAGE_PREFIX + 'bad', '{not json'); assert.deepEqual(loadAnnotations(st, 'bad'), []);
  assert.equal(saveAnnotations({ setItem() { throw new Error('full'); }, removeItem() {} }, 'p', l), false);
});
