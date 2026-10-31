// Network layer of the WhatsApp inbox. Reads go through Supabase RLS (admin/secretary only); state changes use the wa_staff_* RPCs;
// manual replies go to the whatsapp-send Edge Function, which re-checks the role and the 24 h window. No Meta credentials exist here.
import { getSB } from '../data-access/index.js';
import { isNotInstalled } from './model.js';

const isMissingColumn = e => !!e && (e.code === '42703' || e.code === 'PGRST204' || /column .* does not exist/i.test(String(e.message || '')));

const functionsUrl = () => String(sb().supabaseUrl || '').replace(/\/$/, '') + '/functions/v1/hyper-responder';
const sb = () => { const c = getSB(); if (!c) throw new Error('offline'); return c; };
const wrap = r => { if (r.error) { const e = new Error(r.error.message); e.code = r.error.code; throw e; } return r.data; };

export async function loadConversations(limit = 200) {
  try {
    const q = cols => sb().from('wa_conversations').select('id,status,ai_enabled,assigned_to,unread_count,last_message_at,last_inbound_at,last_preview,handoff_reason,wa_contacts(' + cols + ')').order('last_message_at', { ascending: false, nullsFirst: false }).limit(limit);
    let res = await q('id,wa_id,profile_name,consent,reminders_opt_in,channel,phone');
    if (res.error && isMissingColumn(res.error)) res = await q('id,wa_id,profile_name,consent,reminders_opt_in');   // Messenger migration not applied yet
    const rows = wrap(res) || [];
    const failed = wrap(await sb().from('wa_messages').select('conversation_id').eq('direction', 'out').eq('status', 'failed').gte('created_at', new Date(Date.now() - 7 * 86400000).toISOString()).limit(500)) || [];
    return { installed: true, rows: rows.map(({ wa_contacts, ...c }) => ({ ...c, contact: wa_contacts })), failedIds: new Set(failed.map(f => f.conversation_id)) };
  } catch (e) { if (isNotInstalled(e)) return { installed: false, rows: [], failedIds: new Set() }; throw e; }
}
export async function loadMessages(convId, limit = 200) {
  const rows = wrap(await sb().from('wa_messages').select('id,direction,sender,purpose,kind,body,template_name,status,error_code,error_detail,sent_by,created_at,apt_date,apt_time').eq('conversation_id', convId).order('id', { ascending: false }).limit(limit)) || [];
  return rows.reverse();
}
// Appointments of this contact, for the booking panel (same RLS as the rest of the app: staff only).
export async function loadAppointments(waId) {
  const tail = String(waId || '').replace(/\D/g, '').slice(-10); if (tail.length < 9) return [];
  const rows = wrap(await sb().from('iapp_appointments').select('id,date,time,clinic,patient,confirmed,cancelled,wait_status,type').ilike('phone', '%' + tail).order('date', { ascending: false }).limit(10)) || [];
  return rows;
}
export const rpc = async (name, args) => wrap(await sb().rpc(name, args));
export const takeOver = id => rpc('wa_staff_take_over', { p_conv: id });
export const returnToAi = id => rpc('wa_staff_return_to_ai', { p_conv: id });
export const assign = (id, who) => rpc('wa_staff_assign', { p_conv: id, p_assignee: who || null });
export const markRead = id => rpc('wa_staff_mark_read', { p_conv: id });
export const closeConv = id => rpc('wa_staff_close', { p_conv: id });
export const deleteConv = id => rpc('wa_staff_delete_conversation', { p_conv: id });
export const setReminderConsent = (contactId, v) => rpc('wa_staff_set_reminder_consent', { p_contact: contactId, p_value: v });
export const retryMessage = id => rpc('wa_staff_retry', { p_msg: id });

export async function sendManual(conversationId, text, clientId) {
  const { data } = await sb().auth.getSession();
  const token = data && data.session && data.session.access_token; if (!token) throw new Error('not signed in');
  const res = await fetch(functionsUrl(), { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + token }, body: JSON.stringify({ conversation_id: conversationId, text, client_id: clientId }) });
  let body = {}; try { body = await res.json(); } catch { /* empty */ }
  if (!res.ok) { const e = new Error(body.message || body.error || 'send failed'); e.status = res.status; e.code = body.error; throw e; }
  return body;
}

// Cheap poll for the unread badge: only conversations that have unread patient messages. Never throws (the badge is best-effort).
export async function loadUnreadCount() {
  try {
    const rows = wrap(await sb().from('wa_conversations').select('id,unread_count').gt('unread_count', 0).limit(200)) || [];
    return rows.length;
  } catch { return 0; }
}

// Conversations waiting for staff (banner). Never throws.
export async function loadWaiting() {
  try { return wrap(await sb().from('wa_conversations').select('id,status,unread_count,last_inbound_at,last_message_at').eq('status', 'handoff').gt('unread_count', 0).limit(200)) || []; }
  catch { return []; }
}
// Admin: recent system failures. RLS decides who can read (wa_audit is admin only); a secretary simply gets empty lists.
export async function loadSystemErrors() {
  const since = new Date(Date.now() - 7 * 86400000).toISOString();
  const [audits, failed, retrying] = await Promise.all([
    sb().from('wa_audit').select('id,at,conversation_id,detail').eq('action', 'ai_error').gte('at', since).order('at', { ascending: false }).limit(30),
    sb().from('wa_messages').select('id,conversation_id,created_at,error_code,error_detail').eq('direction', 'out').eq('status', 'failed').gte('created_at', since).order('created_at', { ascending: false }).limit(30),
    sb().from('wa_messages').select('id,conversation_id,created_at,process_error').eq('direction', 'in').not('process_error', 'is', null).neq('process_error', '').gte('created_at', since).order('created_at', { ascending: false }).limit(30)
  ]);
  return { audits: wrap(audits) || [], failed: wrap(failed) || [], retrying: wrap(retrying) || [] };
}
