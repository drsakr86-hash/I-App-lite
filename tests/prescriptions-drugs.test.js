import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_DRUGS, DOSE_OPTIONS, loadDrugs, saveDrug, deleteDrug } from '../src/modules/prescriptions/drugs.js';

function makeLocalStorage() {
  const store = new Map();
  return {
    getItem: k => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => { store.set(k, String(v)); },
    removeItem: k => { store.delete(k); },
    get length() { return store.size; },
    key: i => Array.from(store.keys())[i] ?? null
  };
}

test.beforeEach(() => {
  globalThis.localStorage = makeLocalStorage();
});

test('loadDrugs: with no custom drugs saved, returns exactly DEFAULT_DRUGS', () => {
  assert.deepEqual(loadDrugs(), DEFAULT_DRUGS);
});

test('loadDrugs: falls back to DEFAULT_DRUGS if localStorage has malformed JSON', () => {
  globalThis.localStorage.setItem('iapp_custom_drugs', 'not json');
  assert.deepEqual(loadDrugs(), DEFAULT_DRUGS);
});

test('saveDrug: adds a new custom drug, loadDrugs then includes it after the defaults', () => {
  saveDrug('My Custom Drug');
  const list = loadDrugs();
  assert.ok(list.includes('My Custom Drug'));
  assert.equal(list.indexOf('My Custom Drug'), DEFAULT_DRUGS.length);
});

test('saveDrug: does not duplicate an existing custom drug or a default drug', () => {
  saveDrug('My Custom Drug');
  saveDrug('My Custom Drug');
  saveDrug(DEFAULT_DRUGS[0]);
  const list = loadDrugs();
  assert.equal(list.filter(d => d === 'My Custom Drug').length, 1);
  assert.equal(list.filter(d => d === DEFAULT_DRUGS[0]).length, 1);
});

test('deleteDrug: removes a previously saved custom drug', () => {
  saveDrug('Temp Drug');
  assert.ok(loadDrugs().includes('Temp Drug'));
  deleteDrug('Temp Drug');
  assert.ok(!loadDrugs().includes('Temp Drug'));
});

test('DOSE_OPTIONS: has the expected fixed set of frequency strings', () => {
  assert.deepEqual(DOSE_OPTIONS, [
    'مرة يومياً', 'مرتين يومياً', '3 مرات يومياً', '4 مرات يومياً',
    'كل 4 ساعات', 'كل 6 ساعات', 'عند اللزوم', 'قبل النوم'
  ]);
});

import { loadDrugGroups } from '../src/modules/prescriptions/drugs.js';
import { GUIDE_DRUGS, GUIDE_DRUG_GROUPS } from '../src/modules/prescriptions/guide-drugs.js';

test('guide drugs: no duplicates across groups, and every guide drug really appears in the guide text', async () => {
  assert.equal(new Set(GUIDE_DRUGS).size, GUIDE_DRUGS.length);
  const guide = (await import('../src/modules/rx-guide/data.js')).default;
  const text = guide.cards.map(c => c.sections.map(s => s.lines.join(' ')).join(' ')).join(' ').toLowerCase();
  const brand = d => d.replace(/ (ED|EO|vial|amp|syrup|nasal|cream|lotion|infusion|IV|ointment)\b.*$/i, '').replace(/\s[\d.,]+\s?(%|mg|g|mcg)?.*$/i, '').toLowerCase();
  const missing = GUIDE_DRUGS.filter(d => !text.includes(brand(d)));
  assert.deepEqual(missing, [], 'drugs not found in the guide text: ' + missing.join(', '));
});

test('loadDrugGroups: original list first, guide groups next, custom last, no name twice', () => {
  saveDrug('My Custom Drug');
  const groups = loadDrugGroups();
  assert.equal(groups[0].key, 'basic');
  assert.deepEqual(groups[0].drugs, DEFAULT_DRUGS);
  assert.equal(groups[groups.length - 1].key, 'custom');
  assert.deepEqual(groups[groups.length - 1].drugs, ['My Custom Drug']);
  const all = groups.flatMap(g => g.drugs);
  assert.equal(new Set(all).size, all.length);
  for (const g of GUIDE_DRUG_GROUPS) assert.ok(groups.some(x => x.key === g.key), g.key);
  assert.ok(all.includes('Pred Forte 1% ED') && all.includes('Vigamox ED'));
});

test('loadDrugGroups: with malformed custom storage still returns the original and guide groups', () => {
  globalThis.localStorage.setItem('iapp_custom_drugs', 'not json');
  const groups = loadDrugGroups();
  assert.ok(groups.length >= 2 && groups.every(g => g.key !== 'custom'));
});
