import test from 'node:test';
import assert from 'node:assert/strict';
import { CLINICS, clinicLabel, CLINIC_FILTERS, CLINICS_LIST, PATIENT_CLINICS, CLINIC_CODE, clinicDisplay } from '../src/modules/constants/clinics.js';
import { IMAGING_TYPES, IMAGING_EYES, IMAGING_REPORT_TEMPLATES, IMAGING_ORDER_STATUSES, imagingTypeName } from '../src/modules/constants/imaging.js';
import { DEFAULT_TESTS, CAT_COLORS } from '../src/modules/constants/exams.js';
import { EXP_CATS } from '../src/modules/constants/accounting.js';
import { BOOKING_TABLE, localDateStr, localTimeStr, localISO, newId, emailKey, ROLE_LABEL, MIN_PW_LEN, GUARD_KEY } from '../src/modules/constants/misc.js';

// ---- clinics ----

test('clinicLabel: known clinic values map to their Arabic label', () => {
  assert.equal(clinicLabel('دمنهور'), 'عيادة دمنهور');
  assert.equal(clinicLabel('الرحمانية'), 'عيادة الرحمانية');
});

test('clinicLabel: unknown/empty value falls back to the value itself, then an em dash', () => {
  assert.equal(clinicLabel('غير معروف'), 'غير معروف');
  assert.equal(clinicLabel(''), '—');
  assert.equal(clinicLabel(undefined), '—');
});

test('CLINIC_FILTERS: starts with the "all clinics" option, then every CLINICS entry in order', () => {
  assert.equal(CLINIC_FILTERS[0].v, '');
  assert.equal(CLINIC_FILTERS[0].l, 'كل العيادات');
  assert.deepEqual(CLINIC_FILTERS.slice(1), CLINICS);
});

test('CLINICS_LIST: plain clinic names match CLINICS values', () => {
  assert.deepEqual(CLINICS_LIST, CLINICS.map(c => c.v));
});

test('PATIENT_CLINICS: every clinic has either days+sessions or a schedule map', () => {
  for (const c of PATIENT_CLINICS) {
    assert.ok(c.sessions || c.schedule, `${c.id} needs sessions or schedule`);
  }
});

test('clinicDisplay / CLINIC_CODE round-trip between short and full clinic names', () => {
  assert.equal(clinicDisplay('دمنهور'), 'عيادة دمنهور');
  assert.equal(CLINIC_CODE[clinicDisplay('دمنهور')], 'دمنهور');
});

test('clinicDisplay: unknown/empty value falls back to the value itself / empty string', () => {
  assert.equal(clinicDisplay('غير معروف'), 'غير معروف');
  assert.equal(clinicDisplay(''), '');
});

// ---- imaging ----

test('imagingTypeName: known ids map to their display name, unknown id falls back to itself', () => {
  assert.equal(imagingTypeName('oct'), 'OCT');
  assert.equal(imagingTypeName('unknown-id'), 'unknown-id');
});

test('IMAGING_REPORT_TEMPLATES and IMAGING_ORDER_STATUSES exist for every IMAGING_TYPES id (where applicable)', () => {
  for (const t of IMAGING_TYPES) {
    assert.ok(t.id in IMAGING_REPORT_TEMPLATES, `${t.id} needs a report template`);
  }
  assert.deepEqual(
    Object.keys(IMAGING_ORDER_STATUSES).sort(),
    ['cancelled', 'completed', 'in_progress', 'reported', 'requested', 'scheduled']
  );
});

test('IMAGING_EYES: three standard eye options (OU/OD/OS)', () => {
  assert.deepEqual(IMAGING_EYES.map(e => e.v), ['OU', 'OD', 'OS']);
});

// ---- exams ----

test('CAT_COLORS: has a color for every DEFAULT_TESTS category', () => {
  const cats = new Set(DEFAULT_TESTS.map(t => t.cat));
  for (const cat of cats) {
    assert.ok(CAT_COLORS[cat], `${cat} needs a color`);
  }
});

// ---- accounting ----

test('EXP_CATS: each entry is a [label, icon] pair', () => {
  assert.equal(EXP_CATS.length, 7);
  for (const [label, icon] of EXP_CATS) {
    assert.equal(typeof label, 'string');
    assert.equal(typeof icon, 'string');
  }
});

// ---- misc ----

test('BOOKING_TABLE is the expected localStorage/table key', () => {
  assert.equal(BOOKING_TABLE, 'iapp_booking_requests');
});

test('localDateStr / localTimeStr: match the expected format', () => {
  assert.match(localDateStr(), /^\d{4}-\d{2}-\d{2}$/);
  assert.match(localTimeStr(), /^\d{2}:\d{2}$/);
});

// ---- Phase 8, batch 14: small standalone helpers/constants moved out of
// public/legacy/app-runtime.js ----

test('localISO: formats a given date in the local timezone as YYYY-MM-DD', () => {
  assert.match(localISO(new Date('2024-03-05T10:00:00Z')), /^\d{4}-\d{2}-\d{2}$/);
});

test('localISO: defaults to "now" when called with no argument', () => {
  assert.match(localISO(), /^\d{4}-\d{2}-\d{2}$/);
});

test('newId: returns a timestamp-based number close to Date.now()', () => {
  const before = Date.now();
  const a = newId();
  const after = Date.now();
  assert.equal(typeof a, 'number');
  // a = Date.now() + a small random jitter (0..996), so it can briefly read
  // slightly above "after" too -- bound it loosely rather than asserting
  // strict ordering across two separate calls (which is not guaranteed when
  // both land in the same millisecond and the second rolls a smaller jitter).
  assert.ok(a >= before && a <= after + 1000);
});

test('emailKey: trims, lowercases, and tolerates non-string/empty input', () => {
  assert.equal(emailKey('  Foo@BAR.com '), 'foo@bar.com');
  assert.equal(emailKey(''), '');
  assert.equal(emailKey(undefined), '');
  assert.equal(emailKey(null), '');
});

test('ROLE_LABEL: has an Arabic label for every staff role', () => {
  assert.deepEqual(ROLE_LABEL, {
    admin: 'مدير',
    doctor: 'طبيب',
    secretary: 'سكرتارية',
    employee: 'موظف'
  });
});

test('MIN_PW_LEN / GUARD_KEY: expected values', () => {
  assert.equal(MIN_PW_LEN, 6);
  assert.equal(GUARD_KEY, 'iapp_login_guard');
});
