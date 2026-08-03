import { BadRequestException, ConflictException, Injectable, NotFoundException, Optional } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service.js';
import { BrainGovernanceControlPlaneService } from './brain-governance-control-plane.service.js';
import { BrainGovernanceEventService } from './brain-governance-event.service.js';
import { BrainReleaseService } from './brain-release.service.js';
import { BrainReleaseIdentityService } from './brain-release-identity.service.js';
import { BrainRolloutSequenceService } from './brain-rollout-sequence.service.js';
import {
  BRAIN_QUERY_ONLY_ALLOWED_CAPABILITY_KEYS,
  BRAIN_QUERY_ONLY_DISABLED_CAPABILITY_KEYS,
  BRAIN_QUERY_ONLY_PRODUCT_PROFILE,
} from './brain-release-product-profile.js';

const OPEN_TRANSITION_STATUSES = ['draft', 'validated', 'approved', 'switching', 'observing', 'rolling_back'] as const;

@Injectable()
export class BrainGovernanceTransitionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly controlPlane: BrainGovernanceControlPlaneService,
    private readonly releaseService: BrainReleaseService,
    private readonly rolloutSequence: BrainRolloutSequenceService,
    @Optional() private readonly events?: BrainGovernanceEventService,
    @Optional() private readonly releaseIdentity?: BrainReleaseIdentityService,
  ) {}

  async list(input: { page?: number; pageSize?: number; status?: string }) {
    const page = positive(input.page, 1);
    const pageSize = Math.min(positive(input.pageSize, 20), 100);
    const where: Prisma.BrainGovernanceTransitionWhereInput = input.status ? { status: input.status } : {};
    const [items, total] = await Promise.all([
      this.prisma.brainGovernanceTransition.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: transitionInclude,
      }),
      this.prisma.brainGovernanceTransition.count({ where }),
    ]);
    return { items: items.map((item) => this.withProductIdentities(item)), total, page, pageSize };
  }

  async get(id: number) {
    const transition = await this.prisma.brainGovernanceTransition.findUnique({
      where: { id: positiveId(id, 'governance_transition_id_invalid') },
      include: transitionInclude,
    });
    if (!transition) throw new NotFoundException('brain_governance_transition_not_found');
    return this.withProductIdentities(transition);
  }

  async preview(candidateKey: string) {
    const candidate = await this.prisma.brainGovernanceCandidate.findUnique({
      where: { candidateKey: nonEmpty(candidateKey, 'candidateKey') },
      include: {
        receipts: {
          where: {
            status: 'passed',
            expiresAt: { gt: new Date() },
            trustLevel: { in: ['trusted_candidate', 'verified_release'] },
            verificationStatus: 'verified',
            result: { path: ['verification', 'admissionEligible'], equals: true },
          },
          include: { capabilities: true },
        },
      },
    });
    if (!candidate) throw new NotFoundException('brain_governance_candidate_not_found');
    const [oldPolicy, oldRuntime, existing] = await Promise.all([
      this.currentPolicy(),
      this.currentRuntime(),
      this.prisma.brainGovernanceTransition.findFirst({
        where: { candidateId: candidate.id, status: { in: [...OPEN_TRANSITION_STATUSES] } },
        include: transitionInclude,
      }),
    ]);
    const evidenced = new Set(candidate.receipts.flatMap((receipt) =>
      receipt.capabilities.map((capability) => capability.capabilityKey)));
    const expected = [...BRAIN_QUERY_ONLY_ALLOWED_CAPABILITY_KEYS, ...BRAIN_QUERY_ONLY_DISABLED_CAPABILITY_KEYS];
    const missingEvidence = expected.filter((key) => !evidenced.has(key));
    return {
      candidate: { id: candidate.id, candidateKey: candidate.candidateKey, headCommit: candidate.headCommit, status: candidate.status },
      oldPolicy: this.withReleaseIdentity(oldPolicy),
      oldRuntime: this.withReleaseIdentity(oldRuntime),
      existingTransition: existing ? this.withProductIdentities(existing) : null,
      target: {
        policyCode: 'next GP',
        runtimeCode: 'next RT',
        productProfile: BRAIN_QUERY_ONLY_PRODUCT_PROFILE,
        allowedCapabilityCount: BRAIN_QUERY_ONLY_ALLOWED_CAPABILITY_KEYS.length,
        deniedCapabilityCount: BRAIN_QUERY_ONLY_DISABLED_CAPABILITY_KEYS.length,
      },
      missingEvidence,
      canPrepare: !existing && missingEvidence.length === 0,
      blockers: [
        ...(existing ? ['candidate_transition_already_open'] : []),
        ...(missingEvidence.length ? [`query_only_policy_valid_evidence_missing:${missingEvidence.join(',')}`] : []),
      ],
    };
  }

  async prepare(input: { candidateKey: string; actorId: number }) {
    const preview = await this.preview(input.candidateKey);
    if (preview.existingTransition) return preview.existingTransition;
    if (!preview.canPrepare) throw new BadRequestException(preview.blockers[0] ?? 'governance_transition_not_preparable');
    const candidate = await this.prisma.brainGovernanceCandidate.findUniqueOrThrow({
      where: { candidateKey: input.candidateKey },
    });

    const policyVersions = await this.controlPlane.createQueryOnlyPolicyVersions({
      candidateKey: candidate.candidateKey,
      actorId: input.actorId,
    });
    const policy = await this.controlPlane.createPolicySnapshot({
      releaseKey: `ami-brain-policy-query-only-v1-${candidate.headCommit.slice(0, 12)}`,
      resourceVersionIds: policyVersions.resourceVersionIds,
      actorId: input.actorId,
      note: `candidate:${candidate.candidateKey};productProfile:${BRAIN_QUERY_ONLY_PRODUCT_PROFILE}`,
      displayName: 'Query Only V1 强制治理策略',
    });
    await this.prisma.brainGovernanceCandidate.update({
      where: { id: candidate.id },
      data: { policySnapshotId: policy.id, policyDecision: 'create_query_only_snapshot', status: 'ready' },
    });

    const runtimeSource = await this.currentRuntime(true);
    const allowed = new Set<string>(BRAIN_QUERY_ONLY_ALLOWED_CAPABILITY_KEYS);
    const resourceVersionIds = runtimeSource.items
      .filter((item) => item.resourceType === 'skill' && allowed.has(item.resourceKey))
      .map((item) => item.resourceVersionId);
    if (resourceVersionIds.length !== allowed.size) {
      throw new BadRequestException(`query_only_runtime_capability_manifest_incomplete:${resourceVersionIds.length}/${allowed.size}`);
    }
    for (const item of runtimeSource.items.filter((row) => allowed.has(row.resourceKey))) {
      const snapshot = record(item.snapshot);
      if (snapshot.readOnly !== true || snapshot.sideEffect !== false) {
        throw new BadRequestException(`brain_query_only_side_effect_capability:${item.resourceKey}`);
      }
    }

    const sequence = await this.rolloutSequence.create({
      candidateKey: candidate.candidateKey,
      releaseKey: `ami-brain-runtime-query-only-v1-${candidate.headCommit.slice(0, 12)}`,
      resourceVersionIds,
      governanceMode: 'enforced',
      displayName: 'Query Only V1',
      productProfile: BRAIN_QUERY_ONLY_PRODUCT_PROFILE,
      allowDraftPolicy: true,
      actorId: input.actorId,
    });
    const transitionKey = sha256({
      candidateId: candidate.id,
      headCommit: candidate.headCommit,
      sourceFingerprint: candidate.sourceFingerprint,
      oldPolicyReleaseId: policyVersions.sourcePolicyReleaseId,
      newPolicyReleaseId: policy.id,
      oldRuntimeReleaseId: runtimeSource.id,
      runtimeVersionCode: sequence.runtimeVersionCode,
      productProfile: sequence.productProfile,
    });
    let transition: Prisma.BrainGovernanceTransitionGetPayload<{ include: typeof transitionInclude }>;
    let created = false;
    try {
      transition = await this.prisma.brainGovernanceTransition.create({
        data: {
          transitionKey,
          status: 'draft',
          candidateId: candidate.id,
          oldPolicyReleaseId: policyVersions.sourcePolicyReleaseId,
          newPolicyReleaseId: policy.id,
          oldRuntimeReleaseId: runtimeSource.id,
          runtimeSequenceId: sequence.id,
          currentStep: 'prepared',
          createdBy: input.actorId,
        },
        include: transitionInclude,
      });
      created = true;
    } catch (error) {
      if (!isPrismaCode(error, 'P2002')) throw error;
      const raced = await this.prisma.brainGovernanceTransition.findFirst({
        where: {
          candidateId: candidate.id,
          status: { in: [...OPEN_TRANSITION_STATUSES] },
        },
        include: transitionInclude,
      });
      if (!raced) throw error;
      transition = raced;
    }
    if (created) await this.events?.record({
      candidateId: candidate.id,
      eventType: 'transition_prepared',
      entityType: 'governance_transition',
      entityId: transition.id,
      actorType: 'user',
      actorId: input.actorId,
      payload: {
        transitionKey,
        oldPolicyReleaseId: transition.oldPolicyReleaseId,
        newPolicyReleaseId: transition.newPolicyReleaseId,
        oldRuntimeReleaseId: transition.oldRuntimeReleaseId,
        runtimeSequenceId: transition.runtimeSequenceId,
      },
    });
    return transition;
  }

  async validate(id: number) {
    const transition = await this.get(id);
    if (!['draft', 'validated', 'approved'].includes(transition.status)) {
      throw new BadRequestException('governance_transition_not_validatable');
    }
    const blockers: string[] = [];
    if (!['draft', 'active'].includes(transition.newPolicy.status)) blockers.push('new_policy_snapshot_not_publishable');
    const expected = new Set<string>([...BRAIN_QUERY_ONLY_ALLOWED_CAPABILITY_KEYS, ...BRAIN_QUERY_ONLY_DISABLED_CAPABILITY_KEYS]);
    const policyItems = transition.newPolicy.items;
    if (policyItems.length !== expected.size) blockers.push('query_only_policy_item_count_invalid');
    for (const item of policyItems) {
      const policy = record(item.snapshot);
      const isAllowed = BRAIN_QUERY_ONLY_ALLOWED_CAPABILITY_KEYS.includes(item.resourceKey as never);
      const isDisabled = BRAIN_QUERY_ONLY_DISABLED_CAPABILITY_KEYS.includes(item.resourceKey as never);
      if (!isAllowed && !isDisabled) blockers.push(`query_only_policy_capability_extra:${item.resourceKey}`);
      if (policy.runtimeEnforcementStatus !== 'enforced') blockers.push(`query_only_policy_not_enforced:${item.resourceKey}`);
      if (isAllowed && (policy.whitelistStatus !== 'approved' || policy.riskLevel !== 'low' || policy.mode !== 'readonly')) {
        blockers.push(`query_only_policy_readonly_not_approved:${item.resourceKey}`);
      }
      if (isDisabled && (policy.whitelistStatus !== 'not_allowed' || policy.riskLevel !== 'high')) {
        blockers.push(`query_only_policy_action_not_denied:${item.resourceKey}`);
      }
      if (!Array.isArray(policy.evidence) || policy.evidence.length === 0) blockers.push(`query_only_policy_evidence_missing:${item.resourceKey}`);
    }
    const shadow = transition.runtimeSequence.releases.find((release) => release.rolloutStage === 'shadow');
    if (!shadow) blockers.push('rollout_stage_release_missing:shadow');
    const readiness = shadow ? await this.releaseService.getReleaseReadiness(shadow.id) : null;
    if (readiness && !readiness.canRelease) blockers.push(...readiness.blockers);
    const sequenceProfile = transition.runtimeSequence.productProfile;
    if (sequenceProfile !== BRAIN_QUERY_ONLY_PRODUCT_PROFILE) blockers.push('runtime_sequence_product_profile_invalid');
    const uniqueBlockers = [...new Set(blockers)];
    const validated = uniqueBlockers.length === 0;
    await this.prisma.brainGovernanceTransition.update({
      where: { id: transition.id },
      data: {
        status: validated ? (transition.policyApprovedAt && transition.runtimeApprovedAt ? 'approved' : 'validated') : 'draft',
        currentStep: validated ? 'validated' : 'validation_blocked',
        failureCode: validated ? null : uniqueBlockers[0],
        failureMessage: validated ? null : uniqueBlockers.join(','),
      },
    });
    return { transitionId: transition.id, valid: validated, blockers: uniqueBlockers, readiness };
  }

  async approvePolicy(id: number, actorId: number) {
    const existing = await this.prisma.brainGovernanceTransition.findUniqueOrThrow({ where: { id } });
    if (existing.policyApprovedAt) return existing;
    const validation = await this.validate(id);
    if (!validation.valid) throw new BadRequestException(`governance_transition_not_valid:${validation.blockers.join(',')}`);
    const claim = await this.prisma.brainGovernanceTransition.updateMany({
      where: { id, policyApprovedAt: null },
      data: {
        policyApprovedBy: actorId,
        policyApprovedAt: new Date(),
        currentStep: 'policy_approved',
      },
    });
    let updated = await this.prisma.brainGovernanceTransition.findUniqueOrThrow({ where: { id } });
    if (updated.policyApprovedAt && updated.runtimeApprovedAt && updated.status !== 'approved') {
      updated = await this.prisma.brainGovernanceTransition.update({ where: { id }, data: { status: 'approved' } });
    }
    if (claim.count === 1) {
      await this.events?.record({ eventType: 'policy_approved', entityType: 'governance_transition', entityId: id, actorType: 'user', actorId, payload: {} });
    }
    return updated;
  }

  async approveRuntime(id: number, actorId: number) {
    const existing = await this.prisma.brainGovernanceTransition.findUniqueOrThrow({ where: { id } });
    if (existing.runtimeApprovedAt) return existing;
    const validation = await this.validate(id);
    if (!validation.valid) throw new BadRequestException(`governance_transition_not_valid:${validation.blockers.join(',')}`);
    const claim = await this.prisma.brainGovernanceTransition.updateMany({
      where: { id, runtimeApprovedAt: null },
      data: {
        runtimeApprovedBy: actorId,
        runtimeApprovedAt: new Date(),
        currentStep: 'runtime_approved',
      },
    });
    let updated = await this.prisma.brainGovernanceTransition.findUniqueOrThrow({ where: { id } });
    if (updated.policyApprovedAt && updated.runtimeApprovedAt && updated.status !== 'approved') {
      updated = await this.prisma.brainGovernanceTransition.update({ where: { id }, data: { status: 'approved' } });
    }
    if (claim.count === 1) {
      await this.events?.record({ eventType: 'runtime_approved', entityType: 'governance_transition', entityId: id, actorType: 'user', actorId, payload: {} });
    }
    return updated;
  }

  async switch(input: { id: number; actorId: number; storeId: number; userId: number; roleKey: string }) {
    return this.withTransitionMutationLock(() => this.switchLocked(input));
  }

  private async switchLocked(input: { id: number; actorId: number; storeId: number; userId: number; roleKey: string }) {
    const transition = await this.get(input.id);
    if (transition.status === 'observing' || transition.status === 'completed') return transition;
    if (!transition.policyApprovedAt || !transition.runtimeApprovedAt) {
      throw new BadRequestException('governance_transition_approvals_incomplete');
    }
    if (!['approved', 'validated', 'switching'].includes(transition.status)) throw new BadRequestException('governance_transition_not_switchable');
    const shadowBeforeSwitch = transition.runtimeSequence.releases.find((release) => release.rolloutStage === 'shadow');
    const activePolicy = await this.currentPolicy();
    const expectedActivePolicyId = transition.newPolicy.status === 'active'
      ? transition.newPolicyReleaseId
      : transition.oldPolicyReleaseId;
    if (activePolicy.id !== expectedActivePolicyId) throw new ConflictException('governance_transition_active_policy_drift');
    if (!['draft', 'active'].includes(transition.newPolicy.status)) throw new ConflictException('governance_transition_target_policy_drift');
    if (!shadowBeforeSwitch || !['draft', 'active'].includes(shadowBeforeSwitch.status)) {
      throw new ConflictException('governance_transition_target_runtime_drift');
    }
    if (shadowBeforeSwitch.status !== 'active' && transition.oldRuntime.status !== 'active') {
      throw new ConflictException('governance_transition_old_runtime_drift');
    }
    if (
      transition.runtimeSequence.productProfile !== BRAIN_QUERY_ONLY_PRODUCT_PROFILE
      || !/^RT-\d{3,}$/u.test(transition.runtimeSequence.runtimeVersionCode ?? '')
      || !/^GP-\d{3,}$/u.test(transition.newPolicy.productIdentity?.code ?? '')
    ) {
      throw new ConflictException('governance_transition_product_identity_drift');
    }
    if (transition.status !== 'switching') {
      await this.prisma.brainGovernanceTransition.update({
        where: { id: transition.id },
        data: { status: 'switching', currentStep: 'publishing_policy', startedAt: transition.startedAt ?? new Date(), failureCode: null, failureMessage: null },
      });
    }

    let policyPublished = transition.newPolicy.status === 'active';
    let runtimeActivated = transition.runtimeSequence.releases.some((release) => release.rolloutStage === 'shadow' && release.status === 'active');
    try {
      if (!policyPublished) {
        await this.controlPlane.publishPolicySnapshot(transition.newPolicyReleaseId, input.actorId);
        policyPublished = true;
      }
      await this.prisma.brainGovernanceTransition.update({ where: { id: transition.id }, data: { currentStep: 'activating_runtime_shadow' } });
      if (!runtimeActivated) {
        await this.rolloutSequence.activateShadow(transition.runtimeSequenceId, input.actorId);
        runtimeActivated = true;
      }
      const effective = await this.releaseService.resolveRuntimeDeploymentIdentity({
        storeId: input.storeId,
        userId: input.userId,
        roleKey: input.roleKey,
      });
      const shadow = (await this.get(transition.id)).runtimeSequence.releases.find((release) => release.rolloutStage === 'shadow');
      const expectedRuntimeCode = transition.runtimeSequence.runtimeVersionCode;
      if (
        !shadow
        || effective.release?.id !== shadow.id
        || effective.productProfile.productProfile !== BRAIN_QUERY_ONLY_PRODUCT_PROFILE
        || effective.governancePolicyIdentity?.internalReleaseId !== transition.newPolicyReleaseId
        || (expectedRuntimeCode && effective.productIdentity?.code !== expectedRuntimeCode)
      ) {
        throw new ConflictException('governance_transition_runtime_verification_failed');
      }
      const now = new Date();
      await this.prisma.$transaction([
        this.prisma.brainRelease.update({
          where: { id: transition.oldPolicyReleaseId },
          data: {
            retiredAt: now,
            retirementReason: 'superseded_by_query_only_v1',
            supersededAt: now,
            supersededByReleaseId: transition.newPolicyReleaseId,
          },
        }),
        this.prisma.brainGovernanceTransition.update({
          where: { id: transition.id },
          data: { status: 'observing', currentStep: 'runtime_shadow_active', failureCode: null, failureMessage: null },
        }),
      ]);
      await this.events?.record({
        candidateId: transition.candidateId,
        eventType: 'policy_switched',
        entityType: 'governance_transition',
        entityId: transition.id,
        actorType: 'user',
        actorId: input.actorId,
        payload: { effectiveReleaseId: effective.release.id, policyReleaseId: transition.newPolicyReleaseId },
      });
      return this.get(transition.id);
    } catch (error) {
      const compensationErrors: string[] = [];
      if (runtimeActivated) {
        try {
          await this.rolloutSequence.rollback(transition.runtimeSequenceId, 'governance_transition_compensation', input.actorId);
        } catch (rollbackError) {
          compensationErrors.push(rollbackError instanceof Error ? rollbackError.message : String(rollbackError));
        }
      }
      if (policyPublished) {
        try {
          const currentPolicy = await this.prisma.brainRelease.findUnique({ where: { id: transition.newPolicyReleaseId } });
          if (currentPolicy?.status === 'active') {
            await this.controlPlane.rollbackPolicySnapshot(transition.newPolicyReleaseId, 'governance_transition_compensation', input.actorId);
          }
        } catch (rollbackError) {
          compensationErrors.push(rollbackError instanceof Error ? rollbackError.message : String(rollbackError));
        }
      }
      const reason = error instanceof Error ? error.message : String(error);
      await this.prisma.brainGovernanceTransition.update({
        where: { id: transition.id },
        data: {
          status: compensationErrors.length ? 'failed' : 'rolled_back',
          currentStep: compensationErrors.length ? 'compensation_failed' : 'compensation_completed',
          failureCode: reason,
          failureMessage: [reason, ...compensationErrors].join(';'),
          completedAt: new Date(),
        },
      });
      throw error;
    }
  }

  async rollback(id: number, reason: string, actorId: number) {
    return this.withTransitionMutationLock(() => this.rollbackLocked(id, reason, actorId));
  }

  private async rollbackLocked(id: number, reason: string, actorId: number) {
    const transition = await this.get(id);
    if (transition.status === 'rolled_back') return transition;
    const rollbackReason = nonEmpty(reason, 'governance_transition_rollback_reason_required');
    await this.prisma.brainGovernanceTransition.update({ where: { id }, data: { status: 'rolling_back', currentStep: 'rolling_back' } });
    const currentStage = transition.runtimeSequence.releases.find((release) =>
      release.rolloutStage === transition.runtimeSequence.currentStage && release.status === 'active');
    if (currentStage) await this.rolloutSequence.rollback(transition.runtimeSequenceId, rollbackReason, actorId);
    const newPolicy = await this.prisma.brainRelease.findUnique({ where: { id: transition.newPolicyReleaseId } });
    if (newPolicy?.status === 'active') await this.controlPlane.rollbackPolicySnapshot(newPolicy.id, rollbackReason, actorId);
    await this.prisma.$transaction([
      this.prisma.brainRelease.update({
        where: { id: transition.oldPolicyReleaseId },
        data: {
          retiredAt: null,
          retirementReason: null,
          supersededAt: null,
          supersededByReleaseId: null,
        },
      }),
      this.prisma.brainRelease.update({
        where: { id: transition.oldRuntimeReleaseId },
        data: { supersededAt: null, supersededByReleaseId: null },
      }),
      this.prisma.brainGovernanceTransition.update({
        where: { id },
        data: { status: 'rolled_back', currentStep: 'rollback_completed', failureCode: rollbackReason, completedAt: new Date() },
      }),
    ]);
    return this.get(id);
  }

  async finalize(id: number, actorId: number) {
    return this.withTransitionMutationLock(() => this.finalizeLocked(id, actorId));
  }

  private async finalizeLocked(id: number, actorId: number) {
    const transition = await this.get(id);
    if (transition.status === 'completed') return transition;
    if (transition.status !== 'observing') throw new BadRequestException('governance_transition_not_finalizable');
    if (transition.runtimeSequence.status !== 'completed' || transition.runtimeSequence.currentStage !== 'full') {
      throw new BadRequestException('runtime_rollout_not_full');
    }
    const full = transition.runtimeSequence.releases.find((release) => release.rolloutStage === 'full' && release.status === 'active');
    if (!full) throw new BadRequestException('runtime_full_release_not_active');
    const now = new Date();
    await this.prisma.$transaction([
      this.prisma.brainRelease.update({
        where: { id: transition.oldRuntimeReleaseId },
        data: { status: 'archived', supersededAt: now, supersededByReleaseId: full.id },
      }),
      this.prisma.brainGovernanceTransition.update({
        where: { id },
        data: { status: 'completed', currentStep: 'completed', completedAt: now },
      }),
    ]);
    await this.events?.record({
      candidateId: transition.candidateId,
      eventType: 'transition_completed',
      entityType: 'governance_transition',
      entityId: transition.id,
      actorType: 'user',
      actorId,
      payload: { supersededRuntimeReleaseId: transition.oldRuntimeReleaseId, activeRuntimeReleaseId: full.id },
    });
    return this.get(id);
  }

  private async currentPolicy() {
    const policy = await this.prisma.brainRelease.findFirst({
      where: { scope: 'governance_policy', status: 'active' },
      orderBy: { activatedAt: 'desc' },
    });
    if (!policy) throw new BadRequestException('active_policy_snapshot_missing');
    return policy;
  }

  private async withTransitionMutationLock<T>(work: () => Promise<T>): Promise<T> {
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw(Prisma.sql`SELECT pg_advisory_xact_lock(20260804, 7301)`);
      return work();
    }, { maxWait: 10_000, timeout: 180_000 });
  }

  private async currentRuntime(includeItems = false) {
    const runtime = await this.prisma.brainRelease.findFirst({
      where: { status: 'active', scope: { in: ['global', 'store', 'user', 'role', 'percentage'] } },
      orderBy: { activatedAt: 'desc' },
      ...(includeItems ? { include: { items: true } } : {}),
    });
    if (!runtime) throw new BadRequestException('active_runtime_release_missing');
    return runtime as typeof runtime & { items: Array<{ resourceType: string; resourceKey: string; resourceVersionId: number; snapshot: Prisma.JsonValue }> };
  }

  private withReleaseIdentity<T extends { id: number; releaseKey: string; scope: string }>(release: T) {
    return {
      ...release,
      productIdentity: this.releaseIdentity?.productIdentity(release) ?? fallbackProductIdentity(release),
    };
  }

  private withProductIdentities<T extends {
    oldPolicy: { id: number; releaseKey: string; scope: string };
    newPolicy: { id: number; releaseKey: string; scope: string };
    oldRuntime: { id: number; releaseKey: string; scope: string };
    runtimeSequence: {
      id: number;
      currentStage?: string | null;
      runtimeVersionCode?: string | null;
      displayName?: string | null;
      productProfile?: string | null;
      policySnapshot?: { id: number; releaseKey: string; scope: string } | null;
      releases?: Array<{ id: number; releaseKey: string; scope: string; rolloutStage?: string | null }>;
    };
  }>(transition: T) {
    const sequence = transition.runtimeSequence;
    const legacyReleaseId = sequence.releases?.find((release) => release.rolloutStage === sequence.currentStage)?.id
      ?? sequence.releases?.[0]?.id;
    const runtimeCode = sequence.runtimeVersionCode ?? (legacyReleaseId ? `LEGACY-RT-${legacyReleaseId}` : 'RT-UNASSIGNED');
    const productIdentity = {
      family: sequence.runtimeVersionCode ? 'runtime' : 'legacy',
      code: runtimeCode,
      stageCode: null,
      name: sequence.displayName ?? (legacyReleaseId ? runtimeCode : '运行版本待分配'),
      internalReleaseId: legacyReleaseId ?? null,
    };
    return {
      ...transition,
      oldPolicy: this.withReleaseIdentity(transition.oldPolicy),
      newPolicy: this.withReleaseIdentity(transition.newPolicy),
      oldRuntime: this.withReleaseIdentity(transition.oldRuntime),
      runtimeSequence: {
        ...sequence,
        productIdentity,
        policySnapshot: sequence.policySnapshot ? this.withReleaseIdentity(sequence.policySnapshot) : sequence.policySnapshot,
        releases: sequence.releases?.map((release) => ({
          ...release,
          productIdentity: this.releaseIdentity?.productIdentity({
            ...release,
            rolloutSequence: {
              runtimeVersionCode: sequence.runtimeVersionCode,
              displayName: sequence.displayName,
            },
          }) ?? fallbackProductIdentity(release),
        })),
      },
    };
  }
}

const transitionInclude = {
  candidate: { select: { id: true, candidateKey: true, headCommit: true, status: true } },
  oldPolicy: { include: { items: true } },
  newPolicy: { include: { items: true } },
  oldRuntime: true,
  runtimeSequence: {
    include: {
      policySnapshot: true,
      previousRuntimeRelease: true,
      releases: { orderBy: { id: 'asc' as const }, include: { _count: { select: { items: true } } } },
    },
  },
} satisfies Prisma.BrainGovernanceTransitionInclude;

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function positive(value: number | undefined, fallback: number) {
  return Number.isInteger(value) && Number(value) > 0 ? Number(value) : fallback;
}

function positiveId(value: number, code: string) {
  if (!Number.isInteger(value) || value <= 0) throw new BadRequestException(code);
  return value;
}

function nonEmpty(value: string, code: string) {
  if (!value.trim()) throw new BadRequestException(code);
  return value.trim();
}

function sha256(value: unknown) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function isPrismaCode(error: unknown, code: string) {
  return Boolean(error && typeof error === 'object' && 'code' in error && (error as { code?: unknown }).code === code);
}

function fallbackProductIdentity(release: { id: number; releaseKey: string; scope: string }) {
  const policy = release.scope === 'governance_policy';
  return {
    family: 'legacy' as const,
    code: policy ? `LEGACY-GP-${release.id}` : `LEGACY-RT-${release.id}`,
    stageCode: null,
    name: release.releaseKey,
    internalReleaseId: release.id,
  };
}
