// Special-case examination sheets: stored on the exam record, tolerant normalisation,
// print section.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CASES, CASE_IDS, blankCase, normalizeSpecial, caseIsEmpty, finalizeExamSpecial, specialSummary,
  MAX_TEXT
} from '../src/modules/special-exam/model.js';
import { AR, EN } from '../src/modules/i18n/index.js';
import { getPatientFileHTML } from '../src/modules/print/index.js';

test('special: the requested cases exist and each has fields', () => {
  for (const id of ['neuro', 'uveitis', 'squint']) assert.ok(CASE_IDS.includes(id), id);
  for (const c of CASES) {
    assert.ok(c.fields.length > 0, c.id);
    assert.ok(!('diagrams' in c), c.id + ': drawings now live in the atlas step');
  }
});

test('special: every dynamic label exists in Arabic and English', () => {
  const keys = [];
  for (const c of CASES) {
    keys.push('g11.sp.case.' + c.id);
    for (const f of c.fields) keys.push('g11.sp.f.' + c.id + '.' + f.k);
  }
  const missing = keys.filter(k => !(k in AR) || !(k in EN));
  assert.deepEqual(missing, []);
});

test('special: records without sheets stay byte-for-byte unchanged on save', () => {
  const old = { id: 1, date: '2026-01-01', diagnosis: 'x' };
  assert.deepEqual(finalizeExamSpecial(old), old);
  assert.equal('special' in finalizeExamSpecial({ ...old, special: { neuro: blankCase('neuro') } }), false);
  assert.equal('special' in finalizeExamSpecial({ ...old, special: {} }), false);
  const u = blankCase('uveitis');
  u.acCells = { od: '2+', os: '' };
  const saved = finalizeExamSpecial({ ...old, special: { uveitis: u, squint: blankCase('squint') } });
  assert.deepEqual(Object.keys(saved.special), ['uveitis']);
  assert.equal(saved.special.uveitis.acCells.od, '2+');
});

test('special: malformed or hostile stored data never throws and is cleaned', () => {
  assert.deepEqual(normalizeSpecial(null), {});
  assert.deepEqual(normalizeSpecial([1, 2]), {});
  const n = normalizeSpecial({ hacked: { a: 1 }, neuro: { rapd: 'not-an-object', disc: { od: 5, os: null }, motility: { x: 1 }, bogus: 'y' } });
  assert.deepEqual(Object.keys(n), ['neuro']);
  assert.deepEqual(n.neuro.rapd, { od: '', os: '' });
  assert.deepEqual(n.neuro.disc, { od: '5', os: '' });
  assert.equal(n.neuro.motility, '');
  assert.equal('bogus' in n.neuro, false);
  assert.equal(normalizeSpecial({ dr: { hba1c: 'x'.repeat(5000) } }).dr.hba1c.length, MAX_TEXT);
  assert.ok(caseIsEmpty('neuro', { motility: '   ' }));
  assert.ok(!caseIsEmpty('neuro', { motility: 'LR palsy' }));
  assert.ok(caseIsEmpty('unknown', { a: 'b' }));
});

test('special: summary lists filled rows only, in sheet order', () => {
  const s = blankCase('squint');
  s.type = 'Exotropia';
  s.cycloRefraction = { od: '+1.50', os: '' };
  const out = specialSummary({ special: { squint: s, neuro: blankCase('neuro') } });
  assert.equal(out.length, 1);
  assert.equal(out[0].id, 'squint');
  assert.deepEqual(out[0].rows, [
    { k: 'type', eyes: false, value: 'Exotropia' },
    { k: 'cycloRefraction', eyes: true, od: '+1.50', os: '' }
  ]);
  assert.deepEqual(specialSummary({}), []);
});

test('special: patient-file print shows the sheet, escaped', () => {
  const u = blankCase('uveitis');
  u.location = 'Anterior';
  u.kp = { od: 'Mutton-fat', os: '<b>x</b>' };
  const exam = { id: 9, patientId: 1, date: '2026-11-05', special: { uveitis: u } };
  const html = getPatientFileHTML({ id: 1, name: 'P' }, [], [exam], [], null, {});
  assert.ok(html.includes(AR['g11.sp.case.uveitis']));
  assert.ok(html.includes('Mutton-fat'));
  assert.ok(html.includes(AR['g11.sp.f.uveitis.location']));
  assert.ok(!html.includes('<b>x</b>'));
});

import { suggest, appendWorkup, workupLine } from '../src/modules/special-exam/ddx.js';

test('ddx: nothing is suggested until a finding is picked', () => {
  for (const c of CASES) assert.deepEqual(suggest(c.id, blankCase(c.id)), { ddx: [], workup: [] }, c.id);
  assert.deepEqual(suggest('nope', {}), { ddx: [], workup: [] });
});

test('ddx: uveitis follows location, KPs and hypopyon', () => {
  const u = blankCase('uveitis');
  u.location = 'Anterior'; u.kp = { od: 'Mutton-fat', os: '' }; u.hypopyon = { od: 'Present', os: '' };
  const s = suggest('uveitis', u);
  assert.ok(s.ddx.includes('Sarcoidosis') && s.ddx.includes('Behçet disease'));
  assert.ok(s.workup.includes('QuantiFERON-TB Gold') && s.workup.includes('Serum ACE + lysozyme') && s.workup.includes('HLA-B51'));
  assert.equal(new Set(s.workup).size, s.workup.length);
});

test('ddx: neuro separates bilateral disc swelling from a third-nerve emergency', () => {
  const n = blankCase('neuro');
  n.disc = { od: 'Swollen', os: 'Swollen' };
  assert.ok(suggest('neuro', n).ddx[0].startsWith('Papilloedema'));
  const p = blankCase('neuro');
  p.pupil = { od: 'Fixed dilated', os: '' }; p.ptosis = { od: 'Severe', os: '' };
  assert.ok(suggest('neuro', p).workup.includes('URGENT CT angiography / MR angiography'));
});

test('ddx: squint, glaucoma and DR give type-specific lists', () => {
  const q = blankCase('squint'); q.type = 'Hypertropia';
  assert.ok(suggest('squint', q).workup.includes('Parks-Bielschowsky 3-step test'));
  const g = blankCase('glaucoma'); g.cd = { od: '0.8', os: '0.4' };
  assert.ok(suggest('glaucoma', g).ddx.some(x => x.startsWith('Glaucomatous optic neuropathy')));
  const d = blankCase('dr'); d.grade = { od: 'PDR', os: 'Mild NPDR' };
  const s = suggest('dr', d);
  assert.ok(s.ddx.includes('Sickle-cell retinopathy') && s.workup.includes('Gonioscopy (NVA)'));
});

test('ddx: adding the work-up to the plan is idempotent and keeps typed text', () => {
  const list = ['CBC', 'ESR / CRP'];
  assert.equal(appendWorkup('', list), workupLine(list));
  const once = appendWorkup('Topical steroid', list);
  assert.equal(once, 'Topical steroid\nWork-up: CBC, ESR / CRP');
  assert.equal(appendWorkup(once, list), once);
  assert.equal(appendWorkup('x', []), 'x');
});
