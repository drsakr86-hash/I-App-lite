// Pure logic for src/components/TopBar.jsx (no JSX, so this can be
// unit-tested directly with node --test — mirrors the atoms.jsx/
// atoms-model.js and common.jsx/common-model.js splits already used
// elsewhere). Mirrors the legacy runtime's TopBar exactly
// (public/legacy/app-runtime.js).

import { t, getLang } from '../modules/i18n/index.js';
import { tv } from '../modules/i18n/tv.js';

// The sync engine produces Arabic status labels; show them in the current language.
// Static labels go through tv(); the few with counts are matched and re-built from the dictionary.
export function syncLabelText(label) {
  if (typeof label !== 'string' || getLang() === 'ar') return label;
  let m = label.match(/^بدون اتصال · (\d+) عناصر معلّقة$/);
  if (m) return t('g3.topbar.offlinePending', { n: m[1] });
  m = label.match(/^في انتظار المزامنة · (\d+) عناصر بيانات(.*)$/);
  if (m) return t('g3.topbar.waitPending', { n: m[1] }) + m[2];
  m = label.match(/^⚠️ الجلسة منتهية — سجّل الخروج ثم الدخول لمزامنة (\d+) عناصر$/);
  if (m) return t('g3.topbar.sessionExpiredPending', { n: m[1] });
  if (label === '⚠️ الجلسة منتهية — سجّل الدخول من جديد') return t('g3.topbar.sessionExpired');
  return tv(label);
}

// Computes the sync-status badge's busy flag, label, and tooltip title from
// useSyncStatus()'s snapshot (st) plus the screen's own "syncing" flag --
// exactly the original inline computation. The badge's color is left to the
// caller (it's a theme color -- C.gold or st.color -- not pure data).
export function topBarSyncView(st, syncing, dirtyKeys, syncKeyLabel) {
  const stBusy = st.offline || st.pending > 0 || syncing;
  const stLabel = syncing && !st.offline ? t('g3.topbar.syncing') : syncLabelText(st.label);
  const pendingKeys = st.pending > 0 ? (st.pendingKeys || dirtyKeys()) : [];
  const pendingLabels = pendingKeys.map(k => tv(syncKeyLabel(k)));
  const title = st.pending > 0
    ? t('g3.topbar.pendingTitle', { count: st.pending, labels: pendingLabels.join(t('g3.topbar.listSep')) })
    : st.failedCount > 0
      ? t('g3.topbar.errorsTitle', { labels: Object.keys(st.errors).map(k => tv(syncKeyLabel(k))).join(t('g3.topbar.listSep')) })
      : stLabel;
  return { stBusy, stLabel, pendingLabels, title };
}

// The text shown next to the sync dot when not busy: the doctor's display
// name (primary.name) when the session is a doctor with a matching primary
// profile, otherwise the session's own name, followed by its Arabic role
// label -- exact copy of the original ternary chain, including its
// "موظف" fallback for any role that isn't admin/doctor/secretary.
export function sessionDisplayText(session, primary) {
  const name = session.role === 'doctor' && primary?.name ? primary.name : session.name;
  const roleLabel = session.role === 'admin' ? t('g3.role.admin')
    : session.role === 'doctor' ? t('g3.role.doctor')
    : session.role === 'secretary' ? t('g3.role.secretary')
    : t('g3.role.employee');
  return `${name} · ${roleLabel}`;
}
