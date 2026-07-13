import { ForbiddenException, Injectable, Optional } from '@nestjs/common';
import { BrainRiskLevel, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service.js';
import { BrainCapabilityGatewayService } from './brain-capability-gateway.service.js';
import { BrainTraceService } from '../governance/brain-trace.service.js';

@Injectable()
export class BrainActionConfirmationService {
  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly capabilityGateway?: BrainCapabilityGatewayService,
    @Optional() private readonly traceService?: BrainTraceService,
  ) {}

  requiresConfirmation(riskLevel: BrainRiskLevel | 'low' | 'medium' | 'high' | 'critical') {
    return riskLevel === 'high' || riskLevel === 'critical';
  }

  createPreview(input: {
    runId: number;
    userId: number;
    storeId: number;
    skillKey: string;
    riskLevel: BrainRiskLevel;
    preview: Prisma.InputJsonValue;
    payload: Prisma.InputJsonValue;
  }) {
    const actionId = `brain_action_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    return this.prisma.brainActionConfirmation.create({ data: { actionId, ...input } });
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

    const payload = this.asRecord(action.payload);
    const idempotencyKey = typeof payload.idempotencyKey === 'string' && payload.idempotencyKey.trim()
      ? payload.idempotencyKey.trim()
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
      return {
        actionId: action.actionId,
        executionId: existing.id,
        status: existing.status,
        receipt: existing.receiptPayload,
        duplicated: true,
      };
    }

    if (action.status !== 'pending') {
      return { actionId: action.actionId, status: action.status, receipt: action.result, duplicated: true };
    }
    if (Date.now() - action.createdAt.getTime() > 15 * 60_000) {
      await this.prisma.brainActionConfirmation.update({
        where: { actionId: action.actionId },
        data: { status: 'expired', result: { execution: 'confirmation_expired' } },
      });
      return { actionId: action.actionId, status: 'expired' };
    }

    const descriptor = this.capabilityGateway.resolve(action.skillKey);
    if (!input.permissions.includes('*') && !input.permissions.includes(descriptor.permission)) {
      throw new ForbiddenException(`missing_permission:${descriptor.permission}`);
    }

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
          requestPayload: this.toInputJson(payload),
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

    try {
      const receipt = await this.capabilityGateway.execute({
        skillKey: action.skillKey,
        payload,
        context: {
          userId: input.userId,
          storeId: input.storeId,
          permissions: input.permissions,
        },
      });
      await this.prisma.brainActionExecution.update({
        where: { id: claimed.id },
        data: {
          status: 'succeeded',
          receiptPayload: receipt as unknown as Prisma.InputJsonValue,
          businessObjectType: receipt.businessObjectType,
          businessObjectId: String(receipt.businessObjectId),
          completedAt: new Date(),
        },
      });
      await this.prisma.brainActionConfirmation.update({
        where: { actionId: action.actionId },
        data: {
          status: 'succeeded',
          executedAt: new Date(),
          result: receipt as unknown as Prisma.InputJsonValue,
        },
      });
      await this.recordExecutionTrace({
        runId: action.runId,
        actionId: action.actionId,
        capabilityKey: action.skillKey,
        executionId: claimed.id,
        status: 'succeeded',
        receipt,
      });
      return { actionId: action.actionId, executionId: claimed.id, status: 'succeeded', receipt };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'capability_execution_failed';
      const errorCode = message.split(':')[0] || 'capability_execution_failed';
      await this.prisma.brainActionExecution.update({
        where: { id: claimed.id },
        data: { status: 'failed', errorCode, errorMessage: message, completedAt: new Date() },
      });
      await this.prisma.brainActionConfirmation.update({
        where: { actionId: action.actionId },
        data: { status: 'failed', executedAt: new Date(), result: { errorCode, message } },
      });
      await this.recordExecutionTrace({
        runId: action.runId,
        actionId: action.actionId,
        capabilityKey: action.skillKey,
        executionId: claimed.id,
        status: 'failed',
        error: { errorCode, message },
      });
      return { actionId: action.actionId, executionId: claimed.id, status: 'failed', error: { code: errorCode, message } };
    }
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

  private asRecord(value: Prisma.JsonValue): Record<string, unknown> {
    return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
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
