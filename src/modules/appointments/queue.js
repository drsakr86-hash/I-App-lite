// Saving an examination for a patient who is currently called / in the room
// finishes their queue entry, so the secretary does not have to press
// "انتهى الكشف" by hand. Pure function: returns the same array when nothing matches.
const ACTIVE = ['called', 'in'];

export function finishQueueEntries(list, { patientId, patient, date }, now = Date.now()) {
  if (!Array.isArray(list) || !date) return list;
  const pid = patientId == null || patientId === '' ? null : String(patientId);
  const name = String(patient || '').trim();
  let changed = false;
  const next = list.map(a => {
    if (!a || a.date !== date || !ACTIVE.includes(a.waitStatus) || a.cancelled) return a;
    const samePatient = a.patientId != null && pid != null
      ? String(a.patientId) === pid
      : !!name && String(a.patient || '').trim() === name;
    if (!samePatient) return a;
    changed = true;
    return { ...a, waitStatus: 'done', doneAt: now };
  });
  return changed ? next : list;
}
