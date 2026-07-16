import { BrainManagerSkillsService } from './skills/brain-manager-skills.service.js';

describe('BrainManagerSkillsService staff analysis', () => {
  it('aggregates service, repeat customers, commission and time off by beautician', async () => {
    const prisma = {
      beautician: { findMany: jest.fn().mockResolvedValue([{ id: 1, name: '王美容师' }]) },
      serviceTask: {
        findMany: jest.fn().mockResolvedValue([
          { beauticianId: 1, customerId: 10, status: 'completed' },
          { beauticianId: 1, customerId: 10, status: 'completed' },
          { beauticianId: 1, customerId: 11, status: 'pending' },
        ]),
      },
      commissionRecord: {
        findMany: jest.fn().mockResolvedValue([{ beauticianId: 1, sourceAmount: 1000, amount: 100 }]),
      },
      beauticianTimeOff: {
        findMany: jest.fn().mockResolvedValue([{ beauticianId: 1, startTime: '14:00', endTime: '16:30' }]),
      },
    };
    const service = new BrainManagerSkillsService(prisma as never);

    const result = await service.buildStaffAnalysis({
      storeId: 6,
      startDate: new Date('2026-07-01T00:00:00.000Z'),
      endDate: new Date('2026-07-31T23:59:59.999Z'),
    });

    expect(result.staff[0]).toMatchObject({
      name: '王美容师',
      serviceCount: 3,
      completedCount: 2,
      uniqueCustomerCount: 2,
      repeatCustomerCount: 1,
      revenueAmount: 1000,
      commissionAmount: 100,
      timeOffHours: 2.5,
    });
    expect(prisma.serviceTask.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ status: { not: 'cancelled' } }),
      }),
    );
  });

  it('paginates staff facts instead of silently truncating at the first page', async () => {
    const firstPage = Array.from({ length: 1000 }, (_, index) => ({
      id: index + 1,
      beauticianId: 1,
      customerId: index + 1,
      status: 'completed',
    }));
    const serviceTaskFindMany = jest
      .fn()
      .mockResolvedValueOnce(firstPage)
      .mockResolvedValueOnce([{ id: 1001, beauticianId: 1, customerId: 1001, status: 'completed' }]);
    const prisma = {
      beautician: { findMany: jest.fn().mockResolvedValue([{ id: 1, name: '王美容师' }]) },
      serviceTask: { findMany: serviceTaskFindMany },
      commissionRecord: { findMany: jest.fn().mockResolvedValue([]) },
      beauticianTimeOff: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const service = new BrainManagerSkillsService(prisma as never);

    const result = await service.buildStaffAnalysis({
      storeId: 6,
      startDate: new Date('2026-07-01T00:00:00.000Z'),
      endDate: new Date('2026-07-31T23:59:59.999Z'),
    });

    expect(result.staff[0].serviceCount).toBe(1001);
    expect(serviceTaskFindMany).toHaveBeenCalledTimes(2);
    expect(serviceTaskFindMany.mock.calls[1][0]).toEqual(
      expect.objectContaining({ cursor: { id: 1000 }, skip: 1, orderBy: { id: 'asc' }, take: 1000 }),
    );
  });
});
