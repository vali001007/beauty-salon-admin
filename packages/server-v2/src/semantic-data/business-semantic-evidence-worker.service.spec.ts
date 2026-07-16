import { Prisma } from '@prisma/client';
import { BusinessSemanticEvidenceWorkerService } from './business-semantic-evidence-worker.service.js';

type RecordLike = Record<string, any>;

function createEvidence(overrides: RecordLike = {}) {
  const id = Number(overrides.id ?? 1);
  return {
    id,
    sourceType: 'feedback_correction',
    evidenceKind: 'alias',
    runId: 70 + id,
    storeId: 2,
    userId: 8 + id,
    definitionId: 12,
    definitionVersionId: 32,
    definitionType: 'metric',
    definitionKey: 'paid_amount',
    definitionVersion: 5,
    definitionFingerprint: 'c'.repeat(64),
    definitionSourceFingerprint: 'd'.repeat(64),
    redactedText: '到账金额',
    normalizedValue: '到账金额',
    confidence: 0.99,
    status: 'pooled',
    idempotencyFingerprint: id.toString(16).padStart(64, '0'),
    aliasCandidateId: null,
    firstSeenAt: new Date(`2026-07-14T00:0${Math.min(id, 9)}:00.000Z`),
    lastSeenAt: new Date(`2026-07-14T00:1${Math.min(id, 9)}:00.000Z`),
    metadata: { explicitCorrection: true },
    ...overrides,
  };
}

function matchesWorkerPool(item: RecordLike) {
  return (
    item.evidenceKind === 'alias' &&
    ['feedback_correction', 'conversation_correction'].includes(item.sourceType) &&
    item.status === 'pooled' &&
    item.aliasCandidateId === null &&
    !['person_entity', 'personentity'].includes(item.normalizedValue) &&
    !String(item.redactedText).includes('[PERSON_ENTITY]')
  );
}

function createPrisma(initialEvidence: RecordLike[], evalCases: RecordLike[] = []) {
  const evidence = initialEvidence.map((item) => ({ ...item }));
  const candidates: RecordLike[] = [];
  let nextCandidateId = 1;

  const client: RecordLike = {
    businessSemanticEvidence: {
      findMany: jest.fn(async ({ where, take }: RecordLike) => {
        if (where?.aliasCandidateId !== undefined && where?.status === 'clustered') {
          return evidence
            .filter((item) => item.aliasCandidateId === where.aliasCandidateId && item.status === 'clustered')
            .map((item) => ({ ...item }));
        }
        return evidence
          .filter(matchesWorkerPool)
          .slice(0, take)
          .map((item) => ({ ...item }));
      }),
      updateMany: jest.fn(async ({ where, data }: RecordLike) => {
        let count = 0;
        for (const item of evidence) {
          if (!where.id.in.includes(item.id) || item.status !== where.status || item.aliasCandidateId !== null)
            continue;
          Object.assign(item, data);
          count += 1;
        }
        return { count };
      }),
    },
    businessDefinitionAliasCandidate: {
      upsert: jest.fn(async ({ where, create, update }: RecordLike) => {
        const identity = where.definitionId_normalizedAlias;
        let candidate = candidates.find(
          (item) => item.definitionId === identity.definitionId && item.normalizedAlias === identity.normalizedAlias,
        );
        if (!candidate) {
          const createdCandidate = { id: nextCandidateId++, ...create };
          candidates.push(createdCandidate);
          candidate = createdCandidate;
        } else {
          Object.assign(candidate, update);
        }
        return { ...candidate };
      }),
      update: jest.fn(async ({ where, data }: RecordLike) => {
        const candidate = candidates.find((item) => item.id === where.id);
        if (!candidate) throw new Error('candidate_not_found');
        Object.assign(candidate, data);
        return { ...candidate };
      }),
    },
    brainEvalCase: {
      findMany: jest.fn(async ({ where }: RecordLike) =>
        evalCases.filter((item) => where.caseKey.in.includes(item.caseKey)).map((item) => ({ ...item })),
      ),
    },
  };

  const prisma: RecordLike = {
    ...client,
    $transaction: jest.fn(async (operation: (tx: RecordLike) => unknown, options?: RecordLike) => {
      expect(options).toEqual({ isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
      return operation(client);
    }),
  };

  return { prisma, evidence, candidates };
}

describe('BusinessSemanticEvidenceWorkerService.clusterEvidence', () => {
  it('only consumes pooled aliases from explicit correction sources and excludes person placeholders', async () => {
    const eligible = createEvidence({ id: 1 });
    const { prisma, evidence, candidates } = createPrisma([
      eligible,
      createEvidence({ id: 2, evidenceKind: 'entity_mention' }),
      createEvidence({ id: 3, evidenceKind: 'regression_question' }),
      createEvidence({ id: 4, sourceType: 'model_success' }),
      createEvidence({ id: 5, status: 'clustered' }),
      createEvidence({ id: 6, redactedText: '[PERSON_ENTITY]', normalizedValue: 'person_entity' }),
      createEvidence({ id: 7, sourceType: 'feedback_note' }),
    ]);
    const service = new BusinessSemanticEvidenceWorkerService(prisma as never);

    const result = await service.clusterEvidence(100);

    expect(result).toEqual({ scannedCount: 1, clusteredCount: 1, candidateCount: 1 });
    expect(candidates).toHaveLength(1);
    expect(candidates[0]).toMatchObject({
      definitionType: 'metric',
      definitionKey: 'paid_amount',
      alias: '到账金额',
      normalizedAlias: '到账金额',
      occurrenceCount: 1,
      status: 'pending',
    });
    expect(evidence.find((item) => item.id === 1)).toMatchObject({ status: 'clustered', aliasCandidateId: 1 });
    expect(evidence.filter((item) => item.id !== 1).every((item) => item.aliasCandidateId === null)).toBe(true);
  });

  it('aggregates occurrence, distinct users, confidence and explicit correction statistics', async () => {
    const first = createEvidence({ id: 1, userId: 9, confidence: 0.95 });
    const second = createEvidence({
      id: 2,
      userId: 9,
      sourceType: 'conversation_correction',
      confidence: 0.97,
      firstSeenAt: new Date('2026-07-14T00:02:00.000Z'),
      lastSeenAt: new Date('2026-07-14T00:22:00.000Z'),
    });
    const third = createEvidence({
      id: 3,
      userId: 10,
      confidence: 0.99,
      metadata: { explicitCorrection: false },
      definitionVersionId: 33,
      definitionVersion: 6,
      firstSeenAt: new Date('2026-07-14T00:03:00.000Z'),
      lastSeenAt: new Date('2026-07-14T00:23:00.000Z'),
    });
    const evalCases = [
      { id: 201, caseKey: `semantic-evidence:${first.idempotencyFingerprint}` },
      { id: 202, caseKey: `semantic-evidence:${second.idempotencyFingerprint}` },
    ];
    const { prisma, candidates } = createPrisma([first, second, third], evalCases);
    const service = new BusinessSemanticEvidenceWorkerService(prisma as never);

    await service.clusterEvidence(100);

    expect(candidates).toHaveLength(1);
    expect(candidates[0]).toMatchObject({
      definitionId: 12,
      versionId: 33,
      occurrenceCount: 3,
      distinctUserCount: 2,
      explicitCorrectionCount: 2,
      maxExplicitConfidence: 0.97,
      regressionCaseIds: [201, 202],
      firstSeenAt: new Date('2026-07-14T00:01:00.000Z'),
      lastSeenAt: new Date('2026-07-14T00:23:00.000Z'),
    });
    expect(candidates[0].averageConfidence).toBeCloseTo(0.97, 10);
  });

  it('caps a requested batch at 500 evidence rows', async () => {
    const rows = Array.from({ length: 510 }, (_, index) =>
      createEvidence({
        id: index + 1,
        runId: index + 1,
        userId: index + 1,
        idempotencyFingerprint: (index + 1).toString(16).padStart(64, '0'),
      }),
    );
    const { prisma, evidence } = createPrisma(rows);
    const service = new BusinessSemanticEvidenceWorkerService(prisma as never);

    const result = await service.clusterEvidence(1000);

    expect(prisma.businessSemanticEvidence.findMany).toHaveBeenCalledWith(expect.objectContaining({ take: 500 }));
    expect(result.clusteredCount).toBe(500);
    expect(evidence.filter((item) => item.status === 'pooled')).toHaveLength(10);
  });

  it('uses the unique identity and absolute recomputation so concurrent clustering is idempotent', async () => {
    const { prisma, candidates, evidence } = createPrisma([
      createEvidence({ id: 1, userId: 9 }),
      createEvidence({ id: 2, userId: 10, sourceType: 'conversation_correction' }),
    ]);
    const firstWorker = new BusinessSemanticEvidenceWorkerService(prisma as never);
    const secondWorker = new BusinessSemanticEvidenceWorkerService(prisma as never);

    await Promise.all([firstWorker.clusterEvidence(100), secondWorker.clusterEvidence(100)]);

    expect(candidates).toHaveLength(1);
    expect(candidates[0]).toMatchObject({ occurrenceCount: 2, distinctUserCount: 2 });
    expect(evidence.every((item) => item.status === 'clustered' && item.aliasCandidateId === 1)).toBe(true);
  });

  it('fails closed when one definition id has conflicting type or key snapshots', async () => {
    const { prisma, candidates, evidence } = createPrisma([
      createEvidence({ id: 1, definitionId: 12, definitionType: 'metric', definitionKey: 'paid_amount' }),
      createEvidence({ id: 2, definitionId: 12, definitionType: 'dimension', definitionKey: 'payment_amount' }),
    ]);
    const service = new BusinessSemanticEvidenceWorkerService(prisma as never);

    await expect(service.clusterEvidence(100)).rejects.toThrow('business_semantic_alias_definition_snapshot_conflict');

    expect(candidates).toHaveLength(0);
    expect(evidence.every((item) => item.status === 'pooled' && item.aliasCandidateId === null)).toBe(true);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('fails closed when new evidence conflicts with an existing candidate snapshot', async () => {
    const { prisma, candidates, evidence } = createPrisma([
      createEvidence({ id: 1, definitionId: 12, definitionType: 'metric', definitionKey: 'paid_amount' }),
    ]);
    const service = new BusinessSemanticEvidenceWorkerService(prisma as never);
    await service.clusterEvidence(100);
    evidence.push(
      createEvidence({
        id: 2,
        definitionId: 12,
        definitionType: 'dimension',
        definitionKey: 'payment_amount',
      }),
    );

    await expect(service.clusterEvidence(100)).rejects.toThrow('business_semantic_alias_definition_snapshot_conflict');

    expect(candidates).toHaveLength(1);
    expect(candidates[0]).toMatchObject({
      definitionType: 'metric',
      definitionKey: 'paid_amount',
      occurrenceCount: 1,
    });
    expect(evidence.find((item) => item.id === 2)).toMatchObject({ status: 'pooled', aliasCandidateId: null });
  });
});
