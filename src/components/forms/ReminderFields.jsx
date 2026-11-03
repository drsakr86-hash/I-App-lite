import React from 'react';
import { Field, inp } from '../../modules/ui/atoms.jsx';
import { t } from '../../modules/i18n/index.js';
import { CHECKUP_OPTIONS, hasReminderPhone } from './patient-form-model.js';

// WhatsApp reminder settings of a patient (read by the server: docs/sql/wa-patient-reminders.sql).
//   reminderConsent: the patient agreed -> appointment (evening before), follow-up (nextVisit) and periodic check-up reminders
//   checkupMonths:   '' = none, else months after the last visit
export default function ReminderFields({ f, setF, lang }) {
  const consent = !!f.reminderConsent;
  const phoneOk = hasReminderPhone(f.phone);
  return (
    <Field label={t('g2.patient.remindersTitle', lang)}>
      <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 14 }}>
        <input type="checkbox" checked={consent} onChange={e => setF(v => ({ ...v, reminderConsent: e.target.checked }))} />
        <span>{t('g2.patient.reminderConsent', lang)}</span>
      </label>
      {consent && !phoneOk && <div style={{ fontSize: 12, color: '#c0392b', marginTop: 4 }}>{t('g2.patient.reminderNoPhone', lang)}</div>}
      <select style={{ ...inp(), marginTop: 8 }} value={f.checkupMonths == null ? '' : String(f.checkupMonths)}
        onChange={e => setF(v => ({ ...v, checkupMonths: e.target.value === '' ? '' : Number(e.target.value) }))}>
        <option value="">{t('g2.patient.checkupEvery', lang)}: {t('g2.patient.checkupNone', lang)}</option>
        {CHECKUP_OPTIONS.map(n => (
          <option key={n} value={String(n)}>{t('g2.patient.checkupEvery', lang)}: {n === 12 ? t('g2.patient.checkupYear', lang) : t('g2.patient.checkupMonths', lang, { n })}</option>
        ))}
      </select>
    </Field>
  );
}
