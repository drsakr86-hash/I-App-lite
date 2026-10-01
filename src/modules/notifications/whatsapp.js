// WhatsApp reminder helpers -- moved here from
// public/legacy/app-runtime.js (Phase 8, batch 16). Exact copies of the
// original logic; app-runtime.js now delegates to this module instead of
// redefining any of it.

import { clinicLabel } from '../constants/clinics.js';

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
    alert('لا يوجد رقم هاتف صحيح لهذا المريض');
    return false;
  }
  window.open('https://wa.me/' + n + '?text=' + encodeURIComponent(text), '_blank');
  return true;
}

const firstName = n => String(n || '').trim().split(/\s+/)[0] || '';
const CLINIC_BRAND = 'عيادة د. عبدالستار صقر';

export function waReminderText(a) {
  return 'أهلاً ' + firstName(a.patient) + ' 🌿\n' + 'تذكير بموعدك في ' + CLINIC_BRAND + '\n' + '📅 ' + (a.date || '') + '   ⏰ ' + (a.time || '') + '\n' + '📍 ' + clinicLabel(a.clinic) + '\n\n' + 'برجاء الرد بالتأكيد، أو التواصل معنا لتعديل الموعد.';
}

export function waFollowUpText(name, when, reason) {
  return 'أهلاً ' + firstName(name) + ' 🌿\n' + (reason || 'موعد المتابعة الخاص بك') + ' كان محدداً بتاريخ ' + (when || '') + '\n' + 'برجاء التواصل معنا لتحديد موعد جديد في ' + CLINIC_BRAND + '.';
}
