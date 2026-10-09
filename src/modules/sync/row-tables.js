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
import {
  FINANCE_ROW_TABLES, expenseExtraFromRow, expenseExtraToRow, recurringExtraFromRow, recurringExtraToRow
} from './finance-tables.js';

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
      recurringId: r.recurring_id || undefined,
      ...expenseExtraFromRow(r)
    }),
    toRow: e => ({
      id: String(e.id),
      date: e.date || null,
      category: e.category || null,
      amount: e.amount === undefined || e.amount === '' ? null : String(e.amount),
      notes: e.notes || null,
      clinic: e.clinic || null,
      recurring_id: e.recurringId == null ? null : String(e.recurringId),
      ...expenseExtraToRow(e),
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
      clinic: r.clinic || '',
      ...recurringExtraFromRow(r)
    }),
    toRow: r => ({
      id: String(r.id),
      category: r.category || null,
      amount: r.amount === undefined || r.amount === '' ? null : String(r.amount),
      notes: r.notes || null,
      clinic: r.clinic || null,
      ...recurringExtraToRow(r),
      updated_at: new Date().toISOString()
    }),
    order: 'id'
  },
  // Accounting core tables (see finance-tables.js for the insertOnly / noDelete / paged flags).
  ...FINANCE_ROW_TABLES
};

const PAGE = 1000;

export async function rowList(key) {
  const cfg = ROW_TABLES[key];
  if (!cfg) return undefined;
  try {
    const sb = getSB();
    if (!sb) return undefined;
    if (offlineNow()) return undefined;
    let data;
    if (cfg.paged) {
      // PostgREST caps one response (1000 rows); read in pages so a long-lived ledger is never truncated.
      data = [];
      for (let from = 0; ; from += PAGE) {
        const page = await tq(sb.from(cfg.table).select('*').order(cfg.order, { ascending: true }).order('id', { ascending: true }).range(from, from + PAGE - 1));
        if (page.error) {
          console.warn('rowList ' + key, page.error.message);
          return undefined;
        }
        data.push(...(page.data || []));
        if (!page.data || page.data.length < PAGE) break;
      }
    } else {
      const res = await tq(sb.from(cfg.table).select('*').order(cfg.order, { ascending: true }));
      if (res.error) {
        console.warn('rowList ' + key, res.error.message);
        return undefined;
      }
      data = res.data;
    }
    const list = (data || []).map(cfg.fromRow);
    if (!isDirty(key)) LS.set(key, JSON.stringify(list));
    return list;
  } catch (e) {
    console.warn('rowList ' + key, e);
    return undefined;
  }
}

// 23505 on the PRIMARY KEY only (a different unique index — e.g. one charge per source — is a real conflict).
const isPkDuplicate = e => e && e.code === '23505' && /_pkey"?/.test(String(e.message || e.details || ''));

export async function rowUpsert(key, rec) {
  const cfg = ROW_TABLES[key];
  const sb = getSB();
  if (!cfg || !sb) return false;
  if (cfg.insertOnly) {
    // insertOnly rows are immutable: a plain INSERT, and "this id already exists" counts as success (an offline
    // retry). NOT upsert/ON CONFLICT: PostgREST's ON CONFLICT path needs a SELECT policy, which the secretary
    // deliberately does not have on the finance tables (she may only INSERT a documented collection).
    const { error } = await tq(sb.from(cfg.table).insert(cfg.toRow(rec)));
    if (error && isPkDuplicate(error)) return true;
    if (error) console.warn('rowUpsert ' + key, error.message);
    return !error;
  }
  const opts = { onConflict: 'id' };
  const { error } = await tq(sb.from(cfg.table).upsert(cfg.toRow(rec), opts));
  if (error) console.warn('rowUpsert ' + key, error.message);
  return !error;
}

export async function rowDelete(key, id) {
  const cfg = ROW_TABLES[key];
  const sb = getSB();
  if (!cfg || !sb) return false;
  if (cfg.noDelete) return false; // financial history is never deleted (post a reversal instead)
  const { error } = await tq(sb.from(cfg.table).delete().eq('id', String(id)));
  if (error) console.warn('rowDelete ' + key, error.message);
  return !error;
}

export async function rowMutate(key, mutator, verify) {
  const cfg = ROW_TABLES[key] || {};
  const base = await rowList(key);
  if (base === undefined) return { ok: false, error: 'offline' };
  let next = mutator(base);
  if (next && !Array.isArray(next) && next.abort) return { ok: false, error: next.abort, data: base };
  if (cfg.noDelete) {
    // append-only semantics: rows missing from the proposed list are KEPT, never removed.
    const have = new Set(next.map(r => String(r.id)));
    next = [...next, ...base.filter(r => !have.has(String(r.id)))];
  }
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
  } catch { /* storage unavailable (private mode / quota): non-fatal */ }
  if (verify) {
    const check = await rowList(key);
    if (Array.isArray(check) && verify(check)) return { ok: true, data: check };
    return { ok: false, error: 'conflict', data: check || next };
  }
  return { ok: true, data: next };
}
