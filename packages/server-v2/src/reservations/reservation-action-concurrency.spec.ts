import { ReservationsService } from './reservations.service.js';

describe('ReservationsService action concurrency', () => {
  it('rejects a stale governed reservation update instead of overwriting the newer object', async () => {
    const prisma = prismaFixture();
    prisma.reservation.updateMany.mockResolvedValue({ count: 0 });
    const service = new ReservationsService(prisma as never, {} as never);

    await expect(
      service.update(31, {
        remark: '改期',
        expectedUpdatedAt: '2026-07-30T10:00:00.000Z',
      }),
    ).rejects.toThrow('预约已发生变化，请重新确认后再操作');

    expect(prisma.reservation.update).not.toHaveBeenCalled();
    expect(prisma.reservation.updateMany).toHaveBeenCalledWith({
      where: { id: 31, updatedAt: new Date('2026-07-30T10:00:00.000Z') },
      data: { remark: '改期' },
    });
  });

  it('rejects a stale governed cancellation instead of cancelling a changed reservation', async () => {
    const prisma = prismaFixture();
    prisma.reservation.updateMany.mockResolvedValue({ count: 0 });
    const service = new ReservationsService(prisma as never, {} as never);

    await expect(service.cancel(31, '客户取消', '2026-07-30T10:00:00.000Z')).rejects.toThrow(
      '预约已发生变化，请重新确认后再操作',
    );

    expect(prisma.reservation.update).not.toHaveBeenCalled();
    expect(prisma.reservation.updateMany).toHaveBeenCalledWith({
      where: { id: 31, updatedAt: new Date('2026-07-30T10:00:00.000Z') },
      data: { status: 'cancelled', remark: '客户取消' },
    });
  });
});

function prismaFixture() {
  const prisma: any = {
    $transaction: jest.fn(async (callback: (tx: any) => unknown) => callback(prisma)),
    reservation: {
      findUnique: jest.fn().mockResolvedValue({
        id: 31,
        storeId: 6,
        customerId: 11,
        projectId: 22,
        beauticianId: null,
        date: new Date('2026-08-01T00:00:00.000Z'),
        startTime: '15:00',
        status: 'confirmed',
        remark: null,
        updatedAt: new Date('2026-07-30T10:00:01.000Z'),
      }),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
    project: { findFirst: jest.fn() },
    beautician: { findFirst: jest.fn() },
    beauticianTimeOff: { findMany: jest.fn().mockResolvedValue([]) },
    beauticianAvailability: { findMany: jest.fn().mockResolvedValue([]) },
  };
  return prisma;
}
