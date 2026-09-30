// Generic key/value Supabase I/O against the `iapp_store` table — moved here
// from public/legacy/app-runtime.js (Phase 8, batch 9). This is the lowest
// layer of actual Supabase reads/writes: one row per key in `iapp_store`,
// used for every synced key that is NOT the appointments table or one of the
// per-table "Core" tables (visits, exams, prescriptions, imaging...). Those
// still dispatch through _sbGetRaw/_sbSetRaw in app-runtime.js, which is why
// this module does not export anything named _sbGetRaw/_sbSetRaw itself —
// see wiring.js and the roadmap for why the dispatcher stays in legacy for
// now.
//
// Exact copy of the legacy originals, with `window.*` reads changed to
// `globalThis.*` — same approach as every other Phase 8 module.

import { getSB } from '../data-access/index.js';
import { SyncStore, tq } from './engine.js';

export async function sbGetStore(key) {
  try {
    const sb = getSB();
    if (!sb) return undefined;
    const { data, error } = await tq(sb.from('iapp_store').select('value').eq('key', key), b => b.maybeSingle(), 10000);
    if (error) {
      console.warn('sbGet error:', error.message);
      return undefined;
    }
    if (!data) return null;
    const val = data.value;
    if (val === null || val === undefined) return null;
    if (typeof val === 'string' || typeof val === 'number' || typeof val === 'boolean') return val;
    if (Array.isArray(val) || typeof val === 'object') {
      try {
        return JSON.parse(JSON.stringify(val));
      } catch {
        return val;
      }
    }
    return val;
  } catch (e) {
    console.warn('sbGet exception:', e.message || e);
    SyncStore.set({ reachable: false });
    return undefined;
  }
}

export async function sbSetStore(key, value) {
  try {
    const sb = getSB();
    if (!sb) return false;
    const { error } = await tq(sb.from('iapp_store').upsert({ key, value }, { onConflict: 'key' }), null, 15000);
    if (error) {
      console.warn('sbSet error:', error.message);
      return false;
    }
    return true;
  } catch (e) {
    console.warn('sbSet exception:', e);
    SyncStore.set({ reachable: false });
    return false;
  }
}
