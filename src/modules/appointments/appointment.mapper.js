// Pure appointment mapping + diff logic extracted from the legacy runtime
// (no I/O, no globals) so it can be unit-tested.
const num = v => (v === undefined || v === null || v === '' ? null : Number(v));
const opt = v => (v == null ? undefined : Number(v));

export const APT_TABLE = 'iapp_appointments';
export const APT_KEY = 'iapp_appointments';
export const APT_HISTORY_DAYS = 365;

export const appointmentFromRow = r => ({
  id: Number(r.id),
  patientId: r.patient_id == null ? null : Number(r.patient_id),
  patient: r.patient || '',
  phone: r.phone || '',
  date: r.date || '',
  time: r.time || '',
  type: r.type || '',
  doctor: r.doctor || '',
  clinic: r.clinic || '',
  notes: r.notes || '',
  confirmed: !!r.confirmed,
  fromPatient: !!r.from_patient,
  cancelled: !!r.cancelled,
  waitStatus: r.wait_status || undefined,
  arrivedAt: opt(r.arrived_at),
  calledAt: opt(r.called_at),
  inAt: opt(r.in_at),
  doneAt: opt(r.done_at),
  noShowAt: opt(r.no_show_at),
  queueNumber: opt(r.queue_number),
  cost: r.cost == null ? undefined : r.cost,
  paid: !!r.paid,
  reminded: r.reminded || undefined
});

export const appointmentToRow = a => ({
  id: Number(a.id),
  patient_id: a.patientId == null ? null : Number(a.patientId),
  patient: a.patient || '',
  phone: a.phone || '',
  date: a.date || null,
  time: a.time || '',
  type: a.type || null,
  doctor: a.doctor || null,
  clinic: a.clinic || null,
  notes: a.notes || null,
  confirmed: !!a.confirmed,
  from_patient: !!a.fromPatient,
  cancelled: !!a.cancelled,
  wait_status: a.waitStatus || null,
  arrived_at: num(a.arrivedAt),
  called_at: num(a.calledAt),
  in_at: num(a.inAt),
  done_at: num(a.doneAt),
  no_show_at: num(a.noShowAt),
  queue_number: num(a.queueNumber),
  cost: a.cost === undefined || a.cost === '' ? null : String(a.cost),
  paid: !!a.paid,
  reminded: a.reminded || null,
  updated_at: new Date().toISOString()
});

// Which appointments must be upserted / deleted to turn `base` into `next`.
export function diffAppointments(base, next) {
  const prevById = new Map(base.map(a => [String(a.id), a]));
  const nextById = new Map(next.map(a => [String(a.id), a]));
  const changed = next.filter(a => {
    const p = prevById.get(String(a.id));
    return !p || JSON.stringify(p) !== JSON.stringify(a);
  });
  const removed = base.filter(a => !nextById.has(String(a.id)));
  return { changed, removed };
}
