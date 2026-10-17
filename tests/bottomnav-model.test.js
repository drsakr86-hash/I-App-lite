import test from 'node:test';
import assert from 'node:assert/strict';
import { NAV, navItemsForRole } from '../src/components/bottomnav-model.js';

test('NAV: has the 7 expected tabs in order, with "accounting" marked admin-only and the rest not', () => {
  assert.deepEqual(NAV.map(i => i.id), [
    'dashboard', 'patients', 'waiting', 'appointments', 'radiology', 'imaging', 'accounting'
  ]);
  assert.equal(NAV.find(i => i.id === 'accounting').adminOnly, true);
  for (const item of NAV) {
    if (item.id !== 'accounting') assert.ok(!item.adminOnly, `${item.id} should not be adminOnly`);
  }
});

test('navItemsForRole: admin sees all 7 tabs including accounting', () => {
  const items = navItemsForRole('admin');
  assert.equal(items.length, 7);
  assert.ok(items.some(i => i.id === 'accounting'));
});

test('navItemsForRole: a non-admin role (doctor/secretary/employee) does not see accounting', () => {
  for (const role of ['doctor', 'secretary', 'employee', '']) {
    const items = navItemsForRole(role);
    assert.equal(items.length, 6);
    assert.ok(!items.some(i => i.id === 'accounting'), `role "${role}" should not see accounting`);
  }
});

test('More menu: bar keeps the 5 main tabs, investigation orders + imaging move into More', async () => {
  const { primaryNavItems, moreNavItems, isMoreActive } = await import('../src/components/bottomnav-model.js');
  assert.deepEqual(primaryNavItems('admin').map(i => i.id), ['dashboard', 'patients', 'waiting', 'appointments', 'accounting']);
  assert.deepEqual(moreNavItems('admin').map(i => i.id), ['radiology', 'imaging']);
  assert.deepEqual(primaryNavItems('secretary').map(i => i.id), ['dashboard', 'patients', 'waiting', 'appointments']);
  assert.ok(isMoreActive('radiology', 'admin') && isMoreActive('imaging', 'admin') && isMoreActive('settings', 'admin'));
  assert.ok(!isMoreActive('patients', 'admin'));
});
