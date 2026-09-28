import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  EYE_RIGHT, EYE_LEFT, EYE_BOTH, RX_EYES, RX_STEPS, RX_LAST_STEP, SPH_OPTIONS, CYL_OPTIONS, AXIS_OPTIONS,
  ADD_OPTIONS, IPD_OPTIONS, SPH_DISPLAY_DEFAULT, CYL_DISPLAY_DEFAULT, AXIS_DISPLAY_DEFAULT, ADD_DISPLAY_DEFAULT,
  IPD_DISPLAY_DEFAULT, AXIS_REQUIRED_ERR, AXIS_FIELD_ERR_TEXT, AXIS_BANNER_TEXT, NO_PATIENTS_WARNING,
  autoPatientOf, blankRx, initialRxState, initialRxStep, rxStepLabels, rxRealStep, needsRight, needsLeft,
  validateRx, isRxValid, patientStepBlocked, findRxPatient, withRxPatient, axisStarShown, clearsAxisError,
  axisBannerEye, refractionSides
} from '../src/components/forms/rx-form-model.js';
import { legacyFunctionSource, legacyConst } from './forms-legacy-source.js';

const SRC = legacyFunctionSource('RxForm');
const TODAY = '2026-09-28';
const P = { id: 12, name: 'سارة', patientCode: 'P-0012' };

test('refraction option lists equal the legacy runtime constants', () => {
  assert.deepEqual(SPH_OPTIONS, legacyConst('SPH_OPTIONS'));
  assert.deepEqual(CYL_OPTIONS, legacyConst('CYL_OPTIONS'));
  assert.deepEqual(AXIS_OPTIONS, legacyConst('AXIS_OPTIONS'));
  assert.equal(SPH_OPTIONS.length, 161);
  assert.equal(SPH_OPTIONS[0], '+20.00');
  assert.equal(SPH_OPTIONS[80], '+0.00');
  assert.equal(SPH_OPTIONS.at(-1), '-20.00');
  assert.deepEqual(CYL_OPTIONS.slice(0, 3), ['0.00', '-0.25', '-0.50']);
  assert.equal(CYL_OPTIONS.at(-1), '-6.00');
  assert.equal(AXIS_OPTIONS.length, 181);
  assert.equal(AXIS_OPTIONS.at(-1), '180');
});

test('ADD / IPD lists, display defaults and texts appear verbatim in legacy RxForm', () => {
  assert.ok(SRC.includes(JSON.stringify(ADD_OPTIONS).replace(/","/g, '", "')));
  assert.equal(IPD_OPTIONS.length, 51);
  assert.equal(IPD_OPTIONS[0], '50.0');
  assert.equal(IPD_OPTIONS.at(-1), '75.0');
  assert.ok(IPD_OPTIONS.includes('62.0'));
  assert.equal(IPD_OPTIONS.includes(IPD_DISPLAY_DEFAULT), false); // quirk: "62" is not an option value
  assert.ok(SRC.includes('f.ipd || "62"'));
  assert.ok(SRC.includes('|| "+0.00"') && SPH_DISPLAY_DEFAULT === '+0.00');
  assert.ok(SRC.includes('|| "0.00"') && CYL_DISPLAY_DEFAULT === '0.00' && ADD_DISPLAY_DEFAULT === '0.00');
  assert.ok(SRC.includes('|| "0"') && AXIS_DISPLAY_DEFAULT === '0');
  for (const t of [AXIS_REQUIRED_ERR, AXIS_FIELD_ERR_TEXT, AXIS_BANNER_TEXT, NO_PATIENTS_WARNING]) assert.ok(SRC.includes(JSON.stringify(t)), t);
  assert.deepEqual(RX_EYES, [EYE_RIGHT, EYE_LEFT, EYE_BOTH]);
  assert.ok(SRC.includes('["العين اليمنى", "العين اليسرى", "كلتا العينين"]'));
  assert.ok(SRC.includes('["المريض", "قياسات النظر", "الأدوية"]'));
  assert.deepEqual(RX_STEPS, ['المريض', 'قياسات النظر', 'الأدوية']);
  assert.equal(RX_LAST_STEP, 2);
});

test('autoPatientOf: exactly one patient', () => {
  assert.equal(autoPatientOf([P]), P);
  assert.equal(autoPatientOf([]), null);
  assert.equal(autoPatientOf([P, P]), null);
  assert.equal(autoPatientOf(null), null);
  assert.equal(autoPatientOf(undefined), null);
});

test('blankRx equals the legacy blank, with and without an auto patient', () => {
  for (const auto of [null, P, { id: 0, name: '' }]) {
    const legacy = legacyConst('blank', SRC, { autoPatient: auto, localISO: () => TODAY });
    assert.deepEqual(blankRx(auto, TODAY), legacy);
    assert.deepEqual(Object.keys(blankRx(auto, TODAY)), Object.keys(legacy));
  }
  assert.equal(blankRx(P, TODAY).patient, 'سارة');
  assert.equal(blankRx(P, TODAY).patientId, 12);
  assert.equal(blankRx(null, TODAY).patientId, null);
  assert.equal(blankRx(null, TODAY).eye, EYE_BOTH);
});

test('initialRxState / initialRxStep: add vs edit', () => {
  assert.deepEqual(initialRxState(null, P, TODAY), blankRx(P, TODAY));
  const rx = { id: 1, patient: 'قديم', patientId: 3, eye: EYE_LEFT };
  assert.deepEqual(initialRxState(rx, P, TODAY), rx); // auto patient not applied in edit mode
  assert.notEqual(initialRxState(rx, P, TODAY), rx);
  assert.equal(initialRxStep(P, null), 1);
  assert.equal(initialRxStep(P, rx), 0);
  assert.equal(initialRxStep(null, null), 0);
  assert.equal(initialRxStep(null, rx), 0);
});

test('step tabs', () => {
  assert.deepEqual(rxStepLabels(P), ['قياسات النظر', 'الأدوية']);
  assert.deepEqual(rxStepLabels(null), RX_STEPS);
  assert.equal(rxRealStep(P, 0), 1);
  assert.equal(rxRealStep(P, 1), 2);
  assert.equal(rxRealStep(null, 0), 0);
});

test('needsRight / needsLeft / refractionSides', () => {
  assert.equal(needsRight(EYE_RIGHT), true);
  assert.equal(needsRight(EYE_LEFT), false);
  assert.equal(needsRight(EYE_BOTH), true);
  assert.equal(needsLeft(EYE_LEFT), true);
  assert.equal(needsLeft(EYE_RIGHT), false);
  assert.equal(needsLeft(EYE_BOTH), true);
  assert.equal(needsRight(undefined), false);
  assert.deepEqual(refractionSides(EYE_RIGHT), [['اليمنى', 'R', true], ['اليسرى', 'L', false]]);
});

test('validateRx: AXIS required with CYL on a selected eye', () => {
  const base = blankRx(P, TODAY);
  assert.deepEqual(validateRx(base), {});
  assert.deepEqual(validateRx({ ...base, cylR: '-1.00' }), { axisR: AXIS_REQUIRED_ERR });
  assert.deepEqual(validateRx({ ...base, cylR: '-1.00', axisR: '90' }), {});
  assert.deepEqual(validateRx({ ...base, cylR: '-1.00', cylL: '-0.50' }), { axisR: AXIS_REQUIRED_ERR, axisL: AXIS_REQUIRED_ERR });
  assert.deepEqual(Object.keys(validateRx({ ...base, cylR: '-1', cylL: '-1' })), ['axisR', 'axisL']);
  // Unselected eye is ignored.
  assert.deepEqual(validateRx({ ...base, eye: EYE_LEFT, cylR: '-1.00' }), {});
  assert.deepEqual(validateRx({ ...base, eye: EYE_RIGHT, cylL: '-1.00' }), {});
  // Legacy quirk: an explicitly chosen CYL "0.00" still requires AXIS.
  assert.deepEqual(validateRx({ ...base, cylR: '0.00' }), { axisR: AXIS_REQUIRED_ERR });
  // AXIS "0" (a chosen value) satisfies the rule.
  assert.deepEqual(validateRx({ ...base, cylR: '-1.00', axisR: '0' }), {});
  assert.equal(isRxValid({}), true);
  assert.equal(isRxValid({ axisR: 'x' }), false);
});

test('patientStepBlocked: only step 0 without a patient name', () => {
  assert.equal(patientStepBlocked(0, { patient: '' }), true);
  assert.equal(patientStepBlocked(0, {}), true);
  assert.equal(patientStepBlocked(0, { patient: 'x' }), false);
  assert.equal(patientStepBlocked(1, { patient: '' }), false);
});

test('patient select: numeric id match, name copied', () => {
  const list = [{ id: 1, name: 'أ' }, { id: 2, name: 'ب' }, { id: 'u-3', name: 'ج' }];
  assert.equal(findRxPatient(list, '2'), list[1]);
  assert.equal(findRxPatient(list, 'u-3'), undefined); // string ids never match (legacy)
  assert.deepEqual(withRxPatient({ a: 1 }, '2', list[1]), { a: 1, patientId: 2, patient: 'ب' });
  assert.deepEqual(withRxPatient({}, '', undefined), { patientId: 0, patient: '' }); // "اختر مريض" → id 0
  assert.ok(Number.isNaN(withRxPatient({}, 'u-3', undefined).patientId));
});

test('axis star, error clearing and banner eye', () => {
  assert.equal(axisStarShown('-1.00'), true);
  assert.equal(axisStarShown('0.00'), false);
  assert.equal(axisStarShown(''), '');
  assert.equal(axisStarShown(undefined), undefined);
  assert.equal(clearsAxisError('0.00'), true);
  assert.equal(clearsAxisError('-0.25'), false);
  assert.equal(axisBannerEye({ axisR: 'x', axisL: 'y' }), 'كلتيهما');
  assert.equal(axisBannerEye({ axisR: 'x' }), 'اليمنى');
  assert.equal(axisBannerEye({ axisL: 'y' }), 'اليسرى');
  assert.equal(axisBannerEye({ axisR: undefined, axisL: 'y' }), 'اليسرى');
});
