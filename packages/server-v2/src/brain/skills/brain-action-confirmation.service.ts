import { createHash } from 'node:crypto';
import { BadRequestException, ForbiddenException, Injectable, Optional } from '@nestjs/common';
import { BrainRiskLevel, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service.js';
import { BrainCapabilityGatewayService } from './brain-capability-gateway.service.js';
import { BrainTraceService } from '../governance/brain-trace.service.js';
import { BrainActionTargetResolverService } from '../domain/brain-action-target-resolver.service.js';

interface BrainActionApprovalEnvelope {
  protocolVersion: '1.0';
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
}

@Injectable()
export class BrainActionConfirmationService {
  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly capabilityGateway?: BrainCapabilityGatewayService,
    @Optional() private readonly traceService?: BrainTraceService,
    @Optional() private readonly targetResolver?: BrainActionTargetResolverService,
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
    const validatedArgs = validation?.payload ?? this.asRecord(input.payload);
    const envelope: BrainActionApprovalEnvelope = {
      protocolVersion: '1.0',
      capabilityKey: input.skillKey,
      capabilityVersion,
      validatedArgs,
      actor: { userId: input.userId },
      store: { storeId: input.storeId },
      riskLevel: input.riskLevel,
      idempotencyKey: input.idempotencyKey?.trim() || actionId,
      planId: input.planId?.trim() || `run:${input.runId}`,
      argsDigest: this.digest(validatedArgs),
      expiresAt: new Date(Date.now() + Math.min(Math.max(input.expiresInMs ?? 15 * 60_000, 60_000), 30 * 60_000)).toISOString(),
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
        preview: this.toInputJson({
          ...preview,
          approval: {
            capabilityKey: envelope.capabilityKey,
            capabilityVersion: envelope.capabilityVersion,
            planId: envelope.planId,
            riskLevel: envelope.riskLevel,
            expiresAt: envelope.expiresAt,
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
    const executionByActionId = new Map<string, (typeof executions)[number]>();
    for (const execution of executions) {
      if (!executionByActionId.has(execution.actionId)) {
        executionByActionId.set(execution.actionId, execution);
      }
    }

    return actions.map((action) => {
      const execution = executionByActionId.get(action.actionId);
      return execution
        ? this.existingExecutionResult(action, execution, false)
        : this.confirmationOnlyResult(action);
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
    const isVersionedEnvelope = storedPayload.protocolVersion === '1.0';
    const idempotencyKey = isVersionedEnvelope && typeof storedPayload.idempotencyKey === 'string' && storedPayload.idempotencyKey.trim()
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
    const expiresAt = isVersionedEnvelope && typeof storedPayload.expiresAt === 'string'
      ? new Date(storedPayload.expiresAt)
      : new Date(action.createdAt.getTime() + 15 * 60_000);
    if (Number.isNaN(expiresAt.getTime()) || Date.now() > expiresAt.getTime()) {
      await this.prisma.brainActionConfirmation.update({
        where: { actionId: action.actionId },
        data: { status: 'expired', result: { execution: 'confirmation_expired' } },
      });
      return { actionId: action.actionId, status: 'expired' };
    }

    const { approval, validation } = await this.validateApprovedAction(action, input);

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
        ? { actionId: action.actionId, executionId: concurrent.id, status: concurrent.status, receipt: concurrent.receiptPayload, duplicated: true }
        : { actionId: action.actionId, status: 'executing', duplicated: true };
    }

    await this.recordExecutionTrace({
      runId: action.runId,
      actionId: action.actionId,
      capabilityKey: action.skillKey,
      executionId: claimed.id,
      status: 'executing',
    });

    return this.executeClaimedAction({
      action,
      executionId: claimed.id,
      payload: validation.payload,
      permissions: input.permissions,
      idempotencyKey: approval.idempotencyKey,
    });
  }

  async retryFailedExecution(input: {
    actionId: string;
    runId: number;
    userId: number;
    storeId: number;
    permissions: string[];
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
    if (this.failureRecovery(action.skillKey) !== 'safe_replay') {
      return this.existingExecutionResult(action, existing);
    }

    const storedPayload = this.asRecord(action.payload);
    const expiresAt = typeof storedPayload.expiresAt === 'string'
      ? new Date(storedPayload.expiresAt)
      : new Date(action.createdAt.getTime() + 15 * 60_000);
    if (Number.isNaN(expiresAt.getTime()) || Date.now() > expiresAt.getTime()) {
      await this.prisma.brainActionConfirmation.update({
        where: { actionId: action.actionId },
        data: { status: 'expired', result: { execution: 'retry_confirmation_expired' } },
      });
      return { actionId: action.actionId, executionId: existing.id, status: 'expired', retryable: false };
    }

    const { approval, validation } = await this.validateApprovedAction(action, input);
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
    });
    return this.executeClaimedAction({
      action,
      executionId: existing.id,
      payload: validation.payload,
      permissions: input.permissions,
      idempotencyKey: approval.idempotencyKey,
      retried: true,
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
      userId: number;
      storeId: number;
      skillKey: string;
      riskLevel: BrainRiskLevel;
      payload: Prisma.JsonValue;
      createdAt: Date;
    },
    input: { userId: number; storeId: number; permissions: string[] },
  ) {
    if (!this.capabilityGateway) throw new Error('capability_gateway_unavailable');
    const descriptor = this.capabilityGateway.resolve(action.skillKey);
    const approval = this.approvalEnvelope(action, descriptor.version);
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
    await this.targetResolver?.revalidateCapabilityTarget({
      capabilityKey: approval.capabilityKey,
      storeId: input.storeId,
      args: validation.payload,
      idempotencyKey: approval.idempotencyKey,
    });
    return { approval, validation };
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
  }) {
    if (!this.capabilityGateway) throw new Error('capability_gateway_unavailable');
    const action = input.action;
    try {
      const receipt = await this.capabilityGateway.execute({
        skillKey: action.skillKey,
        payload: input.payload,
        context: {
          userId: action.userId,
          storeId: action.storeId,
          permissions: input.permissions,
          idempotencyKey: input.idempotencyKey,
        },
      });
      const executionStatus = receipt.status === 'partially_succeeded' ? 'partially_succeeded' : 'succeeded';
      await this.prisma.brainActionExecution.update({
        where: { id: input.executionId },
        data: {
          status: executionStatus,
          receiptPayload: receipt as unknown as Prisma.InputJsonValue,
          businessObjectType: receipt.businessObjectType,
          businessObjectId: String(receipt.businessObjectId),
          errorCode: null,
          errorMessage: null,
          completedAt: new Date(),
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
    return {
      actionId: action.actionId,
      executionId: execution.id,
      status: execution.status,
      receipt: execution.receiptPayload,
      ...(duplicated ? { duplicated: true } : {}),
      ...(execution.status === 'failed'
        ? {
            retryable: recovery === 'safe_replay',
            recovery,
            error: {
              code: execution.errorCode ?? 'capability_execution_failed',
              message: execution.errorMessage ?? '动作执行失败，请按恢复策略处理。',
            },
          }
        : {}),
    };
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
        message: typeof result.message === 'string'
          ? result.message
          : '动作状态缺少执行记录，请核对后台业务单据。',
      },
    };
  }

  private failureRecovery(skillKey: string): 'safe_replay' | 'manual_reconcile' {
    const gateway = this.capabilityGateway as unknown as {
      resolve?: (key: string) => { failureRecovery?: 'safe_replay' | 'manual_reconcile' };
    } | undefined;
    const configured = gateway?.resolve?.(skillKey)?.failureRecovery;
    if (configured === 'safe_replay' || configured === 'manual_reconcile') return configured;
    return skillKey === 'reschedule_reservation' || skillKey === 'cancel_reservation'
      ? 'safe_replay'
      : 'manual_reconcile';
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
    },
    fallbackVersion: number,
  ): BrainActionApprovalEnvelope {
    const payload = this.asRecord(action.payload);
    if (payload.protocolVersion !== '1.0') {
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
    const actor = this.asRecord(payload.actor as Prisma.JsonValue);
    const store = this.asRecord(payload.store as Prisma.JsonValue);
    const validatedArgs = this.asRecord(payload.validatedArgs as Prisma.JsonValue);
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
      protocolVersion: '1.0',
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
    };
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

  private toNullableInputJson(value: Prisma.JsonValue | undefined): Prisma.InputJsonValue | Prisma.NullableJsonNullValueInput {
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
  }) {
    if (!this.traceService) return;
    try {
      await this.traceService.recordStep({
        runId: input.runId,
        stepKey: `action_${input.capabilityKey}`,
        layer: 'capability_gateway',
        input: this.toInputJson({ actionId: input.actionId, executionId: input.executionId }),
        output: input.receipt === undefined ? undefined : this.toInputJson(input.receipt),
        error: input.error === undefined ? undefined : this.toInputJson(input.error),
        status: input.status,
      });
    } catch {
      // Trace failure must not repeat or roll back a completed business action.
    }
  }
}
