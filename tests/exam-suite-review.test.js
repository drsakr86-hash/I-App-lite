// Regression tests for the exam-suite review fixes (feature/exam-suite-review).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as D from '../src/modules/atlas/drawings.js';
import { annotationScope, loadAnnotations, saveAnnotations, note, ANNOTATION_COLORS, ANNOTATION_COLOR_NAMES, STORAGE_PREFIX } from '../src/modules/atlas/annotations.js';
import { mergeData } from '../src/modules/sync/merge.js';
import { createPrivateStorage } from '../src/services/private-storage.js';
import { vaToLogMar, toNumber } from '../src/modules/patient-file/ophth.js';
import { suggestGeneral } from '../src/modules/ddx/general.js';
import { reasonText } from '../src/modules/ddx/apply.js';
import { suggest, isNormalText } from '../src/modules/special-exam/ddx.js';
import { getPatientFileHTML } from '../src/modules/print/index.js';
import { AR, EN } from '../src/modules/i18n/index.js';
import { STAMPS } from '../src/modules/atlas/stamps.js';
import { CASES } from '../src/modules/special-exam/model.js';

const src = p => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const doc = { id: 'u1', name: 'Dr A' };
const img = id => ({ provider: 'supabase', bucket: 'clinical-private', path: `atlas/12/${id}.png`, bytes: 10, sha256: 'x', mime: 'image/png' });
const approve = (id, at) => D.approveDrawing({ id, plateId: 'blank-canvas', annotations: [], image: img(id), patientId: 12, examId: 7, user: doc, role: 'doctor', now: at });
const memStore = () => { const m = new Map(); return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k), keys: () => [...m.keys()] }; };

// ---- atlas sketch never carries over to another patient's exam --------------------------------
test('review: exam sketch storage is scoped per patient + exam; standalone stays per plate', () => {
  assert.equal(annotationScope('blank-canvas', null), 'blank-canvas');
  assert.equal(annotationScope('blank-canvas', {}), 'blank-canvas');
  const a = annotationScope('blank-canvas', { patient: { id: 12 }, exam: { id: 1700000000000 } });
  const b = annotationScope('blank-canvas', { patient: { id: 13 }, exam: { id: 1700000000000 } });
  const c = annotationScope('blank-canvas', { patient: { id: 12 }, exam: { id: 1700000000001 } });
  assert.notEqual(a, b); assert.notEqual(a, c); assert.notEqual(a, 'blank-canvas');
  assert.match(annotationScope('p', { patient: { id: '1/../x' }, exam: { id: 'e:1' } }), /^p@p1x\.ee1$/);
  const st = memStore();
  saveAnnotations(st, a, [note({ x: 1, y: 1 }, 'tear at 2 o\'clock', ANNOTATION_COLORS[0])]);
  assert.equal(loadAnnotations(st, a).length, 1);
  assert.deepEqual(loadAnnotations(st, b), []); // the next patient starts on an empty canvas
  assert.ok(st.keys().every(k => k.startsWith(STORAGE_PREFIX) && k.startsWith('iapp_'))); // removed by the sign-out purge
});

test('review: AtlasScreen loads/saves the sketch through the scoped key', () => {
  const s = src('src/screens/AtlasScreen.jsx');
  assert.match(s, /annotationScope\(plateId, context\)/);
  assert.match(s, /loadAnnotations\(localStorage, scope\)/);
  assert.match(s, /saveAnnotations\(localStorage, scope, list\)/);
  assert.doesNotMatch(s, /Annotations\(localStorage, plateId/);
});

// ---- sync never drops drawings approved on another device ------------------------------------
test('review: three-way merge keeps remote-only drawings when the local copy of the exam wins', () => {
  const d1 = approve('aaaa1111', '2026-11-06T10:00:00Z');
  const d2 = approve('bbbb2222', '2026-11-06T11:00:00Z');
  const base = [{ id: 7, patientId: 12, diagnosis: '' }];
  const local = [{ id: 7, patientId: 12, diagnosis: 'edited offline', atlasDrawings: [d2] }];
  const remote = [{ id: 7, patientId: 12, diagnosis: '', atlasDrawings: [d1] }];
  const [m] = mergeData(base, local, remote);
  assert.equal(m.diagnosis, 'edited offline'); // local edit still wins
  assert.deepEqual(m.atlasDrawings.map(d => d.id), ['aaaa1111', 'bbbb2222']);
  // local without any drawings key at all
  const [m2] = mergeData(base, [{ id: 7, patientId: 12, diagnosis: 'x' }], remote);
  assert.deepEqual(m2.atlasDrawings.map(d => d.id), ['aaaa1111']);
});

test('review: three-way merge is unchanged for records without drawings', () => {
  const base = [{ id: 1, a: 1 }, { id: 2, a: 1 }];
  const local = [{ id: 1, a: 2 }, { id: 2, a: 1 }, { id: 3, a: 1 }];
  const remote = [{ id: 1, a: 3 }, { id: 2, a: 5 }, { id: 4, a: 1 }];
  assert.deepEqual(mergeData(base, local, remote), [{ id: 1, a: 2 }, { id: 2, a: 5 }, { id: 3, a: 1 }, { id: 4, a: 1 }]);
  assert.equal('atlasDrawings' in mergeData(base, local, remote)[0], false);
});

test('review: drawing merge tie (one revision on each device) keeps the superseded copy, skips junk', () => {
  const d = approve('aaaa1111', '2026-11-06T10:00:00Z');
  const revised = D.reviseDrawing([d], 'aaaa1111', { newId: 'cccc3333', annotations: [], image: img('cccc3333'), user: doc, role: 'doctor', now: '2026-11-06T12:00:00Z' });
  const toggled = D.setIncludeInReport([d], 'aaaa1111', true, { user: doc, role: 'doctor', now: '2026-11-06T13:00:00Z' });
  for (const [a, b] of [[toggled, revised], [revised, toggled]]) {
    const m = D.mergeDrawings(a, b);
    assert.equal(m.find(x => x.id === 'aaaa1111').status, 'superseded');
    assert.equal(m.filter(x => x.status === 'approved').length, 1);
  }
  assert.deepEqual(D.mergeDrawings([null, { nope: 1 }, d], []).map(x => x.id), ['aaaa1111']);
});

// ---- signed URLs only for well-formed drawing paths -----------------------------------------
test('review: only exact drawing paths can be signed', async () => {
  for (const ok of ['atlas/12/aaaa1111-bbbb.png', 'atlas/12/aaaa1111-t.webp', 'imaging/3/x.jpg']) assert.equal(D.isDrawingPath(ok), true, ok);
  for (const bad of ['atlas/12/../13/a.png', 'atlas/12/a/b.png', 'atlas/12/a.png?x=1', 'atlas/x/a.png', 'other/1/a.png', 'atlas/12/a.svg', '/atlas/12/a.png', null]) assert.equal(D.isDrawingPath(bad), false, String(bad));
  let signed = 0;
  const client = { storage: { from: () => ({ createSignedUrl: async () => { signed++; return { data: { signedUrl: 'https://s' } }; } }) } };
  const s = createPrivateStorage({ client, enabled: () => true });
  await assert.rejects(() => s.sign('atlas/12/../13/a.png'), /bad path/);
  assert.equal(signed, 0);
  assert.deepEqual(await s.sign('atlas/12/aaaa1111.png'), { url: 'https://s' });
});

test('review: exam card shows drawings only to roles that may see them', () => {
  const s = src('src/screens/patient-file/ExamsTab.jsx');
  assert.match(s, /visibleDrawings\(ex\.atlasDrawings, ctx\.session && ctx\.session\.role\)/);
  assert.doesNotMatch(s, /drawings=\{ex\.atlasDrawings\}/);
});

// ---- bundle: print templates do not pull the plate artwork into the main chunk ---------------
test('review: print templates do not import the atlas plates; captions come from the caller and are escaped', () => {
  assert.doesNotMatch(src('src/modules/print/templates.js'), /atlas\/model/);
  assert.match(src('src/screens/PatientFile.jsx'), /await import\('\.\.\/modules\/atlas\/model\.js'\)/);
  const PNG = 'data:image/png;base64,iVBORw0KGgo=';
  const d = { ...approve('aaaa1111', '2026-11-06T10:00:00Z'), includeInReport: true };
  const exam = { id: 7, patientId: 12, date: '2026-11-06', atlasDrawings: [d] };
  const html = getPatientFileHTML({ id: 12, name: 'T' }, [], [exam], [], null, null, { aaaa1111: PNG }, { aaaa1111: 'Fundus <b>OD</b>' });
  assert.ok(html.includes('Fundus &lt;b&gt;OD&lt;/b&gt;'));
  assert.ok(!html.includes('<b>OD</b>'));
  const noTitle = getPatientFileHTML({ id: 12, name: 'T' }, [], [exam], [], null, null, { aaaa1111: PNG });
  assert.ok(noTitle.includes(`<img src="${PNG}"`));
});

// ---- visual acuity / numbers as typed in the clinic ------------------------------------------
test('review: VA with qualifiers and Arabic digits is understood; junk is still null', () => {
  assert.deepEqual(vaToLogMar('CF 1m'), { logmar: 2, categorical: true });
  assert.deepEqual(vaToLogMar('FC@50cm'), { logmar: 2, categorical: true });
  assert.deepEqual(vaToLogMar('HM+'), { logmar: 2.3, categorical: true });
  assert.deepEqual(vaToLogMar('PL+ with PR'), { logmar: 2.7, categorical: true });
  assert.deepEqual(vaToLogMar('PL -ve'), { logmar: 3, categorical: true });
  assert.equal(vaToLogMar('٦/٦٠').logmar, 1);
  assert.equal(vaToLogMar('۶/۶').logmar, 0);
  assert.equal(vaToLogMar('٠٫٥').logmar, 0.3);
  assert.equal(vaToLogMar('.5').logmar, 0.3);
  for (const bad of ['CF?', 'HMX', 'PLX', 'abc', '6/0', '-', '']) assert.equal(vaToLogMar(bad), null, bad);
  assert.equal(toNumber('.6'), 0.6);
  assert.equal(toNumber('-.5'), -0.5);
  assert.equal(toNumber('٢٢'), 22);
  assert.equal(toNumber('.'), null);
});

// ---- DDx: general rules ---------------------------------------------------------------------
const ids = exam => suggestGeneral(exam).items.map(i => i.id);
const whyOf = (exam, id) => (suggestGeneral(exam).items.find(i => i.id === id) || { why: [] }).why.map(w => w.k);

test('review: DDx thresholds compare rounded differences (0.7 vs 0.5 C/D, 6/18 vs 6/9 VA)', () => {
  assert.ok(whyOf({ ophth: { cd: { od: '0.7', os: '0.5' } } }, 'glaucoma-optic-neuropathy').includes('cdAsym'));
  assert.ok(whyOf({ ophth: { cd: { od: '.5', os: '.3' } } }, 'glaucoma-optic-neuropathy').includes('cdAsym'));
  assert.ok(!ids({ ophth: { cd: { od: '0.5', os: '0.4' } } }).includes('glaucoma-optic-neuropathy'));
  assert.ok(whyOf({ visualAcuityR: '6/18', visualAcuityL: '6/9' }, 'organic-va').includes('vaAsym'));
});

test('review: DDx ignores empty, non-numeric and impossible values; reads Arabic digits', () => {
  assert.deepEqual(ids({}), []);
  assert.deepEqual(ids(null), []);
  assert.deepEqual(ids({ visualAcuityR: '', iopR: 'high', iopL: '—', ophth: { cd: { od: 'cupped', os: '' } } }), []);
  assert.deepEqual(ids({ ophth: { cd: { od: '6', os: '' } } }), []);       // C/D "6" is a slip, not 6.0
  assert.deepEqual(ids({ iopR: '210' }), []);                               // impossible IOP
  assert.ok(ids({ iopR: '٢٨' }).includes('ocular-htn-glaucoma'));
  assert.ok(!ids({ iopR: '21' }).includes('ocular-htn-glaucoma'));          // > 21 only, as in the form
  const sev = suggestGeneral({ visualAcuityR: 'CF 1m' }).items.find(i => i.id === 'media-or-severe');
  assert.equal(sev && sev.tier, 'urgent');
});

test('review: DDx reason shows the Arabic chief complaint in the reader language', () => {
  assert.equal(reasonText({ k: 'complaint', p: { c: 'صداع' } }, 'en').includes('Headache'), true);
  assert.equal(reasonText({ k: 'complaint', p: { c: 'صداع' } }, 'ar').includes('صداع'), true);
  assert.equal(reasonText({ k: 'iopHigh', p: { e: 'OD', v: 30 } }, 'en').includes('30'), true);
});

// ---- DDx: special sheets --------------------------------------------------------------------
test('review: normal free-text entries do not trigger a differential', () => {
  for (const s of ['Normal', 'full', 'Full and free', 'nil', 'None.', '-', 'طبيعي', 'لا يوجد', '17/17', '١٧/١٧', '']) assert.equal(isNormalText(s), true, s);
  for (const s of ['8/17', 'limited abduction OD', 'face turn to right', 'red desaturation OS']) assert.equal(isNormalText(s), false, s);
  assert.deepEqual(suggest('neuro', { color: { od: 'Normal', os: '17/17' } }).ddx, []);
  assert.deepEqual(suggest('neuro', { motility: 'Full' }).ddx, []);
  assert.ok(suggest('neuro', { color: { od: '8/17', os: '17/17' } }).ddx.includes('Optic nerve dysfunction'));
  assert.ok(suggest('neuro', { motility: 'limited abduction OD' }).ddx.includes('Cranial nerve palsy (III / IV / VI)'));
  assert.ok(!suggest('squint', { headPosture: 'none', type: 'Esotropia' }).ddx.some(x => x.startsWith('Ocular torticollis')));
  assert.ok(suggest('squint', { headPosture: 'face turn right' }).ddx.some(x => x.startsWith('Ocular torticollis')));
});

test('review: glaucoma sheet reads Arabic-digit CCT and does not flag an exactly-0.2 C/D asymmetry', () => {
  assert.ok(suggest('glaucoma', { cct: { od: '٤٨٠', os: '' } }).ddx.includes('IOP underestimated (thin cornea)'));
  assert.ok(suggest('glaucoma', { cct: { od: 'CCT 480 µm', os: '' } }).ddx.includes('IOP underestimated (thin cornea)'));
  const flag = 'Glaucomatous optic neuropathy (C/D ≥ 0.7 or asymmetry > 0.2)';
  assert.ok(!suggest('glaucoma', { cd: { od: '0.6', os: '0.4' } }).ddx.includes(flag));
  assert.ok(suggest('glaucoma', { cd: { od: '0.6', os: '0.3' } }).ddx.includes(flag));
});

// ---- i18n: keys built at run time exist in both languages -----------------------------------
test('review: dynamic i18n keys of the exam suite exist in Arabic and English', () => {
  const keys = [];
  for (const k of ['select', 'pen', 'arrow', 'text', 'stamp']) keys.push('atlas.tool.' + k);
  for (const k of ['names', 'numbers', 'off', 'both']) keys.push('atlas.labels.' + k);
  for (const k of ['s', 'm', 'l']) keys.push('atlas.stamp.' + k);
  for (const k of ['approved', 'superseded']) keys.push('atlas.attach.status.' + k);
  for (const k of ANNOTATION_COLOR_NAMES) keys.push('atlas.color.' + k);
  for (const c of CASES) { keys.push('g11.sp.case.' + c.id); for (const f of c.fields) keys.push(`g11.sp.f.${c.id}.${f.k}`); }
  for (const m of src('src/modules/ddx/general.js').matchAll(/k: '([a-zA-Z]+)'/g)) keys.push('g13.ddx.r.' + m[1]);
  assert.deepEqual(keys.filter(k => !(k in AR) || !(k in EN)), []);
  assert.equal(ANNOTATION_COLOR_NAMES.length, ANNOTATION_COLORS.length);
  assert.ok(STAMPS.every(s => s.name && s.name.ar && s.name.en));
});
