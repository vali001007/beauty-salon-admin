import { BadRequestException, ForbiddenException, Injectable, Optional } from '@nestjs/common';
import type { BrainRiskLevel } from '@prisma/client';
import { CardsService } from '../../cards/cards.service.js';
import { InventoryService } from '../../inventory/inventory.service.js';
import { MarketingService } from '../../marketing/marketing.service.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { ReservationsService } from '../../reservations/reservations.service.js';
import { TerminalService } from '../../terminal/terminal.service.js';

export interface BrainCapabilityContext {
  userId: number;
  storeId: number;
  permissions: string[];
  idempotencyKey?: string;
}

export interface BrainCapabilityReceipt {
  capabilityKey: string;
  businessObjectType: string;
  businessObjectId: number | string;
  result: unknown;
  status?: 'executing' | 'succeeded' | 'partially_succeeded' | 'failed';
  message?: string;
}

export interface BrainCapabilityDescriptor {
  key: string;
  version: number;
  endpoint: string;
  method: 'POST' | 'PUT' | 'PATCH';
  permission: string;
  riskLevel: BrainRiskLevel;
  requiredFields: string[];
  allowedFields: string[];
  transactionBoundary: string;
  receiptType: string;
  failureRecovery: 'safe_replay' | 'manual_reconcile';
}

const CAPABILITY_MAP: Record<string, BrainCapabilityDescriptor> = {
  create_reservation: {
    key: 'create_reservation',
    version: 1,
    endpoint: 'reservations',
    method: 'POST',
    permission: 'core:store:reservations',
    riskLevel: 'medium',
    requiredFields: ['customerId', 'projectId', 'appointmentTime'],
    allowedFields: ['customerId', 'projectId', 'appointmentTime', 'duration', 'beauticianId', 'remark'],
    transactionBoundary: 'ReservationsService.create',
    receiptType: 'reservation',
    failureRecovery: 'safe_replay',
  },
  reschedule_reservation: {
    key: 'reschedule_reservation',
    version: 1,
    endpoint: 'reservations/:id',
    method: 'PATCH',
    permission: 'core:store:reservations',
    riskLevel: 'high',
    requiredFields: ['reservationId', 'appointmentTime'],
    allowedFields: ['reservationId', 'appointmentTime', 'duration', 'beauticianId', 'reason', 'remark'],
    transactionBoundary: 'ReservationsService.update',
    receiptType: 'reservation',
    failureRecovery: 'safe_replay',
  },
  cancel_reservation: {
    key: 'cancel_reservation',
    version: 1,
    endpoint: 'reservations/:id/cancel',
    method: 'POST',
    permission: 'core:store:reservations',
    riskLevel: 'high',
    requiredFields: ['reservationId'],
    allowedFields: ['reservationId', 'reason'],
    transactionBoundary: 'ReservationsService.cancel',
    receiptType: 'reservation',
    failureRecovery: 'safe_replay',
  },
  create_customer_followup: {
    key: 'create_customer_followup',
    version: 1,
    endpoint: 'marketing/follow-up-tasks',
    method: 'POST',
    permission: 'assist:followup:create',
    riskLevel: 'medium',
    requiredFields: ['customerId'],
    allowedFields: ['customerId', 'title', 'note', 'script', 'channel'],
    transactionBoundary: 'TerminalService.createFollowUpTask:idempotent',
    receiptType: 'follow_up_task',
    failureRecovery: 'safe_replay',
  },
  create_purchase_order: {
    key: 'create_purchase_order',
    version: 1,
    endpoint: 'inventory/purchase-orders',
    method: 'POST',
    permission: 'core:supply:manage',
    riskLevel: 'high',
    requiredFields: ['supplier', 'items'],
    allowedFields: ['supplier', 'items', 'submitForApproval'],
    transactionBoundary: 'InventoryService.createPurchaseOrderIdempotent',
    receiptType: 'purchase_order',
    failureRecovery: 'safe_replay',
  },
  create_marketing_touch_draft: {
    key: 'create_marketing_touch_draft',
    version: 1,
    endpoint: 'marketing/follow-up-tasks',
    method: 'POST',
    permission: 'core:marketing:create',
    riskLevel: 'medium',
    requiredFields: ['customerId', 'script'],
    allowedFields: ['customerId', 'title', 'note', 'script', 'channel'],
    transactionBoundary: 'TerminalService.createFollowUpTask:idempotent',
    receiptType: 'marketing_touch_draft',
    failureRecovery: 'safe_replay',
  },
  execute_marketing_strategy: {
    key: 'execute_marketing_strategy',
    version: 1,
    endpoint: 'marketing/automation/strategies/:id/execute',
    method: 'POST',
    permission: 'core:marketing:update',
    riskLevel: 'high',
    requiredFields: ['strategyId', 'approvedAudienceCount'],
    allowedFields: ['strategyId', 'strategyName', 'approvedAudienceCount'],
    transactionBoundary: 'MarketingService.executeStrategy:idempotent',
    receiptType: 'marketing_automation_execution',
    failureRecovery: 'safe_replay',
  },
  save_service_record: {
    key: 'save_service_record',
    version: 1,
    endpoint: 'terminal/tasks/:id/complete',
    method: 'POST',
    permission: 'aura:service-record:create',
    riskLevel: 'high',
    requiredFields: ['taskId', 'remark'],
    allowedFields: ['taskId', 'remark', 'consumptionItems', 'images', 'beauticianId'],
    transactionBoundary: 'TerminalService.completeTask',
    receiptType: 'service_task',
    failureRecovery: 'manual_reconcile',
  },
  verify_card_usage: {
    key: 'verify_card_usage',
    version: 1,
    endpoint: 'cards/verify-usage',
    method: 'POST',
    permission: 'core:order:card-usage',
    riskLevel: 'critical',
    requiredFields: ['customerCardId', 'customerId', 'projectId', 'projectName', 'times', 'beauticianId'],
    allowedFields: ['customerCardId', 'customerId', 'projectId', 'projectName', 'times', 'beauticianId', 'remark'],
    transactionBoundary: 'CardsService.verifyCardUsage',
    receiptType: 'card_usage_record',
    failureRecovery: 'safe_replay',
  },
};

@Injectable()
export class BrainCapabilityGatewayService {
  constructor(
    @Optional() private readonly reservationsService?: ReservationsService,
    @Optional() private readonly inventoryService?: InventoryService,
    @Optional() private readonly terminalService?: TerminalService,
    @Optional() private readonly prisma?: PrismaService,
    @Optional() private readonly cardsService?: CardsService,
    @Optional() private readonly marketingService?: MarketingService,
  ) {}

  resolve(skillKey: string) {
    const capability = CAPABILITY_MAP[skillKey];
    if (!capability) throw new Error(`unsupported_capability:${skillKey}`);
    return capability;
  }

  failureRecovery(skillKey: string) {
    return this.resolve(skillKey).failureRecovery;
  }

  async execute(input: {
    skillKey: string;
    payload: unknown;
    context: BrainCapabilityContext;
  }): Promise<BrainCapabilityReceipt> {
    const descriptor = this.resolve(input.skillKey);
    this.assertPermission(descriptor.permission, input.context.permissions);
    const payload = this.validateForExecution(input.skillKey, descriptor.version, input.payload).payload;

    switch (input.skillKey) {
      case 'create_reservation':
        return this.createReservation(payload, input.context);
      case 'reschedule_reservation':
        return this.rescheduleReservation(payload, input.context);
      case 'cancel_reservation':
        return this.cancelReservation(payload, input.context);
      case 'create_customer_followup':
        return this.createFollowUp(payload, input.context, 'brain_followup');
      case 'create_purchase_order':
        return this.createPurchaseOrder(payload, input.context);
      case 'create_marketing_touch_draft':
        return this.createFollowUp(payload, input.context, 'brain_marketing_touch_draft');
      case 'execute_marketing_strategy':
        return this.executeMarketingStrategy(payload, input.context);
      case 'save_service_record':
        return this.saveServiceRecord(payload, input.context);
      case 'verify_card_usage':
        return this.verifyCardUsage(payload, input.context);
      default:
        throw new BadRequestException(`unsupported_capability:${input.skillKey}`);
    }
  }

  validateForExecution(skillKey: string, version: number, value: unknown) {
    const descriptor = this.resolve(skillKey);
    if (descriptor.version !== version) throw new BadRequestException(`capability_version_mismatch:${skillKey}@${version}`);
    this.assertNoConfirmationClaim(value);
    return { descriptor, payload: this.validatePayload(descriptor, value) };
  }

  private async createReservation(payload: Record<string, unknown>, context: BrainCapabilityContext) {
    const service = this.requireService(this.reservationsService, 'ReservationsService');
    const result = await service.create({
      ...payload,
      storeId: context.storeId,
      status: 'pending',
      bookingSource: 'ami_brain',
      idempotencyKey: context.idempotencyKey,
    });
    return this.receipt('create_reservation', 'reservation', result.id, result);
  }

  private async rescheduleReservation(payload: Record<string, unknown>, context: BrainCapabilityContext) {
    const service = this.requireService(this.reservationsService, 'ReservationsService');
    const reservationId = this.positiveInteger(payload.reservationId, 'reservationId');
    const current = await service.findById(reservationId);
    this.assertStore(current.storeId, context.storeId);
    const result = await service.update(reservationId, {
      appointmentTime: this.nonEmptyString(payload.appointmentTime, 'appointmentTime'),
      duration: payload.duration,
      beauticianId: payload.beauticianId,
      remark: payload.reason ?? payload.remark,
    });
    return this.receipt('reschedule_reservation', 'reservation', result.id, result);
  }

  private async cancelReservation(payload: Record<string, unknown>, context: BrainCapabilityContext) {
    const service = this.requireService(this.reservationsService, 'ReservationsService');
    const reservationId = this.positiveInteger(payload.reservationId, 'reservationId');
    const current = await service.findById(reservationId);
    this.assertStore(current.storeId, context.storeId);
    if (current.status === 'cancelled' || current.status === 'canceled' || current.status === '已取消') {
      return this.receipt('cancel_reservation', 'reservation', current.id, current);
    }
    const result = await service.cancel(reservationId, typeof payload.reason === 'string' ? payload.reason : undefined);
    return this.receipt('cancel_reservation', 'reservation', result.id, result);
  }

  private async createFollowUp(payload: Record<string, unknown>, context: BrainCapabilityContext, source: string) {
    const service = this.requireService(this.terminalService, 'TerminalService');
    const customerId = this.positiveInteger(payload.customerId, 'customerId');
    const result = await service.createFollowUpTask(
      context.storeId,
      undefined,
      {
        ...payload,
        customerId,
        idempotencyKey: context.idempotencyKey,
        source,
        title: typeof payload.title === 'string' ? payload.title : source === 'brain_followup' ? 'Ami Brain 客户跟进' : 'Ami Brain 营销触达草稿',
        note: typeof payload.note === 'string' ? payload.note : undefined,
        script: typeof payload.script === 'string' ? payload.script : undefined,
        channel: typeof payload.channel === 'string' ? payload.channel : 'phone',
      },
      context.userId,
    );
    return this.receipt(
      source === 'brain_followup' ? 'create_customer_followup' : 'create_marketing_touch_draft',
      source === 'brain_followup' ? 'follow_up_task' : 'marketing_touch_draft',
      result.id,
      result,
    );
  }

  private async createPurchaseOrder(payload: Record<string, unknown>, context: BrainCapabilityContext) {
    const service = this.requireService(this.inventoryService, 'InventoryService');
    const items = this.purchaseItems(payload.items);
    if (this.prisma) {
      const productIds = [...new Set(items.map((item) => item.productId))];
      const matched = await this.prisma.product.count({
        where: { id: { in: productIds }, storeId: context.storeId, deletedAt: null },
      });
      if (matched !== productIds.length) throw new ForbiddenException('cross_store_purchase_product');
    }
    const result = await service.createPurchaseOrder({
      ...payload,
      supplier: this.nonEmptyString(payload.supplier, 'supplier'),
      storeId: context.storeId,
      status: payload.submitForApproval === true ? '待审核' : '草稿',
      source: 'ami_brain',
      idempotencyKey: context.idempotencyKey,
      items,
    });
    return this.receipt('create_purchase_order', 'purchase_order', result.id, result);
  }

  private async executeMarketingStrategy(payload: Record<string, unknown>, context: BrainCapabilityContext) {
    const service = this.requireService(this.marketingService, 'MarketingService');
    const strategyId = this.positiveInteger(payload.strategyId, 'strategyId');
    const approvedAudienceCount = this.nonNegativeInteger(payload.approvedAudienceCount, 'approvedAudienceCount');
    const preview = await service.previewAudience([], 'AND', strategyId, context.storeId) as Record<string, unknown>;
    const currentAudienceCount = this.nonNegativeInteger(
      preview.estimatedReachedCount ?? preview.estimatedCount ?? preview.total ?? 0,
      'currentAudienceCount',
    );
    const allowedGrowth = Math.max(10, Math.ceil(approvedAudienceCount * 0.2));
    if (currentAudienceCount > approvedAudienceCount + allowedGrowth) {
      throw new BadRequestException('marketing_audience_changed_reapproval_required');
    }
    const idempotencyKey = this.nonEmptyString(context.idempotencyKey, 'idempotencyKey');
    const result = await service.executeStrategy(strategyId, context.storeId, idempotencyKey);
    const failedCount = Number((result as Record<string, unknown>).failedCount ?? 0);
    const queuedCount = Number((result as Record<string, unknown>).queuedCount ?? 0);
    const reachedCount = Number((result as Record<string, unknown>).reachedCount ?? 0);
    const status = String((result as Record<string, unknown>).status ?? 'pending');
    const receiptStatus: BrainCapabilityReceipt['status'] =
      status === 'pending' || status === 'running'
        ? 'executing'
        : status === 'partial_failed'
          ? 'partially_succeeded'
          : status === 'failed'
            ? 'failed'
            : 'succeeded';
    return this.receipt(
      'execute_marketing_strategy',
      'marketing_automation_execution',
      (result as Record<string, unknown>).id as number | string,
      result,
      status === 'pending'
        ? `自动触达执行已进入队列，待发送 ${queuedCount} 人。`
        : `自动触达执行完成，已触达 ${reachedCount} 人，失败 ${failedCount} 人。`,
      receiptStatus,
    );
  }

  private async saveServiceRecord(payload: Record<string, unknown>, context: BrainCapabilityContext) {
    const service = this.requireService(this.terminalService, 'TerminalService');
    const prisma = this.requireService(this.prisma, 'PrismaService');
    const taskId = this.positiveInteger(payload.taskId, 'taskId');
    const ownedTask = await prisma.serviceTask.findFirst({
      where: {
        id: taskId,
        storeId: context.storeId,
        beautician: { userId: context.userId },
        status: { in: ['pending', 'in_progress'] },
      },
      select: { id: true },
    });
    if (!ownedTask) throw new ForbiddenException('service_task_not_owned_or_active');
    const current = await service.getTaskById(taskId);
    this.assertStore(current.storeId, context.storeId);
    const result = await service.completeTask(taskId, {
      remark: this.nonEmptyString(payload.remark, 'remark'),
      consumptionItems: Array.isArray(payload.consumptionItems) ? payload.consumptionItems : [],
      images: Array.isArray(payload.images) ? payload.images : undefined,
      beauticianId: payload.beauticianId,
    });
    return this.receipt('save_service_record', 'service_task', result.id, result);
  }

  private async verifyCardUsage(payload: Record<string, unknown>, context: BrainCapabilityContext) {
    const service = this.requireService(this.cardsService, 'CardsService');
    const result = await service.verifyCardUsage({
      customerCardId: this.positiveInteger(payload.customerCardId, 'customerCardId'),
      customerId: this.positiveInteger(payload.customerId, 'customerId'),
      projectId: this.positiveInteger(payload.projectId, 'projectId'),
      projectName: this.nonEmptyString(payload.projectName, 'projectName'),
      times: this.positiveInteger(payload.times, 'times'),
      beauticianId: this.positiveInteger(payload.beauticianId, 'beauticianId'),
      operatorId: context.userId,
      idempotencyKey: context.idempotencyKey,
      remark: typeof payload.remark === 'string' ? payload.remark : 'Ami Brain 确认执行次卡核销',
    });
    return this.receipt(
      'verify_card_usage',
      'card_usage_record',
      result.id,
      result,
      `次卡核销成功，核销后剩余 ${result.remainingTimes} 次。`,
    );
  }

  private validatePayload(descriptor: BrainCapabilityDescriptor, value: unknown) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new BadRequestException('invalid_capability_payload');
    const source = value as Record<string, unknown>;
    const payload = Object.fromEntries(
      descriptor.allowedFields
        .filter((field) => Object.prototype.hasOwnProperty.call(source, field))
        .map((field) => [field, source[field]]),
    );
    const missing = descriptor.requiredFields.filter((field) => payload[field] === undefined || payload[field] === null || payload[field] === '');
    if (missing.length) throw new BadRequestException(`missing_capability_fields:${missing.join(',')}`);
    return payload;
  }

  private nonNegativeInteger(value: unknown, field: string) {
    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed < 0) throw new BadRequestException(`invalid_${field}`);
    return parsed;
  }

  private purchaseItems(value: unknown) {
    if (!Array.isArray(value) || value.length === 0) throw new BadRequestException('purchase_items_required');
    return value.map((raw, index) => {
      if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new BadRequestException(`invalid_purchase_item:${index}`);
      const item = raw as Record<string, unknown>;
      const productId = this.positiveInteger(item.productId, `items.${index}.productId`);
      const quantity = this.positiveNumber(item.quantity, `items.${index}.quantity`);
      const unitPrice = this.nonNegativeNumber(item.unitPrice, `items.${index}.unitPrice`);
      return {
        productId,
        productName: this.nonEmptyString(item.productName, `items.${index}.productName`),
        sku: this.nonEmptyString(item.sku, `items.${index}.sku`),
        quantity,
        unitPrice,
      };
    });
  }

  private assertNoConfirmationClaim(value: unknown, seen = new WeakSet<object>(), depth = 0): void {
    if (value === null || typeof value !== 'object') return;
    if (depth > 12 || seen.has(value as object)) throw new BadRequestException('invalid_capability_payload');
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

  private assertPermission(permission: string, permissions: string[]) {
    if (!permissions.includes('*') && !permissions.includes(permission)) {
      throw new ForbiddenException(`missing_permission:${permission}`);
    }
  }

  private assertStore(actualStoreId: unknown, expectedStoreId: number) {
    if (Number(actualStoreId) !== expectedStoreId) throw new ForbiddenException('cross_store_business_object');
  }

  private positiveInteger(value: unknown, field: string) {
    const number = Number(value);
    if (!Number.isInteger(number) || number <= 0) throw new BadRequestException(`invalid_positive_integer:${field}`);
    return number;
  }

  private positiveNumber(value: unknown, field: string) {
    const number = Number(value);
    if (!Number.isFinite(number) || number <= 0) throw new BadRequestException(`invalid_positive_number:${field}`);
    return number;
  }

  private nonNegativeNumber(value: unknown, field: string) {
    const number = Number(value);
    if (!Number.isFinite(number) || number < 0) throw new BadRequestException(`invalid_non_negative_number:${field}`);
    return number;
  }

  private nonEmptyString(value: unknown, field: string) {
    const text = typeof value === 'string' ? value.trim() : '';
    if (!text) throw new BadRequestException(`invalid_non_empty_string:${field}`);
    return text;
  }

  private requireService<T>(service: T | undefined, name: string): T {
    if (!service) throw new Error(`capability_service_unavailable:${name}`);
    return service;
  }

  private receipt(
    capabilityKey: string,
    businessObjectType: string,
    businessObjectId: number | string,
    result: unknown,
    message?: string,
    status?: BrainCapabilityReceipt['status'],
  ): BrainCapabilityReceipt {
    return {
      capabilityKey,
      businessObjectType,
      businessObjectId,
      result,
      ...(message ? { message } : {}),
      ...(status ? { status } : {}),
    };
  }
}
