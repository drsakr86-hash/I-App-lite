// Pure logic for the Accounting screen (no DOM / React / Supabase).

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
  return period === 'today' ? 'اليوم' : period === 'month' ? 'هذا الشهر' : 'كل الفترة';
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
    t => !expenses.some(e => e.recurringId === t.id && (e.date || '').startsWith(monthStr))
  );
  return missing.map(t => ({
    id: makeId(),
    date: todayStr,
    category: t.category,
    amount: t.amount,
    notes: (t.notes ? t.notes + ' · ' : '') + 'مصروف شهري ثابت',
    clinic: t.clinic || '',
    recurringId: t.id
  }));
}

export function reportDateLabel(period, monthStr, now = new Date()) {
  return period === 'today'
    ? now.toLocaleDateString('ar-EG', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
    : period === 'month'
    ? `شهر ${monthStr}`
    : 'كل الفترة';
}
