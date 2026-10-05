import React, { useState } from 'react';
import { ALL_DOCTORS, listAppointments, countDone, findPatientForApt, whatsappReminderUrl } from '../modules/appointments/index.js';
import { Modal, Confirm, Btn } from '../components/common.jsx';
import { AptForm } from '../components/forms/index.js';
import { C } from '../modules/theme/index.js';
import { clinicLabel } from '../modules/constants/index.js';
import { sbGet } from '../modules/sync/wiring.js';
import { trashPut, logAudit } from '../modules/sync/index.js';
import PendingRequests from './appointments/PendingRequests.jsx';
import { t, useLang } from '../modules/i18n/index.js';
import { tv } from '../modules/i18n/tv.js';

const clinicName = c => tv(clinicLabel(c));

const iconBox = (C, bg, extra = {}) => ({
  width: 32, height: 32, borderRadius: 10, background: bg,
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  cursor: 'pointer', overflow: 'hidden', flexShrink: 0, ...extra
});

export default function Appointments({ appointments, setAppointments, doctorNames = [], patients = [], onPatientClick, session }) {
  const lang = useLang();
  const [filter, setFilter] = useState(ALL_DOCTORS);
  const [showDone, setShowDone] = useState(false);
  const [modal, setModal] = useState(null);

  const doctors = [ALL_DOCTORS, ...doctorNames];
  const visible = listAppointments(appointments, { showDone });
  const filtered = listAppointments(appointments, { doctor: filter, showDone });
  const doneCount = countDone(appointments);

  // Always merge against the latest remote list so two devices don't overwrite each other.
  const latest = async () => {
    const remote = await sbGet('iapp_appointments');
    return Array.isArray(remote) ? remote : appointments;
  };
  const add = async f => setAppointments([...(await latest()), { ...f, id: Date.now() }]);
  const edit = async f => setAppointments((await latest()).map(a => (a.id === f.id ? f : a)));
  const toggleConfirm = async id => setAppointments((await latest()).map(a => (a.id === id ? { ...a, confirmed: !a.confirmed } : a)));
  const del = async id => {
    const base = await latest();
    const rec = base.find(a => a.id === id);
    await trashPut('iapp_appointments', rec, 'موعد');
    logAudit('حذف موعد', rec && rec.date + ' ' + (rec.time || '') + ' · ' + (rec.patient || '') || id);
    setAppointments(base.filter(a => a.id !== id));
  };

  return (
    <div style={{ padding: '16px 16px 90px' }}>
      <PendingRequests />
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <span style={{ color: C.text, fontWeight: 700, fontSize: 16 }}>
          {t('g5.apt.title', lang, { n: visible.length })}
          {doneCount > 0 && (
            <span onClick={() => setShowDone(v => !v)}
              style={{ marginInlineStart: 10, color: C.muted, fontSize: 11, fontWeight: 600, cursor: 'pointer', textDecoration: 'underline' }}>
              {showDone ? t('g5.apt.hideDone', lang) : t('g5.apt.showDone', lang, { n: doneCount })}
            </span>
          )}
        </span>
        <Btn small onClick={() => setModal('add')}>{t('g5.apt.new', lang)}</Btn>
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 16, overflowX: 'auto', paddingBottom: 4 }}>
        {doctors.map(d => (
          <button key={d} onClick={() => setFilter(d)} style={{
            background: filter === d ? `linear-gradient(135deg,${C.accent},${C.teal})` : C.card,
            border: `1px solid ${filter === d ? 'transparent' : C.border}`,
            borderRadius: 20, padding: '6px 14px', color: filter === d ? C.bg : C.muted,
            fontSize: 11, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap', fontFamily: 'inherit'
          }}>{d === ALL_DOCTORS ? t('g5.common.all', lang) : tv(d)}</button>
        ))}
      </div>

      {filtered.map(a => {
        const wa = whatsappReminderUrl(a, clinicName(a.clinic));
        return (
          <div key={a.id} style={{
            background: C.card, border: `1px solid ${a.fromPatient ? C.gold : C.border}`, borderRadius: 14,
            padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8
          }}>
            <div style={{ textAlign: 'center', minWidth: 48 }}>
              <div style={{ color: C.accent, fontSize: 14, fontWeight: 800 }}>{a.time}</div>
              {a.date && <div style={{ color: C.muted, fontSize: 9 }}>{a.date}</div>}
            </div>
            <div style={{ width: 2, height: 40, background: C.accent + '55', borderRadius: 1 }} />
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <div onClick={() => onPatientClick && onPatientClick(a.patient, findPatientForApt(patients, a))}
                  style={{ color: C.accent, fontWeight: 600, fontSize: 13, cursor: 'pointer', textDecoration: 'underline' }}>{a.patient}</div>
                {a.fromPatient && <span style={{ background: C.gold + '22', color: C.gold, borderRadius: 6, padding: '1px 6px', fontSize: 9, fontWeight: 700 }}>{t('g5.apt.patientRequest', lang)}</span>}
              </div>
              <div style={{ color: C.muted, fontSize: 11, marginTop: 2 }}>{tv(a.type)}</div>
              {a.phone && <div style={{ color: C.accent, fontSize: 11, marginTop: 2 }}>📞 {a.phone}</div>}
              <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                <span style={{ background: C.border, borderRadius: 6, padding: '2px 8px', color: C.muted, fontSize: 10 }}>{tv(a.doctor)}</span>
                <span style={{ background: C.teal + '22', borderRadius: 6, padding: '2px 8px', color: C.teal, fontSize: 10 }}>📍 {clinicName(a.clinic)}</span>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              <div role="button" title={t('g5.apt.confirmToggle', lang)} aria-label={t('g5.apt.confirmToggle', lang)} onClick={() => toggleConfirm(a.id)}
                style={iconBox(C, a.confirmed ? C.success + '33' : C.card, { border: `1px solid ${a.confirmed ? C.success : C.border}` })}>
                <span style={{ fontSize: 14, lineHeight: 1, color: a.confirmed ? C.success : C.muted }}>✓</span>
              </div>
              {wa && (
                <a href={wa} target="_blank" rel="noreferrer" title={t('g5.apt.whatsapp', lang)} aria-label={t('g5.apt.whatsapp', lang)} style={iconBox(C, '#25D36622', { textDecoration: 'none' })}>
                  <span style={{ fontSize: 14, lineHeight: 1 }}>📅</span>
                </a>
              )}
              <div role="button" title={t('g5.apt.edit', lang)} aria-label={t('g5.apt.edit', lang)} onClick={() => setModal({ edit: a })} style={iconBox(C, C.accent + '22')}>
                <span style={{ fontSize: 14, lineHeight: 1 }}>✏</span>
              </div>
              {session && session.role === 'admin' && (
                <div role="button" title={t('g5.apt.delete', lang)} aria-label={t('g5.apt.delete', lang)} onClick={() => setModal({ del: a.id })} style={iconBox(C, C.danger + '22')}>
                  <span style={{ fontSize: 13, lineHeight: 1, color: C.danger }}>🗑</span>
                </div>
              )}
            </div>
          </div>
        );
      })}

      {filtered.length === 0 && <div style={{ color: C.muted, textAlign: 'center', padding: 30, fontSize: 13 }}>{t('g5.apt.none', lang)}</div>}

      {modal === 'add' && (
        <Modal title={t('g5.apt.modalNew', lang)} onClose={() => setModal(null)}>
          <AptForm doctorNames={doctorNames} appointments={appointments} onSave={f => { add(f); setModal(null); }} onClose={() => setModal(null)} />
        </Modal>
      )}
      {modal && modal.edit && (
        <Modal title={t('g5.apt.modalEdit', lang)} onClose={() => setModal(null)}>
          <AptForm doctorNames={doctorNames} appointments={appointments} initial={modal.edit} onSave={f => { edit(f); setModal(null); }} onClose={() => setModal(null)} />
        </Modal>
      )}
      {modal && modal.del && (
        <Confirm msg={t('g5.apt.deleteConfirm', lang)} onOk={() => { del(modal.del); setModal(null); }} onNo={() => setModal(null)} />
      )}
    </div>
  );
}
