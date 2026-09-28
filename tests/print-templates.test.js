import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getDailyReportHTML, getPatientFileHTML, getRxHTML, getGlassesHTML,
  getRadiologyHTML, getAccountingReportHTML,
  getDailyReportHTMLRaw, getPatientFileHTMLRaw
} from '../src/modules/print/index.js';
import { escHTML, escDeep, safeTemplate } from '../src/modules/print/escape.js';

// ---- escHTML / escDeep / safeTemplate ----
test('escHTML escapes the five HTML-sensitive characters', () => {
  assert.equal(escHTML(`<a href="x">'&'</a>`), '&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;');
});

test('escDeep recurses into arrays and plain objects, leaves numbers/null alone', () => {
  const out = escDeep({ name: '<b>Bad</b>', tags: ['<i>x</i>', 'ok'], age: 5, note: null });
  assert.deepEqual(out, { name: '&lt;b&gt;Bad&lt;/b&gt;', tags: ['&lt;i&gt;x&lt;/i&gt;', 'ok'], age: 5, note: null });
});

test('escDeep stops recursing past depth 8 (defensive against cycles/huge nesting)', () => {
  let obj = { v: '<x>' };
  for (let i = 0; i < 12; i++) obj = { child: obj };
  // Should not throw; deep-enough levels are returned as-is rather than escaped.
  assert.doesNotThrow(() => escDeep(obj));
});

test('safeTemplate escapes every argument before calling the wrapped function', () => {
  const fn = (a, b) => `${a}|${JSON.stringify(b)}`;
  const wrapped = safeTemplate(fn);
  assert.equal(wrapped('<i>', { n: '<b>' }), '&lt;i&gt;|{"n":"&lt;b&gt;"}');
});

// ---- shared fixtures ----
const CLINIC = { address: 'دمنهور', phone: '045123' };
const PRIMARY = { name: 'د. أحمد' };
const PATIENT = { id: 1, name: 'سارة أحمد', age: 30, gender: 'أنثى', phone: '0100', patientCode: 'P-1' };

// ---- getDailyReportHTML ----
test('daily report: counts visits/appointments and totals paid revenue', () => {
  const visits = [
    { patientId: 1, date: '2026-01-01', type: 'كشف', doctor: 'د. أحمد', cost: '100', paid: true },
    { patientId: 1, date: '2026-01-01', type: 'متابعة', doctor: 'د. أحمد', cost: '50', paid: false },
    { patientId: 1, date: '2026-01-02', type: 'كشف', doctor: 'د. أحمد', cost: '200', paid: true }
  ];
  const html = getDailyReportHTML('2026-01-01', [PATIENT], visits, [{ id: 1 }, { id: 2 }], PRIMARY, CLINIC);
  assert.match(html, /<div class="stat-val">2<\/div><div class="stat-lbl">إجمالي الزيارات<\/div>/);
  assert.match(html, /100<\/div><div class="stat-lbl">الإيرادات/);
  assert.match(html, /<div class="stat-val" style="color:#cc3300;">1<\/div><div class="stat-lbl">غير مدفوع<\/div>/);
  assert.match(html, /<div class="stat-val">2<\/div><div class="stat-lbl">المواعيد<\/div>/);
});

test('daily report: shows the empty-day message when there are no visits', () => {
  const html = getDailyReportHTML('2026-01-05', [], [], [], PRIMARY, CLINIC);
  assert.match(html, /لا توجد زيارات مسجلة لهذا اليوم/);
});

test('daily report Raw vs wrapped: wrapped version HTML-escapes patient/doctor text', () => {
  const visits = [{ patientId: 1, date: '2026-01-01', type: '<b>X</b>', doctor: '<script>', cost: '1', paid: true }];
  const raw = getDailyReportHTMLRaw('2026-01-01', [PATIENT], visits, [], PRIMARY, CLINIC);
  const safe = getDailyReportHTML('2026-01-01', [PATIENT], visits, [], PRIMARY, CLINIC);
  assert.match(raw, /<script>/);
  assert.doesNotMatch(safe, /<script>/);
  assert.match(safe, /&lt;script&gt;/);
});

// ---- getPatientFileHTML ----
test('patient file: shows patient card fields and totals paid visits', () => {
  const visits = [
    { patientId: 1, date: '2026-01-01', type: 'كشف', doctor: 'د. أحمد', result: 'جيد', cost: '150', paid: true },
    { patientId: 2, date: '2026-01-01', type: 'كشف', doctor: 'د. أحمد', cost: '999', paid: true }
  ];
  const html = getPatientFileHTML(PATIENT, visits, [], [], PRIMARY, CLINIC);
  assert.match(html, /<b>سارة أحمد<\/b>/);
  assert.match(html, /150 ج\.م<\/b>/); // totalPaid only counts this patient's visits
  assert.doesNotMatch(html, /999/);
});

test('patient file: omits the last-exam section when there is no exam for this patient', () => {
  const html = getPatientFileHTML(PATIENT, [], [], [], PRIMARY, CLINIC);
  assert.doesNotMatch(html, /آخر فحص سريري/);
});

test('patient file: shows the last exam (most recent by date) when present', () => {
  const exams = [
    { patientId: 1, date: '2026-01-01', diagnosis: 'قديم' },
    { patientId: 1, date: '2026-02-01', diagnosis: 'حديث' }
  ];
  const html = getPatientFileHTMLRaw(PATIENT, [], exams, [], PRIMARY, CLINIC);
  assert.match(html, /آخر فحص سريري \(2026-02-01\)/);
  assert.match(html, /حديث/);
});

// ---- getRxHTML ----
test('Rx: uses the clinic-owner letterhead when no doctor name (or the owner\'s) is given', () => {
  const html = getRxHTML({ date: '2026-01-01', medicines: 'بانادول - قرص كل ٨ ساعات' }, PATIENT, '', CLINIC);
  assert.match(html, /د\/ عبد الستار سالم صقر/);
  assert.match(html, /عضو الجمعية الرمدية المصرية/);
});

test('Rx: uses a plain "طب وجراحة العيون" line for a non-owner doctor name', () => {
  const html = getRxHTML({ date: '2026-01-01', medicines: 'X' }, PATIENT, 'د. محمد علي', CLINIC);
  assert.match(html, /<div class="dn">د\. محمد علي<\/div>/);
  assert.match(html, /<div class="ln">طب وجراحة العيون<\/div>/);
  assert.doesNotMatch(html, /عضو الجمعية الرمدية المصرية/);
});

test('Rx: splits each medicine line into a name and a dose on first dash', () => {
  const html = getRxHTML({ date: '2026-01-01', medicines: 'Panadol - 1 tab every 8h\nBrufen' }, PATIENT, '', CLINIC);
  assert.match(html, /<div class="nm"><span class="i">1\.<\/span>Panadol<\/div><div class="ds" dir="rtl">1 tab every 8h<\/div>/);
  assert.match(html, /<div class="nm"><span class="i">2\.<\/span>Brufen<\/div>/);
});

test('Rx: blank medicines produces no med rows but does not throw', () => {
  const html = getRxHTML({ date: '2026-01-01', medicines: '' }, PATIENT, '', CLINIC);
  assert.match(html, /<div class="meds"><\/div>/);
});

// ---- getGlassesHTML ----
test('glasses Rx: fills the SPH/CYL/AXIS/IPD cells from the rx object', () => {
  const rx = { date: '2026-01-01', sphR: '-1.00', cylR: '-0.50', axisR: '90', sphL: '-1.25', cylL: '', axisL: '', ipd: '62' };
  const html = getGlassesHTML(rx, PATIENT, 'د. أحمد', CLINIC);
  assert.match(html, /<td class="td-val">-1\.00<\/td>/);
  assert.match(html, /<td class="td-val" rowspan="2">62<\/td>/);
});

test('glasses Rx: falls back to the seed clinic address/phone when none is given', () => {
  const html = getGlassesHTML({ date: '2026-01-01' }, PATIENT, 'د. أحمد', {});
  assert.match(html, /دمنهور - برج المنتزه بجوار حديقة الجمهورية/);
});

test('glasses Rx: ADD and notes lines only render when present', () => {
  const withExtra = getGlassesHTML({ date: '2026-01-01', add: '+1.00', notes: 'راجع بعد شهر' }, PATIENT, 'د. أحمد', CLINIC);
  const without = getGlassesHTML({ date: '2026-01-01' }, PATIENT, 'د. أحمد', CLINIC);
  assert.match(withExtra, /ADD: <b>\+1\.00<\/b>/);
  assert.match(withExtra, /راجع بعد شهر/);
  assert.doesNotMatch(without, /ADD:/);
});

// ---- getRadiologyHTML ----
const ALL_TESTS = [
  { id: 't1', cat: 'أشعة', name: 'OCT', name_ar: 'أوسيتي' },
  { id: 't2', cat: 'معمل', name: 'CBC', name_ar: 'صورة دم' }
];

test('radiology: groups selected tests by category and counts the total', () => {
  const html = getRadiologyHTML({ t1: 'OD', t2: 'OU' }, PATIENT, '', PRIMARY, ALL_TESTS, CLINIC);
  assert.match(html, /Total investigations ordered: 2/);
  assert.match(html, /<div class="cat-title">أشعة<\/div>/);
  assert.match(html, /<div class="cat-title">معمل<\/div>/);
  assert.match(html, /<div class="eye-badge">OD<\/div>/);
});

test('radiology: an unknown test id is silently skipped (not counted, not rendered)', () => {
  const html = getRadiologyHTML({ ghost: 'OU' }, PATIENT, '', PRIMARY, ALL_TESTS, CLINIC);
  assert.match(html, /Total investigations ordered: 1/); // Object.keys(selected).length counts it, grouping doesn't
  assert.doesNotMatch(html, /<div class="cat-title">/); // no known test → no category section rendered
});

test('radiology: notes box only renders when notes are given', () => {
  const withNotes = getRadiologyHTML({ t1: 'OU' }, PATIENT, 'راجع الأسبوع القادم', PRIMARY, ALL_TESTS, CLINIC);
  const without = getRadiologyHTML({ t1: 'OU' }, PATIENT, '', PRIMARY, ALL_TESTS, CLINIC);
  assert.match(withNotes, /راجع الأسبوع القادم/);
  assert.doesNotMatch(without, /<div class="notes-box">/);
});

// ---- getAccountingReportHTML ----
test('accounting report: computes total expenses and net profit', () => {
  const expenses = [
    { date: '2026-01-01', category: 'إيجار', amount: '1000', notes: '' },
    { date: '2026-01-02', category: 'صيانة', amount: '200', notes: 'مكيف' }
  ];
  const html = getAccountingReportHTML(null, null, 'يناير 2026', 5000, expenses, CLINIC, PRIMARY);
  assert.match(html, />1,200<\/div><div class="stat-lbl">المصروفات/);
  assert.match(html, />3,800<\/div><div class="stat-lbl">صافي الربح/);
});

test('accounting report: negative net profit still renders (red, not clamped)', () => {
  const expenses = [{ date: '2026-01-01', category: 'إيجار', amount: '9000', notes: '' }];
  const html = getAccountingReportHTML(null, null, 'يناير 2026', 100, expenses, CLINIC, PRIMARY);
  assert.match(html, /color:#cc3300;">-8,900<\/div>/);
});

test('accounting report: shows the no-expenses message for an empty period', () => {
  const html = getAccountingReportHTML(null, null, 'يناير 2026', 0, [], CLINIC, PRIMARY);
  assert.match(html, /لا توجد مصروفات مسجلة في هذه الفترة/);
});

// ---- every template escapes attacker-controlled strings ----
test('every template HTML-escapes a hostile patient name (no raw <script> in the output)', () => {
  const evil = { ...PATIENT, name: '<script>alert(1)</script>' };
  const outputs = [
    getPatientFileHTML(evil, [], [], [], PRIMARY, CLINIC),
    getRxHTML({ date: '2026-01-01', medicines: '' }, evil, '', CLINIC),
    getGlassesHTML({ date: '2026-01-01' }, evil, 'د. أحمد', CLINIC),
    getRadiologyHTML({}, evil, '', PRIMARY, ALL_TESTS, CLINIC)
  ];
  for (const html of outputs) {
    assert.doesNotMatch(html, /<script>alert/);
  }
});
