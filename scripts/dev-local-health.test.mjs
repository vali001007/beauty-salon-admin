import assert from 'node:assert/strict';
import test from 'node:test';
import {
  describeApiHealthFailure,
  isHealthyHttpStatus,
  shouldRecycleManagedApi,
} from './dev-local-health.mjs';

test('only 2xx responses are healthy', () => {
  assert.equal(isHealthyHttpStatus(200), true);
  assert.equal(isHealthyHttpStatus(204), true);
  assert.equal(isHealthyHttpStatus(302), false);
  assert.equal(isHealthyHttpStatus(503), false);
});

test('reports reachable readiness failures as HTTP status', () => {
  assert.equal(describeApiHealthFailure({ reachable: true, status: 503 }), 'HTTP 503');
  assert.equal(
    // ami-brain-unit-only: local process-health formatting fixture, not a Brain user question.
    describeApiHealthFailure({ reachable: false, error: { code: 'ECONNREFUSED', message: 'connect failed' } }),
    'ECONNREFUSED connect failed',
  );
});

test('recycles only a managed running API after the failure threshold', () => {
  assert.equal(
    shouldRecycleManagedApi({
      managed: true,
      running: true,
      consecutiveFailures: 3,
      restartAfterFailures: 3,
    }),
    true,
  );
  assert.equal(
    shouldRecycleManagedApi({
      managed: false,
      running: true,
      consecutiveFailures: 3,
      restartAfterFailures: 3,
    }),
    false,
  );
  assert.equal(
    shouldRecycleManagedApi({
      managed: true,
      running: true,
      consecutiveFailures: 2,
      restartAfterFailures: 3,
    }),
    false,
  );
});
