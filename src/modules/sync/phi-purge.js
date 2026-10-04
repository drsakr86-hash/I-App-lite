// Removes cached patient data from the browser when a staff member signs out.
//
// Why: the offline-first design mirrors patients, visits, examinations,
// prescriptions, appointments and image metadata into localStorage. On a
// shared or lost device that data would stay readable after logout.
//
// Safety rules (this is NOT a blanket localStorage.clear()):
//   * a key that still has unsynced local changes (`iapp_dirty_<key>`) is kept
//     together with its base snapshot, so nothing the clinician typed offline
//     is lost -- it will flush after the next login;
//   * only `iapp_*` keys are touched, and a small keep-list of non-patient
//     data (theme, login lockout counters, staff list used for role lookup,
//     drug/Rx templates, UI preferences) survives.
// After a purge the next login re-downloads everything from the server.

// `iapp_exam_coresync` is kept on purpose: it is the device-side guard that stops a
// re-saved examination from creating a second Core diagnosis/treatment/follow-up row.
// It holds diagnosis/treatment text keyed by exam id (no names or phone numbers) --
// documented as a known residual in docs/SECURITY-RELEASE-CHECKLIST.md.
export const PHI_KEEP_KEYS = new Set([
  'iapp_theme', 'iapp_users', 'iapp_login_guard', 'iapp_custom_drugs', 'iapp_rx_templates',
  'iapp_alerts_day', 'queue_clinic', 'iapp_exam_coresync'
]);
const DIRTY = 'iapp_dirty_';
const BASE = 'iapp_base_';

function listKeys(storage) {
  const keys = [];
  for (let i = 0; i < storage.length; i++) {
    const k = storage.key(i);
    if (k) keys.push(k);
  }
  return keys;
}

export function purgeCachedPhi(storage = globalThis.localStorage) {
  const result = { removed: 0, keptDirty: 0, errors: 0 };
  if (!storage) return result;
  let keys;
  try { keys = listKeys(storage); } catch { result.errors++; return result; }
  const dirty = new Set(keys.filter(k => k.startsWith(DIRTY)).map(k => k.slice(DIRTY.length)));
  for (const k of keys) {
    if (!k.startsWith('iapp_')) continue;
    if (k === 'iapp_sb_auth') continue; // the auth token is removed by sbSignOut itself
    if (PHI_KEEP_KEYS.has(k)) continue;
    const dataKey = k.startsWith(DIRTY) ? k.slice(DIRTY.length) : k.startsWith(BASE) ? k.slice(BASE.length) : k;
    if (dirty.has(dataKey)) { result.keptDirty++; continue; }
    try { storage.removeItem(k); result.removed++; } catch { result.errors++; }
  }
  return result;
}

// Medical images delivered by Cloudinary are cached by the service worker for offline
// viewing. Ask it to drop that cache on sign-out (no-op where no worker controls the page).
export function requestImageCacheClear(nav = globalThis.navigator) {
  try {
    const ctl = nav && nav.serviceWorker && nav.serviceWorker.controller;
    if (!ctl) return false;
    ctl.postMessage({ type: 'iapp-clear-image-cache' });
    return true;
  } catch {
    return false;
  }
}
