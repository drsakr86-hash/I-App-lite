// Collision-safe ids for finance rows. New business rows get a random UUID
// (stable across offline devices); derived rows (ledger entries/lines, legacy
// migration rows) get DETERMINISTIC ids so that re-running or retrying a commit
// upserts the same row instead of creating a duplicate.

export function newFinId(prefix = '') {
  let u;
  const c = globalThis.crypto;
  if (c && typeof c.randomUUID === 'function') u = c.randomUUID();
  else {
    u = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, ch => {
      const r = (Math.random() * 16) | 0;
      return (ch === 'x' ? r : (r & 3) | 8).toString(16);
    });
  }
  return prefix ? prefix + '-' + u : u;
}

export const entryIdFor = sourceId => 'ent-' + sourceId;
export const lineIdFor = (entryId, n) => entryId + '-l' + n;
export const auditIdFor = (sourceId, action, stamp = Date.now()) => 'aud-' + action + '-' + sourceId + '-' + stamp;

// Human receipt number: date + 6 hex of the payment id (no shared counter needed offline).
export function receiptNoFor(paymentId, dateISO) {
  const tail = String(paymentId).replace(/[^0-9a-f]/gi, '').slice(-6).toUpperCase().padStart(6, '0');
  return 'R-' + String(dateISO || '').replace(/-/g, '') + '-' + tail;
}
