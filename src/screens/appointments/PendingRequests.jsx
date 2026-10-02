import React, { useState, useEffect, useCallback } from 'react';
import { loadPendingRequests, setRequestStatus, acceptBookingRequest, rejectBookingRequest, BOOKING_MESSAGES } from '../../modules/appointments/index.js';
import { C } from '../../modules/theme/index.js';
import { BOOKING_TABLE, clinicLabel } from '../../modules/constants/index.js';
import { newId } from '../../modules/constants/misc.js';
import { getSB } from '../../modules/data-access/index.js';
import { sbMutate } from '../../modules/sync/wiring.js';
import { logAudit } from '../../modules/sync/index.js';
import { requestAuditDetail } from '../../modules/secretary-app/model.js';

const POLL_MS = 15000;

// Admin view of pending patient booking requests. Renders nothing when there
// are none (and the table loaded fine), so it never clutters the screen.
export default function PendingRequests() {
  const [requests, setRequests] = useState([]);
  const [loadError, setLoadError] = useState(false);
  const [busy, setBusy] = useState(null);
  const [note, setNote] = useState('');

  const reload = useCallback(async () => {
    const r = await loadPendingRequests(getSB(), BOOKING_TABLE);
    setLoadError(!r.ok);
    if (r.ok) setRequests(r.data);
  }, []);

  useEffect(() => {
    reload();
    const iv = setInterval(() => { if (!document.hidden) reload(); }, POLL_MS);
    return () => clearInterval(iv);
  }, [reload]);

  const deps = {
    mutateAppointments: (fn, verify) => sbMutate('iapp_appointments', fn, verify),
    setStatus: (id, status) => setRequestStatus(getSB(), id, status, BOOKING_TABLE),
    newId
  };

  const accept = async r => {
    if (busy) return;
    setBusy(r.id); setNote('');
    const res = await acceptBookingRequest(deps, r);
    setNote(res.message);
    if (res.status === 'accepted' || res.status === 'already-handled') {
      logAudit('قبول طلب حجز', requestAuditDetail(r));
      setRequests(l => l.filter(x => x.id !== r.id));
    }
    if (res.status === 'accepted-unmarked') logAudit('قبول طلب حجز (الحالة لم تُحدَّث)', requestAuditDetail(r));
    setBusy(null);
  };

  const reject = async r => {
    if (busy) return;
    if (!window.confirm('رفض طلب ' + r.patient_name + '؟')) return;
    setBusy(r.id); setNote('');
    const res = await rejectBookingRequest(deps, r);
    setNote(res.message);
    if (res.status === 'rejected' || res.status === 'already-handled') {
      logAudit('رفض طلب حجز', requestAuditDetail(r));
      setRequests(l => l.filter(x => x.id !== r.id));
    }
    setBusy(null);
  };

  if (!requests.length && !loadError && !note) return null;

  const btn = (bg, color) => ({
    background: bg, color, border: 'none', borderRadius: 10, padding: '8px 14px',
    fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', opacity: busy ? 0.6 : 1
  });

  return (
    <section aria-label="طلبات الحجز المعلقة" style={{
      background: C.card, border: `1px solid ${C.gold}`, borderRadius: 14, padding: 14, marginBottom: 16
    }}>
      <div style={{ color: C.gold, fontWeight: 800, fontSize: 14, marginBottom: 8 }}>
        طلبات حجز من المرضى بانتظار الرد{requests.length ? ` (${requests.length})` : ''}
      </div>
      {loadError && <div role="alert" style={{ color: C.danger || '#f87171', fontSize: 12, marginBottom: 8 }}>{BOOKING_MESSAGES.loadFailed}</div>}
      {note && <div role="status" style={{ color: C.muted, fontSize: 12, marginBottom: 8 }}>{note}</div>}
      {requests.map(r => (
        <div key={r.id} style={{ borderTop: `1px solid ${C.border}`, padding: '10px 0' }}>
          <div style={{ color: C.text, fontWeight: 700, fontSize: 13 }}>{r.patient_name}</div>
          <div style={{ color: C.muted, fontSize: 12, marginTop: 2 }}>
            {r.date} · {r.time} · {clinicLabel(r.clinic)}{r.visit_type ? ' · ' + r.visit_type : ''}
          </div>
          <div style={{ color: C.muted, fontSize: 12 }} dir="ltr">{r.phone}</div>
          {r.note && <div style={{ color: C.muted, fontSize: 12, marginTop: 2 }}>{r.note}</div>}
          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            <button disabled={!!busy} onClick={() => accept(r)} style={btn(C.success || '#34d399', '#06201a')}>قبول</button>
            <button disabled={!!busy} onClick={() => reject(r)} style={btn('transparent', C.muted)}>رفض</button>
          </div>
        </div>
      ))}
    </section>
  );
}
