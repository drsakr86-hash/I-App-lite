// Pure logic for src/components/TopBar.jsx (no JSX, so this can be
// unit-tested directly with node --test — mirrors the atoms.jsx/
// atoms-model.js and common.jsx/common-model.js splits already used
// elsewhere). Mirrors the legacy runtime's TopBar exactly
// (public/legacy/app-runtime.js).

// Computes the sync-status badge's busy flag, label, and tooltip title from
// useSyncStatus()'s snapshot (st) plus the screen's own "syncing" flag --
// exactly the original inline computation. The badge's color is left to the
// caller (it's a theme color -- C.gold or st.color -- not pure data).
export function topBarSyncView(st, syncing, dirtyKeys, syncKeyLabel) {
  const stBusy = st.offline || st.pending > 0 || syncing;
  const stLabel = syncing && !st.offline ? 'جاري المزامنة...' : st.label;
  const pendingKeys = st.pending > 0 ? (st.pendingKeys || dirtyKeys()) : [];
  const pendingLabels = pendingKeys.map(syncKeyLabel);
  const title = st.pending > 0
    ? `المزامنة المعلقة (${st.pending} مفاتيح بيانات): ${pendingLabels.join('، ')}`
    : st.failedCount > 0
      ? `أخطاء المزامنة: ${Object.keys(st.errors).map(syncKeyLabel).join('، ')}`
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
  const roleLabel = session.role === 'admin' ? 'مدير'
    : session.role === 'doctor' ? 'طبيب'
    : session.role === 'secretary' ? 'سكرتارية'
    : 'موظف';
  return `${name} · ${roleLabel}`;
}
