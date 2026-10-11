import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { maskPatientName } from '../src/modules/realtime/mask-name.js';
import { broadcastCall } from '../src/modules/realtime/call-channel.js';

const html = fs.readFileSync(new URL('../public/queue-display.html', import.meta.url), 'utf8');
const pick = re => html.match(re)[0];
const wordsSrc = pick(/function words\(n\)\{.*\}/);
const dispSrc = pick(/function displayName\(n\)\{.*\}/);
const displayName = new Function('SHOW_FULL_NAME', wordsSrc + dispSrc + ';return displayName;')(false);
const maskedSrc = pick(/function displayNameMasked\(n\)\{.*\}/);
const tvMasked = new Function(wordsSrc + maskedSrc + ';return displayNameMasked;')();

const NAMES = ['محمد علي السيد', 'أحمد', '', null, undefined, '   سارة   أحمد ,  علي', '<b>x</b> y', 'عبد الستار سالم صقر الدين محمد', 'منى، سعيد', 'Mona Hassan', 'علي ', '،،'];

test('maskPatientName == TV displayName == TV relay mask, for every sample (same rule as the SQL function)', () => {
  for (const n of NAMES) { assert.equal(maskPatientName(n), displayName(n), JSON.stringify(n)); assert.equal(tvMasked(n), displayName(n), JSON.stringify(n)); }
});
test('masked name never contains more than the first word and one initial', () => {
  assert.equal(maskPatientName('محمد علي السيد'), 'محمد ع.');
  assert.equal(maskPatientName(''), 'مريض');
  assert.ok(!maskPatientName('عبد الستار سالم صقر').includes('سالم'));
});
test('idempotent', () => { for (const n of NAMES) assert.equal(maskPatientName(maskPatientName(n)), maskPatientName(n)); });

test('broadcastCall puts only the masked name in the PUBLIC channel payload', async () => {
  let sent = null;
  globalThis.__IAppSupabaseClient = { channel: () => ({ subscribe: cb => { cb('SUBSCRIBED'); }, send: async m => { sent = m; } }) };
  // getSB caches the first client of the process; this file runs in its own process (node --test isolates files)
  await broadcastCall({ id: 5, patient: 'عبد الستار سالم صقر', clinic: 'دمنهور', doctor: 'د. أحمد', calledAt: '1' });
  assert.ok(sent, 'a broadcast was sent');
  assert.equal(sent.payload.patient, 'عبد ا.');
  assert.ok(!JSON.stringify(sent.payload).includes('سالم') && !JSON.stringify(sent.payload).includes('صقر'));
});

test('TV screen: online voice text carries no patient name; device voice only the first name', () => {
  const cb = new Function('words', pick(/function firstName\(n\)\{.*\}/) + pick(/function callText\(a,online\)\{.*\}/) + ';return callText;')(null);
  // firstName uses words(): inject the real one
  const callText = new Function(wordsSrc + pick(/function firstName\(n\)\{.*\}/) + pick(/function callText\(a,online\)\{.*\}/) + ';return callText;')();
  void cb;
  const a = { patient: 'محمد علي السيد', _q: 7 };
  assert.equal(callText(a, true), 'رقم 7، برجاء التوجه لغرفة الكشف');
  assert.ok(!callText(a, true).includes('محمد'));
  assert.equal(callText(a, false), 'رقم 7، محمد، برجاء التوجه لغرفة الكشف');
  assert.equal(callText({ patient: 'محمد علي' }, true), 'المريض المنادى، برجاء التوجه لغرفة الكشف');
});
test('TV screen source: Google TTS is only ever fed callText(a,true)', () => {
  assert.match(html, /speakOnline\(callText\(a,true\)/);
  assert.doesNotMatch(html, /spokenName/);
});
