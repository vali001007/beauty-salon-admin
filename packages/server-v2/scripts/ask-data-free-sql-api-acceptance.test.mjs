import assert from 'node:assert/strict';
import test from 'node:test';
import {
  canViewDebugSqlPermission,
  csvValues,
  hasDebugSql,
  normalizeApiBase,
  pickDeniedStoreId,
} from './ask-data-free-sql-api-acceptance.mjs';

test('normalizes configurable ordinary-user permission lists', () => {
  assert.deepEqual(csvValues('core:dashboard:view, core:store:reservations,core:store:reservations'), [
    'core:dashboard:view',
    'core:store:reservations',
  ]);
});

test('normalizes an API origin without duplicating the api prefix', () => {
  assert.equal(normalizeApiBase('http://localhost:8080'), 'http://localhost:8080/api');
  assert.equal(normalizeApiBase('http://localhost:8080/api/'), 'http://localhost:8080/api');
});

test('rejects non-http acceptance targets', () => {
  assert.throws(() => normalizeApiBase('file:///tmp/server'), /HTTP\(S\)/);
});

test('selects a store id outside the authenticated visible store set', () => {
  assert.equal(pickDeniedStoreId([1, 2, 4]), 3);
  assert.equal(pickDeniedStoreId([]), 1);
});

test('detects debug SQL in either supported response location', () => {
  assert.equal(hasDebugSql({ queryMeta: { generatedSql: 'SELECT 1' } }), true);
  assert.equal(hasDebugSql({ queryPlan: { generatedSql: 'SELECT 1' } }), true);
  assert.equal(hasDebugSql({ queryMeta: {}, queryPlan: {} }), false);
});

test('uses the same debug permission boundary as the runtime service', () => {
  assert.equal(canViewDebugSqlPermission(['core:system:logs']), true);
  assert.equal(canViewDebugSqlPermission(['core:agent-governance:view']), true);
  assert.equal(canViewDebugSqlPermission(['core:dashboard:view']), false);
});
