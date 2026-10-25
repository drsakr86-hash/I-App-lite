// Database access for the WhatsApp functions, over a supabase-js style client (service_role). All state changes go through the
// wa_* SQL functions of docs/sql/whatsapp-assistant.sql; direct table access here is read-only (plus flow_state).
export function createStore(sb) {
  const rpc = async (fn, args = {}) => { const { data, error } = await sb.rpc(fn, args); if (error) throw new Error(`${fn}: ${error.message}`); return data; };
  const must = ({ data, error }, what) => { if (error) throw new Error(`${what}: ${error.message}`); return data; };
  return {
    rpc,
    async getConfig() { return must(await sb.from('wa_config').select('*').eq('id', 1).maybeSingle(), 'getConfig'); },
    async getBundle(convId) {
      const row = must(await sb.from('wa_conversations').select('id,status,ai_enabled,flow_state,contact_id,wa_contacts(wa_id,consent,reminders_opt_in)').eq('id', convId).maybeSingle(), 'getBundle');
      if (!row) return null;
      const { wa_contacts: contact, ...conv } = row; return { conv, contact };
    },
    async getUnprocessed(convId, upTo) {
      return must(await sb.from('wa_messages').select('id,body,kind').eq('conversation_id', convId).eq('direction', 'in').is('processed_at', null).lte('id', upTo).order('id'), 'getUnprocessed') || [];
    },
    async getRecent(convId, n) {
      const rows = must(await sb.from('wa_messages').select('id,direction,sender,body,kind,status').eq('conversation_id', convId).not('status', 'in', '(cancelled,failed)').order('id', { ascending: false }).limit(n), 'getRecent') || [];
      return rows.reverse();
    },
    async setFlowState(convId, flow) { must(await sb.from('wa_conversations').update({ flow_state: flow }).eq('id', convId), 'setFlowState'); },
    async getReferenceData() {
      const kv = must(await sb.from('iapp_store').select('key,value').in('key', ['iapp_prices', 'iapp_doctors']), 'reference') || [];
      const get = k => (kv.find(r => r.key === k) || {}).value || [];
      const faq = must(await sb.from('wa_faq').select('topic,answer,active').eq('active', true), 'faq') || [];
      return { prices: get('iapp_prices'), doctors: get('iapp_doctors'), faq };
    },
    async recentInboundCount(convId, minutes) {
      const since = new Date(Date.now() - minutes * 60000).toISOString();
      const { count, error } = await sb.from('wa_messages').select('id', { count: 'exact', head: true }).eq('conversation_id', convId).eq('direction', 'in').gte('created_at', since);
      if (error) throw new Error('recentInboundCount: ' + error.message); return count || 0;
    },
    async aiTurnsToday(convId) {
      const since = new Date(Date.now() - 24 * 3600000).toISOString();
      const { count, error } = await sb.from('wa_messages').select('id', { count: 'exact', head: true }).eq('conversation_id', convId).eq('direction', 'out').eq('sender', 'ai').gte('created_at', since);
      if (error) throw new Error('aiTurnsToday: ' + error.message); return count || 0;
    },
    async staffRole(email) { const r = must(await sb.from('iapp_staff').select('role').ilike('email', String(email || '')).maybeSingle(), 'staffRole'); return r ? r.role : null; },
    async getConversationWindow(convId) { return must(await sb.from('wa_conversations').select('id,last_inbound_at').eq('id', convId).maybeSingle(), 'window'); },

    async takenTimes(clinic, date) { return (await rpc('wa_taken_times', { p_clinic: clinic, p_date: date }) || []).map(r => (typeof r === 'string' ? r : r.slot)); },
    async myAppointments(waId) { return await rpc('wa_my_appointments', { p_wa_id: waId }) || []; },
    createBookingRequest: a => rpc('wa_create_booking_request', { p_conv: a.conv, p_wa_id: a.waId, p_clinic: a.clinic, p_date: a.date, p_time: a.time, p_name: a.name, p_type: a.type, p_note: a.note }),
    bookAppointment: a => rpc('wa_book_appointment', { p_conv: a.conv, p_wa_id: a.waId, p_clinic: a.clinic, p_doctor: a.doctor, p_date: a.date, p_time: a.time, p_name: a.name, p_type: a.type }),
    cancelAppointment: a => rpc('wa_cancel_appointment', { p_conv: a.conv, p_wa_id: a.waId, p_apt: a.apt }),
    rescheduleAppointment: a => rpc('wa_reschedule_appointment', { p_conv: a.conv, p_wa_id: a.waId, p_apt: a.apt, p_date: a.date, p_time: a.time }),
    enqueueText: a => rpc('wa_enqueue_text', { p_conv: a.conv, p_sender: a.sender, p_purpose: a.purpose, p_body: a.body, p_idem: a.idem, p_sent_by: a.sentBy || null }),
    handoff: (conv, reason, notify) => rpc('wa_handoff', { p_conv: conv, p_reason: reason, p_notify: notify !== false }),
    markProcessed: (conv, upTo, err) => rpc('wa_mark_processed', { p_conv: conv, p_upto: upTo, p_error: err || null }),
    setConsent: (waId, reminders, optOut, source) => rpc('wa_set_consent', { p_wa_id: waId, p_reminders: reminders, p_opt_out: optOut, p_source: source }),
    pushClaim: () => rpc('wa_push_claim', {}),
    pushDrop: ids => rpc('wa_push_drop', { p_ids: ids }),
    audit: (actor, action, conv, detail) => rpc('wa_audit_add', { p_actor: actor, p_action: action, p_conv: conv, p_apt: null, p_detail: detail || null }),
    ingestInbound: m => rpc('wa_ingest_inbound', { p_wa_id: m.waId, p_profile_name: m.name || null, p_wamid: m.wamid, p_kind: m.kind, p_body: m.body || null, p_ts: m.ts }),
    ingestEcho: m => rpc('wa_ingest_echo', { p_to_wa_id: m.to, p_wamid: m.wamid, p_kind: m.kind, p_body: m.body || null, p_ts: m.ts }),
    recordStatus: s => rpc('wa_record_status_event', { p_wamid: s.wamid, p_status: s.status, p_ts: s.ts, p_code: s.code || null, p_detail: s.detail || null }),
    claimInbound: n => rpc('wa_claim_inbound', { p_limit: n }),
    claimOutbound: n => rpc('wa_claim_outbound', { p_limit: n }),
    finishOutbound: (id, outcome, providerId, code, detail, retrySecs) => rpc('wa_finish_outbound', { p_id: id, p_outcome: outcome, p_provider_id: providerId || null, p_code: code || null, p_detail: detail || null, p_retry_secs: retrySecs || 60 }),
    reapStuck: () => rpc('wa_reap_stuck'),
    retryPending: () => rpc('wa_retry_pending_statuses'),
    enqueueReminders: () => rpc('wa_enqueue_reminders'),
    purge: () => rpc('wa_purge')
  };
}
