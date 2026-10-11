import test from 'node:test';
import assert from 'node:assert/strict';
import { buildStudyPrintHTML, safeUrl } from '../src/modules/print/study-print.js';

const EVIL = '<img src=x onerror=alert(1)>';
const view = { patient: EVIL, patientCode: '"><script>1</script>', date: '2026-10-01', report: '<script>alert(2)</script>', notes: EVIL,
  files: [{ src: 'https://res.cloudinary.com/x/a.jpg', resource_type: 'image' }, { src: 'javascript:alert(3)', resource_type: 'image' },
    { src: 'https://x/y.pdf', resource_type: 'raw', name: EVIL }, { src: 'https://x/"onload="alert(4)', resource_type: 'image' }] };

test('study print escapes every stored value and drops unsafe urls', () => {
  const html = buildStudyPrintHTML(view, { typeName: '<b>OCT</b>', openFile: 'Open', reportHeading: 'Report' }, 'ltr');
  assert.ok(!/<script>/i.test(html), 'no raw <script>');
  assert.ok(!html.includes('<img src=x'), 'no injected img');
  assert.ok(!/javascript:/i.test(html), 'javascript: url dropped');
  assert.ok(!/<b>OCT/.test(html), 'type name escaped');
  assert.ok(html.includes('&lt;img src=x onerror=alert(1)&gt;'));
  assert.ok(!/ onload=/.test(html), 'attribute breakout is escaped');
  assert.equal((html.match(/<img /g) || []).length, 2, 'only the two http(s) images are rendered');
});
test('safeUrl allows http(s)/blob/data-image only', () => {
  assert.equal(safeUrl('https://a/b'), 'https://a/b');
  assert.equal(safeUrl('javascript:alert(1)'), '');
  assert.equal(safeUrl('data:text/html;base64,AAAA'), '');
  assert.equal(safeUrl('data:image/png;base64,AAAA'), 'data:image/png;base64,AAAA');
  assert.equal(safeUrl(null), '');
});
test('study print keeps normal Arabic text intact', () => {
  const html = buildStudyPrintHTML({ patient: 'أحمد محمد', report: 'تقرير سليم', files: [] }, { typeName: 'تصوير' }, 'rtl');
  assert.ok(html.includes('أحمد محمد') && html.includes('تقرير سليم') && html.includes('dir="rtl"'));
});
