import test from 'node:test';
import assert from 'node:assert/strict';
import { pricesForClinic } from '../src/components/forms/price-clinic.js';
import { matchCollectPrice, matchSecretaryPrice } from '../src/components/forms/secretary-forms-model.js';
import { matchPriceForType, visitTypeOptions, referencePriceText, referencePriceShown } from '../src/components/forms/visit-form-model.js';

const prices = [
  { id: 1, name: 'كشف', price: '200' },                          // all clinics
  { id: 2, name: 'كشف', price: '300', clinic: 'دمنهور' },
  { id: 3, name: 'كشف', price: '150', clinic: 'الرحمانية' },
  { id: 4, name: 'متابعة', price: '100' }
];

test('without a clinic the list and the old matching are unchanged', () => {
  assert.equal(pricesForClinic(prices, ''), prices);
  assert.equal(matchCollectPrice(prices, 'كشف').id, 1);
  assert.equal(matchSecretaryPrice(prices, 'كشف', undefined).id, 1);
});

test('a clinic-specific price wins; other clinics\' prices are ignored; general prices are the fallback', () => {
  assert.equal(matchCollectPrice(prices, 'كشف', 'دمنهور').price, '300');
  assert.equal(matchCollectPrice(prices, 'كشف', 'الرحمانية').price, '150');
  assert.equal(matchCollectPrice(prices, 'كشف', 'مركز دمنهور للعيون').price, '200');   // no own price → general one
  assert.equal(matchCollectPrice(prices, 'متابعة', 'الرحمانية').price, '100');
  assert.equal(matchSecretaryPrice(prices, 'كشف', 'دمنهور').price, '300');
  assert.equal(matchPriceForType(prices, 'كشف', 'الرحمانية').price, '150');
});

test('a price that exists only for another clinic is not offered', () => {
  const only = [{ id: 9, name: 'ليزر', price: '900', clinic: 'دمنهور' }];
  assert.equal(matchCollectPrice(only, 'ليزر', 'الرحمانية'), undefined);
  assert.deepEqual(visitTypeOptions(only, 'الرحمانية').includes('ليزر'), false);
});

test('visit type options per clinic are unique and the reference price follows the clinic', () => {
  assert.deepEqual(visitTypeOptions(prices, 'دمنهور'), ['كشف', 'متابعة']);
  assert.equal(referencePriceText(prices, 'كشف', 'دمنهور'), '300');
  assert.ok(referencePriceShown(prices, 'كشف', 'الرحمانية'));
});
