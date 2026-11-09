import test from 'node:test';
import assert from 'node:assert/strict';
import { zoomAt, zoomCentered, panBy, clientToPlate, clampView, zoomLevel, pinchFactor, wheelFactor, defaultLabelMode, labelFontUnits, MAX_ZOOM } from '../src/modules/atlas/viewport.js';

const base = { x: 0, y: 0, w: 600, h: 400 };
test('viewport: zoom keeps the pointed plate point fixed and stays inside the plate', () => {
  const v = zoomAt(base, base, 2, 300, 200);
  assert.equal(zoomLevel(v, base), 2);
  assert.deepEqual([v.x, v.y, v.w, v.h], [150, 100, 300, 200]);
  const c = zoomAt(base, base, 2, 0, 0);
  assert.deepEqual([c.x, c.y], [0, 0]);
  const e = zoomAt(base, base, 2, 600, 400);
  assert.deepEqual([e.x, e.y], [300, 200]);
});
test('viewport: zoom is limited to 1..MAX and zooming out of the base is a no-op', () => {
  assert.deepEqual(zoomAt(base, base, 0.5, 100, 100), base);
  let v = base; for (let i = 0; i < 30; i++) v = zoomCentered(v, base, 1.4);
  assert.equal(zoomLevel(v, base), MAX_ZOOM);
});
test('viewport: pan is clamped to the plate and does nothing at 1x', () => {
  assert.deepEqual(panBy(base, base, 50, 50), base);
  const z = zoomCentered(base, base, 2);
  const p = panBy(z, base, -1000, -1000);
  assert.equal(p.x + p.w, 600); assert.equal(p.y + p.h, 400);
  assert.deepEqual(clampView({ x: -50, y: -50, w: 100, h: 66.67 }, base).x, 0);
});
test('viewport: client -> plate mapping follows the current viewBox', () => {
  const rect = { left: 10, top: 20, width: 300, height: 200 };
  assert.deepEqual(clientToPlate({ x: 160, y: 120 }, rect, base), { x: 300, y: 200 });
  const v = { x: 100, y: 50, w: 300, h: 200 };
  assert.deepEqual(clientToPlate({ x: 10, y: 20 }, rect, v), { x: 100, y: 50 });
});
test('viewport: gesture helpers and label sizing', () => {
  assert.equal(pinchFactor(100, 200), 2); assert.equal(pinchFactor(0, 5), 1);
  assert.ok(wheelFactor(-1) > 1 && wheelFactor(1) < 1);
  assert.equal(defaultLabelMode(390), 'numbers'); assert.equal(defaultLabelMode(900), 'names');
  assert.equal(labelFontUnits(12, base, { width: 600 }), 12);
  assert.equal(labelFontUnits(12, { ...base, w: 300 }, { width: 600 }), 6); // zoomed in -> smaller units, same pixels
});
