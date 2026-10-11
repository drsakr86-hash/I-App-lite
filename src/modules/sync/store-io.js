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

// Compare-and-swap (audit F-18). docs/sql/store-cas.sql adds iapp_store.rev (bumped by a trigger on every update) and the RPC
// iapp_store_cas(key, value, rev). A flush reads with a `token` and writes with the same token: the server only accepts the write if
// the row still has the revision that was read, otherwise the flusher reads and merges again. Until that SQL is applied (column or
// function missing) everything below falls back to the old unconditional upsert, so the client can be deployed before or after it.
let casAvailable = null; // null = not known yet, true/false afterwards
const isMissingCas = e => !!e && (e.code === 'PGRST202' || e.code === '42703' || e.code === 'PGRST204' || /rev|iapp_store_cas|schema cache/i.test(String(e.message || '')));

export async function sbGetStore(key, token) {
  try {
    const sb = getSB();
    if (!sb) return undefined;
    const wantRev = !!token && casAvailable !== false;
    let { data, error } = await tq(sb.from('iapp_store').select(wantRev ? 'value,rev' : 'value').eq('key', key), b => b.maybeSingle(), 10000);
    if (error && wantRev && isMissingCas(error)) {
      casAvailable = false;
      ({ data, error } = await tq(sb.from('iapp_store').select('value').eq('key', key), b => b.maybeSingle(), 10000));
    }
    if (error) {
      console.warn('sbGet error:', error.message);
      return undefined;
    }
    if (token && casAvailable !== false) { token.rev = data && data.rev != null ? Number(data.rev) : null; token.cas = true; }
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

export async function sbSetStore(key, value, token) {
  try {
    const sb = getSB();
    if (!sb) return false;
    if (token && token.cas && casAvailable !== false) {
      const { data, error } = await tq(sb.rpc('iapp_store_cas', { p_key: key, p_value: value, p_rev: token.rev }), null, 15000);
      if (!error && data && data.ok) { casAvailable = true; return true; }
      if (!error && data && data.conflict) return 'conflict';
      if (error && isMissingCas(error)) casAvailable = false; // fall through to the plain upsert
      else {
        console.warn('sbSet cas error:', error && error.message);
        return false;
      }
    }
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
