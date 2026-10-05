// Longitudinal ophthalmic view (pure: no React/DOM/Supabase).
//
// Answers four questions from the data that is actually recorded -- and says "insufficient"
// when it is not: What changed? Is the patient improving? Is treatment working? Is the
// disease progressing?
//
// Nothing here is a diagnosis. The thresholds are DISPLAY heuristics (see THRESHOLDS), shown in
// the UI footnote, so the clinician can see why a change was flagged. No value is ever
// interpolated or invented; a metric with fewer than two dated, numeric points has no trend.

import { vaToLogMar, toNumber, vaOf, iopOf, metricOf } from './ophth.js';
import { t } from '../i18n/index.js';

export const THRESHOLDS = Object.freeze({
  va: 0.2,        // logMAR (= 2 lines on a logMAR chart)
  iop: 3,         // mmHg
  iopHigh: 21,    // mmHg -- same limit the exam form uses to flag "مرتفع"
  cmtPct: 10,     // percent of the previous central macular thickness
  cd: 0.1,        // cup/disc ratio
  vfMd: 2         // dB of mean deviation
});

const EYES = ['od', 'os'];
export const EYE_LABEL = { od: 'OD', os: 'OS' };
const str = v => (v == null ? '' : String(v));
const dayOf = v => str(v).slice(0, 10);
const validDay = d => /^\d{4}-\d{2}-\d{2}$/.test(d) && !Number.isNaN(Date.parse(d));
const dayNum = d => Math.round(Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10)) / 86400000);
export const daysBetween = (a, b) => (validDay(a) && validDay(b) ? dayNum(b) - dayNum(a) : null);
const round1 = n => Math.round(n * 10) / 10;

// ---- series -----------------------------------------------------------------------------------
function sortedExams(exams) {
  return (Array.isArray(exams) ? exams : [])
    .filter(e => e && typeof e === 'object')
    .map((e, i) => ({ e, i, date: dayOf(e.date), time: str(e.time) }))
    .sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time) || a.i - b.i);
}

export function buildSeries(exams) {
  const out = {
    va: { od: [], os: [] }, iop: { od: [], os: [] }, cmt: { od: [], os: [] },
    cd: { od: [], os: [] }, vfMd: { od: [], os: [] }
  };
  let undated = 0;
  for (const { e, date } of sortedExams(exams)) {
    if (!validDay(date)) { undated++; continue; }
    const base = { date, examId: e.id };
    for (const eye of EYES) {
      const va = vaOf(e, eye).bcva;
      const lm = va ? vaToLogMar(va) : null;
      if (lm) out.va[eye].push({ ...base, raw: va, value: lm.logmar, categorical: lm.categorical });
      const iop = iopOf(e, eye);
      if (iop.value != null) out.iop[eye].push({ ...base, raw: iop.raw, value: iop.value });
      for (const [key, name] of [['cmt', 'cmt'], ['cd', 'cd'], ['vfMd', 'vfMd']]) {
        const m = metricOf(e, key, eye);
        if (m.value != null) out[name][eye].push({ ...base, raw: m.raw, value: m.value });
      }
    }
  }
  return { ...out, undated };
}

// ---- change between two points ------------------------------------------------------------------
// favorable: true / false / null (unknown). CMT assumes a macular-oedema context (a thinner
// macula is favorable); this is stated in the UI footnote.
export function changeBetween(metric, prev, cur) {
  if (!prev || !cur) return { status: 'insufficient' };
  const delta = cur.value - prev.value;
  let significant = false;
  let favorable = null;
  let pct = null;
  switch (metric) {
    case 'va':
      significant = Math.abs(delta) >= THRESHOLDS.va - 1e-9;
      favorable = significant ? delta < 0 : null;
      break;
    case 'iop':
      significant = Math.abs(delta) >= THRESHOLDS.iop;
      if (significant) {
        if (delta > 0 && cur.value > THRESHOLDS.iopHigh) favorable = false;
        else if (delta < 0 && prev.value > THRESHOLDS.iopHigh) favorable = true;
      }
      break;
    case 'cmt':
      pct = prev.value ? round1((delta / prev.value) * 100) : null;
      significant = pct != null && Math.abs(pct) >= THRESHOLDS.cmtPct;
      favorable = significant ? delta < 0 : null;
      break;
    case 'cd':
      significant = Math.abs(delta) >= THRESHOLDS.cd - 1e-9;
      favorable = significant ? delta < 0 : null;
      break;
    case 'vfMd':
      significant = Math.abs(delta) >= THRESHOLDS.vfMd;
      favorable = significant ? delta > 0 : null;
      break;
    default:
      return { status: 'insufficient' };
  }
  const direction = Math.abs(delta) < 1e-9 ? 'flat' : delta > 0 ? 'up' : 'down';
  return {
    status: 'ok', metric, from: prev, to: cur, delta: Math.round(delta * 100) / 100, pct,
    direction, significant, favorable,
    days: daysBetween(prev.date, cur.date)
  };
}

export function lastChange(metric, points) {
  const p = Array.isArray(points) ? points : [];
  return p.length < 2 ? { status: 'insufficient', count: p.length } : changeBetween(metric, p[p.length - 2], p[p.length - 1]);
}
export function overallChange(metric, points) {
  const p = Array.isArray(points) ? points : [];
  return p.length < 2 ? { status: 'insufficient', count: p.length } : changeBetween(metric, p[0], p[p.length - 1]);
}

// ---- injections ---------------------------------------------------------------------------------
export function injectionEyes(eyeText) {
  const t = str(eyeText).trim().toUpperCase();
  if (!t) return [];
  if (t === 'OU' || t.includes('كلتا') || t.includes('BOTH')) return ['od', 'os'];
  if (t === 'OD' || t.includes('اليمنى') || t.includes('RIGHT')) return ['od'];
  if (t === 'OS' || t.includes('اليسرى') || t.includes('LEFT')) return ['os'];
  return [];
}

export function normalizeInjections(list, patientId) {
  const out = { od: [], os: [] };
  for (const x of Array.isArray(list) ? list : []) {
    if (!x || (patientId != null && x.patientId !== patientId)) continue;
    const date = dayOf(x.date);
    if (!validDay(date)) continue;
    for (const eye of injectionEyes(x.eye)) {
      out[eye].push({ id: x.id, date, eye, drug: str(x.drug), doseNo: x.doseNo, nextDate: dayOf(x.nextDate), bothEyes: injectionEyes(x.eye).length === 2 });
    }
  }
  for (const eye of EYES) out[eye].sort((a, b) => a.date.localeCompare(b.date));
  return out;
}

export function injectionStats(list) {
  const l = Array.isArray(list) ? list : [];
  const intervals = [];
  for (let i = 1; i < l.length; i++) {
    const days = daysBetween(l[i - 1].date, l[i].date);
    if (days != null) intervals.push({ from: l[i - 1].date, to: l[i].date, days });
  }
  const last = l[l.length - 1] || null;
  const avg = intervals.length ? Math.round(intervals.reduce((s, x) => s + x.days, 0) / intervals.length) : null;
  return {
    count: l.length,
    first: l[0] || null,
    last,
    intervals,
    lastIntervalDays: intervals.length ? intervals[intervals.length - 1].days : null,
    avgIntervalDays: avg,
    nextDate: last && validDay(last.nextDate) ? last.nextDate : null
  };
}

// ---- treatment response (facts, not a verdict about the patient) ----------------------------------
// Baseline = the latest recorded value on/before the first injection of the eye (or, when none
// exists, no baseline -> insufficient). Latest = the most recent value after it.
export function treatmentResponse(eye, series, injections) {
  const inj = injections[eye] || [];
  if (!inj.length) return { eye, status: 'no-injections' };
  const first = inj[0].date;
  const pick = (points, before) => {
    if (before) {
      const eligible = points.filter(p => p.date <= first);
      return eligible[eligible.length - 1] || null;
    }
    const eligible = points.filter(p => p.date > first);
    return eligible[eligible.length - 1] || null;
  };
  const metrics = {};
  const facts = [];
  for (const m of ['cmt', 'va']) {
    const base = pick(series[m][eye], true);
    const cur = pick(series[m][eye], false);
    if (base && cur) {
      const c = changeBetween(m, base, cur);
      metrics[m] = c;
      if (c.status === 'ok') facts.push(c);
    }
  }
  if (!facts.length) {
    return { eye, status: 'insufficient', injections: inj.length, firstInjection: first, lastInjection: inj[inj.length - 1].date, metrics };
  }
  const good = facts.filter(f => f.significant && f.favorable === true).length;
  const bad = facts.filter(f => f.significant && f.favorable === false).length;
  const status = good && !bad ? 'responding' : bad && !good ? 'worsening' : good && bad ? 'mixed' : 'no-change';
  return {
    eye, status, injections: inj.length, firstInjection: first, lastInjection: inj[inj.length - 1].date,
    drug: inj[inj.length - 1].drug, metrics
  };
}

// ---- the whole view --------------------------------------------------------------------------------
const METRICS = [['va', 'g1.metric.va'], ['iop', 'g1.metric.iop'], ['cmt', 'g1.metric.cmt'], ['cd', 'g1.metric.cd'], ['vfMd', 'g1.metric.vfMd']];
// Labels resolve at read time so they follow the current language.
export const METRIC_LABEL = {};
for (const [k, key] of METRICS) Object.defineProperty(METRIC_LABEL, k, { enumerable: true, get: () => t(key) });

export function buildLongitudinal({ exams = [], injections = [], patientId = null } = {}) {
  const series = buildSeries(exams);
  const inj = normalizeInjections(injections, patientId);
  const changes = [];
  const overall = [];
  for (const [metric] of METRICS) {
    for (const eye of EYES) {
      const c = lastChange(metric, series[metric][eye]);
      if (c.status === 'ok') changes.push({ ...c, eye });
      const o = overallChange(metric, series[metric][eye]);
      if (o.status === 'ok' && series[metric][eye].length > 2) overall.push({ ...o, eye });
    }
  }
  const sufficiency = {};
  for (const [metric] of METRICS) sufficiency[metric] = EYES.some(eye => series[metric][eye].length >= 2);
  sufficiency.injections = EYES.some(eye => inj[eye].length >= 1);

  const significant = changes.filter(c => c.significant);
  const bad = significant.filter(c => c.favorable === false);
  const good = significant.filter(c => c.favorable === true);
  const anyComparable = changes.length > 0;
  const status = !anyComparable ? 'insufficient'
    : bad.length && good.length ? 'mixed'
      : bad.length ? 'worsening'
        : good.length ? 'improving'
          : 'stable';

  // Progression looks at first-vs-last as well, so a slow drift is not hidden by two similar visits.
  const progression = [...bad, ...overall.filter(o => o.significant && o.favorable === false && !bad.some(b => b.metric === o.metric && b.eye === o.eye))];

  const treatment = EYES.map(eye => treatmentResponse(eye, series, inj)).filter(t => t.status !== 'no-injections');
  const stats = { od: injectionStats(inj.od), os: injectionStats(inj.os) };

  // One row per dated exam (oldest first) for the comparison table.
  const rows = sortedExams(exams).map(({ e, date }) => {
    const row = { examId: e.id, date: validDay(date) ? date : '', dx: str(e.diagnosis) };
    for (const eye of EYES) {
      const va = vaOf(e, eye);
      row['va_' + eye] = va.bcva; row['ucva_' + eye] = va.ucva; row['ph_' + eye] = va.ph;
      row['iop_' + eye] = iopOf(e, eye).raw;
      row['cmt_' + eye] = metricOf(e, 'cmt', eye).raw;
      row['cd_' + eye] = metricOf(e, 'cd', eye).raw;
      row['md_' + eye] = metricOf(e, 'vfMd', eye).raw;
    }
    return row;
  }).filter(r => ['va', 'ucva', 'ph', 'iop', 'cmt', 'cd', 'md'].some(k => r[k + '_od'] || r[k + '_os']));

  return {
    series, rows, changes, overall, progression, injections: inj, injectionStats: stats, treatment,
    sufficiency, status, undated: series.undated,
    counts: { exams: Array.isArray(exams) ? exams.length : 0, rows: rows.length }
  };
}

// For tests and the UI: stable text for a change (no medical claims beyond the numbers).
export function describeChange(c, lang) {
  if (!c || c.status !== 'ok') return t('g1.lg.insufficient', lang);
  const unit = { va: 'logMAR', iop: 'mmHg', cmt: 'µm', cd: '', vfMd: 'dB' }[c.metric];
  // For VA the stored number is logMAR (lower = better), so the wording follows the acuity itself.
  const word = c.direction === 'flat' ? t('g1.lg.flat', lang)
    : c.metric === 'va' ? (c.direction === 'up' ? t('g1.lg.visionDown', lang) : t('g1.lg.visionUp', lang))
    : c.direction === 'up' ? t('g1.lg.up', lang) : t('g1.lg.down', lang);
  const ar = t('g1.lg.arrow', lang);
  const shown = c.metric === 'va' ? `${c.from.raw} ${ar} ${c.to.raw}` : `${c.from.value} ${ar} ${c.to.value}${unit ? ' ' + unit : ''}`;
  const extra = c.metric === 'cmt' && c.pct != null ? ` (${c.pct > 0 ? '+' : ''}${c.pct}%)` : '';
  return `${word}: ${shown}${extra}`;
}

export { toNumber };
