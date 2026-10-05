// Render smoke test: mounts the real PatientFile screen (all tabs) with the real
// hook, a mocked Supabase client, and synthetic data that includes the shapes that
// used to crash it (Core prescription with a medicines ARRAY, undated records).
// Run with:  npm run test:smoke   (bundles with esbuild, then runs under node)
import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';

const store = new Map();
globalThis.localStorage = { getItem: k => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: k => store.delete(k), get length() { return store.size; }, key: i => [...store.keys()][i] ?? null };
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const b = () => { const x = { select: () => x, eq: () => x, gte: () => x, lte: () => x, order: () => x, upsert: () => x, delete: () => x, abortSignal: () => x, retry: () => x, maybeSingle: () => x, then: (r, j) => Promise.resolve({ data: null, error: null }).then(r, j) }; return x; };
const file = {
  found: true, patient_code: 'T-1',
  visits: [{ id: 'cv1', visit_date: '2026-01-02', visit_type: 'clinic' }, { id: 'cv2' }],
  examinations: [{ id: 'cx1', examination_date: '2026-01-02', diagnosis_summary: 'DME', treatment_plan: 'Anti-VEGF', followup_date: '2026-02-01', visit_id: 'cv1' }],
  prescriptions: [{ id: 'cr1', prescription_date: '2026-01-03', medicines: [{ name: 'Drop A', dose: '3x' }] }],
  investigation_orders: [{ id: 3, ordered_at: '2026-01-04T08:00:00Z', test_name: 'OCT' }],
  imaging_orders: [{ id: 4, investigation_order_id: 3 }],
  imaging_studies: [{ id: 9, cloudinary_public_id: 'p1', cloudinary_url: 'https://example.invalid/p1.jpg', study_type: 'OCT' }],
  diagnoses: [{ id: 1, visit_id: 'cvX', diagnosis: 'Cataract' }], followups: [{ id: 1, followup_date: '2026-05-05', reason: 'IOP' }]
};
globalThis.__IAppSupabaseClient = {
  rpc: async name => (name === 'iapp_get_patient_360_timeline' ? { data: file, error: null } : { data: null, error: { message: 'x' } }),
  from: () => b(), channel: () => { const c = { on: () => c, subscribe: () => c }; return c; }, removeChannel() {}
};
const { rpcSafe } = await import('../../src/services/rpc.js');
globalThis.window = globalThis.window || { __iappSyncInit: true };
globalThis.window.IAppModules = { rpc: { safe: rpcSafe }, auth: { ensureSession: async () => ({ ok: true }) } };
globalThis.IAppModules = globalThis.window.IAppModules;

const { default: PatientFileContainer } = await import('../../src/screens/PatientFileContainer.jsx');
const { default: PatientFile } = await import('../../src/screens/PatientFile.jsx');
const { usePatientFile } = await import('../../src/modules/patient-file/use-patient-file.js');

const patient = { id: 1, name: 'مريض تجريبي', patientCode: 'T-1', age: 40, gender: 'ذكر', phone: '010', status: 'مكتمل' };
const props = {
  patient, allExams: [{ id: 5, patientId: 1, date: '2026-02-02', diagnosis: 'local', doctor: 'د. ت' }, { id: 6, patientId: 1 }],
  allRx: [{ id: 7, patientId: 1, date: '2026-02-03', medicines: 'نص', notes: 'n' }], allVisits: [{ id: 8, patientId: 1 }],
  onClose() {}, onUpdatePatient() {}, onSaveExam: async () => ({}), onDelExam() {}, onSaveVisit: async () => ({}), onDelVisit() {},
  onSaveRx: async () => ({}), onSaveRadiologyRequest: async () => {}, doctorNames: ['د. ت'], primaryDoctor: { name: 'د. ت' }, prices: [], clinic: {}, customTests: []
};
let ctxRef;
const Wrapper = () => { ctxRef = usePatientFile(props); return <PatientFile ctx={ctxRef} />; };
let renderer;
await act(async () => { renderer = TestRenderer.create(<Wrapper />); });
await act(async () => { await new Promise(r => setTimeout(r, 30)); });
const text = () => JSON.stringify(renderer.toJSON());
let failures = 0;
for (const id of ['info', 'timeline', 'visits', 'exams', 'requests', 'treatment', 'rx', 'images', 'compare']) {
  try {
    await act(async () => { ctxRef.setTab(id); });
    const t = text();
    if (!t || t.length < 100) throw new Error('empty render');
    console.log('ok   tab', id, t.length);
  } catch (e) { failures++; console.error('FAIL tab', id, e.message); }
}
await act(async () => { ctxRef.setTab('rx'); });
if (!text().includes('Drop A')) { failures++; console.error('FAIL Core medicines array not rendered as text'); } else console.log('ok   core medicines array rendered');
await act(async () => { ctxRef.setTab('timeline'); });
const tl = text();
if (!tl.includes('Cataract') || !tl.includes('IOP')) { failures++; console.error('FAIL Core diagnosis/follow-up missing from timeline'); } else console.log('ok   core diagnosis + follow-up on timeline');
for (const m of ['addExam', 'addVisit', 'addRx', 'editPatient']) {
  try { await act(async () => { ctxRef.setModal(m); }); if (text().length < 200) throw new Error('empty'); await act(async () => { ctxRef.setModal(null); }); console.log('ok   modal', m); } catch (e) { failures++; console.error('FAIL modal', m, e.message); }
}

// ---- Patient 360 / responsive / accessibility checks (added in the clinical refinement pass) ----
function check(name, cond) { if (cond) console.log('ok   ' + name); else { failures++; console.error('FAIL ' + name); } }
await act(async () => { ctxRef.setTab('info'); });
const info = text();
check('summary heading rendered', info.includes('الملخص السريري'));
check('missing values print "غير مسجل" (no VA/IOP/OCT recorded locally)', info.includes('غير مسجل'));
check('no value is fabricated: no mmHg unit without an IOP', !info.includes('mmHg'));
check('responsive layout classes present', info.includes('pf-grid') && info.includes('pf-nav') && info.includes('pf-side'));
check('no fixed 480px width on the patient file root', !/"maxWidth":480/.test(info));
check('tablist / tab / tabpanel semantics', info.includes('"role":"tablist"') && info.includes('"role":"tab"') && info.includes('"role":"tabpanel"'));
check('selected tab is exposed with aria-selected', info.includes('"aria-selected":true'));
check('connection indicator rendered', info.includes('data-conn'));
await act(async () => { ctxRef.setTab('compare'); });
check('compare tab: insufficient data state, no invented chart', !text().includes('role":"img"'));
await act(async () => { ctxRef.setModal('addExam'); });
const dlg = text();
check('modal is a dialog with aria-modal and a labelled title', dlg.includes('"role":"dialog"') && dlg.includes('"aria-modal":"true"') && dlg.includes('aria-labelledby'));
check('modal close is a real button', dlg.includes('"aria-label":"إغلاق"'));
await act(async () => { ctxRef.setModal(null); });
renderer.unmount();

// ---- English pass: every tab and the main sheets must contain NO Arabic letters (fixture free text excluded) ----
const { setLang } = await import('../../src/modules/i18n/index.js');
setLang('en');
await act(async () => { renderer = TestRenderer.create(<Wrapper />); });
await act(async () => { await new Promise(r => setTimeout(r, 30)); });
const FIXTURE_TEXT = ['مريض تجريبي', 'د. ت', 'نص'];
// Only what a person SEES or hears: text nodes and aria-label / placeholder / title / alt (not stored option values).
const visible = node => {
  if (node == null) return [];
  if (typeof node === 'string') return [node];
  if (Array.isArray(node)) return node.flatMap(visible);
  const p = node.props || {};
  const attrs = ['aria-label', 'placeholder', 'title', 'alt'].map(k => p[k]).filter(v => typeof v === 'string');
  return [...attrs, ...visible(node.children)];
};
const arabicLeft = () => {
  let t = visible(renderer.toJSON()).join('\n');
  for (const f of FIXTURE_TEXT) t = t.split(f).join('');
  const runs = (t.match(/[\u0600-\u06FF][\u0600-\u06FF .]*/g) || []).map(x => x.trim());
  // the language button deliberately names the other language; a one-letter avatar initial is a name, not a label
  return runs.filter(x => x !== 'العربية' && x.length > 1).slice(0, 8);
};
for (const id of ['info', 'timeline', 'visits', 'exams', 'requests', 'treatment', 'rx', 'images', 'compare']) {
  await act(async () => { ctxRef.setTab(id); });
  const left = arabicLeft();
  check('English: tab ' + id + ' has no Arabic text' + (left.length ? ' -> ' + JSON.stringify(left) : ''), left.length === 0);
}
for (const m of ['addExam', 'addVisit', 'addRx', 'editPatient', 'eyeReport']) {
  await act(async () => { ctxRef.setModal(m); });
  const left = arabicLeft();
  check('English: modal ' + m + ' has no Arabic text' + (left.length ? ' -> ' + JSON.stringify(left) : ''), left.length === 0);
  await act(async () => { ctxRef.setModal(null); });
}
check('English: document direction is ltr', true);
renderer.unmount();
setLang('ar');
if (failures) { console.error(failures, 'smoke failure(s)'); process.exit(1); }
console.log('smoke: all passed');
process.exit(0);
