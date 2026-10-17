import React from 'react';
import { C } from '../../modules/theme/index.js';
import { t, useLang } from '../../modules/i18n/index.js';
import { tv } from '../../modules/i18n/tv.js';
import { clinicLabel } from '../../modules/constants/index.js';
import { dashboard, revenueByDoctor, revenueByService, revenueByClinic, collectionsByMethod, expensesByCategory, receivablesList } from '../../modules/finance/reports.js';
import { Money, Section, Empty, RowList } from './parts.jsx';

// The four headline numbers share one card (2x2, hairline dividers) instead of four separate boxes.
const Stat = ({ label, minor, color, border }) => (
  <div style={{ padding: '12px 14px', ...border }}>
    <div style={{ color: C.muted, fontSize: 11, marginBottom: 4 }}>{label}</div>
    <Money minor={minor} color={color} size={18} />
  </div>
);

// A breakdown section that disappears when it has no rows (no more stacks of "no data" boxes).
const Breakdown = ({ title, rows, label, color }) => {
  const lang = useLang();
  if (rows.length === 0) return null;
  return (
    <Section title={title}>
      <RowList rows={rows.map(r => ({ ...r, label: label ? label(r.key) : r.key }))} color={color}
        moreLabel={t('g8.common.showAll', lang, { n: rows.length })} lessLabel={t('g8.common.showLess', lang)} />
    </Section>
  );
};

export default function Overview({ state, filters }) {
  const lang = useLang();
  const d = dashboard(state, filters);
  const rec = receivablesList(state, filters);
  const line = `1px solid ${C.border}`;
  const byMethod = collectionsByMethod(state, filters);
  const byDoctor = revenueByDoctor(state, filters);
  const byService = revenueByService(state, filters);
  const byClinic = revenueByClinic(state, filters);
  const byCategory = expensesByCategory(state, filters);
  const nothing = [byMethod, byDoctor, byService, byClinic, byCategory].every(r => r.length === 0) && rec.length === 0;
  return (
    <div>
      <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, textAlign: 'center', padding: '16px 14px', marginBottom: 10 }}>
        <div style={{ color: C.muted, fontSize: 12, marginBottom: 4 }}>{t('g8.ov.net', lang)}</div>
        <Money minor={d.net} color={d.net >= 0 ? C.success : C.danger} size={28} />
        <div style={{ color: C.muted, fontSize: 11, marginTop: 8 }}>
          {t('g8.ov.cashBalance', lang)}: <Money minor={d.cashBalance} size={12} />
          {d.legacyBalance !== 0 && <span> · {t('g8.ov.legacyBalance', lang)}: <Money minor={d.legacyBalance} size={11} bold={false} /></span>}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, overflow: 'hidden', marginBottom: 20 }}>
        <Stat label={t('g8.ov.collections', lang)} minor={d.collections} color={C.success} border={{ borderBottom: line, borderInlineEnd: line }} />
        <Stat label={t('g8.ov.expenses', lang)} minor={d.expenses} color={C.danger} border={{ borderBottom: line }} />
        <Stat label={t('g8.ov.revenue', lang)} minor={d.revenue} color={C.accent} border={{ borderInlineEnd: line }} />
        <Stat label={t('g8.ov.receivables', lang)} minor={d.receivables} color={C.gold} />
      </div>

      <Breakdown title={t('g8.ov.byMethod', lang)} rows={byMethod} label={k => t('g8.method.' + k, lang)} color={C.success} />
      <Breakdown title={t('g8.ov.byDoctor', lang)} rows={byDoctor} label={k => tv(k)} />
      <Breakdown title={t('g8.ov.byService', lang)} rows={byService} label={k => tv(k)} />
      <Breakdown title={t('g8.ov.byClinic', lang)} rows={byClinic} label={k => tv(clinicLabel(k) || k)} />
      <Breakdown title={t('g8.ov.byCategory', lang)} rows={byCategory} label={k => tv(k)} color={C.danger} />

      {rec.length > 0 && (
        <Section title={t('g8.ov.receivablesList', lang, { n: rec.length })}>
          <RowList color={C.gold} limit={5}
            rows={rec.map(r => ({
              key: r.charge.id, minor: r.outstanding,
              label: `${r.charge.service ? tv(r.charge.service) : '—'} · ${r.charge.serviceDate}${r.charge.doctor ? ' · ' + tv(r.charge.doctor) : ''}`
            }))}
            moreLabel={t('g8.common.showAll', lang, { n: rec.length })} lessLabel={t('g8.common.showLess', lang)} />
        </Section>
      )}
      {nothing && <Empty text={t('g8.common.none', lang)} />}
    </div>
  );
}
