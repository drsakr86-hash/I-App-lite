export const ROLES = Object.freeze({ ADMIN:'admin', DOCTOR:'doctor', SECRETARY:'secretary', EMPLOYEE:'employee' });
export const hasRole = (role, allowed=[]) => allowed.includes(role);
