import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { normDigits, normArabic, foldText, textIncludes, digitsInclude, personMatches } from '../src/modules/search/text.js';
import { normArabic as fromList, matchesPatient } from '../src/modules/patients/list.js';
import { globalSearchResults, patientForResult } from '../src/components/global-search-model.js';
import { filterPatientResults, filterVisibleTests } from '../src/modules/radiology/model.js';
import { filterImagingPatients, filterStudies } from '../src/modules/imaging/model.js';
import { filterSecretaryApts } from '../src/modules/secretary-app/model.js';
import { filterConversations } from '../src/modules/whatsapp/model.js';

const patients = [
  { id: 1, name: 'أحمد مصطفى', patientCode: 'P-0001', phone: '01012345678' },
  { id: 2, name: 'فاطمة علي', patientCode: 'P-0002', phone: '+20 119 999 9999' }
];

test('normDigits: Arabic-Indic and Persian digits become 0-9', () => {
  assert.equal(normDigits('٠١٢٣٤٥٦٧٨٩'), '0123456789');
  assert.equal(normDigits('۰۱۲'), '012');
  assert.equal(normDigits(null), '');
});

test('normArabic: alef/yaa/taa-marbuta/tashkeel/tatweel are folded; patients/list re-exports the same function', () => {
  assert.equal(normArabic('أَحْمَد'), normArabic('احمد'));
  assert.equal(normArabic('فاطمة'), normArabic('فاطمه'));
  assert.equal(normArabic('مصطفى'), normArabic('مصطفي'));
  assert.equal(normArabic('محـــمد'), 'محمد');
  assert.equal(fromList, normArabic);
});

test('textIncludes / digitsInclude', () => {
  assert.equal(textIncludes('أحمد مصطفى', 'احمد مصطفي'), true);
  assert.equal(textIncludes('Ahmed', 'AHM'), true);
  assert.equal(textIncludes('أحمد', ''), true);
  assert.equal(textIncludes(undefined, 'x'), false);
  assert.equal(digitsInclude('010-1234', '٠١٠١'), true);
  assert.equal(digitsInclude('0101234', 'abc'), false, 'a query without digits never matches by digits');
  assert.equal(foldText('  ٠١٠  '), '010');
});

test('personMatches: name, file code (text or digits) and phone digits', () => {
  assert.equal(personMatches(patients[0], 'احمد'), true);
  assert.equal(personMatches(patients[0], 'p-0001'), true);
  assert.equal(personMatches(patients[1], '0002'), true);
  assert.equal(personMatches(patients[1], '119999'), true);
  assert.equal(personMatches(patients[1], 'احمد'), false);
  assert.equal(personMatches(null, 'x'), false);
  assert.equal(personMatches(null, ''), true);
});

test('patients list: a phone typed in Arabic-Indic digits matches', () => {
  assert.equal(matchesPatient(patients[0], '٠١٠١٢٣'), true);
  assert.equal(matchesPatient(patients[1], '٠١٠١٢٣'), false);
});

test('global search: same Arabic-aware matching as the patients list', () => {
  const rx = [{ id: 9, patient: 'أحمد مصطفى', patientId: 1 }];
  const apt = [{ id: 5, patient: 'فاطمة علي', patientId: 2 }, { id: 6 }];
  const r = globalSearchResults(patients, rx, apt, 'احمد مصطفي');
  assert.deepEqual(r.pRes.map(p => p.id), [1]);
  assert.deepEqual(r.rRes.map(x => x.id), [9]);
  assert.deepEqual(globalSearchResults(patients, rx, apt, 'فاطمه').aRes.map(x => x.id), [5]);
  assert.deepEqual(globalSearchResults(patients, [], [], '٠١٠١٢').pRes.map(p => p.id), [1]);
});

test('patientForResult: by patientId, then by exact name, else null', () => {
  assert.equal(patientForResult(patients, { patientId: 2, patient: 'x' }).id, 2);
  assert.equal(patientForResult(patients, { patient: 'أحمد مصطفى' }).id, 1);
  assert.equal(patientForResult(patients, { patient: 'غير مسجل' }), null);
  assert.equal(patientForResult(patients, null), null);
  assert.equal(patientForResult(undefined, { patientId: 1 }), null);
});

test('orders / imaging / secretary / WhatsApp search boxes use the same folding', () => {
  assert.deepEqual(filterPatientResults(patients, 'احمد').map(p => p.id), [1]);
  assert.deepEqual(filterImagingPatients(patients, 'فاطمه').map(p => p.id), [2]);
  const tests = [{ id: 'oct', name: 'OCT', name_ar: 'تصوير الشبكية المقطعي', cat: 'شبكية' }];
  assert.equal(filterVisibleTests(tests, { filterCat: 'الكل', search: 'الشبكيه' }).length, 1);
  const studies = [{ id: 1, type: 'oct', patient: 'أحمد', patientCode: 'P-0001', date: '2026-01-01', time: '10:00' }];
  assert.equal(filterStudies(studies, { filter: 'all', search: 'احمد' }).length, 1);
  const apts = [{ id: 1, patient: 'أحمد مصطفى', date: '2026-01-01', time: '10:00' }, { id: 2, patient: 'منى', date: '2026-01-01', time: '11:00' }];
  assert.deepEqual(filterSecretaryApts(apts, { search: 'احمد' }).map(a => a.id), [1]);
  assert.deepEqual(filterSecretaryApts(apts, { search: '   ' }).map(a => a.id), [1, 2]);
  const convs = [{ id: 1, contact: { profile_name: 'أحمد', wa_id: '201012345678' }, last_preview: 'موعد' }];
  assert.equal(filterConversations(convs, { search: 'احمد' }).length, 1);
  assert.equal(filterConversations(convs, { search: '٠١٠١٢٣' }).length, 1);
});

test('patients screen: an open-file request is honoured while the screen is already mounted', () => {
  const src = readFileSync(new URL('../src/modules/patients/patients-orchestration.js', import.meta.url), 'utf8');
  assert.match(src, /\}, \[initOpenId, initNewName\]\);/);
});
