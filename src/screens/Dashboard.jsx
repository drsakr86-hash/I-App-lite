import React, { useEffect, useState } from 'react';
import { buildDashboardStats, averageRating, todayQueueGroups, recentAppointments, emergencyPatients } from '../modules/dashboard/index.js';
import { C } from '../modules/theme/index.js';
import { clinicLabel, localISO } from '../modules/constants/index.js';
import { useSyncStatus } from '../modules/sync/engine.js';
import { sbGet } from '../modules/sync/wiring.js';

function StatCard({ C, s }) {
  return (
    <div style={{
      background: `linear-gradient(135deg,${C.card},${C.surface2})`, border: `1px solid ${C.border}`,
      borderRadius: 16, padding: 16, flex: '1 1 calc(50% - 6px)', minWidth: 130, position: 'relative', overflow: 'hidden'
    }}>
      <div style={{ position: 'absolute', top: -15, right: -15, width: 60, height: 60, borderRadius: '50%', background: s.color + '18' }} />
      <div style={{ fontSize: 22, marginBottom: 8 }}>{s.icon}</div>
      <div style={{ color: s.color, fontSize: 24, fontWeight: 800 }}>
        {s.value}{s.suffix && <span style={{ fontSize: 11, marginRight: 3 }}>{s.suffix}</span>}
      </div>
      <div style={{ color: C.muted, fontSize: 11, marginTop: 4 }}>{s.label}</div>
    </div>
  );
}

export default function Dashboard({ patients, appointments, visits, primary, onDailyReport, onPatientClick }) {
  const sync = useSyncStatus();
  const today = new Date().toLocaleDateString('ar-EG', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  const todayStr = localISO();
  const primaryName = (primary && primary.short) || 'د. عبدالستار';

  const [ratings, setRatings] = useState([]);
  useEffect(() => {
    (async () => {
      try {
        const r = await sbGet('iapp_ratings');
        if (r) setRatings(r);
      } catch {}
    })();
  }, []);

  const { todayRevenue, monthRevenue, todayVisitCount, pendingPayment } = buildDashboardStats(visits, { today: todayStr });
  const avgRating = averageRating(ratings);
  const { called, waiting, inRoom } = todayQueueGroups(appointments, todayStr);
  const recent = recentAppointments(appointments);
  const emergencies = emergencyPatients(patients);

  const stats = [
    { label: 'إجمالي المرضى', value: patients.length, icon: '👥', color: C.accent },
    { label: 'المواعيد اليوم', value: appointments.length, icon: '📋', color: C.teal },
    { label: 'إيرادات اليوم', value: todayRevenue.toLocaleString(), suffix: 'ج.م', icon: '💰', color: C.gold },
    { label: 'حالات طارئة', value: emergencies.length, icon: '⚠', color: C.danger }
  ];

  return (
    <div style={{ padding: '16px 16px 90px' }}>
      <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <div style={{ color: C.text, fontWeight: 700, fontSize: 18 }}>مرحباً، {primaryName} 👋</div>
          <div style={{ color: C.muted, fontSize: 12 }}>{today}</div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <div onClick={onDailyReport} style={{ background: C.gold + '22', border: `1px solid ${C.gold}44`, borderRadius: 12, padding: '6px 10px', color: C.gold, fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>📊 تقرير</div>
          <div style={{ background: (sync.offline ? C.danger : C.accent) + '22', border: `1px solid ${sync.offline ? C.danger : C.accent}44`, borderRadius: 12, padding: '6px 12px', color: sync.offline ? C.danger : C.accent, fontSize: 11, fontWeight: 600 }}>
            {sync.offline ? '○ بدون إنترنت' : '● مباشر'}
          </div>
        </div>
      </div>

      <div style={{ background: `linear-gradient(135deg,${C.surface2},${C.card})`, border: `1px solid ${C.accent}33`, borderRadius: 16, padding: '14px 16px', marginBottom: 16, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <div style={{ color: C.muted, fontSize: 11, marginBottom: 4 }}>💹 إيرادات الشهر</div>
          <div style={{ color: C.success, fontWeight: 800, fontSize: 22 }}>{monthRevenue.toLocaleString()} <span style={{ fontSize: 12, fontWeight: 400 }}>ج.م</span></div>
          <div style={{ color: C.muted, fontSize: 10, marginTop: 3 }}>زيارات اليوم: {todayVisitCount} · غير محصّل: {pendingPayment}</div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'flex-end' }}>
          {avgRating && (
            <div style={{ background: C.gold + '22', border: `1px solid ${C.gold}44`, borderRadius: 10, padding: '6px 12px', textAlign: 'center' }}>
              <div style={{ color: C.gold, fontWeight: 800, fontSize: 16 }}>⭐ {avgRating}</div>
              <div style={{ color: C.muted, fontSize: 9 }}>{ratings.length} تقييم</div>
            </div>
          )}
          <div style={{ width: 46, height: 46, borderRadius: 14, background: `linear-gradient(135deg,${C.success}33,${C.teal}22)`, border: `1px solid ${C.success}44`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22 }}>📈</div>
        </div>
      </div>

      {called.length > 0 && (
        <div style={{ background: `linear-gradient(135deg,${C.gold}22,${C.accent}12)`, border: `2px solid ${C.gold}`, borderRadius: 14, padding: '14px 16px', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 12, animation: 'pulse 1.2s infinite' }}>
          <span style={{ fontSize: 25 }}>📣</span>
          <div style={{ flex: 1 }}>
            <div style={{ color: C.gold, fontWeight: 900, fontSize: 14 }}>مريض تم استدعاؤه الآن</div>
            <div style={{ color: C.text, fontWeight: 800, fontSize: 15 }}>{called.map(a => a.patient).join('، ')}</div>
            <div style={{ color: C.muted, fontSize: 10 }}>تم الاستدعاء من السكرتارية · اضغط بدء الكشف عند دخول المريض</div>
          </div>
        </div>
      )}

      {waiting.length > 0 && (
        <div style={{ background: `linear-gradient(135deg,${C.gold}15,${C.accent}10)`, border: `1px solid ${C.gold}44`, borderRadius: 14, padding: '12px 16px', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 20 }}>⏳</span>
          <div style={{ flex: 1 }}>
            <div style={{ color: C.gold, fontWeight: 700, fontSize: 13 }}>في غرفة الانتظار</div>
            <div style={{ color: C.muted, fontSize: 11 }}>{waiting.map(a => a.patient).join(' · ')}</div>
          </div>
          <div style={{ background: C.gold, color: C.bg, borderRadius: '50%', width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 14 }}>{waiting.length}</div>
        </div>
      )}

      {inRoom.length > 0 && (
        <div style={{ background: `linear-gradient(135deg,${C.accent}15,${C.teal}10)`, border: `1px solid ${C.accent}44`, borderRadius: 14, padding: '12px 16px', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 20 }}>🩺</span>
          <div>
            <div style={{ color: C.accent, fontWeight: 700, fontSize: 13 }}>في العيادة الآن</div>
            <div style={{ color: C.text, fontSize: 12, fontWeight: 600 }}>{inRoom.map(a => a.patient).join('، ')}</div>
          </div>
        </div>
      )}

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 20 }}>
        {stats.map((s, i) => <StatCard key={i} C={C} s={s} />)}
      </div>

      <div style={{ color: C.text, fontWeight: 700, fontSize: 14, marginBottom: 10 }}>آخر المواعيد</div>
      {recent.map(a => (
        <div key={a.id} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8, borderRight: `3px solid ${C.accent}` }}>
          <div style={{ background: C.accent + '22', borderRadius: 10, padding: '8px 10px', textAlign: 'center', minWidth: 52 }}>
            <div style={{ color: C.accent, fontSize: 13, fontWeight: 800 }}>{a.time}</div>
            <div style={{ color: C.muted, fontSize: 9 }}>📍 {clinicLabel(a.clinic)}</div>
          </div>
          <div style={{ flex: 1 }}>
            <div onClick={() => {
              const p = patients.find(x => x.name === a.patient || (a.patientId && x.id === a.patientId));
              if (onPatientClick) onPatientClick(a.patient, p || null);
            }} style={{ color: C.accent, fontSize: 13, fontWeight: 600, cursor: 'pointer', textDecoration: 'underline' }}>{a.patient}</div>
            <div style={{ color: C.muted, fontSize: 11 }}>{a.type} · {a.doctor}</div>
          </div>
          {a.confirmed && <span style={{ background: C.success + '22', color: C.success, borderRadius: 8, padding: '2px 8px', fontSize: 10, fontWeight: 700 }}>✓</span>}
        </div>
      ))}
      {appointments.length === 0 && <div style={{ color: C.muted, textAlign: 'center', padding: 20, fontSize: 13 }}>لا توجد مواعيد</div>}

      {emergencies.length > 0 && (
        <div style={{ background: C.danger + '11', border: `1px solid ${C.danger}33`, borderRadius: 14, padding: 14, marginTop: 16 }}>
          <div style={{ color: C.danger, fontWeight: 700, fontSize: 13, marginBottom: 8 }}>⚠ حالات طارئة</div>
          {emergencies.map(p => (
            <div key={p.id} style={{ color: C.text, fontSize: 12, marginBottom: 4 }}>• {p.name || '—'} — {p.condition || '—'}</div>
          ))}
        </div>
      )}
    </div>
  );
}
