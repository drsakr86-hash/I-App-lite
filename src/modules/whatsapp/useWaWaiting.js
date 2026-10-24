// Polls chats waiting for staff. Beeps once (and vibrates) when the number goes up; the first reading never alerts. Works only while the app is open.
import { useEffect, useRef, useState } from 'react';
import { loadWaiting } from './service.js';
import { waitingSummary, unreadIncreased } from './model.js';

const POLL_MS = 15000;
function beep() {
  try {
    const Ctx = typeof window !== 'undefined' && (window.AudioContext || window.webkitAudioContext); if (!Ctx) return;
    const ctx = new Ctx(), o = ctx.createOscillator(), g = ctx.createGain();
    o.type = 'sine'; o.frequency.value = 880; g.gain.value = 0.08; o.connect(g); g.connect(ctx.destination);
    o.start(); setTimeout(() => { try { o.stop(); ctx.close(); } catch { /* closed */ } }, 350);
  } catch { /* audio needs a user gesture first: stay silent */ }
}
export function useWaWaiting(enabled) {
  const [sum, setSum] = useState({ count: 0, oldestMin: 0 });
  const prev = useRef(null);
  useEffect(() => {
    if (!enabled) { prev.current = null; setSum({ count: 0, oldestMin: 0 }); return undefined; }
    let alive = true;
    const tick = async () => {
      const s = waitingSummary(await loadWaiting());
      if (!alive) return;
      if (unreadIncreased(prev.current, s.count)) { beep(); try { if (navigator.vibrate) navigator.vibrate([200, 100, 200, 100, 200]); } catch { /* not supported */ } }
      prev.current = s.count; setSum(s);
    };
    tick();
    const iv = setInterval(tick, POLL_MS);
    return () => { alive = false; clearInterval(iv); };
  }, [enabled]);
  return sum;
}
