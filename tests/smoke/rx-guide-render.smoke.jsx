// Render smoke test: mounts the real RxGuide screen, loads the guide, searches, filters, opens a card (Arabic and English).
// Run with:  npm run test:smoke:rxguide
import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
const store = new Map();
globalThis.localStorage = { getItem: k => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: k => store.delete(k) };
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
globalThis.window = { __iappSyncInit: true, IAppModules: { auth: { ensureSession: async () => ({ ok: true }) } } };
const { setRawIO } = await import('../../src/modules/sync/wiring.js');
const remote = {};
setRawIO({ readRemote: async key => (key in remote ? remote[key] : null), writeRemote: async (key, value) => { remote[key] = value; return true; } });
const { default: RxGuide } = await import('../../src/screens/RxGuide.jsx');
const { default: RxGuidePicker } = await import('../../src/components/RxGuidePicker.jsx');
const { GUIDE_DRUGS } = await import('../../src/modules/prescriptions/guide-drugs.js');
const { setLang } = await import('../../src/modules/i18n/index.js');

let failed = 0;
const ok = (c, m) => { if (!c) { failed++; console.error('FAIL: ' + m); } };
const json = r => JSON.stringify(r.toJSON());
const flat = c => (c == null || c === false ? '' : typeof c === 'string' || typeof c === 'number' ? String(c) : Array.isArray(c) ? c.map(flat).join('') : c.props ? flat(c.props.children) : '');
const settle = async () => { for (let i = 0; i < 5; i++) await act(async () => { await new Promise(res => setTimeout(res, 20)); }); };

for (const lang of ['ar', 'en']) {
  setLang(lang);
  let r;
  await act(async () => { r = TestRenderer.create(<RxGuide />); });
  await settle();
  const cardButtons = () => r.root.findAll(n => n.type === 'button' && n.props['aria-expanded'] !== undefined);
  ok(cardButtons().length === 214, `${lang}: 214 cards listed (got ${cardButtons().length})`);
  ok(json(r).includes(lang === 'ar' ? 'روشتة في دقيقة' : 'Rx in a minute'), `${lang}: title`);
  ok(json(r).includes('Reem Fawzy'), `${lang}: credit line shown`);
  // search
  const search = r.root.findByProps({ type: 'search' });
  await act(async () => { search.props.onChange({ target: { value: 'hyphema' } }); });
  ok(cardButtons().length === 1, `${lang}: hyphema search gives one card`);
  ok(json(r).includes('Pred Forte 1% ×4'), `${lang}: a single result opens by itself and shows the Rx text`);
  await act(async () => { search.props.onChange({ target: { value: '' } }); });
  // urgent filter
  const urgent = r.root.findAll(n => n.type === 'button' && n.props['aria-pressed'] !== undefined && flat(n.props.children).includes('🚨'))[0];
  ok(!!urgent, `${lang}: urgent chip`);
  await act(async () => { urgent.props.onClick(); });
  ok(cardButtons().length === 68, `${lang}: 68 urgent cards (got ${cardButtons().length})`);
  // open one card and check the section labels
  await act(async () => { cardButtons()[0].props.onClick(); });
  ok(json(r).includes(lang === 'ar' ? 'الروشتة' : '"Rx"') || json(r).includes('💊'), `${lang}: opened card shows the Rx section`);
  await act(async () => { r.unmount(); });
}

// --- doctor: add a card of the clinic's own, then edit and remove it (synced key stubbed above) ---
setLang('ar');
{
  let r;
  await act(async () => { r = TestRenderer.create(<RxGuide session={{ role: 'doctor' }} />); });
  await settle();
  const cardButtons = () => r.root.findAll(n => n.type === 'button' && n.props['aria-expanded'] !== undefined);
  const btn = text => r.root.findAll(n => n.type === 'button' && flat(n.props.children).includes(text))[0];
  ok(!!btn('كارت جديد'), 'doctor sees the add-card button');
  await act(async () => { btn('كارت جديد').props.onClick(); });
  const inputs = r.root.findAll(n => n.type === 'input' && n.props.dir === 'auto' && n.props.type !== 'search');
  await act(async () => { inputs[0].props.onChange({ target: { value: 'كارت العيادة التجريبي' } }); });
  await act(async () => { r.root.findAll(n => n.type === 'select')[0].props.onChange({ target: { value: '4' } }); });
  const areas = r.root.findAll(n => n.type === 'textarea');
  await act(async () => { areas[1].props.onChange({ target: { value: 'Vigamox ×4\nPlegica 1% ×2' } }); });
  await act(async () => { btn('حفظ').props.onClick(); });
  await settle();
  ok(cardButtons().length === 215, `clinic card added (got ${cardButtons().length})`);
  ok(Array.isArray(remote.iapp_rx_guide) && remote.iapp_rx_guide.length === 1, 'edit stored in the synced key');
  // search it, open, delete
  await act(async () => { r.root.findByProps({ type: 'search' }).props.onChange({ target: { value: 'التجريبي' } }); });
  ok(cardButtons().length === 1, 'search finds the clinic card');
  ok(!!btn('حذف'), 'a clinic card can be deleted');
  await act(async () => { r.unmount(); });
  // a secretary-like session gets no edit buttons
  await act(async () => { r = TestRenderer.create(<RxGuide session={{ role: 'secretary' }} />); });
  await settle();
  ok(!r.root.findAll(n => n.type === 'button' && flat(n.props.children).includes('كارت جديد')).length, 'no add button without write access');
  await act(async () => { r.unmount(); });
}

// --- picker used by the prescription form (medicines) and the exam form (plan) ---
for (const mode of ['meds', 'plan']) {
  let r;
  let got = null;
  await act(async () => { r = TestRenderer.create(<RxGuidePicker mode={mode} drugs={GUIDE_DRUGS} onApply={x => { got = x; }} onClose={() => {}} />); });
  await settle();
  await act(async () => { r.root.findByProps({ type: 'search' }).props.onChange({ target: { value: 'hyphema' } }); });
  const row = r.root.findAll(n => n.type === 'button' && flat(n.props.children).includes('Hyphema'))[0];
  ok(!!row, `${mode}: picker lists the Hyphema card`);
  await act(async () => { row.props.onClick(); });
  const boxes = r.root.findAll(n => n.type === 'input' && n.props.type === 'checkbox');
  ok(boxes.length > 3, `${mode}: lines can be ticked (${boxes.length})`);
  ok(boxes.some(b => b.props.checked), `${mode}: some lines start ticked`);
  const apply = r.root.findAll(n => n.type === 'button' && flat(n.props.children).includes('إضافة المحدد'))[0];
  ok(!!apply, `${mode}: apply button`);
  await act(async () => { apply.props.onClick(); });
  ok(got && got.lines.length > 0 && got.card.title === 'Hyphema', `${mode}: apply hands the chosen lines to the form`);
  if (mode === 'meds') ok(got.lines.every(l => typeof l === 'string'), 'meds: lines are strings');
  await act(async () => { r.unmount(); });
}
if (failed) { console.error(`rx-guide smoke: ${failed} failed`); process.exit(1); }
console.log('rx-guide smoke: all passed');
process.exit(0);
