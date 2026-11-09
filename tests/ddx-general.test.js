import test from 'node:test';
import assert from 'node:assert/strict';
import { suggestGeneral, findingsOf, T, TIER } from '../src/modules/ddx/general.js';
import { appendDiagnosis, hasDiagnosis, reasonText } from '../src/modules/ddx/apply.js';
import { can } from '../src/app/permissions.js';
import { AR, EN } from '../src/modules/i18n/index.js';

const ids = ex => suggestGeneral(ex).items.map(i => i.id);
const item = (ex, id) => suggestGeneral(ex).items.find(i => i.id === id);

test('ddx: an empty or partly empty exam suggests nothing and never throws', () => {
  assert.deepEqual(suggestGeneral({}).items, []);
  assert.deepEqual(suggestGeneral(null).items, []);
  assert.deepEqual(suggestGeneral({ colorVision: 'طبيعي', contrast: 'طبيعي', coverTest: 'طبيعي', visualAcuityR: '1.00', iopR: '15' }).items, []);
  assert.deepEqual(suggestGeneral({ ophth: 'garbage', iopR: 'abc', visualAcuityR: '??' }).items, []);
});

test('ddx: pin-hole gain points to refractive error; no gain points to an organic cause', () => {
  const gain = { visualAcuityR: '0.3', ophth: { va: { od: { ucva: '0.1', ph: '0.5' } } } };
  assert.ok(ids(gain).includes('refractive'));
  assert.match(reasonText(item(gain, 'refractive').why[0], 'en'), /Pin-hole improves vision in OD \(0\.1 to 0\.5\)/);
  const none = { visualAcuityR: '0.2', ophth: { va: { od: { ucva: '0.2', ph: '0.2' } } } };
  assert.ok(!ids(none).includes('refractive'));
  assert.ok(item(none, 'organic-va').why.some(w => w.k === 'phNoImprove'));
});

test('ddx: counting fingers or worse is urgent', () => {
  const r = item({ visualAcuityL: 'HM' }, 'media-or-severe');
  assert.equal(r.tier, TIER.URGENT);
  assert.deepEqual(r.why[0], { k: 'vaSevere', p: { e: 'OS', v: 'HM' } });
  assert.ok(suggestGeneral({ visualAcuityL: 'HM' }).items[0].tier === TIER.URGENT, 'urgent items come first');
});

test('ddx: IOP above the form limit suggests glaucoma work-up; painful red eye with high IOP is urgent angle closure', () => {
  assert.ok(!ids({ iopR: String(T.IOP_HIGH) }).includes('ocular-htn-glaucoma')); // equal is not high
  const a = { iopR: '24' };
  assert.ok(ids(a).includes('ocular-htn-glaucoma'));
  assert.ok(item(a, 'ocular-htn-glaucoma').workup.includes('Gonioscopy'));
  assert.ok(!ids(a).includes('acute-angle-closure'));
  const b = { iopR: '34'.slice(0, 2), chiefComplaint: 'ألم في العين' };
  assert.equal(item(b, 'acute-angle-closure').tier, TIER.URGENT);
});

test('ddx: asymmetry rules need real differences', () => {
  assert.ok(ids({ iopR: '30', iopL: '20' }).includes('secondary-glaucoma'));
  assert.ok(!ids({ iopR: '19', iopL: '14' }).includes('secondary-glaucoma')); // asymmetric but not high
  assert.ok(ids({ ophth: { cd: { od: '0.8', os: '0.4' } } }).includes('glaucoma-optic-neuropathy'));
  assert.ok(!ids({ ophth: { cd: { od: '0.4', os: '0.3' } } }).includes('glaucoma-optic-neuropathy'));
  assert.ok(ids({ ophth: { refraction: { od: { sph: '-1', cyl: '' }, os: { sph: '1.5', cyl: '' } } } }).includes('anisometropia'));
});

test('ddx: CMT, VF, refraction thresholds', () => {
  assert.ok(ids({ ophth: { cmt: { od: '412', os: '' } } }).includes('macular-oedema'));
  assert.ok(ids({ ophth: { cmt: { od: '', os: '180' } } }).includes('macular-thinning'));
  assert.ok(!ids({ ophth: { cmt: { od: '250', os: '260' } } }).length);
  assert.ok(ids({ ophth: { vfMd: { od: '-9.4', os: '' } } }).includes('established-field-loss'));
  assert.ok(ids({ ophth: { refraction: { od: { sph: '-8', cyl: '' }, os: { sph: '', cyl: '' } } } }).includes('high-myopia'));
  assert.ok(ids({ ophth: { refraction: { od: { sph: '+5', cyl: '' }, os: { sph: '', cyl: '' } } } }).includes('high-hyperopia'));
  assert.ok(ids({ ophth: { refraction: { od: { sph: '', cyl: '-3.5' }, os: { sph: '', cyl: '' } } } }).includes('astigmatism-ectasia'));
});

test('ddx: complaints and screening tests', () => {
  assert.equal(item({ chiefComplaint: 'وميض أو بقع سوداء' }, 'rd-tear').tier, TIER.URGENT);
  assert.ok(ids({ chiefComplaint: 'رؤية مزدوجة' }).includes('diplopia-strabismus'));
  assert.ok(ids({ coverTest: 'إيجابي' }).includes('diplopia-strabismus'));
  assert.ok(ids({ colorVision: 'غير طبيعي' }).includes('optic-neuropathy-colour'));
  assert.ok(ids({ contrast: 'منخفض' }).includes('low-contrast'));
  assert.ok(ids({ chiefComplaint: 'مياه بيضاء' }).includes('cataract-media'));
  assert.ok(ids({ chiefComplaint: 'عين حمراء' }).includes('red-eye'));
  assert.ok(!ids({ chiefComplaint: 'عين حمراء', visualAcuityR: '1.00' }).includes('keratitis-uveitis'));
  assert.equal(item({ chiefComplaint: 'عين حمراء', visualAcuityR: '0.2' }, 'keratitis-uveitis').tier, TIER.URGENT);
});

test('ddx: free text is never read', () => {
  assert.deepEqual(suggestGeneral({ anteriorSegment: 'hypopyon, cells', posteriorSegment: 'retinal detachment', notes: 'angle closure', diagnosis: 'glaucoma', treatmentPlan: 'x' }).items, []);
});

test('ddx: every suggestion carries a reason and an English label; repeated findings merge into one item', () => {
  const ex = { chiefComplaint: 'ألم في العين', visualAcuityR: '0.1', visualAcuityL: '0.1', iopR: '30', iopL: '28', ophth: { cd: { od: '0.8', os: '0.8' } } };
  const items = suggestGeneral(ex).items;
  assert.equal(new Set(items.map(i => i.id)).size, items.length);
  for (const i of items) { assert.ok(i.why.length > 0, i.id); assert.ok(/^[\x20-\x7e]+$/.test(i.label), i.id); assert.ok(i.workup.every(w => /^[\x20-\x7e]+$/.test(w))); }
  assert.ok(items.find(i => i.id === 'ocular-htn-glaucoma').why.length >= 2); // OD and OS merged
});

test('ddx: every reason key exists in Arabic and English and fills its placeholders', () => {
  const keys = new Set();
  const ex = { chiefComplaint: 'ألم في العين', visualAcuityR: 'HM', visualAcuityL: '0.2', iopR: '30', iopL: '12', colorVision: 'غير طبيعي', contrast: 'منخفض', coverTest: 'إيجابي', ophth: { va: { od: { ucva: '0.1', ph: '0.5' }, os: { ucva: '0.2', ph: '0.2' } }, cd: { od: '0.8', os: '0.3' }, cmt: { od: '400', os: '150' }, vfMd: { od: '-8', os: '' }, refraction: { od: { sph: '-8', cyl: '-4' }, os: { sph: '5', cyl: '' } } } };
  for (const i of suggestGeneral(ex).items) for (const w of i.why) {
    keys.add(w.k);
    for (const lang of ['ar', 'en']) assert.ok(!/\{\w+\}/.test(reasonText(w, lang)), `${i.id} ${w.k} ${lang}`);
  }
  assert.ok(keys.size >= 14, 'covered ' + keys.size + ' reason kinds');
  for (const k of keys) { assert.ok(('g13.ddx.r.' + k) in AR, k); assert.ok(('g13.ddx.r.' + k) in EN, k); }
  for (const k of Object.keys(AR).filter(x => x.startsWith('g13.'))) assert.ok(k in EN, k);
  for (const k of Object.keys(EN).filter(x => x.startsWith('g13.'))) assert.ok(k in AR, k);
});

test('ddx: adding to the diagnosis appends once, keeps the doctor\'s text, never overwrites', () => {
  assert.equal(appendDiagnosis('', 'Cataract'), 'Cataract');
  assert.equal(appendDiagnosis('POAG OD', 'Cataract'), 'POAG OD\nCataract');
  assert.equal(appendDiagnosis('POAG OD\nCataract', 'cataract'), 'POAG OD\nCataract');
  assert.equal(appendDiagnosis(undefined, ' '), '');
  assert.ok(hasDiagnosis('a\nCataract', 'Cataract') && !hasDiagnosis('a', 'Cataract'));
});

test('ddx: only doctor and admin may see the assistant', () => {
  assert.ok(can('admin', 'ddx', 'read') && can('doctor', 'ddx', 'read'));
  assert.ok(!can('secretary', 'ddx', 'read') && !can('employee', 'ddx', 'read') && !can('patient', 'ddx', 'read'));
});

test('ddx: findingsOf reads both flat and structured fields', () => {
  const f = findingsOf({ iopR: '٢٤', visualAcuityL: 'CF', ophth: { cmt: { od: '300', os: '' } } });
  assert.equal(f.eyes.od.iop, 24);
  assert.equal(f.eyes.os.bcvaL.categorical, true);
  assert.equal(f.eyes.od.cmt, 300);
});
