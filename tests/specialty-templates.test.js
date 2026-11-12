import test from 'node:test';
import assert from 'node:assert/strict';
import { CASES, CASE_IDS, blankCase, normalizeCase, caseIsEmpty, fieldLabel, caseLabel } from '../src/modules/special-exam/model.js';
import { suggest } from '../src/modules/special-exam/ddx.js';

const NEW = ['amd', 'rvo', 'rd', 'cornea', 'cataract', 'paeds'];

test('specialty templates exist, are per-eye, and do not repeat Package A measurements', () => {
  for (const id of NEW) {
    assert.ok(CASE_IDS.includes(id), id);
    const c = CASES.find(x => x.id === id);
    assert.ok(c.fields.some(f => f.eyes), id + ' has per-eye fields');
    for (const f of c.fields) assert.ok(!['va', 'iop', 'cmt', 'refraction', 'bcva'].includes(f.k), id + '.' + f.k);
  }
});

test('OD and OS values stay independent and unknown input is dropped', () => {
  const v = normalizeCase('amd', { stage: { od: 'Early', os: 'Neovascular' }, bogus: 'x' });
  assert.equal(v.stage.od, 'Early'); assert.equal(v.stage.os, 'Neovascular'); assert.equal('bogus' in v, false);
  assert.equal(caseIsEmpty('rd', blankCase('rd')), true);
});

test('labels exist in both languages and templates give no automatic diagnosis', () => {
  for (const id of NEW) {
    for (const lang of ['ar', 'en']) {
      assert.ok(caseLabel(id, lang) && !caseLabel(id, lang).startsWith('g11.'), id + lang);
      for (const f of CASES.find(x => x.id === id).fields) assert.ok(!fieldLabel(id, f.k, lang).startsWith('g11.'), id + f.k + lang);
    }
    const filled = normalizeCase(id, { [CASES.find(x => x.id === id).fields[0].k]: { od: 'Early', os: 'Early' } });
    assert.deepEqual(suggest(id, filled), { ddx: [], workup: [] });
  }
});
