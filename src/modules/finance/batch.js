// A "batch" is the set of NEW/CHANGED rows one finance action produces, keyed like
// the finance state. Actions are pure: they read `state`, return a batch, and the
// caller commits it through the sync layer (store.js). applyBatch() is the pure
// counterpart used for optimistic local state and in tests.

import { emptyState } from './constants.js';

export const emptyBatch = () => ({
  accounts: [], charges: [], payments: [], entries: [], lines: [], rules: [], allocations: [],
  settlements: [], reconciliations: [], audit: [], expenses: [], recurring: []
});

export function mergeBatches(...batches) {
  const out = emptyBatch();
  for (const b of batches) for (const k of Object.keys(out)) out[k].push(...(b[k] || []));
  return out;
}

// Upsert by id (never removes rows). `lines` are always DERIVED from the entries that embed them.
export function applyBatch(state, batch) {
  const next = { ...emptyState(), ...state };
  for (const k of Object.keys(emptyBatch())) {
    if (k === 'lines') continue;
    const rows = batch[k] || [];
    if (!rows.length) continue;
    const map = new Map((next[k] || []).map(r => [String(r.id), r]));
    for (const r of rows) map.set(String(r.id), r);
    next[k] = [...map.values()];
  }
  next.lines = next.entries.flatMap(e => e.lines || []);
  return next;
}

export const isEmptyBatch = b => Object.values(b).every(a => !a || a.length === 0);
