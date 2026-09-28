import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  SECRETARY_APT_TYPES, SECRETARY_DEFAULT_CLINIC, PATIENT_PICKER_PLACEHOLDER, SECRETARY_NAME_ERROR,
  SECRETARY_CONFLICT_ERROR, blankSecretaryApt, initialSecretaryAptState, initialSecretaryAptMode, initialCostTouched,
  matchSecretaryPrice, withSecretaryAptType, withNewPatientMode, withExistingPatientMode, findPickedPatient,
  withPickedPatient, toggleSecretaryPaid, secretaryAptConflict, secretaryAptError, buildSecretaryAptPayload,
  matchCollectPrice, initialCollectCost, initialCollectPaid
} from '../src/components/forms/secretary-forms-model.js';
import { aptConflict } from '../src/modules/secretary-app/model.js';
import { legacyFunctionSource, legacyConst } from './forms-legacy-source.js';

const SRC = legacyFunctionSource('SecretaryAptForm');
const COLLECT_SRC = legacyFunctionSource('CollectModal');
const TODAY = '2026-09-28';

const PRICES = [
  { id: 1, name: 'كشف', price: '300' },
  { id: 2, name: 'فحص شبكية', price: '500' },
  { id: 3, name: 'استشارة', price: '150' }
];

// ---- SecretaryAptForm
test('constants are the legacy SecretaryAptForm values', () => {
  assert.ok(SRC.includes(JSON.stringify(SECRETARY_APT_TYPES).replace(/,/g, ', ') + '.map('));
  assert.equal(SECRETARY_DEFAULT_CLINIC, 'دمنهور');
  assert.ok(SRC.includes('value: f.clinic || "دمنهور"'));
  assert.ok(SRC.includes('}, "' + PATIENT_PICKER_PLACEHOLDER + '")'));
  assert.ok(SRC.includes('setErr("' + SECRETARY_NAME_ERROR + '")'));
  assert.ok(SRC.includes('setErr("' + SECRETARY_CONFLICT_ERROR + '")'));
});

test('blankSecretaryApt equals legacy blank (values and key order)', () => {
  const legacy = legacyConst('blank', SRC, { localISO: () => TODAY });
  assert.deepEqual(blankSecretaryApt(TODAY), legacy);
  assert.deepEqual(Object.keys(blankSecretaryApt(TODAY)), Object.keys(legacy));
  assert.notEqual(blankSecretaryApt(TODAY), blankSecretaryApt(TODAY));
});

test('initial state / mode / costTouched: add and edit', () => {
  assert.deepEqual(initialSecretaryAptState(null, TODAY), blankSecretaryApt(TODAY));
  assert.deepEqual(initialSecretaryAptState(undefined, TODAY), blankSecretaryApt(TODAY));
  const apt = { id: 9, patient: 'منى', patientId: 2, date: '2026-10-01', cost: '300', waitStatus: 'waiting', extra: 1 };
  const s = initialSecretaryAptState(apt, TODAY);
  assert.deepEqual(s, { ...blankSecretaryApt(TODAY), ...apt });
  assert.equal(s.time, '09:00'); // missing field filled from blank
  assert.equal(s.extra, 1); // unknown fields kept
  assert.deepEqual(Object.keys(s).slice(0, 11), Object.keys(blankSecretaryApt(TODAY)));
  assert.equal(initialSecretaryAptMode(null), 'new');
  assert.equal(initialSecretaryAptMode({}), 'new');
  assert.equal(initialSecretaryAptMode({ patientId: 0 }), 'new');
  assert.equal(initialSecretaryAptMode({ patientId: null }), 'new');
  assert.equal(initialSecretaryAptMode({ patientId: 2 }), 'existing');
  assert.equal(initialCostTouched(null), false);
  assert.equal(initialCostTouched({ cost: '' }), false);
  assert.equal(initialCostTouched({ cost: 0 }), false);
  assert.equal(initialCostTouched({ cost: '0' }), true);
  assert.equal(initialCostTouched({ cost: 300 }), true);
});

test('matchSecretaryPrice equals legacy matchPrice', () => {
  for (const prices of [PRICES, [], [{ name: '', price: '1' }, ...PRICES], [{ name: 'فحص', price: '9' }, ...PRICES]]) {
    const legacy = legacyConst('matchPrice', SRC, { prices });
    for (const t of [...SECRETARY_APT_TYPES, 'كشف', 'شبكية', 'كشف مستعجل', '']) {
      assert.equal(matchSecretaryPrice(prices, t), legacy(t), t);
    }
  }
  assert.equal(matchSecretaryPrice(PRICES, 'فحص شبكية').price, '500');
  assert.equal(matchSecretaryPrice(PRICES, 'شبكية').price, '500'); // name contains type
  assert.equal(matchSecretaryPrice(PRICES, 'متابعة'), undefined);
  // Quirk kept: an empty type matches the first price.
  assert.equal(matchSecretaryPrice(PRICES, '').price, '300');
  // Quirk kept: a price with no name throws.
  assert.throws(() => matchSecretaryPrice([{ price: '1' }], 'x'), TypeError);
});

test('withSecretaryAptType: cost follows the price only while untouched', () => {
  const v = blankSecretaryApt(TODAY);
  const m = matchSecretaryPrice(PRICES, 'فحص شبكية');
  assert.deepEqual(withSecretaryAptType(v, 'فحص شبكية', m, false), { ...v, type: 'فحص شبكية', cost: '500' });
  assert.deepEqual(withSecretaryAptType({ ...v, cost: '77' }, 'فحص شبكية', m, true), { ...v, type: 'فحص شبكية', cost: '77' });
  assert.deepEqual(withSecretaryAptType({ ...v, cost: '77' }, 'متابعة', undefined, false), { ...v, type: 'متابعة', cost: '77' });
});

test('patient mode switches and picker', () => {
  const v = { ...blankSecretaryApt(TODAY), patient: 'منى', patientId: 2, phone: '0111' };
  assert.deepEqual(withNewPatientMode(v), { ...v, patient: '', patientId: null, phone: '' });
  assert.deepEqual(withExistingPatientMode(v), { ...v, patient: '', patientId: null }); // phone kept
  const patients = [{ id: 1, name: 'أحمد', phone: '010' }, { id: 2, name: 'منى' }, { id: 'x3', name: 'نص' }];
  assert.equal(findPickedPatient(patients, '1').name, 'أحمد');
  assert.equal(findPickedPatient(patients, ''), undefined);
  assert.equal(findPickedPatient(patients, 'x3'), undefined); // string ids never match (legacy)
  assert.deepEqual(withPickedPatient(v, patients[0]), { ...v, patientId: 1, patient: 'أحمد', phone: '010' });
  assert.deepEqual(withPickedPatient(v, patients[1]), { ...v, patientId: 2, patient: 'منى', phone: '' });
  assert.equal(toggleSecretaryPaid(v).paid, true);
  assert.equal(toggleSecretaryPaid(toggleSecretaryPaid(v)).paid, false);
});

test('secretaryAptConflict: legacy local check (does not skip cancelled)', () => {
  const f = { id: 5, doctor: 'د. عبدالستار', date: TODAY, time: '10:00' };
  const other = { id: 6, doctor: 'د. عبدالستار', date: TODAY, time: '10:00' };
  assert.equal(secretaryAptConflict([other], f), true);
  assert.equal(secretaryAptConflict([{ ...other, id: 5 }], f), false); // itself (edit)
  assert.equal(secretaryAptConflict([{ ...other, doctor: 'د. سلمى' }], f), false);
  assert.equal(secretaryAptConflict([{ ...other, time: '10:30' }], f), false);
  assert.equal(secretaryAptConflict([{ ...other, date: '2026-09-29' }], f), false);
  assert.equal(secretaryAptConflict([], f), false);
  // Difference from the save-time check in src/modules/secretary-app/model.js,
  // kept on purpose: a cancelled appointment still blocks here.
  const cancelled = { ...other, status: 'cancelled' };
  assert.equal(secretaryAptConflict([cancelled], f), true);
  assert.equal(aptConflict([cancelled], f), false);
  // A new appointment (no id yet) conflicts with any same-slot appointment.
  assert.equal(secretaryAptConflict([other], { ...f, id: undefined }), true);
});

test('secretaryAptConflict equals the legacy inline expression', () => {
  const m = SRC.match(/const conflict = (appointments\.some\(.*?\));/);
  assert.ok(m);
  const legacy = new Function('appointments', 'f', 'return ' + m[1]);
  const apts = [
    { id: 1, doctor: 'A', date: 'd', time: 't' }, { id: 2, doctor: 'B', date: 'd', time: 't' },
    { id: 3, doctor: 'A', date: 'd', time: 'u', cancelled: true }
  ];
  for (const f of [{ id: 1, doctor: 'A', date: 'd', time: 't' }, { id: 9, doctor: 'A', date: 'd', time: 't' },
    { doctor: 'A', date: 'd', time: 'u' }, { id: 3, doctor: 'A', date: 'd', time: 'u' }, { doctor: 'C', date: 'd', time: 't' }]) {
    assert.equal(secretaryAptConflict(apts, f), legacy(apts, f), JSON.stringify(f));
  }
});

test('secretaryAptError: name first, then conflict', () => {
  const other = { id: 6, doctor: 'د. عبدالستار', date: TODAY, time: '09:00' };
  const f = blankSecretaryApt(TODAY);
  assert.equal(secretaryAptError(f, [other]), SECRETARY_NAME_ERROR); // name wins over conflict
  assert.equal(secretaryAptError({ ...f, patient: '   ' }, []), SECRETARY_NAME_ERROR);
  assert.equal(secretaryAptError({ ...f, patient: 'منى' }, [other]), SECRETARY_CONFLICT_ERROR);
  assert.equal(secretaryAptError({ ...f, patient: 'منى' }, []), null);
  // Quirk kept: an edited appointment stored without a patient string throws.
  assert.throws(() => secretaryAptError({ ...f, patient: undefined }, []), TypeError);
});

test('buildSecretaryAptPayload: whole form, id kept or Date.now()', () => {
  const f = { ...blankSecretaryApt(TODAY), patient: 'منى' };
  assert.deepEqual(buildSecretaryAptPayload(f, 1790000000000), { ...f, id: 1790000000000 });
  assert.deepEqual(buildSecretaryAptPayload({ ...f, id: 42 }, 1790000000000), { ...f, id: 42 });
  assert.equal(buildSecretaryAptPayload({ ...f, cost: '350' }, 1).cost, '350'); // cost stays a string
  assert.equal(Object.keys(buildSecretaryAptPayload(f, 1)).at(-1), 'id');
});

// ---- CollectModal
test('matchCollectPrice / initialCollectCost equal legacy', () => {
  const apts = [
    { type: 'فحص شبكية' }, { type: 'كشف', cost: '250' }, { type: 'متابعة' }, { type: 'شبكية' }, {},
    { type: 'استشارة', cost: 0 }, { type: 'استشارة', cost: '0' }, { type: '' }
  ];
  for (const prices of [PRICES, [], [{ name: '', price: '5' }, ...PRICES]]) {
    for (const apt of apts) {
      const legacyMatched = legacyConst('matched', COLLECT_SRC, { prices, apt });
      const matched = matchCollectPrice(prices, apt.type);
      assert.equal(matched, legacyMatched, JSON.stringify(apt));
      assert.equal(initialCollectCost(apt, matched), apt.cost || (legacyMatched ? legacyMatched.price : ''));
    }
  }
  assert.ok(COLLECT_SRC.includes('useState(apt.cost || (matched ? matched.price : ""))'));
  assert.ok(COLLECT_SRC.includes('useState(!!apt.paid)'));
  assert.ok(COLLECT_SRC.includes('onClick: () => onSave(cost, paid)'));
  assert.equal(initialCollectCost({ type: 'فحص شبكية' }, matchCollectPrice(PRICES, 'فحص شبكية')), '500');
  assert.equal(initialCollectCost({ type: 'كشف', cost: '250' }, matchCollectPrice(PRICES, 'كشف')), '250');
  assert.equal(initialCollectCost({ type: 'متابعة' }, undefined), '');
  // A stored 0 falls through to the price list (legacy ||).
  assert.equal(initialCollectCost({ type: 'استشارة', cost: 0 }, matchCollectPrice(PRICES, 'استشارة')), '150');
  assert.equal(initialCollectCost({ type: 'x', cost: 0 }, undefined), '');
  // Missing type: nothing matches unless a price is named "" (quirk).
  assert.equal(matchCollectPrice(PRICES, undefined), undefined);
  assert.throws(() => matchCollectPrice([{ price: '1' }], 'x'), TypeError);
});

test('initialCollectPaid', () => {
  assert.equal(initialCollectPaid({}), false);
  assert.equal(initialCollectPaid({ paid: 0 }), false);
  assert.equal(initialCollectPaid({ paid: true }), true);
  assert.equal(initialCollectPaid({ paid: 'yes' }), true);
});
