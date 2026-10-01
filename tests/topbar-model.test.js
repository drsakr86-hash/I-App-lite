import test from 'node:test';
import assert from 'node:assert/strict';
import { topBarSyncView, sessionDisplayText } from '../src/components/topbar-model.js';

const syncKeyLabel = k => ({ iapp_visits: 'الزيارات', iapp_appointments: 'المواعيد' }[k] || k);

test('topBarSyncView: idle/online state is not busy and uses the status label as the title', () => {
  const st = { offline: false, pending: 0, failedCount: 0, errors: {}, label: 'متصل ومحدّث', color: '#0f0' };
  const view = topBarSyncView(st, false, () => [], syncKeyLabel);
  assert.equal(view.stBusy, false);
  assert.equal(view.stLabel, 'متصل ومحدّث');
  assert.deepEqual(view.pendingLabels, []);
  assert.equal(view.title, 'متصل ومحدّث');
});

test('topBarSyncView: offline always counts as busy, even with nothing pending and syncing false', () => {
  const st = { offline: true, pending: 0, failedCount: 0, errors: {}, label: 'بدون اتصال', color: '#f00' };
  const view = topBarSyncView(st, false, () => [], syncKeyLabel);
  assert.equal(view.stBusy, true);
});

test('topBarSyncView: a truthy "syncing" prop overrides the label to the in-progress text unless offline', () => {
  const st = { offline: false, pending: 0, failedCount: 0, errors: {}, label: 'متصل ومحدّث', color: '#0f0' };
  const view = topBarSyncView(st, true, () => [], syncKeyLabel);
  assert.equal(view.stBusy, true);
  assert.equal(view.stLabel, 'جاري المزامنة...');
});

test('topBarSyncView: "syncing" does not override the label while offline', () => {
  const st = { offline: true, pending: 0, failedCount: 0, errors: {}, label: 'بدون اتصال', color: '#f00' };
  const view = topBarSyncView(st, true, () => [], syncKeyLabel);
  assert.equal(view.stLabel, 'بدون اتصال');
});

test('topBarSyncView: pending > 0 uses st.pendingKeys when given, maps to Arabic labels, and builds the pending title', () => {
  const st = { offline: false, pending: 2, pendingKeys: ['iapp_visits', 'iapp_appointments'], failedCount: 0, errors: {}, label: 'في انتظار المزامنة', color: '#fc0' };
  const view = topBarSyncView(st, false, () => { throw new Error('dirtyKeys() should not be called when pendingKeys is given'); }, syncKeyLabel);
  assert.deepEqual(view.pendingLabels, ['الزيارات', 'المواعيد']);
  assert.equal(view.title, 'المزامنة المعلقة (2 مفاتيح بيانات): الزيارات، المواعيد');
});

test('topBarSyncView: pending > 0 without st.pendingKeys falls back to calling dirtyKeys()', () => {
  const st = { offline: false, pending: 1, failedCount: 0, errors: {}, label: 'في انتظار المزامنة', color: '#fc0' };
  const view = topBarSyncView(st, false, () => ['iapp_visits'], syncKeyLabel);
  assert.deepEqual(view.pendingLabels, ['الزيارات']);
});

test('topBarSyncView: no pending but failed keys builds the error title from the error map', () => {
  const st = { offline: false, pending: 0, failedCount: 1, errors: { iapp_appointments: 'fail' }, label: 'حدث خطأ', color: '#f00' };
  const view = topBarSyncView(st, false, () => [], syncKeyLabel);
  assert.equal(view.title, 'أخطاء المزامنة: المواعيد');
});

test('sessionDisplayText: a doctor session with a matching primary profile shows the doctor\'s own name', () => {
  const text = sessionDisplayText({ role: 'doctor', name: 'د. فلان' }, { name: 'د. أحمد سالم' });
  assert.equal(text, 'د. أحمد سالم · طبيب');
});

test('sessionDisplayText: a doctor session without a primary profile falls back to the session name', () => {
  const text = sessionDisplayText({ role: 'doctor', name: 'د. فلان' }, null);
  assert.equal(text, 'د. فلان · طبيب');
});

test('sessionDisplayText: admin/secretary roles get their Arabic labels', () => {
  assert.equal(sessionDisplayText({ role: 'admin', name: 'عبده' }, null), 'عبده · مدير');
  assert.equal(sessionDisplayText({ role: 'secretary', name: 'سارة' }, null), 'سارة · سكرتارية');
});

test('sessionDisplayText: any other role falls back to "موظف" (employee)', () => {
  assert.equal(sessionDisplayText({ role: 'employee', name: 'محمد' }, null), 'محمد · موظف');
  assert.equal(sessionDisplayText({ role: 'something-else', name: 'X' }, null), 'X · موظف');
});
