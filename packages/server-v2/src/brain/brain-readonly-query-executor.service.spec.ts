import { BrainReadonlyQueryExecutorService } from './semantic/brain-readonly-query-executor.service.js';

describe('BrainReadonlyQueryExecutorService', () => {
  it('executes compiler-owned metric queries through safe Prisma raw templates', async () => {
    const prisma = {
      $queryRaw: jest.fn().mockResolvedValue([{ appointment_count: 3 }]),
      $queryRawUnsafe: jest.fn(),
    };
    const service = new BrainReadonlyQueryExecutorService(prisma as never);

    const rows = await service.execute({
      metric: 'appointment_count',
      queryKey: 'appointment_count',
      label: '预约数',
      valueField: 'appointment_count',
      sql: 'select count(*)::int as appointment_count from "Reservation" where "storeId" = $1',
      params: [1],
      filters: { storeId: 1 },
      citations: [],
    });

    expect(rows).toEqual([{ appointment_count: 3 }]);
    expect(prisma.$queryRaw).toHaveBeenCalled();
    expect(prisma.$queryRawUnsafe).not.toHaveBeenCalled();
  });

  it('executes paid revenue comparison through safe Prisma raw templates', async () => {
    const prisma = {
      $queryRaw: jest.fn().mockResolvedValue([
        { current_value: 12000, previous_value: 8000, delta_value: 4000, delta_rate: 0.5 },
      ]),
      $queryRawUnsafe: jest.fn(),
    };
    const service = new BrainReadonlyQueryExecutorService(prisma as never);

    const rows = await service.execute({
      metric: 'paid_revenue',
      queryKey: 'paid_revenue_comparison',
      label: '实收流水',
      valueField: 'current_value',
      sql: 'select current_value, previous_value, delta_value, delta_rate from "ProductOrder"',
      params: [1],
      filters: { storeId: 1 },
      answerShape: 'comparison',
      comparison: {
        current: { startDate: new Date('2026-07-01'), endDate: new Date('2026-07-10') },
        previous: { startDate: new Date('2026-06-01'), endDate: new Date('2026-06-30') },
      },
      citations: [],
    });

    expect(rows).toEqual([{ current_value: 12000, previous_value: 8000, delta_value: 4000, delta_rate: 0.5 }]);
    expect(prisma.$queryRaw).toHaveBeenCalled();
    expect(prisma.$queryRawUnsafe).not.toHaveBeenCalled();
  });

  it('excludes cancelled reservations from appointment count', async () => {
    const prisma = {
      $queryRaw: jest.fn().mockResolvedValue([{ appointment_count: 2 }]),
      $queryRawUnsafe: jest.fn(),
    };
    const service = new BrainReadonlyQueryExecutorService(prisma as never);

    await service.execute({
      metric: 'appointment_count',
      queryKey: 'appointment_count',
      label: '预约数',
      valueField: 'appointment_count',
      sql: '',
      params: [1],
      filters: { storeId: 1 },
      citations: [],
    });

    const sql = prisma.$queryRaw.mock.calls[0][0].strings.join(' ');
    expect(sql).toContain('"status" not in');
    expect(sql).toContain('cancelled');
    expect(sql).toContain('已取消');
  });

  it('treats low stock as current safety-stock warning without createdAt period filter', async () => {
    const prisma = {
      $queryRaw: jest.fn().mockResolvedValue([{ stockout_sku_count: 1 }]),
      $queryRawUnsafe: jest.fn(),
    };
    const service = new BrainReadonlyQueryExecutorService(prisma as never);

    await service.execute({
      metric: 'stockout_sku_count',
      queryKey: 'stockout_sku_count',
      label: '低库存 SKU 数',
      valueField: 'stockout_sku_count',
      sql: '',
      params: [1],
      filters: { storeId: 1, startDate: new Date('2026-07-01'), endDate: new Date('2026-07-10') },
      citations: [],
    });

    const sql = prisma.$queryRaw.mock.calls[0][0].strings.join(' ');
    expect(sql).toContain('"safetyStock" > 0');
    expect(sql).toContain('"currentStock" < "safetyStock"');
    expect(sql).not.toContain('"createdAt" between');
  });
});
