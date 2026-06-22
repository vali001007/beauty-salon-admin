import { BadRequestException } from '@nestjs/common';
import { OperationCostsService } from './operation-costs.service';

describe('OperationCostsService', () => {
  const createPrisma = () => ({
    operatingCost: {
      findMany: jest.fn(),
      count: jest.fn(),
      create: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      createMany: jest.fn(),
    },
  });

  it('creates a validated monthly operating cost', async () => {
    const prisma = createPrisma();
    prisma.operatingCost.create.mockResolvedValue({
      id: 1,
      storeId: 2,
      periodMonth: '2026-06',
      costDate: new Date('2026-06-01T00:00:00.000Z'),
      category: 'rent',
      amount: 12000,
      store: { id: 2, name: 'Ami 门店' },
      creator: { id: 7, name: '管理员' },
    });
    const service = new OperationCostsService(prisma as any);

    const result = await service.create(
      {
        periodMonth: '2026-06',
        costDate: '2026-06-01',
        category: 'rent',
        amount: 12000,
      },
      '2',
      7,
    );

    expect(prisma.operatingCost.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          storeId: 2,
          category: 'rent',
          amount: 12000,
          createdBy: 7,
        }),
      }),
    );
    expect(result).toMatchObject({ id: 1, amount: 12000, storeName: 'Ami 门店', creatorName: '管理员' });
  });

  it('rejects cost date outside selected month', async () => {
    const service = new OperationCostsService(createPrisma() as any);

    await expect(
      service.create(
        {
          storeId: 1,
          periodMonth: '2026-06',
          costDate: '2026-07-01',
          category: 'rent',
          amount: 1000,
        },
        undefined,
        1,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects updates that move cost date outside the selected month', async () => {
    const prisma = createPrisma();
    prisma.operatingCost.findUnique.mockResolvedValue({
      id: 1,
      storeId: 1,
      periodMonth: '2026-06',
      costDate: new Date('2026-06-10T00:00:00.000Z'),
      category: 'rent',
      amount: 1000,
    });
    const service = new OperationCostsService(prisma as any);

    await expect(service.update(1, { periodMonth: '2026-06', costDate: '2026-07-01' })).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.operatingCost.update).not.toHaveBeenCalled();
  });

  it('copies previous month costs only when target month is empty', async () => {
    const prisma = createPrisma();
    prisma.operatingCost.count.mockResolvedValueOnce(0).mockResolvedValueOnce(1);
    prisma.operatingCost.findMany
      .mockResolvedValueOnce([
        {
          storeId: 1,
          periodMonth: '2026-05',
          costDate: new Date('2026-05-05T00:00:00.000Z'),
          category: 'salary',
          amount: 30000,
          allocationType: 'store_month',
          relatedCampaignId: null,
          relatedEmployeeId: null,
          remark: '工资',
        },
      ])
      .mockResolvedValueOnce([{ id: 2, amount: 30000, store: { name: 'Ami 门店' } }]);
    prisma.operatingCost.createMany.mockResolvedValue({ count: 1 });
    const service = new OperationCostsService(prisma as any);

    const result = await service.copyFromPreviousMonth(
      { storeId: 1, fromPeriodMonth: '2026-05', toPeriodMonth: '2026-06' },
      undefined,
      7,
    );

    expect(prisma.operatingCost.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          storeId: 1,
          periodMonth: '2026-06',
          category: 'salary',
          amount: 30000,
          createdBy: 7,
        }),
      ],
    });
    expect(result.total).toBe(1);
  });

  it('rejects copying previous month costs when target month already has costs', async () => {
    const prisma = createPrisma();
    prisma.operatingCost.count.mockResolvedValue(1);
    const service = new OperationCostsService(prisma as any);

    await expect(
      service.copyFromPreviousMonth({ storeId: 1, fromPeriodMonth: '2026-05', toPeriodMonth: '2026-06' }, undefined, 7),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.operatingCost.findMany).not.toHaveBeenCalled();
    expect(prisma.operatingCost.createMany).not.toHaveBeenCalled();
  });

  it('returns an empty paginated page when copying from an empty source month', async () => {
    const prisma = createPrisma();
    prisma.operatingCost.count.mockResolvedValue(0);
    prisma.operatingCost.findMany.mockResolvedValue([]);
    const service = new OperationCostsService(prisma as any);

    const result = await service.copyFromPreviousMonth(
      { storeId: 1, fromPeriodMonth: '2026-05', toPeriodMonth: '2026-06' },
      undefined,
      7,
    );

    expect(result).toEqual({ items: [], data: [], total: 0, page: 1, pageSize: 100 });
    expect(prisma.operatingCost.createMany).not.toHaveBeenCalled();
  });
});
