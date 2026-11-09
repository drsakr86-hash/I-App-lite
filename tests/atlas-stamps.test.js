import test from 'node:test';
import assert from 'node:assert/strict';
import { STAMPS, STAMP_IDS, STAMP_SIZES, getStamp, nextRotation, stampColor } from '../src/modules/atlas/stamps.js';
import { stamp, sanitize, add, undo, saveAnnotations, loadAnnotations, ANNOTATION_TYPES } from '../src/modules/atlas/annotations.js';

const SHAPE_T = ['circle', 'ellipse', 'line', 'path'];
const COLOR = /^(#[0-9a-f]{6}|@)$/i;

test('stamps: ids unique, bilingual names, known shapes and colours, inside the 40-unit box', () => {
  assert.equal(new Set(STAMP_IDS).size, STAMPS.length);
  assert.ok(STAMPS.length >= 18);
  for (const s of STAMPS) {
    assert.match(s.id, /^[a-z]+(-[a-z]+)*$/);
    assert.ok(/[؀-ۿ]/.test(s.name.ar) && !/[؀-ۿ]/.test(s.name.en), s.id);
    assert.match(s.color, COLOR); assert.ok(s.shapes.length);
    for (const sh of s.shapes) {
      assert.ok(SHAPE_T.includes(sh.t), `${s.id} ${sh.t}`);
      for (const k of ['f', 's']) if (sh[k]) assert.match(sh[k], COLOR);
      if (sh.t === 'circle') assert.ok(Math.abs(sh.cx) + sh.r <= 20 && Math.abs(sh.cy) + sh.r <= 20, s.id);
      if (sh.t === 'ellipse') assert.ok(Math.abs(sh.cx) + sh.rx <= 20 && Math.abs(sh.cy) + sh.ry <= 20, s.id);
    }
  }
});

test('stamps: the requested retinal symbols exist (point, small circle, tear, haemorrhage, exudates, ...)', () => {
  for (const id of ['dot', 'ring', 'tear', 'hole', 'hemorrhage', 'flame', 'microaneurysm', 'exudate', 'cotton-wool', 'lattice', 'laser', 'nv', 'cnv', 'edema', 'pigment', 'atrophy', 'detach', 'vitreous']) assert.ok(getStamp(id), id);
  assert.equal(getStamp('nope'), null);
});

test('stamps: only the point and small circle take the picked colour; the rest keep the chart colour', () => {
  assert.equal(stampColor(getStamp('dot'), '#1d4ed8'), '#1d4ed8');
  assert.equal(stampColor(getStamp('ring'), '#15803d'), '#15803d');
  assert.equal(stampColor(getStamp('tear'), '#15803d'), getStamp('tear').color);
  assert.equal(stampColor(getStamp('exudate'), '#d62828'), getStamp('exudate').color);
});

test('stamps: place, undo, rotation cycle and size presets', () => {
  const a = stamp({ x: 100.26, y: 50 }, 'tear', STAMP_SIZES.m, 90, '#c62828');
  assert.equal(a.type, 'stamp'); assert.deepEqual(a.points, [[100.3, 50]]); assert.equal(a.rot, 90);
  const list = add([], a); assert.equal(list.length, 1); assert.deepEqual(undo(list), []);
  assert.equal(nextRotation(0), 90); assert.equal(nextRotation(270), 0);
  assert.ok(STAMP_SIZES.s < STAMP_SIZES.m && STAMP_SIZES.m < STAMP_SIZES.l);
  assert.equal(stamp({ x: 1, y: 1 }, 'dot', 60, 45, '#d62828').rot, 0); // unknown rotation falls back
  assert.ok(ANNOTATION_TYPES.includes('stamp'));
});

test('stamps: sanitize keeps good stamps and drops bad symbol, colour, size, point or id', () => {
  const good = stamp({ x: 10, y: 20 }, 'exudate', 60, 0, '#e0a800');
  const out = sanitize([good, { ...good, id: 'bbb', symbol: 'evil' }, { ...good, id: 'ccc', color: 'red' }, { ...good, id: 'ddd', size: 5000 }, { ...good, id: 'eee', points: [[1e9, 0]] }, { ...good, id: 'a b' }, { ...good, id: 'fff', points: [[1, 2], [3, 4]] }]);
  assert.equal(out.length, 1); assert.equal(out[0].symbol, 'exudate');
  assert.deepEqual(out[0], good);
});

test('stamps: saved and reloaded with the drawing', () => {
  const mem = {}; const storage = { getItem: k => (k in mem ? mem[k] : null), setItem: (k, v) => { mem[k] = v; }, removeItem: k => { delete mem[k]; } };
  const list = [stamp({ x: 5, y: 6 }, 'hole', 36, 180, '#c62828'), stamp({ x: 7, y: 8 }, 'dot', 60, 0, '#1d4ed8')];
  assert.ok(saveAnnotations(storage, 'blank-canvas', list));
  assert.deepEqual(loadAnnotations(storage, 'blank-canvas'), list);
});
