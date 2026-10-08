// React hook over the finance store. Reads are explicit (mount / after each action / tab focus): opening the
// screen NEVER writes anything. Writes go through run(), which commits one batch via the sync layer.

import { useState, useEffect, useCallback, useRef } from 'react';
import { emptyState } from './constants.js';
import { loadFinanceState, commitBatch, SCOPES } from './store.js';
import { FinanceError } from './constants.js';
import { busOn } from '../sync/engine.js';

export function useFinance(scope = 'full') {
  const [state, setState] = useState(emptyState);
  const [status, setStatus] = useState({ loading: true, offline: false, busy: false, error: null });
  const stateRef = useRef(state);
  stateRef.current = state;

  const reload = useCallback(async () => {
    const r = await loadFinanceState(scope);
    setState(r.state);
    setStatus(s => ({ ...s, loading: false, offline: r.offline }));
    return r.state;
  }, [scope]);

  useEffect(() => {
    reload();
    const offs = (SCOPES[scope] || SCOPES.full).map(([, key]) => busOn(key, () => { if (!stateRef.busy) reload(); }));
    const onVis = () => { if (typeof document !== 'undefined' && !document.hidden) reload(); };
    const hasDoc = typeof document !== 'undefined';
    if (hasDoc) document.addEventListener('visibilitychange', onVis);
    return () => { offs.forEach(o => o()); if (hasDoc) document.removeEventListener('visibilitychange', onVis); };
  }, [reload, scope]);

  // planner(state) → batch (pure; may throw FinanceError). Returns {ok, code?}.
  const run = useCallback(async planner => {
    setStatus(s => ({ ...s, busy: true, error: null }));
    stateRef.busy = true;
    try {
      const cur = await reload(); // always plan against the freshest state we can read
      const batch = planner(cur);
      const res = await commitBatch(batch, cur);
      if (!res.ok) {
        setStatus(s => ({ ...s, error: 'COMMIT_FAILED' }));
        return { ok: false, code: 'COMMIT_FAILED' };
      }
      setState(res.state);
      return { ok: true, batch };
    } catch (e) {
      const code = e instanceof FinanceError ? e.code : 'UNKNOWN';
      setStatus(s => ({ ...s, error: code }));
      return { ok: false, code, message: e && e.message };
    } finally {
      stateRef.busy = false;
      setStatus(s => ({ ...s, busy: false }));
    }
  }, [reload]);

  return { state, status, reload, run };
}
