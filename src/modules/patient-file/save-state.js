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

export const SAVE_KINDS = Object.freeze(['saving', 'retrying', 'saved', 'local-only', 'partial', 'failed', 'invalid']);

const coreText = e => (e && e !== 'offline' ? ` (${String(e).slice(0, 120)})` : '');

export function interpretSaveResult(what, r) {
  if (r == null || typeof r !== 'object') {
    // Unknown outcome is never reported as success.
    return r === true
      ? { kind: 'saved', message: `تم حفظ ${what}` }
      : { kind: 'local-only', message: `حُفظ ${what} على هذا الجهاز ولم يتأكد وصوله للخادم بعد` };
  }
  const legacySynced = r.legacyResult !== false;
  const coreError = r.coreError || null;
  const coreOk = !coreError && r.status !== 'failed';
  if (r.status === 'partial') {
    return { kind: 'partial', message: `حُفظ ${what}، لكن تعذرت مزامنة بعض بياناته مع السجل المركزي${coreText(coreError)}` };
  }
  if (legacySynced && coreOk) return { kind: 'saved', message: `تم حفظ ${what}` };
  if (!legacySynced && coreOk) {
    return { kind: 'partial', message: `حُفظ ${what} في السجل المركزي، ونسخة هذا الجهاز ما زالت في انتظار المزامنة` };
  }
  if (legacySynced && !coreOk) {
    return coreError === 'offline'
      ? { kind: 'local-only', message: `حُفظ ${what} على هذا الجهاز وسيُزامن عند عودة الاتصال` }
      : { kind: 'partial', message: `حُفظ ${what} في السجل الرئيسي، ولم تتم مزامنته مع السجل المركزي${coreText(coreError)}` };
  }
  return {
    kind: 'local-only',
    message: coreError === 'offline'
      ? `حُفظ ${what} على هذا الجهاز وسيُزامن عند عودة الاتصال`
      : `حُفظ ${what} محلياً فقط، ولم يصل للخادم بعد${coreText(coreError)}`
  };
}

// Result of a plain "write then report" action (patient edit, delete, ...): `ok === false`
// means the write stayed on this device.
export function interpretWriteOk(what, ok) {
  return ok === false
    ? { kind: 'local-only', message: `حُفظ ${what} على هذا الجهاز وسيُزامن عند توفر الاتصال` }
    : { kind: 'saved', message: `تم حفظ ${what}` };
}

export const CONNECTION_STATES = Object.freeze({
  online: { id: 'online', icon: '🟢', label: 'متصل', tone: 'success' },
  saving: { id: 'saving', icon: '🔵', label: 'جاري الحفظ', tone: 'info' },
  pending: { id: 'pending', icon: '🟡', label: 'محفوظ محليًا — في انتظار المزامنة', tone: 'warning' },
  partial: { id: 'partial', icon: '🟠', label: 'تم الحفظ جزئيًا', tone: 'warning' },
  failed: { id: 'failed', icon: '🔴', label: 'فشل الحفظ', tone: 'danger' },
  offline: { id: 'offline', icon: '⚪', label: 'غير متصل — لا توجد تغييرات معلّقة', tone: 'neutral' }
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
  else if (s.authError && !offline) { id = 'failed'; detail = 'الجلسة منتهية — سجّل الدخول من جديد لمزامنة التغييرات'; }
  else if (saveStatus && (saveStatus.kind === 'saving' || saveStatus.kind === 'retrying')) id = 'saving';
  else if (s.syncing && pending > 0) { id = 'saving'; detail = `${pending} عناصر قيد المزامنة`; }
  else if (saveStatus && saveStatus.kind === 'partial') { id = 'partial'; detail = saveStatus.message || ''; }
  else if (pending > 0 || (saveStatus && saveStatus.kind === 'local-only')) {
    id = 'pending';
    detail = pending > 0 ? `${pending} عناصر بانتظار المزامنة` : (saveStatus.message || '');
    if (errKeys.length && !offline) detail += ' — آخر محاولة فشلت وستُعاد تلقائيًا';
  } else if (offline) id = 'offline';
  return { ...CONNECTION_STATES[id], detail, pending, offline };
}
