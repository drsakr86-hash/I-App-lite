// Finance domain constants (no UI strings; labels live in the i18n dictionary).

export const ACCOUNT_TYPES = ['cash', 'bank', 'pos', 'wallet', 'clinic'];
export const PAYMENT_METHODS = ['cash', 'pos', 'bank_transfer', 'wallet', 'legacy'];
// Methods a user may pick in the UI ('legacy' is migration-only; never invented for new money).
export const SELECTABLE_METHODS = ['cash', 'pos', 'bank_transfer', 'wallet'];

export const PAYMENT_KINDS = ['payment', 'refund', 'doctor_payment', 'transfer', 'reversal'];
export const CHARGE_KINDS = ['charge', 'adjustment'];
export const EXPENSE_STATUSES = ['pending', 'paid', 'cancelled'];
export const SETTLEMENT_STATUSES = ['draft', 'approved', 'partial', 'paid', 'cancelled'];
export const RECURRENCE = ['weekly', 'monthly', 'yearly'];

export const LEDGER = Object.freeze({
  ASSET: 'ASSET', RECEIVABLE: 'RECEIVABLE', REVENUE: 'REVENUE',
  EXPENSE: 'EXPENSE', DOCTOR_SHARE: 'DOCTOR_SHARE', OVER_SHORT: 'OVER_SHORT'
});

export const SOURCES = Object.freeze({
  COLLECT_MODAL: 'COLLECT_MODAL', MANUAL: 'MANUAL', LEGACY_VISIT: 'LEGACY_VISIT',
  LEGACY_EXPENSE: 'LEGACY_EXPENSE', RECURRING: 'RECURRING', SETTLEMENT: 'SETTLEMENT',
  RECONCILIATION: 'RECONCILIATION', TRANSFER: 'TRANSFER'
});

export const LEGACY_ACCOUNT_ID = 'acc-legacy';
export const DEFAULT_ACCOUNT_ID = 'acc-main-cash';

// localStorage / sync keys of the finance tables (same naming as the existing iapp_* keys).
export const FIN_KEYS = Object.freeze({
  accounts: 'iapp_fin_accounts',
  charges: 'iapp_charges',
  payments: 'iapp_payments',
  entries: 'iapp_accounting_entries',
  lines: 'iapp_accounting_entry_lines',
  rules: 'iapp_doctor_share_rules',
  allocations: 'iapp_revenue_allocations',
  settlements: 'iapp_doctor_settlements',
  reconciliations: 'iapp_cash_reconciliations',
  audit: 'iapp_fin_audit'
});

export class FinanceError extends Error {
  constructor(code, message) {
    super(message || code);
    this.name = 'FinanceError';
    this.code = code;
  }
}
export const fail = (code, msg) => { throw new FinanceError(code, msg); };

export const emptyState = () => ({
  accounts: [], charges: [], payments: [], entries: [], lines: [],
  rules: [], allocations: [], settlements: [], reconciliations: [], audit: [],
  expenses: [], recurring: []
});
