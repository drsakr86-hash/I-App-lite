import test from 'node:test';
import assert from 'node:assert/strict';
import { allergyOf, allergyTerms, allergyMatches, rxAllergyAlert } from '../src/modules/prescriptions/allergy.js';

// Synthetic fixtures only.

test('allergyOf: returns the recorded text, trimmed', () => {
  assert.equal(allergyOf({ allergies: '  بنسلين  ' }), 'بنسلين');
  assert.equal(allergyOf({ allergies: 'Penicillin, Sulfa' }), 'Penicillin, Sulfa');
});

test('allergyOf: empty, missing and "none" wordings are not an allergy', () => {
  for (const v of ['', '   ', undefined, null, 'لا يوجد', 'لا يوجد.', 'لايوجد', 'لا توجد', 'لا توجد حساسية', 'لا', 'None', 'no', 'NKDA', '-', 'N/A', 'No known allergies']) {
    assert.equal(allergyOf({ allergies: v }), '', JSON.stringify(v));
  }
  assert.equal(allergyOf(null), '');
  assert.equal(allergyOf(undefined), '');
  assert.equal(allergyOf({}), '');
});

test('allergyOf: a real allergy that merely contains "لا" is kept', () => {
  assert.equal(allergyOf({ allergies: 'لاكتوز' }), 'لاكتوز');
});

test('allergyTerms: splits on Arabic/Latin separators and "و", drops very short pieces', () => {
  assert.deepEqual(allergyTerms('بنسلين، سلفا'), ['بنسلين', 'سلفا']);
  assert.deepEqual(allergyTerms('Penicillin; Sulfa / Iodine'), ['penicillin', 'sulfa', 'iodine']);
  assert.deepEqual(allergyTerms('بنسلين و سلفا'), ['بنسلين', 'سلفا']);
  assert.deepEqual(allergyTerms('بنسلين\nسلفا'), ['بنسلين', 'سلفا']);
  assert.deepEqual(allergyTerms('a، ب، سلفا'), ['سلفا']);
  assert.deepEqual(allergyTerms(''), []);
});

test('allergyMatches: finds a recorded allergen written in the medicines text (Arabic normalisation, case-insensitive)', () => {
  const meds = 'Tobradex - قطرة كل 6 ساعات\nسلفاسيتاميد - قطرة\n';
  assert.deepEqual(allergyMatches('بنسلين، سلفا', meds), ['سلفا']);
  assert.deepEqual(allergyMatches('Tobradex', meds), ['tobradex']);
  assert.deepEqual(allergyMatches('PENICILLIN', 'penicillin v - tab'), ['penicillin']);
  // alef / taa-marbuta variants are treated as the same letters
  assert.deepEqual(allergyMatches('إيبوبروفين', 'ايبوبروفين - اقراص'), ['ايبوبروفين']);
});

test('allergyMatches: no match, empty allergy or "none" gives an empty list', () => {
  assert.deepEqual(allergyMatches('بنسلين', 'Tobradex - drops'), []);
  assert.deepEqual(allergyMatches('', 'Tobradex'), []);
  assert.deepEqual(allergyMatches('لا يوجد', 'لا يوجد - قطرة'), []);
  assert.deepEqual(allergyMatches('بنسلين', ''), []);
  assert.deepEqual(allergyMatches('بنسلين', undefined), []);
});

test('allergyMatches: known limit — a drug CLASS is not recognised from a brand/generic name (text match only)', () => {
  // "بنسلين" is recorded, "Amoxicillin" is a penicillin, but the text does not contain the word.
  assert.deepEqual(allergyMatches('بنسلين', 'Amoxicillin - 500mg'), []);
});

test('rxAllergyAlert: null without a patient or without an allergy', () => {
  const patients = [{ id: 1, name: 'A', allergies: 'لا يوجد' }, { id: 2, name: 'B', allergies: 'سلفا' }];
  assert.equal(rxAllergyAlert(patients, { patientId: null, medicines: 'x' }), null);
  assert.equal(rxAllergyAlert(patients, { patientId: 99, medicines: 'x' }), null);
  assert.equal(rxAllergyAlert(patients, { patientId: 1, medicines: 'سلفا' }), null);
  assert.equal(rxAllergyAlert([], { patientId: 2 }), null);
  assert.equal(rxAllergyAlert(undefined, { patientId: 2 }), null);
});

test('rxAllergyAlert: allergy shown for the chosen patient, with matches only when a medicine contains it', () => {
  const patients = [{ id: 2, name: 'B', allergies: 'سلفا، بنسلين' }];
  assert.deepEqual(rxAllergyAlert(patients, { patientId: 2, medicines: '' }), { allergy: 'سلفا، بنسلين', matches: [] });
  assert.deepEqual(rxAllergyAlert(patients, { patientId: 2, medicines: 'سلفاسيتاميد - قطرة' }), { allergy: 'سلفا، بنسلين', matches: ['سلفا'] });
});

test('rxAllergyAlert: patient id is compared as a number (select values are strings)', () => {
  const patients = [{ id: 2, name: 'B', allergies: 'سلفا' }];
  assert.deepEqual(rxAllergyAlert(patients, { patientId: '2', medicines: '' }), { allergy: 'سلفا', matches: [] });
});
