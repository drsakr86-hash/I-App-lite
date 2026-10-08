import React from 'react';
import { C } from '../../modules/theme/index.js';
import { t, useLang } from '../../modules/i18n/index.js';
import { tv } from '../../modules/i18n/tv.js';
import { clinicLabel } from '../../modules/constants/index.js';
import { dashboard, revenueByDoctor, revenueByService, revenueByClinic, collectionsByMethod, expensesByCategory, receivablesList } from '../../modules/finance/reports.js';
import { Money, Card, Section, Empty } from './parts.jsx';

const Stat = ({ label, minor, color }) => (
  <Card style={{ marginBottom: 0 }}>
    <div style={{ color: C.muted, fontSize: 11, marginBottom: 4 }}>{label}</div>
    <Money minor={minor} color={color} size={19} />
  </Card>
);

const Breakdown = ({ rows, label }) => {
  const lang = useLang();
  if (rows.length === 0) return <Empty text={t('g8.common.none', lang)} />;
  return (
    rows.slice(0, 8).map(r => (
      <Card key={r.key} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px' }}>
        <span style={{ color: C.text, fontSize: 12 }}>{label ? label(r.key) : r.key}</span>
        <Money minor={r.minor} />
      </Card>
    ))
  );
};

export default function Overview({ state, filters, onPrint }) {
  const lang = useLang();
  const d = dashboard(state, filters);
  const rec = receivablesList(state, filters);
  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
        <Stat label={t('g8.ov.collections', lang)} minor={d.collections} color={C.success} />
        <Stat label={t('g8.ov.expenses', lang)} minor={d.expenses} color={C.danger} />
        <Stat label={t('g8.ov.revenue', lang)} minor={d.revenue} color={C.accent} />
        <Stat label={t('g8.ov.receivables', lang)} minor={d.receivables} color={C.gold} />
      </div>
      <Card style={{ textAlign: 'center', padding: 14 }}>
        <div style={{ color: C.muted, fontSize: 12, marginBottom: 4 }}>{t('g8.ov.net', lang)}</div>
        <Money minor={d.net} color={d.net >= 0 ? C.success : C.danger} size={24} />
        <div style={{ color: C.muted, fontSize: 11, marginTop: 6 }}>{t('g8.ov.cashBalance', lang)}: <Money minor={d.cashBalance} size={12} /></div>
        {d.legacyBalance !== 0 && <div style={{ color: C.muted, fontSize: 10 }}>{t('g8.ov.legacyBalance', lang)}: <Money minor={d.legacyBalance} size={11} bold={false} /></div>}
      </Card>

      <Section title={t('g8.ov.byMethod', lang)}><Breakdown rows={collectionsByMethod(state, filters)} label={k => t('g8.method.' + k, lang)} /></Section>
      <Section title={t('g8.ov.byDoctor', lang)}><Breakdown rows={revenueByDoctor(state, filters)} label={k => tv(k)} /></Section>
      <Section title={t('g8.ov.byService', lang)}><Breakdown rows={revenueByService(state, filters)} label={k => tv(k)} /></Section>
      <Section title={t('g8.ov.byClinic', lang)}><Breakdown rows={revenueByClinic(state, filters)} label={k => tv(clinicLabel(k) || k)} /></Section>
      <Section title={t('g8.ov.byCategory', lang)}><Breakdown rows={expensesByCategory(state, filters)} label={k => tv(k)} /></Section>

      <Section title={t('g8.ov.receivablesList', lang, { n: rec.length })}>
        {rec.length === 0 ? <Empty text={t('g8.common.none', lang)} /> : rec.slice(0, 30).map(r => (
          <Card key={r.charge.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ color: C.text, fontSize: 12 }}>{r.charge.service ? tv(r.charge.service) : '—'} · {r.charge.serviceDate}</div>
              <div style={{ color: C.muted, fontSize: 10 }}>{r.charge.doctor ? tv(r.charge.doctor) : ''}</div>
            </div>
            <Money minor={r.outstanding} color={C.gold} />
          </Card>
        ))}
      </Section>
      <div onClick={onPrint} style={{ color: C.accent, fontSize: 12, textAlign: 'center', cursor: 'pointer', padding: 10 }}>{t('g4.acc.printReport', lang)}</div>
    </div>
  );
}
