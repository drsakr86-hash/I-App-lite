import test from 'node:test';
import assert from 'node:assert/strict';
import {
  readMySite, saveMySite, MY_SITE_KEY, freeArrivalTime, matchPatients, alreadyToday, arrivalError, buildArrival,
  defaultArrivalType, readExamMode, saveExamMode, appendTerm, followUpDate, followUpChoice, cleanIop, ARRIVAL_DOCTOR
} from '../src/modules/quick-desk/model.js';
import { resolveFlag } from '../src/modules/feature-flags/index.js';

const mem = (init = {}) => { const m = { ...init }; return { getItem: k => (k in m ? m[k] : null), setItem: (k, v) => { m[k] = String(v); }, m }; };

test('site: only a known site is saved and read back', () => {
  const s = mem();
  assert.equal(readMySite(s), '');
  assert.equal(saveMySite(s, 'مكان آخر'), false);
  assert.equal(saveMySite(s, 'دمنهور'), true);
  assert.equal(readMySite(s), 'دمنهور');
  assert.equal(readMySite(mem({ [MY_SITE_KEY]: 'قديم' })), '');
  assert.equal(readMySite(null), '');
});

test('arrival time: same minute taken -> next free minute; cancelled does not block', () => {
  const apts = [
    { id: 1, doctor: ARRIVAL_DOCTOR, date: '2026-11-26', time: '10:05' },
    { id: 2, doctor: ARRIVAL_DOCTOR, date: '2026-11-26', time: '10:06' },
    { id: 3, doctor: ARRIVAL_DOCTOR, date: '2026-11-26', time: '10:07', cancelled: true }
  ];
  assert.equal(freeArrivalTime(apts, { doctor: ARRIVAL_DOCTOR, date: '2026-11-26', time: '10:05' }), '10:07');
  assert.equal(freeArrivalTime([{ id: 1, doctor: ARRIVAL_DOCTOR, date: '2026-11-26', time: '10:59' }], { doctor: ARRIVAL_DOCTOR, date: '2026-11-26', time: '10:59' }), '11:00');
  assert.equal(freeArrivalTime([], { doctor: ARRIVAL_DOCTOR, date: '2026-11-26', time: '09:00' }), '09:00');
});

test('patient search: Arabic spelling forms, Arabic-Indic phone digits, starts-with first, limit', () => {
  const ps = [
    { id: 1, name: 'محمد أحمد', phone: '01012345678', patientCode: 'P-0001' },
    { id: 2, name: 'أحمد مصطفى', phone: '01199999999', patientCode: 'P-0002' },
    { id: 3, name: 'فاطمة علي', phone: '01055555555', patientCode: 'P-0003' }
  ];
  assert.deepEqual(matchPatients(ps, 'احمد').map(p => p.id), [2, 1]);
  assert.deepEqual(matchPatients(ps, 'فاطمه').map(p => p.id), [3]);
  assert.deepEqual(matchPatients(ps, '٠١١٩٩').map(p => p.id), [2]);
  assert.deepEqual(matchPatients(ps, 'P-0003').map(p => p.id), [3]);
  assert.deepEqual(matchPatients(ps, ''), []);
  assert.equal(matchPatients(ps, '0', 2).length, 2);
});

test('already today: by id, or by name for an appointment with no patient id; cancelled ignored', () => {
  const today = '2026-11-26';
  const apts = [
    { id: 1, patientId: 7, patient: 'أحمد', date: today },
    { id: 2, patient: 'فاطمة علي', date: today },
    { id: 3, patientId: 9, patient: 'سعيد', date: today, cancelled: true }
  ];
  assert.equal(alreadyToday(apts, { patientId: 7, name: 'أحمد' }, today), true);
  assert.equal(alreadyToday(apts, { patientId: null, name: 'فاطمه علي' }, today), true);
  assert.equal(alreadyToday(apts, { patientId: 9, name: 'سعيد' }, today), false);
  assert.equal(alreadyToday(apts, { patientId: 7, name: 'أحمد' }, '2026-11-27'), false);
});

test('arrival validation', () => {
  assert.equal(arrivalError({ name: 'أحمد', phone: '', site: '' }), 'qd.err.site');
  assert.equal(arrivalError({ name: 'ا', phone: '', site: 'دمنهور' }), 'qd.err.name');
  assert.equal(arrivalError({ name: 'أحمد', phone: '0101', site: 'دمنهور' }), 'qd.err.phone');
  assert.equal(arrivalError({ name: 'أحمد', phone: '٠١٠١٢٣٤٥٦٧٨', site: 'دمنهور' }), null);
  assert.equal(arrivalError({ name: 'أحمد', phone: '', site: 'الرحمانية' }), null);
});

test('arrival record: today, now, site, price, already waiting; existing patient keeps id and phone', () => {
  const now = new Date(2026, 10, 26, 10, 5, 30);
  const apts = [{ id: 1, doctor: ARRIVAL_DOCTOR, date: '2026-11-26', time: '10:05' }];
  const a = buildArrival({ patient: { id: 5, name: 'أحمد مصطفى', phone: '01199999999' }, site: 'دمنهور', type: 'متابعة', price: 150, appointments: apts, now, id: 42 });
  assert.deepEqual(
    { id: a.id, patient: a.patient, patientId: a.patientId, phone: a.phone, date: a.date, time: a.time, clinic: a.clinic, type: a.type, cost: a.cost, paid: a.paid, waitStatus: a.waitStatus, doctor: a.doctor },
    { id: 42, patient: 'أحمد مصطفى', patientId: 5, phone: '01199999999', date: '2026-11-26', time: '10:06', clinic: 'دمنهور', type: 'متابعة', cost: 150, paid: false, waitStatus: 'waiting', doctor: ARRIVAL_DOCTOR }
  );
  assert.equal(a.arrivedAt, now.getTime());
  const n = buildArrival({ name: ' سعيد  ', phone: '٠١٠١٢٣٤٥٦٧٨', site: 'الرحمانية', type: 'فحص روتيني', price: undefined, appointments: [], now, id: 43 });
  assert.equal(n.patient, 'سعيد');
  assert.equal(n.patientId, null);
  assert.equal(n.phone, '01012345678');
  assert.equal(n.cost, '');
  assert.equal(defaultArrivalType(true), 'متابعة');
  assert.equal(defaultArrivalType(false), 'فحص روتيني');
});

test('exam mode: quick by default, full remembered', () => {
  const s = mem();
  assert.equal(readExamMode(s), 'quick');
  saveExamMode(s, 'full');
  assert.equal(readExamMode(s), 'full');
  saveExamMode(s, 'anything');
  assert.equal(readExamMode(s), 'quick');
  assert.equal(readExamMode(null), 'quick');
});

test('diagnosis chips: one per line, no duplicates', () => {
  assert.equal(appendTerm('', 'Cataract'), 'Cataract');
  assert.equal(appendTerm('Cataract', 'Dry eye'), 'Cataract\nDry eye');
  assert.equal(appendTerm('Cataract\n', 'cataract'), 'Cataract\n');
  assert.equal(appendTerm('Cataract  ', 'POAG'), 'Cataract\nPOAG');
});

test('follow-up shortcuts from the exam date, and which one is selected', () => {
  assert.equal(followUpDate('2026-11-26', 7), '2026-12-03');
  assert.equal(followUpDate('2026-11-26', 90), '2027-02-24');
  assert.equal(followUpChoice('2026-11-26', '2026-12-26'), 30);
  assert.equal(followUpChoice('2026-11-26', '2026-12-27'), null);
  assert.equal(followUpChoice('2026-11-26', ''), null);
});

test('IOP input keeps digits only (Arabic-Indic accepted), max two', () => {
  assert.equal(cleanIop('١٨'), '18');
  assert.equal(cleanIop('2a1'), '21');
  assert.equal(cleanIop('123'), '12');
  assert.equal(cleanIop(''), '');
});

test('quick_desk flag: on by default, ?ff=-quick_desk turns it off', () => {
  assert.equal(resolveFlag('quick_desk', {}), true);
  assert.equal(resolveFlag('quick_desk', { query: '?ff=-quick_desk' }), false);
  assert.equal(resolveFlag('quick_desk', { stored: '0' }), false);
});
