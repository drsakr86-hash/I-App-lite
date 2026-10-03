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

export default function FollowUpCentre({ visits, patients, onClose, onPatientClick }) {
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
    if (type === 'dismissed' && !window.confirm('عدم تذكيرك بحالة ' + v.patientName + ' مرة أخرى؟ (تقدر ترجعها من تبويب «مخفية»)')) return;
    const k = followUpKey(v.patientId, v.nextVisit);
    setBusy(k); setErr('');
    const rec = await hideFollowUp(type, v);
    setBusy('');
    if (rec) setHidden(h => [...h.filter(x => x.key !== rec.key), rec]);
    else setErr('تعذر الحفظ، حاول مرة أخرى.');
  };
  const unhide = async v => {
    const k = followUpKey(v.patientId, v.nextVisit);
    setBusy(k); setErr('');
    const ok = await unhideFollowUp(v);
    setBusy('');
    if (ok) setHidden(h => h.filter(x => x.key !== k));
    else setErr('تعذر الحفظ، حاول مرة أخرى.');
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
          <div style={{ color: C.gold, fontWeight: 800, fontSize: 15 }}>🔔 المتابعات</div>
          <span onClick={onClose} style={{ color: C.muted, fontSize: 24, cursor: 'pointer' }}>×</span>
        </div>
        <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
          {tabBtn('late', 'متأخرة', late.length)}
          {tabBtn('inj', 'حقن مستحقة', due.length)}
          {hiddenRows.length > 0 && tabBtn('hidden', 'مخفية', hiddenRows.length)}
        </div>
        {err && <div style={{ color: C.danger, fontSize: 12, textAlign: 'center', marginBottom: 8 }}>{err}</div>}
        {rows.length === 0 && (
          <div style={{ color: C.muted, fontSize: 13, textAlign: 'center', padding: '26px 0' }}>لا يوجد شيء هنا 👌</div>
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
              <span style={{ color: v.late > 60 ? C.danger : C.gold, fontSize: 11, fontWeight: 700 }}>متأخر {v.late} يوم</span>
            </div>
            <div style={{ color: C.muted, fontSize: 11, marginTop: 3 }}>📅 كان مفروض: {v.nextVisit} · آخر زيارة {v.date}</div>
            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
              <button
                onClick={() => waOpen(v.patientPhone, waFollowUpText(v.patientName, v.nextVisit, 'موعد المتابعة'))}
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
                💬 تذكير واتساب
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
                  📞 اتصال
                </a>
              )}
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
              <button disabled={busy === followUpKey(v.patientId, v.nextVisit)} onClick={() => hide('snoozed', v)} style={hideBtn(C.gold, { flex: 1 })}>
                ✔ تم التذكير (إخفاء {SNOOZE_DAYS} أيام)
              </button>
              <button disabled={busy === followUpKey(v.patientId, v.nextVisit)} onClick={() => hide('dismissed', v)} style={hideBtn(C.danger, { flex: 1 })}>
                🚫 لا أتوقع حضوره
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
                كان مفروض: {v.nextVisit} · {r.type === 'dismissed' ? 'لن يتم تذكيرك به' : 'مخفي حتى ' + r.until}
              </div>
              <button disabled={busy === followUpKey(v.patientId, v.nextVisit)} onClick={() => unhide(v)} style={hideBtn(C.accent, { marginTop: 8 })}>↩ إرجاع للمتابعات</button>
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
                  {days < 0 ? 'متأخرة ' + -days + ' يوم' : days === 0 ? 'اليوم' : 'بعد ' + days + ' يوم'}
                </span>
              </div>
              <div style={{ color: C.muted, fontSize: 11, marginTop: 3 }}>
                💉 {x.drug} · {x.eye} · الجرعة رقم {x.doseNo || '—'} · آخر حقنة {x.date}
              </div>
              <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                <button
                  onClick={() => waOpen(x.phone || p.phone, waFollowUpText(x.patient || p.name, x.nextDate, 'موعد الحقنة داخل العين'))}
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
                  💬 تذكير واتساب
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
