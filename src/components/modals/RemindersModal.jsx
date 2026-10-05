import React from 'react';
import { tomorrowOf, reminderRows, reminderButtonLabel, reminderTypeLabel } from './reminders-modal-model.js';
import { C } from '../../modules/theme/index.js';
import { localISO, clinicLabel } from '../../modules/constants/index.js';
import { waOpen, waReminderText } from '../../modules/notifications/index.js';
import { t, useLang } from '../../modules/i18n/index.js';
import { tv } from '../../modules/i18n/tv.js';

// "Tomorrow's appointments" WhatsApp reminder list (secretary app). Exact
// port of the legacy runtime's RemindersModal (public/legacy/app-runtime.js).
// onMark(apt) is called only when WhatsApp was actually opened (waOpen
// returned true).
export default function RemindersModal({ apts, onClose, onMark }) {
  const lang = useLang();
  const tomorrow = localISO(tomorrowOf(new Date()));
  const rows = reminderRows(apts, tomorrow);
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
          border: `2px solid ${C.teal}`
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <div style={{ color: C.teal, fontWeight: 800, fontSize: 15 }}>{t('g3.rem.title', lang, { n: rows.length })}</div>
          <span onClick={onClose} role="button" aria-label={t('common.close', lang)} style={{ color: C.muted, fontSize: 24, cursor: 'pointer' }}>×</span>
        </div>
        <div style={{ color: C.muted, fontSize: 11, marginBottom: 12 }}>{tomorrow}{t('g3.rem.hint', lang)}</div>
        {rows.length === 0 && (
          <div style={{ color: C.muted, fontSize: 13, textAlign: 'center', padding: '26px 0' }}>{t('g3.rem.none', lang)}</div>
        )}
        {rows.map(a => (
          <div
            key={a.id}
            style={{
              background: C.card,
              border: `1px solid ${a.reminded ? C.success + '55' : C.border}`,
              borderRadius: 12,
              padding: '10px 12px',
              marginBottom: 8
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
              <span style={{ color: C.text, fontWeight: 700, fontSize: 13 }}>{a.patient}</span>
              <span style={{ color: C.gold, fontSize: 12 }}>{a.time}</span>
            </div>
            <div style={{ color: C.muted, fontSize: 11, marginTop: 3 }}>{'📍 '}{tv(clinicLabel(a.clinic), lang)}{' · '}{tv(reminderTypeLabel(a.type), lang)}</div>
            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
              <button
                onClick={() => {
                  if (waOpen(a.phone, waReminderText(a)) && onMark) onMark(a);
                }}
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
              >{reminderButtonLabel(a.reminded)}</button>
              {a.phone && (
                <a
                  href={'tel:' + a.phone}
                  aria-label={t('g3.common.call', lang)}
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
                >📞</a>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
