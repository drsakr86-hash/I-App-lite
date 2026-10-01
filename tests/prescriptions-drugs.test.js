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
