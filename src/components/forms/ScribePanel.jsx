import React, { useEffect, useRef, useState } from 'react';
import { Btn } from '../common.jsx';
import { C } from '../../modules/theme/index.js';
import { useLang, t } from '../../modules/i18n/index.js';
import { localISO } from '../../modules/constants/misc.js';
import { draftRows, defaultSelection, applyDraft, formatClock, SCRIBE_MAX_SECONDS } from '../../modules/ai-scribe/model.js';
import { recorderSupported, startRecording, analyzeRecording } from '../../modules/ai-scribe/service.js';

// AI scribe card at the top of ExamForm: record -> server draft -> doctor ticks rows -> applied to the form.
// Nothing is stored here; the exam is saved only by the form's own save button.
export default function ScribePanel({ form, onApply }) {
  const lang = useLang();
  const [phase, setPhase] = useState('idle'); // idle | recording | analyzing | review | done | error
  const [consent, setConsent] = useState(false);
  const [secs, setSecs] = useState(0);
  const [draft, setDraft] = useState(null);
  const [rows, setRows] = useState([]);
  const [sel, setSel] = useState({});
  const [err, setErr] = useState('');
  const rec = useRef(null);
  const timer = useRef(null);
  const formRef = useRef(form); formRef.current = form;

  useEffect(() => () => { clearInterval(timer.current); if (rec.current) rec.current.cancel(); }, []);

  const stopTimer = () => { clearInterval(timer.current); timer.current = null; };
  const start = async () => {
    setErr('');
    try { rec.current = await startRecording(); }
    catch { setErr(t('ai.scribe.micDenied', lang)); setPhase('error'); return; }
    setSecs(0); setPhase('recording');
    const t0 = Date.now();
    timer.current = setInterval(() => {
      const s = (Date.now() - t0) / 1000; setSecs(s);
      if (s >= SCRIBE_MAX_SECONDS) stop();
    }, 500);
  };
  const cancel = () => { stopTimer(); if (rec.current) rec.current.cancel(); rec.current = null; setPhase('idle'); };
  async function stop() {
    stopTimer();
    const r = rec.current; rec.current = null; if (!r) return;
    setPhase('analyzing');
    try {
      const blob = await r.stop();
      const d = await analyzeRecording(blob, localISO());
      const rs = draftRows(formRef.current, d);
      setDraft(d); setRows(rs); setSel(defaultSelection(rs)); setPhase('review');
    } catch (e) { setErr(e && e.message ? e.message : String(e)); setPhase('error'); }
  }
  const apply = () => {
    const res = applyDraft(formRef.current, rows, sel, { model: draft && draft.model, at: new Date().toISOString() });
    if (res.applied) onApply(res.form);
    setPhase('done');
  };

  const box = { background: C.card, border: `1px solid ${C.accent}33`, borderRadius: 12, padding: 12, marginBottom: 14 };
  const small = { color: C.muted, fontSize: 11 };
  if (!recorderSupported()) return null;

  return (
    <div style={box}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
        <div style={{ fontWeight: 800, color: C.accent, fontSize: 13 }}>{t('ai.scribe.title', lang)}</div>
        {phase === 'recording' && <div style={{ color: C.danger, fontWeight: 800, fontSize: 13 }}>{'● '}{t('ai.scribe.recording', lang)}{' '}{formatClock(secs)}</div>}
      </div>

      {(phase === 'idle' || phase === 'done') && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={small}>{phase === 'done' ? t('ai.scribe.applied', lang) : t('ai.scribe.hint', lang)}</div>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, minHeight: 32 }}>
            <input type="checkbox" checked={consent} onChange={e => setConsent(e.target.checked)} />
            {t('ai.scribe.consent', lang)}
          </label>
          <Btn full color={consent ? undefined : C.muted} onClick={consent ? start : undefined}>{t('ai.scribe.start', lang)}</Btn>
        </div>
      )}

      {phase === 'recording' && (
        <div style={{ display: 'flex', gap: 8 }}>
          <Btn outline onClick={cancel}>{t('ai.scribe.cancel', lang)}</Btn>
          <Btn full danger onClick={stop}>{t('ai.scribe.stop', lang)}</Btn>
        </div>
      )}

      {phase === 'analyzing' && <div style={{ ...small, fontSize: 13, padding: '8px 0' }}>{t('ai.scribe.analyzing', lang)}</div>}

      {phase === 'error' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ color: C.danger, fontSize: 13 }}>{err}</div>
          <Btn outline onClick={() => setPhase('idle')}>{t('ai.scribe.retry', lang)}</Btn>
        </div>
      )}

      {phase === 'review' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {rows.length === 0 ? <div style={small}>{t('ai.scribe.nothing', lang)}</div> : (
            <>
              <div style={{ fontSize: 12, fontWeight: 700 }}>{t('ai.scribe.review', lang)}</div>
              {rows.map(r => (
                <label key={r.key} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', borderTop: `1px solid ${C.border}`, paddingTop: 8 }}>
                  <input type="checkbox" disabled={r.same} checked={!!sel[r.key]} onChange={e => setSel(v => ({ ...v, [r.key]: e.target.checked }))} style={{ marginTop: 3 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={small}>{t(r.label, lang)}</div>
                    <div style={{ fontSize: 13, fontWeight: 700, overflowWrap: 'anywhere' }}>{r.value}</div>
                    {r.conflict && <div style={{ color: C.gold, fontSize: 11 }}>{t('ai.scribe.current', lang)}{': '}{r.current}</div>}
                    {r.quote && <div style={{ ...small, fontStyle: 'italic', overflowWrap: 'anywhere' }}>{'« '}{r.quote}{' »'}</div>}
                  </div>
                </label>
              ))}
              <div style={{ ...small, color: C.gold }}>{t('ai.scribe.draftNote', lang)}</div>
            </>
          )}
          {draft && draft.warnings && draft.warnings.length > 0 && (
            <div style={{ background: C.danger + '11', borderRadius: 8, padding: 8 }}>
              <div style={{ color: C.danger, fontSize: 12, fontWeight: 700 }}>{t('ai.scribe.warnings', lang)}</div>
              {draft.warnings.map((w, i) => <div key={i} style={{ fontSize: 12 }}>{'• '}{w}</div>)}
            </div>
          )}
          {draft && draft.transcript && (
            <details>
              <summary style={{ ...small, cursor: 'pointer' }}>{t('ai.scribe.transcript', lang)}</summary>
              <div style={{ fontSize: 12, whiteSpace: 'pre-wrap', marginTop: 6 }}>{draft.transcript}</div>
            </details>
          )}
          <div style={{ display: 'flex', gap: 8 }}>
            <Btn outline onClick={() => setPhase('idle')}>{t('ai.scribe.discard', lang)}</Btn>
            {rows.length > 0 && <Btn full onClick={apply}>{t('ai.scribe.apply', lang)}</Btn>}
          </div>
        </div>
      )}
    </div>
  );
}
