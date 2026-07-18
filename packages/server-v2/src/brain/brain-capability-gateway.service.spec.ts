import { BrainCapabilityGatewayService } from './skills/brain-capability-gateway.service.js';

describe('BrainCapabilityGatewayService', () => {
  it('requires manage permission for high-risk purchase order creation', () => {
    const service = new BrainCapabilityGatewayService();

    expect(service.resolve('create_purchase_order')).toMatchObject({
      permission: 'core:supply:manage',
      riskLevel: 'high',
      version: 1,
    });
  });

  it('declares safe replay for every action backed by a business idempotency contract', () => {
    const service = new BrainCapabilityGatewayService();

    expect(service.failureRecovery('reschedule_reservation')).toBe('safe_replay');
    expect(service.failureRecovery('cancel_reservation')).toBe('safe_replay');
    expect(service.failureRecovery('create_reservation')).toBe('safe_replay');
    expect(service.failureRecovery('create_purchase_order')).toBe('safe_replay');
    expect(service.failureRecovery('create_customer_followup')).toBe('safe_replay');
    expect(service.failureRecovery('create_marketing_touch_draft')).toBe('safe_replay');
    expect(service.failureRecovery('verify_card_usage')).toBe('safe_replay');
  });

  it('canonicalizes approved arguments and rejects model confirmation claims', () => {
    const service = new BrainCapabilityGatewayService();

    expect(service.validateForExecution('create_reservation', 1, {
      customerId: 11,
      projectId: 22,
      appointmentTime: '2026-07-12T10:00:00+08:00',
      roleHint: 'finance',
      sourceMessage: '帮我预约',
    }).payload).toEqual({
      customerId: 11,
      projectId: 22,
      appointmentTime: '2026-07-12T10:00:00+08:00',
    });
    expect(() => service.validateForExecution('create_reservation', 1, {
      customerId: 11,
      projectId: 22,
      appointmentTime: '2026-07-12T10:00:00+08:00',
      nested: { confirmed: true },
    })).toThrow('model_confirmation_claim_forbidden:confirmed');
  });

  it('executes reservation creation through ReservationsService and forces current store scope', async () => {
    const reservations = { create: jest.fn().mockResolvedValue({ id: 101, storeId: 6, status: 'pending' }) };
    const service = new BrainCapabilityGatewayService(reservations as never, undefined, undefined, undefined);

    const receipt = await service.execute({
      skillKey: 'create_reservation',
      payload: { storeId: 99, customerId: 11, projectId: 22, appointmentTime: '2026-07-12T10:00:00+08:00' },
      context: { userId: 9, storeId: 6, permissions: ['core:store:reservations'], idempotencyKey: 'brain-reservation-101' },
    });

    expect(reservations.create).toHaveBeenCalledWith(
      expect.objectContaining({
        storeId: 6,
        customerId: 11,
        projectId: 22,
        bookingSource: 'ami_brain',
        idempotencyKey: 'brain-reservation-101',
      }),
    );
    expect(receipt).toMatchObject({ capabilityKey: 'create_reservation', businessObjectType: 'reservation', businessObjectId: 101 });
  });

  it('rejects cross-store reservation updates before invoking the business service', async () => {
    const reservations = {
      findById: jest.fn().mockResolvedValue({ id: 101, storeId: 7 }),
      update: jest.fn(),
    };
    const service = new BrainCapabilityGatewayService(reservations as never, undefined, undefined, undefined);

    await expect(
      service.execute({
        skillKey: 'reschedule_reservation',
        payload: { reservationId: 101, appointmentTime: '2026-07-12T10:00:00+08:00' },
        context: { userId: 9, storeId: 6, permissions: ['core:store:reservations'] },
      }),
    ).rejects.toThrow('cross_store_business_object');
    expect(reservations.update).not.toHaveBeenCalled();
  });

  it('reconciles an already-cancelled reservation without issuing a second cancellation', async () => {
    const reservations = {
      findById: jest.fn().mockResolvedValue({ id: 101, storeId: 6, status: 'cancelled' }),
      cancel: jest.fn(),
    };
    const service = new BrainCapabilityGatewayService(reservations as never, undefined, undefined, undefined);

    const receipt = await service.execute({
      skillKey: 'cancel_reservation',
      payload: { reservationId: 101, reason: '客户改期' },
      context: { userId: 9, storeId: 6, permissions: ['core:store:reservations'] },
    });

    expect(reservations.cancel).not.toHaveBeenCalled();
    expect(receipt).toMatchObject({ capabilityKey: 'cancel_reservation', businessObjectId: 101 });
  });

  it('creates a purchase draft and submits it for approval through InventoryService', async () => {
    const inventory = {
      createPurchaseOrder: jest.fn().mockResolvedValue({ id: 88, orderNo: 'PUR88', status: '草稿' }),
      updatePurchaseOrderStatus: jest.fn(),
    };
    const prisma = {
      product: { count: jest.fn().mockResolvedValue(1) },
    };
    const service = new BrainCapabilityGatewayService(undefined, inventory as never, undefined, prisma as never);

    const receipt = await service.execute({
      skillKey: 'create_purchase_order',
      payload: {
        supplier: '供应商A',
        submitForApproval: true,
        items: [{ productId: 1, productName: '精华液', sku: 'SKU1', quantity: 10, unitPrice: 20 }],
      },
      context: { userId: 9, storeId: 6, permissions: ['core:supply:manage'], idempotencyKey: 'purchase-action-88' },
    });

    expect(inventory.createPurchaseOrder).toHaveBeenCalledWith(expect.objectContaining({
      storeId: 6,
      status: '待审核',
      source: 'ami_brain',
      idempotencyKey: 'purchase-action-88',
    }));
    expect(inventory.updatePurchaseOrderStatus).not.toHaveBeenCalled();
    expect(receipt).toMatchObject({ businessObjectType: 'purchase_order', businessObjectId: 88 });
  });

  it('creates follow-up and marketing-touch drafts through TerminalService', async () => {
    const terminal = {
      createFollowUpTask: jest
        .fn()
        .mockResolvedValueOnce({ id: 31, status: 'pending' })
        .mockResolvedValueOnce({ id: 32, status: 'pending' }),
    };
    const service = new BrainCapabilityGatewayService(undefined, undefined, terminal as never, undefined);
    const context = {
      userId: 9,
      storeId: 6,
      permissions: ['assist:followup:create', 'core:marketing:create'],
      idempotencyKey: 'follow-up-action-31',
    };

    const followup = await service.execute({
      skillKey: 'create_customer_followup',
      payload: { customerId: 11, title: '七天回访', note: '确认护理反馈' },
      context,
    });
    const touch = await service.execute({
      skillKey: 'create_marketing_touch_draft',
      payload: { customerId: 11, title: '召回触达', script: '您好，近期护理节奏可以衔接。' },
      context,
    });

    expect(terminal.createFollowUpTask).toHaveBeenNthCalledWith(1, 6, undefined, expect.objectContaining({
      customerId: 11,
      source: 'brain_followup',
      idempotencyKey: 'follow-up-action-31',
    }), 9);
    expect(terminal.createFollowUpTask).toHaveBeenNthCalledWith(2, 6, undefined, expect.objectContaining({
      customerId: 11,
      source: 'brain_marketing_touch_draft',
      idempotencyKey: 'follow-up-action-31',
    }), 9);
    expect(followup.businessObjectId).toBe(31);
    expect(touch.businessObjectId).toBe(32);
  });

  it('saves an in-progress service record through TerminalService after store validation', async () => {
    const terminal = {
      getTaskById: jest.fn().mockResolvedValue({ id: 41, storeId: 6, status: 'in_progress' }),
      completeTask: jest.fn().mockResolvedValue({ id: 41, storeId: 6, status: 'completed' }),
    };
    const service = new BrainCapabilityGatewayService(undefined, undefined, terminal as never, undefined);

    const receipt = await service.execute({
      skillKey: 'save_service_record',
      payload: { taskId: 41, remark: '客户肤况稳定', consumptionItems: [] },
      context: { userId: 9, storeId: 6, permissions: ['aura:service-record:create'] },
    });

    expect(terminal.completeTask).toHaveBeenCalledWith(41, expect.objectContaining({ remark: '客户肤况稳定' }));
    expect(receipt).toMatchObject({ businessObjectType: 'service_task', businessObjectId: 41 });
  });

  it('executes card usage through CardsService with the current operator and critical permission', async () => {
    const cards = {
      verifyCardUsage: jest.fn().mockResolvedValue({ id: 71, remainingTimes: 3, projectName: '深层补水护理' }),
    };
    const service = new BrainCapabilityGatewayService(undefined, undefined, undefined, undefined, cards as never);

    const receipt = await service.execute({
      skillKey: 'verify_card_usage',
      payload: {
        customerCardId: 66,
        customerId: 10,
        projectId: 101,
        projectName: '深层补水护理',
        times: 1,
        beauticianId: 2,
      },
      context: {
        userId: 9,
        storeId: 6,
        permissions: ['core:order:card-usage'],
        idempotencyKey: 'brain-action-71',
      },
    });

    expect(service.resolve('verify_card_usage')).toMatchObject({ riskLevel: 'critical', permission: 'core:order:card-usage' });
    expect(cards.verifyCardUsage).toHaveBeenCalledWith(expect.objectContaining({
      customerCardId: 66,
      customerId: 10,
      projectId: 101,
      times: 1,
      beauticianId: 2,
      operatorId: 9,
      idempotencyKey: 'brain-action-71',
    }));
    expect(receipt).toMatchObject({
      capabilityKey: 'verify_card_usage',
      businessObjectType: 'card_usage_record',
      businessObjectId: 71,
      message: '次卡核销成功，核销后剩余 3 次。',
    });
  });
});
