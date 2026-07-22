import { PrismaClient } from '@prisma/client';
import type { Prisma } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Pool } from 'pg';
import { BusinessSemanticEvidenceWorkerService } from './business-semantic-evidence-worker.service.js';

const SCHEMA_PREFIX = 'bse_it_';
const testDatabaseUrl = process.env.TEST_DATABASE_URL?.trim();
const shouldRunDatabaseTests = process.env.RUN_BUSINESS_SEMANTIC_DB_TESTS === 'true' && Boolean(testDatabaseUrl);
const describePostgres = shouldRunDatabaseTests ? describe : describe.skip;

describePostgres('BusinessSemanticEvidence PostgreSQL isolation', () => {
  let adminPool: Pool | undefined;
  let prisma: PrismaClient | undefined;
  let secondPrisma: PrismaClient | undefined;
  let schemaName = '';

  beforeAll(async () => {
    assertSafeTestDatabaseUrl(testDatabaseUrl!);
    schemaName = `${SCHEMA_PREFIX}${process.pid}_${Date.now()}_${randomBytes(4).toString('hex')}`;
    assertSafeSchemaName(schemaName);
    adminPool = new Pool({ connectionString: testDatabaseUrl, max: 1 });

    try {
      await adminPool.query(`CREATE SCHEMA ${quoteIdentifier(schemaName)}`);
      const isolatedDatabaseUrl = createIsolatedDatabaseUrl(testDatabaseUrl!, schemaName);
      const setupPool = new Pool({ connectionString: isolatedDatabaseUrl, max: 1 });
      try {
        const client = await setupPool.connect();
        try {
          await client.query(`SET search_path TO ${quoteIdentifier(schemaName)}`);
          const currentSchema = await client.query<{ current_schema: string }>('SELECT current_schema()');
          if (currentSchema.rows[0]?.current_schema !== schemaName) {
            throw new Error('business_semantic_db_test_search_path_mismatch');
          }
          for (const statement of prerequisiteSchemaStatements) {
            await client.query(statement);
          }
          const migrationSql = readFileSync(
            resolve(process.cwd(), 'prisma/migrations/20260714120000_business_semantic_evidence_pool/migration.sql'),
            'utf8',
          );
          await client.query(migrationSql);
          await client.query('INSERT INTO "business_definition" ("id") VALUES (11), (12)');
          await client.query(
            'INSERT INTO "business_definition_version" ("id", "definitionId") VALUES (31, 11), (32, 12)',
          );
          await client.query('INSERT INTO "brain_run" ("id") VALUES (77)');
        } finally {
          client.release();
        }
      } finally {
        await setupPool.end();
      }

      const adapter = new PrismaPg(isolatedDatabaseUrl, { schema: schemaName });
      prisma = new PrismaClient({ adapter });
      await prisma.$connect();
      secondPrisma = new PrismaClient({ adapter: new PrismaPg(isolatedDatabaseUrl, { schema: schemaName }) });
      await secondPrisma.$connect();
    } catch (error) {
      await cleanupIsolatedSchema();
      throw error;
    }
  });

  afterAll(async () => {
    await cleanupIsolatedSchema();
  });

  it('rejects a definition version paired with a different definition id', async () => {
    const fingerprint = '1'.repeat(64);

    await expect(
      database().businessSemanticEvidence.create({
        data: evidenceData(fingerprint, 12, 31),
      }),
    ).rejects.toMatchObject({ code: 'P2003' });

    expect(await database().businessSemanticEvidence.count({ where: { idempotencyFingerprint: fingerprint } })).toBe(0);
  });

  it('keeps one row when concurrent Prisma upserts use the same idempotency fingerprint', async () => {
    const fingerprint = '2'.repeat(64);
    const upsert = () =>
      database().businessSemanticEvidence.upsert({
        where: { idempotencyFingerprint: fingerprint },
        create: evidenceData(fingerprint),
        update: { lastSeenAt: new Date() },
      });

    const [first, second] = await Promise.all([upsert(), upsert()]);

    expect(first.id).toBe(second.id);
    expect(await database().businessSemanticEvidence.count({ where: { idempotencyFingerprint: fingerprint } })).toBe(1);
  });

  it('rolls back Prisma evidence upsert when eval case persistence fails in the same interactive transaction', async () => {
    const fingerprint = '3'.repeat(64);

    await expect(
      database().$transaction(async (tx) => {
        await tx.businessSemanticEvidence.upsert({
          where: { idempotencyFingerprint: fingerprint },
          create: evidenceData(fingerprint),
          update: { lastSeenAt: new Date() },
        });
        await tx.brainEvalCase.create({
          data: {
            caseKey: 'rollback-case',
            scenario: 'runtime_semantic_regression',
            input: { message: 'safe question' },
            expected: { definitionType: 'metric', definitionKey: 'paid_amount' },
            assertionType: 'business_definition_ref',
            enabled: false,
            businessDefinitionVersionId: 31,
            definitionFingerprint: 'a'.repeat(64),
            generatedByProjection: false,
          },
        });
      }),
    ).rejects.toThrow();

    expect(await database().businessSemanticEvidence.count({ where: { idempotencyFingerprint: fingerprint } })).toBe(0);
    expect(await database().brainEvalCase.count({ where: { caseKey: 'rollback-case' } })).toBe(0);
  });

  it('keeps one candidate and exact statistics when two Prisma clients cluster the same pooled aliases', async () => {
    const aliases = [
      aliasEvidenceData('4'.repeat(64), { userId: 9, confidence: 0.95 }),
      aliasEvidenceData('5'.repeat(64), {
        sourceType: 'conversation_correction',
        userId: 9,
        confidence: 0.97,
      }),
      aliasEvidenceData('6'.repeat(64), { userId: 10, confidence: 0.99 }),
    ];
    await database().businessSemanticEvidence.createMany({ data: aliases });
    const firstWorker = new BusinessSemanticEvidenceWorkerService(database() as never);
    const secondWorker = new BusinessSemanticEvidenceWorkerService(secondDatabase() as never);

    await Promise.all([firstWorker.clusterEvidence(500), secondWorker.clusterEvidence(500)]);

    const candidates = await database().businessDefinitionAliasCandidate.findMany({
      where: { definitionId: 11, normalizedAlias: '到账金额' },
    });
    expect(candidates).toHaveLength(1);
    expect(candidates[0]).toMatchObject({
      occurrenceCount: 3,
      distinctUserCount: 2,
      averageConfidence: 0.97,
      explicitCorrectionCount: 3,
      maxExplicitConfidence: 0.99,
    });
    const clustered = await database().businessSemanticEvidence.findMany({
      where: { idempotencyFingerprint: { in: aliases.map((item) => item.idempotencyFingerprint) } },
    });
    expect(clustered).toHaveLength(3);
    expect(new Set(clustered.map((item) => item.aliasCandidateId))).toEqual(new Set([candidates[0]!.id]));
    expect(clustered.every((item) => item.status === 'clustered')).toBe(true);
  });

  it('rejects linking evidence from one definition to another definition candidate', async () => {
    const candidate = await database().businessDefinitionAliasCandidate.create({
      data: {
        definitionId: 11,
        versionId: 31,
        definitionType: 'metric',
        definitionKey: 'paid_amount',
        alias: '跨定义别名',
        normalizedAlias: '跨定义别名',
      },
    });

    await expect(
      database().businessSemanticEvidence.create({
        data: {
          ...aliasEvidenceData('7'.repeat(64), {
            definitionId: 12,
            definitionVersionId: 32,
            definitionKey: 'refund_amount',
          }),
          aliasCandidateId: candidate.id,
        },
      }),
    ).rejects.toMatchObject({ code: 'P2003' });
  });

  it('atomically claims one pending candidate across two worker instances', async () => {
    const candidate = await database().businessDefinitionAliasCandidate.create({
      data: {
        definitionId: 11,
        versionId: 31,
        definitionType: 'metric',
        definitionKey: 'paid_amount',
        alias: '并发认领别名',
        normalizedAlias: '并发认领别名',
      },
    });
    const firstWorker = new BusinessSemanticEvidenceWorkerService(database() as never);
    const secondWorker = new BusinessSemanticEvidenceWorkerService(secondDatabase() as never);
    const firstHandler = jest.fn(async () => ({ claimed: true, status: 'handled' }));
    const secondHandler = jest.fn(async () => ({ claimed: true, status: 'handled' }));
    (firstWorker as any).processClaimedCandidate = firstHandler;
    (secondWorker as any).processClaimedCandidate = secondHandler;
    const now = new Date('2026-07-14T12:00:00.000Z');

    const results = await Promise.all([
      firstWorker.processCandidate(candidate.id, 'postgres-worker-a', now),
      secondWorker.processCandidate(candidate.id, 'postgres-worker-b', now),
    ]);

    expect(results.filter((item) => item.claimed)).toHaveLength(1);
    expect(firstHandler.mock.calls.length + secondHandler.mock.calls.length).toBe(1);
    const stored = await database().businessDefinitionAliasCandidate.findUniqueOrThrow({
      where: { id: candidate.id },
    });
    expect(stored.status).toBe('pending');
    expect(['postgres-worker-a', 'postgres-worker-b']).toContain(stored.leaseOwner);
    expect(stored.leaseExpiresAt?.getTime()).toBeGreaterThan(now.getTime());
  });

  it.each(['draftVersionId', 'publishedVersionId'] as const)(
    'rejects a cross-definition %s candidate version link',
    async (field) => {
      const candidate = await database().businessDefinitionAliasCandidate.create({
        data: {
          definitionId: 11,
          versionId: 31,
          definitionType: 'metric',
          definitionKey: 'paid_amount',
          alias: `跨定义${field}`,
          normalizedAlias: `跨定义${field}`,
        },
      });

      await expect(
        database().businessDefinitionAliasCandidate.update({
          where: { id: candidate.id },
          data: { [field]: 32 },
        }),
      ).rejects.toMatchObject({ code: 'P2003' });
    },
  );

  function database(): PrismaClient {
    if (!prisma) throw new Error('business_semantic_db_test_client_not_initialized');
    return prisma;
  }

  function secondDatabase(): PrismaClient {
    if (!secondPrisma) throw new Error('business_semantic_db_test_second_client_not_initialized');
    return secondPrisma;
  }

  async function cleanupIsolatedSchema() {
    if (secondPrisma) {
      await secondPrisma.$disconnect();
      secondPrisma = undefined;
    }
    if (prisma) {
      await prisma.$disconnect();
      prisma = undefined;
    }
    if (!adminPool) return;
    try {
      if (schemaName) {
        assertSafeSchemaName(schemaName);
        await adminPool.query(`DROP SCHEMA ${quoteIdentifier(schemaName)} CASCADE`);
      }
    } finally {
      await adminPool.end();
      adminPool = undefined;
    }
  }
});

function evidenceData(
  idempotencyFingerprint: string,
  definitionId = 11,
  definitionVersionId = 31,
): Prisma.BusinessSemanticEvidenceUncheckedCreateInput {
  const now = new Date();
  return {
    sourceType: 'model_success',
    evidenceKind: 'regression_question',
    runId: 77,
    storeId: 2,
    userId: 9,
    definitionId,
    definitionVersionId,
    definitionType: 'metric',
    definitionKey: 'paid_amount',
    definitionVersion: 5,
    definitionFingerprint: 'a'.repeat(64),
    definitionSourceFingerprint: 'b'.repeat(64),
    redactedText: 'safe question',
    normalizedValue: 'safequestion',
    confidence: 1,
    status: 'pooled',
    idempotencyFingerprint,
    firstSeenAt: now,
    lastSeenAt: now,
    metadata: { integrationTest: true },
  };
}

function aliasEvidenceData(
  idempotencyFingerprint: string,
  overrides: Partial<Prisma.BusinessSemanticEvidenceUncheckedCreateInput> = {},
): Prisma.BusinessSemanticEvidenceUncheckedCreateInput {
  return {
    ...evidenceData(idempotencyFingerprint),
    sourceType: 'feedback_correction',
    evidenceKind: 'alias',
    redactedText: '到账金额',
    normalizedValue: '到账金额',
    confidence: 0.99,
    metadata: { explicitCorrection: true, integrationTest: true },
    ...overrides,
  };
}

function assertSafeTestDatabaseUrl(value: string) {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error('business_semantic_db_test_url_invalid');
  }
  if (parsed.protocol !== 'postgres:' && parsed.protocol !== 'postgresql:') {
    throw new Error('business_semantic_db_test_url_must_be_postgres');
  }
  const hostname = parsed.hostname.toLowerCase();
  const databaseName = decodeURIComponent(parsed.pathname.replace(/^\/+/, '')).toLowerCase();
  const localTestDatabase = (hostname === 'localhost' || hostname === '127.0.0.1') && databaseName.includes('test');
  if (!localTestDatabase && process.env.ALLOW_ISOLATED_DB_TEST !== 'true') {
    throw new Error('business_semantic_db_test_target_not_authorized');
  }
}

function createIsolatedDatabaseUrl(value: string, schemaName: string): string {
  assertSafeSchemaName(schemaName);
  const parsed = new URL(value);
  parsed.searchParams.set('options', `-csearch_path=${schemaName}`);
  return parsed.toString();
}

function assertSafeSchemaName(value: string) {
  if (!value.startsWith(SCHEMA_PREFIX) || !/^bse_it_[a-z0-9_]+$/.test(value)) {
    throw new Error('business_semantic_db_test_schema_name_invalid');
  }
}

function quoteIdentifier(value: string): string {
  assertSafeSchemaName(value);
  return `"${value}"`;
}

const prerequisiteSchemaStatements = [
  `CREATE TABLE "business_definition" (
    "id" INTEGER NOT NULL,
    CONSTRAINT "business_definition_pkey" PRIMARY KEY ("id")
  )`,
  `CREATE TABLE "business_definition_version" (
    "id" INTEGER NOT NULL,
    "definitionId" INTEGER NOT NULL,
    CONSTRAINT "business_definition_version_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "business_definition_version_definitionId_fkey"
      FOREIGN KEY ("definitionId") REFERENCES "business_definition"("id") ON DELETE CASCADE
  )`,
  `CREATE TABLE "brain_run" (
    "id" INTEGER NOT NULL,
    CONSTRAINT "brain_run_pkey" PRIMARY KEY ("id")
  )`,
  `CREATE TABLE "brain_eval_case" (
    "id" SERIAL NOT NULL,
    "caseKey" TEXT NOT NULL,
    "roleKey" TEXT,
    "scenario" TEXT NOT NULL,
    "input" JSONB NOT NULL,
    "expected" JSONB NOT NULL,
    "assertionType" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "businessDefinitionVersionId" INTEGER,
    "definitionFingerprint" TEXT,
    "generatedByProjection" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "requiredPayload" JSONB NOT NULL,
    CONSTRAINT "brain_eval_case_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "brain_eval_case_caseKey_key" UNIQUE ("caseKey")
  )`,
] as const;
