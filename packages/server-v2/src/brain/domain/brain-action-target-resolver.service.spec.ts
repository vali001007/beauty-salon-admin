import { BrainActionTargetResolverService } from './brain-action-target-resolver.service.js';

describe('BrainActionTargetResolverService', () => {
  const prisma = {
    customer: { findMany: jest.fn(), findFirst: jest.fn() },
    project: { findMany: jest.fn(), findFirst: jest.fn() },
    reservation: { findMany: jest.fn(), findFirst: jest.fn() },
    serviceTask: { findMany: jest.fn(), findFirst: jest.fn() },
    customerCard: { findMany: jest.fn(), findFirst: jest.fn() },
    cardUsageRecord: { aggregate: jest.fn() },
    beautician: { findMany: jest.fn(), findFirst: jest.fn() },
    product: { count: jest.fn() },
  };
  const service = new BrainActionTargetResolverService(prisma as never);

  beforeEach(() => jest.clearAllMocks());

  it('resolves an exact customer only inside the current store', async () => {
    prisma.customer.findMany.mockResolvedValue([{ id: 7, name: '张女士', phone: '13800001234' }]);

    await expect(service.resolveCustomer({ storeId: 6, message: '给张女士创建一个跟进任务' })).resolves.toEqual({
      ok: true,
      value: { id: 7, name: '张女士', maskedPhone: '***1234' },
    });
    expect(prisma.customer.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ storeId: 6, deletedAt: null }),
    }));
  });

  it.each(['把张女士的预约改到明天三点', '帮张女士把预约改到明天三点'])(
    'extracts the customer from a natural reschedule request: %s',
    async (message) => {
      prisma.customer.findMany.mockResolvedValue([{ id: 7, name: '张女士', phone: '13800001234' }]);

      await expect(service.resolveCustomer({ storeId: 6, message })).resolves.toMatchObject({
        ok: true,
        value: { id: 7, name: '张女士' },
      });
    },
  );

  it('requires clarification when a customer is ambiguous', async () => {
    prisma.customer.findMany.mockResolvedValue([
      { id: 7, name: '张女士', phone: '13800001234' },
      { id: 8, name: '张女士', phone: '13900005678' },
    ]);

    const result = await service.resolveCustomer({ storeId: 6, message: '给张女士创建一个跟进任务' });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toContain('手机号后四位');
  });

  it('resolves a customer by the natural phone-last-four expression', async () => {
    prisma.customer.findMany.mockResolvedValue([{ id: 9, name: '胡静怡', phone: '13800007636' }]);

    await expect(service.resolveCustomer({
      storeId: 6,
      message: '手机号后四位是7636，继续生成预览',
    })).resolves.toMatchObject({ ok: true, value: { id: 9, name: '胡静怡' } });
    expect(prisma.customer.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ phone: { endsWith: '7636' } }),
    }));
  });

  it('combines the inherited customer name with the supplied phone tail', async () => {
    prisma.customer.findMany.mockResolvedValue([{ id: 9, name: '胡静怡', phone: '13800007636' }]);

    await service.resolveCustomer({
      storeId: 6,
      message: '手机号后四位是7636，继续生成预览',
      customerName: '胡静怡',
    });

    expect(prisma.customer.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        AND: [{ name: { contains: '胡静怡' } }, { phone: { endsWith: '7636' } }],
      }),
    }));
  });

  it('parses a precise relative appointment time but rejects a vague afternoon', () => {
    const now = new Date('2026-07-11T02:00:00.000Z');

    const appointment = service.resolveAppointmentTime('明天下午3点半', now);
    expect(appointment?.getHours()).toBe(15);
    expect(appointment?.getMinutes()).toBe(30);
    expect(service.resolveAppointmentTime('明天下午', now)).toBeUndefined();
  });

  it('resolves the next named weekday deterministically', () => {
    const now = new Date(2026, 6, 16, 10, 0, 0, 0);

    const appointment = service.resolveAppointmentTime('挪到周五下午三点', now);

    expect(appointment?.getFullYear()).toBe(2026);
    expect(appointment?.getMonth()).toBe(6);
    expect(appointment?.getDate()).toBe(17);
    expect(appointment?.getHours()).toBe(15);
  });

  it('resolves one active reservation for an exact customer', async () => {
    prisma.customer.findMany.mockResolvedValue([{ id: 7, name: '张女士', phone: '13800001234' }]);
    prisma.reservation.findMany.mockResolvedValue([
      { id: 18, date: new Date('2026-07-12T00:00:00.000Z'), startTime: '10:00', status: 'confirmed', project: { name: '补水护理' } },
    ]);

    await expect(service.resolveReservation({ storeId: 6, message: '把张女士的预约改到明天下午3点' })).resolves.toEqual({
      ok: true,
      value: expect.objectContaining({ id: 18, customerId: 7, customerName: '张女士', projectName: '补水护理' }),
    });
  });

  it('revalidates action targets inside the current store before confirmation', async () => {
    prisma.reservation.findFirst.mockResolvedValue({ id: 18 });
    await expect(service.revalidateCapabilityTarget({
      capabilityKey: 'reschedule_reservation',
      storeId: 6,
      args: { reservationId: 18, appointmentTime: '2026-07-14T15:00:00+08:00' },
    })).resolves.toBeUndefined();
    expect(prisma.reservation.findFirst).toHaveBeenCalledWith({
      where: { id: 18, storeId: 6 },
      select: { id: true },
    });
  });

  it('resolves one active customer card, project, usage count and beautician', async () => {
    prisma.customer.findMany.mockResolvedValue([{ id: 7, name: '张女士', phone: '13800001234' }]);
    prisma.customerCard.findMany.mockResolvedValue([{
      id: 66,
      customerId: 7,
      cardName: '补水护理 10 次卡',
      totalTimes: 10,
      remainingTimes: 5,
      expiryDate: new Date('2026-12-31T00:00:00.000Z'),
      card: { projects: [{ projectId: 101, projectName: '深层补水护理', timesPerCard: 10 }] },
    }]);
    prisma.project.findFirst.mockResolvedValue({ id: 101, name: '深层补水护理' });
    prisma.cardUsageRecord.aggregate.mockResolvedValue({ _sum: { times: 3 } });
    prisma.beautician.findMany.mockResolvedValue([{ id: 2, name: '王美容师' }]);

    await expect(service.resolveCardUsageTarget({
      storeId: 6,
      message: '给张女士的补水护理 10 次卡核销深层补水护理 1 次，王美容师服务',
    })).resolves.toEqual({
      ok: true,
      value: {
        customerId: 7,
        customerName: '张女士',
        customerCardId: 66,
        cardName: '补水护理 10 次卡',
        projectId: 101,
        projectName: '深层补水护理',
        remainingTimes: 5,
        projectRemainingTimes: 7,
      },
    });
    await expect(service.resolveBeautician({ storeId: 6, message: '由王美容师服务' })).resolves.toEqual({
      ok: true,
      value: { id: 2, name: '王美容师' },
    });
    expect(service.resolveUsageTimes('核销 1 次')).toBe(1);
    expect(service.resolveUsageTimes('划扣两次')).toBe(2);
  });

  it('revalidates card usage targets with card, project and beautician store scope', async () => {
    prisma.customerCard.findFirst.mockResolvedValue({
      id: 66,
      customerId: 7,
      status: 'active',
      remainingTimes: 5,
      expiryDate: new Date('2026-12-31T00:00:00.000Z'),
      card: { projects: [{ projectId: 101, projectName: '深层补水护理' }] },
    });
    prisma.project.findFirst.mockResolvedValue({ id: 101, name: '深层补水护理' });
    prisma.beautician.findFirst.mockResolvedValue({ id: 2 });

    await expect(service.revalidateCapabilityTarget({
      capabilityKey: 'verify_card_usage',
      storeId: 6,
      args: { customerCardId: 66, customerId: 7, projectId: 101, projectName: '深层补水护理', times: 1, beauticianId: 2 },
    })).resolves.toBeUndefined();
    expect(prisma.customerCard.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 66, customer: { storeId: 6, deletedAt: null } },
    }));
  });

  it('rejects a card usage target outside the current store', async () => {
    prisma.customerCard.findFirst.mockResolvedValue(null);

    await expect(service.revalidateCapabilityTarget({
      capabilityKey: 'verify_card_usage',
      storeId: 6,
      args: { customerCardId: 66, customerId: 7, projectId: 101, projectName: '深层补水护理', times: 1, beauticianId: 2 },
    })).rejects.toThrow('cross_store_action_target');
  });
});
