// Honest save/connection state for the patient file (pure: no React, DOM or Supabase).
//
// Two questions the clinician must always be able to answer:
//   1. "Did THIS save reach the server?"   -> interpretSaveResult()
//   2. "What is the app doing right now?"  -> connectionState()
//
// A save has up to two destinations: the main store (`iapp_store`/row tables, reported by
// the data layer as `legacyResult`, where `false` means "kept on this device, flush
// pending") and the Core tables (`coreError` / `status`). "تم الحفظ" is shown ONLY when
// every destination that was attempted succeeded.

import { t } from '../i18n/index.js';

export const SAVE_KINDS = Object.freeze(['saving', 'retrying', 'saved', 'local-only', 'partial', 'failed', 'invalid']);

const coreText = e => (e && e !== 'offline' ? ` (${String(e).slice(0, 120)})` : '');

export function interpretSaveResult(what, r) {
  if (r == null || typeof r !== 'object') {
    // Unknown outcome is never reported as success.
    return r === true
      ? { kind: 'saved', message: t('g1.save.saved', { what }) }
      : { kind: 'local-only', message: t('g1.save.unconfirmed', { what }) };
  }
  const legacySynced = r.legacyResult !== false;
  const coreError = r.coreError || null;
  const coreOk = !coreError && r.status !== 'failed';
  if (r.status === 'partial') {
    return { kind: 'partial', message: t('g1.save.corePartial', { what }) + coreText(coreError) };
  }
  if (legacySynced && coreOk) return { kind: 'saved', message: t('g1.save.saved', { what }) };
  if (!legacySynced && coreOk) {
    return { kind: 'partial', message: t('g1.save.coreOnly', { what }) };
  }
  if (legacySynced && !coreOk) {
    return coreError === 'offline'
      ? { kind: 'local-only', message: t('g1.save.localReconnect', { what }) }
      : { kind: 'partial', message: t('g1.save.mainOnly', { what }) + coreText(coreError) };
  }
  return {
    kind: 'local-only',
    message: coreError === 'offline'
      ? t('g1.save.localReconnect', { what })
      : t('g1.save.localOnly', { what }) + coreText(coreError)
  };
}

// Result of a plain "write then report" action (patient edit, delete, ...): `ok === false`
// means the write stayed on this device.
export function interpretWriteOk(what, ok) {
  return ok === false
    ? { kind: 'local-only', message: t('g1.save.localAvailable', { what }) }
    : { kind: 'saved', message: t('g1.save.saved', { what }) };
}

export const CONNECTION_STATES = Object.freeze({
  online: { id: 'online', icon: '🟢', get label() { return t('g1.conn.online'); }, tone: 'success' },
  saving: { id: 'saving', icon: '🔵', get label() { return t('g1.conn.saving'); }, tone: 'info' },
  pending: { id: 'pending', icon: '🟡', get label() { return t('g1.conn.pending'); }, tone: 'warning' },
  partial: { id: 'partial', icon: '🟠', get label() { return t('g1.conn.partial'); }, tone: 'warning' },
  failed: { id: 'failed', icon: '🔴', get label() { return t('g1.conn.failed'); }, tone: 'danger' },
  offline: { id: 'offline', icon: '⚪', get label() { return t('g1.conn.offline'); }, tone: 'neutral' }
});

// Highest-severity wins: failed > saving > partial > pending > offline > online.
export function connectionState({ saveStatus = null, sync = null } = {}) {
  const s = sync || {};
  const pending = s.pending || 0;
  const offline = s.online === false || s.reachable === false;
  const errKeys = Object.keys(s.errors || {});
  let id = 'online';
  let detail = '';
  if (saveStatus && saveStatus.kind === 'failed') { id = 'failed'; detail = saveStatus.message || ''; }
  else if (s.authError && !offline) { id = 'failed'; detail = t('g1.conn.authExpired'); }
  else if (saveStatus && (saveStatus.kind === 'saving' || saveStatus.kind === 'retrying')) id = 'saving';
  else if (s.syncing && pending > 0) { id = 'saving'; detail = t('g1.conn.syncingN', { n: pending }); }
  else if (saveStatus && saveStatus.kind === 'partial') { id = 'partial'; detail = saveStatus.message || ''; }
  else if (pending > 0 || (saveStatus && saveStatus.kind === 'local-only')) {
    id = 'pending';
    detail = pending > 0 ? t('g1.conn.waitingN', { n: pending }) : (saveStatus.message || '');
    if (errKeys.length && !offline) detail += ' — ' + t('g1.conn.retryAuto');
  } else if (offline) id = 'offline';
  return { ...CONNECTION_STATES[id], detail, pending, offline };
}
