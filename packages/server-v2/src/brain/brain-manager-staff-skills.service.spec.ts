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
  });
});
