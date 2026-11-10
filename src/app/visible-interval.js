// setInterval that only fires while the page is visible, and fires once as soon as it becomes visible again.
// The 5-second data polls kept running in a background tab / locked phone: needless battery, mobile data and
// Supabase requests (the project is on the Free plan). Realtime channels keep delivering changes meanwhile.
// Returns a stop() function. `doc` is injectable for tests.
export function visibleInterval(fn, ms, doc = typeof document !== 'undefined' ? document : null) {
  const hidden = () => !!(doc && doc.hidden);
  const iv = setInterval(() => { if (!hidden()) fn(); }, ms);
  const onVis = () => { if (!hidden()) fn(); };
  if (doc && doc.addEventListener) doc.addEventListener('visibilitychange', onVis);
  return () => {
    clearInterval(iv);
    if (doc && doc.removeEventListener) doc.removeEventListener('visibilitychange', onVis);
  };
}
