import { createHash } from 'node:crypto';

const HASH_64 = /^[a-f0-9]{64}$/u;
const COMMIT_40 = /^[a-f0-9]{40}$/u;
const EVIDENCE_STATUSES = Object.freeze(['passed', 'failed', 'blocked']);
const MAX_EVIDENCE_VALIDITY_MS = 168 * 60 * 60 * 1000;

export const QUERY_ONLY_REQUIRED_EVIDENCE_TYPES = Object.freeze([
  'release_contract',
  'gold_100',
  'performance_60',
  'permission_matrix',
  'cross_client_e2e',
  'target_database',
  'provider_fallback',
  'rollback_drill',
]);

export const REVIEW_REQUIRED_EVIDENCE_TYPES = Object.freeze([
  'permission_matrix',
  'cross_client_e2e',
  'provider_fallback',
  'rollback_drill',
]);

export function createCandidateIdentity(input) {
  const candidate = record(input);
  const deployment = record(candidate.deployment);
  const databaseTarget = record(candidate.databaseTarget);
  const identity = {
    schemaVersion: 'ami-brain-candidate-identity/v1',
    productProfile: requiredText(candidate.productProfile, 'candidate_product_profile_missing'),
    runtimeCommit: commit40(candidate.runtimeCommit, 'candidate_runtime_commit_invalid'),
    diffChecksum: hash64(candidate.diffChecksum, 'candidate_diff_checksum_invalid'),
    releaseId: positiveInteger(candidate.releaseId, 'candidate_release_id_invalid'),
    releaseFingerprint: hash64(candidate.releaseFingerprint, 'candidate_release_fingerprint_invalid'),
    suiteManifestChecksum: hash64(candidate.suiteManifestChecksum, 'candidate_suite_manifest_checksum_invalid'),
    dataSnapshot: requiredText(candidate.dataSnapshot, 'candidate_data_snapshot_missing'),
    provider: requiredText(candidate.provider, 'candidate_provider_missing'),
    model: requiredText(candidate.model, 'candidate_model_missing'),
    timeoutMs: positiveInteger(candidate.timeoutMs, 'candidate_timeout_invalid'),
    fallbackPolicy: requiredText(candidate.fallbackPolicy, 'candidate_fallback_policy_missing'),
    deployment: {
      commit: commit40(deployment.commit, 'candidate_deployment_commit_invalid'),
      buildId: requiredText(deployment.buildId, 'candidate_deployment_build_id_missing'),
      environment: requiredText(deployment.environment, 'candidate_deployment_environment_missing'),
    },
    databaseTarget: {
      protocol: requiredText(databaseTarget.protocol, 'candidate_database_protocol_missing'),
      host: requiredText(databaseTarget.host, 'candidate_database_host_missing'),
      port: requiredText(databaseTarget.port, 'candidate_database_port_missing'),
      database: requiredText(databaseTarget.database, 'candidate_database_name_missing'),
      schema: requiredText(databaseTarget.schema, 'candidate_database_schema_missing'),
    },
    storeId: positiveInteger(candidate.storeId, 'candidate_store_id_invalid'),
    runKey: requiredText(candidate.runKey, 'candidate_run_key_missing'),
  };
  if (identity.deployment.commit !== identity.runtimeCommit) {
    throw new Error('candidate_deployment_commit_mismatch');
  }
  if (!['postgres', 'postgresql'].includes(identity.databaseTarget.protocol)) {
    throw new Error('candidate_database_protocol_invalid');
  }
  return identity;
}

export function createCandidateLock(input, now = new Date()) {
  const identity = createCandidateIdentity(input.identity ?? input);
  const lockedAt = validIso(input.lockedAt) ?? now.toISOString();
  const candidateId = sha256(identity);
  return {
    schemaVersion: 'ami-brain-candidate-lock/v1',
    candidateId,
    officialCandidateKey: `official-candidate:${identity.productProfile}`,
    receiptKey: `candidate-lock:${candidateId}`,
    identity,
    branch: optionalText(input.branch),
    lockedAt,
  };
}

export function validateCandidateLock(value) {
  const lock = record(value);
  if (lock.schemaVersion !== 'ami-brain-candidate-lock/v1') throw new Error('candidate_lock_schema_invalid');
  const identity = createCandidateIdentity(lock.identity);
  const candidateId = hash64(lock.candidateId, 'candidate_id_invalid');
  if (candidateId !== sha256(identity)) throw new Error('candidate_id_mismatch');
  if (lock.receiptKey !== `candidate-lock:${candidateId}`) throw new Error('candidate_lock_receipt_key_invalid');
  if (lock.officialCandidateKey !== `official-candidate:${identity.productProfile}`) {
    throw new Error('official_candidate_key_invalid');
  }
  const lockedAt = validIso(lock.lockedAt);
  if (!lockedAt) throw new Error('candidate_locked_at_invalid');
  return {
    schemaVersion: 'ami-brain-candidate-lock/v1',
    candidateId,
    officialCandidateKey: lock.officialCandidateKey,
    receiptKey: lock.receiptKey,
    identity,
    branch: optionalText(lock.branch),
    lockedAt,
  };
}

export function validateReleaseCandidateLockBinding(value, currentHead) {
  const lock = validateCandidateLock(value);
  const head = commit40(currentHead, 'release_candidate_current_head_invalid');
  if (lock.identity.runtimeCommit !== head) throw new Error('release_candidate_lock_head_mismatch');
  return lock;
}

export function createEvidenceReceipt(input, now = new Date()) {
  const candidateId = hash64(input.candidateId, 'evidence_candidate_id_invalid');
  const createdAt = validIso(input.createdAt) ?? now.toISOString();
  const expiresAt = validIso(input.expiresAt);
  if (!expiresAt || Date.parse(expiresAt) <= Date.parse(createdAt)) throw new Error('evidence_expires_at_invalid');
  if (Date.parse(expiresAt) - Date.parse(createdAt) > MAX_EVIDENCE_VALIDITY_MS) {
    throw new Error('evidence_validity_window_exceeded');
  }
  const evidenceType = enumText(
    input.evidenceType,
    QUERY_ONLY_REQUIRED_EVIDENCE_TYPES,
    'evidence_type_invalid',
  );
  const status = enumText(input.status, EVIDENCE_STATUSES, 'evidence_status_invalid');
  const artifactPaths = stringList(input.artifactPaths, 'evidence_artifact_paths_missing');
  const artifactChecksums = normalizedArtifactChecksums(input.artifactChecksums, artifactPaths);
  const reviewedBy = optionalText(input.reviewedBy);
  const reviewerRole = optionalText(input.reviewerRole);
  const traceRefs = optionalStringList(input.traceRefs);
  const reviewContext = normalizeReviewContext(input.reviewContext);
  const resultChecksum = hash64(input.resultChecksum, 'evidence_result_checksum_invalid');
  const expectedResultChecksum = calculateEvidenceResultChecksum({
    candidateId,
    evidenceType,
    status,
    artifactPaths,
    artifactChecksums,
    createdAt,
    expiresAt,
    reviewedBy,
    reviewerRole,
    traceRefs,
    reviewContext,
  });
  if (resultChecksum !== expectedResultChecksum) throw new Error('evidence_result_checksum_mismatch');
  const receipt = {
    schemaVersion: 'ami-brain-evidence-receipt/v2',
    candidateId,
    evidenceType,
    status,
    resultChecksum,
    artifactPaths,
    artifactChecksums,
    createdAt,
    expiresAt,
    reviewedBy,
    reviewerRole,
    traceRefs,
    reviewContext,
  };
  if (REVIEW_REQUIRED_EVIDENCE_TYPES.includes(evidenceType)) {
    if (!receipt.reviewedBy) throw new Error(`evidence_reviewer_missing:${evidenceType}`);
    if (!receipt.reviewerRole) throw new Error(`evidence_reviewer_role_missing:${evidenceType}`);
    if (!receipt.traceRefs.length) throw new Error(`evidence_trace_refs_missing:${evidenceType}`);
    for (const [key, values] of Object.entries(receipt.reviewContext)) {
      if (!values.length) throw new Error(`evidence_review_context_missing:${evidenceType}:${key}`);
    }
    for (const mediaPath of receipt.reviewContext.mediaPaths) {
      if (!receipt.artifactPaths.includes(mediaPath)) {
        throw new Error(`evidence_review_media_not_artifact:${evidenceType}:${mediaPath}`);
      }
    }
  }
  return receipt;
}

export function calculateEvidenceResultChecksum(input) {
  const artifactPaths = stringList(
    input.artifactPaths ?? Object.keys(record(input.artifactChecksums)),
    'evidence_artifact_paths_missing',
  );
  const createdAt = validIso(input.createdAt);
  if (!createdAt) throw new Error('evidence_created_at_invalid');
  const expiresAt = validIso(input.expiresAt);
  if (!expiresAt || Date.parse(expiresAt) <= Date.parse(createdAt)) throw new Error('evidence_expires_at_invalid');
  if (Date.parse(expiresAt) - Date.parse(createdAt) > MAX_EVIDENCE_VALIDITY_MS) {
    throw new Error('evidence_validity_window_exceeded');
  }
  return sha256({
    candidateId: hash64(input.candidateId, 'evidence_candidate_id_invalid'),
    evidenceType: enumText(input.evidenceType, QUERY_ONLY_REQUIRED_EVIDENCE_TYPES, 'evidence_type_invalid'),
    status: enumText(input.status, EVIDENCE_STATUSES, 'evidence_status_invalid'),
    artifactPaths,
    artifactChecksums: normalizedArtifactChecksums(input.artifactChecksums, artifactPaths),
    createdAt,
    expiresAt,
    reviewedBy: optionalText(input.reviewedBy),
    reviewerRole: optionalText(input.reviewerRole),
    traceRefs: optionalStringList(input.traceRefs),
    reviewContext: normalizeReviewContext(input.reviewContext),
  });
}

export function closeCandidateEvidence(input, now = new Date()) {
  const lock = validateCandidateLock(input.candidateLock);
  const requiredEvidenceTypes = input.requiredEvidenceTypes ?? requiredEvidenceTypesForProfile(lock.identity.productProfile);
  const receipts = (input.evidenceReceipts ?? []).map((receipt) => createEvidenceReceipt(receipt, now));
  const blockers = [];
  const evidence = {};
  for (const receipt of receipts) {
    if (receipt.candidateId !== lock.candidateId) {
      blockers.push(`evidence_candidate_mismatch:${receipt.evidenceType}`);
      continue;
    }
    if (receipt.status !== 'passed') {
      blockers.push(`evidence_not_passed:${receipt.evidenceType}`);
      continue;
    }
    if (Date.parse(receipt.expiresAt) <= now.getTime()) {
      blockers.push(`evidence_expired:${receipt.evidenceType}`);
      continue;
    }
    const existing = evidence[receipt.evidenceType];
    if (!existing || Date.parse(receipt.createdAt) > Date.parse(existing.createdAt)) {
      evidence[receipt.evidenceType] = receipt;
    }
  }
  for (const evidenceType of requiredEvidenceTypes) {
    if (!evidence[evidenceType]) blockers.push(`required_evidence_missing:${evidenceType}`);
  }
  const normalizedBlockers = [...new Set(blockers)].sort();
  const evidenceChecksums = Object.fromEntries(
    Object.entries(evidence)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, receipt]) => [key, receipt.resultChecksum]),
  );
  const closedAt = now.toISOString();
  const evidenceExpiryTimes = Object.values(evidence).map((receipt) => Date.parse(receipt.expiresAt));
  const result = {
    schemaVersion: 'ami-brain-release-eligibility/v1',
    candidateId: lock.candidateId,
    productProfile: lock.identity.productProfile,
    releaseId: lock.identity.releaseId,
    releaseFingerprint: lock.identity.releaseFingerprint,
    requiredEvidenceTypes: [...requiredEvidenceTypes],
    evidenceChecksums,
    blockers: normalizedBlockers,
    releaseEligible: normalizedBlockers.length === 0,
    closedAt,
    expiresAt: evidenceExpiryTimes.length
      ? new Date(Math.min(...evidenceExpiryTimes)).toISOString()
      : null,
  };
  return {
    ...result,
    receiptKey: `release-eligibility:${lock.candidateId}`,
    resultChecksum: sha256(result),
  };
}

export function requiredEvidenceTypesForProfile(productProfile) {
  if (productProfile !== 'query_only_v1') throw new Error(`candidate_product_profile_unsupported:${productProfile}`);
  return [...QUERY_ONLY_REQUIRED_EVIDENCE_TYPES];
}

export function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

export function sha256(value) {
  return createHash('sha256').update(typeof value === 'string' ? value : stableStringify(value)).digest('hex');
}

function record(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function requiredText(value, code) {
  const text = String(value ?? '').trim();
  if (!text) throw new Error(code);
  return text;
}

function optionalText(value) {
  const text = String(value ?? '').trim();
  return text || null;
}

function hash64(value, code) {
  const text = String(value ?? '').trim().toLowerCase();
  if (!HASH_64.test(text)) throw new Error(code);
  return text;
}

function commit40(value, code) {
  const text = String(value ?? '').trim().toLowerCase();
  if (!COMMIT_40.test(text)) throw new Error(code);
  return text;
}

function positiveInteger(value, code) {
  const number = Number(value);
  if (!Number.isInteger(number) || number <= 0) throw new Error(code);
  return number;
}

function validIso(value) {
  const text = String(value ?? '').trim();
  const parsed = Date.parse(text);
  return text && Number.isFinite(parsed) ? new Date(parsed).toISOString() : null;
}

function stringList(value, code) {
  const list = optionalStringList(value);
  if (!list.length) throw new Error(code);
  return list;
}

function optionalStringList(value) {
  return Array.isArray(value) ? [...new Set(value.map(optionalText).filter(Boolean))].sort() : [];
}

function normalizedArtifactChecksums(value, artifactPaths) {
  const checksums = record(value);
  const keys = Object.keys(checksums).sort();
  if (keys.length !== artifactPaths.length || keys.some((key, index) => key !== artifactPaths[index])) {
    throw new Error('evidence_artifact_checksum_paths_mismatch');
  }
  return Object.fromEntries(keys.map((path) => [
    path,
    hash64(checksums[path], `evidence_artifact_checksum_invalid:${path}`),
  ]));
}

function normalizeReviewContext(value) {
  const context = record(value);
  return {
    accountRefs: optionalStringList(context.accountRefs),
    roleRefs: optionalStringList(context.roleRefs),
    storeRefs: optionalStringList(context.storeRefs),
    runRefs: optionalStringList(context.runRefs),
    mediaPaths: optionalStringList(context.mediaPaths),
  };
}

function enumText(value, allowed, code) {
  const text = requiredText(value, code);
  if (!allowed.includes(text)) throw new Error(code);
  return text;
}
