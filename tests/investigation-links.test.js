// Imaging chain: request -> order -> study -> image -> report, with gaps instead of guesses.
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildInvestigationLinks, statusGroup } from '../src/modules/patient-file/investigation-links.js';

const today = '2026-10-04';
const req = (o = {}) => ({ id: 'd1', imagingOrderId: 'ORD-d1', requestedTests: [{ name: 'OCT', eye: 'OD' }], status: 'requested', notes: 'DME', doctor: 'د. أ', date: '2026-08-01', ...o });

test('links: statuses group correctly', () => {
  assert.equal(statusGroup('completed'), 'done');
  assert.equal(statusGroup('reported'), 'done');
  assert.equal(statusGroup('cancelled'), 'cancelled');
  assert.equal(statusGroup(''), 'pending');
  assert.equal(statusGroup('requested'), 'pending');
});

test('links: image is linked through the legacy order id', () => {
  const { chains, orphanImages } = buildInvestigationLinks({ requests: [req()], images: [{ id: 'a', orderId: 'ORD-d1', date: '2026-08-03', report: 'سليم' }], imagingOrders: [{ id: 'ORD-d1', sourceExamId: 'd1' }], today });
  assert.equal(chains[0].images.length, 1);
  assert.deepEqual(chains[0].images[0]._linkBasis, ['legacy-order']);
  assert.equal(chains[0].report.text, 'سليم');
  assert.equal(chains[0].statusGroup, 'done');
  assert.equal(chains[0].performedDate, '2026-08-03');
  assert.equal(orphanImages.length, 0);
});

test('links: Core study is linked through the investigation order id (study.order_id)', () => {
  const { chains } = buildInvestigationLinks({ requests: [req({ coreInvestigationOrderId: 'c9' })], images: [{ id: 'b', coreOrderId: 'c9', date: '2026-08-03' }], today });
  assert.deepEqual(chains[0].images[0]._linkBasis, ['core-investigation-order']);
});

test('links: same date / same name never links an image (no guessing) -> orphan', () => {
  const { chains, orphanImages } = buildInvestigationLinks({ requests: [req()], images: [{ id: 'c', date: '2026-08-01', type: 'OCT', patient: 'x' }], today });
  assert.equal(chains[0].images.length, 0);
  assert.equal(orphanImages.length, 1);
});

test('links: gaps are reported instead of invented', () => {
  const { chains } = buildInvestigationLinks({ requests: [req({ notes: '', doctor: '', status: 'completed' })], images: [], today });
  for (const g of ['no-reason', 'no-orderer', 'no-visit', 'no-images', 'no-report']) assert.ok(chains[0].gaps.includes(g), g);
});

test('links: visit is resolved by stable id only', () => {
  const visits = [{ id: 'v1', _coreId: 'cv1', date: '2026-08-01', type: 'كشف' }];
  const a = buildInvestigationLinks({ requests: [req({ coreVisitId: 'cv1' })], visits, today }).chains[0];
  assert.equal(a.visit.date, '2026-08-01');
  const b = buildInvestigationLinks({ requests: [req({ coreVisitId: 'zzz' })], visits, today }).chains[0];
  assert.equal(b.visit, null);
  assert.ok(b.gaps.includes('visit-not-in-file'));
});

test('links: duplicate request ids produce one chain (legacy + Core copies)', () => {
  const { chains } = buildInvestigationLinks({ requests: [req(), req()], today });
  assert.equal(chains.length, 1);
});

test('links: pending days counted; core sync error surfaced', () => {
  const c = buildInvestigationLinks({ requests: [req({ coreSyncError: 'x' })], today }).chains[0];
  assert.equal(c.pendingDays, 64);
  assert.ok(c.gaps.includes('core-sync-pending'));
});

test('links: empty / malformed input is safe', () => {
  const r = buildInvestigationLinks({ requests: [null, 5], images: null, imagingOrders: 'x', visits: undefined });
  assert.deepEqual(r.chains, []);
});
