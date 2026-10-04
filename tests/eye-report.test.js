// Bilingual eye report: recorded values only, translation of app-offered terms, free text untouched.
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildEyeReport, renderEyeReport, latestExamOf, describeChangeLang } from '../src/modules/patient-file/eye-report.js';
import { t, setLang, getLang, dirOf, AR, EN } from '../src/modules/i18n/index.js';
import { AR_TO_EN, ALL_OFFERED_OPTIONS, translateTerm, isKnownTerm } from '../src/modules/i18n/medical-terms.js';

const today = '2026-10-04';
const patient = { id: 'p1', name: 'مريض تجريبي', patientCode: 'P-1', age: 55, gender: 'ذكر', allergies: 'بنسلين' };
const exams = [
  { id: 'e1', date: '2026-06-01', visualAcuityR: '0.3', visualAcuityL: '1.00', iopR: '18', iopL: '16', ophth: { cmt: { od: '400' } } },
  { id: 'e2', date: '2026-09-01', doctor: 'د. أ', chiefComplaint: 'ضعف النظر', visualAcuityR: '0.5', visualAcuityL: '1.00', iopR: '17', iopL: '16', colorVision: 'طبيعي',
    diagnosis: 'سكري\n— تفصيل منظّم —\nOD: DME', treatmentPlan: 'متابعة مع حقن', anteriorSegment: 'ملاحظة حرة بالعربي', followUp: '2026-10-20',
    ophth: { va: { od: { ucva: '0.1', ph: '0.3' } }, iop: { method: 'iCare' }, refraction: { od: { sph: '-2.75', cyl: '-1.00', axis: '90' } },
      anterior: { cornea: { od: 'صافية', os: 'صافية' }, lens: { od: 'ماء أبيض (NS +2)' } }, posterior: { macula: { od: 'وذمة بقعية (DME / CME)' } },
      cd: { od: '0.4' }, cmt: { od: '300' }, dx: { od: 'وذمة بقعية سكرية (DME)' }, plan: { followUpReason: 'تقييم الاستجابة بعد الحقن' } } }
];
const injections = [
  { id: 'i1', patientId: 'p1', date: '2026-06-05', eye: 'العين اليمنى', drug: 'Eylea', doseNo: 1 },
  { id: 'i2', patientId: 'p1', date: '2026-07-05', eye: 'العين اليمنى', drug: 'Eylea', doseNo: 2 }
];
const base = { patient, exams, injections, today, clinic: { address: 'دمنهور', phone: '010' }, doctor: 'د. عبدالستار', rxList: [{ id: 'r', date: '2026-09-01', medicines: 'قطرة A' }] };

test('i18n: every Arabic key has an English counterpart and vice versa', () => {
  assert.deepEqual(Object.keys(AR).sort(), Object.keys(EN).sort());
  assert.equal(t('common.notRecorded', 'ar'), 'غير مسجل');
  assert.equal(t('common.notRecorded', 'en'), 'Not recorded');
  assert.equal(t('no.such.key', 'en'), 'no.such.key');
  assert.equal(dirOf('en'), 'ltr'); assert.equal(dirOf('ar'), 'rtl');
});

test('i18n: setLang ignores unknown languages and getLang reflects the change', () => {
  setLang('fr'); assert.equal(getLang(), 'ar');
  setLang('en'); assert.equal(getLang(), 'en');
  assert.equal(t('tab.exams'), 'Examinations');
  setLang('ar'); assert.equal(t('tab.exams'), 'الفحوصات');
});

test('terms: every drop-down option the app offers has an English form', () => {
  const missing = ALL_OFFERED_OPTIONS.filter(o => !isKnownTerm(o));
  assert.deepEqual(missing, []);
  assert.equal(translateTerm('صافية', 'en'), 'Clear');
  assert.equal(translateTerm('صافية', 'ar'), 'صافية');
  assert.equal(translateTerm('نص حر لم يُسجل في القوائم', 'en'), 'نص حر لم يُسجل في القوائم');
  assert.ok(Object.keys(AR_TO_EN).length > 100);
});

test('report model: latest exam by default; values come only from the record', () => {
  assert.equal(latestExamOf(exams).id, 'e2');
  const m = buildEyeReport(base);
  assert.equal(m.exam.date, '2026-09-01');
  assert.equal(m.va.od.bcva, '0.5'); assert.equal(m.va.od.ucva, '0.1'); assert.equal(m.va.od.ph, '0.3');
  assert.equal(m.va.os.ucva, '');
  assert.equal(m.diagnosis.main, 'سكري');
  assert.equal(m.diagnosis.od, 'وذمة بقعية سكرية (DME)');
  assert.equal(m.injections.length, 2);
  assert.equal(m.injections[1].interval, 30);
  assert.equal(m.medicines.lines[0], 'قطرة A');
});

test('report model: an older exam can be chosen and does not borrow newer values', () => {
  const m = buildEyeReport({ ...base, exam: exams[0] });
  assert.equal(m.exam.date, '2026-06-01');
  assert.equal(m.va.od.bcva, '0.3');
  assert.equal(m.diagnosis.main, '');
  assert.equal(m.medicines, null, 'prescription written after the chosen exam is not included');
});

test('report HTML (Arabic): RTL, Arabic labels, recorded values, nothing invented', () => {
  const html = renderEyeReport(buildEyeReport(base), ['ar']);
  assert.match(html, /dir="rtl"/);
  assert.match(html, /تقرير طبي متكامل للعين/);
  assert.match(html, /وذمة بقعية \(DME \/ CME\)/);
  assert.match(html, /-2\.75/);
  assert.match(html, /غير مسجل/);
  assert.doesNotMatch(html, /Comprehensive Eye Report/);
});

test('report HTML (English): LTR, translated terms, free text kept and flagged', () => {
  const html = renderEyeReport(buildEyeReport(base), ['en']);
  assert.match(html, /dir="ltr"/);
  assert.match(html, /Comprehensive Eye Report/);
  assert.match(html, /Macular oedema \(DME \/ CME\)/);
  assert.match(html, /Diabetic macular oedema \(DME\)/);
  assert.match(html, /Male/);
  assert.match(html, /Not recorded/);
  assert.match(html, /ملاحظة حرة بالعربي/, 'doctor free text is never machine-translated');
  assert.match(html, /not auto-translated/);
  assert.match(html, /Post-injection response assessment/);
  assert.doesNotMatch(html, /تقرير طبي متكامل/);
});

test('report HTML (both): two pages, one per language', () => {
  const html = renderEyeReport(buildEyeReport(base), ['ar', 'en']);
  assert.equal((html.match(/class="page"/g) || []).length, 2);
  assert.ok(html.indexOf('تقرير طبي متكامل') < html.indexOf('Comprehensive Eye Report'));
});

test('report: patient text is HTML-escaped', () => {
  const m = buildEyeReport({ ...base, patient: { ...patient, name: '<script>alert(1)</script>' } });
  const html = renderEyeReport(m, ['ar']);
  assert.ok(!html.includes('<script>alert'));
  assert.match(html, /&lt;script&gt;/);
});

test('report: no exam -> patient details only, honest message, no invented sections', () => {
  const html = renderEyeReport(buildEyeReport({ patient, exams: [], today }), ['en']);
  assert.match(html, /No examination recorded/);
  assert.doesNotMatch(html, /Visual acuity<\/h2>/);
});

test('report: totally empty input does not throw', () => {
  assert.doesNotThrow(() => renderEyeReport(buildEyeReport({}), ['ar', 'en']));
});

test('report: progress wording in English follows the direction of the acuity', () => {
  const m = buildEyeReport(base);
  const va = m.progress.changes.find(c => c.metric === 'va');
  assert.match(describeChangeLang(va, 'en'), /vision improved/);
});

import { readFileSync } from 'node:fs';
test('UI wiring: report modal, language toggle and tab labels are connected', () => {
  const pf = readFileSync(new URL('../src/screens/PatientFile.jsx', import.meta.url), 'utf8');
  assert.match(pf, /EyeReportModal/);
  assert.match(pf, /modal === "eyeReport"/);
  assert.match(pf, /dirOf\(lang\)/);
  assert.match(pf, /LangToggle/);
  const hook = readFileSync(new URL('../src/modules/patient-file/use-patient-file.js', import.meta.url), 'utf8');
  assert.match(hook, /coreFile, appointments,/);
});
