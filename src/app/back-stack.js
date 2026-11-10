// Back-button support (Android hardware back inside the APK wrapper, browser back, swipe-back).
//
// Before this module the app kept its tabs and dialogs in React state only, so "back" left the app
// (or went to the login route) instead of closing the dialog / returning to the previous tab.
//
// Model: every *layer* the user can step back out of gets one history entry on the SAME url:
//   - an open overlay (dialog, search, "More" sheet, an open patient file)  -> pushLayer(onBack)
//   - a tab change                                                          -> pushTab(tab)
// On popstate the top overlay (if any) is closed; otherwise the tab stored in the entry is restored.
// Closing an overlay from the UI consumes its own entry with history.back() so no dead entries pile up;
// pushes requested while that back() is still in flight are queued and replayed when it lands.
//
// The url never changes, and the router's own history.state fields (usr/key/idx) are preserved by
// spreading the current state, so react-router sees the same location and is unaffected.
//
// createBackStack(win) is a factory so the logic can be unit-tested with a fake window/history.

const TAB = 'iappTab';
const LAYER = 'iappLayer';
const SETTLE_MS = 700; // safety net: if the popstate of our own back() never arrives, stop waiting

export function createBackStack(win) {
  const hist = win && win.history;
  const usable = !!(hist && typeof hist.pushState === 'function' && typeof win.addEventListener === 'function');
  const layers = [];        // open overlays, oldest first: { id, onBack }
  let seq = 0;
  let cur = 0;              // layer id of the entry we are logically on (0 = none); runs ahead of history while a back() is in flight
  let pendingBacks = 0;     // our own history.back() calls whose popstate has not arrived yet
  let queue = [];           // pushes deferred while pendingBacks > 0
  let settleTimer = null;
  let tabListener = null;   // (tab | undefined) => void

  const state = () => { try { return hist.state || {}; } catch { return {}; } };
  const push = extra => { try { hist.pushState({ ...state(), ...extra }, ''); } catch { /* history unavailable (sandboxed frame): non-fatal */ } };
  const replace = extra => { try { hist.replaceState({ ...state(), ...extra }, ''); } catch { /* history unavailable: non-fatal */ } };

  const flush = () => {
    const q = queue;
    queue = [];
    q.forEach(fn => fn());
  };
  const settle = () => {
    pendingBacks = 0;
    cur = state()[LAYER] || 0;
    if (settleTimer) { clearTimeout(settleTimer); settleTimer = null; }
    flush();
  };
  const whenIdle = fn => { if (pendingBacks > 0) queue.push(fn); else fn(); };

  const onPop = () => {
    if (pendingBacks > 0) {           // the entry of an overlay the UI already closed
      pendingBacks -= 1;
      if (pendingBacks === 0) settle();
      return;
    }
    cur = state()[LAYER] || 0;
    const top = layers.pop();
    if (top) {                        // back closes the top overlay
      try { top.onBack(); } catch (e) { console.warn('back handler failed', e); }
      return;
    }
    if (tabListener) tabListener(state()[TAB]);
  };
  if (usable) win.addEventListener('popstate', onPop);

  // Register an open overlay. Returns release(): call it when the overlay closes for any reason.
  function pushLayer(onBack) {
    if (!usable) return () => {};
    const layer = { id: ++seq, onBack, pushed: false };
    layers.push(layer);
    whenIdle(() => {
      if (!layers.includes(layer)) return; // closed again before the push ran
      layer.prev = cur;
      push({ [LAYER]: layer.id });
      cur = layer.id;
      layer.pushed = true;
    });
    return function release() {
      const i = layers.indexOf(layer);
      if (i === -1) return;             // already closed by a back press
      layers.splice(i, 1);
      // Consume our own entry only if it is still the current one (nothing was pushed above it).
      if (layer.pushed && cur === layer.id) {
        pendingBacks += 1;
        cur = layer.prev || 0;
        if (settleTimer) clearTimeout(settleTimer);
        settleTimer = setTimeout(settle, SETTLE_MS);
        try { hist.back(); } catch { settle(); }
      }
    };
  }

  // Tabs: one listener at a time (the mounted app shell).
  function watchTabs(initialTab, listener) {
    if (!usable) return () => {};
    tabListener = listener;
    if (state()[TAB] !== initialTab) replace({ [TAB]: initialTab, [LAYER]: 0 });
    return () => { if (tabListener === listener) tabListener = null; };
  }
  function pushTab(tab) {
    if (!usable) return;
    whenIdle(() => { if (state()[TAB] !== tab) { push({ [TAB]: tab, [LAYER]: 0 }); cur = 0; } });
  }

  return { pushLayer, watchTabs, pushTab, depth: () => layers.length, dispose: () => { if (usable) win.removeEventListener('popstate', onPop); settle(); } };
}

let shared = null;
export function backStack() {
  if (!shared) shared = createBackStack(typeof window !== 'undefined' ? window : null);
  return shared;
}
