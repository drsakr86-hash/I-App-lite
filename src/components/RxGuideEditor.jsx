import React, { useState } from 'react';
import { Modal, Btn } from './common.jsx';
import { C } from '../modules/theme/index.js';
import { t, useLang } from '../modules/i18n/index.js';
import { inp } from '../modules/ui/atoms.jsx';
import { KIND_ORDER, KIND_ICON, normalizeCardInput, sectionsToText } from '../modules/rx-guide/model.js';

// Editor of one guide card (edit a guide card, or add the clinic's own). The text is kept exactly as typed, one line per row.
export default function RxGuideEditor({ card, chapters, onSave, onClose }) {
  const lang = useLang();
  const [title, setTitle] = useState(card ? card.title : '');
  const [chapter, setChapter] = useState(card ? card.chapter : '');
  const [urgent, setUrgent] = useState(card ? !!card.urgent : false);
  const [texts, setTexts] = useState(() => (card ? sectionsToText(card) : sectionsToText({ sections: [] })));
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    const r = normalizeCardInput({ title, chapter, urgent, sections: texts }, chapters.map(c => c.n));
    if (!r.ok) { setError(t(r.error, lang)); return; }
    setBusy(true);
    const ok = await onSave(r.value);
    setBusy(false);
    if (!ok) setError(t('rxg.saveFail', lang));
  };
  const label = { fontSize: 12, fontWeight: 700, color: C.muted, marginBottom: 4 };

  return (
    <Modal title={t(card ? 'rxg.editTitle' : 'rxg.newTitle', lang)} onClose={onClose}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div>
          <div style={label}>{t('rxg.fTitle', lang)}</div>
          <input style={inp()} dir="auto" value={title} onChange={e => { setTitle(e.target.value); setError(''); }} />
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 160 }}>
            <div style={label}>{t('rxg.fChapter', lang)}</div>
            <select style={inp()} value={chapter} onChange={e => { setChapter(e.target.value); setError(''); }}>
              <option value="" />
              {chapters.map(c => <option key={c.n} value={c.n}>{c.n} · {t('rxg.ch.' + c.n, lang)}</option>)}
            </select>
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: C.text, minHeight: 40 }}>
            <input type="checkbox" checked={urgent} onChange={e => setUrgent(e.target.checked)} />
            {t('rxg.fUrgent', lang)}
          </label>
        </div>
        {KIND_ORDER.map(kind => (
          <div key={kind}>
            <div style={label}>{KIND_ICON[kind]} {t('rxg.kind.' + kind, lang)} <span style={{ fontWeight: 400 }}>({t('rxg.fLines', lang)})</span></div>
            <textarea
              style={{ ...inp(), resize: 'vertical' }}
              dir="auto"
              rows={kind === 'rx' ? 5 : 3}
              value={texts[kind]}
              onChange={e => { setTexts(v => ({ ...v, [kind]: e.target.value })); setError(''); }}
            />
          </div>
        ))}
        {error && <div role="alert" style={{ color: C.danger, fontSize: 13 }}>{error}</div>}
        <div style={{ display: 'flex', gap: 8 }}>
          <Btn full onClick={submit}>{busy ? '…' : t('rxg.save', lang)}</Btn>
          <Btn full outline onClick={onClose}>{t('rxg.cancel', lang)}</Btn>
        </div>
      </div>
    </Modal>
  );
}
