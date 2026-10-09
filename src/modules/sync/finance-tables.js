// ROW_TABLES entries for the accounting core. They plug into the EXISTING sync strategy
// (useDB → queueSave → flusher → sbGetRaw/sbSetRaw → rowList/rowMutate); nothing here bypasses it.
//
//   insertOnly : rows are immutable once synced → upsert uses ON CONFLICT DO NOTHING (an offline retry
//                of the same row is harmless; a changed row can never overwrite a posted one)
//   noDelete   : rowMutate never deletes and rowDelete refuses (financial history is never removed)
//   paged      : rowList reads in pages (PostgREST caps a single response at 1000 rows)

import { normMoney } from '../finance/money.js';

const T = {
  text: { from: v => (v == null ? '' : String(v)), to: v => (v === undefined || v === null || v === '' ? null : String(v)) },
  id: { from: v => (v == null ? null : String(v)), to: v => (v === undefined || v === null || v === '' ? null : String(v)) },
  int: { from: v => (v == null ? null : Number(v)), to: v => (v === undefined || v === null || v === '' ? null : Number(v)) },
  money: { from: v => (v == null ? '' : normMoney(v) ?? ''), to: v => (v === undefined || v === null || v === '' ? null : normMoney(v)) },
  bool: { from: v => !!v, to: v => !!v },
  json: { from: v => (Array.isArray(v) ? v : v == null ? [] : v), to: v => (v === undefined ? null : v) },
  // created_at is stamped by the client (stable across retries) but optional for the DB default.
  ts: { from: v => (v == null ? '' : String(v)), to: v => (v ? String(v) : undefined) }
};

// spec: [camelCase, snake_case, type]
function table(name, spec, extra = {}) {
  return {
    table: name,
    fromRow: r => Object.fromEntries([['id', String(r.id)], ...spec.map(([c, s, t]) => [c, T[t].from(r[s])])]),
    toRow: v => {
      const row = { id: String(v.id) };
      for (const [c, s, t] of spec) {
        const x = T[t].to(v[c]);
        if (x !== undefined) row[s] = x;
      }
      return row;
    },
    order: 'created_at',
    paged: true,
    ...extra
  };
}

const APPEND = { insertOnly: true, noDelete: true };

export const FINANCE_ROW_TABLES = {
  iapp_fin_accounts: table('iapp_fin_accounts', [
    ['name', 'name', 'text'], ['type', 'type', 'text'], ['clinic', 'clinic', 'text'], ['active', 'active', 'bool'],
    ['openingBalance', 'opening_balance', 'money'], ['isLegacy', 'is_legacy', 'bool'], ['createdAt', 'created_at', 'ts'], ['createdBy', 'created_by', 'text']
  ], { noDelete: true }),

  iapp_charges: table('iapp_charges', [
    ['kind', 'kind', 'text'], ['parentId', 'parent_id', 'id'], ['patientId', 'patient_id', 'int'], ['visitId', 'visit_id', 'id'],
    ['appointmentId', 'appointment_id', 'id'], ['service', 'service', 'text'], ['amount', 'amount', 'money'], ['discount', 'discount', 'money'],
    ['netAmount', 'net_amount', 'money'], ['doctorId', 'doctor_id', 'id'], ['doctor', 'doctor', 'text'], ['clinic', 'clinic', 'text'],
    ['status', 'status', 'text'], ['serviceDate', 'service_date', 'text'], ['source', 'source', 'text'], ['sourceRef', 'source_ref', 'id'],
    ['reason', 'reason', 'text'], ['createdAt', 'created_at', 'ts'], ['createdBy', 'created_by', 'text']
  ], APPEND),

  iapp_payments: table('iapp_payments', [
    ['kind', 'kind', 'text'], ['patientId', 'patient_id', 'int'], ['chargeId', 'charge_id', 'id'], ['settlementId', 'settlement_id', 'id'],
    ['amount', 'amount', 'money'], ['method', 'method', 'text'], ['accountId', 'account_id', 'id'], ['toAccountId', 'to_account_id', 'id'],
    ['paymentDate', 'payment_date', 'text'], ['receiptNo', 'receipt_no', 'text'], ['receivedBy', 'received_by', 'text'], ['status', 'status', 'text'],
    ['reversalOf', 'reversal_of', 'id'], ['origKind', 'orig_kind', 'text'], ['source', 'source', 'text'], ['sourceRef', 'source_ref', 'id'],
    ['reason', 'reason', 'text'], ['notes', 'notes', 'text'], ['clinic', 'clinic', 'text'], ['createdAt', 'created_at', 'ts'], ['createdBy', 'created_by', 'text']
  ], APPEND),

  // Ledger entries carry their lines (jsonb). The server expands them into iapp_accounting_entry_lines.
  iapp_accounting_entries: table('iapp_accounting_entries', [
    ['date', 'date', 'text'], ['type', 'type', 'text'], ['source', 'source', 'text'], ['sourceRef', 'source_ref', 'id'], ['memo', 'memo', 'text'],
    ['status', 'status', 'text'], ['reversalOf', 'reversal_of', 'id'], ['reversalOfType', 'reversal_of_type', 'text'], ['clinic', 'clinic', 'text'],
    ['lines', 'lines', 'json'], ['createdAt', 'created_at', 'ts'], ['createdBy', 'created_by', 'text']
  ], APPEND),

  iapp_doctor_share_rules: table('iapp_doctor_share_rules', [
    ['doctorId', 'doctor_id', 'id'], ['doctor', 'doctor', 'text'], ['service', 'service', 'text'], ['clinic', 'clinic', 'text'], ['mode', 'mode', 'text'],
    ['value', 'value', 'money'], ['active', 'active', 'bool'], ['validFrom', 'valid_from', 'text'], ['validTo', 'valid_to', 'text'],
    ['createdAt', 'created_at', 'ts'], ['createdBy', 'created_by', 'text']
  ], { noDelete: true }),

  iapp_doctor_settlements: table('iapp_doctor_settlements', [
    ['doctorId', 'doctor_id', 'id'], ['doctor', 'doctor', 'text'], ['clinic', 'clinic', 'text'], ['periodFrom', 'period_from', 'text'], ['periodTo', 'period_to', 'text'],
    ['grossRevenue', 'gross_revenue', 'money'], ['doctorShare', 'doctor_share', 'money'], ['centerShare', 'center_share', 'money'],
    ['paidAmount', 'paid_amount', 'money'], ['remainingAmount', 'remaining_amount', 'money'], ['status', 'status', 'text'],
    ['createdAt', 'created_at', 'ts'], ['createdBy', 'created_by', 'text']
  ], { noDelete: true }),

  iapp_revenue_allocations: table('iapp_revenue_allocations', [
    ['settlementId', 'settlement_id', 'id'], ['chargeId', 'charge_id', 'id'], ['ruleId', 'rule_id', 'id'], ['doctorId', 'doctor_id', 'id'],
    ['basisAmount', 'basis_amount', 'money'], ['doctorShare', 'doctor_share', 'money'], ['centerShare', 'center_share', 'money'], ['createdAt', 'created_at', 'ts']
  ], APPEND),

  iapp_cash_reconciliations: table('iapp_cash_reconciliations', [
    ['accountId', 'account_id', 'id'], ['periodFrom', 'period_from', 'text'], ['periodTo', 'period_to', 'text'], ['opening', 'opening', 'money'],
    ['expected', 'expected', 'money'], ['counted', 'counted', 'money'], ['difference', 'difference', 'money'], ['status', 'status', 'text'],
    ['note', 'note', 'text'], ['createdAt', 'created_at', 'ts'], ['createdBy', 'created_by', 'text']
  ], APPEND),

  iapp_fin_audit: table('iapp_fin_audit', [
    ['at', 'at', 'ts'], ['by', 'actor', 'text'], ['role', 'role', 'text'], ['entity', 'entity', 'text'], ['entityId', 'entity_id', 'id'], ['action', 'action', 'text'],
    ['oldValue', 'old_value', 'text'], ['newValue', 'new_value', 'text'], ['source', 'source', 'text'], ['reason', 'reason', 'text']
  ], { ...APPEND, order: 'at' })
};

// Optional new columns on the two LEGACY tables. A field is only written when the record has it, so
// rows created by the old screens serialise exactly as before.
const optional = (rec, pairs) => {
  const o = {};
  for (const [c, s, t] of pairs) {
    if (rec[c] !== undefined && rec[c] !== null && rec[c] !== '') {
      const x = T[t].to(rec[c]);
      if (x !== undefined && x !== null) o[s] = x;
    }
  }
  return o;
};
const optionalFrom = (r, pairs) => {
  const o = {};
  for (const [c, s] of pairs) if (r[s] != null) o[c] = r[s];
  return o;
};

export const EXPENSE_EXTRA = [
  ['dueDate', 'due_date', 'text'], ['status', 'status', 'text'], ['accountId', 'account_id', 'id'], ['paymentMethod', 'payment_method', 'text'],
  ['createdBy', 'created_by', 'text'], ['approvedBy', 'approved_by', 'text'], ['paidAt', 'paid_at', 'text'], ['reversalOf', 'reversal_of', 'id'], ['source', 'source', 'text']
];
export const RECURRING_EXTRA = [
  ['frequency', 'frequency', 'text'], ['startDate', 'start_date', 'text'], ['endDate', 'end_date', 'text'], ['nextDueDate', 'next_due_date', 'text'],
  ['active', 'active', 'bool'], ['accountId', 'account_id', 'id']
];

export const expenseExtraFromRow = r => optionalFrom(r, EXPENSE_EXTRA.map(([c, s]) => [c, s]));
export const expenseExtraToRow = e => optional(e, EXPENSE_EXTRA);
export const recurringExtraFromRow = r => optionalFrom(r, RECURRING_EXTRA.map(([c, s]) => [c, s]));
export const recurringExtraToRow = e => {
  const o = optional(e, RECURRING_EXTRA);
  if (e.active === false) o.active = false;
  return o;
};

// Parents before children. The flusher writes dirty keys independently, so when several finance keys were
// queued offline they MUST be flushed in this order (a payment before its charge/account is rejected by the DB).
export const FINANCE_FLUSH_ORDER = [
  'iapp_fin_accounts', 'iapp_charges', 'iapp_doctor_share_rules', 'iapp_payments', 'iapp_doctor_settlements', 'iapp_revenue_allocations',
  'iapp_cash_reconciliations', 'iapp_expenses', 'iapp_recurring_expenses',
  // ledger entries last: the server only accepts an entry whose origin row (charge/payment/expense/reconciliation) already exists
  'iapp_accounting_entries', 'iapp_fin_audit'
];
// Rank used to sort dirty keys; non-finance keys keep their relative order and go first.
export const flushRank = key => { const i = FINANCE_FLUSH_ORDER.indexOf(key); return i < 0 ? -1 : i; };
export const sortForFlush = keys => keys.map((k, i) => [k, i]).sort((a, b) => flushRank(a[0]) - flushRank(b[0]) || a[1] - b[1]).map(x => x[0]);
