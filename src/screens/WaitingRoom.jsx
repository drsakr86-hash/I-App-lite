import React, { useEffect, useState } from 'react';
import { buildQueueView, estimateWait, fmtWait, transitions } from '../modules/queue/index.js';
import { C } from '../modules/theme/index.js';
import { clinicLabel } from '../modules/constants/index.js';
import { inp } from '../modules/ui/atoms.jsx';
import { broadcastCall, callChannel } from '../modules/realtime/index.js';

const btn = (C, tone, extra = {}) => ({
  background: C[tone] + '22',
  border: '1px solid ' + C[tone] + '44',
  borderRadius: 8,
  padding: '6px 12px',
  color: C[tone],
  fontSize: 11,
  fontWeight: 700,
  cursor: 'pointer',
  fontFamily: 'inherit',
  ...extra
});

// Exported so the legacy runtime's own WaitingRoom (still used under
// ?ui=legacy) can delegate to this exact component instead of keeping its
// own copy (Phase 8, batch 7) — see main.jsx / app-runtime.js.
export function PayBadge({ a, onCollect, C }) {
  const tone = a.cost ? (a.paid ? 'success' : 'danger') : 'gold';
  const style = {
    background: C[tone] + '22', color: C[tone], borderRadius: 6,
    padding: '2px 7px', fontSize: 9, fontWeight: 700, cursor: 'pointer'
  };
  return (
    <span onClick={() => onCollect(a)} style={style}>
      {a.cost ? <>{a.paid ? '✓ مدفوع' : 'غير مدفوع'} {a.cost}ج</> : '💰 تحصيل'}
    </span>
  );
}

// Compact action button (33% border, tighter padding) used in list rows.
const mini = (C, tone, extra = {}) => ({
  ...btn(C, tone), border: '1px solid ' + C[tone] + '33', padding: '6px 8px', fontWeight: 400, ...extra
});

function Section({ C, title, children, top = 12 }) {
  return (
    <>
      <div style={{ color: C.muted, fontSize: 11, fontWeight: 700, marginBottom: 8, marginTop: top }}>{title}</div>
      {children}
    </>
  );
}

function Row({ C, a, sub, children, border, single, dim }) {
  return (
    <div style={{
      background: C.card, border: '1px solid ' + (border || C.border), borderRadius: 12,
      padding: '10px 14px', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
      opacity: dim ? 0.75 : 1
    }}>
      <div style={{ flex: 1, minWidth: 100 }}>
        {single
          ? <div style={{ color: C.muted, fontSize: 12 }}>{sub}</div>
          : <><div style={{ color: C.text, fontSize: 13, fontWeight: 600 }}>{a.patient}</div>
            <div style={{ color: C.muted, fontSize: 11 }}>{sub}</div></>}
      </div>
      {children}
    </div>
  );
}

export default function WaitingRoom({ apts, today, onUpdateApt, onCollect, doctorNames = [], isAdmin = false }) {
  useEffect(() => { callChannel(); }, []);

  const priorityKey = 'iapp_priority_doctor_' + today;
  const [priorityDoctor, setPriorityDoctor] = useState(() => {
    try { return localStorage.getItem(priorityKey) || ''; } catch { return ''; }
  });
  const [clock, setClock] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setClock(Date.now()), 60000);
    return () => clearInterval(t);
  }, []);

  const setPriority = d => {
    setPriorityDoctor(d);
    try { d ? localStorage.setItem(priorityKey, d) : localStorage.removeItem(priorityKey); } catch { /* storage unavailable (private mode / quota): non-fatal */ }
  };

  const v = buildQueueView(apts, { today, priorityDoctor, doctorNames });
  const { waiting, called, inRoom, done, postponed, noShow, pending, stale, orderedWaiting, priorityOptions, avgDurationMin } = v;
  const go = (a, key) => onUpdateApt(transitions[key](a, Date.now()));
  const place = a => a.time + ' · ' + a.type + ' · ' + clinicLabel(a.clinic);

  const call = a => {
    const upd = transitions.call(a, Date.now());
    onUpdateApt(upd);
    broadcastCall(upd);
  };
  const cancelStatus = a => {
    if (!window.confirm('إلغاء حالة ' + a.patient + ' وإرجاعه إلى «لم يصل»؟')) return;
    return go(a, 'cancelStatus');
  };
  const closeStale = async () => {
    if (!window.confirm(`إغلاق ${stale.length} حالة منسية من أيام سابقة؟`)) return;
    for (const a of stale) await onUpdateApt(transitions.cancelArrival(a));
  };

  const stats = [
    { l: 'ينتظر', v: waiting.length, c: C.gold },
    { l: 'في العيادة', v: inRoom.length, c: C.accent },
    { l: 'انتهى', v: done.length, c: C.success },
    { l: 'مؤجل', v: postponed.length, c: C.purple },
    { l: 'لم يصل', v: pending.length, c: C.muted },
    { l: 'لم يحضر', v: noShow.length, c: C.danger }
  ];
  const gradBtn = { background: `linear-gradient(135deg,${C.accent},${C.teal})`, border: 'none', borderRadius: 9, padding: '8px 12px', color: C.bg, fontSize: 11, fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' };

  return (
    <div style={{ padding: '12px 16px 100px', animation: 'slideUp 0.25s ease' }}>
      {stale.length > 0 && (
        <div style={{ background: C.gold + '18', border: `1px solid ${C.gold}66`, borderRadius: 12, padding: '10px 12px', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ flex: 1, color: C.text, fontSize: 12, fontWeight: 700 }}>
            {`⚠️ ${stale.length} حالة منسية من أيام سابقة: ${stale.map(a => a.patient).join('، ')}`}
          </div>
          <button onClick={closeStale} style={{ ...btn(C, 'gold'), background: C.gold + '33', border: `1px solid ${C.gold}88`, borderRadius: 9, padding: '8px 12px', fontWeight: 800 }}>إغلاق الكل</button>
        </div>
      )}

      <div style={{ background: C.card, border: `1px solid ${priorityDoctor ? C.accent : C.border}`, borderRadius: 12, padding: '10px 12px', marginBottom: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
          <span style={{ fontSize: 16 }}>👨‍⚕️</span>
          <div style={{ flex: 1, color: C.text, fontWeight: 800, fontSize: 12 }}>طبيب اليوم / صاحب الأولوية</div>
          {priorityDoctor && <span style={{ background: C.accent + '22', color: C.accent, borderRadius: 8, padding: '2px 7px', fontSize: 9, fontWeight: 700 }}>أولوية</span>}
        </div>
        <select value={priorityDoctor} onChange={e => setPriority(e.target.value)} style={{ ...inp(), padding: '8px 10px', fontSize: 12 }}>
          <option value="">بدون أولوية محددة</option>
          {priorityOptions.map(d => <option key={d} value={d}>{d}</option>)}
        </select>
        {priorityDoctor && <div style={{ color: C.muted, fontSize: 9, marginTop: 5 }}>حالات هذا الطبيب تظهر أولاً في قائمة الانتظار، بينما حالات الأطباء الآخرين تظل في الانتظار.</div>}
        {priorityOptions.length === 0 && <div style={{ color: C.muted, fontSize: 9, marginTop: 5 }}>لا يوجد طبيب آخر مسجل له موعد اليوم.</div>}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6,1fr)', gap: 6, marginBottom: 16 }}>
        {stats.map(s => (
          <div key={s.l} style={{ background: C.card, borderRadius: 10, padding: '10px 2px', textAlign: 'center', border: '1px solid ' + C.border }}>
            <div style={{ color: s.c, fontSize: 18, fontWeight: 800 }}>{s.v}</div>
            <div style={{ color: C.muted, fontSize: 8 }}>{s.l}</div>
          </div>
        ))}
      </div>

      {v.hasDurations && (
        <div style={{ textAlign: 'center', color: C.muted, fontSize: 11, marginBottom: 12 }}>
          ⏱ متوسط وقت الكشف: <span style={{ color: C.accent, fontWeight: 700 }}>{avgDurationMin} دقيقة</span>
        </div>
      )}

      {called.map(a => (
        <div key={a.id} style={{ background: `linear-gradient(135deg,${C.gold}25,${C.accent}12)`, border: '2px solid ' + C.gold, borderRadius: 14, padding: '12px 14px', marginBottom: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ fontSize: 24 }}>📣</div>
            <div style={{ flex: 1 }}>
              <div style={{ color: C.gold, fontWeight: 900, fontSize: 15 }}>تم استدعاء المريض</div>
              <div style={{ color: C.text, fontWeight: 700, fontSize: 14 }}>{a.patient}</div>
              <div style={{ color: C.muted, fontSize: 10 }}>{a.doctor || ''} · {clinicLabel(a.clinic)}</div>
            </div>
            <button title="إعادة النداء على كل الشاشات" onClick={() => broadcastCall(a, Date.now())}
              style={{ ...btn(C, 'gold'), borderRadius: 9, padding: '8px 10px', fontWeight: 800, marginLeft: 6 }}>🔁 إعادة النداء</button>
            <button onClick={() => go(a, 'startExam')} style={gradBtn}>بدء الكشف</button>
          </div>
          {isAdmin && (
            <div style={{ marginTop: 8 }}>
              <button onClick={() => cancelStatus(a)} style={btn(C, 'danger')}>✕ إلغاء الحالة</button>
            </div>
          )}
        </div>
      ))}

      {inRoom.map(a => (
        <div key={a.id} style={{ background: `linear-gradient(135deg,${C.accent}22,${C.teal}11)`, border: '2px solid ' + C.accent, borderRadius: 14, padding: '12px 14px', marginBottom: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <span style={{ fontSize: 18 }}>🩺</span>
            <div style={{ flex: 1 }}>
              <div style={{ color: C.accent, fontWeight: 800, fontSize: 14 }}>{a.patient}</div>
              <div style={{ color: C.muted, fontSize: 11 }}>في العيادة الآن · {a.time} · {clinicLabel(a.clinic)}</div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
            <button onClick={() => go(a, 'finish')} style={btn(C, 'success')}>✓ انتهى الكشف</button>
            <button onClick={() => go(a, 'backToWaiting')} style={btn(C, 'gold')}>↩ رجوع للانتظار</button>
            {isAdmin && <button onClick={() => cancelStatus(a)} style={btn(C, 'danger')}>✕ إلغاء الحالة</button>}
            <PayBadge a={a} onCollect={onCollect} C={C} />
          </div>
        </div>
      ))}

      {waiting.length > 0 && (
        <Section C={C} title="⏳ قائمة الانتظار" top={0}>
          {orderedWaiting.map((a, idx) => {
            const isP = v.isPriority(a);
            const est = estimateWait(a, idx, { clock, inRoomCount: inRoom.length, avgDurationMin });
            return (
              <div key={a.id} style={{ background: C.card, border: '1px solid ' + C.gold + '44', borderRadius: 14, padding: '10px 14px', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <div style={{ width: 28, height: 28, borderRadius: '50%', background: C.gold + '22', border: '1px solid ' + C.gold + '44', display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.gold, fontWeight: 800, fontSize: 13 }}>{idx + 1}</div>
                <div style={{ flex: 1, minWidth: 100 }}>
                  <div style={{ color: C.text, fontWeight: 700, fontSize: 13 }}>{a.patient}</div>
                  <div style={{ display: 'flex', gap: 5, alignItems: 'center', flexWrap: 'wrap', color: C.muted, fontSize: 11 }}>
                    {a.doctor && <span style={{ background: isP ? C.accent + '22' : C.border, color: isP ? C.accent : C.muted, borderRadius: 6, padding: '2px 6px', fontWeight: isP ? 700 : 500 }}>{a.doctor}{isP ? ' · أولوية' : ''}</span>}
                    <span>{a.type} · {a.time} · {clinicLabel(a.clinic)} · ⏱ ~{fmtWait(est)}</span>
                  </div>
                  {a.phone && <a href={'tel:' + a.phone} style={{ color: C.accent, fontSize: 11, textDecoration: 'none' }}>📞 {a.phone}</a>}
                  <div style={{ marginTop: 4 }}><PayBadge a={a} onCollect={onCollect} C={C} /></div>
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  {inRoom.length === 0 && called.length === 0 && idx === 0 && (
                    <button onClick={() => call(a)} style={{ background: `linear-gradient(135deg,${C.gold},#e0951f)`, border: 'none', borderRadius: 8, padding: '6px 10px', color: '#fff', fontSize: 11, fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' }}>📣 استدعاء</button>
                  )}
                  <button title="تأجيل" onClick={() => go(a, 'postpone')} style={mini(C, 'purple')}>⏸</button>
                  <button title="لم يحضر" onClick={() => go(a, 'noShow')} style={mini(C, 'danger')}>لم يحضر</button>
                  <button title={isAdmin ? 'إلغاء الحالة' : 'إلغاء الوصول'} onClick={() => (isAdmin ? cancelStatus(a) : go(a, 'cancelArrival'))} style={mini(C, 'danger')}>✕</button>
                </div>
              </div>
            );
          })}
        </Section>
      )}

      {pending.length > 0 && (
        <Section C={C} title="📋 لم يصلوا بعد">
          {pending.map(a => (
            <Row key={a.id} C={C} a={a} sub={place(a)}>
              <div style={{ display: 'flex', gap: 6 }}>
                <button onClick={() => go(a, 'arrive')} style={mini(C, 'gold', { padding: '6px 10px', fontWeight: 700 })}>وصل ✓</button>
                <button title="تأجيل" onClick={() => go(a, 'postpone')} style={mini(C, 'purple')}>⏸</button>
              </div>
            </Row>
          ))}
        </Section>
      )}

      {postponed.length > 0 && (
        <Section C={C} title="⏸ تم تأجيلهم">
          {postponed.map(a => (
            <Row key={a.id} C={C} a={a} sub={place(a)}>
              <button onClick={() => go(a, 'backToWaiting')} style={mini(C, 'gold', { padding: '6px 10px', fontWeight: 700 })}>🔁 إعادة للانتظار</button>
            </Row>
          ))}
        </Section>
      )}

      {noShow.length > 0 && (
        <Section C={C} title="🚫 لم يحضروا">
          {noShow.map(a => (
            <Row key={a.id} C={C} a={a} single border={C.danger + '33'} sub={a.patient + ' · ' + a.time + ' · ' + (a.doctor || '')}>
              <button onClick={() => go(a, 'restoreNoShow')} style={mini(C, 'gold', { padding: '6px 10px', fontWeight: 700 })}>إعادة للانتظار</button>
            </Row>
          ))}
        </Section>
      )}

      {done.length > 0 && (
        <Section C={C} title="✅ انتهوا اليوم">
          {done.map(a => (
            <Row key={a.id} C={C} a={a} single dim sub={a.patient + ' · ' + a.time}>
              <PayBadge a={a} onCollect={onCollect} C={C} />
            </Row>
          ))}
        </Section>
      )}

      {v.todayApts.length === 0 && (
        <div style={{ color: C.muted, textAlign: 'center', padding: 40, fontSize: 13 }}>لا توجد مواعيد اليوم</div>
      )}
    </div>
  );
}
