import { BadRequestException, ConflictException, Injectable, OnModuleInit, Optional } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { createHash } from 'node:crypto';
import { basename, resolve } from 'node:path';
import { PrismaService } from '../../prisma/prisma.service.js';
import { BrainCapabilityCatalogService } from '../capability/brain-capability-catalog.service.js';
import { BrainCapabilityScannerService } from '../capability/brain-capability-scanner.service.js';
import { BrainCapabilitySemanticVerifierService } from '../capability/brain-capability-semantic-verifier.service.js';
import { evaluateCapabilitySourceFreshness } from '../capability/brain-capability-source-freshness.js';
import type { BrainCapabilityScanReport } from '../capability/brain-capability-scan.types.js';
import type { BrainCapabilityCatalogValidationReport } from '../capability/brain-capability.types.js';
import type { BrainCapabilityCandidate } from '../capability/brain-capability.types.js';
import { jsonChecksum } from '../eval/ami-brain-product-acceptance.js';
import { caseIdsChecksum } from '../eval/ami-brain-suite-manifest.js';
import type { BrainEvaluationReleaseSnapshot } from './brain-evaluation-release-snapshot.js';
import { BrainActiveReleaseWarmupService } from './brain-active-release-warmup.service.js';
import { createReleaseFingerprint, lockReleaseResources } from './brain-capability-regeneration-fingerprint.js';
import { extractBrainReleaseDefinitionVersionIds } from './brain-release-definition-versions.js';
import {
  BRAIN_QUERY_ONLY_ALLOWED_CAPABILITY_KEYS,
  BRAIN_QUERY_ONLY_PRODUCT_PROFILE,
  brainReleaseActionsEnabled,
  brainReleaseProductProfileSummary,
  filterCapabilitiesForBrainReleaseProductProfile,
  normalizeBrainReleaseProductProfileRollout,
  validateBrainReleaseProductProfile,
} from './brain-release-product-profile.js';

const ACTIVE_RUNTIME_RELEASE_CACHE_TTL_MS = 1_000;
const RUNTIME_RELEASE_SCOPES = ['global', 'store', 'user', 'role', 'percentage'] as const;
const ROLLOUT_SEQUENCE_STAGES = ['shadow', 'canary_5', 'canary_20', 'canary_50', 'full'] as const;
const PERFORMANCE_BUCKET_POLICY = {
  quick: { count: 20, budgetsMs: { p50: 1500, p95: 3000, max: 5000 } },
  single: { count: 20, budgetsMs: { p50: 3000, p95: 8000, max: 12000 } },
  multi: { count: 10, budgetsMs: { p50: 6000, p95: 15000, max: 20000 } },
  multiTurn: { count: 10, budgetsMs: { p50: 8000, p95: 20000, max: 25000 } },
} as const;
const APPROVED_PERFORMANCE_MANIFESTS: Record<string, { manifestChecksum: string; caseIdsChecksum: string }> = {
  '2026-07-29-v1': {
    manifestChecksum: 'f529a9ad14651c3a98bd281bc9281631b00c62465fe8fd2e493907f9fcfd0101',
    caseIdsChecksum: '4f97cc54be8e347cf36bd483f919e261538753645fcb077c864061c5415a1342',
  },
};

export interface BrainReleaseReadiness {
  status: 'ready' | 'blocked' | 'unavailable';
  canRelease: boolean;
  evaluationReleaseId: number | null;
  evalRunId: number | null;
  releaseFingerprint: string | null;
  suiteChecksum: string | null;
  questionCount: number | null;
  provider: string | null;
  model: string | null;
  generatedAt: string | null;
  expiresAt: string | null;
  blockers: string[];
}

@Injectable()
export class BrainReleaseService implements OnModuleInit {
  private readonly evaluationReleaseSnapshotCache = new Map<number, Promise<BrainEvaluationReleaseSnapshot>>();
  private readonly governancePolicySnapshotCache = new Map<number, Promise<GovernancePolicyRuntimeSnapshot>>();
  private activeRuntimeReleaseCache?: {
    expiresAt: number;
    fingerprint: string;
    releases: readonly ActiveRuntimeRelease[];
  };
  private activeRuntimeReleaseLoading?: Promise<readonly ActiveRuntimeRelease[]>;
  private activeRuntimeReleaseCacheGeneration = 0;
  private capabilitySourceScanLoading?: Promise<BrainCapabilityScanReport>;

  constructor(
    @Optional() private readonly prisma?: PrismaService,
    @Optional() private readonly semanticVerifier?: BrainCapabilitySemanticVerifierService,
    @Optional() private readonly capabilityCatalog?: BrainCapabilityCatalogService,
    @Optional() private readonly capabilityScanner?: BrainCapabilityScannerService,
    @Optional() private readonly activeReleaseWarmup?: BrainActiveReleaseWarmupService,
  ) {}

  onModuleInit(): void {
    if (!this.prisma) return;
    void this.loadActiveRuntimeReleases().catch(() => undefined);
  }

  buildRollbackPlan(currentReleaseKey: string, previousReleaseKey: string) {
    return {
      currentReleaseKey,
      previousReleaseKey,
      steps: ['disable_current_release', 'enable_previous_release', 'record_release_log'],
    };
  }

  async createRolloutSequence(input: {
    releaseKey: string;
    resourceVersionIds: number[];
    createdBy: number;
    productProfile?: string;
  }) {
    const productProfile = input.productProfile ? { productProfile: input.productProfile } : {};
    const stages = [
      { suffix: 'shadow', rollout: { ...productProfile, stage: 'shadow', mode: 'shadow', userPercentage: 100 } },
      { suffix: 'canary-5', rollout: { ...productProfile, stage: 'canary_5', mode: 'model', userPercentage: 5 } },
      { suffix: 'canary-20', rollout: { ...productProfile, stage: 'canary_20', mode: 'model', userPercentage: 20 } },
      { suffix: 'canary-50', rollout: { ...productProfile, stage: 'canary_50', mode: 'model', userPercentage: 50 } },
      { suffix: 'full', rollout: { ...productProfile, stage: 'full', mode: 'model', userPercentage: 100, productionBaseline: true } },
    ] as const;
    const releases: unknown[] = [];
    let previousReleaseId: number | undefined;
    for (const stage of stages) {
      const created = await this.createRelease({
        releaseKey: `${input.releaseKey}-${stage.suffix}`,
        scope: 'percentage',
        rollout: stage.rollout,
        resourceVersionIds: input.resourceVersionIds,
        createdBy: input.createdBy,
      });
      const release = previousReleaseId
        ? await this.requirePrisma().brainRelease.update({
            where: { id: created.id },
            data: { previousReleaseId },
          })
        : created;
      releases.push(release);
      previousReleaseId = created.id;
    }
    return { items: releases, stages: stages.map((stage) => stage.rollout.stage) };
  }

  async rejectRelease(input: { releaseId: number; reason: string }) {
    const prisma = this.requirePrisma();
    const reason = this.nonEmpty(input.reason, 'reason');
    const release = await prisma.brainRelease.findUnique({
      where: { id: input.releaseId },
      select: { status: true, rolloutSequenceId: true },
    });
    if (!release || release.status !== 'draft') throw new BadRequestException('release_not_draft');
    if (release.rolloutSequenceId) {
      throw new BadRequestException('rollout_sequence_release_requires_sequence_control');
    }
    const claim = await prisma.brainRelease.updateMany({
      where: { id: input.releaseId, status: 'draft' },
      data: { status: 'archived', failureReason: reason },
    });
    if (claim.count !== 1) throw new BadRequestException('release_not_draft');
    return prisma.brainRelease.update({ where: { id: input.releaseId }, data: { failureReason: reason } });
  }

  async resolveRuntimeMode(input: { storeId: number; userId: number; roleKey: string; evaluationReleaseId?: number }) {
    const evaluationRequested = input.evaluationReleaseId !== undefined;
    if (evaluationRequested) {
      const snapshot = await this.freezeEvaluationRelease(input.evaluationReleaseId!);
      return {
        mode: snapshot.mode,
        declaredMode: snapshot.declaredMode,
        release: { id: snapshot.releaseId, releaseKey: snapshot.releaseKey, status: snapshot.releaseStatus },
        capabilityCandidates: snapshot.capabilityCandidates,
        releaseSnapshot: snapshot,
      };
    }
    const release = await this.selectRelease(input);
    const rollout = release ? this.record(release.rollout) : {};
    const declaredMode = rollout.mode;
    const unfilteredReleaseCapabilityCandidates =
      release && (declaredMode === 'model' || declaredMode === 'shadow')
        ? deepCloneFreeze(
            release.items
              .filter((item) => item.resourceType === 'skill')
              .map((item) => this.record(item.snapshot) as unknown as BrainCapabilityCandidate),
          )
        : undefined;
    const releaseCapabilityCandidates = unfilteredReleaseCapabilityCandidates
      ? deepCloneFreeze(filterCapabilitiesForBrainReleaseProductProfile(rollout, unfilteredReleaseCapabilityCandidates))
      : undefined;
    const governancePolicy = release
      ? await this.resolveGovernancePolicyRuntime(release, releaseCapabilityCandidates)
      : undefined;
    const capabilityCandidates =
      governancePolicy?.mode === 'enforced' && releaseCapabilityCandidates
        ? deepCloneFreeze(
            releaseCapabilityCandidates.filter((candidate) =>
              governancePolicy.allowedCapabilityKeys.includes(String(candidate.key ?? '')),
            ),
          )
        : releaseCapabilityCandidates;
    const mode = declaredMode;
    return mode === 'rules' || mode === 'shadow' || mode === 'model'
      ? {
          mode,
          declaredMode,
          release,
          capabilityCandidates,
          governancePolicy,
          productProfile: brainReleaseProductProfileSummary(rollout),
        }
      : {
          mode: undefined,
          declaredMode: undefined,
          release,
          capabilityCandidates,
          governancePolicy,
          productProfile: brainReleaseProductProfileSummary(rollout),
        };
  }

  async freezeEvaluationRelease(releaseId: number): Promise<BrainEvaluationReleaseSnapshot> {
    const cached = this.evaluationReleaseSnapshotCache.get(releaseId);
    if (cached) return cached;
    const loading = this.loadEvaluationReleaseSnapshot(releaseId);
    this.evaluationReleaseSnapshotCache.set(releaseId, loading);
    try {
      return await loading;
    } catch (error) {
      this.evaluationReleaseSnapshotCache.delete(releaseId);
      throw error;
    }
  }

  loadFreshEvaluationRelease(releaseId: number): Promise<BrainEvaluationReleaseSnapshot> {
    return this.loadEvaluationReleaseSnapshot(releaseId);
  }

  private async loadEvaluationReleaseSnapshot(releaseId: number): Promise<BrainEvaluationReleaseSnapshot> {
    const release = await this.selectEvaluationRelease(releaseId);
    const skillItems = await this.requirePrisma().brainReleaseItem.findMany({
      where: { releaseId, resourceType: 'skill' },
      select: { snapshot: true },
      orderBy: { resourceVersionId: 'asc' },
    });
    const declaredMode = this.record(release.rollout).mode;
    if (declaredMode !== 'rules' && declaredMode !== 'shadow' && declaredMode !== 'model') {
      throw new BadRequestException('evaluation_release_mode_invalid');
    }
    const unfilteredCapabilityCandidates = skillItems.map(
      (item) => this.record(item.snapshot) as unknown as BrainCapabilityCandidate,
    );
    const rollout = this.record(release.rollout);
    const capabilityCandidates = filterCapabilitiesForBrainReleaseProductProfile(
      rollout,
      unfilteredCapabilityCandidates,
    );
    const blockers = validateBrainReleaseProductProfile(rollout, unfilteredCapabilityCandidates);
    if (blockers.length) throw new BadRequestException(blockers[0]);
    return deepCloneFreeze({
      releaseId: release.id,
      releaseKey: release.releaseKey,
      releaseStatus: release.status as 'draft' | 'active',
      releaseFingerprint: createReleaseFingerprint(release.items, release.rollout),
      declaredMode,
      mode: declaredMode === 'rules' ? 'rules' : 'model',
      resourceVersionIds: release.items.map((item) => item.resourceVersionId).sort((left, right) => left - right),
      capabilityKeys: capabilityCandidates
        .map((candidate) => candidate.key)
        .filter((key): key is string => typeof key === 'string')
        .sort(),
      capabilityCandidates,
      productProfile: brainReleaseProductProfileSummary(rollout),
    });
  }

  async validateReleaseCatalog(releaseId: number) {
    const snapshot = await this.freezeEvaluationRelease(releaseId);
    const sourceFreshness = await this.validateCapabilitySourceFreshness(snapshot.capabilityCandidates);
    const report = this.capabilityCatalog
      ? await this.capabilityCatalog.validateEnabledCapabilities(snapshot.capabilityCandidates)
      : ({
          valid: false,
          cards: [],
          issues: [
            {
              capabilityKey: '*',
              capabilityVersion: 0,
              code: 'permission_registry_unavailable',
              message: 'Capability catalog service is unavailable.',
            },
          ],
        } as BrainCapabilityCatalogValidationReport);
    return {
      valid: report.valid && sourceFreshness.valid,
      capabilityCount: snapshot.capabilityCandidates.length,
      cardCount: report.cards.length,
      issueCount: report.issues.length,
      issues: report.issues,
      sourceFreshness,
    };
  }

  async createRelease(input: {
    releaseKey: string;
    scope: string;
    rollout: Record<string, unknown>;
    resourceVersionIds: number[];
    createdBy: number;
  }) {
    const prisma = this.requirePrisma();
    const releaseKey = this.nonEmpty(input.releaseKey, 'releaseKey');
    const scope = input.scope || 'global';
    if (!(RUNTIME_RELEASE_SCOPES as readonly string[]).includes(scope)) {
      throw new BadRequestException('runtime_release_scope_invalid');
    }
    const versions = await prisma.brainResourceVersion.findMany({ where: { id: { in: input.resourceVersionIds } } });
    if (!versions.length || versions.length !== new Set(input.resourceVersionIds).size) {
      throw new BadRequestException('release_resource_versions_incomplete');
    }
    this.assertResourcesManagedHere(versions);
    const duplicateKeys = new Set<string>();
    for (const version of versions) {
      const key = `${version.resourceType}:${version.resourceKey}`;
      if (duplicateKeys.has(key)) throw new BadRequestException(`duplicate_release_resource:${key}`);
      duplicateKeys.add(key);
    }
    const previous = await prisma.brainRelease.findFirst({
      where: { status: 'active', scope: { in: [...RUNTIME_RELEASE_SCOPES] } },
      orderBy: { activatedAt: 'desc' },
    });
    const versionMap = Object.fromEntries(
      versions.map((item) => [`${item.resourceType}:${item.resourceKey}`, item.version]),
    );
    let normalizedRollout: Record<string, unknown>;
    try {
      normalizedRollout = normalizeBrainReleaseProductProfileRollout(input.rollout ?? {});
    } catch (error) {
      throw new BadRequestException(error instanceof Error ? error.message : 'brain_release_product_profile_invalid');
    }
    const capabilityCandidates = versions
      .filter((version) => version.resourceType === 'skill')
      .map((version) => ({ ...this.record(version.snapshot), key: version.resourceKey }));
    const productProfileBlockers = validateBrainReleaseProductProfile(normalizedRollout, capabilityCandidates);
    if (productProfileBlockers.length) throw new BadRequestException(productProfileBlockers[0]);
    const rollout = {
      ...normalizedRollout,
      semanticSnapshotFingerprint: createSemanticSnapshotFingerprint(versions),
    };
    return prisma.$transaction(async (tx) => {
      const release = await tx.brainRelease.create({
        data: {
          releaseKey,
          scope,
          rollout: this.toJson(rollout),
          versionMap: this.toJson(versionMap),
          status: 'draft',
          previousReleaseId: previous?.id,
          createdBy: input.createdBy,
        },
      });
      await tx.brainReleaseItem.createMany({
        data: versions.map((version) => ({
          releaseId: release.id,
          resourceVersionId: version.id,
          resourceType: version.resourceType,
          resourceKey: version.resourceKey,
          version: version.version,
          snapshot: this.toJson(version.snapshot),
        })),
      });
      return release;
    });
  }

  async activateRelease(input: {
    releaseId: number;
    activatedBy: number;
    rolloutTransition?: { sequenceId: number; fromStage: string; toStage: string };
  }) {
    const prisma = this.requirePrisma();
    const release = await prisma.brainRelease.findUnique({
      where: { id: input.releaseId },
      include: { items: { include: { resourceVersion: true } } },
    });
    if (!release || release.status !== 'draft') throw new BadRequestException('release_not_draft');
    if (release.scope === 'governance_policy') throw new BadRequestException('policy_snapshot_requires_policy_publish');
    if (this.record(release.rollout).evaluationOnly === true) {
      throw new BadRequestException('release_evaluation_only');
    }
    await this.assertRolloutSequenceActivation(prisma, release, input.rolloutTransition);
    this.assertReleaseProductProfile(release);
    const releaseFingerprint = createReleaseFingerprint(release.items, release.rollout);
    const regenerationDelegate = (
      prisma as unknown as {
        brainCapabilityRegenerationJob?: {
          findFirst(input: Record<string, unknown>): Promise<{ id: number; status?: string } | null>;
        };
      }
    ).brainCapabilityRegenerationJob;
    const regeneration = regenerationDelegate
      ? await regenerationDelegate.findFirst({
          where: { releaseFingerprint },
          select: { id: true, status: true },
        })
      : null;
    if (regeneration) throw new BadRequestException('modification_superseded');
    if (!release.items.length) throw new BadRequestException('release_has_no_resource_items');
    this.assertReleaseItemsConsistent(release.items);
    this.assertDeployableRuntimeRelease(release);
    this.assertSemanticSnapshotFingerprint(release);
    await this.assertGovernancePolicyBinding(prisma, release);
    await this.assertCapabilitySourceFreshness(
      release.items
        .filter((item) => item.resourceType === 'skill')
        .map((item) => this.record(item.resourceVersion.snapshot) as unknown as BrainCapabilityCandidate),
    );
    await this.assertReleaseEvalEvidence(prisma, release, releaseFingerprint);
    await this.validateGeneratedCapabilities(release.items.map((item) => item.resourceVersion));
    await this.validateDependencies(release.items.map((item) => item.resourceVersion));
    await this.activeReleaseWarmup?.warmRelease({ releaseId: release.id, expectedStatus: 'draft' });

    const activated = await this.runSerializable('release_activation_conflict', async (tx) => {
      await lockReleaseResources(tx, release.id);
      const lockedRelease = await tx.brainRelease.findUnique({
        where: { id: release.id },
        include: { items: { include: { resourceVersion: true } } },
      });
      if (!lockedRelease || lockedRelease.status !== 'draft') throw new BadRequestException('release_not_draft');
      if (this.record(lockedRelease.rollout).evaluationOnly === true) {
        throw new BadRequestException('release_evaluation_only');
      }
      await this.assertRolloutSequenceActivation(
        tx as unknown as PrismaService,
        lockedRelease,
        input.rolloutTransition,
      );
      this.assertReleaseProductProfile(lockedRelease);
      const lockedFingerprint = createReleaseFingerprint(lockedRelease.items, lockedRelease.rollout);
      this.assertDeployableRuntimeRelease(lockedRelease);
      this.assertSemanticSnapshotFingerprint(lockedRelease);
      await this.assertGovernancePolicyBinding(tx as unknown as PrismaService, lockedRelease);
      await this.assertReleaseEvalEvidence(tx as unknown as PrismaService, lockedRelease, lockedFingerprint);
      const modification = await tx.brainCapabilityRegenerationJob.findFirst({
        where: { releaseFingerprint: lockedFingerprint },
        select: { id: true, status: true },
      });
      if (modification) throw new BadRequestException('modification_superseded');
      const activatedAt = new Date();
      const claim = await tx.brainRelease.updateMany({
        where: { id: lockedRelease.id, status: 'draft' },
        data: { status: 'active', activatedAt, failureReason: null },
      });
      if (claim.count !== 1) throw new ConflictException('release_activation_conflict');
      if (lockedRelease.scope === 'global') {
        await tx.brainRelease.updateMany({
          where: {
            status: 'active',
            scope: { in: [...RUNTIME_RELEASE_SCOPES] },
            id: { not: lockedRelease.id },
          },
          data: { status: 'archived' },
        });
      }
      for (const item of lockedRelease.items) {
        await tx.brainResourceVersion.updateMany({
          where: { resourceType: item.resourceType, resourceKey: item.resourceKey, status: 'active' },
          data: { status: 'archived', archivedAt: activatedAt },
        });
        await tx.brainResourceVersion.update({
          where: { id: item.resourceVersionId },
          data: { status: 'active', activatedAt, archivedAt: null },
        });
        await this.activateSource(tx, item.resourceVersion);
      }
      return tx.brainRelease.update({
        where: { id: lockedRelease.id },
        data: { activatedAt, failureReason: null },
        include: { items: true },
      });
    }, 300_000);
    this.invalidateActiveRuntimeReleaseCache();
    return activated;
  }

  private async assertRolloutSequenceActivation(
    prisma: PrismaService,
    release: { rolloutSequenceId?: number | null; rolloutStage?: string | null },
    transition?: { sequenceId: number; fromStage: string; toStage: string },
  ) {
    if (!release.rolloutSequenceId) {
      if (transition) throw new BadRequestException('rollout_sequence_transition_identity_mismatch');
      return;
    }
    if (!transition) {
      throw new BadRequestException('rollout_sequence_release_requires_sequence_transition');
    }
    if (
      transition.sequenceId !== release.rolloutSequenceId
      || transition.toStage !== release.rolloutStage
    ) {
      throw new BadRequestException('rollout_sequence_transition_identity_mismatch');
    }
    const sequence = await prisma.brainRolloutSequence.findUnique({
      where: { id: release.rolloutSequenceId },
      select: { status: true, currentStage: true },
    });
    if (!sequence) throw new BadRequestException('rollout_sequence_not_found');
    if (sequence.currentStage !== transition.fromStage) {
      throw new BadRequestException('rollout_sequence_stage_changed');
    }
    const currentIndex = ROLLOUT_SEQUENCE_STAGES.indexOf(
      transition.fromStage as (typeof ROLLOUT_SEQUENCE_STAGES)[number],
    );
    const expectedNextStage = currentIndex >= 0 ? ROLLOUT_SEQUENCE_STAGES[currentIndex + 1] : undefined;
    const activatesShadow = transition.fromStage === 'shadow' && transition.toStage === 'shadow'
      && ['draft', 'paused'].includes(sequence.status);
    const promotesOneStage = sequence.status === 'active' && expectedNextStage === transition.toStage;
    if (!activatesShadow && !promotesOneStage) {
      throw new BadRequestException('rollout_sequence_transition_not_allowed');
    }
  }

  private async validateCapabilitySourceFreshness(candidates: readonly BrainCapabilityCandidate[]) {
    if (!this.capabilityScanner) {
      return {
        valid: false,
        issues: [{ capabilityKey: '*', code: 'source_capability_missing' as const }],
      };
    }
    const scan = await this.loadCurrentCapabilitySourceScan();
    return evaluateCapabilitySourceFreshness(candidates, scan);
  }

  private async assertCapabilitySourceFreshness(candidates: readonly BrainCapabilityCandidate[]): Promise<void> {
    if (!this.capabilityScanner) return;
    const report = await this.validateCapabilitySourceFreshness(candidates);
    if (report.valid) return;
    const keys = report.issues
      .map((issue) => issue.capabilityKey)
      .filter(Boolean)
      .sort();
    throw new BadRequestException(`capability_source_freshness_invalid:${keys.join(',')}`);
  }

  private async loadCurrentCapabilitySourceScan(): Promise<BrainCapabilityScanReport> {
    const cached = this.capabilitySourceScanLoading;
    if (cached) return cached;
    const loading = this.capabilityScanner!.scan({
      workspaceRoot: capabilityWorkspaceRoot(),
      explicitOnly: true,
    });
    this.capabilitySourceScanLoading = loading;
    try {
      return await loading;
    } catch (error) {
      this.capabilitySourceScanLoading = undefined;
      throw error;
    }
  }

  async rollbackRelease(input: {
    releaseId: number;
    reason: string;
    rolloutTransition?: { sequenceId: number; fromStage: string; targetReleaseId: number };
  }) {
    const prisma = this.requirePrisma();
    const current = await prisma.brainRelease.findUnique({
      where: { id: input.releaseId },
      include: { items: { include: { resourceVersion: true } } },
    });
    if (!current || current.status !== 'active') throw new BadRequestException('release_not_active');
    if (current.scope === 'governance_policy') throw new BadRequestException('policy_snapshot_requires_policy_rollback');
    await this.assertRolloutSequenceRollback(prisma, current, input.rolloutTransition);
    const rollbackTargetId = input.rolloutTransition?.targetReleaseId ?? current.previousReleaseId;
    const previous = rollbackTargetId
      ? await prisma.brainRelease.findUnique({
          where: { id: rollbackTargetId },
          include: { items: { include: { resourceVersion: true } } },
        })
      : null;
    if (!previous) throw new BadRequestException('previous_release_not_found');
    this.assertReleaseItemsConsistent(previous.items);
    this.assertDeployableRuntimeRelease(previous);
    this.assertSemanticSnapshotFingerprint(previous);
    const previousVersions = previous.items.map((item) => item.resourceVersion);
    await this.validateGeneratedCapabilities(previousVersions);
    await this.validateDependencies(previousVersions);
    await this.activeReleaseWarmup?.warmRelease({ releaseId: previous.id, expectedStatus: previous.status });
    const rolledBack = await this.runSerializable('release_rollback_conflict', async (tx) => {
      await this.assertRolloutSequenceRollback(
        tx as unknown as PrismaService,
        current,
        input.rolloutTransition,
      );
      const rolledBackAt = new Date();
      const claim = await tx.brainRelease.updateMany({
        where: { id: current.id, status: 'active' },
        data: { status: 'rolled_back', rolledBackAt, failureReason: input.reason },
      });
      if (claim.count !== 1) throw new ConflictException('release_rollback_conflict');
      await this.deactivateSupersededResources(tx, current.items ?? [], previous.items, rolledBackAt);
      for (const item of previous.items) {
        await tx.brainResourceVersion.updateMany({
          where: {
            resourceType: item.resourceType,
            resourceKey: item.resourceKey,
            status: 'active',
            id: { not: item.resourceVersionId },
          },
          data: { status: 'archived', archivedAt: rolledBackAt },
        });
        await tx.brainResourceVersion.update({
          where: { id: item.resourceVersionId },
          data: { status: 'active', activatedAt: rolledBackAt, archivedAt: null },
        });
        await this.activateSource(tx, item.resourceVersion);
      }
      return tx.brainRelease.update({
        where: { id: previous.id },
        data: { status: 'active', activatedAt: rolledBackAt, rolledBackAt: null, failureReason: null },
        include: { items: true },
      });
    });
    this.invalidateActiveRuntimeReleaseCache();
    return rolledBack;
  }

  private async assertRolloutSequenceRollback(
    prisma: PrismaService,
    release: { rolloutSequenceId?: number | null; rolloutStage?: string | null },
    transition?: { sequenceId: number; fromStage: string; targetReleaseId: number },
  ) {
    if (!release.rolloutSequenceId) {
      if (transition) throw new BadRequestException('rollout_sequence_transition_identity_mismatch');
      return;
    }
    if (!transition) {
      throw new BadRequestException('rollout_sequence_release_requires_sequence_rollback');
    }
    if (
      transition.sequenceId !== release.rolloutSequenceId
      || transition.fromStage !== release.rolloutStage
    ) {
      throw new BadRequestException('rollout_sequence_transition_identity_mismatch');
    }
    const sequence = await prisma.brainRolloutSequence.findUnique({
      where: { id: release.rolloutSequenceId },
      select: { status: true, currentStage: true, previousRuntimeReleaseId: true },
    });
    if (!sequence) throw new BadRequestException('rollout_sequence_not_found');
    if (!['active', 'paused'].includes(sequence.status) || sequence.currentStage !== transition.fromStage) {
      throw new BadRequestException('rollout_sequence_stage_changed');
    }
    if (!sequence.previousRuntimeReleaseId || sequence.previousRuntimeReleaseId !== transition.targetReleaseId) {
      throw new BadRequestException('rollout_sequence_rollback_target_mismatch');
    }
  }

  async rollbackToRules(input: { releaseId: number; reason: string }) {
    return this.rollbackToProductionBaseline(input);
  }

  async rollbackToProductionBaseline(input: { releaseId: number; reason: string }) {
    const prisma = this.requirePrisma();
    const current = await prisma.brainRelease.findUnique({
      where: { id: input.releaseId },
      include: { items: { include: { resourceVersion: true } } },
    });
    if (!current || current.status !== 'active') throw new BadRequestException('release_not_active');
    if (current.scope === 'governance_policy') throw new BadRequestException('policy_snapshot_requires_policy_rollback');
    if (current.rolloutSequenceId) throw new BadRequestException('rollout_sequence_release_requires_sequence_rollback');
    if (this.record(current.rollout).mode === 'rules') throw new BadRequestException('release_already_rules');

    let previousReleaseId = current.previousReleaseId;
    let target: BrainReleaseWithItems | null = null;
    for (let depth = 0; previousReleaseId && depth < 20; depth += 1) {
      const candidate = await prisma.brainRelease.findUnique({
        where: { id: previousReleaseId },
        include: { items: { include: { resourceVersion: true } } },
      });
      if (!candidate) break;
      const rollout = this.record(candidate.rollout);
      if (rollout.mode === 'model' && rollout.productionBaseline === true && candidate.items.length > 0) {
        target = candidate;
        break;
      }
      previousReleaseId = candidate.previousReleaseId;
    }
    if (!target) throw new BadRequestException('production_baseline_not_found');

    this.assertReleaseItemsConsistent(target.items);
    this.assertDeployableRuntimeRelease(target);
    this.assertSemanticSnapshotFingerprint(target);
    const targetVersions = target.items.map((item) => item.resourceVersion);
    await this.validateGeneratedCapabilities(targetVersions);
    await this.validateDependencies(targetVersions);
    await this.activeReleaseWarmup?.warmRelease({ releaseId: target.id, expectedStatus: target.status });

    const rolledBack = await this.runSerializable('release_rules_rollback_conflict', async (tx) => {
      const rolledBackAt = new Date();
      const claim = await tx.brainRelease.updateMany({
        where: { id: current.id, status: 'active' },
        data: { status: 'rolled_back', rolledBackAt, failureReason: input.reason },
      });
      if (claim.count !== 1) throw new ConflictException('release_rules_rollback_conflict');
      await tx.brainRelease.updateMany({
        where: {
          status: 'active',
          scope: { in: [...RUNTIME_RELEASE_SCOPES] },
          id: { not: target.id },
        },
        data: { status: 'archived' },
      });
      await this.deactivateSupersededResources(tx, current.items ?? [], target.items, rolledBackAt);
      for (const item of target.items) {
        await tx.brainResourceVersion.updateMany({
          where: {
            resourceType: item.resourceType,
            resourceKey: item.resourceKey,
            status: 'active',
            id: { not: item.resourceVersionId },
          },
          data: { status: 'archived', archivedAt: rolledBackAt },
        });
        await tx.brainResourceVersion.update({
          where: { id: item.resourceVersionId },
          data: { status: 'active', activatedAt: rolledBackAt, archivedAt: null },
        });
        await this.activateSource(tx, item.resourceVersion);
      }
      return tx.brainRelease.update({
        where: { id: target.id },
        data: { status: 'active', activatedAt: rolledBackAt, rolledBackAt: null, failureReason: null },
        include: { items: true },
      });
    });
    this.invalidateActiveRuntimeReleaseCache();
    return rolledBack;
  }

  async listReleases(input?: { includeSnapshot?: boolean; includeReadiness?: boolean; take?: number }) {
    const take = Math.max(1, Math.min(100, Number(input?.take) || 30));
    if (input?.includeSnapshot === false) {
      const releases = await this.requirePrisma().brainRelease.findMany({
        where: { scope: { in: [...RUNTIME_RELEASE_SCOPES] } },
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          releaseKey: true,
          scope: true,
          rollout: true,
          status: true,
          previousReleaseId: true,
          activatedAt: true,
          rolledBackAt: true,
          failureReason: true,
          createdAt: true,
          updatedAt: true,
          _count: { select: { items: true } },
        },
        take,
      });
      const items = releases.map(({ _count, ...release }) => ({ ...release, itemCount: _count.items, items: [] }));
      return input?.includeReadiness ? this.attachReleaseReadiness(items) : items;
    }
    const releases = await this.requirePrisma().brainRelease.findMany({
      where: { scope: { in: [...RUNTIME_RELEASE_SCOPES] } },
      orderBy: { createdAt: 'desc' },
      include: { items: true },
      take,
    });
    return input?.includeReadiness ? this.attachReleaseReadiness(releases) : releases;
  }

  async getReleaseReadiness(releaseId: number): Promise<BrainReleaseReadiness> {
    const prisma = this.requirePrisma();
    let releaseFingerprint: string | null = null;
    try {
      const release = await prisma.brainRelease.findUnique({
        where: { id: releaseId },
        include: { items: { include: { resourceVersion: true } } },
      });
      if (!release || release.scope === 'governance_policy') {
        return unavailableReadiness('runtime_release_not_found');
      }
      if (!release.items.length) return blockedReadiness('release_has_no_resource_items');
      this.assertReleaseProductProfile(release);
      releaseFingerprint = createReleaseFingerprint(release.items, release.rollout);
      let evaluationReleaseId = release.id;
      let runs = await this.completedEvalRuns(prisma, release.id);
      if (!runs.length) {
        const linkedReleaseId = Number(this.record(release.rollout).evaluationEvidenceReleaseId);
        if (!Number.isInteger(linkedReleaseId) || linkedReleaseId <= 0 || linkedReleaseId === release.id) {
          return blockedReadiness('release_eval_gate_failed', releaseFingerprint);
        }
        const evidenceRelease = await prisma.brainRelease.findUnique({
          where: { id: linkedReleaseId },
          include: { items: { include: { resourceVersion: true } } },
        });
        const evidenceRollout = this.record(evidenceRelease?.rollout as Prisma.JsonValue);
        const validEvidenceRelease = evidenceRelease && (
          evidenceRollout.evaluationOnly === true ||
          (evidenceRelease.status === 'active' && evidenceRollout.mode === 'shadow')
        );
        if (!validEvidenceRelease) return blockedReadiness('release_eval_evidence_invalid', releaseFingerprint);
        this.assertReleaseProductProfile(evidenceRelease);
        if (createReleaseFingerprint(evidenceRelease.items, evidenceRelease.rollout) !== releaseFingerprint) {
          return blockedReadiness('release_eval_evidence_fingerprint_mismatch', releaseFingerprint);
        }
        evaluationReleaseId = evidenceRelease.id;
        runs = await this.completedEvalRuns(prisma, evidenceRelease.id);
      }
      if (!runs.length) return blockedReadiness('release_eval_gate_failed', releaseFingerprint, evaluationReleaseId);

      await this.assertReleaseEvidenceRuns(
        prisma,
        runs,
        evaluationReleaseId,
        releaseFingerprint,
        this.requiresProductAcceptance(release),
        this.requiresPerformanceAcceptance(release),
      );
      const evidenceRun = runs.find((run) => {
        const summary = this.record(run.summary);
        return this.record(summary.productAcceptance as Prisma.JsonValue).contractVersion === 'ami-brain-release-acceptance/v1';
      }) ?? runs.find((run) => this.record(run.summary).gateMode === 'release_gate') ?? runs[0];
      const summary = this.record(evidenceRun?.summary);
      const productAcceptance = this.record(summary.productAcceptance as Prisma.JsonValue);
      return {
        status: 'ready',
        canRelease: true,
        evaluationReleaseId,
        evalRunId: positiveNumber(evidenceRun?.id ?? summary.runId),
        releaseFingerprint,
        suiteChecksum: optionalText(summary.suiteManifestChecksum ?? productAcceptance.suiteManifestChecksum),
        questionCount: positiveNumber(summary.suiteCaseCount ?? summary.total ?? evidenceRun?.caseCount),
        provider: optionalText(summary.provider ?? productAcceptance.provider),
        model: optionalText(evidenceRun?.modelVersion ?? summary.model ?? productAcceptance.model),
        generatedAt: optionalIsoDate(productAcceptance.generatedAt ?? evidenceRun?.finishedAt ?? evidenceRun?.createdAt),
        expiresAt: optionalIsoDate(productAcceptance.expiresAt),
        blockers: [],
      };
    } catch (error) {
      if (error instanceof BadRequestException || error instanceof ConflictException) {
        return blockedReadiness(error.message, releaseFingerprint);
      }
      return unavailableReadiness(error instanceof Error ? error.message : 'release_readiness_unavailable', releaseFingerprint);
    }
  }

  private async attachReleaseReadiness<T extends { id: number; status?: string }>(releases: T[]) {
    return Promise.all(releases.map(async (release) => ({
      ...release,
      releaseReadiness: release.status === 'draft' || release.status === 'active'
        ? await this.getReleaseReadiness(release.id)
        : unavailableReadiness('release_not_current'),
    })));
  }

  async resolveRuntimeSummary(input: { storeId: number; userId: number; roleKey: string }) {
    const release = await this.selectReleaseSummary(input);
    const declaredMode = release ? this.record(release.rollout).mode : undefined;
    const mode =
      declaredMode === 'rules' || declaredMode === 'shadow' || declaredMode === 'model' ? declaredMode : undefined;
    return {
      mode,
      declaredMode: mode,
      release,
      governancePolicy: release ? governancePolicyBindingSummary(this.record(release.rollout)) : undefined,
      productProfile: release
        ? brainReleaseProductProfileSummary(this.record(release.rollout))
        : brainReleaseProductProfileSummary({}),
    };
  }

  async resolveRuntimeDeploymentIdentity(input: { storeId: number; userId: number; roleKey: string }) {
    const release = await this.selectRelease(input);
    const rollout = release ? this.record(release.rollout) : {};
    const fingerprintRelease = release
      ? await this.requirePrisma().brainRelease.findUnique({
          where: { id: release.id },
          include: { items: { include: { resourceVersion: true } } },
        })
      : null;
    const declaredMode = rollout.mode;
    const mode =
      declaredMode === 'rules' || declaredMode === 'shadow' || declaredMode === 'model'
        ? declaredMode
        : undefined;
    return {
      mode,
      release: release ? { id: release.id, releaseKey: release.releaseKey } : null,
      releaseFingerprint: fingerprintRelease
        ? createReleaseFingerprint(fingerprintRelease.items, fingerprintRelease.rollout)
        : null,
      productProfile: brainReleaseProductProfileSummary(rollout),
    };
  }

  async selectRelease(input: { storeId: number; userId: number; roleKey: string }) {
    const releases = await this.loadActiveRuntimeReleases();
    return releases.find((release) => this.matchesRollout(release.scope, this.record(release.rollout), input)) ?? null;
  }

  async resolveActionExecutionPolicy(input: {
    storeId: number;
    userId: number;
    roleKey: string;
    sourceReleaseId?: number | null;
    sourceReleaseFingerprint?: string | null;
  }) {
    const currentRelease = await this.selectRelease(input);
    const currentRollout = this.record(currentRelease?.rollout as Prisma.JsonValue);
    const currentProfile = brainReleaseProductProfileSummary(currentRollout);
    if (currentRelease && !brainReleaseActionsEnabled(currentRollout)) {
      return {
        allowed: false,
        reason: 'brain_action_execution_disabled_by_release_profile',
        currentReleaseId: currentRelease.id,
        currentProfile,
      } as const;
    }

    if (!input.sourceReleaseId && !input.sourceReleaseFingerprint) {
      return { allowed: true, reason: 'legacy_action_without_release_profile', currentReleaseId: currentRelease?.id ?? null, currentProfile } as const;
    }
    if (
      !Number.isInteger(input.sourceReleaseId) ||
      Number(input.sourceReleaseId) <= 0 ||
      typeof input.sourceReleaseFingerprint !== 'string' ||
      !/^[a-f0-9]{64}$/u.test(input.sourceReleaseFingerprint)
    ) {
      return { allowed: false, reason: 'brain_action_source_release_identity_invalid', currentReleaseId: currentRelease?.id ?? null, currentProfile } as const;
    }
    const sourceRelease = await this.requirePrisma().brainRelease.findUnique({
      where: { id: Number(input.sourceReleaseId) },
      include: { items: { include: { resourceVersion: true } } },
    });
    if (!sourceRelease) {
      return { allowed: false, reason: 'brain_action_source_release_not_found', currentReleaseId: currentRelease?.id ?? null, currentProfile } as const;
    }
    this.assertReleaseProductProfile(sourceRelease);
    if (createReleaseFingerprint(sourceRelease.items, sourceRelease.rollout) !== input.sourceReleaseFingerprint) {
      return { allowed: false, reason: 'brain_action_source_release_fingerprint_mismatch', currentReleaseId: currentRelease?.id ?? null, currentProfile } as const;
    }
    const sourceRollout = this.record(sourceRelease.rollout);
    const sourceProfile = brainReleaseProductProfileSummary(sourceRollout);
    if (!brainReleaseActionsEnabled(sourceRollout)) {
      return {
        allowed: false,
        reason: 'brain_action_execution_disabled_by_release_profile',
        currentReleaseId: currentRelease?.id ?? null,
        currentProfile,
        sourceReleaseId: sourceRelease.id,
        sourceProfile,
      } as const;
    }
    return {
      allowed: true,
      reason: 'release_profile_allows_action_execution',
      currentReleaseId: currentRelease?.id ?? null,
      currentProfile,
      sourceReleaseId: sourceRelease.id,
      sourceProfile,
    } as const;
  }

  private async loadActiveRuntimeReleases(): Promise<readonly ActiveRuntimeRelease[]> {
    const now = Date.now();
    if (this.activeRuntimeReleaseCache && this.activeRuntimeReleaseCache.expiresAt > now) {
      return this.activeRuntimeReleaseCache.releases;
    }
    if (this.activeRuntimeReleaseCache) {
      void this.refreshActiveRuntimeReleases().catch(() => undefined);
      return this.activeRuntimeReleaseCache.releases;
    }
    return this.refreshActiveRuntimeReleases();
  }

  private async refreshActiveRuntimeReleases(): Promise<readonly ActiveRuntimeRelease[]> {
    if (this.activeRuntimeReleaseLoading) return this.activeRuntimeReleaseLoading;
    const previous = this.activeRuntimeReleaseCache;
    const generation = this.activeRuntimeReleaseCacheGeneration;
    const loading = this.requirePrisma()
      .brainRelease.findMany({
        where: { status: 'active', scope: { in: [...RUNTIME_RELEASE_SCOPES] } },
        orderBy: { activatedAt: 'desc' },
        include: { items: true },
      })
      .then((releases) => {
        const fingerprint = createActiveRuntimeReleaseFingerprint(releases);
        const cachedReleases = previous?.fingerprint === fingerprint ? previous.releases : Object.freeze([...releases]);
        if (generation !== this.activeRuntimeReleaseCacheGeneration) return cachedReleases;
        this.activeRuntimeReleaseCache = {
          expiresAt: Date.now() + ACTIVE_RUNTIME_RELEASE_CACHE_TTL_MS,
          fingerprint,
          releases: cachedReleases,
        };
        return cachedReleases;
      });
    this.activeRuntimeReleaseLoading = loading;
    try {
      return await loading;
    } finally {
      if (this.activeRuntimeReleaseLoading === loading) this.activeRuntimeReleaseLoading = undefined;
    }
  }

  private invalidateActiveRuntimeReleaseCache() {
    this.activeRuntimeReleaseCacheGeneration += 1;
    this.activeRuntimeReleaseCache = undefined;
    this.activeRuntimeReleaseLoading = undefined;
  }

  private async selectReleaseSummary(input: { storeId: number; userId: number; roleKey: string }) {
    const releases = await this.requirePrisma().brainRelease.findMany({
      where: { status: 'active', scope: { in: [...RUNTIME_RELEASE_SCOPES] } },
      orderBy: { activatedAt: 'desc' },
      select: { id: true, releaseKey: true, scope: true, rollout: true, status: true, activatedAt: true },
    });
    return releases.find((release) => this.matchesRollout(release.scope, this.record(release.rollout), input)) ?? null;
  }

  private async selectEvaluationRelease(releaseId: number) {
    if (!Number.isInteger(releaseId) || releaseId <= 0) throw new BadRequestException('evaluation_release_id_invalid');
    const release = await this.requirePrisma().brainRelease.findUnique({
      where: { id: releaseId },
      select: {
        id: true,
        releaseKey: true,
        scope: true,
        status: true,
        rollout: true,
        items: {
          select: {
            resourceVersionId: true,
            resourceType: true,
            resourceKey: true,
            resourceVersion: { select: { checksum: true } },
          },
        },
      },
    });
    if (!release) throw new BadRequestException('evaluation_release_not_found');
    if (release.scope === 'governance_policy') throw new BadRequestException('policy_snapshot_not_evaluable');
    if (release.status !== 'draft' && release.status !== 'active') {
      throw new BadRequestException('evaluation_release_not_evaluable');
    }
    return release;
  }

  private async validateDependencies(
    versions: Array<{ resourceType: string; resourceKey: string; snapshot: Prisma.JsonValue }>,
  ) {
    const prisma = this.requirePrisma();
    const roles = await prisma.role.findMany({ where: { status: 'active' }, select: { permissions: true } });
    const registeredPermissions = new Set(
      roles.flatMap((role) => role.permissions).filter((permission) => permission !== '*'),
    );
    const releaseSkillKeys = new Set(
      versions.filter((item) => item.resourceType === 'skill').map((item) => item.resourceKey),
    );
    const activeSkills = await prisma.brainSkillRegistry.findMany({
      where: { enabled: true },
      select: { skillKey: true },
    });
    const availableSkills = new Set([...activeSkills.map((item) => item.skillKey), ...releaseSkillKeys]);
    for (const version of versions) {
      const snapshot = this.record(version.snapshot);
      const permissions = this.extractPermissions(snapshot);
      const unknownPermissions = permissions.filter((permission) => !registeredPermissions.has(permission));
      if (unknownPermissions.length)
        throw new BadRequestException(`release_unregistered_permissions:${unknownPermissions.join(',')}`);
      if (version.resourceType === 'agent_profile') {
        const skills = Array.isArray(snapshot.allowedSkills)
          ? snapshot.allowedSkills.filter((item): item is string => typeof item === 'string')
          : [];
        const missingSkills = skills.filter((skill) => !availableSkills.has(skill));
        if (missingSkills.length) throw new BadRequestException(`release_missing_skills:${missingSkills.join(',')}`);
      }
    }
  }

  private assertReleaseEvalSummary(summary: Record<string, unknown>, releaseFingerprint: string) {
    if (summary.canRelease !== true || Number(summary.total ?? 0) <= 0) {
      throw new BadRequestException('release_eval_gate_failed');
    }
    const releaseGate = this.record(summary.releaseGate as Prisma.JsonValue);
    if (
      summary.gateMode !== 'release_gate' ||
      summary.coverageComplete !== true ||
      releaseGate.passed !== true ||
      !Array.isArray(summary.requiredCapabilityKeys) ||
      !Array.isArray(summary.requiredCaseKeys)
    ) {
      throw new BadRequestException('release_eval_gate_incomplete');
    }
    if (summary.releaseFingerprint !== releaseFingerprint) {
      throw new BadRequestException('release_eval_fingerprint_mismatch');
    }
  }

  private assertProductAcceptanceSummary(summary: Record<string, unknown>, releaseFingerprint: string) {
    const evidence = this.record(summary.productAcceptance as Prisma.JsonValue);
    const blockingReasons = Array.isArray(evidence.blockingReasons) ? evidence.blockingReasons : [];
    if (
      evidence.contractVersion !== 'ami-brain-release-acceptance/v1' ||
      evidence.canActivate !== true ||
      blockingReasons.length > 0
    ) {
      throw new BadRequestException('release_product_acceptance_failed');
    }
    if (evidence.releaseFingerprint !== releaseFingerprint || summary.releaseFingerprint !== releaseFingerprint) {
      throw new BadRequestException('release_product_acceptance_fingerprint_mismatch');
    }
    if (
      !Number.isInteger(Number(evidence.releaseCoreRunId)) ||
      !Number.isInteger(Number(evidence.standardRegressionRunId)) ||
      Number(evidence.releaseCoreCaseCount) < 300 ||
      Number(evidence.releaseCoreCaseCount) > 400 ||
      Number(evidence.standardRegressionCaseCount) < 1000 ||
      Number(evidence.standardRegressionCaseCount) > 1100 ||
      Number(evidence.standardDeltaCaseCount) + Number(evidence.releaseCoreCaseCount) !==
        Number(evidence.standardRegressionCaseCount) ||
      Number(evidence.verifiedCapabilityTotal) <= 0 ||
      Number(evidence.goldStandardCaseCount) !== 100 ||
      Number(evidence.goldStandardAuditQueryReady) !== 100 ||
      Number(evidence.goldStandardSnapshotReady) !== 100 ||
      Number(evidence.goldStandardEvaluated) !== 100 ||
      Number(evidence.goldStandardPassed) !== 100 ||
      !Number.isInteger(Number(evidence.goldStandardRunId)) ||
      Number(evidence.goldStandardRunId) <= 0 ||
      Number(evidence.goldStandardRunId) === Number(evidence.releaseCoreRunId) ||
      Number(evidence.goldStandardRunId) === Number(evidence.standardRegressionRunId) ||
      Number(evidence.releaseCoreRunId) === Number(evidence.standardRegressionRunId) ||
      Number(summary.runId) !== Number(evidence.standardRegressionRunId)
    ) {
      throw new BadRequestException('release_product_acceptance_incomplete');
    }
    if (
      typeof evidence.sourceCommit !== 'string' ||
      !/^[0-9a-f]{40}$/iu.test(evidence.sourceCommit) ||
      evidence.runtimeCommit !== evidence.sourceCommit ||
      typeof evidence.suiteManifestVersion !== 'string' ||
      !this.sha256String(evidence.suiteManifestChecksum) ||
      !this.sha256String(evidence.sourceChecksum) ||
      !this.sha256String(evidence.releaseCoreCaseIdsChecksum) ||
      !this.sha256String(evidence.standardDeltaCaseIdsChecksum) ||
      !this.sha256String(evidence.standardRegressionCaseIdsChecksum) ||
      typeof evidence.goldStandardManifestVersion !== 'string' ||
      !evidence.goldStandardManifestVersion ||
      !this.sha256String(evidence.goldStandardManifestChecksum) ||
      !this.sha256String(evidence.goldStandardCaseIdsChecksum) ||
      !this.sha256String(evidence.goldStandardAcceptanceChecksum) ||
      typeof evidence.runKey !== 'string' ||
      !evidence.runKey
    ) {
      throw new BadRequestException('release_product_acceptance_identity_invalid');
    }
    if (
      summary.stage !== 'standard-regression' ||
      summary.executionMode !== 'delta_after_release_core' ||
      summary.runKey !== evidence.runKey ||
      summary.suiteManifestVersion !== evidence.suiteManifestVersion ||
      summary.suiteManifestChecksum !== evidence.suiteManifestChecksum ||
      summary.sourceChecksum !== evidence.sourceChecksum ||
      summary.sourceCommit !== evidence.sourceCommit ||
      Number(summary.storeId) !== Number(evidence.storeId) ||
      Number(summary.total) !== Number(evidence.standardDeltaCaseCount) ||
      Number(summary.suiteCaseCount) !== Number(evidence.standardRegressionCaseCount) ||
      summary.suiteCaseIdsChecksum !== evidence.standardRegressionCaseIdsChecksum ||
      Number(summary.goldStandardRunId) !== Number(evidence.goldStandardRunId) ||
      jsonChecksum(this.record(summary.goldStandardAcceptance as Prisma.JsonValue)) !==
        evidence.goldStandardAcceptanceChecksum ||
      this.record(summary.productionHealth as Prisma.JsonValue).commit !== evidence.runtimeCommit
    ) {
      throw new BadRequestException('release_product_acceptance_summary_mismatch');
    }
    const expiresAt = Date.parse(String(evidence.expiresAt ?? ''));
    if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) {
      throw new BadRequestException('release_product_acceptance_expired');
    }
    return evidence;
  }

  private async assertGoldStandardEvidenceRun(
    prisma: PrismaService,
    releaseId: number,
    standardSummary: Record<string, unknown>,
    evidence: Record<string, unknown>,
  ) {
    const goldStandardRunId = Number(evidence.goldStandardRunId);
    const run = await prisma.brainEvalRun.findFirst({
      where: { id: goldStandardRunId, releaseId, storeId: Number(evidence.storeId) },
      select: {
        id: true,
        status: true,
        caseCount: true,
        passedCount: true,
        failedCount: true,
        summary: true,
      },
    });
    if (!run) throw new BadRequestException('release_gold_standard_run_missing');
    const summary = this.record(run.summary as Prisma.JsonValue);
    const identity = this.record(summary.pipelineIdentity as Prisma.JsonValue);
    const acceptance = this.record(summary.acceptance as Prisma.JsonValue);
    const expectedIdentity: Record<string, unknown> = {
      contractVersion: 'ami-brain-gold-standard-runtime/v1',
      parentStandardRegressionRunId: Number(evidence.standardRegressionRunId),
      releaseId,
      storeId: Number(evidence.storeId),
      releaseFingerprint: evidence.releaseFingerprint,
      sourceCommit: evidence.sourceCommit,
      runtimeCommit: evidence.runtimeCommit,
      sourceChecksum: evidence.sourceChecksum,
      suiteManifestVersion: evidence.suiteManifestVersion,
      suiteManifestChecksum: evidence.suiteManifestChecksum,
      goldStandardManifestChecksum: evidence.goldStandardManifestChecksum,
      standardRegressionCaseIdsChecksum: evidence.standardRegressionCaseIdsChecksum,
    };
    const identityMismatches = Object.entries(expectedIdentity)
      .filter(([key, value]) => identity[key] !== value)
      .map(([key]) => key);
    const parentAcceptanceChecksum = jsonChecksum(
      this.record(standardSummary.goldStandardAcceptance as Prisma.JsonValue),
    );
    const compactResultIds = Array.isArray(summary.compactResults)
      ? summary.compactResults
          .map((item) => this.record(item as Prisma.JsonValue).goldCaseId)
          .filter((item): item is string => typeof item === 'string' && Boolean(item))
      : [];
    const invalidReasons = [
      run.status !== 'completed' ? 'status' : null,
      run.id !== goldStandardRunId ? 'run_id' : null,
      Number(run.caseCount) !== 100 ? 'case_count' : null,
      Number(run.passedCount) !== 100 ? 'passed_count' : null,
      Number(run.failedCount) !== 0 ? 'failed_count' : null,
      summary.executionPurpose !== 'standard_regression_internal_gold_standard' ? 'execution_purpose' : null,
      summary.stage !== 'standard-regression-gold-internal' ? 'stage' : null,
      summary.runKey !== evidence.runKey ? 'run_key' : null,
      identityMismatches.length ? `pipeline_identity(${identityMismatches.join('+')})` : null,
      Number(summary.completedCaseCount) !== 100 ? 'completed_case_count' : null,
      Number(summary.remainingCaseCount) !== 0 ? 'remaining_case_count' : null,
      Number(summary.passed) !== 100 ? 'summary_passed' : null,
      Number(summary.failed) !== 0 ? 'summary_failed' : null,
      Number(summary.providerUnavailable) !== 0 ? 'provider_unavailable' : null,
      compactResultIds.length !== 100 ? 'compact_result_count' : null,
      new Set(compactResultIds).size !== 100 ? 'compact_result_duplicates' : null,
      caseIdsChecksum([...compactResultIds].sort()) !== evidence.goldStandardCaseIdsChecksum
        ? 'compact_result_checksum'
        : null,
      jsonChecksum(acceptance) !== evidence.goldStandardAcceptanceChecksum ? 'child_acceptance' : null,
      parentAcceptanceChecksum !== evidence.goldStandardAcceptanceChecksum ? 'parent_acceptance' : null,
    ].filter((item): item is string => Boolean(item));
    if (invalidReasons.length) {
      throw new BadRequestException(`release_gold_standard_evidence_invalid:${invalidReasons.join(',')}`);
    }
    const resultRows = await prisma.brainEvalResult.findMany({
      where: { evalRunId: goldStandardRunId },
      orderBy: { caseKey: 'asc' },
      select: { caseKey: true, deterministicPassed: true, deterministicGrade: true },
    });
    const resultIds = resultRows.map((item) => item.caseKey);
    const invalidResults = resultRows.filter((item) => {
      const grade = this.record(item.deterministicGrade as Prisma.JsonValue);
      return (
        item.deterministicPassed !== true ||
        grade.passed !== true ||
        grade.goldCaseId !== item.caseKey ||
        grade.status === 'provider_unavailable'
      );
    });
    if (
      resultIds.length !== 100 ||
      new Set(resultIds).size !== 100 ||
      caseIdsChecksum([...resultIds].sort()) !== evidence.goldStandardCaseIdsChecksum ||
      invalidResults.length > 0
    ) {
      throw new BadRequestException('release_gold_standard_results_invalid');
    }
  }

  private async assertPerformanceEvidenceRuns(
    prisma: PrismaService,
    releaseId: number,
    standardSummary: Record<string, unknown>,
    productEvidence: Record<string, unknown>,
  ) {
    const evidence = this.record(standardSummary.performanceAcceptance as Prisma.JsonValue);
    if (!Object.keys(evidence).length) {
      throw new BadRequestException('release_performance_acceptance_missing');
    }
    const blockingReasons = Array.isArray(evidence.blockingReasons) ? evidence.blockingReasons : [];
    if (
      evidence.schemaVersion !== 'ami-brain-performance-acceptance/v1' ||
      evidence.status !== 'ready' ||
      blockingReasons.length > 0
    ) {
      throw new BadRequestException('release_performance_acceptance_failed');
    }

    const runIdentity = this.record(evidence.runIdentity as Prisma.JsonValue);
    const aggregateIdentity = this.record(evidence.identity as Prisma.JsonValue);
    const standardRegressionRunId = Number(productEvidence.standardRegressionRunId);
    const storeId = Number(productEvidence.storeId);
    const manifestVersion = typeof evidence.manifestVersion === 'string' ? evidence.manifestVersion : '';
    const approvedManifest = APPROVED_PERFORMANCE_MANIFESTS[manifestVersion];
    const identityInvalid =
      !approvedManifest ||
      runIdentity.schemaVersion !== 'ami-brain-performance-run-identity/v1' ||
      typeof runIdentity.runKey !== 'string' ||
      !runIdentity.runKey ||
      Number(runIdentity.standardRegressionRunId) !== standardRegressionRunId ||
      Number(runIdentity.releaseId) !== releaseId ||
      Number(runIdentity.storeId) !== storeId ||
      runIdentity.runtimeCommit !== productEvidence.runtimeCommit ||
      runIdentity.suiteManifestChecksum !== productEvidence.suiteManifestChecksum ||
      runIdentity.performanceManifestVersion !== manifestVersion ||
      runIdentity.performanceManifestChecksum !== approvedManifest?.manifestChecksum ||
      runIdentity.performanceCaseIdsChecksum !== approvedManifest?.caseIdsChecksum ||
      evidence.manifestCaseIdsChecksum !== approvedManifest?.caseIdsChecksum ||
      aggregateIdentity.releaseId !== releaseId ||
      Number(aggregateIdentity.storeId) !== storeId ||
      aggregateIdentity.sourceCommit !== productEvidence.sourceCommit ||
      aggregateIdentity.runtimeCommit !== productEvidence.runtimeCommit ||
      aggregateIdentity.releaseFingerprint !== productEvidence.releaseFingerprint ||
      aggregateIdentity.suiteManifestChecksum !== productEvidence.suiteManifestChecksum;
    if (identityInvalid) {
      throw new BadRequestException('release_performance_acceptance_identity_invalid');
    }

    const generatedAt = Date.parse(String(evidence.generatedAt ?? ''));
    const expiresAt = Date.parse(String(evidence.expiresAt ?? ''));
    if (
      !Number.isFinite(generatedAt) ||
      !Number.isFinite(expiresAt) ||
      generatedAt >= expiresAt ||
      expiresAt <= Date.now()
    ) {
      throw new BadRequestException('release_performance_acceptance_expired');
    }

    const buckets = this.record(evidence.buckets as Prisma.JsonValue);
    const expectedBucketKeys = Object.keys(PERFORMANCE_BUCKET_POLICY);
    if (
      Object.keys(buckets).length !== expectedBucketKeys.length ||
      expectedBucketKeys.some((key) => !Object.prototype.hasOwnProperty.call(buckets, key))
    ) {
      throw new BadRequestException('release_performance_acceptance_buckets_invalid');
    }

    const runIds: number[] = [];
    for (const bucketKey of expectedBucketKeys) {
      const policy = PERFORMANCE_BUCKET_POLICY[bucketKey as keyof typeof PERFORMANCE_BUCKET_POLICY];
      const bucket = this.record(buckets[bucketKey] as Prisma.JsonValue);
      const latency = this.record(bucket.latency as Prisma.JsonValue);
      const budgets = this.record(bucket.budgetsMs as Prisma.JsonValue);
      const runId = Number(bucket.runId);
      const p50Ms = Number(latency.p50Ms);
      const p95Ms = Number(latency.p95Ms);
      const maxMs = Number(latency.maxMs);
      const bucketInvalid =
        !Number.isInteger(runId) ||
        runId <= 0 ||
        Number(bucket.caseCount) !== policy.count ||
        !this.sha256String(bucket.caseIdsChecksum) ||
        Number(latency.count) !== policy.count ||
        !Number.isFinite(p50Ms) ||
        !Number.isFinite(p95Ms) ||
        !Number.isFinite(maxMs) ||
        p50Ms < 0 ||
        p50Ms > p95Ms ||
        p95Ms > maxMs ||
        p50Ms > policy.budgetsMs.p50 ||
        p95Ms > policy.budgetsMs.p95 ||
        maxMs > policy.budgetsMs.max ||
        Number(budgets.p50) !== policy.budgetsMs.p50 ||
        Number(budgets.p95) !== policy.budgetsMs.p95 ||
        Number(budgets.max) !== policy.budgetsMs.max;
      if (bucketInvalid) {
        throw new BadRequestException(`release_performance_acceptance_bucket_invalid:${bucketKey}`);
      }
      runIds.push(runId);
    }
    if (new Set(runIds).size !== expectedBucketKeys.length) {
      throw new BadRequestException('release_performance_acceptance_run_ids_invalid');
    }

    for (const bucketKey of expectedBucketKeys) {
      const policy = PERFORMANCE_BUCKET_POLICY[bucketKey as keyof typeof PERFORMANCE_BUCKET_POLICY];
      const bucket = this.record(buckets[bucketKey] as Prisma.JsonValue);
      const runId = Number(bucket.runId);
      const run = await prisma.brainEvalRun.findFirst({
        where: { id: runId, releaseId, storeId },
        select: {
          id: true,
          status: true,
          caseCount: true,
          passedCount: true,
          failedCount: true,
          summary: true,
        },
      });
      if (!run) throw new BadRequestException(`release_performance_run_missing:${bucketKey}`);
      const summary = this.record(run.summary as Prisma.JsonValue);
      const activeRelease = this.record(summary.activeRelease as Prisma.JsonValue);
      const productionHealth = this.record(summary.productionHealth as Prisma.JsonValue);
      const scorecards = this.record(summary.scorecards as Prisma.JsonValue);
      const falseSuccess = this.record(scorecards.suspectedFalseSuccess as Prisma.JsonValue);
      const latencyBreakdown = this.record(summary.latencyBreakdown as Prisma.JsonValue);
      const actualLatency = this.record(latencyBreakdown.userResponse as Prisma.JsonValue);
      const expectedLatency = this.record(bucket.latency as Prisma.JsonValue);
      const invalidReasons = [
        run.id !== runId ? 'run_id' : null,
        run.status !== 'completed' ? 'status' : null,
        Number(run.caseCount) !== policy.count ? 'case_count' : null,
        Number(run.passedCount) !== policy.count ? 'passed_count' : null,
        Number(run.failedCount) !== 0 ? 'failed_count' : null,
        Number(summary.runId) !== runId ? 'summary_run_id' : null,
        summary.runKey !== `${runIdentity.runKey}-${bucketKey}` ? 'run_key' : null,
        summary.stage !== 'targeted' ? 'stage' : null,
        summary.executionMode !== 'full_suite' ? 'execution_mode' : null,
        Number(activeRelease.id) !== releaseId ? 'release_id' : null,
        Number(summary.storeId) !== storeId ? 'store_id' : null,
        summary.sourceCommit !== productEvidence.sourceCommit ? 'source_commit' : null,
        summary.sourceChecksum !== productEvidence.sourceChecksum ? 'source_checksum' : null,
        productionHealth.commit !== productEvidence.runtimeCommit ? 'runtime_commit' : null,
        summary.releaseFingerprint !== productEvidence.releaseFingerprint ? 'release_fingerprint' : null,
        summary.suiteManifestChecksum !== productEvidence.suiteManifestChecksum ? 'suite_manifest_checksum' : null,
        Number(summary.total) !== policy.count ? 'total' : null,
        Number(summary.expectedTotal) !== policy.count ? 'expected_total' : null,
        summary.suiteCaseIdsChecksum !== bucket.caseIdsChecksum ? 'case_ids_checksum' : null,
        Number(summary.failed ?? -1) !== 0 ? 'summary_failed' : null,
        Number(summary.providerUnavailable ?? -1) !== 0 ? 'provider_unavailable' : null,
        summary.productSafetyGate === 'blocked' ? 'safety_blocked' : null,
        Number(falseSuccess.count ?? -1) !== 0 ? 'suspected_false_success' : null,
        jsonChecksum(actualLatency) !== jsonChecksum(expectedLatency) ? 'latency_evidence' : null,
        Number(actualLatency.count) !== policy.count ? 'latency_count' : null,
        Number(actualLatency.p50Ms) > policy.budgetsMs.p50 ? 'p50_budget' : null,
        Number(actualLatency.p95Ms) > policy.budgetsMs.p95 ? 'p95_budget' : null,
        Number(actualLatency.maxMs) > policy.budgetsMs.max ? 'max_budget' : null,
      ].filter((item): item is string => Boolean(item));
      if (invalidReasons.length) {
        throw new BadRequestException(`release_performance_run_invalid:${bucketKey}:${invalidReasons.join(',')}`);
      }
    }
  }

  private sha256String(value: unknown) {
    return typeof value === 'string' && /^[0-9a-f]{64}$/iu.test(value);
  }

  private requiresProductAcceptance(release: BrainReleaseWithItems) {
    const rollout = this.record(release.rollout);
    return rollout.productAcceptanceRequired === true || rollout.productionBaseline === true;
  }

  private requiresPerformanceAcceptance(release: BrainReleaseWithItems) {
    return this.record(release.rollout).productionBaseline === true;
  }

  private async completedEvalRuns(prisma: PrismaService, releaseId: number) {
    const delegate = prisma.brainEvalRun as unknown as {
      findMany?: (input: Record<string, unknown>) => Promise<Array<{
        id?: number;
        summary: Prisma.JsonValue;
        modelVersion?: string | null;
        caseCount?: number;
        finishedAt?: Date | null;
        createdAt?: Date;
      }>>;
      findFirst: (input: Record<string, unknown>) => Promise<{
        id?: number;
        summary: Prisma.JsonValue;
        modelVersion?: string | null;
        caseCount?: number;
        finishedAt?: Date | null;
        createdAt?: Date;
      } | null>;
    };
    if (delegate.findMany) {
      return delegate.findMany({
        where: { releaseId, status: 'completed' },
        orderBy: { createdAt: 'desc' },
        take: 50,
      });
    }
    const latest = await delegate.findFirst({
      where: { releaseId, status: 'completed' },
      orderBy: { createdAt: 'desc' },
    });
    return latest ? [latest] : [];
  }

  private async assertReleaseEvidenceRuns(
    prisma: PrismaService,
    runs: Array<{ summary: Prisma.JsonValue }>,
    releaseId: number,
    releaseFingerprint: string,
    requireProductAcceptance: boolean,
    requirePerformanceAcceptance: boolean,
  ) {
    if (!requireProductAcceptance) {
      const capabilityRun =
        runs.find((run) => this.record(run.summary).gateMode === 'release_gate') ??
        runs.find((run) => this.record(run.summary).canRelease === true);
      if (!capabilityRun) throw new BadRequestException('release_eval_gate_failed');
      this.assertReleaseEvalSummary(this.record(capabilityRun.summary), releaseFingerprint);
      return;
    }
    const productRun = runs.find(
      (run) =>
        this.record(this.record(run.summary).productAcceptance as Prisma.JsonValue).contractVersion ===
        'ami-brain-release-acceptance/v1',
    );
    if (!productRun) throw new BadRequestException('release_product_acceptance_missing');
    const productSummary = this.record(productRun.summary);
    const productEvidence = this.assertProductAcceptanceSummary(productSummary, releaseFingerprint);
    await this.assertGoldStandardEvidenceRun(prisma, releaseId, productSummary, productEvidence);
    if (requirePerformanceAcceptance) {
      await this.assertPerformanceEvidenceRuns(prisma, releaseId, productSummary, productEvidence);
    }
    const capabilityRun = runs.find((run) => {
      const summary = this.record(run.summary);
      return summary.gateMode === 'release_gate' && summary.runtimeCommit === productEvidence.runtimeCommit;
    });
    if (!capabilityRun) throw new BadRequestException('release_eval_pipeline_identity_mismatch');
    this.assertReleaseEvalSummary(this.record(capabilityRun.summary), releaseFingerprint);
  }

  private async assertReleaseEvalEvidence(
    prisma: PrismaService,
    release: BrainReleaseWithItems,
    releaseFingerprint: string,
  ) {
    const requireProductAcceptance = this.requiresProductAcceptance(release);
    const requirePerformanceAcceptance = this.requiresPerformanceAcceptance(release);
    const ownEvalRuns = await this.completedEvalRuns(prisma, release.id);
    if (ownEvalRuns.length) {
      await this.assertReleaseEvidenceRuns(
        prisma,
        ownEvalRuns,
        release.id,
        releaseFingerprint,
        requireProductAcceptance,
        requirePerformanceAcceptance,
      );
      return;
    }

    const evidenceReleaseId = Number(this.record(release.rollout).evaluationEvidenceReleaseId);
    if (!Number.isInteger(evidenceReleaseId) || evidenceReleaseId <= 0 || evidenceReleaseId === release.id) {
      throw new BadRequestException('release_eval_gate_failed');
    }
    const evidenceRelease = await prisma.brainRelease.findUnique({
      where: { id: evidenceReleaseId },
      include: { items: { include: { resourceVersion: true } } },
    });
    const evidenceRollout = this.record(evidenceRelease?.rollout as Prisma.JsonValue);
    const validEvidenceRelease =
      evidenceRelease &&
      (evidenceRollout.evaluationOnly === true ||
        (evidenceRelease.status === 'active' && evidenceRollout.mode === 'shadow'));
    if (!validEvidenceRelease) {
      throw new BadRequestException('release_eval_evidence_invalid');
    }
    this.assertReleaseProductProfile(evidenceRelease);
    const evidenceFingerprint = createReleaseFingerprint(evidenceRelease.items, evidenceRelease.rollout);
    if (evidenceFingerprint !== releaseFingerprint) {
      throw new BadRequestException('release_eval_evidence_fingerprint_mismatch');
    }
    const evidenceEvalRuns = await this.completedEvalRuns(prisma, evidenceRelease.id);
    await this.assertReleaseEvidenceRuns(
      prisma,
      evidenceEvalRuns,
      evidenceRelease.id,
      releaseFingerprint,
      requireProductAcceptance,
      requirePerformanceAcceptance,
    );
  }

  private async validateGeneratedCapabilities(
    versions: Array<{
      resourceType: string;
      sourceResourceId: number | null;
      snapshot: Prisma.JsonValue;
    }>,
  ) {
    const prisma = this.requirePrisma();
    const generatedVersions = versions.filter((version) => {
      if (version.resourceType !== 'skill') return false;
      const snapshot = this.record(version.snapshot);
      return snapshot.generatedCapability === true;
    });
    if (!generatedVersions.length) return;
    if (!this.semanticVerifier) throw new BadRequestException('generated_capability_verifier_unavailable');
    const sourceIds = generatedVersions.map((version) => {
      if (!version.sourceResourceId) throw new BadRequestException('generated_capability_source_missing');
      return version.sourceResourceId;
    });
    const sourceRows = await prisma.brainSkillRegistry.findMany({ where: { id: { in: sourceIds } } });
    const sourceById = new Map(sourceRows.map((row) => [row.id, row]));
    const inputs = generatedVersions.map((version) => {
      const sourceRow = sourceById.get(version.sourceResourceId!);
      if (!sourceRow) throw new BadRequestException('generated_capability_source_missing');
      return { snapshot: version.snapshot, sourceRow };
    });
    const definitionVersionIds = extractBrainReleaseDefinitionVersionIds(
      generatedVersions.map(
        (version) => this.record(version.snapshot) as unknown as BrainCapabilityCandidate,
      ),
    );
    if (!definitionVersionIds.length) {
      throw new BadRequestException('generated_capability_definition_refs_missing');
    }
    const definitionSnapshot = await this.semanticVerifier.loadEvaluationSnapshot(definitionVersionIds);
    await this.semanticVerifier.verifyStoredCapabilities(inputs, definitionSnapshot);
  }

  private async runSerializable<T>(
    conflictCode: string,
    operation: (tx: Prisma.TransactionClient) => Promise<T>,
    timeoutMs = 30_000,
  ) {
    const prisma = this.requirePrisma();
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      try {
        return await prisma.$transaction(operation, {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
          maxWait: 10_000,
          timeout: timeoutMs,
        });
      } catch (error) {
        if (isPrismaCode(error, 'P2034') && attempt < 3) continue;
        if (isPrismaCode(error, 'P2034')) throw new ConflictException(conflictCode);
        throw error;
      }
    }
    throw new ConflictException(conflictCode);
  }

  private extractPermissions(snapshot: Record<string, unknown>) {
    const direct = Array.isArray(snapshot.permissions)
      ? snapshot.permissions.filter((item): item is string => typeof item === 'string')
      : [];
    const scope = this.record(snapshot.dataScopeRules as Prisma.JsonValue);
    const scoped = Array.isArray(scope.requiredPermissions)
      ? scope.requiredPermissions.filter((item): item is string => typeof item === 'string')
      : [];
    return [...new Set([...direct, ...scoped])];
  }

  private async activateSource(
    tx: Prisma.TransactionClient,
    version: { resourceType: string; resourceKey: string; sourceResourceId: number | null },
  ) {
    this.assertResourceManagedHere(version.resourceType);
    if (!version.sourceResourceId) return;
    switch (version.resourceType) {
      case 'metric':
        await tx.brainMetric.updateMany({
          where: { metricKey: version.resourceKey, status: 'active' },
          data: { status: 'archived' },
        });
        await tx.brainMetric.update({ where: { id: version.sourceResourceId }, data: { status: 'active' } });
        break;
      case 'ontology_entity':
        await tx.brainOntologyEntity.updateMany({
          where: { entityKey: version.resourceKey, status: 'active' },
          data: { status: 'archived' },
        });
        await tx.brainOntologyEntity.update({ where: { id: version.sourceResourceId }, data: { status: 'active' } });
        break;
      case 'ontology_relation':
        await tx.brainOntologyRelation.updateMany({
          where: { relationKey: version.resourceKey, status: 'active' },
          data: { status: 'archived' },
        });
        await tx.brainOntologyRelation.update({ where: { id: version.sourceResourceId }, data: { status: 'active' } });
        break;
      case 'agent_profile':
        await tx.brainAgentProfile.updateMany({
          where: { roleKey: version.resourceKey, enabled: true },
          data: { enabled: false },
        });
        await tx.brainAgentProfile.update({ where: { id: version.sourceResourceId }, data: { enabled: true } });
        break;
      case 'skill':
        await tx.brainSkillRegistry.updateMany({
          where: { skillKey: version.resourceKey, enabled: true },
          data: { enabled: false },
        });
        await tx.brainSkillRegistry.update({ where: { id: version.sourceResourceId }, data: { enabled: true } });
        break;
      case 'inspection_rule':
        await tx.brainInspectionRule.updateMany({
          where: { ruleKey: version.resourceKey, enabled: true },
          data: { enabled: false },
        });
        await tx.brainInspectionRule.update({ where: { id: version.sourceResourceId }, data: { enabled: true } });
        break;
    }
  }

  private async deactivateSupersededResources(
    tx: Prisma.TransactionClient,
    currentItems: Array<{
      resourceVersionId: number;
      resourceVersion: { resourceType: string; resourceKey: string; sourceResourceId: number | null };
    }>,
    targetItems: Array<{ resourceVersionId: number }>,
    archivedAt: Date,
  ) {
    const targetVersionIds = new Set(targetItems.map((item) => item.resourceVersionId));
    for (const item of currentItems) {
      if (targetVersionIds.has(item.resourceVersionId)) continue;
      await tx.brainResourceVersion.updateMany({
        where: { id: item.resourceVersionId, status: 'active' },
        data: { status: 'archived', archivedAt },
      });
      await this.deactivateSource(tx, item.resourceVersion);
    }
  }

  private async deactivateSource(
    tx: Prisma.TransactionClient,
    version: { resourceType: string; sourceResourceId: number | null },
  ) {
    this.assertResourceManagedHere(version.resourceType);
    if (!version.sourceResourceId) return;
    switch (version.resourceType) {
      case 'agent_profile':
        await tx.brainAgentProfile.updateMany({ where: { id: version.sourceResourceId }, data: { enabled: false } });
        break;
      case 'skill':
        await tx.brainSkillRegistry.updateMany({ where: { id: version.sourceResourceId }, data: { enabled: false } });
        break;
      case 'inspection_rule':
        await tx.brainInspectionRule.updateMany({ where: { id: version.sourceResourceId }, data: { enabled: false } });
        break;
    }
  }

  private assertResourcesManagedHere(resources: Array<{ resourceType: string }>) {
    for (const resource of resources) this.assertResourceManagedHere(resource.resourceType);
  }

  private assertReleaseItemsConsistent(
    items: Array<{
      id?: number;
      resourceType: string;
      resourceKey: string;
      resourceVersion: { resourceType: string; resourceKey: string };
    }>,
  ) {
    for (const item of items) {
      this.assertResourceManagedHere(item.resourceType);
      this.assertResourceManagedHere(item.resourceVersion.resourceType);
      if (
        item.resourceType !== item.resourceVersion.resourceType ||
        item.resourceKey !== item.resourceVersion.resourceKey
      ) {
        throw new BadRequestException(
          `release_resource_item_mismatch:${item.id ?? `${item.resourceType}:${item.resourceKey}`}`,
        );
      }
    }
  }

  private assertDeployableRuntimeRelease(release: BrainReleaseWithItems) {
    const rollout = this.record(release.rollout);
    if (rollout.mode === undefined) return;
    if (rollout.mode !== undefined && rollout.mode !== 'model' && rollout.mode !== 'shadow') {
      throw new BadRequestException('release_runtime_mode_not_deployable');
    }
    if (!release.items.some((item) => item.resourceType === 'skill')) {
      throw new BadRequestException('release_capability_baseline_missing');
    }
  }

  private assertReleaseProductProfile(release: BrainReleaseWithItems) {
    const rollout = this.record(release.rollout);
    const capabilities = release.items
      .filter((item) => item.resourceType === 'skill')
      .map((item) => ({ ...this.record(item.resourceVersion.snapshot), key: item.resourceKey }));
    const blockers = validateBrainReleaseProductProfile(rollout, capabilities);
    if (blockers.length) throw new BadRequestException(blockers[0]);
    if (
      rollout.productProfile === BRAIN_QUERY_ONLY_PRODUCT_PROFILE &&
      capabilities.length !== BRAIN_QUERY_ONLY_ALLOWED_CAPABILITY_KEYS.length
    ) {
      throw new BadRequestException('brain_query_only_allowed_capability_count_invalid');
    }
  }

  private assertSemanticSnapshotFingerprint(release: BrainReleaseWithItems) {
    const expected = this.record(release.rollout).semanticSnapshotFingerprint;
    const actual = createSemanticSnapshotFingerprint(release.items.map((item) => item.resourceVersion));
    if (typeof expected === 'string' && expected !== actual) {
      throw new BadRequestException('release_semantic_snapshot_fingerprint_mismatch');
    }
  }

  private async assertGovernancePolicyBinding(
    prisma: PrismaService,
    release: BrainReleaseWithItems,
  ): Promise<void> {
    const rollout = this.record(release.rollout);
    const binding = governancePolicyBinding(rollout);
    if (!binding) {
      if (rollout.governancePolicyReleaseId !== undefined || rollout.governancePolicyMode !== undefined) {
        throw new BadRequestException('release_governance_policy_binding_invalid');
      }
      return;
    }
    const policyRelease = await prisma.brainRelease.findUnique({
      where: { id: binding.releaseId },
      include: { items: true },
    });
    if (!policyRelease || policyRelease.scope !== 'governance_policy' || policyRelease.status !== 'active') {
      throw new BadRequestException('release_governance_policy_not_active');
    }
    if (!policyRelease.items.length || policyRelease.items.some((item) => item.resourceType !== 'capability_policy')) {
      throw new BadRequestException('release_governance_policy_snapshot_invalid');
    }
    const expectedChecksum = this.record(policyRelease.rollout).policySnapshotChecksum;
    if (
      typeof rollout.governancePolicySnapshotChecksum === 'string' &&
      rollout.governancePolicySnapshotChecksum !== expectedChecksum
    ) {
      throw new BadRequestException('release_governance_policy_checksum_mismatch');
    }
    const policies = policyRelease.items.map((item) => runtimePolicy(item.resourceKey, item.snapshot));
    if (policies.some((policy) => policy.runtimeEnforcementStatus !== binding.mode)) {
      throw new BadRequestException('release_governance_policy_mode_mismatch');
    }
    const policyKeys = new Set(policies.map((policy) => policy.capabilityKey));
    const missingPolicyKeys = release.items
      .filter((item) => item.resourceType === 'skill')
      .map((item) => item.resourceKey)
      .filter((key) => !policyKeys.has(key));
    if (missingPolicyKeys.length) {
      throw new BadRequestException(`release_governance_policy_incomplete:${missingPolicyKeys.sort().join(',')}`);
    }
  }

  private async resolveGovernancePolicyRuntime(
    release: ActiveRuntimeRelease,
    candidates?: readonly BrainCapabilityCandidate[],
  ): Promise<GovernancePolicyRuntimeResolution | undefined> {
    const binding = governancePolicyBinding(this.record(release.rollout));
    if (!binding) return undefined;
    const snapshot = await this.loadGovernancePolicySnapshot(binding.releaseId);
    if (snapshot.mode !== binding.mode) throw new BadRequestException('runtime_governance_policy_mode_mismatch');
    const candidateKeys = (candidates ?? [])
      .map((candidate) => String(candidate.key ?? ''))
      .filter(Boolean);
    const decisions = candidateKeys.map((capabilityKey) => {
      const policy = snapshot.policyByCapabilityKey.get(capabilityKey);
      return governancePolicyDecision(capabilityKey, policy);
    });
    return deepCloneFreeze({
      releaseId: snapshot.releaseId,
      releaseKey: snapshot.releaseKey,
      mode: snapshot.mode,
      status: snapshot.status,
      policyCount: snapshot.policyCount,
      matchedCapabilityCount: decisions.filter((decision) => decision.policyFound).length,
      allowedCapabilityKeys: decisions.filter((decision) => decision.allowed).map((decision) => decision.capabilityKey),
      blockedCapabilityKeys: decisions.filter((decision) => !decision.allowed).map((decision) => decision.capabilityKey),
      decisions,
    });
  }

  private async loadGovernancePolicySnapshot(releaseId: number): Promise<GovernancePolicyRuntimeSnapshot> {
    const cached = this.governancePolicySnapshotCache.get(releaseId);
    if (cached) return cached;
    const loading = this.requirePrisma().brainRelease.findUnique({
      where: { id: releaseId },
      select: {
        id: true,
        releaseKey: true,
        scope: true,
        status: true,
        rollout: true,
        items: {
          select: { resourceType: true, resourceKey: true, snapshot: true },
          orderBy: { resourceKey: 'asc' },
        },
      },
    }).then((release) => {
      if (!release || release.scope !== 'governance_policy') {
        throw new BadRequestException('runtime_governance_policy_not_found');
      }
      if (!release.items.length || release.items.some((item) => item.resourceType !== 'capability_policy')) {
        throw new BadRequestException('runtime_governance_policy_snapshot_invalid');
      }
      const policies = release.items.map((item) => runtimePolicy(item.resourceKey, item.snapshot));
      const modes = [...new Set(policies.map((policy) => policy.runtimeEnforcementStatus))];
      if (modes.length !== 1 || (modes[0] !== 'shadow' && modes[0] !== 'enforced')) {
        throw new BadRequestException('runtime_governance_policy_status_invalid');
      }
      return {
        releaseId: release.id,
        releaseKey: release.releaseKey,
        status: release.status,
        mode: modes[0],
        policyCount: policies.length,
        policyByCapabilityKey: new Map(policies.map((policy) => [policy.capabilityKey, policy])),
      } satisfies GovernancePolicyRuntimeSnapshot;
    });
    this.governancePolicySnapshotCache.set(releaseId, loading);
    try {
      return await loading;
    } catch (error) {
      this.governancePolicySnapshotCache.delete(releaseId);
      throw error;
    }
  }

  private assertResourceManagedHere(resourceType: string) {
    if (resourceType === 'metric' || resourceType === 'ontology_entity' || resourceType === 'ontology_relation') {
      throw new BadRequestException(`business_definition_registry_required:${resourceType}`);
    }
  }

  private matchesRollout(
    scope: string,
    rollout: Record<string, unknown>,
    input: { storeId: number; userId: number; roleKey: string },
  ) {
    if (scope === 'global') return true;
    const storeIds = Array.isArray(rollout.storeIds) ? rollout.storeIds.map(Number) : [];
    const userIds = Array.isArray(rollout.userIds) ? rollout.userIds.map(Number) : [];
    const roleKeys = Array.isArray(rollout.roleKeys) ? rollout.roleKeys.map(String) : [];
    if (scope === 'store') return storeIds.includes(input.storeId);
    if (scope === 'user') {
      return (
        userIds.includes(input.userId) &&
        (!storeIds.length || storeIds.includes(input.storeId)) &&
        (!roleKeys.length || roleKeys.includes(input.roleKey))
      );
    }
    if (scope === 'role')
      return roleKeys.includes(input.roleKey) && (!storeIds.length || storeIds.includes(input.storeId));
    if (scope === 'percentage') {
      const percentage = Math.max(0, Math.min(100, Number(rollout.userPercentage ?? 0)));
      return this.bucket(`${input.storeId}:${input.userId}:${input.roleKey}`) < percentage;
    }
    return false;
  }

  private bucket(value: string) {
    let hash = 0;
    for (let index = 0; index < value.length; index += 1) hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
    return hash % 100;
  }

  private requirePrisma() {
    if (!this.prisma) throw new Error('brain_release_prisma_unavailable');
    return this.prisma;
  }

  private nonEmpty(value: unknown, field: string) {
    if (typeof value !== 'string' || !value.trim()) throw new BadRequestException(`missing_release_field:${field}`);
    return value.trim();
  }

  private record(value: Prisma.JsonValue): Record<string, unknown> {
    return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
  }

  private toJson(value: unknown): Prisma.InputJsonValue {
    return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
  }
}

function isPrismaCode(error: unknown, code: string): boolean {
  return Boolean(error && typeof error === 'object' && 'code' in error && (error as { code?: unknown }).code === code);
}

function createSemanticSnapshotFingerprint(
  versions: readonly { resourceType: string; resourceKey: string; snapshot: Prisma.JsonValue }[],
): string {
  const contracts = versions
    .filter((version) => version.resourceType === 'skill')
    .map((version) => {
      const snapshot =
        version.snapshot && typeof version.snapshot === 'object' && !Array.isArray(version.snapshot)
          ? (version.snapshot as Record<string, unknown>)
          : {};
      const definitionRefs = Array.isArray(snapshot.definitionRefs)
        ? snapshot.definitionRefs
            .filter(
              (ref): ref is Record<string, unknown> => Boolean(ref) && typeof ref === 'object' && !Array.isArray(ref),
            )
            .map((ref) => ({
              definitionKey: String(ref.definitionKey ?? ''),
              versionId: Number(ref.versionId ?? 0),
              version: Number(ref.version ?? 0),
              definitionFingerprint: String(ref.definitionFingerprint ?? ''),
              sourceFingerprint: String(ref.sourceFingerprint ?? ''),
            }))
            .sort((left, right) => left.definitionKey.localeCompare(right.definitionKey))
        : [];
      return { resourceKey: version.resourceKey, definitionRefs };
    })
    .sort((left, right) => left.resourceKey.localeCompare(right.resourceKey));
  return createHash('sha256').update(JSON.stringify(contracts)).digest('hex');
}

function deepCloneFreeze<T>(value: T): T {
  if (Array.isArray(value)) return Object.freeze(value.map((item) => deepCloneFreeze(item))) as T;
  if (value != null && typeof value === 'object') {
    return Object.freeze(
      Object.fromEntries(
        Object.entries(value as Record<string, unknown>).map(([key, item]) => [key, deepCloneFreeze(item)]),
      ),
    ) as T;
  }
  return value;
}

function capabilityWorkspaceRoot(): string {
  if (process.env.BRAIN_CAPABILITY_WORKSPACE_ROOT) return resolve(process.env.BRAIN_CAPABILITY_WORKSPACE_ROOT);
  const cwd = process.cwd();
  return basename(cwd).toLowerCase() === 'server-v2' ? resolve(cwd, '../..') : resolve(cwd);
}

function createActiveRuntimeReleaseFingerprint(releases: readonly ActiveRuntimeRelease[]) {
  const runtimeContract = releases.map((release) => ({
    id: release.id,
    status: release.status,
    scope: release.scope,
    activatedAt: release.activatedAt,
    rollout: release.rollout,
    items: release.items
      .map((item) => ({
        resourceType: item.resourceType,
        resourceKey: item.resourceKey,
        version: item.version,
        snapshot: item.snapshot,
      }))
      .sort((left, right) =>
        `${left.resourceType}:${left.resourceKey}`.localeCompare(`${right.resourceType}:${right.resourceKey}`),
      ),
  }));
  return createHash('sha256')
    .update(JSON.stringify(canonicalizeForFingerprint(runtimeContract)))
    .digest('hex');
}

function canonicalizeForFingerprint(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(canonicalizeForFingerprint);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, canonicalizeForFingerprint(item)]),
    );
  }
  return value;
}

function blockedReadiness(
  blocker: string,
  releaseFingerprint: string | null = null,
  evaluationReleaseId: number | null = null,
): BrainReleaseReadiness {
  return {
    status: 'blocked',
    canRelease: false,
    evaluationReleaseId,
    evalRunId: null,
    releaseFingerprint,
    suiteChecksum: null,
    questionCount: null,
    provider: null,
    model: null,
    generatedAt: null,
    expiresAt: null,
    blockers: [blocker],
  };
}

function unavailableReadiness(blocker: string, releaseFingerprint: string | null = null): BrainReleaseReadiness {
  return {
    ...blockedReadiness(blocker, releaseFingerprint),
    status: 'unavailable',
  };
}

function positiveNumber(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function optionalText(value: unknown): string | null {
  const text = String(value ?? '').trim();
  return text || null;
}

function optionalIsoDate(value: unknown): string | null {
  if (value instanceof Date) return value.toISOString();
  const parsed = Date.parse(String(value ?? ''));
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null;
}

function governancePolicyBinding(value: Record<string, unknown>): GovernancePolicyBinding | undefined {
  const releaseId = Number(value.governancePolicyReleaseId);
  const mode = value.governancePolicyMode;
  if (!Number.isInteger(releaseId) || releaseId <= 0 || (mode !== 'shadow' && mode !== 'enforced')) {
    return undefined;
  }
  return { releaseId, mode };
}

function governancePolicyBindingSummary(value: Record<string, unknown>) {
  const binding = governancePolicyBinding(value);
  return binding
    ? {
        releaseId: binding.releaseId,
        mode: binding.mode,
        snapshotChecksum:
          typeof value.governancePolicySnapshotChecksum === 'string'
            ? value.governancePolicySnapshotChecksum
            : undefined,
      }
    : undefined;
}

function runtimePolicy(capabilityKey: string, value: unknown): GovernanceRuntimePolicy {
  const snapshot = value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
  const riskLevel = String(snapshot.riskLevel ?? 'unclassified');
  const whitelistStatus = String(snapshot.whitelistStatus ?? 'not_allowed');
  const runtimeEnforcementStatus = String(snapshot.runtimeEnforcementStatus ?? 'pending_runtime');
  return {
    capabilityKey,
    riskLevel,
    whitelistStatus,
    runtimeEnforcementStatus,
  };
}

function governancePolicyDecision(
  capabilityKey: string,
  policy: GovernanceRuntimePolicy | undefined,
): GovernancePolicyRuntimeDecision {
  if (!policy) {
    return { capabilityKey, policyFound: false, allowed: false, reason: 'policy_missing' };
  }
  if (policy.runtimeEnforcementStatus === 'shadow') {
    const reason = governanceEnforcementBlockReason(policy);
    return {
      capabilityKey,
      policyFound: true,
      allowed: reason === 'allowed',
      reason,
      riskLevel: policy.riskLevel,
      whitelistStatus: policy.whitelistStatus,
    };
  }
  const reason = governanceEnforcementBlockReason(policy);
  return {
    capabilityKey,
    policyFound: true,
    allowed: reason === 'allowed',
    reason,
    riskLevel: policy.riskLevel,
    whitelistStatus: policy.whitelistStatus,
  };
}

function governanceEnforcementBlockReason(policy: GovernanceRuntimePolicy): string {
  if (policy.runtimeEnforcementStatus !== 'shadow' && policy.runtimeEnforcementStatus !== 'enforced') {
    return 'runtime_status_not_ready';
  }
  if (policy.riskLevel === 'unclassified') return 'risk_unclassified';
  if (policy.riskLevel === 'high' || policy.riskLevel === 'critical') return 'risk_not_executable';
  if (policy.whitelistStatus !== 'approved') return `whitelist_${policy.whitelistStatus}`;
  return 'allowed';
}

type BrainReleaseWithItems = Prisma.BrainReleaseGetPayload<{
  include: { items: { include: { resourceVersion: true } } };
}>;

type ActiveRuntimeRelease = Prisma.BrainReleaseGetPayload<{
  include: { items: true };
}>;

type GovernancePolicyBinding = {
  releaseId: number;
  mode: 'shadow' | 'enforced';
};

type GovernanceRuntimePolicy = {
  capabilityKey: string;
  riskLevel: string;
  whitelistStatus: string;
  runtimeEnforcementStatus: string;
};

type GovernancePolicyRuntimeDecision = {
  capabilityKey: string;
  policyFound: boolean;
  allowed: boolean;
  reason: string;
  riskLevel?: string;
  whitelistStatus?: string;
};

type GovernancePolicyRuntimeSnapshot = {
  releaseId: number;
  releaseKey: string;
  status: string;
  mode: 'shadow' | 'enforced';
  policyCount: number;
  policyByCapabilityKey: Map<string, GovernanceRuntimePolicy>;
};

type GovernancePolicyRuntimeResolution = {
  releaseId: number;
  releaseKey: string;
  status: string;
  mode: 'shadow' | 'enforced';
  policyCount: number;
  matchedCapabilityCount: number;
  allowedCapabilityKeys: string[];
  blockedCapabilityKeys: string[];
  decisions: GovernancePolicyRuntimeDecision[];
};
