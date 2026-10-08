export const ROLES = Object.freeze({ ADMIN: 'admin', DOCTOR: 'doctor', SECRETARY: 'secretary', EMPLOYEE: 'employee' });
export const hasRole = (role, allowed = []) => allowed.includes(role);

// Permission matrix. '*' = every action in the resource.
// Finance resources are fine-grained on purpose (accounting redesign): only admin gets '*';
// the secretary has controlled collection access; the doctor gets no direct financial access
// (own-settlement viewing needs a doctor↔staff link — see docs/ACCOUNTING-AUDIT.md, D5).
export const PERMISSIONS = Object.freeze({
  admin: {
    patients: ['*'], visits: ['*'], examinations: ['*'], prescriptions: ['*'], investigations: ['*'], imaging: ['*'], settings: ['*'], users: ['*'],
    accounting: ['*'], payments: ['*'], expenses: ['*'], doctor_settlements: ['*'], financial_reports: ['*'], cash_accounts: ['*']
  },
  doctor: {
    patients: ['read', 'write'], visits: ['*'], examinations: ['*'], prescriptions: ['*'], investigations: ['*'], imaging: ['*']
  },
  secretary: {
    patients: ['read', 'write'], visits: ['read', 'write'], investigations: ['read'], imaging: ['read'],
    payments: ['read', 'create', 'write'], cash_accounts: ['read'] // 'write' = legacy alias of "collect" (the pre-redesign matrix); reverse/refund stay admin-only
  },
  employee: { patients: ['read'], visits: ['read'] }
});

export function can(role, resource, action) {
  const allowed = PERMISSIONS[role]?.[resource];
  return !!allowed && (allowed.includes('*') || allowed.includes(action));
}

// 'payments.create' style (the names used by the accounting spec).
export function canDo(role, permission) {
  const i = String(permission).indexOf('.');
  return i > 0 && can(role, permission.slice(0, i), permission.slice(i + 1));
}

// Every finance permission name, for tests and the settings screen.
export const FINANCE_PERMISSIONS = Object.freeze([
  'accounting.read', 'accounting.write',
  'payments.read', 'payments.create', 'payments.reverse',
  'expenses.read', 'expenses.create', 'expenses.edit', 'expenses.reverse',
  'doctor_settlements.read', 'doctor_settlements.create', 'doctor_settlements.pay',
  'financial_reports.read',
  'cash_accounts.read', 'cash_accounts.manage'
]);

// Secretary collection is "controlled": she may only see payments from her own current shift.
export const SECRETARY_PAYMENT_WINDOW_HOURS = 36;
