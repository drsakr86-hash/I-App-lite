// Diagnosis assistant: shows what to consider (with the reason for each) from the general exam and the special sheets.
// Decision support only. Nothing is written until the doctor taps "add"; free text is never read.
import React from 'react';
import { C } from '../../modules/theme/index.js';
import { useLang, t } from '../../modules/i18n/index.js';
import { suggestGeneral, TIER } from '../../modules/ddx/general.js';
import { appendDiagnosis, hasDiagnosis, reasonText } from '../../modules/ddx/apply.js';
import { suggest, workupLine } from '../../modules/special-exam/ddx.js';
import { CASES, caseLabel, normalizeSpecial } from '../../modules/special-exam/model.js';
import { RULESET, rulesetReviewed, DISMISS_REASONS, validDismissal, makeReview, appendReview, reviewState } from '../../modules/ddx/review.js';

const chip = (color, on) => ({
  minHeight: 36, padding: '4px 10px', borderRadius: 10, cursor: on ? 'default' : 'pointer', font: 'inherit', fontSize: 12, fontWeight: 700,
  border: `2px solid ${on ? C.success : color}`, background: on ? C.success + '22' : color + '22', color: on ? C.success : color
});

function Item({ item, diagnosis, plan, onDx, onWorkup, lang, onDecide }) {
  const [dismissing, setDismissing] = React.useState(false);
  const [rk, setRk] = React.useState('');
  const [other, setOther] = React.useState('');
  const urgent = item.tier === TIER.URGENT;
  const addedDx = hasDiagnosis(diagnosis, item.label);
  const addedWk = item.workup.length > 0 && String(plan || '').includes(workupLine(item.workup));
  return (
    <div style={{ borderTop: `1px solid ${C.border}`, padding: '8px 0', display: 'flex', flexDirection: 'column', gap: 4 }}>
      <div style={{ display: 'flex', gap: 6, alignItems: 'flex-start' }}>
        <span style={{ fontSize: 10, fontWeight: 800, padding: '2px 6px', borderRadius: 6, color: urgent ? C.danger : C.gold, background: (urgent ? C.danger : C.gold) + '22', whiteSpace: 'nowrap' }}>{t(urgent ? 'g13.ddx.urgent' : 'g13.ddx.consider', lang)}</span>
        <span dir="ltr" style={{ color: C.text, fontSize: 13, fontWeight: 700, textAlign: 'start' }}>{item.label}</span>
      </div>
      {item.why && item.why.length > 0 ? (
        <div style={{ color: C.muted, fontSize: 11 }}>{t('g13.ddx.why', lang)}: {item.why.map(w => reasonText(w, lang)).join(' · ')}</div>
      ) : null}
      {item.workup.length > 0 ? <div dir="ltr" style={{ color: C.muted, fontSize: 11, textAlign: 'start' }}>🧪 {item.workup.join(', ')}</div> : null}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        <button type="button" disabled={addedDx} onClick={() => { onDx(item.label); onDecide(item, 'accepted'); }} style={chip(C.accent, addedDx)}>{addedDx ? '✓ ' + t('g13.ddx.addedDx', lang) : '+ ' + t('g13.ddx.addDx', lang)}</button>
        {item.workup.length > 0 ? <button type="button" disabled={addedWk} onClick={() => onWorkup(item.workup)} style={chip(C.teal, addedWk)}>{addedWk ? '✓ ' + t('g13.ddx.addedWorkup', lang) : '+ ' + t('g13.ddx.addWorkup', lang)}</button> : null}
        <button type="button" onClick={() => setDismissing(v => !v)} style={chip(C.muted, false)}>{t('g13.ddx.dismiss', lang)}</button>
      </div>
      {dismissing ? (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
          <select value={rk} onChange={e => setRk(e.target.value)} style={{ minHeight: 36 }}>
            <option value="">{t('g13.ddx.reasonPick', lang)}</option>
            {DISMISS_REASONS.map(k => <option key={k} value={k}>{t('g13.ddx.reason.' + k, lang)}</option>)}
          </select>
          {rk === 'other' ? <input value={other} onChange={e => setOther(e.target.value)} placeholder={t('g13.ddx.reasonOther', lang)} style={{ minHeight: 36 }} /> : null}
          <button type="button" disabled={!validDismissal(rk, other)} onClick={() => { if (validDismissal(rk, other)) { onDecide(item, 'dismissed', rk, other); setDismissing(false); } }} style={chip(C.danger, false)}>{t('g13.ddx.confirmDismiss', lang)}</button>
        </div>
      ) : null}
    </div>
  );
}

export default function DdxPanel({ exam, onDiagnosis, onWorkup, onReviews, by = '' }) {
  const lang = useLang();
  const reviews = (exam && exam.ddxReview) || [];
  const [showDismissed, setShowDismissed] = React.useState(false);
  const decide = (item, action, reasonKey, otherText) => onReviews && onReviews(appendReview(reviews, makeReview({ itemId: item.id, label: item.label, action, reasonKey, otherText, by })));
  const visible = it => showDismissed || reviewState(reviews, it.id) !== 'dismissed';
  const dismissedCount = [...suggestGeneral(exam).items, ...CASES.filter(c => normalizeSpecial(exam && exam.special)[c.id]).flatMap(c => suggest(c.id, normalizeSpecial(exam && exam.special)[c.id]).ddx.map(l => ({ id: c.id + ':' + l })))].filter(it => reviewState(reviews, it.id) === 'dismissed').length;
  const general = suggestGeneral(exam).items.filter(visible);
  const special = normalizeSpecial(exam && exam.special);
  const sheets = CASES.filter(c => special[c.id]).map(c => {
    const s = suggest(c.id, special[c.id]);
    return { id: c.id, items: s.ddx.map(label => ({ id: c.id + ':' + label, label, tier: TIER.CONSIDER, why: [], workup: [] })), workup: s.workup };
  }).filter(s => s.items.length);
  const dxText = exam && exam.diagnosis; const plan = exam && exam.treatmentPlan;
  const add = label => onDiagnosis(appendDiagnosis(dxText, label));
  return (
    <div style={{ background: C.card, border: `1px solid ${C.gold}55`, borderRadius: 12, padding: 12 }}>
      <div style={{ color: C.gold, fontWeight: 800, fontSize: 13 }}>🔎 {t('g13.ddx.title', lang)}</div>
      <div style={{ color: C.muted, fontSize: 10, margin: '4px 0 6px' }}>{t('g13.ddx.note', lang)}</div>
      <div style={{ color: C.muted, fontSize: 10, marginBottom: 6 }}>{t('g13.ddx.rules', lang)} v{RULESET.version} · {rulesetReviewed() ? t('g13.ddx.reviewed', lang) : t('g13.ddx.unreviewed', lang)}</div>
      {dismissedCount > 0 ? <button type="button" onClick={() => setShowDismissed(v => !v)} style={chip(C.muted, false)}>{showDismissed ? t('g13.ddx.hideDismissed', lang) : t('g13.ddx.showDismissed', lang) + ' (' + dismissedCount + ')'}</button> : null}
      {!general.length && !sheets.length ? <div style={{ color: C.muted, fontSize: 12 }}>{t('g13.ddx.empty', lang)}</div> : null}
      {general.length ? <div style={{ color: C.muted, fontSize: 11, fontWeight: 700, marginTop: 4 }}>{t('g13.ddx.general', lang)}</div> : null}
      {general.map(it => <Item key={it.id} item={it} diagnosis={dxText} plan={plan} onDx={add} onWorkup={onWorkup} lang={lang} onDecide={decide} />)}
      {sheets.map(sh => (
        <div key={sh.id} style={{ marginTop: 6 }}>
          <div style={{ color: C.muted, fontSize: 11, fontWeight: 700 }}>{caseLabel(sh.id, lang)}</div>
          {sh.items.filter(visible).map(it => <Item key={it.id} item={it} diagnosis={dxText} plan={plan} onDx={add} onWorkup={onWorkup} lang={lang} onDecide={decide} />)}
          {sh.workup.length ? <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 6 }}><button type="button" disabled={String(plan || '').includes(workupLine(sh.workup))} onClick={() => onWorkup(sh.workup)} style={chip(C.teal, String(plan || '').includes(workupLine(sh.workup)))}>{String(plan || '').includes(workupLine(sh.workup)) ? '✓ ' + t('g13.ddx.addedWorkup', lang) : '+ ' + t('g13.ddx.addWorkup', lang)}</button></div> : null}
        </div>
      ))}
    </div>
  );
}
