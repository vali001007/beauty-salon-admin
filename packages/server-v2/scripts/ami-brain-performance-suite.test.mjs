import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';
import {
  buildPerformanceAcceptance,
  buildPerformancePreflight,
  validatePerformanceManifest,
} from './ami-brain-performance-suite-core.mjs';

const repoRoot = resolve(process.cwd(), '..', '..');
const manifestPath = resolve(repoRoot, 'docs/04-测试数据/Ami-Brain-性能回归/ami-brain-performance-suite-v1.json');
const classificationPath = resolve(repoRoot, 'docs/04-测试数据/Ami-Brain-全领域题集治理/ami-brain-suite-classification-v2.csv');
const suitePath = resolve(repoRoot, 'docs/04-测试数据/Ami-Brain-全领域题集治理/ami-brain-suite-manifest-v2.json');

test('requires both a ready candidate and the completed identity-matched standard regression parent', () => {
  const commit = 'a'.repeat(40);
  const suiteManifestChecksum = 'b'.repeat(64);
  const expected = {
    standardRegressionRunId: 501,
    releaseId: 416,
    storeId: 6,
    runtimeCommit: commit,
    suiteManifestChecksum,
  };
  const preflight = buildPerformancePreflight({
    candidatePreflight: { ready: true, blockingReasons: [] },
    expected,
    parentRun: {
      id: 501,
      releaseId: 416,
      storeId: 6,
      status: 'completed',
      summary: {
        stage: 'standard-regression',
        executionMode: 'delta_after_release_core',
        runId: 501,
        activeRelease: { id: 416 },
        storeId: 6,
        sourceCommit: commit,
        productionHealth: { commit },
        suiteManifestChecksum,
        productAcceptance: { canActivate: true, standardRegressionRunId: 501 },
      },
    },
  });

  assert.equal(preflight.ready, true);
  assert.deepEqual(preflight.blockingReasons, []);
  assert.equal(preflight.parentStandardRegression.productAcceptanceReady, true);
});

test('keeps candidate and parent-run blockers visible in performance dry-run preflight', () => {
  const preflight = buildPerformancePreflight({
    candidatePreflight: {
      ready: false,
      blockingReasons: ['candidate_worktree_dirty:399', 'production_deployment_commit_missing'],
    },
    expected: {
      standardRegressionRunId: 501,
      releaseId: 416,
      storeId: 6,
      runtimeCommit: 'a'.repeat(40),
      suiteManifestChecksum: 'b'.repeat(64),
    },
    parentRun: null,
  });

  assert.equal(preflight.ready, false);
  assert.deepEqual(preflight.blockingReasons, [
    'candidate_worktree_dirty:399',
    'production_deployment_commit_missing',
    'standard_regression_parent_run_missing',
  ]);
});

test('validates the repository 20/20/10/10 performance manifest', () => {
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  const suiteManifestRaw = readFileSync(suitePath, 'utf8');
  const suite = JSON.parse(suiteManifestRaw);
  assert.doesNotThrow(() => validatePerformanceManifest(manifest, {
    classificationRaw: readFileSync(classificationPath, 'utf8'),
    suiteManifestRaw,
    productLoopRaw: readFileSync(resolve(repoRoot, suite.productLoopEligibility.path), 'utf8'),
  }));
  assert.deepEqual(Object.fromEntries(Object.entries(manifest.buckets).map(([key, value]) => [key, value.caseCount])), {
    quick: 20,
    single: 20,
    multi: 10,
    multiTurn: 10,
  });
});

test('treats missing latency evidence as blocking', () => {
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  const evidence = buildPerformanceAcceptance(manifest, {});
  assert.equal(evidence.status, 'blocked');
  assert.equal(evidence.blockingReasons.length, 5);
  assert.ok(evidence.blockingReasons.includes('performance_run_ids_invalid'));
  assert.equal(evidence.blockingReasons.filter((item) => item.endsWith(':missing_summary')).length, 4);
});

test('accepts complete same-candidate timing evidence within every budget', () => {
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  const identity = {
    activeRelease: { id: 21 },
    storeId: 6,
    sourceCommit: 'a'.repeat(40),
    releaseFingerprint: 'b'.repeat(64),
    productionHealth: { commit: 'a'.repeat(40) },
    suiteManifestChecksum: manifest.source.suiteManifestChecksum,
    failed: 0,
    providerUnavailable: 0,
    scorecards: { suspectedFalseSuccess: { count: 0 } },
  };
  const summaries = Object.fromEntries(Object.entries(manifest.buckets).map(([key, bucket], index) => [key, {
    ...identity,
    runId: 100 + index,
    total: bucket.caseCount,
    expectedTotal: bucket.caseCount,
    suiteCaseIdsChecksum: bucket.caseIdsChecksum,
    latencyBreakdown: {
      userResponse: {
        count: bucket.caseCount,
        p50Ms: bucket.budgetsMs.p50,
        p95Ms: bucket.budgetsMs.p95,
        maxMs: bucket.budgetsMs.max,
      },
    },
  }]));
  assert.equal(buildPerformanceAcceptance(manifest, summaries).status, 'ready');
});

test('blocks timing evidence produced against a different suite manifest', () => {
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  const summaries = Object.fromEntries(Object.entries(manifest.buckets).map(([key, bucket], index) => [key, {
    activeRelease: { id: 21 },
    storeId: 6,
    sourceCommit: 'a'.repeat(40),
    releaseFingerprint: 'b'.repeat(64),
    productionHealth: { commit: 'a'.repeat(40) },
    suiteManifestChecksum: 'c'.repeat(64),
    failed: 0,
    providerUnavailable: 0,
    scorecards: { suspectedFalseSuccess: { count: 0 } },
    runId: 100 + index,
    total: bucket.caseCount,
    expectedTotal: bucket.caseCount,
    suiteCaseIdsChecksum: bucket.caseIdsChecksum,
    latencyBreakdown: {
      userResponse: {
        count: bucket.caseCount,
        p50Ms: bucket.budgetsMs.p50,
        p95Ms: bucket.budgetsMs.p95,
        maxMs: bucket.budgetsMs.max,
      },
    },
  }]));
  const evidence = buildPerformanceAcceptance(manifest, summaries);
  assert.equal(evidence.status, 'blocked');
  assert.ok(evidence.blockingReasons.every((item) => item.endsWith(':suite_manifest_identity_mismatch')));
});

test('blocks a fast run whose product result failed', () => {
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  const summaries = Object.fromEntries(Object.entries(manifest.buckets).map(([key, bucket], index) => [key, {
    activeRelease: { id: 21 },
    storeId: 6,
    sourceCommit: 'a'.repeat(40),
    releaseFingerprint: 'b'.repeat(64),
    productionHealth: { commit: 'a'.repeat(40) },
    suiteManifestChecksum: manifest.source.suiteManifestChecksum,
    runId: 100 + index,
    total: bucket.caseCount,
    expectedTotal: bucket.caseCount,
    suiteCaseIdsChecksum: bucket.caseIdsChecksum,
    failed: key === 'single' ? 1 : 0,
    providerUnavailable: 0,
    scorecards: { suspectedFalseSuccess: { count: 0 } },
    latencyBreakdown: {
      userResponse: {
        count: bucket.caseCount,
        p50Ms: 1,
        p95Ms: 1,
        maxMs: 1,
      },
    },
  }]));
  const evidence = buildPerformanceAcceptance(manifest, summaries);
  assert.equal(evidence.status, 'blocked');
  assert.ok(evidence.blockingReasons.includes('single:functional_result_failed'));
});
