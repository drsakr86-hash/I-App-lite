import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { isBookingRateLimitError, isDuplicateBookingError } from '../src/modules/patient-app/model.js';

test('the flood-guard error is recognised and is not mistaken for a duplicate slot', () => {
  const e = { message: 'booking_rate_limit: too many requests for this phone' };
  assert.equal(isBookingRateLimitError(e), true);
  assert.equal(isDuplicateBookingError(e), false);
  assert.equal(isBookingRateLimitError({ message: 'duplicate key value violates unique constraint' }), false);
  assert.equal(isBookingRateLimitError(null), false);
});

test('PatientApp shows the dedicated message and the SQL raises the same marker', () => {
  const app = fs.readFileSync(new URL('../src/screens/PatientApp.jsx', import.meta.url), 'utf8');
  assert.match(app, /isBookingRateLimitError\(error\)[\s\S]{0,80}g6\.pa\.rateMsg/);
  const sql = fs.readFileSync(new URL('../docs/sql/booking-rate-limit.sql', import.meta.url), 'utf8');
  assert.match(sql, /raise exception 'booking_rate_limit/);
});
