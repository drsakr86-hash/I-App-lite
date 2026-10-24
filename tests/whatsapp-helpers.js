// Test doubles for the WhatsApp functions: an in-memory store with the same interface as supabase/functions/_shared/store.js,
// and a scripted LLM. Everything is MOCKED - no database, no Meta, no model.
import crypto from 'node:crypto';
export const sign = (secret, body) => 'sha256=' + crypto.createHmac('sha256', secret).update(body).digest('hex');

export function fakeStore(over = {}) {
  const s = {
    cfg: { id: 1, enabled: true, ai_enabled: true, reminders_enabled: true, booking_mode: 'request', phone_number_id: 'PNID', clinic_tz: 'Africa/Cairo', urgent_message: null },
    msgs: [], out: [], handoffs: [], audits: [], consent: [], created: [], booked: [], cancelled: [], moved: [], processed: [], flow: {}, taken: {}, mine: [],
    failWrites: false, throwWrites: false, inboundCount: 0, aiTurns: 0, ingestFail: false, statuses: [], echoes: [], finished: [],
    reference: { prices: [{ name: 'كشف', price: 300 }], doctors: [{ name: 'د. عبدالستار', title: 'استشاري' }], faq: [] },
    async getConfig() { return s.cfg; },
    async ingestInbound(m) { if (s.ingestFail) throw new Error('db down'); if (s.msgs.some(x => x.wamid === m.wamid)) return { duplicate: true }; s.msgs.push(m); return { duplicate: false, conversation_id: 1, message_id: s.msgs.length }; },
    async ingestEcho(m) { s.echoes.push(m); },
    async recordStatus(x) { s.statuses.push(x); },
    async setConsent(...a) { s.consent.push(a); },
    async enqueueText(a) { if (s.out.some(o => o.idem === a.idem)) return null; s.out.push(a); return s.out.length; },
    async markProcessed(c, upTo, err) { s.processed.push({ c, upTo, err }); },
    async audit(a, b, c, d) { s.audits.push([a, b, c, d]); },
    async handoff(c, reason, notify) { s.handoffs.push({ c, reason, notify }); },
    async setFlowState(c, f) { s.flow = JSON.parse(JSON.stringify(f)); },
    async getReferenceData() { return s.reference; },
    async getRecent() { return s.recent || []; },
    async recentInboundCount() { return s.inboundCount; },
    async aiTurnsToday() { return s.aiTurns; },
    async takenTimes(clinic, date) { return s.taken[clinic + '|' + date] || []; },
    async myAppointments() { return s.mine; },
    async createBookingRequest(a) { if (s.throwWrites) throw new Error('network'); if (s.failWrites) return { ok: false, error: 'db' }; s.created.push(a); return { ok: true, id: 1 }; },
    async bookAppointment(a) { if (s.throwWrites) throw new Error('network'); if (s.failWrites) return { ok: false, error: 'db' }; if (s.slotTaken) return { ok: false, error: 'slot_taken' }; s.booked.push(a); return { ok: true, id: 7 }; },
    async cancelAppointment(a) { s.cancelled.push(a); return { ok: true }; },
    async rescheduleAppointment(a) { s.moved.push(a); return { ok: true }; },
    async getBundle() { return s.bundle; }, async getUnprocessed() { return s.unprocessed || []; }, async claimInbound() { return s.work || []; },
    async claimOutbound() { return s.claimed || []; }, async finishOutbound(...a) { s.finished.push(a); },
    async reapStuck() {}, async retryPending() {}, async enqueueReminders() { return 0; },
    async staffRole(e) { return s.roles && s.roles[e] || null; }, async getConversationWindow() { return s.window; }
  };
  return Object.assign(s, over);
}

// script: array of responses; each is {content:[...]} or a function(request)=>response
export function scriptedLlm(script) {
  const calls = []; let i = 0;
  return { calls, async complete(req) { calls.push(req); const r = script[Math.min(i++, script.length - 1)]; if (r instanceof Error) throw r; return typeof r === 'function' ? r(req) : r; } };
}
export const say = text => ({ content: [{ type: 'text', text }] });
export const useTool = (name, input, id = 't1') => ({ content: [{ type: 'tool_use', id, name, input }] });

// A Thursday 12:00 Cairo (UTC+3 in summer / UTC+2 in winter - fixed to a winter date to avoid DST ambiguity): 2026-01-15 is a Thursday.
export const NOW = new Date('2026-01-15T10:00:00Z');
