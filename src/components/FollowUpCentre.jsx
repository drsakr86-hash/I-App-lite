// FollowUpCentre -- moved here from public/legacy/app-runtime.js (Phase 8,
// combined batch 19). Exact copy of the original JSX/logic, now a React
// component instead of a legacy function. Every dependency it needs (C,
// sbGet, waOpen, waFollowUpText, localISO, and the pure overdueFollowUps/
// dueInjections helpers) was already moved in earlier batches, so this moves
// as a self-contained component.
import React, { useState, useEffect } from 'react';
import { C } from '../modules/theme/index.js';
import { sbGet } from '../modules/sync/index.js';
import { localISO } from '../modules/constants/misc.js';
import { waOpen, waFollowUpText } from '../modules/notifications/index.js';
import { INJ_KEY, dueInjections, overdueFollowUps, followUpKey, hiddenMap, hiddenState, SNOOZE_DAYS } from '../modules/followups/index.js';
import { loadHidden, hideFollowUp, unhideFollowUp } from '../modules/followups/hide.js';
import { t, useLang } from '../modules/i18n/index.js';
import { tv } from '../modules/i18n/tv.js';

export default function FollowUpCentre({ visits, patients, onClose, onPatientClick }) {
  const lang = useLang();
  const [injections, setInjections] = useState([]);
  const [hidden, setHidden] = useState([]);
  const [busy, setBusy] = useState('');
  const [err, setErr] = useState('');
  const [tab, setTab] = useState('late');
  useEffect(() => {
    (async () => {
      const r = await sbGet(INJ_KEY);
      if (Array.isArray(r)) setInjections(r);
      setHidden(await loadHidden());
    })();
  }, []);
  const late = overdueFollowUps(visits, patients, hidden);
  const due = dueInjections(injections, 7);
  const today = localISO();
  const hmap = hiddenMap(hidden);
  const hiddenRows = overdueFollowUps(visits, patients, []).filter(v => hiddenState(hmap[followUpKey(v.patientId, v.nextVisit)], today));
  const rows = tab === 'late' ? late : tab === 'hidden' ? hiddenRows : due;

  // Never retried automatically: on failure the card stays and a message is shown.
  const hide = async (type, v) => {
    if (type === 'dismissed' && !window.confirm(t('g5.fu.dismissConfirm', lang, { name: v.patientName }))) return;
    const k = followUpKey(v.patientId, v.nextVisit);
    setBusy(k); setErr('');
    const rec = await hideFollowUp(type, v);
    setBusy('');
    if (rec) setHidden(h => [...h.filter(x => x.key !== rec.key), rec]);
    else setErr(t('g5.fu.saveFail', lang));
  };
  const unhide = async v => {
    const k = followUpKey(v.patientId, v.nextVisit);
    setBusy(k); setErr('');
    const ok = await unhideFollowUp(v);
    setBusy('');
    if (ok) setHidden(h => h.filter(x => x.key !== k));
    else setErr(t('g5.fu.saveFail', lang));
  };
  const hideBtn = (tone, extra = {}) => ({
    background: tone + '18', border: '1px solid ' + tone + '44', borderRadius: 9, padding: '7px 10px',
    color: tone, fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', ...extra
  });

  const tabBtn = (id, label, n) => (
    <div
      onClick={() => setTab(id)}
      style={{
        flex: 1,
        textAlign: 'center',
        padding: '8px 6px',
        borderRadius: 10,
        cursor: 'pointer',
        fontSize: 12,
        fontWeight: 700,
        background: tab === id ? C.accent + '22' : C.bg,
        color: tab === id ? C.accent : C.muted,
        border: '1px solid ' + (tab === id ? C.accent + '66' : C.border)
      }}
    >
      {label} ({n})
    </div>
  );

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.85)',
        zIndex: 500,
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'center',
        paddingTop: 50
      }}
      onClick={onClose}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: C.surface,
          borderRadius: 20,
          padding: 18,
          width: '92%',
          maxWidth: 440,
          maxHeight: '84vh',
          overflowY: 'auto',
          border: `2px solid ${C.gold}`
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <div style={{ color: C.gold, fontWeight: 800, fontSize: 15 }}>{t('g5.fu.title', lang)}</div>
          <span role="button" aria-label={t('g5.fu.close', lang)} onClick={onClose} style={{ color: C.muted, fontSize: 24, cursor: 'pointer' }}>×</span>
        </div>
        <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
          {tabBtn('late', t('g5.fu.tabLate', lang), late.length)}
          {tabBtn('inj', t('g5.fu.tabInj', lang), due.length)}
          {hiddenRows.length > 0 && tabBtn('hidden', t('g5.fu.tabHidden', lang), hiddenRows.length)}
        </div>
        {err && <div style={{ color: C.danger, fontSize: 12, textAlign: 'center', marginBottom: 8 }}>{err}</div>}
        {rows.length === 0 && (
          <div style={{ color: C.muted, fontSize: 13, textAlign: 'center', padding: '26px 0' }}>{t('g5.fu.empty', lang)}</div>
        )}
        {tab === 'late' && late.map(v => (
          <div
            key={v.id}
            style={{
              background: C.card,
              border: `1px solid ${v.late > 60 ? C.danger : C.gold}55`,
              borderRadius: 12,
              padding: '11px 13px',
              marginBottom: 8
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
              <span
                onClick={() => {
                  if (onPatientClick) {
                    onPatientClick(v.patientId);
                    onClose();
                  }
                }}
                style={{ color: C.text, fontWeight: 700, fontSize: 13, cursor: 'pointer', textDecoration: 'underline' }}
              >
                {v.patientName}
              </span>
              <span style={{ color: v.late > 60 ? C.danger : C.gold, fontSize: 11, fontWeight: 700 }}>{t('g5.fu.lateDays', lang, { n: v.late })}</span>
            </div>
            <div style={{ color: C.muted, fontSize: 11, marginTop: 3 }}>{t('g5.fu.shouldHave', lang, { next: v.nextVisit, last: v.date })}</div>
            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
              <button
                onClick={() => waOpen(v.patientPhone, waFollowUpText(v.patientName, v.nextVisit, t('g5.fu.waReasonFollow', lang)))}
                style={{
                  flex: 1,
                  background: '#25D36622',
                  border: '1px solid #25D36655',
                  borderRadius: 9,
                  padding: '7px 10px',
                  color: '#25D366',
                  fontSize: 11,
                  fontWeight: 800,
                  cursor: 'pointer',
                  fontFamily: 'inherit'
                }}
              >
                {t('g5.fu.waRemind', lang)}
              </button>
              {v.patientPhone && (
                <a
                  href={'tel:' + v.patientPhone}
                  style={{
                    background: C.accent + '22',
                    border: '1px solid ' + C.accent + '44',
                    borderRadius: 9,
                    padding: '7px 12px',
                    color: C.accent,
                    fontSize: 11,
                    fontWeight: 700,
                    textDecoration: 'none'
                  }}
                >
                  {t('g5.fu.call', lang)}
                </a>
              )}
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
              <button disabled={busy === followUpKey(v.patientId, v.nextVisit)} onClick={() => hide('snoozed', v)} style={hideBtn(C.gold, { flex: 1 })}>
                {t('g5.fu.snooze', lang, { n: SNOOZE_DAYS })}
              </button>
              <button disabled={busy === followUpKey(v.patientId, v.nextVisit)} onClick={() => hide('dismissed', v)} style={hideBtn(C.danger, { flex: 1 })}>
                {t('g5.fu.dismiss', lang)}
              </button>
            </div>
          </div>
        ))}
        {tab === 'hidden' && hiddenRows.map(v => {
          const r = hmap[followUpKey(v.patientId, v.nextVisit)] || {};
          return (
            <div key={v.id} style={{ background: C.card, border: '1px solid ' + C.border, borderRadius: 12, padding: '11px 13px', marginBottom: 8, opacity: 0.85 }}>
              <div style={{ color: C.text, fontWeight: 700, fontSize: 13 }}>{v.patientName}</div>
              <div style={{ color: C.muted, fontSize: 11, marginTop: 3 }}>
                {t('g5.fu.hiddenLine', lang, { next: v.nextVisit, state: r.type === 'dismissed' ? t('g5.fu.dismissedState', lang) : t('g5.fu.hiddenUntil', lang, { until: r.until }) })}
              </div>
              <button disabled={busy === followUpKey(v.patientId, v.nextVisit)} onClick={() => unhide(v)} style={hideBtn(C.accent, { marginTop: 8 })}>{t('g5.fu.restore', lang)}</button>
            </div>
          );
        })}
        {tab === 'inj' && due.map(x => {
          const p = (patients || []).find(p => p.id === x.patientId) || {};
          const days = Math.round((new Date(x.nextDate) - new Date(localISO())) / 86400000);
          return (
            <div
              key={x.id}
              style={{
                background: C.card,
                border: `1px solid ${days < 0 ? C.danger : C.teal}55`,
                borderRadius: 12,
                padding: '11px 13px',
                marginBottom: 8
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                <span style={{ color: C.text, fontWeight: 700, fontSize: 13 }}>{x.patient || p.name || '—'}</span>
                <span style={{ color: days < 0 ? C.danger : C.teal, fontSize: 11, fontWeight: 700 }}>
                  {days < 0 ? t('g5.fu.injLate', lang, { n: -days }) : days === 0 ? t('g5.fu.injToday', lang) : t('g5.fu.injIn', lang, { n: days })}
                </span>
              </div>
              <div style={{ color: C.muted, fontSize: 11, marginTop: 3 }}>
                {t('g5.fu.injLine', lang, { drug: x.drug, eye: tv(x.eye), dose: x.doseNo || '—', date: x.date })}
              </div>
              <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                <button
                  onClick={() => waOpen(x.phone || p.phone, waFollowUpText(x.patient || p.name, x.nextDate, t('g5.fu.waReasonInj', lang)))}
                  style={{
                    flex: 1,
                    background: '#25D36622',
                    border: '1px solid #25D36655',
                    borderRadius: 9,
                    padding: '7px 10px',
                    color: '#25D366',
                    fontSize: 11,
                    fontWeight: 800,
                    cursor: 'pointer',
                    fontFamily: 'inherit'
                  }}
                >
                  {t('g5.fu.waRemind', lang)}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
