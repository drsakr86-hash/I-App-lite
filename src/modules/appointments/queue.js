// Saving an examination means the patient was seen: finish their queue entry for that day
// so the secretary does not have to press "وصل / بدء / انتهى" by hand.
// Pure function: returns the same array when nothing matches.
//
// Only ONE appointment is finished (the most advanced one: in room > called > waiting > not arrived
// > postponed / no-show; earliest time first) so a patient with two bookings on the same day
// keeps the other one.
const PRIORITY = { in: 0, called: 1, waiting: 2, '': 3, postponed: 4, 'no-show': 5 };

export function finishQueueEntries(list, { patientId, patient, date }, now = Date.now()) {
  if (!Array.isArray(list) || !date) return list;
  const pid = patientId == null || patientId === '' ? null : String(patientId);
  const name = String(patient || '').trim();

  const matches = [];
  list.forEach((a, i) => {
    if (!a || a.date !== date || a.cancelled || a.status === 'cancelled') return;
    const ws = a.waitStatus || '';
    if (!(ws in PRIORITY)) return;               // done / cancelled / unknown: leave alone
    const same = a.patientId != null && pid != null
      ? String(a.patientId) === pid
      : !!name && String(a.patient || '').trim() === name;
    if (same) matches.push({ i, ws, time: String(a.time || '') });
  });
  if (!matches.length) return list;

  matches.sort((x, y) => PRIORITY[x.ws] - PRIORITY[y.ws] || x.time.localeCompare(y.time));
  const pick = matches[0].i;
  return list.map((a, i) => (i === pick ? { ...a, waitStatus: 'done', doneAt: now } : a));
}
