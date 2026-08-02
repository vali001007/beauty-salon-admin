import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const DEFAULT_REPO_ROOT = resolve(dirname(SCRIPT_PATH), '..');

export const AMI_BRAIN_CROSS_CLIENT_TEST_FILES = Object.freeze([
  'src/app/pages/brain/components/BrainResponseRenderer.test.tsx',
  'src/app/pages/brain/BrainWorkspace.test.tsx',
  'packages/app/src/api/brain-response-presentation.test.ts',
  'packages/app/src/api/brain-action-decision.test.ts',
  'packages/app/src/app/components/ChatMessage.test.tsx',
  'packages/Ami-Aura-Lite-Kiosk/src/app/components/AgentMessageItem.test.tsx',
  'packages/Ami-Aura-Lite-Kiosk/src/app/services/agentRuntimeService.brain.test.ts',
  'packages/agent-core/logic/answerContract.test.ts',
  'packages/agent-core/logic/blockUtils.test.ts',
]);

export const AMI_BRAIN_CROSS_CLIENT_STEPS = Object.freeze([
  Object.freeze({
    key: 'cross_client_vitest',
    kind: 'test',
    command: 'npm',
    args: Object.freeze(['run', 'test', '--', ...AMI_BRAIN_CROSS_CLIENT_TEST_FILES]),
  }),
  Object.freeze({
    key: 'management_typecheck',
    kind: 'typecheck',
    command: 'npm',
    args: Object.freeze(['run', 'typecheck:app']),
  }),
  Object.freeze({
    key: 'mobile_typecheck',
    kind: 'typecheck',
    command: 'npm',
    args: Object.freeze(['exec', '--', 'tsc', '--noEmit', '-p', 'packages/app/tsconfig.json']),
  }),
  Object.freeze({
    key: 'kiosk_typecheck',
    kind: 'typecheck',
    command: 'npm',
    args: Object.freeze(['--prefix', 'packages/Ami-Aura-Lite-Kiosk', 'run', 'typecheck']),
  }),
]);

const CONTRACT_IDENTITY = Object.freeze({
  schemaVersion: 'ami-brain-cross-client-contract/v1',
  runnerVersion: '2026-07-30-v1',
  testFiles: AMI_BRAIN_CROSS_CLIENT_TEST_FILES,
  steps: AMI_BRAIN_CROSS_CLIENT_STEPS.map(({ key, kind, command, args }) => ({
    key,
    kind,
    command,
    args,
  })),
});

export const AMI_BRAIN_CROSS_CLIENT_IDENTITY_CHECKSUM = sha256(JSON.stringify(CONTRACT_IDENTITY));

export function runAmiBrainCrossClientContract({
  repoRoot = DEFAULT_REPO_ROOT,
  now = new Date(),
  spawn = spawnSync,
} = {}) {
  const candidate = inspectCandidate(repoRoot, spawn);
  const steps = AMI_BRAIN_CROSS_CLIENT_STEPS.map((definition) => runStep(definition, repoRoot, spawn));
  const failedStepKeys = steps.filter((step) => !step.passed).map((step) => step.key);
  const passed = failedStepKeys.length === 0;
  return {
    schemaVersion: CONTRACT_IDENTITY.schemaVersion,
    checked: true,
    passed,
    runnerVersion: CONTRACT_IDENTITY.runnerVersion,
    identityChecksum: AMI_BRAIN_CROSS_CLIENT_IDENTITY_CHECKSUM,
    testFilesChecksum: sha256(AMI_BRAIN_CROSS_CLIENT_TEST_FILES.join('\n')),
    testFileCount: AMI_BRAIN_CROSS_CLIENT_TEST_FILES.length,
    candidate,
    summary: {
      stepCount: steps.length,
      passedStepCount: steps.length - failedStepKeys.length,
      failedStepCount: failedStepKeys.length,
      failedStepKeys,
    },
    steps,
    blockingReasons: failedStepKeys.map((key) => `cross_client_contract_step_failed:${key}`),
    checkedAt: now.toISOString(),
  };
}

function inspectCandidate(repoRoot, spawn) {
  const result = spawn('git', ['rev-parse', 'HEAD'], commandOptions(repoRoot));
  const headCommit = result.status === 0 ? normalizeText(result.stdout)?.toLowerCase() ?? null : null;
  return {
    headCommit,
    inspectionPassed: /^[0-9a-f]{40}$/u.test(headCommit ?? ''),
    error: result.status === 0 ? null : failureOutput(result),
  };
}

function runStep(definition, repoRoot, spawn) {
  const startedAt = Date.now();
  const result = spawn(definition.command, [...definition.args], commandOptions(repoRoot));
  const passed = result.status === 0 && !result.error;
  return {
    key: definition.key,
    kind: definition.kind,
    command: definition.command,
    args: [...definition.args],
    passed,
    exitCode: Number.isInteger(result.status) ? result.status : null,
    signal: normalizeText(result.signal),
    durationMs: Math.max(0, Date.now() - startedAt),
    error: passed ? null : failureOutput(result),
  };
}

function commandOptions(repoRoot) {
  return {
    cwd: repoRoot,
    encoding: 'utf8',
    env: { ...process.env, CI: process.env.CI || '1' },
    stdio: ['ignore', 'pipe', 'pipe'],
    maxBuffer: 24 * 1024 * 1024,
  };
}

function failureOutput(result) {
  const error = result.error instanceof Error ? result.error.message : null;
  const output = [error, normalizeText(result.stdout), normalizeText(result.stderr)].filter(Boolean).join('\n');
  return output ? output.slice(-6000) : 'command_failed_without_output';
}

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() || null : null;
}

function sha256(value) {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

if (process.argv[1] && resolve(process.argv[1]) === SCRIPT_PATH) {
  const result = runAmiBrainCrossClientContract();
  console.log(JSON.stringify(result, null, 2));
  process.exitCode = result.passed ? 0 : 1;
}
