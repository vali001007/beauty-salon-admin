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

  it('loads active staff levels, project skills, schedules and approved time off as deterministic facts', async () => {
    const prisma = {
      beautician: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 1,
            name: '唐伊',
            level: { id: 3, name: '高级美容师' },
            projectSkills: [
              {
                projectId: 20,
                skillLevel: 2,
                certified: true,
                priority: 1,
                project: { name: '肩颈舒压养护' },
              },
            ],
          },
        ]),
      },
      schedule: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 10,
            beauticianId: 1,
            date: new Date('2026-06-29T00:00:00.000Z'),
            startTime: '09:00',
            endTime: '18:00',
            status: 'published',
            source: 'manual',
          },
        ]),
      },
      beauticianTimeOff: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 11,
            beauticianId: 1,
            date: new Date('2026-06-29T00:00:00.000Z'),
            startTime: '14:00',
            endTime: '16:00',
            reason: '培训',
          },
        ]),
      },
    };
    const service = new BrainManagerSkillsService(prisma as never);

    const result = await service.buildStaffDirectoryFacts({
      storeId: 6,
      startDate: new Date('2026-06-29T00:00:00.000Z'),
      endDate: new Date('2026-06-29T23:59:59.999Z'),
    });

    expect(result.staff).toEqual([
      expect.objectContaining({
        beauticianId: 1,
        name: '唐伊',
        level: { levelId: 3, name: '高级美容师' },
        projectSkills: [
          expect.objectContaining({ projectId: 20, projectName: '肩颈舒压养护', certified: true }),
        ],
        schedules: [expect.objectContaining({ scheduleId: 10, date: '2026-06-29', status: 'published' })],
        timeOffs: [expect.objectContaining({ timeOffId: 11, date: '2026-06-29', reason: '培训' })],
      }),
    ]);
    expect(prisma.beautician.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { storeId: 6, status: 'active' } }),
    );
    expect(prisma.beauticianTimeOff.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ status: 'approved' }) }),
    );
  });
});
