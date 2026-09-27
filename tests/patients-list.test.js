import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normArabic, normPhone, sortPatients, matchesPatient, listPatients, isNewToday, nextPatientCode
} from '../src/modules/patients/list.js';

const ps = [
  { id: 100, name: 'أحمد علي', condition: 'مياه بيضاء', patientCode: 'P-0001', phone: '01012345678' },
  { id: 300, name: 'فاطمة حسن', condition: 'جلوكوما', patientCode: 'P-0003', phone: '+20 111 222 3333' },
  { id: 200, name: 'مصطفى', condition: '', patientCode: 'P-0002' },
  { name: 'بدون رقم' }
];

test('normArabic unifies letter forms, strips tashkeel/tatweel, collapses spaces', () => {
  assert.equal(normArabic('  أَحْمَـد   إبراهيم  '), 'احمد ابراهيم');
  assert.equal(normArabic('مصطفى فاطمة'), 'مصطفي فاطمه');
  assert.equal(normArabic('ABC'), 'abc');
  assert.equal(normArabic(null), '');
  assert.equal(normArabic(undefined), '');
});

test('normPhone keeps digits and maps the Egyptian prefix to 0', () => {
  assert.equal(normPhone('+20 111 222 3333'), '01112223333');
  assert.equal(normPhone('0020-100-000'), '0100000');
  assert.equal(normPhone('010 1234'), '0101234');
  assert.equal(normPhone(null), '');
});

test('sortPatients: newest id first, missing id last, input not mutated', () => {
  const copy = [...ps];
  assert.deepEqual(sortPatients(ps).map(p => p.id), [300, 200, 100, undefined]);
  assert.deepEqual(ps, copy);
  assert.deepEqual(sortPatients(null), []);
  assert.deepEqual(sortPatients('x'), []);
});

test('listPatients with empty / blank search returns all, sorted', () => {
  assert.equal(listPatients(ps, '').length, 4);
  assert.equal(listPatients(ps, '   ').length, 4);
  assert.equal(listPatients(ps, undefined).length, 4);
  assert.deepEqual(listPatients([], 'x'), []);
  assert.deepEqual(listPatients(undefined, 'x'), []);
});

test('search by name ignores hamza/taa-marbuta variants', () => {
  assert.deepEqual(listPatients(ps, 'احمد').map(p => p.id), [100]);
  assert.deepEqual(listPatients(ps, 'فاطمه').map(p => p.id), [300]);
  assert.deepEqual(listPatients(ps, 'مصطفي').map(p => p.id), [200]);
});

test('search by condition, file code (case-insensitive) and code digits', () => {
  assert.deepEqual(listPatients(ps, 'جلوكوما').map(p => p.id), [300]);
  assert.deepEqual(listPatients(ps, 'p-0002').map(p => p.id), [200]);
  assert.deepEqual(listPatients(ps, '0001').map(p => p.id), [100]);
});

test('search by phone digits, including +20 numbers', () => {
  assert.deepEqual(listPatients(ps, '0111222').map(p => p.id), [300]);
  assert.deepEqual(listPatients(ps, '01012345678').map(p => p.id), [100]);
  assert.deepEqual(listPatients(ps, 'غير موجود'), []);
});

test('matchesPatient tolerates missing fields', () => {
  assert.equal(matchesPatient({}, 'x'), false);
  assert.equal(matchesPatient({}, ''), true);
  assert.equal(matchesPatient({ phone: null, patientCode: null }, '12'), false);
});

test('isNewToday: within 24h of creation only, always boolean', () => {
  const now = 1_000_000_000_000;
  assert.equal(isNewToday({ id: now - 1000 }, now), true);
  assert.equal(isNewToday({ id: now - 86400000 }, now), false);
  assert.equal(isNewToday({ id: 0 }, now), false);
  assert.equal(isNewToday({}, now), false);
  assert.equal(isNewToday(null, now), false);
});

test('nextPatientCode follows the highest existing code', () => {
  assert.equal(nextPatientCode(ps), 'P-0004');
  assert.equal(nextPatientCode([]), 'P-0001');
  assert.equal(nextPatientCode(null), 'P-0001');
  assert.equal(nextPatientCode([{ patientCode: 'P-0099' }, { patientCode: 'bad' }]), 'P-0100');
});
