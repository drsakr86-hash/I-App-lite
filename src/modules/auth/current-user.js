// "Who is signed in right now", for the audit/trash/backup subsystem's
// actor attribution (Phase 8, final batch). Exact copy of the legacy
// runtime's CURRENT_USER/actorName (public/legacy/app-runtime.js) -- a
// single module-level mutable value set from UnifiedRouter's session
// lifecycle (restore, login, profile refresh, logout) and read by
// src/modules/sync/audit-trash-backup.js's setActor() callback.
//
// Verified by exhaustive grep of the legacy file (not "mutated from many
// places" as an old comment there once warned): the only writers are the
// module-level setup below and UnifiedRouter's 4 call sites, all of which
// now call setCurrentUser() instead.
import { setActor } from '../sync/audit-trash-backup.js';

let CURRENT_USER = null;

export function setCurrentUser(user) {
  CURRENT_USER = user;
}

export function getCurrentUser() {
  return CURRENT_USER;
}

export function actorName() {
  return CURRENT_USER ? CURRENT_USER.name || CURRENT_USER.username || '—' : '—';
}

setActor(() => ({ name: actorName(), role: CURRENT_USER ? CURRENT_USER.role : '' }));
