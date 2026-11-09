import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, statSync } from 'node:fs';
import { PLATES } from '../src/modules/atlas/plates/index.js';
import { validatePlate, plateImageUrl, getPlate } from '../src/modules/atlas/model.js';

const photos = PLATES.filter(p => p.image);

test('image plates: seven supplied plates, each with a real webp asset in public/atlas', () => {
  assert.equal(photos.length, 7);
  for (const p of photos) {
    const f = new URL('../public/' + p.image.src, import.meta.url);
    assert.ok(existsSync(f), p.image.src);
    assert.ok(statSync(f).size > 10 * 1024 && statSync(f).size < 400 * 1024, `${p.image.src} size`);
  }
});

test('image plates: viewBox equals the image size and the image path is whitelisted', () => {
  for (const p of photos) assert.deepEqual(p.viewBox, [0, 0, p.image.width, p.image.height]);
  const bad = JSON.parse(JSON.stringify(photos[0]));
  bad.image.src = '../secret.webp';
  assert.ok(validatePlate(bad).some(m => /bad image src/.test(m)));
  const bad2 = JSON.parse(JSON.stringify(photos[0]));
  bad2.image.src = 'https://evil.example/x.webp';
  assert.ok(validatePlate(bad2).some(m => /bad image src/.test(m)));
  const bad3 = JSON.parse(JSON.stringify(photos[0]));
  bad3.viewBox = [0, 0, 10, 10];
  assert.ok(validatePlate(bad3).some(m => /viewBox must equal/.test(m)));
});

test('image plates: stay draft, record that the origin and licence are unverified, and are never "approved"', () => {
  for (const p of photos) {
    assert.equal(p.status, 'draft');
    assert.equal(p.source.type, 'supplied');
    assert.match(p.source.license, /not verified/i);
  }
});

test('image plates: OD/OS orientation (fundus disc side, muscle trochlea side) matches the label', () => {
  const x = (plate, part) => getPlate(plate).parts.find(q => q.id === part).anchor[0];
  // right eye photo: disc is to the right of the fovea; left eye: to the left
  assert.ok(x('fundus-photo-od', 'optic-disc') > x('fundus-photo-od', 'fovea'));
  assert.ok(x('fundus-photo-os', 'optic-disc') < x('fundus-photo-os', 'fovea'));
  assert.ok(x('fundus-illustration-od', 'optic-disc') > x('fundus-illustration-od', 'fovea'));
  assert.ok(x('fundus-illustration-os', 'optic-disc') < x('fundus-illustration-os', 'fovea'));
  // nasal side: medial rectus and trochlea are on the nose side (right for OD, left for OS), lateral rectus opposite
  assert.ok(x('extraocular-muscles-od', 'mr-od') > x('extraocular-muscles-od', 'lr-od'));
  assert.ok(x('extraocular-muscles-od', 'trochlea-od') > 768);
  assert.ok(x('extraocular-muscles-os', 'mr-os') < x('extraocular-muscles-os', 'lr-os'));
  assert.ok(x('extraocular-muscles-os', 'trochlea-os') < 768);
});

test('image plates: bilingual part names and a URL that resolves next to the app', () => {
  for (const p of photos) for (const part of p.parts) { assert.ok(part.name.ar && part.name.en); assert.ok(!/[؀-ۿ]/.test(part.name.en)); }
  assert.equal(plateImageUrl(photos[0]), 'http://localhost/atlas/fundus-photo-od.webp');
  assert.equal(plateImageUrl(PLATES[0]), null);
});

test('blank canvas: the only plate shown by default, no anatomy, validates; the library can be switched back on', async () => {
  const { visiblePlates, LIBRARY_VISIBLE } = await import('../src/modules/atlas/model.js');
  assert.equal(LIBRARY_VISIBLE, false);
  assert.deepEqual(visiblePlates().map(p => p.id), ['blank-canvas']);
  assert.equal(visiblePlates(true).length, PLATES.length);
  const blank = getPlate('blank-canvas');
  assert.equal(blank.blank, true); assert.equal(blank.parts.length, 0);
  assert.deepEqual(validatePlate(blank), []);
  const bad = JSON.parse(JSON.stringify(blank)); bad.parts = [{ id: 'x' }];
  assert.ok(validatePlate(bad).some(m => /blank plate has no parts/.test(m)));
  const noBlank = JSON.parse(JSON.stringify(blank)); delete noBlank.blank;
  assert.ok(validatePlate(noBlank).some(m => /no parts/.test(m)));
});

test('external image: file checks, downscale (never enlarge) and centred fit', async () => {
  const { checkBackgroundFile, scaledSize, fitRect, BG_MAX_SIDE } = await import('../src/modules/atlas/background.js');
  assert.equal(checkBackgroundFile({ type: 'image/jpeg', size: 1000 }), null);
  assert.equal(checkBackgroundFile({ type: 'image/png', size: 1000 }), null);
  assert.equal(checkBackgroundFile({ type: 'image/gif', size: 1000 }), 'type');
  assert.equal(checkBackgroundFile({ type: 'image/svg+xml', size: 1000 }), 'type');
  assert.equal(checkBackgroundFile({ type: 'image/png', size: 0 }), 'size');
  assert.equal(checkBackgroundFile({ type: 'image/png', size: 16 * 1024 * 1024 }), 'size');
  assert.equal(checkBackgroundFile(null), 'type');
  assert.deepEqual(scaledSize(4000, 2000), { width: BG_MAX_SIDE, height: BG_MAX_SIDE / 2 });
  assert.deepEqual(scaledSize(800, 600), { width: 800, height: 600 });
  assert.throws(() => scaledSize(0, 10));
  const r = fitRect(1000, 1000, 1200, 800);
  assert.deepEqual(r, { x: 200, y: 0, width: 800, height: 800 });
  const w = fitRect(2400, 800, 1200, 800);
  assert.equal(w.width, 1200); assert.equal(w.height, 400); assert.equal(w.x, 0); assert.equal(w.y, 200);
  assert.throws(() => fitRect(10, 0, 1200, 800));
});

test('blank canvas: approving twice in one exam keeps two drawings (no silent replacement)', async () => {
  const { approveIntoList } = await import('../src/modules/atlas/attach.js');
  const blank = getPlate('blank-canvas');
  let n = 0;
  const storage = { uploadAtlasImage: async ({ id }) => ({ provider: 'supabase', bucket: 'clinical-private', path: `atlas/12/${id}.png`, thumbPath: '', bytes: 1, sha256: '', mime: 'image/png' }) };
  const base = { storage, plate: blank, annotations: [{ id: 'a' }], png: {}, patient: { id: 12 }, exam: { id: 5, patientId: 12 }, user: { id: 'u1', name: 'د' }, role: 'doctor', newId: () => 'id-' + (++n) + '-aaaaaaaa' };
  const one = await approveIntoList({ ...base, list: [] });
  const two = await approveIntoList({ ...base, list: one.list });
  assert.equal(two.list.length, 2);
  assert.ok(two.list.every(d => d.status === 'approved' && d.plateId === 'blank-canvas'));
});
