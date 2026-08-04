import { Injectable, Logger, type OnApplicationBootstrap } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service.js';
import { BrainCapabilityCatalogService } from '../capability/brain-capability-catalog.service.js';
import type { BrainCapabilityCandidate } from '../capability/brain-capability.types.js';
import { BrainOntologyRuntimeService } from '../cognition/brain-ontology-runtime.service.js';
import { extractBrainReleaseDefinitionVersionIds } from './brain-release-definition-versions.js';

type WarmableReleaseStatus = 'active' | 'draft' | 'rolled_back' | 'archived';
export type BrainActiveReleaseWarmupStartupMode = 'blocking' | 'background';

export interface BrainReleaseOntologyWarmupResult {
  readonly releaseId: number;
  readonly releaseStatus: WarmableReleaseStatus;
  readonly mode: 'model' | 'shadow';
  readonly definitionVersionIds: readonly number[];
  readonly capabilityCount: number;
  readonly ontologyFingerprint: string;
  readonly ontologyLatencyMs: number;
  readonly capabilityCatalogLatencyMs: number;
  readonly latencyMs: number;
}

export interface BrainActiveReleaseWarmupStatus {
  readonly startupMode: BrainActiveReleaseWarmupStartupMode;
  readonly applicationReadinessRequired: boolean;
  readonly state: 'pending' | 'warming' | 'ready' | 'failed';
  readonly startedAt: string | null;
  readonly completedAt: string | null;
  readonly latencyMs: number | null;
  readonly activeReleaseCount: number;
  readonly warmedReleaseCount: number;
  readonly releases: readonly BrainReleaseOntologyWarmupResult[];
  readonly failureReason: string | null;
}

interface ReleaseWarmupRow {
  readonly id: number;
  readonly status: string;
  readonly rollout: Prisma.JsonValue;
  readonly items: readonly { readonly snapshot: Prisma.JsonValue }[];
}

@Injectable()
export class BrainActiveReleaseWarmupService implements OnApplicationBootstrap {
  private readonly logger = new Logger(BrainActiveReleaseWarmupService.name);
  private readonly startupMode = resolveStartupMode();
  private warmActiveLoading?: Promise<BrainActiveReleaseWarmupStatus>;
  private status: BrainActiveReleaseWarmupStatus = freezeStatus({
    startupMode: this.startupMode,
    applicationReadinessRequired: this.startupMode === 'blocking',
    state: 'pending',
    startedAt: null,
    completedAt: null,
    latencyMs: null,
    activeReleaseCount: 0,
    warmedReleaseCount: 0,
    releases: [],
    failureReason: null,
  });

  constructor(
    private readonly prisma: PrismaService,
    private readonly ontologyRuntime: BrainOntologyRuntimeService,
    private readonly capabilityCatalog: BrainCapabilityCatalogService,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    if (process.env.BRAIN_RELEASE_PILOT_MODE === 'true') {
      const completedAt = new Date().toISOString();
      this.status = freezeStatus({
        startupMode: this.startupMode,
        applicationReadinessRequired: this.startupMode === 'blocking',
        state: 'ready',
        startedAt: completedAt,
        completedAt,
        latencyMs: 0,
        activeReleaseCount: 0,
        warmedReleaseCount: 0,
        releases: [],
        failureReason: null,
      });
      this.logger.log('active_release_ontology_warmup_skipped reason=release_pilot');
      return;
    }
    if (this.startupMode === 'background') {
      void this.warmActiveReleases().catch((error) => {
        this.logger.warn(
          `active_release_ontology_warmup_background_failed reason=${errorMessage(error)}`,
        );
      });
      this.logger.log('active_release_ontology_warmup_started mode=background');
      return;
    }
    await this.warmActiveReleases();
  }

  getStatus(): BrainActiveReleaseWarmupStatus {
    return this.status;
  }

  isApplicationReadinessRequired(): boolean {
    return this.startupMode === 'blocking';
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
      startupMode: this.startupMode,
      applicationReadinessRequired: this.startupMode === 'blocking',
      state: 'warming',
      startedAt,
      completedAt: null,
      latencyMs: null,
      activeReleaseCount: 0,
      warmedReleaseCount: 0,
      releases: [],
      failureReason: null,
    });
    try {
      const activeReleases = await this.prisma.brainRelease.findMany({
        where: { status: 'active' },
        orderBy: { activatedAt: 'desc' },
        select: releaseWarmupSelect,
      });
      const warmed = (
        await Promise.all(activeReleases.map((release) => this.warmReleaseRow(release)))
      ).filter((result): result is BrainReleaseOntologyWarmupResult => result !== null);
      const completedAtMs = Date.now();
      this.status = freezeStatus({
        startupMode: this.startupMode,
        applicationReadinessRequired: this.startupMode === 'blocking',
        state: 'ready',
        startedAt,
        completedAt: new Date(completedAtMs).toISOString(),
        latencyMs: completedAtMs - startedAtMs,
        activeReleaseCount: activeReleases.length,
        warmedReleaseCount: warmed.length,
        releases: warmed,
        failureReason: null,
      });
      this.logger.log(
        `active_release_ontology_warmup_ready active=${activeReleases.length} warmed=${warmed.length} latencyMs=${completedAtMs - startedAtMs}`,
      );
      return this.status;
    } catch (error) {
      const completedAtMs = Date.now();
      const failureReason = errorMessage(error);
      this.status = freezeStatus({
        startupMode: this.startupMode,
        applicationReadinessRequired: this.startupMode === 'blocking',
        state: 'failed',
        startedAt,
        completedAt: new Date(completedAtMs).toISOString(),
        latencyMs: completedAtMs - startedAtMs,
        activeReleaseCount: this.status.activeReleaseCount,
        warmedReleaseCount: 0,
        releases: [],
        failureReason,
      });
      this.logger.error(`active_release_ontology_warmup_failed reason=${failureReason}`);
      throw error;
    }
  }

  private async warmReleaseRow(
    release: ReleaseWarmupRow,
  ): Promise<BrainReleaseOntologyWarmupResult | null> {
    if (!isWarmableReleaseStatus(release.status)) {
      throw new Error(`brain_release_warmup_status_invalid:${release.id}:${release.status}`);
    }
    const mode = releaseMode(release.rollout);
    if (mode !== 'model' && mode !== 'shadow') return null;
    const candidates = release.items.map(
      (item) => record(item.snapshot) as unknown as BrainCapabilityCandidate,
    );
    if (candidates.length === 0) {
      throw new Error(`brain_release_warmup_capabilities_missing:${release.id}`);
    }
    const definitionVersionIds = extractBrainReleaseDefinitionVersionIds(candidates);
    if (definitionVersionIds.length === 0) {
      throw new Error(`brain_release_warmup_definition_refs_missing:${release.id}`);
    }
    const startedAt = Date.now();
    const ontologyLoad = timed(() => this.ontologyRuntime.loadEvaluationSnapshot(definitionVersionIds));
    const capabilityCatalogLoad = timed(() => this.capabilityCatalog.listEnabledCapabilities(candidates));
    const [ontology, catalog] = await Promise.all([ontologyLoad, capabilityCatalogLoad]);
    return Object.freeze({
      releaseId: release.id,
      releaseStatus: release.status,
      mode,
      definitionVersionIds: Object.freeze([...definitionVersionIds]),
      capabilityCount: catalog.value.length,
      ontologyFingerprint: ontology.value.fingerprint,
      ontologyLatencyMs: ontology.latencyMs,
      capabilityCatalogLatencyMs: catalog.latencyMs,
      latencyMs: Date.now() - startedAt,
    });
  }
}

const releaseWarmupSelect = {
  id: true,
  status: true,
  rollout: true,
  items: {
    where: { resourceType: 'skill' },
    orderBy: { resourceVersionId: 'asc' },
    select: { snapshot: true },
  },
} as const;

function releaseMode(value: Prisma.JsonValue): unknown {
  return record(value).mode;
}

function isWarmableReleaseStatus(value: string): value is WarmableReleaseStatus {
  return value === 'active' || value === 'draft' || value === 'rolled_back' || value === 'archived';
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function resolveStartupMode(): BrainActiveReleaseWarmupStartupMode {
  const raw = process.env.BRAIN_ACTIVE_RELEASE_WARMUP_STARTUP_MODE?.trim().toLowerCase();
  if (!raw || raw === 'blocking') return 'blocking';
  if (raw === 'background') return 'background';
  throw new Error(
    `invalid_brain_active_release_warmup_startup_mode:${process.env.BRAIN_ACTIVE_RELEASE_WARMUP_STARTUP_MODE}`,
  );
}

async function timed<T>(loader: () => Promise<T>): Promise<{ value: T; latencyMs: number }> {
  const startedAt = Date.now();
  const value = await loader();
  return { value, latencyMs: Date.now() - startedAt };
}

function freezeStatus(input: BrainActiveReleaseWarmupStatus): BrainActiveReleaseWarmupStatus {
  return Object.freeze({
    ...input,
    releases: Object.freeze([...input.releases]),
  });
}
