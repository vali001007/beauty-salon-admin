import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { createReceiptUploadHeaders, writeReceiptArtifacts } from './ami-brain-check.mjs';
import manifest from './ami-brain-check-impact-map.json' with { type: 'json' };
import {
  checksum,
  createGateInputChecksum,
  createIdentity,
  createImpactPlan,
  createPrevalidatedGateResult,
  extractCapabilityKeys,
  isReusableGateResult,
  isReusableReceipt,
  matchesPattern,
  parseArgs,
  selectPlanFiles,
  validatePrevalidatedGateSelection,
  withResolvedCapabilities,
} from './ami-brain-check-core.mjs';

test('parses the four gate stages', () => {
  assert.equal(parseArgs(['--stage=candidate', '--dry-run']).stage, 'candidate');
  assert.throws(() => parseArgs(['--stage=unknown']), /invalid_stage/);
});

test('parses candidate identity, receipt output, upload and reusable gate inputs', () => {
  const options = parseArgs([
    '--stage=candidate',
    '--repository=owner/repo',
    '--branch=feature/governance',
    '--workflow=CI/CD',
    '--event-name=pull_request',
    '--base-commit=base-sha',
    '--head-commit=head-sha',
    '--merge-base=merge-sha',
    '--candidate-key=candidate-1',
    '--eval-run-id=501',
    '--evaluation-release-id=21',
    '--receipt-output=tmp/receipt.json',
    '--consume-gate-receipt=tmp/build.json',
    '--consume-gate-receipt=tmp/test.json',
    '--prevalidated-gate=frontend_typecheck',
    '--prevalidated-gate=backend_build',
    '--upload-receipt',
  ]);
  assert.equal(options.repository, 'owner/repo');
  assert.equal(options.branch, 'feature/governance');
  assert.equal(options.workflow, 'CI/CD');
  assert.equal(options.eventName, 'pull_request');
  assert.equal(options.baseCommit, 'base-sha');
  assert.equal(options.headCommit, 'head-sha');
  assert.equal(options.mergeBaseCommit, 'merge-sha');
  assert.equal(options.candidateKey, 'candidate-1');
  assert.equal(options.evalRunId, 501);
  assert.equal(options.evaluationReleaseId, 21);
  assert.equal(options.receiptOutput, 'tmp/receipt.json');
  assert.deepEqual(options.consumeGateReceipts, ['tmp/build.json', 'tmp/test.json']);
  assert.deepEqual(options.prevalidatedGates, ['frontend_typecheck', 'backend_build']);
  assert.equal(options.uploadReceipt, true);
  assert.throws(() => parseArgs(['--eval-run-id=0']), /invalid_evalRunId/);
  assert.throws(() => parseArgs(['--evaluation-release-id=invalid']), /invalid_evaluationReleaseId/);
});

test('matches recursive impact patterns', () => {
  assert.equal(matchesPattern('packages/server-v2/src/brain/a/b.ts', 'packages/server-v2/src/brain/**'), true);
  assert.equal(matchesPattern('src/types/brain.ts', 'src/types/brain.ts'), true);
});

test('dev scope narrows noisy worktrees while candidate and release keep the complete diff', () => {
  const detectedFiles = [
    'packages/server-v2/src/brain/brain.controller.ts',
    'docs/historical-report.md',
  ];
  const scope = ['src/app/pages/brain/BrainGovernanceCenter.tsx'];
  assert.deepEqual(selectPlanFiles({ stage: 'dev', detectedFiles, scope }), scope);
  assert.deepEqual(selectPlanFiles({ stage: 'candidate', detectedFiles, scope }), [
    'docs/historical-report.md',
    'packages/server-v2/src/brain/brain.controller.ts',
    'src/app/pages/brain/BrainGovernanceCenter.tsx',
  ]);
  assert.deepEqual(selectPlanFiles({ stage: 'release', detectedFiles, scope }), [
    'docs/historical-report.md',
    'packages/server-v2/src/brain/brain.controller.ts',
    'src/app/pages/brain/BrainGovernanceCenter.tsx',
  ]);
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

test('binds each gate to only the files that triggered it', () => {
  const plan = createImpactPlan({
    files: ['src/config/permissions.ts', 'src/app/pages/brain/BrainGovernanceCenter.tsx'],
    stage: 'candidate',
    manifest,
  });
  const permissionGate = plan.gates.find((gate) => gate.id === 'permission_unit');
  const componentGate = plan.gates.find((gate) => gate.id === 'frontend_brain_unit');
  assert.deepEqual(permissionGate.files, ['src/config/permissions.ts']);
  assert.deepEqual(componentGate.files, ['src/app/pages/brain/BrainGovernanceCenter.tsx']);
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
    schemaVersion: 3,
    ...identity,
    status: 'passed',
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
  };
  assert.equal(isReusableReceipt(receipt, identity), true);
  assert.equal(isReusableReceipt({ ...receipt, status: 'failed' }, identity), false);
  assert.equal(isReusableReceipt({ ...receipt, schemaVersion: 2 }, identity), false);
  assert.equal(isReusableReceipt({ ...receipt, identityChecksum: checksum('changed') }, identity), false);
});

test('candidate identity includes repository and commit boundaries', () => {
  const plan = createImpactPlan({ files: ['src/types/brain.ts'], stage: 'candidate', manifest });
  const identity = createIdentity({
    plan,
    source: {
      diffChecksum: checksum('diff'),
      sourceFingerprint: checksum('source'),
      repository: 'owner/repo',
      branch: 'feature/governance',
      workflow: 'CI/CD',
      eventName: 'pull_request',
      baseCommit: 'base',
      mergeBaseCommit: 'merge',
      headCommit: 'head',
      candidateKey: 'candidate-1',
      evalRunId: 501,
      evaluationReleaseId: 21,
    },
    environment: { provider: 'openai', model: 'gpt-test' },
  });
  assert.equal(identity.repository, 'owner/repo');
  assert.equal(identity.branch, 'feature/governance');
  assert.equal(identity.workflow, 'CI/CD');
  assert.equal(identity.baseCommit, 'base');
  assert.equal(identity.mergeBaseCommit, 'merge');
  assert.equal(identity.headCommit, 'head');
  assert.equal(identity.candidateKey, 'candidate-1');
  assert.equal(identity.evalRunId, 501);
  assert.equal(identity.evaluationReleaseId, 21);
});

test('extracts real capability keys without crossing decorator boundaries', () => {
  const source = `
    @BrainCapability({ mode: 'readonly' })
    first() {}

    @BrainCapability({
      key: 'appointment_gap_list',
      metadata: { key: 'nested_key' },
    })
    second() {}

    @BrainCapability({
      // braces inside strings and comments must not terminate the object
      description: 'value with } brace',
      key: "customer_facts",
    })
    third() {}
  `;
  assert.deepEqual(extractCapabilityKeys(source), ['appointment_gap_list', 'customer_facts']);
  const plan = withResolvedCapabilities(
    createImpactPlan({ files: ['packages/server-v2/src/brain/brain.controller.ts'], stage: 'candidate', manifest }),
    extractCapabilityKeys(source),
  );
  assert.deepEqual(plan.capabilities, ['appointment_gap_list', 'customer_facts']);
});

test('sub-gate reuse is exact and invalidates on source, model or command changes', () => {
  const plan = createImpactPlan({ files: ['src/types/brain.ts'], stage: 'candidate', manifest });
  const gate = plan.gates.find((item) => item.id === 'frontend_typecheck');
  const source = {
    diffChecksum: checksum('diff'),
    sourceFingerprint: checksum('source'),
    baseCommit: 'base',
    mergeBaseCommit: 'merge',
    headCommit: 'head',
    fileFingerprints: { 'src/types/brain.ts': checksum('file-v1') },
  };
  const identity = createIdentity({ plan, source, environment: { provider: 'openai', model: 'model-v1' } });
  const inputChecksum = createGateInputChecksum({ gate, identity, fileFingerprints: source.fileFingerprints });
  const result = { status: 'passed', inputChecksum };
  const expiresAt = new Date(Date.now() + 60_000).toISOString();
  assert.equal(isReusableGateResult(result, inputChecksum, expiresAt), true);

  const sourceChanged = createGateInputChecksum({
    gate,
    identity,
    fileFingerprints: { 'src/types/brain.ts': checksum('file-v2') },
  });
  assert.equal(isReusableGateResult(result, sourceChanged, expiresAt), false);

  const modelChangedIdentity = createIdentity({ plan, source, environment: { provider: 'openai', model: 'model-v2' } });
  const modelChanged = createGateInputChecksum({ gate, identity: modelChangedIdentity, fileFingerprints: source.fileFingerprints });
  assert.equal(isReusableGateResult(result, modelChanged, expiresAt), false);

  const commandChanged = createGateInputChecksum({
    gate: { ...gate, command: [...gate.command, '--changed-suite'] },
    identity,
    fileFingerprints: source.fileFingerprints,
  });
  assert.equal(isReusableGateResult(result, commandChanged, expiresAt), false);

  const evalChangedIdentity = createIdentity({
    plan,
    source: { ...source, evalRunId: 502, evaluationReleaseId: 22 },
    environment: { provider: 'openai', model: 'model-v1' },
  });
  const evalChanged = createGateInputChecksum({
    gate,
    identity: evalChangedIdentity,
    fileFingerprints: source.fileFingerprints,
  });
  assert.equal(isReusableGateResult(result, evalChanged, expiresAt), false);
});

test('whole receipt reuse is materialized to the requested pipeline artifact path', () => {
  const root = mkdtempSync(join(tmpdir(), 'ami-brain-receipt-'));
  const receiptPath = join(root, 'artifacts', 'candidate.json');
  const summaryRoot = join(root, 'summary');
  const receipt = {
    receiptId: 'candidate-reused-1',
    stage: 'candidate',
    riskLevel: 'high',
    status: 'passed',
    createdAt: '2026-08-02T00:00:00.000Z',
    expiresAt: '2026-08-03T00:00:00.000Z',
    plan: {
      files: ['packages/server-v2/src/brain/brain.controller.ts'],
      gates: [{ id: 'backend_build' }],
    },
    results: [{ gateId: 'backend_build', status: 'passed', reused: true }],
  };

  writeReceiptArtifacts(receipt, receiptPath, summaryRoot);

  assert.deepEqual(JSON.parse(readFileSync(receiptPath, 'utf8')), receipt);
  const summary = readFileSync(join(summaryRoot, 'latest-summary.md'), 'utf8');
  assert.match(summary, /candidate-reused-1/);
  assert.match(summary, /backend_build/);
});

test('trusted pipeline coverage materializes a checksum-bound passing gate result', () => {
  const gate = {
    id: 'backend_build',
    description: '统一后端构建',
    command: ['npm', 'run', 'build'],
  };
  const inputChecksum = checksum('backend-build-input');
  const result = createPrevalidatedGateResult({
    gate,
    inputChecksum,
    pipelineEvidence: 'frontend=success,backend=success,terminal=success',
    now: new Date('2026-08-02T10:00:00.000Z'),
  });

  assert.equal(result.status, 'passed');
  assert.equal(result.inputChecksum, inputChecksum);
  assert.equal(result.reusedFromPipeline, true);
  assert.match(result.resultChecksum, /^[a-f0-9]{64}$/);
  assert.throws(() => createPrevalidatedGateResult({
    gate: { ...gate, id: 'release_acceptance' },
    inputChecksum,
    pipelineEvidence: 'untrusted',
  }), /prevalidated_gate_not_allowed/);
});

test('prevalidated gates require the trusted candidate pipeline and a strict allowlist', () => {
  const trusted = validatePrevalidatedGateSelection({
    stage: 'candidate',
    gateIds: ['frontend_typecheck', 'backend_build'],
    githubActions: 'true',
    allowed: 'true',
  });
  assert.deepEqual(trusted, []);

  assert.deepEqual(validatePrevalidatedGateSelection({
    stage: 'dev',
    gateIds: ['frontend_typecheck'],
    githubActions: 'true',
    allowed: 'true',
  }), ['prevalidated_gates_require_trusted_candidate_pipeline']);

  assert.deepEqual(validatePrevalidatedGateSelection({
    stage: 'candidate',
    gateIds: ['frontend_typecheck'],
    githubActions: 'false',
    allowed: 'true',
  }), ['prevalidated_gates_require_trusted_candidate_pipeline']);

  assert.deepEqual(validatePrevalidatedGateSelection({
    stage: 'candidate',
    gateIds: ['frontend_typecheck'],
    githubActions: 'true',
    allowed: 'false',
  }), ['prevalidated_gates_require_trusted_candidate_pipeline']);

  assert.deepEqual(validatePrevalidatedGateSelection({
    stage: 'candidate',
    gateIds: ['release_acceptance'],
    githubActions: 'true',
    allowed: 'true',
  }), ['prevalidated_gate_not_allowed:release_acceptance']);
});

test('receipt upload prefers GitHub OIDC and keeps HMAC as an explicit fallback', async () => {
  const calls = [];
  const oidcHeaders = await createReceiptUploadHeaders({ receiptId: 'receipt-1' }, {
    environment: {
      ACTIONS_ID_TOKEN_REQUEST_URL: 'https://actions.example.test/token?api-version=2.0',
      ACTIONS_ID_TOKEN_REQUEST_TOKEN: 'actions-runtime-token',
      BRAIN_GOVERNANCE_RECEIPT_OIDC_AUDIENCE: 'https://api.example.test/receipt',
    },
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      return { ok: true, json: async () => ({ value: 'github-oidc-token' }) };
    },
  });
  assert.deepEqual(oidcHeaders, { authorization: 'Bearer github-oidc-token' });
  assert.equal(calls.length, 1);
  assert.match(calls[0].url, /audience=https%3A%2F%2Fapi\.example\.test%2Freceipt/);
  assert.equal(calls[0].options.headers.authorization, 'Bearer actions-runtime-token');

  await assert.rejects(() => createReceiptUploadHeaders({ receiptId: 'receipt-1' }, {
    environment: {},
  }), /receipt_upload_oidc_identity_required/);

  const fallbackHeaders = await createReceiptUploadHeaders({ receiptId: 'receipt-1' }, {
    environment: {
      BRAIN_GOVERNANCE_RECEIPT_ALLOW_HMAC_FALLBACK: 'true',
      BRAIN_GOVERNANCE_RECEIPT_INGEST_SECRET: 'temporary-secret',
      BRAIN_GOVERNANCE_RECEIPT_ISSUER: 'local-ci',
    },
    now: () => new Date('2026-08-02T10:00:00.000Z'),
  });
  assert.equal(fallbackHeaders['x-brain-receipt-timestamp'], '2026-08-02T10:00:00.000Z');
  assert.equal(fallbackHeaders['x-brain-receipt-issuer'], 'local-ci');
  assert.match(fallbackHeaders['x-brain-receipt-signature'], /^[a-f0-9]{64}$/);
});

test('candidate workflow waits for every same-workflow prerequisite before producing trusted evidence', () => {
  const workflow = readFileSync(new URL('../../../.github/workflows/ci.yml', import.meta.url), 'utf8');
  assert.match(
    workflow,
    /brain-candidate:\s+needs: \[frontend, backend, terminal-prototype, ami-semantic-agent\]/,
  );
  assert.match(
    workflow,
    /BRAIN_CHECK_PIPELINE_EVIDENCE:.*ami-semantic-agent=\$\{\{ needs\.ami-semantic-agent\.result \}\}/,
  );
  assert.match(workflow, /NODE_OPTIONS: "--max-old-space-size=6144"/);
  assert.match(workflow, /npm run test -- --runInBand/);
});
