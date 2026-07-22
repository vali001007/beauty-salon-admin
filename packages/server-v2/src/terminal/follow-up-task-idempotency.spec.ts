import { ConflictException } from '@nestjs/common';
import { TerminalService } from './terminal.service.js';
import {
  buildFollowUpTaskCreationFingerprint,
  buildFollowUpTaskIdempotencyKey,
} from './follow-up-task-idempotency.js';

describe('TerminalService follow-up task creation idempotency', () => {
  const input = {
    customerId: 11,
    source: 'brain_followup',
    title: '七天回访',
    note: '确认护理反馈',
    script: '您好，想了解护理后的感受。',
    channel: 'phone',
    assigneeRole: 'manager' as const,
    idempotencyKey: 'follow-up-action-81',
  };
  const storedTask = {
    id: 81,
    storeId: 6,
    customerId: 11,
    idempotencyKey: buildFollowUpTaskIdempotencyKey(6, 'brain_followup', input.idempotencyKey),
    creationFingerprint: buildFollowUpTaskCreationFingerprint({ ...input, storeId: 6 }),
    source: 'brain_followup',
    title: '七天回访',
    note: '确认护理反馈',
    script: '您好，想了解护理后的感受。',
    status: 'pending',
    priority: 'recommended',
    assigneeRole: 'manager',
    payload: { channel: 'phone', assignmentReason: '涉及经营协调，暂无可分派员工', sourcePayload: {} },
    customer: { id: 11, name: '张女士', phone: '13800000000', memberLevel: 'VIP' },
    createdAt: new Date('2026-07-18T00:00:00.000Z'),
    updatedAt: new Date('2026-07-18T00:00:00.000Z'),
  };
  let prisma: any;
  let service: TerminalService;

  beforeEach(() => {
    prisma = {
      $executeRaw: jest.fn().mockResolvedValue(0),
      customer: { findFirst: jest.fn().mockResolvedValue(storedTask.customer) },
      terminalFollowUpTask: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockImplementation(async ({ data }: any) => ({ ...storedTask, ...data })),
      },
      user: { findMany: jest.fn().mockResolvedValue([]), findFirst: jest.fn().mockResolvedValue(null) },
      beautician: { findFirst: jest.fn().mockResolvedValue(null) },
      serviceTask: { findFirst: jest.fn().mockResolvedValue(null) },
      reservation: { findFirst: jest.fn().mockResolvedValue(null) },
      recommendationEvent: { create: jest.fn().mockResolvedValue({ id: 901 }) },
    };
    prisma.$transaction = jest.fn(async (callback: (tx: any) => unknown) => callback(prisma));
    service = new TerminalService(prisma, {} as never, {} as never, {} as never, { invalidate: jest.fn() } as never);
  });

  it('persists a scoped hash and immutable fingerprint without storing the raw key', async () => {
    const result = await service.createFollowUpTask(6, undefined, input, 9);

    expect(result).toMatchObject({ id: 81, duplicated: false, status: 'pending' });
    expect(prisma.$executeRaw).toHaveBeenCalledTimes(1);
    expect(prisma.terminalFollowUpTask.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        idempotencyKey: storedTask.idempotencyKey,
        creationFingerprint: storedTask.creationFingerprint,
        payload: expect.objectContaining({
          sourcePayload: expect.not.objectContaining({ idempotencyKey: expect.anything() }),
        }),
      }),
    }));
  });

  it('returns a committed task before mutable customer and assignment checks', async () => {
    prisma.terminalFollowUpTask.findUnique.mockResolvedValue({ ...storedTask, status: 'completed' });
    prisma.customer.findFirst.mockResolvedValue(null);

    const result = await service.createFollowUpTask(6, undefined, input, 9);

    expect(result).toMatchObject({ id: 81, duplicated: true, status: 'completed' });
    expect(prisma.customer.findFirst).not.toHaveBeenCalled();
    expect(prisma.user.findMany).not.toHaveBeenCalled();
    expect(prisma.terminalFollowUpTask.create).not.toHaveBeenCalled();
  });

  it('rejects the same key when the customer or script differs', async () => {
    prisma.terminalFollowUpTask.findUnique.mockResolvedValue(storedTask);

    await expect(service.createFollowUpTask(6, undefined, { ...input, customerId: 12 }, 9)).rejects.toBeInstanceOf(ConflictException);
    await expect(service.createFollowUpTask(6, undefined, { ...input, script: '另一条话术' }, 9)).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.customer.findFirst).not.toHaveBeenCalled();
  });

  it('separates the same raw key by store and source', () => {
    expect(buildFollowUpTaskIdempotencyKey(6, 'brain_followup', 'same')).not.toBe(
      buildFollowUpTaskIdempotencyKey(7, 'brain_followup', 'same'),
    );
    expect(buildFollowUpTaskIdempotencyKey(6, 'brain_followup', 'same')).not.toBe(
      buildFollowUpTaskIdempotencyKey(6, 'brain_marketing_touch_draft', 'same'),
    );
  });
});
