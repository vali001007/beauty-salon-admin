import { BadRequestException, Injectable, NotFoundException, Optional } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service.js';
import { BrainReleaseService } from './brain-release.service.js';
import { BrainGovernanceEventService } from './brain-governance-event.service.js';
import { BrainRolloutHealthService } from './brain-rollout-health.service.js';
import { BrainReleaseIdentityService } from './brain-release-identity.service.js';

const STAGES = [
  { key: 'shadow', suffix: 'shadow', mode: 'shadow', percentage: 100 },
  { key: 'canary_5', suffix: 'canary-5', mode: 'model', percentage: 5 },
  { key: 'canary_20', suffix: 'canary-20', mode: 'model', percentage: 20 },
  { key: 'canary_50', suffix: 'canary-50', mode: 'model', percentage: 50 },
  { key: 'full', suffix: 'full', mode: 'model', percentage: 100 },
] as const;

@Injectable()
export class BrainRolloutSequenceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly releaseService: BrainReleaseService,
    private readonly healthService?: BrainRolloutHealthService,
    private readonly events?: BrainGovernanceEventService,
    @Optional() private readonly releaseIdentity?: BrainReleaseIdentityService,
  ) {}

  async list(input: { page?: number; pageSize?: number; status?: string; candidateKey?: string }) {
    const page = positive(input.page, 1);
    const pageSize = bounded(input.pageSize, 20, 100);
    const where: Prisma.BrainRolloutSequenceWhereInput = {
      ...(input.status ? { status: input.status } : {}),
      ...(input.candidateKey ? { candidate: { candidateKey: input.candidateKey } } : {}),
    };
    const [items, total] = await Promise.all([
      this.prisma.brainRolloutSequence.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          candidate: { select: { candidateKey: true, headCommit: true, status: true } },
          policySnapshot: { select: { id: true, releaseKey: true, releaseFamily: true, displayCode: true, displayName: true, scope: true, status: true } },
          releases: { orderBy: { id: 'asc' }, select: { id: true, releaseKey: true, status: true, rolloutStage: true, activatedAt: true, failureReason: true } },
        },
      }),
      this.prisma.brainRolloutSequence.count({ where }),
    ]);
    return { items: items.map((item) => this.withProductIdentities(item)), total, page, pageSize };
  }

  async get(id: number, includeReadiness = true) {
    const sequence = await this.prisma.brainRolloutSequence.findUnique({
      where: { id },
      include: {
        candidate: true,
        policySnapshot: { include: { items: true } },
        previousRuntimeRelease: { select: { id: true, releaseKey: true, status: true } },
        releases: { orderBy: { id: 'asc' }, include: { _count: { select: { items: true } } } },
      },
    });
    if (!sequence) throw new NotFoundException('brain_rollout_sequence_not_found');
    const releases = includeReadiness
      ? await Promise.all(sequence.releases.map(async (release) => ({
          ...release,
          releaseReadiness: await this.releaseService.getReleaseReadiness(release.id).catch((error) => ({
            status: 'unavailable' as const,
            canRelease: false,
            evaluationReleaseId: null,
            evalRunId: null,
            releaseFingerprint: null,
            suiteChecksum: null,
            questionCount: null,
            provider: null,
            model: null,
            generatedAt: null,
            expiresAt: null,
            blockers: [error instanceof Error ? error.message : String(error)],
          })),
        })))
      : sequence.releases;
    return this.withProductIdentities({ ...sequence, releases });
  }

  async create(input: {
    candidateKey: string;
    releaseKey: string;
    resourceVersionIds: number[];
    governanceMode?: string;
    promotionPolicy?: Record<string, unknown>;
    healthThresholds?: Record<string, unknown>;
    displayName?: string;
    productProfile?: string;
    allowDraftPolicy?: boolean;
    actorId: number;
  }) {
    const candidate = await this.prisma.brainGovernanceCandidate.findUnique({
      where: { candidateKey: input.candidateKey },
      include: {
        policySnapshot: true,
        rolloutSequence: { include: { releases: { include: { items: { select: { resourceVersionId: true } } } } } },
      },
    });
    if (!candidate) throw new NotFoundException('brain_governance_candidate_not_found');
    if (candidate.rolloutSequence && hasCompleteRolloutStages(candidate.rolloutSequence.releases)) {
      assertSequenceIdentity(candidate.rolloutSequence, {
        releaseKey: input.releaseKey,
        policySnapshotId: candidate.policySnapshotId,
        governanceMode: input.governanceMode === 'enforced' ? 'enforced' : 'shadow',
        candidateKey: candidate.candidateKey,
        resourceVersionIds: input.resourceVersionIds,
      });
      return this.get(candidate.rolloutSequence.id);
    }
    if (!candidate.rolloutSequence && candidate.status !== 'ready') throw new BadRequestException('candidate_not_ready_for_rollout');
    if (candidate.rolloutSequence && !['ready', 'releasing'].includes(candidate.status)) {
      throw new BadRequestException('candidate_rollout_sequence_not_repairable');
    }
    const policyStatusAllowed = candidate.policySnapshot?.status === 'active'
      || (input.allowDraftPolicy === true && candidate.policySnapshot?.status === 'draft');
    if (!candidate.policySnapshot || candidate.policySnapshot.scope !== 'governance_policy' || !policyStatusAllowed) {
      throw new BadRequestException('active_governance_policy_snapshot_required');
    }
    if (!input.resourceVersionIds.length) throw new BadRequestException('release_resource_versions_required');
    const previousRuntimeRelease = await this.prisma.brainRelease.findFirst({
      where: { status: 'active', scope: { not: 'governance_policy' } },
      orderBy: { activatedAt: 'desc' },
    });
    const sequenceKey = `rollout:${candidate.id}:${candidate.headCommit}`;
    let sequence = candidate.rolloutSequence;
    let sequenceCreated = false;
    if (!sequence) {
      try {
        sequence = await this.prisma.brainRolloutSequence.create({
          data: {
            sequenceKey,
            candidateId: candidate.id,
            status: 'draft',
            currentStage: 'shadow',
            policySnapshotId: candidate.policySnapshot.id,
            governanceMode: input.governanceMode === 'enforced' ? 'enforced' : 'shadow',
            promotionPolicy: json(input.promotionPolicy ?? { mode: 'manual_recommendation', observationMinutes: 30, minimumSampleSize: 20 }),
            healthThresholds: json(input.healthThresholds ?? { maxErrorRate: 0.02, maxTimeoutRate: 0.01, maxPermissionViolationCount: 0, maxNegativeFeedbackRate: 0.1 }),
            previousRuntimeReleaseId: previousRuntimeRelease?.id,
            createdBy: input.actorId,
          },
          include: { releases: { include: { items: { select: { resourceVersionId: true } } } } },
        });
        sequenceCreated = true;
      } catch (error) {
        if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') throw error;
        sequence = await this.prisma.brainRolloutSequence.findUnique({
          where: { candidateId: candidate.id },
          include: { releases: { include: { items: { select: { resourceVersionId: true } } } } },
        });
        if (!sequence) throw error;
      }
    }
    if (sequence.policySnapshotId !== candidate.policySnapshot.id) {
      throw new BadRequestException('rollout_sequence_policy_snapshot_conflict');
    }
    const expectedMode = input.governanceMode === 'enforced' ? 'enforced' : 'shadow';
    if (sequence.governanceMode !== expectedMode) {
      throw new BadRequestException('rollout_sequence_governance_mode_conflict');
    }
    if (this.releaseIdentity && !sequence.runtimeVersionCode) {
      sequence = await this.releaseIdentity.assignRuntimeIdentity(
        sequence.id,
        input.displayName ?? input.releaseKey,
        input.productProfile,
      ) as typeof sequence;
    }
    const existingByStage = new Map(sequence.releases.map((release) => [release.rolloutStage, release]));
    let previousReleaseId = sequence.previousRuntimeReleaseId ?? previousRuntimeRelease?.id;
    for (const stage of STAGES) {
      const releaseKey = `${input.releaseKey}-${stage.suffix}`;
      const existing = existingByStage.get(stage.key);
      let releaseId: number;
      if (!existing) {
        const orphan = await this.prisma.brainRelease.findUnique({
          where: { releaseKey },
          include: { items: { select: { resourceVersionId: true } } },
        });
        if (orphan) {
          assertRecoverableRelease(orphan, {
            releaseKey,
            sequenceId: sequence.id,
            candidateKey: candidate.candidateKey,
            stage: stage.key,
            resourceVersionIds: input.resourceVersionIds,
          });
          releaseId = orphan.id;
        } else {
          try {
            const created = await this.releaseService.createRelease({
              releaseKey,
              scope: 'percentage',
              rollout: {
                stage: stage.key,
                mode: stage.mode,
                userPercentage: stage.percentage,
                productionBaseline: stage.key === 'full',
                governancePolicyReleaseId: candidate.policySnapshot.id,
                governancePolicyMode: sequence.governanceMode,
                candidateKey: candidate.candidateKey,
                rolloutSequenceId: sequence.id,
                ...(input.productProfile ? { productProfile: input.productProfile } : {}),
              },
              resourceVersionIds: input.resourceVersionIds,
              createdBy: input.actorId,
            });
            releaseId = created.id;
          } catch (error) {
            if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') throw error;
            const raced = await this.prisma.brainRelease.findUnique({
              where: { releaseKey },
              include: { items: { select: { resourceVersionId: true } } },
            });
            if (!raced) throw error;
            assertRecoverableRelease(raced, {
              releaseKey,
              sequenceId: sequence.id,
              candidateKey: candidate.candidateKey,
              stage: stage.key,
              resourceVersionIds: input.resourceVersionIds,
            });
            releaseId = raced.id;
          }
        }
      } else {
        assertRecoverableRelease(existing, {
          releaseKey,
          sequenceId: sequence.id,
          candidateKey: candidate.candidateKey,
          stage: stage.key,
          resourceVersionIds: input.resourceVersionIds,
        });
        releaseId = existing.id;
      }
      await this.prisma.brainRelease.update({
        where: { id: releaseId },
        data: { rolloutSequenceId: sequence.id, rolloutStage: stage.key, previousReleaseId },
      });
      previousReleaseId = releaseId;
    }
    await this.prisma.brainGovernanceCandidate.update({ where: { id: candidate.id }, data: { status: 'releasing' } });
    await this.events?.record({
      candidateId: candidate.id,
      eventType: sequenceCreated ? 'rollout_sequence_created' : 'rollout_sequence_recovered',
      entityType: 'rollout_sequence',
      entityId: sequence.id,
      actorType: 'user',
      actorId: input.actorId,
      payload: { sequenceKey, releaseCount: STAGES.length, governanceMode: sequence.governanceMode },
    });
    return this.get(sequence.id);
  }

  async validate(id: number) {
    const sequence = await this.get(id, false);
    const release = sequence.releases.find((item) => item.rolloutStage === sequence.currentStage);
    if (!release) throw new BadRequestException('rollout_stage_release_missing');
    const readiness = await this.releaseService.getReleaseReadiness(release.id);
    const observedHealth = sequence.status === 'active' && release.activatedAt
      ? await this.observeHealth(sequence, release)
      : null;
    return {
      sequenceId: sequence.id,
      stage: sequence.currentStage,
      releaseId: release.id,
      canActivate: readiness.canRelease && sequence.policySnapshot.status === 'active',
      readiness,
      observedHealth,
      canPromote: Boolean(observedHealth?.status === 'ready'),
      blockers: [
        ...(sequence.policySnapshot.status === 'active' ? [] : ['governance_policy_snapshot_not_active']),
        ...readiness.blockers,
      ],
    };
  }

  async activateShadow(id: number, actorId: number) {
    const sequence = await this.get(id, false);
    if (sequence.currentStage !== 'shadow' || !['draft', 'paused'].includes(sequence.status)) {
      throw new BadRequestException('rollout_sequence_shadow_not_activatable');
    }
    const validation = await this.validate(id);
    if (!validation.canActivate) throw new BadRequestException(`rollout_sequence_not_ready:${validation.blockers.join(',')}`);
    const release = await this.releaseService.activateRelease({
      releaseId: validation.releaseId,
      activatedBy: actorId,
      rolloutTransition: { sequenceId: id, fromStage: 'shadow', toStage: 'shadow' },
    });
    await this.prisma.brainRolloutSequence.update({
      where: { id },
      data: { status: 'active', currentStage: 'shadow', approvedBy: actorId, startedAt: sequence.startedAt ?? new Date(), pauseReason: null },
    });
    await this.prisma.brainGovernanceCandidate.update({ where: { id: sequence.candidateId }, data: { status: 'observing' } });
    await this.events?.record({
      candidateId: sequence.candidateId,
      eventType: 'rollout_shadow_activated',
      entityType: 'rollout_sequence',
      entityId: id,
      actorType: 'user',
      actorId,
      payload: { releaseId: validation.releaseId },
    });
    return { sequence: await this.get(id), release };
  }

  async promote(id: number, input: { actorId: number }) {
    const sequence = await this.get(id, false);
    if (sequence.status !== 'active') throw new BadRequestException('rollout_sequence_not_active');
    const currentIndex = STAGES.findIndex((stage) => stage.key === sequence.currentStage);
    if (currentIndex < 0 || currentIndex >= STAGES.length - 1) throw new BadRequestException('rollout_sequence_already_full');
    const currentRelease = sequence.releases.find((item) => item.rolloutStage === sequence.currentStage && item.status === 'active');
    if (!currentRelease) throw new BadRequestException('active_rollout_stage_release_missing');
    const observedHealth = await this.observeHealth(sequence, currentRelease);
    if (observedHealth.status !== 'ready') {
      throw new BadRequestException(`rollout_health_not_ready:${observedHealth.blockers.join(',')}`);
    }
    const nextStage = STAGES[currentIndex + 1]!;
    const release = sequence.releases.find((item) => item.rolloutStage === nextStage.key);
    if (!release) throw new BadRequestException('rollout_stage_release_missing');
    const readiness = await this.releaseService.getReleaseReadiness(release.id);
    if (!readiness.canRelease) throw new BadRequestException(`rollout_stage_not_ready:${readiness.blockers.join(',')}`);
    const activated = await this.releaseService.activateRelease({
      releaseId: release.id,
      activatedBy: input.actorId,
      rolloutTransition: { sequenceId: id, fromStage: sequence.currentStage, toStage: nextStage.key },
    });
    const completed = nextStage.key === 'full';
    await this.prisma.brainRolloutSequence.update({
      where: { id },
      data: { currentStage: nextStage.key, status: completed ? 'completed' : 'active', completedAt: completed ? new Date() : null, approvedBy: input.actorId },
    });
    if (completed) await this.prisma.brainGovernanceCandidate.update({ where: { id: sequence.candidateId }, data: { status: 'completed', completedAt: new Date() } });
    await this.events?.record({
      candidateId: sequence.candidateId,
      eventType: completed ? 'rollout_full_activated' : 'rollout_stage_promoted',
      entityType: 'rollout_sequence',
      entityId: id,
      actorType: 'user',
      actorId: input.actorId,
      payload: { fromStage: sequence.currentStage, toStage: nextStage.key, releaseId: release.id, observedHealth },
    });
    await this.events?.record({
      candidateId: sequence.candidateId,
      eventType: 'runtime_promoted',
      entityType: 'rollout_sequence',
      entityId: id,
      actorType: 'user',
      actorId: input.actorId,
      payload: {
        runtimeCode: sequence.runtimeVersionCode ?? null,
        fromStage: sequence.currentStage,
        toStage: nextStage.key,
        releaseId: release.id,
        completed,
        observedHealth,
      },
    });
    return { sequence: await this.get(id), release: activated };
  }

  async pause(id: number, reason: string, actorId: number) {
    if (!reason.trim()) throw new BadRequestException('rollout_pause_reason_required');
    const sequence = await this.get(id, false);
    if (!['active', 'draft'].includes(sequence.status)) throw new BadRequestException('rollout_sequence_not_pausable');
    const updated = await this.prisma.brainRolloutSequence.update({
      where: { id },
      data: { status: 'paused', pauseReason: reason.trim(), approvedBy: actorId },
    });
    await this.events?.record({
      candidateId: sequence.candidateId,
      eventType: 'rollout_paused',
      entityType: 'rollout_sequence',
      entityId: id,
      actorType: 'user',
      actorId,
      payload: { stage: sequence.currentStage, reason: reason.trim() },
    });
    return updated;
  }

  async resume(id: number, actorId: number) {
    const sequence = await this.get(id, false);
    if (sequence.status !== 'paused') throw new BadRequestException('rollout_sequence_not_paused');
    const current = sequence.releases.find((item) => item.rolloutStage === sequence.currentStage);
    if (!current) throw new BadRequestException('rollout_stage_release_missing');
    const nextStatus = current.status === 'active' ? 'active' : 'draft';
    const candidateStatus = nextStatus === 'active' ? 'observing' : 'releasing';
    const updated = await this.prisma.brainRolloutSequence.update({
      where: { id },
      data: { status: nextStatus, pauseReason: null, approvedBy: actorId },
    });
    await this.prisma.brainGovernanceCandidate.update({
      where: { id: sequence.candidateId },
      data: { status: candidateStatus },
    });
    await this.events?.record({
      candidateId: sequence.candidateId,
      eventType: 'rollout_resumed',
      entityType: 'rollout_sequence',
      entityId: id,
      actorType: 'user',
      actorId,
      payload: { stage: sequence.currentStage, sequenceStatus: nextStatus },
    });
    return updated;
  }

  async rollback(id: number, reason: string, actorId: number) {
    if (!reason.trim()) throw new BadRequestException('rollout_rollback_reason_required');
    const sequence = await this.get(id, false);
    const current = sequence.releases.find((item) => item.rolloutStage === sequence.currentStage && item.status === 'active');
    if (!current) throw new BadRequestException('active_rollout_stage_release_missing');
    if (!sequence.previousRuntimeReleaseId) throw new BadRequestException('previous_runtime_release_missing');
    const release = await this.releaseService.rollbackRelease({
      releaseId: current.id,
      reason: reason.trim(),
      rolloutTransition: {
        sequenceId: id,
        fromStage: sequence.currentStage,
        targetReleaseId: sequence.previousRuntimeReleaseId,
      },
    });
    await this.prisma.brainRolloutSequence.update({
      where: { id },
      data: { status: 'rolled_back', pauseReason: reason.trim(), approvedBy: actorId, completedAt: new Date() },
    });
    await this.prisma.brainGovernanceCandidate.update({
      where: { id: sequence.candidateId },
      data: { status: 'blocked', completedAt: new Date() },
    });
    await this.events?.record({
      candidateId: sequence.candidateId,
      eventType: 'rollout_rolled_back',
      entityType: 'rollout_sequence',
      entityId: id,
      actorType: 'user',
      actorId,
      payload: { fromStage: sequence.currentStage, targetRuntimeReleaseId: sequence.previousRuntimeReleaseId, reason: reason.trim() },
    });
    return { sequence: await this.get(id), release };
  }

  private observeHealth(
    sequence: { promotionPolicy: Prisma.JsonValue; healthThresholds: Prisma.JsonValue },
    release: { id: number; activatedAt: Date | null },
  ) {
    if (!this.healthService) throw new BadRequestException('rollout_health_observer_unavailable');
    return this.healthService.observe({
      releaseId: release.id,
      activatedAt: release.activatedAt,
      promotionPolicy: sequence.promotionPolicy,
      healthThresholds: sequence.healthThresholds,
    });
  }

  private withProductIdentities<T extends {
    id: number;
    currentStage?: string | null;
    runtimeVersionCode?: string | null;
    displayName?: string | null;
    policySnapshot?: Record<string, unknown> | null;
    releases?: Array<Record<string, unknown> & { id: number; releaseKey: string; rolloutStage?: string | null }>;
  }>(sequence: T) {
    const legacyReleaseId = sequence.releases?.find((release) => release.rolloutStage === sequence.currentStage)?.id
      ?? sequence.releases?.[0]?.id;
    const runtimeCode = sequence.runtimeVersionCode ?? (legacyReleaseId ? `LEGACY-RT-${legacyReleaseId}` : 'RT-UNASSIGNED');
    const runtimeIdentity = {
      family: sequence.runtimeVersionCode ? 'runtime' : 'legacy',
      code: runtimeCode,
      stageCode: null,
      name: sequence.displayName ?? (legacyReleaseId ? runtimeCode : '运行版本待分配'),
      internalReleaseId: legacyReleaseId ?? null,
    };
    const policySnapshot = sequence.policySnapshot
      ? {
          ...sequence.policySnapshot,
          productIdentity: this.releaseIdentity?.productIdentity(sequence.policySnapshot as never) ?? null,
        }
      : sequence.policySnapshot;
    const releases = sequence.releases?.map((release) => ({
      ...release,
      productIdentity: this.releaseIdentity?.productIdentity({
        id: release.id,
        releaseKey: release.releaseKey,
        scope: 'percentage',
        rolloutStage: release.rolloutStage,
        rolloutSequence: { runtimeVersionCode: sequence.runtimeVersionCode, displayName: sequence.displayName },
      }) ?? null,
    }));
    return { ...sequence, productIdentity: runtimeIdentity, policySnapshot, ...(releases ? { releases } : {}) };
  }
}

function positive(value: number | undefined, fallback: number) {
  return Number.isInteger(value) && Number(value) > 0 ? Number(value) : fallback;
}

function bounded(value: number | undefined, fallback: number, max: number) {
  return Math.min(positive(value, fallback), max);
}

function json(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function record(value: Prisma.JsonValue): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function hasCompleteRolloutStages(releases: Array<{ rolloutStage?: string | null }>) {
  const stages = new Set(releases.map((release) => release.rolloutStage).filter(Boolean));
  return stages.size === STAGES.length && STAGES.every((stage) => stages.has(stage.key));
}

function assertRecoverableRelease(
  release: {
    releaseKey: string;
    scope: string;
    status: string;
    rollout: Prisma.JsonValue;
    rolloutSequenceId?: number | null;
    rolloutStage?: string | null;
    items?: Array<{ resourceVersionId: number }>;
  },
  expected: {
    releaseKey: string;
    sequenceId: number;
    candidateKey: string;
    stage: string;
    resourceVersionIds: number[];
    requireDraft?: boolean;
  },
) {
  const rollout = record(release.rollout);
  const actualResourceIds = [...new Set((release.items ?? []).map((item) => item.resourceVersionId))].sort((left, right) => left - right);
  const expectedResourceIds = [...new Set(expected.resourceVersionIds)].sort((left, right) => left - right);
  const matchesResources = actualResourceIds.length === expectedResourceIds.length
    && actualResourceIds.every((id, index) => id === expectedResourceIds[index]);
  const sequenceId = Number(rollout.rolloutSequenceId);
  if (
    release.releaseKey !== expected.releaseKey
    || release.scope !== 'percentage'
    || (expected.requireDraft !== false && release.status !== 'draft')
    || String(rollout.candidateKey ?? '') !== expected.candidateKey
    || String(rollout.stage ?? '') !== expected.stage
    || sequenceId !== expected.sequenceId
    || (release.rolloutSequenceId != null && release.rolloutSequenceId !== expected.sequenceId)
    || (release.rolloutStage != null && release.rolloutStage !== expected.stage)
    || !matchesResources
  ) {
    throw new BadRequestException(`rollout_sequence_release_conflict:${expected.stage}`);
  }
}

function assertSequenceIdentity(
  sequence: {
    id: number;
    policySnapshotId: number;
    governanceMode: string;
    releases: Array<{
      releaseKey: string;
      scope: string;
      status: string;
      rollout: Prisma.JsonValue;
      rolloutSequenceId?: number | null;
      rolloutStage?: string | null;
      items?: Array<{ resourceVersionId: number }>;
    }>;
  },
  expected: {
    releaseKey: string;
    policySnapshotId: number | null;
    governanceMode: string;
    candidateKey: string;
    resourceVersionIds: number[];
  },
) {
  if (sequence.policySnapshotId !== expected.policySnapshotId) {
    throw new BadRequestException('rollout_sequence_policy_snapshot_conflict');
  }
  if (sequence.governanceMode !== expected.governanceMode) {
    throw new BadRequestException('rollout_sequence_governance_mode_conflict');
  }
  const releaseByStage = new Map(sequence.releases.map((release) => [release.rolloutStage, release]));
  for (const stage of STAGES) {
    const release = releaseByStage.get(stage.key);
    if (!release) throw new BadRequestException(`rollout_sequence_release_missing:${stage.key}`);
    assertRecoverableRelease(release, {
      releaseKey: `${expected.releaseKey}-${stage.suffix}`,
      sequenceId: sequence.id,
      candidateKey: expected.candidateKey,
      stage: stage.key,
      resourceVersionIds: expected.resourceVersionIds,
      requireDraft: false,
    });
  }
}
