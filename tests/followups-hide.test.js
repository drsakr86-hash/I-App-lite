import test from 'node:test';
import assert from 'node:assert/strict';
import { hideRecord } from '../src/modules/followups/hide.js';

test('hideRecord: dismissed has no expiry; snoozed expires 7 days after today', () => {
  const now = new Date(2026, 9, 4, 12, 0, 0);
  const v = { patientId: 7, nextVisit: '2026-09-30' };
  const d = hideRecord('dismissed', v, now);
  assert.equal(d.key, '7|2026-09-30');
  assert.equal(d.until, undefined);
  const s = hideRecord('snoozed', v, now);
  assert.equal(s.until, '2026-10-11');
});
