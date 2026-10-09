// Bridge between the pure finance domain and the EXISTING sync layer (sbMutate → rowMutate / local queue).
// Nothing here talks to Supabase directly. Rows are upserted by id; the ledger-lines table is never
// written by the client (the server expands each entry's embedded `lines`).

import { FIN_KEYS, emptyState } from './constants.js';
import { isEmptyBatch, emptyBatch, applyBatch } from './batch.js';
import { toMinor } from './money.js';
import { sbGet, sbMutate } from '../sync/wiring.js';
import { busEmit, isDirty, offlineNow, tq } from '../sync/engine.js';
import { getSB } from '../data-access/index.js';
import { FINANCE_ROW_TABLES } from '../sync/finance-tables.js';

// Dependency order: parents before children, so a partial commit never leaves a dangling reference.
// The server accepts a ledger entry only when its origin row already exists, so `entries` come after every money row
// (charge, payment, expense, reconciliation). Payments come BEFORE settlements: a doctor payment is judged against the
// settlement as it was when approved, and the same batch then moves the settlement to partial/paid.
export const COMMIT_ORDER = [
  ['accounts', FIN_KEYS.accounts], ['charges', FIN_KEYS.charges], ['rules', FIN_KEYS.rules], ['payments', FIN_KEYS.payments],
  ['settlements', FIN_KEYS.settlements], ['allocations', FIN_KEYS.allocations], ['reconciliations', FIN_KEYS.reconciliations],
  ['expenses', 'iapp_expenses'], ['recurring', 'iapp_recurring_expenses'], ['entries', FIN_KEYS.entries], ['audit', FIN_KEYS.audit]
];

// What the ADMIN Accounting screen loads. The secretary has no read access to the finance tables at all:
// her collection screen uses loadCollectionState() (a server RPC that returns aggregates only).
export const SCOPES = {
  full: [
    ['accounts', FIN_KEYS.accounts], ['charges', FIN_KEYS.charges], ['payments', FIN_KEYS.payments], ['entries', FIN_KEYS.entries],
    ['rules', FIN_KEYS.rules], ['settlements', FIN_KEYS.settlements], ['allocations', FIN_KEYS.allocations],
    ['reconciliations', FIN_KEYS.reconciliations], ['audit', FIN_KEYS.audit], ['expenses', 'iapp_expenses'], ['recurring', 'iapp_recurring_expenses']
  ]
};

export const upsertById = (list, rows) => {
  const map = new Map((Array.isArray(list) ? list : []).map(r => [String(r.id), r]));
  for (const r of rows) map.set(String(r.id), r);
  return [...map.values()];
};

// Reads the finance state through sbGet (serves a dirty key from the local queue first).
export async function loadFinanceState(scope = 'full') {
  const state = emptyState();
  const keys = SCOPES[scope] || SCOPES.full;
  const res = await Promise.all(keys.map(([, key]) => sbGet(key)));
  let offline = false;
  keys.forEach(([name], i) => {
    if (Array.isArray(res[i])) state[name] = res[i];
    else if (res[i] === undefined) offline = true;
  });
  state.lines = state.entries.flatMap(e => e.lines || []);
  return { state, offline };
}

// Commits a batch key by key (dependency order). Returns {ok, failedKey?, state?}.
// opts.verify=false skips the read-back check: the secretary can INSERT but not SELECT finance rows, so she cannot re-read
// what she just wrote (the server's own guards are the check).
// A failure after the first key leaves a PARTIAL commit; repair.missingEntries() heals the one case that
// matters (money row without ledger entry) and every id is deterministic, so retrying is safe.
export async function commitBatch(batch, current = emptyState(), opts = {}) {
  if (!batch || isEmptyBatch(batch)) return { ok: true, state: current };
  let state = current;
  for (const [name, key] of COMMIT_ORDER) {
    const rows = batch[name];
    if (!rows || !rows.length) continue;
    const verify = opts.verify === false ? undefined : list => rows.every(r => list.some(x => String(x.id) === String(r.id)));
    const res = await sbMutate(key, list => upsertById(list, rows), verify);
    if (!res.ok) return { ok: false, failedKey: key, error: res.error, state };
    busEmit(key, res.data);
    state = applyBatch(state, { ...emptyBatch(), [name]: rows });
  }
  return { ok: true, state };
}

// Collection = plan (pure) + commit (sync layer). `state` is what loadFinanceState returned.
// The paymentId is generated once per modal submit so a double tap / retry cannot post the money twice.
import { planCollection } from './collection.js';
export async function submitCollection(state, input, ctx) {
  const plan = planCollection(state, input, ctx);
  const res = await commitBatch(plan.batch, state, { verify: ctx && ctx.role === 'admin' });
  return { ...res, plan };
}

// ---- secretary: collection state from the server RPC (aggregates only, never the ledger) ----------------------------------

const minorOf = v => toMinor(v) || 0;
const idsOf = rows => (Array.isArray(rows) ? rows.map(r => String(r.id)) : []);

// Pure: RPC result (+ this device's not-yet-confirmed rows) → finance state with `serverBalances`.
//  - accounts: only the ones a collection may use (server filters legacy / inactive)
//  - charges : the charge(s) of the requested appointments (+ adjustments); totals come from the FULL ledger on the server
//  - local rows the server has not confirmed yet (offline queue) are layered on top, those it already holds are ignored
export function stateFromCollectionRpc(res, local = {}) {
  const T = FINANCE_ROW_TABLES;
  const state = emptyState();
  const known = new Set((res && res.known_ids) || []);
  state.accounts = ((res && res.accounts) || []).map(T.iapp_fin_accounts.fromRow);
  state.serverBalances = {};
  for (const item of (res && res.charges) || []) {
    const c = T.iapp_charges.fromRow(item.charge);
    state.charges.push(c, ...(item.adjustments || []).map(T.iapp_charges.fromRow));
    state.serverBalances[c.id] = { paid: minorOf(item.paid), refunded: minorOf(item.refunded) };
  }
  const have = new Set(state.charges.map(c => c.id));
  for (const c of local.charges || []) if (!known.has(String(c.id)) && !have.has(String(c.id))) state.charges.push(c);
  for (const p of local.payments || []) if (!known.has(String(p.id))) state.payments.push(p);
  return state;
}

// Online only. Returns {state, offline}. The appointment ids are the ones the screen is about to collect for.
export async function loadCollectionState(aptIds) {
  const sb = getSB();
  if (!sb || offlineNow()) return { state: emptyState(), offline: true };
  // rows this device queued while offline and that may not have reached the server yet
  const dirtyC = isDirty(FIN_KEYS.charges), dirtyP = isDirty(FIN_KEYS.payments);
  const [lc, lp] = await Promise.all([dirtyC ? sbGet(FIN_KEYS.charges) : [], dirtyP ? sbGet(FIN_KEYS.payments) : []]);
  const local = { charges: Array.isArray(lc) ? lc : [], payments: Array.isArray(lp) ? lp : [] };
  try {
    const { data, error } = await tq(sb.rpc('iapp_fin_collection_state', { p_apt_ids: aptIds.map(String), p_pending_ids: [...idsOf(local.charges), ...idsOf(local.payments)].slice(0, 200) }));
    if (error || !data) { if (error) console.warn('collection state', error.message); return { state: emptyState(), offline: true }; }
    return { state: stateFromCollectionRpc(data, local), offline: false };
  } catch (e) {
    console.warn('collection state', e);
    return { state: emptyState(), offline: true };
  }
}
