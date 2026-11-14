import React, { useState, useMemo } from 'react';
import { Modal, Btn } from './common.jsx';
import { C } from '../modules/theme/index.js';
import { t, useLang } from '../modules/i18n/index.js';
import { inp } from '../modules/ui/atoms.jsx';
import { useGuideCards } from '../modules/rx-guide/use-guide.js';
import { KIND_ICON, searchCards, orderedSections, lineToMedicine } from '../modules/rx-guide/model.js';

// "From the guide" picker used inside the prescription form (mode "meds": the Rx lines become medicines) and the exam
// form (mode "plan": the chosen lines are added to the treatment plan). Nothing is saved here: the chosen lines are handed
// to the form, which shows them for the doctor to adjust before the normal save.
export default function RxGuidePicker({ mode, drugs = [], onApply, onClose }) {
  const lang = useLang();
  const { cards, failed } = useGuideCards();
  const [query, setQuery] = useState('');
  const [openId, setOpenId] = useState(null);
  const [picked, setPicked] = useState({}); // `${cardId}|${kind}|${i}` -> true
  const list = useMemo(() => searchCards(cards, { query }).slice(0, 40), [cards, query]);
  const card = cards.find(c => c.id === openId) || null;
  const kinds = mode === 'meds' ? ['rx'] : ['check', 'rx', 'warn', 'avoid', 'follow'];
  const sections = card ? orderedSections(card).filter(s => kinds.includes(s.kind)) : [];
  const keyOf = (kind, i) => `${card.id}|${kind}|${i}`;

  const open = c => {
    setOpenId(c.id);
    const next = {};
    for (const s of orderedSections(c)) {
      s.lines.forEach((line, i) => {
        const on = mode === 'meds' ? lineToMedicine(line, drugs).known : (s.kind === 'rx' || s.kind === 'follow');
        if (on) next[`${c.id}|${s.kind}|${i}`] = true;
      });
    }
    setPicked(next);
  };
  const chosen = card ? sections.flatMap(s => s.lines.filter((_, i) => picked[keyOf(s.kind, i)]).map(line => ({ kind: s.kind, line }))) : [];
  const apply = () => {
    if (!card || !chosen.length) return;
    onApply({ card, lines: chosen.map(c => c.line), items: chosen });
  };

  return (
    <Modal title={t('rxg.pickTitle', lang)} onClose={onClose}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ fontSize: 11, color: C.muted }}>{t(mode === 'meds' ? 'rxg.pickHintMeds' : 'rxg.pickHintPlan', lang)}</div>
        {failed && <div role="alert" style={{ color: C.danger, fontSize: 13 }}>{t('rxg.error', lang)}</div>}
        {!card && (
          <>
            <input type="search" style={inp()} dir="auto" autoFocus value={query} aria-label={t('rxg.search', lang)} placeholder={t('rxg.search', lang)} onChange={e => setQuery(e.target.value)} />
            {!cards.length && !failed && <div style={{ color: C.muted, fontSize: 13 }}>{t('rxg.loading', lang)}</div>}
            {cards.length > 0 && !list.length && <div style={{ color: C.muted, fontSize: 13 }}>{t('rxg.none', lang)}</div>}
            {list.map(c => (
              <button key={c.id} type="button" onClick={() => open(c)} style={{ minHeight: 44, display: 'flex', gap: 8, alignItems: 'center', textAlign: 'start', background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, padding: '6px 10px', cursor: 'pointer', fontFamily: 'inherit', color: C.text }}>
                <span dir="ltr" style={{ color: C.muted, fontSize: 11, minWidth: 28 }}>{c.num}</span>
                <span dir="auto" style={{ flex: 1, fontSize: 13, fontWeight: 700 }}>{c.title}</span>
                {c.urgent && <span>🚨</span>}
              </button>
            ))}
          </>
        )}
        {card && (
          <>
            <button type="button" onClick={() => setOpenId(null)} style={{ alignSelf: 'flex-start', background: 'transparent', border: 'none', color: C.accent, cursor: 'pointer', fontFamily: 'inherit', fontSize: 13, minHeight: 36 }}>← {card.title}</button>
            {sections.map(s => (
              <div key={s.kind} style={{ borderInlineStart: `3px solid ${C.border}`, paddingInlineStart: 8 }}>
                <div style={{ fontSize: 12, fontWeight: 800, color: C.muted }}>{KIND_ICON[s.kind]} {t('rxg.kind.' + s.kind, lang)}</div>
                {s.lines.map((line, i) => (
                  <label key={i} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', minHeight: 36, padding: '4px 0', fontSize: 13, color: C.text, cursor: 'pointer' }}>
                    <input type="checkbox" checked={!!picked[keyOf(s.kind, i)]} onChange={e => setPicked(p => ({ ...p, [keyOf(s.kind, i)]: e.target.checked }))} style={{ marginTop: 5 }} />
                    <span dir="auto">{line}</span>
                  </label>
                ))}
              </div>
            ))}
            {mode === 'meds' && orderedSections(card).filter(s => s.kind === 'warn' || s.kind === 'avoid').map(s => (
              <div key={s.kind} style={{ fontSize: 12, color: C.muted }}>
                <div style={{ fontWeight: 800 }}>{KIND_ICON[s.kind]} {t('rxg.kind.' + s.kind, lang)} · {t('rxg.pickRead', lang)}</div>
                {s.lines.map((l, i) => <div key={i} dir="auto">{l}</div>)}
              </div>
            ))}
            <Btn full onClick={apply}>{chosen.length ? t('rxg.pickApply', lang, { n: chosen.length }) : t('rxg.pickNone', lang)}</Btn>
          </>
        )}
      </div>
    </Modal>
  );
}
