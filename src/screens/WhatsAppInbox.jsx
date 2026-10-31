// Secretary inbox for the official WhatsApp assistant (+ Facebook Messenger and Instagram Direct, same queue and assistant). Admin + secretary only (RLS enforces it; the screen is also gated by the callers).
// Never shows credentials; sending goes through the whatsapp-send Edge Function. Degrades to a notice while the wa_* tables are absent.
import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { C } from '../modules/theme/index.js';
import { t, useLang, dirOf } from '../modules/i18n/index.js';
import { logError } from '../services/logger.js';
import {
  filterConversations, FILTERS, ownerOf, windowOpen, windowLeftMin, deliveryKey, canRetry, isUncertain, bookingState, newClientId, buildErrorRows, channelOf, CHANNEL_COLOR, lookupPhone, contactLabel
} from '../modules/whatsapp/model.js';
import * as svc from '../modules/whatsapp/service.js';
import { pushStatus, enablePush, disablePush, pushDiagnostics } from '../modules/whatsapp/push.js';
import { QUICK_REPLIES, applyQuickReply } from '../modules/whatsapp/quickReplies.js';

const POLL_MS = 5000;
const pill = (color, text, key) => <span key={key} style={{ background: color + '22', color, border: '1px solid ' + color + '44', borderRadius: 20, padding: '2px 8px', fontSize: 10, fontWeight: 700, whiteSpace: 'nowrap' }}>{text}</span>;
const ownerColor = o => (o === 'ai' ? C.teal : o === 'human' ? C.accent : C.muted);
const bColor = s => (s === 'confirmed' ? C.green || C.teal : s === 'cancelled' ? C.danger : C.accent);
const btn = (extra = {}) => ({ background: 'transparent', border: '1px solid ' + C.border, borderRadius: 8, padding: '6px 10px', color: C.text, fontSize: 12, cursor: 'pointer', fontFamily: 'inherit', ...extra });

export default function WhatsAppInbox({ session }) {
  const lang = useLang();
  const me = String((session && session.email) || '').toLowerCase();
  const [state, setState] = useState({ loading: true, installed: true, rows: [], failedIds: new Set(), error: null });
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [selId, setSelId] = useState(null);
  const [msgs, setMsgs] = useState([]);
  const [apts, setApts] = useState([]);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [push, setPush] = useState('unsupported');
  const [pushBusy, setPushBusy] = useState(false);
  const [pushDiag, setPushDiag] = useState('');
  const [errPanel, setErrPanel] = useState(null);   // null = closed, array = rows (admin only)
  const clientId = useRef(newClientId());
  const endRef = useRef(null);

  const loadList = useCallback(async () => {
    try { const r = await svc.loadConversations(); setState({ loading: false, installed: r.installed, rows: r.rows, failedIds: r.failedIds, error: null }); }
    catch (e) { logError('whatsapp.list', e); setState(s => ({ ...s, loading: false, error: e.message })); }
  }, []);
  const sel = state.rows.find(c => c.id === selId) || null;
  const loadThread = useCallback(async () => {
    if (!selId) return;
    try { setMsgs(await svc.loadMessages(selId)); } catch (e) { logError('whatsapp.thread', e); }
  }, [selId]);

  useEffect(() => { pushStatus().then(setPush).catch(() => {}); pushDiagnostics().then(setPushDiag); }, []);
  useEffect(() => { loadList(); const iv = setInterval(loadList, POLL_MS); return () => clearInterval(iv); }, [loadList]);
  useEffect(() => { loadThread(); if (!selId) return undefined; const iv = setInterval(loadThread, POLL_MS); return () => clearInterval(iv); }, [loadThread, selId]);
  useEffect(() => { if (sel && sel.unread_count > 0) svc.markRead(sel.id).then(loadList).catch(e => logError('whatsapp.read', e)); }, [selId, sel && sel.unread_count]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { setApts([]); if (sel && sel.contact) svc.loadAppointments(lookupPhone(sel)).then(setApts).catch(() => {}); }, [selId]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (endRef.current && endRef.current.scrollIntoView) endRef.current.scrollIntoView({ block: 'end' }); }, [msgs.length, selId]);

  const shown = useMemo(() => filterConversations(state.rows, { filter, search, me, failedIds: state.failedIds }), [state.rows, state.failedIds, filter, search, me]);
  const act = async fn => { setErr(''); try { await fn(); await loadList(); await loadThread(); } catch (e) { logError('whatsapp.act', e); setErr(e.message || t('g9.wa.error', lang)); } };

  const togglePush = async () => {
    if (pushBusy) return;
    setErr(''); setPushBusy(true);
    try { if (push === 'on') await disablePush(); else await enablePush(); }
    catch (e) {
      logError('whatsapp.push', e);
      const m = String(e && e.message || '');
      setErr(m === 'push-not-configured' ? t('g9.wa.push.notConfigured', lang) : m === 'permission-denied' ? t('g9.wa.push.denied', lang) : m === 'permission-default' ? t('g9.wa.push.dismissed', lang) : m === 'sw-not-ready' ? t('g9.wa.push.swNotReady', lang) : t('g9.wa.push.fail', lang) + (m ? ' (' + m.slice(0, 80) + ')' : ''));
    }
    finally { setPushBusy(false); try { setPush(await pushStatus()); setPushDiag(await pushDiagnostics()); } catch { /* keep the old state */ } }
  };

  const toggleErrors = async () => {
    if (errPanel) { setErrPanel(null); return; }
    try { setErrPanel(buildErrorRows(await svc.loadSystemErrors())); } catch (e) { logError('whatsapp.errors', e); setErr(e.message || t('g9.wa.error', lang)); }
  };

  const removeConv = async () => {
    if (!sel) return;
    if (owner === 'ai') { setErr(t('g9.wa.deleteActive', lang)); return; }
    if (!window.confirm(t('g9.wa.deleteConfirm', lang))) return;
    setErr('');
    try { await svc.deleteConv(sel.id); setSelId(null); await loadList(); }
    catch (e) { logError('whatsapp.delete', e); setErr(/conversation_active/.test(String(e && e.message)) ? t('g9.wa.deleteActive', lang) : (e.message || t('g9.wa.error', lang))); }
  };

  const send = async () => {
    const text = draft.trim(); if (!text || !sel || busy) return;
    setBusy(true); setErr('');
    try { await svc.sendManual(sel.id, text, clientId.current); setDraft(''); clientId.current = newClientId(); await loadThread(); await loadList(); }
    catch (e) { setErr(e.code === 'WINDOW_CLOSED' ? t('g9.wa.windowClosed', lang) : (t('g9.wa.sendFail', lang) + (e.message ? ': ' + e.message : ''))); }
    finally { setBusy(false); }
  };

  if (state.loading) return <div style={{ padding: 24, color: C.muted }}>{t('common.loading', lang)}</div>;
  if (!state.installed) return <div style={{ padding: 24, color: C.muted, lineHeight: 1.8 }}>💬 {t('g9.wa.notInstalled', lang)}</div>;

  const owner = ownerOf(sel);
  const open = windowOpen(sel);
  const consent = sel && sel.contact;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: 12, direction: dirOf(lang) }}>
      {!sel && (
        <>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder={t('g9.wa.search', lang)} aria-label={t('g9.wa.search', lang)} style={{ flex: 1, background: C.card, border: '1px solid ' + C.border, borderRadius: 10, padding: '9px 12px', color: C.text, fontFamily: 'inherit', fontSize: 13 }} />
            <button onClick={loadList} aria-label={t('g9.wa.refresh', lang)} style={btn()}>🔄</button>
            {session && session.role === 'admin' && <button onClick={toggleErrors} aria-label={t('g9.wa.errors', lang)} title={t('g9.wa.errors', lang)} style={btn(errPanel ? { borderColor: C.danger, color: C.danger } : {})}>⚠️</button>}
          </div>
          <div style={{ display: 'flex', gap: 6, overflowX: 'auto' }}>
            {FILTERS.map(f => <button key={f} onClick={() => setFilter(f)} style={btn({ background: filter === f ? C.accent + '22' : 'transparent', color: filter === f ? C.accent : C.muted, borderColor: filter === f ? C.accent : C.border, whiteSpace: 'nowrap' })}>{t('g9.wa.f.' + f, lang)}</button>)}
          </div>
          {(push === 'on' || push === 'off') && <button onClick={togglePush} disabled={pushBusy} style={btn({ borderColor: push === 'on' ? C.teal : C.accent, color: push === 'on' ? C.teal : C.accent })}>{pushBusy ? '⏳ ...' : t('g9.wa.push.' + push, lang)}</button>}
          {push === 'needs-install' && <div style={{ color: C.muted, fontSize: 12 }}>{t('g9.wa.push.install', lang)}</div>}
          {push === 'denied' && <div style={{ color: C.muted, fontSize: 12 }}>{t('g9.wa.push.denied', lang)}</div>}
          {err && <div role="alert" style={{ color: C.danger, fontSize: 12, wordBreak: 'break-word' }}>{err}</div>}
          {pushDiag && push !== 'on' && push !== 'unsupported' && <div style={{ color: C.muted, fontSize: 10, direction: 'ltr', textAlign: 'left', wordBreak: 'break-word' }}>{pushDiag}</div>}
          {errPanel && (
            <div style={{ background: C.card, border: '1px solid ' + C.danger + '66', borderRadius: 12, padding: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div style={{ fontWeight: 700, color: C.text, fontSize: 13 }}>{'⚠️ ' + t('g9.wa.errors', lang)}</div>
              {!errPanel.length && <div style={{ color: C.muted, fontSize: 12 }}>{t('g9.wa.errors.empty', lang)}</div>}
              {errPanel.map(r => (
                <div key={r.key} style={{ borderTop: '1px solid ' + C.border, paddingTop: 6, fontSize: 12 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, color: C.muted, fontSize: 11 }}>
                    <span>{t('g9.wa.errors.k.' + r.kind, lang)}{r.conv ? ' · ' + t('g9.wa.errors.conv', lang) + ' ' + r.conv : ''}</span>
                    <span>{new Date(r.at).toLocaleString(lang === 'en' ? 'en-GB' : 'ar-EG', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' })}</span>
                  </div>
                  <div style={{ color: C.text, direction: 'ltr', textAlign: 'left', wordBreak: 'break-word' }}>{r.text}</div>
                </div>
              ))}
            </div>
          )}
          {state.error && <div style={{ color: C.danger, fontSize: 12 }}>{t('g9.wa.error', lang)}</div>}
          {!shown.length && <div style={{ color: C.muted, padding: 20, textAlign: 'center' }}>{t('g9.wa.empty', lang)}</div>}
          {shown.map(c => {
            const o = ownerOf(c);
            return (
              <div key={c.id} onClick={() => setSelId(c.id)} style={{ background: C.card, border: '1px solid ' + (c.unread_count > 0 ? C.accent : C.border), borderRadius: 12, padding: '10px 12px', cursor: 'pointer' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center' }}>
                  <div style={{ fontWeight: 700, color: C.text, fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{contactLabel(c, t('g9.wa.ch.' + channelOf(c), lang))}</div>
                  <div style={{ fontSize: 10, color: C.muted, whiteSpace: 'nowrap' }}>{c.last_message_at ? new Date(c.last_message_at).toLocaleString(lang === 'en' ? 'en-GB' : 'ar-EG', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' }) : ''}</div>
                </div>
                <div style={{ color: C.muted, fontSize: 12, margin: '4px 0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.last_preview || '—'}</div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {channelOf(c) !== 'whatsapp' && pill(CHANNEL_COLOR[channelOf(c)], t('g9.wa.ch.' + channelOf(c), lang), 'ch')}
                  {pill(ownerColor(o), t('g9.wa.owner.' + o, lang), 'o')}
                  {c.handoff_reason === 'urgent' && pill(C.danger, '⚠ ' + t('g9.wa.urgent', lang), 'u')}
                  {c.unread_count > 0 && pill(C.accent, String(c.unread_count), 'n')}
                  {state.failedIds.has(c.id) && pill(C.danger, t('g9.wa.f.failed', lang), 'f')}
                  {c.assigned_to && pill(C.muted, c.assigned_to.split('@')[0], 'a')}
                </div>
              </div>
            );
          })}
        </>
      )}

      {sel && (
        <>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <button onClick={() => setSelId(null)} style={btn()}>{lang === 'en' ? '←' : '→'} {t('g9.wa.back', lang)}</button>
            <div style={{ fontWeight: 700, color: C.text }}>{contactLabel(sel, t('g9.wa.ch.' + channelOf(sel), lang))}</div>
            {channelOf(sel) === 'whatsapp'
              ? <div style={{ color: C.muted, fontSize: 11, direction: 'ltr' }}>{sel.contact && sel.contact.wa_id}</div>
              : <>{pill(CHANNEL_COLOR[channelOf(sel)], t('g9.wa.ch.' + channelOf(sel), lang), 'ch')}<div style={{ color: C.muted, fontSize: 11 }} title={t('g9.wa.typedPhone', lang)}>{sel.contact && sel.contact.phone ? <span style={{ direction: 'ltr', unicodeBidi: 'embed' }}>📞 {sel.contact.phone}</span> : t('g9.wa.noPhoneYet', lang)}</div></>}
            {pill(ownerColor(owner), t('g9.wa.owner.' + owner, lang), 'o')}
            {sel.handoff_reason && pill(sel.handoff_reason === 'urgent' ? C.danger : C.muted, t('g9.wa.reason.' + sel.handoff_reason, lang) === 'g9.wa.reason.' + sel.handoff_reason ? t('g9.wa.reason.other', lang) : t('g9.wa.reason.' + sel.handoff_reason, lang), 'r')}
          </div>

          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {owner === 'ai' && <button style={btn({ borderColor: C.accent, color: C.accent })} onClick={() => act(() => svc.takeOver(sel.id))}>{t('g9.wa.takeOver', lang)}</button>}
            {owner === 'human' && <button style={btn({ borderColor: C.teal, color: C.teal })} onClick={() => act(() => svc.returnToAi(sel.id))}>{t('g9.wa.returnAi', lang)}</button>}
            {sel.assigned_to !== me ? <button style={btn()} onClick={() => act(() => svc.assign(sel.id, me))}>{t('g9.wa.assign', lang)}</button> : <button style={btn()} onClick={() => act(() => svc.assign(sel.id, null))}>{t('g9.wa.unassign', lang)}</button>}
            {owner !== 'closed' && <button style={btn()} onClick={() => act(() => svc.closeConv(sel.id))}>{t('g9.wa.close', lang)}</button>}
            {session && session.role === 'admin' && <button style={btn({ borderColor: C.danger, color: C.danger })} onClick={removeConv}>{'🗑 ' + t('g9.wa.delete', lang)}</button>}
          </div>
          <div style={{ fontSize: 11, color: C.muted }}>{owner === 'ai' ? t('g9.wa.aiOn', lang) : t('g9.wa.aiOff', lang)}{sel.assigned_to ? ' · ' + t('g9.wa.assignedTo', lang, { n: sel.assigned_to.split('@')[0] }) : ''}{open ? ' · ' + t('g9.wa.windowLeft', lang, { m: windowLeftMin(sel) }) : ''}</div>

          <div style={{ background: C.card, border: '1px solid ' + C.border, borderRadius: 12, padding: 10, maxHeight: '45vh', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8 }}>
            {msgs.map(m => {
              const mine = m.direction === 'out', dk = deliveryKey(m);
              return (
                <div key={m.id} style={{ alignSelf: mine ? 'flex-end' : 'flex-start', maxWidth: '86%', background: mine ? C.accent + '22' : C.surface, border: '1px solid ' + (m.status === 'failed' ? C.danger : C.border), borderRadius: 12, padding: '7px 10px' }}>
                  <div style={{ fontSize: 10, color: C.muted, marginBottom: 2 }}>{t('g9.wa.who.' + m.sender, lang)}{m.sent_by ? ' · ' + m.sent_by.split('@')[0] : ''} · {new Date(m.created_at).toLocaleTimeString(lang === 'en' ? 'en-GB' : 'ar-EG', { hour: '2-digit', minute: '2-digit' })}</div>
                  <div style={{ color: C.text, fontSize: 13, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{m.body || (m.kind === 'template' ? '[' + (m.template_name || 'template') + ']' : '[…]')}</div>
                  {dk && <div style={{ fontSize: 10, marginTop: 3, color: m.status === 'failed' ? C.danger : C.muted }}>
                    {t('g9.wa.d.' + dk, lang)}{m.status === 'failed' && m.error_code ? ' (' + m.error_code + ')' : ''}
                    {isUncertain(m) && <div>{t('g9.wa.uncertain', lang)}</div>}
                    {canRetry(m) && <button style={btn({ marginInlineStart: 8, padding: '2px 8px', fontSize: 10 })} onClick={() => act(() => svc.retryMessage(m.id))}>{t('g9.wa.retry', lang)}</button>}
                  </div>}
                </div>
              );
            })}
            <div ref={endRef} />
          </div>

          {err && <div role="alert" style={{ color: C.danger, fontSize: 12 }}>{err}</div>}
          {!open && owner !== 'closed' && <div style={{ color: C.muted, fontSize: 12, lineHeight: 1.7 }}>{t('g9.wa.windowClosed', lang)}</div>}
          {open && <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 2 }} aria-label="ردود جاهزة">
            {QUICK_REPLIES.map(q => <button key={q.id} type="button" disabled={busy} onClick={() => setDraft(d => applyQuickReply(d, q.text))} style={btn({ whiteSpace: 'nowrap', padding: '4px 10px', fontSize: 11, borderRadius: 20 })}>{q.label}</button>)}
          </div>}
          <div style={{ display: 'flex', gap: 6 }}>
            <textarea value={draft} onChange={e => setDraft(e.target.value)} rows={2} maxLength={4000} disabled={!open || busy} placeholder={t('g9.wa.placeholder', lang)} aria-label={t('g9.wa.placeholder', lang)} style={{ flex: 1, background: C.card, border: '1px solid ' + C.border, borderRadius: 10, padding: '8px 10px', color: C.text, fontFamily: 'inherit', fontSize: 13, resize: 'none' }} />
            <button onClick={send} disabled={!open || busy || !draft.trim()} style={btn({ background: C.accent, color: C.bg, borderColor: C.accent, opacity: (!open || busy || !draft.trim()) ? 0.5 : 1 })}>{busy ? t('g9.wa.sending', lang) : t('g9.wa.send', lang)}</button>
          </div>
          {owner === 'ai' && <div style={{ color: C.muted, fontSize: 11 }}>{t('g9.wa.takeOver', lang)} ⟵ {t('g9.wa.aiOn', lang)}</div>}

          <div style={{ background: C.card, border: '1px solid ' + C.border, borderRadius: 12, padding: 10 }}>
            <div style={{ fontWeight: 700, color: C.text, fontSize: 12, marginBottom: 6 }}>{t('g9.wa.booking', lang)}</div>
            {!apts.length && <div style={{ color: C.muted, fontSize: 12 }}>{t('g9.wa.noBooking', lang)}</div>}
            {apts.map(a => { const s = bookingState(a); return (
              <div key={a.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 12, color: C.text, padding: '4px 0', alignItems: 'center' }}>
                <span>{a.date} · {a.time} · {a.clinic}</span>{pill(bColor(s), t('g9.wa.b.' + s, lang), 's')}
              </div>
            ); })}
          </div>

          {consent && channelOf(sel) === 'whatsapp' && (
            <div style={{ background: C.card, border: '1px solid ' + C.border, borderRadius: 12, padding: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <div style={{ fontSize: 12, color: C.text }}>{t('g9.wa.reminders', lang)}: {consent.consent === 'opted_out' ? pill(C.danger, t('g9.wa.optedOut', lang), 'c') : consent.reminders_opt_in ? pill(C.teal, t('g9.wa.remOn', lang), 'c') : pill(C.muted, t('g9.wa.remOff', lang), 'c')}</div>
              {consent.consent !== 'opted_out' && <button style={btn()} onClick={() => act(() => svc.setReminderConsent(consent.id, !consent.reminders_opt_in))}>{consent.reminders_opt_in ? t('g9.wa.remDisable', lang) : t('g9.wa.remEnable', lang)}</button>}
            </div>
          )}
        </>
      )}
    </div>
  );
}
