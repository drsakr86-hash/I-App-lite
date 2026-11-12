import test from 'node:test';
import assert from 'node:assert/strict';
import { buildConsent, consentValid, applyDraft, CONSENT_VERSION } from '../src/modules/ai-scribe/model.js';
import { analyzeRecording } from '../src/modules/ai-scribe/service.js';

test('consent record carries version, user and time; empty one is invalid', () => {
  const c = buildConsent({ by: 'dr@x.io', at: 'T' });
  assert.deepEqual(c, { version: CONSENT_VERSION, by: 'dr@x.io', at: 'T' });
  assert.equal(consentValid(c), true);
  assert.equal(consentValid(buildConsent({ by: '' })), false);
  assert.equal(consentValid(true), false);
  assert.equal(consentValid(null), false);
});

test('applied draft stores the consent record and the accepted fields', () => {
  const rows = [{ key: 'notes', value: 'n', same: false }];
  const r = applyDraft({ notes: '' }, rows, { notes: true }, { model: 'm', at: 'T', consent: buildConsent({ by: 'a@x', at: 'T' }) });
  assert.equal(r.form.aiScribe.consent.by, 'a@x');
  assert.deepEqual(r.form.aiScribe.fields, ['notes']);
});

test('no recording is sent without a recorded consent', async () => {
  await assert.rejects(() => analyzeRecording(new Blob(['x'], { type: 'audio/webm' }), '2026-11-12', null), /consent required/);
});
