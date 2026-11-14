// "Rx in a minute" reference guide: data integrity, search, access and navigation.
import test from 'node:test';
import assert from 'node:assert/strict';
import data from '../src/modules/rx-guide/data.js';
import { searchCards, chapterCounts, orderedSections, KIND_ORDER } from '../src/modules/rx-guide/model.js';
import { can } from '../src/app/permissions.js';
import { moreNavItems, rxGuideTabAllowed, RXGUIDE_NAV } from '../src/components/bottomnav-model.js';
import { AR, EN } from '../src/modules/i18n/index.js';

test('rx-guide data: 214 cards in 12 chapters, every card has a title and at least one section', () => {
  assert.equal(data.cards.length, 214);
  assert.deepEqual(data.chapters.map(c => c.n), [3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14]);
  assert.equal(new Set(data.cards.map(c => c.id)).size, 214);
  const chapters = new Set(data.chapters.map(c => c.n));
  for (const c of data.cards) {
    assert.ok(c.title && !c.title.includes('🚨'), c.num);
    assert.ok(chapters.has(c.chapter), c.num);
    assert.ok(c.sections.length > 0, c.num + ' has no sections');
    for (const s of c.sections) {
      assert.ok(KIND_ORDER.includes(s.kind));
      assert.ok(s.lines.length > 0, c.num + ' has an empty ' + s.kind + ' section');
    }
  }
  assert.equal(data.cards.filter(c => c.urgent).length, 68);
  assert.doesNotMatch(JSON.stringify(data), /Reem|Fawzy|ريم فوزي/);
  assert.match(data.credit, /Wills Eye/);
});

test('rx-guide data: spot checks keep the source text exactly (doses are never rewritten)', () => {
  const byTitle = t => data.cards.find(c => c.title === t);
  const hyphema = byTitle('Hyphema');
  assert.equal(hyphema.urgent, true);
  assert.ok(hyphema.sections.find(s => s.kind === 'rx').lines.includes('Pred Forte 1% ×4'));
  assert.ok(byTitle('Bacterial keratitis').sections.find(s => s.kind === 'avoid').lines.includes('patch على عين فيها infection'));
  const last = data.cards[data.cards.length - 1];
  assert.equal(last.title, 'Fluorescein / ICG angiography');
  assert.ok(!JSON.stringify(last).includes('بالتوفيق'));
});

test('rx-guide search: matches drug and diagnosis words, folds Arabic spelling, ranks title matches first', () => {
  const all = data.cards;
  const kerat = searchCards(all, { query: 'keratitis' });
  assert.ok(kerat.length >= 5);
  assert.match(kerat[0].title, /keratitis/i); // title match ahead of cards that only mention it
  assert.ok(searchCards(all, { query: 'CRVO' }).length > 0);
  assert.ok(searchCards(all, { query: 'pred forte' }).length > 5);
  // Arabic variants and Arabic-Indic digits
  assert.deepEqual(searchCards(all, { query: 'اغسلي فورا' }).map(c => c.id), searchCards(all, { query: 'اغسلي فوراً' }).map(c => c.id));
  assert.ok(searchCards(all, { query: 'Timolol ٠.٥' }).length > 0);
  assert.equal(searchCards(all, { query: 'zzzz-no-such-word' }).length, 0);
  assert.equal(searchCards(all, { query: '' }).length, 214);
});

test('rx-guide filters: chapter and urgent-only combine with the query', () => {
  const all = data.cards;
  const counts = chapterCounts(all);
  assert.equal(Object.values(counts).reduce((a, b) => a + b, 0), 214);
  assert.equal(searchCards(all, { chapter: 4 }).length, counts[4]);
  assert.ok(searchCards(all, { urgentOnly: true }).every(c => c.urgent));
  const both = searchCards(all, { chapter: 3, urgentOnly: true, query: 'globe' });
  assert.ok(both.length > 0 && both.every(c => c.chapter === 3 && c.urgent));
});

test('rx-guide card sections come out in the fixed reading order', () => {
  const card = data.cards.find(c => c.title === 'Corneal abrasion');
  const kinds = orderedSections(card).map(s => s.kind);
  assert.deepEqual(kinds, KIND_ORDER.filter(k => kinds.includes(k)));
  assert.deepEqual(orderedSections({ sections: [] }), []);
});

test('rx-guide access: doctor and admin only; secretary and employee never see the tab', () => {
  assert.ok(can('admin', 'rx_guide', 'read') && can('doctor', 'rx_guide', 'read'));
  assert.ok(!can('secretary', 'rx_guide', 'read') && !can('employee', 'rx_guide', 'read') && !can('', 'rx_guide', 'read'));
  for (const role of ['admin', 'doctor']) {
    assert.ok(rxGuideTabAllowed(role));
    assert.ok(moreNavItems(role).some(i => i.id === 'rxguide'));
  }
  for (const role of ['secretary', 'employee', '']) {
    assert.ok(!rxGuideTabAllowed(role));
    assert.ok(!moreNavItems(role).some(i => i.id === 'rxguide'));
  }
  assert.equal(RXGUIDE_NAV.inMore, true);
});

test('rx-guide labels exist in both languages for every chapter and section kind', () => {
  for (const ch of data.chapters) for (const d of [AR, EN]) assert.ok(d['rxg.ch.' + ch.n], 'chapter ' + ch.n);
  for (const k of KIND_ORDER) for (const d of [AR, EN]) assert.ok(d['rxg.kind.' + k], k);
});
