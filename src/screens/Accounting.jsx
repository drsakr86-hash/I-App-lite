import React, { useState } from 'react';
import { C } from '../modules/theme/index.js';
import { Chip } from './accounting/parts.jsx';
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
      <div style={{ color: C.text, fontWeight: 700, fontSize: 16, marginBottom: 12 }}>{t('g4.acc.title', lang)}</div>

      {status.loading && <div style={{ color: C.muted, fontSize: 12, textAlign: 'center', padding: 20 }}>{t('g8.common.loading', lang)}</div>}
      {!status.loading && status.offline && <div style={{ color: C.gold, fontSize: 11, marginBottom: 8 }}>{t('g8.common.offline', lang)}</div>}

      {!status.loading && !ready && (
        <MigrationPanel state={state} data={data} session={session} run={run} notify={notify} compact />
      )}

      {!status.loading && ready && (
        <>
          <div style={{ display: 'flex', gap: 6, marginBottom: 10, overflowX: 'auto' }}>
            {tabs.map(([id, k]) => <Chip key={id} active={tab === id} onClick={() => setTab(id)}>{t(k, lang)}</Chip>)}
          </div>
          {tab !== 'setup' && tab !== 'cash' && (
            <>
              <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                {[['today', 'g4.acc.tabToday'], ['month', 'g4.acc.tabMonth'], ['all', 'g4.acc.tabAll']].map(([id, k]) => (
                  <div key={id} onClick={() => setPeriod(id)} style={{
                    flex: 1, textAlign: 'center', padding: '8px 6px', borderRadius: 10, cursor: 'pointer', fontSize: 12, fontWeight: 700,
                    background: period === id ? C.accent : C.card, color: period === id ? C.bg : C.muted, border: `1px solid ${period === id ? C.accent : C.border}`
                  }}>{t(k, lang)}</div>
                ))}
              </div>
              <div style={{ display: 'flex', gap: 6, marginBottom: 14, overflowX: 'auto', paddingBottom: 2 }}>
                {CLINIC_FILTERS.map(c => <Chip key={c.v} color={C.teal} active={clinicFilter === c.v} onClick={() => setClinicFilter(c.v)}>{c.v === '' ? '🏥 ' : '📍 '}{tv(c.l)}</Chip>)}
              </div>
            </>
          )}
          {tab === 'overview' && <Overview state={state} filters={filters} onPrint={doPrint} />}
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
