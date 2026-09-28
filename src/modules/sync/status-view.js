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
    label = pending > 0 ? `⚠️ الجلسة منتهية — سجّل الخروج ثم الدخول لمزامنة ${pending} عناصر` : "⚠️ الجلسة منتهية — سجّل الدخول من جديد";
    colorKey = "danger";
  } else if (offline) {
    label = pending > 0 ? `بدون اتصال · ${pending} عناصر معلّقة` : "بدون اتصال";
    colorKey = "danger";
  } else if (s.syncing) {
    label = "جاري المزامنة...";
    colorKey = "gold";
  } else if (pending > 0) {
    const _errs = Object.values(errors);
    label = `في انتظار المزامنة · ${pending} عناصر بيانات` + (_errs.length ? ` — ${_errs[0]}` : "");
    colorKey = "gold";
  } else {
    label = "متصل ومحدّث";
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
