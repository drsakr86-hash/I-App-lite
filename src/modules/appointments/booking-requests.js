// Patient booking requests (iapp_booking_requests) as seen by the admin.
//
// Until now only the secretary screen read this table, so a request a patient
// sent never appeared on the manager's side until a secretary accepted it. This
// module holds the pure/injected logic so the admin UI can list, accept and
// reject pending requests with honest results.
//
// Differences from the secretary's inline version:
//  * the status update is checked (the old code ignored the Supabase `error`
//    field and could mark a request handled when the write had failed);
//  * accepting twice (two devices, or a retry after a failed status update)
//    never creates a second appointment: an existing active appointment for the
//    same phone/date/time that came from a patient is reused;
//  * the status update is guarded with `status = pending`, so a request already
//    handled elsewhere is reported instead of silently overwritten.

import { t } from '../i18n/index.js';
import { buildAcceptedAppointment, acceptAptMutation, mutateErrorMessage, isActiveApt, REQUEST_DOCTOR } from '../secretary-app/model.js';

// Getters: each read returns the message in the CURRENT language.
export const BOOKING_MESSAGES = {
  get accepted() { return t('g5.req.accepted'); },
  get acceptedUnmarked() { return t('g5.req.acceptedUnmarked'); },
  get alreadyHandled() { return t('g5.req.alreadyHandled'); },
  get rejected() { return t('g5.req.rejected'); },
  get rejectFailed() { return t('g5.req.rejectFailed'); },
  get loadFailed() { return t('g5.req.loadFailed'); }
};

const errText = e => (e && (e.message || e.hint || e.details)) || String(e || 'error');

export const findExistingForRequest = (list, r) =>
  (Array.isArray(list) ? list : []).find(a =>
    a && a.fromPatient && isActiveApt(a) &&
    String(a.phone || '') === String(r.phone || '') && a.date === r.date && a.time === r.time) || null;

// sb: supabase client. Returns { ok, data, error } and never throws.
export async function loadPendingRequests(sb, table = 'iapp_booking_requests') {
  if (!sb) return { ok: false, data: [], error: 'no-client' };
  try {
    const { data, error } = await sb.from(table).select('*').eq('status', 'pending').order('created_at', { ascending: true });
    if (error) return { ok: false, data: [], error: errText(error) };
    return { ok: true, data: Array.isArray(data) ? data : [], error: null };
  } catch (e) {
    return { ok: false, data: [], error: errText(e) };
  }
}

// Marks a request handled only if it is still pending.
// Returns { ok, already } -- already=true when no pending row matched.
export async function setRequestStatus(sb, id, status, table = 'iapp_booking_requests') {
  try {
    const { data, error } = await sb.from(table).update({ status }).eq('id', id).eq('status', 'pending').select('id');
    if (error) return { ok: false, already: false, error: errText(error) };
    return { ok: true, already: !(Array.isArray(data) && data.length), error: null };
  } catch (e) {
    return { ok: false, already: false, error: errText(e) };
  }
}

/**
 * deps: { mutateAppointments(mutator, verify) -> {ok,data,error}, setStatus(id,status) -> {ok,already,error}, newId() }
 * -> { status: 'accepted'|'accepted-unmarked'|'already-handled'|'failed', message, appointment }
 */
export async function acceptBookingRequest(deps, request, doctor = REQUEST_DOCTOR) {
  const apt = buildAcceptedAppointment(request, deps.newId(), doctor);
  const res = await deps.mutateAppointments(
    list => (findExistingForRequest(list, request) ? [...list] : acceptAptMutation(list, apt)),
    list => !!findExistingForRequest(list, request) || list.some(a => a.id === apt.id)
  );
  if (!res || !res.ok) {
    return { status: 'failed', message: mutateErrorMessage(res && res.error), appointment: null };
  }
  const st = await deps.setStatus(request.id, 'accepted');
  if (!st.ok) return { status: 'accepted-unmarked', message: BOOKING_MESSAGES.acceptedUnmarked, appointment: apt };
  if (st.already) return { status: 'already-handled', message: BOOKING_MESSAGES.alreadyHandled, appointment: apt };
  return { status: 'accepted', message: BOOKING_MESSAGES.accepted, appointment: apt };
}

export async function rejectBookingRequest(deps, request) {
  const st = await deps.setStatus(request.id, 'rejected');
  if (!st.ok) return { status: 'failed', message: BOOKING_MESSAGES.rejectFailed };
  if (st.already) return { status: 'already-handled', message: BOOKING_MESSAGES.alreadyHandled };
  return { status: 'rejected', message: BOOKING_MESSAGES.rejected };
}
