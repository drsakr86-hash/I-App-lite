// React bindings for src/app/back-stack.js.
import { useEffect, useRef, useState } from 'react';
import { backStack } from '../app/back-stack.js';

// While `open` is true, a back press calls onClose() instead of leaving the screen/app.
export function useBackClose(open, onClose) {
  const ref = useRef(onClose);
  ref.current = onClose;
  // A back press consumes the layer. If the overlay refuses to close (unsaved-changes guard), `open` stays true
  // and bumping `arm` registers a fresh layer so the next back press is still handled here.
  const [arm, setArm] = useState(0);
  useEffect(() => {
    if (!open) return undefined;
    return backStack().pushLayer(() => { if (ref.current) ref.current(); setArm(n => n + 1); });
  }, [open, arm]);
}

// Keeps a tab state in step with history: changing tab adds an entry, back returns to the previous tab.
// `isValid(tab)` guards against restoring a tab the current role cannot see.
export function useTabHistory(tab, setTab, isValid) {
  const fromHistory = useRef(tab);
  const validRef = useRef(isValid);
  validRef.current = isValid;
  const first = useRef(tab);
  useEffect(() => backStack().watchTabs(first.current, t => {
    const next = t && (!validRef.current || validRef.current(t)) ? t : first.current;
    fromHistory.current = next;
    setTab(next);
  }), [setTab]);
  useEffect(() => {
    if (fromHistory.current === tab) return; // initial tab, or a tab restored by a back press
    fromHistory.current = tab;
    backStack().pushTab(tab);
  }, [tab]);
}
