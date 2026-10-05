import React, { useEffect, useState } from 'react';
import {
  filterPeriodVisits, filterPeriodExpenses, computeRevenue, computeTotalExpenses,
  periodLabel, buildClinicComparison, buildMissingRecurringExpenseEntries, reportDateLabel
} from '../modules/accounting/model.js';
import { Modal, Confirm, Btn } from '../components/common.jsx';
import { ExpenseForm, RecurringExpenseForm } from '../components/forms/index.js';
import { C } from '../modules/theme/index.js';
import { Field, inp } from '../modules/ui/atoms.jsx';
import { clinicLabel, localISO, CLINICS, CLINIC_FILTERS, EXP_CATS } from '../modules/constants/index.js';
import { t, useLang, dirOf } from '../modules/i18n/index.js';
import { tv } from '../modules/i18n/tv.js';
import { printDoc, getAccountingReportHTML } from '../modules/print/index.js';

export default function Accounting({ visits, expenses, setExpenses, recurringExpenses, setRecurringExpenses, doctors, clinic }) {
  const lang = useLang();
  const [period, setPeriod] = useState('month');
  const [clinicFilter, setClinicFilter] = useState('');
  const [modal, setModal] = useState(null);
  const [delId, setDelId] = useState(null);
  const [recModal, setRecModal] = useState(null);
  const [delRecId, setDelRecId] = useState(null);

  const cur = t('g4.common.currency', lang);
  // The auto-created recurring-expense note is stored in Arabic; show its suffix in the current language.
  const noteAr = t('g4.acc.recurringNote', 'ar');
  const showNotes = n => tv(String(n).split(noteAr).join(tv(noteAr)));
  const todayStr = localISO();
  const monthStr = todayStr.slice(0, 7);
  const primary = doctors.find(d => d.isPrimary) || doctors[0] || {};

  useEffect(() => {
    const newOnes = buildMissingRecurringExpenseEntries(recurringExpenses, expenses, { monthStr, todayStr });
    if (newOnes.length > 0) setExpenses([...expenses, ...newOnes]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [monthStr]);

  const ctx = { period, today: todayStr, month: monthStr, clinicFilter };
  const periodVisits = filterPeriodVisits(visits, ctx);
  const periodExpenses = filterPeriodExpenses(expenses, ctx);
  const revenue = computeRevenue(periodVisits);
  const totalExp = computeTotalExpenses(periodExpenses);
  const net = revenue - totalExp;
  const label = periodLabel(period);
  const clinicComparison = buildClinicComparison(visits, expenses, CLINICS, { period, today: todayStr, month: monthStr });

  const addExp = f => setExpenses([...expenses, f]);
  const editExp = f => setExpenses(expenses.map(e => (e.id === f.id ? f : e)));
  const delExp = id => setExpenses(expenses.filter(e => e.id !== id));
  const addRec = f => setRecurringExpenses([...recurringExpenses, f]);
  const editRec = f => setRecurringExpenses(recurringExpenses.map(r => (r.id === f.id ? f : r)));
  const delRec = id => setRecurringExpenses(recurringExpenses.filter(r => r.id !== id));

  const doPrint = () => {
    const dateLabel = reportDateLabel(period, monthStr);
    printDoc(getAccountingReportHTML(null, null, dateLabel, revenue, periodExpenses, clinic, primary));
  };

  return (
    <div style={{ padding: '16px 16px 90px', direction: dirOf(lang) }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <div style={{ color: C.text, fontWeight: 700, fontSize: 16 }}>{t('g4.acc.title', lang)}</div>
        <div
          onClick={doPrint}
          style={{ color: C.accent, fontSize: 11, cursor: 'pointer', background: C.accent + '22', borderRadius: 8, padding: '6px 10px' }}
        >{t('g4.acc.printReport', lang)}</div>
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
        {[['today', t('g4.acc.tabToday', lang)], ['month', t('g4.acc.tabMonth', lang)], ['all', t('g4.acc.tabAll', lang)]].map(([id, lbl]) => (
          <div
            key={id}
            onClick={() => setPeriod(id)}
            style={{
              flex: 1, textAlign: 'center', padding: '8px 6px', borderRadius: 10, cursor: 'pointer',
              fontSize: 12, fontWeight: 700,
              background: period === id ? C.accent : C.card,
              color: period === id ? C.bg : C.muted,
              border: `1px solid ${period === id ? C.accent : C.border}`
            }}
          >{lbl}</div>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 6, marginBottom: 16, overflowX: 'auto', paddingBottom: 2 }}>
        {CLINIC_FILTERS.map(c => (
          <div
            key={c.v}
            onClick={() => setClinicFilter(c.v)}
            style={{
              flexShrink: 0, textAlign: 'center', padding: '6px 12px', borderRadius: 8, cursor: 'pointer',
              fontSize: 11, fontWeight: 600, whiteSpace: 'nowrap',
              background: clinicFilter === c.v ? C.teal + '33' : 'transparent',
              color: clinicFilter === c.v ? C.teal : C.muted,
              border: `1px solid ${clinicFilter === c.v ? C.teal : C.border}`
            }}
          >{c.v === '' ? '🏥 ' : '📍 '}{tv(c.l)}</div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: 14 }}>
          <div style={{ color: C.muted, fontSize: 11, marginBottom: 6 }}>{t('g4.acc.revenue', lang, { label })}</div>
          <div style={{ color: C.success, fontWeight: 800, fontSize: 20 }}>
            {revenue.toLocaleString()} <span style={{ fontSize: 11, fontWeight: 400 }}>{cur}</span>
          </div>
        </div>
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: 14 }}>
          <div style={{ color: C.muted, fontSize: 11, marginBottom: 6 }}>{t('g4.acc.expenses', lang, { label })}</div>
          <div style={{ color: C.danger, fontWeight: 800, fontSize: 20 }}>
            {totalExp.toLocaleString()} <span style={{ fontSize: 11, fontWeight: 400 }}>{cur}</span>
          </div>
        </div>
      </div>

      <div
        style={{
          background: `linear-gradient(135deg,${net >= 0 ? C.success : C.danger}22,${C.card})`,
          border: `1px solid ${net >= 0 ? C.success : C.danger}44`,
          borderRadius: 14, padding: 16, marginBottom: 20, textAlign: 'center'
        }}
      >
        <div style={{ color: C.muted, fontSize: 12, marginBottom: 6 }}>{t('g4.acc.net', lang, { label })}</div>
        <div style={{ color: net >= 0 ? C.success : C.danger, fontWeight: 800, fontSize: 26 }}>{net.toLocaleString()} {cur}</div>
      </div>

      <div style={{ color: C.text, fontWeight: 700, fontSize: 13, marginBottom: 10 }}>{t('g4.acc.compare', lang, { label })}</div>
      {clinicComparison.map(({ clinic: c, revenue: rev, expense: exp, net: cNet }) => (
        <div key={c.v} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: '10px 14px', marginBottom: 8 }}>
          <div style={{ color: C.text, fontWeight: 700, fontSize: 12, marginBottom: 6 }}>📍 {tv(c.l)}</div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11 }}>
            <span style={{ color: C.success }}>{t('g4.acc.cmpRevenue', lang, { n: rev.toLocaleString() })}</span>
            <span style={{ color: C.danger }}>{t('g4.acc.cmpExpense', lang, { n: exp.toLocaleString() })}</span>
            <span style={{ color: cNet >= 0 ? C.success : C.danger, fontWeight: 700 }}>{t('g4.acc.cmpNet', lang, { n: cNet.toLocaleString() })}</span>
          </div>
        </div>
      ))}
      <div style={{ color: C.muted, fontSize: 10, marginBottom: 16 }}>{t('g4.acc.noClinicNote', lang)}</div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <div style={{ color: C.text, fontWeight: 700, fontSize: 13 }}>{t('g4.acc.recurringTitle', lang, { n: (recurringExpenses || []).length })}</div>
        <Btn small color={C.purple} onClick={() => setRecModal('add')}>{t('g4.acc.add', lang)}</Btn>
      </div>
      {(recurringExpenses || []).length === 0 && (
        <div style={{ color: C.muted, fontSize: 12, textAlign: 'center', padding: 16, background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, marginBottom: 16 }}>
          {t('g4.acc.noRecurring', lang)}
        </div>
      )}
      {(recurringExpenses || []).map(r => (
        <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', background: C.card, border: `1px solid ${C.purple}33`, borderRadius: 12, marginBottom: 6 }}>
          <div style={{ flex: 1 }}>
            <div style={{ color: C.text, fontSize: 12, fontWeight: 600 }}>{tv(r.category)}{r.clinic ? ' · ' + tv(clinicLabel(r.clinic)) : ''}</div>
            {r.notes && <div dir="auto" style={{ color: C.muted, fontSize: 10 }}>{showNotes(r.notes)}</div>}
          </div>
          <div style={{ color: C.purple, fontWeight: 700, fontSize: 13 }}>{Number(r.amount || 0).toLocaleString()} {t('g4.acc.perMonth', lang)}</div>
          <div onClick={() => setRecModal({ edit: r })} style={{ background: C.accent + '22', borderRadius: 8, padding: '5px 8px', color: C.accent, fontSize: 11, cursor: 'pointer' }}>✏</div>
          <div onClick={() => setDelRecId(r.id)} style={{ background: C.danger + '22', borderRadius: 8, padding: '5px 8px', color: C.danger, fontSize: 11, cursor: 'pointer' }}>🗑</div>
        </div>
      ))}

      <div style={{ marginBottom: 16 }} />

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <div style={{ color: C.text, fontWeight: 700, fontSize: 13 }}>{t('g4.acc.ledger', lang, { n: periodExpenses.length })}</div>
        <Btn small color={C.danger} onClick={() => setModal('add')}>{t('g4.acc.addExpense', lang)}</Btn>
      </div>
      {periodExpenses.length === 0 && (
        <div style={{ color: C.muted, fontSize: 12, textAlign: 'center', padding: 24, background: C.card, border: `1px solid ${C.border}`, borderRadius: 14 }}>
          {t('g4.acc.noExpenses', lang)}
        </div>
      )}
      {periodExpenses.map(e => {
        const cat = EXP_CATS.find(c => c[0] === e.category);
        return (
          <div key={e.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px', background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, marginBottom: 8 }}>
            <div style={{ width: 36, height: 36, borderRadius: 10, background: C.danger + '22', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16 }}>
              {(cat && cat[1]) || '📦'}
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ color: C.text, fontSize: 13, fontWeight: 600 }}>{tv(e.category)}{e.clinic ? ' · ' + tv(clinicLabel(e.clinic)) : ''}</div>
              <div style={{ color: C.muted, fontSize: 11 }}>{e.date}{e.notes ? ` · ${showNotes(e.notes)}` : ''}</div>
            </div>
            <div style={{ color: C.danger, fontWeight: 800, fontSize: 14 }}>{Number(e.amount || 0).toLocaleString()} {cur}</div>
            <div onClick={() => setModal({ edit: e })} style={{ background: C.accent + '22', borderRadius: 8, padding: '5px 8px', color: C.accent, fontSize: 11, cursor: 'pointer' }}>✏</div>
            <div onClick={() => setDelId(e.id)} style={{ background: C.danger + '22', borderRadius: 8, padding: '5px 8px', color: C.danger, fontSize: 11, cursor: 'pointer' }}>🗑</div>
          </div>
        );
      })}

      {modal === 'add' && (
        <Modal title={t('g4.acc.addExpTitle', lang)} onClose={() => setModal(null)}>
          <ExpenseForm onSave={f => { addExp(f); setModal(null); }} onClose={() => setModal(null)} />
        </Modal>
      )}
      {modal && modal.edit && (
        <Modal title={t('g4.acc.editExpTitle', lang)} onClose={() => setModal(null)}>
          <ExpenseForm initial={modal.edit} onSave={f => { editExp(f); setModal(null); }} onClose={() => setModal(null)} />
        </Modal>
      )}
      {delId && (
        <Confirm msg={t('g4.acc.delExpConfirm', lang)} onOk={() => { delExp(delId); setDelId(null); }} onNo={() => setDelId(null)} />
      )}
      {recModal === 'add' && (
        <Modal title={t('g4.acc.addRecTitle', lang)} onClose={() => setRecModal(null)}>
          <RecurringExpenseForm onSave={f => { addRec(f); setRecModal(null); }} onClose={() => setRecModal(null)} />
        </Modal>
      )}
      {recModal && recModal.edit && (
        <Modal title={t('g4.acc.editRecTitle', lang)} onClose={() => setRecModal(null)}>
          <RecurringExpenseForm initial={recModal.edit} onSave={f => { editRec(f); setRecModal(null); }} onClose={() => setRecModal(null)} />
        </Modal>
      )}
      {delRecId && (
        <Confirm
          msg={t('g4.acc.delRecConfirm', lang)}
          onOk={() => { delRec(delRecId); setDelRecId(null); }}
          onNo={() => setDelRecId(null)}
        />
      )}
    </div>
  );
}
