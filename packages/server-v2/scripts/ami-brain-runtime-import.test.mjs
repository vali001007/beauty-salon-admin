import assert from 'node:assert/strict';
import test from 'node:test';

test('compiled Brain governance modules load under the production Node ESM runtime', async () => {
  const module = await import('../dist/brain/governance/brain-gate-receipt-verification.service.js');

  assert.equal(typeof module.BrainGateReceiptVerificationService, 'function');
  assert.equal(typeof module.verifyGithubOidcClaims, 'function');
});
