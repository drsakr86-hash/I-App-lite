// Pure helpers for the Accounting screen (no React): label lists and view-model builders.
import { SELECTABLE_METHODS } from '../../modules/finance/constants.js';
import { selectableAccounts, defaultAccountFor } from '../../modules/finance/accounts.js';
import { dueRecurring } from '../../modules/finance/expenses.js';
import { verifyLedger } from '../../modules/finance/ledger.js';
import { missingEntries } from '../../modules/finance/repair.js';
import { isEmptyBatch } from '../../modules/finance/batch.js';
import { toMinor } from '../../modules/finance/money.js';

export const isSetUp = state => selectableAccounts(state.accounts).length > 0;

export const accountOptions = state => selectableAccounts(state.accounts).map(a => [a.id, a.name]);

export const methodOptions = tr => SELECTABLE_METHODS.map(m => [m, tr('g8.method.' + m)]);

export const defaultPay = (state, method = 'cash') => {
  const a = defaultAccountFor(state.accounts, method);
  return { method, accountId: a ? a.id : '' };
};

// Expense rows for the ledger list: originals + reversal rows, newest first. A reversed expense is flagged.
export function expenseListModel(state, { from, to, clinic }) {
  const reversed = new Set(state.expenses.filter(e => e.reversalOf).map(e => e.reversalOf));
  return state.expenses
    .filter(e => (!from || (e.date || '') >= from) && (!to || (e.date || '') <= to) && (!clinic || e.clinic === clinic))
    .map(e => ({ ...e, _status: e.reversalOf ? 'reversal' : reversed.has(e.id) ? 'reversed' : e.status || 'paid' }))
    .sort((a, b) => (b.date || '').localeCompare(a.date || '') || String(b.id).localeCompare(String(a.id)));
}

export const dueListModel = (state, today) => dueRecurring(state, today);

// Ledger health for the setup tab: balanced, plus how many money rows lack an entry.
export function healthModel(state) {
  const problems = verifyLedger(state.entries, state.lines);
  const miss = missingEntries(state, {});
  return { ok: problems.length === 0 && isEmptyBatch(miss), problems, missing: miss.entries.length, repairBatch: miss };
}

export const amountOk = x => { const m = toMinor(x); return m !== null && m > 0; };
