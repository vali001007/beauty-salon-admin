import assert from 'node:assert/strict';
import test from 'node:test';
import {
  AMI_BRAIN_CROSS_CLIENT_IDENTITY_CHECKSUM,
  AMI_BRAIN_CROSS_CLIENT_STEPS,
  AMI_BRAIN_CROSS_CLIENT_TEST_FILES,
  runAmiBrainCrossClientContract,
} from './check-ami-brain-cross-client-contract.mjs';

const COMMIT = 'a'.repeat(40);

test('builds passing evidence only after every governed cross-client step succeeds', () => {
  const result = runAmiBrainCrossClientContract({
    repoRoot: '/fixture/repo',
    now: new Date('2026-07-30T00:00:00.000Z'),
    spawn: fixtureSpawn(),
  });

  assert.equal(result.checked, true);
  assert.equal(result.passed, true);
  assert.equal(result.candidate.headCommit, COMMIT);
  assert.equal(result.testFileCount, 9);
  assert.equal(result.testFileCount, AMI_BRAIN_CROSS_CLIENT_TEST_FILES.length);
  assert.equal(result.summary.stepCount, AMI_BRAIN_CROSS_CLIENT_STEPS.length);
  assert.deepEqual(result.summary.failedStepKeys, []);
  assert.match(AMI_BRAIN_CROSS_CLIENT_IDENTITY_CHECKSUM, /^[0-9a-f]{64}$/u);
  assert.equal(result.checkedAt, '2026-07-30T00:00:00.000Z');
});

test('fails closed and identifies the exact step when a client typecheck fails', () => {
  const result = runAmiBrainCrossClientContract({
    repoRoot: '/fixture/repo',
    spawn: fixtureSpawn('mobile_typecheck'),
  });

  assert.equal(result.passed, false);
  assert.deepEqual(result.summary.failedStepKeys, ['mobile_typecheck']);
  assert.deepEqual(result.blockingReasons, ['cross_client_contract_step_failed:mobile_typecheck']);
  assert.equal(result.steps.find((step) => step.key === 'mobile_typecheck')?.exitCode, 2);
  assert.match(result.steps.find((step) => step.key === 'mobile_typecheck')?.error ?? '', /fixture failure/u);
});

function fixtureSpawn(failedStepKey = null) {
  return (command, args) => {
    if (command === 'git') return { status: 0, stdout: `${COMMIT}\n`, stderr: '', signal: null };
    const step = AMI_BRAIN_CROSS_CLIENT_STEPS.find(
      (item) => item.command === command && JSON.stringify(item.args) === JSON.stringify(args),
    );
    if (!step) return { status: 127, stdout: '', stderr: 'unknown fixture command', signal: null };
    if (step.key === failedStepKey) {
      return { status: 2, stdout: '', stderr: `${step.key} fixture failure`, signal: null };
    }
    return { status: 0, stdout: 'ok', stderr: '', signal: null };
  };
}
