import { createHash } from 'node:crypto';
import {
  caseIdsChecksum,
  standardRegressionDeltaCaseIds,
  type AmiBrainSuiteManifest,
} from './ami-brain-suite-manifest.js';

export interface AmiBrainProductAcceptanceEvidence {
  contractVersion: 'ami-brain-release-acceptance/v1';
  releaseCoreRunId: number;
  standardRegressionRunId: number;
  runKey: string | null;
  suiteManifestVersion: string;
  suiteManifestChecksum: unknown;
  sourceChecksum: unknown;
  releaseFingerprint: unknown;
  sourceCommit: unknown;
  runtimeCommit: unknown;
  storeId: number;
  releaseCoreCaseCount: number;
  standardDeltaCaseCount: number;
  standardRegressionCaseCount: number;
  releaseCoreCaseIdsChecksum: string;
  standardDeltaCaseIdsChecksum: string;
  standardRegressionCaseIdsChecksum: string;
  verifiedCapabilityTotal: number;
  goldStandardRunId: number;
  goldStandardManifestVersion: string | null;
  goldStandardManifestChecksum: string | null;
  goldStandardCaseIdsChecksum: string;
  goldStandardAcceptanceChecksum: string | null;
  goldStandardCaseCount: number;
  goldStandardAuditQueryReady: number;
  goldStandardSnapshotReady: number;
  goldStandardEvaluated: number;
  goldStandardPassed: number;
  blockingReasons: string[];
  canActivate: boolean;
  createdAt: string;
  expiresAt: string;
}

export function buildAmiBrainProductAcceptance(input: {
  releaseCoreRunId: number;
  standardRegressionRunId: number;
  storeId: number;
  manifest: AmiBrainSuiteManifest;
  coreSummary: Record<string, unknown>;
  standardSummary: Record<string, unknown>;
  coreResultCaseIds: string[];
  standardDeltaResultCaseIds: string[];
  goldStandardExpectedCaseIds: string[];
  goldStandardRun: {
    id: number;
    status: unknown;
    summary: Record<string, unknown>;
    results: Array<{
      caseKey: string;
      deterministicPassed: unknown;
      deterministicGrade: unknown;
    }>;
  } | null;
  coreFinishedAt: Date | null | undefined;
  now?: Date;
}): AmiBrainProductAcceptanceEvidence {
  const now = input.now ?? new Date();
  const blockingReasons: string[] = [];
  const coreSummary = input.coreSummary;
  const standardSummary = input.standardSummary;
  const releaseCore = input.manifest.suites.releaseCore;
  const standard = input.manifest.suites.standardRegression;
  const standardDeltaIds = standardRegressionDeltaCaseIds(input.manifest);

  for (const field of [
    'sourceChecksum',
    'suiteManifestVersion',
    'suiteManifestChecksum',
    'releaseFingerprint',
    'sourceCommit',
    'storeId',
    'runKey',
  ]) {
    if (coreSummary[field] !== standardSummary[field]) blockingReasons.push(`pipeline_identity_mismatch:${field}`);
  }
  const coreRuntimeCommit = record(coreSummary.productionHealth).commit;
  const standardRuntimeCommit = record(standardSummary.productionHealth).commit;
  if (coreRuntimeCommit !== standardRuntimeCommit) {
    blockingReasons.push('pipeline_identity_mismatch:runtime_commit');
  }
  if (
    typeof standardSummary.sourceCommit !== 'string' ||
    !/^[0-9a-f]{40}$/iu.test(standardSummary.sourceCommit) ||
    standardRuntimeCommit !== standardSummary.sourceCommit
  ) {
    blockingReasons.push('pipeline_identity_invalid:source_runtime_commit');
  }
  if (Number(coreSummary.runId) !== input.releaseCoreRunId) blockingReasons.push('release_core_run_id_invalid');
  if (Number(standardSummary.runId) !== input.standardRegressionRunId) {
    blockingReasons.push('standard_regression_run_id_invalid');
  }
  if (input.releaseCoreRunId === input.standardRegressionRunId) blockingReasons.push('stage_run_ids_not_distinct');
  if (Number(coreSummary.storeId) !== input.storeId || Number(standardSummary.storeId) !== input.storeId) {
    blockingReasons.push('store_id_mismatch');
  }
  if (coreSummary.stage !== 'release-core') blockingReasons.push('release_core_stage_invalid');
  if (coreSummary.executionMode !== 'full_suite') blockingReasons.push('release_core_execution_mode_invalid');
  if (
    Number(coreSummary.total ?? 0) !== releaseCore.caseCount ||
    Number(coreSummary.expectedTotal ?? 0) !== releaseCore.caseCount ||
    Number(coreSummary.suiteCaseCount ?? 0) !== releaseCore.caseCount ||
    coreSummary.suiteCaseIdsChecksum !== releaseCore.caseIdsChecksum
  ) {
    blockingReasons.push('release_core_result_count_invalid');
  }
  if (standardSummary.stage !== 'standard-regression') blockingReasons.push('standard_regression_stage_invalid');
  if (standardSummary.executionMode !== 'delta_after_release_core') {
    blockingReasons.push('standard_regression_execution_mode_invalid');
  }
  if (
    Number(standardSummary.total ?? 0) !== standardDeltaIds.length ||
    Number(standardSummary.expectedTotal ?? 0) !== standardDeltaIds.length ||
    Number(standardSummary.suiteCaseCount ?? 0) !== standard.caseCount ||
    standardSummary.suiteCaseIdsChecksum !== standard.caseIdsChecksum
  ) {
    blockingReasons.push('standard_regression_result_count_invalid');
  }

  assertExactCaseIds('release_core_results', input.coreResultCaseIds, releaseCore.caseIds, blockingReasons);
  assertExactCaseIds(
    'standard_regression_delta_results',
    input.standardDeltaResultCaseIds,
    standardDeltaIds,
    blockingReasons,
  );
  assertExactCaseIds(
    'standard_regression_merged_results',
    [...input.coreResultCaseIds, ...input.standardDeltaResultCaseIds],
    standard.caseIds,
    blockingReasons,
  );

  for (const [stage, summary] of [
    ['release_core', coreSummary],
    ['standard_regression_delta', standardSummary],
  ] as const) {
    if (Number(summary.failed ?? 0) !== 0) blockingReasons.push(`${stage}:deterministic_failures`);
    if (Number(summary.providerUnavailable ?? 0) !== 0) blockingReasons.push(`${stage}:provider_unavailable`);
    if (Number(summary.judgeInfrastructureFailures ?? 0) !== 0) {
      blockingReasons.push(`${stage}:judge_infrastructure_failure`);
    }
    if (record(summary).productSafetyGate === 'blocked') blockingReasons.push(`${stage}:safety_blocked`);
    if (Number(record(record(summary.scorecards).suspectedFalseSuccess).count ?? 0) !== 0) {
      blockingReasons.push(`${stage}:suspected_false_success`);
    }
  }
  const verifiedCapabilityTotal =
    Number(record(record(coreSummary.scorecards).verifiedCapability).total ?? 0) +
    Number(record(record(standardSummary.scorecards).verifiedCapability).total ?? 0);
  if (verifiedCapabilityTotal <= 0) blockingReasons.push('verified_capability_denominator_empty');
  const goldStandard = record(standardSummary.goldStandardAcceptance);
  const goldStandardManifestVersion =
    typeof goldStandard.manifestVersion === 'string' && goldStandard.manifestVersion
      ? goldStandard.manifestVersion
      : null;
  const goldStandardManifestChecksum =
    typeof goldStandard.manifestChecksum === 'string' && /^[0-9a-f]{64}$/iu.test(goldStandard.manifestChecksum)
      ? goldStandard.manifestChecksum
      : null;
  const goldStandardRunId = Number(standardSummary.goldStandardRunId ?? 0);
  const goldStandardRun = input.goldStandardRun;
  const goldRunSummary = record(goldStandardRun?.summary);
  const goldRunIdentity = record(goldRunSummary.pipelineIdentity);
  const goldRunAcceptance = record(goldRunSummary.acceptance);
  const expectedGoldCaseIds = input.goldStandardExpectedCaseIds;
  const goldStandardCaseIdsChecksum = caseIdsChecksum([...expectedGoldCaseIds].sort());
  const goldStandardAcceptanceChecksum = Object.keys(goldStandard).length ? jsonChecksum(goldStandard) : null;
  if (!Number.isInteger(goldStandardRunId) || goldStandardRunId <= 0) {
    blockingReasons.push('gold_standard_run_id_invalid');
  }
  if (!goldStandardRun || goldStandardRun.id !== goldStandardRunId) {
    blockingReasons.push('gold_standard_run_missing');
  } else {
    if (goldStandardRun.status !== 'completed') blockingReasons.push('gold_standard_run_not_completed');
    if (goldStandardRun.id === input.releaseCoreRunId || goldStandardRun.id === input.standardRegressionRunId) {
      blockingReasons.push('gold_standard_run_id_not_distinct');
    }
    if (
      goldRunSummary.executionPurpose !== 'standard_regression_internal_gold_standard' ||
      goldRunSummary.stage !== 'standard-regression-gold-internal'
    ) {
      blockingReasons.push('gold_standard_run_stage_invalid');
    }
    const expectedGoldIdentity: Record<string, unknown> = {
      parentStandardRegressionRunId: input.standardRegressionRunId,
      releaseId: Number(record(standardSummary.activeRelease).id ?? 0),
      storeId: input.storeId,
      releaseFingerprint: standardSummary.releaseFingerprint,
      sourceCommit: standardSummary.sourceCommit,
      runtimeCommit: standardRuntimeCommit,
      sourceChecksum: standardSummary.sourceChecksum,
      suiteManifestVersion: standardSummary.suiteManifestVersion,
      suiteManifestChecksum: standardSummary.suiteManifestChecksum,
      goldStandardManifestChecksum,
      standardRegressionCaseIdsChecksum: standard.caseIdsChecksum,
    };
    const identityMismatches = Object.entries(expectedGoldIdentity)
      .filter(([key, value]) => goldRunIdentity[key] !== value)
      .map(([key]) => key);
    if (goldRunIdentity.contractVersion !== 'ami-brain-gold-standard-runtime/v1') {
      identityMismatches.unshift('contractVersion');
    }
    if (identityMismatches.length) {
      blockingReasons.push(`gold_standard_pipeline_identity_mismatch:${[...new Set(identityMismatches)].join(',')}`);
    }
    assertExactCaseIds(
      'gold_standard_results',
      goldStandardRun.results.map((item) => item.caseKey),
      expectedGoldCaseIds,
      blockingReasons,
    );
    const invalidActualResults = goldStandardRun.results.filter((item) => {
      const grade = record(item.deterministicGrade);
      return (
        item.deterministicPassed !== true ||
        grade.passed !== true ||
        grade.goldCaseId !== item.caseKey ||
        grade.status === 'provider_unavailable'
      );
    });
    if (invalidActualResults.length) {
      blockingReasons.push(
        `gold_standard_actual_results_failed:${invalidActualResults
          .slice(0, 20)
          .map((item) => item.caseKey)
          .join(',')}`,
      );
    }
    const compactGoldIds = Array.isArray(goldRunSummary.compactResults)
      ? goldRunSummary.compactResults
          .map((item) => record(item).goldCaseId)
          .filter((item): item is string => typeof item === 'string' && Boolean(item))
      : [];
    assertExactCaseIds('gold_standard_compact_results', compactGoldIds, expectedGoldCaseIds, blockingReasons);
    if (
      Number(goldRunSummary.completedCaseCount ?? 0) !== expectedGoldCaseIds.length ||
      Number(goldRunSummary.remainingCaseCount ?? -1) !== 0 ||
      Number(goldRunSummary.passed ?? 0) !== expectedGoldCaseIds.length ||
      Number(goldRunSummary.failed ?? -1) !== 0 ||
      Number(goldRunSummary.providerUnavailable ?? -1) !== 0
    ) {
      blockingReasons.push('gold_standard_run_summary_count_invalid');
    }
    if (!goldStandardAcceptanceChecksum || jsonChecksum(goldRunAcceptance) !== goldStandardAcceptanceChecksum) {
      blockingReasons.push('gold_standard_parent_child_acceptance_mismatch');
    }
  }
  const goldStandardBlockingReasons = Array.isArray(goldStandard.blockingReasons)
    ? goldStandard.blockingReasons.filter((item): item is string => typeof item === 'string' && Boolean(item))
    : [];
  const goldStandardCaseCount = Number(goldStandard.caseCount ?? 0);
  const goldStandardAuditQueryReady = Number(goldStandard.auditQueryReady ?? 0);
  const goldStandardSnapshotReady = Number(goldStandard.snapshotReady ?? 0);
  const goldStandardEvaluated = Number(goldStandard.evaluated ?? 0);
  const goldStandardPassed = Number(goldStandard.passed ?? 0);
  const goldStandardFailed = Number(goldStandard.failed ?? 0);
  if (goldStandard.contractVersion !== 'ami-brain-gold-standard-acceptance/v1') {
    blockingReasons.push('gold_standard_evidence_missing');
  }
  if (goldStandard.status !== 'ready') blockingReasons.push('gold_standard_not_ready');
  if (!goldStandardManifestVersion || !goldStandardManifestChecksum) {
    blockingReasons.push('gold_standard_manifest_identity_invalid');
  }
  if (
    goldStandardCaseCount !== 100 ||
    goldStandardAuditQueryReady !== 100 ||
    goldStandardSnapshotReady !== 100 ||
    goldStandardEvaluated !== 100
  ) {
    blockingReasons.push('gold_standard_result_count_invalid');
  }
  if (goldStandardPassed !== 100 || goldStandardFailed !== 0) blockingReasons.push('gold_standard_fact_failures');
  if (goldStandardBlockingReasons.length) blockingReasons.push('gold_standard_blocking_reasons');
  const coreFinishedAt = input.coreFinishedAt?.getTime();
  if (!coreFinishedAt || now.getTime() - coreFinishedAt > 72 * 60 * 60 * 1000) {
    blockingReasons.push('release_core_evidence_expired');
  }

  const uniqueBlockingReasons = [...new Set(blockingReasons)];
  return {
    contractVersion: 'ami-brain-release-acceptance/v1',
    releaseCoreRunId: input.releaseCoreRunId,
    standardRegressionRunId: input.standardRegressionRunId,
    runKey: typeof standardSummary.runKey === 'string' ? standardSummary.runKey : null,
    suiteManifestVersion: input.manifest.manifestVersion,
    suiteManifestChecksum: standardSummary.suiteManifestChecksum,
    sourceChecksum: standardSummary.sourceChecksum,
    releaseFingerprint: standardSummary.releaseFingerprint,
    sourceCommit: standardSummary.sourceCommit,
    runtimeCommit: standardRuntimeCommit ?? null,
    storeId: input.storeId,
    releaseCoreCaseCount: releaseCore.caseCount,
    standardDeltaCaseCount: standardDeltaIds.length,
    standardRegressionCaseCount: standard.caseCount,
    releaseCoreCaseIdsChecksum: releaseCore.caseIdsChecksum,
    standardDeltaCaseIdsChecksum: caseIdsChecksum(standardDeltaIds),
    standardRegressionCaseIdsChecksum: standard.caseIdsChecksum,
    verifiedCapabilityTotal,
    goldStandardRunId,
    goldStandardManifestVersion,
    goldStandardManifestChecksum,
    goldStandardCaseIdsChecksum,
    goldStandardAcceptanceChecksum,
    goldStandardCaseCount,
    goldStandardAuditQueryReady,
    goldStandardSnapshotReady,
    goldStandardEvaluated,
    goldStandardPassed,
    blockingReasons: uniqueBlockingReasons,
    canActivate: uniqueBlockingReasons.length === 0,
    createdAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + 72 * 60 * 60 * 1000).toISOString(),
  };
}

function assertExactCaseIds(label: string, actual: string[], expected: string[], failures: string[]) {
  const actualSet = new Set(actual);
  const expectedSet = new Set(expected);
  if (actual.length !== actualSet.size) failures.push(`${label}:duplicate_ids`);
  const missing = expected.filter((id) => !actualSet.has(id));
  const unexpected = actual.filter((id) => !expectedSet.has(id));
  if (missing.length) failures.push(`${label}:missing:${missing.slice(0, 20).join(',')}`);
  if (unexpected.length) failures.push(`${label}:unexpected:${unexpected.slice(0, 20).join(',')}`);
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

export function jsonChecksum(value: unknown) {
  return createHash('sha256')
    .update(JSON.stringify(canonicalJson(value)), 'utf8')
    .digest('hex');
}

function canonicalJson(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalJson);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => [key, canonicalJson(item)]),
  );
}
