import React, { useState } from 'react';
import { C } from '../modules/theme/index.js';
import { TabBar, Segmented } from './accounting/parts.jsx';
import { Modal } from '../components/common.jsx';
import { CLINIC_FILTERS, localISO } from '../modules/constants/index.js';
import { t, useLang, dirOf } from '../modules/i18n/index.js';
import { tv } from '../modules/i18n/tv.js';
import { printDoc, getAccountingReportHTML } from '../modules/print/index.js';
import { useFinance } from '../modules/finance/use-finance.js';
import { periodFilters, dashboard } from '../modules/finance/reports.js';
import Overview from './accounting/Overview.jsx';
import Expenses from './accounting/Expenses.jsx';
import Doctors from './accounting/Doctors.jsx';
import Cash from './accounting/Cash.jsx';
import Setup, { MigrationPanel } from './accounting/Setup.jsx';
import { isSetUp } from './accounting/view-model.js';
import { reportDateLabel } from '../modules/accounting/model.js';

// Accounting screen on the finance domain (charges / payments / ledger). Opening it only READS;
// every write is an explicit button that goes through useFinance().run().
// Props: legacy data (visits/expenses/recurring/appointments/doctors) is used ONLY by the explicit
// "financial setup" migration; the numbers on screen come from the finance tables.
export default function Accounting({ visits, expenses, recurringExpenses, appointments = [], doctors = [], clinic, session }) {
  const lang = useLang();
  const [tab, setTab] = useState('overview');
  const [period, setPeriod] = useState('month');
  const [clinicFilter, setClinicFilter] = useState('');
  const { state, status, run } = useFinance('full');
  const [msg, setMsg] = useState(null);
  const todayStr = localISO();
  const monthStr = todayStr.slice(0, 7);
  const filters = { ...periodFilters(period, { today: todayStr, month: monthStr }), clinic: clinicFilter };
  const primary = doctors.find(d => d.isPrimary) || doctors[0] || {};
  const data = { visits, expenses, recurringExpenses, appointments, doctors };

  const notify = r => { if (!r.ok) setMsg(r.code === 'COMMIT_FAILED' ? t('g8.collect.commitFailed', lang) : t('g8.err.' + r.code, lang)); };

  const doPrint = () => {
    const d = dashboard(state, filters);
    const rows = state.expenses
      .filter(e => e.status === 'paid' && (!filters.from || (e.paidAt || e.date) >= filters.from) && (!filters.to || (e.paidAt || e.date) <= filters.to) && (!clinicFilter || e.clinic === clinicFilter))
      .map(e => ({ ...e, amount: e.reversalOf ? -Number(e.amount) : Number(e.amount) }));
    printDoc(getAccountingReportHTML(null, null, reportDateLabel(period, monthStr), d.collections / 100, rows, clinic, primary));
  };

  const tabs = [['overview', 'g8.tab.overview'], ['expenses', 'g8.tab.expenses'], ['doctors', 'g8.tab.doctors'], ['cash', 'g8.tab.cash'], ['setup', 'g8.tab.setup']];
  const ready = isSetUp(state);

  return (
    <div style={{ padding: '16px 16px 90px', direction: dirOf(lang) }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <div style={{ color: C.text, fontWeight: 700, fontSize: 17 }}>{t('g4.acc.title', lang)}</div>
        {ready && tab === 'overview' && (
          <div onClick={doPrint} style={{ color: C.accent, fontSize: 12, fontWeight: 700, cursor: 'pointer', padding: '4px 2px' }}>{t('g4.acc.printReport', lang)}</div>
        )}
      </div>

      {status.loading && <div style={{ color: C.muted, fontSize: 12, textAlign: 'center', padding: 20 }}>{t('g8.common.loading', lang)}</div>}
      {!status.loading && status.offline && <div style={{ color: C.gold, fontSize: 11, marginBottom: 8 }}>{t('g8.common.offline', lang)}</div>}

      {!status.loading && !ready && (
        <MigrationPanel state={state} data={data} session={session} run={run} notify={notify} compact />
      )}

      {!status.loading && ready && (
        <>
          <TabBar tabs={tabs.map(([id, k]) => [id, t(k, lang)])} value={tab} onChange={setTab} />
          {tab !== 'setup' && tab !== 'cash' && (
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 14 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <Segmented value={period} onChange={setPeriod}
                  options={[['today', t('g4.acc.tabToday', lang)], ['month', t('g4.acc.tabMonth', lang)], ['all', t('g4.acc.tabAll', lang)]]} />
              </div>
              <select value={clinicFilter} onChange={e => setClinicFilter(e.target.value)} aria-label={t('g8.common.clinicFilter', lang)} style={{
                flexShrink: 0, maxWidth: '42%', height: 38, padding: '0 8px', borderRadius: 10, fontSize: 12, fontWeight: 700,
                background: C.card, color: clinicFilter ? C.teal : C.muted, border: `1px solid ${clinicFilter ? C.teal : C.border}`
              }}>
                {CLINIC_FILTERS.map(c => <option key={c.v} value={c.v}>{c.v === '' ? '🏥 ' : '📍 '}{tv(c.l)}</option>)}
              </select>
            </div>
          )}
          {tab === 'overview' && <Overview state={state} filters={filters} />}
          {tab === 'expenses' && <Expenses state={state} filters={filters} session={session} run={run} notify={notify} />}
          {tab === 'doctors' && <Doctors state={state} doctors={doctors} session={session} run={run} notify={notify} />}
          {tab === 'cash' && <Cash state={state} session={session} run={run} notify={notify} />}
          {tab === 'setup' && <Setup state={state} data={data} session={session} run={run} notify={notify} />}
        </>
      )}
      {msg && <Modal title={t('g8.common.error', lang)} onClose={() => setMsg(null)}><div style={{ color: C.text, fontSize: 13, lineHeight: 1.7 }}>{msg}</div></Modal>}
    </div>
  );
}
