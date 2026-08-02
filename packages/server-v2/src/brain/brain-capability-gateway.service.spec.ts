import { BrainCapabilityGatewayService } from './skills/brain-capability-gateway.service.js';

describe('BrainCapabilityGatewayService', () => {
  it('requires manage permission for high-risk purchase order creation', () => {
    const service = new BrainCapabilityGatewayService();

    expect(service.resolve('create_purchase_order')).toMatchObject({
      permission: 'core:inventory:purchase',
      riskLevel: 'high',
      version: 1,
      effectKeys: ['purchase_order_draft_created_in_context_store'],
    });
  });

  it('uses safe replay for reservation mutations backed by causal mutation receipts', () => {
    const service = new BrainCapabilityGatewayService();

    expect(service.failureRecovery('reschedule_reservation')).toBe('safe_replay');
    expect(service.failureRecovery('cancel_reservation')).toBe('safe_replay');
    expect(service.failureRecovery('create_reservation')).toBe('safe_replay');
    expect(service.failureRecovery('create_purchase_order')).toBe('safe_replay');
    expect(service.failureRecovery('submit_purchase_order_for_approval')).toBe('safe_replay');
    expect(service.failureRecovery('create_customer_followup')).toBe('safe_replay');
    expect(service.failureRecovery('create_marketing_touch_draft')).toBe('safe_replay');
    expect(service.failureRecovery('execute_marketing_strategy')).toBe('safe_replay');
    expect(service.failureRecovery('verify_card_usage')).toBe('safe_replay');
    expect(service.failureRecovery('save_service_record')).toBe('manual_reconcile');
    expect(service.failureRecovery('create_customer')).toBe('safe_replay');
    expect(service.resolve('submit_purchase_order_for_approval')).toMatchObject({
      endpoint: 'inventory/purchase-orders/:id/submit-for-approval',
      method: 'POST',
      permission: 'core:inventory:purchase',
      effectKeys: ['purchase_order_submitted_for_approval'],
    });
  });

  it('creates a customer through CustomersService and forces the current store scope', async () => {
    const customers = { create: jest.fn().mockResolvedValue({ id: 1256, name: '王静怡', storeId: 6 }) };
    const service = new BrainCapabilityGatewayService(
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      customers as never,
    );

    const receipt = await service.execute({
      skillKey: 'create_customer',
      payload: { storeId: 99, name: '王静怡', phone: '13800138807' },
      context: { userId: 9, storeId: 6, permissions: ['core:customer:create'], idempotencyKey: 'customer-1256' },
    });

    expect(customers.create).toHaveBeenCalledWith(
      {
        storeId: 6,
        name: '王静怡',
        phone: '13800138807',
        source: 'Ami Brain',
      },
      { storeId: 6, capabilityKey: 'create_customer', idempotencyKey: 'customer-1256' },
    );
    expect(receipt).toMatchObject({
      capabilityKey: 'create_customer',
      businessObjectType: 'customer',
      businessObjectId: 1256,
      message: '客户档案创建成功。',
    });
  });

  it('refuses to write a masked customer phone after confirmation', async () => {
    const customers = { create: jest.fn() };
    const service = new BrainCapabilityGatewayService(
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      customers as never,
    );

    await expect(
      service.execute({
        skillKey: 'create_customer',
        payload: { name: '王静怡', phone: '138xxxx807' },
        context: { userId: 9, storeId: 6, permissions: ['core:customer:create'] },
      }),
    ).rejects.toThrow('customer_phone_masked_requires_completion');
    expect(customers.create).not.toHaveBeenCalled();
  });

  it('does not report an unrelated existing customer as the result of a create action', async () => {
    const customers = { create: jest.fn() };
    const prisma = {
      customer: { findFirst: jest.fn().mockResolvedValue({ id: 1255, name: '王静怡', phone: '13800138807' }) },
    };
    const service = new BrainCapabilityGatewayService(
      undefined,
      undefined,
      undefined,
      prisma as never,
      undefined,
      undefined,
      customers as never,
    );

    await expect(
      service.execute({
        skillKey: 'create_customer',
        payload: { name: '王静怡', phone: '13800138807' },
        context: { userId: 9, storeId: 6, permissions: ['core:customer:create'] },
      }),
    ).rejects.toThrow('customer_already_exists');
    expect(customers.create).not.toHaveBeenCalled();
  });

  it('canonicalizes approved arguments and rejects model confirmation claims', () => {
    const service = new BrainCapabilityGatewayService();

    expect(
      service.validateForExecution('create_reservation', 1, {
        customerId: 11,
        projectId: 22,
        appointmentTime: '2026-07-12T10:00:00+08:00',
        roleHint: 'finance',
        sourceMessage: '帮我预约',
      }).payload,
    ).toEqual({
      customerId: 11,
      projectId: 22,
      appointmentTime: '2026-07-12T10:00:00+08:00',
    });
    expect(() =>
      service.validateForExecution('create_reservation', 1, {
        customerId: 11,
        projectId: 22,
        appointmentTime: '2026-07-12T10:00:00+08:00',
        nested: { confirmed: true },
      }),
    ).toThrow('model_confirmation_claim_forbidden:confirmed');
  });

  it('executes reservation creation through ReservationsService and forces current store scope', async () => {
    const reservations = { create: jest.fn().mockResolvedValue({ id: 101, storeId: 6, status: 'pending' }) };
    const service = new BrainCapabilityGatewayService(reservations as never, undefined, undefined, undefined);

    const receipt = await service.execute({
      skillKey: 'create_reservation',
      payload: { storeId: 99, customerId: 11, projectId: 22, appointmentTime: '2026-07-12T10:00:00+08:00' },
      context: {
        userId: 9,
        storeId: 6,
        permissions: ['core:store:reservations'],
        idempotencyKey: 'brain-reservation-101',
      },
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
    expect(receipt).toMatchObject({
      capabilityKey: 'create_reservation',
      businessObjectType: 'reservation',
      businessObjectId: 101,
    });
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

  it('propagates the transactionally persisted mutation receipt for a governed reschedule', async () => {
    const mutationReceipt = {
      schemaVersion: '1.0',
      receiptFingerprint: 'a'.repeat(64),
      capabilityKey: 'reschedule_reservation',
      idempotencyKeyFingerprint: 'b'.repeat(64),
      businessObjectType: 'reservation',
      businessObjectId: '101',
      storeId: 6,
      mutationKind: 'update',
      requestFingerprint: 'c'.repeat(64),
      before: { version: '2026-07-30T10:00:00.000Z', stateFingerprint: 'd'.repeat(64) },
      after: { version: '2026-07-30T10:01:00.000Z', stateFingerprint: 'e'.repeat(64) },
      changedFields: ['startTime'],
      committedAt: '2026-07-30T10:01:00.000Z',
    };
    const reservations = {
      findById: jest.fn().mockResolvedValue({ id: 101, storeId: 6, status: 'confirmed' }),
      update: jest.fn().mockResolvedValue({ id: 101, storeId: 6, mutationReceipt }),
    };
    const service = new BrainCapabilityGatewayService(reservations as never, undefined, undefined, undefined);
    const payload = {
      reservationId: 101,
      appointmentTime: '2026-08-01 16:00:00',
      expectedReservationUpdatedAt: '2026-07-30T10:00:00.000Z',
    };

    const receipt = await service.execute({
      skillKey: 'reschedule_reservation',
      payload,
      context: {
        userId: 9,
        storeId: 6,
        permissions: ['core:store:reservations'],
        idempotencyKey: 'reschedule-101',
      },
    });

    expect(reservations.update).toHaveBeenCalledWith(
      101,
      expect.objectContaining({
        expectedUpdatedAt: payload.expectedReservationUpdatedAt,
        mutationContext: expect.objectContaining({
          capabilityKey: 'reschedule_reservation',
          idempotencyKey: 'reschedule-101',
          requestPayload: payload,
        }),
      }),
    );
    expect(receipt).toMatchObject({ mutationReceipt });
  });

  it('does not attribute an already-cancelled reservation without a versioned mutation receipt', async () => {
    const reservations = {
      findById: jest.fn().mockResolvedValue({ id: 101, storeId: 6, status: 'cancelled' }),
      cancel: jest.fn(),
    };
    const service = new BrainCapabilityGatewayService(reservations as never, undefined, undefined, undefined);

    await expect(
      service.execute({
        skillKey: 'cancel_reservation',
        payload: { reservationId: 101, reason: '客户改期' },
        context: {
          userId: 9,
          storeId: 6,
          permissions: ['core:store:reservations'],
          idempotencyKey: 'cancel-101',
        },
      }),
    ).rejects.toThrow('invalid_non_empty_string:expectedReservationUpdatedAt');

    expect(reservations.cancel).not.toHaveBeenCalled();
  });

  it('uses optimistic concurrency for governed cancellation even when another actor already cancelled it', async () => {
    const reservations = {
      findById: jest.fn().mockResolvedValue({ id: 101, storeId: 6, status: 'cancelled' }),
      cancel: jest.fn().mockRejectedValue(new Error('预约已发生变化，请重新确认后再操作')),
    };
    const service = new BrainCapabilityGatewayService(reservations as never, undefined, undefined, undefined);

    await expect(
      service.execute({
        skillKey: 'cancel_reservation',
        payload: {
          reservationId: 101,
          reason: '客户取消',
          expectedReservationUpdatedAt: '2026-07-30T10:00:00.000Z',
        },
        context: {
          userId: 9,
          storeId: 6,
          permissions: ['core:store:reservations'],
          idempotencyKey: 'cancel-101',
        },
      }),
    ).rejects.toThrow('预约已发生变化，请重新确认后再操作');
    expect(reservations.cancel).toHaveBeenCalledWith(
      101,
      '客户取消',
      '2026-07-30T10:00:00.000Z',
      expect.objectContaining({
        capabilityKey: 'cancel_reservation',
        idempotencyKey: 'cancel-101',
        mutationKind: 'state_transition',
      }),
    );
  });

  it('creates only a purchase draft through InventoryService', async () => {
    const inventory = {
      createPurchaseOrder: jest.fn().mockResolvedValue({ id: 88, orderNo: 'PUR88', status: '草稿' }),
    };
    const prisma = {
      product: { count: jest.fn().mockResolvedValue(1) },
    };
    const service = new BrainCapabilityGatewayService(undefined, inventory as never, undefined, prisma as never);

    const receipt = await service.execute({
      skillKey: 'create_purchase_order',
      payload: {
        supplier: '供应商A',
        items: [{ productId: 1, productName: '精华液', sku: 'SKU1', quantity: 10, unitPrice: 20 }],
      },
      context: {
        userId: 9,
        storeId: 6,
        permissions: ['core:inventory:purchase'],
        idempotencyKey: 'purchase-action-88',
      },
    });

    expect(inventory.createPurchaseOrder).toHaveBeenCalledWith(
      expect.objectContaining({
        storeId: 6,
        status: '草稿',
        source: 'ami_brain',
        idempotencyKey: 'purchase-action-88',
      }),
    );
    expect(receipt).toMatchObject({ businessObjectType: 'purchase_order', businessObjectId: 88 });
  });

  it('rejects approval fields on creation and submits an existing draft through the independent capability', async () => {
    const mutationReceipt = { receiptFingerprint: 'a'.repeat(64) };
    const inventory = {
      createPurchaseOrder: jest.fn(),
      submitPurchaseOrderForApproval: jest.fn().mockResolvedValue({
        id: 88,
        orderNo: 'PUR88',
        status: '待审核',
        mutationReceipt,
      }),
    };
    const service = new BrainCapabilityGatewayService(undefined, inventory as never);
    const context = {
      userId: 9,
      storeId: 6,
      permissions: ['core:inventory:purchase'],
      idempotencyKey: 'purchase-submit-88',
    };

    await expect(
      service.execute({
        skillKey: 'create_purchase_order',
        payload: {
          supplier: '供应商A',
          submitForApproval: true,
          items: [{ productId: 1, productName: '精华液', sku: 'SKU1', quantity: 10, unitPrice: 20 }],
        },
        context,
      }),
    ).rejects.toThrow('purchase_order_submission_requires_separate_action');

    const receipt = await service.execute({
      skillKey: 'submit_purchase_order_for_approval',
      payload: { purchaseOrderId: 88, expectedPurchaseOrderUpdatedAt: '2026-07-30T10:00:00.000Z' },
      context,
    });

    expect(inventory.submitPurchaseOrderForApproval).toHaveBeenCalledWith(
      88,
      6,
      '2026-07-30T10:00:00.000Z',
      expect.objectContaining({
        capabilityKey: 'submit_purchase_order_for_approval',
        idempotencyKey: 'purchase-submit-88',
        mutationKind: 'state_transition',
      }),
    );
    expect(receipt).toMatchObject({
      capabilityKey: 'submit_purchase_order_for_approval',
      businessObjectType: 'purchase_order',
      businessObjectId: 88,
      mutationReceipt,
    });
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

    expect(terminal.createFollowUpTask).toHaveBeenNthCalledWith(
      1,
      6,
      undefined,
      expect.objectContaining({
        customerId: 11,
        source: 'brain_followup',
        idempotencyKey: 'follow-up-action-31',
      }),
      9,
    );
    expect(terminal.createFollowUpTask).toHaveBeenNthCalledWith(
      2,
      6,
      undefined,
      expect.objectContaining({
        customerId: 11,
        source: 'brain_marketing_touch_draft',
        idempotencyKey: 'follow-up-action-31',
      }),
      9,
    );
    expect(followup.businessObjectId).toBe(31);
    expect(touch.businessObjectId).toBe(32);
  });

  it('executes an approved marketing strategy through the existing idempotent business service', async () => {
    const marketing = {
      previewAudience: jest.fn().mockResolvedValue({ estimatedReachedCount: 18 }),
      executeStrategy: jest
        .fn()
        .mockResolvedValue({ id: 91, status: 'pending', queuedCount: 18, reachedCount: 0, failedCount: 0 }),
    };
    const service = new BrainCapabilityGatewayService(
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      marketing as never,
    );

    const receipt = await service.execute({
      skillKey: 'execute_marketing_strategy',
      payload: { strategyId: 12, strategyName: '沉睡客户唤醒', approvedAudienceCount: 20 },
      context: {
        userId: 9,
        storeId: 6,
        permissions: ['core:marketing:update'],
        idempotencyKey: 'brain-marketing-execution-91',
      },
    });

    expect(service.resolve('execute_marketing_strategy')).toMatchObject({
      permission: 'core:marketing:update',
      riskLevel: 'high',
      failureRecovery: 'safe_replay',
      effectKeys: ['marketing_automation_execution_created'],
    });
    expect(marketing.previewAudience).toHaveBeenCalledWith([], 'AND', 12, 6);
    expect(marketing.executeStrategy).toHaveBeenCalledWith(12, 6, 'brain-marketing-execution-91');
    expect(receipt).toMatchObject({
      capabilityKey: 'execute_marketing_strategy',
      businessObjectType: 'marketing_automation_execution',
      businessObjectId: 91,
      status: 'executing',
      message: '自动触达执行已进入队列，待发送 18 人。',
    });
  });

  it('requires reapproval when the live marketing audience grows materially', async () => {
    const marketing = {
      previewAudience: jest.fn().mockResolvedValue({ estimatedReachedCount: 31 }),
      executeStrategy: jest.fn(),
    };
    const service = new BrainCapabilityGatewayService(
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      marketing as never,
    );

    await expect(
      service.execute({
        skillKey: 'execute_marketing_strategy',
        payload: { strategyId: 12, approvedAudienceCount: 10 },
        context: {
          userId: 9,
          storeId: 6,
          permissions: ['core:marketing:update'],
          idempotencyKey: 'brain-marketing-execution-92',
        },
      }),
    ).rejects.toThrow('marketing_audience_changed_reapproval_required');
    expect(marketing.executeStrategy).not.toHaveBeenCalled();
  });

  it('saves an in-progress service record through TerminalService after store validation', async () => {
    const terminal = {
      getTaskById: jest.fn().mockResolvedValue({ id: 41, storeId: 6, status: 'in_progress' }),
      completeTask: jest.fn().mockResolvedValue({ id: 41, storeId: 6, status: 'completed' }),
    };
    const prisma = {
      serviceTask: { findFirst: jest.fn().mockResolvedValue({ id: 41 }) },
    };
    const service = new BrainCapabilityGatewayService(undefined, undefined, terminal as never, prisma as never);

    const receipt = await service.execute({
      skillKey: 'save_service_record',
      payload: { taskId: 41, remark: '客户肤况稳定', consumptionItems: [] },
      context: { userId: 9, storeId: 6, permissions: ['aura:service-record:create'] },
    });

    expect(prisma.serviceTask.findFirst).toHaveBeenCalledWith({
      where: {
        id: 41,
        storeId: 6,
        beautician: { userId: 9 },
        status: { in: ['pending', 'in_progress'] },
      },
      select: { id: true },
    });
    expect(terminal.completeTask).toHaveBeenCalledWith(41, expect.objectContaining({ remark: '客户肤况稳定' }));
    expect(receipt).toMatchObject({ businessObjectType: 'service_task', businessObjectId: 41 });
  });

  it('rejects completing a service record owned by another beautician', async () => {
    const terminal = { getTaskById: jest.fn(), completeTask: jest.fn() };
    const prisma = { serviceTask: { findFirst: jest.fn().mockResolvedValue(null) } };
    const service = new BrainCapabilityGatewayService(undefined, undefined, terminal as never, prisma as never);

    await expect(
      service.execute({
        skillKey: 'save_service_record',
        payload: { taskId: 41, remark: '客户肤况稳定' },
        context: { userId: 10, storeId: 6, permissions: ['aura:service-record:create'] },
      }),
    ).rejects.toThrow('service_task_not_owned_or_active');
    expect(terminal.completeTask).not.toHaveBeenCalled();
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

    expect(service.resolve('verify_card_usage')).toMatchObject({
      riskLevel: 'critical',
      permission: 'core:order:card-usage',
    });
    expect(cards.verifyCardUsage).toHaveBeenCalledWith(
      expect.objectContaining({
        customerCardId: 66,
        customerId: 10,
        projectId: 101,
        times: 1,
        beauticianId: 2,
        operatorId: 9,
        idempotencyKey: 'brain-action-71',
      }),
    );
    expect(receipt).toMatchObject({
      capabilityKey: 'verify_card_usage',
      businessObjectType: 'card_usage_record',
      businessObjectId: 71,
      message: '次卡核销成功，核销后剩余 3 次。',
    });
  });
});
