import React, { useState, useEffect, useMemo } from 'react';
import { C } from '../modules/theme/index.js';
import { t, useLang } from '../modules/i18n/index.js';
import { inp } from '../modules/ui/atoms.jsx';
import { retryImport } from '../app/chunk-recovery.js';
import { KIND_ICON, searchCards, chapterCounts, orderedSections } from '../modules/rx-guide/model.js';

// "Rx in a minute" reference guide (doctor / admin). Read-only: the card text is shown exactly as written in the
// guide and is never copied into a prescription automatically. The guide is a separate chunk, loaded on first open.
const KIND_COLOR = () => ({ check: C.teal, rx: C.accent, warn: C.gold, avoid: C.danger, follow: C.success });

function Chip({ on, onClick, children, color }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      style={{
        flex: '0 0 auto', minHeight: 36, padding: '4px 12px', borderRadius: 18, cursor: 'pointer', fontFamily: 'inherit', fontSize: 12, fontWeight: 700,
        border: `1px solid ${on ? (color || C.accent) : C.border}`, background: on ? (color || C.accent) : 'transparent', color: on ? '#fff' : C.text
      }}
    >{children}</button>
  );
}

function CardView({ card, open, onToggle, lang }) {
  const colors = KIND_COLOR();
  return (
    <div style={{ background: C.card, border: `1px solid ${card.urgent ? C.danger + '66' : C.border}`, borderRadius: 12, overflow: 'hidden' }}>
      <button
        type="button"
        aria-expanded={open}
        onClick={onToggle}
        style={{ width: '100%', minHeight: 48, display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', background: 'transparent', border: 'none', cursor: 'pointer', fontFamily: 'inherit', color: C.text, textAlign: 'start' }}
      >
        <span dir="ltr" style={{ color: C.muted, fontSize: 11, minWidth: 30 }}>{card.num}</span>
        <span dir="auto" style={{ flex: 1, fontWeight: 700, fontSize: 14 }}>{card.title}</span>
        {card.urgent && <span aria-label={t('rxg.urgent', lang)} title={t('rxg.urgent', lang)}>🚨</span>}
        <span aria-hidden="true" style={{ color: C.muted }}>{open ? '▴' : '▾'}</span>
      </button>
      {open && (
        <div style={{ padding: '0 12px 12px', display: 'flex', flexDirection: 'column', gap: 10 }}>
          {orderedSections(card).map(sec => (
            <div key={sec.kind} style={{ borderInlineStart: `3px solid ${colors[sec.kind]}`, paddingInlineStart: 10 }}>
              <div style={{ fontSize: 12, fontWeight: 800, color: colors[sec.kind], marginBottom: 4 }}>{KIND_ICON[sec.kind]} {t('rxg.kind.' + sec.kind, lang)}</div>
              {sec.lines.map((line, i) => (
                <div key={i} dir="auto" style={{ fontSize: 13, lineHeight: 1.8, color: C.text }}>{line}</div>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function RxGuide() {
  const lang = useLang();
  const [data, setData] = useState(null);
  const [failed, setFailed] = useState(false);
  const [query, setQuery] = useState('');
  const [chapter, setChapter] = useState(null);
  const [urgentOnly, setUrgentOnly] = useState(false);
  const [openId, setOpenId] = useState(null);

  useEffect(() => {
    let live = true;
    retryImport(() => import('../modules/rx-guide/data.js'))
      .then(m => { if (live) setData(m.default); })
      .catch(() => { if (live) setFailed(true); });
    return () => { live = false; };
  }, []);

  const list = useMemo(() => (data ? searchCards(data.cards, { query, chapter, urgentOnly }) : []), [data, query, chapter, urgentOnly]);
  const counts = useMemo(() => (data ? chapterCounts(data.cards) : {}), [data]);

  return (
    <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div>
        <div style={{ fontWeight: 800, fontSize: 16, color: C.text }}>📖 {t('rxg.title', lang)}</div>
        <div style={{ fontSize: 11, color: C.muted, lineHeight: 1.7 }}>{t('rxg.intro', lang)}</div>
        <div style={{ fontSize: 11, color: C.muted }}>{t('rxg.legend', lang)}</div>
      </div>
      {failed && <div role="alert" style={{ color: C.danger, fontSize: 13 }}>{t('rxg.error', lang)}</div>}
      {!data && !failed && <div style={{ color: C.muted, fontSize: 13 }}>{t('rxg.loading', lang)}</div>}
      {data && (
        <>
          <input
            type="search"
            className="ds-field"
            style={inp()}
            dir="auto"
            value={query}
            aria-label={t('rxg.search', lang)}
            placeholder={t('rxg.search', lang)}
            onChange={e => { setQuery(e.target.value); setOpenId(null); }}
          />
          <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 4 }}>
            <Chip on={chapter == null && !urgentOnly} onClick={() => { setChapter(null); setUrgentOnly(false); }}>{t('rxg.all', lang)}</Chip>
            <Chip on={urgentOnly} color={C.danger} onClick={() => setUrgentOnly(v => !v)}>🚨 {t('rxg.urgent', lang)}</Chip>
            {data.chapters.map(ch => (
              <Chip key={ch.n} on={chapter === ch.n} onClick={() => setChapter(chapter === ch.n ? null : ch.n)}>{ch.n} · {t('rxg.ch.' + ch.n, lang)} ({counts[ch.n] || 0})</Chip>
            ))}
          </div>
          <div style={{ fontSize: 11, color: C.muted }}>{t('rxg.count', lang, { n: list.length })}</div>
          {!list.length && <div style={{ color: C.muted, fontSize: 13 }}>{t('rxg.none', lang)}</div>}
          {list.map(card => (
            <CardView key={card.id} card={card} lang={lang} open={openId === card.id || list.length === 1} onToggle={() => setOpenId(openId === card.id ? null : card.id)} />
          ))}
          <div dir="ltr" style={{ fontSize: 10, color: C.muted, lineHeight: 1.6, marginTop: 6 }}>{data.credit}</div>
        </>
      )}
    </div>
  );
}
