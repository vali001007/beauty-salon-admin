import { Injectable, Logger, Optional, type OnApplicationBootstrap } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service.js';
import { BrainCapabilityCatalogService } from '../capability/brain-capability-catalog.service.js';
import type { BrainCapabilityCandidate } from '../capability/brain-capability.types.js';
import { BrainOntologyRuntimeService } from '../cognition/brain-ontology-runtime.service.js';
import { BrainDefinitionVersionBundleService } from '../cognition/brain-definition-version-bundle.service.js';
import { extractBrainReleaseDefinitionVersionIds } from './brain-release-definition-versions.js';
import { createReleaseFingerprint } from './brain-capability-regeneration-fingerprint.js';
import { BrainWarmupArtifactService, type BrainWarmupArtifactRuntimeResult } from './brain-warmup-artifact.service.js';

type WarmableReleaseStatus = 'active' | 'draft' | 'rolled_back' | 'archived';
const RUNTIME_RELEASE_SCOPES = ['global', 'store', 'user', 'role', 'percentage'] as const;

export interface BrainReleaseOntologyWarmupResult {
  readonly releaseId: number;
  readonly releaseFingerprint: string;
  readonly releaseStatus: WarmableReleaseStatus;
  readonly mode: 'model' | 'shadow';
  readonly definitionVersionIds: readonly number[];
  readonly capabilityCount: number;
  readonly ontologyFingerprint: string;
  readonly ontologyLatencyMs: number;
  readonly capabilityCatalogLatencyMs: number;
  readonly latencyMs: number;
  readonly artifactSource: 'persistent' | 'computed' | 'memory';
  readonly artifactBuiltAt: string | null;
}

export interface BrainActiveReleaseWarmupStatus {
  readonly state: 'pending' | 'warming' | 'ready' | 'failed';
  readonly currentPhase:
    | 'release_discovery'
    | 'artifact_lookup'
    | 'item_fetch'
    | 'definition_preload'
    | 'release_warmup'
    | null;
  readonly startedAt: string | null;
  readonly completedAt: string | null;
  readonly latencyMs: number | null;
  readonly activeReleaseCount: number;
  readonly warmedReleaseCount: number;
  readonly phases: {
    readonly releaseDiscoveryMs: number;
    readonly artifactLookupMs: number;
    readonly itemFetchMs: number;
    readonly definitionPreloadMs: number;
    readonly releaseWarmupMs: number;
  };
  readonly releases: readonly BrainReleaseOntologyWarmupResult[];
  readonly failureReason: string | null;
}

interface ReleaseWarmupRow {
  readonly id: number;
  readonly status: string;
  readonly scope: string;
  readonly versionMap: Prisma.JsonValue;
  readonly rollout: Prisma.JsonValue;
  readonly items: readonly ReleaseWarmupItem[];
}

interface ReleaseWarmupHeader {
  readonly id: number;
  readonly status: string;
  readonly scope: string;
  readonly versionMap: Prisma.JsonValue;
  readonly rollout: Prisma.JsonValue;
  readonly items: readonly ReleaseWarmupItemIdentity[];
}

interface ReleaseWarmupItemIdentity {
  readonly resourceVersionId: number;
  readonly resourceType: string;
  readonly resourceKey: string;
  readonly resourceVersion: { readonly checksum: string };
}

interface ReleaseWarmupItem extends ReleaseWarmupItemIdentity {
  readonly snapshot: Prisma.JsonValue;
}

@Injectable()
export class BrainActiveReleaseWarmupService implements OnApplicationBootstrap {
  private readonly logger = new Logger(BrainActiveReleaseWarmupService.name);
  private warmActiveLoading?: Promise<BrainActiveReleaseWarmupStatus>;
  private status: BrainActiveReleaseWarmupStatus = freezeStatus({
    state: 'pending',
    currentPhase: null,
    startedAt: null,
    completedAt: null,
    latencyMs: null,
    activeReleaseCount: 0,
    warmedReleaseCount: 0,
    phases: emptyPhases(),
    releases: [],
    failureReason: null,
  });

  constructor(
    private readonly prisma: PrismaService,
    private readonly ontologyRuntime: BrainOntologyRuntimeService,
    private readonly capabilityCatalog: BrainCapabilityCatalogService,
    @Optional() private readonly definitionVersionBundle?: BrainDefinitionVersionBundleService,
    private readonly warmupArtifact?: BrainWarmupArtifactService,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    if (process.env.BRAIN_RELEASE_PILOT_MODE === 'true') {
      const completedAt = new Date().toISOString();
      this.status = freezeStatus({
        state: 'ready',
        currentPhase: null,
        startedAt: completedAt,
        completedAt,
        latencyMs: 0,
        activeReleaseCount: 0,
        warmedReleaseCount: 0,
        phases: emptyPhases(),
        releases: [],
        failureReason: null,
      });
      this.logger.log('active_release_ontology_warmup_skipped reason=release_pilot');
      return;
    }

    const retry = resolveWarmupRetryConfig();
    let lastError: unknown;
    for (let attempt = 1; attempt <= retry.maxAttempts; attempt += 1) {
      try {
        await this.warmActiveReleases();
        if (attempt > 1) {
          this.logger.log(`active_release_ontology_warmup_recovered attempt=${attempt}`);
        }
        return;
      } catch (error) {
        lastError = error;
        const canRetry = isTransientWarmupError(error) && attempt < retry.maxAttempts;
        if (!canRetry) break;
        const delayMs = Math.min(retry.retryDelayMs * 2 ** (attempt - 1), 10_000);
        this.logger.warn(
          `active_release_ontology_warmup_retry attempt=${attempt + 1}/${retry.maxAttempts} delayMs=${delayMs} reason=${errorMessage(error)}`,
        );
        await delay(delayMs);
      }
    }

    if (retry.failFast) throw lastError;
    this.logger.warn(`active_release_ontology_warmup_degraded failFast=false reason=${errorMessage(lastError)}`);
  }

  getStatus(): BrainActiveReleaseWarmupStatus {
    return this.status;
  }

  async warmActiveReleases(): Promise<BrainActiveReleaseWarmupStatus> {
    if (this.warmActiveLoading) return this.warmActiveLoading;
    const loading = this.runActiveReleaseWarmup();
    this.warmActiveLoading = loading;
    try {
      return await loading;
    } finally {
      if (this.warmActiveLoading === loading) this.warmActiveLoading = undefined;
    }
  }

  async warmRelease(input: {
    releaseId: number;
    expectedStatus: WarmableReleaseStatus;
  }): Promise<BrainReleaseOntologyWarmupResult | null> {
    const release = await this.prisma.brainRelease.findUnique({
      where: { id: input.releaseId },
      select: releaseWarmupSelect,
    });
    if (!release) throw new Error(`brain_release_warmup_release_not_found:${input.releaseId}`);
    if (release.status !== input.expectedStatus) {
      throw new Error(
        `brain_release_warmup_status_changed:${input.releaseId}:${input.expectedStatus}:${release.status}`,
      );
    }
    return this.warmReleaseRow(release);
  }

  private async runActiveReleaseWarmup(): Promise<BrainActiveReleaseWarmupStatus> {
    const startedAtMs = Date.now();
    const startedAt = new Date(startedAtMs).toISOString();
    this.status = freezeStatus({
      state: 'warming',
      currentPhase: 'release_discovery',
      startedAt,
      completedAt: null,
      latencyMs: null,
      activeReleaseCount: 0,
      warmedReleaseCount: 0,
      phases: emptyPhases(),
      releases: [],
      failureReason: null,
    });
    try {
      const pipeline = resolveWarmupPipeline();
      const useArtifact = pipeline === 'artifact' && Boolean(this.warmupArtifact);
      const useSharedBundle = pipeline === 'shared' || pipeline === 'artifact';
      const discovery = await timed(() =>
        this.prisma.brainRelease.findMany({
          where: { status: 'active', scope: { in: [...RUNTIME_RELEASE_SCOPES] } },
          orderBy: { activatedAt: 'desc' },
          select: useArtifact ? releaseWarmupHeaderSelect : releaseWarmupSelect,
        }),
      );
      const activeReleases = discovery.value as ReleaseWarmupHeader[];
      const warmableHeaders = activeReleases.filter((release) => {
        const mode = releaseMode(release.rollout);
        return mode === 'model' || mode === 'shadow';
      });
      this.updateWarmingStatus({
        currentPhase: 'artifact_lookup',
        activeReleaseCount: activeReleases.length,
        phases: { releaseDiscoveryMs: discovery.latencyMs },
      });
      const artifactLookup = useArtifact
        ? await timed(() => this.warmupArtifact!.loadReadyMany(warmableHeaders.map(releaseArtifactHeader)))
        : { value: new Map<number, BrainWarmupArtifactRuntimeResult>(), latencyMs: 0 };
      this.updateWarmingStatus({
        currentPhase: 'item_fetch',
        phases: { artifactLookupMs: artifactLookup.latencyMs },
      });
      const missingReleaseIds = useArtifact
        ? warmableHeaders.filter((release) => !artifactLookup.value.has(release.id)).map((release) => release.id)
        : [];
      const itemFetch = useArtifact
        ? missingReleaseIds.length
          ? await timed(() =>
              this.prisma.brainRelease.findMany({
                where: { id: { in: missingReleaseIds } },
                orderBy: { activatedAt: 'desc' },
                select: releaseWarmupSelect,
              }),
            )
          : { value: [], latencyMs: 0 }
        : { value: discovery.value, latencyMs: 0 };
      this.updateWarmingStatus({
        currentPhase: 'definition_preload',
        phases: { itemFetchMs: itemFetch.latencyMs },
      });
      const releaseRows = itemFetch.value as unknown as ReleaseWarmupRow[];
      const allDefinitionVersionIds = extractBrainReleaseDefinitionVersionIds(
        releaseRows.flatMap((release) => releaseCandidates(release)),
      );
      const definitionPreload =
        useSharedBundle && this.definitionVersionBundle && allDefinitionVersionIds.length
          ? await timed(() => this.definitionVersionBundle!.load(allDefinitionVersionIds))
          : { value: null, latencyMs: 0 };
      this.updateWarmingStatus({
        currentPhase: 'release_warmup',
        phases: { definitionPreloadMs: definitionPreload.latencyMs },
      });
      const releaseWarmup = await timed(() => Promise.all(releaseRows.map((release) => this.warmReleaseRow(release))));
      const persisted = warmableHeaders
        .map((release) => {
          const artifact = artifactLookup.value.get(release.id);
          return artifact ? artifactWarmupResult(release, artifact) : null;
        })
        .filter((result): result is BrainReleaseOntologyWarmupResult => result !== null);
      const warmed = [...persisted, ...releaseWarmup.value]
        .filter((result): result is BrainReleaseOntologyWarmupResult => result !== null)
        .sort((left, right) => right.releaseId - left.releaseId);
      const completedAtMs = Date.now();
      this.status = freezeStatus({
        state: 'ready',
        currentPhase: null,
        startedAt,
        completedAt: new Date(completedAtMs).toISOString(),
        latencyMs: completedAtMs - startedAtMs,
        activeReleaseCount: activeReleases.length,
        warmedReleaseCount: warmed.length,
        phases: {
          releaseDiscoveryMs: discovery.latencyMs,
          artifactLookupMs: artifactLookup.latencyMs,
          itemFetchMs: itemFetch.latencyMs,
          definitionPreloadMs: definitionPreload.latencyMs,
          releaseWarmupMs: releaseWarmup.latencyMs,
        },
        releases: warmed,
        failureReason: null,
      });
      this.logger.log(
        `active_release_ontology_warmup_ready pipeline=${pipeline} artifactAvailable=${Boolean(this.warmupArtifact)} active=${activeReleases.length} warmed=${warmed.length} persistent=${persisted.length} discoveryMs=${discovery.latencyMs} artifactLookupMs=${artifactLookup.latencyMs} itemFetchMs=${itemFetch.latencyMs} definitionPreloadMs=${definitionPreload.latencyMs} releaseWarmupMs=${releaseWarmup.latencyMs} latencyMs=${completedAtMs - startedAtMs}`,
      );
      return this.status;
    } catch (error) {
      const completedAtMs = Date.now();
      const failureReason = errorMessage(error);
      this.status = freezeStatus({
        state: 'failed',
        currentPhase: this.status.currentPhase,
        startedAt,
        completedAt: new Date(completedAtMs).toISOString(),
        latencyMs: completedAtMs - startedAtMs,
        activeReleaseCount: this.status.activeReleaseCount,
        warmedReleaseCount: 0,
        phases: this.status.phases,
        releases: [],
        failureReason,
      });
      this.logger.error(`active_release_ontology_warmup_failed reason=${failureReason}`);
      throw error;
    }
  }

  private updateWarmingStatus(input: {
    currentPhase: NonNullable<BrainActiveReleaseWarmupStatus['currentPhase']>;
    activeReleaseCount?: number;
    phases?: Partial<BrainActiveReleaseWarmupStatus['phases']>;
  }): void {
    if (this.status.state !== 'warming') return;
    this.status = freezeStatus({
      ...this.status,
      currentPhase: input.currentPhase,
      activeReleaseCount: input.activeReleaseCount ?? this.status.activeReleaseCount,
      phases: { ...this.status.phases, ...input.phases },
    });
  }

  private async warmReleaseRow(release: ReleaseWarmupRow): Promise<BrainReleaseOntologyWarmupResult | null> {
    if (!isWarmableReleaseStatus(release.status)) {
      throw new Error(`brain_release_warmup_status_invalid:${release.id}:${release.status}`);
    }
    if (!(RUNTIME_RELEASE_SCOPES as readonly string[]).includes(release.scope)) return null;
    const mode = releaseMode(release.rollout);
    if (mode !== 'model' && mode !== 'shadow') return null;
    const candidates = releaseCandidates(release);
    if (candidates.length === 0) {
      throw new Error(`brain_release_warmup_capabilities_missing:${release.id}`);
    }
    const definitionVersionIds = extractBrainReleaseDefinitionVersionIds(candidates);
    if (definitionVersionIds.length === 0) {
      throw new Error(`brain_release_warmup_definition_refs_missing:${release.id}`);
    }
    const header = releaseArtifactHeader(release);
    if (resolveWarmupPipeline() === 'artifact' && this.warmupArtifact) {
      const artifact =
        (await this.warmupArtifact.loadReady(header)) ??
        (await this.warmupArtifact.build({
          releaseId: release.id,
          releaseFingerprint: header.releaseFingerprint,
          versionMap: release.versionMap,
          candidates,
          definitionVersionIds,
        }));
      return artifactWarmupResult(release, artifact);
    }
    const startedAt = Date.now();
    const ontologyLoad = timed(() => this.ontologyRuntime.loadEvaluationSnapshot(definitionVersionIds));
    const capabilityCatalogLoad = timed(() => this.capabilityCatalog.listEnabledCapabilities(candidates));
    const [ontology, catalog] = await Promise.all([ontologyLoad, capabilityCatalogLoad]);
    return Object.freeze({
      releaseId: release.id,
      releaseFingerprint: header.releaseFingerprint,
      releaseStatus: release.status,
      mode,
      definitionVersionIds: Object.freeze([...definitionVersionIds]),
      capabilityCount: catalog.value.length,
      ontologyFingerprint: ontology.value.fingerprint,
      ontologyLatencyMs: ontology.latencyMs,
      capabilityCatalogLatencyMs: catalog.latencyMs,
      latencyMs: Date.now() - startedAt,
      artifactSource: 'memory',
      artifactBuiltAt: null,
    });
  }
}

const releaseWarmupSelect = {
  id: true,
  status: true,
  scope: true,
  versionMap: true,
  rollout: true,
  items: {
    where: { resourceType: 'skill' },
    orderBy: { resourceVersionId: 'asc' },
    select: {
      resourceVersionId: true,
      resourceType: true,
      resourceKey: true,
      snapshot: true,
      resourceVersion: { select: { checksum: true } },
    },
  },
} as const;

const releaseWarmupHeaderSelect = {
  id: true,
  status: true,
  scope: true,
  versionMap: true,
  rollout: true,
  items: {
    where: { resourceType: 'skill' },
    orderBy: { resourceVersionId: 'asc' },
    select: {
      resourceVersionId: true,
      resourceType: true,
      resourceKey: true,
      resourceVersion: { select: { checksum: true } },
    },
  },
} as const;

function releaseMode(value: Prisma.JsonValue): unknown {
  return record(value).mode;
}

function releaseCandidates(release: ReleaseWarmupRow): BrainCapabilityCandidate[] {
  return release.items.map((item) => record(item.snapshot) as unknown as BrainCapabilityCandidate);
}

function releaseArtifactHeader(release: ReleaseWarmupHeader): {
  id: number;
  versionMap: Prisma.JsonValue;
  releaseFingerprint: string;
} {
  return {
    id: release.id,
    versionMap: release.versionMap,
    releaseFingerprint: createReleaseFingerprint([...release.items], release.rollout),
  };
}

function artifactWarmupResult(
  release: Pick<ReleaseWarmupRow, 'id' | 'status' | 'rollout'>,
  artifact: BrainWarmupArtifactRuntimeResult,
): BrainReleaseOntologyWarmupResult {
  if (!isWarmableReleaseStatus(release.status)) {
    throw new Error(`brain_release_warmup_status_invalid:${release.id}:${release.status}`);
  }
  const mode = releaseMode(release.rollout);
  if (mode !== 'model' && mode !== 'shadow') {
    throw new Error(`brain_release_warmup_mode_invalid:${release.id}:${String(mode)}`);
  }
  return Object.freeze({
    releaseId: release.id,
    releaseFingerprint: artifact.releaseFingerprint,
    releaseStatus: release.status,
    mode,
    definitionVersionIds: Object.freeze([...artifact.definitionVersionIds]),
    capabilityCount: artifact.catalog.cards.length,
    ontologyFingerprint: artifact.ontology.fingerprint,
    ontologyLatencyMs: artifact.ontologyLatencyMs,
    capabilityCatalogLatencyMs: artifact.capabilityCatalogLatencyMs,
    latencyMs: Math.max(artifact.ontologyLatencyMs, artifact.capabilityCatalogLatencyMs),
    artifactSource: artifact.source,
    artifactBuiltAt: artifact.builtAt,
  });
}

function isWarmableReleaseStatus(value: string): value is WarmableReleaseStatus {
  return value === 'active' || value === 'draft' || value === 'rolled_back' || value === 'archived';
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function resolveWarmupRetryConfig(env: NodeJS.ProcessEnv = process.env) {
  return {
    maxAttempts: readPositiveInteger(env.BRAIN_ACTIVE_RELEASE_WARMUP_MAX_ATTEMPTS, 3),
    retryDelayMs: readPositiveInteger(env.BRAIN_ACTIVE_RELEASE_WARMUP_RETRY_DELAY_MS, 1000),
    failFast:
      env.BRAIN_ACTIVE_RELEASE_WARMUP_FAIL_FAST === undefined
        ? env.NODE_ENV === 'production'
        : env.BRAIN_ACTIVE_RELEASE_WARMUP_FAIL_FAST === 'true',
  };
}

function resolveWarmupPipeline(env: NodeJS.ProcessEnv = process.env): 'legacy' | 'staged' | 'shared' | 'artifact' {
  const value = env.BRAIN_ONTOLOGY_WARMUP_PIPELINE?.trim().toLowerCase();
  return value === 'legacy' || value === 'staged' || value === 'artifact' ? value : 'shared';
}

function isTransientWarmupError(error: unknown): boolean {
  const candidate = error as { code?: unknown; cause?: { code?: unknown } } | null;
  const code = String(candidate?.code ?? candidate?.cause?.code ?? '').toUpperCase();
  if (
    code === 'ETIMEDOUT' ||
    code === 'ECONNRESET' ||
    code === 'ECONNREFUSED' ||
    code === 'EPIPE' ||
    code === '53300' ||
    code === '57P01' ||
    code.startsWith('08')
  ) {
    return true;
  }

  const message = errorMessage(error).toLowerCase();
  return [
    'timeout exceeded when trying to connect',
    'connection terminated unexpectedly',
    'server closed the connection unexpectedly',
    'remaining connection slots are reserved',
    'too many clients',
    'socket hang up',
    'connection reset',
  ].some((fragment) => message.includes(fragment));
}

function readPositiveInteger(value: string | undefined, fallback: number): number {
  if (value === undefined || value.trim() === '') return fallback;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function timed<T>(loader: () => Promise<T>): Promise<{ value: T; latencyMs: number }> {
  const startedAt = Date.now();
  const value = await loader();
  return { value, latencyMs: Date.now() - startedAt };
}

function freezeStatus(input: BrainActiveReleaseWarmupStatus): BrainActiveReleaseWarmupStatus {
  return Object.freeze({
    ...input,
    phases: Object.freeze({ ...input.phases }),
    releases: Object.freeze([...input.releases]),
  });
}

function emptyPhases(): BrainActiveReleaseWarmupStatus['phases'] {
  return Object.freeze({
    releaseDiscoveryMs: 0,
    artifactLookupMs: 0,
    itemFetchMs: 0,
    definitionPreloadMs: 0,
    releaseWarmupMs: 0,
  });
}
