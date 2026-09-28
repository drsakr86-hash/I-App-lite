import test from 'node:test';
import assert from 'node:assert/strict';
import { syncStatusView } from '../src/modules/sync/index.js';

test('sync-status: connected and up to date (default state)', () => {
  const v = syncStatusView({ online: true, reachable: null, pending: 0, errors: {}, syncing: false });
  assert.equal(v.offline, false);
  assert.equal(v.failedCount, 0);
  assert.equal(v.busy, false);
  assert.equal(v.colorKey, 'success');
  assert.equal(v.label, 'متصل ومحدّث');
});

test('sync-status: offline with no pending items', () => {
  const v = syncStatusView({ online: false, pending: 0, errors: {} });
  assert.equal(v.offline, true);
  assert.equal(v.colorKey, 'danger');
  assert.equal(v.label, 'بدون اتصال');
  assert.equal(v.busy, true);
});

test('sync-status: offline (unreachable) with pending items shows the count', () => {
  const v = syncStatusView({ online: true, reachable: false, pending: 3, errors: {} });
  assert.equal(v.offline, true);
  assert.equal(v.colorKey, 'danger');
  assert.equal(v.label, 'بدون اتصال · 3 عناصر معلّقة');
});

test('sync-status: auth error while online, no pending', () => {
  const v = syncStatusView({ online: true, authError: true, pending: 0, errors: {} });
  assert.equal(v.colorKey, 'danger');
  assert.match(v.label, /الجلسة منتهية — سجّل الدخول من جديد$/);
});

test('sync-status: auth error while online, with pending items', () => {
  const v = syncStatusView({ online: true, authError: true, pending: 5, errors: {} });
  assert.equal(v.colorKey, 'danger');
  assert.match(v.label, /سجّل الخروج ثم الدخول لمزامنة 5 عناصر$/);
});

test('sync-status: auth error is ignored while offline (offline branch wins)', () => {
  const v = syncStatusView({ online: false, authError: true, pending: 0, errors: {} });
  assert.equal(v.colorKey, 'danger');
  assert.equal(v.label, 'بدون اتصال');
});

test('sync-status: actively syncing', () => {
  const v = syncStatusView({ online: true, syncing: true, pending: 2, errors: {} });
  assert.equal(v.colorKey, 'gold');
  assert.equal(v.label, 'جاري المزامنة...');
  assert.equal(v.busy, true);
});

test('sync-status: pending items with no errors', () => {
  const v = syncStatusView({ online: true, pending: 4, errors: {} });
  assert.equal(v.colorKey, 'gold');
  assert.equal(v.label, 'في انتظار المزامنة · 4 عناصر بيانات');
});

test('sync-status: pending items with an error appends the first error message', () => {
  const v = syncStatusView({ online: true, pending: 2, errors: { patients: 'تعذر الاتصال بالخادم' } });
  assert.equal(v.colorKey, 'gold');
  assert.equal(v.label, 'في انتظار المزامنة · 2 عناصر بيانات — تعذر الاتصال بالخادم');
});

test('sync-status: failedCount reflects the number of error keys', () => {
  const v = syncStatusView({ online: true, pending: 2, errors: { a: 'x', b: 'y' } });
  assert.equal(v.failedCount, 2);
});

test('sync-status: missing/undefined fields default safely', () => {
  const v = syncStatusView({});
  assert.equal(v.offline, false);
  assert.equal(v.busy, false);
  assert.equal(v.colorKey, 'success');
  assert.equal(v.failedCount, 0);
});

test('sync-status: syncStatusView(undefined) does not throw', () => {
  const v = syncStatusView(undefined);
  assert.equal(v.colorKey, 'success');
});
