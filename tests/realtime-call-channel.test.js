import test from 'node:test';
import assert from 'node:assert/strict';
import { callChannel, broadcastCall } from '../src/modules/realtime/call-channel.js';

// getSB() (src/modules/data-access/index.js) caches its resolved client in a
// module-private variable the first time globalThis.__IAppSupabaseClient is
// truthy -- same as tests/sync-store-io.test.js and tests/data-access.test.js
// -- so a single wrapper client is installed once here, and its `channel`
// behavior is swapped per test by reassigning what it delegates to.
// callChannel() itself also caches its own channel the first time it
// succeeds, so these tests run in a deliberate order: the "no client" cases
// first (before anything is installed), then a single successful channel
// build, reused by every later test (matching what the real module does --
// one channel for the whole app).

let channelImpl = () => { throw new Error('channelImpl not set for this test'); };
const wrapperClient = { channel: (...args) => channelImpl(...args) };

test('callChannel: returns null when no Supabase client is available', () => {
  delete globalThis.__IAppSupabaseClient;
  assert.equal(callChannel(), null);
});

test('broadcastCall: does nothing (and does not throw) when no channel is available', async () => {
  delete globalThis.__IAppSupabaseClient;
  await assert.doesNotReject(() => broadcastCall({ id: 1, patient: 'test' }));
});

test('callChannel: builds the broadcast channel (self:false) against "iapp_queue_calls" once, then caches it', () => {
  let channelName = null;
  let channelConfig = null;
  let subscribeCb = null;
  const fakeChannel = {
    subscribe: cb => { subscribeCb = cb; },
    send: async () => {}
  };
  channelImpl = (name, config) => {
    channelName = name;
    channelConfig = config;
    return fakeChannel;
  };
  globalThis.__IAppSupabaseClient = wrapperClient;

  const ch1 = callChannel();
  assert.equal(channelName, 'iapp_queue_calls');
  assert.deepEqual(channelConfig, { config: { broadcast: { self: false } } });
  assert.equal(ch1, fakeChannel);

  // A second call must reuse the same cached channel, not rebuild it.
  channelImpl = () => { throw new Error('channel() should not be called again'); };
  const ch2 = callChannel();
  assert.equal(ch2, fakeChannel);

  // Resolve the subscribe callback so later awaits on _callReady settle fast.
  subscribeCb('SUBSCRIBED');
});

test('broadcastCall: sends a "call" broadcast event with the expected payload shape', async () => {
  let sent = null;
  // The channel is already cached from the previous test (ch1 === fakeChannel
  // there); swap just its send() to observe this call.
  const ch = callChannel();
  ch.send = async msg => { sent = msg; };

  await broadcastCall({ id: 7, patient: 'سارة', clinic: 'دمنهور', doctor: 'د. أحمد' });

  assert.equal(sent.type, 'broadcast');
  assert.equal(sent.event, 'call');
  assert.equal(sent.payload.id, 7);
  assert.equal(sent.payload.patient, 'سارة');
  assert.equal(sent.payload.clinic, 'دمنهور');
  assert.equal(sent.payload.doctor, 'د. أحمد');
  assert.equal(sent.payload.repeat, '');
  assert.equal(typeof sent.payload.calledAt, 'string');
});

test('broadcastCall: passes a truthy "repeat" value through as given (recall case)', async () => {
  let sent = null;
  const ch = callChannel();
  ch.send = async msg => { sent = msg; };

  const ts = 123456789;
  await broadcastCall({ id: 9, patient: 'محمد' }, ts);

  assert.equal(sent.payload.repeat, ts);
  assert.equal(sent.payload.calledAt, '');
});

test('broadcastCall: a send() failure is swallowed, not thrown', async () => {
  const ch = callChannel();
  ch.send = async () => { throw new Error('network down'); };

  await assert.doesNotReject(() => broadcastCall({ id: 1, patient: 'test' }));
});
