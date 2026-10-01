// The "ROW_TABLES" Core sync functions — moved here from
// public/legacy/app-runtime.js (Phase 8, batch 12). This is the generic
// per-table dispatch target (for every Core table other than appointments,
// which has its own dedicated src/modules/appointments/core.js) that
// sbMutate's setTableMutate hook (see wiring.js) and _sbGetRaw/_sbSetRaw
// (still in legacy) route to for the iapp_visits/iapp_expenses/
// iapp_recurring_expenses keys.
//
// Exact copy of the legacy originals, with `window.*` reads changed to
// `globalThis.*` — same approach as every other Phase 8 module. Unlike the
// appointments Core (which builds on mapping helpers moved in an earlier
// phase), ROW_TABLES' fromRow/toRow mapping was never split out on its own,
// so the config object is moved here as-is, verbatim.

import { getSB } from '../data-access/index.js';
import { LS, isDirty, offlineNow, tq } from './engine.js';

export const ROW_TABLES = {
  iapp_visits: {
    table: 'iapp_visits',
    fromRow: r => ({
      id: String(r.id),
      patientId: r.patient_id == null ? null : Number(r.patient_id),
      patient: r.patient || '',
      date: r.date || '',
      type: r.type || '',
      doctor: r.doctor || '',
      clinic: r.clinic || '',
      complaint: r.complaint || '',
      result: r.result || '',
      cost: r.cost == null ? '' : String(r.cost),
      paid: !!r.paid,
      nextVisit: r.next_visit || '',
      notes: r.notes || '',
      rated: !!r.rated
    }),
    toRow: v => ({
      id: String(v.id),
      patient_id: v.patientId == null ? null : Number(v.patientId),
      patient: v.patient || '',
      date: v.date || null,
      type: v.type || null,
      doctor: v.doctor || null,
      clinic: v.clinic || null,
      complaint: v.complaint || null,
      result: v.result || null,
      cost: v.cost === undefined || v.cost === '' ? null : String(v.cost),
      paid: !!v.paid,
      next_visit: v.nextVisit || null,
      notes: v.notes || null,
      rated: !!v.rated,
      updated_at: new Date().toISOString()
    }),
    order: 'date'
  },
  iapp_expenses: {
    table: 'iapp_expenses',
    fromRow: r => ({
      id: String(r.id),
      date: r.date || '',
      category: r.category || '',
      amount: r.amount == null ? '' : String(r.amount),
      notes: r.notes || '',
      clinic: r.clinic || '',
      recurringId: r.recurring_id || undefined
    }),
    toRow: e => ({
      id: String(e.id),
      date: e.date || null,
      category: e.category || null,
      amount: e.amount === undefined || e.amount === '' ? null : String(e.amount),
      notes: e.notes || null,
      clinic: e.clinic || null,
      recurring_id: e.recurringId == null ? null : String(e.recurringId),
      updated_at: new Date().toISOString()
    }),
    order: 'date'
  },
  iapp_recurring_expenses: {
    table: 'iapp_recurring_expenses',
    fromRow: r => ({
      id: String(r.id),
      category: r.category || '',
      amount: r.amount == null ? '' : String(r.amount),
      notes: r.notes || '',
      clinic: r.clinic || ''
    }),
    toRow: r => ({
      id: String(r.id),
      category: r.category || null,
      amount: r.amount === undefined || r.amount === '' ? null : String(r.amount),
      notes: r.notes || null,
      clinic: r.clinic || null,
      updated_at: new Date().toISOString()
    }),
    order: 'id'
  }
};

export async function rowList(key) {
  const cfg = ROW_TABLES[key];
  if (!cfg) return undefined;
  try {
    const sb = getSB();
    if (!sb) return undefined;
    if (offlineNow()) return undefined;
    const { data, error } = await tq(sb.from(cfg.table).select('*').order(cfg.order, { ascending: true }));
    if (error) {
      console.warn('rowList ' + key, error.message);
      return undefined;
    }
    const list = (data || []).map(cfg.fromRow);
    if (!isDirty(key)) LS.set(key, JSON.stringify(list));
    return list;
  } catch (e) {
    console.warn('rowList ' + key, e);
    return undefined;
  }
}

export async function rowUpsert(key, rec) {
  const cfg = ROW_TABLES[key];
  const sb = getSB();
  if (!cfg || !sb) return false;
  const { error } = await tq(sb.from(cfg.table).upsert(cfg.toRow(rec), { onConflict: 'id' }));
  if (error) console.warn('rowUpsert ' + key, error.message);
  return !error;
}

export async function rowDelete(key, id) {
  const cfg = ROW_TABLES[key];
  const sb = getSB();
  if (!cfg || !sb) return false;
  const { error } = await tq(sb.from(cfg.table).delete().eq('id', String(id)));
  if (error) console.warn('rowDelete ' + key, error.message);
  return !error;
}

export async function rowMutate(key, mutator, verify) {
  const base = await rowList(key);
  if (base === undefined) return { ok: false, error: 'offline' };
  const next = mutator(base);
  if (next && !Array.isArray(next) && next.abort) return { ok: false, error: next.abort, data: base };
  const prevById = new Map(base.map(r => [String(r.id), r]));
  const nextById = new Map(next.map(r => [String(r.id), r]));
  const changed = next.filter(r => {
    const p = prevById.get(String(r.id));
    return !p || JSON.stringify(p) !== JSON.stringify(r);
  });
  const removed = base.filter(r => !nextById.has(String(r.id)));
  let ok = true;
  for (const r of changed) {
    if (!(await rowUpsert(key, r))) ok = false;
  }
  for (const r of removed) {
    if (!(await rowDelete(key, r.id))) ok = false;
  }
  if (!ok) return { ok: false, error: 'offline', data: base };
  try {
    localStorage.setItem(key, JSON.stringify(next));
  } catch {}
  if (verify) {
    const check = await rowList(key);
    if (Array.isArray(check) && verify(check)) return { ok: true, data: check };
    return { ok: false, error: 'conflict', data: check || next };
  }
  return { ok: true, data: next };
}
