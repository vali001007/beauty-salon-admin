import { createHash } from 'node:crypto';
import { BadRequestException, ForbiddenException, Injectable, Optional } from '@nestjs/common';
import { BrainRiskLevel, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service.js';
import { BrainCapabilityGatewayService, type BrainCapabilityReceipt } from './brain-capability-gateway.service.js';
import { BrainTraceService } from '../governance/brain-trace.service.js';
import { BrainActionTargetResolverService } from '../domain/brain-action-target-resolver.service.js';
import type {
  BrainActionExecutionProvenance,
  BrainActionExecutionParticipant,
  BrainActionInformationArtifact,
} from '../cognition/brain-action-execution-provenance.types.js';
import { brainActionSituationContextIssue } from '../cognition/brain-action-situation-context.js';
import { BrainActionExecutionIdentityService } from './brain-action-execution-identity.service.js';
import { resolveBrainDomainRole } from '../role/brain-role-context-builder.service.js';
import {
  BrainActionPredicateEffectEvaluatorService,
  type BrainActionEffectObservation,
  type BrainActionEffectReconciliation,
  type BrainRecoveredActionEffectReceipt,
} from '../domain/brain-action-predicate-effect-evaluator.service.js';
import type { BusinessActionDefinitionSnapshot } from '../cognition/business-definition-snapshot.types.js';
import { createBusinessDefinitionProjectionFingerprint } from '../../semantic-data/business-definition-projection-compiler.service.js';
import { BrainResultReferenceService } from '../context/brain-result-reference.service.js';
import {
  evaluateCuratedActionInvariant,
  type ActionInvariantEvaluation,
} from '../../semantic-data/brain-action-invariant-catalog.js';
import {
  evaluateBusinessActionInstitutionalEffect,
  type BrainActionInstitutionalEffectEvaluation,
} from '../cognition/business-action-institutional-effect.js';

interface BrainActionApprovalEnvelope {
  protocolVersion: '1.0' | '1.1' | '1.2' | '1.3' | '1.4' | '1.5';
  capabilityKey: string;
  capabilityVersion: number;
  validatedArgs: Record<string, unknown>;
  actor: { userId: number };
  store: { storeId: number };
  riskLevel: BrainRiskLevel;
  idempotencyKey: string;
  planId: string;
  argsDigest: string;
  expiresAt: string;
  actionProvenance?: BrainActionExecutionProvenance;
}

interface BrainActionProvenanceRecordFields {
  actionDefinitionKey?: string | null;
  actionDefinitionVersion?: number | null;
  actionDefinitionFingerprint?: string | null;
  actionSourceFingerprint?: string | null;
  actionBindingFingerprint?: string | null;
  situationContextProfileFingerprint?: string | null;
  situationContextFingerprint?: string | null;
  actionModalityPolicyFingerprint?: string | null;
  informationArtifactProfileFingerprint?: string | null;
  sideEffectInvariantProfileFingerprint?: string | null;
  institutionalEffectProfileFingerprint?: string | null;
  informationArtifactFingerprints?: Prisma.JsonValue | null;
  boundCapabilityKey?: string | null;
  capabilityVersion?: number | null;
  capabilitySourceFingerprint?: string | null;
  ontologySnapshotFingerprint?: string | null;
  releaseId?: number | null;
  releaseFingerprint?: string | null;
}

type BrainActionProvenanceWriteFields = Omit<BrainActionProvenanceRecordFields, 'informationArtifactFingerprints'> & {
  informationArtifactFingerprints?: Prisma.InputJsonValue;
};

@Injectable()
export class BrainActionConfirmationService {
  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly capabilityGateway?: BrainCapabilityGatewayService,
    @Optional() private readonly traceService?: BrainTraceService,
    @Optional() private readonly targetResolver?: BrainActionTargetResolverService,
    @Optional() private readonly executionIdentity?: BrainActionExecutionIdentityService,
    @Optional() private readonly predicateEffectEvaluator?: BrainActionPredicateEffectEvaluatorService,
    @Optional() private readonly resultReferenceService?: BrainResultReferenceService,
  ) {}

  requiresConfirmation(riskLevel: BrainRiskLevel | 'low' | 'medium' | 'high' | 'critical') {
    return riskLevel === 'high' || riskLevel === 'critical';
  }

  async createPreview(input: {
    runId: number;
    userId: number;
    storeId: number;
    skillKey: string;
    capabilityVersion?: number;
    riskLevel: BrainRiskLevel;
    preview: Prisma.InputJsonValue;
    payload: Prisma.InputJsonValue;
    actionProvenance?: BrainActionExecutionProvenance;
    idempotencyKey?: string;
    planId?: string;
    expiresInMs?: number;
  }) {
    const actionId = `brain_action_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    this.assertNoConfirmationClaim(input.payload);
    const capabilityVersion = input.capabilityVersion ?? this.capabilityGateway?.resolve(input.skillKey).version ?? 1;
    const validation = this.capabilityGateway?.validateForExecution(input.skillKey, capabilityVersion, input.payload);
    if (validation && validation.descriptor.riskLevel !== input.riskLevel) {
      throw new BadRequestException(`action_risk_mismatch:${input.skillKey}`);
    }
    let validatedArgs = validation?.payload ?? this.asRecord(input.payload);
    const actionProvenance = input.actionProvenance
      ? this.validateActionProvenance(input.actionProvenance, input.skillKey)
      : undefined;
    if (actionProvenance) {
      if (
        actionProvenance.situationContext.runId !== input.runId ||
        actionProvenance.situationContext.storeId !== input.storeId ||
        actionProvenance.situationContext.actorUserId !== input.userId
      ) {
        throw new BadRequestException('action_preview_situation_context_mismatch');
      }
      if (!this.executionIdentity) throw new BadRequestException('action_identity_revalidator_unavailable');
      if (!this.predicateEffectEvaluator) {
        throw new BadRequestException('action_predicate_evaluator_unavailable');
      }
      const actionDefinition = (await this.executionIdentity.assertCurrent(actionProvenance)).action;
      validatedArgs = this.predicateEffectEvaluator.captureApprovalEvidence
        ? await this.predicateEffectEvaluator.captureApprovalEvidence({
            action: actionDefinition,
            storeId: input.storeId,
            args: validatedArgs,
          })
        : validatedArgs;
      await this.predicateEffectEvaluator.assertPreconditions({
        action: actionDefinition,
        capabilityKey: input.skillKey,
        storeId: input.storeId,
        args: validatedArgs,
        phase: 'preview',
      });
    }
    const envelope: BrainActionApprovalEnvelope = {
      protocolVersion: actionProvenance ? '1.5' : '1.0',
      capabilityKey: input.skillKey,
      capabilityVersion,
      validatedArgs,
      actor: { userId: input.userId },
      store: { storeId: input.storeId },
      riskLevel: input.riskLevel,
      idempotencyKey: input.idempotencyKey?.trim() || actionId,
      planId: input.planId?.trim() || `run:${input.runId}`,
      argsDigest: this.digest(validatedArgs),
      expiresAt: new Date(
        Date.now() + Math.min(Math.max(input.expiresInMs ?? 15 * 60_000, 60_000), 30 * 60_000),
      ).toISOString(),
      ...(actionProvenance ? { actionProvenance } : {}),
    };
    const preview = this.asRecord(input.preview);
    return this.prisma.brainActionConfirmation.create({
      data: {
        actionId,
        runId: input.runId,
        userId: input.userId,
        storeId: input.storeId,
        skillKey: input.skillKey,
        riskLevel: input.riskLevel,
        ...this.provenanceRecordData(actionProvenance),
        preview: this.toInputJson({
          ...preview,
          approval: {
            capabilityKey: envelope.capabilityKey,
            capabilityVersion: envelope.capabilityVersion,
            planId: envelope.planId,
            riskLevel: envelope.riskLevel,
            expiresAt: envelope.expiresAt,
            ...(actionProvenance
              ? {
                  actionDefinitionKey: actionProvenance.actionRef.definitionKey,
                  actionDefinitionVersion: actionProvenance.actionRef.definitionVersion,
                  releaseId: actionProvenance.release?.releaseId ?? null,
                  businessDate: actionProvenance.situationContext.businessDate,
                  timezone: actionProvenance.situationContext.timezone,
                  qualifiedRole: actionProvenance.situationContext.qualifiedRole,
                  ...(actionProvenance.situationContext.requestChannel
                    ? { requestChannel: actionProvenance.situationContext.requestChannel }
                    : {}),
                }
              : {}),
          },
        }),
        payload: this.toInputJson(envelope),
      },
    });
  }

  findPendingForUser(input: { actionId: string; runId: number; userId: number; storeId: number }) {
    return this.prisma.brainActionConfirmation.findFirst({
      where: {
        actionId: input.actionId,
        runId: input.runId,
        userId: input.userId,
        storeId: input.storeId,
        status: 'pending',
      },
    });
  }

  async listExecutionStatuses(input: { runId: number; userId: number; storeId: number }) {
    const actions = await this.prisma.brainActionConfirmation.findMany({
      where: {
        runId: input.runId,
        userId: input.userId,
        storeId: input.storeId,
      },
      orderBy: { createdAt: 'asc' },
    });
    if (!actions.length) return [];

    const executions = await this.prisma.brainActionExecution.findMany({
      where: {
        runId: input.runId,
        userId: input.userId,
        storeId: input.storeId,
        actionId: { in: actions.map((action) => action.actionId) },
      },
      orderBy: { createdAt: 'desc' },
    });
    const effectReconciledExecutions = await this.reconcileGovernedEffectStatuses(executions, actions, input.storeId);
    const reconciledExecutions = await this.reconcileBusinessExecutionStatuses(
      effectReconciledExecutions,
      input.storeId,
    );
    const executionByActionId = new Map<string, (typeof reconciledExecutions)[number]>();
    for (const execution of reconciledExecutions) {
      if (!executionByActionId.has(execution.actionId)) {
        executionByActionId.set(execution.actionId, execution);
      }
    }

    return actions.map((action) => {
      const execution = executionByActionId.get(action.actionId);
      return execution ? this.existingExecutionResult(action, execution, false) : this.confirmationOnlyResult(action);
    });
  }

  async confirmPreviewOnly(input: { actionId: string; runId: number; userId: number; storeId: number }) {
    const action = await this.findPendingForUser(input);
    if (!action) return null;

    return this.prisma.brainActionConfirmation.update({
      where: { actionId: input.actionId },
      data: {
        status: 'confirmed_preview_only',
        confirmedAt: new Date(),
        result: { execution: 'not_connected' },
      },
    });
  }

  async confirmAndExecute(input: {
    actionId: string;
    runId: number;
    userId: number;
    storeId: number;
    permissions: string[];
    roles?: string[];
    requestChannel?: string;
    deviceIdHash?: string;
  }) {
    if (!this.capabilityGateway) throw new Error('capability_gateway_unavailable');
    const action = await this.prisma.brainActionConfirmation.findFirst({
      where: {
        actionId: input.actionId,
        runId: input.runId,
        userId: input.userId,
        storeId: input.storeId,
      },
    });
    if (!action) return null;

    const storedPayload = this.asRecord(action.payload);
    const isVersionedEnvelope =
      storedPayload.protocolVersion === '1.0' ||
      storedPayload.protocolVersion === '1.1' ||
      storedPayload.protocolVersion === '1.2' ||
      storedPayload.protocolVersion === '1.3' ||
      storedPayload.protocolVersion === '1.4' ||
      storedPayload.protocolVersion === '1.5';
    const idempotencyKey =
      isVersionedEnvelope && typeof storedPayload.idempotencyKey === 'string' && storedPayload.idempotencyKey.trim()
        ? storedPayload.idempotencyKey.trim()
        : typeof storedPayload.idempotencyKey === 'string' && storedPayload.idempotencyKey.trim()
          ? storedPayload.idempotencyKey.trim()
          : action.actionId;
    const existing = await this.prisma.brainActionExecution.findUnique({
      where: {
        storeId_capabilityKey_idempotencyKey: {
          storeId: input.storeId,
          capabilityKey: action.skillKey,
          idempotencyKey,
        },
      },
    });
    if (existing) {
      return this.existingExecutionResult(action, existing);
    }

    if (action.status !== 'pending') {
      return { actionId: action.actionId, status: action.status, receipt: action.result, duplicated: true };
    }
    const expiresAt =
      isVersionedEnvelope && typeof storedPayload.expiresAt === 'string'
        ? new Date(storedPayload.expiresAt)
        : new Date(action.createdAt.getTime() + 15 * 60_000);
    if (Number.isNaN(expiresAt.getTime()) || Date.now() > expiresAt.getTime()) {
      await this.prisma.brainActionConfirmation.update({
        where: { actionId: action.actionId },
        data: { status: 'expired', result: { execution: 'confirmation_expired' } },
      });
      return { actionId: action.actionId, status: 'expired' };
    }

    const { approval, validation, provenance, actionDefinition } = await this.validateApprovedAction(action, input);

    const claimed = await this.prisma.$transaction(async (tx) => {
      const claim = await tx.brainActionConfirmation.updateMany({
        where: { actionId: action.actionId, status: 'pending' },
        data: { status: 'executing', confirmedAt: new Date() },
      });
      if (claim.count !== 1) return null;
      return tx.brainActionExecution.create({
        data: {
          confirmationId: action.id,
          actionId: action.actionId,
          runId: action.runId,
          storeId: action.storeId,
          userId: action.userId,
          capabilityKey: action.skillKey,
          ...this.provenanceRecordData(provenance),
          idempotencyKey,
          riskLevel: action.riskLevel ?? 'medium',
          status: 'executing',
          requestPayload: this.toInputJson(approval),
          previewPayload: this.toNullableInputJson(action.preview),
        },
      });
    });
    if (!claimed) {
      const concurrent = await this.prisma.brainActionExecution.findUnique({
        where: {
          storeId_capabilityKey_idempotencyKey: {
            storeId: input.storeId,
            capabilityKey: action.skillKey,
            idempotencyKey,
          },
        },
      });
      return concurrent
        ? {
            actionId: action.actionId,
            executionId: concurrent.id,
            status: concurrent.status,
            receipt: concurrent.receiptPayload,
            duplicated: true,
          }
        : { actionId: action.actionId, status: 'executing', duplicated: true };
    }

    await this.recordExecutionTrace({
      runId: action.runId,
      actionId: action.actionId,
      capabilityKey: action.skillKey,
      executionId: claimed.id,
      status: 'executing',
      provenance,
    });

    return this.executeClaimedAction({
      action,
      executionId: claimed.id,
      payload: validation.payload,
      permissions: input.permissions,
      idempotencyKey: approval.idempotencyKey,
      provenance,
      actionDefinition,
    });
  }

  async retryFailedExecution(input: {
    actionId: string;
    runId: number;
    userId: number;
    storeId: number;
    permissions: string[];
    roles?: string[];
    requestChannel?: string;
    deviceIdHash?: string;
  }) {
    if (!this.capabilityGateway) throw new Error('capability_gateway_unavailable');
    const action = await this.prisma.brainActionConfirmation.findFirst({
      where: {
        actionId: input.actionId,
        runId: input.runId,
        userId: input.userId,
        storeId: input.storeId,
      },
    });
    if (!action) return null;

    const idempotencyKey = this.actionIdempotencyKey(action);
    const existing = await this.prisma.brainActionExecution.findUnique({
      where: {
        storeId_capabilityKey_idempotencyKey: {
          storeId: input.storeId,
          capabilityKey: action.skillKey,
          idempotencyKey,
        },
      },
    });
    if (!existing) {
      return {
        actionId: action.actionId,
        status: action.status,
        retryable: false,
        recovery: 'manual_reconcile' as const,
        error: { code: 'action_execution_missing', message: '未找到原执行记录，请人工核对业务单据。' },
      };
    }
    if (action.status !== 'failed' || existing.status !== 'failed') {
      return this.existingExecutionResult(action, existing);
    }
    if (
      this.failureRecovery(action.skillKey) !== 'safe_replay' ||
      existing.errorCode === 'marketing_automation_execution_failed'
    ) {
      return this.existingExecutionResult(action, existing);
    }

    const storedPayload = this.asRecord(action.payload);
    const expiresAt =
      typeof storedPayload.expiresAt === 'string'
        ? new Date(storedPayload.expiresAt)
        : new Date(action.createdAt.getTime() + 15 * 60_000);
    if (Number.isNaN(expiresAt.getTime()) || Date.now() > expiresAt.getTime()) {
      await this.prisma.brainActionConfirmation.update({
        where: { actionId: action.actionId },
        data: { status: 'expired', result: { execution: 'retry_confirmation_expired' } },
      });
      return { actionId: action.actionId, executionId: existing.id, status: 'expired', retryable: false };
    }

    const { approval, validation, provenance, actionDefinition } = await this.validateApprovedAction(action, input, {
      evaluatePreconditions: false,
    });
    if (actionDefinition) {
      if (!this.predicateEffectEvaluator) {
        throw new BadRequestException('action_predicate_evaluator_unavailable');
      }
      const recoveredReceipt = await this.predicateEffectEvaluator.recoverCommittedEffect({
        action: actionDefinition,
        capabilityKey: approval.capabilityKey,
        storeId: input.storeId,
        args: validation.payload,
        idempotencyKey: approval.idempotencyKey,
      });
      if (recoveredReceipt) {
        const actionInvariantEvaluation = evaluateCuratedActionInvariant({
          actionKey: actionDefinition.actionKey,
          contractRef: actionDefinition.sideEffectInvariant.invariantContractRef,
          receipt: recoveredReceipt,
          effectObservations: recoveredReceipt.effectObservations,
        });
        return this.completeRecoveredExecution({
          action,
          executionId: existing.id,
          receipt: recoveredReceipt,
          actionInvariantEvaluation,
          provenance,
          actionDefinition,
        });
      }
      await this.predicateEffectEvaluator.assertPreconditions({
        action: actionDefinition,
        capabilityKey: approval.capabilityKey,
        storeId: input.storeId,
        args: validation.payload,
        phase: 'execution',
      });
    }
    let claimed = false;
    try {
      claimed = await this.prisma.$transaction(async (tx) => {
        const confirmationClaim = await tx.brainActionConfirmation.updateMany({
          where: { actionId: action.actionId, status: 'failed' },
          data: { status: 'executing', result: Prisma.JsonNull },
        });
        if (confirmationClaim.count !== 1) return false;
        const executionClaim = await tx.brainActionExecution.updateMany({
          where: { id: existing.id, status: 'failed' },
          data: {
            status: 'executing',
            errorCode: null,
            errorMessage: null,
            completedAt: null,
            startedAt: new Date(),
          },
        });
        if (executionClaim.count !== 1) throw new Error('action_retry_execution_claim_conflict');
        return true;
      });
    } catch (error) {
      if (!(error instanceof Error) || error.message !== 'action_retry_execution_claim_conflict') throw error;
    }
    if (!claimed) {
      const concurrent = await this.prisma.brainActionExecution.findUnique({ where: { id: existing.id } });
      return concurrent ? this.existingExecutionResult(action, concurrent) : null;
    }

    await this.recordExecutionTrace({
      runId: action.runId,
      actionId: action.actionId,
      capabilityKey: action.skillKey,
      executionId: existing.id,
      status: 'retrying',
      provenance,
    });
    return this.executeClaimedAction({
      action,
      executionId: existing.id,
      payload: validation.payload,
      permissions: input.permissions,
      idempotencyKey: approval.idempotencyKey,
      retried: true,
      provenance,
      actionDefinition,
    });
  }

  async rejectPreview(input: { actionId: string; runId: number; userId: number; storeId: number }) {
    const action = await this.findPendingForUser(input);
    if (!action) return null;

    return this.prisma.brainActionConfirmation.update({
      where: { actionId: input.actionId },
      data: {
        status: 'rejected',
        result: { execution: 'user_rejected' },
      },
    });
  }

  private async validateApprovedAction(
    action: {
      actionId: string;
      runId: number;
      userId: number;
      storeId: number;
      skillKey: string;
      riskLevel: BrainRiskLevel;
      payload: Prisma.JsonValue;
      createdAt: Date;
    } & BrainActionProvenanceRecordFields,
    input: {
      userId: number;
      storeId: number;
      permissions: string[];
      roles?: string[];
      requestChannel?: string;
      deviceIdHash?: string;
    },
    options?: { evaluatePreconditions?: boolean },
  ) {
    if (!this.capabilityGateway) throw new Error('capability_gateway_unavailable');
    const descriptor = this.capabilityGateway.resolve(action.skillKey);
    const approval = this.approvalEnvelope(action, descriptor.version);
    const provenance = approval.actionProvenance;
    let actionDefinition: BusinessActionDefinitionSnapshot | undefined;
    let conversationId: number | undefined;
    this.assertStoredProvenance(action, provenance);
    if (provenance) {
      const run = await this.prisma.brainRun.findFirst({
        where: {
          id: action.runId,
          userId: input.userId,
          storeId: input.storeId,
        },
        select: { conversationId: true },
      });
      if (!run?.conversationId) throw new BadRequestException('action_situation_conversation_unavailable');
      conversationId = run.conversationId;
      if (!this.executionIdentity) throw new BadRequestException('action_identity_revalidator_unavailable');
      actionDefinition = (await this.executionIdentity.assertCurrent(provenance)).action;
    }
    if (approval.capabilityKey !== action.skillKey || approval.capabilityVersion !== descriptor.version) {
      throw new BadRequestException('action_capability_version_mismatch');
    }
    if (approval.actor.userId !== input.userId || approval.actor.userId !== action.userId) {
      throw new ForbiddenException('action_actor_mismatch');
    }
    if (approval.store.storeId !== input.storeId || approval.store.storeId !== action.storeId) {
      throw new ForbiddenException('action_store_mismatch');
    }
    if (approval.riskLevel !== action.riskLevel || approval.riskLevel !== descriptor.riskLevel) {
      throw new BadRequestException('action_risk_mismatch');
    }
    this.assertNoConfirmationClaim(approval.validatedArgs);
    const validation = this.capabilityGateway.validateForExecution(
      approval.capabilityKey,
      approval.capabilityVersion,
      approval.validatedArgs,
    );
    if (this.digest(validation.payload) !== approval.argsDigest) {
      throw new BadRequestException('action_args_digest_mismatch');
    }
    if (!input.permissions.includes('*') && !input.permissions.includes(descriptor.permission)) {
      throw new ForbiddenException(`missing_permission:${descriptor.permission}`);
    }
    if (actionDefinition) {
      this.assertGatewayEffectContract(actionDefinition, validation.descriptor);
      if (!provenance || !conversationId) {
        throw new BadRequestException('action_situation_conversation_unavailable');
      }
      const currentQualifiedRoles = new Set(
        (input.roles ?? [])
          .map((role) => resolveBrainDomainRole(role))
          .filter((role): role is NonNullable<ReturnType<typeof resolveBrainDomainRole>> => Boolean(role)),
      );
      const qualifiedRole = provenance.situationContext.qualifiedRole;
      if (!currentQualifiedRoles.has(qualifiedRole)) {
        throw new BadRequestException('action_situation_role_mismatch');
      }
      const situationIssue = brainActionSituationContextIssue(provenance.situationContext, {
        profileFingerprint: actionDefinition.situationContext.fingerprint,
        runId: action.runId,
        conversationId,
        context: {
          userId: input.userId,
          storeId: input.storeId,
          requestChannel: input.requestChannel,
          deviceIdHash: input.deviceIdHash,
        },
        qualifiedRole,
      });
      if (situationIssue) throw new BadRequestException(situationIssue);
      if (
        provenance.actionModalityPolicyFingerprint !== actionDefinition.modalityPolicy.fingerprint ||
        provenance.actionInformationArtifactProfileFingerprint !== actionDefinition.informationArtifact.fingerprint ||
        provenance.actionSideEffectInvariantProfileFingerprint !== actionDefinition.sideEffectInvariant.fingerprint ||
        (actionDefinition.institutionalEffect?.fingerprint ?? undefined) !==
          provenance.actionInstitutionalEffectProfileFingerprint
      ) {
        throw new BadRequestException('action_semantic_profile_drift');
      }
      if (provenance.informationArtifacts.length) {
        if (!this.resultReferenceService) {
          throw new BadRequestException('action_information_artifact_revalidator_unavailable');
        }
        const sourceRunIds = [...new Set(provenance.informationArtifacts.map((artifact) => artifact.sourceRunId))];
        const sourceRuns = await this.prisma.brainRun.findMany({
          where: {
            id: { in: sourceRunIds },
            conversationId,
            userId: input.userId,
            storeId: input.storeId,
            status: 'completed',
          },
          select: { id: true, output: true },
        });
        const outputByRunId = new Map(sourceRuns.map((sourceRun) => [sourceRun.id, sourceRun.output]));
        for (const artifact of provenance.informationArtifacts) {
          if (
            artifact.profileFingerprint !== actionDefinition.informationArtifact.fingerprint ||
            !this.resultReferenceService.verifyInformationArtifact({
              artifact,
              output: outputByRunId.get(artifact.sourceRunId),
              scope: { conversationId, userId: input.userId, storeId: input.storeId },
            })
          ) {
            throw new BadRequestException(`action_information_artifact_drift:${artifact.artifactKey}`);
          }
        }
      }
      if (options?.evaluatePreconditions !== false) {
        if (!this.predicateEffectEvaluator) {
          throw new BadRequestException('action_predicate_evaluator_unavailable');
        }
        await this.predicateEffectEvaluator.assertPreconditions({
          action: actionDefinition,
          capabilityKey: approval.capabilityKey,
          storeId: input.storeId,
          args: validation.payload,
          phase: 'execution',
        });
      }
    } else {
      await this.targetResolver?.revalidateCapabilityTarget({
        capabilityKey: approval.capabilityKey,
        storeId: input.storeId,
        userId: input.userId,
        args: validation.payload,
        idempotencyKey: approval.idempotencyKey,
      });
    }
    return { approval, validation, provenance, actionDefinition };
  }

  private async completeRecoveredExecution(input: {
    action: { actionId: string; runId: number; skillKey: string };
    executionId: number;
    receipt: BrainRecoveredActionEffectReceipt;
    actionInvariantEvaluation: ActionInvariantEvaluation;
    provenance?: BrainActionExecutionProvenance;
    actionDefinition: BusinessActionDefinitionSnapshot;
  }) {
    const completedAt = new Date();
    const institutionalEffectEvaluation = this.institutionalEffectEvaluation({
      actionDefinition: input.actionDefinition,
      provenance: input.provenance,
      receipt: input.receipt,
      effectObservations: input.receipt.effectObservations,
      actionInvariantEvaluation: input.actionInvariantEvaluation,
    });
    const succeeded =
      input.actionInvariantEvaluation.status === 'satisfied' &&
      (!institutionalEffectEvaluation || institutionalEffectEvaluation.status === 'effective');
    const status = succeeded ? ('succeeded' as const) : ('partially_succeeded' as const);
    const receipt = {
      ...input.receipt,
      status,
      actionInvariantEvaluation: input.actionInvariantEvaluation,
      ...(institutionalEffectEvaluation ? { institutionalEffectEvaluation } : {}),
      ...(!succeeded
        ? {
            message:
              institutionalEffectEvaluation && institutionalEffectEvaluation.status !== 'effective'
                ? '已找到原业务效果，但正式业务效力证据不完整或冲突；禁止自动重试，请人工核对。'
                : '已找到原业务效果，但事务变更足迹不满足动作专用不变量合同；禁止自动重试，请人工核对。',
          }
        : {}),
    };
    let completed = false;
    try {
      completed = await this.prisma.$transaction(async (tx) => {
        const confirmation = await tx.brainActionConfirmation.updateMany({
          where: { actionId: input.action.actionId, status: 'failed' },
          data: {
            status,
            executedAt: completedAt,
            result: receipt as unknown as Prisma.InputJsonValue,
          },
        });
        if (confirmation.count !== 1) return false;
        const execution = await tx.brainActionExecution.updateMany({
          where: { id: input.executionId, status: 'failed' },
          data: {
            status,
            receiptPayload: receipt as unknown as Prisma.InputJsonValue,
            businessObjectType: input.receipt.businessObjectType,
            businessObjectId: String(input.receipt.businessObjectId),
            errorCode: succeeded
              ? null
              : institutionalEffectEvaluation && institutionalEffectEvaluation.status !== 'effective'
                ? 'action_institutional_effect_not_effective'
                : 'action_invariant_evidence_incomplete',
            errorMessage: succeeded ? null : receipt.message,
            completedAt,
          },
        });
        if (execution.count !== 1) throw new Error('action_recovery_execution_claim_conflict');
        return true;
      });
    } catch (error) {
      if (!(error instanceof Error) || error.message !== 'action_recovery_execution_claim_conflict') throw error;
    }
    if (!completed) {
      const concurrent = await this.prisma.brainActionExecution.findUnique({ where: { id: input.executionId } });
      return concurrent ? this.existingExecutionResult(input.action, concurrent) : null;
    }
    await this.recordExecutionTrace({
      runId: input.action.runId,
      actionId: input.action.actionId,
      capabilityKey: input.action.skillKey,
      executionId: input.executionId,
      status,
      receipt,
      provenance: input.provenance,
    });
    return {
      actionId: input.action.actionId,
      executionId: input.executionId,
      status,
      receipt,
      retried: true,
      recovered: true,
    };
  }

  private async executeClaimedAction(input: {
    action: {
      actionId: string;
      runId: number;
      userId: number;
      storeId: number;
      skillKey: string;
    };
    executionId: number;
    payload: Record<string, unknown>;
    permissions: string[];
    idempotencyKey: string;
    retried?: boolean;
    provenance?: BrainActionExecutionProvenance;
    actionDefinition?: BusinessActionDefinitionSnapshot;
  }) {
    if (!this.capabilityGateway) throw new Error('capability_gateway_unavailable');
    const action = input.action;
    try {
      const rawReceipt = await this.capabilityGateway.execute({
        skillKey: action.skillKey,
        payload: input.payload,
        context: {
          userId: action.userId,
          storeId: action.storeId,
          permissions: input.permissions,
          idempotencyKey: input.idempotencyKey,
        },
      });
      const effectObservations =
        input.actionDefinition && this.predicateEffectEvaluator
          ? await this.predicateEffectEvaluator.observeEffects({
              action: input.actionDefinition,
              storeId: action.storeId,
              args: input.payload,
              receipt: rawReceipt,
            })
          : [];
      const effectsObserved = effectObservations.every((item) => item.status === 'observed');
      const actionInvariantEvaluation =
        effectObservations.length && input.actionDefinition
          ? evaluateCuratedActionInvariant({
              actionKey: input.actionDefinition.actionKey,
              contractRef: input.actionDefinition.sideEffectInvariant.invariantContractRef,
              receipt: rawReceipt,
              effectObservations,
            })
          : undefined;
      const invariantSatisfied = actionInvariantEvaluation?.status !== 'manual_reconcile_required';
      const institutionalEffectEvaluation =
        input.actionDefinition && input.provenance
          ? evaluateBusinessActionInstitutionalEffect({
              action: input.actionDefinition,
              provenance: input.provenance,
              receipt: rawReceipt,
              effectObservations,
              actionInvariantEvaluation,
              permissionValidatedAtExecution: true,
            })
          : undefined;
      const institutionalEffectSatisfied =
        !institutionalEffectEvaluation || institutionalEffectEvaluation.status === 'effective';
      const baseEffectReconciliation =
        effectObservations.length && input.actionDefinition && this.predicateEffectEvaluator
          ? this.predicateEffectEvaluator.buildEffectReconciliation({
              action: input.actionDefinition,
              effectObservations,
            })
          : undefined;
      const effectReconciliation =
        effectsObserved && (!invariantSatisfied || !institutionalEffectSatisfied) && baseEffectReconciliation
          ? {
              ...baseEffectReconciliation,
              status: 'manual_reconcile_required' as const,
              nextAttemptAt: null,
              reasonCode: !institutionalEffectSatisfied
                ? ('institutional_effect_not_effective' as const)
                : ('action_invariant_evidence_incomplete' as const),
            }
          : baseEffectReconciliation;
      const receipt = effectObservations.length
        ? {
            ...rawReceipt,
            status:
              effectsObserved && invariantSatisfied && institutionalEffectSatisfied
                ? (rawReceipt.status ?? 'succeeded')
                : ('partially_succeeded' as const),
            effectObservations,
            effectReconciliation,
            actionInvariantEvaluation,
            ...(institutionalEffectEvaluation ? { institutionalEffectEvaluation } : {}),
            ...(!effectsObserved || !invariantSatisfied || !institutionalEffectSatisfied
              ? {
                  message: !effectsObserved
                    ? '业务动作已执行，系统将在固定验证期限内进行有限只读回查；请勿重复执行该动作。'
                    : !institutionalEffectSatisfied
                      ? '动作状态已写入，但正式业务效力证据不完整或冲突；禁止自动重试，请人工核对。'
                    : '动作效果已观测，但事务变更足迹不满足动作专用不变量合同；禁止自动重试，请人工核对。',
                }
              : {}),
          }
        : rawReceipt;
      const executionStatus = receipt.status ?? 'succeeded';
      const terminal = executionStatus !== 'executing';
      const failed = executionStatus === 'failed';
      const partial = executionStatus === 'partially_succeeded';
      const partialErrorCode = !institutionalEffectSatisfied
        ? 'action_institutional_effect_not_effective'
        : !invariantSatisfied
          ? 'action_invariant_evidence_incomplete'
          : 'action_effect_reconciliation_required';
      await this.prisma.brainActionExecution.update({
        where: { id: input.executionId },
        data: {
          status: executionStatus,
          receiptPayload: receipt as unknown as Prisma.InputJsonValue,
          businessObjectType: receipt.businessObjectType,
          businessObjectId: String(receipt.businessObjectId),
          errorCode: failed ? 'business_execution_failed' : partial ? partialErrorCode : null,
          errorMessage: failed || partial ? (receipt.message ?? '业务执行需要人工核对。') : null,
          completedAt: terminal ? new Date() : null,
        },
      });
      await this.prisma.brainActionConfirmation.update({
        where: { actionId: action.actionId },
        data: {
          status: executionStatus,
          executedAt: new Date(),
          result: receipt as unknown as Prisma.InputJsonValue,
        },
      });
      await this.recordExecutionTrace({
        runId: action.runId,
        actionId: action.actionId,
        capabilityKey: action.skillKey,
        executionId: input.executionId,
        status: executionStatus,
        receipt,
        provenance: input.provenance,
      });
      return {
        actionId: action.actionId,
        executionId: input.executionId,
        status: executionStatus,
        receipt,
        ...(input.retried ? { retried: true } : {}),
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'capability_execution_failed';
      const errorCode = message.split(':')[0] || 'capability_execution_failed';
      const recovery = this.failureRecovery(action.skillKey);
      await this.prisma.brainActionExecution.update({
        where: { id: input.executionId },
        data: { status: 'failed', errorCode, errorMessage: message, completedAt: new Date() },
      });
      await this.prisma.brainActionConfirmation.update({
        where: { actionId: action.actionId },
        data: { status: 'failed', executedAt: new Date(), result: { errorCode, message, recovery } },
      });
      await this.recordExecutionTrace({
        runId: action.runId,
        actionId: action.actionId,
        capabilityKey: action.skillKey,
        executionId: input.executionId,
        status: 'failed',
        error: { errorCode, message, recovery },
        provenance: input.provenance,
      });
      return {
        actionId: action.actionId,
        executionId: input.executionId,
        status: 'failed',
        retryable: recovery === 'safe_replay',
        recovery,
        error: { code: errorCode, message },
        ...(input.retried ? { retried: true } : {}),
      };
    }
  }

  private institutionalEffectEvaluation(input: {
    actionDefinition: BusinessActionDefinitionSnapshot;
    provenance?: BrainActionExecutionProvenance;
    receipt: BrainCapabilityReceipt;
    effectObservations: readonly BrainActionEffectObservation[];
    actionInvariantEvaluation?: ActionInvariantEvaluation;
  }): BrainActionInstitutionalEffectEvaluation | undefined {
    if (!input.actionDefinition.institutionalEffect) return undefined;
    if (!input.provenance) throw new BadRequestException('action_institutional_effect_provenance_missing');
    return evaluateBusinessActionInstitutionalEffect({
      action: input.actionDefinition,
      provenance: input.provenance,
      receipt: input.receipt,
      effectObservations: input.effectObservations,
      actionInvariantEvaluation: input.actionInvariantEvaluation,
      permissionValidatedAtExecution: true,
    });
  }

  private existingExecutionResult(
    action: { actionId: string; skillKey: string },
    execution: {
      id: number;
      status: string;
      receiptPayload?: Prisma.JsonValue | null;
      errorCode?: string | null;
      errorMessage?: string | null;
    },
    duplicated = true,
  ) {
    const recovery = this.failureRecovery(action.skillKey);
    const retryable = recovery === 'safe_replay' && execution.errorCode !== 'marketing_automation_execution_failed';
    const effectiveRecovery = retryable ? recovery : 'manual_reconcile';
    const effectReconciliation = this.effectReconciliation(
      this.asRecord(execution.receiptPayload).effectReconciliation,
    );
    const effectRequiresManualReconciliation =
      execution.status === 'partially_succeeded' && effectReconciliation?.status === 'manual_reconcile_required';
    return {
      actionId: action.actionId,
      executionId: execution.id,
      status: execution.status,
      receipt: execution.receiptPayload,
      ...(duplicated ? { duplicated: true } : {}),
      ...(execution.status === 'failed'
        ? {
            retryable,
            recovery: effectiveRecovery,
            error: {
              code: execution.errorCode ?? 'capability_execution_failed',
              message: execution.errorMessage ?? '动作执行失败，请按恢复策略处理。',
            },
          }
        : {}),
      ...(effectRequiresManualReconciliation
        ? {
            retryable: false,
            recovery: 'manual_reconcile' as const,
            error: {
              code: execution.errorCode ?? 'action_effect_reconciliation_required',
              message: execution.errorMessage ?? '动作请求已执行，但预期效果未完成确定性核对，请人工核对业务对象。',
            },
          }
        : {}),
    };
  }

  private async reconcileGovernedEffectStatuses<
    T extends {
      id: number;
      actionId: string;
      runId?: number;
      capabilityKey?: string;
      status: string;
      receiptPayload?: Prisma.JsonValue | null;
      errorCode?: string | null;
      errorMessage?: string | null;
    },
    A extends {
      actionId: string;
      runId: number;
      userId: number;
      storeId: number;
      skillKey: string;
      riskLevel: BrainRiskLevel;
      payload: Prisma.JsonValue;
      createdAt: Date;
    } & BrainActionProvenanceRecordFields,
  >(executions: T[], actions: A[], storeId: number): Promise<T[]> {
    const capabilityGateway = this.capabilityGateway;
    const executionIdentity = this.executionIdentity;
    const predicateEffectEvaluator = this.predicateEffectEvaluator;
    if (!capabilityGateway || !executionIdentity || !predicateEffectEvaluator) return executions;
    const actionById = new Map(actions.map((action) => [action.actionId, action]));
    return Promise.all(
      executions.map(async (execution) => {
        if (execution.status !== 'partially_succeeded') return execution;
        const receipt = this.asRecord(execution.receiptPayload);
        const previousObservations = this.effectObservations(receipt.effectObservations);
        const previousReconciliation = this.effectReconciliation(receipt.effectReconciliation);
        if (!previousObservations || !previousReconciliation || previousReconciliation.status !== 'pending') {
          return execution;
        }
        const action = actionById.get(execution.actionId);
        if (!action || action.storeId !== storeId) return execution;

        try {
          const approval = this.approvalEnvelope(action, capabilityGateway.resolve(action.skillKey).version);
          const provenance = approval.actionProvenance;
          if (!provenance) return execution;
          this.assertStoredProvenance(action, provenance);
          const actionDefinition = (await executionIdentity.assertCurrent(provenance)).action;
          const reconciled = await predicateEffectEvaluator.reconcileEffects({
            action: actionDefinition,
            storeId,
            args: approval.validatedArgs,
            receipt: receipt as unknown as BrainCapabilityReceipt,
            previousObservations,
            reconciliation: previousReconciliation,
          });
          const actionInvariantEvaluation = reconciled.effectObservations.every((item) => item.status === 'observed')
            ? evaluateCuratedActionInvariant({
                actionKey: actionDefinition.actionKey,
                contractRef: actionDefinition.sideEffectInvariant.invariantContractRef,
                receipt: receipt as unknown as BrainCapabilityReceipt,
                effectObservations: reconciled.effectObservations,
              })
            : undefined;
          const institutionalEffectEvaluation = actionInvariantEvaluation
            ? evaluateBusinessActionInstitutionalEffect({
                action: actionDefinition,
                provenance,
                receipt: receipt as unknown as BrainCapabilityReceipt,
                effectObservations: reconciled.effectObservations,
                actionInvariantEvaluation,
                permissionValidatedAtExecution: true,
              })
            : undefined;
          const institutionalEffectSatisfied =
            !institutionalEffectEvaluation || institutionalEffectEvaluation.status === 'effective';
          const reconciliation: BrainActionEffectReconciliation =
            actionInvariantEvaluation?.status === 'manual_reconcile_required' || !institutionalEffectSatisfied
              ? {
                  ...reconciled.reconciliation,
                  status: 'manual_reconcile_required' as const,
                  nextAttemptAt: null,
                  reasonCode: !institutionalEffectSatisfied
                    ? 'institutional_effect_not_effective'
                    : 'action_invariant_evidence_incomplete',
                }
              : reconciled.reconciliation;
          if (
            reconciliation.attemptCount === previousReconciliation.attemptCount &&
            reconciliation.status === previousReconciliation.status
          ) {
            return execution;
          }
          return this.persistEffectReconciliation({
            action,
            execution,
            receipt,
            effectObservations: reconciled.effectObservations,
            reconciliation,
            actionInvariantEvaluation,
            institutionalEffectEvaluation,
            provenance,
          });
        } catch (error) {
          const message = error instanceof Error ? error.message : 'effect_reconciliation_context_invalid';
          return this.persistEffectReconciliation({
            action,
            execution,
            receipt,
            effectObservations: previousObservations,
            reconciliation: {
              ...previousReconciliation,
              status: 'manual_reconcile_required',
              nextAttemptAt: null,
              reasonCode: 'effect_reconciliation_context_invalid',
            },
            errorCode: message.split(':')[0] || 'effect_reconciliation_context_invalid',
          });
        }
      }),
    );
  }

  private async persistEffectReconciliation<
    T extends {
      id: number;
      actionId: string;
      runId?: number;
      capabilityKey?: string;
      status: string;
      receiptPayload?: Prisma.JsonValue | null;
      errorCode?: string | null;
      errorMessage?: string | null;
    },
  >(input: {
    action: { actionId: string; runId: number; skillKey: string };
    execution: T;
    receipt: Record<string, unknown>;
    effectObservations: readonly BrainActionEffectObservation[];
    reconciliation: BrainActionEffectReconciliation;
    actionInvariantEvaluation?: ActionInvariantEvaluation;
    institutionalEffectEvaluation?: BrainActionInstitutionalEffectEvaluation;
    provenance?: BrainActionExecutionProvenance;
    errorCode?: string;
  }): Promise<T> {
    const succeeded = input.reconciliation.status === 'succeeded';
    const manual = input.reconciliation.status === 'manual_reconcile_required';
    const status = succeeded ? 'succeeded' : 'partially_succeeded';
    const message = succeeded
      ? input.institutionalEffectEvaluation
        ? '业务效果及正式业务效力已在固定验证期限内完成确定性核对。'
        : '业务效果已在固定验证期限内完成确定性核对。'
      : manual
        ? input.institutionalEffectEvaluation && input.institutionalEffectEvaluation.status !== 'effective'
          ? '动作请求已执行，但正式业务效力证据不完整或冲突；禁止自动重试，请人工核对业务对象。'
          : '动作请求已执行，但有限只读回查未能确认预期效果；禁止自动重试，请人工核对业务对象。'
        : `业务效果核对中（${input.reconciliation.attemptCount}/${input.reconciliation.maxAttempts}）。`;
    const receipt = {
      ...input.receipt,
      status,
      message,
      effectObservations: input.effectObservations,
      effectReconciliation: input.reconciliation,
      ...(input.actionInvariantEvaluation ? { actionInvariantEvaluation: input.actionInvariantEvaluation } : {}),
      ...(input.institutionalEffectEvaluation
        ? { institutionalEffectEvaluation: input.institutionalEffectEvaluation }
        : {}),
    } as unknown as Prisma.InputJsonValue;
    const errorCode = manual
      ? (input.errorCode ??
        (input.institutionalEffectEvaluation && input.institutionalEffectEvaluation.status !== 'effective'
          ? 'action_institutional_effect_not_effective'
          : 'action_effect_reconciliation_required'))
      : null;
    const errorMessage = manual ? message : null;
    await Promise.all([
      this.prisma.brainActionExecution.update({
        where: { id: input.execution.id },
        data: { status, receiptPayload: receipt, errorCode, errorMessage },
      }),
      this.prisma.brainActionConfirmation.update({
        where: { actionId: input.action.actionId },
        data: { status, result: receipt },
      }),
    ]);
    if (succeeded || manual) {
      await this.recordExecutionTrace({
        runId: input.action.runId,
        actionId: input.action.actionId,
        capabilityKey: input.action.skillKey,
        executionId: input.execution.id,
        status,
        receipt,
        provenance: input.provenance,
      });
    }
    return {
      ...input.execution,
      status,
      receiptPayload: receipt,
      errorCode,
      errorMessage,
    };
  }

  private async reconcileBusinessExecutionStatuses<
    T extends {
      id: number;
      actionId: string;
      status: string;
      businessObjectType?: string | null;
      businessObjectId?: string | null;
      receiptPayload?: Prisma.JsonValue | null;
      errorCode?: string | null;
      errorMessage?: string | null;
    },
  >(executions: T[], storeId: number): Promise<T[]> {
    const candidates = executions.filter(
      (execution) =>
        execution.businessObjectType === 'marketing_automation_execution' &&
        Number.isInteger(Number(execution.businessObjectId)),
    );
    const delegate = (
      this.prisma as unknown as {
        marketingAutomationExecution?: {
          findMany: (input: unknown) => Promise<Array<Record<string, unknown>>>;
        };
      }
    ).marketingAutomationExecution;
    if (!delegate || candidates.length === 0) return executions;

    const ids = [...new Set(candidates.map((execution) => Number(execution.businessObjectId)))];
    const rows = await delegate.findMany({ where: { id: { in: ids }, storeId } });
    const rowById = new Map(rows.map((row) => [Number(row.id), row]));
    return Promise.all(
      executions.map(async (execution) => {
        if (execution.businessObjectType !== 'marketing_automation_execution') return execution;
        const row = rowById.get(Number(execution.businessObjectId));
        if (!row) return execution;
        const businessStatus = String(row.status ?? 'pending');
        const status = this.marketingExecutionStatus(businessStatus);
        const receipt = {
          ...this.asRecord(execution.receiptPayload),
          message: this.marketingExecutionMessage(row),
          result: this.marketingExecutionReceipt(row),
        } as unknown as Prisma.InputJsonValue;
        const terminal = status !== 'executing';
        const failed = status === 'failed';
        if (execution.status !== status || this.asRecord(execution.receiptPayload).result === undefined) {
          await Promise.all([
            this.prisma.brainActionExecution.update({
              where: { id: execution.id },
              data: {
                status,
                receiptPayload: receipt,
                errorCode: failed ? 'marketing_automation_execution_failed' : null,
                errorMessage: failed ? '自动触达发送失败，请在营销执行记录中核对失败任务。' : null,
                completedAt: terminal ? new Date() : null,
              },
            }),
            this.prisma.brainActionConfirmation.update({
              where: { actionId: execution.actionId },
              data: { status, result: receipt, ...(terminal ? { executedAt: new Date() } : {}) },
            }),
          ]);
        }
        return {
          ...execution,
          status,
          receiptPayload: receipt,
          errorCode: failed ? 'marketing_automation_execution_failed' : null,
          errorMessage: failed ? '自动触达发送失败，请在营销执行记录中核对失败任务。' : null,
        };
      }),
    );
  }

  private marketingExecutionStatus(status: string) {
    if (status === 'success') return 'succeeded';
    if (status === 'partial_failed') return 'partially_succeeded';
    if (status === 'failed') return 'failed';
    return 'executing';
  }

  private marketingExecutionMessage(row: Record<string, unknown>) {
    const queued = Number(row.queuedCount ?? 0);
    const reached = Number(row.reachedCount ?? 0);
    const failed = Number(row.failedCount ?? 0);
    const status = String(row.status ?? 'pending');
    if (status === 'pending' || status === 'running')
      return `自动触达正在执行：排队 ${queued} 人，已触达 ${reached} 人。`;
    if (status === 'partial_failed') return `自动触达部分完成：已触达 ${reached} 人，失败 ${failed} 人。`;
    if (status === 'failed') return `自动触达执行失败：失败 ${failed} 人。`;
    return `自动触达执行完成：已触达 ${reached} 人，失败 ${failed} 人。`;
  }

  private marketingExecutionReceipt(row: Record<string, unknown>) {
    const date = (value: unknown) => (value instanceof Date ? value.toISOString() : (value ?? null));
    return {
      id: Number(row.id),
      status: String(row.status ?? 'pending'),
      triggeredCount: Number(row.triggeredCount ?? 0),
      queuedCount: Number(row.queuedCount ?? 0),
      reachedCount: Number(row.reachedCount ?? 0),
      failedCount: Number(row.failedCount ?? 0),
      channel: row.channel == null ? null : String(row.channel),
      executedAt: date(row.executedAt),
      startedAt: date(row.startedAt),
      completedAt: date(row.completedAt),
    };
  }

  private effectObservations(value: unknown): readonly BrainActionEffectObservation[] | undefined {
    if (!Array.isArray(value) || value.length === 0) return undefined;
    const observations = value.filter((item): item is BrainActionEffectObservation =>
      Boolean(
        item &&
        typeof item === 'object' &&
        typeof (item as BrainActionEffectObservation).effectKey === 'string' &&
        Number.isInteger((item as BrainActionEffectObservation).version) &&
        typeof (item as BrainActionEffectObservation).fingerprint === 'string' &&
        typeof (item as BrainActionEffectObservation).status === 'string' &&
        typeof (item as BrainActionEffectObservation).observedAt === 'string' &&
        typeof (item as BrainActionEffectObservation).verificationDeadline === 'string',
      ),
    );
    return observations.length === value.length ? observations : undefined;
  }

  private effectReconciliation(value: unknown): BrainActionEffectReconciliation | undefined {
    const record = this.asRecord(value);
    if (
      !['not_required', 'pending', 'succeeded', 'manual_reconcile_required'].includes(String(record.status)) ||
      !Number.isInteger(record.attemptCount) ||
      !Number.isInteger(record.maxAttempts) ||
      typeof record.verificationDeadline !== 'string' ||
      typeof record.lastAttemptAt !== 'string' ||
      (record.nextAttemptAt !== null && typeof record.nextAttemptAt !== 'string') ||
      typeof record.reasonCode !== 'string'
    ) {
      return undefined;
    }
    return record as unknown as BrainActionEffectReconciliation;
  }

  private confirmationOnlyResult(action: {
    actionId: string;
    skillKey: string;
    status: string;
    result: Prisma.JsonValue | null;
  }) {
    if (action.status === 'pending') {
      return { actionId: action.actionId, status: 'pending' as const };
    }
    if (action.status === 'executing') {
      return { actionId: action.actionId, status: 'executing' as const };
    }
    if (action.status === 'rejected') {
      return { actionId: action.actionId, status: 'rejected' as const };
    }
    if (action.status === 'expired') {
      return { actionId: action.actionId, status: 'expired' as const };
    }
    if (action.status === 'succeeded' || action.status === 'partially_succeeded') {
      return { actionId: action.actionId, status: action.status, receipt: action.result };
    }

    const result = this.asRecord(action.result);
    const recovery = this.failureRecovery(action.skillKey);
    return {
      actionId: action.actionId,
      status: 'failed' as const,
      retryable: false,
      recovery,
      error: {
        code: typeof result.errorCode === 'string' ? result.errorCode : 'action_execution_missing',
        message: typeof result.message === 'string' ? result.message : '动作状态缺少执行记录，请核对后台业务单据。',
      },
    };
  }

  private failureRecovery(skillKey: string): 'safe_replay' | 'manual_reconcile' {
    const gateway = this.capabilityGateway as unknown as
      | {
          resolve?: (key: string) => { failureRecovery?: 'safe_replay' | 'manual_reconcile' };
        }
      | undefined;
    const configured = gateway?.resolve?.(skillKey)?.failureRecovery;
    if (configured === 'safe_replay' || configured === 'manual_reconcile') return configured;
    return 'manual_reconcile';
  }

  private assertGatewayEffectContract(
    action: BusinessActionDefinitionSnapshot,
    descriptor: { effectKeys?: readonly string[] },
  ): void {
    const actionEffects = [...new Set(action.effects)].sort();
    const gatewayEffects = [...new Set(descriptor.effectKeys ?? [])].sort();
    if (
      action.sideEffectInvariant.gatewayEffectPolicy !== 'exact_declared_effect_match' ||
      actionEffects.length === 0 ||
      this.stableStringify(actionEffects) !== this.stableStringify(gatewayEffects)
    ) {
      throw new BadRequestException('action_gateway_effect_contract_drift');
    }
  }

  private actionIdempotencyKey(action: { actionId: string; payload: Prisma.JsonValue }) {
    const payload = this.asRecord(action.payload);
    return typeof payload.idempotencyKey === 'string' && payload.idempotencyKey.trim()
      ? payload.idempotencyKey.trim()
      : action.actionId;
  }

  private asRecord(value: unknown): Record<string, unknown> {
    return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
  }

  private approvalEnvelope(
    action: {
      actionId: string;
      userId: number;
      storeId: number;
      skillKey: string;
      riskLevel: BrainRiskLevel;
      payload: Prisma.JsonValue;
      createdAt: Date;
    } & BrainActionProvenanceRecordFields,
    fallbackVersion: number,
  ): BrainActionApprovalEnvelope {
    const payload = this.asRecord(action.payload);
    if (
      payload.protocolVersion !== '1.0' &&
      payload.protocolVersion !== '1.1' &&
      payload.protocolVersion !== '1.2' &&
      payload.protocolVersion !== '1.3' &&
      payload.protocolVersion !== '1.4' &&
      payload.protocolVersion !== '1.5'
    ) {
      const validatedArgs = { ...payload };
      delete validatedArgs.idempotencyKey;
      return {
        protocolVersion: '1.0',
        capabilityKey: action.skillKey,
        capabilityVersion: fallbackVersion,
        validatedArgs,
        actor: { userId: action.userId },
        store: { storeId: action.storeId },
        riskLevel: action.riskLevel,
        idempotencyKey: typeof payload.idempotencyKey === 'string' ? payload.idempotencyKey : action.actionId,
        planId: `legacy-run-action:${action.actionId}`,
        argsDigest: this.digest(validatedArgs),
        expiresAt: new Date(action.createdAt.getTime() + 15 * 60_000).toISOString(),
      };
    }
    if (payload.protocolVersion === '1.1') {
      throw new BadRequestException('action_situation_context_upgrade_required');
    }
    if (payload.protocolVersion === '1.2') {
      throw new BadRequestException('action_information_artifact_upgrade_required');
    }
    if (payload.protocolVersion === '1.3') {
      throw new BadRequestException('action_side_effect_invariant_upgrade_required');
    }
    if (payload.protocolVersion === '1.4') {
      throw new BadRequestException('action_invariant_contract_upgrade_required');
    }
    const actor = this.asRecord(payload.actor as Prisma.JsonValue);
    const store = this.asRecord(payload.store as Prisma.JsonValue);
    const validatedArgs = this.asRecord(payload.validatedArgs as Prisma.JsonValue);
    const actionProvenance =
      payload.protocolVersion === '1.5'
        ? this.validateActionProvenance(payload.actionProvenance, action.skillKey)
        : undefined;
    if (
      payload.capabilityKey !== action.skillKey ||
      !Number.isInteger(payload.capabilityVersion) ||
      typeof payload.idempotencyKey !== 'string' ||
      !payload.idempotencyKey.trim() ||
      typeof payload.planId !== 'string' ||
      !payload.planId.trim() ||
      typeof payload.argsDigest !== 'string' ||
      !/^[a-f0-9]{64}$/.test(payload.argsDigest) ||
      typeof payload.expiresAt !== 'string' ||
      !Number.isInteger(actor.userId) ||
      !Number.isInteger(store.storeId)
    ) {
      throw new BadRequestException('invalid_action_approval_envelope');
    }
    return {
      protocolVersion: payload.protocolVersion,
      capabilityKey: payload.capabilityKey,
      capabilityVersion: payload.capabilityVersion as number,
      validatedArgs,
      actor: { userId: actor.userId as number },
      store: { storeId: store.storeId as number },
      riskLevel: payload.riskLevel as BrainRiskLevel,
      idempotencyKey: payload.idempotencyKey,
      planId: payload.planId,
      argsDigest: payload.argsDigest,
      expiresAt: payload.expiresAt,
      ...(actionProvenance ? { actionProvenance } : {}),
    };
  }

  private validateActionProvenance(value: unknown, gatewayActionKey: string): BrainActionExecutionProvenance {
    const provenance = this.asRecord(value);
    const actionRef = this.asRecord(provenance.actionRef);
    const capability = this.asRecord(provenance.capability);
    const situationContext = this.asRecord(provenance.situationContext);
    const informationArtifacts = Array.isArray(provenance.informationArtifacts)
      ? provenance.informationArtifacts.map((artifact) => this.validateInformationArtifact(artifact))
      : [];
    const participants = Array.isArray(provenance.participants)
      ? provenance.participants.map((participant) => this.validateActionParticipant(participant))
      : [];
    const schemaVersion = provenance.schemaVersion;
    const release = provenance.release === undefined ? undefined : this.asRecord(provenance.release);
    if (
      (schemaVersion !== '1.0' && schemaVersion !== '1.1' && schemaVersion !== '1.2') ||
      actionRef.definitionType !== 'action' ||
      typeof actionRef.definitionKey !== 'string' ||
      !actionRef.definitionKey.startsWith('action.') ||
      !Number.isInteger(actionRef.definitionVersion) ||
      (actionRef.definitionVersion as number) <= 0 ||
      !this.isSha256(actionRef.definitionFingerprint) ||
      !this.isSha256(actionRef.sourceFingerprint) ||
      !this.isSha256(provenance.actionBindingFingerprint) ||
      !this.isSha256(provenance.actionSituationContextProfileFingerprint) ||
      !this.isSha256(provenance.actionModalityPolicyFingerprint) ||
      !this.isSha256(provenance.actionInformationArtifactProfileFingerprint) ||
      !this.isSha256(provenance.actionSideEffectInvariantProfileFingerprint) ||
      ((schemaVersion === '1.1' || schemaVersion === '1.2') &&
        (!this.isSha256(provenance.actionParticipantProfileFingerprint) ||
          !this.isSha256(provenance.actionRelationProfileFingerprint) ||
          !Array.isArray(provenance.participants) ||
          participants.length < 4 ||
          participants.length > 32 ||
          new Set(participants.map((participant) => participant.fingerprint)).size !== participants.length)) ||
      (schemaVersion === '1.2' && !this.isSha256(provenance.actionInstitutionalEffectProfileFingerprint)) ||
      (schemaVersion !== '1.2' && provenance.actionInstitutionalEffectProfileFingerprint !== undefined) ||
      !Array.isArray(provenance.informationArtifacts) ||
      informationArtifacts.length > 32 ||
      new Set(informationArtifacts.map((artifact) => artifact.artifactKey)).size !== informationArtifacts.length ||
      !this.isSha256(provenance.ontologySnapshotFingerprint) ||
      situationContext.schemaVersion !== '1.0' ||
      situationContext.profileFingerprint !== provenance.actionSituationContextProfileFingerprint ||
      !Number.isInteger(situationContext.runId) ||
      (situationContext.runId as number) <= 0 ||
      !Number.isInteger(situationContext.conversationId) ||
      (situationContext.conversationId as number) <= 0 ||
      !Number.isInteger(situationContext.storeId) ||
      (situationContext.storeId as number) <= 0 ||
      typeof situationContext.businessDate !== 'string' ||
      !/^\d{4}-\d{2}-\d{2}$/u.test(situationContext.businessDate) ||
      situationContext.timezone !== 'Asia/Shanghai' ||
      !Number.isInteger(situationContext.actorUserId) ||
      (situationContext.actorUserId as number) <= 0 ||
      !this.isQualifiedRole(situationContext.qualifiedRole) ||
      (situationContext.requestChannel !== undefined &&
        (typeof situationContext.requestChannel !== 'string' || !situationContext.requestChannel.trim())) ||
      (situationContext.deviceIdHash !== undefined && !this.isSha256(situationContext.deviceIdHash)) ||
      !this.isSha256(situationContext.fingerprint) ||
      typeof capability.key !== 'string' ||
      !capability.key.trim() ||
      !Number.isInteger(capability.version) ||
      (capability.version as number) <= 0 ||
      !this.isSha256(capability.sourceFingerprint) ||
      provenance.gatewayActionKey !== gatewayActionKey
    ) {
      throw new BadRequestException('invalid_action_execution_provenance');
    }
    const situationFingerprintInput = { ...situationContext };
    delete situationFingerprintInput.fingerprint;
    if (situationContext.fingerprint !== createBusinessDefinitionProjectionFingerprint(situationFingerprintInput)) {
      throw new BadRequestException('invalid_action_situation_context_fingerprint');
    }
    if (
      release &&
      (!Number.isInteger(release.releaseId) ||
        (release.releaseId as number) <= 0 ||
        !this.isSha256(release.releaseFingerprint))
    ) {
      throw new BadRequestException('invalid_action_release_provenance');
    }
    return {
      schemaVersion,
      actionRef: {
        definitionType: 'action',
        definitionKey: actionRef.definitionKey,
        definitionVersion: actionRef.definitionVersion as number,
        definitionFingerprint: actionRef.definitionFingerprint as string,
        sourceFingerprint: actionRef.sourceFingerprint as string,
      },
      actionBindingFingerprint: provenance.actionBindingFingerprint as string,
      actionSituationContextProfileFingerprint: provenance.actionSituationContextProfileFingerprint as string,
      actionModalityPolicyFingerprint: provenance.actionModalityPolicyFingerprint as string,
      actionInformationArtifactProfileFingerprint: provenance.actionInformationArtifactProfileFingerprint as string,
      actionSideEffectInvariantProfileFingerprint: provenance.actionSideEffectInvariantProfileFingerprint as string,
      ...(schemaVersion === '1.1' || schemaVersion === '1.2'
        ? {
            actionParticipantProfileFingerprint: provenance.actionParticipantProfileFingerprint as string,
            actionRelationProfileFingerprint: provenance.actionRelationProfileFingerprint as string,
          }
        : {}),
      ...(schemaVersion === '1.2'
        ? {
            actionInstitutionalEffectProfileFingerprint:
              provenance.actionInstitutionalEffectProfileFingerprint as string,
          }
        : {}),
      ontologySnapshotFingerprint: provenance.ontologySnapshotFingerprint as string,
      situationContext: {
        schemaVersion: '1.0',
        profileFingerprint: situationContext.profileFingerprint as string,
        runId: situationContext.runId as number,
        conversationId: situationContext.conversationId as number,
        storeId: situationContext.storeId as number,
        businessDate: situationContext.businessDate as string,
        timezone: 'Asia/Shanghai',
        actorUserId: situationContext.actorUserId as number,
        qualifiedRole:
          situationContext.qualifiedRole as BrainActionExecutionProvenance['situationContext']['qualifiedRole'],
        ...(situationContext.requestChannel
          ? { requestChannel: (situationContext.requestChannel as string).trim() }
          : {}),
        ...(situationContext.deviceIdHash ? { deviceIdHash: situationContext.deviceIdHash as string } : {}),
        fingerprint: situationContext.fingerprint as string,
      },
      informationArtifacts,
      ...(schemaVersion === '1.1' || schemaVersion === '1.2' ? { participants } : {}),
      capability: {
        key: (capability.key as string).trim(),
        version: capability.version as number,
        sourceFingerprint: capability.sourceFingerprint as string,
      },
      gatewayActionKey,
      ...(release
        ? {
            release: {
              releaseId: release.releaseId as number,
              releaseFingerprint: release.releaseFingerprint as string,
            },
          }
        : {}),
    };
  }

  private validateActionParticipant(value: unknown): BrainActionExecutionParticipant {
    const participant = this.asRecord(value);
    const role = participant.role;
    const source = participant.source;
    if (
      typeof role !== 'string' ||
      ![
        'requester',
        'authorizer',
        'approver',
        'performer',
        'assignee',
        'service_provider',
        'beneficiary',
        'counterparty',
        'accountable_party',
      ].includes(role) ||
      typeof source !== 'string' ||
      ![
        'authenticated_user',
        'confirmation_actor',
        'gateway_executor',
        'action_slot',
        'workflow_assignment',
      ].includes(source) ||
      typeof participant.subjectRef !== 'string' ||
      !participant.subjectRef.trim() ||
      (participant.slotKey !== undefined &&
        (typeof participant.slotKey !== 'string' || !participant.slotKey.trim())) ||
      !Number.isInteger(participant.storeId) ||
      (participant.storeId as number) <= 0 ||
      typeof participant.businessDate !== 'string' ||
      !/^\d{4}-\d{2}-\d{2}$/u.test(participant.businessDate) ||
      (participant.valueFingerprint !== undefined && !this.isSha256(participant.valueFingerprint)) ||
      !this.isSha256(participant.fingerprint)
    ) {
      throw new BadRequestException('invalid_action_execution_participant');
    }
    const fingerprintInput = { ...participant };
    delete fingerprintInput.fingerprint;
    if (participant.fingerprint !== createBusinessDefinitionProjectionFingerprint(fingerprintInput)) {
      throw new BadRequestException('invalid_action_execution_participant_fingerprint');
    }
    return {
      role: role as BrainActionExecutionParticipant['role'],
      source: source as BrainActionExecutionParticipant['source'],
      subjectRef: participant.subjectRef.trim(),
      ...(participant.slotKey ? { slotKey: (participant.slotKey as string).trim() } : {}),
      storeId: participant.storeId as number,
      businessDate: participant.businessDate,
      ...(participant.valueFingerprint ? { valueFingerprint: participant.valueFingerprint as string } : {}),
      fingerprint: participant.fingerprint as string,
    };
  }

  private validateInformationArtifact(value: unknown): BrainActionInformationArtifact {
    const artifact = this.asRecord(value);
    if (
      artifact.schemaVersion !== '1.0' ||
      artifact.artifactType !== 'brain_result_reference' ||
      typeof artifact.artifactKey !== 'string' ||
      !/^run:[1-9][0-9]*:[A-Za-z0-9_-]+:[1-9][0-9]*$/u.test(artifact.artifactKey) ||
      artifact.artifactVersion !== 1 ||
      !Number.isInteger(artifact.sourceRunId) ||
      (artifact.sourceRunId as number) <= 0 ||
      (artifact.sourceCapabilityKey !== undefined &&
        (typeof artifact.sourceCapabilityKey !== 'string' || !artifact.sourceCapabilityKey.trim())) ||
      (artifact.sourceCapabilityVersion !== undefined &&
        (!Number.isInteger(artifact.sourceCapabilityVersion) || (artifact.sourceCapabilityVersion as number) <= 0)) ||
      typeof artifact.sourceOutputKey !== 'string' ||
      !artifact.sourceOutputKey.trim() ||
      typeof artifact.sourceSetId !== 'string' ||
      !artifact.sourceSetId.trim() ||
      typeof artifact.referencedEntityType !== 'string' ||
      !artifact.referencedEntityType.trim() ||
      typeof artifact.referencedEntityKey !== 'string' ||
      !artifact.referencedEntityKey.trim() ||
      !this.isSha256(artifact.profileFingerprint) ||
      !this.isSha256(artifact.contentFingerprint) ||
      !this.isSha256(artifact.fingerprint)
    ) {
      throw new BadRequestException('invalid_action_information_artifact');
    }
    const fingerprintInput = { ...artifact };
    delete fingerprintInput.fingerprint;
    if (artifact.fingerprint !== createBusinessDefinitionProjectionFingerprint(fingerprintInput)) {
      throw new BadRequestException('invalid_action_information_artifact_fingerprint');
    }
    return {
      schemaVersion: '1.0',
      profileFingerprint: artifact.profileFingerprint as string,
      artifactType: 'brain_result_reference',
      artifactKey: artifact.artifactKey,
      artifactVersion: 1,
      sourceRunId: artifact.sourceRunId as number,
      ...(artifact.sourceCapabilityKey ? { sourceCapabilityKey: (artifact.sourceCapabilityKey as string).trim() } : {}),
      ...(artifact.sourceCapabilityVersion
        ? { sourceCapabilityVersion: artifact.sourceCapabilityVersion as number }
        : {}),
      sourceOutputKey: (artifact.sourceOutputKey as string).trim(),
      sourceSetId: (artifact.sourceSetId as string).trim(),
      referencedEntityType: (artifact.referencedEntityType as string).trim(),
      referencedEntityKey: (artifact.referencedEntityKey as string).trim(),
      contentFingerprint: artifact.contentFingerprint as string,
      fingerprint: artifact.fingerprint as string,
    };
  }

  private provenanceRecordData(provenance?: BrainActionExecutionProvenance): BrainActionProvenanceWriteFields {
    if (!provenance) return {};
    return {
      actionDefinitionKey: provenance.actionRef.definitionKey,
      actionDefinitionVersion: provenance.actionRef.definitionVersion,
      actionDefinitionFingerprint: provenance.actionRef.definitionFingerprint,
      actionSourceFingerprint: provenance.actionRef.sourceFingerprint,
      actionBindingFingerprint: provenance.actionBindingFingerprint,
      situationContextProfileFingerprint: provenance.actionSituationContextProfileFingerprint,
      situationContextFingerprint: provenance.situationContext.fingerprint,
      actionModalityPolicyFingerprint: provenance.actionModalityPolicyFingerprint,
      informationArtifactProfileFingerprint: provenance.actionInformationArtifactProfileFingerprint,
      sideEffectInvariantProfileFingerprint: provenance.actionSideEffectInvariantProfileFingerprint,
      institutionalEffectProfileFingerprint: provenance.actionInstitutionalEffectProfileFingerprint,
      informationArtifactFingerprints: provenance.informationArtifacts.map((artifact) => artifact.fingerprint),
      boundCapabilityKey: provenance.capability.key,
      capabilityVersion: provenance.capability.version,
      capabilitySourceFingerprint: provenance.capability.sourceFingerprint,
      ontologySnapshotFingerprint: provenance.ontologySnapshotFingerprint,
      releaseId: provenance.release?.releaseId,
      releaseFingerprint: provenance.release?.releaseFingerprint,
    };
  }

  private assertStoredProvenance(
    action: BrainActionProvenanceRecordFields,
    provenance?: BrainActionExecutionProvenance,
  ): void {
    const stored = this.provenanceRecordData(provenance);
    const governedFields: Array<keyof BrainActionProvenanceRecordFields> = [
      'actionDefinitionKey',
      'actionDefinitionVersion',
      'actionDefinitionFingerprint',
      'actionSourceFingerprint',
      'actionBindingFingerprint',
      'situationContextProfileFingerprint',
      'situationContextFingerprint',
      'actionModalityPolicyFingerprint',
      'informationArtifactProfileFingerprint',
      'sideEffectInvariantProfileFingerprint',
      'institutionalEffectProfileFingerprint',
      'informationArtifactFingerprints',
      'boundCapabilityKey',
      'capabilityVersion',
      'capabilitySourceFingerprint',
      'ontologySnapshotFingerprint',
      'releaseId',
      'releaseFingerprint',
    ];
    for (const field of governedFields) {
      const actual = action[field] ?? undefined;
      const expected = stored[field] ?? undefined;
      const matches =
        field === 'informationArtifactFingerprints'
          ? this.stableStringify(actual) === this.stableStringify(expected)
          : actual === expected;
      if (!matches) throw new BadRequestException(`action_provenance_mismatch:${field}`);
    }
  }

  private isSha256(value: unknown): value is string {
    return typeof value === 'string' && /^[a-f0-9]{64}$/u.test(value);
  }

  private isQualifiedRole(
    value: unknown,
  ): value is BrainActionExecutionProvenance['situationContext']['qualifiedRole'] {
    return (
      typeof value === 'string' &&
      ['store_manager', 'receptionist', 'marketing', 'beautician', 'inventory', 'finance', 'customer_service'].includes(
        value,
      )
    );
  }

  private assertNoConfirmationClaim(value: unknown, seen = new WeakSet<object>(), depth = 0): void {
    if (value === null || typeof value !== 'object') return;
    if (depth > 12 || seen.has(value as object)) throw new BadRequestException('invalid_action_payload');
    seen.add(value as object);
    try {
      if (Array.isArray(value)) {
        value.forEach((item) => this.assertNoConfirmationClaim(item, seen, depth + 1));
        return;
      }
      for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
        if (/^(?:confirmed|confirmation|approved|approve|userConfirmed)$/i.test(key)) {
          throw new BadRequestException(`model_confirmation_claim_forbidden:${key}`);
        }
        this.assertNoConfirmationClaim(item, seen, depth + 1);
      }
    } finally {
      seen.delete(value as object);
    }
  }

  private digest(value: Record<string, unknown>) {
    return createHash('sha256').update(this.stableStringify(value)).digest('hex');
  }

  private stableStringify(value: unknown): string {
    if (value === null || typeof value !== 'object') return JSON.stringify(value);
    if (Array.isArray(value)) return `[${value.map((item) => this.stableStringify(item)).join(',')}]`;
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${this.stableStringify(record[key])}`)
      .join(',')}}`;
  }

  private toInputJson(value: unknown): Prisma.InputJsonValue {
    return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
  }

  private toNullableInputJson(
    value: Prisma.JsonValue | undefined,
  ): Prisma.InputJsonValue | Prisma.NullableJsonNullValueInput {
    return value == null ? Prisma.JsonNull : this.toInputJson(value);
  }

  private async recordExecutionTrace(input: {
    runId: number;
    actionId: string;
    capabilityKey: string;
    executionId: number;
    status: string;
    receipt?: unknown;
    error?: unknown;
    provenance?: BrainActionExecutionProvenance;
  }) {
    if (!this.traceService) return;
    try {
      await this.traceService.recordStep({
        runId: input.runId,
        stepKey: `action_${input.capabilityKey}`,
        layer: 'capability_gateway',
        input: this.toInputJson({
          actionId: input.actionId,
          executionId: input.executionId,
          ...(input.provenance ? { actionProvenance: input.provenance } : {}),
        }),
        output: input.receipt === undefined ? undefined : this.toInputJson(input.receipt),
        error: input.error === undefined ? undefined : this.toInputJson(input.error),
        status: input.status,
      });
    } catch {
      // Trace failure must not repeat or roll back a completed business action.
    }
  }
}
