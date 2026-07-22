import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { createHash } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service.js';
import type {
  CreateBusinessDefinitionDraftInput,
  ListBusinessDefinitionsDto,
  PublishBusinessDefinitionVersionInput,
  ValidateBusinessDefinitionVersionInput,
} from './business-definition.dto.js';
import {
  BusinessDefinitionCanonicalVerificationPort,
  type BusinessDefinitionCanonicalVerificationResult,
} from './business-definition-canonical-verifier.service.js';
import {
  BusinessDefinitionProjectionCompilerService,
  canonicalizeBusinessDefinition,
  type BusinessDefinitionVersionRecord,
} from './business-definition-projection-compiler.service.js';
import {
  BUSINESS_METRIC_CATALOG_REFRESHER,
  type BusinessMetricCatalogRefresher,
} from './business-metric-catalog.types.js';

export { canonicalizeBusinessDefinition } from './business-definition-projection-compiler.service.js';

const VERSION_INCLUDE = {
  definition: {
    include: {
      currentPublishedVersion: { select: { id: true, version: true } },
    },
  },
  evidence: true,
  projections: true,
} as const;

const CANONICAL_VALIDATOR_VERSION = '1.0';
const SUPPORTED_TIMEZONES = new Set(['Asia/Shanghai', 'UTC']);
const SERIALIZABLE_TRANSACTION_OPTIONS = {
  isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
  maxWait: 5_000,
  timeout: 30_000,
} as const;

@Injectable()
export class BusinessDefinitionRegistryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly projectionCompiler: BusinessDefinitionProjectionCompilerService,
    @Optional() private readonly canonicalVerifier?: BusinessDefinitionCanonicalVerificationPort,
    @Optional()
    @Inject(BUSINESS_METRIC_CATALOG_REFRESHER)
    private readonly metricCatalogRefresher?: BusinessMetricCatalogRefresher,
  ) {}

  async list(query: ListBusinessDefinitionsDto = {}) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const where = {
      ...(query.kind ? { kind: query.kind } : {}),
      ...(query.domain ? { domain: query.domain } : {}),
      ...(query.status ? { status: query.status } : {}),
    };
    const [items, total] = await Promise.all([
      this.db().businessDefinition.findMany({
        where,
        include: { currentPublishedVersion: { include: { projections: true } } },
        orderBy: [{ domain: 'asc' }, { kind: 'asc' }, { definitionKey: 'asc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.db().businessDefinition.count({ where }),
    ]);
    return deepFreeze({ items: cloneJson(items), total, page, pageSize });
  }

  async get(kind: string, definitionKey: string) {
    const definition = await this.db().businessDefinition.findUnique({
      where: { kind_definitionKey: { kind: kind as never, definitionKey } },
      include: {
        versions: { include: VERSION_INCLUDE, orderBy: { version: 'desc' } },
        currentPublishedVersion: { include: VERSION_INCLUDE },
      },
    });
    if (!definition) throw new NotFoundException('business_definition_not_found');
    return deepFreeze(cloneJson(definition));
  }

  async createOrReuseDraft(input: CreateBusinessDefinitionDraftInput) {
    assertPositiveInteger(input.createdBy, 'createdBy');
    const normalizedEvidence = normalizeBusinessDefinitionEvidenceSet(input.evidence);
    const sourceFingerprint = createBusinessDefinitionSourceFingerprint(normalizedEvidence);
    assertTimezone(input.timezone ?? 'Asia/Shanghai');
    assertStoreScope(input.storeScope ?? { mode: 'current_store' });
    const expectedFingerprint = createBusinessDefinitionFingerprint(immutableInput(input, sourceFingerprint));
    const existing = await this.findReusableDraft(input, expectedFingerprint, sourceFingerprint);
    if (existing) return existing;
    try {
      return await this.createDraft(input);
    } catch (error) {
      if (!isVersionCreateConflict(error)) throw error;
      const raced = await this.findReusableDraft(input, expectedFingerprint, sourceFingerprint);
      if (raced) return raced;
      throw error;
    }
  }

  async createDraft(input: CreateBusinessDefinitionDraftInput) {
    assertPositiveInteger(input.createdBy, 'createdBy');
    const normalizedEvidence = normalizeBusinessDefinitionEvidenceSet(input.evidence);
    const sourceFingerprint = createBusinessDefinitionSourceFingerprint(normalizedEvidence);
    assertTimezone(input.timezone ?? 'Asia/Shanghai');
    assertStoreScope(input.storeScope ?? { mode: 'current_store' });

    for (let attempt = 1; attempt <= 3; attempt += 1) {
      try {
        return await this.db().$transaction(
          async (tx: any) => {
            const definition = await tx.businessDefinition.upsert({
              where: { kind_definitionKey: { kind: input.kind, definitionKey: input.definitionKey } },
              create: {
                definitionKey: input.definitionKey,
                kind: input.kind,
                domain: input.domain,
                name: input.name,
                ownerType: input.ownerType,
                ownerId: input.ownerId,
                status: 'active',
              },
              update: {},
            });
            this.assertDefinitionIdentity(definition, input);
            const aggregate = await tx.businessDefinitionVersion.aggregate({
              where: { definitionId: definition.id },
              _max: { version: true },
            });
            const versionNumber = (aggregate._max.version ?? 0) + 1;
            const created = await tx.businessDefinitionVersion.create({
              data: {
                definitionId: definition.id,
                version: versionNumber,
                schemaVersion: input.schemaVersion ?? '1.0',
                payload: input.payload as Prisma.InputJsonValue,
                lifecycleStatus: input.lifecycleStatus ?? 'draft',
                fingerprint: createBusinessDefinitionFingerprint(immutableInput(input, sourceFingerprint)),
                sourceFingerprint,
                validationStatus: input.candidateDiagnostics?.blockedReasons.length ? 'failed' : 'pending',
                validationReport: input.candidateDiagnostics?.blockedReasons.length
                  ? ({
                      source: input.candidateDiagnostics.source,
                      passed: false,
                      blockedReasons: [...new Set(input.candidateDiagnostics.blockedReasons)].sort(),
                    } as Prisma.InputJsonValue)
                  : undefined,
                canonicalQueryRef: input.canonicalQueryRef,
                fixtureSetKey: input.fixtureSetKey,
                timezone: input.timezone ?? 'Asia/Shanghai',
                storeScope: (input.storeScope ?? { mode: 'current_store' }) as Prisma.InputJsonValue,
                createdBy: input.createdBy,
              },
              include: VERSION_INCLUDE,
            });
            await tx.businessDefinitionEvidence.createMany({
              data: normalizedEvidence.map((evidence) => ({
                versionId: created.id,
                ...evidence,
                evidenceFingerprint: createBusinessDefinitionEvidenceFingerprint(evidence),
              })),
            });
            const hydrated = await tx.businessDefinitionVersion.findUnique({
              where: { id: created.id },
              include: VERSION_INCLUDE,
            });
            if (!hydrated) throw new ConflictException('business_definition_version_reload_failed');
            return hydrated;
          },
          SERIALIZABLE_TRANSACTION_OPTIONS,
        );
      } catch (error) {
        if (isPrismaCode(error, 'P2034') && attempt < 3) continue;
        if (isPrismaCode(error, 'P2034')) throw new ConflictException('business_definition_version_conflict');
        if (isPrismaCode(error, 'P2002')) throw new ConflictException('business_definition_version_conflict');
        throw error;
      }
    }
    throw new ConflictException('business_definition_version_conflict');
  }

  async validateVersion(versionId: number, input: ValidateBusinessDefinitionVersionInput) {
    assertPositiveInteger(versionId, 'versionId');
    assertPositiveInteger(input.validatedBy, 'validatedBy');
    const version = await this.db().businessDefinitionVersion.findUnique({
      where: { id: versionId },
      include: VERSION_INCLUDE,
    });
    if (!version) throw new NotFoundException('business_definition_version_not_found');
    if (version.lifecycleStatus === 'published') {
      throw new ConflictException('published_business_definition_is_immutable');
    }
    const report = await createCanonicalValidationReport(
      version as unknown as BusinessDefinitionVersionRecord,
      this.canonicalVerifier,
    );

    return this.db().businessDefinitionVersion.update({
      where: { id: versionId },
      data: {
        lifecycleStatus: report.passed ? 'validated' : 'draft',
        validationStatus: report.passed ? 'passed' : 'failed',
        validationReport: report as unknown as Prisma.InputJsonValue,
        validatedBy: input.validatedBy,
        validatedAt: new Date(),
      },
      include: VERSION_INCLUDE,
    });
  }

  async validateVersionForEvaluation(versionId: number, input: ValidateBusinessDefinitionVersionInput) {
    const existing = await this.db().businessDefinitionVersion.findUnique({
      where: { id: versionId },
      include: VERSION_INCLUDE,
    });
    const validated =
      existing?.lifecycleStatus === 'validated' && existing.validationStatus === 'passed'
        ? existing
        : await this.validateVersion(versionId, input);
    if (validated.validationStatus !== 'passed') return validated;
    const projections = this.projectionCompiler.compilePublishedVersion({
      ...(validated as unknown as BusinessDefinitionVersionRecord),
      lifecycleStatus: 'published',
    });
    if (!assertReusablePublishedProjections(validated.projections, projections)) {
      await this.db().businessDefinitionProjection.createMany({
        data: projections.map((projection) => ({
          definitionVersionId: projection.definitionVersionId,
          targetType: projection.targetType,
          targetKey: projection.targetKey,
          definitionKey: projection.definitionKey,
          definitionVersion: projection.definitionVersion,
          definitionFingerprint: projection.definitionFingerprint,
          sourceFingerprint: projection.sourceFingerprint,
          payload: projection.payload as Prisma.InputJsonValue,
          projectionFingerprint: projection.projectionFingerprint,
          generatedAt: projection.generatedAt,
          readOnly: true,
        })),
      });
    }
    return this.db().businessDefinitionVersion.findUnique({
      where: { id: versionId },
      include: VERSION_INCLUDE,
    });
  }

  async publishVersion(versionId: number, input: PublishBusinessDefinitionVersionInput) {
    assertPositiveInteger(versionId, 'versionId');
    assertPositiveInteger(input.publishedBy, 'publishedBy');
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      try {
        const published = await this.db().$transaction(
          async (tx: any) => {
            const version = await tx.businessDefinitionVersion.findUnique({
              where: { id: versionId },
              include: VERSION_INCLUDE,
            });
            if (!version) throw new NotFoundException('business_definition_version_not_found');
            if (version.lifecycleStatus === 'published') {
              if (version.definition.currentPublishedVersionId === version.id) return version;
              throw new ConflictException('historical_business_definition_cannot_be_republished');
            }
            const current = version.definition.currentPublishedVersion;
            if (current) {
              if (version.version <= current.version) {
                throw new ConflictException('business_definition_version_must_increase');
              }
              if (input.expectedCurrentVersionId === undefined) {
                throw new ConflictException('business_definition_expected_current_required');
              }
              if (input.expectedCurrentVersionId !== current.id) {
                throw new ConflictException('business_definition_current_version_changed');
              }
            } else if (input.expectedCurrentVersionId !== undefined) {
              throw new ConflictException('business_definition_current_version_changed');
            }
            await this.assertPublishable(version as unknown as BusinessDefinitionVersionRecord);
            const projections = this.projectionCompiler.compilePublishedVersion({
              ...(version as unknown as BusinessDefinitionVersionRecord),
              lifecycleStatus: 'published',
            });
            if (!assertReusablePublishedProjections(version.projections, projections)) {
              await tx.businessDefinitionProjection.createMany({
                data: projections.map((projection) => ({
                  definitionVersionId: projection.definitionVersionId,
                  targetType: projection.targetType,
                  targetKey: projection.targetKey,
                  definitionKey: projection.definitionKey,
                  definitionVersion: projection.definitionVersion,
                  definitionFingerprint: projection.definitionFingerprint,
                  sourceFingerprint: projection.sourceFingerprint,
                  payload: projection.payload as Prisma.InputJsonValue,
                  projectionFingerprint: projection.projectionFingerprint,
                  generatedAt: projection.generatedAt,
                  readOnly: true,
                })),
              });
            }
            const published = await tx.businessDefinitionVersion.update({
              where: { id: versionId },
              data: {
                lifecycleStatus: 'published',
                publishedBy: input.publishedBy,
                publishedAt: new Date(),
              },
              include: VERSION_INCLUDE,
            });
            const pointerUpdate = await tx.businessDefinition.updateMany({
              where: {
                id: version.definitionId,
                currentPublishedVersionId: current?.id ?? null,
              },
              data: { currentPublishedVersionId: version.id },
            });
            if (pointerUpdate.count !== 1) {
              throw new ConflictException('business_definition_current_version_changed');
            }
            return published;
          },
          SERIALIZABLE_TRANSACTION_OPTIONS,
        );
        await this.metricCatalogRefresher?.refresh();
        return published;
      } catch (error) {
        if (isPrismaCode(error, 'P2034') && attempt < 3) continue;
        if (isPrismaCode(error, 'P2034')) throw new ConflictException('business_definition_publish_conflict');
        if (isPrismaCode(error, 'P2002')) throw new ConflictException('business_definition_publish_conflict');
        throw error;
      }
    }
    throw new ConflictException('business_definition_publish_conflict');
  }

  async previewProjections(versionId: number) {
    const version = await this.db().businessDefinitionVersion.findUnique({
      where: { id: versionId },
      include: VERSION_INCLUDE,
    });
    if (!version) throw new NotFoundException('business_definition_version_not_found');
    this.assertFingerprint(version as unknown as BusinessDefinitionVersionRecord);
    return this.projectionCompiler.previewVersion(version as unknown as BusinessDefinitionVersionRecord);
  }

  async getPublishedSnapshot(filters: { kind?: string; domain?: string } = {}) {
    const delegate = (this.prisma as unknown as { businessDefinition?: { findMany?: Function } }).businessDefinition;
    if (!delegate?.findMany) return this.getPublishedSnapshotFromSql(filters);
    const definitions = await this.db().businessDefinition.findMany({
      where: {
        status: 'active',
        currentPublishedVersionId: { not: null },
        ...(filters.kind ? { kind: filters.kind as never } : {}),
        ...(filters.domain ? { domain: filters.domain } : {}),
      },
      include: { currentPublishedVersion: { include: VERSION_INCLUDE } },
      orderBy: [{ domain: 'asc' }, { kind: 'asc' }, { definitionKey: 'asc' }],
    });
    const snapshotDefinitions = definitions
      .filter((definition: any) => definition.currentPublishedVersion)
      .map((definition: any) => ({
        definitionId: definition.id,
        versionId: definition.currentPublishedVersion!.id,
        definitionKey: definition.definitionKey,
        kind: definition.kind,
        domain: definition.domain,
        name: definition.name,
        ownerType: definition.ownerType,
        ownerId: definition.ownerId,
        version: definition.currentPublishedVersion!.version,
        schemaVersion: definition.currentPublishedVersion!.schemaVersion,
        fingerprint: definition.currentPublishedVersion!.fingerprint,
        sourceFingerprint: definition.currentPublishedVersion!.sourceFingerprint,
        validationStatus: definition.currentPublishedVersion!.validationStatus,
        validationReport: cloneJson(definition.currentPublishedVersion!.validationReport ?? null),
        payload: cloneJson(definition.currentPublishedVersion!.payload),
        canonicalQueryRef: definition.currentPublishedVersion!.canonicalQueryRef,
        fixtureSetKey: definition.currentPublishedVersion!.fixtureSetKey,
        timezone: definition.currentPublishedVersion!.timezone,
        storeScope: cloneJson(definition.currentPublishedVersion!.storeScope),
        evidence: cloneJson(definition.currentPublishedVersion!.evidence),
        projections: cloneJson(definition.currentPublishedVersion!.projections),
      }));
    const snapshotFingerprint = createHash('sha256')
      .update(canonicalizeBusinessDefinition(snapshotDefinitions))
      .digest('hex');
    return deepFreeze({ snapshotFingerprint, definitions: snapshotDefinitions });
  }

  async getEvaluationSnapshot(candidateVersionIds: readonly number[]) {
    const published = await this.getPublishedSnapshot();
    const uniqueIds = [...new Set(candidateVersionIds.filter((id) => Number.isInteger(id) && id > 0))];
    if (!uniqueIds.length) return published;
    const versions = await this.db().businessDefinitionVersion.findMany({
      where: { id: { in: uniqueIds } },
      include: { definition: true, evidence: true, projections: true },
      orderBy: [{ definition: { definitionKey: 'asc' } }, { version: 'asc' }],
    });
    if (versions.length !== uniqueIds.length) {
      const found = new Set(versions.map((version: any) => version.id));
      throw new Error(`business_definition_evaluation_candidate_missing:${uniqueIds.filter((id) => !found.has(id)).join(',')}`);
    }
    const publishedVersionIds = new Set(published.definitions.map((definition: any) => definition.versionId));
    const candidates = versions.flatMap((version: any) => {
      if (String(version.lifecycleStatus) === 'published' && publishedVersionIds.has(version.id)) return [];
      if (!['candidate', 'validated'].includes(String(version.lifecycleStatus)) || version.validationStatus !== 'passed') {
        throw new Error(`business_definition_evaluation_candidate_not_validated:${version.id}`);
      }
      return {
        definitionId: version.definition.id,
        versionId: version.id,
        definitionKey: version.definition.definitionKey,
        kind: version.definition.kind,
        domain: version.definition.domain,
        name: version.definition.name,
        ownerType: version.definition.ownerType,
        ownerId: version.definition.ownerId,
        version: version.version,
        schemaVersion: version.schemaVersion,
        fingerprint: version.fingerprint,
        sourceFingerprint: version.sourceFingerprint,
        validationStatus: version.validationStatus,
        validationReport: cloneJson(version.validationReport ?? null),
        payload: cloneJson(version.payload),
        canonicalQueryRef: version.canonicalQueryRef,
        fixtureSetKey: version.fixtureSetKey,
        timezone: version.timezone,
        storeScope: cloneJson(version.storeScope),
        evidence: cloneJson(version.evidence),
        projections: cloneJson(version.projections),
      };
    });
    const byKey = new Map(published.definitions.map((definition: any) => [definition.definitionKey, definition]));
    for (const candidate of candidates) byKey.set(candidate.definitionKey, candidate);
    const definitions = [...byKey.values()].sort((left: any, right: any) =>
      left.domain.localeCompare(right.domain) || left.kind.localeCompare(right.kind) || left.definitionKey.localeCompare(right.definitionKey),
    );
    const snapshotFingerprint = createHash('sha256')
      .update(canonicalizeBusinessDefinition(definitions))
      .digest('hex');
    return deepFreeze({ snapshotFingerprint, definitions });
  }

  private async getPublishedSnapshotFromSql(filters: { kind?: string; domain?: string }) {
    type DefinitionRow = {
      definitionId: number;
      versionId: number;
      definitionKey: string;
      kind: string;
      domain: string;
      name: string;
      ownerType: string;
      ownerId: string | null;
      version: number;
      schemaVersion: string;
      fingerprint: string;
      sourceFingerprint: string;
      validationStatus: string;
      validationReport: Prisma.JsonValue | null;
      payload: Prisma.JsonValue;
      canonicalQueryRef: string | null;
      fixtureSetKey: string | null;
      timezone: string;
      storeScope: Prisma.JsonValue;
    };
    const rows = await this.prisma.$queryRaw<DefinitionRow[]>(Prisma.sql`
      SELECT
        d."id" AS "definitionId",
        v."id" AS "versionId",
        d."definitionKey",
        d."kind"::text AS "kind",
        d."domain",
        d."name",
        d."ownerType",
        d."ownerId",
        v."version",
        v."schemaVersion",
        v."fingerprint",
        v."sourceFingerprint",
        v."validationStatus"::text AS "validationStatus",
        v."validationReport",
        v."payload",
        v."canonicalQueryRef",
        v."fixtureSetKey",
        v."timezone",
        v."storeScope"
      FROM "business_definition" d
      JOIN "business_definition_version" v ON v."id" = d."currentPublishedVersionId"
      WHERE d."status"::text = 'active'
        AND (${filters.kind ?? null}::text IS NULL OR d."kind"::text = ${filters.kind ?? null})
        AND (${filters.domain ?? null}::text IS NULL OR d."domain" = ${filters.domain ?? null})
      ORDER BY d."domain" ASC, d."kind" ASC, d."definitionKey" ASC
    `);
    const versionIds = rows.map((row) => row.versionId);
    const evidence = versionIds.length
      ? await this.prisma.$queryRaw<Array<Record<string, unknown> & { versionId: number }>>(Prisma.sql`
          SELECT * FROM "business_definition_evidence"
          WHERE "versionId" IN (${Prisma.join(versionIds)})
          ORDER BY "versionId" ASC, "id" ASC
        `)
      : [];
    const projections = versionIds.length
      ? await this.prisma.$queryRaw<Array<Record<string, unknown> & { definitionVersionId: number }>>(Prisma.sql`
          SELECT * FROM "business_definition_projection"
          WHERE "definitionVersionId" IN (${Prisma.join(versionIds)})
          ORDER BY "definitionVersionId" ASC, "id" ASC
        `)
      : [];
    const evidenceByVersion = groupByNumber(evidence, 'versionId');
    const projectionsByVersion = groupByNumber(projections, 'definitionVersionId');
    const snapshotDefinitions = rows.map((row) => ({
      ...row,
      validationReport: cloneJson(row.validationReport ?? null),
      payload: cloneJson(row.payload),
      storeScope: cloneJson(row.storeScope),
      evidence: cloneJson(evidenceByVersion.get(row.versionId) ?? []),
      projections: cloneJson(projectionsByVersion.get(row.versionId) ?? []),
    }));
    const snapshotFingerprint = createHash('sha256')
      .update(canonicalizeBusinessDefinition(snapshotDefinitions))
      .digest('hex');
    return deepFreeze({ snapshotFingerprint, definitions: snapshotDefinitions });
  }

  private async assertPublishable(version: BusinessDefinitionVersionRecord) {
    if (version.lifecycleStatus !== 'validated' || version.validationStatus !== 'passed') {
      throw new ConflictException('business_definition_validation_required');
    }
    const report = await createCanonicalValidationReport(version, this.canonicalVerifier);
    if (!report.passed) throw new ConflictException(`business_definition_validation_failed:${report.errors.join(',')}`);
  }

  private db(): any {
    return this.prisma as any;
  }

  private assertFingerprint(version: BusinessDefinitionVersionRecord) {
    const expected = createBusinessDefinitionFingerprint(immutableRecord(version));
    if (expected !== version.fingerprint) throw new ConflictException('business_definition_fingerprint_mismatch');
  }

  private assertDefinitionIdentity(definition: any, input: CreateBusinessDefinitionDraftInput) {
    if (
      definition.definitionKey !== input.definitionKey ||
      definition.kind !== input.kind ||
      definition.domain !== input.domain ||
      definition.name !== input.name ||
      definition.ownerType !== input.ownerType ||
      (definition.ownerId ?? null) !== (input.ownerId ?? null)
    ) {
      throw new ConflictException('business_definition_identity_is_immutable');
    }
  }

  private async findReusableDraft(
    input: CreateBusinessDefinitionDraftInput,
    expectedFingerprint: string,
    expectedSourceFingerprint: string,
  ) {
    const definition = await this.db().businessDefinition.findUnique({
      where: { kind_definitionKey: { kind: input.kind, definitionKey: input.definitionKey } },
    });
    if (!definition) return null;
    this.assertDefinitionIdentity(definition, input);
    const version = await this.db().businessDefinitionVersion.findFirst({
      where: {
        definitionId: definition.id,
        fingerprint: expectedFingerprint,
        lifecycleStatus: { not: 'published' },
      },
      include: VERSION_INCLUDE,
      orderBy: { version: 'desc' },
    });
    if (!version) return null;
    const canonicalExpected = canonicalizeBusinessDefinition(immutableInput(input, expectedSourceFingerprint));
    const canonicalActual = canonicalizeBusinessDefinition(
      immutableRecord(version as unknown as BusinessDefinitionVersionRecord),
    );
    if (
      version.definitionId !== definition.id ||
      version.fingerprint !== expectedFingerprint ||
      version.sourceFingerprint !== expectedSourceFingerprint ||
      version.lifecycleStatus === 'published' ||
      canonicalActual !== canonicalExpected
    ) {
      throw new ConflictException('business_definition_reusable_draft_identity_mismatch');
    }
    return version;
  }
}

function assertReusablePublishedProjections(
  existing: readonly any[] | undefined,
  compiled: readonly {
    targetType: string;
    targetKey: string;
    definitionKey: string;
    definitionVersion: number;
    definitionFingerprint: string;
    sourceFingerprint: string;
    payload: unknown;
    projectionFingerprint: string;
    readOnly: true;
  }[],
): boolean {
  if (!existing?.length) return false;
  if (existing.length !== compiled.length) {
    throw new ConflictException('business_definition_projection_drift');
  }
  const expected = new Map(compiled.map((item) => [`${item.targetType}:${item.targetKey}`, item]));
  for (const item of existing) {
    const match = expected.get(`${item.targetType}:${item.targetKey}`);
    if (
      !match ||
      item.definitionKey !== match.definitionKey ||
      item.definitionVersion !== match.definitionVersion ||
      item.definitionFingerprint !== match.definitionFingerprint ||
      item.sourceFingerprint !== match.sourceFingerprint ||
      item.projectionFingerprint !== match.projectionFingerprint ||
      item.readOnly !== true ||
      canonicalizeBusinessDefinition(item.payload) !== canonicalizeBusinessDefinition(match.payload)
    ) {
      throw new ConflictException('business_definition_projection_drift');
    }
  }
  return true;
}

export function createBusinessDefinitionFingerprint(value: unknown): string {
  return createHash('sha256').update(canonicalizeBusinessDefinition(value)).digest('hex');
}

export function createBusinessDefinitionEvidenceFingerprint(evidence: NormalizedBusinessDefinitionEvidence): string {
  return createBusinessDefinitionFingerprint(evidence);
}

export function createBusinessDefinitionSourceFingerprint(evidence: NormalizedBusinessDefinitionEvidence[]): string {
  const evidenceFingerprints = evidence.map(createBusinessDefinitionEvidenceFingerprint).sort();
  return createBusinessDefinitionFingerprint({
    schemaVersion: CANONICAL_VALIDATOR_VERSION,
    evidenceFingerprints,
  });
}

function immutableInput(input: CreateBusinessDefinitionDraftInput, sourceFingerprint: string) {
  return {
    definitionKey: input.definitionKey,
    kind: input.kind,
    domain: input.domain,
    name: input.name,
    ownerType: input.ownerType,
    ownerId: input.ownerId ?? null,
    schemaVersion: input.schemaVersion ?? '1.0',
    payload: input.payload,
    sourceFingerprint,
    canonicalQueryRef: input.canonicalQueryRef ?? null,
    fixtureSetKey: input.fixtureSetKey ?? null,
    timezone: input.timezone ?? 'Asia/Shanghai',
    storeScope: input.storeScope ?? { mode: 'current_store' },
  };
}

export interface NormalizedBusinessDefinitionEvidence {
  sourceType: string;
  sourcePath: string;
  sourceSymbol: string | null;
  lineStart: number | null;
  lineEnd: number | null;
  evidenceKind: string;
  confidence: number;
  conflictGroup: string | null;
}

interface CanonicalValidationReport {
  validatorVersion: string;
  passed: boolean;
  checks: {
    definitionFingerprint: boolean;
    evidenceFingerprints: boolean;
    sourceFingerprint: boolean;
    timezone: boolean;
    storeScope: boolean;
    canonicalQuery: boolean;
    fixtureSet: boolean;
    canonicalVerification: boolean;
  };
  errors: string[];
}

async function createCanonicalValidationReport(
  version: BusinessDefinitionVersionRecord,
  verifier?: BusinessDefinitionCanonicalVerificationPort,
): Promise<CanonicalValidationReport> {
  const errors: string[] = [];
  const checks = {
    definitionFingerprint: false,
    evidenceFingerprints: false,
    sourceFingerprint: false,
    timezone: false,
    storeScope: false,
    canonicalQuery: false,
    fixtureSet: false,
    canonicalVerification: false,
  };

  try {
    checks.definitionFingerprint =
      createBusinessDefinitionFingerprint(immutableRecord(version)) === version.fingerprint;
  } catch {
    checks.definitionFingerprint = false;
  }
  if (!checks.definitionFingerprint) errors.push('definition_fingerprint_mismatch');

  let normalizedEvidence: NormalizedBusinessDefinitionEvidence[] = [];
  if (!version.evidence?.length) {
    errors.push('evidence_required');
  } else {
    try {
      normalizedEvidence = normalizeBusinessDefinitionEvidenceSet(version.evidence);
      checks.evidenceFingerprints = version.evidence.every((item, index) => {
        const fingerprint = record(item).evidenceFingerprint;
        return fingerprint === createBusinessDefinitionEvidenceFingerprint(normalizedEvidence[index]);
      });
    } catch {
      checks.evidenceFingerprints = false;
      errors.push('evidence_invalid');
    }
  }
  if (version.evidence?.length && !checks.evidenceFingerprints) errors.push('evidence_fingerprint_mismatch');

  if (normalizedEvidence.length) {
    checks.sourceFingerprint =
      createBusinessDefinitionSourceFingerprint(normalizedEvidence) === version.sourceFingerprint;
  }
  if (!checks.sourceFingerprint) errors.push('source_fingerprint_mismatch');

  checks.timezone = SUPPORTED_TIMEZONES.has(version.timezone);
  if (!checks.timezone) errors.push('unsupported_timezone');

  try {
    assertStoreScope(version.storeScope);
    checks.storeScope = true;
  } catch {
    checks.storeScope = false;
  }
  if (!checks.storeScope) errors.push('invalid_store_scope');

  const queryEvidenceRequired = version.definition.kind === 'metric' || version.definition.kind === 'query_definition';
  checks.canonicalQuery = !queryEvidenceRequired || isNonEmptyString(version.canonicalQueryRef);
  checks.fixtureSet = !queryEvidenceRequired || isNonEmptyString(version.fixtureSetKey);
  if (!checks.canonicalQuery) errors.push('canonical_query_required');
  if (!checks.fixtureSet) errors.push('fixture_set_required');

  if (!queryEvidenceRequired) {
    checks.canonicalVerification = true;
  } else if (checks.canonicalQuery && checks.fixtureSet) {
    const verification = await verifyCanonicalDefinition(version, verifier);
    checks.canonicalVerification = verification.passed;
    if (!verification.passed) errors.push(verification.code);
  }

  return {
    validatorVersion: CANONICAL_VALIDATOR_VERSION,
    passed: errors.length === 0,
    checks,
    errors: Array.from(new Set(errors)),
  };
}

async function verifyCanonicalDefinition(
  version: BusinessDefinitionVersionRecord,
  verifier?: BusinessDefinitionCanonicalVerificationPort,
): Promise<BusinessDefinitionCanonicalVerificationResult> {
  if (!verifier) {
    return { passed: false, code: 'canonical_verifier_unavailable', comparedCases: 0, mismatches: [] };
  }
  try {
    return await verifier.verify({
      version,
      canonicalQueryRef: version.canonicalQueryRef!,
      fixtureSetKey: version.fixtureSetKey!,
      timezone: version.timezone,
      storeScope: version.storeScope,
    });
  } catch {
    return { passed: false, code: 'canonical_verifier_execution_failed', comparedCases: 0, mismatches: [] };
  }
}

export function normalizeBusinessDefinitionEvidenceSet(
  evidence: readonly unknown[] | undefined,
): NormalizedBusinessDefinitionEvidence[] {
  if (!evidence?.length) throw new BadRequestException('business_definition_evidence_required');
  const normalized = evidence.map(normalizeEvidence);
  const fingerprints = normalized.map(createBusinessDefinitionEvidenceFingerprint);
  if (new Set(fingerprints).size !== fingerprints.length) {
    throw new BadRequestException('duplicate_business_definition_evidence');
  }
  return normalized;
}

export function createBusinessDefinitionDraftFingerprint(input: CreateBusinessDefinitionDraftInput): string {
  const normalizedEvidence = normalizeBusinessDefinitionEvidenceSet(input.evidence);
  const sourceFingerprint = createBusinessDefinitionSourceFingerprint(normalizedEvidence);
  return createBusinessDefinitionFingerprint(immutableInput(input, sourceFingerprint));
}

function normalizeEvidence(value: unknown): NormalizedBusinessDefinitionEvidence {
  const source = record(value);
  const lineStart = optionalPositiveInteger(source.lineStart, 'lineStart');
  const lineEnd = optionalPositiveInteger(source.lineEnd, 'lineEnd');
  if (lineStart !== null && lineEnd !== null && lineEnd < lineStart) {
    throw new BadRequestException('business_definition_evidence_line_range_invalid');
  }
  const confidence = Number(source.confidence);
  if (!Number.isFinite(confidence) || confidence < 0 || confidence > 1) {
    throw new BadRequestException('business_definition_evidence_confidence_invalid');
  }
  return {
    sourceType: requiredString(source.sourceType, 'sourceType').toLowerCase(),
    sourcePath: normalizeSourcePath(requiredString(source.sourcePath, 'sourcePath')),
    sourceSymbol: optionalString(source.sourceSymbol),
    lineStart,
    lineEnd,
    evidenceKind: requiredString(source.evidenceKind, 'evidenceKind').toLowerCase(),
    confidence,
    conflictGroup: optionalString(source.conflictGroup),
  };
}

function assertTimezone(timezone: string) {
  if (!SUPPORTED_TIMEZONES.has(timezone)) throw new BadRequestException('unsupported_timezone');
}

function assertStoreScope(value: unknown) {
  const scope = record(value);
  const mode = scope.mode;
  if (mode === 'current_store' || mode === 'global') {
    if (scope.storeIds !== undefined) throw new BadRequestException('invalid_store_scope');
    return;
  }
  if (mode === 'explicit_store_ids') {
    if (!Array.isArray(scope.storeIds) || scope.storeIds.length === 0) {
      throw new BadRequestException('invalid_store_scope');
    }
    const storeIds = scope.storeIds.map(Number);
    if (storeIds.some((item) => !Number.isInteger(item) || item <= 0) || new Set(storeIds).size !== storeIds.length) {
      throw new BadRequestException('invalid_store_scope');
    }
    return;
  }
  throw new BadRequestException('invalid_store_scope');
}

function requiredString(value: unknown, field: string): string {
  if (typeof value !== 'string' || !value.trim()) throw new BadRequestException(`invalid_${field}`);
  return value.trim();
}

function optionalString(value: unknown): string | null {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string') throw new BadRequestException('invalid_optional_string');
  return value.trim() || null;
}

function optionalPositiveInteger(value: unknown, field: string): number | null {
  if (value === undefined || value === null) return null;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) throw new BadRequestException(`invalid_${field}`);
  return parsed;
}

function normalizeSourcePath(value: string): string {
  return value.replace(/\\/g, '/').replace(/^\.\//, '');
}

function record(value: unknown): Record<string, any> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new BadRequestException('business_definition_object_required');
  }
  return value as Record<string, any>;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function immutableRecord(version: BusinessDefinitionVersionRecord) {
  return {
    definitionKey: version.definition.definitionKey,
    kind: version.definition.kind,
    domain: version.definition.domain,
    name: version.definition.name,
    ownerType: version.definition.ownerType,
    ownerId: version.definition.ownerId ?? null,
    schemaVersion: version.schemaVersion,
    payload: version.payload,
    sourceFingerprint: version.sourceFingerprint,
    canonicalQueryRef: version.canonicalQueryRef ?? null,
    fixtureSetKey: version.fixtureSetKey ?? null,
    timezone: version.timezone,
    storeScope: version.storeScope,
  };
}

function isPrismaCode(error: unknown, code: string): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === code;
}

function groupByNumber<T extends Record<string, unknown>>(rows: T[], key: keyof T) {
  const grouped = new Map<number, T[]>();
  for (const row of rows) {
    const value = Number(row[key]);
    if (!Number.isInteger(value)) continue;
    const items = grouped.get(value) ?? [];
    items.push(row);
    grouped.set(value, items);
  }
  return grouped;
}

function isVersionCreateConflict(error: unknown): boolean {
  return (
    isPrismaCode(error, 'P2002') ||
    isPrismaCode(error, 'P2034') ||
    (error instanceof ConflictException && error.message === 'business_definition_version_conflict')
  );
}

function assertPositiveInteger(value: number, field: string) {
  if (!Number.isInteger(value) || value <= 0) throw new ConflictException(`invalid_${field}`);
}

function cloneJson<T>(value: T): T {
  return structuredClone(value);
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const nested of Object.values(value as Record<string, unknown>)) deepFreeze(nested);
  }
  return value;
}
