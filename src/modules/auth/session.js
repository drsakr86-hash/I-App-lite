// Pure session/role logic shared with the legacy runtime's UnifiedRouter.
//
// This module intentionally does NOT touch localStorage/sessionStorage,
// Supabase, or any other side effect: it only answers "is this session
// valid?", "what shape should the stored record have?" and "did the
// profile drift?" — the legacy runtime still owns every read/write and
// every network call. Extracting these decisions here makes them
// unit-testable and is the first step toward a real, independent auth
// flow later, without changing today's login/session behavior at all.

// Roles allowed to use the staff-facing app (doctor/admin dashboard or the
// secretary/employee front desk view). Anything else is not a valid signed-in
// staff session and forces a logout.
export const STAFF_ROLES = ['admin', 'doctor', 'secretary', 'employee'];

// "Remember me" keeps a session for 30 days; an unchecked login only lasts
// for the current browser session's working day (12h).
export const SESSION_TTL_REMEMBER = 30 * 24 * 3600 * 1000;
export const SESSION_TTL_TEMP = 12 * 3600 * 1000;

// The subset of a user record that is safe to keep in a session object
// (never the password hash or other internal fields).
export function publicUser(u) {
  return u
    ? {
        id: u.id,
        username: u.username,
        email: u.email || '',
        name: u.name,
        role: u.role,
        mustChange: !!u.mustChange
      }
    : null;
}

// The compact record persisted under the legacy "iapp_session" key — just
// enough for parts of the UI (the top bar) that only need a quick profile
// glance without the full unified-session shape.
export function buildCompactSession(u) {
  return { id: u.id, username: u.username, name: u.name, role: u.role };
}

export function isStaffRole(role) {
  return STAFF_ROLES.includes(role);
}

// A "staff" session whose role is no longer one of STAFF_ROLES (e.g. the
// user's account was disabled or repurposed) is invalid and must log out.
export function isInvalidStaffSession(session) {
  return !!session && session.kind === 'staff' && !isStaffRole(session.role);
}

export function isSessionExpired(session, now = Date.now()) {
  return !session || !session.exp || now > session.exp;
}

export function sessionExpiry(remember, now = Date.now()) {
  return now + (remember ? SESSION_TTL_REMEMBER : SESSION_TTL_TEMP);
}

// The merged session loadValidSession() computes when re-validating a
// stored staff session against the current user record from getUsers().
export function mergeFreshStaffSession(storedSession, currentUser) {
  return { ...storedSession, ...publicUser(currentUser), kind: 'staff' };
}

// True when the freshly-merged profile differs from what's stored, meaning
// storage needs to be rewritten with the up-to-date fields (role change,
// rename, a newly-required password change, etc.).
export function staffSessionDrifted(fresh, stored) {
  return (
    fresh.role !== stored.role ||
    fresh.name !== stored.name ||
    fresh.username !== stored.username ||
    fresh.mustChange !== stored.mustChange
  );
}

export function buildStaffSessionRecord(user, exp) {
  return { kind: 'staff', ...publicUser(user), exp };
}

export function buildPatientSessionRecord(patient, exp) {
  return { kind: 'patient', patient, exp };
}
