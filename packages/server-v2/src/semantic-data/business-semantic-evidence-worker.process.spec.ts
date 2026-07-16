import { BusinessSemanticEvidenceWorkerService } from './business-semantic-evidence-worker.service.js';

type RecordLike = Record<string, any>;

const NOW = new Date('2026-07-14T12:00:00.000Z');

function createProcessHarness(options: RecordLike = {}) {
  const currentVersion: RecordLike = {
    id: 31,
    definitionId: 12,
    version: 5,
    schemaVersion: '1.0',
    payload: options.currentPayload ?? {
      aliases: ['实收'],
      measure: { aggregation: 'sum', field: 'netAmount' },
      sourceModels: ['ProductOrder'],
    },
    lifecycleStatus: 'published',
    fingerprint: 'c'.repeat(64),
    sourceFingerprint: 'd'.repeat(64),
    validationStatus: 'passed',
    validationReport: { passed: true },
    canonicalQueryRef: 'orders.paid_amount',
    fixtureSetKey: 'paid_amount_fixture',
    timezone: 'Asia/Shanghai',
    storeScope: { mode: 'current_store' },
  };
  const definition: RecordLike = {
    id: 12,
    definitionKey: 'paid_amount',
    kind: 'metric',
    domain: 'sales',
    name: '实收金额',
    ownerType: 'platform',
    ownerId: null,
    status: 'active',
    currentPublishedVersionId: 31,
    currentPublishedVersion: currentVersion,
  };
  const candidate: RecordLike = {
    id: 1,
    definitionId: 12,
    versionId: 30,
    definitionType: 'metric',
    definitionKey: 'paid_amount',
    alias: '到账金额',
    normalizedAlias: '到账金额',
    occurrenceCount: 1,
    distinctUserCount: 1,
    averageConfidence: 0.99,
    explicitCorrectionCount: 1,
    maxExplicitConfidence: 0.99,
    conflictDefinitions: [],
    regressionCaseIds: [201],
    status: 'pending',
    blockReason: null,
    evalReport: null,
    draftVersionId: null,
    publishedVersionId: null,
    attemptCount: 0,
    leaseOwner: null,
    leaseExpiresAt: null,
    firstSeenAt: new Date('2026-07-14T10:00:00.000Z'),
    lastSeenAt: new Date('2026-07-14T11:00:00.000Z'),
    createdAt: new Date('2026-07-14T10:00:00.000Z'),
    updatedAt: new Date('2026-07-14T11:00:00.000Z'),
    ...options.candidateOverrides,
  };
  const candidates = [candidate];
  const evidence = [
    {
      id: 101,
      aliasCandidateId: 1,
      definitionId: 12,
      sourceType: 'feedback_correction',
      evidenceKind: 'alias',
      idempotencyFingerprint: '1'.repeat(64),
      userId: 9,
      confidence: 0.99,
      status: 'clustered',
      firstSeenAt: new Date('2026-07-14T10:00:00.000Z'),
      lastSeenAt: new Date('2026-07-14T11:00:00.000Z'),
    },
  ];
  const evalCases = [
    {
      id: 201,
      caseKey: 'semantic-evidence:case-201',
      input: { message: '到账金额' },
      expected: {
        definitionType: 'metric',
        definitionKey: 'paid_amount',
        definitionVersion: 5,
        definitionFingerprint: 'c'.repeat(64),
        sourceFingerprint: 'd'.repeat(64),
      },
      enabled: false,
      businessDefinitionVersionId: 31,
      definitionFingerprint: 'c'.repeat(64),
    },
  ];
  const definitions = [definition, ...(options.otherDefinitions ?? [])];
  const versions = new Map<number, RecordLike>([[31, currentVersion]]);
  if (options.existingDraft) {
    const draft = {
      ...currentVersion,
      id: 41,
      version: 6,
      lifecycleStatus: 'candidate',
      validationStatus: 'pending',
      payload: options.existingDraft.payload,
    };
    versions.set(41, draft);
    candidate.draftVersionId = 41;
  }
  let nextDraftId = 41;

  const client: RecordLike = {
    businessDefinitionAliasCandidate: {
      findUnique: jest.fn(async ({ where }: RecordLike) => {
        const found = candidates.find((item) => item.id === where.id);
        return found ? { ...found } : null;
      }),
      findMany: jest.fn(async ({ where, take }: RecordLike) =>
        candidates
          .filter(
            (item) =>
              where.status.in.includes(item.status) &&
              (!item.leaseExpiresAt || item.leaseExpiresAt.getTime() <= NOW.getTime()),
          )
          .slice(0, take)
          .map((item) => ({ id: item.id })),
      ),
      updateMany: jest.fn(async ({ where, data }: RecordLike) => {
        const found = candidates.find((item) => item.id === where.id);
        if (!found) return { count: 0 };
        if (where.status?.in) {
          const claimNow = where.OR?.find((item: RecordLike) => item.leaseExpiresAt?.lte)?.leaseExpiresAt.lte ?? NOW;
          const leaseAvailable = !found.leaseExpiresAt || found.leaseExpiresAt.getTime() <= claimNow.getTime();
          if (!where.status.in.includes(found.status) || !leaseAvailable) return { count: 0 };
        } else {
          if (where.leaseOwner !== found.leaseOwner) return { count: 0 };
          if (
            where.leaseExpiresAt instanceof Date &&
            (!found.leaseExpiresAt || found.leaseExpiresAt.getTime() !== where.leaseExpiresAt.getTime())
          ) {
            return { count: 0 };
          }
          if (where.leaseExpiresAt?.gt && (!found.leaseExpiresAt || found.leaseExpiresAt <= where.leaseExpiresAt.gt)) {
            return { count: 0 };
          }
          if (where.attemptCount?.gte !== undefined && found.attemptCount < where.attemptCount.gte) return { count: 0 };
          if (where.attemptCount?.lt !== undefined && found.attemptCount >= where.attemptCount.lt) return { count: 0 };
          if (options.loseLeaseOnTerminal && data.status) {
            found.leaseOwner = 'other-worker';
            return { count: 0 };
          }
          if (options.loseLeaseOnDraftBindOnce && data.draftVersionId && !options.draftBindLeaseLost) {
            options.draftBindLeaseLost = true;
            found.leaseOwner = 'other-worker';
            return { count: 0 };
          }
        }
        for (const [key, value] of Object.entries(data)) {
          if (value && typeof value === 'object' && 'increment' in value) {
            found[key] += Number((value as RecordLike).increment);
          } else {
            found[key] = value;
          }
        }
        return { count: 1 };
      }),
      update: jest.fn(async ({ where, data }: RecordLike) => {
        const found = candidates.find((item) => item.id === where.id);
        if (!found) throw new Error('candidate_not_found');
        Object.assign(found, data);
        return { ...found };
      }),
    },
    businessDefinition: {
      findUnique: jest.fn(async ({ where }: RecordLike) => {
        const found = definitions.find((item) => item.id === where.id);
        return found ? { ...found, currentPublishedVersion: found.currentPublishedVersion } : null;
      }),
      findMany: jest.fn(async () =>
        definitions
          .filter((item) => item.status === 'active' && item.currentPublishedVersion)
          .map((item) => ({ ...item, currentPublishedVersion: item.currentPublishedVersion })),
      ),
    },
    businessDefinitionVersion: {
      findUnique: jest.fn(async ({ where }: RecordLike) => {
        const found = versions.get(where.id);
        return found ? { ...found } : null;
      }),
    },
    businessSemanticEvidence: {
      findMany: jest.fn(async ({ where }: RecordLike) =>
        evidence.filter((item) => item.aliasCandidateId === where.aliasCandidateId).map((item) => ({ ...item })),
      ),
    },
    brainEvalCase: {
      findMany: jest.fn(async ({ where }: RecordLike) =>
        evalCases.filter((item) => where.id.in.includes(item.id)).map((item) => ({ ...item })),
      ),
      updateMany: jest.fn(async ({ where, data }: RecordLike) => {
        let count = 0;
        for (const item of evalCases) {
          if (!where.id.in.includes(item.id)) continue;
          Object.assign(item, data);
          count += 1;
        }
        return { count };
      }),
    },
  };
  const prisma: RecordLike = {
    ...client,
    $transaction: jest.fn(async (operation: (tx: RecordLike) => unknown) => operation(client)),
  };

  let reusableDraft: RecordLike | null = null;
  const createDraft = async (input: RecordLike, reuse: boolean) => {
    if (options.createDraftFailure) throw new Error('registry_create_failed');
    if (reuse && reusableDraft) return { ...reusableDraft };
    const draft = {
      ...currentVersion,
      id: nextDraftId++,
      definitionId: definition.id,
      version: 6,
      lifecycleStatus: input.lifecycleStatus,
      validationStatus: 'pending',
      payload: options.mutatedDraftPayload
        ? { ...input.payload, measure: { aggregation: 'count', field: 'id' } }
        : input.payload,
      fingerprint: 'e'.repeat(64),
      sourceFingerprint: 'f'.repeat(64),
    };
    versions.set(draft.id, draft);
    if (reuse) reusableDraft = draft;
    return { ...draft };
  };
  const registry: RecordLike = {
    createDraft: jest.fn(async (input: RecordLike) => createDraft(input, false)),
    createOrReuseDraft: jest.fn(async (input: RecordLike) => createDraft(input, true)),
    previewProjections: jest.fn(async (versionId: number) => {
      if (options.previewFailure) throw new Error('preview_failed');
      const draft = versions.get(versionId)!;
      const aliases = draft.payload.aliases;
      return [
        { targetType: 'intent_semantic_index', payload: { data: { aliases } } },
        {
          targetType: 'eval_case_projection',
          payload: { data: { cases: aliases.map((input: string) => ({ input })) } },
        },
      ];
    }),
    validateVersion: jest.fn(async (versionId: number) => ({
      ...versions.get(versionId),
      lifecycleStatus: 'validated',
      validationStatus: 'passed',
    })),
    publishVersion: jest.fn(async (versionId: number) => {
      const published = { ...versions.get(versionId), lifecycleStatus: 'published', validationStatus: 'passed' };
      versions.set(versionId, published);
      definition.currentPublishedVersionId = versionId;
      definition.currentPublishedVersion = published;
      if (options.publishCommittedThenThrows) throw new Error('business_metric_catalog_empty');
      return published;
    }),
  };
  const evaluator: RecordLike = {
    evaluate: jest.fn(
      async (input: RecordLike) =>
        options.evalResult ?? {
          passed: true,
          checks: {
            intentSemanticIndexContainsAlias: true,
            evalCaseProjectionContainsAlias: true,
            regressionCasesPassed: true,
          },
          caseResults: input.regressionCases.map((item: RecordLike) => ({
            caseId: item.id,
            caseKey: item.caseKey,
            passed: true,
          })),
          errors: [],
        },
    ),
  };

  return { prisma, registry, evaluator, candidate, candidates, definition, versions, evidence, evalCases };
}

describe('BusinessSemanticEvidenceWorkerService process/publish', () => {
  const originalActor = process.env.BRAIN_SEMANTIC_AUTOMATION_USER_ID;
  const originalEnabled = process.env.BRAIN_SEMANTIC_EVIDENCE_WORKER_ENABLED;

  beforeEach(() => {
    process.env.BRAIN_SEMANTIC_AUTOMATION_USER_ID = '99';
    process.env.BRAIN_SEMANTIC_EVIDENCE_WORKER_ENABLED = 'false';
  });

  afterAll(() => {
    if (originalActor === undefined) delete process.env.BRAIN_SEMANTIC_AUTOMATION_USER_ID;
    else process.env.BRAIN_SEMANTIC_AUTOMATION_USER_ID = originalActor;
    if (originalEnabled === undefined) delete process.env.BRAIN_SEMANTIC_EVIDENCE_WORKER_ENABLED;
    else process.env.BRAIN_SEMANTIC_EVIDENCE_WORKER_ENABLED = originalEnabled;
  });

  function serviceFor(harness: ReturnType<typeof createProcessHarness>) {
    return new BusinessSemanticEvidenceWorkerService(
      harness.prisma as never,
      harness.registry as never,
      harness.evaluator as never,
    );
  }

  it.each([
    {
      name: 'one explicit correction at 0.95',
      overrides: { explicitCorrectionCount: 1, maxExplicitConfidence: 0.95, distinctUserCount: 1 },
    },
    {
      name: 'three independent users at average 0.95',
      overrides: {
        explicitCorrectionCount: 0,
        maxExplicitConfidence: 0,
        distinctUserCount: 3,
        averageConfidence: 0.95,
      },
    },
  ])('auto publishes for $name and uses the processing-time current version', async ({ overrides }) => {
    const harness = createProcessHarness({ candidateOverrides: overrides });
    const service = serviceFor(harness);

    await service.processCandidate(1, 'worker-a', NOW);

    expect(harness.registry.createOrReuseDraft).toHaveBeenCalledWith(
      expect.objectContaining({
        lifecycleStatus: 'candidate',
        createdBy: 99,
        payload: expect.objectContaining({ aliases: ['实收', '到账金额'] }),
        candidateDiagnostics: undefined,
      }),
    );
    expect(harness.registry.publishVersion).toHaveBeenCalledWith(41, {
      publishedBy: 99,
      expectedCurrentVersionId: 31,
    });
    expect(harness.candidate).toMatchObject({
      status: 'auto_published',
      draftVersionId: 41,
      publishedVersionId: 41,
      leaseOwner: null,
      leaseExpiresAt: null,
    });
    expect(harness.prisma.businessDefinitionAliasCandidate.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: 1, leaseOwner: 'worker-a' }),
        data: expect.objectContaining({ status: 'auto_published' }),
      }),
    );
    expect(harness.evalCases[0]).toMatchObject({
      enabled: true,
      businessDefinitionVersionId: 41,
      definitionFingerprint: 'e'.repeat(64),
      expected: expect.objectContaining({ definitionVersion: 6, definitionFingerprint: 'e'.repeat(64) }),
    });
  });

  it('routes low confidence to one reusable Business Definition candidate draft', async () => {
    const payload = {
      aliases: ['实收', '到账金额'],
      measure: { aggregation: 'sum', field: 'netAmount' },
      sourceModels: ['ProductOrder'],
    };
    const harness = createProcessHarness({
      candidateOverrides: {
        status: 'retry',
        explicitCorrectionCount: 0,
        maxExplicitConfidence: 0.9,
        distinctUserCount: 2,
        averageConfidence: 0.94,
      },
      existingDraft: { payload },
    });

    await serviceFor(harness).processCandidate(1, 'worker-a', NOW);

    expect(harness.registry.createOrReuseDraft).not.toHaveBeenCalled();
    expect(harness.registry.publishVersion).not.toHaveBeenCalled();
    expect(harness.candidate).toMatchObject({
      status: 'review_required',
      blockReason: 'confidence_threshold_not_met',
      draftVersionId: 41,
    });
  });

  it('returns lease_lost and does not overwrite review state after losing the lease', async () => {
    const harness = createProcessHarness({
      loseLeaseOnTerminal: true,
      candidateOverrides: {
        explicitCorrectionCount: 0,
        maxExplicitConfidence: 0.5,
        distinctUserCount: 1,
        averageConfidence: 0.5,
      },
    });

    const result = await serviceFor(harness).processCandidate(1, 'worker-a', NOW);

    expect(result).toEqual({ claimed: true, status: 'lease_lost' });
    expect(harness.candidate.status).toBe('pending');
    expect(harness.candidate.leaseOwner).toBe('other-worker');
    expect(harness.candidate.blockReason).toBeNull();
  });

  it('recovers the same registry draft when creation succeeded before candidate binding lost its lease', async () => {
    const harness = createProcessHarness({
      loseLeaseOnDraftBindOnce: true,
      candidateOverrides: {
        explicitCorrectionCount: 0,
        maxExplicitConfidence: 0.5,
        distinctUserCount: 1,
        averageConfidence: 0.5,
      },
    });
    const service = serviceFor(harness);

    await expect(service.processCandidate(1, 'worker-a', NOW)).resolves.toEqual({
      claimed: true,
      status: 'lease_lost',
    });
    expect(harness.candidate.draftVersionId).toBeNull();
    harness.candidate.status = 'retry';
    harness.candidate.leaseOwner = null;
    harness.candidate.leaseExpiresAt = null;

    await service.processCandidate(1, 'worker-b', NOW);

    expect(harness.registry.createOrReuseDraft).toHaveBeenCalledTimes(2);
    expect(harness.versions.size).toBe(2);
    expect(harness.candidate).toMatchObject({ status: 'review_required', draftVersionId: 41 });
  });

  it('creates a review candidate with a source user when automation actor is absent', async () => {
    delete process.env.BRAIN_SEMANTIC_AUTOMATION_USER_ID;
    const harness = createProcessHarness();

    await serviceFor(harness).processCandidate(1, 'worker-a', NOW);

    expect(harness.registry.createOrReuseDraft).toHaveBeenCalledWith(
      expect.objectContaining({ lifecycleStatus: 'candidate', createdBy: 9 }),
    );
    expect(harness.registry.publishVersion).not.toHaveBeenCalled();
    expect(harness.candidate).toMatchObject({ status: 'review_required', blockReason: 'automation_actor_missing' });
  });

  it('records conflicts from another published definition and does not publish', async () => {
    const otherVersion = { id: 51, payload: { aliases: ['到账金额'] } };
    const otherDefinition = {
      id: 13,
      definitionKey: 'refund_amount',
      kind: 'metric',
      domain: 'sales',
      name: '退款金额',
      ownerType: 'platform',
      ownerId: null,
      status: 'active',
      currentPublishedVersionId: 51,
      currentPublishedVersion: otherVersion,
    };
    const harness = createProcessHarness({ otherDefinitions: [otherDefinition] });

    await serviceFor(harness).processCandidate(1, 'worker-a', NOW);

    expect(harness.registry.publishVersion).not.toHaveBeenCalled();
    expect(harness.candidate.status).toBe('review_required');
    expect(harness.candidate.blockReason).toBe('alias_conflict');
    expect(harness.candidate.conflictDefinitions).toEqual([
      expect.objectContaining({ definitionId: 13, definitionKey: 'refund_amount' }),
    ]);
  });

  it('prioritizes another-definition conflict over an alias already present on the target definition', async () => {
    const otherDefinition = {
      id: 13,
      definitionKey: 'refund_amount',
      kind: 'metric',
      domain: 'sales',
      name: '退款金额',
      ownerType: 'platform',
      ownerId: null,
      status: 'active',
      currentPublishedVersionId: 51,
      currentPublishedVersion: { id: 51, payload: { aliases: ['到账金额'] } },
    };
    const harness = createProcessHarness({
      currentPayload: {
        aliases: ['实收', '到账金额'],
        measure: { aggregation: 'sum', field: 'netAmount' },
        sourceModels: ['ProductOrder'],
      },
      otherDefinitions: [otherDefinition],
    });

    await serviceFor(harness).processCandidate(1, 'worker-a', NOW);

    expect(harness.candidate).toMatchObject({ status: 'review_required', blockReason: 'alias_conflict' });
    expect(harness.candidate.conflictDefinitions).toEqual([
      expect.objectContaining({ definitionId: 13, definitionKey: 'refund_amount' }),
    ]);
    expect(harness.registry.publishVersion).not.toHaveBeenCalled();
  });

  it('accepts an alias already published by the target definition without creating a version', async () => {
    const harness = createProcessHarness({
      currentPayload: {
        aliases: ['实收', '到账金额'],
        measure: { aggregation: 'sum', field: 'netAmount' },
        sourceModels: ['ProductOrder'],
      },
    });
    const service = serviceFor(harness);

    await Promise.all([service.processCandidate(1, 'worker-a', NOW), service.processCandidate(1, 'worker-b', NOW)]);

    expect(harness.registry.createOrReuseDraft).not.toHaveBeenCalled();
    expect(harness.registry.publishVersion).not.toHaveBeenCalled();
    expect(harness.candidate).toMatchObject({ status: 'accepted_existing', publishedVersionId: 31 });
    expect(harness.evalCases[0]).toMatchObject({ enabled: true, businessDefinitionVersionId: 31 });
  });

  it.each([
    '请查询到账金额',
    '到账金额是多少？',
    '本月收入是多少呀',
    '帮我看看本月收入',
    '查一下本月收入',
    '13800138000',
    '138-0013-8000',
    '110105 19491231 002X',
    '1234-5678-9012',
    'owner @ example . com',
    '[PERSON_ENTITY]',
    'person_entity',
  ])('rejects unsafe alias %s without creating a draft', async (alias) => {
    const harness = createProcessHarness({
      candidateOverrides: { alias, normalizedAlias: alias.toLowerCase().replace(/[\s\p{P}\p{S}]+/gu, '') },
    });

    await serviceFor(harness).processCandidate(1, 'worker-a', NOW);

    expect(harness.registry.createOrReuseDraft).not.toHaveBeenCalled();
    expect(harness.registry.publishVersion).not.toHaveBeenCalled();
    expect(harness.candidate).toMatchObject({ status: 'review_required', blockReason: 'unsafe_alias' });
  });

  it('keeps an evaluated candidate for review when evaluation fails', async () => {
    const harness = createProcessHarness({
      evalResult: {
        passed: false,
        checks: {
          intentSemanticIndexContainsAlias: true,
          evalCaseProjectionContainsAlias: true,
          regressionCasesPassed: false,
        },
        caseResults: [{ caseId: 201, caseKey: 'semantic-evidence:case-201', passed: false }],
        errors: ['regression_case_failed'],
      },
    });

    await serviceFor(harness).processCandidate(1, 'worker-a', NOW);

    expect(harness.registry.validateVersion).not.toHaveBeenCalled();
    expect(harness.registry.publishVersion).not.toHaveBeenCalled();
    expect(harness.candidate).toMatchObject({ status: 'review_required', blockReason: 'evaluation_failed' });
    expect(harness.candidate.evalReport).toEqual(expect.objectContaining({ passed: false }));
  });

  it('blocks a registry draft that changes canonical payload outside aliases', async () => {
    const harness = createProcessHarness({ mutatedDraftPayload: true });

    await serviceFor(harness).processCandidate(1, 'worker-a', NOW);

    expect(harness.registry.validateVersion).not.toHaveBeenCalled();
    expect(harness.registry.publishVersion).not.toHaveBeenCalled();
    expect(harness.candidate).toMatchObject({
      status: 'review_required',
      blockReason: 'canonical_payload_changed',
    });
  });

  it('claims one candidate once across concurrent workers', async () => {
    const harness = createProcessHarness();
    const first = serviceFor(harness);
    const second = serviceFor(harness);

    const results = await Promise.all([
      first.processCandidate(1, 'worker-a', NOW),
      second.processCandidate(1, 'worker-b', NOW),
    ]);

    expect(results.filter((item: RecordLike) => item.claimed)).toHaveLength(1);
    expect(harness.registry.createOrReuseDraft).toHaveBeenCalledTimes(1);
    expect(harness.registry.publishVersion).toHaveBeenCalledTimes(1);
  });

  it('fences an expired old worker after a new worker reclaims and completes the candidate', async () => {
    const harness = createProcessHarness();
    const first = serviceFor(harness);
    const second = serviceFor(harness);
    const originalCreate = harness.registry.createOrReuseDraft.getMockImplementation()!;
    let releaseFirst!: () => void;
    const firstPaused = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    harness.registry.createOrReuseDraft.mockImplementationOnce(async (input: RecordLike) => {
      await firstPaused;
      return originalCreate(input);
    });

    const oldWorker = first.processCandidate(1, 'worker-old', NOW);
    await Promise.resolve();
    const later = new Date(NOW.getTime() + 120_000);
    const newWorker = second.processCandidate(1, 'worker-new', later);
    await newWorker;
    releaseFirst();

    await expect(oldWorker).resolves.toEqual({ claimed: true, status: 'lease_lost' });
    expect(harness.candidate).toMatchObject({ status: 'auto_published', leaseOwner: null, leaseExpiresAt: null });
    expect(harness.registry.publishVersion).toHaveBeenCalledTimes(1);
  });

  it('treats a committed publish as success when catalog refresh fails after the commit', async () => {
    const harness = createProcessHarness({ publishCommittedThenThrows: true });

    const result = await serviceFor(harness).processCandidate(1, 'worker-a', NOW);

    expect(result).toEqual({ claimed: true, status: 'auto_published' });
    expect(harness.candidate).toMatchObject({ status: 'auto_published', publishedVersionId: 41 });
    expect(harness.candidate.attemptCount).toBe(0);
  });

  it('increments attempts, retries, and dead-letters after the third processing failure', async () => {
    const harness = createProcessHarness({
      createDraftFailure: true,
      candidateOverrides: {
        explicitCorrectionCount: 0,
        maxExplicitConfidence: 0.5,
        distinctUserCount: 1,
        averageConfidence: 0.5,
      },
    });
    const service = serviceFor(harness);

    await service.processCandidate(1, 'worker-a', NOW);
    expect(harness.candidate).toMatchObject({ status: 'retry', attemptCount: 1 });
    await service.processCandidate(1, 'worker-a', NOW);
    expect(harness.candidate).toMatchObject({ status: 'retry', attemptCount: 2 });
    await service.processCandidate(1, 'worker-a', NOW);

    expect(harness.candidate).toMatchObject({
      status: 'dead_letter',
      attemptCount: 3,
      blockReason: expect.stringContaining('registry_create_failed'),
      leaseOwner: null,
      leaseExpiresAt: null,
    });
    expect(harness.prisma.businessDefinitionAliasCandidate.findUnique).not.toHaveBeenCalledWith(
      expect.objectContaining({ select: { attemptCount: true } }),
    );
    expect(harness.prisma.businessDefinitionAliasCandidate.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: 1, leaseOwner: 'worker-a', attemptCount: expect.any(Object) }),
        data: expect.objectContaining({ attemptCount: { increment: 1 } }),
      }),
    );
  });

  it('isolates rejected candidate processing so later candidates still run', async () => {
    const harness = createProcessHarness();
    harness.candidates.push({ ...harness.candidate, id: 2, status: 'pending', leaseOwner: null, leaseExpiresAt: null });
    const service = serviceFor(harness);
    const processSpy = jest
      .spyOn(service, 'processCandidate')
      .mockRejectedValueOnce(new Error('candidate-one-failed'))
      .mockResolvedValueOnce({ claimed: true, status: 'accepted_existing' } as never);

    const result = await service.processCandidates(10, 'worker-a', NOW);

    expect(processSpy).toHaveBeenCalledTimes(2);
    expect(result).toMatchObject({ selectedCount: 2, failedCount: 1, processedCount: 1 });
  });

  it('honors the disabled cron flag and contains cron errors when enabled', async () => {
    const harness = createProcessHarness();
    const service = serviceFor(harness);
    const clusterSpy = jest.spyOn(service, 'clusterEvidence');
    const processSpy = jest.spyOn(service, 'processCandidates');

    await expect(service.poll()).resolves.toEqual({ enabled: false, status: 'disabled' });
    expect(clusterSpy).not.toHaveBeenCalled();
    expect(processSpy).not.toHaveBeenCalled();

    process.env.BRAIN_SEMANTIC_EVIDENCE_WORKER_ENABLED = 'true';
    clusterSpy.mockRejectedValueOnce(new Error('cluster_failed'));
    await expect(service.poll()).resolves.toEqual(
      expect.objectContaining({ enabled: true, status: 'failed', error: 'cluster_failed' }),
    );
  });
});
