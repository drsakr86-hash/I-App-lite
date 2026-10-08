// Ledger repair: every money row must have its ledger entry. If a device went offline between
// writing a payment and its entry (they sync as separate keys), this re-derives the missing
// entries with their DETERMINISTIC ids — so running it twice, or on two devices, is harmless.

import { entryForCharge, entryForPayment, entryForExpense, entryForReversal, hasEntryFor } from './ledger.js';
import { emptyBatch } from './batch.js';

export function missingEntries(state, ctx = {}) {
  const b = emptyBatch();
  const have = new Set(state.entries.map(e => e.id));
  const add = e => { if (!have.has(e.entry.id)) { have.add(e.entry.id); b.entries.push(e.entry); b.lines.push(...e.lines); } };

  for (const c of state.charges) if (!hasEntryFor(state.entries, c.id)) add(entryForCharge(c, ctx));
  const origEntries = new Map(state.entries.map(e => [e.id, e]));
  for (const p of state.payments) {
    if (hasEntryFor(state.entries, p.id)) continue;
    if (p.kind !== 'reversal') { add(entryForPayment(p, ctx)); continue; }
    const origId = 'ent-' + p.reversalOf;
    const orig = origEntries.get(origId) || b.entries.find(e => e.id === origId);
    if (orig) add(entryForReversal({ rowId: p.id, original: orig, originalLines: orig.lines || [], date: p.paymentDate, createdBy: ctx.by || '', memo: p.reason }));
  }
  for (const e of state.expenses) if (e.status === 'paid' && !hasEntryFor(state.entries, e.id)) add(entryForExpense(e, ctx));
  return b;
}
