import { createHash } from 'node:crypto';

export const PERFORMANCE_BUCKET_POLICY = {
  quick: {
    label: '快速澄清与拒绝',
    count: 20,
    allowedTypes: ['ambiguity', 'permission'],
    budgetsMs: { p50: 1500, p95: 3000, max: 5000 },
  },
  single: {
    label: '单能力查询',
    count: 20,
    allowedTypes: ['query_single'],
    budgetsMs: { p50: 3000, p95: 8000, max: 12000 },
  },
  multi: {
    label: '多能力分析',
    count: 10,
    allowedTypes: ['query_cross', 'analysis', 'risk', 'advice', 'prediction'],
    budgetsMs: { p50: 6000, p95: 15000, max: 20000 },
  },
  multiTurn: {
    label: '多轮承接',
    count: 10,
    allowedTypes: ['multi_turn'],
    budgetsMs: { p50: 8000, p95: 20000, max: 25000 },
  },
};

export function selectPerformanceCases(rows, standardCaseIds) {
  const standard = new Set(standardCaseIds);
  const eligible = rows.filter(
    (row) =>
      standard.has(row.id) &&
      row.status === 'KEEP' &&
      row.product_loop_status === 'current_release_test',
  );
  const quick = [
    ...selectDiverse(eligible.filter((row) => row.type === 'ambiguity'), 10),
    ...selectDiverse(eligible.filter((row) => row.type === 'permission'), 10),
  ];
  const single = selectDiverse(eligible.filter((row) => row.type === 'query_single'), 20);
  const multi = PERFORMANCE_BUCKET_POLICY.multi.allowedTypes.flatMap((type) =>
    selectDiverse(eligible.filter((row) => row.type === type), 2),
  );
  const multiTurn = selectDiverse(eligible.filter((row) => row.type === 'multi_turn'), 10);
  const result = { quick, single, multi, multiTurn };
  for (const [key, policy] of Object.entries(PERFORMANCE_BUCKET_POLICY)) {
    if (result[key].length !== policy.count) {
      throw new Error(`performance bucket quota unavailable:${key}:${result[key].length}/${policy.count}`);
    }
  }
  const all = Object.values(result).flat();
  if (new Set(all.map((item) => item.id)).size !== 60) throw new Error('performance suite case ids are not unique');
  return result;
}

export function validatePerformanceManifest(manifest, sources) {
  if (manifest?.schemaVersion !== 'ami-brain-performance-suite/v1') {
    throw new Error('performance manifest schema invalid');
  }
  for (const [key, expected] of Object.entries({
    classificationChecksum: sha256(sources.classificationRaw),
    suiteManifestChecksum: sha256(sources.suiteManifestRaw),
    productLoopEligibilityChecksum: sha256(sources.productLoopRaw),
  })) {
    if (manifest.source?.[key] !== expected) throw new Error(`performance manifest source mismatch:${key}`);
  }
  const suite = JSON.parse(sources.suiteManifestRaw);
  const productLoop = JSON.parse(sources.productLoopRaw);
  const standard = new Set(suite.suites.standardRegression.caseIds);
  const statuses = new Map(productLoop.cases.map((item) => [item.id, item.status]));
  const allIds = [];
  for (const [key, policy] of Object.entries(PERFORMANCE_BUCKET_POLICY)) {
    const bucket = manifest.buckets?.[key];
    if (!bucket || bucket.caseCount !== policy.count || bucket.caseIds?.length !== policy.count) {
      throw new Error(`performance bucket count invalid:${key}`);
    }
    if (JSON.stringify(bucket.budgetsMs) !== JSON.stringify(policy.budgetsMs)) {
      throw new Error(`performance bucket budget invalid:${key}`);
    }
    if (bucket.caseIdsChecksum !== sha256(bucket.caseIds.join('\n'))) {
      throw new Error(`performance bucket checksum invalid:${key}`);
    }
    for (const item of bucket.cases ?? []) {
      if (!bucket.caseIds.includes(item.id) || !policy.allowedTypes.includes(item.type)) {
        throw new Error(`performance bucket case contract invalid:${key}:${item.id}`);
      }
    }
    for (const id of bucket.caseIds) {
      if (!standard.has(id)) throw new Error(`performance case outside standard regression:${id}`);
      if (statuses.get(id) !== 'current_release_test') throw new Error(`performance case ineligible:${id}`);
    }
    allIds.push(...bucket.caseIds);
  }
  if (allIds.length !== 60 || new Set(allIds).size !== 60) throw new Error('performance manifest ids invalid');
  if (manifest.caseCount !== 60 || manifest.caseIdsChecksum !== sha256(allIds.join('\n'))) {
    throw new Error('performance manifest total invalid');
  }
  return manifest;
}

export function buildPerformanceAcceptance(manifest, summaries) {
  const blockingReasons = [];
  const bucketEvidence = {};
  const runIds = [];
  let identity = null;
  for (const [key, policy] of Object.entries(PERFORMANCE_BUCKET_POLICY)) {
    const bucket = manifest.buckets[key];
    const summary = summaries[key];
    if (!summary) {
      blockingReasons.push(`${key}:missing_summary`);
      continue;
    }
    const currentIdentity = {
      releaseId: summary.activeRelease?.id,
      storeId: summary.storeId,
      sourceCommit: summary.sourceCommit,
      releaseFingerprint: summary.releaseFingerprint,
      runtimeCommit: summary.productionHealth?.commit,
      suiteManifestChecksum: summary.suiteManifestChecksum,
    };
    if (!identity) identity = currentIdentity;
    else if (JSON.stringify(identity) !== JSON.stringify(currentIdentity)) {
      blockingReasons.push(`${key}:candidate_identity_mismatch`);
    }
    if (summary.suiteManifestChecksum !== manifest.source.suiteManifestChecksum) {
      blockingReasons.push(`${key}:suite_manifest_identity_mismatch`);
    }
    if (
      typeof summary.sourceCommit !== 'string' ||
      !/^[0-9a-f]{40}$/iu.test(summary.sourceCommit) ||
      summary.productionHealth?.commit !== summary.sourceCommit ||
      typeof summary.releaseFingerprint !== 'string' ||
      !/^[0-9a-f]{64}$/iu.test(summary.releaseFingerprint) ||
      !Number.isInteger(Number(summary.activeRelease?.id)) ||
      !Number.isInteger(Number(summary.storeId))
    ) {
      blockingReasons.push(`${key}:candidate_identity_invalid`);
    }
    const latency = summary.latencyBreakdown?.userResponse;
    if (
      !Number.isInteger(Number(summary.runId)) ||
      Number(summary.runId) <= 0 ||
      summary.total !== policy.count ||
      summary.expectedTotal !== policy.count ||
      summary.suiteCaseIdsChecksum !== bucket.caseIdsChecksum
    ) {
      blockingReasons.push(`${key}:case_evidence_incomplete`);
    }
    if (
      Number(summary.failed ?? -1) !== 0 ||
      Number(summary.providerUnavailable ?? -1) !== 0 ||
      summary.productSafetyGate === 'blocked' ||
      Number(summary.scorecards?.suspectedFalseSuccess?.count ?? -1) !== 0
    ) {
      blockingReasons.push(`${key}:functional_result_failed`);
    }
    if (
      latency?.count !== policy.count ||
      !Number.isFinite(latency?.p50Ms) ||
      !Number.isFinite(latency?.p95Ms) ||
      !Number.isFinite(latency?.maxMs)
    ) {
      blockingReasons.push(`${key}:latency_evidence_missing`);
    } else {
      if (latency.p50Ms > policy.budgetsMs.p50) blockingReasons.push(`${key}:p50_budget_exceeded`);
      if (latency.p95Ms > policy.budgetsMs.p95) blockingReasons.push(`${key}:p95_budget_exceeded`);
      if (latency.maxMs > policy.budgetsMs.max) blockingReasons.push(`${key}:max_budget_exceeded`);
    }
    bucketEvidence[key] = {
      runId: summary.runId ?? null,
      caseCount: summary.total ?? null,
      caseIdsChecksum: bucket.caseIdsChecksum,
      latency: latency ?? null,
      budgetsMs: policy.budgetsMs,
    };
    if (Number.isInteger(Number(summary.runId)) && Number(summary.runId) > 0) runIds.push(Number(summary.runId));
  }
  if (runIds.length !== Object.keys(PERFORMANCE_BUCKET_POLICY).length || new Set(runIds).size !== runIds.length) {
    blockingReasons.push('performance_run_ids_invalid');
  }
  return {
    schemaVersion: 'ami-brain-performance-acceptance/v1',
    status: blockingReasons.length ? 'blocked' : 'ready',
    manifestVersion: manifest.manifestVersion,
    manifestCaseIdsChecksum: manifest.caseIdsChecksum,
    identity,
    buckets: bucketEvidence,
    blockingReasons,
  };
}

export function buildPerformancePreflight({ candidatePreflight, parentRun, parentInspectionError, expected }) {
  const blockingReasons = [...(candidatePreflight?.blockingReasons ?? ['candidate_preflight_missing'])];
  const summary = record(parentRun?.summary);
  const productAcceptance = record(summary.productAcceptance);
  const mismatches = [];

  if (parentInspectionError) {
    blockingReasons.push('standard_regression_parent_inspection_failed');
  } else if (!parentRun) {
    blockingReasons.push('standard_regression_parent_run_missing');
  } else {
    if (Number(parentRun.id) !== expected.standardRegressionRunId) mismatches.push('run_id');
    if (parentRun.status !== 'completed') mismatches.push('status');
    if (Number(parentRun.releaseId) !== expected.releaseId) mismatches.push('release_id');
    if (Number(parentRun.storeId) !== expected.storeId) mismatches.push('store_id');
    if (summary.stage !== 'standard-regression') mismatches.push('stage');
    if (summary.executionMode !== 'delta_after_release_core') mismatches.push('execution_mode');
    if (Number(summary.runId) !== expected.standardRegressionRunId) mismatches.push('summary_run_id');
    if (Number(summary.activeRelease?.id) !== expected.releaseId) mismatches.push('summary_release_id');
    if (Number(summary.storeId) !== expected.storeId) mismatches.push('summary_store_id');
    if (summary.sourceCommit !== expected.runtimeCommit) mismatches.push('source_commit');
    if (summary.productionHealth?.commit !== expected.runtimeCommit) mismatches.push('runtime_commit');
    if (summary.suiteManifestChecksum !== expected.suiteManifestChecksum) mismatches.push('suite_manifest_checksum');
    if (productAcceptance.canActivate !== true) mismatches.push('product_acceptance');
    if (Number(productAcceptance.standardRegressionRunId) !== expected.standardRegressionRunId) {
      mismatches.push('product_acceptance_run_id');
    }
    blockingReasons.push(...mismatches.map((field) => `standard_regression_parent_identity_mismatch:${field}`));
  }

  const uniqueBlockingReasons = [...new Set(blockingReasons)];
  return {
    schemaVersion: 'ami-brain-performance-preflight/v1',
    ready: uniqueBlockingReasons.length === 0,
    candidate: candidatePreflight ?? null,
    parentStandardRegression: parentRun
      ? {
          id: Number(parentRun.id),
          status: parentRun.status ?? null,
          releaseId: Number(parentRun.releaseId),
          storeId: Number(parentRun.storeId),
          stage: summary.stage ?? null,
          executionMode: summary.executionMode ?? null,
          sourceCommit: summary.sourceCommit ?? null,
          runtimeCommit: summary.productionHealth?.commit ?? null,
          suiteManifestChecksum: summary.suiteManifestChecksum ?? null,
          productAcceptanceReady: productAcceptance.canActivate === true,
        }
      : null,
    parentInspectionError: typeof parentInspectionError === 'string' ? parentInspectionError : null,
    blockingReasons: uniqueBlockingReasons,
  };
}

export function sha256(value) {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function record(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function selectDiverse(rows, count) {
  const remaining = [...rows].sort((left, right) => left.id.localeCompare(right.id));
  const selected = [];
  const seen = { domain: new Set(), role: new Set(), difficulty: new Set(), time: new Set(), type: new Set() };
  while (selected.length < count && remaining.length) {
    remaining.sort((left, right) => diversityScore(right, seen) - diversityScore(left, seen) || left.id.localeCompare(right.id));
    const item = remaining.shift();
    selected.push(item);
    seen.domain.add(item.domain);
    seen.role.add(item.role);
    seen.difficulty.add(item.difficulty);
    seen.time.add(item.time_semantics);
    seen.type.add(item.type);
  }
  return selected;
}

function diversityScore(item, seen) {
  return (
    Number(!seen.domain.has(item.domain)) * 16 +
    Number(!seen.type.has(item.type)) * 8 +
    Number(!seen.role.has(item.role)) * 4 +
    Number(!seen.difficulty.has(item.difficulty)) * 2 +
    Number(!seen.time.has(item.time_semantics))
  );
}
