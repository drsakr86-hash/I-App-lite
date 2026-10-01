import test from 'node:test';
import assert from 'node:assert/strict';
import { parseMedicines, serializeMedicines, medicinesTextForTemplate } from '../src/components/forms/medicines-step-model.js';

test('parseMedicines: empty/falsy input returns an empty list', () => {
  assert.deepEqual(parseMedicines(''), []);
  assert.deepEqual(parseMedicines(null), []);
  assert.deepEqual(parseMedicines(undefined), []);
});

test('parseMedicines: splits "Name - Dose" lines on the first " - "', () => {
  const list = parseMedicines('Vigamox ED - مرتين يومياً\nTobradex ED - 3 مرات يومياً');
  assert.deepEqual(list, [
    { name: 'Vigamox ED', dose: 'مرتين يومياً' },
    { name: 'Tobradex ED', dose: '3 مرات يومياً' }
  ]);
});

test('parseMedicines: a line with no " - " separator keeps the whole thing as the name, empty dose', () => {
  assert.deepEqual(parseMedicines('Vigamox ED'), [{ name: 'Vigamox ED', dose: '' }]);
});

test('parseMedicines: ignores blank lines', () => {
  assert.deepEqual(parseMedicines('Vigamox ED\n\nTobradex ED'), [
    { name: 'Vigamox ED', dose: '' },
    { name: 'Tobradex ED', dose: '' }
  ]);
});

test('serializeMedicines: joins name/dose pairs back with " - ", omitting the dash when dose is empty', () => {
  assert.equal(
    serializeMedicines([{ name: 'Vigamox ED', dose: 'مرتين يومياً' }, { name: 'Tobradex ED', dose: '' }]),
    'Vigamox ED - مرتين يومياً\nTobradex ED'
  );
});

test('parseMedicines/serializeMedicines round-trip', () => {
  const text = 'Vigamox ED - مرتين يومياً\nTobradex ED';
  assert.equal(serializeMedicines(parseMedicines(text)), text);
});

test('medicinesTextForTemplate: drops unnamed rows, keeps the same "Name - Dose" format', () => {
  const meds = [
    { name: 'Vigamox ED', dose: 'مرتين يومياً' },
    { name: '', dose: 'كل 4 ساعات' },
    { name: 'Tobradex ED', dose: '' }
  ];
  assert.equal(medicinesTextForTemplate(meds), 'Vigamox ED - مرتين يومياً\nTobradex ED');
});

test('medicinesTextForTemplate: empty list gives an empty string', () => {
  assert.equal(medicinesTextForTemplate([]), '');
});
