import React from 'react';
import { C } from '../../modules/theme/index.js';
import { THRESHOLDS, describeChange, METRIC_LABEL } from '../../modules/patient-file/longitudinal.js';
import { t, useLang } from '../../modules/i18n/index.js';
import { tv } from '../../modules/i18n/tv.js';

// Longitudinal comparison. Everything shown is a recorded value from ctx.longitudinal
// (see modules/patient-file/longitudinal.js); with fewer than two dated points a metric shows
// an "insufficient data" message instead of a chart. Charts are plain SVG (no library), use
// different marker shapes per eye (not colour alone) and each has a table fallback below.

const W = 320;
const H = 150;
const PAD = { l: 38, r: 10, t: 12, b: 24 };
const dayNum = d => Math.round(Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10)) / 86400000);

const STATUS_CLASS = { improving: 'ds-badge--ok', worsening: 'ds-badge--bad', mixed: 'ds-badge--warn', stable: 'ds-badge--info', insufficient: 'ds-badge--mute' };
const statusOf = (status, lang) => {
  const k = STATUS_CLASS[status] ? status : 'insufficient';
  return [STATUS_CLASS[k], t('g1.cmp.st.' + k, lang), t('g1.cmp.stDesc.' + k, lang)];
};
const RESP_KEYS = { responding: 'g1.cmp.resp.responding', worsening: 'g1.cmp.resp.worsening', mixed: 'g1.cmp.resp.mixed', 'no-change': 'g1.cmp.resp.noChange', insufficient: 'g1.cmp.resp.insufficient' };

function Marker({ eye, x, y, color }) {
  return eye === 'od'
    ? <circle cx={x} cy={y} r="3.5" fill={color} stroke={C.card} strokeWidth="1" />
    : <rect x={x - 3.5} y={y - 3.5} width="7" height="7" fill={color} stroke={C.card} strokeWidth="1" />;
}

function Chart({ title, unit, series, injections, flip, refLine }) {
  const lang = useLang();
  const all = ['od', 'os'].flatMap(eye => (series[eye] || []).map(p => ({ ...p, eye }))).filter(p => p.value != null && p.date);
  const enough = ['od', 'os'].some(eye => (series[eye] || []).filter(p => p.value != null).length >= 2);
  if (!enough) {
    return (
      <div className="ds-card ds-card--flat">
        <h3 className="ds-h">{title}</h3>
        <div className="ds-empty" role="note">{t('cmp.insufficient', lang)}</div>
      </div>
    );
  }
  const xs = all.map(p => dayNum(p.date));
  let x0 = Math.min(...xs); let x1 = Math.max(...xs);
  if (x1 === x0) x1 = x0 + 1;
  const vals = all.map(p => p.value).concat(refLine != null ? [refLine] : []);
  let lo = Math.min(...vals); let hi = Math.max(...vals);
  if (lo === hi) { lo -= 1; hi += 1; }
  const padV = (hi - lo) * 0.1; lo -= padV; hi += padV;
  const X = d => PAD.l + ((dayNum(d) - x0) / (x1 - x0)) * (W - PAD.l - PAD.r);
  const Y = v => { const f = (v - lo) / (hi - lo); return PAD.t + (flip ? f : 1 - f) * (H - PAD.t - PAD.b); };
  const colors = { od: C.accent, os: C.gold };
  const injDates = [...new Set((injections || []).map(i => i.date).filter(d => d && dayNum(d) >= x0 && dayNum(d) <= x1))];
  const first = all.reduce((a, p) => (p.date < a ? p.date : a), all[0].date);
  const last = all.reduce((a, p) => (p.date > a ? p.date : a), all[0].date);
  return (
    <div className="ds-card ds-card--flat">
      <h3 className="ds-h">{title}{unit ? <span className="ds-sub"> ({unit})</span> : null}</h3>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={t('g1.cmp.chartAria', lang, { title, n: all.length, first, last })} style={{ width: '100%', height: 'auto', display: 'block' }} direction="ltr">
        <line x1={PAD.l} y1={H - PAD.b} x2={W - PAD.r} y2={H - PAD.b} stroke={C.border} />
        <line x1={PAD.l} y1={PAD.t} x2={PAD.l} y2={H - PAD.b} stroke={C.border} />
        <text x={PAD.l - 4} y={PAD.t + 4} fontSize="9" fill={C.muted} textAnchor="end">{(flip ? lo : hi).toFixed(flip ? 1 : 0)}</text>
        <text x={PAD.l - 4} y={H - PAD.b} fontSize="9" fill={C.muted} textAnchor="end">{(flip ? hi : lo).toFixed(flip ? 1 : 0)}</text>
        <text x={PAD.l} y={H - 6} fontSize="9" fill={C.muted} textAnchor="start">{first}</text>
        <text x={W - PAD.r} y={H - 6} fontSize="9" fill={C.muted} textAnchor="end">{last}</text>
        {refLine != null && <line x1={PAD.l} x2={W - PAD.r} y1={Y(refLine)} y2={Y(refLine)} stroke={C.danger} strokeDasharray="2 3" opacity="0.7" />}
        {injDates.map(d => (
          <g key={d}><line x1={X(d)} x2={X(d)} y1={PAD.t} y2={H - PAD.b} stroke={C.purple} strokeDasharray="3 3" opacity="0.8" /><text x={X(d)} y={PAD.t - 2} fontSize="8" fill={C.purple} textAnchor="middle">💉</text></g>
        ))}
        {['od', 'os'].map(eye => {
          const pts = (series[eye] || []).filter(p => p.value != null && p.date);
          if (!pts.length) return null;
          return (
            <g key={eye}>
              {pts.length > 1 && <polyline fill="none" stroke={colors[eye]} strokeWidth="1.8" strokeDasharray={eye === 'os' ? '5 3' : undefined} points={pts.map(p => `${X(p.date)},${Y(p.value)}`).join(' ')} />}
              {pts.map(p => <Marker key={p.date + p.examId} eye={eye} x={X(p.date)} y={Y(p.value)} color={colors[eye]} />)}
            </g>
          );
        })}
      </svg>
      <div className="ds-sub" style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <span>● OD ({t('g1.cmp.solid', lang)})</span><span>■ OS ({t('g1.cmp.dashed', lang)})</span>{injDates.length > 0 && <span style={{ color: C.purple }}>┆ 💉 {t('g1.cmp.injection', lang)}</span>}
        {refLine != null && <span style={{ color: C.danger }}>┄ {t('g1.cmp.highLimit', lang)} {refLine}</span>}
        {flip && <span>{t('g1.cmp.higherBetter', lang)}</span>}
      </div>
    </div>
  );
}

const cell = v => (v == null || v === '' ? t('common.notRecorded') : v);

export default function CompareTab({ ctx }) {
  const lang = useLang();
  const L = ctx.longitudinal;
  if (!L) return null;
  const st = statusOf(L.status, lang);
  const allInj = [...L.injections.od, ...L.injections.os];
  const injByDate = [...new Map(allInj.map(i => [i.date + i.drug, i])).values()];
  const hasAny = L.rows.length > 0 || injByDate.length > 0;

  if (!hasAny) {
    return (
      <div>
        <h2 className="ds-h">📊 {t('cmp.title', lang)}</h2>
        <div className="ds-empty" role="note">{t('cmp.empty', lang)}</div>
      </div>
    );
  }
  const vaSeries = { od: L.series.va.od, os: L.series.va.os };
  const treatmentRows = L.treatment || [];
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 6 }}>
        <h2 className="ds-h" style={{ margin: 0 }}>📊 {t('cmp.title', lang)}</h2>
        <span className={'ds-badge ' + st[0]}>{st[1]}</span>
      </div>
      <p className="ds-sub" style={{ marginBottom: 10 }}>{st[2]}. ({t('g1.cmp.examsN', lang, { n: L.counts.exams })}{L.undated ? t('g1.cmp.undated', lang, { n: L.undated }) : ''})</p>

      {L.changes.length > 0 && (
        <div className="ds-card ds-card--flat" style={{ marginBottom: 12 }}>
          <h3 className="ds-h">{t('cmp.changed', lang)}</h3>
          <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
            {L.changes.map(c => (
              <li key={c.metric + c.eye} style={{ fontSize: 13, color: C.text }}>
                <span className={'ds-badge ' + (c.favorable === true ? 'ds-badge--ok' : c.favorable === false ? 'ds-badge--bad' : 'ds-badge--mute')} style={{ marginInlineEnd: 8 }}>
                  {c.favorable === true ? t('trend.better', lang) : c.favorable === false ? t('trend.worse', lang) : c.significant ? t('trend.changed', lang) : t('trend.nosig', lang)}
                </span>
                <strong>{METRIC_LABEL[c.metric]} {c.eye.toUpperCase()}</strong> — {describeChange(c, lang)}{c.days != null ? ' ' + t('g1.cmp.withinDays', lang, { n: c.days }) : ''}
              </li>
            ))}
          </ul>
        </div>
      )}

      {treatmentRows.length > 0 && (
        <div className="ds-card ds-card--flat" style={{ marginBottom: 12 }}>
          <h3 className="ds-h">{t('cmp.works', lang)}</h3>
          <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
            {treatmentRows.map(tr => (
              <li key={tr.eye} style={{ fontSize: 13, color: C.text }}>
                <strong>{tr.eye.toUpperCase()}</strong> — {t(RESP_KEYS[tr.status] || RESP_KEYS.insufficient, lang)} ({t('g1.cmp.injectionsN', lang, { n: tr.injections })}{tr.drug ? ' · ' + tv(tr.drug) : ''}{lang === 'en' ? ', ' : '، '}{tr.firstInjection} {t('g1.lg.arrow', lang)} {tr.lastInjection})
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="cmp-charts" style={{ marginBottom: 12 }}>
        <Chart title={t('g1.cmp.chart.va', lang)} unit={t('g1.cmp.chart.vaUnit', lang)} series={vaSeries} injections={injByDate} flip />
        <Chart title={t('g1.cmp.chart.iop', lang)} unit="mmHg" series={L.series.iop} injections={injByDate} refLine={THRESHOLDS.iopHigh} />
        <Chart title={t('g1.cmp.chart.cmt', lang)} unit="µm" series={L.series.cmt} injections={injByDate} />
        <Chart title={t('g1.cmp.chart.cd', lang)} series={L.series.cd} injections={[]} />
        <Chart title={t('g1.cmp.chart.md', lang)} unit="dB" series={L.series.vfMd} injections={[]} />
      </div>

      <div className="ds-card ds-card--flat" style={{ marginBottom: 12 }}>
        <h3 className="ds-h">{t('cmp.injections', lang)}</h3>
        {injByDate.length === 0 ? <div className="ds-empty">{t('g1.cmp.noInjections', lang)}</div> : (
          <div className="cmp-scroll">
            <table className="cmp-table">
              <caption className="ds-sub" style={{ textAlign: 'start' }}>{t('g1.cmp.injCaption', lang)}</caption>
              <thead><tr><th scope="col">{t('g1.cmp.eye', lang)}</th><th scope="col">{t('common.date', lang)}</th><th scope="col">{t('g1.cmp.drug', lang)}</th><th scope="col">{t('g1.cmp.dose', lang)}</th><th scope="col">{t('g1.cmp.interval', lang)}</th></tr></thead>
              <tbody>
                {['od', 'os'].flatMap(eye => L.injections[eye].map((i, idx, arr) => {
                  const prev = arr[idx - 1];
                  const iv = L.injectionStats[eye].intervals.find(x => x.to === i.date && (!prev || x.from === prev.date));
                  return (
                    <tr key={eye + i.id + i.date}>
                      <td>{eye.toUpperCase()}</td><td>{i.date}</td><td>{cell(tv(i.drug))}</td><td>{cell(i.doseNo)}</td><td>{iv ? iv.days : idx === 0 ? '—' : t('g1.cmp.notComputed', lang)}</td>
                    </tr>
                  );
                }))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="ds-card ds-card--flat" style={{ marginBottom: 12 }}>
        <h3 className="ds-h">{t('cmp.table', lang)}</h3>
        <div className="cmp-scroll">
          <table className="cmp-table">
            <caption className="ds-sub" style={{ textAlign: 'start' }}>{t('g1.cmp.tableCaption', lang)}</caption>
            <thead>
              <tr>
                <th scope="col">{t('common.date', lang)}</th>
                <th scope="col">VA OD</th><th scope="col">VA OS</th>
                <th scope="col">IOP OD</th><th scope="col">IOP OS</th>
                <th scope="col">CMT OD</th><th scope="col">CMT OS</th>
                <th scope="col">C/D OD</th><th scope="col">C/D OS</th>
                <th scope="col">MD OD</th><th scope="col">MD OS</th>
              </tr>
            </thead>
            <tbody>
              {L.rows.map(r => (
                <tr key={r.examId || r.date}>
                  <td>{r.date}</td>
                  <td>{cell(r.va_od)}</td><td>{cell(r.va_os)}</td>
                  <td>{cell(r.iop_od)}</td><td>{cell(r.iop_os)}</td>
                  <td>{cell(r.cmt_od)}</td><td>{cell(r.cmt_os)}</td>
                  <td>{cell(r.cd_od)}</td><td>{cell(r.cd_os)}</td>
                  <td>{cell(r.md_od)}</td><td>{cell(r.md_os)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <p className="ds-sub" role="note">
        {t('g1.cmp.footnote', lang, { va: THRESHOLDS.va, iop: THRESHOLDS.iop, iopHigh: THRESHOLDS.iopHigh, cmt: THRESHOLDS.cmtPct, cd: THRESHOLDS.cd, md: THRESHOLDS.vfMd })}
      </p>
    </div>
  );
}
