import { createHash } from 'node:crypto';
import { resolveProductLoopEligibility } from './ami-brain-product-loop-registry.mjs';

export function standardDeltaCaseIds(manifest) {
  const core = new Set(manifest.suites.releaseCore.caseIds);
  return manifest.suites.standardRegression.caseIds.filter((id) => !core.has(id));
}

export function resolveResumePlan({ options, state, identity }) {
  const plan = {
    skipReleaseCore: false,
    skipStandardRegression: false,
    coreRunId: positiveNumber(options.releaseCoreResumeRunId),
    standardRunId: positiveNumber(options.standardResumeRunId),
  };
  if (!options.resume) return plan;
  if (!state || Object.keys(state).length === 0) throw new Error('orchestrator resume state missing');
  const identityFields = [
    'contractVersion',
    'runKey',
    'releaseId',
    'runtimeCommit',
    'productionHealthUrl',
    'storeId',
    'suiteManifestVersion',
    'suiteManifestChecksum',
    'sourceBaselineChecksum',
    'productLoopEligibilityChecksum',
    'releaseCoreCaseCount',
    'standardRegressionCaseCount',
    'standardDeltaCaseCount',
  ];
  const mismatches = identityFields.filter((field) => state[field] !== identity[field]);
  if (mismatches.length) throw new Error(`orchestrator resume identity mismatch:${mismatches.join(',')}`);
  if (state.status === 'release_core_blocked' || state.status === 'standard_regression_blocked') {
    throw new Error('blocked acceptance cannot resume; create a new run-key after fixing the candidate');
  }
  const stateCoreRunId = positiveNumber(state.coreRunId);
  const stateStandardRunId = positiveNumber(state.standardRunId);
  if (state.status === 'standard_delta_complete') {
    if (!stateCoreRunId || !stateStandardRunId) throw new Error('completed orchestrator state is missing run ids');
    return {
      skipReleaseCore: true,
      skipStandardRegression: true,
      coreRunId: stateCoreRunId,
      standardRunId: stateStandardRunId,
    };
  }
  if (state.status === 'release_core_complete') {
    if (!stateCoreRunId) throw new Error('release-core completed state is missing coreRunId');
    return {
      ...plan,
      skipReleaseCore: true,
      coreRunId: stateCoreRunId,
    };
  }
  if (state.stage === 'standard-regression') {
    if (!stateCoreRunId) throw new Error('standard-regression resume state is missing coreRunId');
    return {
      ...plan,
      skipReleaseCore: true,
      coreRunId: stateCoreRunId,
      standardRunId: plan.standardRunId ?? positiveNumber(state.resumeRunId),
    };
  }
  if (state.stage === 'release-core') {
    return {
      ...plan,
      coreRunId: plan.coreRunId ?? positiveNumber(state.resumeRunId),
    };
  }
  throw new Error(`orchestrator resume state unsupported:${String(state.status ?? 'unknown')}`);
}

export function buildEvalArgs(options, stage, resumeRunId, standardDelta = false, releaseCoreRunId) {
  return [
    `--stage=${stage}`,
    `--suite-manifest=${options.suiteManifest}`,
    `--expected-release-id=${options.releaseId}`,
    `--expected-runtime-commit=${options.runtimeCommit}`,
    `--production-health-url=${options.productionHealthUrl}`,
    `--store-id=${options.storeId}`,
    `--run-key=${options.runKey}`,
    `--concurrency=${options.concurrency}`,
    `--checkpoint-every=${options.checkpointEvery}`,
    `--max-cases-per-invocation=${options.maxCasesPerInvocation}`,
    ...(standardDelta ? ['--standard-delta'] : []),
    ...(standardDelta ? [`--release-core-run-id=${releaseCoreRunId}`] : []),
    ...(resumeRunId ? [`--resume-run-id=${resumeRunId}`] : []),
  ];
}

export function buildCandidatePreflight({
  expectedReleaseId,
  expectedRuntimeCommit,
  productionHealthUrl,
  headCommit,
  dirtyFileCount,
  health,
  crossClientContract,
  expectedCrossClientContractIdentityChecksum,
  actionReleaseContract,
  expectedActionReleaseContractIdentityChecksum,
  now = new Date(),
}) {
  const expectedCommit = normalizeCommit(expectedRuntimeCommit);
  const candidateCommit = normalizeCommit(headCommit);
  const deployment = health?.body?.deployment && typeof health.body.deployment === 'object'
    ? health.body.deployment
    : {};
  const deploymentCommit = normalizeCommit(deployment.commit);
  const requestSucceeded = health?.requestSucceeded === true;
  const statusCode = Number.isInteger(health?.statusCode) ? health.statusCode : null;
  const healthStatus = typeof health?.body?.status === 'string' ? health.body.status.trim() : null;
  const normalizedCrossClientContract = normalizeCrossClientContract({
    value: crossClientContract,
    candidateCommit,
    expectedIdentityChecksum: expectedCrossClientContractIdentityChecksum,
  });
  const normalizedActionReleaseContract = normalizeActionReleaseContract({
    value: actionReleaseContract,
    candidateCommit,
    expectedReleaseId,
    expectedIdentityChecksum: expectedActionReleaseContractIdentityChecksum,
  });
  const blockingReasons = [];

  if (!candidateCommit) {
    blockingReasons.push('candidate_head_commit_unavailable');
  } else if (!isFullCommit(candidateCommit)) {
    blockingReasons.push('candidate_head_commit_invalid');
  } else if (candidateCommit !== expectedCommit) {
    blockingReasons.push('candidate_head_commit_mismatch');
  }

  if (!Number.isInteger(dirtyFileCount) || dirtyFileCount < 0) {
    blockingReasons.push('candidate_worktree_status_unavailable');
  } else if (dirtyFileCount > 0) {
    blockingReasons.push(`candidate_worktree_dirty:${dirtyFileCount}`);
  }

  if (!requestSucceeded) {
    blockingReasons.push('production_health_unavailable');
  } else {
    if (statusCode == null || statusCode < 200 || statusCode >= 300) {
      blockingReasons.push(`production_health_http_status:${statusCode ?? 'missing'}`);
    }
    if (!health?.body || typeof health.body !== 'object') {
      blockingReasons.push('production_health_payload_invalid');
    } else if (healthStatus !== 'ok') {
      blockingReasons.push(`production_health_status_invalid:${healthStatus ?? 'missing'}`);
    }
    if (!deploymentCommit) {
      blockingReasons.push('production_deployment_commit_missing');
    } else if (!isFullCommit(deploymentCommit)) {
      blockingReasons.push('production_deployment_commit_invalid');
    } else if (deploymentCommit !== expectedCommit) {
      blockingReasons.push('production_deployment_commit_mismatch');
    }
  }

  if (!normalizedCrossClientContract.passed) {
    blockingReasons.push('cross_client_contract_failed');
  }
  if (!normalizedActionReleaseContract.passed) {
    blockingReasons.push('action_release_contract_failed');
  }

  const uniqueBlockingReasons = [...new Set(blockingReasons)];
  return {
    schemaVersion: 'ami-brain-candidate-preflight/v3',
    ready: uniqueBlockingReasons.length === 0,
    expectedReleaseId: normalizePositiveInteger(expectedReleaseId),
    expectedRuntimeCommit: expectedCommit,
    candidate: {
      headCommit: candidateCommit,
      headMatchesExpected: isFullCommit(candidateCommit) && candidateCommit === expectedCommit,
      dirtyFileCount: Number.isInteger(dirtyFileCount) && dirtyFileCount >= 0 ? dirtyFileCount : null,
      clean: dirtyFileCount === 0,
    },
    productionHealth: {
      url: productionHealthUrl,
      requestSucceeded,
      statusCode,
      status: healthStatus,
      deployment: {
        commit: deploymentCommit,
        branch: normalizeOptionalText(deployment.branch),
        buildId: normalizeOptionalText(deployment.buildId),
        environment: normalizeOptionalText(deployment.environment),
      },
      commitMatchesExpected: isFullCommit(deploymentCommit) && deploymentCommit === expectedCommit,
      error: normalizeOptionalText(health?.error),
    },
    crossClientContract: normalizedCrossClientContract,
    actionReleaseContract: normalizedActionReleaseContract,
    blockingReasons: uniqueBlockingReasons,
    checkedAt: now.toISOString(),
  };
}

export const buildReleaseAcceptancePreflight = buildCandidatePreflight;

export function buildAcceptanceEvidence({
  identity,
  manifest,
  coreSummary,
  standardDeltaSummary,
  coreResults,
  standardDeltaResults,
  now = new Date(),
}) {
  const blockingReasons = [];
  for (const field of [
    'sourceChecksum',
    'suiteManifestVersion',
    'suiteManifestChecksum',
    'releaseFingerprint',
    'sourceCommit',
    'storeId',
    'runKey',
  ]) {
    if (coreSummary[field] !== standardDeltaSummary[field]) {
      blockingReasons.push(`pipeline_identity_mismatch:${field}`);
    }
  }
  const coreRuntimeCommit = coreSummary.productionHealth?.commit;
  const standardRuntimeCommit = standardDeltaSummary.productionHealth?.commit;
  if (coreRuntimeCommit !== standardRuntimeCommit || standardRuntimeCommit !== identity.runtimeCommit) {
    blockingReasons.push('pipeline_identity_mismatch:runtime_commit');
  }
  const deltaExpected = standardDeltaCaseIds(manifest);
  const coreIds = coreResults.map((item) => item.caseKey);
  const deltaIds = standardDeltaResults.map((item) => item.caseKey);
  assertExactIds('release_core_results', coreIds, manifest.suites.releaseCore.caseIds, blockingReasons);
  assertExactIds('standard_delta_results', deltaIds, deltaExpected, blockingReasons);
  const mergedIds = [...coreIds, ...deltaIds];
  assertExactIds('standard_regression_merged_results', mergedIds, manifest.suites.standardRegression.caseIds, blockingReasons);
  for (const [stage, summary] of [
    ['release_core', coreSummary],
    ['standard_delta', standardDeltaSummary],
  ]) {
    if (Number(summary.failed ?? -1) !== 0) {
      blockingReasons.push(`${stage}:deterministic_failures:${summary.failed ?? 'missing'}`);
    }
    if (Number(summary.providerUnavailable ?? -1) !== 0) {
      blockingReasons.push(`${stage}:provider_unavailable:${summary.providerUnavailable ?? 'missing'}`);
    }
    if (Number(summary.scorecards?.suspectedFalseSuccess?.count ?? -1) !== 0) {
      blockingReasons.push(
        `${stage}:suspected_false_success:${summary.scorecards?.suspectedFalseSuccess?.count ?? 'missing'}`,
      );
    }
  }
  const verifiedTotal =
    Number(coreSummary.scorecards?.verifiedCapability?.total ?? 0) +
    Number(standardDeltaSummary.scorecards?.verifiedCapability?.total ?? 0);
  if (verifiedTotal <= 0) blockingReasons.push('verified_capability_denominator_empty');
  const uniqueBlockingReasons = [...new Set(blockingReasons)];
  return {
    contractVersion: identity.contractVersion,
    pipelineIdentity: identity,
    stages: {
      releaseCore: summarizeStage(coreSummary),
      standardRegressionDelta: summarizeStage(standardDeltaSummary),
    },
    mergedStandardRegression: {
      expectedCaseCount: manifest.suites.standardRegression.caseCount,
      resultCount: new Set(mergedIds).size,
      caseIdsChecksum: sha256(manifest.suites.standardRegression.caseIds.join('\n')),
      verifiedCapabilityTotal: verifiedTotal,
    },
    blockingReasons: uniqueBlockingReasons,
    canActivate: uniqueBlockingReasons.length === 0,
    decision: uniqueBlockingReasons.length === 0 ? 'ready_for_activation' : 'blocked',
    createdAt: now.toISOString(),
  };
}

export function buildCoreBlockedEvidence({ identity, manifest, coreSummary, coreResults, now = new Date() }) {
  const failures = ['release_core_safety_blocked'];
  assertExactIds(
    'release_core_results',
    coreResults.map((item) => item.caseKey),
    manifest.suites.releaseCore.caseIds,
    failures,
  );
  return {
    contractVersion: identity.contractVersion,
    pipelineIdentity: identity,
    stages: { releaseCore: summarizeStage(coreSummary) },
    mergedStandardRegression: null,
    blockingReasons: [...new Set(failures)],
    canActivate: false,
    decision: 'blocked',
    createdAt: now.toISOString(),
  };
}

export function renderReport(evidence) {
  const standardDelta = evidence.stages.standardRegressionDelta;
  const merged = evidence.mergedStandardRegression;
  return `# Ami Brain 两阶段发布验收报告

- 决策：\`${evidence.decision}\`
- Release：#${evidence.pipelineIdentity.releaseId}
- 代码提交：\`${evidence.pipelineIdentity.runtimeCommit}\`
- manifest：\`${evidence.pipelineIdentity.suiteManifestVersion}\`
- release-core：${evidence.stages.releaseCore.total}/${evidence.stages.releaseCore.expectedTotal}
- standard-regression 增量：${standardDelta ? `${standardDelta.total}/${standardDelta.expectedTotal}` : '未启动'}
- 合并标准回归：${merged ? `${merged.resultCount}/${merged.expectedCaseCount}` : '未形成'}

## 阻断原因

${evidence.blockingReasons.length ? evidence.blockingReasons.map((item) => `- ${item}`).join('\n') : '无'}

## 产品边界

- 本编排器只生成发布判断证据，不激活或回滚 Release。
- release-core 包含原 targeted/preflight 中所有当前发布资格题，并保留非资格原题与补位记录。
- standard-regression 第二阶段只执行增量题，最终与 release-core 合并验证。
`;
}

export function validateManifest(value) {
  if (value?.schemaVersion !== 'ami-brain-suite-manifest/v1') throw new Error('suite manifest schema invalid');
  const productLoopEligibility = value?.productLoopEligibility;
  const dataFactsAudit = productLoopEligibility?.dataFactsAudit;
  if (
    productLoopEligibility?.schemaVersion !== 'ami-brain-product-loop-eligibility/v1' ||
    typeof productLoopEligibility?.path !== 'string' ||
    !/^[0-9a-f]{64}$/iu.test(productLoopEligibility?.checksum ?? '') ||
    !/^[0-9a-f]{64}$/iu.test(productLoopEligibility?.sourceBaselineChecksum ?? '') ||
    !/^[0-9a-f]{64}$/iu.test(productLoopEligibility?.caseIdsChecksum ?? '') ||
    !Number.isInteger(productLoopEligibility?.caseCount) ||
    productLoopEligibility.caseCount <= 0 ||
    !Number.isInteger(productLoopEligibility?.baselineCaseCount) ||
    productLoopEligibility.baselineCaseCount <= 0 ||
    productLoopEligibility.sourceBaselineChecksum !== value?.sourceBaseline?.checksum ||
    productLoopEligibility.baselineCaseCount !== value?.sourceBaseline?.caseCount ||
    productLoopEligibility?.supplementalRegistry?.schemaVersion !==
      'ami-brain-supplemental-question-registry/v1' ||
    typeof productLoopEligibility?.supplementalRegistry?.path !== 'string' ||
    !/^[0-9a-f]{64}$/iu.test(productLoopEligibility?.supplementalRegistry?.checksum ?? '') ||
    !Number.isInteger(productLoopEligibility?.supplementalRegistry?.caseCount) ||
    productLoopEligibility.supplementalRegistry.caseCount < 0 ||
    productLoopEligibility.caseCount !==
      productLoopEligibility.baselineCaseCount + productLoopEligibility.supplementalRegistry.caseCount ||
    dataFactsAudit?.schemaVersion !== 'ami-brain-product-loop-data-facts/v1' ||
    typeof dataFactsAudit?.path !== 'string' ||
    !/^[0-9a-f]{64}$/iu.test(dataFactsAudit?.checksum ?? '') ||
    !/^[0-9a-f]{64}$/iu.test(dataFactsAudit?.schemaChecksum ?? '') ||
    !/^[0-9a-f]{64}$/iu.test(dataFactsAudit?.snapshotChecksum ?? '') ||
    dataFactsAudit?.databaseHost !== 'aws-1-ap-northeast-1.pooler.supabase.com' ||
    dataFactsAudit?.storeId !== 6
  ) {
    throw new Error('suite manifest product loop eligibility artifact invalid');
  }
  const productLoopPolicy = value?.governancePolicy?.productLoopPolicy;
  if (
    productLoopPolicy?.eligibleStatus !== 'current_release_test' ||
    !Array.isArray(productLoopPolicy?.requiredEvidence) ||
    !['management_entry', 'backend_api', 'data_facts'].every((item) =>
      productLoopPolicy.requiredEvidence.includes(item),
    )
  ) {
    throw new Error('suite manifest product loop policy missing');
  }
  const core = value?.suites?.releaseCore;
  const standard = value?.suites?.standardRegression;
  if (!core || !standard || !Array.isArray(core.caseIds) || !Array.isArray(standard.caseIds)) {
    throw new Error('suite manifest stages missing');
  }
  if (core.caseCount !== core.caseIds.length || standard.caseCount !== standard.caseIds.length) {
    throw new Error('suite manifest case count invalid');
  }
  const standardSet = new Set(standard.caseIds);
  const missingCore = core.caseIds.filter((id) => !standardSet.has(id));
  if (missingCore.length) throw new Error(`standard regression does not include release core: ${missingCore.join(',')}`);
  const rotation = value?.suites?.extendedRotation;
  const executableSet = new Set([
    ...standard.caseIds,
    ...(Array.isArray(rotation?.caseIds) ? rotation.caseIds : []),
  ]);
  const evidenceReview = value?.suites?.evidenceReviewRequired;
  if (evidenceReview) {
    if (!Array.isArray(evidenceReview.caseIds) || evidenceReview.caseCount !== evidenceReview.caseIds.length) {
      throw new Error('suite manifest evidence review stage invalid');
    }
    const overlap = evidenceReview.caseIds.filter((id) => executableSet.has(id));
    if (overlap.length) throw new Error(`evidence review cases entered release execution:${overlap.join(',')}`);
  }
  const nextIteration = value?.suites?.nextIterationFeature;
  if (nextIteration) {
    if (!Array.isArray(nextIteration.caseIds) || nextIteration.caseCount !== nextIteration.caseIds.length) {
      throw new Error('suite manifest next iteration stage invalid');
    }
    const overlap = nextIteration.caseIds.filter((id) => standardSet.has(id));
    if (overlap.length) throw new Error(`next iteration cases entered release execution:${overlap.join(',')}`);
  }
  const metricDefinition = value?.suites?.metricDefinitionGovernanceRequired;
  if (metricDefinition) {
    if (!Array.isArray(metricDefinition.caseIds) || metricDefinition.caseCount !== metricDefinition.caseIds.length) {
      throw new Error('suite manifest metric definition governance stage invalid');
    }
    const overlap = metricDefinition.caseIds.filter((id) => executableSet.has(id));
    if (overlap.length) throw new Error(`metric definition governance cases entered release execution:${overlap.join(',')}`);
  }
  validateProductJourneys(value);
}

export function validateProductLoopEligibility(manifest, raw, supplementalRegistryRaw) {
  validateManifest(manifest);
  const metadata = manifest.productLoopEligibility;
  if (sha256(raw) !== metadata.checksum) throw new Error('product loop eligibility checksum mismatch');
  const artifact = JSON.parse(raw);
  if (
    artifact?.schemaVersion !== metadata.schemaVersion ||
    artifact?.sourceBaselineChecksum !== manifest.sourceBaseline.checksum ||
    !Array.isArray(artifact?.cases) ||
    artifact.cases.length !== metadata.caseCount ||
    artifact.baselineCaseCount !== metadata.baselineCaseCount
  ) {
    throw new Error('product loop eligibility artifact shape invalid');
  }
  if (JSON.stringify(artifact.dataFactsAudit) !== JSON.stringify(metadata.dataFactsAudit)) {
    throw new Error('product loop data facts audit mismatch');
  }
  if (typeof supplementalRegistryRaw !== 'string' || sha256(supplementalRegistryRaw) !== metadata.supplementalRegistry.checksum) {
    throw new Error('supplemental question registry checksum mismatch');
  }
  const supplementalRegistry = JSON.parse(supplementalRegistryRaw);
  if (
    supplementalRegistry?.schemaVersion !== metadata.supplementalRegistry.schemaVersion ||
    !Array.isArray(supplementalRegistry?.cases) ||
    supplementalRegistry.cases.length !== metadata.supplementalRegistry.caseCount ||
    JSON.stringify(artifact.supplementalRegistry) !== JSON.stringify(metadata.supplementalRegistry)
  ) {
    throw new Error('supplemental question registry source invalid');
  }
  const ids = artifact.cases.map((item) => item?.id);
  if (ids.some((id) => typeof id !== 'string' || !id) || new Set(ids).size !== ids.length) {
    throw new Error('product loop eligibility case ids invalid');
  }
  if (sha256(ids.join('\n')) !== metadata.caseIdsChecksum || artifact.caseIdsChecksum !== metadata.caseIdsChecksum) {
    throw new Error('product loop eligibility case ids checksum mismatch');
  }
  const supplementalIds = new Set(supplementalRegistry.cases.map((item) => item?.id));
  if (
    supplementalIds.size !== metadata.supplementalRegistry.caseCount ||
    artifact.cases.slice(metadata.baselineCaseCount).some((item) => !supplementalIds.has(item.id)) ||
    artifact.cases.slice(0, metadata.baselineCaseCount).some((item) => supplementalIds.has(item.id))
  ) {
    throw new Error('supplemental question registry case ids invalid');
  }
  const statuses = new Map();
  const eligibilityCasesById = new Map();
  for (const item of artifact.cases) {
    if (
      ![
        'current_release_test',
        'next_iteration_feature',
        'evidence_review_required',
        'metric_definition_governance_required',
      ].includes(item.status)
    ) {
      throw new Error(`product loop eligibility status invalid:${item.id}`);
    }
    if (item.status === 'current_release_test') {
      const evidence = item.evidence ?? {};
      if (
        evidence.managementEntry?.status !== 'present' ||
        evidence.backendApi?.status !== 'present' ||
        evidence.dataFacts?.status !== 'present' ||
        evidence.dataFacts?.auditSnapshotChecksum !== metadata.dataFactsAudit.snapshotChecksum ||
        !Array.isArray(item.missingComponents) ||
        item.missingComponents.length
      ) {
        throw new Error(`product loop current release evidence incomplete:${item.id}`);
      }
    }
    if (
      supplementalIds.has(item.id) &&
      item.status !== 'evidence_review_required' &&
      (item.source !== 'supplemental_question_registry_v1' ||
        item.admission?.source !== 'supplemental_question_registry_v1' ||
        !/^[0-9a-f]{64}$/iu.test(item.admission?.questionChecksum ?? '') ||
        !/^[0-9a-f]{64}$/iu.test(item.admission?.reviewChecksum ?? '') ||
        !item.admission?.reviewedBy ||
        !item.admission?.reviewedAt)
    ) {
      throw new Error(`supplemental question admission invalid:${item.id}`);
    }
    const recomputed = resolveProductLoopEligibility(
      item,
      supplementalIds.has(item.id) ? { supplementalRegistry } : { admission: 'frozen_baseline_v1' },
    );
    const storedDecision = {
      status: item.status,
      featureKey: item.featureKey,
      reason: item.reason,
      missingComponents: item.missingComponents,
      evidence: item.evidence,
      ...(item.admission ? { admission: item.admission } : {}),
    };
    const recomputedDecision = {
      status: recomputed.status,
      featureKey: recomputed.featureKey,
      reason: recomputed.reason,
      missingComponents: recomputed.missingComponents,
      evidence: recomputed.evidence,
      ...(recomputed.admission ? { admission: recomputed.admission } : {}),
    };
    if (JSON.stringify(storedDecision) !== JSON.stringify(recomputedDecision)) {
      throw new Error(`product loop eligibility decision stale:${item.id}`);
    }
    statuses.set(item.id, item.status);
    eligibilityCasesById.set(item.id, item);
  }
  const currentIds = artifact.cases.filter((item) => item.status === 'current_release_test').map((item) => item.id);
  const nextIterationIds = artifact.cases.filter((item) => item.status === 'next_iteration_feature').map((item) => item.id);
  const evidenceReviewIds = artifact.cases.filter((item) => item.status === 'evidence_review_required').map((item) => item.id);
  const metricDefinitionIds = artifact.cases
    .filter((item) => item.status === 'metric_definition_governance_required')
    .map((item) => item.id);
  for (const suite of [manifest.suites.releaseCore, manifest.suites.standardRegression, manifest.suites.extendedRotation]) {
    const ineligible = suite.caseIds.filter((id) => statuses.get(id) !== 'current_release_test');
    if (ineligible.length) throw new Error(`product loop ineligible cases entered executable suite:${suite.key}:${ineligible.join(',')}`);
  }
  const releaseCoreIds = new Set(manifest.suites.releaseCore.caseIds);
  const standardIds = new Set(manifest.suites.standardRegression.caseIds);
  const rotationIds = new Set(manifest.suites.extendedRotation.caseIds);
  const uncoveredCurrent = currentIds.filter((id) => !standardIds.has(id) && !rotationIds.has(id));
  if (uncoveredCurrent.length) {
    throw new Error(`current release questions missing from executable suites:${uncoveredCurrent.join(',')}`);
  }
  for (const item of artifact.cases.slice(metadata.baselineCaseCount)) {
    if (item.status !== 'current_release_test') continue;
    const assignment = item.admission?.suiteAssignment;
    const membership = {
      'release-core': releaseCoreIds.has(item.id) && standardIds.has(item.id) && !rotationIds.has(item.id),
      'standard-regression': !releaseCoreIds.has(item.id) && standardIds.has(item.id) && !rotationIds.has(item.id),
      'extended-rotation': !releaseCoreIds.has(item.id) && !standardIds.has(item.id) && rotationIds.has(item.id),
    };
    if (!membership[assignment]) {
      throw new Error(`supplemental suite assignment mismatch:${item.id}:${assignment ?? 'missing'}`);
    }
  }
  assertSameIds('next_iteration', manifest.suites.nextIterationFeature?.caseIds ?? [], nextIterationIds);
  assertSameIds('evidence_review', manifest.suites.evidenceReviewRequired?.caseIds ?? [], evidenceReviewIds);
  assertSameIds(
    'metric_definition_governance',
    manifest.suites.metricDefinitionGovernanceRequired?.caseIds ?? [],
    metricDefinitionIds,
  );
  for (const journey of manifest.productJourneys.cases) {
    const eligibility = eligibilityCasesById.get(journey.caseId);
    if (!eligibility) throw new Error(`product journey eligibility missing:${journey.caseId}`);
    if (journey.status !== eligibility.status) throw new Error(`product journey status mismatch:${journey.caseId}`);
    if (journey.question !== eligibility.question) throw new Error(`product journey question mismatch:${journey.caseId}`);
  }
  if (
    artifact.summary?.currentReleaseTest !== currentIds.length ||
    artifact.summary?.nextIterationFeature !== nextIterationIds.length ||
    artifact.summary?.evidenceReviewRequired !== evidenceReviewIds.length ||
    (artifact.summary?.metricDefinitionGovernanceRequired ?? 0) !== metricDefinitionIds.length
  ) {
    throw new Error('product loop eligibility summary invalid');
  }
  return artifact;
}

export function sha256(value) {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

export function positiveNumber(value) {
  if (value == null || value === '') return undefined;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) throw new Error(`invalid positive integer: ${value}`);
  return parsed;
}

export function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}

function normalizeCommit(value) {
  return typeof value === 'string' ? value.trim().toLowerCase() || null : null;
}

function isFullCommit(value) {
  return typeof value === 'string' && /^[0-9a-f]{40}$/u.test(value);
}

function normalizeOptionalText(value) {
  return typeof value === 'string' ? value.trim() || null : null;
}

function normalizeCrossClientContract({ value, candidateCommit, expectedIdentityChecksum }) {
  const schemaVersion = normalizeOptionalText(value?.schemaVersion);
  const checked = value?.checked === true;
  const reportedPassed = value?.passed === true;
  const identityChecksum = normalizeOptionalText(value?.identityChecksum)?.toLowerCase() ?? null;
  const expectedChecksum = normalizeOptionalText(expectedIdentityChecksum)?.toLowerCase() ?? null;
  const identityMatchesExpected =
    /^[0-9a-f]{64}$/u.test(identityChecksum ?? '') &&
    /^[0-9a-f]{64}$/u.test(expectedChecksum ?? '') &&
    identityChecksum === expectedChecksum;
  const contractHeadCommit = normalizeCommit(value?.candidate?.headCommit);
  const headMatchesCandidate =
    isFullCommit(contractHeadCommit) && isFullCommit(candidateCommit) && contractHeadCommit === candidateCommit;
  const failedStepKeys = Array.isArray(value?.summary?.failedStepKeys)
    ? value.summary.failedStepKeys.filter((item) => typeof item === 'string' && item.trim()).map((item) => item.trim())
    : [];
  const shapeValid =
    schemaVersion === 'ami-brain-cross-client-contract/v1' &&
    checked &&
    Array.isArray(value?.steps) &&
    Number.isInteger(value?.summary?.stepCount) &&
    value.summary.stepCount === value.steps.length;
  const passed = shapeValid && reportedPassed && identityMatchesExpected && headMatchesCandidate;
  return {
    schemaVersion,
    checked,
    passed,
    reportedPassed,
    shapeValid,
    identityChecksum,
    expectedIdentityChecksum: expectedChecksum,
    identityMatchesExpected,
    testFilesChecksum: normalizeOptionalText(value?.testFilesChecksum)?.toLowerCase() ?? null,
    testFileCount: Number.isInteger(value?.testFileCount) ? value.testFileCount : null,
    candidate: {
      headCommit: contractHeadCommit,
      headMatchesCandidate,
    },
    summary: {
      stepCount: Number.isInteger(value?.summary?.stepCount) ? value.summary.stepCount : null,
      passedStepCount: Number.isInteger(value?.summary?.passedStepCount)
        ? value.summary.passedStepCount
        : null,
      failedStepCount: Number.isInteger(value?.summary?.failedStepCount)
        ? value.summary.failedStepCount
        : null,
      failedStepKeys,
    },
    steps: Array.isArray(value?.steps) ? value.steps : [],
    blockingReasons: Array.isArray(value?.blockingReasons)
      ? value.blockingReasons.filter((item) => typeof item === 'string' && item.trim())
      : [],
    checkedAt: normalizeOptionalText(value?.checkedAt),
  };
}

function normalizeActionReleaseContract({ value, candidateCommit, expectedReleaseId, expectedIdentityChecksum }) {
  const schemaVersion = normalizeOptionalText(value?.schemaVersion);
  const checked = value?.checked === true;
  const reportedPassed = value?.passed === true;
  const identityChecksum = normalizeOptionalText(value?.identityChecksum)?.toLowerCase() ?? null;
  const expectedChecksum = normalizeOptionalText(expectedIdentityChecksum)?.toLowerCase() ?? null;
  const identityMatchesExpected =
    /^[0-9a-f]{64}$/u.test(identityChecksum ?? '') &&
    /^[0-9a-f]{64}$/u.test(expectedChecksum ?? '') &&
    identityChecksum === expectedChecksum;
  const contractHeadCommit = normalizeCommit(value?.candidate?.headCommit);
  const headMatchesCandidate =
    isFullCommit(contractHeadCommit) && isFullCommit(candidateCommit) && contractHeadCommit === candidateCommit;
  const expectedId = normalizePositiveInteger(expectedReleaseId);
  const reportedExpectedId = normalizePositiveInteger(value?.release?.expectedId);
  const releaseId = normalizePositiveInteger(value?.release?.id);
  const releaseMatchesExpected =
    expectedId !== null && reportedExpectedId === expectedId && releaseId === expectedId;
  const contractFingerprint = normalizeOptionalText(value?.contractFingerprint)?.toLowerCase() ?? null;
  const actionCount = Array.isArray(value?.actions) ? value.actions.length : null;
  const requiredActionCount = normalizeNonNegativeInteger(value?.summary?.requiredActionCount);
  const passedActionCount = normalizeNonNegativeInteger(value?.summary?.passedActionCount);
  const failedActionCount = normalizeNonNegativeInteger(value?.summary?.failedActionCount);
  const failedActionKeys = Array.isArray(value?.summary?.failedActionKeys)
    ? value.summary.failedActionKeys.filter((item) => typeof item === 'string' && item.trim()).map((item) => item.trim())
    : [];
  const semanticSnapshotMatches = value?.release?.semanticSnapshotMatches === true;
  const shapeValid =
    schemaVersion === 'ami-brain-action-release-contract/v1' &&
    checked &&
    Array.isArray(value?.actions) &&
    requiredActionCount !== null &&
    requiredActionCount > 0 &&
    actionCount === requiredActionCount &&
    passedActionCount !== null &&
    failedActionCount !== null &&
    passedActionCount + failedActionCount === requiredActionCount &&
    /^[0-9a-f]{64}$/u.test(contractFingerprint ?? '') &&
    Array.isArray(value?.blockingReasons);
  const passed =
    shapeValid &&
    reportedPassed &&
    identityMatchesExpected &&
    headMatchesCandidate &&
    releaseMatchesExpected &&
    semanticSnapshotMatches &&
    failedActionCount === 0 &&
    failedActionKeys.length === 0 &&
    value.blockingReasons.length === 0;
  return {
    schemaVersion,
    checked,
    passed,
    reportedPassed,
    shapeValid,
    identityChecksum,
    expectedIdentityChecksum: expectedChecksum,
    identityMatchesExpected,
    contractFingerprint,
    candidate: {
      headCommit: contractHeadCommit,
      headMatchesCandidate,
    },
    release: {
      expectedId: reportedExpectedId,
      id: releaseId,
      releaseMatchesExpected,
      releaseKey: normalizeOptionalText(value?.release?.releaseKey),
      status: normalizeOptionalText(value?.release?.status),
      fingerprint: normalizeOptionalText(value?.release?.fingerprint)?.toLowerCase() ?? null,
      semanticSnapshotFingerprint:
        normalizeOptionalText(value?.release?.semanticSnapshotFingerprint)?.toLowerCase() ?? null,
      declaredSemanticSnapshotFingerprint:
        normalizeOptionalText(value?.release?.declaredSemanticSnapshotFingerprint)?.toLowerCase() ?? null,
      semanticSnapshotMatches,
    },
    gateway: value?.gateway && typeof value.gateway === 'object' ? value.gateway : {},
    actions: Array.isArray(value?.actions) ? value.actions : [],
    summary: {
      requiredActionCount,
      passedActionCount,
      failedActionCount,
      failedActionKeys,
    },
    blockingReasons: Array.isArray(value?.blockingReasons)
      ? value.blockingReasons.filter((item) => typeof item === 'string' && item.trim())
      : [],
    error: normalizeOptionalText(value?.error),
    checkedAt: normalizeOptionalText(value?.checkedAt),
  };
}

function normalizePositiveInteger(value) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function normalizeNonNegativeInteger(value) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : null;
}

function assertSameIds(label, actual, expected) {
  if (actual.length !== expected.length) throw new Error(`product loop eligibility suite mismatch:${label}`);
  const expectedIds = new Set(expected);
  const missing = actual.filter((id) => !expectedIds.has(id));
  if (missing.length) throw new Error(`product loop eligibility suite mismatch:${label}:${missing.join(',')}`);
}

function validateProductJourneys(manifest) {
  const productJourneys = manifest?.productJourneys;
  if (
    productJourneys?.schemaVersion !== 'ami-brain-product-journeys/v1' ||
    typeof productJourneys?.policy !== 'string' ||
    !productJourneys.policy.trim() ||
    !/^[0-9a-f]{64}$/iu.test(productJourneys?.currentReleaseCaseIdsChecksum ?? '') ||
    !Array.isArray(productJourneys?.cases) ||
    !productJourneys.cases.length
  ) {
    throw new Error('suite manifest product journeys invalid');
  }
  const caseIds = new Set();
  const journeyKeys = new Set();
  for (const item of productJourneys.cases) {
    if (
      !item ||
      typeof item !== 'object' ||
      typeof item.caseId !== 'string' ||
      !item.caseId ||
      typeof item.question !== 'string' ||
      !item.question ||
      !Array.isArray(item.journeyKeys) ||
      !item.journeyKeys.length ||
      item.journeyKeys.some((key) => typeof key !== 'string' || !key) ||
      ![
        'current_release_test',
        'next_iteration_feature',
        'evidence_review_required',
        'metric_definition_governance_required',
      ].includes(item.status) ||
      ![
        'release-core',
        'standard-regression',
        'extended-rotation',
        'next-iteration-feature',
        'evidence-review-required',
        'metric-definition-governance-required',
      ].includes(item.suite) ||
      typeof item.executable !== 'boolean' ||
      !Array.isArray(item.fixtureReferences) ||
      !item.fixtureReferences.length
    ) {
      throw new Error('suite manifest product journey case invalid');
    }
    if (caseIds.has(item.caseId)) throw new Error(`suite manifest product journey duplicate:${item.caseId}`);
    caseIds.add(item.caseId);
    const localKeys = new Set();
    for (const key of item.journeyKeys) {
      if (localKeys.has(key) || journeyKeys.has(key)) {
        throw new Error(`suite manifest product journey key duplicate:${key}`);
      }
      localKeys.add(key);
      journeyKeys.add(key);
    }
    for (const reference of item.fixtureReferences) {
      if (
        !reference ||
        typeof reference !== 'object' ||
        typeof reference.path !== 'string' ||
        !reference.path ||
        reference.marker !== item.caseId ||
        reference.questionMarker !== item.question ||
        !['automated_test', 'boundary_document'].includes(reference.evidenceKind)
      ) {
        throw new Error(`suite manifest product journey fixture invalid:${item.caseId}`);
      }
    }
    if (
      item.status === 'current_release_test' &&
      !item.fixtureReferences.some((reference) => reference.evidenceKind === 'automated_test')
    ) {
      throw new Error(`suite manifest current product journey lacks automated evidence:${item.caseId}`);
    }
    const executableSuite = ['release-core', 'standard-regression', 'extended-rotation'].includes(item.suite);
    if (item.status === 'current_release_test') {
      if (!item.executable || !executableSuite) {
        throw new Error(`suite manifest product journey execution invalid:${item.caseId}`);
      }
    } else {
      const expectedSuite =
        item.status === 'next_iteration_feature'
          ? 'next-iteration-feature'
          : item.status === 'metric_definition_governance_required'
            ? 'metric-definition-governance-required'
            : 'evidence-review-required';
      if (item.executable || item.suite !== expectedSuite) {
        throw new Error(`suite manifest product journey execution invalid:${item.caseId}`);
      }
    }
  }
  const currentReleaseCaseIds = productJourneys.cases
    .filter((item) => item.status === 'current_release_test')
    .map((item) => item.caseId);
  if (sha256(currentReleaseCaseIds.join('\n')) !== productJourneys.currentReleaseCaseIdsChecksum) {
    throw new Error('suite manifest product journey checksum invalid');
  }
  const releaseCoreIds = new Set(manifest.suites.releaseCore.caseIds);
  const standardIds = new Set(manifest.suites.standardRegression.caseIds);
  const rotationIds = new Set(manifest.suites.extendedRotation?.caseIds ?? []);
  const nextIterationIds = new Set(manifest.suites.nextIterationFeature?.caseIds ?? []);
  const evidenceReviewIds = new Set(manifest.suites.evidenceReviewRequired?.caseIds ?? []);
  const metricDefinitionIds = new Set(manifest.suites.metricDefinitionGovernanceRequired?.caseIds ?? []);
  for (const item of productJourneys.cases) {
    const actualSuite = releaseCoreIds.has(item.caseId)
      ? 'release-core'
      : standardIds.has(item.caseId)
        ? 'standard-regression'
        : rotationIds.has(item.caseId)
          ? 'extended-rotation'
          : nextIterationIds.has(item.caseId)
            ? 'next-iteration-feature'
            : evidenceReviewIds.has(item.caseId)
              ? 'evidence-review-required'
              : metricDefinitionIds.has(item.caseId)
                ? 'metric-definition-governance-required'
                : 'unassigned';
    if (actualSuite !== item.suite) {
      throw new Error(`suite manifest product journey suite mismatch:${item.caseId}:${actualSuite}`);
    }
  }
}

function summarizeStage(summary) {
  return {
    runId: summary.runId,
    stage: summary.stage,
    total: summary.total,
    expectedTotal: summary.expectedTotal,
    passed: summary.passed,
    failed: summary.failed,
    providerUnavailable: summary.providerUnavailable,
    p95LatencyMs: summary.p95LatencyMs,
    scorecards: summary.scorecards,
  };
}

function assertExactIds(label, actual, expected, failures) {
  const actualSet = new Set(actual);
  const expectedSet = new Set(expected);
  const missing = expected.filter((id) => !actualSet.has(id));
  const unexpected = actual.filter((id) => !expectedSet.has(id));
  if (actual.length !== actualSet.size) failures.push(`${label}:duplicate_ids`);
  if (missing.length) failures.push(`${label}:missing:${missing.slice(0, 20).join(',')}`);
  if (unexpected.length) failures.push(`${label}:unexpected:${unexpected.slice(0, 20).join(',')}`);
}
