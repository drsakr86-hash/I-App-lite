// Pure logic for the Accounting screen (no DOM / React / Supabase).
import { t, getLang } from '../i18n/index.js';

export function inPeriod(d, period, { today, month }) {
  return period === 'all' ? true : period === 'today' ? d === today : (d || '').startsWith(month);
}

export function inClinic(c, clinicFilter) {
  return !clinicFilter || c === clinicFilter;
}

export function filterPeriodVisits(visits, { period, today, month, clinicFilter }) {
  return visits.filter(v => inPeriod(v.date, period, { today, month }) && inClinic(v.clinic, clinicFilter));
}

export function filterPeriodExpenses(expenses, { period, today, month, clinicFilter }) {
  return expenses
    .filter(e => inPeriod(e.date, period, { today, month }) && inClinic(e.clinic, clinicFilter))
    .sort((a, b) => (b.date || '').localeCompare(a.date || ''));
}

export function computeRevenue(visits) {
  return visits.reduce((s, v) => s + (v.paid ? Number(v.cost || 0) : 0), 0);
}

export function computeTotalExpenses(expenses) {
  return expenses.reduce((s, e) => s + Number(e.amount || 0), 0);
}

export function periodLabel(period) {
  return period === 'today' ? t('g4.acc.tabToday') : period === 'month' ? t('g4.acc.tabMonth') : t('g4.acc.periodAll');
}

// Per-clinic revenue/expense/net breakdown for the comparison list.
export function buildClinicComparison(visits, expenses, clinics, { period, today, month }) {
  return clinics.map(c => {
    const rev = visits
      .filter(v => inPeriod(v.date, period, { today, month }) && v.clinic === c.v)
      .reduce((s, v) => s + (v.paid ? Number(v.cost || 0) : 0), 0);
    const exp = expenses
      .filter(e => inPeriod(e.date, period, { today, month }) && e.clinic === c.v)
      .reduce((s, e) => s + Number(e.amount || 0), 0);
    return { clinic: c, revenue: rev, expense: exp, net: rev - exp };
  });
}

// Recurring expenses not yet materialized for the current month get a new expense entry each.
// (Mirrors the auto-create-on-mount effect; `makeId` is injectable so tests can be deterministic.)
export function buildMissingRecurringExpenseEntries(recurringExpenses, expenses, { monthStr, todayStr, makeId = () => Date.now() + Math.random() }) {
  if (!recurringExpenses || recurringExpenses.length === 0) return [];
  const missing = recurringExpenses.filter(
    r => !expenses.some(e => e.recurringId === r.id && (e.date || '').startsWith(monthStr))
  );
  // The note is STORED data, so it is always written in canonical Arabic; the screen displays it via tv().
  return missing.map(r => ({
    id: makeId(),
    date: todayStr,
    category: r.category,
    amount: r.amount,
    notes: (r.notes ? r.notes + ' · ' : '') + t('g4.acc.recurringNote', 'ar'),
    clinic: r.clinic || '',
    recurringId: r.id
  }));
}

export function reportDateLabel(period, monthStr, now = new Date()) {
  return period === 'today'
    ? now.toLocaleDateString(getLang() === 'en' ? 'en-GB' : 'ar-EG', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
    : period === 'month'
    ? t('g4.acc.reportMonth', { month: monthStr })
    : t('g4.acc.periodAll');
}
