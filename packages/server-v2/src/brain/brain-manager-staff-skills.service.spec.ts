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

  it('calculates cross-sell from all non-gift kinds in staff-attributed orders', async () => {
    const prisma = {
      beautician: {
        findMany: jest.fn().mockResolvedValue([
          { id: 1, name: '唐伊' },
          { id: 2, name: '顾然' },
        ]),
      },
      orderItem: {
        findMany: jest.fn().mockResolvedValue([
          { id: 1, orderId: 100, beauticianId: 1, itemType: 'project', itemId: 10, name: '护理A' },
          { id: 2, orderId: 100, beauticianId: null, itemType: 'product', itemId: 20, name: '产品B' },
          { id: 3, orderId: 101, beauticianId: 1, itemType: 'project', itemId: 10, name: '护理A' },
          { id: 4, orderId: 102, beauticianId: 2, itemType: 'project', itemId: 11, name: '护理C' },
          { id: 5, orderId: 102, beauticianId: 2, itemType: 'product', itemId: 21, name: '产品D' },
        ]),
      },
    };
    const service = new BrainManagerSkillsService(prisma as never);

    const result = await service.buildStaffCrossSellAnalysis({
      storeId: 6,
      startDate: new Date('2026-07-01T00:00:00.000Z'),
      endDate: new Date('2026-07-31T23:59:59.999Z'),
    });

    expect(result.staff).toEqual([
      expect.objectContaining({
        beauticianId: 2,
        attributedOrderCount: 1,
        multiItemOrderCount: 1,
        crossSellRate: 1,
        averageItemKindCount: 2,
      }),
      expect.objectContaining({
        beauticianId: 1,
        attributedOrderCount: 2,
        multiItemOrderCount: 1,
        crossSellRate: 0.5,
        averageItemKindCount: 1.5,
      }),
    ]);
    expect(prisma.orderItem.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          isGift: false,
          order: expect.objectContaining({ orderItems: { some: { beauticianId: { not: null }, isGift: false } } }),
        }),
      }),
    );
  });

  it('loads every active project and counts active configured and certified staff coverage', async () => {
    const prisma = {
      project: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 10,
            name: '肩颈舒压养护',
            beauticianSkills: [
              { certified: true, beautician: { id: 1, name: '唐伊' } },
              { certified: false, beautician: { id: 2, name: '顾然' } },
            ],
          },
          { id: 11, name: '胶原焕活提拉', beauticianSkills: [] },
        ]),
      },
    };
    const service = new BrainManagerSkillsService(prisma as never);

    const result = await service.buildStaffSkillCoverage({ storeId: 6 });

    expect(result.projects).toEqual([
      {
        projectId: 10,
        projectName: '肩颈舒压养护',
        staffCount: 2,
        certifiedStaffCount: 1,
        staffNames: ['顾然', '唐伊'],
      },
      {
        projectId: 11,
        projectName: '胶原焕活提拉',
        staffCount: 0,
        certifiedStaffCount: 0,
        staffNames: [],
      },
    ]);
    expect(prisma.project.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { storeId: 6, status: 'active', deletedAt: null },
        select: expect.objectContaining({ beauticianSkills: expect.any(Object) }),
      }),
    );
  });
});
