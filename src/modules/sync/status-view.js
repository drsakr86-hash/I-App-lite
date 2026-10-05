import { t } from '../i18n/index.js';
import { tv } from '../i18n/tv.js';
// Pure derivation of the sync-status badge (label + color key + flags) from
// the SyncStore state. Extracted from the legacy useSyncStatus() hook with
// zero behavior change: same conditions, same order, same Arabic strings.
// Colors are returned as theme keys ("danger" | "gold" | "success"), not
// resolved colors, so this stays decoupled from the mutable theme object —
// the caller looks the key up in its own color table (e.g. C[colorKey]).
export function syncStatusView(s) {
  s = s || {};
  const offline = s.online === false || s.reachable === false;
  const errors = s.errors || {};
  const failedCount = Object.keys(errors).length;
  const pending = s.pending || 0;
  let label, colorKey;
  if (s.authError && !offline) {
    label = pending > 0 ? t("g4.sync.sessionExpiredPending", { n: pending }) : t("g4.sync.sessionExpired");
    colorKey = "danger";
  } else if (offline) {
    label = pending > 0 ? t("g4.sync.offlinePending", { n: pending }) : t("g4.sync.offline");
    colorKey = "danger";
  } else if (s.syncing) {
    label = t("g4.sync.syncing");
    colorKey = "gold";
  } else if (pending > 0) {
    const _errs = Object.values(errors);
    label = t("g4.sync.waiting", { n: pending }) + (_errs.length ? ` — ${tv(_errs[0])}` : "");
    colorKey = "gold";
  } else {
    label = t("g4.sync.upToDate");
    colorKey = "success";
  }
  return {
    offline,
    failedCount,
    label,
    colorKey,
    busy: offline || !!s.syncing || pending > 0
  };
}
