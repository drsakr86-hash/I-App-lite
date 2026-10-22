// Pure data/logic for src/components/BottomNav.jsx -- exact copy of the
// legacy runtime's NAV array and its role-based filter (no JSX, so this can
// be unit-tested directly with node --test).
export const NAV = [
  { id: 'dashboard', labelKey: 'g3.nav.dashboard', label: 'الرئيسية', icon: '⊞' },
  { id: 'patients', labelKey: 'g3.nav.patients', label: 'المرضى', icon: '👥' },
  { id: 'waiting', labelKey: 'g3.nav.waiting', label: 'الانتظار', icon: '⏳' },
  { id: 'appointments', labelKey: 'g3.nav.appointments', label: 'المواعيد', icon: '📋' },
  { id: 'radiology', labelKey: 'g3.nav.radiology', label: 'Investigation Orders', icon: 'xray', inMore: true },
  { id: 'imaging', labelKey: 'g3.nav.imaging', label: 'مركز الصور', icon: '🖼️', inMore: true },
  { id: 'whatsapp', labelKey: 'g9.wa.title', label: 'واتساب', icon: 'clinicchat', inMore: true, adminOnly: true },
  { id: 'accounting', labelKey: 'g3.nav.accounting', label: 'المحاسبة', icon: '💰', adminOnly: true }
];

// Which NAV items a given role sees -- admin-only items are hidden from
// anyone else.
export function navItemsForRole(role) {
  return NAV.filter(item => !item.adminOnly || role === 'admin');
}

// "More" menu: items flagged inMore are not shown in the bottom bar itself
// but inside the sheet opened by the "More" button. Settings is a tab too
// (opened from the sheet), so the More button also lights up while it is open.
export const MORE_ID = 'more';
export const MORE_EXTRA_TABS = ['settings'];

export function primaryNavItems(role) {
  return navItemsForRole(role).filter(item => !item.inMore);
}

export function moreNavItems(role) {
  return navItemsForRole(role).filter(item => item.inMore);
}

export function isMoreActive(active, role) {
  return MORE_EXTRA_TABS.includes(active) || moreNavItems(role).some(item => item.id === active);
}
