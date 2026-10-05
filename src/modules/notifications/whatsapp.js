// WhatsApp reminder helpers -- moved here from
// public/legacy/app-runtime.js (Phase 8, batch 16). Exact copies of the
// original logic; app-runtime.js now delegates to this module instead of
// redefining any of it.

import { clinicLabel } from '../constants/clinics.js';
import { t } from '../i18n/index.js';
import { tv } from '../i18n/tv.js';

// normPhone (the generic phone-digit normalizer) is used all over
// app-runtime.js well outside this batch's scope (patient search, patient
// matching, booking...), so it isn't moved itself -- it's duplicated here
// exactly, same approach as newId was duplicated for aptList in batch 11
// and audit-trash-backup.js in batch 13.
const normPhone = s => String(s || '').replace(/\D/g, '').replace(/^(20|0020)/, '0');

const WA_COUNTRY = '20';

function waNumber(phone) {
  let d = normPhone(phone);
  if (!d) return '';
  if (d.startsWith('00')) d = d.slice(2);
  if (d.startsWith('0')) d = d.slice(1);
  if (!d.startsWith(WA_COUNTRY)) d = WA_COUNTRY + d;
  return d;
}

export function waOpen(phone, text) {
  const n = waNumber(phone);
  if (!n) {
    alert(t('g5.wa.noPhone'));
    return false;
  }
  window.open('https://wa.me/' + n + '?text=' + encodeURIComponent(text), '_blank');
  return true;
}

const firstName = n => String(n || '').trim().split(/\s+/)[0] || '';

export function waReminderText(a) {
  return t('g5.wa.reminder', { name: firstName(a.patient), brand: t('g5.wa.brand'), date: a.date || '', time: a.time || '', clinic: tv(clinicLabel(a.clinic)) });
}

export function waFollowUpText(name, when, reason) {
  return t('g5.wa.followUp', { name: firstName(name), reason: reason || t('g5.wa.defaultReason'), when: when || '', brand: t('g5.wa.brand') });
}
