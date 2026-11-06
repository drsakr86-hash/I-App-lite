import test from 'node:test';
import assert from 'node:assert/strict';
import * as D from '../src/modules/atlas/drawings.js';
import { createSignedUrlCache, makeSupabaseResolver } from '../src/modules/atlas/signed-urls.js';
import { resolveFlag } from '../src/modules/feature-flags/index.js';

const doc = { id: 'u1', name: 'Dr. A' };
const img = (p = 'atlas/12/aaaa1111.png') => ({ provider: 'supabase', bucket: 'clinical-private', path: p, bytes: 100, sha256: 'x', mime: 'image/png' });
const base = () => D.approveDrawing({ id: 'aaaa1111', plateId: 'retina-layers', annotations: [{ t: 'pen' }], image: img(), patientId: 12, visitId: 5, examId: 7, user: doc, role: 'doctor', now: '2026-11-06T10:00:00Z' });

test('path rules', () => {
  assert.equal(D.drawingPath('atlas', 12, 'aaaa1111', 'PNG'), 'atlas/12/aaaa1111.png');
  assert.throws(() => D.drawingPath('x', 12, 'aaaa1111', 'png'));
  assert.throws(() => D.drawingPath('atlas', '12/../1', 'aaaa1111', 'png'));
  assert.throws(() => D.drawingPath('atlas', 12, '../a', 'png'));
  assert.throws(() => D.drawingPath('atlas', 12, 'aaaa1111', 'exe'));
  assert.equal(D.pathKind('atlas/1/a.png'), 'atlas');
  assert.equal(D.pathKind('etc/passwd'), null);
});

test('only doctor/admin approve; secretary and employee cannot', () => {
  for (const role of ['secretary', 'employee', 'patient', undefined]) {
    assert.equal(D.canApproveDrawing(role), false);
    assert.equal(D.canViewDrawings(role), false);
    assert.throws(() => D.approveDrawing({ id: 'aaaa1111', plateId: 'p', image: img(), patientId: 1, visitId: 1, user: doc, role }));
  }
  assert.equal(D.canApproveDrawing('admin'), true);
});

test('approval records who/when/visit/exam and starts hidden from reports', () => {
  const d = base();
  assert.equal(d.status, 'approved');
  assert.equal(d.approvedBy, 'u1');
  assert.equal(d.approvedAt, '2026-11-06T10:00:00.000Z');
  assert.equal(d.visitId, 5); assert.equal(d.examId, 7);
  assert.equal(d.includeInReport, false);
  assert.equal(d.revisions.length, 1);
  assert.equal(d.revisions[0].action, 'approve');
});

test('approval needs patient, visit-or-exam, user and a private-bucket atlas image', () => {
  const ok = { id: 'aaaa1111', plateId: 'p', image: img(), patientId: 1, visitId: 1, user: doc, role: 'doctor' };
  assert.ok(D.approveDrawing(ok));
  assert.throws(() => D.approveDrawing({ ...ok, patientId: null }));
  assert.throws(() => D.approveDrawing({ ...ok, visitId: null, examId: null }));
  assert.throws(() => D.approveDrawing({ ...ok, user: null }));
  assert.throws(() => D.approveDrawing({ ...ok, image: { ...img(), provider: 'cloudinary' } }));
  assert.throws(() => D.approveDrawing({ ...ok, image: img('imaging/1/a.png') }));
});

test('revise never edits in place: old kept as superseded, new version added, history grows', () => {
  const v1 = base();
  const list = D.addDrawing([], v1);
  const out = D.reviseDrawing(list, 'aaaa1111', { newId: 'bbbb2222', annotations: [{ t: 'arrow' }], image: img('atlas/12/bbbb2222.png'), user: { id: 'u2', name: 'Dr. B' }, role: 'admin', now: '2026-11-07T09:00:00Z' });
  assert.equal(out.length, 2);
  const old = out.find(x => x.id === 'aaaa1111'); const cur = out.find(x => x.id === 'bbbb2222');
  assert.equal(old.status, 'superseded'); assert.equal(old.supersededBy, 'bbbb2222');
  assert.deepEqual(old.annotations, [{ t: 'pen' }]);          // old content untouched
  assert.equal(old.image.path, 'atlas/12/aaaa1111.png');       // old file still referenced
  assert.equal(cur.status, 'approved'); assert.equal(cur.supersedes, 'aaaa1111');
  assert.equal(cur.approvedBy, 'u2');                          // who made this change is recorded
  assert.deepEqual(cur.revisions.map(r => r.action), ['approve', 'edit']);
  assert.deepEqual(old.revisions.map(r => r.action), ['approve', 'supersede']);
  assert.deepEqual(D.versionChain(out, 'bbbb2222').map(x => x.id), ['aaaa1111', 'bbbb2222']);
  assert.equal(list.length, 1); assert.equal(v1.status, 'approved'); // inputs not mutated
  assert.throws(() => D.reviseDrawing(out, 'aaaa1111', { newId: 'cccc3333', annotations: [], image: img('atlas/12/c.png'), user: doc, role: 'doctor' })); // superseded cannot be revised
  assert.throws(() => D.reviseDrawing(out, 'bbbb2222', { newId: 'cccc3333', annotations: [], image: img('atlas/12/c.png'), user: doc, role: 'secretary' }));
});

test('report inclusion is per drawing, off by default, audited, and reset by a new version', () => {
  let list = D.addDrawing([], base());
  assert.equal(D.reportDrawings(list, 'doctor').length, 0);
  list = D.setIncludeInReport(list, 'aaaa1111', true, { user: doc, role: 'doctor', now: '2026-11-06T11:00:00Z' });
  assert.equal(D.reportDrawings(list, 'doctor').length, 1);
  assert.equal(list[0].revisions.at(-1).action, 'toggleReport');
  assert.equal(D.reportDrawings(list, 'secretary').length, 0);
  assert.throws(() => D.setIncludeInReport(list, 'aaaa1111', false, { user: doc, role: 'secretary' }));
  list = D.reviseDrawing(list, 'aaaa1111', { newId: 'bbbb2222', annotations: [], image: img('atlas/12/bbbb2222.png'), user: doc, role: 'doctor' });
  assert.equal(D.reportDrawings(list, 'doctor').length, 0); // new version needs a fresh decision
  assert.throws(() => D.setIncludeInReport(list, 'aaaa1111', true, { user: doc, role: 'doctor' })); // superseded cannot be printed
});

test('privacy: non-clinical roles see nothing; patient portal data is stripped', () => {
  const list = D.addDrawing([], base());
  for (const role of ['secretary', 'employee', 'patient', undefined]) {
    assert.deepEqual(D.visibleDrawings(list, role), []);
    assert.deepEqual(D.currentDrawings(list, role), []);
  }
  assert.equal(D.visibleDrawings(list, 'doctor').length, 1);
  const ophth = { diagnosis: 'x', [D.ATLAS_DRAWINGS_KEY]: list };
  const safe = D.stripClinicalDrawings(ophth);
  assert.equal(D.ATLAS_DRAWINGS_KEY in safe, false);
  assert.equal(safe.diagnosis, 'x');
  assert.ok(D.ATLAS_DRAWINGS_KEY in ophth); // original untouched
  assert.equal(D.stripClinicalDrawings(null), null);
});

test('merge keeps both sides and the longer history', () => {
  const a = D.addDrawing([], base());
  const b = D.setIncludeInReport(a, 'aaaa1111', true, { user: doc, role: 'doctor' });
  const other = D.approveDrawing({ id: 'dddd4444', plateId: 'p', image: img('atlas/12/dddd4444.png'), patientId: 12, visitId: 5, user: doc, role: 'doctor', now: '2026-11-06T12:00:00Z' });
  const m = D.mergeDrawings(a, [...b, other]);
  assert.equal(m.length, 2);
  assert.equal(m.find(x => x.id === 'aaaa1111').revisions.length, 2);
  assert.deepEqual(D.mergeDrawings(m, m), m);
});

test('array <-> table rows is lossless (future migration to a standalone table)', () => {
  let list = D.addDrawing([], base());
  list = D.reviseDrawing(list, 'aaaa1111', { newId: 'bbbb2222', annotations: [{ t: 'note', text: 'ن' }], image: img('atlas/12/bbbb2222.png'), user: doc, role: 'doctor' });
  assert.deepEqual(D.fromRows(D.toRows(list)), list);
});

test('fingerprint is stable and order-independent for keys', () => {
  assert.equal(D.fingerprint({ a: 1, b: [1, 2] }), D.fingerprint({ b: [1, 2], a: 1 }));
  assert.notEqual(D.fingerprint({ a: 1 }), D.fingerprint({ a: 2 }));
});

test('signed urls: cache, renew before expiry, dedupe, partial failure', async () => {
  let t = 0, calls = 0;
  const c = createSignedUrlCache({ sign: async p => { calls++; return { url: 'u:' + p + ':' + calls }; }, now: () => t, ttlSeconds: 3600 });
  const [a, b] = await Promise.all([c.get('atlas/1/x.png'), c.get('atlas/1/x.png')]);
  assert.equal(a, b); assert.equal(calls, 1);                 // concurrent calls share one signing
  assert.equal(await c.get('atlas/1/x.png'), a); assert.equal(calls, 1);
  t = 3600 * 1000 - 4 * 60 * 1000;                              // inside the renewal window
  assert.notEqual(await c.get('atlas/1/x.png'), a); assert.equal(calls, 2);
  const many = await createSignedUrlCache({ sign: async p => { if (p === 'bad') throw new Error('nope'); return p; } }).getMany(['ok', 'bad', 'ok']);
  assert.equal(many.ok.ok, true); assert.equal(many.bad.ok, false);
  assert.rejects(() => c.get(''));
});

test('signed urls: expired link is renewed once, then a clear error (file never lost)', async () => {
  let n = 0;
  const c = createSignedUrlCache({ sign: async () => 'u' + (++n) });
  const r = await c.open('atlas/1/x.png', async u => { if (u === 'u1') throw new Error('expired'); return u; });
  assert.equal(r, 'u2');
  const c2 = createSignedUrlCache({ sign: async () => 'z' });
  await assert.rejects(() => c2.open('atlas/1/x.png', async () => { throw new Error('gone'); }), /file unavailable/);
  assert.equal(await makeSupabaseResolver(c)({ key: 'atlas/1/x.png' }), 'u2');
});

test('private_storage flag is off unless turned on', () => {
  assert.equal(resolveFlag('private_storage', {}), false);
  assert.equal(resolveFlag('private_storage', { query: '?ff=private_storage' }), true);
  assert.equal(resolveFlag('private_storage', { env: '1', query: '?ff=-private_storage' }), false);
});
