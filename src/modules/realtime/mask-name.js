// Public-facing patient name (audit F-05, option M1): first word + initial of the second word, "مريض" when empty.
// MUST stay identical to displayName() in public/queue-display.html and to public.iapp_mask_name() in
// docs/sql/queue-public-mask-names.DRAFT.sql (parity is asserted by tests/mask-name.test.js and docs/audit/queue-sql-tests/test-mask.mjs).
// The broadcast channel `iapp_queue_calls` is readable by anyone holding the public key, so it must never carry the full name.
export function maskPatientName(name) {
  const w = String(name == null ? '' : name)
    .replace(/[<>]/g, '').replace(/[،,؛;]+/g, ' ').replace(/\s+/g, ' ').trim().split(' ').filter(Boolean);
  if (!w.length) return 'مريض';
  return w.length > 1 ? w[0] + ' ' + w[1].charAt(0) + '.' : w[0];
}
