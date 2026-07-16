import { BrainActionTargetResolverService } from './brain-action-target-resolver.service.js';

describe('BrainActionTargetResolverService', () => {
  const prisma = {
    customer: { findMany: jest.fn(), findFirst: jest.fn() },
    project: { findMany: jest.fn(), findFirst: jest.fn() },
    reservation: { findMany: jest.fn(), findFirst: jest.fn() },
    serviceTask: { findMany: jest.fn(), findFirst: jest.fn() },
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

  it('requires clarification when a customer is ambiguous', async () => {
    prisma.customer.findMany.mockResolvedValue([
      { id: 7, name: '张女士', phone: '13800001234' },
      { id: 8, name: '张女士', phone: '13900005678' },
    ]);

    const result = await service.resolveCustomer({ storeId: 6, message: '给张女士创建一个跟进任务' });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toContain('手机号后四位');
  });

  it('parses a precise relative appointment time but rejects a vague afternoon', () => {
    const now = new Date('2026-07-11T02:00:00.000Z');

    const appointment = service.resolveAppointmentTime('明天下午3点半', now);
    expect(appointment?.getHours()).toBe(15);
    expect(appointment?.getMinutes()).toBe(30);
    expect(service.resolveAppointmentTime('明天下午', now)).toBeUndefined();
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
});
