import React, { useEffect, useState } from 'react';
import { buildQueueView, estimateWait, fmtWait, transitions } from '../modules/queue/index.js';
import { C } from '../modules/theme/index.js';
import { clinicLabel } from '../modules/constants/index.js';
import { inp } from '../modules/ui/atoms.jsx';
import { broadcastCall, callChannel } from '../modules/realtime/index.js';
import { t, useLang } from '../modules/i18n/index.js';
import { tv } from '../modules/i18n/tv.js';

const clinicName = c => tv(clinicLabel(c));

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
      {a.cost ? <>{a.paid ? t('g5.wait.paid') : t('g5.wait.unpaid')} {a.cost}{t('g5.unit.egpShort')}</> : t('g5.wait.collect')}
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
  const lang = useLang();
  useEffect(() => { callChannel(); }, []);

  const priorityKey = 'iapp_priority_doctor_' + today;
  const [priorityDoctor, setPriorityDoctor] = useState(() => {
    try { return localStorage.getItem(priorityKey) || ''; } catch { return ''; }
  });
  const [clock, setClock] = useState(Date.now());
  useEffect(() => {
    const iv = setInterval(() => setClock(Date.now()), 60000);
    return () => clearInterval(iv);
  }, []);

  const setPriority = d => {
    setPriorityDoctor(d);
    try { d ? localStorage.setItem(priorityKey, d) : localStorage.removeItem(priorityKey); } catch { /* storage unavailable (private mode / quota): non-fatal */ }
  };

  const v = buildQueueView(apts, { today, priorityDoctor, doctorNames });
  const { waiting, called, inRoom, done, postponed, noShow, pending, stale, orderedWaiting, priorityOptions, avgDurationMin } = v;
  const go = (a, key) => onUpdateApt(transitions[key](a, Date.now()));
  const place = a => a.time + ' · ' + tv(a.type) + ' · ' + clinicName(a.clinic);

  const call = a => {
    const upd = transitions.call(a, Date.now());
    onUpdateApt(upd);
    broadcastCall(upd);
  };
  const cancelStatus = a => {
    if (!window.confirm(t('g5.wait.confirmCancelStatus', lang, { name: a.patient }))) return;
    return go(a, 'cancelStatus');
  };
  const closeStale = async () => {
    if (!window.confirm(t('g5.wait.confirmCloseStale', lang, { n: stale.length }))) return;
    for (const a of stale) await onUpdateApt(transitions.cancelArrival(a));
  };

  const stats = [
    { l: t('g5.wait.statWaiting', lang), v: waiting.length, c: C.gold },
    { l: t('g5.wait.statInClinic', lang), v: inRoom.length, c: C.accent },
    { l: t('g5.wait.statDone', lang), v: done.length, c: C.success },
    { l: t('g5.wait.statPostponed', lang), v: postponed.length, c: C.purple },
    { l: t('g5.wait.statNotArrived', lang), v: pending.length, c: C.muted },
    { l: t('g5.wait.statNoShow', lang), v: noShow.length, c: C.danger }
  ];
  const gradBtn = { background: `linear-gradient(135deg,${C.accent},${C.teal})`, border: 'none', borderRadius: 9, padding: '8px 12px', color: C.bg, fontSize: 11, fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' };

  return (
    <div style={{ padding: '12px 16px 100px', animation: 'slideUp 0.25s ease' }}>
      {stale.length > 0 && (
        <div style={{ background: C.gold + '18', border: `1px solid ${C.gold}66`, borderRadius: 12, padding: '10px 12px', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ flex: 1, color: C.text, fontSize: 12, fontWeight: 700 }}>
            {t('g5.wait.staleLine', lang, { n: stale.length, names: stale.map(a => a.patient).join(t('g5.common.listSep', lang)) })}
          </div>
          <button onClick={closeStale} style={{ ...btn(C, 'gold'), background: C.gold + '33', border: `1px solid ${C.gold}88`, borderRadius: 9, padding: '8px 12px', fontWeight: 800 }}>{t('g5.wait.closeAll', lang)}</button>
        </div>
      )}

      <div style={{ background: C.card, border: `1px solid ${priorityDoctor ? C.accent : C.border}`, borderRadius: 12, padding: '10px 12px', marginBottom: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
          <span style={{ fontSize: 16 }}>👨‍⚕️</span>
          <div style={{ flex: 1, color: C.text, fontWeight: 800, fontSize: 12 }}>{t('g5.wait.priorityTitle', lang)}</div>
          {priorityDoctor && <span style={{ background: C.accent + '22', color: C.accent, borderRadius: 8, padding: '2px 7px', fontSize: 9, fontWeight: 700 }}>{t('g5.wait.priorityBadge', lang)}</span>}
        </div>
        <select value={priorityDoctor} onChange={e => setPriority(e.target.value)} style={{ ...inp(), padding: '8px 10px', fontSize: 12 }}>
          <option value="">{t('g5.wait.noPriority', lang)}</option>
          {priorityOptions.map(d => <option key={d} value={d}>{tv(d)}</option>)}
        </select>
        {priorityDoctor && <div style={{ color: C.muted, fontSize: 9, marginTop: 5 }}>{t('g5.wait.priorityNote', lang)}</div>}
        {priorityOptions.length === 0 && <div style={{ color: C.muted, fontSize: 9, marginTop: 5 }}>{t('g5.wait.noOtherDoctor', lang)}</div>}
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
          {t('g5.wait.avgExam', lang)} <span style={{ color: C.accent, fontWeight: 700 }}>{t('g5.wait.avgExamMin', lang, { n: avgDurationMin })}</span>
        </div>
      )}

      {called.map(a => (
        <div key={a.id} style={{ background: `linear-gradient(135deg,${C.gold}25,${C.accent}12)`, border: '2px solid ' + C.gold, borderRadius: 14, padding: '12px 14px', marginBottom: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ fontSize: 24 }}>📣</div>
            <div style={{ flex: 1 }}>
              <div style={{ color: C.gold, fontWeight: 900, fontSize: 15 }}>{t('g5.wait.called', lang)}</div>
              <div style={{ color: C.text, fontWeight: 700, fontSize: 14 }}>{a.patient}</div>
              <div style={{ color: C.muted, fontSize: 10 }}>{tv(a.doctor || '')} · {clinicName(a.clinic)}</div>
            </div>
            <button title={t('g5.wait.recallTitle', lang)} onClick={() => broadcastCall(a, Date.now())}
              style={{ ...btn(C, 'gold'), borderRadius: 9, padding: '8px 10px', fontWeight: 800, marginInlineEnd: 6 }}>{t('g5.wait.recall', lang)}</button>
            <button onClick={() => go(a, 'startExam')} style={gradBtn}>{t('g5.wait.startExam', lang)}</button>
          </div>
          {isAdmin && (
            <div style={{ marginTop: 8 }}>
              <button onClick={() => cancelStatus(a)} style={btn(C, 'danger')}>{t('g5.wait.cancelStatus', lang)}</button>
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
              <div style={{ color: C.muted, fontSize: 11 }}>{t('g5.wait.inClinicNow', lang)} · {a.time} · {clinicName(a.clinic)}</div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
            <button onClick={() => go(a, 'finish')} style={btn(C, 'success')}>{t('g5.wait.finish', lang)}</button>
            <button onClick={() => go(a, 'backToWaiting')} style={btn(C, 'gold')}>{t('g5.wait.backToWaiting', lang)}</button>
            {isAdmin && <button onClick={() => cancelStatus(a)} style={btn(C, 'danger')}>{t('g5.wait.cancelStatus', lang)}</button>}
            <PayBadge a={a} onCollect={onCollect} C={C} />
          </div>
        </div>
      ))}

      {waiting.length > 0 && (
        <Section C={C} title={t('g5.wait.sectionWaiting', lang)} top={0}>
          {orderedWaiting.map((a, idx) => {
            const isP = v.isPriority(a);
            const est = estimateWait(a, idx, { clock, inRoomCount: inRoom.length, avgDurationMin });
            return (
              <div key={a.id} style={{ background: C.card, border: '1px solid ' + C.gold + '44', borderRadius: 14, padding: '10px 14px', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <div style={{ width: 28, height: 28, borderRadius: '50%', background: C.gold + '22', border: '1px solid ' + C.gold + '44', display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.gold, fontWeight: 800, fontSize: 13 }}>{idx + 1}</div>
                <div style={{ flex: 1, minWidth: 100 }}>
                  <div style={{ color: C.text, fontWeight: 700, fontSize: 13 }}>{a.patient}</div>
                  <div style={{ display: 'flex', gap: 5, alignItems: 'center', flexWrap: 'wrap', color: C.muted, fontSize: 11 }}>
                    {a.doctor && <span style={{ background: isP ? C.accent + '22' : C.border, color: isP ? C.accent : C.muted, borderRadius: 6, padding: '2px 6px', fontWeight: isP ? 700 : 500 }}>{tv(a.doctor)}{isP ? t('g5.wait.priorityTag', lang) : ''}</span>}
                    <span>{tv(a.type)} · {a.time} · {clinicName(a.clinic)} · ⏱ ~{fmtWait(est)}</span>
                  </div>
                  {a.phone && <a href={'tel:' + a.phone} style={{ color: C.accent, fontSize: 11, textDecoration: 'none' }}>📞 {a.phone}</a>}
                  <div style={{ marginTop: 4 }}><PayBadge a={a} onCollect={onCollect} C={C} /></div>
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  {inRoom.length === 0 && called.length === 0 && idx === 0 && (
                    <button onClick={() => call(a)} style={{ background: `linear-gradient(135deg,${C.gold},#e0951f)`, border: 'none', borderRadius: 8, padding: '6px 10px', color: '#fff', fontSize: 11, fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' }}>{t('g5.wait.callBtn', lang)}</button>
                  )}
                  <button title={t('g5.wait.postpone', lang)} onClick={() => go(a, 'postpone')} style={mini(C, 'purple')}>⏸</button>
                  <button title={t('g5.wait.noShow', lang)} onClick={() => go(a, 'noShow')} style={mini(C, 'danger')}>{t('g5.wait.noShow', lang)}</button>
                  <button title={isAdmin ? t('g5.wait.cancelStatusTitle', lang) : t('g5.wait.cancelArrivalTitle', lang)} onClick={() => (isAdmin ? cancelStatus(a) : go(a, 'cancelArrival'))} style={mini(C, 'danger')}>✕</button>
                </div>
              </div>
            );
          })}
        </Section>
      )}

      {pending.length > 0 && (
        <Section C={C} title={t('g5.wait.sectionPending', lang)}>
          {pending.map(a => (
            <Row key={a.id} C={C} a={a} sub={place(a)}>
              <div style={{ display: 'flex', gap: 6 }}>
                <button onClick={() => go(a, 'arrive')} style={mini(C, 'gold', { padding: '6px 10px', fontWeight: 700 })}>{t('g5.wait.arrive', lang)}</button>
                <button title={t('g5.wait.postpone', lang)} onClick={() => go(a, 'postpone')} style={mini(C, 'purple')}>⏸</button>
              </div>
            </Row>
          ))}
        </Section>
      )}

      {postponed.length > 0 && (
        <Section C={C} title={t('g5.wait.sectionPostponed', lang)}>
          {postponed.map(a => (
            <Row key={a.id} C={C} a={a} sub={place(a)}>
              <button onClick={() => go(a, 'backToWaiting')} style={mini(C, 'gold', { padding: '6px 10px', fontWeight: 700 })}>{t('g5.wait.requeue', lang)}</button>
            </Row>
          ))}
        </Section>
      )}

      {noShow.length > 0 && (
        <Section C={C} title={t('g5.wait.sectionNoShow', lang)}>
          {noShow.map(a => (
            <Row key={a.id} C={C} a={a} single border={C.danger + '33'} sub={a.patient + ' · ' + a.time + ' · ' + tv(a.doctor || '')}>
              <button onClick={() => go(a, 'restoreNoShow')} style={mini(C, 'gold', { padding: '6px 10px', fontWeight: 700 })}>{t('g5.wait.restoreNoShow', lang)}</button>
            </Row>
          ))}
        </Section>
      )}

      {done.length > 0 && (
        <Section C={C} title={t('g5.wait.sectionDone', lang)}>
          {done.map(a => (
            <Row key={a.id} C={C} a={a} single dim sub={a.patient + ' · ' + a.time}>
              <PayBadge a={a} onCollect={onCollect} C={C} />
            </Row>
          ))}
        </Section>
      )}

      {v.todayApts.length === 0 && (
        <div style={{ color: C.muted, textAlign: 'center', padding: 40, fontSize: 13 }}>{t('g5.wait.noAptsToday', lang)}</div>
      )}
    </div>
  );
}
