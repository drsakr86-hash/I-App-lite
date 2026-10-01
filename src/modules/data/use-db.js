// The useDB hook -- moved here from public/legacy/app-runtime.js (Phase 8,
// combined batch 19). This is the core read/write hook nearly every screen
// uses for its data (patients, visits, appointments, settings, ...): it
// loads from localStorage first for an instant paint, then reconciles with
// Supabase (flushing a locally-dirty value, or pulling/pushing the first
// sync), subscribes to realtime updates for the key's table, and exposes a
// `persist` function that queues a save through the sync engine.
//
// Every dependency it used to reach through legacy closures (LS, busOn,
// isDirty, refreshPending, flushKey, queueSave, sbGet, sbGetRaw/sbSetRaw,
// ROW_TABLES/rowList, APT_KEY/APT_TABLE/aptList, getSB) was already moved to
// its own React module in earlier Phase 8 batches, so this is an exact copy
// with those closures replaced by direct imports -- no behavior change.

import { useState, useEffect, useCallback } from 'react';
import { LS, busOn, isDirty, refreshPending } from '../sync/engine.js';
import { flushKey, queueSave, sbGet, sbGetRaw, sbSetRaw } from '../sync/wiring.js';
import { ROW_TABLES, rowList } from '../sync/row-tables.js';
import { APT_KEY, APT_TABLE } from '../appointments/appointment.mapper.js';
import { aptList } from '../appointments/core.js';
import { getSB } from '../data-access/index.js';

export function useDB(key, seed) {
  const [data, setData] = useState(() => {
    try {
      const local = LS.get(key);
      if (local) return JSON.parse(local);
    } catch {}
    return seed;
  });
  const [ready, setReady] = useState(false);
  useEffect(() => {
    setReady(true);
    const off = busOn(key, setData);
    (async () => {
      if (isDirty(key)) {
        await flushKey(key);
        refreshPending();
        return;
      }
      const remote = await sbGetRaw(key);
      if (remote === undefined) {
        console.log(`[${key}] offline — using localStorage`);
      } else if (remote === null) {
        let toUpload = seed;
        try {
          const l = LS.get(key);
          if (l) toUpload = JSON.parse(l);
        } catch {}
        await sbSetRaw(key, toUpload);
        console.log(`[${key}] first sync ✓`);
      } else if (!isDirty(key)) {
        setData(remote);
        LS.set(key, JSON.stringify(remote));
        console.log(`[${key}] loaded from Supabase ✓`);
      }
    })();
    return off;
  }, [key]);
  useEffect(() => {
    const sb = getSB();
    if (!sb) return undefined;
    let channel;
    if (ROW_TABLES[key]) {
      try {
        channel = sb.channel('rows_' + key).on('postgres_changes', {
          event: '*',
          schema: 'public',
          table: ROW_TABLES[key].table
        }, async () => {
          if (isDirty(key)) return;
          const list = await rowList(key);
          if (Array.isArray(list) && !isDirty(key)) setData(list);
        }).subscribe();
      } catch (e) {
        console.warn(key + ' realtime unavailable', e && e.message);
      }
      return () => {
        if (channel) {
          try {
            sb.removeChannel(channel);
          } catch {}
        }
      };
    }
    if (key === APT_KEY) {
      try {
        channel = sb.channel('iapp_appointments_rows').on('postgres_changes', {
          event: '*',
          schema: 'public',
          table: APT_TABLE
        }, async () => {
          if (isDirty(key)) return;
          const list = await aptList();
          if (Array.isArray(list) && !isDirty(key)) setData(list);
        }).subscribe();
      } catch (e) {
        console.warn('appointments realtime unavailable', e && e.message);
      }
      return () => {
        if (channel) {
          try {
            sb.removeChannel(channel);
          } catch {}
        }
      };
    }
    try {
      channel = sb.channel(`iapp_store_${key}`).on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'iapp_store',
        filter: `key=eq.${key}`
      }, payload => {
        if (isDirty(key)) return;
        const next = payload?.new?.value;
        if (next !== undefined && next !== null) {
          setData(next);
          LS.set(key, JSON.stringify(next));
        }
      }).subscribe();
    } catch (e) {
      console.warn(`[${key}] realtime unavailable`, e?.message || e);
    }
    return () => {
      if (channel) {
        try {
          sb.removeChannel(channel);
        } catch {}
      }
    };
  }, [key]);
  const persist = useCallback(async val => {
    setData(val);
    return await queueSave(key, val);
  }, [key]);
  const refresh = useCallback(async () => {
    const remote = await sbGet(key);
    if (remote !== undefined && remote !== null) {
      setData(prev => JSON.stringify(prev) === JSON.stringify(remote) ? prev : remote);
      if (!isDirty(key)) LS.set(key, JSON.stringify(remote));
      return remote;
    }
    return undefined;
  }, [key]);
  return [data, persist, ready, refresh];
}
