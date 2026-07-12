import { BrainActionConfirmationService } from './skills/brain-action-confirmation.service.js';

describe('BrainActionConfirmationService', () => {
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
      status: 'pending',
      payload: { customerId: 11, projectId: 22, appointmentTime: '2026-07-12T10:00:00+08:00' },
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
      resolve: jest.fn().mockReturnValue({ permission: 'core:store:reservations' }),
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
});
