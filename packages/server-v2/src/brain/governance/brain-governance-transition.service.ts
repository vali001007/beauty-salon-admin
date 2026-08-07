import { BadRequestException, ConflictException, Injectable, NotFoundException, Optional } from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
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
import {
  BRAIN_GOVERNANCE_TARGET_POLICY_CODE,
  BRAIN_GOVERNANCE_TARGET_POLICY_NAME,
  BRAIN_GOVERNANCE_TARGET_RUNTIME_CODE,
  BRAIN_GOVERNANCE_TARGET_RUNTIME_NAME,
  brainGovernanceTargetPolicyReleaseKey,
  brainGovernanceTargetRuntimeReleaseKey,
  inspectBrainGovernanceTransitionTargets,
} from './brain-governance-transition-target.js';

const OPEN_TRANSITION_STATUSES = ['draft', 'validated', 'approved', 'switching', 'observing', 'rolling_back'] as const;
const TRANSITION_MUTATION_LEASE_MS = 5 * 60 * 1000;
const RELEASE_ACCEPTANCE_V2 = 'ami-brain-release-acceptance/v2';
const ROLLOUT_STAGES = ['shadow', 'canary_5', 'canary_20', 'canary_50', 'full'] as const;
const CANDIDATE_WORKFLOW_ISSUER = 'CI/CD';
const RELEASE_CANDIDATE_ISSUER = 'ami-brain-release-candidate';
const RELEASE_SNAPSHOT_ISSUER = 'brain-governance-release-snapshot';
const QUERY_ONLY_REQUIRED_EVIDENCE_TYPES = [
  'release_contract',
  'permission_matrix',
  'cross_client_e2e',
  'target_database',
  'provider_fallback',
  'rollback_drill',
] as const;
const QUERY_ONLY_PRERELEASE_EVIDENCE_TYPES = QUERY_ONLY_REQUIRED_EVIDENCE_TYPES.filter(
  (gateKey) => gateKey !== 'rollback_drill',
);

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
    const candidate = await this.loadCandidateEvidence(nonEmpty(candidateKey, 'candidateKey'));
    if (!candidate) throw new NotFoundException('brain_governance_candidate_not_found');
    const evidence = await this.resolveCandidateEvidence(candidate);
    const [oldPolicy, oldRuntime, existing, targetIdentity] = await Promise.all([
      this.currentPolicy(),
      this.currentRuntime(),
      this.prisma.brainGovernanceTransition.findFirst({
        where: { candidateId: candidate.id, status: { in: [...OPEN_TRANSITION_STATUSES] } },
        include: transitionInclude,
      }),
      this.inspectTargetIdentity(candidate),
    ]);
    const blockers = [
      ...(existing ? ['candidate_transition_already_open'] : []),
      ...targetIdentity.blockers,
      ...evidence.blockers,
    ];
    return {
      candidate: { id: candidate.id, candidateKey: candidate.candidateKey, headCommit: candidate.headCommit, status: candidate.status },
      oldPolicy: this.withReleaseIdentity(oldPolicy),
      oldRuntime: this.withReleaseIdentity(oldRuntime),
      existingTransition: existing ? this.withProductIdentities(existing) : null,
      target: {
        policyCode: BRAIN_GOVERNANCE_TARGET_POLICY_CODE,
        runtimeCode: BRAIN_GOVERNANCE_TARGET_RUNTIME_CODE,
        productProfile: BRAIN_QUERY_ONLY_PRODUCT_PROFILE,
        allowedCapabilityCount: BRAIN_QUERY_ONLY_ALLOWED_CAPABILITY_KEYS.length,
        deniedCapabilityCount: BRAIN_QUERY_ONLY_DISABLED_CAPABILITY_KEYS.length,
        identity: targetIdentity,
      },
      evidenceReceipt: evidence.receipt ? {
        id: evidence.receipt.id,
        receiptKey: evidence.receipt.receiptKey,
        phase: evidence.phase,
        evaluationReleaseId: evidence.receipt.evaluationReleaseId,
        evalRunId: evidence.receipt.evalRunId,
        contractVersion: evidence.readiness?.contractVersion ?? null,
      } : evidence.materialization ? {
        id: null,
        receiptKey: null,
        evaluationReleaseId: evidence.materialization.readiness.evaluationReleaseId,
        evalRunId: evidence.materialization.readiness.evalRunId,
        contractVersion: evidence.materialization.readiness.contractVersion,
        sourceEligibilityReceiptId: evidence.materialization.eligibilityReceipt.id,
        materializationPending: true,
      } : null,
      missingEvidence: evidence.missingEvidence,
      canPrepare: !existing && blockers.length === 0,
      blockers,
    };
  }

  async prepare(input: { candidateKey: string; actorId: number }) {
    const preview = await this.preview(input.candidateKey);
    if (preview.existingTransition) return preview.existingTransition;
    if (!preview.canPrepare) throw new BadRequestException(preview.blockers[0] ?? 'governance_transition_not_preparable');
    const candidate = await this.loadCandidateEvidence(input.candidateKey);
    if (!candidate) throw new NotFoundException('brain_governance_candidate_not_found');
    const evidence = await this.resolveCandidateEvidence(candidate);
    if (!evidence.receipt || !evidence.readiness || evidence.blockers.length) {
      throw new BadRequestException(evidence.blockers[0] ?? 'governance_transition_release_evidence_missing');
    }

    let policy: Awaited<ReturnType<BrainGovernanceControlPlaneService['createPolicySnapshot']>>;
    let sequence: Awaited<ReturnType<BrainRolloutSequenceService['create']>>;
    let sourcePolicyReleaseId: number;
    const runtimeSource = await this.currentRuntime(true);
    if (evidence.phase === 'release' && evidence.rollbackDrill) {
      const drill = evidence.rollbackDrill;
      if (
        drill.newPolicyReleaseId !== candidate.policySnapshotId
        || drill.runtimeSequenceId !== drill.runtimeSequence.id
        || drill.oldRuntimeReleaseId !== runtimeSource.id
      ) throw new ConflictException('rollback_drill_target_identity_drift');
      const currentPolicy = await this.currentPolicy();
      if (currentPolicy.id !== drill.oldPolicyReleaseId) {
        throw new ConflictException('rollback_drill_policy_baseline_drift');
      }
      const rearmed = await this.rearmAfterVerifiedRollbackDrill({
        candidate,
        drill,
        receipt: evidence.receipt,
        actorId: input.actorId,
      });
      policy = rearmed.policy;
      sequence = rearmed.sequence;
      sourcePolicyReleaseId = drill.oldPolicyReleaseId;
    } else {
      const policyVersions = await this.controlPlane.createQueryOnlyPolicyVersions({
        candidateKey: candidate.candidateKey,
        actorId: input.actorId,
        evidenceReceiptId: evidence.receipt.id,
      });
      policy = await this.controlPlane.createPolicySnapshot({
        releaseKey: brainGovernanceTargetPolicyReleaseKey(candidate.headCommit),
        resourceVersionIds: policyVersions.resourceVersionIds,
        actorId: input.actorId,
        note: `candidate:${candidate.candidateKey};productProfile:${BRAIN_QUERY_ONLY_PRODUCT_PROFILE}`,
        displayName: BRAIN_GOVERNANCE_TARGET_POLICY_NAME,
        expectedDisplayCode: BRAIN_GOVERNANCE_TARGET_POLICY_CODE,
      });
      await this.prisma.brainGovernanceCandidate.update({
        where: { id: candidate.id },
        data: { policySnapshotId: policy.id, policyDecision: 'create_query_only_snapshot' },
      });

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

      sequence = await this.rolloutSequence.create({
        candidateKey: candidate.candidateKey,
        releaseKey: brainGovernanceTargetRuntimeReleaseKey(candidate.headCommit),
        resourceVersionIds,
        governanceMode: 'enforced',
        displayName: BRAIN_GOVERNANCE_TARGET_RUNTIME_NAME,
        productProfile: BRAIN_QUERY_ONLY_PRODUCT_PROFILE,
        expectedRuntimeVersionCode: BRAIN_GOVERNANCE_TARGET_RUNTIME_CODE,
        evaluationEvidenceReleaseId: evidence.receipt.evaluationReleaseId!,
        evaluationEvidenceEvalRunId: evidence.receipt.evalRunId!,
        evaluationEvidenceReceiptId: evidence.receipt.id,
        admissionPhase: evidence.phase ?? undefined,
        allowDraftPolicy: true,
        transitionPreparation: true,
        actorId: input.actorId,
      });
      sourcePolicyReleaseId = policyVersions.sourcePolicyReleaseId;
    }
    if (policy.displayCode !== BRAIN_GOVERNANCE_TARGET_POLICY_CODE) {
      throw new ConflictException(`governance_transition_policy_identity_invalid:${policy.displayCode ?? 'unassigned'}`);
    }
    if (sequence.runtimeVersionCode !== BRAIN_GOVERNANCE_TARGET_RUNTIME_CODE) {
      throw new ConflictException(`governance_transition_runtime_identity_invalid:${sequence.runtimeVersionCode ?? 'unassigned'}`);
    }
    const transitionKey = sha256({
      candidateId: candidate.id,
      headCommit: candidate.headCommit,
      sourceFingerprint: candidate.sourceFingerprint,
      oldPolicyReleaseId: sourcePolicyReleaseId,
      newPolicyReleaseId: policy.id,
      oldRuntimeReleaseId: runtimeSource.id,
      runtimeVersionCode: sequence.runtimeVersionCode,
      productProfile: sequence.productProfile,
      evidenceReceiptId: evidence.receipt.id,
      evidenceResultChecksum: evidence.receipt.resultChecksum,
    });
    const evidenceSnapshot = frozenEvidenceSnapshot(candidate, evidence.receipt, evidence.readiness);
    let transition: Prisma.BrainGovernanceTransitionGetPayload<{ include: typeof transitionInclude }>;
    let created = false;
    try {
      transition = await this.prisma.brainGovernanceTransition.create({
        data: {
          transitionKey,
          status: 'draft',
          candidateId: candidate.id,
          oldPolicyReleaseId: sourcePolicyReleaseId,
          newPolicyReleaseId: policy.id,
          oldRuntimeReleaseId: runtimeSource.id,
          runtimeSequenceId: sequence.id,
          evidenceReceiptId: evidence.receipt.id,
          evidenceSnapshot,
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
    const detailedTransition = this.withProductIdentities(transition);
    if (created) await this.events?.record({
      candidateId: candidate.id,
      eventType: 'transition_prepared',
      entityType: 'governance_transition',
      entityId: transition.id,
      actorType: 'user',
      actorId: input.actorId,
      payload: transitionAuditPayload(detailedTransition),
    });
    return detailedTransition;
  }

  async validate(id: number) {
    const transition = await this.get(id);
    if (!['draft', 'validated', 'approved'].includes(transition.status)) {
      throw new BadRequestException('governance_transition_not_validatable');
    }
    const blockers: string[] = [];
    const frozenEvidence = await this.validateFrozenEvidence(transition);
    blockers.push(...frozenEvidence.blockers);
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
    if (existing.policyApprovedAt) return this.get(id);
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
    const detailedTransition = await this.get(id);
    if (claim.count === 1) {
      await this.events?.record({
        candidateId: detailedTransition.candidateId,
        eventType: 'policy_approved',
        entityType: 'governance_transition',
        entityId: id,
        actorType: 'user',
        actorId,
        payload: transitionAuditPayload(detailedTransition),
      });
    }
    return detailedTransition;
  }

  async approveRuntime(id: number, actorId: number) {
    const existing = await this.prisma.brainGovernanceTransition.findUniqueOrThrow({ where: { id } });
    if (existing.runtimeApprovedAt) return this.get(id);
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
    const detailedTransition = await this.get(id);
    if (claim.count === 1) {
      await this.events?.record({
        candidateId: detailedTransition.candidateId,
        eventType: 'runtime_approved',
        entityType: 'governance_transition',
        entityId: id,
        actorType: 'user',
        actorId,
        payload: transitionAuditPayload(detailedTransition),
      });
    }
    return detailedTransition;
  }

  async switch(input: { id: number; actorId: number; storeId: number; userId: number; roleKey: string }) {
    return this.withTransitionMutationLease(input.id, 'switch', () => this.switchLocked(input));
  }

  private async switchLocked(input: { id: number; actorId: number; storeId: number; userId: number; roleKey: string }) {
    const transition = await this.get(input.id);
    if (transition.status === 'observing' || transition.status === 'completed') return transition;
    if (!transition.policyApprovedAt || !transition.runtimeApprovedAt) {
      throw new BadRequestException('governance_transition_approvals_incomplete');
    }
    if (!['approved', 'validated', 'switching'].includes(transition.status)) throw new BadRequestException('governance_transition_not_switchable');
    const frozenEvidence = await this.validateFrozenEvidence(transition);
    if (frozenEvidence.blockers.length) {
      throw new ConflictException(`governance_transition_evidence_drift:${frozenEvidence.blockers.join(',')}`);
    }
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
      const auditPayload = transitionAuditPayload(transition, {
        effectiveReleaseId: effective.release.id,
        policyReleaseId: transition.newPolicyReleaseId,
      });
      await this.events?.record({
        candidateId: transition.candidateId,
        eventType: 'runtime_shadow_activated',
        entityType: 'governance_transition',
        entityId: transition.id,
        actorType: 'user',
        actorId: input.actorId,
        payload: auditPayload,
      });
      await this.events?.record({
        candidateId: transition.candidateId,
        eventType: 'policy_switched',
        entityType: 'governance_transition',
        entityId: transition.id,
        actorType: 'user',
        actorId: input.actorId,
        payload: auditPayload,
      });
      await this.events?.record({
        candidateId: transition.candidateId,
        eventType: 'legacy_policy_retired',
        entityType: 'governance_transition',
        entityId: transition.id,
        actorType: 'user',
        actorId: input.actorId,
        payload: auditPayload,
      });
      return this.get(transition.id);
    } catch (error) {
      const compensationErrors: string[] = [];
      try {
        await this.events?.record({
          candidateId: transition.candidateId,
          eventType: 'transition_compensation_started',
          entityType: 'governance_transition',
          entityId: transition.id,
          actorType: 'system',
          payload: transitionAuditPayload(transition),
        });
      } catch (eventError) {
        compensationErrors.push(eventError instanceof Error ? eventError.message : String(eventError));
      }
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
      if (!compensationErrors.length) {
        try {
          await this.events?.record({
            candidateId: transition.candidateId,
            eventType: 'transition_compensation_completed',
            entityType: 'governance_transition',
            entityId: transition.id,
            actorType: 'system',
            payload: transitionAuditPayload(transition, { failureCode: reason }),
          });
        } catch (eventError) {
          compensationErrors.push(eventError instanceof Error ? eventError.message : String(eventError));
        }
      }
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
    return this.withTransitionMutationLease(id, 'rollback', () => this.rollbackLocked(id, reason, actorId));
  }

  private async rollbackLocked(id: number, reason: string, actorId: number) {
    const transition = await this.get(id);
    if (transition.status === 'rolled_back') return transition;
    const rollbackReason = nonEmpty(reason, 'governance_transition_rollback_reason_required');
    const rollbackDrillCompleted = transition.evidenceReceipt?.stage === 'prerelease'
      && transition.runtimeSequence.currentStage === 'canary_5';
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
      this.prisma.brainGovernanceCandidate.update({
        where: { id: transition.candidateId },
        data: {
          status: 'blocked',
          policyDecision: rollbackDrillCompleted
            ? 'prerelease_rollback_drill_completed'
            : 'transition_rolled_back',
        },
      }),
      this.prisma.brainGovernanceTransition.update({
        where: { id },
        data: {
          status: 'rolled_back',
          currentStep: rollbackDrillCompleted ? 'rollback_drill_completed' : 'rollback_completed',
          failureCode: rollbackReason,
          completedAt: new Date(),
        },
      }),
    ]);
    return this.get(id);
  }

  async finalize(id: number, actorId: number) {
    return this.withTransitionMutationLease(id, 'finalize', () => this.finalizeLocked(id, actorId));
  }

  private async finalizeLocked(id: number, actorId: number) {
    const transition = await this.get(id);
    if (transition.status === 'completed') return transition;
    if (transition.status !== 'observing') throw new BadRequestException('governance_transition_not_finalizable');
    if (transition.runtimeSequence.status !== 'completed' || transition.runtimeSequence.currentStage !== 'full') {
      throw new BadRequestException('runtime_rollout_not_full');
    }
    if (transition.evidenceReceipt?.stage !== 'release' || transition.evidenceReceipt.trustLevel !== 'verified_release') {
      throw new BadRequestException('governance_transition_verified_release_required');
    }
    const full = transition.runtimeSequence.releases.find((release) => release.rolloutStage === 'full' && release.status === 'active');
    if (!full) throw new BadRequestException('runtime_full_release_not_active');
    const evidence = await this.validateFrozenEvidence(transition);
    const [currentPolicy, currentRuntime] = await Promise.all([
      this.currentPolicy(),
      this.currentRuntime(),
    ]);
    const blockers = [
      ...evidence.blockers,
      ...(currentPolicy.id === transition.newPolicyReleaseId ? [] : ['finalize_governance_policy_drift']),
      ...(currentRuntime.id === full.id ? [] : ['finalize_runtime_resolution_drift']),
    ];
    if (blockers.length) {
      const reason = `evidence_drift:${[...new Set(blockers)].join(',')}`;
      await this.prisma.$transaction([
        this.prisma.brainRolloutSequence.update({
          where: { id: transition.runtimeSequenceId },
          data: { status: 'paused', pauseReason: reason, approvedBy: actorId },
        }),
        this.prisma.brainGovernanceCandidate.update({
          where: { id: transition.candidateId },
          data: { status: 'blocked' },
        }),
        this.prisma.brainGovernanceTransition.update({
          where: { id },
          data: { currentStep: 'validation_blocked', failureCode: 'transition_evidence_drift', failureMessage: reason },
        }),
      ]);
      await this.events?.record({
        candidateId: transition.candidateId,
        eventType: 'transition_evidence_drift_paused',
        entityType: 'governance_transition',
        entityId: transition.id,
        actorType: 'user',
        actorId,
        payload: { blockers: [...new Set(blockers)] },
      });
      throw new BadRequestException(`governance_transition_evidence_not_ready:${[...new Set(blockers)].join(',')}`);
    }
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
    const auditPayload = transitionAuditPayload(transition, {
      supersededRuntimeReleaseId: transition.oldRuntimeReleaseId,
      activeRuntimeReleaseId: full.id,
    });
    await this.events?.record({
      candidateId: transition.candidateId,
      eventType: 'legacy_runtime_superseded',
      entityType: 'governance_transition',
      entityId: transition.id,
      actorType: 'user',
      actorId,
      payload: auditPayload,
    });
    await this.events?.record({
      candidateId: transition.candidateId,
      eventType: 'transition_completed',
      entityType: 'governance_transition',
      entityId: transition.id,
      actorType: 'user',
      actorId,
      payload: auditPayload,
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

  private loadCandidateEvidence(candidateKey: string) {
    return this.prisma.brainGovernanceCandidate.findUnique({
      where: { candidateKey },
      include: {
        receipts: {
          where: {
            status: 'passed',
            expiresAt: { gt: new Date() },
            verificationStatus: 'verified',
            issuerType: 'release_service',
            OR: [
              { stage: 'release', trustLevel: 'verified_release' },
              { stage: 'prerelease', trustLevel: 'verified_prerelease' },
            ],
            AND: [
              { result: { path: ['verification', 'admissionEligible'], equals: true } },
              { result: { path: ['verification', 'authentication'], equals: 'github_oidc' } },
            ],
          },
          orderBy: { createdAt: 'desc' },
          include: { capabilities: true, gates: true },
        },
      },
    });
  }

  private async resolveCandidateEvidence(candidate: CandidateWithEvidence): Promise<CandidateEvidenceResolution> {
    const blockers: string[] = [];
    const releaseReceipts = candidate.receipts.filter((receipt) => receipt.stage === 'release');
    const prereleaseReceipts = candidate.receipts.filter((receipt) => receipt.stage === 'prerelease');
    if (releaseReceipts.length > 1) blockers.push('candidate_verified_release_receipt_ambiguous');
    if (prereleaseReceipts.length > 1) blockers.push('candidate_verified_prerelease_receipt_ambiguous');
    const receipt = releaseReceipts.length === 1
      ? releaseReceipts[0]!
      : releaseReceipts.length === 0 && prereleaseReceipts.length === 1
        ? prereleaseReceipts[0]!
        : null;
    const phase = receipt?.stage === 'release' ? 'release' as const : receipt?.stage === 'prerelease' ? 'prerelease' as const : null;
    const requiredEvidenceTypes = phase === 'prerelease'
      ? QUERY_ONLY_PRERELEASE_EVIDENCE_TYPES
      : QUERY_ONLY_REQUIRED_EVIDENCE_TYPES;
    const expected = new Set<string>([...BRAIN_QUERY_ONLY_ALLOWED_CAPABILITY_KEYS, ...BRAIN_QUERY_ONLY_DISABLED_CAPABILITY_KEYS]);
    const actual = new Set(receipt?.capabilities.map((item) => item.capabilityKey) ?? []);
    let missingEvidence = [...expected].filter((key) => !actual.has(key));
    const extraEvidence = [...actual].filter((key) => !expected.has(key));
    if (!receipt && candidate.receipts.length === 0) blockers.push('candidate_oidc_release_or_prerelease_receipt_missing');
    const rollbackDrill = phase === 'release'
      && candidate.status === 'blocked'
      && candidate.policyDecision === 'prerelease_rollback_drill_completed'
      ? await this.findCompletedPrereleaseRollbackDrill(candidate.id)
      : null;
    if (candidate.status !== 'ready' && !rollbackDrill) blockers.push(`candidate_not_release_ready:${candidate.status}`);
    if (missingEvidence.length) blockers.push(`query_only_policy_valid_evidence_missing:${missingEvidence.sort().join(',')}`);
    if (extraEvidence.length) blockers.push(`query_only_policy_evidence_extra:${extraEvidence.sort().join(',')}`);
    if (!receipt) return { receipt: null, readiness: null, missingEvidence, blockers: [...new Set(blockers)], materialization: null, phase: null, rollbackDrill: null };

    const result = record(receipt.result);
    const verification = record(result.verification);
    const actualGateKeys = receipt.gates
      .filter((gate) => gate.status === 'passed' && gate.expiresAt.getTime() > Date.now())
      .map((gate) => gate.gateKey);
    const missingGateKeys = requiredEvidenceTypes.filter((key) => !actualGateKeys.includes(key));
    const extraGateKeys = actualGateKeys.filter((key) => !requiredEvidenceTypes.includes(key as never));
    const expectedTrustLevel = phase === 'release' ? 'verified_release' : 'verified_prerelease';
    if (
      receipt.issuerType !== 'release_service'
      || !receipt.issuer
      || verification.status !== 'verified'
      || receipt.trustLevel !== expectedTrustLevel
      || verification.trustLevel !== expectedTrustLevel
      || verification.admissionEligible !== true
      || verification.authentication !== 'github_oidc'
      || verification.issuer !== receipt.issuer
      || result.workflow !== receipt.issuer
    ) blockers.push('candidate_receipt_trust_identity_invalid');
    if (missingGateKeys.length) blockers.push(`candidate_receipt_gate_missing:${missingGateKeys.sort().join(',')}`);
    if (extraGateKeys.length) blockers.push(`candidate_receipt_gate_extra:${extraGateKeys.sort().join(',')}`);
    if (result.candidateKey !== candidate.candidateKey) blockers.push('candidate_receipt_key_mismatch');
    if (result.headCommit !== candidate.headCommit || receipt.headCommit !== candidate.headCommit) blockers.push('candidate_receipt_commit_mismatch');
    if (receipt.sourceFingerprint !== candidate.sourceFingerprint || result.sourceFingerprint !== candidate.sourceFingerprint) {
      blockers.push('candidate_receipt_source_fingerprint_mismatch');
    }
    if (!receipt.identityChecksum || !receipt.resultChecksum) blockers.push('candidate_receipt_checksum_missing');
    if (!receipt.dataSnapshot) blockers.push('candidate_receipt_data_snapshot_missing');
    if (!receipt.evalRunId || !receipt.evaluationReleaseId) blockers.push('candidate_receipt_evaluation_identity_missing');
    const readiness = receipt.evaluationReleaseId
      ? await this.releaseService.getReleaseReadiness(receipt.evaluationReleaseId)
      : null;
    if (!readiness || readiness.status !== 'ready' || readiness.canRelease !== true) {
      blockers.push('candidate_receipt_evaluation_not_ready');
    } else {
      const readinessExpiresAt = Date.parse(String(readiness.expiresAt ?? ''));
      if (readiness.contractVersion !== RELEASE_ACCEPTANCE_V2) blockers.push('candidate_receipt_acceptance_contract_invalid');
      if (readiness.evaluationReleaseId !== receipt.evaluationReleaseId || readiness.evalRunId !== receipt.evalRunId) {
        blockers.push('candidate_receipt_evaluation_identity_mismatch');
      }
      if (readiness.releaseFingerprint !== receipt.releaseFingerprint) blockers.push('candidate_receipt_release_fingerprint_mismatch');
      if (readiness.suiteChecksum !== receipt.suiteChecksum) blockers.push('candidate_receipt_suite_checksum_mismatch');
      if (readiness.provider !== receipt.provider) blockers.push('candidate_receipt_provider_mismatch');
      if (readiness.model !== receipt.model) blockers.push('candidate_receipt_model_mismatch');
      if (readiness.sourceCommit !== candidate.headCommit) blockers.push('candidate_receipt_source_commit_mismatch');
      if (!Number.isFinite(readinessExpiresAt) || readinessExpiresAt <= Date.now()) {
        blockers.push('candidate_receipt_evaluation_expired');
      }
    }
    return { receipt, readiness, missingEvidence, blockers: [...new Set(blockers)], materialization: null, phase, rollbackDrill };
  }

  private findCompletedPrereleaseRollbackDrill(candidateId: number) {
    return this.prisma.brainGovernanceTransition.findFirst({
      where: {
        candidateId,
        status: 'rolled_back',
        currentStep: 'rollback_drill_completed',
        evidenceReceipt: {
          stage: 'prerelease',
          trustLevel: 'verified_prerelease',
          verificationStatus: 'verified',
        },
        runtimeSequence: { status: 'rolled_back' },
      },
      orderBy: { completedAt: 'desc' },
      include: transitionInclude,
    });
  }

  private async rearmAfterVerifiedRollbackDrill(input: {
    candidate: CandidateWithEvidence;
    drill: Prisma.BrainGovernanceTransitionGetPayload<{ include: typeof transitionInclude }>;
    receipt: EvidenceReceipt;
    actorId: number;
  }) {
    const rearmedAt = new Date();
    const expectedPolicyItemCount = BRAIN_QUERY_ONLY_ALLOWED_CAPABILITY_KEYS.length
      + BRAIN_QUERY_ONLY_DISABLED_CAPABILITY_KEYS.length;
    const result = await this.prisma.$transaction(async (tx) => {
      const [candidate, policy, previousPolicy, sequence, receipt, unresolvedTaskCount] = await Promise.all([
        tx.brainGovernanceCandidate.findUnique({ where: { id: input.candidate.id } }),
        tx.brainRelease.findUnique({ where: { id: input.drill.newPolicyReleaseId }, include: { items: true } }),
        tx.brainRelease.findUnique({ where: { id: input.drill.oldPolicyReleaseId } }),
        tx.brainRolloutSequence.findUnique({
          where: { id: input.drill.runtimeSequenceId },
          include: {
            candidate: true,
            policySnapshot: true,
            previousRuntimeRelease: true,
            releases: { orderBy: { id: 'asc' } },
          },
        }),
        tx.brainGateReceipt.findUnique({ where: { id: input.receipt.id }, include: { gates: true } }),
        tx.brainGovernanceTask.count({
          where: {
            candidateId: input.candidate.id,
            status: { in: ['pending', 'validating', 'classifying', 'evaluating', 'pending_approval', 'revision_required', 'failed'] },
          },
        }),
      ]);
      if (
        !candidate
        || candidate.status !== 'blocked'
        || candidate.policyDecision !== 'prerelease_rollback_drill_completed'
        || candidate.policySnapshotId !== input.drill.newPolicyReleaseId
      ) throw new ConflictException('rollback_drill_candidate_state_drift');
      if (unresolvedTaskCount > 0) throw new ConflictException('rollback_drill_candidate_blockers_unresolved');
      if (
        !policy
        || policy.scope !== 'governance_policy'
        || policy.status !== 'rolled_back'
        || policy.previousReleaseId !== input.drill.oldPolicyReleaseId
        || policy.items.length !== expectedPolicyItemCount
        || policy.items.some((item) => item.resourceType !== 'capability_policy')
      ) throw new ConflictException('rollback_drill_policy_state_drift');
      if (!previousPolicy || previousPolicy.scope !== 'governance_policy' || previousPolicy.status !== 'active') {
        throw new ConflictException('rollback_drill_policy_baseline_drift');
      }
      if (
        !sequence
        || sequence.candidateId !== input.candidate.id
        || sequence.policySnapshotId !== policy.id
        || sequence.status !== 'rolled_back'
        || sequence.currentStage !== 'canary_5'
        || sequence.previousRuntimeReleaseId !== input.drill.oldRuntimeReleaseId
        || sequence.previousRuntimeRelease?.status !== 'active'
        || !hasExactRolloutStages(sequence.releases)
        || sequence.releases.some((release) => release.status === 'active')
      ) throw new ConflictException('rollback_drill_runtime_state_drift');
      if (!receipt) throw new ConflictException('rollback_drill_verified_release_receipt_missing');
      assertVerifiedReleaseReceiptForRearm(receipt, input.candidate);

      const policyClaim = await tx.brainRelease.updateMany({
        where: {
          id: policy.id,
          scope: 'governance_policy',
          status: 'rolled_back',
          previousReleaseId: previousPolicy.id,
        },
        data: { status: 'draft', activatedAt: null, rolledBackAt: null, failureReason: null },
      });
      if (policyClaim.count !== 1) throw new ConflictException('rollback_drill_policy_rearm_conflict');
      const policyVersionIds = policy.items.map((item) => item.resourceVersionId);
      const policyVersions = await tx.brainResourceVersion.updateMany({
        where: { id: { in: policyVersionIds }, resourceType: 'capability_policy', status: 'archived' },
        data: { status: 'draft', activatedAt: null, archivedAt: null },
      });
      if (policyVersions.count !== policyVersionIds.length) {
        throw new ConflictException('rollback_drill_policy_version_rearm_incomplete');
      }
      for (const release of sequence.releases) {
        const rollout = record(release.rollout);
        const claim = await tx.brainRelease.updateMany({
          where: {
            id: release.id,
            rolloutSequenceId: sequence.id,
            rolloutStage: release.rolloutStage,
            status: release.status,
          },
          data: {
            status: 'draft',
            activatedAt: null,
            rolledBackAt: null,
            failureReason: null,
            rollout: json({
              ...rollout,
              evaluationEvidenceReceiptId: receipt.id,
              evaluationEvidenceReleaseId: receipt.evaluationReleaseId,
              evaluationEvidenceEvalRunId: receipt.evalRunId,
              admissionPhase: 'release',
              rollbackDrillRearmedAt: rearmedAt.toISOString(),
              previousDrillAttempt: {
                status: release.status,
                activatedAt: release.activatedAt?.toISOString() ?? null,
                rolledBackAt: release.rolledBackAt?.toISOString() ?? null,
                failureReason: release.failureReason,
              },
            }),
          },
        });
        if (claim.count !== 1) throw new ConflictException(`rollback_drill_runtime_release_rearm_conflict:${release.rolloutStage}`);
      }
      const sequenceClaim = await tx.brainRolloutSequence.updateMany({
        where: { id: sequence.id, status: 'rolled_back', currentStage: 'canary_5' },
        data: {
          status: 'draft',
          currentStage: 'shadow',
          pauseReason: null,
          approvedBy: null,
          startedAt: null,
          completedAt: null,
        },
      });
      if (sequenceClaim.count !== 1) throw new ConflictException('rollback_drill_runtime_sequence_rearm_conflict');
      const candidateClaim = await tx.brainGovernanceCandidate.updateMany({
        where: {
          id: candidate.id,
          status: 'blocked',
          policySnapshotId: policy.id,
          policyDecision: 'prerelease_rollback_drill_completed',
        },
        data: {
          status: 'ready',
          completedAt: null,
          policyDecision: 'rearm_after_verified_rollback_drill',
        },
      });
      if (candidateClaim.count !== 1) throw new ConflictException('rollback_drill_candidate_rearm_conflict');
      return {
        policy: await tx.brainRelease.findUniqueOrThrow({ where: { id: policy.id }, include: { items: true } }),
        sequenceId: sequence.id,
      };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    await this.events?.record({
      candidateId: input.candidate.id,
      eventType: 'rollback_drill_rearmed',
      entityType: 'governance_transition',
      entityId: input.drill.id,
      actorType: 'user',
      actorId: input.actorId,
      payload: {
        policyReleaseId: result.policy.id,
        runtimeSequenceId: result.sequenceId,
        evidenceReceiptId: input.receipt.id,
        evaluationReleaseId: input.receipt.evaluationReleaseId,
        evalRunId: input.receipt.evalRunId,
        phase: 'release',
      },
    });
    return { policy: result.policy, sequence: await this.rolloutSequence.get(result.sequenceId) };
  }

  private async inspectTargetIdentity(candidate: { id: number; headCommit: string }) {
    const [policyCounter, runtimeCounter, policy, runtime] = await Promise.all([
      this.prisma.brainVersionCounter.findUnique({ where: { family: 'policy' }, select: { lastNumber: true } }),
      this.prisma.brainVersionCounter.findUnique({ where: { family: 'runtime' }, select: { lastNumber: true } }),
      this.prisma.brainRelease.findUnique({
        where: { displayCode: BRAIN_GOVERNANCE_TARGET_POLICY_CODE },
        select: {
          id: true,
          releaseKey: true,
          scope: true,
          releaseFamily: true,
          displayCode: true,
          displayName: true,
        },
      }),
      this.prisma.brainRolloutSequence.findUnique({
        where: { runtimeVersionCode: BRAIN_GOVERNANCE_TARGET_RUNTIME_CODE },
        select: {
          id: true,
          candidateId: true,
          runtimeVersionCode: true,
          displayName: true,
          productProfile: true,
        },
      }),
    ]);
    return inspectBrainGovernanceTransitionTargets({
      candidateId: candidate.id,
      headCommit: candidate.headCommit,
      policyCounterNumber: policyCounter?.lastNumber ?? null,
      runtimeCounterNumber: runtimeCounter?.lastNumber ?? null,
      policy,
      runtime,
    });
  }

  private async resolveReleaseSnapshotMaterialization(candidate: Omit<CandidateWithEvidence, 'receipts'>) {
    // The self-verified local close path is retained only for historical receipt parsing.
    // It must never be promoted into an admission receipt; protected GitHub OIDC is the trust root.
    if (this.selfVerifiedMaterializationRetired()) {
      return { materialization: null, blockers: ['candidate_oidc_verified_release_receipt_required'] };
    }
    const blockers: string[] = [];
    const now = new Date();
    const candidateReceipts = await this.prisma.brainGateReceipt.findMany({
      where: {
        candidateId: candidate.id,
        stage: 'candidate',
        status: 'passed',
        trustLevel: 'trusted_candidate',
        verificationStatus: 'verified',
        expiresAt: { gt: now },
        result: { path: ['verification', 'admissionEligible'], equals: true },
      },
      orderBy: { createdAt: 'desc' },
      take: 2,
    });
    if (candidateReceipts.length > 1) {
      return { materialization: null, blockers: ['candidate_oidc_receipt_ambiguous'] };
    }
    const candidateReceipt = candidateReceipts[0] as SourceReceipt | undefined;
    if (!candidateReceipt) return { materialization: null, blockers: ['candidate_oidc_receipt_missing'] };
    const candidateResult = record(candidateReceipt.result);
    if (
      candidateReceipt.headCommit !== candidate.headCommit
      || candidateReceipt.sourceFingerprint !== candidate.sourceFingerprint
      || candidateReceipt.stage !== 'candidate'
      || candidateReceipt.status !== 'passed'
      || candidateReceipt.trustLevel !== 'trusted_candidate'
      || candidateReceipt.verificationStatus !== 'verified'
      || candidateReceipt.issuerType !== 'ci'
      || candidateReceipt.issuer !== CANDIDATE_WORKFLOW_ISSUER
      || candidateResult.candidateKey !== candidate.candidateKey
      || candidateResult.headCommit !== candidate.headCommit
      || candidateResult.sourceFingerprint !== candidate.sourceFingerprint
    ) return { materialization: null, blockers: ['candidate_oidc_receipt_identity_mismatch'] };

    const eligibilityRows = await this.prisma.brainGateReceipt.findMany({
      where: {
        stage: 'release',
        status: 'passed',
        trustLevel: 'verified_release',
        verificationStatus: 'self_verified',
        issuerType: 'release_candidate_tool',
        issuer: RELEASE_CANDIDATE_ISSUER,
        headCommit: candidate.headCommit,
        expiresAt: { gt: now },
      },
      orderBy: { createdAt: 'desc' },
    });
    const valid: ReleaseSnapshotMaterialization[] = [];
    for (const row of eligibilityRows as SourceReceipt[]) {
      const materialization = await this.validateReleaseEligibilityLineage(candidate, candidateReceipt, row, now);
      if (materialization) valid.push(materialization);
    }
    if (valid.length !== 1) {
      blockers.push(valid.length ? 'release_eligibility_lineage_ambiguous' : 'release_eligibility_lineage_invalid');
      return { materialization: null, blockers };
    }
    return { materialization: valid[0]!, blockers };
  }

  private async validateReleaseEligibilityLineage(
    candidate: Omit<CandidateWithEvidence, 'receipts'>,
    candidateReceipt: SourceReceipt,
    eligibilityReceipt: SourceReceipt,
    now: Date,
  ): Promise<ReleaseSnapshotMaterialization | null> {
    const eligibility = record(eligibilityReceipt.result);
    const eligibilityCore = {
      schemaVersion: eligibility.schemaVersion,
      candidateId: eligibility.candidateId,
      productProfile: eligibility.productProfile,
      releaseId: eligibility.releaseId,
      evaluationVersionCode: eligibility.evaluationVersionCode,
      releaseFingerprint: eligibility.releaseFingerprint,
      requiredEvidenceTypes: eligibility.requiredEvidenceTypes,
      extendedManualEvidenceTypes: eligibility.extendedManualEvidenceTypes,
      extendedManualComplete: eligibility.extendedManualComplete,
      extendedManualBlocksRelease: eligibility.extendedManualBlocksRelease,
      evidenceChecksums: eligibility.evidenceChecksums,
      blockers: eligibility.blockers,
      releaseEligible: eligibility.releaseEligible,
      closedAt: eligibility.closedAt,
      expiresAt: eligibility.expiresAt,
    };
    const candidateLockId = optionalHash(eligibility.candidateId);
    const requiredEvidenceTypes = stringArray(eligibility.requiredEvidenceTypes);
    const extendedManualEvidenceTypes = stringArray(eligibility.extendedManualEvidenceTypes);
    const evidenceChecksums = record(eligibility.evidenceChecksums);
    const eligibilityExpiresAt = Date.parse(String(eligibility.expiresAt ?? ''));
    if (
      eligibility.schemaVersion !== 'ami-brain-release-eligibility/v2'
      || !candidateLockId
      || eligibility.productProfile !== BRAIN_QUERY_ONLY_PRODUCT_PROFILE
      || eligibility.releaseEligible !== true
      || eligibility.extendedManualBlocksRelease !== false
      || eligibility.extendedManualComplete !== false
      || extendedManualEvidenceTypes.length !== 0
      || !Array.isArray(eligibility.blockers)
      || eligibility.blockers.length > 0
      || !sameStringSet(requiredEvidenceTypes, [...QUERY_ONLY_REQUIRED_EVIDENCE_TYPES])
      || QUERY_ONLY_REQUIRED_EVIDENCE_TYPES.some((key) => !optionalHash(evidenceChecksums[key]))
      || eligibilityReceipt.receiptKey !== `release-eligibility:${candidateLockId}`
      || eligibility.receiptKey !== eligibilityReceipt.receiptKey
      || eligibility.resultChecksum !== eligibilityReceipt.resultChecksum
      || eligibilityReceipt.resultChecksum !== stableSha256(eligibilityCore)
      || eligibilityReceipt.verificationStatus !== 'self_verified'
      || eligibilityReceipt.issuer !== RELEASE_CANDIDATE_ISSUER
      || !Number.isFinite(eligibilityExpiresAt)
      || eligibilityExpiresAt !== eligibilityReceipt.expiresAt.getTime()
      || eligibilityReceipt.stage !== 'release'
      || eligibilityReceipt.status !== 'passed'
      || eligibilityReceipt.trustLevel !== 'verified_release'
      || eligibilityReceipt.issuerType !== 'release_candidate_tool'
      || eligibilityExpiresAt <= now.getTime()
    ) return null;

    const [candidateLockReceipt, officialPointer] = await Promise.all([
      this.prisma.brainGateReceipt.findUnique({ where: { receiptKey: `candidate-lock:${candidateLockId}` } }),
      this.prisma.brainGateReceipt.findUnique({ where: { receiptKey: `official-candidate:${BRAIN_QUERY_ONLY_PRODUCT_PROFILE}` } }),
    ]);
    if (!candidateLockReceipt || !officialPointer) return null;
    const lock = record(candidateLockReceipt.result);
    const lockIdentity = record(lock.identity);
    const lockEvaluation = record(lockIdentity.evaluationIdentity);
    const pointer = record(officialPointer.result);
    if (
      lock.schemaVersion !== 'ami-brain-candidate-lock/v1'
      || lock.candidateId !== candidateLockId
      || candidateLockId !== stableSha256(lockIdentity)
      || candidateLockReceipt.identityChecksum !== candidateLockId
      || candidateLockReceipt.sourceFingerprint !== stableSha256(lockIdentity)
      || candidateLockReceipt.resultChecksum !== stableSha256(lock)
      || candidateLockReceipt.stage !== 'candidate'
      || candidateLockReceipt.status !== 'passed'
      || candidateLockReceipt.trustLevel !== 'candidate_lock'
      || candidateLockReceipt.issuerType !== 'release_candidate_tool'
      || candidateLockReceipt.headCommit !== candidate.headCommit
      || candidateLockReceipt.expiresAt <= now
      || candidateLockReceipt.verificationStatus !== 'self_verified'
      || candidateLockReceipt.issuer !== RELEASE_CANDIDATE_ISSUER
      || pointer.candidateId !== candidateLockId
      || pointer.candidateLockReceiptKey !== candidateLockReceipt.receiptKey
      || officialPointer.resultChecksum !== stableSha256(pointer)
      || officialPointer.stage !== 'candidate'
      || officialPointer.status !== 'passed'
      || officialPointer.trustLevel !== 'candidate_lock'
      || officialPointer.issuerType !== 'release_candidate_tool'
      || officialPointer.verificationStatus !== 'self_verified'
      || officialPointer.issuer !== RELEASE_CANDIDATE_ISSUER
      || officialPointer.headCommit !== candidate.headCommit
      || officialPointer.expiresAt <= now
      || lockIdentity.productProfile !== BRAIN_QUERY_ONLY_PRODUCT_PROFILE
      || lockIdentity.runtimeCommit !== candidate.headCommit
      || (lock.branch && candidate.branch && lock.branch !== candidate.branch)
      || Number(lockIdentity.releaseId) !== Number(eligibility.releaseId)
      || Number(lockEvaluation.internalReleaseId) !== Number(eligibility.releaseId)
      || lockIdentity.releaseFingerprint !== eligibility.releaseFingerprint
      || eligibilityReceipt.identityChecksum !== candidateLockId
      || eligibilityReceipt.sourceFingerprint !== stableSha256(lockIdentity)
      || eligibilityReceipt.headCommit !== candidate.headCommit
      || eligibilityReceipt.releaseFingerprint !== lockIdentity.releaseFingerprint
      || eligibilityReceipt.suiteChecksum !== lockIdentity.suiteManifestChecksum
      || eligibilityReceipt.dataSnapshot !== lockIdentity.dataSnapshot
      || eligibilityReceipt.provider !== lockIdentity.provider
      || eligibilityReceipt.model !== lockIdentity.model
      || Number(eligibilityReceipt.evaluationReleaseId) !== Number(lockIdentity.releaseId)
      || candidateLockReceipt.releaseFingerprint !== lockIdentity.releaseFingerprint
      || candidateLockReceipt.suiteChecksum !== lockIdentity.suiteManifestChecksum
      || candidateLockReceipt.dataSnapshot !== lockIdentity.dataSnapshot
      || candidateLockReceipt.provider !== lockIdentity.provider
      || candidateLockReceipt.model !== lockIdentity.model
      || Number(candidateLockReceipt.evaluationReleaseId) !== Number(lockIdentity.releaseId)
      || officialPointer.identityChecksum !== candidateLockId
      || officialPointer.sourceFingerprint !== stableSha256(lockIdentity)
      || officialPointer.releaseFingerprint !== lockIdentity.releaseFingerprint
      || officialPointer.suiteChecksum !== lockIdentity.suiteManifestChecksum
      || officialPointer.dataSnapshot !== lockIdentity.dataSnapshot
      || officialPointer.provider !== lockIdentity.provider
      || officialPointer.model !== lockIdentity.model
      || Number(officialPointer.evaluationReleaseId) !== Number(lockIdentity.releaseId)
    ) return null;

    const readiness = await this.releaseService.getReleaseReadiness(Number(lockIdentity.releaseId));
    const readinessExpiresAt = Date.parse(String(readiness.expiresAt ?? ''));
    if (
      readiness.status !== 'ready'
      || readiness.canRelease !== true
      || readiness.contractVersion !== RELEASE_ACCEPTANCE_V2
      || readiness.sourceCommit !== candidate.headCommit
      || readiness.evaluationReleaseId !== Number(lockIdentity.releaseId)
      || !readiness.evalRunId
      || readiness.releaseFingerprint !== lockIdentity.releaseFingerprint
      || readiness.suiteChecksum !== lockIdentity.suiteManifestChecksum
      || readiness.provider !== lockIdentity.provider
      || readiness.model !== lockIdentity.model
      || !Number.isFinite(readinessExpiresAt)
      || readinessExpiresAt <= now.getTime()
    ) return null;
    return { candidateReceipt, eligibilityReceipt, candidateLockReceipt: candidateLockReceipt as SourceReceipt, officialPointer: officialPointer as SourceReceipt, readiness };
  }

  private async materializeVerifiedReleaseSnapshot(
    candidate: Omit<CandidateWithEvidence, 'receipts'>,
    lineage: ReleaseSnapshotMaterialization,
  ) {
    if (this.selfVerifiedMaterializationRetired()) {
      throw new ConflictException('self_verified_release_materialization_retired');
    }
    const eligibility = record(lineage.eligibilityReceipt.result);
    const evidenceChecksums = record(eligibility.evidenceChecksums);
    const capabilityKeys = [...BRAIN_QUERY_ONLY_ALLOWED_CAPABILITY_KEYS, ...BRAIN_QUERY_ONLY_DISABLED_CAPABILITY_KEYS];
    const expiryTimes = [
      lineage.candidateReceipt.expiresAt.getTime(),
      lineage.eligibilityReceipt.expiresAt.getTime(),
      lineage.candidateLockReceipt.expiresAt.getTime(),
    ];
    const readinessExpiry = Date.parse(String(lineage.readiness.expiresAt ?? ''));
    if (Number.isFinite(readinessExpiry)) expiryTimes.push(readinessExpiry);
    const expiresAt = new Date(Math.min(...expiryTimes));
    const receiptKey = `verified-release-snapshot:${candidate.id}:${lineage.eligibilityReceipt.id}:${lineage.readiness.evalRunId}`;
    const identity = {
      schemaVersion: 'ami-brain-verified-release-snapshot/v1',
      candidateKey: candidate.candidateKey,
      candidateId: candidate.id,
      headCommit: candidate.headCommit,
      sourceFingerprint: candidate.sourceFingerprint,
      evaluationReleaseId: lineage.readiness.evaluationReleaseId,
      evalRunId: lineage.readiness.evalRunId,
      releaseFingerprint: lineage.readiness.releaseFingerprint,
      suiteChecksum: lineage.readiness.suiteChecksum,
      provider: lineage.readiness.provider,
      model: lineage.readiness.model,
      sourceCandidateReceiptId: lineage.candidateReceipt.id,
      sourceEligibilityReceiptId: lineage.eligibilityReceipt.id,
      sourceCandidateLockReceiptId: lineage.candidateLockReceipt.id,
    };
    const result = {
      ...identity,
      dataSnapshot: lineage.eligibilityReceipt.dataSnapshot,
      evidenceChecksums,
      verification: {
        status: 'verified',
        trustLevel: 'verified_release',
        admissionEligible: true,
        issuer: RELEASE_SNAPSHOT_ISSUER,
      },
    };
    const identityChecksum = stableSha256(identity);
    const resultChecksum = stableSha256(result);
    const receipt = await this.prisma.$transaction(async (tx) => {
      const existing = await tx.brainGateReceipt.findUnique({ where: { receiptKey } });
      if (existing) {
        if (existing.identityChecksum !== identityChecksum || existing.resultChecksum !== resultChecksum) {
          throw new ConflictException('verified_release_snapshot_identity_conflict');
        }
        return existing;
      }
      const created = await tx.brainGateReceipt.create({
        data: {
          receiptKey,
          stage: 'release',
          riskLevel: 'critical',
          changedFilesChecksum: lineage.candidateReceipt.changedFilesChecksum,
          diffChecksum: candidate.diffChecksum,
          sourceFingerprint: candidate.sourceFingerprint,
          releaseFingerprint: lineage.readiness.releaseFingerprint,
          suiteChecksum: lineage.readiness.suiteChecksum!,
          dataSnapshot: lineage.eligibilityReceipt.dataSnapshot,
          provider: lineage.readiness.provider,
          model: lineage.readiness.model,
          timeoutMs: lineage.eligibilityReceipt.timeoutMs,
          resultChecksum,
          status: 'passed',
          result: result as Prisma.InputJsonValue,
          expiresAt,
          schemaVersion: 3,
          candidateId: candidate.id,
          baseCommit: candidate.baseCommit,
          headCommit: candidate.headCommit,
          mergeBaseCommit: candidate.mergeBaseCommit,
          identityChecksum,
          issuerType: 'release_service',
          issuer: RELEASE_SNAPSHOT_ISSUER,
          trustLevel: 'verified_release',
          verificationStatus: 'verified',
          verifiedAt: new Date(),
          evalRunId: lineage.readiness.evalRunId,
          evaluationReleaseId: lineage.readiness.evaluationReleaseId,
        },
      });
      await tx.brainGateReceiptCapability.createMany({
        data: capabilityKeys.map((capabilityKey) => ({ receiptId: created.id, capabilityKey })),
      });
      await tx.brainGateReceiptGate.createMany({
        data: QUERY_ONLY_REQUIRED_EVIDENCE_TYPES.map((gateKey) => ({
          receiptId: created.id,
          gateKey,
          status: 'passed',
          inputChecksum: identityChecksum,
          resultChecksum: String(evidenceChecksums[gateKey]),
          commandChecksum: sha256(`${RELEASE_CANDIDATE_ISSUER}:${gateKey}`),
          expiresAt,
        })),
      });
      return created;
    });
    return receipt;
  }

  private selfVerifiedMaterializationRetired() {
    return true;
  }

  private async validateFrozenEvidence(transition: TransitionWithEvidence) {
    const blockers: string[] = [];
    const frozen = record(transition.evidenceSnapshot);
    const receipt = transition.evidenceReceipt;
    if (!receipt || transition.evidenceReceiptId !== receipt.id) return { blockers: ['transition_evidence_receipt_missing'] };
    const receiptResult = record(receipt.result);
    const verification = record(receiptResult.verification);
    const phase = receipt.stage === 'release' ? 'release' : receipt.stage === 'prerelease' ? 'prerelease' : null;
    const requiredEvidenceTypes = phase === 'prerelease'
      ? QUERY_ONLY_PRERELEASE_EVIDENCE_TYPES
      : QUERY_ONLY_REQUIRED_EVIDENCE_TYPES;
    const expectedTrustLevel = phase === 'release' ? 'verified_release' : 'verified_prerelease';
    const isProtectedReleaseReceipt = Number(receiptResult.schemaVersion) === 3
      && receiptResult.stage === phase
      && receiptResult.workflow === receipt.issuer;
    const gateKeys = receipt.gates
      .filter((gate) => gate.status === 'passed' && gate.expiresAt.getTime() > Date.now())
      .map((gate) => gate.gateKey);
    if (
      !phase
      || receipt.status !== 'passed'
      || receipt.trustLevel !== expectedTrustLevel
      || receipt.verificationStatus !== 'verified'
      || receipt.issuerType !== 'release_service'
      || !receipt.issuer
      || receipt.expiresAt.getTime() <= Date.now()
      || !isProtectedReleaseReceipt
      || receiptResult.candidateKey !== transition.candidate.candidateKey
      || receiptResult.headCommit !== transition.candidate.headCommit
      || receiptResult.sourceFingerprint !== transition.candidate.sourceFingerprint
      || verification.status !== 'verified'
      || verification.trustLevel !== expectedTrustLevel
      || verification.admissionEligible !== true
      || verification.authentication !== 'github_oidc'
      || verification.issuer !== receipt.issuer
      || !sameStringSet(gateKeys, [...requiredEvidenceTypes])
    ) blockers.push('transition_evidence_receipt_invalid');
    const readiness = await this.releaseService.getReleaseReadiness(receipt.evaluationReleaseId ?? 0);
    const readinessExpiresAt = Date.parse(String(readiness.expiresAt ?? ''));
    if (
      readiness.status !== 'ready'
      || readiness.canRelease !== true
      || readiness.contractVersion !== RELEASE_ACCEPTANCE_V2
      || readiness.evaluationReleaseId !== receipt.evaluationReleaseId
      || readiness.evalRunId !== receipt.evalRunId
      || readiness.releaseFingerprint !== receipt.releaseFingerprint
      || readiness.suiteChecksum !== receipt.suiteChecksum
      || readiness.provider !== receipt.provider
      || readiness.model !== receipt.model
      || readiness.sourceCommit !== transition.candidate.headCommit
      || !Number.isFinite(readinessExpiresAt)
      || readinessExpiresAt <= Date.now()
    ) blockers.push('transition_evaluation_readiness_invalid');
    const current = frozenEvidenceSnapshot(transition.candidate, receipt, readiness);
    if (sha256(frozen) !== sha256(current)) blockers.push('transition_evidence_snapshot_drift');
    const expectedResources = new Set<string>(BRAIN_QUERY_ONLY_ALLOWED_CAPABILITY_KEYS);
    const releases = transition.runtimeSequence.releases ?? [];
    const stages = new Set(releases.map((release) => release.rolloutStage));
    if (releases.length !== ROLLOUT_STAGES.length || ROLLOUT_STAGES.some((stage) => !stages.has(stage))) {
      blockers.push('transition_runtime_stage_set_incomplete');
    }
    for (const release of releases) {
      const rollout = record(release.rollout);
      const resources = new Set((release.items ?? [])
        .filter((item) => item.resourceType === 'skill')
        .map((item) => item.resourceKey));
      if (
        Number(rollout.evaluationEvidenceReleaseId) !== Number(frozen.evaluationReleaseId)
        || Number(rollout.evaluationEvidenceEvalRunId) !== Number(frozen.evalRunId)
        || Number(rollout.evaluationEvidenceReceiptId) !== receipt.id
      ) blockers.push(`transition_runtime_evidence_drift:${release.rolloutStage ?? release.id}`);
      if (resources.size !== expectedResources.size || [...expectedResources].some((key) => !resources.has(key))) {
        blockers.push(`transition_runtime_resource_drift:${release.rolloutStage ?? release.id}`);
      }
    }
    return { blockers: [...new Set(blockers)] };
  }

  private async withTransitionMutationLease<T>(
    id: number,
    operation: 'switch' | 'rollback' | 'finalize',
    work: () => Promise<T>,
  ): Promise<T> {
    const now = new Date();
    const leaseToken = randomUUID();
    const leaseExpiresAt = new Date(now.getTime() + TRANSITION_MUTATION_LEASE_MS);
    const claim = await this.prisma.brainGovernanceTransition.updateMany({
      where: {
        id: positiveId(id, 'governance_transition_id_invalid'),
        OR: [
          { mutationLeaseToken: null },
          { mutationLeaseExpiresAt: { lte: now } },
        ],
      },
      data: {
        mutationLeaseToken: leaseToken,
        mutationLeaseOperation: operation,
        mutationLeaseExpiresAt: leaseExpiresAt,
      },
    });
    if (claim.count !== 1) throw new ConflictException('governance_transition_mutation_in_progress');
    try {
      return await work();
    } finally {
      await this.prisma.brainGovernanceTransition.updateMany({
        where: { id, mutationLeaseToken: leaseToken },
        data: {
          mutationLeaseToken: null,
          mutationLeaseOperation: null,
          mutationLeaseExpiresAt: null,
        },
      });
    }
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
    mutationLeaseToken?: string | null;
    mutationLeaseOperation?: string | null;
    mutationLeaseExpiresAt?: Date | null;
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
    const {
      mutationLeaseToken: _mutationLeaseToken,
      mutationLeaseOperation,
      mutationLeaseExpiresAt,
      ...publicTransition
    } = transition;
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
      ...publicTransition,
      mutationLease: mutationLeaseOperation && mutationLeaseExpiresAt
        ? { operation: mutationLeaseOperation, expiresAt: mutationLeaseExpiresAt }
        : null,
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
  candidate: { select: { id: true, candidateKey: true, headCommit: true, sourceFingerprint: true, status: true } },
  evidenceReceipt: { include: { capabilities: true, gates: true } },
  oldPolicy: { include: { items: true } },
  newPolicy: { include: { items: true } },
  oldRuntime: true,
  runtimeSequence: {
    include: {
      policySnapshot: true,
      previousRuntimeRelease: true,
      releases: {
        orderBy: { id: 'asc' as const },
        include: {
          _count: { select: { items: true } },
          items: { select: { resourceVersionId: true, resourceType: true, resourceKey: true } },
        },
      },
    },
  },
} satisfies Prisma.BrainGovernanceTransitionInclude;

type EvidenceReceipt = {
  id: number;
  receiptKey: string;
  stage: string;
  status: string;
  trustLevel: string;
  verificationStatus: string;
  issuerType: string;
  issuer: string | null;
  identityChecksum: string | null;
  resultChecksum: string;
  sourceFingerprint: string;
  releaseFingerprint: string | null;
  suiteChecksum: string;
  dataSnapshot: string | null;
  provider: string | null;
  model: string | null;
  headCommit: string | null;
  evalRunId: number | null;
  evaluationReleaseId: number | null;
  result: Prisma.JsonValue;
  expiresAt: Date;
  capabilities: Array<{ capabilityKey: string }>;
  gates: Array<{ gateKey: string; status: string; expiresAt: Date }>;
};

type CandidateWithEvidence = {
  id: number;
  candidateKey: string;
  branch: string | null;
  baseCommit: string;
  mergeBaseCommit: string;
  headCommit: string;
  diffChecksum: string;
  sourceFingerprint: string;
  status: string;
  policyDecision: string | null;
  receipts: EvidenceReceipt[];
};

type CandidateEvidenceResolution = {
  receipt: EvidenceReceipt | null;
  readiness: Awaited<ReturnType<BrainReleaseService['getReleaseReadiness']>> | null;
  missingEvidence: string[];
  blockers: string[];
  materialization: ReleaseSnapshotMaterialization | null;
  phase: 'prerelease' | 'release' | null;
  rollbackDrill: Prisma.BrainGovernanceTransitionGetPayload<{ include: typeof transitionInclude }> | null;
};

type SourceReceipt = {
  id: number;
  receiptKey: string;
  changedFilesChecksum: string;
  sourceFingerprint: string;
  releaseFingerprint: string | null;
  suiteChecksum: string;
  dataSnapshot: string | null;
  provider: string | null;
  model: string | null;
  timeoutMs: number | null;
  resultChecksum: string;
  result: Prisma.JsonValue;
  expiresAt: Date;
  stage: string;
  status: string;
  trustLevel: string;
  issuerType: string;
  headCommit: string | null;
  identityChecksum: string | null;
  issuer: string | null;
  verificationStatus: string;
  evaluationReleaseId: number | null;
};

type ReleaseSnapshotMaterialization = {
  candidateReceipt: SourceReceipt;
  eligibilityReceipt: SourceReceipt;
  candidateLockReceipt: SourceReceipt;
  officialPointer: SourceReceipt;
  readiness: Awaited<ReturnType<BrainReleaseService['getReleaseReadiness']>>;
};

type TransitionWithEvidence = {
  evidenceReceiptId?: number | null;
  evidenceSnapshot?: Prisma.JsonValue;
  evidenceReceipt?: EvidenceReceipt | null;
  candidate: Pick<CandidateWithEvidence, 'id' | 'candidateKey' | 'headCommit' | 'sourceFingerprint' | 'status'>;
  runtimeSequence: {
    releases?: Array<{
      id: number;
      rolloutStage?: string | null;
      rollout: Prisma.JsonValue;
      items?: Array<{ resourceVersionId: number; resourceType: string; resourceKey: string }>;
    }>;
  };
};

function frozenEvidenceSnapshot(
  candidate: Pick<CandidateWithEvidence, 'candidateKey' | 'headCommit' | 'sourceFingerprint'>,
  receipt: EvidenceReceipt,
  readiness: Awaited<ReturnType<BrainReleaseService['getReleaseReadiness']>>,
) {
  return {
    schemaVersion: 1,
    phase: receipt.stage,
    trustLevel: receipt.trustLevel,
    contractVersion: readiness.contractVersion,
    receiptId: receipt.id,
    receiptKey: receipt.receiptKey,
    identityChecksum: receipt.identityChecksum,
    resultChecksum: receipt.resultChecksum,
    candidateKey: candidate.candidateKey,
    headCommit: candidate.headCommit,
    sourceFingerprint: candidate.sourceFingerprint,
    evaluationReleaseId: receipt.evaluationReleaseId,
    evalRunId: receipt.evalRunId,
    releaseFingerprint: receipt.releaseFingerprint,
    provider: receipt.provider,
    model: receipt.model,
    dataSnapshot: receipt.dataSnapshot,
    suiteChecksum: receipt.suiteChecksum,
  };
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function json(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function hasExactRolloutStages(releases: Array<{ rolloutStage?: string | null }>) {
  const stages = releases.map((release) => release.rolloutStage).filter((stage): stage is string => Boolean(stage));
  return stages.length === ROLLOUT_STAGES.length && sameStringSet(stages, [...ROLLOUT_STAGES]);
}

function assertVerifiedReleaseReceiptForRearm(
  receipt: {
    id: number;
    candidateId: number | null;
    stage: string;
    status: string;
    trustLevel: string;
    verificationStatus: string;
    issuerType: string;
    issuer: string | null;
    expiresAt: Date;
    headCommit: string | null;
    sourceFingerprint: string;
    evaluationReleaseId: number | null;
    evalRunId: number | null;
    result: Prisma.JsonValue;
    gates: Array<{ gateKey: string; status: string; expiresAt: Date }>;
  } | null,
  candidate: Pick<CandidateWithEvidence, 'id' | 'candidateKey' | 'headCommit' | 'sourceFingerprint'>,
) {
  if (!receipt) throw new ConflictException('rollback_drill_verified_release_receipt_missing');
  const result = record(receipt.result);
  const verification = record(result.verification);
  const gateKeys = receipt.gates
    .filter((gate) => gate.status === 'passed' && gate.expiresAt.getTime() > Date.now())
    .map((gate) => gate.gateKey);
  if (
    receipt.candidateId !== candidate.id
    || receipt.stage !== 'release'
    || receipt.status !== 'passed'
    || receipt.trustLevel !== 'verified_release'
    || receipt.verificationStatus !== 'verified'
    || receipt.issuerType !== 'release_service'
    || !receipt.issuer
    || receipt.expiresAt.getTime() <= Date.now()
    || receipt.headCommit !== candidate.headCommit
    || receipt.sourceFingerprint !== candidate.sourceFingerprint
    || !receipt.evaluationReleaseId
    || !receipt.evalRunId
    || Number(result.schemaVersion) !== 3
    || result.stage !== 'release'
    || result.workflow !== receipt.issuer
    || result.candidateKey !== candidate.candidateKey
    || result.headCommit !== candidate.headCommit
    || result.sourceFingerprint !== candidate.sourceFingerprint
    || verification.status !== 'verified'
    || verification.trustLevel !== 'verified_release'
    || verification.admissionEligible !== true
    || verification.authentication !== 'github_oidc'
    || verification.issuer !== receipt.issuer
    || !sameStringSet(gateKeys, [...QUERY_ONLY_REQUIRED_EVIDENCE_TYPES])
  ) throw new ConflictException('rollback_drill_verified_release_receipt_invalid');
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

function optionalHash(value: unknown) {
  const text = String(value ?? '').trim().toLowerCase();
  return /^[a-f0-9]{64}$/u.test(text) ? text : null;
}

function stringArray(value: unknown) {
  return Array.isArray(value) ? value.map((item) => String(item)).filter(Boolean) : [];
}

function sameStringSet(left: string[], right: string[]) {
  return left.length === right.length && [...left].sort().every((value, index) => value === [...right].sort()[index]);
}

function sha256(value: unknown) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function stableSha256(value: unknown) {
  return createHash('sha256').update(typeof value === 'string' ? value : stableStringify(value)).digest('hex');
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value && typeof value === 'object') {
    const object = value as Record<string, unknown>;
    return `{${Object.keys(object).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(object[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function isPrismaCode(error: unknown, code: string) {
  return Boolean(error && typeof error === 'object' && 'code' in error && (error as { code?: unknown }).code === code);
}

function transitionAuditPayload(
  transition: {
    transitionKey?: string | null;
    candidateId?: number | null;
    candidate?: { candidateKey?: string | null; headCommit?: string | null } | null;
    oldPolicyReleaseId?: number | null;
    newPolicyReleaseId?: number | null;
    oldRuntimeReleaseId?: number | null;
    runtimeSequenceId?: number | null;
    newPolicy?: { displayCode?: string | null; productIdentity?: { code?: string | null } | null } | null;
    runtimeSequence?: {
      runtimeVersionCode?: string | null;
      currentStage?: string | null;
      productIdentity?: { code?: string | null; stageCode?: string | null } | null;
    } | null;
  },
  extra: Record<string, unknown> = {},
) {
  return {
    transitionKey: transition.transitionKey ?? null,
    candidateId: transition.candidateId ?? null,
    candidateKey: transition.candidate?.candidateKey ?? null,
    headCommit: transition.candidate?.headCommit ?? null,
    policyCode: transition.newPolicy?.productIdentity?.code ?? transition.newPolicy?.displayCode ?? null,
    policyInternalReleaseId: transition.newPolicyReleaseId ?? null,
    runtimeCode: transition.runtimeSequence?.productIdentity?.code ?? transition.runtimeSequence?.runtimeVersionCode ?? null,
    runtimeStageCode: transition.runtimeSequence?.productIdentity?.stageCode ?? transition.runtimeSequence?.currentStage ?? null,
    runtimeSequenceId: transition.runtimeSequenceId ?? null,
    oldPolicyInternalReleaseId: transition.oldPolicyReleaseId ?? null,
    oldRuntimeInternalReleaseId: transition.oldRuntimeReleaseId ?? null,
    ...extra,
  };
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
