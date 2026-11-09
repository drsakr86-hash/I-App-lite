import test from 'node:test';
import assert from 'node:assert/strict';
import * as D from '../src/modules/atlas/drawings.js';
import { printDrawingsOf, prepareDrawingImages, isPrintableDataUrl, MAX_PRINT_DRAWINGS } from '../src/modules/atlas/print-drawings.js';
import { getPatientFileHTML, lastExamOf } from '../src/modules/print/index.js';

const doc = { id: 'u1', name: 'Dr. A' };
const mk = (id, include) => {
  let list = D.addDrawing([], D.approveDrawing({ id, plateId: 'blank-canvas', annotations: [], image: { provider: 'supabase', bucket: 'clinical-private', path: `atlas/12/${id}.png`, bytes: 10, sha256: 'x', mime: 'image/png' }, patientId: 12, visitId: 5, examId: 7, user: doc, role: 'doctor', now: '2026-11-06T10:00:00Z' }));
  if (include) list = D.setIncludeInReport(list, id, true, { user: doc, role: 'doctor', now: '2026-11-06T11:00:00Z' });
  return list[0];
};
const PNG = 'data:image/png;base64,iVBORw0KGgo=';
const exam = { id: 'e1', patientId: 12, date: '2026-11-06', atlasDrawings: [mk('aaaa1111', true), mk('bbbb2222', false)] };

test('print: only approved + includeInReport drawings, only for doctor/admin', () => {
  assert.deepEqual(printDrawingsOf(exam, 'doctor').map(d => d.id), ['aaaa1111']);
  for (const r of ['secretary', 'employee', 'patient', undefined]) assert.deepEqual(printDrawingsOf(exam, r), []);
  assert.ok(MAX_PRINT_DRAWINGS >= 1);
});

test('print: data URL whitelist', () => {
  assert.equal(isPrintableDataUrl(PNG), true);
  for (const bad of ['http://x/a.png', 'data:text/html;base64,AAAA', 'data:image/svg+xml;base64,AAAA', 'javascript:alert(1)', 'data:image/png;base64,AA"onerror="x', null]) assert.equal(isPrintableDataUrl(bad), false);
});

test('print: images are prepared via signed cache; failures are skipped; secretary gets none', async () => {
  const cache = { open: async (path, load) => load('https://signed/' + path) };
  const fetchImpl = async () => ({ ok: true, blob: async () => ({ size: 5 }) });
  const asDataUrl = async () => PNG;
  assert.deepEqual(await prepareDrawingImages({ exam, role: 'doctor', cache, fetchImpl, asDataUrl }), { aaaa1111: PNG });
  assert.deepEqual(await prepareDrawingImages({ exam, role: 'secretary', cache, fetchImpl, asDataUrl }), {});
  assert.deepEqual(await prepareDrawingImages({ exam, role: 'doctor', cache: null }), {});
  const failing = { open: async () => { throw new Error('gone'); } };
  assert.deepEqual(await prepareDrawingImages({ exam, role: 'doctor', cache: failing, fetchImpl, asDataUrl }), {});
  const bad = await prepareDrawingImages({ exam, role: 'doctor', cache, fetchImpl, asDataUrl: async () => 'data:text/html;base64,AAAA' });
  assert.deepEqual(bad, {});
});

test('print: report shows the section only when images were prepared; pages without them are unchanged', () => {
  const p = { id: 12, name: 'Test' };
  const without = getPatientFileHTML(p, [], [exam], [], null, null);
  const withImgs = getPatientFileHTML(p, [], [exam], [], null, null, { aaaa1111: PNG });
  assert.ok(!without.includes('<img src="data:'));
  assert.ok(withImgs.includes(`<img src="${PNG}"`));
  assert.equal((withImgs.match(/<img src="data:/g) || []).length, 1);
  const hostile = getPatientFileHTML(p, [], [exam], [], null, null, { aaaa1111: 'data:image/png;base64,AA"><script>x</script>' });
  assert.ok(!hostile.includes('<script>x'));
});

test('print: lastExamOf skips investigation requests and picks the newest', () => {
  const list = [{ id: 'a', patientId: 1, date: '2026-01-01' }, { id: 'b', patientId: 1, date: '2026-03-01' }, { id: 'c', patientId: 1, date: '2026-05-01', status: 'requested' }, { id: 'd', patientId: 2, date: '2026-09-01' }];
  assert.equal(lastExamOf(1, list).id, 'b');
  assert.equal(lastExamOf(9, list), undefined);
});
