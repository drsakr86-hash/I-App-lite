// Admin-only panel inside the WhatsApp inbox: turns reviewed staff replies into clinic FAQ rows (wa_faq) the assistant may use.
import React, { useState, useEffect, useCallback } from 'react';
import { C } from '../modules/theme/index.js';
import { t, useLang } from '../modules/i18n/index.js';
import * as svc from '../modules/whatsapp/service.js';
import { isNotInstalled } from '../modules/whatsapp/model.js';
import { suggestTopic, checkApproval } from '../modules/whatsapp/knowledge.js';
import { friendlyError } from '../modules/errors/friendly.js';

const missingFn = e => isNotInstalled(e) || (!!e && (e.code === 'PGRST202' || e.code === '42883' || /could not find the function|function .* does not exist/i.test(String(e.message || ''))));
const btn = (extra = {}) => ({ background: 'transparent', border: '1px solid ' + C.border, borderRadius: 8, padding: '6px 10px', color: C.text, fontSize: 12, cursor: 'pointer', fontFamily: 'inherit', ...extra });
const field = { width: '100%', boxSizing: 'border-box', background: C.surface, border: '1px solid ' + C.border, borderRadius: 8, padding: '6px 8px', color: C.text, fontFamily: 'inherit', fontSize: 13 };

function Candidate({ c, lang, onDone }) {
  const [topic, setTopic] = useState(suggestTopic(c.question, c.answer));
  const [answer, setAnswer] = useState(c.answer || '');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const run = async decision => {
    if (decision === 'approved') { const k = checkApproval(topic, answer); if (k) { setErr(t('wa.kb.err.' + k, lang)); return; } }
    setBusy(true); setErr('');
    try { await svc.decideReply(c.message_id, decision, topic, answer); onDone(); }
    catch (e) { setErr(friendlyError(e)); setBusy(false); }
  };
  return (
    <div style={{ background: C.card, border: '1px solid ' + C.border, borderRadius: 12, padding: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ fontSize: 11, color: C.muted }}>{t('wa.kb.q', lang)}: <span style={{ color: C.text }}>{c.question || t('wa.kb.noQ', lang)}</span></div>
      <label style={{ fontSize: 11, color: C.muted }}>{t('wa.kb.topic', lang)}<input value={topic} maxLength={80} onChange={e => setTopic(e.target.value)} style={field} /></label>
      <label style={{ fontSize: 11, color: C.muted }}>{t('wa.kb.answer', lang)}<textarea value={answer} maxLength={1200} rows={3} onChange={e => setAnswer(e.target.value)} style={{ ...field, resize: 'vertical' }} /></label>
      {err && <div role="alert" style={{ color: C.danger, fontSize: 12 }}>{err}</div>}
      <div style={{ display: 'flex', gap: 6 }}>
        <button disabled={busy} onClick={() => run('approved')} style={btn({ background: C.accent, color: C.bg, borderColor: C.accent })}>{t('wa.kb.approve', lang)}</button>
        <button disabled={busy} onClick={() => run('ignored')} style={btn()}>{t('wa.kb.ignore', lang)}</button>
      </div>
    </div>
  );
}

export default function WaKnowledge() {
  const lang = useLang();
  const [st, setSt] = useState({ loading: true, missing: false, cands: [], faq: [], error: '' });
  const load = useCallback(async () => {
    try { const [cands, faq] = await Promise.all([svc.loadReplyCandidates(30), svc.loadFaq()]); setSt({ loading: false, missing: false, cands: cands || [], faq, error: '' }); }
    catch (e) { setSt({ loading: false, missing: missingFn(e), cands: [], faq: [], error: missingFn(e) ? '' : friendlyError(e) }); }
  }, []);
  useEffect(() => { load(); }, [load]);
  const toggle = async f => { try { await svc.setFaqActive(f.id, !f.active); load(); } catch (e) { setSt(s => ({ ...s, error: friendlyError(e) })); } };

  return (
    <div style={{ background: C.card, border: '1px solid ' + C.border, borderRadius: 12, padding: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ fontWeight: 700, color: C.text, fontSize: 13 }}>📚 {t('wa.kb.title', lang)}</div>
      <div style={{ fontSize: 11, color: C.muted, lineHeight: 1.7 }}>{t('wa.kb.intro', lang)}</div>
      {st.missing && <div style={{ fontSize: 12, color: C.muted }}>{t('wa.kb.notInstalled', lang)}</div>}
      {st.error && <div role="alert" style={{ color: C.danger, fontSize: 12 }}>{st.error}</div>}
      {!st.loading && !st.missing && !st.cands.length && <div style={{ fontSize: 12, color: C.muted }}>{t('wa.kb.empty', lang)}</div>}
      {st.cands.map(c => <Candidate key={c.message_id} c={c} lang={lang} onDone={load} />)}
      {!st.missing && <>
        <div style={{ fontWeight: 700, color: C.text, fontSize: 12, marginTop: 4 }}>{t('wa.kb.approved', lang)}</div>
        {!st.faq.length && <div style={{ fontSize: 12, color: C.muted }}>{t('wa.kb.noFaq', lang)}</div>}
        {st.faq.map(f => (
          <div key={f.id} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', justifyContent: 'space-between', opacity: f.active ? 1 : 0.5 }}>
            <div style={{ fontSize: 12, color: C.text }}><b>{f.topic}</b><div style={{ color: C.muted, whiteSpace: 'pre-wrap' }}>{f.answer}</div></div>
            <button onClick={() => toggle(f)} style={btn({ padding: '2px 8px', fontSize: 11, whiteSpace: 'nowrap' })}>{f.active ? t('wa.kb.disable', lang) : t('wa.kb.enable', lang)}</button>
          </div>
        ))}
      </>}
    </div>
  );
}
