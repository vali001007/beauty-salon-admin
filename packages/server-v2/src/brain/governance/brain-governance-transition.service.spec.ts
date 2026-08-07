import { createHash } from 'node:crypto';
import { BrainGovernanceTransitionService } from './brain-governance-transition.service.js';
import {
  BRAIN_QUERY_ONLY_ALLOWED_CAPABILITY_KEYS,
  BRAIN_QUERY_ONLY_DISABLED_CAPABILITY_KEYS,
} from './brain-release-product-profile.js';

const HASH = 'a'.repeat(64);
const HEAD_COMMIT = 'abcdef1234567890abcdef1234567890abcdef12';
const EVALUATION_RELEASE_ID = 901;
const EVAL_RUN_ID = 902;
const EVIDENCE_RECEIPT_ID = 903;
const CORE_REQUIRED_EVIDENCE_TYPES = [
  'release_contract',
  'permission_matrix',
  'cross_client_e2e',
  'target_database',
  'provider_fallback',
  'rollback_drill',
];
const PRERELEASE_REQUIRED_EVIDENCE_TYPES = CORE_REQUIRED_EVIDENCE_TYPES.filter((gateKey) => gateKey !== 'rollback_drill');
const EXTENDED_MANUAL_EVIDENCE_TYPES: string[] = [];
const QUERY_ONLY_CAPABILITY_KEYS = [
  ...BRAIN_QUERY_ONLY_ALLOWED_CAPABILITY_KEYS,
  ...BRAIN_QUERY_ONLY_DISABLED_CAPABILITY_KEYS,
];

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value && typeof value === 'object') {
    const object = value as Record<string, unknown>;
    return `{${Object.keys(object).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(object[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function stableHash(value: unknown) {
  return createHash('sha256').update(typeof value === 'string' ? value : stableStringify(value)).digest('hex');
}

function releaseSnapshotLineage(overrides: { lockRuntimeCommit?: string; missingEvidenceChecksumType?: string } = {}) {
  const candidate = {
    id: 3,
    candidateKey: 'owner/repo:head:merge',
    branch: 'main',
    baseCommit: '1'.repeat(40),
    mergeBaseCommit: '2'.repeat(40),
    headCommit: HEAD_COMMIT,
    diffChecksum: '3'.repeat(64),
    sourceFingerprint: '4'.repeat(64),
    status: 'checking',
  };
  const lockIdentity = {
    schemaVersion: 'ami-brain-candidate-identity/v1',
    productProfile: 'query_only_v1',
    runtimeCommit: overrides.lockRuntimeCommit ?? HEAD_COMMIT,
    diffChecksum: '5'.repeat(64),
    releaseId: EVALUATION_RELEASE_ID,
    releaseFingerprint: HASH,
    evaluationIdentity: { family: 'evaluation', code: 'EV-901', internalReleaseId: EVALUATION_RELEASE_ID },
    suiteManifestChecksum: HASH,
    dataSnapshot: 'shared-supabase-20260805',
    provider: 'openai_compatible',
    model: 'gpt-5.6-luna',
    timeoutMs: 30000,
    fallbackPolicy: 'deterministic',
    deployment: { commit: overrides.lockRuntimeCommit ?? HEAD_COMMIT, buildId: 'build-1', environment: 'production' },
    databaseTarget: { protocol: 'postgresql', host: 'pooler.supabase.com', port: '5432', database: 'postgres', schema: 'public' },
    storeId: 1,
    runKey: 'rc-350-run',
  };
  const candidateLockId = stableHash(lockIdentity);
  const candidateLock = {
    schemaVersion: 'ami-brain-candidate-lock/v1',
    candidateId: candidateLockId,
    officialCandidateKey: 'official-candidate:query_only_v1',
    receiptKey: `candidate-lock:${candidateLockId}`,
    identity: lockIdentity,
    branch: 'main',
    lockedAt: '2026-08-05T00:00:00.000Z',
  };
  const evidenceTypes = [...CORE_REQUIRED_EVIDENCE_TYPES, ...EXTENDED_MANUAL_EVIDENCE_TYPES]
    .filter((key) => key !== overrides.missingEvidenceChecksumType);
  const evidenceChecksums = Object.fromEntries(evidenceTypes.map((key, index) => [key, String(index + 1).repeat(64)]));
  const eligibilityCore = {
    schemaVersion: 'ami-brain-release-eligibility/v2',
    candidateId: candidateLockId,
    productProfile: 'query_only_v1',
    releaseId: EVALUATION_RELEASE_ID,
    evaluationVersionCode: 'EV-901',
    releaseFingerprint: HASH,
    requiredEvidenceTypes: CORE_REQUIRED_EVIDENCE_TYPES,
    extendedManualEvidenceTypes: EXTENDED_MANUAL_EVIDENCE_TYPES,
    extendedManualComplete: false,
    extendedManualBlocksRelease: false,
    evidenceChecksums,
    blockers: [],
    releaseEligible: true,
    closedAt: '2026-08-05T00:10:00.000Z',
    expiresAt: '2099-08-05T00:10:00.000Z',
  };
  const candidateReceipt = {
    id: 801,
    receiptKey: 'candidate-oidc',
    changedFilesChecksum: HASH,
    sourceFingerprint: candidate.sourceFingerprint,
    releaseFingerprint: HASH,
    suiteChecksum: HASH,
    dataSnapshot: 'shared-supabase-20260805',
    provider: 'openai_compatible',
    model: 'gpt-5.6-luna',
    timeoutMs: 30000,
    resultChecksum: HASH,
    result: {
      candidateKey: candidate.candidateKey,
      headCommit: candidate.headCommit,
      sourceFingerprint: candidate.sourceFingerprint,
      verification: { admissionEligible: true },
    },
    expiresAt: new Date('2099-08-05T00:00:00.000Z'),
    stage: 'candidate',
    status: 'passed',
    trustLevel: 'trusted_candidate',
    issuerType: 'ci',
    headCommit: candidate.headCommit,
    identityChecksum: HASH,
    issuer: 'CI/CD',
    verificationStatus: 'verified',
    evaluationReleaseId: null,
  };
  const eligibilityReceipt = {
    id: 802,
    receiptKey: `release-eligibility:${candidateLockId}`,
    changedFilesChecksum: HASH,
    sourceFingerprint: stableHash(lockIdentity),
    releaseFingerprint: HASH,
    suiteChecksum: HASH,
    dataSnapshot: 'shared-supabase-20260805',
    provider: 'openai_compatible',
    model: 'gpt-5.6-luna',
    timeoutMs: 30000,
    resultChecksum: stableHash(eligibilityCore),
    result: { ...eligibilityCore, receiptKey: `release-eligibility:${candidateLockId}`, resultChecksum: stableHash(eligibilityCore) },
    expiresAt: new Date('2099-08-05T00:10:00.000Z'),
    stage: 'release',
    status: 'passed',
    trustLevel: 'verified_release',
    issuerType: 'release_candidate_tool',
    headCommit: candidate.headCommit,
    identityChecksum: candidateLockId,
    issuer: 'ami-brain-release-candidate',
    verificationStatus: 'self_verified',
    evaluationReleaseId: EVALUATION_RELEASE_ID,
  };
  const candidateLockReceipt = {
    ...eligibilityReceipt,
    id: 803,
    receiptKey: candidateLock.receiptKey,
    resultChecksum: stableHash(candidateLock),
    result: candidateLock,
    sourceFingerprint: stableHash(lockIdentity),
    stage: 'candidate',
    trustLevel: 'candidate_lock',
  };
  const pointerResult = { candidateId: candidateLockId, candidateLockReceiptKey: candidateLock.receiptKey };
  const officialPointer = {
    ...candidateLockReceipt,
    id: 804,
    receiptKey: 'official-candidate:query_only_v1',
    resultChecksum: stableHash(pointerResult),
    result: pointerResult,
    stage: 'candidate',
    trustLevel: 'candidate_lock',
  };
  return { candidate, candidateReceipt, eligibilityReceipt, candidateLockReceipt, officialPointer };
}

function releaseReadiness(overrides: Record<string, unknown> = {}) {
  return {
    status: 'ready',
    canRelease: true,
    blockers: [],
    contractVersion: 'ami-brain-release-acceptance/v2',
    evaluationReleaseId: EVALUATION_RELEASE_ID,
    evalRunId: EVAL_RUN_ID,
    releaseFingerprint: HASH,
    suiteChecksum: HASH,
    provider: 'openai_compatible',
    model: 'gpt-5.6-luna',
    sourceCommit: HEAD_COMMIT,
    expiresAt: '2099-08-04T00:00:00.000Z',
    ...overrides,
  };
}

function rolloutReleases(shadowStatus = 'draft') {
  return ['shadow', 'canary_5', 'canary_20', 'canary_50', 'full'].map((rolloutStage, index) => ({
    id: 454 + index,
    rolloutStage,
    status: rolloutStage === 'shadow' ? shadowStatus : 'draft',
    rollout: {
      evaluationEvidenceReleaseId: EVALUATION_RELEASE_ID,
      evaluationEvidenceEvalRunId: EVAL_RUN_ID,
      evaluationEvidenceReceiptId: EVIDENCE_RECEIPT_ID,
    },
    items: BRAIN_QUERY_ONLY_ALLOWED_CAPABILITY_KEYS.map((resourceKey, itemIndex) => ({
      resourceVersionId: 1000 + itemIndex,
      resourceType: 'skill',
      resourceKey,
    })),
  }));
}

function transition(overrides: Record<string, unknown> = {}) {
  return {
    id: 7,
    transitionKey: 'transition-key',
    status: 'approved',
    candidateId: 3,
    oldPolicyReleaseId: 436,
    newPolicyReleaseId: 453,
    oldRuntimeReleaseId: 452,
    runtimeSequenceId: 9,
    policyApprovedAt: new Date(),
    runtimeApprovedAt: new Date(),
    startedAt: null,
    evidenceReceiptId: EVIDENCE_RECEIPT_ID,
    candidate: {
      id: 3,
      candidateKey: 'candidate-1',
      headCommit: HEAD_COMMIT,
      sourceFingerprint: HASH,
      status: 'ready',
    },
    evidenceReceipt: {
      id: EVIDENCE_RECEIPT_ID,
      receiptKey: 'verified-release-receipt',
      stage: 'release',
      status: 'passed',
      trustLevel: 'verified_release',
      verificationStatus: 'verified',
      issuerType: 'release_service',
      issuer: 'Release Acceptance',
      identityChecksum: HASH,
      resultChecksum: HASH,
      evaluationReleaseId: EVALUATION_RELEASE_ID,
      evalRunId: EVAL_RUN_ID,
      releaseFingerprint: HASH,
      provider: 'openai_compatible',
      model: 'gpt-5.6-luna',
      dataSnapshot: 'shared-supabase-20260805',
      suiteChecksum: HASH,
      capabilities: [],
      gates: CORE_REQUIRED_EVIDENCE_TYPES.map((gateKey) => ({
        gateKey,
        status: 'passed',
        expiresAt: new Date('2099-08-05T00:00:00.000Z'),
      })),
      expiresAt: new Date('2099-08-05T00:00:00.000Z'),
      result: {
        schemaVersion: 3,
        stage: 'release',
        workflow: 'Release Acceptance',
        candidateKey: 'candidate-1',
        headCommit: HEAD_COMMIT,
        sourceFingerprint: HASH,
        verification: {
          status: 'verified',
          trustLevel: 'verified_release',
          admissionEligible: true,
          authentication: 'github_oidc',
          issuer: 'Release Acceptance',
        },
      },
    },
    evidenceSnapshot: {
      schemaVersion: 1,
      phase: 'release',
      trustLevel: 'verified_release',
      contractVersion: 'ami-brain-release-acceptance/v2',
      receiptId: EVIDENCE_RECEIPT_ID,
      receiptKey: 'verified-release-receipt',
      identityChecksum: HASH,
      resultChecksum: HASH,
      candidateKey: 'candidate-1',
      headCommit: HEAD_COMMIT,
      sourceFingerprint: HASH,
      evaluationReleaseId: EVALUATION_RELEASE_ID,
      evalRunId: EVAL_RUN_ID,
      releaseFingerprint: HASH,
      provider: 'openai_compatible',
      model: 'gpt-5.6-luna',
      dataSnapshot: 'shared-supabase-20260805',
      suiteChecksum: HASH,
    },
    oldPolicy: { id: 436, status: 'active', items: [] },
    newPolicy: { id: 453, status: 'draft', items: [], productIdentity: { code: 'GP-003' } },
    oldRuntime: { id: 452, status: 'active' },
    runtimeSequence: {
      id: 9,
      runtimeVersionCode: 'RT-001',
      productProfile: 'query_only_v1',
      status: 'draft',
      currentStage: 'shadow',
      releases: rolloutReleases(),
    },
    ...overrides,
  };
}

function prereleaseEvidenceReceipt() {
  const receipt = transition().evidenceReceipt;
  return {
    ...receipt,
    receiptKey: 'verified-prerelease-receipt',
    stage: 'prerelease',
    trustLevel: 'verified_prerelease',
    candidateId: 3,
    headCommit: HEAD_COMMIT,
    sourceFingerprint: HASH,
    gates: CORE_REQUIRED_EVIDENCE_TYPES
      .filter((gateKey) => gateKey !== 'rollback_drill')
      .map((gateKey) => ({ gateKey, status: 'passed', expiresAt: new Date('2099-08-05T00:00:00.000Z') })),
    result: {
      ...receipt.result,
      stage: 'prerelease',
      verification: {
        ...receipt.result.verification,
        trustLevel: 'verified_prerelease',
      },
    },
  };
}

function releaseEvidenceReceipt() {
  return {
    ...transition().evidenceReceipt,
    candidateId: 3,
    headCommit: HEAD_COMMIT,
    sourceFingerprint: HASH,
    capabilities: QUERY_ONLY_CAPABILITY_KEYS.map((capabilityKey) => ({ capabilityKey })),
  };
}

function rolloutReleaseRows(status = 'rolled_back') {
  return ['shadow', 'canary_5', 'canary_20', 'canary_50', 'full'].map((rolloutStage, index) => ({
    id: 454 + index,
    rolloutStage,
    status,
    activatedAt: new Date('2026-08-05T00:00:00.000Z'),
    rolledBackAt: new Date('2026-08-05T00:30:00.000Z'),
    failureReason: 'rollback drill',
    rollout: { admissionPhase: 'prerelease', evaluationEvidenceReceiptId: EVIDENCE_RECEIPT_ID },
  }));
}

function transactionMock() {
  return jest.fn(async (work: Array<Promise<unknown>> | ((tx: { $queryRaw: jest.Mock }) => Promise<unknown>)) => {
    if (typeof work === 'function') return work({ $queryRaw: jest.fn().mockResolvedValue([]) });
    return Promise.all(work);
  });
}

describe('BrainGovernanceTransitionService', () => {
  it('keeps preparation blocked until every query-only capability has trusted evidence', async () => {
    const prisma = {
      brainGovernanceCandidate: {
        findUnique: jest.fn().mockResolvedValue({
          id: 3,
          candidateKey: 'candidate-1',
          headCommit: 'abcdef123456',
          status: 'checking',
          receipts: [],
        }),
      },
      brainRelease: {
        findFirst: jest.fn()
          .mockResolvedValueOnce({ id: 436, scope: 'governance_policy', status: 'active' })
          .mockResolvedValueOnce({ id: 452, scope: 'percentage', status: 'active' }),
        findUnique: jest.fn().mockResolvedValue(null),
      },
      brainVersionCounter: {
        findUnique: jest.fn(({ where }: { where: { family: string } }) => Promise.resolve({
          lastNumber: where.family === 'policy' ? 2 : 0,
        })),
      },
      brainRolloutSequence: { findUnique: jest.fn().mockResolvedValue(null) },
      brainGovernanceTransition: { findFirst: jest.fn().mockResolvedValue(null) },
      brainGateReceipt: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const service = new BrainGovernanceTransitionService(
      prisma as never,
      {} as never,
      {} as never,
      {} as never,
    );

    const result = await service.preview('candidate-1');
    expect(result.canPrepare).toBe(false);
    expect(result.missingEvidence).toHaveLength(41);
    expect(result.target).toMatchObject({
      policyCode: 'GP-003',
      runtimeCode: 'RT-001',
      productProfile: 'query_only_v1',
      allowedCapabilityCount: 33,
      deniedCapabilityCount: 8,
      identity: {
        policy: { code: 'GP-003', status: 'available' },
        runtime: { code: 'RT-001', status: 'available' },
        blockers: [],
      },
    });
  });

  it('accepts one protected OIDC release receipt with the exact six gates and 33+8 capability manifest', async () => {
    const candidate = {
      id: 3,
      candidateKey: 'candidate-1',
      headCommit: HEAD_COMMIT,
      sourceFingerprint: HASH,
      status: 'ready',
      receipts: [{
        ...transition().evidenceReceipt,
        candidateId: 3,
        headCommit: HEAD_COMMIT,
        sourceFingerprint: HASH,
        capabilities: [
          ...BRAIN_QUERY_ONLY_ALLOWED_CAPABILITY_KEYS,
          ...BRAIN_QUERY_ONLY_DISABLED_CAPABILITY_KEYS,
        ].map((capabilityKey) => ({ capabilityKey })),
      }],
    };
    const releaseService = { getReleaseReadiness: jest.fn().mockResolvedValue(releaseReadiness()) };
    const service = new BrainGovernanceTransitionService({} as never, {} as never, releaseService as never, {} as never);

    await expect((service as any).resolveCandidateEvidence(candidate)).resolves.toMatchObject({
      receipt: { id: EVIDENCE_RECEIPT_ID },
      missingEvidence: [],
      blockers: [],
      materialization: null,
    });
  });

  it('accepts one protected OIDC prerelease receipt with the exact five gates and no rollback drill gate', async () => {
    const candidate = {
      id: 3,
      candidateKey: 'candidate-1',
      headCommit: HEAD_COMMIT,
      sourceFingerprint: HASH,
      status: 'ready',
      policyDecision: null,
      receipts: [{
        ...prereleaseEvidenceReceipt(),
        candidateId: 3,
        capabilities: QUERY_ONLY_CAPABILITY_KEYS.map((capabilityKey) => ({ capabilityKey })),
      }],
    };
    const releaseService = { getReleaseReadiness: jest.fn().mockResolvedValue(releaseReadiness()) };
    const service = new BrainGovernanceTransitionService({} as never, {} as never, releaseService as never, {} as never);

    await expect((service as any).resolveCandidateEvidence(candidate)).resolves.toMatchObject({
      receipt: { id: EVIDENCE_RECEIPT_ID, stage: 'prerelease', trustLevel: 'verified_prerelease' },
      phase: 'prerelease',
      missingEvidence: [],
      blockers: [],
      materialization: null,
      rollbackDrill: null,
    });
    await expect((service as any).resolveCandidateEvidence({
      ...candidate,
      receipts: [{
        ...candidate.receipts[0],
        gates: [
          ...candidate.receipts[0].gates,
          { gateKey: 'rollback_drill', status: 'passed', expiresAt: new Date('2099-08-05T00:00:00.000Z') },
        ],
      }],
    })).resolves.toMatchObject({
      blockers: ['candidate_receipt_gate_extra:rollback_drill'],
    });
  });

  it('prepares the fixed GP-003 and RT-001 targets without moving the candidate to ready or releasing', async () => {
    const candidate = {
      id: 3,
      candidateKey: 'candidate-1',
      headCommit: HEAD_COMMIT,
      sourceFingerprint: HASH,
      status: 'governing',
    };
    const receipt = {
      ...transition().evidenceReceipt,
      id: EVIDENCE_RECEIPT_ID,
      evaluationReleaseId: EVALUATION_RELEASE_ID,
      evalRunId: EVAL_RUN_ID,
      resultChecksum: HASH,
    };
    const policy = {
      id: 453,
      releaseKey: `ami-brain-policy-query-only-v1-${HEAD_COMMIT.slice(0, 12)}`,
      scope: 'governance_policy',
      status: 'draft',
      releaseFamily: 'policy',
      displayCode: 'GP-003',
      displayName: 'Query Only V1 强制治理策略',
      items: [],
    };
    const sequence = {
      id: 9,
      runtimeVersionCode: 'RT-001',
      displayName: 'Query Only V1',
      productProfile: 'query_only_v1',
      status: 'draft',
      currentStage: 'shadow',
      releases: rolloutReleases(),
    };
    const runtimeSource = {
      id: 452,
      items: BRAIN_QUERY_ONLY_ALLOWED_CAPABILITY_KEYS.map((resourceKey, index) => ({
        resourceType: 'skill',
        resourceKey,
        resourceVersionId: 2000 + index,
        snapshot: { readOnly: true, sideEffect: false },
      })),
    };
    const candidateUpdate = jest.fn().mockResolvedValue({});
    const transitionCreate = jest.fn().mockResolvedValue(transition({
      candidate,
      newPolicy: policy,
      runtimeSequence: sequence,
    }));
    const prisma = {
      brainGovernanceCandidate: { update: candidateUpdate },
      brainGovernanceTransition: { create: transitionCreate, findFirst: jest.fn() },
    };
    const controlPlane = {
      createQueryOnlyPolicyVersions: jest.fn().mockResolvedValue({
        sourcePolicyReleaseId: 436,
        resourceVersionIds: [11, 12],
      }),
      createPolicySnapshot: jest.fn().mockResolvedValue(policy),
    };
    const rollout = { create: jest.fn().mockResolvedValue(sequence) };
    const releaseIdentity = {
      productIdentity: jest.fn((release: { id: number; releaseKey: string; scope: string; displayCode?: string | null }) => (
        release.scope === 'governance_policy' && release.displayCode
          ? {
              family: 'policy',
              code: release.displayCode,
              stageCode: null,
              name: release.releaseKey,
              internalReleaseId: release.id,
            }
          : null
      )),
    };
    const service = new BrainGovernanceTransitionService(
      prisma as never,
      controlPlane as never,
      {} as never,
      rollout as never,
      undefined,
      releaseIdentity as never,
    );
    jest.spyOn(service, 'preview').mockResolvedValue({ existingTransition: null, canPrepare: true, blockers: [] } as never);
    jest.spyOn(service as any, 'loadCandidateEvidence').mockResolvedValue(candidate);
    jest.spyOn(service as any, 'resolveCandidateEvidence').mockResolvedValue({
      receipt,
      readiness: releaseReadiness(),
      missingEvidence: [],
      blockers: [],
      materialization: null,
    });
    jest.spyOn(service as any, 'currentRuntime').mockResolvedValue(runtimeSource);

    await expect(service.prepare({ candidateKey: candidate.candidateKey, actorId: 5 }))
      .resolves.toMatchObject({ newPolicy: { productIdentity: { code: 'GP-003' } } });

    expect(controlPlane.createPolicySnapshot).toHaveBeenCalledWith(expect.objectContaining({
      releaseKey: `ami-brain-policy-query-only-v1-${HEAD_COMMIT.slice(0, 12)}`,
      displayName: 'Query Only V1 强制治理策略',
      expectedDisplayCode: 'GP-003',
    }));
    expect(rollout.create).toHaveBeenCalledWith(expect.objectContaining({
      releaseKey: `ami-brain-runtime-query-only-v1-${HEAD_COMMIT.slice(0, 12)}`,
      displayName: 'Query Only V1',
      expectedRuntimeVersionCode: 'RT-001',
      transitionPreparation: true,
      productProfile: 'query_only_v1',
    }));
    expect(candidateUpdate).toHaveBeenCalledTimes(1);
    expect(candidateUpdate).toHaveBeenCalledWith({
      where: { id: candidate.id },
      data: { policySnapshotId: policy.id, policyDecision: 'create_query_only_snapshot' },
    });
    expect(candidateUpdate).not.toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: expect.anything() }),
    }));
  });

  it('prepares a prerelease transition as five-gate evidence and binds RT-001 to prerelease admission', async () => {
    const candidate = {
      id: 3,
      candidateKey: 'candidate-1',
      headCommit: HEAD_COMMIT,
      sourceFingerprint: HASH,
      status: 'governing',
    };
    const receipt = {
      ...prereleaseEvidenceReceipt(),
      id: EVIDENCE_RECEIPT_ID,
      evaluationReleaseId: EVALUATION_RELEASE_ID,
      evalRunId: EVAL_RUN_ID,
      resultChecksum: HASH,
    };
    const policy = {
      id: 453,
      releaseKey: `ami-brain-policy-query-only-v1-${HEAD_COMMIT.slice(0, 12)}`,
      scope: 'governance_policy',
      status: 'draft',
      releaseFamily: 'policy',
      displayCode: 'GP-003',
      displayName: 'Query Only V1 强制治理策略',
      items: [],
    };
    const sequence = {
      id: 9,
      runtimeVersionCode: 'RT-001',
      displayName: 'Query Only V1',
      productProfile: 'query_only_v1',
      status: 'draft',
      currentStage: 'shadow',
      releases: rolloutReleases(),
    };
    const runtimeSource = {
      id: 452,
      items: BRAIN_QUERY_ONLY_ALLOWED_CAPABILITY_KEYS.map((resourceKey, index) => ({
        resourceType: 'skill',
        resourceKey,
        resourceVersionId: 2000 + index,
        snapshot: { readOnly: true, sideEffect: false },
      })),
    };
    const transitionCreate = jest.fn().mockResolvedValue(transition({
      candidate,
      newPolicy: policy,
      runtimeSequence: sequence,
      evidenceReceipt: receipt,
    }));
    const prisma = {
      brainGovernanceCandidate: { update: jest.fn().mockResolvedValue({}) },
      brainGovernanceTransition: { create: transitionCreate, findFirst: jest.fn() },
    };
    const controlPlane = {
      createQueryOnlyPolicyVersions: jest.fn().mockResolvedValue({
        sourcePolicyReleaseId: 436,
        resourceVersionIds: [11, 12],
      }),
      createPolicySnapshot: jest.fn().mockResolvedValue(policy),
    };
    const rollout = { create: jest.fn().mockResolvedValue(sequence) };
    const service = new BrainGovernanceTransitionService(
      prisma as never,
      controlPlane as never,
      {} as never,
      rollout as never,
    );
    jest.spyOn(service, 'preview').mockResolvedValue({ existingTransition: null, canPrepare: true, blockers: [] } as never);
    jest.spyOn(service as any, 'loadCandidateEvidence').mockResolvedValue(candidate);
    jest.spyOn(service as any, 'resolveCandidateEvidence').mockResolvedValue({
      receipt,
      readiness: releaseReadiness(),
      missingEvidence: [],
      blockers: [],
      materialization: null,
      phase: 'prerelease',
      rollbackDrill: null,
    });
    jest.spyOn(service as any, 'currentRuntime').mockResolvedValue(runtimeSource);

    await expect(service.prepare({ candidateKey: candidate.candidateKey, actorId: 5 }))
      .resolves.toMatchObject({ runtimeSequence: { runtimeVersionCode: 'RT-001' } });

    expect(rollout.create).toHaveBeenCalledWith(expect.objectContaining({
      expectedRuntimeVersionCode: 'RT-001',
      admissionPhase: 'prerelease',
      transitionPreparation: true,
    }));
    expect(transitionCreate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        evidenceSnapshot: expect.objectContaining({
          phase: 'prerelease',
          trustLevel: 'verified_prerelease',
        }),
      }),
    }));
  });

  it('retires local self-verified snapshot materialization and requires a protected OIDC release receipt', async () => {
    const lineage = releaseSnapshotLineage();
    const service = new BrainGovernanceTransitionService({} as never, {} as never, {} as never, {} as never);

    await expect((service as any).resolveReleaseSnapshotMaterialization(lineage.candidate)).resolves.toEqual({
      materialization: null,
      blockers: ['candidate_oidc_verified_release_receipt_required'],
    });
    await expect((service as any).materializeVerifiedReleaseSnapshot(lineage.candidate, {}))
      .rejects.toThrow('self_verified_release_materialization_retired');
  });

  it.each(CORE_REQUIRED_EVIDENCE_TYPES)(
    'rejects Eligibility v2 when the %s safety receipt checksum is missing',
    async (missingEvidenceChecksumType) => {
      const lineage = releaseSnapshotLineage({ missingEvidenceChecksumType });
      const prisma = {
        brainGateReceipt: {
          findMany: jest.fn()
            .mockResolvedValueOnce([lineage.candidateReceipt])
            .mockResolvedValueOnce([lineage.eligibilityReceipt]),
          findUnique: jest.fn(({ where }: { where: { receiptKey: string } }) => {
            if (where.receiptKey === lineage.candidateLockReceipt.receiptKey) return lineage.candidateLockReceipt;
            if (where.receiptKey === lineage.officialPointer.receiptKey) return lineage.officialPointer;
            return null;
          }),
        },
      };
      const releaseService = { getReleaseReadiness: jest.fn().mockResolvedValue(releaseReadiness()) };
      const service = new BrainGovernanceTransitionService(prisma as never, {} as never, releaseService as never, {} as never);

      await expect((service as any).resolveReleaseSnapshotMaterialization(lineage.candidate)).resolves.toEqual({
        materialization: null,
        blockers: ['candidate_oidc_verified_release_receipt_required'],
      });
      expect(releaseService.getReleaseReadiness).not.toHaveBeenCalled();
    },
  );

  it('rejects a self-verified close lineage whose candidate lock commit can not bind to the OIDC candidate', async () => {
    const lineage = releaseSnapshotLineage({ lockRuntimeCommit: 'f'.repeat(40) });
    const prisma = {
      brainGateReceipt: {
        findMany: jest.fn()
          .mockResolvedValueOnce([lineage.candidateReceipt])
          .mockResolvedValueOnce([lineage.eligibilityReceipt]),
        findUnique: jest.fn(({ where }: { where: { receiptKey: string } }) => {
          if (where.receiptKey === lineage.candidateLockReceipt.receiptKey) return lineage.candidateLockReceipt;
          if (where.receiptKey === lineage.officialPointer.receiptKey) return lineage.officialPointer;
          return null;
        }),
      },
    };
    const releaseService = { getReleaseReadiness: jest.fn().mockResolvedValue(releaseReadiness()) };
    const service = new BrainGovernanceTransitionService(prisma as never, {} as never, releaseService as never, {} as never);

    await expect((service as any).resolveReleaseSnapshotMaterialization(lineage.candidate)).resolves.toEqual({
      materialization: null,
      blockers: ['candidate_oidc_verified_release_receipt_required'],
    });
    expect(releaseService.getReleaseReadiness).not.toHaveBeenCalled();
  });

  it('rejects a self-verified eligibility row whose receipt identity was rewritten', async () => {
    const lineage = releaseSnapshotLineage();
    lineage.eligibilityReceipt.receiptKey = 'release-eligibility:forged';
    const prisma = {
      brainGateReceipt: {
        findMany: jest.fn()
          .mockResolvedValueOnce([lineage.candidateReceipt])
          .mockResolvedValueOnce([lineage.eligibilityReceipt]),
        findUnique: jest.fn(({ where }: { where: { receiptKey: string } }) => {
          if (where.receiptKey === lineage.candidateLockReceipt.receiptKey) return lineage.candidateLockReceipt;
          if (where.receiptKey === lineage.officialPointer.receiptKey) return lineage.officialPointer;
          return null;
        }),
      },
    };
    const releaseService = { getReleaseReadiness: jest.fn().mockResolvedValue(releaseReadiness()) };
    const service = new BrainGovernanceTransitionService(prisma as never, {} as never, releaseService as never, {} as never);

    await expect((service as any).resolveReleaseSnapshotMaterialization(lineage.candidate)).resolves.toEqual({
      materialization: null,
      blockers: ['candidate_oidc_verified_release_receipt_required'],
    });
    expect(releaseService.getReleaseReadiness).not.toHaveBeenCalled();
  });

  it('rejects RC-350 readiness when its provider/model drift from the locked Luna deployment', async () => {
    const lineage = releaseSnapshotLineage();
    const prisma = {
      brainGateReceipt: {
        findMany: jest.fn()
          .mockResolvedValueOnce([lineage.candidateReceipt])
          .mockResolvedValueOnce([lineage.eligibilityReceipt]),
        findUnique: jest.fn(({ where }: { where: { receiptKey: string } }) => {
          if (where.receiptKey === lineage.candidateLockReceipt.receiptKey) return lineage.candidateLockReceipt;
          if (where.receiptKey === lineage.officialPointer.receiptKey) return lineage.officialPointer;
          return null;
        }),
      },
    };
    const releaseService = {
      getReleaseReadiness: jest.fn().mockResolvedValue(releaseReadiness({ provider: 'deepseek', model: 'deepseek-v4-flash' })),
    };
    const service = new BrainGovernanceTransitionService(prisma as never, {} as never, releaseService as never, {} as never);

    await expect((service as any).resolveReleaseSnapshotMaterialization(lineage.candidate)).resolves.toEqual({
      materialization: null,
      blockers: ['candidate_oidc_verified_release_receipt_required'],
    });
  });

  it('rejects an expired RC-350 readiness before deriving a verified release receipt', async () => {
    const lineage = releaseSnapshotLineage();
    const prisma = {
      brainGateReceipt: {
        findMany: jest.fn()
          .mockResolvedValueOnce([lineage.candidateReceipt])
          .mockResolvedValueOnce([lineage.eligibilityReceipt]),
        findUnique: jest.fn(({ where }: { where: { receiptKey: string } }) => {
          if (where.receiptKey === lineage.candidateLockReceipt.receiptKey) return lineage.candidateLockReceipt;
          if (where.receiptKey === lineage.officialPointer.receiptKey) return lineage.officialPointer;
          return null;
        }),
      },
    };
    const releaseService = {
      getReleaseReadiness: jest.fn().mockResolvedValue(releaseReadiness({ expiresAt: '2020-08-04T00:00:00.000Z' })),
    };
    const service = new BrainGovernanceTransitionService(prisma as never, {} as never, releaseService as never, {} as never);

    await expect((service as any).resolveReleaseSnapshotMaterialization(lineage.candidate)).resolves.toEqual({
      materialization: null,
      blockers: ['candidate_oidc_verified_release_receipt_required'],
    });
  });

  it('rejects expired derived receipts and readiness that is no longer releasable before transition mutation', async () => {
    const expiredTransition = transition({
      evidenceReceipt: {
        ...transition().evidenceReceipt,
        expiresAt: new Date('2020-08-05T00:00:00.000Z'),
      },
    });
    const releaseService = {
      getReleaseReadiness: jest.fn().mockResolvedValue(releaseReadiness({ status: 'blocked', canRelease: false })),
    };
    const service = new BrainGovernanceTransitionService({} as never, {} as never, releaseService as never, {} as never);

    await expect((service as any).validateFrozenEvidence(expiredTransition)).resolves.toMatchObject({
      blockers: expect.arrayContaining([
        'transition_evidence_receipt_invalid',
        'transition_evaluation_readiness_invalid',
      ]),
    });
  });

  it('switches policy and runtime together before marking the transition observing', async () => {
    const row = transition();
    const prisma = {
      brainGovernanceTransition: {
        update: jest.fn().mockResolvedValue({}),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      brainRelease: {
        update: jest.fn().mockResolvedValue({}),
        findUnique: jest.fn().mockResolvedValue({ id: 453, status: 'active' }),
        findFirst: jest.fn().mockResolvedValue({ id: 436, status: 'active' }),
      },
      $transaction: transactionMock(),
    };
    const controlPlane = {
      publishPolicySnapshot: jest.fn().mockResolvedValue({ id: 453, status: 'active' }),
      rollbackPolicySnapshot: jest.fn(),
    };
    const releaseService = {
      getReleaseReadiness: jest.fn().mockResolvedValue(releaseReadiness()),
      resolveRuntimeDeploymentIdentity: jest.fn().mockResolvedValue({
        release: { id: 454 },
        productIdentity: { code: 'RT-001' },
        governancePolicyIdentity: { internalReleaseId: 453 },
        productProfile: { productProfile: 'query_only_v1' },
      }),
    };
    const rollout = { activateShadow: jest.fn().mockResolvedValue({}), rollback: jest.fn() };
    const events = { record: jest.fn().mockResolvedValue({}) };
    const service = new BrainGovernanceTransitionService(
      prisma as never,
      controlPlane as never,
      releaseService as never,
      rollout as never,
      events as never,
    );
    jest.spyOn(service, 'get')
      .mockResolvedValueOnce(row as never)
      .mockResolvedValueOnce({
        ...row,
        runtimeSequence: { ...row.runtimeSequence, releases: [{ id: 454, rolloutStage: 'shadow', status: 'active' }] },
      } as never)
      .mockResolvedValueOnce({ ...row, status: 'observing' } as never);

    await expect(service.switch({ id: 7, actorId: 5, storeId: 1, userId: 5, roleKey: 'manager' }))
      .resolves.toMatchObject({ status: 'observing' });
    expect(controlPlane.publishPolicySnapshot).toHaveBeenCalledWith(453, 5);
    expect(rollout.activateShadow).toHaveBeenCalledWith(9, 5);
    expect(releaseService.resolveRuntimeDeploymentIdentity).toHaveBeenCalledWith({ storeId: 1, userId: 5, roleKey: 'manager' });
    expect(prisma.brainRelease.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 436 },
      data: expect.objectContaining({ supersededByReleaseId: 453 }),
    }));
    expect(events.record.mock.calls.map(([event]) => event.eventType)).toEqual([
      'runtime_shadow_activated',
      'policy_switched',
      'legacy_policy_retired',
    ]);
    expect(events.record).toHaveBeenCalledWith(expect.objectContaining({
      eventType: 'runtime_shadow_activated',
      candidateId: 3,
      entityType: 'governance_transition',
      entityId: 7,
      payload: expect.objectContaining({
        policyCode: 'GP-003',
        runtimeCode: 'RT-001',
        effectiveReleaseId: 454,
      }),
    }));
  });

  it('restores the previous policy when runtime activation fails', async () => {
    const row = transition();
    const prisma = {
      brainGovernanceTransition: {
        update: jest.fn().mockResolvedValue({}),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      brainRelease: {
        findUnique: jest.fn().mockResolvedValue({ id: 453, status: 'active' }),
        findFirst: jest.fn().mockResolvedValue({ id: 436, status: 'active' }),
      },
      $transaction: transactionMock(),
    };
    const controlPlane = {
      publishPolicySnapshot: jest.fn().mockResolvedValue({ id: 453, status: 'active' }),
      rollbackPolicySnapshot: jest.fn().mockResolvedValue({ id: 436, status: 'active' }),
    };
    const rollout = {
      activateShadow: jest.fn().mockRejectedValue(new Error('runtime_activation_failed')),
      rollback: jest.fn(),
    };
    const events = { record: jest.fn().mockResolvedValue({}) };
    const service = new BrainGovernanceTransitionService(
      prisma as never,
      controlPlane as never,
      { getReleaseReadiness: jest.fn().mockResolvedValue(releaseReadiness()) } as never,
      rollout as never,
      events as never,
    );
    jest.spyOn(service, 'get').mockResolvedValue(row as never);

    await expect(service.switch({ id: 7, actorId: 5, storeId: 1, userId: 5, roleKey: 'manager' }))
      .rejects.toThrow('runtime_activation_failed');
    expect(controlPlane.rollbackPolicySnapshot).toHaveBeenCalledWith(453, 'governance_transition_compensation', 5);
    expect(prisma.brainGovernanceTransition.update).toHaveBeenLastCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: 'rolled_back', currentStep: 'compensation_completed' }),
    }));
    expect(prisma.brainGovernanceTransition.updateMany).toHaveBeenLastCalledWith(expect.objectContaining({
      where: expect.objectContaining({ id: 7, mutationLeaseToken: expect.any(String) }),
      data: {
        mutationLeaseToken: null,
        mutationLeaseOperation: null,
        mutationLeaseExpiresAt: null,
      },
    }));
    expect(events.record.mock.calls.map(([event]) => event.eventType)).toEqual([
      'transition_compensation_started',
      'transition_compensation_completed',
    ]);
    expect(events.record).toHaveBeenLastCalledWith(expect.objectContaining({
      eventType: 'transition_compensation_completed',
      payload: expect.objectContaining({ failureCode: 'runtime_activation_failed' }),
    }));
  });

  it('rejects a concurrent transition mutation while another live lease is held', async () => {
    const prisma = {
      brainGovernanceTransition: {
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
    };
    const controlPlane = { publishPolicySnapshot: jest.fn() };
    const rollout = { activateShadow: jest.fn() };
    const service = new BrainGovernanceTransitionService(
      prisma as never,
      controlPlane as never,
      {} as never,
      rollout as never,
    );
    const get = jest.spyOn(service, 'get');

    await expect(service.switch({ id: 7, actorId: 5, storeId: 1, userId: 5, roleKey: 'manager' }))
      .rejects.toThrow('governance_transition_mutation_in_progress');
    expect(get).not.toHaveBeenCalled();
    expect(controlPlane.publishPolicySnapshot).not.toHaveBeenCalled();
    expect(rollout.activateShadow).not.toHaveBeenCalled();
    expect(prisma.brainGovernanceTransition.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        id: 7,
        OR: [
          { mutationLeaseToken: null },
          { mutationLeaseExpiresAt: { lte: expect.any(Date) } },
        ],
      }),
      data: expect.objectContaining({
        mutationLeaseToken: expect.any(String),
        mutationLeaseOperation: 'switch',
        mutationLeaseExpiresAt: expect.any(Date),
      }),
    }));
  });

  it('does not expose the mutation lease token in transition DTOs', () => {
    const service = new BrainGovernanceTransitionService(
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );
    const expiresAt = new Date('2026-08-04T00:05:00.000Z');
    const result = (service as unknown as {
      withProductIdentities: (value: Record<string, unknown>) => Record<string, unknown>;
    }).withProductIdentities({
      ...transition(),
      mutationLeaseToken: 'internal-lease-token',
      mutationLeaseOperation: 'switch',
      mutationLeaseExpiresAt: expiresAt,
      oldPolicy: { id: 436, releaseKey: 'legacy-policy', scope: 'governance_policy', status: 'active' },
      newPolicy: { id: 453, releaseKey: 'query-only-policy', scope: 'governance_policy', status: 'draft' },
      oldRuntime: { id: 452, releaseKey: 'legacy-runtime', scope: 'percentage', status: 'active' },
      runtimeSequence: {
        id: 9,
        runtimeVersionCode: 'RT-001',
        displayName: 'Query Only V1',
        productProfile: 'query_only_v1',
        status: 'draft',
        currentStage: 'shadow',
        policySnapshot: { id: 453, releaseKey: 'query-only-policy', scope: 'governance_policy' },
        releases: [{ id: 454, releaseKey: 'query-only-shadow', scope: 'percentage', rolloutStage: 'shadow', status: 'draft' }],
      },
    });

    expect(result).not.toHaveProperty('mutationLeaseToken');
    expect(result).not.toHaveProperty('mutationLeaseOperation');
    expect(result).not.toHaveProperty('mutationLeaseExpiresAt');
    expect(result).toMatchObject({ mutationLease: { operation: 'switch', expiresAt } });
  });

  it('reuses an existing open transition without creating duplicate GP or RT drafts', async () => {
    const existing = transition({ status: 'draft' });
    const service = new BrainGovernanceTransitionService(
      {} as never,
      { createQueryOnlyPolicyVersions: jest.fn(), createPolicySnapshot: jest.fn() } as never,
      {} as never,
      { create: jest.fn() } as never,
    );
    jest.spyOn(service, 'preview').mockResolvedValue({ existingTransition: existing, canPrepare: false } as never);

    await expect(service.prepare({ candidateKey: 'candidate-1', actorId: 5 })).resolves.toBe(existing);
  });

  it('marks the transition approved regardless of which approval arrives last and emits one audit event', async () => {
    const prisma = {
      brainGovernanceTransition: {
        findUniqueOrThrow: jest.fn()
          .mockResolvedValueOnce({ id: 7, status: 'validated', policyApprovedAt: null, runtimeApprovedAt: new Date('2026-08-04T00:00:00.000Z') })
          .mockResolvedValueOnce({ id: 7, status: 'validated', policyApprovedAt: new Date('2026-08-04T00:01:00.000Z'), runtimeApprovedAt: new Date('2026-08-04T00:00:00.000Z'), policyApprovedBy: 5 }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        update: jest.fn().mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({ id: 7, ...data })),
      },
    };
    const events = { record: jest.fn().mockResolvedValue({}) };
    const service = new BrainGovernanceTransitionService(
      prisma as never,
      {} as never,
      {} as never,
      {} as never,
      events as never,
    );
    jest.spyOn(service, 'validate').mockResolvedValue({ transitionId: 7, valid: true, blockers: [], readiness: null } as never);
    jest.spyOn(service, 'get').mockResolvedValue({ id: 7, status: 'approved' } as never);

    await expect(service.approvePolicy(7, 5)).resolves.toMatchObject({ status: 'approved' });
    expect(prisma.brainGovernanceTransition.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ policyApprovedBy: 5 }),
    }));
    expect(events.record).toHaveBeenCalledTimes(1);
    expect(events.record).toHaveBeenCalledWith(expect.objectContaining({ eventType: 'policy_approved' }));
  });

  it('returns an existing approval without validating, rewriting, or duplicating its audit event', async () => {
    const approved = { id: 7, status: 'validated', policyApprovedAt: new Date(), runtimeApprovedAt: null };
    const prisma = {
      brainGovernanceTransition: {
        findUniqueOrThrow: jest.fn().mockResolvedValue(approved),
        updateMany: jest.fn(),
        update: jest.fn(),
      },
    };
    const events = { record: jest.fn() };
    const service = new BrainGovernanceTransitionService(
      prisma as never,
      {} as never,
      {} as never,
      {} as never,
      events as never,
    );
    const validate = jest.spyOn(service, 'validate');
    const get = jest.spyOn(service, 'get').mockResolvedValue(approved as never);

    await expect(service.approvePolicy(7, 5)).resolves.toBe(approved);
    expect(validate).not.toHaveBeenCalled();
    expect(get).toHaveBeenCalledWith(7);
    expect(prisma.brainGovernanceTransition.updateMany).not.toHaveBeenCalled();
    expect(events.record).not.toHaveBeenCalled();
  });

  it('resumes an interrupted switching transition without publishing or activating twice', async () => {
    const row = transition({
      status: 'switching',
      newPolicy: { id: 453, status: 'active', items: [], productIdentity: { code: 'GP-003' } },
      runtimeSequence: {
        id: 9,
        runtimeVersionCode: 'RT-001',
        productProfile: 'query_only_v1',
        status: 'active',
        currentStage: 'shadow',
        releases: rolloutReleases('active'),
      },
    });
    const prisma = {
      brainGovernanceTransition: {
        update: jest.fn().mockResolvedValue({}),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      brainRelease: {
        update: jest.fn().mockResolvedValue({}),
        findUnique: jest.fn(),
        findFirst: jest.fn().mockResolvedValue({ id: 453, status: 'active' }),
      },
      $transaction: transactionMock(),
    };
    const controlPlane = { publishPolicySnapshot: jest.fn(), rollbackPolicySnapshot: jest.fn() };
    const rollout = { activateShadow: jest.fn(), rollback: jest.fn() };
    const releaseService = {
      getReleaseReadiness: jest.fn().mockResolvedValue(releaseReadiness()),
      resolveRuntimeDeploymentIdentity: jest.fn().mockResolvedValue({
        release: { id: 454 },
        productIdentity: { code: 'RT-001' },
        governancePolicyIdentity: { internalReleaseId: 453 },
        productProfile: { productProfile: 'query_only_v1' },
      }),
    };
    const service = new BrainGovernanceTransitionService(
      prisma as never,
      controlPlane as never,
      releaseService as never,
      rollout as never,
    );
    jest.spyOn(service, 'get')
      .mockResolvedValueOnce(row as never)
      .mockResolvedValueOnce(row as never)
      .mockResolvedValueOnce({ ...row, status: 'observing' } as never);

    await expect(service.switch({ id: 7, actorId: 5, storeId: 1, userId: 5, roleKey: 'manager' }))
      .resolves.toMatchObject({ status: 'observing' });
    expect(controlPlane.publishPolicySnapshot).not.toHaveBeenCalled();
    expect(rollout.activateShadow).not.toHaveBeenCalled();
  });

  it('returns an already rolled-back transition without repeating rollback side effects', async () => {
    const row = transition({ status: 'rolled_back' });
    const prisma = {
      brainGovernanceTransition: {
        update: jest.fn(),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      brainRelease: { findUnique: jest.fn() },
      $transaction: transactionMock(),
    };
    const controlPlane = { rollbackPolicySnapshot: jest.fn() };
    const rollout = { rollback: jest.fn() };
    const service = new BrainGovernanceTransitionService(
      prisma as never,
      controlPlane as never,
      {} as never,
      rollout as never,
    );
    jest.spyOn(service, 'get').mockResolvedValue(row as never);

    await expect(service.rollback(7, 'repeat request', 5)).resolves.toBe(row);
    expect(prisma.brainGovernanceTransition.update).not.toHaveBeenCalled();
    expect(controlPlane.rollbackPolicySnapshot).not.toHaveBeenCalled();
    expect(rollout.rollback).not.toHaveBeenCalled();
  });

  it('clears retirement and superseded markers when restoring the old GP and RT combination', async () => {
    const row = transition({
      status: 'observing',
      runtimeSequence: {
        id: 9,
        runtimeVersionCode: 'RT-001',
        productProfile: 'query_only_v1',
        status: 'active',
        currentStage: 'shadow',
        releases: [{ id: 454, rolloutStage: 'shadow', status: 'active' }],
      },
    });
    const prisma = {
      brainGovernanceTransition: {
        update: jest.fn().mockResolvedValue({}),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      brainRelease: {
        findUnique: jest.fn().mockResolvedValue({ id: 453, status: 'active' }),
        update: jest.fn().mockResolvedValue({}),
      },
      brainGovernanceCandidate: {
        update: jest.fn().mockResolvedValue({}),
      },
      $transaction: transactionMock(),
    };
    const controlPlane = { rollbackPolicySnapshot: jest.fn().mockResolvedValue({ id: 436, status: 'active' }) };
    const rollout = { rollback: jest.fn().mockResolvedValue({}) };
    const service = new BrainGovernanceTransitionService(
      prisma as never,
      controlPlane as never,
      {} as never,
      rollout as never,
    );
    jest.spyOn(service, 'get')
      .mockResolvedValueOnce(row as never)
      .mockResolvedValueOnce({ ...row, status: 'rolled_back' } as never);

    await expect(service.rollback(7, 'rollback drill', 5)).resolves.toMatchObject({ status: 'rolled_back' });
    expect(prisma.brainRelease.update).toHaveBeenCalledWith({
      where: { id: 436 },
      data: { retiredAt: null, retirementReason: null, supersededAt: null, supersededByReleaseId: null },
    });
    expect(prisma.brainRelease.update).toHaveBeenCalledWith({
      where: { id: 452 },
      data: { supersededAt: null, supersededByReleaseId: null },
    });
  });

  it('records a rollback drill only when prerelease reaches C05 before rollback', async () => {
    const row = transition({
      status: 'observing',
      evidenceReceipt: prereleaseEvidenceReceipt(),
      runtimeSequence: {
        id: 9,
        runtimeVersionCode: 'RT-001',
        productProfile: 'query_only_v1',
        status: 'active',
        currentStage: 'canary_5',
        releases: [{ id: 455, rolloutStage: 'canary_5', status: 'active' }],
      },
    });
    const prisma = {
      brainGovernanceTransition: {
        update: jest.fn().mockResolvedValue({}),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      brainRelease: {
        findUnique: jest.fn().mockResolvedValue({ id: 453, status: 'active' }),
        update: jest.fn().mockResolvedValue({}),
      },
      brainGovernanceCandidate: { update: jest.fn().mockResolvedValue({}) },
      $transaction: transactionMock(),
    };
    const controlPlane = { rollbackPolicySnapshot: jest.fn().mockResolvedValue({ id: 436, status: 'active' }) };
    const rollout = { rollback: jest.fn().mockResolvedValue({}) };
    const service = new BrainGovernanceTransitionService(
      prisma as never,
      controlPlane as never,
      {} as never,
      rollout as never,
    );
    jest.spyOn(service, 'get')
      .mockResolvedValueOnce(row as never)
      .mockResolvedValueOnce({ ...row, status: 'rolled_back', currentStep: 'rollback_drill_completed' } as never);

    await expect(service.rollback(7, 'rollback drill', 5)).resolves.toMatchObject({ currentStep: 'rollback_drill_completed' });
    expect(prisma.brainGovernanceCandidate.update).toHaveBeenCalledWith({
      where: { id: 3 },
      data: { status: 'blocked', policyDecision: 'prerelease_rollback_drill_completed' },
    });
    expect(prisma.brainGovernanceTransition.update).toHaveBeenCalledWith({
      where: { id: 7 },
      data: expect.objectContaining({ status: 'rolled_back', currentStep: 'rollback_drill_completed' }),
    });
  });

  it('keeps a prerelease Shadow emergency rollback separate from the formal rollback drill', async () => {
    const row = transition({
      status: 'observing',
      evidenceReceipt: prereleaseEvidenceReceipt(),
      runtimeSequence: {
        id: 9,
        runtimeVersionCode: 'RT-001',
        productProfile: 'query_only_v1',
        status: 'active',
        currentStage: 'shadow',
        releases: [{ id: 454, rolloutStage: 'shadow', status: 'active' }],
      },
    });
    const prisma = {
      brainGovernanceTransition: {
        update: jest.fn().mockResolvedValue({}),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      brainRelease: {
        findUnique: jest.fn().mockResolvedValue({ id: 453, status: 'active' }),
        update: jest.fn().mockResolvedValue({}),
      },
      brainGovernanceCandidate: { update: jest.fn().mockResolvedValue({}) },
      $transaction: transactionMock(),
    };
    const service = new BrainGovernanceTransitionService(
      prisma as never,
      { rollbackPolicySnapshot: jest.fn().mockResolvedValue({ id: 436, status: 'active' }) } as never,
      {} as never,
      { rollback: jest.fn().mockResolvedValue({}) } as never,
    );
    jest.spyOn(service, 'get')
      .mockResolvedValueOnce(row as never)
      .mockResolvedValueOnce({ ...row, status: 'rolled_back', currentStep: 'rollback_completed' } as never);

    await expect(service.rollback(7, 'emergency rollback', 5)).resolves.toMatchObject({ currentStep: 'rollback_completed' });
    expect(prisma.brainGovernanceCandidate.update).toHaveBeenCalledWith({
      where: { id: 3 },
      data: { status: 'blocked', policyDecision: 'transition_rolled_back' },
    });
  });

  it('does not let a blocked candidate bypass rollback drill rearm with a full receipt alone', async () => {
    const candidate = {
      id: 3,
      candidateKey: 'candidate-1',
      headCommit: HEAD_COMMIT,
      sourceFingerprint: HASH,
      status: 'blocked',
      policyDecision: 'transition_rolled_back',
      receipts: [releaseEvidenceReceipt()],
    };
    const service = new BrainGovernanceTransitionService(
      { brainGovernanceTransition: { findFirst: jest.fn() } } as never,
      {} as never,
      { getReleaseReadiness: jest.fn().mockResolvedValue(releaseReadiness()) } as never,
      {} as never,
    );

    await expect((service as any).resolveCandidateEvidence(candidate)).resolves.toMatchObject({
      phase: 'release',
      rollbackDrill: null,
      blockers: ['candidate_not_release_ready:blocked'],
    });
  });

  it('atomically rearms GP-003 and RT-001 after a verified C05 rollback drill', async () => {
    const policyItems = QUERY_ONLY_CAPABILITY_KEYS.map((resourceKey, index) => ({
      resourceType: 'capability_policy',
      resourceKey,
      resourceVersionId: 3000 + index,
    }));
    const candidate = {
      id: 3,
      candidateKey: 'candidate-1',
      headCommit: HEAD_COMMIT,
      sourceFingerprint: HASH,
      status: 'blocked',
      policyDecision: 'prerelease_rollback_drill_completed',
      policySnapshotId: 453,
    };
    const releaseReceipt = releaseEvidenceReceipt();
    const drill = transition({
      id: 71,
      status: 'rolled_back',
      currentStep: 'rollback_drill_completed',
      candidateId: 3,
      newPolicyReleaseId: 453,
      oldPolicyReleaseId: 436,
      oldRuntimeReleaseId: 452,
      runtimeSequenceId: 9,
      runtimeSequence: {
        id: 9,
        candidateId: 3,
        policySnapshotId: 453,
        status: 'rolled_back',
        currentStage: 'canary_5',
        previousRuntimeReleaseId: 452,
        previousRuntimeRelease: { id: 452, status: 'active' },
        releases: rolloutReleaseRows(),
      },
    });
    const tx = {
      brainGovernanceCandidate: {
        findUnique: jest.fn().mockResolvedValue(candidate),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      brainRelease: {
        findUnique: jest.fn(({ where }: { where: { id: number } }) => {
          if (where.id === 453) return Promise.resolve({ id: 453, scope: 'governance_policy', status: 'rolled_back', previousReleaseId: 436, items: policyItems });
          if (where.id === 436) return Promise.resolve({ id: 436, scope: 'governance_policy', status: 'active' });
          return Promise.resolve(null);
        }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        findUniqueOrThrow: jest.fn().mockResolvedValue({ id: 453, displayCode: 'GP-003', status: 'draft', items: policyItems }),
      },
      brainRolloutSequence: {
        findUnique: jest.fn().mockResolvedValue(drill.runtimeSequence),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      brainGateReceipt: {
        findUnique: jest.fn().mockResolvedValue(releaseReceipt),
      },
      brainGovernanceTask: { count: jest.fn().mockResolvedValue(0) },
      brainResourceVersion: { updateMany: jest.fn().mockResolvedValue({ count: policyItems.length }) },
    };
    const prisma = {
      $transaction: jest.fn((work) => typeof work === 'function' ? work(tx) : Promise.all(work)),
    };
    const events = { record: jest.fn().mockResolvedValue({}) };
    const rollout = { get: jest.fn().mockResolvedValue({ id: 9, runtimeVersionCode: 'RT-001', status: 'draft' }) };
    const service = new BrainGovernanceTransitionService(
      prisma as never,
      {} as never,
      {} as never,
      rollout as never,
      events as never,
    );

    await expect((service as any).rearmAfterVerifiedRollbackDrill({
      candidate,
      drill,
      receipt: releaseReceipt,
      actorId: 5,
    })).resolves.toMatchObject({
      policy: { id: 453, displayCode: 'GP-003', status: 'draft' },
      sequence: { id: 9, runtimeVersionCode: 'RT-001', status: 'draft' },
    });

    expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), expect.objectContaining({
      isolationLevel: 'Serializable',
    }));
    expect(tx.brainRelease.updateMany).toHaveBeenCalledTimes(6);
    expect(tx.brainRelease.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 453, scope: 'governance_policy', status: 'rolled_back', previousReleaseId: 436 },
      data: expect.objectContaining({ status: 'draft' }),
    }));
    expect(tx.brainRolloutSequence.updateMany).toHaveBeenCalledWith({
      where: { id: 9, status: 'rolled_back', currentStage: 'canary_5' },
      data: expect.objectContaining({ status: 'draft', currentStage: 'shadow' }),
    });
    expect(tx.brainGovernanceCandidate.updateMany).toHaveBeenCalledWith({
      where: { id: 3, status: 'blocked', policySnapshotId: 453, policyDecision: 'prerelease_rollback_drill_completed' },
      data: { status: 'ready', completedAt: null, policyDecision: 'rearm_after_verified_rollback_drill' },
    });
    expect(events.record).toHaveBeenCalledWith(expect.objectContaining({
      eventType: 'rollback_drill_rearmed',
      payload: expect.objectContaining({ phase: 'release', evidenceReceiptId: EVIDENCE_RECEIPT_ID }),
    }));
  });

  it('finalizes only after RT Full and archives the old runtime without deleting history', async () => {
    const row = transition({
      status: 'observing',
      runtimeSequence: {
        id: 9,
        status: 'completed',
        currentStage: 'full',
        releases: [{ id: 458, rolloutStage: 'full', status: 'active' }],
      },
    });
    const prisma = {
      brainRelease: { update: jest.fn().mockResolvedValue({}) },
      brainGovernanceTransition: {
        update: jest.fn().mockResolvedValue({}),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      $transaction: transactionMock(),
    };
    const events = { record: jest.fn().mockResolvedValue({}) };
    const service = new BrainGovernanceTransitionService(
      prisma as never,
      {} as never,
      {} as never,
      {} as never,
      events as never,
    );
    jest.spyOn(service, 'get')
      .mockResolvedValueOnce(row as never)
      .mockResolvedValueOnce({ ...row, status: 'completed' } as never);
    jest.spyOn(service as any, 'validateFrozenEvidence').mockResolvedValue({ blockers: [] });
    jest.spyOn(service as any, 'currentPolicy').mockResolvedValue({ id: 453 });
    jest.spyOn(service as any, 'currentRuntime').mockResolvedValue({ id: 458 });

    await expect(service.finalize(7, 5)).resolves.toMatchObject({ status: 'completed' });
    expect(prisma.brainRelease.update).toHaveBeenCalledWith({
      where: { id: 452 },
      data: expect.objectContaining({ status: 'archived', supersededByReleaseId: 458 }),
    });
    expect(prisma).not.toHaveProperty('brainRelease.delete');
    expect(events.record.mock.calls.map(([event]) => event.eventType)).toEqual([
      'legacy_runtime_superseded',
      'transition_completed',
    ]);
    expect(events.record).toHaveBeenCalledWith(expect.objectContaining({
      eventType: 'legacy_runtime_superseded',
      payload: expect.objectContaining({
        supersededRuntimeReleaseId: 452,
        activeRuntimeReleaseId: 458,
      }),
    }));
  });

  it('pauses the full sequence and preserves the old runtime when final evidence or active resolution drifts', async () => {
    const row = transition({
      status: 'observing',
      runtimeSequence: {
        id: 9,
        status: 'completed',
        currentStage: 'full',
        releases: [{ id: 458, rolloutStage: 'full', status: 'active' }],
      },
    });
    const prisma = {
      brainRelease: { update: jest.fn().mockResolvedValue({}) },
      brainRolloutSequence: { update: jest.fn().mockResolvedValue({}) },
      brainGovernanceCandidate: { update: jest.fn().mockResolvedValue({}) },
      brainGovernanceTransition: {
        update: jest.fn().mockResolvedValue({}),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      $transaction: transactionMock(),
    };
    const events = { record: jest.fn().mockResolvedValue({}) };
    const service = new BrainGovernanceTransitionService(
      prisma as never,
      {} as never,
      {} as never,
      {} as never,
      events as never,
    );
    jest.spyOn(service, 'get').mockResolvedValue(row as never);
    jest.spyOn(service as any, 'validateFrozenEvidence')
      .mockResolvedValue({ blockers: ['transition_evidence_receipt_invalid'] });
    jest.spyOn(service as any, 'currentPolicy').mockResolvedValue({ id: 453 });
    jest.spyOn(service as any, 'currentRuntime').mockResolvedValue({ id: 999 });

    await expect(service.finalize(7, 5)).rejects.toMatchObject({
      message: expect.stringContaining('governance_transition_evidence_not_ready'),
    });
    expect(prisma.brainRolloutSequence.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 9 },
      data: expect.objectContaining({ status: 'paused' }),
    }));
    expect(prisma.brainGovernanceCandidate.update).toHaveBeenCalledWith({
      where: { id: 3 },
      data: { status: 'blocked' },
    });
    expect(prisma.brainRelease.update).not.toHaveBeenCalled();
    expect(events.record).toHaveBeenCalledWith(expect.objectContaining({
      eventType: 'transition_evidence_drift_paused',
    }));
  });
});
