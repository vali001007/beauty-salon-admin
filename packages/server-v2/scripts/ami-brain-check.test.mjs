import assert from 'node:assert/strict';
import test from 'node:test';
import manifest from './ami-brain-check-impact-map.json' with { type: 'json' };
import {
  checksum,
  createIdentity,
  createImpactPlan,
  isReusableReceipt,
  matchesPattern,
  parseArgs,
} from './ami-brain-check-core.mjs';

test('parses the four gate stages', () => {
  assert.equal(parseArgs(['--stage=candidate', '--dry-run']).stage, 'candidate');
  assert.throws(() => parseArgs(['--stage=unknown']), /invalid_stage/);
});

test('matches recursive impact patterns', () => {
  assert.equal(matchesPattern('packages/server-v2/src/brain/a/b.ts', 'packages/server-v2/src/brain/**'), true);
  assert.equal(matchesPattern('src/types/brain.ts', 'src/types/brain.ts'), true);
});

test('deduplicates gates and escalates permission changes', () => {
  const plan = createImpactPlan({
    files: ['src/config/permissions.ts', 'packages/server-v2/src/brain/brain.controller.ts'],
    stage: 'candidate',
    manifest,
  });
  assert.equal(plan.riskLevel, 'critical');
  assert.equal(plan.gates.filter((gate) => gate.id === 'backend_build').length, 1);
  assert.ok(plan.gates.some((gate) => gate.id === 'permission_unit'));
});

test('ignores unrelated documents but escalates unknown sensitive files', () => {
  const plan = createImpactPlan({
    files: ['docs/notes.md', 'packages/server-v2/src/brain/new-unknown.file'],
    stage: 'dev',
    manifest: { ...manifest, rules: [] },
  });
  assert.deepEqual(plan.ignoredFiles, ['docs/notes.md']);
  assert.deepEqual(plan.unknownSensitiveFiles, ['packages/server-v2/src/brain/new-unknown.file']);
  assert.equal(plan.riskLevel, 'high');
});

test('reuses only passing non-expired receipts with exact identity', () => {
  const plan = createImpactPlan({ files: ['src/types/brain.ts'], stage: 'dev', manifest });
  const identity = createIdentity({
    plan,
    source: { diffChecksum: checksum('diff'), sourceFingerprint: checksum('source') },
    environment: {},
  });
  const receipt = {
    ...identity,
    status: 'passed',
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
  };
  assert.equal(isReusableReceipt(receipt, identity), true);
  assert.equal(isReusableReceipt({ ...receipt, status: 'failed' }, identity), false);
  assert.equal(isReusableReceipt({ ...receipt, identityChecksum: checksum('changed') }, identity), false);
});
