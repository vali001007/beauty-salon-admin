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
