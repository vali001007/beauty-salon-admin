import { buildAmiBrainProductAcceptance } from './ami-brain-product-acceptance.js';
import { caseIdsChecksum, type AmiBrainSuiteManifest } from './ami-brain-suite-manifest.js';

const sourceCommit = 'a'.repeat(40);
const releaseFingerprint = 'b'.repeat(64);
const suiteManifestChecksum = 'c'.repeat(64);
const sourceChecksum = 'd'.repeat(64);

function fixture() {
  const coreIds = Array.from({ length: 350 }, (_, index) => `case-${String(index + 1).padStart(4, '0')}`);
  const deltaIds = Array.from({ length: 690 }, (_, index) => `case-${String(index + 351).padStart(4, '0')}`);
  const standardIds = [...coreIds, ...deltaIds];
  const goldIds = Array.from({ length: 100 }, (_, index) => `gold-${String(index + 1).padStart(3, '0')}`);
  const rotationIds = Array.from({ length: 960 }, (_, index) => `case-${String(index + 1041).padStart(4, '0')}`);
  const manifest: AmiBrainSuiteManifest = {
    schemaVersion: 'ami-brain-suite-manifest/v1',
    manifestVersion: '2026-07-28-v2',
    generatedAt: '2026-07-28T00:00:00.000Z',
    sourceBaseline: {
      key: 'baseline-v1',
      label: 'baseline',
      path: 'fixtures/baseline.csv',
      checksum: sourceChecksum,
      caseCount: 2000,
    },
    productLoopEligibility: {
      schemaVersion: 'ami-brain-product-loop-eligibility/v1',
      path: 'fixtures/product-loop.json',
      checksum: 'e'.repeat(64),
      sourceBaselineChecksum: sourceChecksum,
      caseCount: 2000,
      baselineCaseCount: 2000,
      caseIdsChecksum: caseIdsChecksum([...standardIds, ...rotationIds]),
      supplementalRegistry: {
        schemaVersion: 'ami-brain-supplemental-question-registry/v1',
        path: 'fixtures/supplemental.json',
        checksum: 'f'.repeat(64),
        caseCount: 0,
      },
      dataFactsAudit: {
        schemaVersion: 'ami-brain-product-loop-data-facts/v1',
        path: 'fixtures/data-facts.json',
        checksum: '1'.repeat(64),
        schemaChecksum: '2'.repeat(64),
        snapshotChecksum: '3'.repeat(64),
        databaseHost: 'aws-1-ap-northeast-1.pooler.supabase.com',
        storeId: 6,
      },
    },
    governancePolicy: {},
    legacySubsets: { targeted12: coreIds.slice(0, 12), preflight140: coreIds.slice(0, 140) },
    productJourneys: {
      schemaVersion: 'ami-brain-product-journeys/v1',
      policy: 'fixture product journey policy',
      currentReleaseCaseIdsChecksum: caseIdsChecksum([coreIds[0]]),
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
            },
          ],
        },
      ],
    },
    suites: {
      releaseCore: {
        key: 'release-core',
        label: 'release core',
        caseCount: coreIds.length,
        caseIdsChecksum: caseIdsChecksum(coreIds),
        caseIds: coreIds,
      },
      standardRegression: {
        key: 'standard-regression',
        label: 'standard regression',
        caseCount: standardIds.length,
        caseIdsChecksum: caseIdsChecksum(standardIds),
        includesSuite: 'release-core',
        caseIds: standardIds,
      },
      extendedRotation: {
        key: 'extended-rotation',
        label: 'extended rotation',
        caseCount: rotationIds.length,
        caseIdsChecksum: caseIdsChecksum(rotationIds),
        caseIds: rotationIds,
      },
    },
    classificationSummary: { KEEP: 1040, ROTATE: 960, REMOVE: 0, REVIEW: 0 },
  };
  const goldStandardAcceptance = {
    contractVersion: 'ami-brain-gold-standard-acceptance/v1',
    status: 'ready',
    manifestVersion: '2026-07-29-v1',
    manifestChecksum: 'f'.repeat(64),
    caseCount: 100,
    auditQueryReady: 100,
    snapshotReady: 100,
    evaluated: 100,
    passed: 100,
    failed: 0,
    blockingReasons: [],
  };
  const common = {
    runKey: 'release416-v2',
    suiteManifestVersion: manifest.manifestVersion,
    suiteManifestChecksum,
    sourceChecksum,
    releaseFingerprint,
    sourceCommit,
    productionHealth: { commit: sourceCommit },
    activeRelease: { id: 21 },
    storeId: 6,
    failed: 0,
    providerUnavailable: 0,
    scorecards: {
      verifiedCapability: { total: 50, passed: 50 },
      suspectedFalseSuccess: { count: 0 },
    },
    goldStandardRunId: 503,
    goldStandardAcceptance,
  };
  const goldRun = {
    id: 503,
    status: 'completed',
    results: goldIds.map((caseKey) => ({
      caseKey,
      deterministicPassed: true,
      deterministicGrade: { goldCaseId: caseKey, passed: true, status: 'passed' },
    })),
    summary: {
      executionPurpose: 'standard_regression_internal_gold_standard',
      stage: 'standard-regression-gold-internal',
      pipelineIdentity: {
        contractVersion: 'ami-brain-gold-standard-runtime/v1',
        parentStandardRegressionRunId: 502,
        releaseId: 21,
        storeId: 6,
        releaseFingerprint,
        sourceCommit,
        runtimeCommit: sourceCommit,
        sourceChecksum,
        suiteManifestVersion: manifest.manifestVersion,
        suiteManifestChecksum,
        goldStandardManifestChecksum: 'f'.repeat(64),
        standardRegressionCaseIdsChecksum: manifest.suites.standardRegression.caseIdsChecksum,
      },
      completedCaseCount: 100,
      remainingCaseCount: 0,
      passed: 100,
      failed: 0,
      providerUnavailable: 0,
      acceptance: goldStandardAcceptance,
      compactResults: goldIds.map((goldCaseId) => ({ goldCaseId, passed: true, status: 'passed' })),
    },
  };
  return {
    manifest,
    coreIds,
    deltaIds,
    goldIds,
    goldRun,
    coreSummary: {
      ...common,
      runId: 501,
      stage: 'release-core',
      executionMode: 'full_suite',
      suiteCaseCount: coreIds.length,
      suiteCaseIdsChecksum: manifest.suites.releaseCore.caseIdsChecksum,
      total: coreIds.length,
      expectedTotal: coreIds.length,
    },
    standardSummary: {
      ...common,
      runId: 502,
      stage: 'standard-regression',
      executionMode: 'delta_after_release_core',
      suiteCaseCount: standardIds.length,
      suiteCaseIdsChecksum: manifest.suites.standardRegression.caseIdsChecksum,
      total: deltaIds.length,
      expectedTotal: deltaIds.length,
    },
  };
}

describe('buildAmiBrainProductAcceptance', () => {
  it('accepts an exact 350 core plus 690 delta fixture as one 1040-case pipeline', () => {
    const input = fixture();
    const evidence = buildAmiBrainProductAcceptance({
      releaseCoreRunId: 501,
      standardRegressionRunId: 502,
      storeId: 6,
      manifest: input.manifest,
      coreSummary: input.coreSummary,
      standardSummary: input.standardSummary,
      coreResultCaseIds: input.coreIds,
      standardDeltaResultCaseIds: input.deltaIds,
      goldStandardExpectedCaseIds: input.goldIds,
      goldStandardRun: input.goldRun,
      coreFinishedAt: new Date('2026-07-28T10:00:00.000Z'),
      now: new Date('2026-07-28T11:00:00.000Z'),
    });

    expect(evidence).toMatchObject({
      canActivate: true,
      blockingReasons: [],
      releaseCoreCaseCount: 350,
      standardDeltaCaseCount: 690,
      standardRegressionCaseCount: 1040,
      runKey: 'release416-v2',
      sourceCommit,
      runtimeCommit: sourceCommit,
      verifiedCapabilityTotal: 100,
      goldStandardCaseCount: 100,
      goldStandardPassed: 100,
    });
    expect(evidence.standardDeltaCaseIdsChecksum).toBe(caseIdsChecksum(input.deltaIds));
  });

  it('blocks a same-size delta that substitutes an unexpected case', () => {
    const input = fixture();
    const wrongDelta = [...input.deltaIds];
    wrongDelta[0] = 'case-unexpected';
    const evidence = buildAmiBrainProductAcceptance({
      releaseCoreRunId: 501,
      standardRegressionRunId: 502,
      storeId: 6,
      manifest: input.manifest,
      coreSummary: input.coreSummary,
      standardSummary: input.standardSummary,
      coreResultCaseIds: input.coreIds,
      standardDeltaResultCaseIds: wrongDelta,
      goldStandardExpectedCaseIds: input.goldIds,
      goldStandardRun: input.goldRun,
      coreFinishedAt: new Date('2026-07-28T10:00:00.000Z'),
      now: new Date('2026-07-28T11:00:00.000Z'),
    });

    expect(evidence.canActivate).toBe(false);
    expect(evidence.blockingReasons).toEqual(
      expect.arrayContaining([
        expect.stringContaining('standard_regression_delta_results:missing:'),
        expect.stringContaining('standard_regression_delta_results:unexpected:'),
      ]),
    );
  });

  it('blocks summaries from different run keys or runtime commits', () => {
    const input = fixture();
    const evidence = buildAmiBrainProductAcceptance({
      releaseCoreRunId: 501,
      standardRegressionRunId: 502,
      storeId: 6,
      manifest: input.manifest,
      coreSummary: input.coreSummary,
      standardSummary: {
        ...input.standardSummary,
        runKey: 'another-pipeline',
        productionHealth: { commit: 'e'.repeat(40) },
      },
      coreResultCaseIds: input.coreIds,
      standardDeltaResultCaseIds: input.deltaIds,
      goldStandardExpectedCaseIds: input.goldIds,
      goldStandardRun: input.goldRun,
      coreFinishedAt: new Date('2026-07-28T10:00:00.000Z'),
      now: new Date('2026-07-28T11:00:00.000Z'),
    });

    expect(evidence.canActivate).toBe(false);
    expect(evidence.blockingReasons).toEqual(
      expect.arrayContaining([
        'pipeline_identity_mismatch:runKey',
        'pipeline_identity_mismatch:runtime_commit',
        'pipeline_identity_invalid:source_runtime_commit',
      ]),
    );
  });

  it('blocks activation while the 100-case truth snapshot is not ready', () => {
    const input = fixture();
    const evidence = buildAmiBrainProductAcceptance({
      releaseCoreRunId: 501,
      standardRegressionRunId: 502,
      storeId: 6,
      manifest: input.manifest,
      coreSummary: input.coreSummary,
      standardSummary: {
        ...input.standardSummary,
        goldStandardAcceptance: {
          contractVersion: 'ami-brain-gold-standard-acceptance/v1',
          status: 'candidate_pending_truth_snapshot',
          manifestVersion: '2026-07-29-v1-candidate',
          manifestChecksum: 'f'.repeat(64),
          caseCount: 100,
          auditQueryReady: 0,
          snapshotReady: 0,
          evaluated: 0,
          passed: 0,
          failed: 0,
          blockingReasons: ['truth_snapshot_pending'],
        },
      },
      coreResultCaseIds: input.coreIds,
      standardDeltaResultCaseIds: input.deltaIds,
      goldStandardExpectedCaseIds: input.goldIds,
      goldStandardRun: input.goldRun,
      coreFinishedAt: new Date('2026-07-28T10:00:00.000Z'),
      now: new Date('2026-07-28T11:00:00.000Z'),
    });

    expect(evidence.canActivate).toBe(false);
    expect(evidence.blockingReasons).toEqual(
      expect.arrayContaining([
        'gold_standard_not_ready',
        'gold_standard_result_count_invalid',
        'gold_standard_fact_failures',
        'gold_standard_blocking_reasons',
      ]),
    );
  });

  it('blocks a missing or incomplete gold-standard child run even when the parent claims 100/100', () => {
    const input = fixture();
    const evidence = buildAmiBrainProductAcceptance({
      releaseCoreRunId: 501,
      standardRegressionRunId: 502,
      storeId: 6,
      manifest: input.manifest,
      coreSummary: input.coreSummary,
      standardSummary: input.standardSummary,
      coreResultCaseIds: input.coreIds,
      standardDeltaResultCaseIds: input.deltaIds,
      goldStandardExpectedCaseIds: input.goldIds,
      goldStandardRun: null,
      coreFinishedAt: new Date('2026-07-28T10:00:00.000Z'),
      now: new Date('2026-07-28T11:00:00.000Z'),
    });

    expect(evidence.canActivate).toBe(false);
    expect(evidence.blockingReasons).toContain('gold_standard_run_missing');
  });

  it('blocks a gold-standard child run with the wrong parent identity or a substituted result id', () => {
    const input = fixture();
    const evidence = buildAmiBrainProductAcceptance({
      releaseCoreRunId: 501,
      standardRegressionRunId: 502,
      storeId: 6,
      manifest: input.manifest,
      coreSummary: input.coreSummary,
      standardSummary: input.standardSummary,
      coreResultCaseIds: input.coreIds,
      standardDeltaResultCaseIds: input.deltaIds,
      goldStandardExpectedCaseIds: input.goldIds,
      goldStandardRun: {
        ...input.goldRun,
        results: [
          {
            caseKey: 'gold-unexpected',
            deterministicPassed: true,
            deterministicGrade: { goldCaseId: 'gold-unexpected', passed: true, status: 'passed' },
          },
          ...input.goldRun.results.slice(1),
        ],
        summary: {
          ...input.goldRun.summary,
          pipelineIdentity: {
            ...input.goldRun.summary.pipelineIdentity,
            parentStandardRegressionRunId: 999,
          },
        },
      },
      coreFinishedAt: new Date('2026-07-28T10:00:00.000Z'),
      now: new Date('2026-07-28T11:00:00.000Z'),
    });

    expect(evidence.canActivate).toBe(false);
    expect(evidence.blockingReasons).toEqual(
      expect.arrayContaining([
        'gold_standard_pipeline_identity_mismatch:parentStandardRegressionRunId',
        expect.stringContaining('gold_standard_results:missing:'),
        expect.stringContaining('gold_standard_results:unexpected:'),
      ]),
    );
  });

  it('blocks when an actual gold-standard result failed despite a 100/100 child summary', () => {
    const input = fixture();
    const evidence = buildAmiBrainProductAcceptance({
      releaseCoreRunId: 501,
      standardRegressionRunId: 502,
      storeId: 6,
      manifest: input.manifest,
      coreSummary: input.coreSummary,
      standardSummary: input.standardSummary,
      coreResultCaseIds: input.coreIds,
      standardDeltaResultCaseIds: input.deltaIds,
      goldStandardExpectedCaseIds: input.goldIds,
      goldStandardRun: {
        ...input.goldRun,
        results: input.goldRun.results.map((item, index) =>
          index === 0
            ? {
                ...item,
                deterministicPassed: false,
                deterministicGrade: { goldCaseId: item.caseKey, passed: false, status: 'comparison_failed' },
              }
            : item,
        ),
      },
      coreFinishedAt: new Date('2026-07-28T10:00:00.000Z'),
      now: new Date('2026-07-28T11:00:00.000Z'),
    });

    expect(evidence.canActivate).toBe(false);
    expect(evidence.blockingReasons).toContain('gold_standard_actual_results_failed:gold-001');
  });
});
