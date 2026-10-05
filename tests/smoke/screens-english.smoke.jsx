// English-mode audit for every screen except PatientFile (covered by patient-file-render.smoke.jsx).
// Mounts each screen with realistic synthetic props in English AND Arabic, then "click-explores" it: every
// clickable element is clicked on a fresh mount (two levels deep when a click reveals new content), so tabs,
// modals, edit forms and validation messages are all reached. In English no Arabic letters may remain in
// anything a person sees or hears (text nodes, aria-label, placeholder, title, alt, alert()/confirm() text).
// Run with:  npm run test:smoke:screens
import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';

// ---------------- environment mocks ----------------
const store = new Map();
globalThis.localStorage = { getItem: k => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: k => store.delete(k), get length() { return store.size; }, key: i => [...store.keys()][i] ?? null };
globalThis.sessionStorage = { getItem: () => null, setItem() {}, removeItem() {} };
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const dialogs = [];
// an async handler that throws inside a click (usually a missing browser API in this mock) must not end the run
process.on('unhandledRejection', e => console.warn('WARN unhandled rejection:', (e && e.message) || e));
process.on('uncaughtException', e => console.warn('WARN uncaught exception:', (e && e.message) || e));
const noop = () => {};
// the rating pop-up is scheduled 1.5 s after PatientApp mounts; make it near-instant so it can be explored
const _setTimeout = globalThis.setTimeout;
globalThis.setTimeout = (fn, ms, ...a) => _setTimeout(fn, ms === 1500 ? 3 : ms, ...a);
const origError = console.error;
console.error = (...a) => { if (typeof a[0] === 'string' && /^(Warning:|The above error)/.test(a[0])) return; origError(...a); };
globalThis.alert = m => { dialogs.push(String(m)); };
globalThis.confirm = m => { dialogs.push(String(m)); return true; };
globalThis.prompt = m => { dialogs.push(String(m)); return ''; };
const fakeEl = () => new Proxy(function () {}, { get: (t, k) => (k === 'style' ? {} : k === 'children' || k === 'childNodes' ? [] : k === Symbol.toPrimitive ? () => '' : fakeEl()), apply: () => fakeEl(), set: () => true });
globalThis.window = globalThis.window || { __iappSyncInit: true };
Object.assign(globalThis.window, { alert: globalThis.alert, confirm: globalThis.confirm, prompt: globalThis.prompt, open: () => null, print: noop, crypto: globalThis.crypto, addEventListener: noop, removeEventListener: noop, dispatchEvent: noop, location: { href: '', search: '', hash: '', reload: noop }, matchMedia: () => ({ matches: false, addEventListener: noop, removeEventListener: noop }), innerWidth: 400 });
globalThis.document = { hidden: false, body: fakeEl(), documentElement: { setAttribute: noop, style: {} }, addEventListener: noop, removeEventListener: noop, createElement: () => fakeEl(), getElementById: () => null, querySelector: () => null, querySelectorAll: () => [] };
const b = () => { const x = { select: () => x, eq: () => x, in: () => x, gte: () => x, lte: () => x, order: () => x, limit: () => x, upsert: () => x, insert: () => x, update: () => x, delete: () => x, abortSignal: () => x, retry: () => x, maybeSingle: () => x, single: () => x, then: (r, j) => Promise.resolve({ data: [], error: null }).then(r, j) }; return x; };
globalThis.__IAppSupabaseClient = {
  rpc: async () => ({ data: null, error: { message: 'x' } }),
  from: () => b(), channel: () => { const c = { on: () => c, subscribe: () => c, send: () => c, unsubscribe: noop }; return c; }, removeChannel() {},
  auth: { signInWithPassword: async () => ({ error: { message: 'bad' } }), updateUser: async () => ({ error: { message: 'bad' } }), getSession: async () => ({ data: { session: null } }) },
  storage: { from: () => ({ upload: async () => ({ error: { message: 'x' } }) }) }
};
const { rpcSafe } = await import('../../src/services/rpc.js');
globalThis.window.IAppModules = { rpc: { safe: rpcSafe }, auth: { ensureSession: async () => ({ ok: true }) } };
globalThis.IAppModules = globalThis.window.IAppModules;

// ---------------- synthetic data (Arabic STORED values, as in production) ----------------
const { SEED } = await import('../../src/modules/constants/seed.js');
const { localISO } = await import('../../src/modules/constants/misc.js');
const { setRawIO } = await import('../../src/modules/sync/wiring.js');
const { setLang, getLang } = await import('../../src/modules/i18n/index.js');
const TODAY = localISO();
const TOMORROW = localISO(new Date(Date.now() + 86400000));
const YESTERDAY = localISO(new Date(Date.now() - 86400000));
const NAMES = ['مريض تجريبي', 'سارة أحمد', 'أحمد محمد العمري', 'فاطمة علي الزهراني', 'خالد سعد القحطاني', 'نورة عبدالله الشمري', 'عمر إبراهيم الدوسري', 'ليلى حسن', 'كريم نبيل'];
const doctors = [
  { id: 1, name: 'د. عبدالستار صقر', short: 'د. عبدالستار', title: 'استشاري طب وجراحة العيون والليزر', initial: 'ع', isPrimary: true },
  { id: 2, name: 'د. سلمى', short: 'د. سلمى', title: 'أخصائي عيون', initial: 'س' }
];
const doctorNames = doctors.map(d => d.short);
const patients = [
  { id: 1, patientCode: 'P-0001', name: 'مريض تجريبي', age: 45, phone: '01012345678', lastVisit: YESTERDAY, condition: 'عين حمراء', status: 'مكتمل', gender: 'ذكر', bloodType: 'A+', address: 'دمنهور', history: 'ضغط', allergies: 'لا يوجد', occupation: 'مهندس', emergencyContact: '010', createdAt: TODAY },
  { id: 2, patientCode: 'P-0002', name: 'سارة أحمد', age: 32, phone: '01112345678', lastVisit: YESTERDAY, condition: 'ماء زرق', status: 'متابعة', gender: 'أنثى', bloodType: 'O+' },
  { id: 3, patientCode: 'P-0003', name: 'خالد سعد القحطاني', age: 58, phone: '01212345678', condition: 'ماء أبيض', status: 'طارئ', gender: 'ذكر' },
  ...SEED.patients.slice(3)
];
const visitTypes = ['فحص روتيني', 'كشف', 'استشارة', 'متابعة'];
const visits = [
  { id: 'v1', patientId: 1, patient: 'مريض تجريبي', date: TODAY, type: 'فحص روتيني', doctor: 'د. عبدالستار', clinic: 'دمنهور', complaint: 'عين حمراء', result: 'التهاب ملتحمة', cost: '350', paid: true, nextVisit: TOMORROW, notes: '' },
  { id: 'v2', patientId: 2, patient: 'سارة أحمد', date: TODAY, type: 'متابعة', doctor: 'د. سلمى', clinic: 'الرحمانية', complaint: 'ضعف الرؤية', result: '', cost: '200', paid: false, nextVisit: YESTERDAY, notes: '' },
  { id: 'v3', patientId: 3, patient: 'خالد سعد القحطاني', date: YESTERDAY, type: 'كشف', doctor: 'د. عبدالستار', clinic: 'مركز دمنهور للعيون', complaint: 'ألم بالعين', result: '', cost: '300', paid: true, nextVisit: YESTERDAY, notes: '' }
];
const mkApt = (id, patient, time, type, doctor, clinic, extra = {}) => ({ id, patient, patientId: id <= 3 ? id : undefined, time, date: TODAY, type, doctor, clinic, phone: '01012345678', ...extra });
const apts = [
  mkApt(1, 'مريض تجريبي', '09:00', 'فحص روتيني', 'د. عبدالستار', 'دمنهور', { confirmed: true }),
  mkApt(2, 'سارة أحمد', '09:10', 'كشف', 'د. سلمى', 'الرحمانية', { arrived: true, waitStatus: 'waiting', arrivedAt: Date.now() - 600000, cost: '200', paid: false }),
  mkApt(3, 'خالد سعد القحطاني', '09:20', 'متابعة', 'د. عبدالستار', 'دمنهور', { arrived: true, waitStatus: 'called', arrivedAt: Date.now() - 900000 }),
  mkApt(4, 'ليلى حسن', '09:30', 'استشارة', 'د. عبدالستار', 'دمنهور', { arrived: true, waitStatus: 'in', arrivedAt: Date.now() - 1200000 }),
  mkApt(5, 'كريم نبيل', '09:40', 'فحص روتيني', 'د. سلمى', 'مركز دمنهور للعيون', { arrived: true, waitStatus: 'done', cost: '300', paid: true, arrivedAt: Date.now() - 3000000 }),
  mkApt(6, 'عمر إبراهيم الدوسري', '10:00', 'كشف', 'د. سلمى', 'الرحمانية', { waitStatus: 'postponed', arrived: true }),
  mkApt(7, 'نورة عبدالله الشمري', '10:10', 'كشف', 'د. عبدالستار', 'دمنهور', { fromPatient: true, date: TOMORROW }),
  mkApt(8, 'فاطمة علي الزهراني', '10:20', 'استشارة', 'د. عبدالستار', 'دمنهور', { waitStatus: 'noshow' }),
  mkApt(9, 'مريض تجريبي', '11:00', 'متابعة', 'د. سلمى', 'دمنهور', { date: YESTERDAY, waitStatus: 'done', confirmed: true })
];
const prescriptions = [
  { id: 1, patientId: 1, patient: 'مريض تجريبي', date: TODAY, doctor: 'د. عبدالستار', eye: 'كلتا العينين', sphR: '-2.00', cylR: '-0.50', axisR: '180', sphL: '-1.75', cylL: '-0.25', axisL: '175', add: '+1.00', medicines: 'قطرة Timolol 0.5% مرتين يومياً\nمرهم Tobradex', notes: 'مراجعة بعد شهر' },
  { id: 2, patientId: 2, patient: 'سارة أحمد', date: YESTERDAY, eye: 'العين اليمنى', sphR: '+1.00', medicines: 'دموع صناعية', notes: '' }
];
const exams = [{ ...SEED.exams[0], id: 1, patientId: 1, date: TODAY }];
const prices = SEED.prices;
const expenses = [
  { id: 1, date: TODAY, category: 'مستلزمات طبية', amount: '500', notes: 'قطرات ومستلزمات فحص', clinic: 'دمنهور', recurringId: null },
  { id: 2, date: TODAY, category: 'رواتب', amount: '3000', notes: 'راتب شهري مصروف شهري ثابت', clinic: '', recurringId: 7 },
  { id: 3, date: TODAY, category: 'إيجار', amount: '2000', notes: '', clinic: 'الرحمانية', recurringId: null }
];
const recurringExpenses = [{ id: 7, category: 'رواتب', amount: '3000', notes: 'راتب شهري', clinic: '', day: 1, active: true, startMonth: TODAY.slice(0, 7) }];
const clinic = SEED.clinic;
const users = [{ id: 'u1', username: 'admin', email: 'admin@x.com', name: 'المدير', role: 'admin', active: true }, { id: 'u2', username: 'sec', email: 'sec@x.com', name: 'سكرتير', role: 'secretary', active: true }];
const adminSession = { id: 'u1', username: 'admin', email: 'admin@x.com', name: 'المدير', role: 'admin' };
const imagingOrders = [
  { id: 'io1', patientId: 1, patientName: 'مريض تجريبي', type: 'oct', eye: 'OU', status: 'pending', orderedAt: new Date().toISOString(), doctor: 'د. عبدالستار', notes: 'تصوير' },
  { id: 'io2', patientId: 2, patientName: 'سارة أحمد', type: 'fundus', eye: 'OD', status: 'in_progress', orderedAt: new Date().toISOString() }
];
const imagingStudies = [{ id: 's1', patientId: 1, patientName: 'مريض تجريبي', type: 'oct', eye: 'OU', date: TODAY, report: 'تقرير', notes: '', images: [{ url: 'https://example.invalid/a.jpg', public_id: 'p1' }] }];
const bookingRequests = [{ id: 'br1', patient_name: 'سارة أحمد', phone: '01012345678', clinic: 'دمنهور', date: TOMORROW, time: '20:00', visit_type: 'فحص روتيني', note: 'ملاحظة', status: 'pending' }];
const SEEDED = {
  iapp_appointments: apts, iapp_patients: patients, iapp_prices: prices, iapp_prescriptions: prescriptions, iapp_exams: exams, iapp_visits: visits,
  iapp_imaging_orders: imagingOrders, iapp_imaging_studies: imagingStudies, iapp_ratings: [{ id: 1, rating: 5, comment: 'ممتاز' }], iapp_injections: []
};
setRawIO({ readRemote: async key => SEEDED[key], writeRemote: async () => true });
// the booking-request table is read straight from the client
globalThis.__IAppSupabaseClient.from = table => { const x = b(); if (table === 'iapp_booking_requests') x.then = (r, j) => Promise.resolve({ data: bookingRequests, error: null }).then(r, j); return x; };

// ---------------- helpers ----------------
// Values of the fixture records: an edit form legitimately shows the STORED value in its text box (editing translates nothing).
const STORED_VALUES = new Set();
(function walk(v) { if (typeof v === 'string') STORED_VALUES.add(v); else if (v && typeof v === 'object') Object.values(v).forEach(walk); })([doctors, users, patients, apts, visits, prescriptions, exams, prices, expenses, recurringExpenses, clinic, imagingOrders, imagingStudies, bookingRequests, SEED]);
const visible = node => {
  if (node == null) return [];
  if (typeof node === 'string') return [node];
  if (Array.isArray(node)) return node.flatMap(visible);
  const p = node.props || {};
  const attrs = ['aria-label', 'placeholder', 'title', 'alt'].map(k => p[k]).filter(v => typeof v === 'string');
  // what a person reads inside a text box (prefilled defaults); <select>/<option> values are stored data, their text is checked
  if (!STORED_VALUES.has(p.value) && (node.type === 'textarea' || (node.type === 'input' && (!p.type || ['text', 'search', 'tel', 'email'].includes(p.type)))) && typeof p.value === 'string') attrs.push(p.value);
  return [...attrs, ...visible(node.children)];
};
const FIXTURE_TEXT = [...NAMES, 'المدير', 'سكرتير', 'ملاحظة', 'تقرير', 'ممتاز', 'أخصائي عيون', 'تصوير', 'دموع صناعية', 'ألم بالعين', 'مرهم Tobradex', 'ضغط', 'مهندس', 'لا يوجد', 'راتب شهري', 'فحص مخصص'];
const NAME_TOKENS = [...new Set(NAMES.flatMap(n => n.split(' ')))].filter(x => x.length > 2);
const arabicRunsIn = strings => {
  let t = strings.join('\n');
  for (const f of FIXTURE_TEXT) t = t.split(f).join('');
  for (const f of NAME_TOKENS) t = t.split(f).join('');
  return (t.match(/[؀-ۿ][؀-ۿ .،]*/g) || []).map(x => x.trim()).filter(x => x !== 'العربية' && x.length > 1);
};
const stripHtml = h => String(h).replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<script[\s\S]*?<\/script>/gi, ' ')
  .replace(/<[^>]+(?:alt|title|placeholder)="([^"]*)"[^>]*>/gi, ' $1 ').replace(/<[^>]*>/g, ' ').replace(/&[a-z#0-9]+;/gi, ' ');

let failures = 0;
const results = [];
const fail = (name, detail) => { failures++; console.error('FAIL ' + name + (detail ? ' -> ' + detail : '')); };
const pass = name => { console.log('ok   ' + name); results.push(name); };
const tick = (ms = 10) => act(async () => { await new Promise(r => setTimeout(r, ms)); });

// When a scenario is "filled", every text-like box gets a plausible value first, so forms get past "required" checks
// and reach their second-stage messages (wrong password, duplicate, server errors ...).
let FILL = false;
const FILL_VALUES = { text: 'Test User', search: 'a', tel: '01012345678', email: 'user@example.com', password: 'abcdef12', number: '5', date: TODAY, time: '10:00' };
async function fillInputs(r) {
  const boxes = r.root.findAll(n => (n.type === 'input' || n.type === 'textarea') && typeof n.props.onChange === 'function' && !['checkbox', 'radio', 'file', 'range'].includes(n.props.type));
  for (const n of boxes) {
    const v = n.type === 'textarea' ? 'Some note' : (FILL_VALUES[n.props.type || 'text'] ?? 'x');
    try { await act(async () => { n.props.onChange({ target: { value: v }, currentTarget: { value: v } }); }); } catch { /* a box that rejects the value stays empty */ }
  }
  await tick(4);
}
async function mount(makeEl) {
  let r;
  await act(async () => { r = TestRenderer.create(makeEl()); });
  await tick();
  if (FILL) await fillInputs(r);
  return r;
}
const snapshotStrings = r => visible(r.toJSON());
const clickables = r => r.root.findAll(n => typeof n.type === 'string' && typeof n.props.onClick === 'function' && !n.props.disabled);
const submittables = r => r.root.findAll(n => n.type === 'form' && typeof n.props.onSubmit === 'function');
const labelOf = n => { try { return visible(n.children.map(c => (typeof c === 'string' ? c : c.toJSON ? c.toJSON() : c))).join(' ').trim().slice(0, 24) || n.props['aria-label'] || ''; } catch { return ''; } };
async function fire(node, kind) {
  const before = getLang();
  try {
    await act(async () => {
      if (kind === 'submit') node.props.onSubmit({ preventDefault: noop, stopPropagation: noop, target: node });
      else node.props.onClick({ preventDefault: noop, stopPropagation: noop, target: node, currentTarget: node, stopImmediatePropagation: noop });
    });
  } catch (e) { return e; }
  await tick(FILL ? 15 : 4);
  // the language toggle itself was clicked: put the language back (what it shows is not an English-mode screen)
  if (getLang() !== before) { setLang(before); await act(async () => {}); return 'lang-toggled'; }
  return null;
}

// Mount a screen fresh, replay `path` (list of {kind,i}), return renderer.
async function replay(makeEl, path) {
  const r = await mount(makeEl);
  for (const step of path) {
    const list = step.kind === 'submit' ? submittables(r) : clickables(r);
    const node = list[step.i];
    if (!node) break;
    await fire(node, step.kind);
  }
  return r;
}

// Explore: BFS over clicks. A click that reveals strings not seen before is explored one more level.
async function explore(name, makeEl, { maxDepth = 2, maxPerLevel = 45 } = {}) {
  const seen = new Set();
  const bad = new Map();
  const crashes = [];
  let renders = 0;
  const check = (r, label) => {
    const strs = snapshotStrings(r);
    const runs = arabicRunsIn(strs);
    const dialogs0 = dialogs.splice(0);
    const dl = arabicRunsIn(dialogs0);
    const where = x => {
      const all = [...strs, ...dialogs0], at = all.findIndex(v => v.includes(x));
      if (process.env.DUMP && at > -1) console.log('   context:', JSON.stringify(all.slice(Math.max(0, at - 4), at + 2)));
      return label + (at > -1 ? ' in "' + all[at].replace(/\s+/g, ' ').slice(0, 70) + '"' : '');
    };
    for (const x of [...runs, ...dl]) if (!bad.has(x)) bad.set(x, where(x));
    return strs;
  };
  let r = await mount(makeEl);
  const base = check(r, 'initial');
  base.forEach(s => seen.add(s));
  r.unmount();
  let frontier = [[]];
  for (let depth = 0; depth < maxDepth; depth++) {
    const nextFrontier = [];
    for (const path of frontier) {
      const rr = await replay(makeEl, path);
      // repeated rows/chips with the same label open the same thing: explore the first of each
      const keys = new Set();
      const acts = [...clickables(rr).map((n, i) => ({ kind: 'click', i, key: labelOf(n) })), ...submittables(rr).map((_, i) => ({ kind: 'submit', i }))]
        .filter(a => { if (!a.key) return true; if (keys.has(a.key)) return false; keys.add(a.key); return true; });
      rr.unmount();
      for (const stepDef of acts.slice(0, maxPerLevel)) {
        const p = [...path, stepDef];
        let r2;
        try {
          r2 = await replay(makeEl, path);
          const list = stepDef.kind === 'submit' ? submittables(r2) : clickables(r2);
          if (!list[stepDef.i]) { r2.unmount(); continue; }
          const lbl = labelOf(list[stepDef.i]);
          const err = await fire(list[stepDef.i], stepDef.kind);
          renders++;
          if (err === 'lang-toggled') { r2.unmount(); continue; }
          if (err) { crashes.push(`${stepDef.kind}#${stepDef.i}: ${err && err.message}`); }
          const strs = check(r2, 'after ' + p.map(s => s.kind[0] + s.i).join('>') + ' [' + lbl + ']');
          const fresh = strs.filter(s => !seen.has(s));
          strs.forEach(s => seen.add(s));
          if (fresh.length) nextFrontier.push(p);
        } catch (e) { crashes.push('render after ' + p.map(s => s.kind[0] + s.i).join('>') + ': ' + (e && e.message)); }
        finally { try { r2 && r2.unmount(); } catch { /* already gone */ } }
      }
    }
    frontier = nextFrontier.slice(0, 40);
  }
  return { bad, crashes, renders };
}

async function runScreen(name, makeEl, opts) {
  const mkEl = () => makeEl();
  const t0 = Date.now();
  dialogs.length = 0;
  try {
    // Arabic: must render non-empty
    setLang('ar');
    const ra = await mount(mkEl);
    const arLen = JSON.stringify(ra.toJSON() || '').length;
    ra.unmount();
    if (arLen < 40 && !(opts && opts.allowEmpty)) fail(`${name} (ar): empty render`);
    else pass(`${name} (ar): renders (${arLen} chars)`);
    // English
    setLang('en');
    dialogs.length = 0;
    FILL = !!(opts && opts.fill);
    const { bad, crashes, renders } = await explore(name, mkEl, opts);
    if (crashes.length) fail(`${name} (en): ${crashes.length} click(s) threw`, [...new Set(crashes)].slice(0, 4).join(' | '));
    // async work started in English may alert after the last render: let it finish and check it too
    await tick(40);
    for (const x of arabicRunsIn(dialogs.splice(0))) if (!bad.has(x)) bad.set(x, 'late dialog');
    if (bad.size) fail(`${name} (en): Arabic left`, JSON.stringify([...bad].slice(0, 12)));
    else pass(`${name} (en): no Arabic after ${renders} interactions (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
  } catch (e) { fail(`${name}: crashed`, (e && e.stack || e).toString().split('\n').slice(0, 4).join(' / ')); }
  finally { FILL = false; setLang('ar'); }
}

// ---------------- screens ----------------
const noopAsync = async () => ({});
const Stateful = ({ init, children }) => { const [s, set] = React.useState(init); return children(s, set); };
const SCREENS = [];
const add = (name, make, opts) => SCREENS.push([name, make, opts]);

const Dashboard = (await import('../../src/screens/Dashboard.jsx')).default;
const Patients = (await import('../../src/screens/Patients.jsx')).default;
const Appointments = (await import('../../src/screens/Appointments.jsx')).default;
const PendingRequests = (await import('../../src/screens/appointments/PendingRequests.jsx')).default;
const WaitingRoom = (await import('../../src/screens/WaitingRoom.jsx')).default;
const Prescriptions = (await import('../../src/screens/Prescriptions.jsx')).default;
const Radiology = (await import('../../src/screens/Radiology.jsx')).default;
const ImagingCenter = (await import('../../src/screens/ImagingCenter.jsx')).default;
const Accounting = (await import('../../src/screens/Accounting.jsx')).default;
const Settings = (await import('../../src/screens/Settings.jsx')).default;
const SecretaryApp = (await import('../../src/screens/SecretaryApp.jsx')).default;
const PatientApp = (await import('../../src/screens/PatientApp.jsx')).default;
const UnifiedLogin = (await import('../../src/screens/UnifiedLogin.jsx')).default;
const ForcePasswordChange = (await import('../../src/screens/ForcePasswordChange.jsx')).default;
const DataTools = (await import('../../src/components/DataTools.jsx')).default;
const FollowUpCentre = (await import('../../src/components/FollowUpCentre.jsx')).default;
const GlobalSearch = (await import('../../src/components/GlobalSearch.jsx')).default;
const TopBar = (await import('../../src/components/TopBar.jsx')).default;
const BottomNav = (await import('../../src/components/BottomNav.jsx')).default;
const App = (await import('../../src/screens/App.jsx')).default;
const F = await import('../../src/components/forms/index.js');
const M = await import('../../src/components/modals/index.js');
const { blankBookForm } = await import('../../src/modules/patient-app/model.js');

const h = React.createElement;
const stateful = (init, render) => () => h(Stateful, { init, children: render });

add('Dashboard', () => h(Dashboard, { patients, appointments: apts, visits, primary: doctors[0], onDailyReport: noop, onPatientClick: noop }));
add('Patients (filled)', () => h(Patients, { patients, search: '', setSearch: noop, addP: noop, updP: noop, delP: noop, onOpenFile: noop, session: adminSession }), { fill: true });
add('Patients', () => h(Stateful, { init: '', children: (s, set) => h(Patients, { patients, search: s, setSearch: set, addP: noop, updP: noop, delP: noop, onOpenFile: noop, session: adminSession }) }));
add('Patients (search, no match)', () => h(Patients, { patients, search: 'zzz', setSearch: noop, addP: noop, updP: noop, delP: noop, onOpenFile: noop, session: adminSession }));
add('Appointments', () => h(Appointments, { appointments: apts, setAppointments: noop, doctorNames, patients, onPatientClick: noop, session: adminSession }));
add('PendingRequests', () => h(PendingRequests, {}));
add('WaitingRoom', () => h(WaitingRoom, { apts, today: TODAY, onUpdateApt: noopAsync, onCollect: noop, doctorNames, isAdmin: true }));
add('Prescriptions', () => h(Prescriptions, { prescriptions, setRx: noop, patients, doctorNames, primaryDoctor: doctors[0], clinic }));
add('Radiology', () => h(Radiology, { patients, customTests: [{ id: 'c1', name: 'Custom test', name_ar: 'فحص مخصص', cat: 'مخصص' }], setCustomTests: noop, setExams: noop, primary: doctors[0], clinic }));
add('ImagingCenter', () => h(ImagingCenter, { patients, primary: doctors[0], clinic }), { maxDepth: 3, maxPerLevel: 30 });
add('Accounting', () => h(Accounting, { visits, expenses, setExpenses: noop, recurringExpenses, setRecurringExpenses: noop, doctors, clinic }));
add('Settings (admin, filled)', () => h(Settings, { patients, appointments: apts, prescriptions, exams, visits, doctors, setDoctors: noop, prices, setPrices: noop, clinic, setClinic: noop, onReset: noop, users, setUsers: noop, session: adminSession, onLogout: noop }), { fill: true, maxPerLevel: 30 });
add('Settings (admin)', () => h(Settings, { patients, appointments: apts, prescriptions, exams, visits, doctors, setDoctors: noop, prices, setPrices: noop, clinic, setClinic: noop, onReset: noop, users, setUsers: noop, session: adminSession, onLogout: noop }));
add('Settings (doctor)', () => h(Settings, { patients, appointments: apts, prescriptions, exams, visits, doctors, setDoctors: noop, prices, setPrices: noop, clinic, setClinic: noop, onReset: noop, users, setUsers: noop, session: { ...adminSession, role: 'doctor' }, onLogout: noop }));
add('App shell (admin)', () => { localStorage.setItem('iapp_session', JSON.stringify(adminSession)); return h(App, {}); });
add('SecretaryApp (logged out)', () => { localStorage.removeItem('iapp_session'); return h(SecretaryApp, {}); });
add('SecretaryApp (secretary)', () => { localStorage.setItem('iapp_session', JSON.stringify({ ...adminSession, role: 'secretary' })); return h(SecretaryApp, {}); });
add('SecretaryApp (admin)', () => { localStorage.setItem('iapp_session', JSON.stringify(adminSession)); return h(SecretaryApp, {}); });
add('PatientApp (patient)', () => h(PatientApp, { patient: { ...patients[0], isGuest: false }, onLogout: noop }), { maxDepth: 3, maxPerLevel: 12 });
add('PatientApp (guest, filled)', () => h(PatientApp, { patient: { id: 0, name: '', isGuest: true, phone: '' }, onLogout: noop }), { fill: true, maxDepth: 5, maxPerLevel: 6 });
add('UnifiedLogin', () => h(UnifiedLogin, { onLogin: noop }));
add('UnifiedLogin (filled)', () => h(UnifiedLogin, { onLogin: noop }), { fill: true, maxDepth: 3, maxPerLevel: 12 });
add('ForcePasswordChange', () => h(ForcePasswordChange, { user: { id: 'u1', username: 'admin', email: 'a@b.c' }, onDone: noop, onLogout: noop }));
add('ForcePasswordChange (filled)', () => h(ForcePasswordChange, { user: { id: 'u1', username: 'admin', email: 'a@b.c' }, onDone: noop, onLogout: noop }), { fill: true });
add('DataTools (admin)', () => h(DataTools, { isAdmin: true }));
add('DataTools (non-admin)', () => h(DataTools, { isAdmin: false }), { allowEmpty: true });
add('FollowUpCentre', () => h(FollowUpCentre, { visits, patients, onClose: noop, onPatientClick: noop }));
add('GlobalSearch', () => h(Stateful, { init: 0, children: () => h(GlobalSearch, { patients, prescriptions, appointments: apts, onNavigate: noop, onClose: noop }) }));
add('TopBar', () => h(TopBar, { backLabel: 'back', onBack: noop, primary: doctors[0], onSearch: noop, syncing: false, session: adminSession, onLogout: noop }));
add('BottomNav (admin)', () => h(BottomNav, { active: 'dashboard', setActive: noop, role: 'admin' }));
add('BottomNav (secretary)', () => h(BottomNav, { active: 'dashboard', setActive: noop, role: 'secretary' }));
// forms
add('BookingForm', () => h(Stateful, { init: blankBookForm(patients[0]), children: (s, set) => h(F.BookingForm, { patient: patients[0], bookForm: s, setBookForm: set, booking: false, onBook: noop, slotsVersion: 0 }) }), { maxDepth: 4, maxPerLevel: 8 });
add('BookingForm (guest, filled)', () => h(Stateful, { init: blankBookForm({ isGuest: true }), children: (s, set) => h(F.BookingForm, { patient: { isGuest: true }, bookForm: s, setBookForm: set, booking: false, onBook: noop, slotsVersion: 0 }) }), { fill: true, maxDepth: 5, maxPerLevel: 8 });
add('AptForm (filled, conflicting)', () => h(F.AptForm, { onSave: noop, onClose: noop, doctorNames, appointments: [{ id: 99, patient: 'x', date: TODAY, time: '10:00', doctor: doctorNames[0], clinic: 'دمنهور' }] }), { fill: true });
add('AptForm', () => h(F.AptForm, { onSave: noop, onClose: noop, doctorNames, appointments: apts }));
add('AptForm (edit)', () => h(F.AptForm, { initial: apts[0], onSave: noop, onClose: noop, doctorNames, appointments: apts }));
add('SecretaryAptForm (filled)', () => h(F.SecretaryAptForm, { patients, appointments: apts, prices, onSave: noop, onClose: noop }), { fill: true });
add('SecretaryAptForm', () => h(F.SecretaryAptForm, { patients, appointments: apts, prices, onSave: noop, onClose: noop }));
add('SecretaryAptForm (edit)', () => h(F.SecretaryAptForm, { initial: apts[0], patients, appointments: apts, prices, onSave: noop, onClose: noop }));
add('DoctorForm', () => h(F.DoctorForm, { onSave: noop, onClose: noop }));
add('DoctorForm (edit)', () => h(F.DoctorForm, { initial: doctors[0], onSave: noop, onClose: noop }));
add('UserForm', () => h(F.UserForm, { onSave: noop, onClose: noop, error: '' }));
add('UserForm (filled)', () => h(F.UserForm, { onSave: noop, onClose: noop, error: '' }), { fill: true });
add('UserForm (edit)', () => h(F.UserForm, { initial: users[0], onSave: noop, onClose: noop, error: '' }));
add('PriceForm', () => h(F.PriceForm, { onSave: noop, onClose: noop }));
add('ExpenseForm', () => h(F.ExpenseForm, { onSave: noop, onClose: noop }));
add('ExpenseForm (edit)', () => h(F.ExpenseForm, { initial: expenses[0], onSave: noop, onClose: noop }));
add('RecurringExpenseForm', () => h(F.RecurringExpenseForm, { onSave: noop, onClose: noop }));
add('RecurringExpenseForm (edit)', () => h(F.RecurringExpenseForm, { initial: recurringExpenses[0], onSave: noop, onClose: noop }));
add('CollectModal', () => h(F.CollectModal, { apt: apts[1], prices, onSave: noop, onClose: noop }));
add('LoginScreen', () => h(F.LoginScreen, { onLogin: noop }));
add('LoginScreen (filled)', () => h(F.LoginScreen, { onLogin: noop }), { fill: true });
add('PrintModal', () => h(M.PrintModal, { rx: prescriptions[0], patient: patients[0], onClose: noop, primaryDoctor: doctors[0], clinic }));
add('RemindersModal', () => h(M.RemindersModal, { apts: apts.map(a => ({ ...a, date: TOMORROW })), onClose: noop, onMark: noop }));

const only = process.env.ONLY ? new RegExp(process.env.ONLY, 'i') : null;
for (const [name, make, opts] of SCREENS) {
  if (only && !only.test(name)) continue;
  await runScreen(name, make, opts);
}

// ---------------- print HTML builders ----------------
const P = await import('../../src/modules/print/index.js');
const pdoc = doctors[0];
const builders = {
  dailyReport: () => P.getDailyReportHTML(TODAY, patients, visits, apts, pdoc, clinic),
  patientFile: () => P.getPatientFileHTML(patients[0], visits, exams, prescriptions, pdoc, clinic),
  rx: () => P.getRxHTML(prescriptions[0], patients[0], pdoc.name, clinic),
  glasses: () => P.getGlassesHTML(prescriptions[0], patients[0], pdoc.name, clinic),
  radiology: () => P.getRadiologyHTML({ t1: 'OU', t2: 'OD' }, patients[0], 'ملاحظة', pdoc, [{ id: 't1', name: 'OCT', name_ar: 'تصوير مقطعي', cat: 'شبكية' }, { id: 't2', name: 'VF', name_ar: 'مجال رؤية', cat: 'جلوكوما' }], clinic),
  accounting: () => P.getAccountingReportHTML(null, null, 'month', 5000, expenses, clinic, pdoc)
};
for (const lang of ['ar', 'en']) {
  setLang(lang);
  for (const [name, fn] of Object.entries(builders)) {
    if (only && !only.test('print ' + name)) continue;
    try {
      const html = fn();
      if (typeof html !== 'string' || html.length < 200) { fail(`print ${name} (${lang}): empty`); continue; }
      if (lang === 'en') {
        const runs = arabicRunsIn([stripHtml(html)]);
        if (runs.length) fail(`print ${name} (en): Arabic left`, JSON.stringify([...new Set(runs)].slice(0, 12)));
        else pass(`print ${name} (en): no Arabic`);
        if (/dir=["']?rtl|direction:\s*rtl/i.test(html)) fail(`print ${name} (en): still rtl`);
        if (!/<html[^>]*dir="ltr"/.test(html)) fail(`print ${name} (en): document is not dir="ltr"`);
      } else if (!/<html[^>]*dir="rtl"/.test(html)) fail(`print ${name} (ar): document is not dir="rtl"`);
      else pass(`print ${name} (ar): builds, rtl`);
    } catch (e) { fail(`print ${name} (${lang}): threw`, e.message); }
  }
}
setLang('ar');
if (failures) { console.error(failures, 'screen smoke failure(s)'); process.exit(1); }
console.log('screens smoke: all passed (' + results.length + ' checks)');
process.exit(0);
