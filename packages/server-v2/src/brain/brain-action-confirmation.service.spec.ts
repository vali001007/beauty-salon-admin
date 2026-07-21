import { BrainActionConfirmationService } from './skills/brain-action-confirmation.service.js';

describe('BrainActionConfirmationService', () => {
  it('stores a versioned approval envelope instead of loose model payload', async () => {
    const prisma = {
      brainActionConfirmation: {
        create: jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: 1, ...data })),
      },
    };
    const gateway = {
      validateForExecution: jest.fn().mockReturnValue({
        descriptor: { key: 'create_reservation', version: 2, riskLevel: 'medium' },
        payload: { customerId: 11, projectId: 22, appointmentTime: '2026-07-12T10:00:00+08:00' },
      }),
    };
    const service = new BrainActionConfirmationService(prisma as never, gateway as never);

    await service.createPreview({
      runId: 7,
      userId: 9,
      storeId: 6,
      skillKey: 'create_reservation',
      capabilityVersion: 2,
      riskLevel: 'medium',
      planId: 'plan-7',
      idempotencyKey: 'idem-7',
      preview: { summary: '创建预约' },
      payload: {
        customerId: 11,
        projectId: 22,
        appointmentTime: '2026-07-12T10:00:00+08:00',
        roleHint: 'finance',
      },
    } as never);

    expect(prisma.brainActionConfirmation.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        skillKey: 'create_reservation',
        payload: expect.objectContaining({
          protocolVersion: '1.0',
          capabilityKey: 'create_reservation',
          capabilityVersion: 2,
          validatedArgs: expect.not.objectContaining({ roleHint: expect.anything() }),
          actor: { userId: 9 },
          store: { storeId: 6 },
          riskLevel: 'medium',
          idempotencyKey: 'idem-7',
          planId: 'plan-7',
          argsDigest: expect.stringMatching(/^[a-f0-9]{64}$/),
          expiresAt: expect.any(String),
        }),
      }),
    });
  });

  it('rejects model-authored confirmation claims before a preview is persisted', async () => {
    const prisma = { brainActionConfirmation: { create: jest.fn() } };
    const service = new BrainActionConfirmationService(prisma as never);

    await expect(
      service.createPreview({
        runId: 7,
        userId: 9,
        storeId: 6,
        skillKey: 'create_reservation',
        riskLevel: 'medium',
        preview: { summary: '创建预约' },
        payload: { customerId: 11, projectId: 22, appointmentTime: '2026-07-12', confirmed: true },
      } as never),
    ).rejects.toThrow('model_confirmation_claim_forbidden:confirmed');
    expect(prisma.brainActionConfirmation.create).not.toHaveBeenCalled();
  });

  it('requires confirmation for high-risk actions', () => {
    const service = new BrainActionConfirmationService({} as never);
    expect(service.requiresConfirmation('high')).toBe(true);
    expect(service.requiresConfirmation('critical')).toBe(true);
    expect(service.requiresConfirmation('low')).toBe(false);
  });

  it('restores run action statuses only for the current user and store', async () => {
    const prisma = {
      brainActionConfirmation: {
        findMany: jest.fn().mockResolvedValue([
          { actionId: 'act_pending', skillKey: 'create_reservation', status: 'pending', result: null },
          { actionId: 'act_failed', skillKey: 'reschedule_reservation', status: 'failed', result: null },
        ]),
      },
      brainActionExecution: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 31,
            actionId: 'act_failed',
            status: 'failed',
            receiptPayload: null,
            errorCode: 'upstream_timeout',
            errorMessage: '改约回执超时',
            createdAt: new Date('2026-07-18T10:00:00.000Z'),
          },
        ]),
      },
    };
    const gateway = {
      resolve: jest.fn().mockImplementation((key: string) => ({
        key,
        failureRecovery: key === 'reschedule_reservation' ? 'safe_replay' : 'manual_reconcile',
      })),
    };
    const service = new BrainActionConfirmationService(prisma as never, gateway as never);

    const result = await service.listExecutionStatuses({ runId: 5, userId: 9, storeId: 2 });

    expect(prisma.brainActionConfirmation.findMany).toHaveBeenCalledWith({
      where: { runId: 5, userId: 9, storeId: 2 },
      orderBy: { createdAt: 'asc' },
    });
    expect(prisma.brainActionExecution.findMany).toHaveBeenCalledWith({
      where: { runId: 5, userId: 9, storeId: 2, actionId: { in: ['act_pending', 'act_failed'] } },
      orderBy: { createdAt: 'desc' },
    });
    expect(result).toEqual([
      { actionId: 'act_pending', status: 'pending' },
      {
        actionId: 'act_failed',
        executionId: 31,
        status: 'failed',
        receipt: null,
        retryable: true,
        recovery: 'safe_replay',
        error: { code: 'upstream_timeout', message: '改约回执超时' },
      },
    ]);
  });

  it('reconciles queued marketing execution receipts with the current business status', async () => {
    const confirmation = {
      actionId: 'act_marketing',
      skillKey: 'execute_marketing_strategy',
      status: 'executing',
      result: null,
    };
    const execution = {
      id: 41,
      actionId: 'act_marketing',
      status: 'executing',
      businessObjectType: 'marketing_automation_execution',
      businessObjectId: '91',
      receiptPayload: {
        capabilityKey: 'execute_marketing_strategy',
        businessObjectType: 'marketing_automation_execution',
        businessObjectId: 91,
        result: { id: 91, status: 'pending', queuedCount: 3, reachedCount: 0, failedCount: 0 },
      },
      createdAt: new Date('2026-07-18T10:00:00.000Z'),
    };
    const prisma = {
      brainActionConfirmation: {
        findMany: jest.fn().mockResolvedValue([confirmation]),
        update: jest.fn().mockResolvedValue({}),
      },
      brainActionExecution: {
        findMany: jest.fn().mockResolvedValue([execution]),
        update: jest.fn().mockResolvedValue({}),
      },
      marketingAutomationExecution: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 91,
            storeId: 6,
            status: 'success',
            triggeredCount: 3,
            queuedCount: 3,
            reachedCount: 3,
            failedCount: 0,
            channel: 'in_app',
            executedAt: new Date('2026-07-18T10:00:00.000Z'),
            startedAt: new Date('2026-07-18T10:00:01.000Z'),
            completedAt: new Date('2026-07-18T10:00:02.000Z'),
          },
        ]),
      },
    };
    const gateway = {
      resolve: jest.fn().mockReturnValue({ key: 'execute_marketing_strategy', failureRecovery: 'safe_replay' }),
    };
    const service = new BrainActionConfirmationService(prisma as never, gateway as never);

    const result = await service.listExecutionStatuses({ runId: 5, userId: 9, storeId: 6 });

    expect(prisma.marketingAutomationExecution.findMany).toHaveBeenCalledWith({
      where: { id: { in: [91] }, storeId: 6 },
    });
    expect(prisma.brainActionExecution.update).toHaveBeenCalledWith({
      where: { id: 41 },
      data: expect.objectContaining({ status: 'succeeded', errorCode: null, completedAt: expect.any(Date) }),
    });
    expect(prisma.brainActionConfirmation.update).toHaveBeenCalledWith({
      where: { actionId: 'act_marketing' },
      data: expect.objectContaining({ status: 'succeeded', executedAt: expect.any(Date) }),
    });
    expect(result).toEqual([
      expect.objectContaining({
        actionId: 'act_marketing',
        status: 'succeeded',
        receipt: expect.objectContaining({
          message: '自动触达执行完成：已触达 3 人，失败 0 人。',
          result: expect.objectContaining({ status: 'success', reachedCount: 3 }),
        }),
      }),
    ]);
  });

  it('does not offer safe replay after a marketing delivery batch reaches terminal failure', async () => {
    const prisma = {
      brainActionConfirmation: {
        findMany: jest.fn().mockResolvedValue([
          { actionId: 'act_marketing_failed', skillKey: 'execute_marketing_strategy', status: 'executing', result: null },
        ]),
        update: jest.fn().mockResolvedValue({}),
      },
      brainActionExecution: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 42,
            actionId: 'act_marketing_failed',
            status: 'executing',
            businessObjectType: 'marketing_automation_execution',
            businessObjectId: '92',
            receiptPayload: { result: { id: 92, status: 'pending' } },
            createdAt: new Date(),
          },
        ]),
        update: jest.fn().mockResolvedValue({}),
      },
      marketingAutomationExecution: {
        findMany: jest.fn().mockResolvedValue([
          { id: 92, storeId: 6, status: 'failed', queuedCount: 2, reachedCount: 0, failedCount: 2, channel: 'sms' },
        ]),
      },
    };
    const gateway = {
      resolve: jest.fn().mockReturnValue({ key: 'execute_marketing_strategy', failureRecovery: 'safe_replay' }),
    };
    const service = new BrainActionConfirmationService(prisma as never, gateway as never);

    const result = await service.listExecutionStatuses({ runId: 5, userId: 9, storeId: 6 });

    expect(result[0]).toMatchObject({
      status: 'failed',
      retryable: false,
      recovery: 'manual_reconcile',
      error: { code: 'marketing_automation_execution_failed' },
    });
  });

  it('confirms only a pending action owned by current run, store and user', async () => {
    const prisma = {
      brainActionConfirmation: {
        findFirst: jest.fn().mockResolvedValue({ actionId: 'act_1', status: 'pending' }),
        update: jest.fn().mockResolvedValue({ actionId: 'act_1', status: 'confirmed_preview_only' }),
      },
    };
    const service = new BrainActionConfirmationService(prisma as never);

    const result = await service.confirmPreviewOnly({ actionId: 'act_1', runId: 5, userId: 9, storeId: 2 });

    expect(result).toMatchObject({ actionId: 'act_1', status: 'confirmed_preview_only' });
    expect(prisma.brainActionConfirmation.findFirst).toHaveBeenCalledWith({
      where: {
        actionId: 'act_1',
        runId: 5,
        userId: 9,
        storeId: 2,
        status: 'pending',
      },
    });
    expect(prisma.brainActionConfirmation.update).toHaveBeenCalledWith({
      where: { actionId: 'act_1' },
      data: expect.objectContaining({
        status: 'confirmed_preview_only',
        result: { execution: 'not_connected' },
      }),
    });
  });

  it('rejects only a pending action owned by current run, store and user', async () => {
    const prisma = {
      brainActionConfirmation: {
        findFirst: jest.fn().mockResolvedValue({ actionId: 'act_2', status: 'pending' }),
        update: jest.fn().mockResolvedValue({ actionId: 'act_2', status: 'rejected' }),
      },
    };
    const service = new BrainActionConfirmationService(prisma as never);

    const result = await service.rejectPreview({ actionId: 'act_2', runId: 6, userId: 9, storeId: 2 });

    expect(result).toMatchObject({ actionId: 'act_2', status: 'rejected' });
    expect(prisma.brainActionConfirmation.update).toHaveBeenCalledWith({
      where: { actionId: 'act_2' },
      data: expect.objectContaining({
        status: 'rejected',
        result: { execution: 'user_rejected' },
      }),
    });
  });

  it('claims a pending action once, executes the capability, and persists the receipt', async () => {
    const action = {
      id: 1,
      actionId: 'act_3',
      runId: 7,
      userId: 9,
      storeId: 6,
      skillKey: 'create_reservation',
      riskLevel: 'medium',
      status: 'pending',
      payload: { customerId: 11, projectId: 22, appointmentTime: '2026-07-12T10:00:00+08:00' },
      preview: { summary: '创建预约' },
      createdAt: new Date(),
    };
    const tx = {
      brainActionConfirmation: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
      brainActionExecution: {
        create: jest.fn().mockResolvedValue({ id: 71, status: 'executing', idempotencyKey: 'act_3' }),
      },
    };
    const prisma = {
      brainActionConfirmation: {
        findFirst: jest.fn().mockResolvedValue(action),
        update: jest.fn().mockResolvedValue({ ...action, status: 'succeeded' }),
      },
      brainActionExecution: {
        findUnique: jest.fn().mockResolvedValue(null),
        update: jest.fn().mockResolvedValue({ id: 71, status: 'succeeded' }),
      },
      $transaction: jest.fn((callback: (client: typeof tx) => unknown) => callback(tx)),
    };
    const gateway = {
      resolve: jest.fn().mockReturnValue({ permission: 'core:store:reservations', version: 1, riskLevel: 'medium' }),
      validateForExecution: jest.fn().mockImplementation((_key, _version, payload) => ({
        descriptor: { permission: 'core:store:reservations', version: 1, riskLevel: 'medium' },
        payload,
      })),
      execute: jest.fn().mockResolvedValue({
        capabilityKey: 'create_reservation',
        businessObjectType: 'reservation',
        businessObjectId: 101,
        result: { id: 101 },
      }),
    };
    const trace = { recordStep: jest.fn().mockResolvedValue({ id: 1 }) };
    const service = new BrainActionConfirmationService(prisma as never, gateway as never, trace as never);

    const result = await service.confirmAndExecute({
      actionId: 'act_3',
      runId: 7,
      userId: 9,
      storeId: 6,
      permissions: ['core:store:reservations'],
    });

    expect(gateway.execute).toHaveBeenCalledTimes(1);
    expect(gateway.execute).toHaveBeenCalledWith(expect.objectContaining({
      context: expect.objectContaining({ idempotencyKey: 'act_3' }),
    }));
    expect(tx.brainActionConfirmation.updateMany).toHaveBeenCalledWith({
      where: { actionId: 'act_3', status: 'pending' },
      data: expect.objectContaining({ status: 'executing' }),
    });
    expect(prisma.brainActionExecution.update).toHaveBeenCalledWith({
      where: { id: 71 },
      data: expect.objectContaining({ status: 'succeeded', businessObjectId: '101' }),
    });
    expect(trace.recordStep).toHaveBeenCalledWith(expect.objectContaining({
      stepKey: 'action_create_reservation',
      layer: 'capability_gateway',
      status: 'succeeded',
    }));
    expect(result).toMatchObject({ status: 'succeeded', receipt: { businessObjectId: 101 } });
  });

  it('keeps an asynchronous marketing execution in executing state until business reconciliation', async () => {
    const action = {
      id: 1,
      actionId: 'act_marketing_pending',
      runId: 9,
      userId: 9,
      storeId: 6,
      skillKey: 'execute_marketing_strategy',
      riskLevel: 'high',
      status: 'pending',
      payload: { strategyId: 12, approvedAudienceCount: 3 },
      preview: { summary: '执行营销策略' },
      createdAt: new Date(),
    };
    const tx = {
      brainActionConfirmation: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
      brainActionExecution: { create: jest.fn().mockResolvedValue({ id: 73, status: 'executing' }) },
    };
    const prisma = {
      brainActionConfirmation: {
        findFirst: jest.fn().mockResolvedValue(action),
        update: jest.fn().mockResolvedValue({}),
      },
      brainActionExecution: {
        findUnique: jest.fn().mockResolvedValue(null),
        update: jest.fn().mockResolvedValue({}),
      },
      $transaction: jest.fn((callback: (client: typeof tx) => unknown) => callback(tx)),
    };
    const gateway = {
      resolve: jest.fn().mockReturnValue({ permission: 'core:marketing:update', version: 1, riskLevel: 'high' }),
      validateForExecution: jest.fn().mockImplementation((_key, _version, payload) => ({
        descriptor: { permission: 'core:marketing:update', version: 1, riskLevel: 'high' },
        payload,
      })),
      execute: jest.fn().mockResolvedValue({
        capabilityKey: 'execute_marketing_strategy',
        businessObjectType: 'marketing_automation_execution',
        businessObjectId: 91,
        status: 'executing',
        message: '自动触达执行已进入队列，待发送 3 人。',
        result: { id: 91, status: 'pending', queuedCount: 3 },
      }),
    };
    const service = new BrainActionConfirmationService(prisma as never, gateway as never);

    const result = await service.confirmAndExecute({
      actionId: action.actionId,
      runId: action.runId,
      userId: action.userId,
      storeId: action.storeId,
      permissions: ['core:marketing:update'],
    });

    expect(result).toMatchObject({ status: 'executing', receipt: { businessObjectId: 91 } });
    expect(prisma.brainActionExecution.update).toHaveBeenCalledWith({
      where: { id: 73 },
      data: expect.objectContaining({ status: 'executing', completedAt: null }),
    });
    expect(prisma.brainActionConfirmation.update).toHaveBeenCalledWith({
      where: { actionId: action.actionId },
      data: expect.objectContaining({ status: 'executing' }),
    });
  });

  it('revalidates the approval envelope and action target before claiming execution', async () => {
    const validatedArgs = { reservationId: 18, appointmentTime: '2026-07-14T15:00:00+08:00' };
    const bootstrapPrisma = {
      brainActionConfirmation: {
        create: jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: 1, createdAt: new Date(), ...data })),
      },
    };
    const gateway = {
      validateForExecution: jest.fn().mockReturnValue({
        descriptor: { key: 'reschedule_reservation', version: 1, riskLevel: 'high', permission: 'core:store:reservations' },
        payload: validatedArgs,
      }),
      resolve: jest.fn().mockReturnValue({ key: 'reschedule_reservation', version: 1, riskLevel: 'high', permission: 'core:store:reservations' }),
      execute: jest.fn().mockResolvedValue({ capabilityKey: 'reschedule_reservation', businessObjectType: 'reservation', businessObjectId: 18, result: { id: 18 } }),
    };
    const created = await new BrainActionConfirmationService(bootstrapPrisma as never, gateway as never).createPreview({
      runId: 7,
      userId: 9,
      storeId: 6,
      skillKey: 'reschedule_reservation',
      riskLevel: 'high',
      preview: { summary: '改约' },
      payload: validatedArgs,
    } as never);
    const action = { ...created, status: 'pending', createdAt: new Date() };
    const tx = {
      brainActionConfirmation: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
      brainActionExecution: { create: jest.fn().mockResolvedValue({ id: 91 }) },
    };
    const prisma = {
      brainActionConfirmation: { findFirst: jest.fn().mockResolvedValue(action), update: jest.fn() },
      brainActionExecution: { findUnique: jest.fn().mockResolvedValue(null), update: jest.fn() },
      $transaction: jest.fn((callback: (client: typeof tx) => unknown) => callback(tx)),
    };
    const targetResolver = { revalidateCapabilityTarget: jest.fn().mockResolvedValue(undefined) };
    const service = new BrainActionConfirmationService(prisma as never, gateway as never, undefined, targetResolver as never);

    await service.confirmAndExecute({
      actionId: action.actionId,
      runId: 7,
      userId: 9,
      storeId: 6,
      permissions: ['core:store:reservations'],
    });

    expect(gateway.validateForExecution).toHaveBeenCalledWith('reschedule_reservation', 1, validatedArgs);
    expect(targetResolver.revalidateCapabilityTarget).toHaveBeenCalledWith({
      capabilityKey: 'reschedule_reservation',
      storeId: 6,
      args: validatedArgs,
      idempotencyKey: expect.any(String),
    });
    expect(tx.brainActionConfirmation.updateMany).toHaveBeenCalledTimes(1);
  });

  it('fails closed when the stored arguments no longer match their approval digest', async () => {
    const action = {
      id: 1,
      actionId: 'act_tampered',
      runId: 7,
      userId: 9,
      storeId: 6,
      skillKey: 'create_reservation',
      riskLevel: 'medium',
      status: 'pending',
      payload: {
        protocolVersion: '1.0',
        capabilityKey: 'create_reservation',
        capabilityVersion: 1,
        validatedArgs: { customerId: 99, projectId: 22, appointmentTime: '2026-07-12' },
        actor: { userId: 9 },
        store: { storeId: 6 },
        riskLevel: 'medium',
        idempotencyKey: 'idem-1',
        planId: 'plan-1',
        argsDigest: '0'.repeat(64),
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
      },
      createdAt: new Date(),
    };
    const prisma = {
      brainActionConfirmation: { findFirst: jest.fn().mockResolvedValue(action) },
      brainActionExecution: { findUnique: jest.fn() },
    };
    const gateway = {
      resolve: jest.fn().mockReturnValue({ key: 'create_reservation', version: 1, riskLevel: 'medium', permission: 'core:store:reservations' }),
      validateForExecution: jest.fn().mockReturnValue({ descriptor: { key: 'create_reservation', version: 1, riskLevel: 'medium' }, payload: action.payload.validatedArgs }),
      execute: jest.fn(),
    };
    const service = new BrainActionConfirmationService(prisma as never, gateway as never);

    await expect(service.confirmAndExecute({
      actionId: action.actionId,
      runId: 7,
      userId: 9,
      storeId: 6,
      permissions: ['core:store:reservations'],
    })).rejects.toThrow('action_args_digest_mismatch');
    expect(gateway.execute).not.toHaveBeenCalled();
  });

  it('returns the existing succeeded execution for duplicate confirmations', async () => {
    const prisma = {
      brainActionConfirmation: {
        findFirst: jest.fn().mockResolvedValue({
          actionId: 'act_4',
          runId: 8,
          userId: 9,
          storeId: 6,
          skillKey: 'create_reservation',
          status: 'succeeded',
          payload: {},
          createdAt: new Date(),
        }),
      },
      brainActionExecution: {
        findUnique: jest.fn().mockResolvedValue({
          id: 72,
          status: 'succeeded',
          receiptPayload: { businessObjectId: 102 },
        }),
      },
    };
    const gateway = { execute: jest.fn() };
    const service = new BrainActionConfirmationService(prisma as never, gateway as never);

    const result = await service.confirmAndExecute({
      actionId: 'act_4',
      runId: 8,
      userId: 9,
      storeId: 6,
      permissions: ['core:store:reservations'],
    });

    expect(gateway.execute).not.toHaveBeenCalled();
    expect(result).toMatchObject({ status: 'succeeded', receipt: { businessObjectId: 102 }, duplicated: true });
  });

  it('safely replays a failed reservation reschedule with the original approval envelope', async () => {
    const validatedArgs = { reservationId: 18, appointmentTime: '2026-07-14T15:00:00+08:00' };
    const gateway = {
      validateForExecution: jest.fn().mockReturnValue({
        descriptor: {
          key: 'reschedule_reservation',
          version: 1,
          riskLevel: 'high',
          permission: 'core:store:reservations',
          failureRecovery: 'safe_replay',
        },
        payload: validatedArgs,
      }),
      resolve: jest.fn().mockReturnValue({
        key: 'reschedule_reservation',
        version: 1,
        riskLevel: 'high',
        permission: 'core:store:reservations',
        failureRecovery: 'safe_replay',
      }),
      execute: jest.fn().mockResolvedValue({
        capabilityKey: 'reschedule_reservation',
        businessObjectType: 'reservation',
        businessObjectId: 18,
        result: { id: 18 },
      }),
    };
    const bootstrapPrisma = {
      brainActionConfirmation: {
        create: jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: 1, createdAt: new Date(), ...data })),
      },
    };
    const created = await new BrainActionConfirmationService(bootstrapPrisma as never, gateway as never).createPreview({
      runId: 7,
      userId: 9,
      storeId: 6,
      skillKey: 'reschedule_reservation',
      capabilityVersion: 1,
      riskLevel: 'high',
      preview: { summary: '改约' },
      payload: validatedArgs,
    } as never);
    const action = { ...created, status: 'failed', createdAt: new Date() };
    const execution = {
      id: 91,
      status: 'failed',
      errorCode: 'upstream_timeout',
      errorMessage: 'upstream_timeout',
    };
    const tx = {
      brainActionConfirmation: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
      brainActionExecution: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
    };
    const prisma = {
      brainActionConfirmation: { findFirst: jest.fn().mockResolvedValue(action), update: jest.fn() },
      brainActionExecution: {
        findUnique: jest.fn().mockResolvedValue(execution),
        update: jest.fn(),
      },
      $transaction: jest.fn((callback: (client: typeof tx) => unknown) => callback(tx)),
    };
    const targetResolver = { revalidateCapabilityTarget: jest.fn().mockResolvedValue(undefined) };
    const service = new BrainActionConfirmationService(prisma as never, gateway as never, undefined, targetResolver as never);

    const result = await service.retryFailedExecution({
      actionId: action.actionId,
      runId: 7,
      userId: 9,
      storeId: 6,
      permissions: ['core:store:reservations'],
    });

    expect(tx.brainActionConfirmation.updateMany).toHaveBeenCalledWith({
      where: { actionId: action.actionId, status: 'failed' },
      data: { status: 'executing', result: expect.anything() },
    });
    expect(tx.brainActionExecution.updateMany).toHaveBeenCalledWith({
      where: { id: 91, status: 'failed' },
      data: expect.objectContaining({ status: 'executing', errorCode: null, errorMessage: null }),
    });
    expect(gateway.execute).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({ status: 'succeeded', executionId: 91, retried: true });
  });

  it('requires manual reconciliation for failed create actions instead of blind retry', async () => {
    const action = {
      actionId: 'act_purchase_failed',
      runId: 8,
      userId: 9,
      storeId: 6,
      skillKey: 'create_purchase_order',
      riskLevel: 'high',
      status: 'failed',
      payload: { idempotencyKey: 'purchase-1' },
      createdAt: new Date(),
    };
    const execution = {
      id: 92,
      status: 'failed',
      errorCode: 'upstream_timeout',
      errorMessage: '采购单回执超时',
    };
    const prisma = {
      brainActionConfirmation: { findFirst: jest.fn().mockResolvedValue(action) },
      brainActionExecution: { findUnique: jest.fn().mockResolvedValue(execution) },
    };
    const gateway = {
      resolve: jest.fn().mockReturnValue({ failureRecovery: 'manual_reconcile' }),
      execute: jest.fn(),
    };
    const service = new BrainActionConfirmationService(prisma as never, gateway as never);

    const result = await service.retryFailedExecution({
      actionId: action.actionId,
      runId: 8,
      userId: 9,
      storeId: 6,
      permissions: ['core:supply:manage'],
    });

    expect(gateway.execute).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      status: 'failed',
      retryable: false,
      recovery: 'manual_reconcile',
      error: { message: '采购单回执超时' },
    });
  });
});
