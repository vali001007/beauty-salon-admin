import { BadRequestException, ForbiddenException, Injectable, Optional } from '@nestjs/common';
import type { BrainRiskLevel } from '@prisma/client';
import { CardsService } from '../../cards/cards.service.js';
import { InventoryService } from '../../inventory/inventory.service.js';
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
  status?: 'succeeded' | 'partially_succeeded';
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
    failureRecovery: 'manual_reconcile',
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
    transactionBoundary: 'TerminalService.createFollowUpTask',
    receiptType: 'follow_up_task',
    failureRecovery: 'manual_reconcile',
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
    transactionBoundary: 'InventoryService.createPurchaseOrder',
    receiptType: 'purchase_order',
    failureRecovery: 'manual_reconcile',
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
    transactionBoundary: 'TerminalService.createFollowUpTask',
    receiptType: 'marketing_touch_draft',
    failureRecovery: 'manual_reconcile',
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
    const result = await service.create({ ...payload, storeId: context.storeId, status: 'pending' });
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
    const draft = await service.createPurchaseOrder({
      ...payload,
      supplier: this.nonEmptyString(payload.supplier, 'supplier'),
      storeId: context.storeId,
      status: '草稿',
      source: 'ami_brain_confirmed_action',
      items,
    });
    const result = payload.submitForApproval === true
      ? await service.updatePurchaseOrderStatus(draft.id, { status: '待审核' })
      : draft;
    return this.receipt('create_purchase_order', 'purchase_order', result.id, result);
  }

  private async saveServiceRecord(payload: Record<string, unknown>, context: BrainCapabilityContext) {
    const service = this.requireService(this.terminalService, 'TerminalService');
    const taskId = this.positiveInteger(payload.taskId, 'taskId');
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
  ): BrainCapabilityReceipt {
    return { capabilityKey, businessObjectType, businessObjectId, result, ...(message ? { message } : {}) };
  }
}
