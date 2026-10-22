// Polls the number of WhatsApp conversations with unread messages, keeps the browser tab title in sync, and vibrates briefly when a new one arrives.
import { useEffect, useRef, useState } from 'react';
import { loadUnreadCount } from './service.js';
import { withTitleBadge, unreadIncreased } from './model.js';

const POLL_MS = 15000;
export function useWaUnread(enabled) {
  const [count, setCount] = useState(0);
  const prev = useRef(null);
  const baseTitle = useRef(typeof document !== 'undefined' ? String(document.title || '').replace(/^\(\d+\)\s*/, '') : '');
  useEffect(() => {
    if (!enabled) { prev.current = null; setCount(0); return undefined; }
    let alive = true;
    const tick = async () => {
      const n = await loadUnreadCount();
      if (!alive) return;
      if (unreadIncreased(prev.current, n)) { try { if (navigator.vibrate) navigator.vibrate([120, 60, 120]); } catch { /* not supported */ } }
      prev.current = n; setCount(n);
    };
    tick();
    const iv = setInterval(tick, POLL_MS);
    return () => { alive = false; clearInterval(iv); };
  }, [enabled]);
  useEffect(() => {
    if (typeof document === 'undefined') return undefined;
    try { document.title = withTitleBadge(baseTitle.current, count); } catch { /* no DOM */ }
    return () => { try { document.title = baseTitle.current; } catch { /* no DOM */ } };
  }, [count]);
  return count;
}
