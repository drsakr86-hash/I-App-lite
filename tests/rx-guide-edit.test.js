// Rx guide: the clinic's edits (overlay), editor validation, guide line -> medicine, print sheet and the synced store.
import test from 'node:test';
import assert from 'node:assert/strict';
import data from '../src/modules/rx-guide/data.js';
import {
  applyOverlay, hiddenCount, normalizeCardInput, sectionsToText, lineToMedicine, linesToMedicines, overrideId, cardToPlanText
} from '../src/modules/rx-guide/model.js';
import { RX_GUIDE_KEY, loadGuideOverlay, refreshGuideOverlay, saveGuideCard, hideGuideCard, removeGuideRecord, restoreHiddenCards } from '../src/modules/rx-guide/store.js';
import { GUIDE_DRUGS } from '../src/modules/prescriptions/guide-drugs.js';
import { getGuideHTML } from '../src/modules/print/guide-print.js';
import { can } from '../src/app/permissions.js';
import { setActor } from '../src/modules/sync/audit-trash-backup.js';
import { setRawIO, setTableMutate } from '../src/modules/sync/wiring.js';

function makeLocalStorage() {
  const store = new Map();
  return { getItem: k => (store.has(k) ? store.get(k) : null), setItem: (k, v) => { store.set(k, String(v)); }, removeItem: k => { store.delete(k); }, get length() { return store.size; }, key: i => Array.from(store.keys())[i] ?? null };
}
globalThis.localStorage = makeLocalStorage();
globalThis.window = globalThis.window || {};
globalThis.window.IAppModules = globalThis.window.IAppModules || {};
globalThis.window.IAppModules.auth = { ensureSession: async () => ({ ok: true }) };
let stores = {};
setRawIO({ readRemote: async key => (key in stores ? stores[key] : null), writeRemote: async (key, value) => { stores[key] = value; return true; } });
test.afterEach(() => { globalThis.localStorage = makeLocalStorage(); stores = {}; setActor(() => ({ name: '—', role: '' })); setTableMutate(async () => undefined); });

const chapterNumbers = data.chapters.map(c => c.n);
const hyphema = data.cards.find(c => c.title === 'Hyphema');

test('overlay: with no records the guide is unchanged', () => {
  assert.deepEqual(applyOverlay(data.cards, []), data.cards);
  assert.deepEqual(applyOverlay(data.cards, null), data.cards);
});

test('overlay: an edited card replaces the original in place and is marked edited; removing the record brings the original back', () => {
  const rec = { id: overrideId(hyphema.id), base: hyphema.id, chapter: hyphema.chapter, title: 'Hyphema (clinic)', urgent: false, sections: [{ kind: 'rx', lines: ['Pred Forte 1% ×6'] }] };
  const merged = applyOverlay(data.cards, [rec]);
  assert.equal(merged.length, data.cards.length);
  const i = data.cards.indexOf(hyphema);
  assert.equal(merged[i].id, hyphema.id);
  assert.equal(merged[i].title, 'Hyphema (clinic)');
  assert.equal(merged[i].edited, true);
  assert.equal(merged[i].num, hyphema.num);
  assert.equal(applyOverlay(data.cards, []).find(c => c.id === hyphema.id).title, 'Hyphema');
});

test('overlay: a hidden card disappears and is counted; a clinic card is added at the end of its chapter', () => {
  const hide = { id: overrideId(hyphema.id), base: hyphema.id, deleted: true };
  const own = { id: 'u:1', base: null, chapter: 4, title: 'My cornea card', urgent: true, sections: [{ kind: 'rx', lines: ['Vigamox ×4'] }] };
  const merged = applyOverlay(data.cards, [hide, own]);
  assert.equal(merged.length, data.cards.length);
  assert.ok(!merged.some(c => c.id === hyphema.id));
  assert.equal(hiddenCount([hide, own]), 1);
  const lastCornea = merged.filter(c => c.chapter === 4).pop();
  assert.equal(lastCornea.id, 'u:1');
  assert.equal(lastCornea.custom, true);
  assert.deepEqual(merged.map(c => c.chapter), [...merged.map(c => c.chapter)].sort((a, b) => a - b));
});

test('overlay: junk records are ignored', () => {
  assert.equal(applyOverlay(data.cards, [null, 5, 'x']).length, data.cards.length);
  assert.equal(applyOverlay(data.cards, [{ id: 'z', base: 'no-such-card', title: 'x', chapter: 3, sections: [] }]).length, data.cards.length);
});

test('editor validation: title, chapter and at least one line are required; lines are trimmed and kept as typed', () => {
  assert.equal(normalizeCardInput({ title: ' ', chapter: 3, sections: { rx: 'a' } }, chapterNumbers).error, 'rxg.err.title');
  assert.equal(normalizeCardInput({ title: 'x', chapter: 99, sections: { rx: 'a' } }, chapterNumbers).error, 'rxg.err.chapter');
  assert.equal(normalizeCardInput({ title: 'x', chapter: 3, sections: { rx: ' \n ' } }, chapterNumbers).error, 'rxg.err.empty');
  const r = normalizeCardInput({ title: ' T ', chapter: '4', urgent: 1, sections: { rx: ' Vigamox ×4 \n\n  Pred Forte 1% ×4', follow: 'بعد أسبوع', bogus: 'x' } }, chapterNumbers);
  assert.equal(r.ok, true);
  assert.deepEqual(r.value, { title: 'T', chapter: 4, urgent: true, sections: [{ kind: 'rx', lines: ['Vigamox ×4', 'Pred Forte 1% ×4'] }, { kind: 'follow', lines: ['بعد أسبوع'] }] });
  assert.equal(sectionsToText(hyphema).rx.split('\n')[0], hyphema.sections.find(s => s.kind === 'rx').lines[0]);
});

test('guide line to medicine: known drugs split into name + dose, ointments and compound lines are understood, others stay whole', () => {
  const m = l => lineToMedicine(l, GUIDE_DRUGS);
  assert.deepEqual(m('Pred Forte 1% ×4 لمدة أسبوع'), { name: 'Pred Forte 1% ED', dose: '×4 لمدة أسبوع', known: true });
  assert.deepEqual(m('Tobrex eye oint. كل 2–4 س صاحية'), { name: 'Tobrex EO', dose: 'كل 2–4 س صاحية', known: true });
  assert.deepEqual(m('Cidamex 250 2 قرص ×2'), { name: 'Cidamex 250', dose: '2 قرص ×2', known: true });
  assert.deepEqual(m('IOP عالي'), { name: 'IOP عالي', dose: '', known: false });
  assert.equal(m('Vigamoxx ×4').known, false); // a longer word that merely starts like a drug is not that drug
  const two = linesToMedicines(['Timolol 0.5% ×2 ± Cidamex 250 ×4'], GUIDE_DRUGS);
  assert.deepEqual(two.map(x => x.name), ['Timolol 0.5% ED', 'Cidamex 250']);
  const alt = linesToMedicines(['Vigamox أو Oflox ×4'], GUIDE_DRUGS);
  assert.equal(alt.length, 1);
  assert.equal(linesToMedicines([], GUIDE_DRUGS).length, 0);
});

test('guide line to medicine: every Rx line of the guide gives a non-empty name', () => {
  for (const c of data.cards) for (const s of c.sections) if (s.kind === 'rx') for (const meds of s.lines.map(l => linesToMedicines([l], GUIDE_DRUGS))) for (const med of meds) assert.ok(med.name, c.num);
  const recognised = data.cards.flatMap(c => c.sections.filter(s => s.kind === 'rx').flatMap(s => s.lines)).filter(l => lineToMedicine(l, GUIDE_DRUGS).known).length;
  assert.ok(recognised > 250, 'recognised Rx lines: ' + recognised);
});

test('plan text: title then the chosen sections as dashed lines', () => {
  const txt = cardToPlanText(hyphema, ['rx']);
  assert.equal(txt.split('\n')[0], 'Hyphema');
  assert.ok(txt.includes('- Pred Forte 1% ×4'));
  assert.ok(!txt.includes('📅'));
});

test('print sheet: escapes text, lists sections in order, shows the credit and the clinic name', () => {
  const evil = { id: 'x', num: '1.1', chapter: 3, title: '<img src=x onerror=alert(1)>', urgent: true, sections: [{ kind: 'rx', lines: ['a <b> & "c"'] }] };
  const html = getGuideHTML([evil, hyphema], { address: 'دمنهور', phone: '123' }, 'Condensed from The Wills Eye Manual');
  assert.ok(!html.includes('<img src=x'));
  assert.ok(html.includes('&lt;img src=x'));
  assert.ok(html.includes('a &lt;b&gt; &amp; &quot;c&quot;'));
  assert.ok(html.includes('د. عبدالستار صقر للعيون والليزر'));
  assert.ok(html.includes('Condensed from The Wills Eye Manual'));
  assert.ok(html.includes('دمنهور · 123'));
  assert.equal((html.match(/class="card"/g) || []).length, 2);
});

test('access: only doctor and admin may edit the guide', () => {
  assert.ok(can('admin', 'rx_guide', 'write') && can('doctor', 'rx_guide', 'write'));
  assert.ok(!can('secretary', 'rx_guide', 'write') && !can('employee', 'rx_guide', 'write'));
});

test('store: save, hide, remove and restore go through the synced key and keep a local copy', async () => {
  assert.deepEqual(loadGuideOverlay(), []);
  const value = { title: 'Hyphema (clinic)', chapter: 3, urgent: true, sections: [{ kind: 'rx', lines: ['x'] }] };
  let list = await saveGuideCard(value, hyphema.id, null);
  assert.equal(list.length, 1);
  assert.equal(list[0].id, overrideId(hyphema.id));
  assert.equal(list[0].base, hyphema.id);
  assert.deepEqual(stores[RX_GUIDE_KEY], list);
  assert.deepEqual(loadGuideOverlay(), list);
  list = await saveGuideCard({ ...value, title: 'Again' }, hyphema.id, null); // same base: replaced, not duplicated
  assert.equal(list.length, 1);
  assert.equal(list[0].title, 'Again');
  list = await saveGuideCard({ ...value, title: 'Mine' }, null, null);
  assert.equal(list.length, 2);
  const own = list.find(r => !r.base);
  assert.match(own.id, /^u:/);
  list = await saveGuideCard({ ...value, title: 'Mine 2' }, null, own.id); // editing a clinic card keeps its id
  assert.equal(list.filter(r => !r.base).length, 1);
  assert.equal(list.find(r => !r.base).title, 'Mine 2');
  list = await hideGuideCard('c010', 'Some card');
  assert.equal(hiddenCount(list), 1);
  list = await restoreHiddenCards();
  assert.equal(hiddenCount(list), 0);
  assert.equal(list.length, 2);
  list = await removeGuideRecord(overrideId(hyphema.id), 'x');
  assert.equal(list.length, 1);
  assert.deepEqual(await refreshGuideOverlay(), list);
});
