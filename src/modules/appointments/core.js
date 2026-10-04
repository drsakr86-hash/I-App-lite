// The appointments "Core" sync functions — moved here from
// public/legacy/app-runtime.js (Phase 8, batch 11). This is the first of the
// per-table dispatch targets that sbMutate's setTableMutate hook (see
// src/modules/sync/wiring.js) and _sbGetRaw/_sbSetRaw (still in legacy) route
// to for the `iapp_appointments` key, exactly as ROW_TABLES does for the
// generic row tables.
//
// Exact copy of the legacy originals, with `window.*` reads changed to
// `globalThis.*` — same approach as every other Phase 8 module. The mapping
// helpers (fromRow/toRow/diff) were already moved in an earlier phase and are
// reached the same way the legacy runtime reaches them: through
// globalThis.IAppModules.appointments.

import { getSB } from '../data-access/index.js';
import { LS, isDirty, offlineNow, tq } from '../sync/engine.js';
import { APT_KEY, APT_TABLE, APT_HISTORY_DAYS } from './appointment.mapper.js';

const _apt = () => globalThis.IAppModules.appointments;

// Local copy of the legacy runtime's localISO — a tiny pure date formatter
// used all over app-runtime.js and passed to migrated screens through their
// own bridge. It isn't moved itself (out of scope for this batch), just
// duplicated here since aptList needs it for its history-window cutoff.
function localISO(d) {
  d = d || new Date();
  const z = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return z.toISOString().slice(0, 10);
}

export async function aptList() {
  try {
    const sb = getSB();
    if (!sb) return undefined;
    const from = new Date();
    from.setDate(from.getDate() - APT_HISTORY_DAYS);
    if (offlineNow()) return undefined;
    const { data, error } = await tq(sb.from(APT_TABLE).select('*').gte('date', localISO(from)).order('date', { ascending: true }));
    if (error) {
      console.warn('aptList', error.message);
      return undefined;
    }
    const list = (data || []).map(_apt().fromRow);
    if (!isDirty(APT_KEY)) LS.set(APT_KEY, JSON.stringify(list));
    return list;
  } catch (e) {
    console.warn('aptList', e);
    return undefined;
  }
}

export async function aptUpsert(a) {
  const sb = getSB();
  if (!sb) return false;
  const { error } = await tq(sb.from(APT_TABLE).upsert(_apt().toRow(a), { onConflict: 'id' }));
  if (error) console.warn('aptUpsert', error.message);
  return !error;
}

export async function aptDelete(id) {
  const sb = getSB();
  if (!sb) return false;
  const { error } = await tq(sb.from(APT_TABLE).delete().eq('id', Number(id)));
  if (error) console.warn('aptDelete', error.message);
  return !error;
}

export async function aptMutate(mutator, verify) {
  const base = await aptList();
  if (base === undefined) return { ok: false, error: 'offline' };
  const next = mutator(base);
  if (next && !Array.isArray(next) && next.abort) return { ok: false, error: next.abort, data: base };
  const { changed, removed } = _apt().diff(base, next);
  let ok = true;
  for (const a of changed) {
    if (!(await aptUpsert(a))) ok = false;
  }
  for (const a of removed) {
    if (!(await aptDelete(a.id))) ok = false;
  }
  if (!ok) return { ok: false, error: 'offline', data: base };
  try {
    localStorage.setItem(APT_KEY, JSON.stringify(next));
  } catch { /* storage unavailable (private mode / quota): non-fatal */ }
  if (verify) {
    const check = await aptList();
    if (Array.isArray(check) && verify(check)) return { ok: true, data: check };
    return { ok: false, error: 'conflict', data: check || next };
  }
  return { ok: true, data: next };
}

export async function aptSetAll(list) {
  const res = await aptMutate(() => list);
  return res.ok;
}
