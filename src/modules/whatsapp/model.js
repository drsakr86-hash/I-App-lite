// Pure logic for the WhatsApp inbox (no React, no network): filtering, ordering, window/delivery state and display helpers.
export const WINDOW_MS = 24 * 3600 * 1000;

export const windowOpen = (conv, now = Date.now()) => !!(conv && conv.last_inbound_at && now - new Date(conv.last_inbound_at).getTime() < WINDOW_MS);
export const windowLeftMin = (conv, now = Date.now()) => windowOpen(conv, now) ? Math.max(0, Math.floor((WINDOW_MS - (now - new Date(conv.last_inbound_at).getTime())) / 60000)) : 0;

// Who currently owns the conversation: the assistant, a person, or nobody (closed).
export function ownerOf(conv) {
  if (!conv) return 'none';
  if (conv.status === 'closed') return 'closed';
  return conv.status === 'ai' && conv.ai_enabled ? 'ai' : 'human';
}

export const FILTERS = ['all', 'unread', 'handoff', 'mine', 'failed'];
export function filterConversations(list, { filter = 'all', search = '', me = '', failedIds = new Set() } = {}) {
  const q = String(search || '').trim().toLowerCase(), digits = q.replace(/\D/g, '');
  return (list || []).filter(c => {
    if (filter === 'unread' && !(c.unread_count > 0)) return false;
    if (filter === 'handoff' && ownerOf(c) !== 'human') return false;
    if (filter === 'mine' && (!me || String(c.assigned_to || '').toLowerCase() !== String(me).toLowerCase())) return false;
    if (filter === 'failed' && !failedIds.has(c.id)) return false;
    if (!q) return true;
    const name = String(c.contact && c.contact.profile_name || '').toLowerCase(), wa = String(c.contact && c.contact.wa_id || '');
    return name.includes(q) || (digits.length >= 3 && wa.includes(digits)) || String(c.last_preview || '').toLowerCase().includes(q);
  }).sort((a, b) => new Date(b.last_message_at || 0) - new Date(a.last_message_at || 0));
}

// Delivery label key for an outgoing message (the screen translates it).
export function deliveryKey(m) {
  if (!m || m.direction !== 'out') return null;
  return { queued: 'queued', sending: 'sending', sent: 'sent', delivered: 'delivered', read: 'read', failed: 'failed', cancelled: 'cancelled' }[m.status] || 'queued';
}
export const canRetry = m => !!m && m.direction === 'out' && m.status === 'failed' && m.error_code !== 'WINDOW_CLOSED';
// "uncertain" = may have reached the patient: staff must check before resending (the server never resends it automatically).
export const isUncertain = m => !!m && m.direction === 'out' && m.status === 'failed' && /^UNCERTAIN/.test(String(m.error_code || ''));

// A booking made by the assistant is only "confirmed" when the appointment row says so; otherwise it is a request awaiting the secretary.
export const bookingState = a => !a ? null : a.cancelled ? 'cancelled' : a.confirmed ? 'confirmed' : 'requested';

export const newClientId = () => (globalThis.crypto && crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(16).slice(2)).replace(/[^\w-]/g, '').slice(0, 64);

export function maskWa(wa) { const s = String(wa || ''); return s.length > 6 ? s.slice(0, 4) + '••••' + s.slice(-3) : s; }

// The tables may not exist yet (migration not applied): treat these errors as "feature not enabled", not as a failure.
export const isNotInstalled = e => !!e && (e.code === '42P01' || e.code === 'PGRST205' || /relation .*wa_.* does not exist|Could not find the table/i.test(String(e.message || '')));
