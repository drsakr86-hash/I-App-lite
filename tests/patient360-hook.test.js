// Hook-level tests for usePatientFile with a mocked Supabase client and
// react-test-renderer. Synthetic patients only.
import test from 'node:test';
import assert from 'node:assert/strict';

// ---- environment (must exist before the modules are imported) ----
const store = new Map();
globalThis.localStorage = {
  getItem: k => (store.has(k) ? store.get(k) : null), setItem: (k, v) => { store.set(k, String(v)); },
  removeItem: k => { store.delete(k); }, get length() { return store.size; }, key: i => Array.from(store.keys())[i] ?? null
};
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const rpcLog = [];
const handlers = {};           // rpc name -> async (args) => ({data,error})
const builder = () => { const b = { select: () => b, eq: () => b, order: () => b, upsert: () => b, delete: () => b, abortSignal: () => b, retry: () => b, maybeSingle: () => b, then: (res, rej) => Promise.resolve({ data: null, error: null }).then(res, rej) }; return b; };
globalThis.__IAppSupabaseClient = {
  rpc: (name, args) => { rpcLog.push({ name, args }); const h = handlers[name]; return h ? h(args) : Promise.resolve({ data: null, error: { message: 'no handler ' + name } }); },
  from: () => builder(),
  channel: () => { const c = { on: () => c, subscribe: () => c }; return c; },
  removeChannel: () => {}
};

const React = (await import('react')).default;
const TestRenderer = (await import('react-test-renderer')).default;
const { act } = TestRenderer;
const { usePatientFile } = await import('../src/modules/patient-file/use-patient-file.js');
const { rpcSafe } = await import('../src/services/rpc.js');
globalThis.window = globalThis.window || {};
globalThis.window.IAppModules = { rpc: { safe: rpcSafe }, auth: { ensureSession: async () => ({ ok: true }) } };
globalThis.IAppModules = globalThis.window.IAppModules;

const PA = { id: 1, name: 'مريض أ', patientCode: 'T-A' };
const PB = { id: 2, name: 'مريض ب', patientCode: 'T-B' };
const file360 = (code, examId) => ({ found: true, patient_code: code, examinations: [{ id: examId, examination_date: '2026-01-01', diagnosis_summary: 'dx-' + examId }] });
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };

function props(patient, over = {}) {
  return {
    patient, allExams: [], allRx: [], allVisits: [], onClose() {}, onUpdatePatient() {},
    onSaveExam: async () => ({ coreSynced: true, coreError: null, status: 'synced' }),
    onDelExam: async () => {}, onSaveVisit: async () => ({ coreError: null }), onDelVisit: async () => {},
    onSaveRx: async () => ({ coreError: null }), onSaveRadiologyRequest: async () => {},
    primaryDoctor: { name: 'د. تجريبي' }, ...over
  };
}
function mount(p) {
  let ctx; const Probe = ({ pr }) => { ctx = usePatientFile(pr); return null; };
  let r;
  act(() => { r = TestRenderer.create(React.createElement(Probe, { pr: p })); });
  return { get ctx() { return ctx; }, update: np => act(() => r.update(React.createElement(Probe, { pr: np }))), unmount: () => act(() => r.unmount()) };
}
const settle = async (ms = 20) => { await act(async () => { await new Promise(r => setTimeout(r, ms)); }); };
const resetRpc = () => { rpcLog.length = 0; for (const k of Object.keys(handlers)) delete handlers[k]; store.clear(); };

test('switching patients while the Core load is in flight: the late response for the first patient is discarded', async () => {
  resetRpc();
  const slowA = deferred();
  handlers.iapp_get_patient_360_timeline = args => (args.p_patient_code === 'T-A' ? slowA.promise : Promise.resolve({ data: file360('T-B', 'b1'), error: null }));
  const a = mount(props(PA));
  await settle();
  a.unmount();                                  // user opens patient B (PatientsContainer remounts with key)
  const b = mount(props(PB));
  await settle();
  assert.deepEqual(b.ctx.exams.map(e => e._coreId), ['b1']);
  slowA.resolve({ data: file360('T-A', 'a1'), error: null });
  await settle();
  assert.deepEqual(b.ctx.exams.map(e => e._coreId), ['b1']);
  assert.equal(b.ctx.coreStatus.state, 'ready');
  b.unmount();
});

test('same hook instance given a different patient: a Core file of another patient is never merged in', async () => {
  resetRpc();
  const slowA = deferred();
  handlers.iapp_get_patient_360_timeline = args => (args.p_patient_code === 'T-A' ? slowA.promise : Promise.resolve({ data: file360('T-B', 'b1'), error: null }));
  const h = mount(props(PA));
  await settle();
  h.update(props(PB));
  await settle();
  slowA.resolve({ data: file360('T-A', 'a1'), error: null });
  await settle();
  assert.ok(h.ctx.exams.every(e => e._coreId !== 'a1'));
  h.unmount();
});

test('a Core payload whose patient_code differs from the open patient is rejected with a visible error', async () => {
  resetRpc();
  handlers.iapp_get_patient_360_timeline = async () => ({ data: file360('T-OTHER', 'x1'), error: null });
  const h = mount(props(PA));
  await settle();
  assert.equal(h.ctx.coreStatus.state, 'error');
  assert.equal(h.ctx.exams.length, 0);
  h.unmount();
});

test('Core load failure leaves legacy records visible and reports the error state', async () => {
  resetRpc(); // no handlers -> every attempt errors
  const h = mount(props(PA, { allExams: [{ id: 5, patientId: 1, date: '2026-02-02', diagnosis: 'local' }] }));
  await settle(50);
  assert.equal(h.ctx.coreStatus.state, 'error');
  assert.equal(h.ctx.exams.length, 1);
  h.unmount();
});

test('double click on "save investigation request" performs ONE visit, ONE order and ONE legacy save', async () => {
  resetRpc();
  handlers.iapp_get_patient_360_timeline = async () => ({ data: file360('T-A', 'a1'), error: null });
  const gate = deferred();
  handlers.iapp_create_clinical_visit = async () => { await gate.promise; return { data: 'cv-1', error: null }; };
  handlers.iapp_create_investigation_workflow_order = async () => ({ data: { investigation_order_id: 31, imaging_order_id: 8 }, error: null });
  let legacySaves = 0;
  const h = mount(props(PA, { onSaveRadiologyRequest: async () => { legacySaves++; } }));
  await settle();
  act(() => h.ctx.toggleRequestTest('oct'));
  let p1, p2;
  act(() => { p1 = h.ctx.savePatientRadiologyRequest(); p2 = h.ctx.savePatientRadiologyRequest(); });
  gate.resolve();
  await act(async () => { await Promise.all([p1, p2]); });
  await settle();
  assert.equal(rpcLog.filter(r => r.name === 'iapp_create_clinical_visit').length, 1);
  assert.equal(rpcLog.filter(r => r.name === 'iapp_create_investigation_workflow_order').length, 1);
  assert.equal(legacySaves, 1);
  assert.equal(h.ctx.requestResult.status, 'saved');
  assert.deepEqual(h.ctx.requestTests, {}); // form cleared only after a complete save
  h.unmount();
});

test('network failure during an investigation request is reported as local-only, the form content is cleared only because it was stored locally, and no auto-retry happens', async () => {
  resetRpc();
  handlers.iapp_get_patient_360_timeline = async () => ({ data: file360('T-A', 'a1'), error: null });
  handlers.iapp_create_clinical_visit = async () => ({ data: 'cv-1', error: null });
  handlers.iapp_create_investigation_workflow_order = async () => ({ data: null, error: { message: 'Failed to fetch' } });
  const h = mount(props(PA));
  await settle();
  act(() => h.ctx.toggleRequestTest('oct'));
  await act(async () => { await h.ctx.savePatientRadiologyRequest(); });
  assert.equal(h.ctx.requestResult.status, 'local-only');
  assert.equal(h.ctx.saveStatus.kind, 'local-only');
  assert.equal(rpcLog.filter(r => r.name === 'iapp_create_investigation_workflow_order').length, 1);
  h.unmount();
});

test('local save failure after Core success is a partial result and keeps the draft for a safe retry', async () => {
  resetRpc();
  handlers.iapp_get_patient_360_timeline = async () => ({ data: file360('T-A', 'a1'), error: null });
  handlers.iapp_create_clinical_visit = async () => ({ data: 'cv-1', error: null });
  handlers.iapp_create_investigation_workflow_order = async () => ({ data: { investigation_order_id: 31, imaging_order_id: 8 }, error: null });
  let fail = true;
  const h = mount(props(PA, { onSaveRadiologyRequest: async () => { if (fail) throw new Error('quota'); } }));
  await settle();
  act(() => h.ctx.toggleRequestTest('oct'));
  await act(async () => { await h.ctx.savePatientRadiologyRequest(); });
  assert.equal(h.ctx.requestResult.status, 'partial');
  assert.ok(Object.keys(h.ctx.requestTests).length > 0);   // selection kept
  fail = false;
  await act(async () => { await h.ctx.savePatientRadiologyRequest(); });
  assert.equal(h.ctx.requestResult.status, 'saved');
  assert.equal(rpcLog.filter(r => r.name === 'iapp_create_clinical_visit').length, 1);   // not duplicated by the retry
  h.unmount();
});

test('exam save: honest status (synced / local-only / failed) and double submit is ignored', async () => {
  resetRpc();
  handlers.iapp_get_patient_360_timeline = async () => ({ data: file360('T-A', 'a1'), error: null });
  let calls = 0; let next = { coreSynced: true, coreError: null, status: 'synced' };
  const h = mount(props(PA, { onSaveExam: async () => { calls++; await new Promise(r => setTimeout(r, 10)); if (next === 'throw') throw new Error('disk'); return next; } }));
  await settle();
  await act(async () => { await Promise.all([h.ctx.onSaveExam({ id: 9 }), h.ctx.onSaveExam({ id: 9 })]); });
  assert.equal(calls, 1);
  assert.equal(h.ctx.saveStatus.kind, 'saved');
  next = { coreSynced: false, coreError: 'offline', status: 'offline' };
  await act(async () => { await h.ctx.onSaveExam({ id: 9 }); });
  assert.equal(h.ctx.saveStatus.kind, 'local-only');
  next = { coreSynced: true, coreError: 'treatment: boom', status: 'partial' };
  await act(async () => { await h.ctx.onSaveExam({ id: 9 }); });
  assert.equal(h.ctx.saveStatus.kind, 'partial');
  next = 'throw';
  await act(async () => { await h.ctx.onSaveExam({ id: 9 }); });
  assert.equal(h.ctx.saveStatus.kind, 'failed');
  assert.match(h.ctx.saveStatus.message, /ما زالت مفتوحة/);
  h.unmount();
});

test('deleting a Core-only record is refused with an explanation instead of silently doing nothing', async () => {
  resetRpc();
  handlers.iapp_get_patient_360_timeline = async () => ({ data: file360('T-A', 'a1'), error: null });
  const h = mount(props(PA));
  await settle();
  assert.equal(h.ctx.exams.length, 1);
  act(() => h.ctx.setDelTarget({ type: 'exam', id: h.ctx.exams[0].id }));
  assert.equal(h.ctx.delTarget, null);
  assert.equal(h.ctx.saveStatus.kind, 'failed');
  h.unmount();
});

test('a modal with unsaved edits asks before closing; a clean one closes', async () => {
  resetRpc();
  const h = mount(props(PA));
  await settle();
  let asked = 0; globalThis.window.confirm = () => { asked++; return false; };
  act(() => h.ctx.setModal('addExam'));
  act(() => h.ctx.setModal(null));
  assert.equal(asked, 0);
  assert.equal(h.ctx.modal, null);
  act(() => h.ctx.setModal('addExam'));
  act(() => h.ctx.markModalDirty());
  act(() => h.ctx.setModal(null));
  assert.equal(asked, 1);
  assert.equal(h.ctx.modal, 'addExam');       // user declined: stays open
  globalThis.window.confirm = () => true;
  act(() => h.ctx.setModal(null));
  assert.equal(h.ctx.modal, null);
  h.unmount();
});

test('timeline contains each source once and each event can be opened at its source tab', async () => {
  resetRpc();
  handlers.iapp_get_patient_360_timeline = async () => ({ data: file360('T-A', 'a1'), error: null });
  const h = mount(props(PA, { allExams: [{ id: 5, patientId: 1, date: '2026-02-02', diagnosis: 'local' }], allRx: [{ id: 6, patientId: 1, date: '2026-02-03', notes: 'drops' }] }));
  await settle();
  const kinds = h.ctx.timelineEvents.map(e => e.kind).sort();
  assert.deepEqual(kinds, ['examination', 'examination', 'prescription']);
  const rx = h.ctx.timelineEvents.find(e => e.kind === 'prescription');
  act(() => h.ctx.openSource(rx));
  assert.equal(h.ctx.tab, 'rx');
  h.unmount();
});
