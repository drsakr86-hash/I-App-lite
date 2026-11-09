// Feature flags. Each flag has a default (fallback); atlas, private_storage, special_sheets and ddx are ON by default since 2026-11-10 (?ff=-name switches one off on a device).
// Precedence (highest first): URL query (?ff=atlas / ?ff=-atlas)  >  value stored on this device  >  build-time env  >  default (off).
// The query value is remembered on the device, so the doctor can open the app once with ?ff=atlas to try a feature and
// ?ff=-atlas to switch it off again. Pure resolution (resolveFlag) is separate from the browser lookups so it can be unit-tested.

export const FLAG_DEFS = Object.freeze({
  // Phase 1: interactive anatomy atlas (docs/ATLAS.md)
  atlas: Object.freeze({ env: 'VITE_FF_ATLAS', storageKey: 'iapp_ff_atlas', fallback: true }),
  // Phase 2: new uploads go to private storage with signed URLs (not wired yet; nothing reads this flag)
  private_storage: Object.freeze({ env: 'VITE_FF_PRIVATE_STORAGE', storageKey: 'iapp_ff_private_storage', fallback: true }),
  // Special-case examination sheets (neuro, uveitis, squint, glaucoma, DR) inside the exam form
  special_sheets: Object.freeze({ env: 'VITE_FF_SPECIAL_SHEETS', storageKey: 'iapp_ff_special_sheets', fallback: true }),
  // Rule-based differential diagnosis / work-up suggestions (decision support, doctor decides)
  ddx: Object.freeze({ env: 'VITE_FF_DDX', storageKey: 'iapp_ff_ddx', fallback: true })
});

const ON = new Set(['1', 'true', 'on', 'yes']);
const OFF = new Set(['0', 'false', 'off', 'no']);

// Names listed in ?ff=a,b,-c  ->  { a: true, b: true, c: false }
export function parseFlagQuery(search) {
  const out = {};
  let raw = '';
  try { raw = new URLSearchParams(String(search || '')).get('ff') || ''; } catch { raw = ''; }
  for (const part of raw.split(',')) {
    const p = part.trim();
    if (!p) continue;
    if (p.startsWith('-')) out[p.slice(1)] = false; else out[p] = true;
  }
  return out;
}

function asBool(v) {
  if (v === true || v === false) return v;
  const s = String(v == null ? '' : v).trim().toLowerCase();
  if (ON.has(s)) return true;
  if (OFF.has(s)) return false;
  return null;
}

export function resolveFlag(name, { env = null, stored = null, query = '' } = {}) {
  const def = FLAG_DEFS[name];
  if (!def) return false; // unknown flags are always off
  const q = parseFlagQuery(query);
  if (name in q) return q[name];
  const s = asBool(stored);
  if (s !== null) return s;
  const e = asBool(env);
  if (e !== null) return e;
  return def.fallback;
}

// Remember an explicit ?ff= choice on this device.
export function persistQueryFlags(query, storage) {
  const q = parseFlagQuery(query);
  for (const name of Object.keys(q)) {
    if (!FLAG_DEFS[name]) continue;
    try { storage.setItem(FLAG_DEFS[name].storageKey, q[name] ? '1' : '0'); } catch { /* storage unavailable: the query still applies for this page load */ }
  }
}

const envValue = name => {
  try {
    const env = import.meta.env; // undefined under plain node
    return env ? env[FLAG_DEFS[name].env] : null;
  } catch { return null; }
};

export function isEnabled(name) {
  const def = FLAG_DEFS[name];
  if (!def) return false;
  let search = '';
  let stored = null;
  try { search = (typeof location !== 'undefined' && location.search) || ''; } catch { search = ''; }
  try { if (typeof localStorage !== 'undefined') { persistQueryFlags(search, localStorage); stored = localStorage.getItem(def.storageKey); } } catch { stored = null; }
  return resolveFlag(name, { env: envValue(name), stored, query: search });
}

export const atlasEnabled = () => isEnabled('atlas');
