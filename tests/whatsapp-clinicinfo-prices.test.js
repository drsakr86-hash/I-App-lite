// The assistant's price answers: zero prices are never quoted, and FAQ price rows (e.g. Markaz Damanhour) join the app price list.
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildClinicInfo } from '../supabase/functions/_shared/clinicinfo.js';

test('a price of 0 is left out of the assistant prices', () => {
  const t = buildClinicInfo({ prices: [{ name: 'كشف', clinic: 'دمنهور', price: 300 }, { name: 'متابعة عملية خاصة', price: 0 }, { name: 'x', price: '0' }, { name: 'y', price: '٠' }] }).prices.text;
  assert.match(t, /كشف \(دمنهور\): 300 جنيه/);
  assert.doesNotMatch(t, /متابعة عملية/);
  assert.doesNotMatch(t, /: 0 جنيه/);
});

test('only zero prices and no FAQ price: prices unavailable (hand over, never guess)', () => {
  assert.equal(buildClinicInfo({ prices: [{ name: 'a', price: 0 }] }).prices.available, false);
});

test('FAQ price rows are added to prices; inactive ones and non-price topics are not', () => {
  const faq = [
    { topic: 'سعر الكشف في مركز دمنهور للعيون', answer: 'الكشف 280 جنيهًا.', active: true },
    { topic: 'سعر قديم', answer: '1 جنيه', active: false },
    { topic: 'عنوان فرع دمنهور', answer: 'برج المنتزه', active: true }
  ];
  const i = buildClinicInfo({ prices: [{ name: 'كشف', clinic: 'دمنهور', price: 300 }], faq });
  assert.match(i.prices.text, /مركز دمنهور للعيون: الكشف 280 جنيهًا/);
  assert.match(i.prices.text, /كشف \(دمنهور\): 300 جنيه/);
  assert.doesNotMatch(i.prices.text, /سعر قديم|برج المنتزه/);
  assert.equal(buildClinicInfo({ faq }).prices.available, true);
});
