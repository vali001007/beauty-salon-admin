import { BrainCapabilitySemanticVerifierService } from '../capability/brain-capability-semantic-verifier.service.js';
import {
  generatedProposalFixture,
  publishedSnapshotFixture,
} from '../capability/brain-generated-capability.test-fixtures.js';
import { jsonChecksum } from '../eval/ami-brain-product-acceptance.js';
import { caseIdsChecksum } from '../eval/ami-brain-suite-manifest.js';
import { createReleaseFingerprint } from './brain-capability-regeneration-fingerprint.js';
import { BrainReleaseService } from './brain-release.service.js';

function passingEvalSummary(items: any[], runtimeCommit = 'a'.repeat(40)) {
  const requiredCapabilityKeys = items
    .filter((item) => item.resourceType === 'skill')
    .map((item) => item.resourceKey)
    .sort();
  return {
    canRelease: true,
    total: 1,
    gateMode: 'release_gate',
    runtimeCommit,
    coverageComplete: true,
    releaseFingerprint: createReleaseFingerprint(items),
    requiredCapabilityKeys,
    requiredCaseKeys: ['release_gate_case'],
    releaseGate: { passed: true },
  };
}

function passingProductSummary(items: any[], overrides: Record<string, unknown> = {}) {
  const releaseFingerprint = createReleaseFingerprint(items);
  const sourceCommit = 'a'.repeat(40);
  const goldStandardAcceptance = passingGoldStandardAcceptance();
  const goldIds = goldStandardCaseIds();
  return {
    runId: 502,
    stage: 'standard-regression',
    executionMode: 'delta_after_release_core',
    runKey: 'release416-v2',
    suiteManifestVersion: '2026-07-28-v2',
    suiteManifestChecksum: 'b'.repeat(64),
    sourceChecksum: 'c'.repeat(64),
    sourceCommit,
    storeId: 6,
    total: 690,
    suiteCaseCount: 1040,
    suiteCaseIdsChecksum: 'f'.repeat(64),
    productionHealth: { commit: sourceCommit },
    releaseFingerprint,
    goldStandardRunId: 503,
    goldStandardAcceptance,
    productAcceptance: {
      contractVersion: 'ami-brain-release-acceptance/v1',
      releaseCoreRunId: 501,
      standardRegressionRunId: 502,
      runKey: 'release416-v2',
      suiteManifestVersion: '2026-07-28-v2',
      suiteManifestChecksum: 'b'.repeat(64),
      sourceChecksum: 'c'.repeat(64),
      releaseFingerprint,
      sourceCommit,
      runtimeCommit: sourceCommit,
      storeId: 6,
      releaseCoreCaseCount: 350,
      standardDeltaCaseCount: 690,
      standardRegressionCaseCount: 1040,
      releaseCoreCaseIdsChecksum: 'd'.repeat(64),
      standardDeltaCaseIdsChecksum: 'e'.repeat(64),
      standardRegressionCaseIdsChecksum: 'f'.repeat(64),
      verifiedCapabilityTotal: 100,
      goldStandardRunId: 503,
      goldStandardManifestVersion: '2026-07-29-v1',
      goldStandardManifestChecksum: '1'.repeat(64),
      goldStandardCaseIdsChecksum: caseIdsChecksum([...goldIds].sort()),
      goldStandardAcceptanceChecksum: jsonChecksum(goldStandardAcceptance),
      goldStandardCaseCount: 100,
      goldStandardAuditQueryReady: 100,
      goldStandardSnapshotReady: 100,
      goldStandardEvaluated: 100,
      goldStandardPassed: 100,
      blockingReasons: [],
      canActivate: true,
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      ...overrides,
    },
  };
}

function passingGoldStandardAcceptance() {
  return {
    contractVersion: 'ami-brain-gold-standard-acceptance/v1',
    status: 'ready',
    manifestVersion: '2026-07-29-v1',
    manifestChecksum: '1'.repeat(64),
    caseCount: 100,
    auditQueryReady: 100,
    snapshotReady: 100,
    evaluated: 100,
    passed: 100,
    failed: 0,
    blockingReasons: [],
  };
}

function goldStandardCaseIds() {
  return Array.from({ length: 100 }, (_, index) => `gold-${String(index + 1).padStart(3, '0')}`);
}

function passingGoldStandardResultRows() {
  return goldStandardCaseIds().map((caseKey) => ({
    caseKey,
    deterministicPassed: true,
    deterministicGrade: { goldCaseId: caseKey, passed: true, status: 'passed' },
  }));
}

function passingGoldStandardRun(items: any[], overrides: Record<string, unknown> = {}) {
  const releaseFingerprint = createReleaseFingerprint(items);
  const sourceCommit = 'a'.repeat(40);
  const goldIds = goldStandardCaseIds();
  return {
    id: 503,
    status: 'completed',
    caseCount: 100,
    passedCount: 100,
    failedCount: 0,
    summary: {
      executionPurpose: 'standard_regression_internal_gold_standard',
      stage: 'standard-regression-gold-internal',
      runKey: 'release416-v2',
      pipelineIdentity: {
        contractVersion: 'ami-brain-gold-standard-runtime/v1',
        parentStandardRegressionRunId: 502,
        releaseId: 20,
        storeId: 6,
        releaseFingerprint,
        sourceCommit,
        runtimeCommit: sourceCommit,
        sourceChecksum: 'c'.repeat(64),
        suiteManifestVersion: '2026-07-28-v2',
        suiteManifestChecksum: 'b'.repeat(64),
        goldStandardManifestChecksum: '1'.repeat(64),
        standardRegressionCaseIdsChecksum: 'f'.repeat(64),
      },
      completedCaseCount: 100,
      remainingCaseCount: 0,
      passed: 100,
      failed: 0,
      providerUnavailable: 0,
      acceptance: passingGoldStandardAcceptance(),
      compactResults: goldIds.map((goldCaseId) => ({ goldCaseId, passed: true })),
      ...overrides,
    },
  };
}

const performanceFixtures = {
  quick: { runId: 601, count: 20, checksum: '2'.repeat(64), latency: { count: 20, missingCount: 0, averageMs: 900, p50Ms: 800, p95Ms: 1200, maxMs: 1800 } },
  single: { runId: 602, count: 20, checksum: '3'.repeat(64), latency: { count: 20, missingCount: 0, averageMs: 1800, p50Ms: 1600, p95Ms: 2800, maxMs: 4200 } },
  multi: { runId: 603, count: 10, checksum: '4'.repeat(64), latency: { count: 10, missingCount: 0, averageMs: 3600, p50Ms: 3200, p95Ms: 5200, maxMs: 7600 } },
  multiTurn: { runId: 604, count: 10, checksum: '5'.repeat(64), latency: { count: 10, missingCount: 0, averageMs: 4800, p50Ms: 4200, p95Ms: 6800, maxMs: 9200 } },
} as const;

const performanceBudgets = {
  quick: { p50: 1500, p95: 3000, max: 5000 },
  single: { p50: 3000, p95: 8000, max: 12000 },
  multi: { p50: 6000, p95: 15000, max: 20000 },
  multiTurn: { p50: 8000, p95: 20000, max: 25000 },
} as const;

type PerformanceBucketKey = keyof typeof performanceFixtures;

function passingPerformanceAcceptance(items: any[], overrides: Record<string, unknown> = {}) {
  const releaseFingerprint = createReleaseFingerprint(items);
  const sourceCommit = 'a'.repeat(40);
  return {
    schemaVersion: 'ami-brain-performance-acceptance/v1',
    status: 'ready',
    manifestVersion: '2026-07-29-v1',
    manifestCaseIdsChecksum: '4f97cc54be8e347cf36bd483f919e261538753645fcb077c864061c5415a1342',
    identity: {
      releaseId: 20,
      storeId: 6,
      sourceCommit,
      releaseFingerprint,
      runtimeCommit: sourceCommit,
      suiteManifestChecksum: 'b'.repeat(64),
    },
    buckets: Object.fromEntries(
      Object.entries(performanceFixtures).map(([key, fixture]) => [
        key,
        {
          runId: fixture.runId,
          caseCount: fixture.count,
          caseIdsChecksum: fixture.checksum,
          latency: fixture.latency,
          budgetsMs: performanceBudgets[key as PerformanceBucketKey],
        },
      ]),
    ),
    blockingReasons: [],
    generatedAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    runIdentity: {
      schemaVersion: 'ami-brain-performance-run-identity/v1',
      runKey: 'release416-performance-v1',
      releaseId: 20,
      standardRegressionRunId: 502,
      runtimeCommit: sourceCommit,
      storeId: 6,
      performanceManifestPath: 'docs/04-测试数据/Ami-Brain-性能回归/ami-brain-performance-suite-v1.json',
      performanceManifestVersion: '2026-07-29-v1',
      performanceManifestChecksum: 'f529a9ad14651c3a98bd281bc9281631b00c62465fe8fd2e493907f9fcfd0101',
      performanceCaseIdsChecksum: '4f97cc54be8e347cf36bd483f919e261538753645fcb077c864061c5415a1342',
      suiteManifestChecksum: 'b'.repeat(64),
    },
    ...overrides,
  };
}

function passingPerformanceRun(
  items: any[],
  bucketKey: PerformanceBucketKey,
  overrides: Record<string, unknown> = {},
) {
  const fixture = performanceFixtures[bucketKey];
  const sourceCommit = 'a'.repeat(40);
  return {
    id: fixture.runId,
    status: 'completed',
    caseCount: fixture.count,
    passedCount: fixture.count,
    failedCount: 0,
    summary: {
      runId: fixture.runId,
      runKey: `release416-performance-v1-${bucketKey}`,
      stage: 'targeted',
      executionMode: 'full_suite',
      activeRelease: { id: 20 },
      storeId: 6,
      sourceCommit,
      sourceChecksum: 'c'.repeat(64),
      productionHealth: { commit: sourceCommit },
      releaseFingerprint: createReleaseFingerprint(items),
      suiteManifestChecksum: 'b'.repeat(64),
      total: fixture.count,
      expectedTotal: fixture.count,
      suiteCaseIdsChecksum: fixture.checksum,
      passed: fixture.count,
      failed: 0,
      providerUnavailable: 0,
      scorecards: { suspectedFalseSuccess: { count: 0 } },
      latencyBreakdown: { userResponse: fixture.latency },
      ...overrides,
    },
  };
}

function passingEvidenceRunById(items: any[], runId: number) {
  if (runId === 503) return passingGoldStandardRun(items);
  const bucketKey = (Object.keys(performanceFixtures) as PerformanceBucketKey[]).find(
    (key) => performanceFixtures[key].runId === runId,
  );
  return bucketKey ? passingPerformanceRun(items, bucketKey) : null;
}

describe('BrainReleaseService', () => {
  it('reports and blocks a release catalog whose capability source fingerprint is stale', async () => {
    const candidate = { key: 'customer_facts', version: 1, sourceFingerprint: 'a'.repeat(64) };
    const scanner = {
      scan: jest.fn().mockResolvedValue({
        capabilities: [{ key: 'customer_facts', sourceFingerprint: 'b'.repeat(64), implementationDependencies: [] }],
      }),
    };
    const catalog = {
      validateEnabledCapabilities: jest.fn().mockResolvedValue({ valid: true, cards: [candidate], issues: [] }),
    };
    const service = new BrainReleaseService(undefined, undefined, catalog as never, scanner as never);
    jest.spyOn(service, 'freezeEvaluationRelease').mockResolvedValue({
      releaseId: 21,
      releaseStatus: 'draft',
      releaseFingerprint: 'c'.repeat(64),
      declaredMode: 'shadow',
      mode: 'model',
      resourceVersionIds: [11],
      capabilityKeys: ['customer_facts'],
      capabilityCandidates: [candidate as never],
    });

    await expect(service.validateReleaseCatalog(21)).resolves.toMatchObject({
      valid: false,
      sourceFreshness: {
        valid: false,
        issues: [expect.objectContaining({ capabilityKey: 'customer_facts', code: 'stale_source_fingerprint' })],
      },
    });
    await expect((service as any).assertCapabilitySourceFreshness([candidate])).rejects.toMatchObject({
      message: 'capability_source_freshness_invalid:customer_facts',
    });
    expect(scanner.scan).toHaveBeenCalledTimes(1);
  });

  it('bounds the release history loaded by the governance console', async () => {
    const findMany = jest.fn().mockResolvedValue([
      { id: 1, releaseKey: 'brain-r1', _count: { items: 54 } },
    ]);
    const service = new BrainReleaseService({ brainRelease: { findMany } } as never);

    await expect(service.listReleases({ includeSnapshot: false, take: 30 })).resolves.toEqual([
      expect.objectContaining({ id: 1, itemCount: 54, items: [] }),
    ]);

    expect(findMany).toHaveBeenCalledWith({
      where: { scope: { in: ['global', 'store', 'user', 'role', 'percentage'] } },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        releaseKey: true,
        scope: true,
        rollout: true,
        status: true,
        previousReleaseId: true,
        activatedAt: true,
        rolledBackAt: true,
        failureReason: true,
        createdAt: true,
        updatedAt: true,
        _count: { select: { items: true } },
      },
      take: 30,
    });
  });

  it('never activates an evaluation-only release into production', async () => {
    const release = {
      id: 21,
      status: 'draft',
      scope: 'percentage',
      rollout: { mode: 'shadow', evaluationOnly: true, userPercentage: 100 },
      items: [],
    };
    const prisma = {
      brainRelease: { findUnique: jest.fn().mockResolvedValue(release) },
    };
    const service = new BrainReleaseService(prisma as never);

    await expect(service.activateRelease({ releaseId: 21, activatedBy: 9 })).rejects.toMatchObject({
      message: 'release_evaluation_only',
    });
  });

  it('does not allow the runtime release service to create governance policy snapshots', async () => {
    const service = new BrainReleaseService({} as never);

    await expect(service.createRelease({
      releaseKey: 'governance-v1',
      scope: 'governance_policy',
      rollout: {},
      resourceVersionIds: [1],
      createdBy: 9,
    })).rejects.toMatchObject({ message: 'runtime_release_scope_invalid' });
  });

  it('accepts a complete active governance shadow binding for a runtime release', async () => {
    const service = new BrainReleaseService({
      brainRelease: {
        findUnique: jest.fn().mockResolvedValue({
          id: 429,
          scope: 'governance_policy',
          status: 'active',
          rollout: { policySnapshotChecksum: 'policy-checksum' },
          items: [
            {
              resourceType: 'capability_policy',
              resourceKey: 'customer_query',
              snapshot: { runtimeEnforcementStatus: 'shadow' },
            },
          ],
        }),
      },
    } as never);

    await expect((service as any).assertGovernancePolicyBinding((service as any).prisma, {
      rollout: {
        governancePolicyReleaseId: 429,
        governancePolicyMode: 'shadow',
        governancePolicySnapshotChecksum: 'policy-checksum',
      },
      items: [{ resourceType: 'skill', resourceKey: 'customer_query' }],
    })).resolves.toBeUndefined();
  });

  it('rejects a runtime release when the bound policy is still pending runtime', async () => {
    const service = new BrainReleaseService({
      brainRelease: {
        findUnique: jest.fn().mockResolvedValue({
          id: 429,
          scope: 'governance_policy',
          status: 'active',
          rollout: {},
          items: [
            {
              resourceType: 'capability_policy',
              resourceKey: 'customer_query',
              snapshot: { runtimeEnforcementStatus: 'pending_runtime' },
            },
          ],
        }),
      },
    } as never);

    await expect((service as any).assertGovernancePolicyBinding((service as any).prisma, {
      rollout: { governancePolicyReleaseId: 429, governancePolicyMode: 'shadow' },
      items: [{ resourceType: 'skill', resourceKey: 'customer_query' }],
    })).rejects.toMatchObject({ message: 'release_governance_policy_mode_mismatch' });
  });

  it('activates a production canary with a passing evaluation-only release sharing the exact fingerprint', async () => {
    const resourceVersion = {
      id: 11,
      checksum: 'a'.repeat(64),
      resourceType: 'skill',
      resourceKey: 'customer_query',
      sourceResourceId: 31,
      snapshot: { permissions: [] },
    };
    const items = [
      { id: 101, resourceVersionId: 11, resourceType: 'skill', resourceKey: 'customer_query', resourceVersion },
    ];
    const release = {
      id: 21,
      status: 'draft',
      scope: 'user',
      rollout: { mode: 'model', evaluationEvidenceReleaseId: 20, userIds: [28], storeIds: [6] },
      items,
    };
    const evidenceRelease = {
      id: 20,
      status: 'draft',
      scope: 'percentage',
      rollout: { mode: 'shadow', evaluationOnly: true, userPercentage: 100 },
      items,
    };
    const evalRun = { summary: passingEvalSummary(items) };
    const findRelease = ({ where }: { where: { id: number } }) =>
      Promise.resolve(where.id === evidenceRelease.id ? evidenceRelease : release);
    const tx = {
      $queryRaw: jest.fn().mockResolvedValue([]),
      brainRelease: {
        findUnique: jest.fn(findRelease),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        update: jest.fn().mockResolvedValue({ ...release, status: 'active' }),
      },
      brainCapabilityRegenerationJob: { findFirst: jest.fn().mockResolvedValue(null) },
      brainEvalRun: {
        findFirst: jest.fn(({ where }: { where: { releaseId: number } }) =>
          Promise.resolve(where.releaseId === evidenceRelease.id ? evalRun : null),
        ),
      },
      brainResourceVersion: { updateMany: jest.fn(), update: jest.fn() },
      brainSkillRegistry: { updateMany: jest.fn(), update: jest.fn() },
    };
    const prisma = {
      brainRelease: { findUnique: jest.fn(findRelease) },
      brainCapabilityRegenerationJob: { findFirst: jest.fn().mockResolvedValue(null) },
      brainEvalRun: {
        findFirst: jest.fn(({ where }: { where: { releaseId: number } }) =>
          Promise.resolve(where.releaseId === evidenceRelease.id ? evalRun : null),
        ),
      },
      role: { findMany: jest.fn().mockResolvedValue([]) },
      brainSkillRegistry: { findMany: jest.fn().mockResolvedValue([]) },
      $transaction: jest.fn((callback) => callback(tx)),
    };
    const activeReleaseWarmup = { warmRelease: jest.fn().mockResolvedValue({}) };
    const service = new BrainReleaseService(
      prisma as never,
      undefined,
      undefined,
      undefined,
      activeReleaseWarmup as never,
    );
    (service as any).activeRuntimeReleaseCache = { expiresAt: Number.MAX_SAFE_INTEGER, fingerprint: 'stale', releases: [] };

    await expect(service.activateRelease({ releaseId: release.id, activatedBy: 9 })).resolves.toMatchObject({
      status: 'active',
    });
    expect((service as any).activeRuntimeReleaseCache).toBeUndefined();
    expect(activeReleaseWarmup.warmRelease).toHaveBeenCalledWith({
      releaseId: release.id,
      expectedStatus: 'draft',
    });
    expect(activeReleaseWarmup.warmRelease.mock.invocationCallOrder[0]).toBeLessThan(
      prisma.$transaction.mock.invocationCallOrder[0],
    );
    expect(prisma.brainEvalRun.findFirst).toHaveBeenCalledWith({
      where: { releaseId: evidenceRelease.id, status: 'completed' },
      orderBy: { createdAt: 'desc' },
    });
  });

  it('accepts a passing active shadow release as evidence for the next canary stage', async () => {
    const resourceVersion = {
      id: 11,
      checksum: 'a'.repeat(64),
      resourceType: 'skill',
      resourceKey: 'customer_query',
      snapshot: {},
    };
    const items = [
      { resourceVersionId: 11, resourceType: 'skill', resourceKey: 'customer_query', resourceVersion },
    ];
    const target = {
      id: 21,
      rollout: { mode: 'model', evaluationEvidenceReleaseId: 20 },
      items,
    };
    const evidenceRelease = {
      id: 20,
      status: 'active',
      rollout: { mode: 'shadow', stage: 'shadow' },
      items,
    };
    const prisma = {
      brainRelease: { findUnique: jest.fn().mockResolvedValue(evidenceRelease) },
      brainEvalRun: { findFirst: jest.fn().mockResolvedValue({ summary: passingEvalSummary(items) }) },
    };
    const service = new BrainReleaseService(prisma as never);

    await expect(
      (service as any).assertReleaseEvalEvidence(prisma, target, createReleaseFingerprint(items)),
    ).resolves.toBeUndefined();
  });

  it('requires capability and two-stage product evidence for a production baseline release', async () => {
    const resourceVersion = {
      id: 11,
      checksum: 'a'.repeat(64),
      resourceType: 'skill',
      resourceKey: 'customer_query',
      snapshot: {},
    };
    const items = [
      { resourceVersionId: 11, resourceType: 'skill', resourceKey: 'customer_query', resourceVersion },
    ];
    const target = {
      id: 21,
      rollout: { mode: 'model', productionBaseline: true, evaluationEvidenceReleaseId: 20 },
      items,
    };
    const evidenceRelease = {
      id: 20,
      status: 'active',
      rollout: { mode: 'shadow', stage: 'shadow' },
      items,
    };
    const productSummary = {
      ...passingProductSummary(items),
      performanceAcceptance: passingPerformanceAcceptance(items),
    };
    const prisma = {
      brainRelease: { findUnique: jest.fn().mockResolvedValue(evidenceRelease) },
      brainEvalRun: {
        findMany: jest.fn(({ where }: { where: { releaseId: number } }) =>
          Promise.resolve(where.releaseId === evidenceRelease.id ? [
            { summary: productSummary },
            { summary: passingEvalSummary(items) },
          ] : [])),
        findFirst: jest.fn(({ where }: { where: { id: number } }) =>
          Promise.resolve(passingEvidenceRunById(items, where.id))),
      },
      brainEvalResult: {
        findMany: jest.fn().mockResolvedValue(passingGoldStandardResultRows()),
      },
    };
    const service = new BrainReleaseService(prisma as never);

    await expect(
      (service as any).assertReleaseEvalEvidence(prisma, target, createReleaseFingerprint(items)),
    ).resolves.toBeUndefined();
  });

  it('rejects a production performance gate when its acceptance evidence is missing', async () => {
    const items = [{
      resourceVersionId: 11,
      resourceType: 'skill',
      resourceKey: 'customer_query',
      resourceVersion: { id: 11, checksum: 'a'.repeat(64), resourceType: 'skill', resourceKey: 'customer_query' },
    }];
    const standardSummary = passingProductSummary(items);
    const service = new BrainReleaseService({} as never);

    await expect(
      (service as any).assertPerformanceEvidenceRuns(
        { brainEvalRun: { findFirst: jest.fn() } },
        20,
        standardSummary,
        standardSummary.productAcceptance,
      ),
    ).rejects.toMatchObject({ message: 'release_performance_acceptance_missing' });
  });

  it('rejects blocked or expired performance acceptance evidence', async () => {
    const items = [{
      resourceVersionId: 11,
      resourceType: 'skill',
      resourceKey: 'customer_query',
      resourceVersion: { id: 11, checksum: 'a'.repeat(64), resourceType: 'skill', resourceKey: 'customer_query' },
    }];
    const productSummary = passingProductSummary(items);
    const service = new BrainReleaseService({} as never);
    const prisma = { brainEvalRun: { findFirst: jest.fn() } };

    await expect(
      (service as any).assertPerformanceEvidenceRuns(
        prisma,
        20,
        {
          ...productSummary,
          performanceAcceptance: passingPerformanceAcceptance(items, {
            status: 'blocked',
            blockingReasons: ['quick:p95_budget_exceeded'],
          }),
        },
        productSummary.productAcceptance,
      ),
    ).rejects.toMatchObject({ message: 'release_performance_acceptance_failed' });

    await expect(
      (service as any).assertPerformanceEvidenceRuns(
        prisma,
        20,
        {
          ...productSummary,
          performanceAcceptance: passingPerformanceAcceptance(items, {
            expiresAt: new Date(Date.now() - 1000).toISOString(),
          }),
        },
        productSummary.productAcceptance,
      ),
    ).rejects.toMatchObject({ message: 'release_performance_acceptance_expired' });
  });

  it('rejects performance evidence produced by a different runtime commit', async () => {
    const items = [{
      resourceVersionId: 11,
      resourceType: 'skill',
      resourceKey: 'customer_query',
      resourceVersion: { id: 11, checksum: 'a'.repeat(64), resourceType: 'skill', resourceKey: 'customer_query' },
    }];
    const productSummary = passingProductSummary(items);
    const performance = passingPerformanceAcceptance(items) as any;
    performance.runIdentity.runtimeCommit = '9'.repeat(40);
    const service = new BrainReleaseService({} as never);

    await expect(
      (service as any).assertPerformanceEvidenceRuns(
        { brainEvalRun: { findFirst: jest.fn() } },
        20,
        { ...productSummary, performanceAcceptance: performance },
        productSummary.productAcceptance,
      ),
    ).rejects.toMatchObject({ message: 'release_performance_acceptance_identity_invalid' });
  });

  it('rejects a substituted 60-case performance manifest even when its checksum is well formed', async () => {
    const items = [{
      resourceVersionId: 11,
      resourceType: 'skill',
      resourceKey: 'customer_query',
      resourceVersion: { id: 11, checksum: 'a'.repeat(64), resourceType: 'skill', resourceKey: 'customer_query' },
    }];
    const productSummary = passingProductSummary(items);
    const performance = passingPerformanceAcceptance(items) as any;
    performance.runIdentity.performanceManifestChecksum = '9'.repeat(64);
    const service = new BrainReleaseService({} as never);

    await expect(
      (service as any).assertPerformanceEvidenceRuns(
        { brainEvalRun: { findFirst: jest.fn() } },
        20,
        { ...productSummary, performanceAcceptance: performance },
        productSummary.productAcceptance,
      ),
    ).rejects.toMatchObject({ message: 'release_performance_acceptance_identity_invalid' });
  });

  it('rejects missing performance buckets and duplicate performance run ids', async () => {
    const items = [{
      resourceVersionId: 11,
      resourceType: 'skill',
      resourceKey: 'customer_query',
      resourceVersion: { id: 11, checksum: 'a'.repeat(64), resourceType: 'skill', resourceKey: 'customer_query' },
    }];
    const productSummary = passingProductSummary(items);
    const missingBucket = passingPerformanceAcceptance(items) as any;
    delete missingBucket.buckets.multiTurn;
    const duplicateRun = passingPerformanceAcceptance(items) as any;
    duplicateRun.buckets.single.runId = duplicateRun.buckets.quick.runId;
    const service = new BrainReleaseService({} as never);
    const prisma = { brainEvalRun: { findFirst: jest.fn() } };

    await expect(
      (service as any).assertPerformanceEvidenceRuns(
        prisma,
        20,
        { ...productSummary, performanceAcceptance: missingBucket },
        productSummary.productAcceptance,
      ),
    ).rejects.toMatchObject({ message: 'release_performance_acceptance_buckets_invalid' });

    await expect(
      (service as any).assertPerformanceEvidenceRuns(
        prisma,
        20,
        { ...productSummary, performanceAcceptance: duplicateRun },
        productSummary.productAcceptance,
      ),
    ).rejects.toMatchObject({ message: 'release_performance_acceptance_run_ids_invalid' });
  });

  it('rejects performance acceptance when one referenced database run is missing', async () => {
    const items = [{
      resourceVersionId: 11,
      resourceType: 'skill',
      resourceKey: 'customer_query',
      resourceVersion: { id: 11, checksum: 'a'.repeat(64), resourceType: 'skill', resourceKey: 'customer_query' },
    }];
    const productSummary = passingProductSummary(items);
    const service = new BrainReleaseService({} as never);
    const prisma = {
      brainEvalRun: {
        findFirst: jest.fn(({ where }: { where: { id: number } }) =>
          Promise.resolve(where.id === performanceFixtures.multiTurn.runId ? null : passingEvidenceRunById(items, where.id))),
      },
    };

    await expect(
      (service as any).assertPerformanceEvidenceRuns(
        prisma,
        20,
        { ...productSummary, performanceAcceptance: passingPerformanceAcceptance(items) },
        productSummary.productAcceptance,
      ),
    ).rejects.toMatchObject({ message: 'release_performance_run_missing:multiTurn' });
  });

  it('rejects a ready aggregate when the referenced run actually failed or exceeded P95', async () => {
    const items = [{
      resourceVersionId: 11,
      resourceType: 'skill',
      resourceKey: 'customer_query',
      resourceVersion: { id: 11, checksum: 'a'.repeat(64), resourceType: 'skill', resourceKey: 'customer_query' },
    }];
    const productSummary = passingProductSummary(items);
    const service = new BrainReleaseService({} as never);
    const failedPrisma = {
      brainEvalRun: {
        findFirst: jest.fn(({ where }: { where: { id: number } }) => {
          if (where.id !== performanceFixtures.multi.runId) return Promise.resolve(passingEvidenceRunById(items, where.id));
          return Promise.resolve(passingPerformanceRun(items, 'multi', { failed: 1 }));
        }),
      },
    };

    await expect(
      (service as any).assertPerformanceEvidenceRuns(
        failedPrisma,
        20,
        { ...productSummary, performanceAcceptance: passingPerformanceAcceptance(items) },
        productSummary.productAcceptance,
      ),
    ).rejects.toMatchObject({ message: expect.stringContaining('release_performance_run_invalid:multi:') });

    const slowLatency = { ...performanceFixtures.single.latency, p95Ms: 9000, maxMs: 10000 };
    const slowPrisma = {
      brainEvalRun: {
        findFirst: jest.fn(({ where }: { where: { id: number } }) => {
          if (where.id !== performanceFixtures.single.runId) return Promise.resolve(passingEvidenceRunById(items, where.id));
          return Promise.resolve(passingPerformanceRun(items, 'single', {
            latencyBreakdown: { userResponse: slowLatency },
          }));
        }),
      },
    };

    await expect(
      (service as any).assertPerformanceEvidenceRuns(
        slowPrisma,
        20,
        { ...productSummary, performanceAcceptance: passingPerformanceAcceptance(items) },
        productSummary.productAcceptance,
      ),
    ).rejects.toMatchObject({ message: expect.stringContaining('release_performance_run_invalid:single:') });
  });

  it('rejects product evidence when the referenced gold-standard child run is missing', async () => {
    const resourceVersion = {
      id: 11,
      checksum: 'a'.repeat(64),
      resourceType: 'skill',
      resourceKey: 'customer_query',
      snapshot: {},
    };
    const items = [
      { resourceVersionId: 11, resourceType: 'skill', resourceKey: 'customer_query', resourceVersion },
    ];
    const target = {
      id: 21,
      rollout: { mode: 'model', productionBaseline: true, evaluationEvidenceReleaseId: 20 },
      items,
    };
    const evidenceRelease = {
      id: 20,
      status: 'active',
      rollout: { mode: 'shadow', stage: 'shadow' },
      items,
    };
    const prisma = {
      brainRelease: { findUnique: jest.fn().mockResolvedValue(evidenceRelease) },
      brainEvalRun: {
        findMany: jest.fn(({ where }: { where: { releaseId: number } }) =>
          Promise.resolve(where.releaseId === evidenceRelease.id ? [
            { summary: passingProductSummary(items) },
            { summary: passingEvalSummary(items) },
          ] : [])),
        findFirst: jest.fn().mockResolvedValue(null),
      },
    };
    const service = new BrainReleaseService(prisma as never);

    await expect(
      (service as any).assertReleaseEvalEvidence(prisma, target, createReleaseFingerprint(items)),
    ).rejects.toMatchObject({ message: 'release_gold_standard_run_missing' });
  });

  it('rejects product evidence when the gold-standard child results are incomplete', async () => {
    const resourceVersion = {
      id: 11,
      checksum: 'a'.repeat(64),
      resourceType: 'skill',
      resourceKey: 'customer_query',
      snapshot: {},
    };
    const items = [
      { resourceVersionId: 11, resourceType: 'skill', resourceKey: 'customer_query', resourceVersion },
    ];
    const target = {
      id: 21,
      rollout: { mode: 'model', productionBaseline: true, evaluationEvidenceReleaseId: 20 },
      items,
    };
    const evidenceRelease = {
      id: 20,
      status: 'active',
      rollout: { mode: 'shadow', stage: 'shadow' },
      items,
    };
    const prisma = {
      brainRelease: { findUnique: jest.fn().mockResolvedValue(evidenceRelease) },
      brainEvalRun: {
        findMany: jest.fn(({ where }: { where: { releaseId: number } }) =>
          Promise.resolve(where.releaseId === evidenceRelease.id ? [
            { summary: passingProductSummary(items) },
            { summary: passingEvalSummary(items) },
          ] : [])),
        findFirst: jest.fn().mockResolvedValue(passingGoldStandardRun(items)),
      },
      brainEvalResult: {
        findMany: jest.fn().mockResolvedValue(passingGoldStandardResultRows().slice(0, 99)),
      },
    };
    const service = new BrainReleaseService(prisma as never);

    await expect(
      (service as any).assertReleaseEvalEvidence(prisma, target, createReleaseFingerprint(items)),
    ).rejects.toMatchObject({ message: 'release_gold_standard_results_invalid' });
  });

  it('rejects product evidence when one actual gold-standard row failed despite a passing summary', async () => {
    const resourceVersion = {
      id: 11,
      checksum: 'a'.repeat(64),
      resourceType: 'skill',
      resourceKey: 'customer_query',
      snapshot: {},
    };
    const items = [
      { resourceVersionId: 11, resourceType: 'skill', resourceKey: 'customer_query', resourceVersion },
    ];
    const target = {
      id: 21,
      rollout: { mode: 'model', productionBaseline: true, evaluationEvidenceReleaseId: 20 },
      items,
    };
    const evidenceRelease = {
      id: 20,
      status: 'active',
      rollout: { mode: 'shadow', stage: 'shadow' },
      items,
    };
    const rows = passingGoldStandardResultRows();
    rows[0] = {
      caseKey: rows[0]!.caseKey,
      deterministicPassed: false,
      deterministicGrade: { goldCaseId: rows[0]!.caseKey, passed: false, status: 'comparison_failed' },
    };
    const prisma = {
      brainRelease: { findUnique: jest.fn().mockResolvedValue(evidenceRelease) },
      brainEvalRun: {
        findMany: jest.fn(({ where }: { where: { releaseId: number } }) =>
          Promise.resolve(where.releaseId === evidenceRelease.id ? [
            { summary: passingProductSummary(items) },
            { summary: passingEvalSummary(items) },
          ] : [])),
        findFirst: jest.fn().mockResolvedValue(passingGoldStandardRun(items)),
      },
      brainEvalResult: { findMany: jest.fn().mockResolvedValue(rows) },
    };
    const service = new BrainReleaseService(prisma as never);

    await expect(
      (service as any).assertReleaseEvalEvidence(prisma, target, createReleaseFingerprint(items)),
    ).rejects.toMatchObject({ message: 'release_gold_standard_results_invalid' });
  });

  it('rejects capability and product evidence produced by different runtime commits', async () => {
    const resourceVersion = {
      id: 11,
      checksum: 'a'.repeat(64),
      resourceType: 'skill',
      resourceKey: 'customer_query',
      snapshot: {},
    };
    const items = [
      { resourceVersionId: 11, resourceType: 'skill', resourceKey: 'customer_query', resourceVersion },
    ];
    const target = {
      id: 21,
      rollout: { mode: 'model', productionBaseline: true, evaluationEvidenceReleaseId: 20 },
      items,
    };
    const evidenceRelease = {
      id: 20,
      status: 'active',
      rollout: { mode: 'shadow', stage: 'shadow' },
      items,
    };
    const productSummary = {
      ...passingProductSummary(items),
      performanceAcceptance: passingPerformanceAcceptance(items),
    };
    const prisma = {
      brainRelease: { findUnique: jest.fn().mockResolvedValue(evidenceRelease) },
      brainEvalRun: {
        findMany: jest.fn(({ where }: { where: { releaseId: number } }) =>
          Promise.resolve(where.releaseId === evidenceRelease.id ? [
            { summary: productSummary },
            { summary: passingEvalSummary(items, '9'.repeat(40)) },
          ] : [])),
        findFirst: jest.fn(({ where }: { where: { id: number } }) =>
          Promise.resolve(passingEvidenceRunById(items, where.id))),
      },
      brainEvalResult: {
        findMany: jest.fn().mockResolvedValue(passingGoldStandardResultRows()),
      },
    };
    const service = new BrainReleaseService(prisma as never);

    await expect(
      (service as any).assertReleaseEvalEvidence(prisma, target, createReleaseFingerprint(items)),
    ).rejects.toMatchObject({ message: 'release_eval_pipeline_identity_mismatch' });
  });

  it('rejects product evidence whose embedded summary does not match its standard run', async () => {
    const resourceVersion = {
      id: 11,
      checksum: 'a'.repeat(64),
      resourceType: 'skill',
      resourceKey: 'customer_query',
      snapshot: {},
    };
    const items = [
      { resourceVersionId: 11, resourceType: 'skill', resourceKey: 'customer_query', resourceVersion },
    ];
    const target = {
      id: 21,
      rollout: { mode: 'model', productionBaseline: true, evaluationEvidenceReleaseId: 20 },
      items,
    };
    const evidenceRelease = {
      id: 20,
      status: 'active',
      rollout: { mode: 'shadow', stage: 'shadow' },
      items,
    };
    const productSummary = passingProductSummary(items);
    productSummary.runKey = 'different-run-key';
    const prisma = {
      brainRelease: { findUnique: jest.fn().mockResolvedValue(evidenceRelease) },
      brainEvalRun: {
        findMany: jest.fn().mockResolvedValue([
          { summary: productSummary },
          { summary: passingEvalSummary(items) },
        ]),
        findFirst: jest.fn(),
      },
    };
    const service = new BrainReleaseService(prisma as never);

    await expect(
      (service as any).assertReleaseEvalEvidence(prisma, target, createReleaseFingerprint(items)),
    ).rejects.toMatchObject({ message: 'release_product_acceptance_summary_mismatch' });
  });

  it('rejects a production baseline release when two-stage product evidence is missing', async () => {
    const resourceVersion = {
      id: 11,
      checksum: 'a'.repeat(64),
      resourceType: 'skill',
      resourceKey: 'customer_query',
      snapshot: {},
    };
    const items = [
      { resourceVersionId: 11, resourceType: 'skill', resourceKey: 'customer_query', resourceVersion },
    ];
    const target = {
      id: 21,
      rollout: { mode: 'model', productionBaseline: true, evaluationEvidenceReleaseId: 20 },
      items,
    };
    const evidenceRelease = {
      id: 20,
      status: 'active',
      rollout: { mode: 'shadow', stage: 'shadow' },
      items,
    };
    const prisma = {
      brainRelease: { findUnique: jest.fn().mockResolvedValue(evidenceRelease) },
      brainEvalRun: {
        findMany: jest.fn().mockResolvedValue([{ summary: passingEvalSummary(items) }]),
        findFirst: jest.fn(),
      },
    };
    const service = new BrainReleaseService(prisma as never);

    await expect(
      (service as any).assertReleaseEvalEvidence(prisma, target, createReleaseFingerprint(items)),
    ).rejects.toMatchObject({ message: 'release_product_acceptance_missing' });
  });

  it('rejects expired two-stage product evidence', async () => {
    const resourceVersion = {
      id: 11,
      checksum: 'a'.repeat(64),
      resourceType: 'skill',
      resourceKey: 'customer_query',
      snapshot: {},
    };
    const items = [
      { resourceVersionId: 11, resourceType: 'skill', resourceKey: 'customer_query', resourceVersion },
    ];
    const target = {
      id: 21,
      rollout: { mode: 'model', productionBaseline: true, evaluationEvidenceReleaseId: 20 },
      items,
    };
    const evidenceRelease = {
      id: 20,
      status: 'active',
      rollout: { mode: 'shadow', stage: 'shadow' },
      items,
    };
    const prisma = {
      brainRelease: { findUnique: jest.fn().mockResolvedValue(evidenceRelease) },
      brainEvalRun: {
        findMany: jest.fn().mockResolvedValue([
          { summary: passingProductSummary(items, { expiresAt: new Date(Date.now() - 1000).toISOString() }) },
          { summary: passingEvalSummary(items) },
        ]),
        findFirst: jest.fn(),
      },
    };
    const service = new BrainReleaseService(prisma as never);

    await expect(
      (service as any).assertReleaseEvalEvidence(prisma, target, createReleaseFingerprint(items)),
    ).rejects.toMatchObject({ message: 'release_product_acceptance_expired' });
  });

  it('rejects inherited evaluation evidence when the production fingerprint differs', async () => {
    const targetVersion = { id: 11, checksum: 'a'.repeat(64), resourceType: 'skill', resourceKey: 'customer_query', snapshot: {} };
    const evidenceVersion = { ...targetVersion, checksum: 'b'.repeat(64) };
    const release = {
      id: 21,
      status: 'draft',
      scope: 'user',
      rollout: { mode: 'model', evaluationEvidenceReleaseId: 20 },
      items: [{ resourceVersionId: 11, resourceType: 'skill', resourceKey: 'customer_query', resourceVersion: targetVersion }],
    };
    const evidenceRelease = {
      id: 20,
      rollout: { mode: 'shadow', evaluationOnly: true },
      items: [{ resourceVersionId: 11, resourceType: 'skill', resourceKey: 'customer_query', resourceVersion: evidenceVersion }],
    };
    const prisma = {
      brainRelease: {
        findUnique: jest.fn(({ where }: { where: { id: number } }) =>
          Promise.resolve(where.id === evidenceRelease.id ? evidenceRelease : release),
        ),
      },
      brainCapabilityRegenerationJob: { findFirst: jest.fn().mockResolvedValue(null) },
      brainEvalRun: { findFirst: jest.fn().mockResolvedValue(null) },
    };
    const service = new BrainReleaseService(prisma as never);

    await expect(service.activateRelease({ releaseId: release.id, activatedBy: 9 })).rejects.toMatchObject({
      message: 'release_eval_evidence_fingerprint_mismatch',
    });
  });

  it('serializes activation against a business-definition blocker sharing the five-stage release fingerprint', async () => {
    const resourceVersion = { id: 11, checksum: 'a', resourceType: 'skill', resourceKey: 'customer_query', sourceResourceId: 31, snapshot: {} };
    const release = { id: 21, status: 'draft', scope: 'percentage', items: [{ resourceVersionId: 11, resourceType: 'skill', resourceKey: 'customer_query', resourceVersion }] };
    const tx = {
      $queryRaw: jest.fn().mockResolvedValue([]),
      brainRelease: { findUnique: jest.fn().mockResolvedValue(release) },
      brainEvalRun: { findFirst: jest.fn().mockResolvedValue({ summary: passingEvalSummary(release.items) }) },
      brainCapabilityRegenerationJob: { findFirst: jest.fn().mockResolvedValue({ id: 90, releaseFingerprint: 'x'.repeat(64), errorCode: 'business_definition_change_pending' }) },
    };
    const prisma = {
      brainRelease: { findUnique: jest.fn().mockResolvedValue(release) },
      brainEvalRun: { findFirst: jest.fn().mockResolvedValue({ summary: passingEvalSummary(release.items) }) },
      role: { findMany: jest.fn().mockResolvedValue([]) },
      brainSkillRegistry: { findMany: jest.fn().mockResolvedValue([]) },
      $transaction: jest.fn((callback) => callback(tx)),
    };
    const service = new BrainReleaseService(prisma as never);

    await expect(service.activateRelease({ releaseId: 21, activatedBy: 9 })).rejects.toMatchObject({ message: 'modification_superseded' });
    expect(tx.$queryRaw).toHaveBeenCalled();
    expect(tx.brainCapabilityRegenerationJob.findFirst).toHaveBeenCalledWith({
      where: { releaseFingerprint: expect.stringMatching(/^[a-f0-9]{64}$/) },
      select: { id: true, status: true },
    });
  });

  it.each(['queued', 'leased', 'retry_scheduled', 'blocked', 'dead_letter', 'completed'])('rejects activation of the old release when regeneration is %s', async (status) => {
    const resourceVersion = { id: 11, checksum: 'a', resourceType: 'skill', resourceKey: 'customer_query', snapshot: {} };
    const prisma = {
      brainRelease: { findUnique: jest.fn().mockResolvedValue({ id: 21, status: 'draft', items: [{ resourceVersionId: 11, resourceType: 'skill', resourceKey: 'customer_query', resourceVersion }] }) },
      brainCapabilityRegenerationJob: { findFirst: jest.fn().mockResolvedValue({ id: 5, status }) },
    };
    const service = new BrainReleaseService(prisma as never);

    await expect(service.activateRelease({ releaseId: 21, activatedBy: 9 })).rejects.toMatchObject({ message: 'modification_superseded' });
  });

  it('rolls an active model release directly back to its validated production baseline in one transaction', async () => {
    const rulesVersion = {
      id: 31,
      resourceType: 'skill',
      resourceKey: 'customer_query',
      sourceResourceId: null,
      snapshot: { permissions: [] },
    };
    const releases = new Map<number, any>([
      [15, { id: 15, status: 'active', previousReleaseId: 14, rollout: { mode: 'model' } }],
      [14, { id: 14, status: 'active', previousReleaseId: 13, rollout: { mode: 'model' } }],
      [13, { id: 13, status: 'active', previousReleaseId: 10, rollout: { mode: 'shadow' } }],
      [10, {
        id: 10,
        status: 'archived',
        previousReleaseId: null,
        rollout: { mode: 'model', productionBaseline: true },
        items: [{ id: 101, resourceType: 'skill', resourceKey: 'customer_query', resourceVersionId: 31, resourceVersion: rulesVersion }],
      }],
    ]);
    const tx = {
      brainRelease: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        update: jest.fn().mockResolvedValue({ ...releases.get(10), status: 'active' }),
      },
      brainResourceVersion: { updateMany: jest.fn(), update: jest.fn() },
    };
    const prisma = {
      brainRelease: { findUnique: jest.fn(({ where }) => Promise.resolve(releases.get(where.id) ?? null)) },
      role: { findMany: jest.fn().mockResolvedValue([]) },
      brainSkillRegistry: { findMany: jest.fn().mockResolvedValue([]) },
      $transaction: jest.fn((callback) => callback(tx)),
    };
    const service = new BrainReleaseService(prisma as never);
    (service as any).activeRuntimeReleaseCache = { expiresAt: Number.MAX_SAFE_INTEGER, fingerprint: 'stale', releases: [] };

    await expect(service.rollbackToRules({ releaseId: 15, reason: 'emergency' })).resolves.toMatchObject({
      id: 10,
      status: 'active',
    });
    expect((service as any).activeRuntimeReleaseCache).toBeUndefined();

    expect(tx.brainRelease.updateMany).toHaveBeenCalledWith({
      where: { id: 15, status: 'active' },
      data: { status: 'rolled_back', rolledBackAt: expect.any(Date), failureReason: 'emergency' },
    });
    expect(tx.brainRelease.updateMany).toHaveBeenCalledWith({
      where: {
        status: 'active',
        scope: { in: ['global', 'store', 'user', 'role', 'percentage'] },
        id: { not: 10 },
      },
      data: { status: 'archived' },
    });
  });

  it('refuses to roll back to an empty rules rehearsal release', async () => {
    const candidateVersion = {
      id: 12,
      resourceType: 'skill',
      resourceKey: 'reservation_list',
      sourceResourceId: 19,
      snapshot: {},
    };
    const current = {
      id: 15,
      status: 'active',
      previousReleaseId: 10,
      rollout: { mode: 'model' },
      items: [{ resourceVersionId: 12, resourceType: 'skill', resourceKey: 'reservation_list', resourceVersion: candidateVersion }],
    };
    const rules = { id: 10, status: 'archived', previousReleaseId: null, rollout: { mode: 'rules' }, items: [] };
    const tx = {
      brainRelease: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        update: jest.fn().mockResolvedValue({ ...rules, status: 'active' }),
      },
      brainResourceVersion: { updateMany: jest.fn(), update: jest.fn() },
      brainSkillRegistry: { updateMany: jest.fn(), update: jest.fn() },
    };
    const prisma = {
      brainRelease: { findUnique: jest.fn(({ where }) => Promise.resolve(where.id === 15 ? current : rules)) },
      role: { findMany: jest.fn().mockResolvedValue([]) },
      brainSkillRegistry: { findMany: jest.fn().mockResolvedValue([]) },
      $transaction: jest.fn((callback) => callback(tx)),
    };

    await expect(
      new BrainReleaseService(prisma as never).rollbackToRules({ releaseId: 15, reason: 'test' }),
    ).rejects.toMatchObject({ message: 'production_baseline_not_found' });

    expect(tx.brainResourceVersion.updateMany).not.toHaveBeenCalled();
    expect(tx.brainSkillRegistry.updateMany).not.toHaveBeenCalled();
  });

  it('creates an independently auditable shadow-to-full rollout sequence', async () => {
    const prisma = { brainRelease: { update: jest.fn().mockImplementation(({ data }) => Promise.resolve(data)) } };
    const service = new BrainReleaseService(prisma as never);
    jest.spyOn(service, 'createRelease')
      .mockResolvedValueOnce({ id: 11, releaseKey: 'brain-r1-shadow' } as never)
      .mockResolvedValueOnce({ id: 12, releaseKey: 'brain-r1-canary-5' } as never)
      .mockResolvedValueOnce({ id: 13, releaseKey: 'brain-r1-canary-20' } as never)
      .mockResolvedValueOnce({ id: 14, releaseKey: 'brain-r1-canary-50' } as never)
      .mockResolvedValueOnce({ id: 15, releaseKey: 'brain-r1-full' } as never);

    const releases = await service.createRolloutSequence({
      releaseKey: 'brain-r1',
      resourceVersionIds: [21, 22],
      createdBy: 9,
    });

    expect(service.createRelease).toHaveBeenNthCalledWith(1, expect.objectContaining({
      releaseKey: 'brain-r1-shadow',
      scope: 'percentage',
      rollout: { stage: 'shadow', mode: 'shadow', userPercentage: 100 },
    }));
    expect(service.createRelease).toHaveBeenNthCalledWith(5, expect.objectContaining({
      releaseKey: 'brain-r1-full',
      rollout: { stage: 'full', mode: 'model', userPercentage: 100, productionBaseline: true },
    }));
    expect(prisma.brainRelease.update).toHaveBeenCalledWith({ where: { id: 12 }, data: { previousReleaseId: 11 } });
    expect(releases.items).toHaveLength(5);
    expect(releases.stages).toEqual(['shadow', 'canary_5', 'canary_20', 'canary_50', 'full']);
  });

  it('resolves a draft evaluation release with its immutable capability snapshots', async () => {
    const candidate = generatedProposalFixture(publishedSnapshotFixture()).manifest;
    const evaluationRelease = {
      id: 21,
      status: 'draft',
      rollout: { mode: 'model', stage: 'canary_5' },
      items: [
        {
          resourceVersionId: 3,
          resourceType: 'skill',
          resourceKey: candidate.key,
          snapshot: { ...candidate, generatedCapability: true },
          resourceVersion: { checksum: 'a'.repeat(64) },
        },
        {
          resourceVersionId: 4,
          resourceType: 'agent_profile',
          resourceKey: 'store_manager',
          snapshot: { roleKey: 'store_manager' },
          resourceVersion: { checksum: 'b'.repeat(64) },
        },
      ],
    };
    const prisma = {
      brainRelease: {
        findUnique: jest.fn().mockResolvedValue(evaluationRelease),
        findMany: jest.fn().mockResolvedValue([{ id: 10, status: 'active', rollout: { mode: 'rules' }, items: [] }]),
      },
      brainReleaseItem: {
        findMany: jest.fn().mockResolvedValue(
          evaluationRelease.items.filter((item) => item.resourceType === 'skill').map((item) => ({ snapshot: item.snapshot })),
        ),
      },
    };
    const service = new BrainReleaseService(prisma as never);

    await expect(
      (service as any).resolveRuntimeMode({
        storeId: 6,
        userId: 9,
        roleKey: 'store_manager',
        evaluationReleaseId: 21,
      }),
    ).resolves.toMatchObject({
      mode: 'model',
      release: { id: 21, status: 'draft' },
      capabilityCandidates: [expect.objectContaining({ key: candidate.key, generatedCapability: true })],
    });
    expect(prisma.brainRelease.findUnique).toHaveBeenCalledWith({
      where: { id: 21 },
      select: {
        id: true,
        scope: true,
        status: true,
        rollout: true,
        items: {
          select: {
            resourceVersionId: true,
            resourceType: true,
            resourceKey: true,
            resourceVersion: { select: { checksum: true } },
          },
        },
      },
    });
    expect(prisma.brainRelease.findMany).not.toHaveBeenCalled();
  });

  it('freezes one evaluation release fingerprint and capability snapshot for a whole eval run', async () => {
    const candidate = generatedProposalFixture(publishedSnapshotFixture()).manifest;
    const release = {
      id: 21,
      status: 'draft',
      rollout: { mode: 'model', stage: 'canary_5' },
      items: [
        {
          resourceVersionId: 3,
          resourceType: 'skill',
          resourceKey: candidate.key,
          snapshot: { ...candidate, generatedCapability: true },
          resourceVersion: { id: 3, checksum: 'a'.repeat(64), snapshot: candidate },
        },
      ],
    };
    const prisma = {
      brainRelease: { findUnique: jest.fn().mockResolvedValue(release) },
      brainReleaseItem: { findMany: jest.fn().mockResolvedValue([{ snapshot: release.items[0]!.snapshot }]) },
    };
    const service = new BrainReleaseService(prisma as never);

    const snapshot = await (service as any).freezeEvaluationRelease(21);
    const cachedSnapshot = await (service as any).freezeEvaluationRelease(21);

    expect(snapshot).toMatchObject({
      releaseId: 21,
      releaseStatus: 'draft',
      mode: 'model',
      declaredMode: 'model',
      resourceVersionIds: [3],
      capabilityKeys: [candidate.key],
      capabilityCandidates: [expect.objectContaining({ key: candidate.key })],
      releaseFingerprint: expect.stringMatching(/^[a-f0-9]{64}$/),
    });
    expect(Object.isFrozen(snapshot)).toBe(true);
    expect(Object.isFrozen(snapshot.capabilityCandidates)).toBe(true);
    expect(cachedSnapshot).toBe(snapshot);
    expect(prisma.brainRelease.findUnique).toHaveBeenCalledTimes(1);
  });

  it('executes a shadow release through the candidate model path only during governance evaluation', async () => {
    const prisma = {
      brainRelease: {
        findUnique: jest.fn().mockResolvedValue({
          id: 22,
          status: 'draft',
          rollout: { mode: 'shadow', stage: 'shadow' },
          items: [{
            resourceVersionId: 3,
            resourceType: 'skill',
            resourceKey: 'customer_facts',
            snapshot: { key: 'customer_facts' },
            resourceVersion: { checksum: 'c'.repeat(64) },
          }],
        }),
        findMany: jest.fn(),
      },
      brainReleaseItem: {
        findMany: jest.fn().mockResolvedValue([{ snapshot: { key: 'customer_facts' } }]),
      },
    };
    const service = new BrainReleaseService(prisma as never);

    await expect(
      (service as any).resolveRuntimeMode({
        storeId: 6,
        userId: 9,
        roleKey: 'store_manager',
        evaluationReleaseId: 22,
      }),
    ).resolves.toMatchObject({
      mode: 'model',
      declaredMode: 'shadow',
      capabilityCandidates: [{ key: 'customer_facts' }],
    });
  });

  it('uses the selected active release snapshots as the production model capability catalog', async () => {
    const candidate = { key: 'customer_facts', version: 9 };
    const prisma = {
      brainRelease: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 23,
            status: 'active',
            scope: 'user',
            rollout: { mode: 'model', userIds: [28], storeIds: [6], roleKeys: ['store_manager'] },
            items: [
              { resourceType: 'skill', resourceKey: 'customer_facts', snapshot: candidate },
              { resourceType: 'agent_profile', resourceKey: 'store_manager', snapshot: { roleKey: 'store_manager' } },
            ],
          },
        ]),
      },
    };
    const service = new BrainReleaseService(prisma as never);

    const resolved = await service.resolveRuntimeMode({ storeId: 6, userId: 28, roleKey: 'store_manager' });
    const cached = await service.resolveRuntimeMode({ storeId: 6, userId: 28, roleKey: 'store_manager' });

    expect(resolved).toMatchObject({
      mode: 'model',
      declaredMode: 'model',
      release: { id: 23, status: 'active' },
      capabilityCandidates: [candidate],
    });
    expect(Object.isFrozen(resolved.capabilityCandidates)).toBe(true);
    expect(Object.isFrozen(resolved.capabilityCandidates?.[0])).toBe(true);
    expect(cached).toMatchObject({ release: { id: 23 }, capabilityCandidates: [candidate] });
    expect(prisma.brainRelease.findMany).toHaveBeenCalledTimes(1);
  });

  it('loads a bound governance policy in shadow mode without filtering runtime capabilities', async () => {
    const release = {
      id: 430,
      releaseKey: 'runtime-governance-shadow',
      status: 'active',
      scope: 'global',
      activatedAt: new Date('2026-08-01T00:00:00.000Z'),
      rollout: { mode: 'model', governancePolicyReleaseId: 429, governancePolicyMode: 'shadow' },
      items: [
        { resourceType: 'skill', resourceKey: 'customer_facts', version: 1, snapshot: { key: 'customer_facts' } },
        { resourceType: 'skill', resourceKey: 'refund_preview', version: 1, snapshot: { key: 'refund_preview' } },
      ],
    };
    const prisma = {
      brainRelease: {
        findMany: jest.fn().mockResolvedValue([release]),
        findUnique: jest.fn().mockResolvedValue({
          id: 429,
          releaseKey: 'policy-shadow',
          scope: 'governance_policy',
          status: 'active',
          rollout: {},
          items: [
            { resourceType: 'capability_policy', resourceKey: 'customer_facts', snapshot: { riskLevel: 'low', whitelistStatus: 'approved', runtimeEnforcementStatus: 'shadow' } },
            { resourceType: 'capability_policy', resourceKey: 'refund_preview', snapshot: { riskLevel: 'high', whitelistStatus: 'not_allowed', runtimeEnforcementStatus: 'shadow' } },
          ],
        }),
      },
    };
    const service = new BrainReleaseService(prisma as never);

    await expect(service.resolveRuntimeMode({ storeId: 6, userId: 28, roleKey: 'store_manager' })).resolves.toMatchObject({
      mode: 'model',
      capabilityCandidates: [{ key: 'customer_facts' }, { key: 'refund_preview' }],
      governancePolicy: {
        releaseId: 429,
        mode: 'shadow',
        allowedCapabilityKeys: ['customer_facts'],
        blockedCapabilityKeys: ['refund_preview'],
      },
    });
  });

  it('filters non-admitted runtime capabilities only when governance policy mode is enforced', async () => {
    const release = {
      id: 431,
      releaseKey: 'runtime-governance-enforced',
      status: 'active',
      scope: 'global',
      activatedAt: new Date('2026-08-01T00:00:00.000Z'),
      rollout: { mode: 'model', governancePolicyReleaseId: 430, governancePolicyMode: 'enforced' },
      items: [
        { resourceType: 'skill', resourceKey: 'customer_facts', version: 1, snapshot: { key: 'customer_facts' } },
        { resourceType: 'skill', resourceKey: 'refund_preview', version: 1, snapshot: { key: 'refund_preview' } },
      ],
    };
    const prisma = {
      brainRelease: {
        findMany: jest.fn().mockResolvedValue([release]),
        findUnique: jest.fn().mockResolvedValue({
          id: 430,
          releaseKey: 'policy-enforced',
          scope: 'governance_policy',
          status: 'active',
          rollout: {},
          items: [
            { resourceType: 'capability_policy', resourceKey: 'customer_facts', snapshot: { riskLevel: 'low', whitelistStatus: 'approved', runtimeEnforcementStatus: 'enforced' } },
            { resourceType: 'capability_policy', resourceKey: 'refund_preview', snapshot: { riskLevel: 'high', whitelistStatus: 'not_allowed', runtimeEnforcementStatus: 'enforced' } },
          ],
        }),
      },
    };
    const service = new BrainReleaseService(prisma as never);

    await expect(service.resolveRuntimeMode({ storeId: 6, userId: 28, roleKey: 'store_manager' })).resolves.toMatchObject({
      capabilityCandidates: [{ key: 'customer_facts' }],
      governancePolicy: { blockedCapabilityKeys: ['refund_preview'] },
    });
  });

  it('serves the stale active runtime cache while refreshing it after TTL', async () => {
    const now = jest.spyOn(Date, 'now').mockReturnValue(1_000);
    try {
      const first = {
        id: 23,
        status: 'active',
        scope: 'global',
        activatedAt: new Date('2026-07-21T12:00:00.000Z'),
        rollout: { mode: 'model' },
        items: [
          {
            resourceType: 'skill',
            resourceKey: 'customer_facts',
            version: 1,
            snapshot: { key: 'customer_facts', version: 1, sourceFingerprint: 'a'.repeat(64) },
          },
        ],
      };
      const second = {
        ...first,
        id: 24,
        activatedAt: new Date('2026-07-21T12:05:00.000Z'),
        items: [
          {
            resourceType: 'skill',
            resourceKey: 'customer_facts',
            version: 2,
            snapshot: { key: 'customer_facts', version: 2, sourceFingerprint: 'b'.repeat(64) },
          },
        ],
      };
      const findMany = jest.fn().mockResolvedValueOnce([first]).mockResolvedValueOnce([second]);
      const service = new BrainReleaseService({ brainRelease: { findMany } } as never);

      await expect(
        service.resolveRuntimeMode({ storeId: 6, userId: 28, roleKey: 'store_manager' }),
      ).resolves.toMatchObject({ release: { id: 23 }, capabilityCandidates: [{ version: 1 }] });
      now.mockReturnValue(2_001);
      await expect(
        service.resolveRuntimeMode({ storeId: 6, userId: 28, roleKey: 'store_manager' }),
      ).resolves.toMatchObject({ release: { id: 23 }, capabilityCandidates: [{ version: 1 }] });
      await Promise.resolve();
      await Promise.resolve();
      await expect(
        service.resolveRuntimeMode({ storeId: 6, userId: 28, roleKey: 'store_manager' }),
      ).resolves.toMatchObject({ release: { id: 24 }, capabilityCandidates: [{ version: 2 }] });

      expect(findMany).toHaveBeenCalledTimes(2);
    } finally {
      now.mockRestore();
    }
  });

  it('does not block a runtime request on a slow refresh when a stale release is available', async () => {
    const now = jest.spyOn(Date, 'now').mockReturnValue(1_000);
    try {
      let resolveRefresh!: (value: unknown[]) => void;
      const refresh = new Promise<unknown[]>((resolve) => {
        resolveRefresh = resolve;
      });
      const release = {
        id: 23,
        status: 'active',
        scope: 'global',
        activatedAt: new Date('2026-07-21T12:00:00.000Z'),
        rollout: { mode: 'model' },
        items: [{ resourceType: 'skill', resourceKey: 'customer_facts', snapshot: { key: 'customer_facts' } }],
      };
      const findMany = jest.fn().mockResolvedValueOnce([release]).mockReturnValueOnce(refresh);
      const service = new BrainReleaseService({ brainRelease: { findMany } } as never);
      await service.resolveRuntimeMode({ storeId: 6, userId: 28, roleKey: 'store_manager' });
      now.mockReturnValue(2_001);

      await expect(
        service.resolveRuntimeMode({ storeId: 6, userId: 28, roleKey: 'store_manager' }),
      ).resolves.toMatchObject({ release: { id: 23 } });
      expect(findMany).toHaveBeenCalledTimes(2);

      resolveRefresh([release]);
      await refresh;
    } finally {
      now.mockRestore();
    }
  });

  it('does not let an invalidated in-flight release lookup overwrite the newer active fingerprint', async () => {
    const release = (id: number, version: number, fingerprint: string) => ({
      id,
      status: 'active',
      scope: 'global',
      activatedAt: new Date(`2026-07-21T12:0${version}:00.000Z`),
      rollout: { mode: 'model' },
      items: [
        {
          resourceType: 'skill',
          resourceKey: 'customer_facts',
          version,
          snapshot: { key: 'customer_facts', version, sourceFingerprint: fingerprint.repeat(64) },
        },
      ],
    });
    let resolveStale!: (value: unknown) => void;
    const staleLookup = new Promise((resolve) => {
      resolveStale = resolve;
    });
    const findMany = jest
      .fn()
      .mockReturnValueOnce(staleLookup)
      .mockResolvedValueOnce([release(24, 2, 'b')]);
    const service = new BrainReleaseService({ brainRelease: { findMany } } as never);

    const staleRequest = service.resolveRuntimeMode({ storeId: 6, userId: 28, roleKey: 'store_manager' });
    await Promise.resolve();
    (service as any).invalidateActiveRuntimeReleaseCache();
    const freshRequest = service.resolveRuntimeMode({ storeId: 6, userId: 28, roleKey: 'store_manager' });
    await expect(freshRequest).resolves.toMatchObject({ release: { id: 24 }, capabilityCandidates: [{ version: 2 }] });
    resolveStale([release(23, 1, 'a')]);
    await expect(staleRequest).resolves.toMatchObject({ release: { id: 23 }, capabilityCandidates: [{ version: 1 }] });

    expect((service as any).activeRuntimeReleaseCache.releases[0].id).toBe(24);
  });

  it('resolves the governance runtime summary without loading release item snapshots', async () => {
    const findMany = jest.fn().mockResolvedValue([
      {
        id: 24,
        releaseKey: 'brain-r2-canary',
        status: 'active',
        scope: 'role',
        rollout: { mode: 'shadow', stage: 'canary_5', roleKeys: ['store_manager'] },
        activatedAt: new Date('2026-07-21T12:00:00.000Z'),
      },
    ]);
    const service = new BrainReleaseService({ brainRelease: { findMany } } as never);

    await expect(
      service.resolveRuntimeSummary({ storeId: 6, userId: 28, roleKey: 'store_manager' }),
    ).resolves.toMatchObject({
      mode: 'shadow',
      declaredMode: 'shadow',
      release: { id: 24, releaseKey: 'brain-r2-canary' },
    });
    expect(findMany).toHaveBeenCalledWith({
      where: { status: 'active', scope: { in: ['global', 'store', 'user', 'role', 'percentage'] } },
      orderBy: { activatedAt: 'desc' },
      select: {
        id: true,
        releaseKey: true,
        scope: true,
        rollout: true,
        status: true,
        activatedAt: true,
      },
    });
  });

  it('rejects an explicitly supplied invalid evaluation release id without selecting the active release', async () => {
    const prisma = {
      brainRelease: {
        findUnique: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
      },
    };
    const service = new BrainReleaseService(prisma as never);

    await expect(
      (service as any).resolveRuntimeMode({
        storeId: 6,
        userId: 9,
        roleKey: 'store_manager',
        evaluationReleaseId: 0,
      }),
    ).rejects.toMatchObject({ message: 'evaluation_release_id_invalid' });
    expect(prisma.brainRelease.findMany).not.toHaveBeenCalled();
  });

  it('rejects a draft release without activating any resource version', async () => {
    const prisma = {
      brainRelease: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        update: jest.fn().mockResolvedValue({ id: 21, status: 'archived', failureReason: '风险不可接受' }),
      },
    };
    const service = new BrainReleaseService(prisma as never);

    await expect(service.rejectRelease({ releaseId: 21, reason: '风险不可接受' })).resolves.toMatchObject({ status: 'archived' });
    expect(prisma.brainRelease.updateMany).toHaveBeenCalledWith({
      where: { id: 21, status: 'draft' },
      data: { status: 'archived', failureReason: '风险不可接受' },
    });
  });
  it('creates a draft release with immutable resource items', async () => {
    const versions = [
      {
        id: 11,
        resourceType: 'skill',
        resourceKey: 'customer_query',
        version: 2,
        status: 'draft',
        snapshot: { permissions: ['core:customer:view'] },
      },
    ];
    const tx = {
      brainRelease: { create: jest.fn().mockResolvedValue({ id: 21, releaseKey: 'brain-r1', status: 'draft' }) },
      brainReleaseItem: { createMany: jest.fn().mockResolvedValue({ count: 1 }) },
    };
    const prisma = {
      brainResourceVersion: { findMany: jest.fn().mockResolvedValue(versions) },
      brainRelease: { findFirst: jest.fn().mockResolvedValue({ id: 20 }) },
      $transaction: jest.fn((callback) => callback(tx)),
    };
    const service = new BrainReleaseService(prisma as never);

    const result = await service.createRelease({
      releaseKey: 'brain-r1',
      scope: 'store',
      rollout: { storeIds: [6] },
      resourceVersionIds: [11],
      createdBy: 9,
    });

    expect(tx.brainRelease.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ releaseKey: 'brain-r1', previousReleaseId: 20, status: 'draft' }),
    });
    expect(tx.brainReleaseItem.createMany).toHaveBeenCalledWith({
      data: [expect.objectContaining({ releaseId: 21, resourceVersionId: 11, resourceKey: 'customer_query' })],
    });
    expect(result).toMatchObject({ id: 21, status: 'draft' });
  });

  it.each(['metric', 'ontology_entity', 'ontology_relation'] as const)(
    'rejects adding legacy semantic resource %s before opening a release transaction',
    async (resourceType) => {
      const versions = [
        { id: 11, resourceType, resourceKey: 'legacy_definition', version: 1, status: 'draft', snapshot: {} },
      ];
      const prisma = {
        brainResourceVersion: { findMany: jest.fn().mockResolvedValue(versions) },
        brainRelease: { findFirst: jest.fn() },
        $transaction: jest.fn(),
      };
      const service = new BrainReleaseService(prisma as never);

      await expect(
        service.createRelease({
          releaseKey: 'brain-r1',
          scope: 'global',
          rollout: {},
          resourceVersionIds: [11],
          createdBy: 9,
        }),
      ).rejects.toMatchObject({ message: `business_definition_registry_required:${resourceType}` });

      expect(prisma.brainRelease.findFirst).not.toHaveBeenCalled();
      expect(prisma.$transaction).not.toHaveBeenCalled();
    },
  );

  it('claims a draft atomically inside a serializable transaction and retries P2034 at most three times', async () => {
    const resourceVersion = {
      id: 11,
      checksum: 'a',
      resourceType: 'skill',
      resourceKey: 'customer_query',
      sourceResourceId: 31,
      snapshot: { permissions: [] },
    };
    const release = {
      id: 21,
      status: 'draft',
      scope: 'global',
      items: [
        {
          id: 101,
          resourceVersionId: 11,
          resourceType: 'skill',
          resourceKey: 'customer_query',
          resourceVersion,
        },
      ],
    };
    const tx = {
      $queryRaw: jest.fn().mockResolvedValue([]),
      brainRelease: {
        findUnique: jest.fn().mockResolvedValue(release),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        update: jest.fn().mockResolvedValue({ ...release, status: 'active' }),
      },
      brainCapabilityRegenerationJob: { findFirst: jest.fn().mockResolvedValue(null) },
      brainEvalRun: { findFirst: jest.fn().mockResolvedValue({ summary: passingEvalSummary(release.items) }) },
      brainResourceVersion: { updateMany: jest.fn(), update: jest.fn() },
      brainSkillRegistry: { updateMany: jest.fn(), update: jest.fn() },
    };
    const prisma = {
      brainRelease: { findUnique: jest.fn().mockResolvedValue(release) },
      brainEvalRun: { findFirst: jest.fn().mockResolvedValue({ summary: passingEvalSummary(release.items) }) },
      role: { findMany: jest.fn().mockResolvedValue([]) },
      brainSkillRegistry: { findMany: jest.fn().mockResolvedValue([]) },
      $transaction: jest
        .fn()
        .mockRejectedValueOnce({ code: 'P2034' })
        .mockRejectedValueOnce({ code: 'P2034' })
        .mockImplementationOnce((callback) => callback(tx)),
    };
    const service = new BrainReleaseService(prisma as never);

    await expect(service.activateRelease({ releaseId: 21, activatedBy: 9 })).resolves.toMatchObject({
      status: 'active',
    });

    expect(prisma.$transaction).toHaveBeenCalledTimes(3);
    expect(prisma.$transaction).toHaveBeenLastCalledWith(expect.any(Function), {
      isolationLevel: 'Serializable',
      maxWait: 10_000,
      timeout: 300_000,
    });
    expect(tx.brainRelease.updateMany).toHaveBeenCalledWith({
      where: { id: 21, status: 'draft' },
      data: { status: 'active', activatedAt: expect.any(Date), failureReason: null },
    });
  });

  it('fails activation when another transaction already claimed the draft', async () => {
    const resourceVersion = {
      id: 11,
      checksum: 'a',
      resourceType: 'skill',
      resourceKey: 'customer_query',
      sourceResourceId: 31,
      snapshot: { permissions: [] },
    };
    const release = {
      id: 21,
      status: 'draft',
      scope: 'global',
      items: [
        { id: 101, resourceVersionId: 11, resourceType: 'skill', resourceKey: 'customer_query', resourceVersion },
      ],
    };
    const tx = {
      $queryRaw: jest.fn().mockResolvedValue([]),
      brainRelease: { findUnique: jest.fn().mockResolvedValue(release), updateMany: jest.fn().mockResolvedValue({ count: 0 }), update: jest.fn() },
      brainCapabilityRegenerationJob: { findFirst: jest.fn().mockResolvedValue(null) },
      brainEvalRun: { findFirst: jest.fn().mockResolvedValue({ summary: passingEvalSummary(release.items) }) },
    };
    const prisma = {
      brainRelease: { findUnique: jest.fn().mockResolvedValue(release) },
      brainEvalRun: { findFirst: jest.fn().mockResolvedValue({ summary: passingEvalSummary(release.items) }) },
      role: { findMany: jest.fn().mockResolvedValue([]) },
      brainSkillRegistry: { findMany: jest.fn().mockResolvedValue([]) },
      $transaction: jest.fn((callback) => callback(tx)),
    };
    const service = new BrainReleaseService(prisma as never);

    await expect(service.activateRelease({ releaseId: 21, activatedBy: 9 })).rejects.toMatchObject({
      name: 'ConflictException',
      message: 'release_activation_conflict',
    });
  });

  it('rechecks the release gate fingerprint after locking release resources', async () => {
    const originalVersion = {
      id: 11,
      checksum: 'a'.repeat(64),
      resourceType: 'skill',
      resourceKey: 'customer_facts',
      sourceResourceId: null,
      snapshot: {},
    };
    const changedVersion = { ...originalVersion, checksum: 'b'.repeat(64) };
    const originalRelease = {
      id: 21,
      status: 'draft',
      scope: 'percentage',
      items: [{ resourceVersionId: 11, resourceType: 'skill', resourceKey: 'customer_facts', resourceVersion: originalVersion }],
    };
    const lockedRelease = {
      ...originalRelease,
      items: [{ resourceVersionId: 11, resourceType: 'skill', resourceKey: 'customer_facts', resourceVersion: changedVersion }],
    };
    const evalSummary = passingEvalSummary(originalRelease.items);
    const tx = {
      $queryRaw: jest.fn().mockResolvedValue([]),
      brainRelease: { findUnique: jest.fn().mockResolvedValue(lockedRelease) },
      brainCapabilityRegenerationJob: { findFirst: jest.fn().mockResolvedValue(null) },
      brainEvalRun: { findFirst: jest.fn().mockResolvedValue({ summary: evalSummary }) },
    };
    const prisma = {
      brainRelease: { findUnique: jest.fn().mockResolvedValue(originalRelease) },
      brainCapabilityRegenerationJob: { findFirst: jest.fn().mockResolvedValue(null) },
      brainEvalRun: { findFirst: jest.fn().mockResolvedValue({ summary: evalSummary }) },
      role: { findMany: jest.fn().mockResolvedValue([]) },
      brainSkillRegistry: { findMany: jest.fn().mockResolvedValue([]) },
      $transaction: jest.fn((callback) => callback(tx)),
    };
    const service = new BrainReleaseService(prisma as never);

    await expect(service.activateRelease({ releaseId: 21, activatedBy: 9 })).rejects.toMatchObject({
      message: 'release_eval_fingerprint_mismatch',
    });
    expect(tx.brainRelease.findUnique).toHaveBeenCalled();
    expect(tx.brainEvalRun.findFirst).toHaveBeenCalled();
  });

  it('maps three activation serialization conflicts to ConflictException', async () => {
    const resourceVersion = {
      id: 11,
      checksum: 'a'.repeat(64),
      resourceType: 'skill',
      resourceKey: 'customer_query',
      sourceResourceId: 31,
      snapshot: { permissions: [] },
    };
    const release = {
      id: 21,
      status: 'draft',
      scope: 'global',
      items: [
        {
          id: 101,
          resourceVersionId: 11,
          resourceType: 'skill',
          resourceKey: 'customer_query',
          resourceVersion,
        },
      ],
    };
    const prisma = {
      brainRelease: {
        findUnique: jest.fn().mockResolvedValue(release),
      },
      brainEvalRun: { findFirst: jest.fn().mockResolvedValue({ summary: passingEvalSummary(release.items) }) },
      role: { findMany: jest.fn().mockResolvedValue([]) },
      brainSkillRegistry: { findMany: jest.fn().mockResolvedValue([]) },
      $transaction: jest.fn().mockRejectedValue({ code: 'P2034' }),
    };
    const service = new BrainReleaseService(prisma as never);

    await expect(service.activateRelease({ releaseId: 21, activatedBy: 9 })).rejects.toMatchObject({
      name: 'ConflictException',
      message: 'release_activation_conflict',
    });
    expect(prisma.$transaction).toHaveBeenCalledTimes(3);
  });

  it('rejects mixed create-release versions when a legacy semantic resource appears after a non-semantic resource', async () => {
    const versions = [
      { id: 11, resourceType: 'skill', resourceKey: 'customer_query', version: 1, status: 'draft', snapshot: {} },
      { id: 12, resourceType: 'metric', resourceKey: 'paid_revenue', version: 1, status: 'draft', snapshot: {} },
    ];
    const prisma = {
      brainResourceVersion: { findMany: jest.fn().mockResolvedValue(versions) },
      brainRelease: { findFirst: jest.fn() },
      $transaction: jest.fn(),
    };
    const service = new BrainReleaseService(prisma as never);

    await expect(
      service.createRelease({
        releaseKey: 'brain-r1',
        scope: 'global',
        rollout: {},
        resourceVersionIds: [11, 12],
        createdBy: 9,
      }),
    ).rejects.toMatchObject({ message: 'business_definition_registry_required:metric' });

    expect(prisma.brainRelease.findFirst).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('blocks activation when no completed passing eval exists', async () => {
    const resourceVersion = {
      id: 11,
      checksum: 'b'.repeat(64),
      resourceType: 'skill',
      resourceKey: 'customer_query',
      sourceResourceId: 31,
      snapshot: {},
    };
    const prisma = {
      brainRelease: {
        findUnique: jest.fn().mockResolvedValue({
          id: 21,
          status: 'draft',
          scope: 'global',
          items: [
            {
              id: 101,
              resourceVersionId: 11,
              resourceType: 'skill',
              resourceKey: 'customer_query',
              resourceVersion,
            },
          ],
        }),
      },
      brainEvalRun: { findFirst: jest.fn().mockResolvedValue(null) },
      $transaction: jest.fn(),
    };
    const service = new BrainReleaseService(prisma as never);

    await expect(service.activateRelease({ releaseId: 21, activatedBy: 9 })).rejects.toMatchObject({
      message: 'release_eval_gate_failed',
    });
    expect(prisma.brainEvalRun.findFirst).toHaveBeenCalledTimes(1);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('rejects a passing development sample that is not bound to the full release gate fingerprint', async () => {
    const resourceVersion = {
      id: 11,
      checksum: 'a'.repeat(64),
      resourceType: 'skill',
      resourceKey: 'customer_facts',
      sourceResourceId: null,
      snapshot: {},
    };
    const release = {
      id: 21,
      status: 'draft',
      scope: 'percentage',
      items: [{ resourceVersionId: 11, resourceType: 'skill', resourceKey: 'customer_facts', resourceVersion }],
    };
    const prisma = {
      brainRelease: { findUnique: jest.fn().mockResolvedValue(release) },
      brainCapabilityRegenerationJob: { findFirst: jest.fn().mockResolvedValue(null) },
      brainEvalRun: {
        findFirst: jest.fn().mockResolvedValue({
          summary: { total: 1, passed: 1, failed: 0, canRelease: true, gateMode: 'development_sample' },
        }),
      },
    };
    const service = new BrainReleaseService(prisma as never);

    await expect(service.activateRelease({ releaseId: 21, activatedBy: 9 })).rejects.toMatchObject({
      message: 'release_eval_gate_incomplete',
    });
  });

  it('revalidates generated capability lineage and canonical semantics before activation', async () => {
    const evaluationSnapshot = { definitions: [], snapshotFingerprint: 'e'.repeat(64) };
    const resourceVersion = {
      id: 11,
      resourceType: 'skill',
      resourceKey: 'product_sales_ranking',
      sourceResourceId: 31,
      snapshot: {
        generatedCapability: true,
        sourceFingerprint: 'a'.repeat(64),
        definitionRefs: [{ versionId: 71 }],
      },
    };
    const sourceRow = {
      id: 31,
      skillKey: 'product_sales_ranking',
      version: 1,
      sourceFingerprint: 'tampered',
    };
    const semanticVerifier = {
      loadEvaluationSnapshot: jest.fn().mockResolvedValue(evaluationSnapshot),
      verifyStoredCapabilities: jest.fn().mockRejectedValue(new Error('generated_capability_source_snapshot_mismatch')),
    };
    const release = {
      id: 21,
      status: 'draft',
      scope: 'global',
      items: [
        {
          id: 101,
          resourceVersionId: 11,
          resourceType: 'skill',
          resourceKey: 'product_sales_ranking',
          resourceVersion,
        },
      ],
    };
    const prisma = {
      brainRelease: {
        findUnique: jest.fn().mockResolvedValue(release),
      },
      brainEvalRun: { findFirst: jest.fn().mockResolvedValue({ summary: passingEvalSummary(release.items) }) },
      role: { findMany: jest.fn().mockResolvedValue([]) },
      brainSkillRegistry: {
        findMany: jest.fn().mockResolvedValueOnce([sourceRow]).mockResolvedValueOnce([]),
      },
      $transaction: jest.fn(),
    };
    const service = new BrainReleaseService(prisma as never, semanticVerifier as never);

    await expect(service.activateRelease({ releaseId: 21, activatedBy: 9 })).rejects.toThrow(
      'generated_capability_source_snapshot_mismatch',
    );
    expect(prisma.brainSkillRegistry.findMany).toHaveBeenCalledWith({ where: { id: { in: [31] } } });
    expect(semanticVerifier.loadEvaluationSnapshot).toHaveBeenCalledWith([71]);
    expect(semanticVerifier.verifyStoredCapabilities).toHaveBeenCalledWith(
      [{ snapshot: resourceVersion.snapshot, sourceRow }],
      evaluationSnapshot,
    );
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('batch-loads generated source rows and invokes one semantic snapshot verification per release operation', async () => {
    const evaluationSnapshot = { definitions: [], snapshotFingerprint: 'e'.repeat(64) };
    const versions = [1, 2].map((id) => ({
      id,
      checksum: String(id).repeat(64),
      resourceType: 'skill',
      resourceKey: `generated_${id}`,
      sourceResourceId: id + 30,
      snapshot: { generatedCapability: true, definitionRefs: [{ versionId: id + 70 }] },
    }));
    const sourceRows = versions.map((version) => ({ id: version.sourceResourceId, skillKey: version.resourceKey }));
    const semanticVerifier = {
      loadEvaluationSnapshot: jest.fn().mockResolvedValue(evaluationSnapshot),
      verifyStoredCapabilities: jest.fn().mockRejectedValue(new Error('stop_after_batch_verification')),
    };
    const release = {
      id: 21,
      status: 'draft',
      scope: 'global',
      items: versions.map((resourceVersion) => ({
        resourceVersionId: resourceVersion.id,
        resourceType: resourceVersion.resourceType,
        resourceKey: resourceVersion.resourceKey,
        resourceVersion,
      })),
    };
    const prisma = {
      brainRelease: {
        findUnique: jest.fn().mockResolvedValue(release),
      },
      brainEvalRun: { findFirst: jest.fn().mockResolvedValue({ summary: passingEvalSummary(release.items) }) },
      brainSkillRegistry: { findMany: jest.fn().mockResolvedValue(sourceRows) },
      $transaction: jest.fn(),
    };
    const service = new BrainReleaseService(prisma as never, semanticVerifier as never);

    await expect(service.activateRelease({ releaseId: 21, activatedBy: 9 })).rejects.toThrow(
      'stop_after_batch_verification',
    );

    expect(prisma.brainSkillRegistry.findMany).toHaveBeenCalledTimes(1);
    expect(prisma.brainSkillRegistry.findMany).toHaveBeenCalledWith({ where: { id: { in: [31, 32] } } });
    expect(semanticVerifier.verifyStoredCapabilities).toHaveBeenCalledTimes(1);
    expect(semanticVerifier.loadEvaluationSnapshot).toHaveBeenCalledWith([71, 72]);
    expect(semanticVerifier.verifyStoredCapabilities).toHaveBeenCalledWith(
      [
        { snapshot: versions[0]!.snapshot, sourceRow: sourceRows[0] },
        { snapshot: versions[1]!.snapshot, sourceRow: sourceRows[1] },
      ],
      evaluationSnapshot,
    );
  });

  it('rejects mixed activation when the second release item is semantic even if its resource version is not', async () => {
    const tx = {
      brainRelease: { updateMany: jest.fn(), update: jest.fn().mockResolvedValue({ id: 21, status: 'active' }) },
      brainResourceVersion: { updateMany: jest.fn(), update: jest.fn() },
      brainSkillRegistry: { updateMany: jest.fn(), update: jest.fn() },
      brainInspectionRule: { updateMany: jest.fn(), update: jest.fn() },
    };
    const prisma = {
      brainRelease: {
        findUnique: jest.fn().mockResolvedValue({
          id: 21,
          status: 'draft',
          scope: 'global',
          items: [
            {
              id: 101,
              resourceVersionId: 11,
              resourceType: 'skill',
              resourceKey: 'customer_query',
              resourceVersion: {
                id: 11,
                resourceType: 'skill',
                resourceKey: 'customer_query',
                sourceResourceId: 31,
                snapshot: {},
              },
            },
            {
              id: 102,
              resourceVersionId: 12,
              resourceType: 'metric',
              resourceKey: 'paid_revenue',
              resourceVersion: {
                id: 12,
                resourceType: 'inspection_rule',
                resourceKey: 'paid_revenue',
                sourceResourceId: 32,
                snapshot: {},
              },
            },
          ],
        }),
      },
      brainEvalRun: { findFirst: jest.fn().mockResolvedValue({ summary: { canRelease: true, total: 1 } }) },
      role: { findMany: jest.fn().mockResolvedValue([]) },
      brainSkillRegistry: { findMany: jest.fn().mockResolvedValue([]) },
      $transaction: jest.fn((callback) => callback(tx)),
    };
    const service = new BrainReleaseService(prisma as never);

    await expect(service.activateRelease({ releaseId: 21, activatedBy: 9 })).rejects.toMatchObject({
      message: 'business_definition_registry_required:metric',
    });

    expect(prisma.brainEvalRun.findFirst).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('rejects activation when non-semantic release item and resource version types do not match', async () => {
    const tx = {
      brainRelease: { updateMany: jest.fn(), update: jest.fn().mockResolvedValue({ id: 21, status: 'active' }) },
      brainResourceVersion: { updateMany: jest.fn(), update: jest.fn() },
      brainAgentProfile: { updateMany: jest.fn(), update: jest.fn() },
    };
    const prisma = {
      brainRelease: {
        findUnique: jest.fn().mockResolvedValue({
          id: 21,
          status: 'draft',
          scope: 'global',
          items: [
            {
              id: 103,
              resourceVersionId: 11,
              resourceType: 'skill',
              resourceKey: 'shared_key',
              resourceVersion: {
                id: 11,
                resourceType: 'agent_profile',
                resourceKey: 'shared_key',
                sourceResourceId: 31,
                snapshot: {},
              },
            },
          ],
        }),
      },
      brainEvalRun: { findFirst: jest.fn().mockResolvedValue({ summary: { canRelease: true, total: 1 } }) },
      role: { findMany: jest.fn().mockResolvedValue([]) },
      brainSkillRegistry: { findMany: jest.fn().mockResolvedValue([]) },
      $transaction: jest.fn((callback) => callback(tx)),
    };
    const service = new BrainReleaseService(prisma as never);

    await expect(service.activateRelease({ releaseId: 21, activatedBy: 9 })).rejects.toMatchObject({
      message: 'release_resource_item_mismatch:103',
    });

    expect(prisma.brainEvalRun.findFirst).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it.each(['metric', 'ontology_entity', 'ontology_relation'] as const)(
    'rejects activation when only the resource version side is legacy semantic type %s',
    async (resourceType) => {
      const prisma = {
        brainRelease: {
          findUnique: jest.fn().mockResolvedValue({
            id: 21,
            status: 'draft',
            scope: 'global',
            items: [
              {
                id: 104,
                resourceVersionId: 11,
                resourceType: 'skill',
                resourceKey: 'shared_key',
                resourceVersion: {
                  id: 11,
                  resourceType,
                  resourceKey: 'shared_key',
                  sourceResourceId: 31,
                  snapshot: {},
                },
              },
            ],
          }),
        },
        brainEvalRun: { findFirst: jest.fn() },
        $transaction: jest.fn(),
      };
      const service = new BrainReleaseService(prisma as never);

      await expect(service.activateRelease({ releaseId: 21, activatedBy: 9 })).rejects.toMatchObject({
        message: `business_definition_registry_required:${resourceType}`,
      });

      expect(prisma.brainEvalRun.findFirst).not.toHaveBeenCalled();
      expect(prisma.$transaction).not.toHaveBeenCalled();
    },
  );

  it.each([
    ['metric', 'brainMetric'],
    ['ontology_entity', 'brainOntologyEntity'],
    ['ontology_relation', 'brainOntologyRelation'],
  ] as const)(
    'rejects activating a release containing legacy semantic resource %s before transaction or source writes',
    async (resourceType, sourceModel) => {
      const resourceVersion = {
        id: 11,
        resourceType,
        resourceKey: 'legacy_definition',
        sourceResourceId: 31,
        snapshot: {},
      };
      const sourceUpdateMany = jest.fn();
      const sourceUpdate = jest.fn();
      const tx = {
        brainRelease: { updateMany: jest.fn(), update: jest.fn().mockResolvedValue({ id: 21, status: 'active' }) },
        brainResourceVersion: { updateMany: jest.fn(), update: jest.fn() },
        [sourceModel]: { updateMany: sourceUpdateMany, update: sourceUpdate },
      };
      const prisma = {
        brainRelease: {
          findUnique: jest.fn().mockResolvedValue({
            id: 21,
            status: 'draft',
            scope: 'global',
            items: [{ resourceVersionId: 11, resourceType, resourceKey: 'legacy_definition', resourceVersion }],
          }),
        },
        brainEvalRun: { findFirst: jest.fn().mockResolvedValue({ summary: { canRelease: true, total: 1 } }) },
        role: { findMany: jest.fn().mockResolvedValue([]) },
        brainSkillRegistry: { findMany: jest.fn().mockResolvedValue([]) },
        $transaction: jest.fn((callback) => callback(tx)),
      };
      const service = new BrainReleaseService(prisma as never);

      await expect(service.activateRelease({ releaseId: 21, activatedBy: 9 })).rejects.toMatchObject({
        message: `business_definition_registry_required:${resourceType}`,
      });

      expect(prisma.brainEvalRun.findFirst).not.toHaveBeenCalled();
      expect(prisma.$transaction).not.toHaveBeenCalled();
      expect(sourceUpdateMany).not.toHaveBeenCalled();
      expect(sourceUpdate).not.toHaveBeenCalled();
    },
  );

  it('selects a store-scoped canary only for matching stores', async () => {
    const prisma = {
      brainRelease: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 2,
            releaseKey: 'canary',
            scope: 'store',
            rollout: { storeIds: [6] },
            activatedAt: new Date('2026-07-11'),
            items: [],
          },
          { id: 1, releaseKey: 'stable', scope: 'global', rollout: {}, activatedAt: new Date('2026-07-10'), items: [] },
        ]),
      },
    };
    const service = new BrainReleaseService(prisma as never);

    await expect(service.selectRelease({ storeId: 6, userId: 9, roleKey: 'store_manager' })).resolves.toMatchObject({
      releaseKey: 'canary',
    });
    await expect(service.selectRelease({ storeId: 7, userId: 9, roleKey: 'store_manager' })).resolves.toMatchObject({
      releaseKey: 'stable',
    });
  });

  it('selects a user-scoped canary only for the approved user, store and normalized role', async () => {
    const prisma = {
      brainRelease: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 2,
            releaseKey: 'manager-pilot',
            scope: 'user',
            rollout: { userIds: [28], storeIds: [6], roleKeys: ['store_manager'] },
            activatedAt: new Date('2026-07-11'),
            items: [],
          },
          { id: 1, releaseKey: 'stable', scope: 'global', rollout: {}, activatedAt: new Date('2026-07-10'), items: [] },
        ]),
      },
    };
    const service = new BrainReleaseService(prisma as never);

    await expect(service.selectRelease({ storeId: 6, userId: 28, roleKey: 'store_manager' })).resolves.toMatchObject({
      releaseKey: 'manager-pilot',
    });
    await expect(service.selectRelease({ storeId: 6, userId: 29, roleKey: 'store_manager' })).resolves.toMatchObject({
      releaseKey: 'stable',
    });
    await expect(service.selectRelease({ storeId: 7, userId: 28, roleKey: 'store_manager' })).resolves.toMatchObject({
      releaseKey: 'stable',
    });
    await expect(service.selectRelease({ storeId: 6, userId: 28, roleKey: 'finance' })).resolves.toMatchObject({
      releaseKey: 'stable',
    });
  });

  it('claims an active release atomically during rollback and retries P2034', async () => {
    const current = { id: 22, status: 'active', previousReleaseId: 21 };
    const previousVersion = {
      id: 11,
      resourceType: 'agent_profile',
      resourceKey: 'store_manager',
      sourceResourceId: 31,
      snapshot: {},
    };
    const previous = {
      id: 21,
      status: 'archived',
      items: [
        {
          resourceVersionId: 11,
          resourceType: 'agent_profile',
          resourceKey: 'store_manager',
          resourceVersion: previousVersion,
        },
      ],
    };
    const tx = {
      brainRelease: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        update: jest.fn().mockImplementation(({ where }) => ({ id: where.id, status: 'active', items: [] })),
      },
      brainResourceVersion: { updateMany: jest.fn(), update: jest.fn() },
      brainAgentProfile: { updateMany: jest.fn(), update: jest.fn() },
    };
    const prisma = {
      brainRelease: { findUnique: jest.fn().mockResolvedValueOnce(current).mockResolvedValueOnce(previous) },
      role: { findMany: jest.fn().mockResolvedValue([]) },
      brainSkillRegistry: { findMany: jest.fn().mockResolvedValue([]) },
      $transaction: jest
        .fn()
        .mockRejectedValueOnce({ code: 'P2034' })
        .mockImplementationOnce((callback) => callback(tx)),
    };
    const service = new BrainReleaseService(prisma as never);

    await service.rollbackRelease({ releaseId: 22, reason: 'test' });

    expect(prisma.$transaction).toHaveBeenCalledTimes(2);
    expect(prisma.$transaction).toHaveBeenLastCalledWith(expect.any(Function), {
      isolationLevel: 'Serializable',
      maxWait: 10_000,
      timeout: 30_000,
    });
    expect(tx.brainRelease.updateMany).toHaveBeenCalledWith({
      where: { id: 22, status: 'active' },
      data: { status: 'rolled_back', rolledBackAt: expect.any(Date), failureReason: 'test' },
    });
  });

  it('maps three rollback serialization conflicts to ConflictException', async () => {
    const current = { id: 22, status: 'active', previousReleaseId: 21 };
    const previousVersion = {
      id: 11,
      resourceType: 'agent_profile',
      resourceKey: 'store_manager',
      sourceResourceId: 31,
      snapshot: {},
    };
    const prisma = {
      brainRelease: {
        findUnique: jest
          .fn()
          .mockResolvedValueOnce(current)
          .mockResolvedValueOnce({
            id: 21,
            status: 'archived',
            items: [
              {
                resourceVersionId: 11,
                resourceType: 'agent_profile',
                resourceKey: 'store_manager',
                resourceVersion: previousVersion,
              },
            ],
          }),
      },
      role: { findMany: jest.fn().mockResolvedValue([]) },
      brainSkillRegistry: { findMany: jest.fn().mockResolvedValue([]) },
      $transaction: jest.fn().mockRejectedValue({ code: 'P2034' }),
    };
    const service = new BrainReleaseService(prisma as never);

    await expect(service.rollbackRelease({ releaseId: 22, reason: 'test' })).rejects.toMatchObject({
      name: 'ConflictException',
      message: 'release_rollback_conflict',
    });
    expect(prisma.$transaction).toHaveBeenCalledTimes(3);
  });

  it('archives the current resource version before restoring the previous release', async () => {
    const current = { id: 22, status: 'active', previousReleaseId: 21 };
    const previousVersion = {
      id: 11,
      resourceType: 'agent_profile',
      resourceKey: 'store_manager',
      sourceResourceId: 31,
    };
    const tx = {
      brainRelease: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        update: jest.fn().mockImplementation(({ where }) => ({ id: where.id, status: 'active', items: [] })),
      },
      brainResourceVersion: { updateMany: jest.fn(), update: jest.fn() },
      brainAgentProfile: { updateMany: jest.fn(), update: jest.fn() },
    };
    const prisma = {
      brainRelease: {
        findUnique: jest
          .fn()
          .mockResolvedValueOnce(current)
          .mockResolvedValueOnce({
            id: 21,
            items: [
              {
                resourceVersionId: 11,
                resourceType: 'agent_profile',
                resourceKey: 'store_manager',
                resourceVersion: previousVersion,
              },
            ],
          }),
      },
      role: { findMany: jest.fn().mockResolvedValue([]) },
      brainSkillRegistry: { findMany: jest.fn().mockResolvedValue([]) },
      $transaction: jest.fn((callback) => callback(tx)),
    };
    const service = new BrainReleaseService(prisma as never);

    await service.rollbackRelease({ releaseId: 22, reason: 'test' });

    expect(tx.brainResourceVersion.updateMany).toHaveBeenCalledWith({
      where: { resourceType: 'agent_profile', resourceKey: 'store_manager', status: 'active', id: { not: 11 } },
      data: { status: 'archived', archivedAt: expect.any(Date) },
    });
    expect(tx.brainAgentProfile.updateMany).toHaveBeenCalledWith({
      where: { roleKey: 'store_manager', enabled: true },
      data: { enabled: false },
    });
  });

  it('revalidates a previous generated capability against its source row and current published semantics before rollback', async () => {
    const publishedSnapshot = publishedSnapshotFixture();
    const proposal = generatedProposalFixture(publishedSnapshot);
    const staleManifest = { ...proposal.manifest, name: '旧商品销售排行' };
    const sourceRow = {
      id: 31,
      skillKey: staleManifest.key,
      version: staleManifest.version,
      sourceFingerprint: staleManifest.sourceFingerprint,
      name: staleManifest.name,
      description: staleManifest.description,
      domains: staleManifest.domains,
      intents: staleManifest.intents,
      inputSchema: staleManifest.inputSchema,
      outputSchema: staleManifest.outputSchema,
      permissions: staleManifest.requiredPermissions,
      allowedRoles: staleManifest.allowedRoles,
      readOnly: staleManifest.readOnly,
      sideEffect: staleManifest.sideEffect,
      riskLevel: staleManifest.riskLevel,
      requiresConfirmation: staleManifest.requiresConfirmation,
      idempotency: staleManifest.idempotency,
      timeoutMs: staleManifest.timeoutMs,
      grounding: staleManifest.grounding,
      examples: staleManifest.examples,
      definitionRefs: staleManifest.definitionRefs,
      synonyms: staleManifest.synonyms,
      negativeExamples: staleManifest.negativeExamples,
      successSchema: staleManifest.successSchema,
    };
    const resourceVersion = {
      id: 11,
      resourceType: 'skill',
      resourceKey: staleManifest.key,
      sourceResourceId: sourceRow.id,
      snapshot: {
        ...staleManifest,
        generatedCapability: true,
        sourceProposalVersion: 1,
        registryVersion: staleManifest.version,
        resourceKey: staleManifest.key,
      },
    };
    const prisma = {
      brainRelease: {
        findUnique: jest
          .fn()
          .mockResolvedValueOnce({ id: 22, status: 'active', previousReleaseId: 21 })
          .mockResolvedValueOnce({
            id: 21,
            items: [
              {
                id: 201,
                resourceVersionId: resourceVersion.id,
                resourceType: resourceVersion.resourceType,
                resourceKey: resourceVersion.resourceKey,
                resourceVersion,
              },
            ],
          }),
      },
      brainSkillRegistry: { findMany: jest.fn().mockResolvedValue([sourceRow]) },
      $transaction: jest.fn(),
    };
    const snapshotSource = {
      loadPublishedSnapshot: jest.fn().mockResolvedValue(publishedSnapshot),
      loadEvaluationSnapshot: jest.fn().mockResolvedValue(publishedSnapshot),
    };
    const semanticVerifier = new BrainCapabilitySemanticVerifierService(snapshotSource as never);
    const service = new BrainReleaseService(prisma as never, semanticVerifier);

    await expect(service.rollbackRelease({ releaseId: 22, reason: 'test' })).rejects.toMatchObject({
      message: 'generated_capability_semantics_mismatch',
    });

    expect(prisma.brainSkillRegistry.findMany).toHaveBeenCalledWith({ where: { id: { in: [sourceRow.id] } } });
    expect(snapshotSource.loadEvaluationSnapshot).toHaveBeenCalledWith(
      staleManifest.definitionRefs.map((ref) => ref.versionId),
    );
    expect(snapshotSource.loadPublishedSnapshot).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('blocks rollback before the transaction when a previous resource permission is no longer registered', async () => {
    const resourceVersion = {
      id: 11,
      resourceType: 'skill',
      resourceKey: 'customer_query',
      sourceResourceId: 31,
      snapshot: { permissions: ['core:customer:retired'] },
    };
    const prisma = {
      brainRelease: {
        findUnique: jest
          .fn()
          .mockResolvedValueOnce({ id: 22, status: 'active', previousReleaseId: 21 })
          .mockResolvedValueOnce({
            id: 21,
            items: [
              {
                id: 201,
                resourceVersionId: resourceVersion.id,
                resourceType: resourceVersion.resourceType,
                resourceKey: resourceVersion.resourceKey,
                resourceVersion,
              },
            ],
          }),
      },
      role: { findMany: jest.fn().mockResolvedValue([{ permissions: ['core:customer:view'] }]) },
      brainSkillRegistry: { findMany: jest.fn().mockResolvedValue([]) },
      $transaction: jest.fn(),
    };
    const service = new BrainReleaseService(prisma as never);

    await expect(service.rollbackRelease({ releaseId: 22, reason: 'test' })).rejects.toMatchObject({
      message: 'release_unregistered_permissions:core:customer:retired',
    });

    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('blocks rollback before the transaction when a previous agent profile depends on a retired skill', async () => {
    const resourceVersion = {
      id: 11,
      resourceType: 'agent_profile',
      resourceKey: 'store_manager',
      sourceResourceId: 31,
      snapshot: { permissions: ['core:customer:view'], allowedSkills: ['retired_skill'] },
    };
    const prisma = {
      brainRelease: {
        findUnique: jest
          .fn()
          .mockResolvedValueOnce({ id: 22, status: 'active', previousReleaseId: 21 })
          .mockResolvedValueOnce({
            id: 21,
            items: [
              {
                id: 201,
                resourceVersionId: resourceVersion.id,
                resourceType: resourceVersion.resourceType,
                resourceKey: resourceVersion.resourceKey,
                resourceVersion,
              },
            ],
          }),
      },
      role: { findMany: jest.fn().mockResolvedValue([{ permissions: ['core:customer:view'] }]) },
      brainSkillRegistry: { findMany: jest.fn().mockResolvedValue([]) },
      $transaction: jest.fn(),
    };
    const service = new BrainReleaseService(prisma as never);

    await expect(service.rollbackRelease({ releaseId: 22, reason: 'test' })).rejects.toMatchObject({
      message: 'release_missing_skills:retired_skill',
    });

    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it.each([
    ['metric', 'brainMetric'],
    ['ontology_entity', 'brainOntologyEntity'],
    ['ontology_relation', 'brainOntologyRelation'],
  ] as const)(
    'rejects rollback to legacy semantic resource %s before transaction or source writes',
    async (resourceType, sourceModel) => {
      const current = { id: 22, status: 'active', previousReleaseId: 21 };
      const resourceVersion = {
        id: 11,
        resourceType,
        resourceKey: 'legacy_definition',
        sourceResourceId: 31,
      };
      const sourceUpdateMany = jest.fn();
      const sourceUpdate = jest.fn();
      const tx = {
        brainRelease: { update: jest.fn() },
        brainResourceVersion: { updateMany: jest.fn(), update: jest.fn() },
        [sourceModel]: { updateMany: sourceUpdateMany, update: sourceUpdate },
      };
      const prisma = {
        brainRelease: {
          findUnique: jest
            .fn()
            .mockResolvedValueOnce(current)
            .mockResolvedValueOnce({
              id: 21,
              items: [{ resourceVersionId: 11, resourceType, resourceKey: 'legacy_definition', resourceVersion }],
            }),
        },
        $transaction: jest.fn((callback) => callback(tx)),
      };
      const service = new BrainReleaseService(prisma as never);

      await expect(service.rollbackRelease({ releaseId: 22, reason: 'test' })).rejects.toMatchObject({
        message: `business_definition_registry_required:${resourceType}`,
      });

      expect(prisma.$transaction).not.toHaveBeenCalled();
      expect(sourceUpdateMany).not.toHaveBeenCalled();
      expect(sourceUpdate).not.toHaveBeenCalled();
    },
  );

  it('rejects mixed rollback when the second release item is semantic even if its resource version is not', async () => {
    const current = { id: 22, status: 'active', previousReleaseId: 21 };
    const tx = {
      brainRelease: { update: jest.fn().mockResolvedValue({ id: 21, status: 'active' }) },
      brainResourceVersion: { updateMany: jest.fn(), update: jest.fn() },
      brainAgentProfile: { updateMany: jest.fn(), update: jest.fn() },
      brainInspectionRule: { updateMany: jest.fn(), update: jest.fn() },
    };
    const prisma = {
      brainRelease: {
        findUnique: jest
          .fn()
          .mockResolvedValueOnce(current)
          .mockResolvedValueOnce({
            id: 21,
            items: [
              {
                id: 201,
                resourceVersionId: 11,
                resourceType: 'agent_profile',
                resourceKey: 'store_manager',
                resourceVersion: {
                  id: 11,
                  resourceType: 'agent_profile',
                  resourceKey: 'store_manager',
                  sourceResourceId: 31,
                },
              },
              {
                id: 202,
                resourceVersionId: 12,
                resourceType: 'ontology_relation',
                resourceKey: 'customer_has_order',
                resourceVersion: {
                  id: 12,
                  resourceType: 'inspection_rule',
                  resourceKey: 'customer_has_order',
                  sourceResourceId: 32,
                },
              },
            ],
          }),
      },
      $transaction: jest.fn((callback) => callback(tx)),
    };
    const service = new BrainReleaseService(prisma as never);

    await expect(service.rollbackRelease({ releaseId: 22, reason: 'test' })).rejects.toMatchObject({
      message: 'business_definition_registry_required:ontology_relation',
    });

    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('rejects rollback when non-semantic release item and resource version keys do not match', async () => {
    const current = { id: 22, status: 'active', previousReleaseId: 21 };
    const tx = {
      brainRelease: { update: jest.fn().mockResolvedValue({ id: 21, status: 'active' }) },
      brainResourceVersion: { updateMany: jest.fn(), update: jest.fn() },
      brainSkillRegistry: { updateMany: jest.fn(), update: jest.fn() },
    };
    const prisma = {
      brainRelease: {
        findUnique: jest
          .fn()
          .mockResolvedValueOnce(current)
          .mockResolvedValueOnce({
            id: 21,
            items: [
              {
                id: 203,
                resourceVersionId: 11,
                resourceType: 'skill',
                resourceKey: 'customer_query',
                resourceVersion: {
                  id: 11,
                  resourceType: 'skill',
                  resourceKey: 'customer_lookup',
                  sourceResourceId: 31,
                },
              },
            ],
          }),
      },
      $transaction: jest.fn((callback) => callback(tx)),
    };
    const service = new BrainReleaseService(prisma as never);

    await expect(service.rollbackRelease({ releaseId: 22, reason: 'test' })).rejects.toMatchObject({
      message: 'release_resource_item_mismatch:203',
    });

    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});
