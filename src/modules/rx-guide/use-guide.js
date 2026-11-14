// Loads the guide (lazy chunk) together with the clinic's edits and returns the merged card list.
// Shared by the guide screen and the "from the guide" picker in the prescription / exam forms.
import { useState, useEffect, useMemo, useCallback } from 'react';
import { retryImport } from '../../app/chunk-recovery.js';
import { applyOverlay } from './model.js';
import { loadGuideOverlay, refreshGuideOverlay } from './store.js';

export function useGuideCards() {
  const [data, setData] = useState(null);
  const [failed, setFailed] = useState(false);
  const [overlay, setOverlay] = useState(loadGuideOverlay);
  useEffect(() => {
    let live = true;
    retryImport(() => import('./data.js')).then(m => { if (live) setData(m.default); }).catch(() => { if (live) setFailed(true); });
    refreshGuideOverlay().then(o => { if (live) setOverlay(o); }).catch(() => { /* offline: the local copy stays */ });
    return () => { live = false; };
  }, []);
  const cards = useMemo(() => (data ? applyOverlay(data.cards, overlay) : []), [data, overlay]);
  const reload = useCallback(list => setOverlay(Array.isArray(list) ? list : loadGuideOverlay()), []);
  return { data, cards, overlay, failed, reload };
}
