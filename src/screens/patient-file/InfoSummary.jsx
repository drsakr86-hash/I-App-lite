import React from 'react';
import { C } from '../../modules/theme/index.js';
import { describeChange } from '../../modules/patient-file/longitudinal.js';
import { describeChangeLang } from '../../modules/patient-file/eye-report.js';
import { tv } from '../../modules/i18n/tv.js';
import { t, useLang } from '../../modules/i18n/index.js';
import { translateTerm } from '../../modules/i18n/medical-terms.js';

// Patient 360 clinical summary (top of the patient file).
// Presentational: everything comes from ctx.summary (built by clinical-summary.js).
// A value that was never recorded prints "غير مسجل"; nothing is estimated or filled in.

const LEVEL = { danger: 'ds-alert--danger', warn: 'ds-alert--warn', info: 'ds-alert--info' };
const STATUS = {
  improving: ['ds-badge--ok', 'sum.status.improving'],
  worsening: ['ds-badge--bad', 'sum.status.worsening'],
  mixed: ['ds-badge--warn', 'sum.status.mixed'],
  stable: ['ds-badge--info', 'sum.status.stable'],
  insufficient: ['ds-badge--mute', 'sum.status.insufficient']
};

function Missing() { const lang = useLang(); return <span className="cs-missing">{t('common.notRecorded', lang)}</span>; }

function Cell({ label, children, wide }) {
  return (
    <div className="cs-cell" style={wide ? { gridColumn: '1 / -1' } : undefined}>
      <div className="cs-label">{label}</div>
      <div className="cs-val">{children}</div>
    </div>
  );
}

function Eyes({ data, render }) {
  if (!data || (!data.od && !data.os)) return <Missing />;
  return (
    <div className="cs-eyes">
      {['od', 'os'].map(eye => (
        <span key={eye} dir="ltr" style={{ display: 'inline-flex', gap: 4, alignItems: 'baseline' }}>
          <span style={{ color: C.muted, fontSize: 11 }}>{eye.toUpperCase()}</span>
          {data[eye] ? <span title={data[eye].date || ''}>{render(data[eye])}</span> : <Missing />}
        </span>
      ))}
    </div>
  );
}

const dxText = d => (d ? d.text : null);

export default function InfoSummary({ ctx }) {
  const lang = useLang();
  const tr = x => translateTerm(x, lang);
  const s = ctx.summary;
  if (!s) return null;
  const dx = s.diagnosis;
  const hasDx = dx.primary || dx.od || dx.os || dx.ou;
  const st = STATUS[s.trend.status] || STATUS.insufficient;
  const fu = s.followUp;
  const trt = s.treatment;
  const injLine = eye => (trt && trt.injections[eye]
    ? `${eye.toUpperCase()}: ${trt.injections[eye].drug || t('sum.inj', lang)} — ${t('sum.lastInj', lang)} ${trt.injections[eye].date} (${trt.injections[eye].count})`
    : null);
  const injLines = [injLine('od'), injLine('os')].filter(Boolean);

  return (
    <section className="ds-card" aria-labelledby="cs-title" style={{ marginBottom: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
        <h2 id="cs-title" className="ds-h" style={{ margin: 0 }}>🩺 {t('sum.title', lang)}</h2>
        <span className={'ds-badge ' + st[0]}>{t(st[1], lang)}</span>
      </div>

      {s.alerts.length > 0 && (
        <div role="region" aria-label={t('sum.alerts', lang)} style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 10 }}>
          {s.alerts.map(a => (
            <div key={a.id} className={'ds-alert ' + (LEVEL[a.level] || LEVEL.info)}>
              <span aria-hidden="true">{a.level === 'danger' ? '⛔' : a.level === 'warn' ? '⚠' : 'ℹ'}</span>
              <span>{a.text}</span>
            </div>
          ))}
        </div>
      )}

      <div className="cs-grid">
        <Cell label={t('sum.lastVisit', lang)}>{s.lastVisit ? <>{s.lastVisit.date}{s.lastVisit.type ? <span className="ds-sub"> · {tv(s.lastVisit.type)}</span> : null}</> : <Missing />}</Cell>
        <Cell label={t('sum.lastExam', lang)}>{s.latestExamDate || <Missing />}</Cell>
        <Cell label={t('sum.nextVisit', lang)}>
          {fu ? (
            <>
              <span style={{ color: fu.overdue ? C.danger : C.text }}>{fu.date}</span>
              <span className="ds-sub" style={{ display: 'block' }}>
                {fu.overdue ? t('sum.overdue', lang) : fu.daysUntil === 0 ? t('sum.today', lang) : t('sum.inDays', lang).replace('{n}', fu.daysUntil)}{fu.reason ? ' · ' + tv(fu.reason) : ''}
              </span>
            </>
          ) : <Missing />}
        </Cell>
        <Cell label={t('sum.pending', lang)}>
          {s.pending.length ? <>{s.pending.length}<span className="ds-sub" style={{ display: 'block' }}>{s.pending.slice(0, 2).map(p => p.tests.map(x => tv(x)).join(lang === 'en' ? ', ' : '، ')).join(' · ')}</span></> : <span className="cs-missing">{t('common.none', lang)}</span>}
        </Cell>

        <Cell label={t('sum.dx', lang)} wide>{hasDx ? (
          <>
            {dx.primary ? tr(dxText(dx.primary)) : <Missing />}
            {(dx.od || dx.os || dx.ou) && (
              <span className="ds-sub" style={{ display: 'block' }} dir="auto">
                {[dx.od && 'OD: ' + tr(dx.od.text), dx.os && 'OS: ' + tr(dx.os.text), dx.ou && 'OU: ' + tr(dx.ou.text)].filter(Boolean).join('  ·  ')}
              </span>
            )}
          </>
        ) : <Missing />}</Cell>

        <Cell label={t('sum.va', lang)}><Eyes data={s.va} render={v => v.raw} /></Cell>
        <Cell label={t('sum.iop', lang)}><Eyes data={s.iop} render={v => <span style={{ color: v.value != null && v.value > 21 ? C.gold : C.text }}>{v.raw}</span>} /></Cell>
        <Cell label={t('sum.cmt', lang)}><Eyes data={s.cmt} render={v => v.raw + ' µm'} /></Cell>
        <Cell label={t('sum.refraction', lang)}><Eyes data={s.refraction} render={v => v.raw} /></Cell>

        <Cell label={t('sum.treatment', lang)} wide>
          {trt ? (
            <>
              {trt.plan && <div dir="auto">{tv(trt.plan.text)}<span className="ds-sub"> · {t('sum.planWord', lang)} {trt.plan.date}</span></div>}
              {injLines.map(l => <div key={l} dir="auto" className="ds-sub" style={{ fontSize: 12 }}>{l}</div>)}
              {trt.rx && <div dir="auto" className="ds-sub" style={{ fontSize: 12 }}>{t('sum.lastRx', lang)} {trt.rx.date}: {tv(trt.rx.text)}</div>}
              {!trt.plan && !injLines.length && !trt.rx && trt.core && <div dir="auto">{tv(trt.core.text)}</div>}
            </>
          ) : <Missing />}
        </Cell>
      </div>

      {s.trend.status !== 'insufficient' && s.trend.changes.length > 0 && (
        <ul style={{ margin: '10px 0 0', padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 4 }}>
          {s.trend.changes.slice(0, 4).map(c => (
            <li key={c.metric + c.eye} className="ds-sub" style={{ fontSize: 12 }}>
              <strong style={{ color: C.text }}>{t('metric.' + c.metric, lang)} {c.eye.toUpperCase()}</strong> — {lang === 'en' ? describeChangeLang(c, 'en') : describeChange(c)}
            </li>
          ))}
        </ul>
      )}
      <div className="ds-sub" style={{ marginTop: 8 }}>
        {t('sum.note', lang)}
      </div>
    </section>
  );
}
