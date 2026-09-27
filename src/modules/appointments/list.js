// Pure helpers for the appointments list screen.

export const ALL_DOCTORS = 'الكل';

export const isDone = a => a && a.waitStatus === 'done';

export function listAppointments(apts, { doctor = ALL_DOCTORS, showDone = false } = {}) {
  const list = Array.isArray(apts) ? apts : [];
  const visible = showDone ? list : list.filter(a => !isDone(a));
  return doctor === ALL_DOCTORS ? visible : visible.filter(a => a.doctor === doctor);
}

export const countDone = apts => (Array.isArray(apts) ? apts : []).filter(isDone).length;

export function findPatientForApt(patients, a) {
  return (patients || []).find(x => x.name === a.patient || (a.patientId && x.id === a.patientId)) || null;
}

// Egyptian mobile numbers: drop the leading 0 and prefix the country digit.
export function whatsappReminderUrl(a, clinicName) {
  if (!a || !a.phone) return null;
  const text = 'تذكير بموعدك في ' + clinicName + ' يوم ' + (a.date || '') + ' الساعة ' + a.time;
  return 'https://wa.me/2' + String(a.phone).replace(/^0/, '') + '?text=' + encodeURIComponent(text);
}
