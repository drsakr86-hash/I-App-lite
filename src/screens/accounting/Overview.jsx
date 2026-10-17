import React from 'react';
import { C } from '../../modules/theme/index.js';
import { t, useLang } from '../../modules/i18n/index.js';
import { tv } from '../../modules/i18n/tv.js';
import { clinicLabel } from '../../modules/constants/index.js';
import { dashboard, revenueByDoctor, revenueByService, revenueByClinic, collectionsByMethod, expensesByCategory, receivablesList } from '../../modules/finance/reports.js';
import { Money, Card, Empty, RowList, FoldList } from './parts.jsx';

const Stat = ({ label, minor, color }) => (
  <Card style={{ marginBottom: 0 }}>
    <div style={{ color: C.muted, fontSize: 11, marginBottom: 4 }}>{label}</div>
    <Money minor={minor} color={color} size={19} />
  </Card>
);

export default function Overview({ state, filters }) {
  const lang = useLang();
  const d = dashboard(state, filters);
  const rec = receivablesList(state, filters);
  const more = n => t('g8.common.showAll', lang, { n });
  const less = t('g8.common.showLess', lang);
  const body = (rows, label, color) => <RowList bare rows={rows.map(r => ({ ...r, label: label(r.key) }))} color={color} moreLabel={more(rows.length)} lessLabel={less} />;
  const byMethod = collectionsByMethod(state, filters);
  const byDoctor = revenueByDoctor(state, filters);
  const byService = revenueByService(state, filters);
  const byClinic = revenueByClinic(state, filters);
  const byCategory = expensesByCategory(state, filters);
  // One collapsed line per group; groups with no data are left out.
  const groups = [
    [rec.length > 0, 'rec', t('g8.ov.receivablesList', lang, { n: rec.length }).replace(/\s*\(\d+\)\s*$/, ''), rec.length,
      <RowList bare color={C.gold} rows={rec.map(r => ({ key: r.charge.id, minor: r.outstanding, label: `${r.charge.service ? tv(r.charge.service) : '—'} · ${r.charge.serviceDate}${r.charge.doctor ? ' · ' + tv(r.charge.doctor) : ''}` }))} moreLabel={more(rec.length)} lessLabel={less} />],
    [byMethod.length > 0, 'method', t('g8.ov.byMethod', lang), byMethod.length, body(byMethod, k => t('g8.method.' + k, lang), C.success)],
    [byDoctor.length > 0, 'doctor', t('g8.ov.byDoctor', lang), byDoctor.length, body(byDoctor, k => tv(k))],
    [byService.length > 0, 'service', t('g8.ov.byService', lang), byService.length, body(byService, k => tv(k))],
    [byClinic.length > 0, 'clinic', t('g8.ov.byClinic', lang), byClinic.length, body(byClinic, k => tv(clinicLabel(k) || k))],
    [byCategory.length > 0, 'cat', t('g8.ov.byCategory', lang), byCategory.length, body(byCategory, k => tv(k), C.danger)]
  ].filter(g => g[0]).map(([, id, title, count, bodyEl]) => ({ id, title, count, body: bodyEl }));

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
        <Stat label={t('g8.ov.collections', lang)} minor={d.collections} color={C.success} />
        <Stat label={t('g8.ov.expenses', lang)} minor={d.expenses} color={C.danger} />
        <Stat label={t('g8.ov.revenue', lang)} minor={d.revenue} color={C.accent} />
        <Stat label={t('g8.ov.receivables', lang)} minor={d.receivables} color={C.gold} />
      </div>
      <Card style={{ textAlign: 'center', padding: 14, marginBottom: 16 }}>
        <div style={{ color: C.muted, fontSize: 12, marginBottom: 4 }}>{t('g8.ov.net', lang)}</div>
        <Money minor={d.net} color={d.net >= 0 ? C.success : C.danger} size={24} />
        <div style={{ color: C.muted, fontSize: 11, marginTop: 6 }}>{t('g8.ov.cashBalance', lang)}: <Money minor={d.cashBalance} size={12} />
          {d.legacyBalance !== 0 && <span> · {t('g8.ov.legacyBalance', lang)}: <Money minor={d.legacyBalance} size={11} bold={false} /></span>}
        </div>
      </Card>
      {groups.length > 0 ? <FoldList groups={groups} /> : <Empty text={t('g8.common.none', lang)} />}
    </div>
  );
}
