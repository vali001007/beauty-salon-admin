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
const EXTENDED_MANUAL_EVIDENCE_TYPES: string[] = [];

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
      issuer: 'brain-governance-release-snapshot',
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
      expiresAt: new Date('2099-08-05T00:00:00.000Z'),
      result: {
        schemaVersion: 'ami-brain-verified-release-snapshot/v1',
        candidateKey: 'candidate-1',
        headCommit: HEAD_COMMIT,
        sourceFingerprint: HASH,
        verification: {
          status: 'verified',
          trustLevel: 'verified_release',
          admissionEligible: true,
          issuer: 'brain-governance-release-snapshot',
        },
      },
    },
    evidenceSnapshot: {
      schemaVersion: 1,
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
      },
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
    expect(result.target).toMatchObject({ productProfile: 'query_only_v1', allowedCapabilityCount: 33, deniedCapabilityCount: 8 });
  });

  it('derives one verified release snapshot only after binding OIDC candidate, close eligibility, lock and RC-350 v2', async () => {
    const lineage = releaseSnapshotLineage();
    const receiptCreate = jest.fn().mockResolvedValue({ id: 990, receiptKey: 'verified-release-snapshot' });
    const capabilityCreateMany = jest.fn().mockResolvedValue({ count: 41 });
    const gateCreateMany = jest.fn().mockResolvedValue({ count: 8 });
    const tx = {
      brainGateReceipt: { findUnique: jest.fn().mockResolvedValue(null), create: receiptCreate },
      brainGateReceiptCapability: { createMany: capabilityCreateMany },
      brainGateReceiptGate: { createMany: gateCreateMany },
    };
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
      $transaction: jest.fn((work: (client: typeof tx) => Promise<unknown>) => work(tx)),
    };
    const releaseService = { getReleaseReadiness: jest.fn().mockResolvedValue(releaseReadiness()) };
    const service = new BrainGovernanceTransitionService(prisma as never, {} as never, releaseService as never, {} as never);

    const resolved = await (service as any).resolveReleaseSnapshotMaterialization(lineage.candidate);
    expect(resolved.blockers).toEqual([]);
    expect(resolved.materialization).toBeTruthy();
    await (service as any).materializeVerifiedReleaseSnapshot(lineage.candidate, resolved.materialization);

    expect(receiptCreate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        stage: 'release',
        trustLevel: 'verified_release',
        verificationStatus: 'verified',
        provider: 'openai_compatible',
        model: 'gpt-5.6-luna',
        candidateId: lineage.candidate.id,
        evalRunId: EVAL_RUN_ID,
        evaluationReleaseId: EVALUATION_RELEASE_ID,
      }),
    }));
    expect(capabilityCreateMany).toHaveBeenCalledWith({
      data: expect.arrayContaining([
        ...BRAIN_QUERY_ONLY_ALLOWED_CAPABILITY_KEYS,
        ...BRAIN_QUERY_ONLY_DISABLED_CAPABILITY_KEYS,
      ].map((capabilityKey) => expect.objectContaining({ capabilityKey }))),
    });
    expect(capabilityCreateMany.mock.calls[0][0].data).toHaveLength(41);
    expect(gateCreateMany.mock.calls[0][0].data).toHaveLength(6);
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
        blockers: ['release_eligibility_lineage_invalid'],
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
      blockers: ['release_eligibility_lineage_invalid'],
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
      blockers: ['release_eligibility_lineage_invalid'],
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
      blockers: ['release_eligibility_lineage_invalid'],
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
      blockers: ['release_eligibility_lineage_invalid'],
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
});
