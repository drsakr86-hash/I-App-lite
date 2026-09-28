import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tomorrowOf, reminderRows, reminderButtonLabel, reminderTypeLabel } from '../src/components/modals/reminders-modal-model.js';
import {
  DEFAULT_PRINT_DOCTOR, printDoctorName, printPatient, GLASSES_HEADERS, GLASSES_ROWS, GLASSES_KEYS, glassesCell,
  MEDICINES_PREVIEW, medicineLines, medicinePreview, moreMedicinesCount, hasMoreMedicines
} from '../src/components/modals/print-modal-model.js';
import { legacyFunctionSource, legacyConst } from './forms-legacy-source.js';

function localISO(d) {
  d = d || new Date();
  const z = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return z.toISOString().slice(0, 10);
}

// ---- RemindersModal
const REM_SRC = legacyFunctionSource('RemindersModal');
const isActiveApt = legacyConst('isActiveApt');

test('tomorrowOf equals the legacy tomorrow computation', () => {
  const RealDate = Date;
  for (const t of [new Date(2026, 8, 28, 10), new Date(2026, 8, 30, 23, 59), new Date(2026, 11, 31, 0, 1), new Date(2028, 1, 28, 12)]) {
    class FixedDate extends RealDate {
      constructor(...a) { if (a.length) super(...a); else super(t.getTime()); }
    }
    const legacy = legacyConst('tomorrow', REM_SRC, { localISO, Date: FixedDate });
    assert.equal(localISO(tomorrowOf(t)), legacy);
  }
  assert.equal(localISO(tomorrowOf(new Date(2026, 11, 31, 10))), '2027-01-01');
  const now = new Date(2026, 8, 28, 10);
  tomorrowOf(now);
  assert.equal(now.getDate(), 28); // input not mutated
});

const T = '2026-09-29';
const APTS = [
  { id: 1, patient: 'ب', date: T, time: '20:30', phone: '010' },
  { id: 2, patient: 'أ', date: T, time: '09:00', reminded: '2026-09-28' },
  { id: 3, patient: 'ج', date: T, time: '10:00', cancelled: true },
  { id: 4, patient: 'د', date: T, time: '11:00', status: 'cancelled' },
  { id: 5, patient: 'ه', date: T, time: '12:00', waitStatus: 'cancelled' },
  { id: 6, patient: 'و', date: '2026-09-28', time: '08:00' },
  { id: 7, patient: 'ز', date: T },
  { id: 8, patient: 'ح', date: T, time: '9:30' },
  { id: 9, patient: 'ط', date: T, time: '20:30', waitStatus: 'done' }
];

test('reminderRows equals the legacy rows expression', () => {
  for (const apts of [APTS, [], null, undefined, APTS.slice(0, 3)]) {
    const legacy = legacyConst('rows', REM_SRC, { apts, tomorrow: T, isActiveApt, localISO });
    assert.deepEqual(reminderRows(apts, T), legacy);
  }
});

test('reminderRows: tomorrow only, not cancelled, sorted by time string', () => {
  const rows = reminderRows(APTS, T);
  // No time sorts first; "9:30" sorts after "20:30" (string compare, legacy).
  assert.deepEqual(rows.map(a => a.id), [7, 2, 1, 9, 8]);
  assert.ok(rows.some(a => a.reminded)); // reminded ones stay listed
  assert.deepEqual(reminderRows(APTS, '2026-09-30'), []);
  assert.deepEqual(reminderRows(null, T), []);
  // Legacy quirk kept: a null entry in the list throws (a.date is read
  // before isActiveApt's null guard).
  assert.throws(() => reminderRows([...APTS, null], T), TypeError);
  assert.throws(() => legacyConst('rows', REM_SRC, { apts: [null], tomorrow: T, isActiveApt }), TypeError);
});

test('reminder labels', () => {
  assert.ok(REM_SRC.includes('a.reminded ? "✓ تم الإرسال — إعادة" : "💬 إرسال التذكير"'));
  assert.ok(REM_SRC.includes('a.type || "فحص"'));
  assert.ok(REM_SRC.includes('if (waOpen(a.phone, waReminderText(a)) && onMark) onMark(a);'));
  assert.equal(reminderButtonLabel(undefined), '💬 إرسال التذكير');
  assert.equal(reminderButtonLabel('2026-09-28'), '✓ تم الإرسال — إعادة');
  assert.equal(reminderTypeLabel(''), 'فحص');
  assert.equal(reminderTypeLabel(undefined), 'فحص');
  assert.equal(reminderTypeLabel('متابعة'), 'متابعة');
});

// ---- PrintModal
const PRINT_SRC = legacyFunctionSource('PrintModal');

test('printDoctorName / printPatient equal legacy', () => {
  for (const primaryDoctor of [undefined, null, {}, { name: '' }, { name: 'د. سلمى أحمد' }]) {
    assert.equal(printDoctorName(primaryDoctor), legacyConst('docName', PRINT_SRC, { primaryDoctor }));
  }
  assert.equal(printDoctorName(null), DEFAULT_PRINT_DOCTOR);
  assert.equal(DEFAULT_PRINT_DOCTOR, 'د. عبدالستار صقر');
  assert.equal(printDoctorName({ name: 'د. سلمى أحمد', short: 'د. سلمى' }), 'د. سلمى أحمد');
  const p = { id: 1 };
  assert.equal(printPatient(p), p);
  assert.deepEqual(printPatient(undefined), {});
  assert.deepEqual(printPatient(null), {});
  assert.ok(PRINT_SRC.includes('printDoc(getGlassesHTML(rx, p, docName, clinic));'));
  assert.ok(PRINT_SRC.includes('printDoc(getRxHTML(rx, p, docName, clinic));'));
});

test('glasses preview grid', () => {
  assert.ok(PRINT_SRC.includes(JSON.stringify(GLASSES_HEADERS).replace(/,/g, ', ') + '.map('));
  assert.ok(PRINT_SRC.includes(JSON.stringify(GLASSES_ROWS).replace(/,/g, ', ') + '.map('));
  assert.ok(PRINT_SRC.includes(JSON.stringify(GLASSES_KEYS).replace(/,/g, ', ') + '.map('));
  const rx = { sphR: '-1.25', cylR: '', axisR: 90, sphL: 0, cylL: undefined };
  assert.equal(glassesCell(rx, 'Distance', 'sphR'), '-1.25');
  assert.equal(glassesCell(rx, 'Distance', 'axisR'), 90);
  assert.equal(glassesCell(rx, 'Distance', 'cylR'), '');
  assert.equal(glassesCell(rx, 'Distance', 'sphL'), ''); // 0 shows blank (legacy ||)
  assert.equal(glassesCell(rx, 'Distance', 'cylL'), '');
  assert.equal(glassesCell(rx, 'Reading', 'sphR'), '');
});

test('medicines preview: first three non-empty lines + count of the rest', () => {
  assert.equal(MEDICINES_PREVIEW, 3);
  assert.ok(PRINT_SRC.includes('rx.medicines.split("\\n").filter(Boolean).slice(0, 3)'));
  assert.ok(PRINT_SRC.includes('rx.medicines.split("\\n").filter(Boolean).length > 3'));
  const m = 'A\n\nB\nC\nD\nE\n';
  assert.deepEqual(medicineLines(m), ['A', 'B', 'C', 'D', 'E']);
  assert.deepEqual(medicinePreview(m), ['A', 'B', 'C']);
  assert.equal(hasMoreMedicines(m), true);
  assert.equal(moreMedicinesCount(m), 2);
  assert.deepEqual(medicinePreview('A\nB'), ['A', 'B']);
  assert.equal(hasMoreMedicines('A\nB\nC'), false);
  assert.equal(hasMoreMedicines('\n\n'), false);
  assert.deepEqual(medicinePreview('\n\n'), []);
  // Whitespace-only lines are kept (filter(Boolean), no trim — legacy).
  assert.deepEqual(medicineLines(' \nA'), [' ', 'A']);
  // Legacy: a non-string medicines value throws.
  assert.throws(() => medicineLines(['A']), TypeError);
});
