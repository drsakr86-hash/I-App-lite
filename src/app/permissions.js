export const ROLES = Object.freeze({ ADMIN: 'admin', DOCTOR: 'doctor', SECRETARY: 'secretary', EMPLOYEE: 'employee' });
export const hasRole = (role, allowed = []) => allowed.includes(role);

// Phase 61-65: permission matrix (architecture only; legacy UI checks still
// enforce access today). '*' = every action in the resource.
export const PERMISSIONS = Object.freeze({
  admin:     { patients: ['*'], visits: ['*'], examinations: ['*'], prescriptions: ['*'], investigations: ['*'], imaging: ['*'], payments: ['*'], settings: ['*'], users: ['*'] },
  doctor:    { patients: ['read', 'write'], visits: ['*'], examinations: ['*'], prescriptions: ['*'], investigations: ['*'], imaging: ['*'], payments: ['read'] },
  secretary: { patients: ['read', 'write'], visits: ['read', 'write'], payments: ['read', 'write'], investigations: ['read'], imaging: ['read'] },
  employee:  { patients: ['read'], visits: ['read'] }
});

export function can(role, resource, action) {
  const allowed = PERMISSIONS[role]?.[resource];
  return !!allowed && (allowed.includes('*') || allowed.includes(action));
}
