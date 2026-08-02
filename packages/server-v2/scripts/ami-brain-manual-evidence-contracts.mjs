import { validateCandidateLock } from './ami-brain-candidate-identity-core.mjs';

export const PERMISSION_ROLE_KEYS = Object.freeze([
  'super_admin',
  'store_manager',
  'receptionist',
  'marketing',
  'beautician',
  'finance',
  'inventory',
  'customer_service',
]);

export const CROSS_CLIENT_KEYS = Object.freeze([
  'management_web',
  'mobile_app',
  'aura_lite',
]);

export const CROSS_CLIENT_JOURNEY_KEYS = Object.freeze([
  'query',
  'clarification',
  'multi_turn',
  'structured_source',
  'empty_result',
  'system_failure',
  'provider_unavailable',
  'network_error',
  'permission_denied',
  'cross_store_denied',
  'historical_action_blocked',
]);

export const PROVIDER_FALLBACK_SCENARIO_KEYS = Object.freeze([
  'timeout',
  'rate_limited',
  'provider_unavailable',
  'fallback_success',
  'fallback_failure',
]);

export const ROLLOUT_PLANNED_STAGE_KEYS = Object.freeze([
  'shadow',
  '5_percent',
  '20_percent',
  '50_percent',
  '100_percent',
]);

export const ROLLBACK_PRE_GO_STAGE_KEYS = Object.freeze([
  'shadow',
  '5_percent',
  'rollback',
]);

const MANUAL_EVIDENCE_SCHEMAS = Object.freeze({
  permission_matrix: 'ami-brain-permission-matrix-evidence/v1',
  cross_client_e2e: 'ami-brain-cross-client-e2e-evidence/v1',
  provider_fallback: 'ami-brain-provider-fallback-evidence/v1',
  rollback_drill: 'ami-brain-rollback-drill-evidence/v1',
});

export function createManualEvidenceTemplate(lockValue, evidenceType, now = new Date()) {
  const lock = validateCandidateLock(lockValue);
  const base = {
    schemaVersion: schemaFor(evidenceType),
    generatedAt: now.toISOString(),
    status: 'blocked',
    candidateId: lock.candidateId,
    candidateIdentity: candidateIdentity(lock),
    blockers: ['evidence_not_completed'],
  };
  if (evidenceType === 'permission_matrix') {
    return {
      ...base,
      roleResults: PERMISSION_ROLE_KEYS.map((roleKey) => ({
        roleKey,
        accountRef: '',
        expectedScope: roleKey === 'super_admin' ? 'global' : 'store',
        sameStoreAccessPassed: false,
        scopePolicyPassed: false,
        sensitiveFieldPolicyPassed: false,
        queryOnlyNoWrite: false,
        falseSuccessCount: null,
        traceRefs: [],
      })),
      deniedBaseline: {
        accountRef: '',
        accessDenied: false,
        queryOnlyNoWrite: false,
        falseSuccessCount: null,
        traceRefs: [],
      },
      summary: {
        crossStoreLeakCount: null,
        unauthorizedAccessCount: null,
        businessWriteCount: null,
        falseSuccessCount: null,
      },
    };
  }
  if (evidenceType === 'cross_client_e2e') {
    return {
      ...base,
      clientResults: CROSS_CLIENT_KEYS.map((clientKey) => ({
        clientKey,
        passedJourneyKeys: [],
        failedJourneyKeys: [...CROSS_CLIENT_JOURNEY_KEYS],
        confirmRequestsSent: null,
        retryRequestsSent: null,
        falseSuccessCount: null,
        traceRefs: [],
      })),
      summary: { falseSuccessCount: null },
    };
  }
  if (evidenceType === 'provider_fallback') {
    return {
      ...base,
      primaryProvider: lock.identity.provider,
      fallbackPolicy: lock.identity.fallbackPolicy,
      scenarioResults: PROVIDER_FALLBACK_SCENARIO_KEYS.map((scenarioKey) => ({
        scenarioKey,
        passed: false,
        stuckRunning: null,
        falseSuccess: null,
        traceRefs: [],
      })),
      summary: { longRunningCount: null, falseSuccessCount: null },
    };
  }
  return {
    ...base,
    plannedStages: [...ROLLOUT_PLANNED_STAGE_KEYS],
    executedStageResults: ROLLBACK_PRE_GO_STAGE_KEYS.map((stageKey) => ({
      stageKey,
      passed: false,
      traceRefs: [],
    })),
    monitoringThresholdsConfigured: false,
    automaticPauseVerified: false,
    rollbackVerified: false,
    postRollbackReady: false,
    postRollbackActionsDisabled: false,
    summary: { businessWriteCount: null, falseSuccessCount: null },
  };
}

export function validateManualEvidenceArtifact(lockValue, evidenceType, artifactValue) {
  const lock = validateCandidateLock(lockValue);
  const artifact = record(artifactValue);
  if (artifact.schemaVersion !== schemaFor(evidenceType)) fail(evidenceType);
  if (artifact.status !== 'passed' || list(artifact.blockers).length) fail(evidenceType);
  assertCandidateIdentity(lock, artifact, evidenceType);
  if (evidenceType === 'permission_matrix') validatePermissionMatrix(artifact);
  else if (evidenceType === 'cross_client_e2e') validateCrossClientE2e(artifact);
  else if (evidenceType === 'provider_fallback') validateProviderFallback(lock, artifact);
  else validateRollbackDrill(artifact);
  return artifact;
}

function validatePermissionMatrix(artifact) {
  const roleResults = exactResults(artifact.roleResults, 'roleKey', PERMISSION_ROLE_KEYS, 'permission_matrix');
  for (const roleKey of PERMISSION_ROLE_KEYS) {
    const result = roleResults.get(roleKey);
    const expectedScope = roleKey === 'super_admin' ? 'global' : 'store';
    if (
      !text(result.accountRef)
      || result.expectedScope !== expectedScope
      || result.sameStoreAccessPassed !== true
      || result.scopePolicyPassed !== true
      || result.sensitiveFieldPolicyPassed !== true
      || result.queryOnlyNoWrite !== true
      || result.falseSuccessCount !== 0
      || !stringList(result.traceRefs).length
    ) fail('permission_matrix');
  }
  const deniedBaseline = record(artifact.deniedBaseline);
  if (
    !text(deniedBaseline.accountRef)
    || deniedBaseline.accessDenied !== true
    || deniedBaseline.queryOnlyNoWrite !== true
    || deniedBaseline.falseSuccessCount !== 0
    || !stringList(deniedBaseline.traceRefs).length
  ) fail('permission_matrix');
  assertZeroSummary(artifact.summary, [
    'crossStoreLeakCount',
    'unauthorizedAccessCount',
    'businessWriteCount',
    'falseSuccessCount',
  ], 'permission_matrix');
}

function validateCrossClientE2e(artifact) {
  const clientResults = exactResults(artifact.clientResults, 'clientKey', CROSS_CLIENT_KEYS, 'cross_client_e2e');
  for (const clientKey of CROSS_CLIENT_KEYS) {
    const result = clientResults.get(clientKey);
    if (
      !sameSet(stringList(result.passedJourneyKeys), CROSS_CLIENT_JOURNEY_KEYS)
      || stringList(result.failedJourneyKeys).length
      || result.confirmRequestsSent !== 0
      || result.retryRequestsSent !== 0
      || result.falseSuccessCount !== 0
      || !stringList(result.traceRefs).length
    ) fail('cross_client_e2e');
  }
  assertZeroSummary(artifact.summary, ['falseSuccessCount'], 'cross_client_e2e');
}

function validateProviderFallback(lock, artifact) {
  if (artifact.primaryProvider !== lock.identity.provider || artifact.fallbackPolicy !== lock.identity.fallbackPolicy) {
    fail('provider_fallback');
  }
  const results = exactResults(
    artifact.scenarioResults,
    'scenarioKey',
    PROVIDER_FALLBACK_SCENARIO_KEYS,
    'provider_fallback',
  );
  for (const scenarioKey of PROVIDER_FALLBACK_SCENARIO_KEYS) {
    const result = results.get(scenarioKey);
    if (
      result.passed !== true
      || result.stuckRunning !== false
      || result.falseSuccess !== false
      || !stringList(result.traceRefs).length
    ) fail('provider_fallback');
  }
  assertZeroSummary(artifact.summary, ['longRunningCount', 'falseSuccessCount'], 'provider_fallback');
}

function validateRollbackDrill(artifact) {
  if (!sameSet(stringList(artifact.plannedStages), ROLLOUT_PLANNED_STAGE_KEYS)) fail('rollback_drill');
  const results = resultMap(artifact.executedStageResults, 'stageKey', 'rollback_drill');
  for (const stageKey of ROLLBACK_PRE_GO_STAGE_KEYS) {
    const result = results.get(stageKey);
    if (!result || result.passed !== true || !stringList(result.traceRefs).length) fail('rollback_drill');
  }
  if (
    artifact.monitoringThresholdsConfigured !== true
    || artifact.automaticPauseVerified !== true
    || artifact.rollbackVerified !== true
    || artifact.postRollbackReady !== true
    || artifact.postRollbackActionsDisabled !== true
  ) fail('rollback_drill');
  assertZeroSummary(artifact.summary, ['businessWriteCount', 'falseSuccessCount'], 'rollback_drill');
}

function assertCandidateIdentity(lock, artifact, evidenceType) {
  const identity = record(artifact.candidateIdentity);
  const mismatches = [];
  if (artifact.candidateId !== lock.candidateId) mismatches.push('candidateId');
  for (const key of ['productProfile', 'runtimeCommit', 'releaseFingerprint']) {
    if (identity[key] !== lock.identity[key]) mismatches.push(key);
  }
  for (const key of ['releaseId', 'storeId']) {
    if (Number(identity[key]) !== lock.identity[key]) mismatches.push(key);
  }
  if (mismatches.length) {
    throw new Error(`${evidenceType}_candidate_identity_mismatch:${[...new Set(mismatches)].join(',')}`);
  }
}

function candidateIdentity(lock) {
  return {
    productProfile: lock.identity.productProfile,
    runtimeCommit: lock.identity.runtimeCommit,
    releaseId: lock.identity.releaseId,
    releaseFingerprint: lock.identity.releaseFingerprint,
    storeId: lock.identity.storeId,
  };
}

function schemaFor(evidenceType) {
  const schema = MANUAL_EVIDENCE_SCHEMAS[evidenceType];
  if (!schema) throw new Error(`manual_evidence_type_unsupported:${evidenceType}`);
  return schema;
}

function exactResults(value, key, requiredKeys, evidenceType) {
  const results = resultMap(value, key, evidenceType);
  if (!sameSet([...results.keys()], requiredKeys)) fail(evidenceType);
  return results;
}

function resultMap(value, key, evidenceType) {
  const rows = list(value).map(record);
  const entries = rows.map((row) => [text(row[key]), row]).filter(([itemKey]) => itemKey);
  const results = new Map(entries);
  if (results.size !== rows.length) fail(evidenceType);
  return results;
}

function assertZeroSummary(value, keys, evidenceType) {
  const summary = record(value);
  if (keys.some((key) => summary[key] !== 0)) fail(evidenceType);
}

function sameSet(left, right) {
  const leftSorted = [...new Set(left)].sort();
  const rightSorted = [...new Set(right)].sort();
  return leftSorted.length === rightSorted.length && leftSorted.every((value, index) => value === rightSorted[index]);
}

function stringList(value) {
  return list(value).map(text).filter(Boolean);
}

function list(value) {
  return Array.isArray(value) ? value : [];
}

function record(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function text(value) {
  return String(value ?? '').trim();
}

function fail(evidenceType) {
  throw new Error(`${evidenceType}_artifact_not_ready`);
}
