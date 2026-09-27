import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_TESTS, buildAllTests, buildCats, isSelected, getEye, toggleSelection,
  cycleEyeValue, selectAllInCategory, addCustomTest, removeCustomTest,
  filterVisibleTests, filterPatientResults, buildRequestedTests, buildExamRecord
} from '../src/modules/radiology/model.js';

test('buildAllTests appends custom tests tagged as مخصص', () => {
  const all = buildAllTests([{ id: 'c1', name: 'Custom', name_ar: 'مخصص1' }]);
  assert.equal(all.length, DEFAULT_TESTS.length + 1);
  assert.equal(all[all.length - 1].cat, 'مخصص');
});

test('buildCats returns unique categories in first-seen order', () => {
  const all = buildAllTests([]);
  const cats = buildCats(all);
  assert.deepEqual(cats, ['شبكية', 'جلوكوما', 'قرنية', 'جراحة', 'أخرى']);
});

test('toggleSelection adds with OU default and removes on second call', () => {
  let sel = toggleSelection({}, 'oct');
  assert.equal(isSelected(sel, 'oct'), true);
  assert.equal(getEye(sel, 'oct'), 'OU');
  sel = toggleSelection(sel, 'oct');
  assert.equal(isSelected(sel, 'oct'), false);
});

test('cycleEyeValue cycles OU -> OD -> OS -> OU and is a no-op if not selected', () => {
  let sel = { oct: 'OU' };
  sel = cycleEyeValue(sel, 'oct');
  assert.equal(sel.oct, 'OD');
  sel = cycleEyeValue(sel, 'oct');
  assert.equal(sel.oct, 'OS');
  sel = cycleEyeValue(sel, 'oct');
  assert.equal(sel.oct, 'OU');
  const unchanged = cycleEyeValue({}, 'missing');
  assert.deepEqual(unchanged, {});
});

test('selectAllInCategory selects all then deselects all on second call', () => {
  const all = buildAllTests([]);
  let sel = selectAllInCategory({}, all, 'شبكية');
  const retinaIds = all.filter(t => t.cat === 'شبكية').map(t => t.id);
  retinaIds.forEach(id => assert.equal(isSelected(sel, id), true));
  sel = selectAllInCategory(sel, all, 'شبكية');
  retinaIds.forEach(id => assert.equal(isSelected(sel, id), false));
});

test('addCustomTest returns null when name is blank, else appends with prefixed id', () => {
  assert.equal(addCustomTest([], { name: '', name_ar: '' }), null);
  const result = addCustomTest([], { name: 'HRT', name_ar: '' });
  assert.equal(result.customTests.length, 1);
  assert.match(result.test.id, /^custom_/);
  assert.equal(result.test.name_ar, 'HRT');
});

test('removeCustomTest drops the test and its selection', () => {
  const { customTests, selected } = removeCustomTest(
    [{ id: 'custom_1', name: 'X', name_ar: 'X' }],
    { custom_1: 'OD' },
    'custom_1'
  );
  assert.equal(customTests.length, 0);
  assert.equal('custom_1' in selected, false);
});

test('filterVisibleTests matches by category and name (either language)', () => {
  const all = buildAllTests([]);
  assert.equal(filterVisibleTests(all, { filterCat: 'شبكية', search: '' }).length, 4);
  assert.equal(filterVisibleTests(all, { filterCat: 'الكل', search: 'oct' }).length, 2);
  assert.equal(filterVisibleTests(all, { filterCat: 'الكل', search: 'الشبكية' }).length > 0, true);
});

test('filterPatientResults filters by name/code/phone and caps at 8', () => {
  const patients = Array.from({ length: 12 }, (_, i) => ({ id: i, name: 'Ali ' + i, patientCode: 'P' + i, phone: '01' + i }));
  assert.equal(filterPatientResults(patients, '').length, 8);
  assert.equal(filterPatientResults(patients, 'Ali 3').length, 1);
});

test('buildRequestedTests maps selected ids to full test info', () => {
  const all = buildAllTests([]);
  const reqs = buildRequestedTests(all, { oct: 'OD', vf: 'OU' });
  assert.equal(reqs.length, 2);
  assert.equal(reqs[0].category, 'شبكية');
  assert.equal(reqs[0].eye, 'OD');
});

test('buildExamRecord assembles the saved record shape', () => {
  const rec = buildExamRecord({
    selectedPatient: { id: 5, name: 'Sara' },
    tests: [{ id: 'oct', name: 'OCT', name_ar: 'x', category: 'شبكية', eye: 'OU' }],
    doctorName: 'د. صقر',
    notes: 'صيام',
    now: 123,
    timeStr: { date: '2026-09-27', time: '10:00' }
  });
  assert.equal(rec.patientId, 5);
  assert.equal(rec.patient, 'Sara');
  assert.equal(rec.status, 'requested');
  assert.equal(rec.testType, 'طلب فحوصات');
  assert.equal(rec.requestedTests.length, 1);
});
