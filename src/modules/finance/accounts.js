// Account helpers shared by the collection and expense screens (pure).

import { DEFAULT_ACCOUNT_ID } from './constants.js';

// Accounts a user can pick for NEW money: active, and never the migration-only legacy account.
export const selectableAccounts = accounts => (accounts || []).filter(a => a.active !== false && !a.isLegacy);

const TYPE_FOR_METHOD = { cash: 'cash', pos: 'pos', bank_transfer: 'bank', wallet: 'wallet' };

// Best default account for a method: the account of the matching type, else the main cash account, else the first.
export function defaultAccountFor(accounts, method) {
  const list = selectableAccounts(accounts);
  return list.find(a => a.type === TYPE_FOR_METHOD[method]) || list.find(a => a.id === DEFAULT_ACCOUNT_ID) || list[0] || null;
}

// New-account batch (admin only; the server enforces it). Opening balance is stored as a plain amount on the
// account row — it is the only balance that is not derived from the ledger.
import { emptyBatch } from './batch.js';
import { buildAudit } from './audit.js';
import { fail, ACCOUNT_TYPES } from './constants.js';
import { normMoney } from './money.js';
import { newFinId } from './ids.js';

export function createAccountBatch(input, ctx = {}) {
  if (!input.name || !String(input.name).trim()) fail('ACCOUNT_REQUIRED', 'account name is required');
  if (!ACCOUNT_TYPES.includes(input.type)) fail('ACCOUNT_REQUIRED', 'invalid account type');
  const opening = normMoney(input.openingBalance === '' || input.openingBalance == null ? '0' : input.openingBalance);
  if (opening === null) fail('AMOUNT_INVALID', 'invalid opening balance');
  const acc = {
    id: input.id || newFinId('acc'), name: String(input.name).trim(), type: input.type, clinic: input.clinic || '', active: true,
    openingBalance: opening, isLegacy: false, createdAt: (ctx.now || new Date()).toISOString(), createdBy: ctx.by || ''
  };
  const b = emptyBatch();
  b.accounts.push(acc);
  b.audit.push(buildAudit({ entity: 'account', entityId: acc.id, action: 'create', by: ctx.by, role: ctx.role, newValue: acc, now: ctx.now }));
  return b;
}
