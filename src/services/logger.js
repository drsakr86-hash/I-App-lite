// Structured, PHI-safe error logging.
//
// Every non-trivial failure goes through logError(operation, error, ids):
//   * `operation` is a short stable name ("sync.flushKey", "booking.accept"),
//   * `ids` may only carry safe identifiers (record ids, store keys, codes) --
//     anything that looks like free text (names, phones, notes) is dropped,
//   * the error message is truncated and stripped of long digit runs / emails
//     so a server message that echoes a phone number or email is not logged.
// A small ring buffer keeps the latest entries in memory for diagnostics
// (getRecentErrors) without persisting anything to storage.

const MAX_ENTRIES = 50;
const entries = [];
const SAFE_ID_KEY = /^(id|key|code|patientId|visitId|orderId|examId|rxId|studyId|op|step|status|table|count)$/i;

export function sanitizeMessage(msg) {
  return String(msg == null ? '' : msg)
    .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, '[email]')
    .replace(/\+?\d[\d\s-]{6,}\d/g, '[number]')
    .slice(0, 200);
}

export function safeIds(ids) {
  const out = {};
  if (!ids || typeof ids !== 'object') return out;
  for (const [k, v] of Object.entries(ids)) {
    if (!SAFE_ID_KEY.test(k)) continue;
    if (typeof v === 'number' || typeof v === 'boolean') out[k] = v;
    else if (typeof v === 'string' && v.length <= 64 && !/\s/.test(v)) out[k] = v;
  }
  return out;
}

export function logError(operation, error, ids) {
  const entry = {
    at: Date.now(),
    operation: String(operation || 'unknown'),
    message: sanitizeMessage(error && (error.message || error.hint || error.code) ? (error.message || error.hint || error.code) : error),
    ids: safeIds(ids)
  };
  entries.push(entry);
  if (entries.length > MAX_ENTRIES) entries.shift();
  try {
    console.warn('[iapp]', entry.operation, entry.message, entry.ids);
  } catch { /* console unavailable: the ring buffer still has the entry */ }
  return entry;
}

export const getRecentErrors = () => entries.slice();
export const clearRecentErrors = () => { entries.length = 0; };
