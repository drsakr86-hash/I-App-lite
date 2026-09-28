import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_DOCTOR_NAMES, DEFAULT_DOCTOR, VISIT_TYPES, VISIT_COMPLAINTS, OTHER_COMPLAINT, COMPLAINT_PLACEHOLDER,
  DEFAULT_VISIT_COST, blankVisit, initialVisitState, matchPriceForType, withVisitType, visitTypeOptions,
  referencePriceShown, referencePriceText, withComplaintSelect, complaintSelectValue, customComplaintShown,
  customComplaintValue, complaintBadgeShown, togglePaid, buildVisitPayload
} from '../src/components/forms/visit-form-model.js';
import { legacyFunctionSource, legacyConst } from './forms-legacy-source.js';

const SRC = legacyFunctionSource('VisitForm');
const TODAY = '2026-09-28';
const CLINIC = 'دمنهور';

test('option lists are the legacy VisitForm lists', () => {
  assert.deepEqual(VISIT_TYPES, legacyConst('TYPES', SRC));
  assert.deepEqual(VISIT_COMPLAINTS, legacyConst('COMPLAINTS', SRC));
  assert.equal(VISIT_COMPLAINTS.at(-1), OTHER_COMPLAINT);
  assert.equal(OTHER_COMPLAINT, 'أخرى...');
  assert.equal(COMPLAINT_PLACEHOLDER, '— اختر الشكوى —');
  assert.ok(SRC.includes('doctorNames = ["د. عبدالستار", "د. سلمى", "د. ليلى"]'));
  assert.deepEqual(DEFAULT_DOCTOR_NAMES, ['د. عبدالستار', 'د. سلمى', 'د. ليلى']);
  assert.equal(DEFAULT_DOCTOR, 'د. عبدالستار');
  assert.equal(DEFAULT_VISIT_COST, '350');
});

test('blankVisit: add-mode defaults, in legacy key order', () => {
  const b = blankVisit(TODAY, CLINIC);
  assert.deepEqual(b, {
    date: TODAY, type: 'فحص روتيني', doctor: 'د. عبدالستار', clinic: CLINIC, complaint: '', result: '',
    cost: '350', paid: false, nextVisit: '', notes: ''
  });
  assert.deepEqual(Object.keys(b), ['date', 'type', 'doctor', 'clinic', 'complaint', 'result', 'cost', 'paid', 'nextVisit', 'notes']);
  assert.notEqual(blankVisit(TODAY, CLINIC), blankVisit(TODAY, CLINIC));
  const legacy = legacyConst('blank', SRC, { localISO: () => TODAY, CLINICS: [{ v: CLINIC }] });
  assert.deepEqual(b, legacy);
  assert.deepEqual(Object.keys(b), Object.keys(legacy));
});

test('initialVisitState: edit mode keeps the record, fills only a missing clinic', () => {
  assert.deepEqual(initialVisitState(null, TODAY, CLINIC), blankVisit(TODAY, CLINIC));
  assert.deepEqual(initialVisitState(undefined, TODAY, CLINIC), blankVisit(TODAY, CLINIC));
  const old = { id: 7, date: '2025-01-01', type: 'متابعة', cost: 200 };
  const s = initialVisitState(old, TODAY, CLINIC);
  assert.deepEqual(s, { clinic: CLINIC, id: 7, date: '2025-01-01', type: 'متابعة', cost: 200 });
  assert.deepEqual(Object.keys(s)[0], 'clinic');
  assert.notEqual(s, old);
  assert.equal(initialVisitState({ clinic: 'الرحمانية' }, TODAY, CLINIC).clinic, 'الرحمانية');
  // An explicit empty/undefined clinic in the record wins over the default (spread order).
  assert.equal(initialVisitState({ clinic: '' }, TODAY, CLINIC).clinic, '');
  assert.equal(initialVisitState({ clinic: undefined }, TODAY, CLINIC).clinic, undefined);
});

test('matchPriceForType: exact, substring both ways, first match wins', () => {
  const prices = [{ name: 'كشف', price: '300' }, { name: 'فحص شبكية', price: '500' }];
  assert.equal(matchPriceForType(prices, 'فحص شبكية').price, '500');
  assert.equal(matchPriceForType(prices, 'كشف مستعجل').price, '300'); // type contains name
  assert.equal(matchPriceForType(prices, 'شبكية').price, '500'); // name contains type
  assert.equal(matchPriceForType(prices, 'عملية'), undefined);
  assert.equal(matchPriceForType([], 'x'), undefined);
});

test('matchPriceForType quirk: an unnamed price matches every type', () => {
  const prices = [{ price: '1' }, { name: 'عملية', price: '9000' }];
  assert.equal(matchPriceForType(prices, 'عملية').price, '1');
  assert.equal(matchPriceForType([{ name: '', price: '2' }], 'أي شيء').price, '2');
  // Empty type matches the first price (every name includes "").
  assert.equal(matchPriceForType([{ name: 'a', price: '3' }], '').price, '3');
});

test('withVisitType: cost follows the matched price, otherwise kept', () => {
  const v = { type: 'x', cost: '350', notes: 'n' };
  assert.deepEqual(withVisitType(v, 'عملية', { price: 9000 }), { type: 'عملية', cost: 9000, notes: 'n' });
  assert.deepEqual(withVisitType(v, 'متابعة', undefined), { type: 'متابعة', cost: '350', notes: 'n' });
  assert.deepEqual(v, { type: 'x', cost: '350', notes: 'n' });
});

test('visitTypeOptions / reference price hint', () => {
  assert.deepEqual(visitTypeOptions([]), VISIT_TYPES);
  const prices = [{ name: 'كشف', price: '1500' }, { name: 'مجاني' }];
  assert.deepEqual(visitTypeOptions(prices), ['كشف', 'مجاني']);
  assert.equal(referencePriceShown([], 'كشف'), false);
  assert.equal(referencePriceShown(prices, 'غير موجود'), undefined);
  assert.equal(referencePriceShown(prices, 'كشف'), prices[0]);
  assert.equal(referencePriceText(prices, 'كشف'), (1500).toLocaleString());
  assert.equal(referencePriceText(prices, 'مجاني'), '0');
  assert.equal(referencePriceText(prices, 'غير موجود'), '0');
  assert.equal(referencePriceText([{ name: 'a', price: 'abc' }], 'a'), 'NaN');
});

test('complaint select: value, handler, free-text input and badge', () => {
  assert.equal(complaintSelectValue('صداع'), 'صداع');
  assert.equal(complaintSelectValue(''), OTHER_COMPLAINT); // quirk: placeholder never shown
  assert.equal(complaintSelectValue('شيء آخر'), OTHER_COMPLAINT);
  assert.equal(complaintSelectValue(undefined), OTHER_COMPLAINT);

  assert.deepEqual(withComplaintSelect({ complaint: 'x', a: 1 }, OTHER_COMPLAINT), { complaint: '', a: 1 });
  assert.deepEqual(withComplaintSelect({ complaint: 'x' }, 'صداع'), { complaint: 'صداع' });
  assert.deepEqual(withComplaintSelect({ complaint: 'x' }, ''), { complaint: '' });

  for (const c of VISIT_COMPLAINTS.slice(0, -1)) assert.equal(customComplaintShown(c), false, c);
  for (const c of ['', OTHER_COMPLAINT, 'نص حر', undefined]) assert.equal(customComplaintShown(c), true, String(c));

  assert.equal(customComplaintValue(OTHER_COMPLAINT), '');
  assert.equal(customComplaintValue('نص حر'), 'نص حر');
  assert.equal(customComplaintValue(''), '');

  assert.equal(complaintBadgeShown('صداع'), true);
  assert.equal(complaintBadgeShown(''), '');
  assert.equal(complaintBadgeShown(undefined), undefined);
  assert.equal(complaintBadgeShown(OTHER_COMPLAINT), false);
  assert.equal(complaintBadgeShown('نص حر'), false);
});

test('togglePaid flips paid only', () => {
  assert.deepEqual(togglePaid({ paid: false, x: 1 }), { paid: true, x: 1 });
  assert.deepEqual(togglePaid({ paid: true }), { paid: false });
  assert.deepEqual(togglePaid({}), { paid: true });
});

test('buildVisitPayload: add vs edit, key order, cost kept as typed', () => {
  const f = blankVisit(TODAY, CLINIC);
  const add = buildVisitPayload(f, 42, 1767225600000);
  assert.deepEqual(add, { ...f, patientId: 42, id: 1767225600000, cost: '350' });
  assert.deepEqual(Object.keys(add), [...Object.keys(f), 'patientId', 'id']);
  const edit = buildVisitPayload({ id: 5, cost: '', patientId: 1 }, 42, 999);
  assert.deepEqual(edit, { id: 5, cost: '', patientId: 42 });
  assert.deepEqual(Object.keys(edit), ['id', 'cost', 'patientId']);
  // A record with id 0 gets a fresh id (legacy `f.id || Date.now()`).
  assert.equal(buildVisitPayload({ id: 0 }, 1, 77).id, 77);
  assert.equal(buildVisitPayload({}, undefined, 1).patientId, undefined);
});
