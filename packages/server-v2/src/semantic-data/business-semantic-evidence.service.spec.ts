import {
  BusinessSemanticEvidenceService,
  createBusinessSemanticEvidenceFingerprint,
  normalizeBusinessSemanticValue,
  redactBusinessSemanticText,
} from './business-semantic-evidence.service.js';
import { ForbiddenException } from '@nestjs/common';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('BusinessSemanticEvidenceService', () => {
  const entityRef = {
    definitionType: 'entity',
    definitionKey: 'service_project',
    definitionVersion: 3,
    definitionFingerprint: 'a'.repeat(64),
    sourceFingerprint: 'b'.repeat(64),
  };
  const metricRef = {
    definitionType: 'metric',
    definitionKey: 'paid_amount',
    definitionVersion: 5,
    definitionFingerprint: 'c'.repeat(64),
    sourceFingerprint: 'd'.repeat(64),
  };

  const definitionFor = (type: string, key: string) => {
    const version = {
      id: type === 'entity' ? 31 : 32,
      definitionId: type === 'entity' ? 11 : 12,
      version: type === 'entity' ? 3 : 5,
      fingerprint: type === 'entity' ? 'a'.repeat(64) : 'c'.repeat(64),
      sourceFingerprint: type === 'entity' ? 'b'.repeat(64) : 'd'.repeat(64),
      payload: { aliases: type === 'entity' ? ['项目'] : ['实收'] },
      lifecycleStatus: 'published',
    };
    return {
      id: type === 'entity' ? 11 : 12,
      kind: type,
      definitionKey: key,
      domain: 'sales',
      name: type === 'entity' ? '服务项目' : '实收金额',
      ownerType: 'platform',
      ownerId: null,
      currentPublishedVersionId: version.id,
      currentPublishedVersion: version,
      versions: [version],
    };
  };

  const createPrisma = () => {
    const client = {
      brainRun: {
        findFirst: jest.fn().mockResolvedValue({ id: 77, userId: 9, storeId: 2, status: 'completed' }),
      },
      businessDefinition: {
        findUnique: jest.fn(({ where }) => {
          const identity = where.kind_definitionKey;
          return Promise.resolve(definitionFor(identity.kind, identity.definitionKey));
        }),
        findMany: jest.fn(({ where }) =>
          Promise.resolve(
            (where.OR ?? []).map((identity: { kind: string; definitionKey: string }) =>
              definitionFor(identity.kind, identity.definitionKey),
            ),
          ),
        ),
      },
      businessDefinitionVersion: {
        findFirst: jest.fn(({ where }) => {
          const definition = definitionFor(where.definition.kind, where.definition.definitionKey);
          const version = definition.versions.find(
            (candidate) =>
              candidate.version === where.version &&
              candidate.fingerprint === where.fingerprint &&
              candidate.sourceFingerprint === where.sourceFingerprint &&
              candidate.lifecycleStatus === where.lifecycleStatus,
          );
          return Promise.resolve(version ? { ...version, definition } : null);
        }),
      },
      businessSemanticEvidence: {
        upsert: jest.fn(({ create }) => Promise.resolve({ id: 100, ...create })),
      },
      brainEvalCase: {
        upsert: jest.fn(({ create }) => Promise.resolve({ id: 200, ...create })),
      },
    };
    return {
      ...client,
      tx: client,
      $transaction: jest.fn((operation) => operation(client)),
    };
  };

  it('redacts phone numbers, identity cards and long digit sequences before persistence', () => {
    const redacted = redactBusinessSemanticText(
      '联系 13800138000，座机 0755-12345678，邮箱 owner@example.com，微信号 wx_Ami2026，身份证 11010519491231002X，订单 1234567890123456',
    );

    expect(redacted).toContain('[PHONE]');
    expect(redacted).toContain('[LANDLINE]');
    expect(redacted).toContain('[EMAIL]');
    expect(redacted).toContain('[WECHAT]');
    expect(redacted).toContain('[ID_CARD]');
    expect(redacted).toContain('[LONG_NUMBER]');
    expect(redacted).not.toMatch(
      /13800138000|0755-12345678|owner@example\.com|wx_Ami2026|11010519491231002X|1234567890123456/,
    );
  });

  it.each(['captureModelSuccess', 'captureStructuredCorrection'] as const)(
    'rejects %s when the run does not belong to the same user and store',
    async (method) => {
      const prisma = createPrisma();
      prisma.brainRun.findFirst.mockResolvedValue(null);
      const service = new BusinessSemanticEvidenceService(prisma as never);

      const operation =
        method === 'captureModelSuccess'
          ? service.captureModelSuccess({
              runId: 77,
              storeId: 2,
              userId: 9,
              question: '本月实收',
              intent: { entities: [], metrics: [metricRef], dimensions: [] },
            } as never)
          : service.captureStructuredCorrection({
              sourceType: 'feedback_correction',
              runId: 77,
              storeId: 2,
              userId: 9,
              definitionType: 'metric',
              definitionKey: 'paid_amount',
              alias: '到账金额',
              question: '本月实收',
              definitionVersion: 5,
              definitionFingerprint: 'c'.repeat(64),
              sourceFingerprint: 'd'.repeat(64),
            } as never);

      await expect(operation).rejects.toBeInstanceOf(ForbiddenException);
      expect(prisma.businessSemanticEvidence.upsert).not.toHaveBeenCalled();
    },
  );

  it('uses versioned evidence kind lineage in the sha256 idempotency fingerprint', () => {
    const input = {
      sourceType: 'model_success',
      evidenceKind: 'regression_question',
      runId: 77,
      definitionType: 'metric',
      definitionKey: 'paid_amount',
      definitionVersionId: 32,
      definitionVersion: 5,
      definitionFingerprint: 'c'.repeat(64),
      normalizedValue: normalizeBusinessSemanticValue(' 本月实收 '),
    };

    const first = createBusinessSemanticEvidenceFingerprint(input as never);
    const second = createBusinessSemanticEvidenceFingerprint({ ...input } as never);
    const alias = createBusinessSemanticEvidenceFingerprint({ ...input, evidenceKind: 'alias' } as never);
    const nextVersion = createBusinessSemanticEvidenceFingerprint({
      ...input,
      definitionVersionId: 42,
      definitionVersion: 6,
      definitionFingerprint: 'e'.repeat(64),
    } as never);

    expect(first).toBe(second);
    expect(first).toMatch(/^[0-9a-f]{64}$/);
    expect(alias).not.toBe(first);
    expect(nextVersion).not.toBe(first);
  });

  it('stores entity mentions as grounding evidence and never turns them into aliases', async () => {
    const prisma = createPrisma();
    const service = new BusinessSemanticEvidenceService(prisma as never);

    await service.captureModelSuccess({
      runId: 77,
      storeId: 2,
      userId: 9,
      question: '帮我看水光针本月实收，电话 13800138000，邮箱 owner@example.com，座机 0755-12345678，微信号 wx_Ami2026',
      intent: {
        entities: [
          {
            entityType: 'service_project',
            mention: '水光针',
            source: 'user',
            confidence: 0.98,
            definitionRef: entityRef,
          },
        ],
        metrics: [metricRef],
        dimensions: [],
      },
      corrections: [],
    } as never);

    const creates = prisma.businessSemanticEvidence.upsert.mock.calls.map((call) => call[0].create);
    const aliases = creates.filter((item) => item.evidenceKind === 'alias');
    const mentions = creates.filter((item) => item.evidenceKind === 'entity_mention');
    const regressions = creates.filter((item) => item.evidenceKind === 'regression_question');

    expect(aliases).toHaveLength(0);
    expect(mentions).toHaveLength(1);
    expect(mentions[0]).toMatchObject({
      definitionType: 'entity',
      definitionKey: 'service_project',
      redactedText: '水光针',
      normalizedValue: '水光针',
      status: 'grounding_only',
    });
    expect(aliases.some((item) => item.definitionType === 'metric')).toBe(false);
    expect(regressions).toHaveLength(2);
    const evidencePayload = JSON.stringify(creates);
    expect(evidencePayload).not.toMatch(/13800138000|owner@example\.com|0755-12345678|wx_Ami2026/);
    expect(
      creates.every(
        (item) =>
          item.definitionSourceFingerprint === 'b'.repeat(64) || item.definitionSourceFingerprint === 'd'.repeat(64),
      ),
    ).toBe(true);
    expect(prisma.brainEvalCase.upsert).toHaveBeenCalledTimes(2);
    expect(prisma.brainEvalCase.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          enabled: false,
          expected: expect.objectContaining({
            definitionType: 'metric',
            definitionKey: 'paid_amount',
            definitionVersion: 5,
            definitionFingerprint: 'c'.repeat(64),
          }),
        }),
      } as never),
    );
    const evalPayload = JSON.stringify(prisma.brainEvalCase.upsert.mock.calls.map((call) => call[0].create.input));
    expect(evalPayload).not.toMatch(/13800138000|owner@example\.com|0755-12345678|wx_Ami2026/);
  });

  it.each([
    {
      definitionType: 'metric',
      definitionKey: 'paid_amount',
      alias: '本月实收是多少',
      question: '本月实收是多少',
      definitionVersion: 5,
      definitionFingerprint: 'c'.repeat(64),
      sourceFingerprint: 'd'.repeat(64),
    },
    {
      definitionType: 'dimension',
      definitionKey: 'store',
      alias: '帮我查询本月各门店实收情况',
      question: '请分析本月各门店实收情况',
      definitionVersion: 5,
      definitionFingerprint: 'c'.repeat(64),
      sourceFingerprint: 'd'.repeat(64),
    },
    {
      definitionType: 'metric',
      definitionKey: 'paid_amount',
      alias: '帮我查一下实收金额',
      question: '另一个问题',
      definitionVersion: 5,
      definitionFingerprint: 'c'.repeat(64),
      sourceFingerprint: 'd'.repeat(64),
    },
    {
      definitionType: 'metric',
      definitionKey: 'paid_amount',
      alias: '实收是多少',
      question: '另一个问题',
      definitionVersion: 5,
      definitionFingerprint: 'c'.repeat(64),
      sourceFingerprint: 'd'.repeat(64),
    },
    {
      definitionType: 'metric',
      definitionKey: 'repurchase_rate',
      alias: '给我看看复购率',
      question: '另一个问题',
      definitionVersion: 5,
      definitionFingerprint: 'c'.repeat(64),
      sourceFingerprint: 'd'.repeat(64),
    },
    {
      definitionType: 'dimension',
      definitionKey: 'appointment',
      alias: '请统计预约数',
      question: '另一个问题',
      definitionVersion: 5,
      definitionFingerprint: 'c'.repeat(64),
      sourceFingerprint: 'd'.repeat(64),
    },
  ])('rejects metric or dimension aliases that are full user questions', async (correction) => {
    const prisma = createPrisma();
    const service = new BusinessSemanticEvidenceService(prisma as never);

    await expect(
      service.captureStructuredCorrection({
        sourceType: 'feedback_correction',
        runId: 77,
        storeId: 2,
        userId: 9,
        confidence: 0.99,
        ...correction,
      } as never),
    ).rejects.toThrow('business_semantic_alias_looks_like_question');
    expect(prisma.businessSemanticEvidence.upsert).not.toHaveBeenCalled();
  });

  it('allows a short metric noun alias', async () => {
    const prisma = createPrisma();
    const service = new BusinessSemanticEvidenceService(prisma as never);

    await service.captureStructuredCorrection({
      sourceType: 'feedback_correction',
      runId: 77,
      storeId: 2,
      userId: 9,
      definitionType: 'metric',
      definitionKey: 'paid_amount',
      alias: '到账金额',
      question: '请帮我看一下到账金额',
      confidence: 0.99,
      definitionVersion: 5,
      definitionFingerprint: 'c'.repeat(64),
      sourceFingerprint: 'd'.repeat(64),
    } as never);

    expect(prisma.businessSemanticEvidence.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ create: expect.objectContaining({ normalizedValue: '到账金额' }) }),
    );
  });

  it('skips a full-question metric alias from model conversation corrections while keeping regression evidence', async () => {
    const prisma = createPrisma();
    const service = new BusinessSemanticEvidenceService(prisma as never);

    await service.captureModelSuccess({
      runId: 77,
      storeId: 2,
      userId: 9,
      question: '本月实收是多少',
      intent: { entities: [], metrics: [metricRef], dimensions: [] },
      corrections: [
        {
          sourceType: 'conversation_correction',
          ...metricRef,
          alias: '本月实收是多少',
          confidence: 0.99,
        },
      ],
    } as never);

    const creates = prisma.businessSemanticEvidence.upsert.mock.calls.map((call) => call[0].create);
    expect(creates.filter((item) => item.evidenceKind === 'alias')).toHaveLength(0);
    expect(creates.filter((item) => item.evidenceKind === 'regression_question')).toHaveLength(1);
  });

  it('does not apply the full-question alias rule to entity mention corrections', async () => {
    const prisma = createPrisma();
    const service = new BusinessSemanticEvidenceService(prisma as never);

    await service.captureStructuredCorrection({
      sourceType: 'feedback_correction',
      runId: 77,
      storeId: 2,
      userId: 9,
      definitionType: 'entity',
      definitionKey: 'service_project',
      alias: '帮我查询本月水光针',
      question: '帮我查询本月水光针',
      confidence: 0.99,
      definitionVersion: 3,
      definitionFingerprint: 'a'.repeat(64),
      sourceFingerprint: 'b'.repeat(64),
    } as never);

    expect(prisma.businessSemanticEvidence.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ create: expect.objectContaining({ definitionType: 'entity' }) }),
    );
  });

  it('persists complete definition lineage with a composite version foreign key', () => {
    const schema = readFileSync(resolve(process.cwd(), 'prisma/schema.prisma'), 'utf8');
    const migration = readFileSync(
      resolve(process.cwd(), 'prisma/migrations/20260714120000_business_semantic_evidence_pool/migration.sql'),
      'utf8',
    );

    expect(schema).toMatch(/definitionSourceFingerprint\s+String\s+@db\.VarChar\(64\)/);
    expect(migration).toContain('"definitionSourceFingerprint" VARCHAR(64) NOT NULL');
    expect(migration).toContain('business_semantic_evidence_definition_source_fingerprint_check');
    expect(schema).toContain('@@unique([id, definitionId])');
    expect(schema).toMatch(
      /definitionVersionRecord\s+BusinessDefinitionVersion\s+@relation\(fields: \[definitionVersionId, definitionId\], references: \[id, definitionId\]/,
    );
    expect(migration).toContain('CREATE UNIQUE INDEX "business_definition_version_id_definitionId_key"');
    expect(migration).toContain('FOREIGN KEY ("definitionVersionId", "definitionId")');
    expect(migration).not.toContain('FOREIGN KEY ("definitionVersionId") REFERENCES');
    expect(migration).not.toContain('DROP CONSTRAINT "business_semantic_evidence_definitionVersionId_fkey"');
    expect(migration.indexOf('business_definition_version_id_definitionId_key')).toBeLessThan(
      migration.indexOf('FOREIGN KEY ("definitionVersionId", "definitionId")'),
    );
    expect(schema).toContain('@@unique([definitionId, normalizedAlias])');
    expect(schema).toContain('@@unique([id, definitionId])');
    expect(schema).toMatch(
      /aliasCandidate\s+BusinessDefinitionAliasCandidate\?\s+@relation\(fields: \[aliasCandidateId, definitionId\], references: \[id, definitionId\]/,
    );
    expect(migration).toContain('business_definition_alias_candidate_definitionId_normalizedAlias_key');
    expect(migration).toContain('CREATE UNIQUE INDEX "business_definition_alias_candidate_id_definitionId_key"');
    expect(migration).toContain('FOREIGN KEY ("aliasCandidateId", "definitionId")');
    expect(migration).not.toContain(
      'FOREIGN KEY ("aliasCandidateId") REFERENCES "business_definition_alias_candidate"',
    );
    expect(schema).toMatch(
      /draftVersion\s+BusinessDefinitionVersion\?\s+@relation\("BusinessDefinitionAliasCandidateDraftVersion", fields: \[draftVersionId, definitionId\], references: \[id, definitionId\]/,
    );
    expect(schema).toMatch(
      /publishedVersion\s+BusinessDefinitionVersion\?\s+@relation\("BusinessDefinitionAliasCandidatePublishedVersion", fields: \[publishedVersionId, definitionId\], references: \[id, definitionId\]/,
    );
    expect(migration).toContain('FOREIGN KEY ("draftVersionId", "definitionId")');
    expect(migration).toContain('FOREIGN KEY ("publishedVersionId", "definitionId")');
  });

  it('redacts person entity mentions without hashes and removes names from regression evidence and eval cases', async () => {
    const prisma = createPrisma();
    const service = new BusinessSemanticEvidenceService(prisma as never);

    await service.captureModelSuccess({
      runId: 77,
      storeId: 2,
      userId: 9,
      question: '比较张三和李四的消费',
      intent: {
        entities: [
          {
            entityType: 'customer',
            mention: '张三',
            source: 'user',
            confidence: 0.99,
            definitionRef: { ...entityRef, definitionKey: 'customer' },
          },
          {
            entityType: 'receptionist',
            mention: '李四',
            source: 'user',
            confidence: 0.98,
            definitionRef: { ...entityRef, definitionKey: 'customer' },
          },
        ],
        metrics: [metricRef],
        dimensions: [],
      },
    } as never);

    const evidenceCalls = prisma.businessSemanticEvidence.upsert.mock.calls;
    const creates = evidenceCalls.map((call) => call[0].create);
    const personMentions = creates.filter((item) => item.evidenceKind === 'entity_mention');
    const regressions = creates.filter((item) => item.evidenceKind === 'regression_question');

    expect(personMentions).toHaveLength(2);
    for (const mention of personMentions) {
      expect(mention).toMatchObject({
        redactedText: '[PERSON_ENTITY]',
        normalizedValue: 'person_entity',
        status: 'grounding_only',
        metadata: { redaction: 'person_entity' },
      });
    }
    const personFingerprints = evidenceCalls
      .filter((call) => call[0].create.evidenceKind === 'entity_mention')
      .map((call) => call[0].where.idempotencyFingerprint);
    expect(new Set(personFingerprints).size).toBe(1);
    expect(regressions).toHaveLength(2);
    expect(regressions.every((item) => item.redactedText === '比较[PERSON_ENTITY]和[PERSON_ENTITY]的消费')).toBe(true);

    const persistedPayload = JSON.stringify({ evidenceCalls, evalCalls: prisma.brainEvalCase.upsert.mock.calls });
    expect(persistedPayload).not.toMatch(/张三|李四/);
    expect(persistedPayload).not.toContain('mentionHash');
    expect(personMentions.map((mention) => mention.metadata)).not.toContainEqual(
      expect.objectContaining({ mentionHash: expect.anything() }),
    );
    expect(prisma.brainEvalCase.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          input: { message: '比较[PERSON_ENTITY]和[PERSON_ENTITY]的消费', source: 'business_semantic_evidence' },
        }),
      }),
    );
  });

  it('loads all referenced definitions in one batch without definition N+1 queries', async () => {
    const prisma = createPrisma();
    const service = new BusinessSemanticEvidenceService(prisma as never);
    const dimensionRef = { ...metricRef, definitionType: 'dimension', definitionKey: 'store' };

    await service.captureModelSuccess({
      runId: 77,
      storeId: 2,
      userId: 9,
      question: '查看项目实收按门店分组',
      intent: {
        entities: [
          { entityType: 'project', mention: '项目', source: 'user', confidence: 0.99, definitionRef: entityRef },
        ],
        metrics: [metricRef],
        dimensions: [dimensionRef],
      },
    } as never);

    expect(prisma.businessDefinition.findMany).toHaveBeenCalledTimes(1);
    expect(prisma.businessDefinition.findUnique).not.toHaveBeenCalled();
  });

  it('resolves a historical published definition version without drifting to the current version', async () => {
    const prisma = createPrisma();
    const historical = definitionFor('metric', 'paid_amount');
    historical.currentPublishedVersionId = 42;
    historical.currentPublishedVersion = {
      ...historical.currentPublishedVersion,
      id: 42,
      definitionId: 12,
      version: 6,
      fingerprint: 'e'.repeat(64),
      sourceFingerprint: 'f'.repeat(64),
    };
    historical.versions = [...historical.versions, historical.currentPublishedVersion];
    const historicalVersion = historical.versions.find((version) => version.version === 5)!;
    prisma.businessDefinitionVersion.findFirst.mockResolvedValue({
      ...historicalVersion,
      definition: historical,
    });
    const service = new BusinessSemanticEvidenceService(prisma as never);

    await service.captureStructuredCorrection({
      sourceType: 'feedback_correction',
      runId: 77,
      storeId: 2,
      userId: 9,
      definitionType: 'metric',
      definitionKey: 'paid_amount',
      alias: '到账金额',
      question: '查一下到账金额',
      confidence: 0.99,
      definitionVersion: 5,
      definitionFingerprint: 'c'.repeat(64),
      sourceFingerprint: 'd'.repeat(64),
    } as never);

    expect(prisma.businessSemanticEvidence.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ create: expect.objectContaining({ definitionVersionId: 32, definitionVersion: 5 }) }),
    );
    expect(prisma.businessDefinitionVersion.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          version: 5,
          fingerprint: 'c'.repeat(64),
          sourceFingerprint: 'd'.repeat(64),
          lifecycleStatus: 'published',
          definition: { kind: 'metric', definitionKey: 'paid_amount' },
        }),
      }),
    );
    const evidenceFingerprint = prisma.businessSemanticEvidence.upsert.mock.calls[0][0].create.idempotencyFingerprint;
    expect(prisma.brainEvalCase.upsert).toHaveBeenCalledWith({
      where: { caseKey: `semantic-evidence:${evidenceFingerprint}` },
      create: expect.objectContaining({
        caseKey: `semantic-evidence:${evidenceFingerprint}`,
        scenario: 'runtime_semantic_alias_regression',
        input: { message: '到账金额', source: 'business_semantic_alias_evidence' },
        expected: {
          definitionType: 'metric',
          definitionKey: 'paid_amount',
          definitionVersion: 5,
          definitionFingerprint: 'c'.repeat(64),
          sourceFingerprint: 'd'.repeat(64),
        },
        assertionType: 'business_definition_ref',
        enabled: false,
        businessDefinitionVersionId: 32,
        definitionFingerprint: 'c'.repeat(64),
      }),
      update: expect.objectContaining({
        input: { message: '到账金额', source: 'business_semantic_alias_evidence' },
        expected: expect.objectContaining({
          definitionVersion: 5,
          sourceFingerprint: 'd'.repeat(64),
        }),
        enabled: false,
      }),
    });
  });

  it('uses the redacted alias as the structured correction eval input', async () => {
    const prisma = createPrisma();
    const service = new BusinessSemanticEvidenceService(prisma as never);

    await service.captureStructuredCorrection({
      sourceType: 'feedback_correction',
      runId: 77,
      storeId: 2,
      userId: 9,
      definitionType: 'metric',
      definitionKey: 'paid_amount',
      alias: '13800138000',
      confidence: 0.99,
      definitionVersion: 5,
      definitionFingerprint: 'c'.repeat(64),
      sourceFingerprint: 'd'.repeat(64),
    });

    expect(prisma.brainEvalCase.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ input: { message: '[PHONE]', source: 'business_semantic_alias_evidence' } }),
        update: expect.objectContaining({ input: { message: '[PHONE]', source: 'business_semantic_alias_evidence' } }),
      }),
    );
    expect(JSON.stringify(prisma.brainEvalCase.upsert.mock.calls)).not.toContain('13800138000');
  });

  it('rejects a historical version whose definition id does not match the loaded definition', async () => {
    const prisma = createPrisma();
    const definition = definitionFor('metric', 'paid_amount');
    prisma.businessDefinitionVersion.findFirst.mockResolvedValue({
      ...definition.currentPublishedVersion,
      definitionId: 999,
      definition,
    });
    const service = new BusinessSemanticEvidenceService(prisma as never);

    await expect(
      service.captureStructuredCorrection({
        sourceType: 'feedback_correction',
        runId: 77,
        storeId: 2,
        userId: 9,
        definitionType: 'metric',
        definitionKey: 'paid_amount',
        alias: '到账金额',
        question: '查一下到账金额',
        confidence: 0.99,
        definitionVersion: 5,
        definitionFingerprint: 'c'.repeat(64),
        sourceFingerprint: 'd'.repeat(64),
      }),
    ).rejects.toThrow('business_semantic_definition_ref_stale');

    expect(prisma.businessSemanticEvidence.upsert).not.toHaveBeenCalled();
  });

  it('reuses a provided transaction client without opening a nested transaction', async () => {
    const prisma = createPrisma();
    const service = new BusinessSemanticEvidenceService(prisma as never);

    await service.captureModelSuccessWithClient(
      {
        runId: 77,
        storeId: 2,
        userId: 9,
        question: '本月实收',
        intent: { entities: [], metrics: [metricRef], dimensions: [] },
      },
      prisma.tx as never,
    );

    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(prisma.tx.businessSemanticEvidence.upsert).toHaveBeenCalledTimes(1);
    expect(prisma.tx.brainEvalCase.upsert).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['entities', 21, 'business_semantic_entities_limit_exceeded'],
    ['metrics', 9, 'business_semantic_metrics_limit_exceeded'],
    ['dimensions', 9, 'business_semantic_dimensions_limit_exceeded'],
  ] as const)('rejects excessive %s before persistence', async (field, count, code) => {
    const prisma = createPrisma();
    const service = new BusinessSemanticEvidenceService(prisma as never);
    const entities = Array.from({ length: field === 'entities' ? count : 0 }, (_, index) => ({
      entityType: 'customer',
      mention: `客户${index}`,
      source: 'user',
      confidence: 0.9,
    }));
    const metrics = Array.from({ length: field === 'metrics' ? count : 0 }, (_, index) => ({
      ...metricRef,
      definitionKey: `metric_${index}`,
    }));
    const dimensions = Array.from({ length: field === 'dimensions' ? count : 0 }, (_, index) => ({
      ...metricRef,
      definitionType: 'dimension',
      definitionKey: `dimension_${index}`,
    }));

    await expect(
      service.captureModelSuccess({
        runId: 77,
        storeId: 2,
        userId: 9,
        question: '测试上限',
        intent: { entities, metrics, dimensions },
      } as never),
    ).rejects.toThrow(code);
    expect(prisma.businessSemanticEvidence.upsert).not.toHaveBeenCalled();
  });

  it('rejects more than 32 total entity, metric and dimension inputs', async () => {
    const prisma = createPrisma();
    const service = new BusinessSemanticEvidenceService(prisma as never);
    await expect(
      service.captureModelSuccess({
        runId: 77,
        storeId: 2,
        userId: 9,
        question: '测试总引用上限',
        intent: {
          entities: Array.from({ length: 20 }, (_, index) => ({
            entityType: 'customer',
            mention: `客户${index}`,
            source: 'user',
            confidence: 0.9,
          })),
          metrics: Array.from({ length: 8 }, (_, index) => ({ ...metricRef, definitionKey: `metric_${index}` })),
          dimensions: Array.from({ length: 5 }, (_, index) => ({
            ...metricRef,
            definitionType: 'dimension',
            definitionKey: `dimension_${index}`,
          })),
        },
      } as never),
    ).rejects.toThrow('business_semantic_total_refs_limit_exceeded');
  });

  it('rolls back all model evidence when eval case persistence fails', async () => {
    const stagedEvidence: unknown[] = [];
    const prisma = createPrisma();
    prisma.businessSemanticEvidence.upsert.mockImplementation(({ create }) => {
      stagedEvidence.push(create);
      return Promise.resolve({ id: stagedEvidence.length, ...create });
    });
    prisma.brainEvalCase.upsert.mockRejectedValue(new Error('eval insert failed'));
    prisma.$transaction.mockImplementation(async (operation) => {
      const checkpoint = stagedEvidence.length;
      try {
        return await operation(prisma.tx);
      } catch (error) {
        stagedEvidence.splice(checkpoint);
        throw error;
      }
    });
    const service = new BusinessSemanticEvidenceService(prisma as never);

    await expect(
      service.captureModelSuccess({
        runId: 77,
        storeId: 2,
        userId: 9,
        question: '本月实收',
        intent: { entities: [], metrics: [metricRef], dimensions: [] },
      }),
    ).rejects.toThrow('eval insert failed');

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(stagedEvidence).toEqual([]);
  });

  it('uses Prisma upsert so repeated capture cannot create a second evidence occurrence', async () => {
    const prisma = createPrisma();
    const service = new BusinessSemanticEvidenceService(prisma as never);
    const input = {
      runId: 77,
      storeId: 2,
      userId: 9,
      question: '本月实收',
      intent: { entities: [], metrics: [metricRef], dimensions: [] },
      corrections: [],
    } as never;

    await service.captureModelSuccess(input);
    await service.captureModelSuccess(input);

    const fingerprints = prisma.businessSemanticEvidence.upsert.mock.calls.map(
      (call) => call[0].where.idempotencyFingerprint,
    );
    expect(new Set(fingerprints).size).toBe(1);
  });
});
