// Bridge between the pure finance domain and the EXISTING sync layer (sbMutate → rowMutate / local queue).
// Nothing here talks to Supabase directly. Rows are upserted by id; the ledger-lines table is never
// written by the client (the server expands each entry's embedded `lines`).

import { FIN_KEYS, emptyState } from './constants.js';
import { isEmptyBatch, emptyBatch, applyBatch } from './batch.js';
import { sbGet, sbMutate } from '../sync/wiring.js';
import { busEmit } from '../sync/engine.js';

// Dependency order: parents before children, so a partial commit never leaves a dangling reference.
export const COMMIT_ORDER = [
  ['accounts', FIN_KEYS.accounts], ['charges', FIN_KEYS.charges], ['payments', FIN_KEYS.payments],
  ['entries', FIN_KEYS.entries], ['rules', FIN_KEYS.rules], ['settlements', FIN_KEYS.settlements],
  ['allocations', FIN_KEYS.allocations], ['reconciliations', FIN_KEYS.reconciliations],
  ['expenses', 'iapp_expenses'], ['recurring', 'iapp_recurring_expenses'], ['audit', FIN_KEYS.audit]
];

// Keys the secretary's collection screen needs vs. what the admin Accounting screen loads.
export const SCOPES = {
  collect: [['accounts', FIN_KEYS.accounts], ['charges', FIN_KEYS.charges], ['payments', FIN_KEYS.payments], ['entries', FIN_KEYS.entries]],
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
export async function loadFinanceState(scope = 'collect') {
  const state = emptyState();
  const keys = SCOPES[scope] || SCOPES.collect;
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
// A failure after the first key leaves a PARTIAL commit; repair.missingEntries() heals the one case that
// matters (money row without ledger entry) and every id is deterministic, so retrying is safe.
export async function commitBatch(batch, current = emptyState()) {
  if (!batch || isEmptyBatch(batch)) return { ok: true, state: current };
  let state = current;
  for (const [name, key] of COMMIT_ORDER) {
    const rows = batch[name];
    if (!rows || !rows.length) continue;
    const res = await sbMutate(key, list => upsertById(list, rows), list => rows.every(r => list.some(x => String(x.id) === String(r.id))));
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
  const res = await commitBatch(plan.batch, state);
  return { ...res, plan };
}
