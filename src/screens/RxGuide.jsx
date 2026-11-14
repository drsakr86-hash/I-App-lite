import React, { useState, useMemo } from 'react';
import { C } from '../modules/theme/index.js';
import { t, useLang } from '../modules/i18n/index.js';
import { inp } from '../modules/ui/atoms.jsx';
import { Btn } from '../components/common.jsx';
import RxGuideEditor from '../components/RxGuideEditor.jsx';
import { askConfirm, notify } from '../modules/ui/dialogs.js';
import { can } from '../app/permissions.js';
import { getGuideHTML, printDoc } from '../modules/print/index.js';
import { KIND_ICON, searchCards, chapterCounts, orderedSections, hiddenCount } from '../modules/rx-guide/model.js';
import { saveGuideCard, hideGuideCard, removeGuideRecord, restoreHiddenCards } from '../modules/rx-guide/store.js';
import { useGuideCards } from '../modules/rx-guide/use-guide.js';

// "Rx in a minute" reference guide (doctor / admin). The guide's own text is a separate chunk, loaded on first open; the
// clinic's edits (changed cards, cards of its own, hidden cards) sit beside it as a synced list, so the original is
// never lost. Printing builds a sheet from the cards on screen. Nothing here writes into a prescription or an exam: the
// forms have their own "from the guide" picker for that.
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

function CardView({ card, open, onToggle, lang, canWrite, onEdit, onPrint, onHide, onRestore, onDelete }) {
  const colors = KIND_COLOR();
  const tag = card.edited ? t('rxg.edited', lang) : card.custom ? t('rxg.custom', lang) : '';
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
        {tag && <span style={{ fontSize: 10, color: C.teal, border: `1px solid ${C.teal}66`, borderRadius: 8, padding: '1px 6px' }}>{tag}</span>}
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
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <Btn small outline onClick={onPrint}>🖨 {t('rxg.print', lang)}</Btn>
            {canWrite && <Btn small outline onClick={onEdit}>✏️ {t('rxg.edit', lang)}</Btn>}
            {canWrite && card.edited && <Btn small outline onClick={onRestore}>↩ {t('rxg.restore', lang)}</Btn>}
            {canWrite && card.custom && <Btn small danger onClick={onDelete}>🗑 {t('rxg.delete', lang)}</Btn>}
            {canWrite && !card.custom && !card.edited && <Btn small outline onClick={onHide}>🙈 {t('rxg.hide', lang)}</Btn>}
          </div>
        </div>
      )}
    </div>
  );
}

export default function RxGuide({ clinic = null, session = null }) {
  const lang = useLang();
  const { data, cards, overlay, failed, reload } = useGuideCards();
  const canWrite = can(session && session.role, 'rx_guide', 'write');
  const [query, setQuery] = useState('');
  const [chapter, setChapter] = useState(null);
  const [urgentOnly, setUrgentOnly] = useState(false);
  const [openId, setOpenId] = useState(null);
  const [editing, setEditing] = useState(null); // null | 'new' | card

  const list = useMemo(() => searchCards(cards, { query, chapter, urgentOnly }), [cards, query, chapter, urgentOnly]);
  const counts = useMemo(() => chapterCounts(cards), [cards]);
  const hidden = hiddenCount(overlay);

  const done = async (promise, failKey) => {
    const res = await promise;
    if (res) { reload(res); return true; }
    notify(t(failKey || 'rxg.saveFail', lang));
    return false;
  };
  const print = cs => printDoc(getGuideHTML(cs, clinic, data && data.credit));
  const hide = async card => { if (await askConfirm(t('rxg.confirmHide', lang, { name: card.title }))) done(hideGuideCard(card.id, card.title)); };
  const restore = async card => { if (await askConfirm(t('rxg.confirmRestore', lang, { name: card.title }))) done(removeGuideRecord('o:' + card.id, card.title)); };
  const del = async card => { if (await askConfirm(t('rxg.confirmDelete', lang, { name: card.title }))) { if (await done(removeGuideRecord(card.id, card.title))) setOpenId(null); } };
  const showHidden = async () => { if (await askConfirm(t('rxg.confirmShow', lang))) done(restoreHiddenCards()); };
  const save = async value => {
    const target = editing && editing !== 'new' ? editing : null;
    const ok = await done(saveGuideCard(value, target && !target.custom ? target.id : null, target && target.custom ? target.id : null));
    if (ok) setEditing(null);
    return ok;
  };

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
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <span style={{ fontSize: 11, color: C.muted, flex: 1 }}>{t('rxg.count', lang, { n: list.length })}</span>
            {list.length > 0 && <Btn small outline onClick={() => print(list)}>🖨 {t('rxg.printAll', lang, { n: list.length })}</Btn>}
            {canWrite && <Btn small onClick={() => setEditing('new')}>{t('rxg.add', lang)}</Btn>}
            {canWrite && hidden > 0 && <Btn small outline onClick={showHidden}>{t('rxg.showHidden', lang, { n: hidden })}</Btn>}
          </div>
          {!list.length && <div style={{ color: C.muted, fontSize: 13 }}>{t('rxg.none', lang)}</div>}
          {list.map(card => (
            <CardView
              key={card.id}
              card={card}
              lang={lang}
              canWrite={canWrite}
              open={openId === card.id || list.length === 1}
              onToggle={() => setOpenId(openId === card.id ? null : card.id)}
              onPrint={() => print([card])}
              onEdit={() => setEditing(card)}
              onHide={() => hide(card)}
              onRestore={() => restore(card)}
              onDelete={() => del(card)}
            />
          ))}
          <div dir="ltr" style={{ fontSize: 10, color: C.muted, lineHeight: 1.6, marginTop: 6 }}>{data.credit}</div>
        </>
      )}
      {editing && data && (
        <RxGuideEditor
          card={editing === 'new' ? null : editing}
          chapters={data.chapters}
          onSave={save}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}
