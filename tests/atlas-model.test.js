import test from 'node:test';
import assert from 'node:assert/strict';
import { PLATES } from '../src/modules/atlas/plates/index.js';
import { validatePlate, listPlates, getPlate, getPart, searchParts, normalizeText, labelText, labelPlacement, partsInDrawOrder, symAxis, CONTENT_STATUS } from '../src/modules/atlas/model.js';
import { can } from '../src/app/permissions.js';
import { moreNavItems, isMoreActive, NAV, atlasTabAllowed } from '../src/components/bottomnav-model.js';

test('atlas: the seven original plates exist first, in order, then the supplied image plates', () => {
  assert.deepEqual(PLATES.slice(0, 7).map(p => p.id), ['general-eye', 'retina-layers', 'vitreoretinal-interface', 'extraocular-muscles', 'visual-pathway', 'anterior-segment-angle', 'lens-pupil']);
  assert.deepEqual(PLATES.slice(7).map(p => p.id), ['fundus-photo-od', 'fundus-photo-os', 'fundus-illustration-od', 'fundus-illustration-os', 'extraocular-muscles-od', 'extraocular-muscles-os', 'anterior-segment-section', 'fundus-chart-od', 'fundus-chart-os', 'macula-chart-od', 'macula-chart-os', 'anterior-chart-od', 'anterior-chart-os', 'blank-canvas']);
  assert.deepEqual(listPlates().slice(0, 7).map(p => p.count > 4), PLATES.slice(0, 7).map(() => true));
});
test('atlas: every plate passes validation (bilingual text, licence, bounds, whitelisted shape keys)', () => {
  for (const p of PLATES) assert.deepEqual(validatePlate(p), [], p.id);
});
test('atlas: content is draft until a doctor approves it, and provenance is original artwork', () => {
  for (const p of PLATES) { assert.equal(p.status, p.blank ? CONTENT_STATUS.APPROVED : CONTENT_STATUS.DRAFT); assert.equal(p.source.type, p.image ? 'supplied' : 'original'); assert.ok(p.references.length); }
});
test('atlas: part ids are unique per plate and every part is addressable', () => {
  for (const p of PLATES) { const ids = p.parts.map(x => x.id); assert.equal(new Set(ids).size, ids.length); for (const id of ids) assert.equal(getPart(getPlate(p.id), id).id, id); }
  assert.equal(getPlate('nope'), null); assert.equal(getPart(null, 'x'), null);
});
test('atlas: validation actually catches problems', () => {
  const p = JSON.parse(JSON.stringify(PLATES[0]));
  p.parts[0].shapes[0].onclick = 'alert(1)'; p.parts[1].name.en = 'القرنية'; p.parts[2].anchor = [9999, 0]; p.parts[3].id = p.parts[4].id; p.source.license = '';
  p.parts[5].shapes[0].f = 'url(javascript:1)'; p.status = 'maybe';
  const e = validatePlate(p).join('\n');
  for (const needle of ['not allowed', 'Arabic letters', 'anchor outside', 'duplicate part id', 'licence', 'bad colour', 'bad status']) assert.ok(e.includes(needle), needle);
});
test('atlas: search finds Arabic and English names, ignores diacritics/alef forms, ranks name matches first', () => {
  assert.equal(normalizeText('أَلْقَرْنِيَّة'), normalizeText('القرنيه'));
  assert.ok(searchParts('cornea')[0].plateId.length);
  assert.ok(searchParts('القرنية').some(h => h.partId === 'cornea'));
  assert.ok(searchParts('macula').some(h => h.partId === 'macula'));
  assert.deepEqual(searchParts('a'), []);
  assert.equal(searchParts('zzzzqq').length, 0);
  assert.ok(searchParts('trabecular')[0].score >= 3);
});
test('atlas: label text and placement', () => {
  const part = getPart(PLATES[0], 'cornea');
  assert.equal(labelText(part, 'en'), 'Cornea'); assert.equal(labelText(part, 'ar'), 'القرنية'); assert.equal(labelText(part, 'en', true), 'القرنية · Cornea');
  assert.equal(labelPlacement(part).anchor, 'end');
  assert.equal(labelPlacement({ anchor: [1, 2], label: [3, 4, 's'] }).anchor, 'start');
});
test('atlas: draw order follows z, and the mirror axis is the plate centre', () => {
  const o = partsInDrawOrder(PLATES[0]).map(p => p.z || 0); assert.deepEqual(o, [...o].sort((a, b) => a - b));
  assert.equal(symAxis(getPlate('visual-pathway')), 350);
});
test('atlas: navigation tab appears only with the flag AND the permission; NAV itself is untouched', () => {
  assert.equal(NAV.length, 8);
  assert.ok(!moreNavItems('admin').some(i => i.id === 'atlas'));
  assert.ok(!moreNavItems('admin', { atlas: false }).some(i => i.id === 'atlas'));
  assert.ok(moreNavItems('admin', { atlas: true }).some(i => i.id === 'atlas'));
  assert.ok(moreNavItems('doctor', { atlas: true }).some(i => i.id === 'atlas'));
  for (const r of ['secretary', 'employee']) { assert.ok(!moreNavItems(r, { atlas: true }).some(i => i.id === 'atlas')); assert.equal(atlasTabAllowed(r, { atlas: true }), false); }
  assert.equal(isMoreActive('atlas', 'admin', { atlas: true }), true); assert.equal(isMoreActive('atlas', 'admin'), false);
  assert.equal(can('admin', 'atlas', 'read'), true); assert.equal(can('secretary', 'atlas', 'read'), false);
});
