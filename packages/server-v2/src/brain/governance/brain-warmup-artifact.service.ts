import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { createHash } from 'node:crypto';
import { gunzipSync, gzipSync } from 'node:zlib';
import { PrismaService } from '../../prisma/prisma.service.js';
import {
  BRAIN_CAPABILITY_CATALOG_VALIDATOR_VERSION,
  BrainCapabilityCatalogService,
} from '../capability/brain-capability-catalog.service.js';
import type {
  BrainCapabilityCandidate,
  BrainCapabilityCatalogValidationReport,
} from '../capability/brain-capability.types.js';
import { BrainDefinitionVersionBundleService } from '../cognition/brain-definition-version-bundle.service.js';
import {
  BRAIN_ONTOLOGY_BUILDER_VERSION,
  BrainOntologyRuntimeService,
} from '../cognition/brain-ontology-runtime.service.js';
import type { ProductionReadyBusinessDefinitionSnapshot } from '../cognition/business-definition-snapshot.types.js';

export const BRAIN_WARMUP_ARTIFACT_SCHEMA_VERSION = 3;
const BRAIN_WARMUP_ARTIFACT_COMPRESSION = 'gzip-json-v1';

export interface BrainWarmupArtifactReleaseHeader {
  readonly id: number;
  readonly versionMap: Prisma.JsonValue;
  readonly releaseFingerprint: string;
}

export interface BrainWarmupArtifactRuntimeResult {
  readonly releaseId: number;
  readonly releaseFingerprint: string;
  readonly versionMapChecksum: string;
  readonly definitionSetFingerprint: string;
  readonly definitionVersionIds: readonly number[];
  readonly candidates: readonly BrainCapabilityCandidate[];
  readonly ontology: ProductionReadyBusinessDefinitionSnapshot;
  readonly catalog: BrainCapabilityCatalogValidationReport;
  readonly source: 'persistent' | 'computed';
  readonly builtAt: string;
  readonly ontologyLatencyMs: number;
  readonly capabilityCatalogLatencyMs: number;
}

@Injectable()
export class BrainWarmupArtifactService {
  private readonly buildLoadings = new Map<string, Promise<BrainWarmupArtifactRuntimeResult>>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly definitionVersionBundle: BrainDefinitionVersionBundleService,
    private readonly ontologyRuntime: BrainOntologyRuntimeService,
    private readonly capabilityCatalog: BrainCapabilityCatalogService,
  ) {}

  async loadReadyMany(
    releases: readonly BrainWarmupArtifactReleaseHeader[],
  ): Promise<ReadonlyMap<number, BrainWarmupArtifactRuntimeResult>> {
    if (!releases.length) return new Map();
    const identities = releases.map((release) => ({
      releaseId: release.id,
      versionMapChecksum: versionMapChecksum(release.versionMap),
      releaseFingerprint: release.releaseFingerprint,
    }));
    const builderVersion = this.currentBuilderVersion();
    const rows = await this.prisma.brainWarmupArtifact.findMany({
      where: {
        status: 'ready',
        builderVersion,
        OR: identities.map((identity) => ({
          releaseId: identity.releaseId,
          versionMapChecksum: identity.versionMapChecksum,
          releaseFingerprint: identity.releaseFingerprint,
        })),
      },
      orderBy: { builtAt: 'desc' },
    });
    const result = new Map<number, BrainWarmupArtifactRuntimeResult>();
    for (const row of rows) {
      if (result.has(row.releaseId)) continue;
      const hydrated = this.hydrate(row);
      if (hydrated) result.set(row.releaseId, hydrated);
    }
    return result;
  }

  async loadReady(release: BrainWarmupArtifactReleaseHeader): Promise<BrainWarmupArtifactRuntimeResult | null> {
    return (await this.loadReadyMany([release])).get(release.id) ?? null;
  }

  async build(input: {
    releaseId: number;
    releaseFingerprint: string;
    versionMap: Prisma.JsonValue;
    candidates: readonly BrainCapabilityCandidate[];
    definitionVersionIds: readonly number[];
  }): Promise<BrainWarmupArtifactRuntimeResult> {
    const definitionVersionIds = normalizeVersionIds(input.definitionVersionIds);
    const candidates = deepFreezeJson(structuredClone(input.candidates)) as readonly BrainCapabilityCandidate[];
    const versionChecksum = versionMapChecksum(input.versionMap);
    const builderVersion = this.currentBuilderVersion();
    const loadingKey = stableStringify({
      releaseId: input.releaseId,
      releaseFingerprint: input.releaseFingerprint,
      versionChecksum,
      builderVersion,
    });
    const existing = this.buildLoadings.get(loadingKey);
    if (existing) return existing;
    const loading = this.buildArtifact({
      ...input,
      candidates,
      definitionVersionIds,
      versionChecksum,
      builderVersion,
    });
    this.buildLoadings.set(loadingKey, loading);
    try {
      return await loading;
    } finally {
      if (this.buildLoadings.get(loadingKey) === loading) this.buildLoadings.delete(loadingKey);
    }
  }

  private async buildArtifact(input: {
    releaseId: number;
    releaseFingerprint: string;
    versionMap: Prisma.JsonValue;
    candidates: readonly BrainCapabilityCandidate[];
    definitionVersionIds: readonly number[];
    versionChecksum: string;
    builderVersion: string;
  }): Promise<BrainWarmupArtifactRuntimeResult> {
    const { definitionVersionIds, candidates, versionChecksum, builderVersion } = input;
    const identityWhere = {
      releaseId: input.releaseId,
      builderVersion,
      releaseFingerprint: input.releaseFingerprint,
      versionMapChecksum: versionChecksum,
    };
    await this.prisma.brainWarmupArtifact.upsert({
      where: { releaseId_builderVersion_releaseFingerprint_versionMapChecksum: identityWhere },
      create: {
        ...identityWhere,
        definitionSetFingerprint: '0'.repeat(64),
        status: 'building',
        definitionVersionIds: definitionVersionIds as unknown as Prisma.InputJsonValue,
        candidates: candidates as unknown as Prisma.InputJsonValue,
        ontologyPayload: {},
        catalogPayload: {},
        ontologyFingerprint: '0'.repeat(64),
        capabilityCount: 0,
        resultChecksum: '0'.repeat(64),
        metrics: {},
      },
      update: {
        status: 'building',
        errorCode: null,
        errorMessage: null,
      },
    });
    try {
      const bundle = await this.definitionVersionBundle.load(definitionVersionIds);
      const ontologyLoad = timed(() => this.ontologyRuntime.loadEvaluationSnapshot(definitionVersionIds));
      const catalogLoad = timed(() => this.capabilityCatalog.validateEnabledCapabilities(candidates));
      const [ontologyResult, catalogResult] = await Promise.all([ontologyLoad, catalogLoad]);
      if (!catalogResult.value.valid) {
        throw new Error(
          `brain_warmup_artifact_catalog_invalid:${catalogResult.value.issues.map((issue) => issue.code).join(',')}`,
        );
      }
      const builtAt = new Date().toISOString();
      const payload = {
        releaseId: input.releaseId,
        releaseFingerprint: input.releaseFingerprint,
        versionMapChecksum: versionChecksum,
        definitionSetFingerprint: bundle.versionSetFingerprint,
        definitionVersionIds,
        candidates,
        ontology: ontologyResult.value,
        catalog: catalogResult.value,
        builderVersion,
      };
      const resultChecksum = sha256(stableStringify(payload));
      const compressedPayload = compressArtifactPayload({
        definitionVersionIds,
        candidates,
        ontology: ontologyResult.value,
        catalog: catalogResult.value,
      });
      await this.prisma.brainWarmupArtifact.upsert({
        where: {
          releaseId_builderVersion_releaseFingerprint_versionMapChecksum: identityWhere,
        },
        create: {
          ...identityWhere,
          definitionSetFingerprint: bundle.versionSetFingerprint,
          status: 'ready',
          definitionVersionIds: definitionVersionIds as unknown as Prisma.InputJsonValue,
          candidates: [],
          ontologyPayload: {},
          catalogPayload: {},
          payloadCompressed: compressedPayload.bytes,
          compression: BRAIN_WARMUP_ARTIFACT_COMPRESSION,
          payloadBytes: compressedPayload.uncompressedBytes,
          ontologyFingerprint: ontologyResult.value.fingerprint,
          capabilityCount: catalogResult.value.cards.length,
          resultChecksum,
          metrics: {
            ontologyLatencyMs: ontologyResult.latencyMs,
            capabilityCatalogLatencyMs: catalogResult.latencyMs,
            definitionQueryLatencyMs: bundle.queryLatencyMs,
            definitionCacheHits: bundle.cacheHits,
            definitionCacheMisses: bundle.cacheMisses,
          },
          builtAt: new Date(builtAt),
        },
        update: {
          definitionSetFingerprint: bundle.versionSetFingerprint,
          status: 'ready',
          definitionVersionIds: definitionVersionIds as unknown as Prisma.InputJsonValue,
          candidates: [],
          ontologyPayload: {},
          catalogPayload: {},
          payloadCompressed: compressedPayload.bytes,
          compression: BRAIN_WARMUP_ARTIFACT_COMPRESSION,
          payloadBytes: compressedPayload.uncompressedBytes,
          ontologyFingerprint: ontologyResult.value.fingerprint,
          capabilityCount: catalogResult.value.cards.length,
          resultChecksum,
          metrics: {
            ontologyLatencyMs: ontologyResult.latencyMs,
            capabilityCatalogLatencyMs: catalogResult.latencyMs,
            definitionQueryLatencyMs: bundle.queryLatencyMs,
            definitionCacheHits: bundle.cacheHits,
            definitionCacheMisses: bundle.cacheMisses,
          },
          errorCode: null,
          errorMessage: null,
          builtAt: new Date(builtAt),
        },
      });
      return Object.freeze({
        releaseId: input.releaseId,
        releaseFingerprint: input.releaseFingerprint,
        versionMapChecksum: versionChecksum,
        definitionSetFingerprint: bundle.versionSetFingerprint,
        definitionVersionIds: Object.freeze([...definitionVersionIds]),
        candidates,
        ontology: ontologyResult.value,
        catalog: catalogResult.value,
        source: 'computed' as const,
        builtAt,
        ontologyLatencyMs: ontologyResult.latencyMs,
        capabilityCatalogLatencyMs: catalogResult.latencyMs,
      });
    } catch (error) {
      await this.prisma.brainWarmupArtifact.updateMany({
        where: identityWhere,
        data: {
          status: 'failed',
          errorCode: 'artifact_build_failed',
          errorMessage: error instanceof Error ? error.message : String(error),
        },
      });
      throw error;
    }
  }

  private hydrate(row: {
    releaseId: number;
    releaseFingerprint: string;
    versionMapChecksum: string;
    definitionSetFingerprint: string;
    builderVersion: string;
    definitionVersionIds: Prisma.JsonValue;
    candidates: Prisma.JsonValue;
    ontologyPayload: Prisma.JsonValue;
    catalogPayload: Prisma.JsonValue;
    payloadCompressed: Uint8Array | null;
    compression: string | null;
    resultChecksum: string;
    builtAt: Date;
  }): BrainWarmupArtifactRuntimeResult | null {
    const compressed = hydrateCompressedPayload(row.payloadCompressed, row.compression);
    const definitionVersionIds = normalizeVersionIds(
      jsonNumberArray(compressed?.definitionVersionIds ?? row.definitionVersionIds),
    );
    const candidates = jsonObjectArray(
      compressed?.candidates ?? row.candidates,
    ) as unknown as BrainCapabilityCandidate[];
    const ontology = (compressed?.ontology ??
      row.ontologyPayload) as unknown as ProductionReadyBusinessDefinitionSnapshot;
    const catalog = (compressed?.catalog ??
      row.catalogPayload) as unknown as BrainCapabilityCatalogValidationReport;
    if (
      !definitionVersionIds.length ||
      !candidates.length ||
      ontology?.productionReady !== true ||
      typeof ontology.fingerprint !== 'string' ||
      catalog?.valid !== true ||
      !Array.isArray(catalog.cards)
    ) {
      return null;
    }
    const payload = {
      releaseId: row.releaseId,
      releaseFingerprint: row.releaseFingerprint,
      versionMapChecksum: row.versionMapChecksum,
      definitionSetFingerprint: row.definitionSetFingerprint,
      definitionVersionIds,
      candidates,
      ontology,
      catalog,
      builderVersion: row.builderVersion,
    };
    if (sha256(stableStringify(payload)) !== row.resultChecksum) return null;
    const frozenCandidates = deepFreezeJson(candidates) as readonly BrainCapabilityCandidate[];
    const frozenOntology = deepFreezeJson(ontology) as ProductionReadyBusinessDefinitionSnapshot;
    const frozenCatalog = deepFreezeJson(catalog) as BrainCapabilityCatalogValidationReport;
    this.ontologyRuntime.primeEvaluationSnapshot(definitionVersionIds, row.definitionSetFingerprint, frozenOntology);
    this.capabilityCatalog.primeValidatedCapabilities(frozenCandidates, frozenCatalog);
    return Object.freeze({
      releaseId: row.releaseId,
      releaseFingerprint: row.releaseFingerprint,
      versionMapChecksum: row.versionMapChecksum,
      definitionSetFingerprint: row.definitionSetFingerprint,
      definitionVersionIds: Object.freeze([...definitionVersionIds]),
      candidates: frozenCandidates,
      ontology: frozenOntology,
      catalog: frozenCatalog,
      source: 'persistent' as const,
      builtAt: row.builtAt.toISOString(),
      ontologyLatencyMs: 0,
      capabilityCatalogLatencyMs: 0,
    });
  }

  private currentBuilderVersion(): string {
    return sha256(
      stableStringify({
        artifactSchemaVersion: BRAIN_WARMUP_ARTIFACT_SCHEMA_VERSION,
        ontologyBuilderVersion: BRAIN_ONTOLOGY_BUILDER_VERSION,
        catalogValidatorVersion: BRAIN_CAPABILITY_CATALOG_VALIDATOR_VERSION,
        runtimeDataModelFingerprint: this.ontologyRuntime.getRuntimeDataModelFingerprint(),
        buildCommit: resolveBuildCommit(),
      }),
    );
  }
}

export function versionMapChecksum(value: Prisma.JsonValue): string {
  return sha256(stableStringify(value));
}

function normalizeVersionIds(values: readonly number[]): number[] {
  return [...new Set(values.filter((value) => Number.isInteger(value) && value > 0))].sort(
    (left, right) => left - right,
  );
}

function jsonNumberArray(value: Prisma.JsonValue): number[] {
  return Array.isArray(value)
    ? value.filter((item): item is number => typeof item === 'number' && Number.isInteger(item) && item > 0)
    : [];
}

function jsonObjectArray(value: Prisma.JsonValue): Record<string, unknown>[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) =>
    item !== null && typeof item === 'object' && !Array.isArray(item) ? [item as Record<string, unknown>] : [],
  );
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function stableStringify(value: unknown): string {
  return JSON.stringify(canonicalJsonValue(value));
}

function canonicalJsonValue(value: unknown): unknown {
  if (value === undefined || typeof value === 'function' || typeof value === 'symbol') return null;
  if (value === null || typeof value !== 'object') {
    return typeof value === 'number' && !Number.isFinite(value) ? null : value;
  }
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(canonicalJsonValue);
  const record = value as Record<string, unknown>;
  return Object.fromEntries(
    Object.keys(record)
      .sort()
      .filter((key) => {
        const item = record[key];
        return item !== undefined && typeof item !== 'function' && typeof item !== 'symbol';
      })
      .map((key) => [key, canonicalJsonValue(record[key])]),
  );
}

function deepFreezeJson<T>(value: T): T {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  if (Array.isArray(value)) {
    value.forEach((item) => deepFreezeJson(item));
    return Object.freeze(value);
  }
  Object.values(value as Record<string, unknown>).forEach((item) => deepFreezeJson(item));
  return Object.freeze(value);
}

function resolveBuildCommit(env: NodeJS.ProcessEnv = process.env): string | null {
  const value =
    env.BRAIN_BUILD_COMMIT ?? env.RAILWAY_GIT_COMMIT_SHA ?? env.RENDER_GIT_COMMIT ?? env.GIT_COMMIT_SHA ?? null;
  return value?.trim() || null;
}

function compressArtifactPayload(value: unknown): {
  bytes: Uint8Array<ArrayBuffer>;
  uncompressedBytes: number;
} {
  const json = stableStringify(value);
  return {
    bytes: Uint8Array.from(gzipSync(Buffer.from(json, 'utf8'), { level: 6 })),
    uncompressedBytes: Buffer.byteLength(json, 'utf8'),
  };
}

function hydrateCompressedPayload(
  bytes: Uint8Array | null,
  compression: string | null,
): Record<string, Prisma.JsonValue> | null {
  if (!bytes || compression !== BRAIN_WARMUP_ARTIFACT_COMPRESSION) return null;
  try {
    const parsed = JSON.parse(gunzipSync(Buffer.from(bytes)).toString('utf8')) as unknown;
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, Prisma.JsonValue>)
      : null;
  } catch {
    return null;
  }
}

async function timed<T>(loader: () => Promise<T>): Promise<{ value: T; latencyMs: number }> {
  const startedAt = Date.now();
  const value = await loader();
  return { value, latencyMs: Date.now() - startedAt };
}
