// Pure data/logic for src/components/BottomNav.jsx -- exact copy of the
// legacy runtime's NAV array and its role-based filter (no JSX, so this can
// be unit-tested directly with node --test).
export const NAV = [
  { id: 'dashboard', labelKey: 'g3.nav.dashboard', label: 'الرئيسية', icon: '⊞' },
  { id: 'patients', labelKey: 'g3.nav.patients', label: 'المرضى', icon: '👥' },
  { id: 'waiting', labelKey: 'g3.nav.waiting', label: 'الانتظار', icon: '⏳' },
  { id: 'appointments', labelKey: 'g3.nav.appointments', label: 'المواعيد', icon: '📋' },
  { id: 'radiology', labelKey: 'g3.nav.radiology', label: 'Investigation Orders', icon: 'xray' },
  { id: 'imaging', labelKey: 'g3.nav.imaging', label: 'مركز الصور', icon: '🖼️' },
  { id: 'accounting', labelKey: 'g3.nav.accounting', label: 'المحاسبة', icon: '💰', adminOnly: true }
];

// Which NAV items a given role sees -- admin-only items are hidden from
// anyone else.
export function navItemsForRole(role) {
  return NAV.filter(item => !item.adminOnly || role === 'admin');
}
