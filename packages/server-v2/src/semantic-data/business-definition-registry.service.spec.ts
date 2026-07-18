import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import {
  BusinessDefinitionRegistryService,
  canonicalizeBusinessDefinition,
  createBusinessDefinitionFingerprint,
} from './business-definition-registry.service.js';
import { BusinessDefinitionProjectionCompilerService } from './business-definition-projection-compiler.service.js';

describe('BusinessDefinitionRegistryService', () => {
  it('creates the same sha256 fingerprint for canonically equivalent payloads', () => {
    const left = createBusinessDefinitionFingerprint(baseImmutableDefinition());
    const right = createBusinessDefinitionFingerprint({
      ...baseImmutableDefinition(),
      payload: {
        formula: { subtract: ['payment.amount', 'refund.amount'] },
        sourceModels: ['Payment', 'RefundRecord'],
        aggregation: 'sum',
      },
      storeScope: { mode: 'current_store' },
    });

    expect(left).toMatch(/^[a-f0-9]{64}$/);
    expect(right).toBe(left);
    expect(canonicalizeBusinessDefinition({ b: 1, a: { d: 2, c: 1 } })).toBe('{"a":{"c":1,"d":2},"b":1}');
  });

  it('computes source and evidence fingerprints on the server and returns inserted evidence', async () => {
    const definition = baseDefinitionRecord();
    const createdVersion = { id: 21, definitionId: 10, version: 2 };
    const hydratedVersion = makeVersion({ id: 21, version: 2, lifecycleStatus: 'draft', validationStatus: 'pending' });
    const tx = {
      businessDefinition: { upsert: jest.fn().mockResolvedValue(definition) },
      businessDefinitionVersion: {
        aggregate: jest.fn().mockResolvedValue({ _max: { version: 1 } }),
        create: jest.fn().mockResolvedValue(createdVersion),
        findUnique: jest.fn().mockResolvedValue(hydratedVersion),
      },
      businessDefinitionEvidence: { createMany: jest.fn().mockResolvedValue({ count: 1 }) },
    };
    const prisma = createPrismaMock(tx);
    const service = createService(prisma);

    const result = await service.createDraft({
      ...baseDraftInput(),
      sourceFingerprint: 'forged-client-source',
      evidence: [{ ...baseEvidenceInput(), evidenceFingerprint: 'forged-client-evidence' }],
      createdBy: 7,
    } as any);

    expect(result).toEqual(hydratedVersion);
    expect(tx.businessDefinitionVersion.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          sourceFingerprint: expectedSourceFingerprint(),
          fingerprint: createBusinessDefinitionFingerprint(baseImmutableDefinition()),
        }),
      }),
    );
    expect(tx.businessDefinitionEvidence.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          evidenceFingerprint: expectedEvidenceFingerprint(),
          sourcePath: 'src/finance-metrics/finance-metrics.service.ts',
        }),
      ],
    });
    expect(tx.businessDefinitionVersion.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: createdVersion.id } }),
    );
    expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: 'Serializable',
      maxWait: 5_000,
      timeout: 30_000,
    });
  });

  it('rejects an evidence line range whose end precedes its start', async () => {
    const service = createService(createPrismaMock({}));

    await expect(
      service.createDraft({
        ...baseDraftInput(),
        evidence: [{ ...baseEvidenceInput(), lineStart: 20, lineEnd: 10 }],
        createdBy: 7,
      } as any),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('retries a createDraft serializable P2034 conflict', async () => {
    const tx = draftTransactionMock(1, 2);
    const prisma = createPrismaMock(tx);
    prisma.$transaction
      .mockRejectedValueOnce({ code: 'P2034' })
      .mockImplementationOnce(async (callback: any) => callback(tx));
    const service = createService(prisma);

    await expect(service.createDraft({ ...baseDraftInput(), createdBy: 7 } as any)).resolves.toEqual(
      expect.objectContaining({ version: 2 }),
    );
    expect(prisma.$transaction).toHaveBeenCalledTimes(2);
  });

  it('maps an exhausted third createDraft P2034 conflict to ConflictException', async () => {
    const prisma = createPrismaMock({});
    prisma.$transaction.mockRejectedValue({ code: 'P2034' });
    const service = createService(prisma);

    await expect(service.createDraft({ ...baseDraftInput(), createdBy: 7 } as any)).rejects.toMatchObject({
      constructor: ConflictException,
      message: 'business_definition_version_conflict',
    });
    expect(prisma.$transaction).toHaveBeenCalledTimes(3);
  });

  it('creates sequential versions under two genuinely concurrent draft requests', async () => {
    const prisma = createConcurrentDraftPrismaMock();
    const service = createService(prisma);

    const versions = await Promise.all([
      service.createDraft({ ...baseDraftInput(), createdBy: 7 } as any),
      service.createDraft({ ...baseDraftInput(), createdBy: 8 } as any),
    ]);

    expect(versions.map((version) => version.version).sort()).toEqual([1, 2]);
    expect(prisma.$transaction).toHaveBeenCalledTimes(3);
  });

  it('reports a duplicate version race as a conflict after non-retryable P2002', async () => {
    const tx = draftTransactionMock(1, 2);
    tx.businessDefinitionVersion.create.mockRejectedValue({ code: 'P2002' });
    const service = createService(createPrismaMock(tx));

    await expect(service.createDraft({ ...baseDraftInput(), createdBy: 7 } as any)).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('reuses an exact non-published draft by definition id and server fingerprint', async () => {
    const definition = baseDefinitionRecord();
    const existing = makeVersion({ id: 41, lifecycleStatus: 'candidate', definition });
    const prisma = createPrismaMock({
      businessDefinition: { findUnique: jest.fn().mockResolvedValue(definition) },
      businessDefinitionVersion: { findFirst: jest.fn().mockResolvedValue(existing) },
    });
    const service = createService(prisma);
    const createSpy = jest.spyOn(service, 'createDraft');

    await expect(service.createOrReuseDraft({ ...baseDraftInput(), createdBy: 7 } as any)).resolves.toEqual(existing);

    expect(createSpy).not.toHaveBeenCalled();
    expect(prisma.businessDefinitionVersion.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          definitionId: 10,
          fingerprint: createBusinessDefinitionFingerprint(baseImmutableDefinition()),
          lifecycleStatus: { not: 'published' },
        }),
      }),
    );
  });

  it('does not reuse a draft returned for another definition or canonical identity', async () => {
    const definition = baseDefinitionRecord();
    const wrong = makeVersion({
      id: 41,
      definitionId: 999,
      definition: baseDefinitionRecord({ id: 999, definitionKey: 'metric.other' }),
    });
    const prisma = createPrismaMock({
      businessDefinition: { findUnique: jest.fn().mockResolvedValue(definition) },
      businessDefinitionVersion: { findFirst: jest.fn().mockResolvedValue(wrong) },
    });
    const service = createService(prisma);

    await expect(service.createOrReuseDraft({ ...baseDraftInput(), createdBy: 7 } as any)).rejects.toThrow(
      'business_definition_reusable_draft_identity_mismatch',
    );
  });

  it('safely reloads the exact draft after a create P2002 conflict', async () => {
    const definition = baseDefinitionRecord();
    const existing = makeVersion({ id: 41, lifecycleStatus: 'candidate', definition });
    const findFirst = jest.fn().mockResolvedValueOnce(null).mockResolvedValueOnce(existing);
    const prisma = createPrismaMock({
      businessDefinition: { findUnique: jest.fn().mockResolvedValue(definition) },
      businessDefinitionVersion: { findFirst },
    });
    const service = createService(prisma);
    jest
      .spyOn(service, 'createDraft')
      .mockRejectedValueOnce(new ConflictException('business_definition_version_conflict'));

    await expect(service.createOrReuseDraft({ ...baseDraftInput(), createdBy: 7 } as any)).resolves.toEqual(existing);
    expect(findFirst).toHaveBeenCalledTimes(2);
  });

  it('ignores client validation claims and generates a passing canonical report', async () => {
    const version = makeVersion({ lifecycleStatus: 'draft', validationStatus: 'pending' });
    const prisma = createPrismaMock({
      businessDefinitionVersion: {
        findUnique: jest.fn().mockResolvedValue(version),
        update: jest.fn().mockImplementation(async ({ data }: any) => ({ ...version, ...data })),
      },
    });
    const verifier = passingVerifier();
    const service = createService(prisma, verifier);

    const result = await service.validateVersion(version.id, {
      passed: false,
      report: { passed: false, errors: ['client_decides'] },
      validatedBy: 8,
    } as never);

    expect(result.validationStatus).toBe('passed');
    expect(result.lifecycleStatus).toBe('validated');
    expect(result.validationReport).toEqual({
      validatorVersion: '1.0',
      passed: true,
      checks: expect.objectContaining({
        definitionFingerprint: true,
        evidenceFingerprints: true,
        sourceFingerprint: true,
        timezone: true,
        storeScope: true,
        canonicalQuery: true,
        fixtureSet: true,
        canonicalVerification: true,
      }),
      errors: [],
    });
    expect(verifier.verify).toHaveBeenCalledWith({
      version,
      canonicalQueryRef: version.canonicalQueryRef,
      fixtureSetKey: version.fixtureSetKey,
      timezone: version.timezone,
      storeScope: version.storeScope,
    });
  });

  it('rejects forged nonempty canonical query and fixture references', async () => {
    const version = makeVersion({ canonicalQueryRef: 'forged.query', fixtureSetKey: 'forged.fixture' });
    version.fingerprint = createBusinessDefinitionFingerprint(immutableRecordForTest(version));
    const update = jest.fn().mockImplementation(async ({ data }: any) => ({ ...version, ...data }));
    const verifier = failingVerifier('unknown_canonical_query_ref');
    const service = createService(
      createPrismaMock({ businessDefinitionVersion: { findUnique: jest.fn().mockResolvedValue(version), update } }),
      verifier,
    );

    const result = await service.validateVersion(version.id, { validatedBy: 8 } as any);

    expect(result.validationStatus).toBe('failed');
    expect((result.validationReport as any).errors).toContain('unknown_canonical_query_ref');
  });

  it.each([
    ['mismatch', failingVerifier('canonical_result_mismatch')],
    ['execution throw', { verify: jest.fn().mockRejectedValue(new Error('executor failed')) }],
  ])('rejects canonical verifier %s', async (_label, verifier) => {
    const version = makeVersion();
    const update = jest.fn().mockImplementation(async ({ data }: any) => ({ ...version, ...data }));
    const service = createService(
      createPrismaMock({ businessDefinitionVersion: { findUnique: jest.fn().mockResolvedValue(version), update } }),
      verifier,
    );

    const result = await service.validateVersion(version.id, { validatedBy: 8 } as any);

    expect(result.validationStatus).toBe('failed');
    expect((result.validationReport as any).checks.canonicalVerification).toBe(false);
  });

  it.each([
    [
      'tampered evidence fingerprint',
      { evidence: [{ ...baseEvidenceRecord(), evidenceFingerprint: '0'.repeat(64) }] },
      'evidence_fingerprint_mismatch',
    ],
    ['tampered source fingerprint', { sourceFingerprint: '0'.repeat(64) }, 'source_fingerprint_mismatch'],
    ['unsupported timezone', { timezone: 'Mars/Base' }, 'unsupported_timezone'],
    ['invalid store scope', { storeScope: { mode: 'explicit_store_ids', storeIds: [] } }, 'invalid_store_scope'],
    ['missing evidence', { evidence: [] }, 'evidence_required'],
  ])('records failed canonical validation for %s', async (_label, overrides, errorCode) => {
    const version = makeVersion(overrides);
    if ('timezone' in overrides || 'storeScope' in overrides) {
      version.fingerprint = createBusinessDefinitionFingerprint(immutableRecordForTest(version));
    }
    const update = jest.fn().mockImplementation(async ({ data }: any) => ({ ...version, ...data }));
    const service = createService(
      createPrismaMock({ businessDefinitionVersion: { findUnique: jest.fn().mockResolvedValue(version), update } }),
    );

    const result = await service.validateVersion(version.id, { validatedBy: 8 } as any);

    expect(result.validationStatus).toBe('failed');
    expect(result.lifecycleStatus).toBe('draft');
    expect((result.validationReport as any).passed).toBe(false);
    expect((result.validationReport as any).errors).toContain(errorCode);
  });

  it('does not publish a metric until server validation, canonical query and fixture gates pass', async () => {
    const version = makeVersion({ lifecycleStatus: 'draft', canonicalQueryRef: null });
    const service = createService(
      createPrismaMock({ businessDefinitionVersion: { findUnique: jest.fn().mockResolvedValue(version) } }),
    );

    await expect(service.publishVersion(version.id, { publishedBy: 9 })).rejects.toBeInstanceOf(ConflictException);
  });

  it('does not publish when canonical verification is unavailable or fails', async () => {
    const version = makeVersion({ lifecycleStatus: 'validated', validationStatus: 'passed' });
    const service = createService(
      createPrismaMock({ businessDefinitionVersion: { findUnique: jest.fn().mockResolvedValue(version) } }),
      failingVerifier('canonical_verifier_unavailable'),
    );

    await expect(service.publishVersion(version.id, { publishedBy: 9 })).rejects.toMatchObject({
      message: expect.stringContaining('canonical_verifier_unavailable'),
    });
  });

  it('retries a serializable publish conflict and uses expected-current CAS', async () => {
    const version = makeVersion({
      id: 22,
      version: 2,
      lifecycleStatus: 'validated',
      validationStatus: 'passed',
      definition: baseDefinitionRecord({
        currentPublishedVersionId: 21,
        currentPublishedVersion: { id: 21, version: 1 },
      }),
    });
    const published = { ...version, lifecycleStatus: 'published' };
    const tx = publishTransactionMock(version, published);
    const prisma = createPrismaMock(tx);
    prisma.$transaction
      .mockRejectedValueOnce({ code: 'P2034' })
      .mockImplementationOnce(async (callback: any) => callback(tx));
    const refresher = { refresh: jest.fn().mockResolvedValue(undefined) };
    const service = createService(prisma, passingVerifier(), refresher);

    await expect(
      service.publishVersion(version.id, { publishedBy: 9, expectedCurrentVersionId: 21 } as any),
    ).resolves.toEqual(published);
    expect(prisma.$transaction).toHaveBeenCalledTimes(2);
    expect(tx.businessDefinition.updateMany).toHaveBeenCalledWith({
      where: { id: version.definitionId, currentPublishedVersionId: 21 },
      data: { currentPublishedVersionId: version.id },
    });
    expect(refresher.refresh).toHaveBeenCalledTimes(1);
    expect(prisma.$transaction).toHaveBeenLastCalledWith(expect.any(Function), {
      isolationLevel: 'Serializable',
      maxWait: 5_000,
      timeout: 30_000,
    });
  });

  it('returns publish success even when catalog refresh leaves runtime stale', async () => {
    const version = makeVersion({
      id: 22,
      version: 2,
      lifecycleStatus: 'validated',
      validationStatus: 'passed',
      definition: baseDefinitionRecord({
        currentPublishedVersionId: 21,
        currentPublishedVersion: { id: 21, version: 1 },
      }),
    });
    const published = { ...version, lifecycleStatus: 'published' };
    const tx = publishTransactionMock(version, published);
    const refresher = { refresh: jest.fn().mockResolvedValue(undefined) };
    const service = createService(createPrismaMock(tx), passingVerifier(), refresher);

    await expect(
      service.publishVersion(version.id, { publishedBy: 9, expectedCurrentVersionId: 21 } as any),
    ).resolves.toEqual(published);
    expect(refresher.refresh).toHaveBeenCalledTimes(1);
  });

  it('reuses matching evaluation projections when publishing a validated candidate', async () => {
    const candidate = makeVersion({
      id: 22,
      version: 2,
      lifecycleStatus: 'validated',
      validationStatus: 'passed',
      definition: baseDefinitionRecord(),
    });
    const projections = new BusinessDefinitionProjectionCompilerService().compilePublishedVersion({
      ...candidate,
      lifecycleStatus: 'published',
    });
    const version = { ...candidate, projections };
    const published = { ...version, lifecycleStatus: 'published' };
    const tx = publishTransactionMock(version, published);
    const service = createService(createPrismaMock(tx), passingVerifier());

    await expect(service.publishVersion(version.id, { publishedBy: 9 })).resolves.toEqual(published);

    expect(tx.businessDefinitionProjection.createMany).not.toHaveBeenCalled();
  });

  it('fails closed when validated candidate projections differ from the publish projection', async () => {
    const version = makeVersion({
      id: 22,
      version: 2,
      lifecycleStatus: 'validated',
      validationStatus: 'passed',
      projections: [{
        targetType: 'metric_query_view',
        targetKey: 'metric.net_revenue@2',
        definitionKey: 'metric.net_revenue',
        definitionVersion: 2,
        definitionFingerprint: 'a'.repeat(64),
        sourceFingerprint: 'b'.repeat(64),
        payload: {},
        projectionFingerprint: 'c'.repeat(64),
        readOnly: true,
      }],
      definition: baseDefinitionRecord(),
    });
    const tx = publishTransactionMock(version, { ...version, lifecycleStatus: 'published' });
    const service = createService(createPrismaMock(tx), passingVerifier());

    await expect(service.publishVersion(version.id, { publishedBy: 9 })).rejects.toMatchObject({
      message: 'business_definition_projection_drift',
    });
    expect(tx.businessDefinitionVersion.update).not.toHaveBeenCalled();
  });

  it('maps an exhausted third publish P2034 conflict to ConflictException', async () => {
    const prisma = createPrismaMock({});
    prisma.$transaction.mockRejectedValue({ code: 'P2034' });
    const service = createService(prisma);

    const error = await service.publishVersion(22, { publishedBy: 9 }).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(ConflictException);
    expect((error as Error).message).toBe('business_definition_publish_conflict');
    expect(prisma.$transaction).toHaveBeenCalledTimes(3);
  });

  it('forbids publishing an older version over a newer current version', async () => {
    const version = makeVersion({
      id: 21,
      version: 1,
      lifecycleStatus: 'validated',
      validationStatus: 'passed',
      definition: baseDefinitionRecord({
        currentPublishedVersionId: 22,
        currentPublishedVersion: { id: 22, version: 2 },
      }),
    });
    const service = createService(
      createPrismaMock({ businessDefinitionVersion: { findUnique: jest.fn().mockResolvedValue(version) } }),
    );

    await expect(
      service.publishVersion(version.id, { publishedBy: 9, expectedCurrentVersionId: 22 } as any),
    ).rejects.toMatchObject({ message: 'business_definition_version_must_increase' });
  });

  it('forbids publish when expected-current does not match', async () => {
    const version = makeVersion({
      id: 23,
      version: 3,
      lifecycleStatus: 'validated',
      validationStatus: 'passed',
      definition: baseDefinitionRecord({
        currentPublishedVersionId: 22,
        currentPublishedVersion: { id: 22, version: 2 },
      }),
    });
    const service = createService(
      createPrismaMock({ businessDefinitionVersion: { findUnique: jest.fn().mockResolvedValue(version) } }),
    );

    await expect(
      service.publishVersion(version.id, { publishedBy: 9, expectedCurrentVersionId: 21 } as any),
    ).rejects.toMatchObject({ message: 'business_definition_current_version_changed' });
  });

  it('allows only one of two concurrent publishes against the same expected current version', async () => {
    const prisma = createConcurrentPublishPrismaMock();
    const service = createService(prisma);

    const results = await Promise.allSettled([
      service.publishVersion(22, { publishedBy: 9, expectedCurrentVersionId: 21 } as any),
      service.publishVersion(23, { publishedBy: 10, expectedCurrentVersionId: 21 } as any),
    ]);

    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((result) => result.status === 'rejected')).toHaveLength(1);
  });

  it('returns a deeply frozen published snapshot', async () => {
    const validationReport = { validatorVersion: '1.0', passed: true, checks: {}, errors: [] };
    const current = makeVersion({ lifecycleStatus: 'published', validationStatus: 'passed', validationReport });
    const service = createService(
      createPrismaMock({
        businessDefinition: {
          findMany: jest.fn().mockResolvedValue([{ ...current.definition, currentPublishedVersion: current }]),
        },
      }),
    );

    const snapshot = await service.getPublishedSnapshot({ domain: 'finance' });

    expect(Object.isFrozen(snapshot)).toBe(true);
    expect(snapshot.definitions[0]).toMatchObject({
      definitionId: current.definition.id,
      versionId: current.id,
      validationStatus: 'passed',
      validationReport,
    });
    expect(Object.isFrozen(snapshot.definitions[0].payload)).toBe(true);
    expect(() => ((snapshot.definitions[0].payload as any).formula = 'changed')).toThrow();
  });

  it('loads the published snapshot through parameterized SQL when a shared Prisma client lacks the delegate', async () => {
    const queryRaw = jest.fn()
      .mockResolvedValueOnce([{
        definitionId: 11,
        versionId: 21,
        definitionKey: 'metric.net_revenue',
        kind: 'metric',
        domain: 'finance',
        name: '净收入',
        ownerType: 'system',
        ownerId: null,
        version: 2,
        schemaVersion: '1.0',
        fingerprint: 'a'.repeat(64),
        sourceFingerprint: 'b'.repeat(64),
        validationStatus: 'passed',
        validationReport: { passed: true },
        payload: { aggregation: 'sum' },
        canonicalQueryRef: 'finance.net_revenue',
        fixtureSetKey: 'finance.net_revenue.v1',
        timezone: 'Asia/Shanghai',
        storeScope: { mode: 'current_store' },
      }])
      .mockResolvedValueOnce([{ id: 31, versionId: 21, sourceType: 'service' }])
      .mockResolvedValueOnce([{ id: 41, definitionVersionId: 21, targetType: 'metric' }]);
    const service = createService({ $queryRaw: queryRaw });

    const snapshot = await service.getPublishedSnapshot({ domain: 'finance' });

    expect(queryRaw).toHaveBeenCalledTimes(3);
    expect(snapshot.definitions).toEqual([expect.objectContaining({
      definitionId: 11,
      versionId: 21,
      definitionKey: 'metric.net_revenue',
      evidence: [expect.objectContaining({ id: 31, versionId: 21 })],
      projections: [expect.objectContaining({ id: 41, definitionVersionId: 21 })],
    })]);
    expect(Object.isFrozen(snapshot)).toBe(true);
  });

  it('throws not found for an unknown definition version', async () => {
    const service = createService(
      createPrismaMock({ businessDefinitionVersion: { findUnique: jest.fn().mockResolvedValue(null) } }),
    );

    await expect(service.validateVersion(999, { validatedBy: 8 } as any)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('adds database guards for published evidence and sha256 audit fields', () => {
    const migration = readFileSync(
      'prisma/migrations/20260712220000_ami_core_business_definition_registry/migration.sql',
      'utf8',
    );

    expect(migration).toContain('prevent_published_business_definition_evidence_mutation');
    expect(migration).toContain('BEFORE INSERT OR UPDATE OR DELETE ON "business_definition_evidence"');
    expect(migration).toContain('business_definition_version_fingerprint_check');
    expect(migration).toContain('business_definition_evidence_fingerprint_check');
    expect(migration).toContain('business_definition_version_source_fingerprint_check');
    expect(migration).toContain('OLD."versionId"');
    expect(migration).toContain('NEW."versionId"');
    expect(migration).toContain('business_definition_projection_fingerprint_check');
    expect(migration).toContain('business_definition_projection_definition_fingerprint_check');
    expect(migration).toContain('business_definition_projection_source_fingerprint_check');
    expect(migration).toContain('validate_business_definition_projection_lineage');
    expect(migration).toContain('BEFORE INSERT OR UPDATE ON "business_definition_projection"');
    expect(migration).toContain("TG_OP = 'INSERT' AND parent_lifecycle_status = 'published'");
    expect(migration).toContain('business definition projection payload lineage is invalid');
    expect(migration).toContain('BusinessDefinitionFixtureArtifact');
    expect(migration).toContain('business_definition_canonical_jsonb');
    expect(migration).toContain('40463f5eb396409acd68dfffa61c6665e65d7bebafa2fa1a0e91245a96dfc463');
    expect(migration).toContain('NEW."definitionKey" <> parent_definition_key');
    expect(migration).toContain('NEW."definitionVersion" <> parent_definition_version');
    expect(migration).toContain('computed_projection_fingerprint');
  });
});

function createService(prisma: any, verifier: any = passingVerifier(), refresher?: { refresh(): Promise<void> }) {
  return new (BusinessDefinitionRegistryService as any)(
    prisma,
    new BusinessDefinitionProjectionCompilerService(),
    verifier,
    refresher,
  );
}

function passingVerifier() {
  return {
    verify: jest.fn().mockResolvedValue({
      passed: true,
      code: 'canonical_verification_passed',
      comparedCases: 1,
      mismatches: [],
    }),
  };
}

function failingVerifier(code: string) {
  return {
    verify: jest.fn().mockResolvedValue({ passed: false, code, comparedCases: 1, mismatches: [code] }),
  };
}

function createPrismaMock(tx: any) {
  return { ...tx, $transaction: jest.fn(async (callback: any) => callback(tx)) } as any;
}

function baseDraftInput() {
  return {
    definitionKey: 'metric.net_revenue',
    kind: 'metric' as const,
    domain: 'finance',
    name: '净收入',
    ownerType: 'system',
    ownerId: 'finance-center',
    lifecycleStatus: 'draft' as const,
    schemaVersion: '1.0',
    payload: {
      aggregation: 'sum',
      sourceModels: ['Payment', 'RefundRecord'],
      formula: { subtract: ['payment.amount', 'refund.amount'] },
    },
    canonicalQueryRef: 'finance_metrics.net_revenue',
    fixtureSetKey: 'finance.net_revenue.v1',
    timezone: 'Asia/Shanghai',
    storeScope: { mode: 'current_store' },
    evidence: [baseEvidenceInput()],
  };
}

function baseEvidenceInput() {
  return {
    sourceType: 'service',
    sourcePath: 'src/finance-metrics/finance-metrics.service.ts',
    sourceSymbol: 'getNetRevenue',
    lineStart: 10,
    lineEnd: 20,
    evidenceKind: 'query_implementation',
    confidence: 1,
  };
}

function baseEvidenceRecord() {
  return {
    id: 31,
    versionId: 21,
    ...baseEvidenceInput(),
    conflictGroup: null,
    evidenceFingerprint: expectedEvidenceFingerprint(),
  };
}

function normalizedEvidenceForFingerprint() {
  return { ...baseEvidenceInput(), conflictGroup: null };
}

function expectedEvidenceFingerprint() {
  return sha256(normalizedEvidenceForFingerprint());
}

function expectedSourceFingerprint() {
  return sha256({ schemaVersion: '1.0', evidenceFingerprints: [expectedEvidenceFingerprint()] });
}

function baseImmutableDefinition() {
  const input = baseDraftInput();
  return {
    definitionKey: input.definitionKey,
    kind: input.kind,
    domain: input.domain,
    name: input.name,
    ownerType: input.ownerType,
    ownerId: input.ownerId,
    schemaVersion: input.schemaVersion,
    payload: input.payload,
    sourceFingerprint: expectedSourceFingerprint(),
    canonicalQueryRef: input.canonicalQueryRef,
    fixtureSetKey: input.fixtureSetKey,
    timezone: input.timezone,
    storeScope: input.storeScope,
  };
}

function baseDefinitionRecord(overrides: Record<string, unknown> = {}) {
  return {
    id: 10,
    definitionKey: 'metric.net_revenue',
    kind: 'metric',
    domain: 'finance',
    name: '净收入',
    ownerType: 'system',
    ownerId: 'finance-center',
    currentPublishedVersionId: null,
    currentPublishedVersion: null,
    ...overrides,
  };
}

function makeVersion(overrides: Record<string, any> = {}) {
  const definition = overrides.definition ?? baseDefinitionRecord();
  const immutable = baseImmutableDefinition();
  const version = {
    id: 21,
    definitionId: definition.id,
    version: 1,
    schemaVersion: immutable.schemaVersion,
    payload: immutable.payload,
    lifecycleStatus: 'draft',
    fingerprint: createBusinessDefinitionFingerprint(immutable),
    sourceFingerprint: immutable.sourceFingerprint,
    validationStatus: 'pending',
    validationReport: null,
    canonicalQueryRef: immutable.canonicalQueryRef,
    fixtureSetKey: immutable.fixtureSetKey,
    timezone: immutable.timezone,
    storeScope: immutable.storeScope,
    createdBy: 7,
    publishedBy: null,
    publishedAt: null,
    definition,
    evidence: [baseEvidenceRecord()],
    projections: [],
    ...overrides,
  };
  return version;
}

function immutableRecordForTest(version: any) {
  return {
    definitionKey: version.definition.definitionKey,
    kind: version.definition.kind,
    domain: version.definition.domain,
    name: version.definition.name,
    ownerType: version.definition.ownerType,
    ownerId: version.definition.ownerId,
    schemaVersion: version.schemaVersion,
    payload: version.payload,
    sourceFingerprint: version.sourceFingerprint,
    canonicalQueryRef: version.canonicalQueryRef,
    fixtureSetKey: version.fixtureSetKey,
    timezone: version.timezone,
    storeScope: version.storeScope,
  };
}

function draftTransactionMock(maxVersion: number, nextVersion: number) {
  const hydrated = makeVersion({ id: 20 + nextVersion, version: nextVersion, lifecycleStatus: 'draft' });
  return {
    businessDefinition: { upsert: jest.fn().mockResolvedValue(baseDefinitionRecord()) },
    businessDefinitionVersion: {
      aggregate: jest.fn().mockResolvedValue({ _max: { version: maxVersion } }),
      create: jest.fn().mockResolvedValue({ id: hydrated.id, definitionId: 10, version: nextVersion }),
      findUnique: jest.fn().mockResolvedValue(hydrated),
    },
    businessDefinitionEvidence: { createMany: jest.fn().mockResolvedValue({ count: 1 }) },
  };
}

function publishTransactionMock(version: any, published: any) {
  return {
    businessDefinitionVersion: {
      findUnique: jest.fn().mockResolvedValue(version),
      update: jest.fn().mockResolvedValue(published),
    },
    businessDefinitionProjection: {
      createMany: jest.fn().mockResolvedValue({ count: 5 }),
    },
    businessDefinition: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
  };
}

function createConcurrentDraftPrismaMock() {
  let committedVersion = 0;
  let firstRoundParticipants = 0;
  let releaseFirstRound!: () => void;
  const firstRound = new Promise<void>((resolve) => {
    releaseFirstRound = resolve;
  });
  return {
    $transaction: jest.fn(async (callback: any) => {
      let snapshot = committedVersion;
      let created: any;
      const tx = {
        businessDefinition: { upsert: jest.fn().mockResolvedValue(baseDefinitionRecord()) },
        businessDefinitionVersion: {
          aggregate: jest.fn(async () => {
            snapshot = committedVersion;
            if (snapshot === 0) {
              firstRoundParticipants += 1;
              if (firstRoundParticipants === 2) releaseFirstRound();
              await firstRound;
            }
            return { _max: { version: snapshot || null } };
          }),
          create: jest.fn(async ({ data }: any) => {
            created = makeVersion({ id: 20 + data.version, version: data.version, lifecycleStatus: 'draft' });
            return created;
          }),
          findUnique: jest.fn(async () => created),
        },
        businessDefinitionEvidence: { createMany: jest.fn().mockResolvedValue({ count: 1 }) },
      };
      const result = await callback(tx);
      if (snapshot !== committedVersion) throw { code: 'P2034' };
      committedVersion = result.version;
      return result;
    }),
  } as any;
}

function createConcurrentPublishPrismaMock() {
  let currentVersionId = 21;
  let participants = 0;
  let release!: () => void;
  const barrier = new Promise<void>((resolve) => {
    release = resolve;
  });
  return {
    $transaction: jest.fn(async (callback: any) => {
      const tx = {
        businessDefinitionVersion: {
          findUnique: jest.fn(async ({ where }: any) => {
            const snapshotCurrentVersionId = currentVersionId;
            participants += 1;
            if (participants === 2) release();
            await barrier;
            return makeVersion({
              id: where.id,
              version: where.id === 22 ? 2 : 3,
              lifecycleStatus: 'validated',
              validationStatus: 'passed',
              definition: baseDefinitionRecord({
                currentPublishedVersionId: snapshotCurrentVersionId,
                currentPublishedVersion: { id: snapshotCurrentVersionId, version: 1 },
              }),
            });
          }),
          update: jest.fn(async ({ where }: any) => makeVersion({ id: where.id, lifecycleStatus: 'published' })),
        },
        businessDefinitionProjection: {
          createMany: jest.fn().mockResolvedValue({ count: 5 }),
        },
        businessDefinition: {
          updateMany: jest.fn(async ({ where, data }: any) => {
            if (currentVersionId !== where.currentPublishedVersionId) return { count: 0 };
            currentVersionId = data.currentPublishedVersionId;
            return { count: 1 };
          }),
        },
      };
      return callback(tx);
    }),
  } as any;
}

function sha256(value: unknown) {
  return createHash('sha256').update(canonicalizeBusinessDefinition(value)).digest('hex');
}
