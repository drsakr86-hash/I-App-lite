// Patient-call broadcast channel -- moved here from
// public/legacy/app-runtime.js (Phase 8, batch 17). Exact copy of the
// original logic; app-runtime.js now delegates to this module instead of
// redefining either of these.
//
// This is the sender side only (used by WaitingRoom's "call"/"recall"
// buttons to broadcast which patient was called, over a Supabase realtime
// channel) -- same as the original. Whatever listens for these broadcasts
// (a separate waiting-room display) is outside this codebase, same as
// before the move.

import { getSB } from '../data-access/index.js';
import { logError } from '../../services/logger.js';

let _callCh = null;
let _callReady = null;

export function callChannel() {
  const sb = getSB();
  if (!sb) return null;
  if (!_callCh) {
    _callCh = sb.channel('iapp_queue_calls', {
      config: { broadcast: { self: false } }
    });
    _callReady = new Promise(res => {
      try {
        _callCh.subscribe(st => {
          if (st === 'SUBSCRIBED') res(true);
        });
      } catch (e) {
        res(false);
      }
    });
  }
  return _callCh;
}

export async function broadcastCall(a, repeat) {
  const ch = callChannel();
  if (!ch) return;
  await Promise.race([_callReady, new Promise(r => setTimeout(r, 2500))]);
  try {
    await ch.send({
      type: 'broadcast',
      event: 'call',
      payload: {
        id: a.id,
        calledAt: a.calledAt || '',
        repeat: repeat || '',
        patient: a.patient || '',
        clinic: a.clinic || '',
        doctor: a.doctor || ''
      }
    });
  } catch (e) {
    logError('queue.broadcastCall', e, { id: a && a.id });
  }
}
