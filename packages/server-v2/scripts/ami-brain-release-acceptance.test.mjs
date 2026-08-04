import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import {
  buildAcceptanceEvidence,
  buildCoreBlockedEvidence,
  buildEvalArgs,
  buildReleaseAcceptancePreflight,
  resolveResumePlan,
  sha256,
  validateManifest,
  validateProductLoopEligibility,
} from './ami-brain-release-acceptance-core.mjs';
import { questionContractChecksum, resolveProductLoopEligibility } from './ami-brain-product-loop-registry.mjs';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(SCRIPT_DIR, '..', '..', '..');
const CROSS_CLIENT_IDENTITY_CHECKSUM = 'f'.repeat(64);
const ACTION_RELEASE_CONTRACT_IDENTITY_CHECKSUM = 'c'.repeat(64);

test('passes an EV candidate identity into both product evidence stages', () => {
  const args = buildEvalArgs({
    suiteManifest: '/repo/suite.json',
    releaseId: 453,
    evaluationReleaseId: 453,
    runtimeCommit: 'a'.repeat(40),
    productionHealthUrl: 'https://example.test/api/health/ready',
    storeId: 6,
    runKey: 'candidate-ev-001',
    concurrency: 2,
    checkpointEvery: 25,
    maxCasesPerInvocation: 100,
  }, 'release-core');

  assert.ok(args.includes('--expected-release-id=453'));
  assert.ok(args.includes('--evaluation-release-id=453'));
});

function passingCrossClientContract(commit, overrides = {}) {
  return {
    schemaVersion: 'ami-brain-cross-client-contract/v1',
    checked: true,
    passed: true,
    identityChecksum: CROSS_CLIENT_IDENTITY_CHECKSUM,
    testFilesChecksum: 'e'.repeat(64),
    testFileCount: 9,
    candidate: { headCommit: commit },
    summary: {
      stepCount: 4,
      passedStepCount: 4,
      failedStepCount: 0,
      failedStepKeys: [],
    },
    steps: [
      { key: 'cross_client_vitest', passed: true },
      { key: 'management_typecheck', passed: true },
      { key: 'mobile_typecheck', passed: true },
      { key: 'kiosk_typecheck', passed: true },
    ],
    blockingReasons: [],
    checkedAt: '2026-07-30T00:00:00.000Z',
    ...overrides,
  };
}

function passingActionReleaseContract(commit, releaseId = 416, overrides = {}) {
  const base = {
    schemaVersion: 'ami-brain-action-release-contract/v1',
    identityChecksum: ACTION_RELEASE_CONTRACT_IDENTITY_CHECKSUM,
    checked: true,
    passed: true,
    candidate: { headCommit: commit },
    release: {
      expectedId: releaseId,
      id: releaseId,
      releaseKey: 'release-test',
      status: 'draft',
      fingerprint: '1'.repeat(64),
      semanticSnapshotFingerprint: '2'.repeat(64),
      declaredSemanticSnapshotFingerprint: '2'.repeat(64),
      semanticSnapshotMatches: true,
    },
    gateway: { sourceChecksum: '3'.repeat(64), descriptorChecksum: '4'.repeat(64) },
    actions: [{ actionKey: 'action.create_customer', passed: true }],
    summary: {
      requiredActionCount: 1,
      passedActionCount: 1,
      failedActionCount: 0,
      failedActionKeys: [],
    },
    contractFingerprint: '5'.repeat(64),
    blockingReasons: [],
    error: null,
    checkedAt: '2026-07-30T00:00:00.000Z',
  };
  return {
    ...base,
    ...overrides,
    candidate: { ...base.candidate, ...(overrides.candidate ?? {}) },
    release: { ...base.release, ...(overrides.release ?? {}) },
    gateway: { ...base.gateway, ...(overrides.gateway ?? {}) },
    summary: { ...base.summary, ...(overrides.summary ?? {}) },
  };
}

test('marks release acceptance preflight ready only for a clean matching candidate and deployment', () => {
  const commit = 'a'.repeat(40);
  const preflight = buildReleaseAcceptancePreflight({
    expectedReleaseId: 416,
    expectedRuntimeCommit: commit,
    productionHealthUrl: 'https://example.test/api/health',
    headCommit: commit.toUpperCase(),
    dirtyFileCount: 0,
    health: {
      requestSucceeded: true,
      statusCode: 200,
      body: {
        status: 'ready',
        deployment: { commit, branch: 'main', buildId: 'build-1', environment: 'production' },
      },
    },
    crossClientContract: passingCrossClientContract(commit),
    expectedCrossClientContractIdentityChecksum: CROSS_CLIENT_IDENTITY_CHECKSUM,
    actionReleaseContract: passingActionReleaseContract(commit),
    expectedActionReleaseContractIdentityChecksum: ACTION_RELEASE_CONTRACT_IDENTITY_CHECKSUM,
    now: new Date('2026-07-30T00:00:00.000Z'),
  });

  assert.equal(preflight.ready, true);
  assert.equal(preflight.schemaVersion, 'ami-brain-candidate-preflight/v3');
  assert.deepEqual(preflight.blockingReasons, []);
  assert.equal(preflight.candidate.clean, true);
  assert.equal(preflight.candidate.headMatchesExpected, true);
  assert.equal(preflight.productionHealth.commitMatchesExpected, true);
  assert.equal(preflight.crossClientContract.passed, true);
  assert.equal(preflight.crossClientContract.identityMatchesExpected, true);
  assert.equal(preflight.actionReleaseContract.release.releaseMatchesExpected, true);
  assert.equal(preflight.checkedAt, '2026-07-30T00:00:00.000Z');
});

test('preserves institutional-effect fingerprints in candidate preflight evidence', () => {
  const commit = 'a'.repeat(40);
  const institutionalEffectFingerprint = '6'.repeat(64);
  const preflight = buildReleaseAcceptancePreflight({
    expectedReleaseId: 416,
    expectedRuntimeCommit: commit,
    productionHealthUrl: 'https://example.test/api/health',
    headCommit: commit,
    dirtyFileCount: 0,
    health: {
      requestSucceeded: true,
      statusCode: 200,
      body: { status: 'ok', deployment: { commit } },
    },
    crossClientContract: passingCrossClientContract(commit),
    expectedCrossClientContractIdentityChecksum: CROSS_CLIENT_IDENTITY_CHECKSUM,
    actionReleaseContract: passingActionReleaseContract(commit, 416, {
      actions: [
        {
          actionKey: 'action.cancel_reservation',
          passed: true,
          institutionalEffectFingerprint,
        },
      ],
    }),
    expectedActionReleaseContractIdentityChecksum: ACTION_RELEASE_CONTRACT_IDENTITY_CHECKSUM,
  });

  assert.equal(preflight.ready, true);
  assert.equal(
    preflight.actionReleaseContract.actions[0].institutionalEffectFingerprint,
    institutionalEffectFingerprint,
  );
});

test('blocks a dirty or mismatched candidate and a health response without deployment commit', () => {
  const expectedCommit = 'a'.repeat(40);
  const preflight = buildReleaseAcceptancePreflight({
    expectedReleaseId: 416,
    expectedRuntimeCommit: expectedCommit,
    productionHealthUrl: 'https://example.test/api/health',
    headCommit: 'b'.repeat(40),
    dirtyFileCount: 282,
    health: {
      requestSucceeded: true,
      statusCode: 200,
      body: { status: 'ok', deployment: { commit: null, branch: null, buildId: null } },
    },
    crossClientContract: passingCrossClientContract('b'.repeat(40)),
    expectedCrossClientContractIdentityChecksum: CROSS_CLIENT_IDENTITY_CHECKSUM,
    actionReleaseContract: passingActionReleaseContract('b'.repeat(40)),
    expectedActionReleaseContractIdentityChecksum: ACTION_RELEASE_CONTRACT_IDENTITY_CHECKSUM,
  });

  assert.equal(preflight.ready, false);
  assert.deepEqual(preflight.blockingReasons, [
    'candidate_head_commit_mismatch',
    'candidate_worktree_dirty:282',
    'production_deployment_commit_missing',
  ]);
});

test('blocks unavailable or unhealthy deployment inspection without inventing a commit result', () => {
  const commit = 'a'.repeat(40);
  const unavailable = buildReleaseAcceptancePreflight({
    expectedReleaseId: 416,
    expectedRuntimeCommit: commit,
    productionHealthUrl: 'https://example.test/api/health',
    headCommit: commit,
    dirtyFileCount: 0,
    health: { requestSucceeded: false, statusCode: null, body: null, error: 'fetch failed' },
    crossClientContract: passingCrossClientContract(commit),
    expectedCrossClientContractIdentityChecksum: CROSS_CLIENT_IDENTITY_CHECKSUM,
    actionReleaseContract: passingActionReleaseContract(commit),
    expectedActionReleaseContractIdentityChecksum: ACTION_RELEASE_CONTRACT_IDENTITY_CHECKSUM,
  });
  assert.deepEqual(unavailable.blockingReasons, ['production_health_unavailable']);
  assert.equal(unavailable.productionHealth.deployment.commit, null);

  const unhealthy = buildReleaseAcceptancePreflight({
    expectedReleaseId: 416,
    expectedRuntimeCommit: commit,
    productionHealthUrl: 'https://example.test/api/health',
    headCommit: commit,
    dirtyFileCount: 0,
    health: {
      requestSucceeded: true,
      statusCode: 503,
      body: { status: 'starting', deployment: { commit: 'b'.repeat(40) } },
    },
    crossClientContract: passingCrossClientContract(commit),
    expectedCrossClientContractIdentityChecksum: CROSS_CLIENT_IDENTITY_CHECKSUM,
    actionReleaseContract: passingActionReleaseContract(commit),
    expectedActionReleaseContractIdentityChecksum: ACTION_RELEASE_CONTRACT_IDENTITY_CHECKSUM,
  });
  assert.deepEqual(unhealthy.blockingReasons, [
    'production_health_http_status:503',
    'production_health_status_invalid:starting',
    'production_deployment_commit_mismatch',
  ]);
});

test('blocks missing, failed, stale, or checksum-drifted cross-client contract evidence', () => {
  const commit = 'a'.repeat(40);
  const base = {
    expectedReleaseId: 416,
    expectedRuntimeCommit: commit,
    productionHealthUrl: 'https://example.test/api/health',
    headCommit: commit,
    dirtyFileCount: 0,
    health: {
      requestSucceeded: true,
      statusCode: 200,
      body: { status: 'ok', deployment: { commit } },
    },
    expectedCrossClientContractIdentityChecksum: CROSS_CLIENT_IDENTITY_CHECKSUM,
    actionReleaseContract: passingActionReleaseContract(commit),
    expectedActionReleaseContractIdentityChecksum: ACTION_RELEASE_CONTRACT_IDENTITY_CHECKSUM,
  };

  const missing = buildReleaseAcceptancePreflight(base);
  assert.deepEqual(missing.blockingReasons, ['cross_client_contract_failed']);
  assert.equal(missing.crossClientContract.checked, false);

  const failed = buildReleaseAcceptancePreflight({
    ...base,
    crossClientContract: passingCrossClientContract(commit, {
      passed: false,
      summary: {
        stepCount: 4,
        passedStepCount: 3,
        failedStepCount: 1,
        failedStepKeys: ['mobile_typecheck'],
      },
      blockingReasons: ['cross_client_contract_step_failed:mobile_typecheck'],
    }),
  });
  assert.deepEqual(failed.blockingReasons, ['cross_client_contract_failed']);
  assert.deepEqual(failed.crossClientContract.summary.failedStepKeys, ['mobile_typecheck']);

  const stale = buildReleaseAcceptancePreflight({
    ...base,
    crossClientContract: passingCrossClientContract('b'.repeat(40)),
  });
  assert.equal(stale.crossClientContract.candidate.headMatchesCandidate, false);
  assert.deepEqual(stale.blockingReasons, ['cross_client_contract_failed']);

  const checksumDrift = buildReleaseAcceptancePreflight({
    ...base,
    crossClientContract: passingCrossClientContract(commit, { identityChecksum: 'd'.repeat(64) }),
  });
  assert.equal(checksumDrift.crossClientContract.identityMatchesExpected, false);
  assert.deepEqual(checksumDrift.blockingReasons, ['cross_client_contract_failed']);
});

test('blocks missing, failed, stale, checksum-drifted, or release-drifted action release contracts', () => {
  const commit = 'a'.repeat(40);
  const base = {
    expectedReleaseId: 416,
    expectedRuntimeCommit: commit,
    productionHealthUrl: 'https://example.test/api/health',
    headCommit: commit,
    dirtyFileCount: 0,
    health: {
      requestSucceeded: true,
      statusCode: 200,
      body: { status: 'ok', deployment: { commit } },
    },
    crossClientContract: passingCrossClientContract(commit),
    expectedCrossClientContractIdentityChecksum: CROSS_CLIENT_IDENTITY_CHECKSUM,
    expectedActionReleaseContractIdentityChecksum: ACTION_RELEASE_CONTRACT_IDENTITY_CHECKSUM,
  };

  const missing = buildReleaseAcceptancePreflight(base);
  assert.deepEqual(missing.blockingReasons, ['action_release_contract_failed']);
  assert.equal(missing.actionReleaseContract.checked, false);

  const failed = buildReleaseAcceptancePreflight({
    ...base,
    actionReleaseContract: passingActionReleaseContract(commit, 416, {
      passed: false,
      actions: [{ actionKey: 'action.create_customer', passed: false }],
      summary: { passedActionCount: 0, failedActionCount: 1, failedActionKeys: ['action.create_customer'] },
      blockingReasons: ['required_action_binding_gateway_mismatch:action.create_customer'],
    }),
  });
  assert.deepEqual(failed.blockingReasons, ['action_release_contract_failed']);
  assert.deepEqual(failed.actionReleaseContract.summary.failedActionKeys, ['action.create_customer']);

  const stale = buildReleaseAcceptancePreflight({
    ...base,
    actionReleaseContract: passingActionReleaseContract('b'.repeat(40)),
  });
  assert.equal(stale.actionReleaseContract.candidate.headMatchesCandidate, false);
  assert.deepEqual(stale.blockingReasons, ['action_release_contract_failed']);

  const checksumDrift = buildReleaseAcceptancePreflight({
    ...base,
    actionReleaseContract: passingActionReleaseContract(commit, 416, { identityChecksum: 'd'.repeat(64) }),
  });
  assert.equal(checksumDrift.actionReleaseContract.identityMatchesExpected, false);
  assert.deepEqual(checksumDrift.blockingReasons, ['action_release_contract_failed']);

  const releaseDrift = buildReleaseAcceptancePreflight({
    ...base,
    actionReleaseContract: passingActionReleaseContract(commit, 417),
  });
  assert.equal(releaseDrift.actionReleaseContract.release.releaseMatchesExpected, false);
  assert.deepEqual(releaseDrift.blockingReasons, ['action_release_contract_failed']);

  const semanticDrift = buildReleaseAcceptancePreflight({
    ...base,
    actionReleaseContract: passingActionReleaseContract(commit, 416, {
      release: { semanticSnapshotMatches: false },
    }),
  });
  assert.deepEqual(semanticDrift.blockingReasons, ['action_release_contract_failed']);
});

function fixture() {
  const coreIds = Array.from({ length: 350 }, (_, index) => `case-${String(index + 1).padStart(4, '0')}`);
  const deltaIds = Array.from({ length: 690 }, (_, index) => `case-${String(index + 351).padStart(4, '0')}`);
  const standardIds = [...coreIds, ...deltaIds];
  const runtimeCommit = 'a'.repeat(40);
  const sourceChecksum = 'b'.repeat(64);
  const dataFactsPath = resolve(
    REPO_ROOT,
    'docs/04-测试数据/Ami-Brain-全领域题集治理/ami-brain-product-loop-data-facts-v1.json',
  );
  const dataFactsRaw = readFileSync(dataFactsPath, 'utf8');
  const dataFacts = JSON.parse(dataFactsRaw);
  const supplementalRegistry = {
    schemaVersion: 'ami-brain-supplemental-question-registry/v1',
    cases: [],
  };
  const supplementalRegistryRaw = `${JSON.stringify(supplementalRegistry, null, 2)}\n`;
  const supplementalRegistryMetadata = {
    schemaVersion: supplementalRegistry.schemaVersion,
    path: 'fixtures/supplemental-question-registry.json',
    checksum: sha256(supplementalRegistryRaw),
    caseCount: 0,
  };
  const dataFactsAudit = {
    schemaVersion: dataFacts.schemaVersion,
    path: 'docs/04-测试数据/Ami-Brain-全领域题集治理/ami-brain-product-loop-data-facts-v1.json',
    checksum: sha256(dataFactsRaw),
    schemaChecksum: dataFacts.schemaChecksum,
    snapshotChecksum: dataFacts.snapshotChecksum,
    databaseHost: dataFacts.databaseHost,
    storeId: dataFacts.storeId,
  };
  const productLoopArtifact = {
    schemaVersion: 'ami-brain-product-loop-eligibility/v1',
    sourceBaselineChecksum: sourceChecksum,
    caseIdsChecksum: sha256(standardIds.join('\n')),
    baselineCaseCount: standardIds.length,
    supplementalRegistry: supplementalRegistryMetadata,
    dataFactsAudit,
    summary: { currentReleaseTest: standardIds.length, nextIterationFeature: 0, evidenceReviewRequired: 0 },
    cases: standardIds.map((id) => {
      const item = {
        id,
        domain: '员工域',
        role: '店长',
        type: 'query_single',
        difficulty: 'easy',
        question: '今天哪些美容师有排班',
        expectedTarget: 'Beautician/Schedule 表',
        notes: '',
      };
      return {
        ...item,
        ...resolveProductLoopEligibility(item, { admission: 'frozen_baseline_v1' }),
      };
    }),
  };
  const productLoopRaw = `${JSON.stringify(productLoopArtifact, null, 2)}\n`;
  const manifest = {
    schemaVersion: 'ami-brain-suite-manifest/v1',
    manifestVersion: '2026-07-28-v2',
    sourceBaseline: { checksum: sourceChecksum, caseCount: standardIds.length },
    productLoopEligibility: {
      schemaVersion: productLoopArtifact.schemaVersion,
      path: 'fixtures/product-loop.json',
      checksum: sha256(productLoopRaw),
      sourceBaselineChecksum: sourceChecksum,
      caseCount: standardIds.length,
      baselineCaseCount: standardIds.length,
      caseIdsChecksum: productLoopArtifact.caseIdsChecksum,
      supplementalRegistry: supplementalRegistryMetadata,
      dataFactsAudit,
    },
    governancePolicy: {
      productLoopPolicy: {
        eligibleStatus: 'current_release_test',
        requiredEvidence: ['management_entry', 'backend_api', 'data_facts'],
      },
    },
    productJourneys: {
      schemaVersion: 'ami-brain-product-journeys/v1',
      policy: 'fixture product journey policy',
      currentReleaseCaseIdsChecksum: sha256(coreIds[0]),
      cases: [
        {
          caseId: coreIds[0],
          question: '今天哪些美容师有排班',
          journeyKeys: ['query'],
          status: 'current_release_test',
          suite: 'release-core',
          executable: true,
          fixtureReferences: [
            {
              path: 'fixtures/product-journey.test.ts',
              marker: coreIds[0],
              questionMarker: '今天哪些美容师有排班',
              evidenceKind: 'automated_test',
            },
          ],
        },
      ],
    },
    suites: {
      releaseCore: {
        key: 'release-core',
        caseCount: coreIds.length,
        caseIdsChecksum: sha256(coreIds.join('\n')),
        caseIds: coreIds,
      },
      standardRegression: {
        key: 'standard-regression',
        caseCount: standardIds.length,
        caseIdsChecksum: sha256(standardIds.join('\n')),
        caseIds: standardIds,
      },
      extendedRotation: { key: 'extended-rotation', caseCount: 0, caseIdsChecksum: sha256(''), caseIds: [] },
      nextIterationFeature: { key: 'next-iteration', caseCount: 0, caseIdsChecksum: sha256(''), caseIds: [] },
      evidenceReviewRequired: { key: 'evidence-review', caseCount: 0, caseIdsChecksum: sha256(''), caseIds: [] },
    },
  };
  const identity = {
    contractVersion: 'ami-brain-release-acceptance/v1',
    runKey: 'release416-v2-fixture',
    releaseId: 416,
    runtimeCommit,
    productionHealthUrl: 'https://example.test/api/health',
    storeId: 6,
    suiteManifestVersion: manifest.manifestVersion,
    suiteManifestChecksum: 'c'.repeat(64),
    sourceBaselineChecksum: manifest.sourceBaseline.checksum,
    productLoopEligibilityChecksum: manifest.productLoopEligibility.checksum,
    releaseCoreCaseCount: coreIds.length,
    standardRegressionCaseCount: standardIds.length,
    standardDeltaCaseCount: deltaIds.length,
  };
  const common = {
    runKey: identity.runKey,
    sourceChecksum: manifest.sourceBaseline.checksum,
    suiteManifestVersion: manifest.manifestVersion,
    suiteManifestChecksum: identity.suiteManifestChecksum,
    releaseFingerprint: 'd'.repeat(64),
    sourceCommit: runtimeCommit,
    productionHealth: { commit: runtimeCommit },
    storeId: 6,
    failed: 0,
    providerUnavailable: 0,
    scorecards: {
      suspectedFalseSuccess: { count: 0 },
      verifiedCapability: { total: 50, passed: 50 },
    },
  };
  return {
    coreIds,
    deltaIds,
    manifest,
    productLoopArtifact,
    productLoopRaw,
    supplementalRegistryRaw,
    identity,
    coreSummary: {
      ...common,
      runId: 501,
      stage: 'release-core',
      total: coreIds.length,
      expectedTotal: coreIds.length,
      passed: coreIds.length,
    },
    standardSummary: {
      ...common,
      runId: 502,
      stage: 'standard-regression',
      total: deltaIds.length,
      expectedTotal: deltaIds.length,
      passed: deltaIds.length,
    },
  };
}

test('allows unresolved evidence outside execution and rejects any ineligible case that leaks into execution', () => {
  const unresolved = fixture().manifest;
  unresolved.suites.evidenceReviewRequired = {
    key: 'evidence-review',
    caseCount: 1,
    caseIdsChecksum: sha256('case-review'),
    caseIds: ['case-review'],
  };
  assert.doesNotThrow(() => validateManifest(unresolved));

  const unresolvedLeak = fixture().manifest;
  unresolvedLeak.suites.evidenceReviewRequired = {
    key: 'evidence-review',
    caseCount: 1,
    caseIdsChecksum: sha256(unresolvedLeak.suites.standardRegression.caseIds[0]),
    caseIds: [unresolvedLeak.suites.standardRegression.caseIds[0]],
  };
  assert.throws(() => validateManifest(unresolvedLeak), /evidence review cases entered release execution/);

  const leaked = fixture().manifest;
  leaked.suites.nextIterationFeature = {
    key: 'next-iteration',
    caseCount: 1,
    caseIdsChecksum: sha256(leaked.suites.standardRegression.caseIds[0]),
    caseIds: [leaked.suites.standardRegression.caseIds[0]],
  };
  assert.throws(() => validateManifest(leaked), /next iteration cases entered release execution/);
});

test('requires product journey governance and rejects suite or fixture drift', () => {
  const missing = fixture().manifest;
  delete missing.productJourneys;
  assert.throws(() => validateManifest(missing), /product journeys invalid/);

  const suiteDrift = fixture().manifest;
  suiteDrift.productJourneys.cases[0].suite = 'standard-regression';
  assert.throws(() => validateManifest(suiteDrift), /product journey suite mismatch/);

  const fixtureDrift = fixture().manifest;
  fixtureDrift.productJourneys.cases[0].fixtureReferences[0].questionMarker = '另一个问题';
  assert.throws(() => validateManifest(fixtureDrift), /product journey fixture invalid/);
});

test('rejects product journey question declarations that drift from the eligibility artifact', () => {
  const input = fixture();
  input.manifest.productJourneys.cases[0].question = '今天有哪些员工在岗';
  input.manifest.productJourneys.cases[0].fixtureReferences[0].questionMarker = '今天有哪些员工在岗';
  assert.throws(
    () => validateProductLoopEligibility(input.manifest, input.productLoopRaw, input.supplementalRegistryRaw),
    /product journey question mismatch/,
  );
});

test('recomputes per-case product-loop eligibility instead of trusting manifest declarations', () => {
  const input = fixture();
  validateProductLoopEligibility(input.manifest, input.productLoopRaw, input.supplementalRegistryRaw);

  const ineligible = structuredClone(input.productLoopArtifact);
  ineligible.cases[0].status = 'next_iteration_feature';
  ineligible.cases[0].missingComponents = ['data_facts'];
  ineligible.cases[0].evidence.dataFacts.status = 'missing';
  ineligible.summary.currentReleaseTest -= 1;
  ineligible.summary.nextIterationFeature += 1;
  const raw = `${JSON.stringify(ineligible, null, 2)}\n`;
  input.manifest.productLoopEligibility.checksum = sha256(raw);
  assert.throws(
    () => validateProductLoopEligibility(input.manifest, raw, input.supplementalRegistryRaw),
    /product loop eligibility decision stale/,
  );
});

test('validates a reviewed supplemental question without adding a third release stage', () => {
  const input = fixture();
  const dataFacts = JSON.parse(
    readFileSync(
      resolve(REPO_ROOT, 'docs/04-测试数据/Ami-Brain-全领域题集治理/ami-brain-product-loop-data-facts-v1.json'),
      'utf8',
    ),
  );
  const item = {
    id: 'BQ-supplemental-fixture',
    domain: '员工域',
    role: '店长',
    type: 'query_single',
    difficulty: 'easy',
    question: '今天门店有哪些在职美容师',
    expectedTarget: 'Beautician/Schedule 表',
    notes: '',
  };
  const review = {
    questionChecksum: questionContractChecksum(item),
    status: 'current_release_test',
    featureKey: 'staff_directory_schedule',
    reviewedBy: 'product-owner',
    reviewedAt: '2026-07-29T12:00:00.000Z',
    reason: '已逐题核对员工目录入口、接口和门店员工事实。',
    evidenceReview: { managementEntry: 'present', backendApi: 'present', dataFacts: 'present' },
    suiteAssignment: 'standard-regression',
    managementEvidence: {
      questionChecksum: questionContractChecksum(item),
      operation: 'read',
      entries: [
        {
          path: 'src/app/pages/BeauticianManagement.tsx',
          routePath: 'src/app/routes.tsx',
          routeAnchor: "path: 'stores/beauticians'",
          interactionAnchor: 'getBeauticians',
        },
      ],
    },
    backendApiEvidence: {
      questionChecksum: questionContractChecksum(item),
      operation: 'read',
      entries: [
        {
          path: 'packages/server-v2/src/beauticians/beauticians.controller.ts',
          httpMethod: 'GET',
          route: 'beauticians',
          handlerAnchor: 'findAll(',
          permissionAnchor: "@Permissions('core:store:beauticians')",
        },
      ],
    },
    requiredDataModels: ['Beautician'],
    allowEmptyModels: [],
    acceptedGlobalModels: [],
    dataEvidence: {
      path: 'packages/server-v2/scripts/fixtures/ami-brain-question-data-evidence.test.json',
      anchor: 'release-acceptance-supplemental-staff-directory',
      questionChecksum: questionContractChecksum(item),
      auditSnapshotChecksum: dataFacts.snapshotChecksum,
      storeId: dataFacts.storeId,
      requiredDataModels: ['Beautician'],
    },
  };
  const supplementalRegistry = {
    schemaVersion: 'ami-brain-supplemental-question-registry/v1',
    cases: [{ ...item, review }],
  };
  const supplementalRegistryRaw = `${JSON.stringify(supplementalRegistry, null, 2)}\n`;
  const supplementalMetadata = {
    schemaVersion: supplementalRegistry.schemaVersion,
    path: 'fixtures/supplemental-question-registry.json',
    checksum: sha256(supplementalRegistryRaw),
    caseCount: 1,
  };
  const decision = resolveProductLoopEligibility(item, { supplementalRegistry });
  input.productLoopArtifact.cases.push({
    ...item,
    ...decision,
    source: 'supplemental_question_registry_v1',
  });
  input.productLoopArtifact.caseIdsChecksum = sha256(
    input.productLoopArtifact.cases.map((candidate) => candidate.id).join('\n'),
  );
  input.productLoopArtifact.supplementalRegistry = supplementalMetadata;
  input.productLoopArtifact.summary.currentReleaseTest += 1;
  const raw = `${JSON.stringify(input.productLoopArtifact, null, 2)}\n`;
  input.manifest.productLoopEligibility = {
    ...input.manifest.productLoopEligibility,
    checksum: sha256(raw),
    caseCount: input.productLoopArtifact.cases.length,
    caseIdsChecksum: input.productLoopArtifact.caseIdsChecksum,
    supplementalRegistry: supplementalMetadata,
  };
  input.manifest.suites.standardRegression.caseIds.push(item.id);
  input.manifest.suites.standardRegression.caseCount += 1;
  input.manifest.suites.standardRegression.caseIdsChecksum = sha256(
    input.manifest.suites.standardRegression.caseIds.join('\n'),
  );

  assert.doesNotThrow(() => validateManifest(input.manifest));
  assert.doesNotThrow(() => validateProductLoopEligibility(input.manifest, raw, supplementalRegistryRaw));
  assert.equal(input.manifest.suites.releaseCore.caseCount, 350);
  assert.equal(input.manifest.suites.standardRegression.caseCount, 1041);

  const omitted = structuredClone(input.manifest);
  omitted.suites.standardRegression.caseIds = omitted.suites.standardRegression.caseIds.filter((id) => id !== item.id);
  omitted.suites.standardRegression.caseCount = omitted.suites.standardRegression.caseIds.length;
  omitted.suites.standardRegression.caseIdsChecksum = sha256(omitted.suites.standardRegression.caseIds.join('\n'));
  assert.throws(
    () => validateProductLoopEligibility(omitted, raw, supplementalRegistryRaw),
    /current release questions missing from executable suites/,
  );
});

test('builds ready evidence from exact 350 then 690 incremental fixtures for a 1040-case standard suite', () => {
  const input = fixture();
  const evidence = buildAcceptanceEvidence({
    identity: input.identity,
    manifest: input.manifest,
    coreSummary: input.coreSummary,
    standardDeltaSummary: input.standardSummary,
    coreResults: input.coreIds.map((caseKey) => ({ caseKey })),
    standardDeltaResults: input.deltaIds.map((caseKey) => ({ caseKey })),
    now: new Date('2026-07-28T12:00:00.000Z'),
  });

  assert.equal(evidence.canActivate, true);
  assert.equal(evidence.decision, 'ready_for_activation');
  assert.equal(evidence.mergedStandardRegression.resultCount, 1040);
  assert.deepEqual(evidence.blockingReasons, []);
});

test('emits blocked evidence and never starts a merged standard result after a core safety failure', () => {
  const input = fixture();
  const evidence = buildCoreBlockedEvidence({
    identity: input.identity,
    manifest: input.manifest,
    coreSummary: { ...input.coreSummary, failed: 1, passed: 349 },
    coreResults: input.coreIds.map((caseKey) => ({ caseKey })),
    now: new Date('2026-07-28T12:00:00.000Z'),
  });

  assert.equal(evidence.canActivate, false);
  assert.equal(evidence.decision, 'blocked');
  assert.equal(evidence.mergedStandardRegression, null);
  assert.deepEqual(evidence.blockingReasons, ['release_core_safety_blocked']);
});

test('resumes from the standard checkpoint without rerunning the completed core stage', () => {
  const input = fixture();
  const options = { resume: true };
  const state = {
    ...input.identity,
    status: 'standard-regression_invocation_2',
    stage: 'standard-regression',
    coreRunId: 501,
    resumeRunId: 502,
  };

  assert.deepEqual(resolveResumePlan({ options, state, identity: input.identity }), {
    skipReleaseCore: true,
    skipStandardRegression: false,
    coreRunId: 501,
    standardRunId: 502,
  });
});

test('refuses resume when identity changed or a previous stage was product-blocked', () => {
  const input = fixture();
  assert.throws(
    () =>
      resolveResumePlan({
        options: { resume: true },
        state: { ...input.identity, runtimeCommit: 'e'.repeat(40), status: 'release_core_complete', coreRunId: 501 },
        identity: input.identity,
      }),
    /orchestrator resume identity mismatch:runtimeCommit/,
  );
  assert.throws(
    () =>
      resolveResumePlan({
        options: { resume: true },
        state: { ...input.identity, status: 'release_core_blocked', coreRunId: 501 },
        identity: input.identity,
      }),
    /blocked acceptance cannot resume/,
  );
});
