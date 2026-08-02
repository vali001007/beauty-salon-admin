import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { createHash } from 'node:crypto';
import { PrismaService } from '../../prisma/prisma.service.js';

const VERSION_BUNDLE_SELECT = {
  id: true,
  version: true,
  schemaVersion: true,
  payload: true,
  lifecycleStatus: true,
  fingerprint: true,
  sourceFingerprint: true,
  validationStatus: true,
  validationReport: true,
  canonicalQueryRef: true,
  fixtureSetKey: true,
  timezone: true,
  storeScope: true,
  definition: {
    select: {
      id: true,
      definitionKey: true,
      kind: true,
      domain: true,
      name: true,
      ownerType: true,
      ownerId: true,
      currentPublishedVersionId: true,
    },
  },
  projections: {
    where: {
      targetType: { in: ['intent_semantic_index', 'metric_query_view', 'capability_semantic_view'] },
    },
    orderBy: [{ id: 'asc' as const }],
  },
} satisfies Prisma.BusinessDefinitionVersionSelect;

export type BrainDefinitionVersionBundleRow = Prisma.BusinessDefinitionVersionGetPayload<{
  select: typeof VERSION_BUNDLE_SELECT;
}>;

export interface BrainDefinitionVersionBundle {
  readonly versionIds: readonly number[];
  readonly versionSetFingerprint: string;
  readonly rows: readonly BrainDefinitionVersionBundleRow[];
  readonly cacheHits: number;
  readonly cacheMisses: number;
  readonly coalesced: boolean;
  readonly queryLatencyMs: number;
}

@Injectable()
export class BrainDefinitionVersionBundleService {
  private readonly rowsByVersionId = new Map<number, BrainDefinitionVersionBundleRow>();
  private readonly bundleLoadings = new Map<string, Promise<BrainDefinitionVersionBundle>>();
  private readonly maxCachedVersions = positiveInteger(process.env.BRAIN_DEFINITION_VERSION_CACHE_MAX, 512);

  constructor(private readonly prisma: PrismaService) {}

  async load(definitionVersionIds: readonly number[]): Promise<BrainDefinitionVersionBundle> {
    const versionIds = normalizeVersionIds(definitionVersionIds);
    const cacheKey = versionIds.join(',');
    const loading = this.bundleLoadings.get(cacheKey);
    if (loading) {
      const result = await loading;
      return Object.freeze({ ...result, coalesced: true });
    }

    const next = this.loadBundle(versionIds);
    this.bundleLoadings.set(cacheKey, next);
    try {
      return await next;
    } finally {
      if (this.bundleLoadings.get(cacheKey) === next) this.bundleLoadings.delete(cacheKey);
    }
  }

  invalidate(definitionVersionIds?: readonly number[]): void {
    if (!definitionVersionIds) {
      this.rowsByVersionId.clear();
      return;
    }
    for (const id of normalizeVersionIds(definitionVersionIds)) this.rowsByVersionId.delete(id);
  }

  private async loadBundle(versionIds: readonly number[]): Promise<BrainDefinitionVersionBundle> {
    if (!versionIds.length) {
      return Object.freeze({
        versionIds: Object.freeze([]),
        versionSetFingerprint: emptyFingerprint(),
        rows: Object.freeze([]),
        cacheHits: 0,
        cacheMisses: 0,
        coalesced: false,
        queryLatencyMs: 0,
      });
    }

    const missingIds = versionIds.filter((id) => !this.rowsByVersionId.has(id));
    let queryLatencyMs = 0;
    if (missingIds.length) {
      const startedAt = Date.now();
      const rows = await this.prisma.businessDefinitionVersion.findMany({
        where: { id: { in: missingIds } },
        select: VERSION_BUNDLE_SELECT,
        orderBy: [{ definition: { definitionKey: 'asc' } }, { version: 'asc' }],
      });
      queryLatencyMs = Date.now() - startedAt;
      if (rows.length !== missingIds.length) {
        const found = new Set(rows.map((row) => row.id));
        throw new Error(
          `business_definition_version_bundle_missing:${missingIds.filter((id) => !found.has(id)).join(',')}`,
        );
      }
      for (const row of rows) this.cacheRow(row);
    }

    const rows = versionIds
      .map((id) => this.rowsByVersionId.get(id))
      .filter((row): row is BrainDefinitionVersionBundleRow => row !== undefined)
      .sort(
        (left, right) =>
          left.definition.definitionKey.localeCompare(right.definition.definitionKey) || left.version - right.version,
      );
    if (rows.length !== versionIds.length) {
      throw new Error('business_definition_version_bundle_cache_incomplete');
    }

    return Object.freeze({
      versionIds: Object.freeze([...versionIds]),
      versionSetFingerprint: createHash('sha256')
        .update(
          JSON.stringify(
            rows.map((row) => [
              row.id,
              row.definition.id,
              row.definition.definitionKey,
              row.version,
              row.fingerprint,
              row.sourceFingerprint,
              row.validationStatus,
              row.lifecycleStatus,
              row.projections.map((projection) => [
                projection.id,
                projection.targetType,
                projection.projectionFingerprint,
                projection.definitionFingerprint,
                projection.sourceFingerprint,
              ]),
            ]),
          ),
        )
        .digest('hex'),
      rows: Object.freeze(rows),
      cacheHits: versionIds.length - missingIds.length,
      cacheMisses: missingIds.length,
      coalesced: false,
      queryLatencyMs,
    });
  }

  private cacheRow(row: BrainDefinitionVersionBundleRow): void {
    this.rowsByVersionId.delete(row.id);
    this.rowsByVersionId.set(row.id, row);
    while (this.rowsByVersionId.size > this.maxCachedVersions) {
      const oldest = this.rowsByVersionId.keys().next().value as number | undefined;
      if (oldest === undefined) break;
      this.rowsByVersionId.delete(oldest);
    }
  }
}

function normalizeVersionIds(values: readonly number[]): number[] {
  return [...new Set(values.filter((value) => Number.isInteger(value) && value > 0))].sort(
    (left, right) => left - right,
  );
}

function positiveInteger(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function emptyFingerprint(): string {
  return createHash('sha256').update('[]').digest('hex');
}
