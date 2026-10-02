import test from 'node:test';
import assert from 'node:assert/strict';
import { planExamSteps, runExamCoreSync, readExamMarkers, writeExamMarkers } from '../src/modules/patient-file/exam-core-sync.js';
import { submitInvestigationRequest, resyncInvestigationRequest } from '../src/modules/patient-file/request-workflow.js';

const memStore = () => { const m = new Map(); return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)) }; };

// ---------- exam core sync ----------
const FIND = async id => (id === 'exam:5' ? 'visit-1' : null);
const EXAM = { id: 5, patientId: 7, doctor: 'د. أ', diagnosis: 'DME', treatmentPlan: 'Anti-VEGF', followUp: '2026-12-01' };
const mkCall = (fail = {}) => { const calls = []; const call = async (name, args) => { calls.push({ name, args }); return fail[name] ? { data: null, error: { message: fail[name] } } : { data: name === 'iapp_sync_examination_core' ? 'exam-row-9' : 1, error: null }; }; return { call, calls }; };

test('first save creates diagnosis, treatment and follow-up once and records markers', async () => {
  const { call, calls } = mkCall();
  const r = await runExamCoreSync({ exam: EXAM, patientCode: 'T-1', call, findVisitId: FIND });
  assert.equal(r.status, 'synced');
  assert.deepEqual(calls.map(c => c.name), ['iapp_sync_examination_core', 'iapp_create_diagnosis_core', 'iapp_create_treatment_core', 'iapp_create_followup_core']);
  assert.equal(calls[1].args.p_visit_id, 'visit-1');
  assert.deepEqual(r.markers, { diagnosis: 'DME', treatment: 'Anti-VEGF', followup: '2026-12-01' });
});

test('re-saving an unchanged diagnosis/treatment/follow-up does NOT create them again', async () => {
  const { call, calls } = mkCall();
  const r = await runExamCoreSync({ exam: { ...EXAM, notes: 'only a note changed', _coreSync: { diagnosis: 'DME', treatment: 'Anti-VEGF', followup: '2026-12-01' } }, call, findVisitId: FIND });
  assert.deepEqual(calls.map(c => c.name), ['iapp_sync_examination_core']);
  assert.equal(r.status, 'synced');
  assert.equal(r.markersChanged, false);
});

test('only the changed field is re-created', async () => {
  const { call, calls } = mkCall();
  await runExamCoreSync({ exam: { ...EXAM, diagnosis: 'DME + cataract', _coreSync: { diagnosis: 'DME', treatment: 'Anti-VEGF', followup: '2026-12-01' } }, call, findVisitId: FIND });
  assert.deepEqual(calls.map(c => c.name), ['iapp_sync_examination_core', 'iapp_create_diagnosis_core']);
});

test('a failing step is reported as partial, other steps still run, failed marker is not recorded', async () => {
  const { call, calls } = mkCall({ iapp_create_treatment_core: 'boom' });
  const r = await runExamCoreSync({ exam: EXAM, call, findVisitId: FIND });
  assert.equal(r.status, 'partial');
  assert.equal(calls.length, 4);
  assert.equal(r.markers.treatment, undefined);
  assert.equal(r.markers.diagnosis, 'DME');
  assert.match(r.error, /treatment: boom/);
});

test('base examination sync failure is "failed" and nothing else is attempted; no automatic retry', async () => {
  const { call, calls } = mkCall({ iapp_sync_examination_core: 'network' });
  const r = await runExamCoreSync({ exam: EXAM, call });
  assert.equal(r.status, 'failed');
  assert.equal(r.coreSynced, false);
  assert.equal(calls.length, 1);
});

test('the examination row id returned by the RPC is never used as a visit id', async () => {
  const { call, calls } = mkCall();
  await runExamCoreSync({ exam: EXAM, call, findVisitId: FIND });
  assert.equal(calls[1].args.p_visit_id, 'visit-1');
  assert.notEqual(calls[1].args.p_visit_id, 'exam-row-9');
});

test('diagnosis step without a Core visit id is reported, never sent with a null visit', async () => {
  const calls = [];
  const call = async (name, args) => { calls.push(name); return { data: null, error: null }; };
  const r = await runExamCoreSync({ exam: EXAM, call, findVisitId: async () => null });
  assert.ok(!calls.includes('iapp_create_diagnosis_core'));
  assert.equal(r.status, 'partial');
  assert.ok(calls.includes('iapp_create_followup_core')); // follow-up does not require a visit
});

test('planExamSteps ignores blank values; markers persist per exam id', () => {
  assert.deepEqual(planExamSteps({ diagnosis: '  ', treatmentPlan: '', followUp: '' }), { diagnosis: null, treatment: null, followup: null });
  const st = memStore();
  assert.deepEqual(readExamMarkers(5, st), {});
  writeExamMarkers(5, { diagnosis: 'X' }, st);
  assert.deepEqual(readExamMarkers(5, st), { diagnosis: 'X' });
  assert.deepEqual(readExamMarkers(6, st), {});
});

// ---------- investigation request workflow ----------
const PAT = { id: 7, name: 'مريض تجريبي', patientCode: 'T-0007' };
const TESTS = [{ id: 'oct', name: 'OCT', eye: 'OD' }];
function mkDeps(over = {}) {
  const log = { visits: [], orders: [], legacy: [], store: [] };
  const deps = {
    client: () => ({}), offline: () => false,
    createVisit: async (sb, params, legacyId) => { log.visits.push(legacyId); return { data: 'cv-1', error: null }; },
    call: async (name, args) => { log.orders.push(args.p_source_exam_legacy_id); return { data: { investigation_order_id: 31, imaging_order_id: 8 }, error: null }; },
    visitParams: () => ({}), orderParams: ({ draftId }) => ({ p_source_exam_legacy_id: String(draftId) }),
    saveLegacyRequest: async rec => { log.legacy.push(rec); },
    upsertOrder: async order => { log.store.push(order); return { ok: true }; },
    today: () => '2026-10-01', clock: () => '10:00', nowIso: () => '2026-10-01T10:00:00Z',
    ...over
  };
  return { deps, log };
}

test('request: everything succeeds -> saved, Core ids recorded on both records', async () => {
  const { deps, log } = mkDeps();
  const r = await submitInvestigationRequest(deps, { patient: PAT, tests: TESTS, draftId: 1001 });
  assert.equal(r.status, 'saved');
  assert.equal(r.complete, true);
  assert.equal(log.legacy[0].coreInvestigationOrderId, 31);
  assert.equal(log.store[0].coreImagingOrderId, 8);
  assert.equal(log.legacy[0].coreSyncError, null);
});

test('request: no tests -> invalid and nothing written', async () => {
  const { deps, log } = mkDeps();
  const r = await submitInvestigationRequest(deps, { patient: PAT, tests: [], draftId: 1 });
  assert.equal(r.status, 'invalid');
  assert.equal(log.legacy.length + log.store.length + log.visits.length, 0);
});

test('request: offline -> local-only (never reported as saved), no Core call', async () => {
  const { deps, log } = mkDeps({ offline: () => true });
  const r = await submitInvestigationRequest(deps, { patient: PAT, tests: TESTS, draftId: 2 });
  assert.equal(r.status, 'local-only');
  assert.equal(log.visits.length, 0);
  assert.equal(log.legacy[0].coreSyncError, 'offline');
  assert.match(r.message, /هذا الجهاز/);
});

test('request: network failure during Core order -> local-only with the error kept for resync; visit id is kept for retry', async () => {
  const { deps } = mkDeps({ call: async () => ({ data: null, error: { message: 'Failed to fetch' } }) });
  const r = await submitInvestigationRequest(deps, { patient: PAT, tests: TESTS, draftId: 3 });
  assert.equal(r.status, 'local-only');
  assert.equal(r.rec.coreSyncError, 'Failed to fetch');
  assert.equal(r.resume.coreVisitId, 'cv-1');
});

test('request: Core succeeded but local save failed -> partial, retry reuses the same draft id and Core ids (no duplicate visit/order)', async () => {
  let fail = true;
  const { deps, log } = mkDeps({ saveLegacyRequest: async () => { if (fail) throw new Error('disk full'); } });
  const first = await submitInvestigationRequest(deps, { patient: PAT, tests: TESTS, draftId: 4 });
  assert.equal(first.status, 'partial');
  assert.equal(first.complete, false);
  fail = false;
  const second = await submitInvestigationRequest(deps, { patient: PAT, tests: TESTS, draftId: 4, resume: first.resume });
  assert.equal(second.status, 'saved');
  assert.equal(log.visits.length, 1);   // visit created once
  assert.equal(log.orders.length, 1);   // order created once
});

test('request: imaging-order store write reporting failure is surfaced, not swallowed', async () => {
  const { deps } = mkDeps({ upsertOrder: async () => ({ ok: false, error: 'conflict' }) });
  const r = await submitInvestigationRequest(deps, { patient: PAT, tests: TESTS, draftId: 5 });
  assert.equal(r.status, 'partial');
  assert.ok(r.steps.some(s => s.name === 'imaging-order' && !s.ok));
});

test('request: everything fails -> failed', async () => {
  const { deps } = mkDeps({
    call: async () => ({ data: null, error: { message: 'x' } }),
    saveLegacyRequest: async () => { throw new Error('a'); },
    upsertOrder: async () => { throw new Error('b'); }
  });
  assert.equal((await submitInvestigationRequest(deps, { patient: PAT, tests: TESTS, draftId: 6 })).status, 'failed');
});

test('request: an RPC answering without an order id is not success', async () => {
  const { deps } = mkDeps({ call: async () => ({ data: {}, error: null }) });
  const r = await submitInvestigationRequest(deps, { patient: PAT, tests: TESTS, draftId: 7 });
  assert.equal(r.status, 'local-only');
  assert.equal(r.rec.coreSyncError, 'no-order-id');
});

test('resync: uses the request id as legacy id, patches Core ids, offline is refused', async () => {
  const patches = [];
  const { deps, log } = mkDeps({ patchRequest: async (id, patch) => patches.push([id, patch]) });
  const rec = { id: 8, requestedTests: TESTS, notes: '', doctor: '', coreSyncError: 'timeout' };
  const r = await resyncInvestigationRequest(deps, rec, PAT);
  assert.equal(r.status, 'synced');
  assert.equal(log.visits[0], 'investigation:8');
  assert.equal(patches[0][1].coreSyncError, null);
  assert.equal((await resyncInvestigationRequest({ ...deps, offline: () => true }, rec, PAT)).status, 'offline');
  assert.equal((await resyncInvestigationRequest(deps, { ...rec, coreInvestigationOrderId: 9 }, PAT)).status, 'noop');
});
