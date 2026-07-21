import { BrainActionTargetResolverService } from './domain/brain-action-target-resolver.service.js';
import { BrainActionConfirmationService } from './skills/brain-action-confirmation.service.js';
import { BrainCapabilityGatewayService } from './skills/brain-capability-gateway.service.js';

describe('Brain model action security integration', () => {
  it('executes only the server-approved args after target, scope, permission and digest revalidation', async () => {
    let confirmation: Record<string, unknown> | undefined;
    const executionUpdates: unknown[] = [];
    const confirmationUpdates: unknown[] = [];
    const tx = {
      brainActionConfirmation: {
        updateMany: jest.fn().mockImplementation(({ where }) =>
          Promise.resolve({ count: confirmation?.status === 'pending' && where.actionId === confirmation.actionId ? 1 : 0 }),
        ),
      },
      brainActionExecution: {
        create: jest.fn().mockResolvedValue({ id: 91, status: 'executing' }),
      },
    };
    const prisma = {
      brainActionConfirmation: {
        create: jest.fn().mockImplementation(({ data }) => {
          confirmation = { id: 1, status: 'pending', createdAt: new Date(), ...data };
          return Promise.resolve(confirmation);
        }),
        findFirst: jest.fn().mockImplementation(() => Promise.resolve(confirmation)),
        update: jest.fn().mockImplementation((input) => {
          confirmationUpdates.push(input);
          confirmation = { ...confirmation, ...input.data };
          return Promise.resolve(confirmation);
        }),
      },
      brainActionExecution: {
        findUnique: jest.fn().mockResolvedValue(null),
        update: jest.fn().mockImplementation((input) => {
          executionUpdates.push(input);
          return Promise.resolve({ id: 91, ...input.data });
        }),
      },
      reservation: {
        findFirst: jest.fn().mockResolvedValue({ id: 18 }),
      },
      $transaction: jest.fn((callback) => callback(tx)),
    };
    const reservations = {
      findById: jest.fn().mockResolvedValue({ id: 18, storeId: 6 }),
      update: jest.fn().mockResolvedValue({ id: 18, storeId: 6, appointmentTime: '2026-07-14T15:00:00+08:00' }),
    };
    const gateway = new BrainCapabilityGatewayService(reservations as never, undefined, undefined, undefined);
    const targets = new BrainActionTargetResolverService(prisma as never);
    const trace = { recordStep: jest.fn().mockResolvedValue({ id: 1 }) };
    const service = new BrainActionConfirmationService(prisma as never, gateway, trace as never, targets);

    const preview = await service.createPreview({
      runId: 77,
      userId: 9,
      storeId: 6,
      skillKey: 'reschedule_reservation',
      riskLevel: 'high',
      planId: 'workflow:reservation-change',
      preview: { summary: '将预约改到 7 月 14 日 15:00' },
      payload: {
        reservationId: 18,
        appointmentTime: '2026-07-14T15:00:00+08:00',
        sourceMessage: '把张女士的预约改到下周二下午三点',
        roleHint: 'finance',
      },
    });
    const result = await service.confirmAndExecute({
      actionId: preview.actionId,
      runId: 77,
      userId: 9,
      storeId: 6,
      permissions: ['core:store:reservations'],
    });

    const storedEnvelope = confirmationUpdates[0] ? (confirmation as Record<string, unknown>) : undefined;
    expect((preview.payload as Record<string, unknown>).validatedArgs).toEqual({
      reservationId: 18,
      appointmentTime: '2026-07-14T15:00:00+08:00',
    });
    expect(prisma.reservation.findFirst).toHaveBeenCalledWith({ where: { id: 18, storeId: 6 }, select: { id: true } });
    expect(reservations.update).toHaveBeenCalledWith(18, expect.objectContaining({ appointmentTime: '2026-07-14T15:00:00+08:00' }));
    expect(result).toMatchObject({ status: 'succeeded', receipt: { businessObjectId: 18 } });
    expect(executionUpdates).toEqual([expect.objectContaining({ data: expect.objectContaining({ status: 'succeeded' }) })]);
    expect(storedEnvelope).toMatchObject({ status: 'succeeded' });
    expect(trace.recordStep).toHaveBeenCalledWith(expect.objectContaining({ status: 'succeeded' }));
  });

  it('does not allow a model to put confirmation state in nested action args', async () => {
    const prisma = { brainActionConfirmation: { create: jest.fn() } };
    const service = new BrainActionConfirmationService(prisma as never, new BrainCapabilityGatewayService());

    await expect(service.createPreview({
      runId: 77,
      userId: 9,
      storeId: 6,
      skillKey: 'create_reservation',
      riskLevel: 'medium',
      preview: { summary: '创建预约' },
      payload: {
        customerId: 11,
        projectId: 22,
        appointmentTime: '2026-07-14T15:00:00+08:00',
        modelState: { confirmed: true },
      },
    })).rejects.toThrow('model_confirmation_claim_forbidden:confirmed');
  });
});
