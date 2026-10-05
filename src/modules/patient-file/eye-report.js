// Comprehensive eye report (pure: no React/DOM/Supabase). Two steps:
//   buildEyeReport(input)          -> language-neutral model made ONLY of recorded values
//   renderEyeReport(model, langs)  -> printable HTML in 'ar', 'en' or both (one page each)
// Rules: nothing is estimated or defaulted; a missing value prints "غير مسجل"/"Not recorded".
// Fixed choices offered by the app are translated (i18n/medical-terms.js); free text written by
// the doctor is printed as written and labelled as such -- it is never machine-translated.

import { examOphth, plainText, vaOf, iopOf, metricOf, refractionOf, ANTERIOR_PARTS, POSTERIOR_PARTS } from './ophth.js';
import { normalizeInjections, injectionStats, buildLongitudinal, describeChange } from './longitudinal.js';
import { buildInvestigationLinks } from './investigation-links.js';
import { buildClinicalSummary } from './clinical-summary.js';
import { medicineLines } from './patient-facing.js';
import { t, dirOf } from '../i18n/index.js';
import { translateTerm, isKnownTerm } from '../i18n/medical-terms.js';
import { escHTML } from '../print/escape.js';

const str = v => (v == null ? '' : String(v).trim());
const day = v => str(v).slice(0, 10);

export function latestExamOf(exams) {
  const list = (Array.isArray(exams) ? exams : []).filter(e => e && typeof e === 'object' && !Array.isArray(e.requestedTests) && day(e.date));
  return [...list].sort((a, b) => (str(b.date) + str(b.time)).localeCompare(str(a.date) + str(a.time)))[0] || null;
}

export function buildEyeReport({
  patient = null, exam = null, exams = [], visits = [], rxList = [], requests = [], images = [], imagingOrders = [],
  coreFile = null, injections = [], appointments = [], clinic = null, doctor = '', today = ''
} = {}) {
  const ex = exam || latestExamOf(exams);
  const o = ex ? examOphth(ex) : null;
  const pid = patient ? patient.id : null;

  const eyes = ['od', 'os'];
  const pair = fn => Object.fromEntries(eyes.map(e => [e, ex ? fn(e) : { }]));
  const va = pair(e => vaOf(ex, e));
  const iop = pair(e => ({ raw: iopOf(ex, e).raw }));
  const refraction = pair(e => refractionOf(ex, e));
  const part = (list, group) => list.map(([k]) => ({ key: k, od: o ? str(o[group][k].od) : '', os: o ? str(o[group][k].os) : '' }));
  const anterior = part(ANTERIOR_PARTS, 'anterior').filter(p => p.od || p.os);
  const posterior = part(POSTERIOR_PARTS, 'posterior').filter(p => p.od || p.os);
  const metric = key => ({ od: ex ? metricOf(ex, key, 'od').raw : '', os: ex ? metricOf(ex, key, 'os').raw : '' });

  const summary = buildClinicalSummary({ patient, exams, visits, requests, rxList, images, imagingOrders, coreFile, injections, appointments, today });
  const injNorm = normalizeInjections(Array.isArray(injections) ? injections.filter(x => x && (!pid || x.patientId === pid)) : [], pid);
  const injRows = eyes.flatMap(e => {
    const st = injectionStats(injNorm[e]);
    return injNorm[e].map((i, idx) => ({ eye: e, date: i.date, drug: str(i.drug), dose: i.doseNo == null ? '' : str(i.doseNo), interval: idx > 0 && st.intervals[idx - 1] ? st.intervals[idx - 1].days : null }));
  });

  const asOf = ex ? day(ex.date) : '';
  const rxCandidates = (Array.isArray(rxList) ? rxList : []).filter(r => r && day(r.date) && (!asOf || day(r.date) <= asOf));
  const lastRx = [...rxCandidates].sort((a, b) => day(b.date).localeCompare(day(a.date)))[0] || null;

  const chains = buildInvestigationLinks({ requests, images, imagingOrders, visits, today }).chains
    .filter(c => !asOf || !c.orderedDate || c.orderedDate <= asOf || c.statusGroup === 'pending');

  const trend = buildLongitudinal({ exams, injections: Array.isArray(injections) ? injections.filter(x => x && (!pid || x.patientId === pid)) : [], patientId: pid });
  const followDate = ex ? day(ex.followUp) : '';

  return {
    generatedOn: today,
    clinic: clinic || {},
    doctor: str(doctor) || (ex ? str(ex.doctor) : ''),
    patient: patient ? { name: str(patient.name), code: str(patient.patientCode), age: patient.age, gender: str(patient.gender), phone: str(patient.phone), allergies: str(patient.allergies) } : null,
    exam: ex ? { date: day(ex.date), doctor: str(ex.doctor), complaint: str(ex.chiefComplaint), colorVision: str(ex.colorVision), coverTest: str(ex.coverTest), contrast: str(ex.contrast), notes: str(ex.notes) } : null,
    va, iop, iopMethod: o ? str(o.iop.method) : '', refraction, anterior, posterior,
    anteriorText: ex ? plainText(ex.anteriorSegment) : '', posteriorText: ex ? plainText(ex.posteriorSegment) : '',
    cd: metric('cd'), cmt: metric('cmt'), vfMd: metric('vfMd'),
    diagnosis: { main: ex ? plainText(ex.diagnosis) : '', od: o ? str(o.dx.od) : '', os: o ? str(o.dx.os) : '', ou: o ? str(o.dx.ou) : '' },
    plan: ex ? plainText(ex.treatmentPlan) : '',
    investigationPlan: o ? str(o.plan.investigation) : '',
    injections: injRows,
    medicines: lastRx ? { date: day(lastRx.date), lines: medicineLines(lastRx) } : null,
    investigations: chains.map(c => ({ tests: c.tests, eyes: c.eyes, date: c.orderedDate, group: c.statusGroup, why: c.why, result: c.report ? c.report.text : (c.result || ''), images: c.images.length })),
    followUp: { date: followDate, reason: o ? str(o.plan.followUpReason) : '', next: summary.followUp },
    progress: { status: trend.status, changes: trend.changes, treatment: trend.treatment }
  };
}

// ---------------------------------------------------------------------------------------------
const CSS = `
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:'Segoe UI',Tahoma,Arial,sans-serif;color:#111;font-size:12px;line-height:1.55}
.page{width:210mm;margin:0 auto;padding:12mm;page-break-after:always}
.page:last-child{page-break-after:auto}
.hd{border-bottom:2px solid #0B7A88;padding-bottom:8px;margin-bottom:12px;display:flex;justify-content:space-between;gap:12px}
.hd h1{font-size:18px;color:#0B7A88}.hd .sub{color:#555;font-size:11px}
h2{font-size:13px;color:#0B7A88;border-bottom:1px solid #cfe3e6;padding-bottom:3px;margin:14px 0 6px}
table{width:100%;border-collapse:collapse;margin-bottom:4px}
th,td{border:1px solid #cfd8dc;padding:4px 7px;text-align:start;vertical-align:top}
th{background:#eef5f6;font-weight:700}
.kv{display:grid;grid-template-columns:repeat(3,1fr);gap:4px 12px}
.kv div span{color:#666;font-size:10.5px;display:block}
.nr{color:#888}.ft{margin-top:16px;border-top:1px solid #ccc;padding-top:6px;font-size:10px;color:#666}
.sig{margin-top:26px;display:flex;justify-content:flex-end}.sig div{border-top:1px solid #333;padding-top:4px;min-width:60mm;text-align:center}
.free{font-size:10px;color:#666}
.al{border:1px solid #c93a44;color:#c93a44;padding:4px 8px;margin-bottom:6px}
@media print{.page{padding:8mm}}`;

function pageHTML(m, lang) {
  const L = k => t(k, lang);
  const NR = `<span class="nr">${escHTML(t('common.notRecorded', lang))}</span>`;
  const v = x => (str(x) ? escHTML(str(x)) : NR);
  const term = x => (str(x) ? escHTML(translateTerm(x, lang)) : NR);
  // free text: translated only when it is exactly one of the app's own options; otherwise as written
  const free = x => (str(x) ? escHTML(translateTerm(x, lang)) + (lang === 'en' && !isKnownTerm(x) && /[؀-ۿ]/.test(str(x)) ? ' <span class="free">*</span>' : '') : NR);
  const eyeName = e => L(e === 'od' ? 'common.od' : 'common.os');
  const dateFmt = d => (d ? escHTML(d) : NR);
  const needsFreeNote = lang === 'en';
  const age = m.patient && (m.patient.age || m.patient.age === 0) ? `${m.patient.age} ${L('common.years')}` : '';
  const pairRow = (label, a, b, fmt = v) => `<tr><th>${escHTML(label)}</th><td>${fmt(a)}</td><td>${fmt(b)}</td></tr>`;
  const head = `<thead><tr><th></th><th>${escHTML(eyeName('od'))}</th><th>${escHTML(eyeName('os'))}</th></tr></thead>`;
  const e = m.exam;
  const has = x => str(x) !== '';
  const anyOf = (...ps) => ps.some(p => has(p.od) || has(p.os));

  let h = `<div class="page" dir="${dirOf(lang)}" lang="${lang}">`;
  h += `<div class="hd"><div><h1>${escHTML(L('report.title'))}</h1><div class="sub">${escHTML(L('report.clinic'))} ${escHTML(str(m.doctor))}${m.clinic && m.clinic.address ? ' · ' + escHTML(m.clinic.address) : ''}${m.clinic && m.clinic.phone ? ' · ' + escHTML(m.clinic.phone) : ''}</div></div><div class="sub">${escHTML(m.generatedOn)}</div></div>`;

  if (m.patient) {
    h += `<h2>${escHTML(L('report.patient'))}</h2><div class="kv">`
      + `<div><span>${escHTML(L('report.name'))}</span>${v(m.patient.name)}</div>`
      + `<div><span>${escHTML(L('report.code'))}</span>${v(m.patient.code)}</div>`
      + `<div><span>${escHTML(L('report.age'))}</span>${age ? escHTML(age) : NR}</div>`
      + `<div><span>${escHTML(L('report.gender'))}</span>${term(m.patient.gender)}</div>`
      + `<div><span>${escHTML(L('report.phone'))}</span>${v(m.patient.phone)}</div>`
      + `<div><span>${escHTML(L('report.allergies'))}</span>${free(m.patient.allergies)}</div></div>`;
  }
  if (!e) {
    h += `<p style="margin-top:12px">${escHTML(L('report.noExam'))}</p>`;
  } else {
    h += `<h2>${escHTML(L('report.examDate'))}: ${escHTML(e.date)} · ${escHTML(L('report.doctor'))}: ${v(e.doctor)}</h2>`;
    if (has(e.complaint)) h += `<p><b>${escHTML(L('report.complaint'))}:</b> ${term(e.complaint)}</p>`;

    // vision
    h += `<h2>${escHTML(L('report.vision'))}</h2><table>${head}`
      + pairRow(L('report.ucva'), m.va.od.ucva, m.va.os.ucva)
      + pairRow(L('report.bcva'), m.va.od.bcva, m.va.os.bcva)
      + pairRow(L('report.ph'), m.va.od.ph, m.va.os.ph) + `</table>`;
    h += `<h2>${escHTML(L('report.iopSec'))}</h2><table>${head}`
      + pairRow('IOP (mmHg)', m.iop.od.raw, m.iop.os.raw) + `</table>`
      + (has(m.iopMethod) ? `<p>${escHTML(L('report.method'))}: ${v(m.iopMethod)}</p>` : '');
    if (anyOf(...['sph', 'cyl', 'axis'].flatMap(k => [{ od: m.refraction.od[k], os: m.refraction.os[k] }]))) {
      h += `<h2>${escHTML(L('report.refraction'))}</h2><table>${head}`
        + pairRow(L('report.sph'), m.refraction.od.sph, m.refraction.os.sph)
        + pairRow(L('report.cyl'), m.refraction.od.cyl, m.refraction.os.cyl)
        + pairRow(L('report.axis'), m.refraction.od.axis, m.refraction.os.axis) + `</table>`;
    }
    // segments
    if (m.anterior.length || has(m.anteriorText)) {
      h += `<h2>${escHTML(L('report.anterior'))}</h2>`;
      if (m.anterior.length) h += `<table>${head}` + m.anterior.map(p => pairRow(L('part.' + p.key), p.od, p.os, term)).join('') + `</table>`;
      if (has(m.anteriorText)) h += `<p>${free(m.anteriorText)}</p>`;
    }
    if (m.posterior.length || has(m.posteriorText) || anyOf(m.cd, m.cmt, m.vfMd)) {
      h += `<h2>${escHTML(L('report.posterior'))}</h2>`;
      if (m.posterior.length) h += `<table>${head}` + m.posterior.map(p => pairRow(L('part.' + p.key), p.od, p.os, term)).join('') + `</table>`;
      if (has(m.posteriorText)) h += `<p>${free(m.posteriorText)}</p>`;
      if (anyOf(m.cd, m.cmt, m.vfMd)) {
        h += `<table>${head}`;
        if (anyOf(m.cd)) h += pairRow(L('report.cd'), m.cd.od, m.cd.os);
        if (anyOf(m.cmt)) h += pairRow(L('report.cmt'), m.cmt.od, m.cmt.os);
        if (anyOf(m.vfMd)) h += pairRow(L('report.vf'), m.vfMd.od, m.vfMd.os);
        h += `</table>`;
      }
    }
    if (has(e.colorVision) || has(e.coverTest) || has(e.contrast)) {
      h += `<h2>${escHTML(L('report.other'))}</h2><div class="kv">`
        + `<div><span>${escHTML(L('report.colorVision'))}</span>${term(e.colorVision)}</div>`
        + `<div><span>${escHTML(L('report.coverTest'))}</span>${term(e.coverTest)}</div>`
        + `<div><span>${escHTML(L('report.contrast'))}</span>${term(e.contrast)}</div></div>`;
    }
    // diagnosis
    const d = m.diagnosis;
    h += `<h2>${escHTML(L('report.diagnosis'))}</h2>`;
    if (!has(d.main) && !has(d.od) && !has(d.os) && !has(d.ou)) h += `<p>${NR}</p>`;
    else {
      if (has(d.main)) h += `<p><b>${escHTML(L('report.dxMain'))}:</b> ${free(d.main)}</p>`;
      h += '<ul style="margin-inline-start:18px">' + [['od', d.od], ['os', d.os], ['ou', d.ou]].filter(x => has(x[1])).map(([k, x]) => `<li><b>${escHTML(L('common.' + k))}:</b> ${term(x)}</li>`).join('') + '</ul>';
    }
  }

  // treatment
  h += `<h2>${escHTML(L('report.treatment'))}</h2>`;
  const hasTx = has(m.plan) || m.injections.length || (m.medicines && m.medicines.lines.length) || has(m.investigationPlan);
  if (!hasTx) h += `<p>${escHTML(L('report.noTreatment'))}</p>`;
  if (has(m.plan)) h += `<p><b>${escHTML(L('report.plan'))}:</b> ${free(m.plan)}</p>`;
  if (has(m.investigationPlan)) h += `<p><b>${escHTML(L('report.investigations'))}:</b> ${term(m.investigationPlan)}</p>`;
  if (m.medicines && m.medicines.lines.length) h += `<p><b>${escHTML(L('report.meds'))} (${escHTML(m.medicines.date)}):</b></p><ul style="margin-inline-start:18px">${m.medicines.lines.map(x => `<li>${free(x)}</li>`).join('')}</ul>`;
  if (m.injections.length) {
    h += `<p><b>${escHTML(L('report.injections'))}</b></p><table><thead><tr><th>${escHTML(L('report.eye'))}</th><th>${escHTML(L('common.date'))}</th><th>${escHTML(L('report.drug'))}</th><th>${escHTML(L('report.dose'))}</th><th>${escHTML(L('report.interval'))}</th></tr></thead><tbody>`
      + m.injections.map(i => `<tr><td>${escHTML(eyeName(i.eye))}</td><td>${dateFmt(i.date)}</td><td>${v(i.drug)}</td><td>${v(i.dose)}</td><td>${i.interval == null ? '—' : i.interval}</td></tr>`).join('') + '</tbody></table>';
  }

  // investigations
  if (m.investigations.length) {
    h += `<h2>${escHTML(L('report.investigations'))}</h2><table><thead><tr><th>${escHTML(L('report.test'))}</th><th>${escHTML(L('common.date'))}</th><th>${escHTML(L('report.status'))}</th><th>${escHTML(L('report.result'))}</th></tr></thead><tbody>`
      + m.investigations.map(c => `<tr><td>${escHTML(c.tests.map(x => translateTerm(x, lang)).join(', '))}${c.eyes.length ? ' (' + escHTML(c.eyes.join('/')) + ')' : ''}</td><td>${dateFmt(c.date)}</td><td>${escHTML(L('status.' + c.group))}</td><td>${c.result ? free(c.result) : NR}</td></tr>`).join('') + '</tbody></table>';
  }

  // progress
  h += `<h2>${escHTML(L('report.progress'))}</h2>`;
  const ch = m.progress.changes;
  if (!ch.length) h += `<p>${escHTML(L('report.noProgress'))}</p>`;
  else h += '<ul style="margin-inline-start:18px">' + ch.map(c => `<li><b>${escHTML(L('metric.' + c.metric))} ${escHTML(c.eye.toUpperCase())}:</b> ${escHTML(describeChangeLang(c, lang))}</li>`).join('') + '</ul>';

  // follow-up
  const nf = m.followUp.next;
  const fdate = m.followUp.date || (nf ? nf.date : '');
  h += `<h2>${escHTML(L('report.followUp'))}</h2><p>${escHTML(L('report.nextVisit'))}: ${dateFmt(fdate)}${has(m.followUp.reason) ? ' · ' + escHTML(L('report.reason')) + ': ' + term(m.followUp.reason) : ''}</p>`;
  if (e && has(e.notes)) h += `<h2>${escHTML(L('report.notes'))}</h2><p>${free(e.notes)}</p>`;

  h += `<div class="sig"><div>${escHTML(L('report.signature'))}</div></div>`;
  h += `<div class="ft">${escHTML(L('report.footer').replace('{d}', m.generatedOn))}${needsFreeNote ? ' &nbsp; * ' + escHTML(L('report.free')) : ''}</div></div>`;
  return h;
}

// English wording for a change (describeChange itself is Arabic)
export function describeChangeLang(c, lang) {
  if (lang !== 'en') return describeChange(c, 'ar');
  if (!c || c.status !== 'ok') return 'insufficient data';
  const unit = { va: 'logMAR', iop: 'mmHg', cmt: 'µm', cd: '', vfMd: 'dB' }[c.metric];
  const word = c.direction === 'flat' ? 'unchanged' : c.metric === 'va' ? (c.direction === 'up' ? 'vision declined' : 'vision improved') : c.direction === 'up' ? 'increased' : 'decreased';
  const shown = c.metric === 'va' ? `${c.from.raw} → ${c.to.raw}` : `${c.from.value} → ${c.to.value}${unit ? ' ' + unit : ''}`;
  const extra = c.metric === 'cmt' && c.pct != null ? ` (${c.pct > 0 ? '+' : ''}${c.pct}%)` : '';
  const fav = c.favorable === true ? ' — favourable' : c.favorable === false ? ' — unfavourable' : '';
  return `${word}: ${shown}${extra}${fav}`;
}

export function renderEyeReport(model, langs = ['ar']) {
  const list = (Array.isArray(langs) ? langs : [langs]).filter(l => l === 'ar' || l === 'en');
  const use = list.length ? list : ['ar'];
  return `<!DOCTYPE html><html dir="${dirOf(use[0])}" lang="${use[0]}"><head><meta charset="UTF-8"><title>${escHTML(t('report.title', use[0]))}</title><style>${CSS}</style></head><body>${use.map(l => pageHTML(model, l)).join('')}</body></html>`;
}
