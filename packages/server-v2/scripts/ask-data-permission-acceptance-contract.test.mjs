import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ASK_DATA_PERMISSION_ACCEPTANCE_ROLES,
  sameStringSet,
  sortedUnique,
} from './ask-data-permission-acceptance-contract.mjs';

test('defines seven unique real-login acceptance roles', () => {
  assert.equal(ASK_DATA_PERMISSION_ACCEPTANCE_ROLES.length, 7);
  assert.equal(new Set(ASK_DATA_PERMISSION_ACCEPTANCE_ROLES.map((item) => item.key)).size, 7);
  assert.equal(new Set(ASK_DATA_PERMISSION_ACCEPTANCE_ROLES.map((item) => item.roleKey)).size, 7);
  assert.equal(new Set(ASK_DATA_PERMISSION_ACCEPTANCE_ROLES.map((item) => item.username)).size, 7);
});

test('keeps every non-admin role on the dashboard permission boundary', () => {
  for (const role of ASK_DATA_PERMISSION_ACCEPTANCE_ROLES.filter((item) => item.key !== 'admin')) {
    assert.ok(role.permissions.includes('core:dashboard:view'), role.key);
    assert.ok(!role.permissions.includes('*'), role.key);
    assert.equal(role.debugSqlVisible, false);
  }
});

test('keeps catalog contracts deterministic', () => {
  for (const role of ASK_DATA_PERMISSION_ACCEPTANCE_ROLES) {
    assert.equal(sortedUnique(role.permissions).length, role.permissions.length, role.key);
    if (Array.isArray(role.expectedViews)) {
      assert.equal(sortedUnique(role.expectedViews).length, role.expectedViews.length, role.key);
    }
  }
  assert.equal(sameStringSet(['b', 'a'], ['a', 'b']), true);
  assert.equal(sameStringSet(['a'], ['b']), false);
});

test('includes item-margin in the current 37-view permission contract', () => {
  const admin = ASK_DATA_PERMISSION_ACCEPTANCE_ROLES.find((item) => item.key === 'admin');
  const finance = ASK_DATA_PERMISSION_ACCEPTANCE_ROLES.find((item) => item.key === 'finance');

  assert.equal(admin.expectedViews, '*');
  assert.equal(admin.expectedViewCount, 37);
  assert.ok(finance.expectedViews.includes('ask_data_item_margin_view'));
  assert.equal(finance.expectedViews.length, 9);
});
