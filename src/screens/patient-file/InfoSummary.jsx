import React from 'react';
import { C } from '../../modules/theme/index.js';
import { NOT_RECORDED } from '../../modules/patient-file/clinical-summary.js';
import { describeChange, METRIC_LABEL } from '../../modules/patient-file/longitudinal.js';

// Patient 360 clinical summary (top of the patient file).
// Presentational: everything comes from ctx.summary (built by clinical-summary.js).
// A value that was never recorded prints "غير مسجل"; nothing is estimated or filled in.

const LEVEL = { danger: 'ds-alert--danger', warn: 'ds-alert--warn', info: 'ds-alert--info' };
const STATUS = {
  improving: ['ds-badge--ok', 'تحسّن في القياسات المسجلة'],
  worsening: ['ds-badge--bad', 'تراجع في القياسات المسجلة'],
  mixed: ['ds-badge--warn', 'نتائج متباينة'],
  stable: ['ds-badge--info', 'مستقر'],
  insufficient: ['ds-badge--mute', 'بيانات غير كافية للمقارنة']
};

function Missing() { return <span className="cs-missing">{NOT_RECORDED}</span>; }

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
  const s = ctx.summary;
  if (!s) return null;
  const dx = s.diagnosis;
  const hasDx = dx.primary || dx.od || dx.os || dx.ou;
  const st = STATUS[s.trend.status] || STATUS.insufficient;
  const fu = s.followUp;
  const t = s.treatment;
  const injLine = eye => (t && t.injections[eye]
    ? `${eye.toUpperCase()}: ${t.injections[eye].drug || 'حقن'} — آخر حقنة ${t.injections[eye].date} (${t.injections[eye].count})`
    : null);
  const injLines = [injLine('od'), injLine('os')].filter(Boolean);

  return (
    <section className="ds-card" aria-labelledby="cs-title" style={{ marginBottom: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
        <h2 id="cs-title" className="ds-h" style={{ margin: 0 }}>🩺 الملخص السريري</h2>
        <span className={'ds-badge ' + st[0]}>{st[1]}</span>
      </div>

      {s.alerts.length > 0 && (
        <div role="region" aria-label="تنبيهات" style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 10 }}>
          {s.alerts.map(a => (
            <div key={a.id} className={'ds-alert ' + (LEVEL[a.level] || LEVEL.info)}>
              <span aria-hidden="true">{a.level === 'danger' ? '⛔' : a.level === 'warn' ? '⚠' : 'ℹ'}</span>
              <span>{a.text}</span>
            </div>
          ))}
        </div>
      )}

      <div className="cs-grid">
        <Cell label="آخر زيارة">{s.lastVisit ? <>{s.lastVisit.date}{s.lastVisit.type ? <span className="ds-sub"> · {s.lastVisit.type}</span> : null}</> : <Missing />}</Cell>
        <Cell label="آخر فحص">{s.latestExamDate || <Missing />}</Cell>
        <Cell label="الموعد القادم">
          {fu ? (
            <>
              <span style={{ color: fu.overdue ? C.danger : C.text }}>{fu.date}</span>
              <span className="ds-sub" style={{ display: 'block' }}>
                {fu.overdue ? 'متأخر' : fu.daysUntil === 0 ? 'اليوم' : `بعد ${fu.daysUntil} يوم`}{fu.reason ? ' · ' + fu.reason : ''}
              </span>
            </>
          ) : <Missing />}
        </Cell>
        <Cell label="فحوصات معلّقة">
          {s.pending.length ? <>{s.pending.length}<span className="ds-sub" style={{ display: 'block' }}>{s.pending.slice(0, 2).map(p => p.tests.join('، ')).join(' · ')}</span></> : <span className="cs-missing">لا يوجد</span>}
        </Cell>

        <Cell label="التشخيص الرئيسي" wide>{hasDx ? (
          <>
            {dx.primary ? dxText(dx.primary) : <Missing />}
            {(dx.od || dx.os || dx.ou) && (
              <span className="ds-sub" style={{ display: 'block' }} dir="auto">
                {[dx.od && 'OD: ' + dx.od.text, dx.os && 'OS: ' + dx.os.text, dx.ou && 'OU: ' + dx.ou.text].filter(Boolean).join('  ·  ')}
              </span>
            )}
          </>
        ) : <Missing />}</Cell>

        <Cell label="حدة الإبصار (BCVA)"><Eyes data={s.va} render={v => v.raw} /></Cell>
        <Cell label="ضغط العين IOP"><Eyes data={s.iop} render={v => <span style={{ color: v.value != null && v.value > 21 ? C.gold : C.text }}>{v.raw}</span>} /></Cell>
        <Cell label="سُمك البقعة OCT/CMT"><Eyes data={s.cmt} render={v => v.raw + ' µm'} /></Cell>
        <Cell label="الانكسار"><Eyes data={s.refraction} render={v => v.raw} /></Cell>

        <Cell label="العلاج الحالي" wide>
          {t ? (
            <>
              {t.plan && <div dir="auto">{t.plan.text}<span className="ds-sub"> · خطة {t.plan.date}</span></div>}
              {injLines.map(l => <div key={l} dir="auto" className="ds-sub" style={{ fontSize: 12 }}>{l}</div>)}
              {t.rx && <div dir="auto" className="ds-sub" style={{ fontSize: 12 }}>آخر وصفة {t.rx.date}: {t.rx.text}</div>}
              {!t.plan && !injLines.length && !t.rx && t.core && <div dir="auto">{t.core.text}</div>}
            </>
          ) : <Missing />}
        </Cell>
      </div>

      {s.trend.status !== 'insufficient' && s.trend.changes.length > 0 && (
        <ul style={{ margin: '10px 0 0', padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 4 }}>
          {s.trend.changes.slice(0, 4).map(c => (
            <li key={c.metric + c.eye} className="ds-sub" style={{ fontSize: 12 }}>
              <strong style={{ color: C.text }}>{METRIC_LABEL[c.metric]} {c.eye.toUpperCase()}</strong> — {describeChange(c)}
            </li>
          ))}
        </ul>
      )}
      <div className="ds-sub" style={{ marginTop: 8 }}>
        القيم من آخر تسجيل متاح لكل عين، وتاريخها يظهر عند تمرير المؤشر. {s.missing.length ? `بيانات ناقصة: ${s.missing.length}.` : ''}
      </div>
    </section>
  );
}
