import type { PrismaService } from '../../prisma/prisma.service.js';
import { AgentV2BusinessTrendQueryService } from './agent-v2-business-trend-query.service.js';

describe('AgentV2BusinessTrendQueryService', () => {
  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(new Date(2026, 6, 6, 12, 0, 0));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('aggregates revenue trend from ProductOrder by business date', async () => {
    const findMany = jest.fn().mockResolvedValue([
      { id: 1, orderNo: 'PO001', createdAt: new Date('2026-07-01T02:00:00.000Z'), totalAmount: 100, netAmount: 90, status: 'completed' },
      { id: 2, orderNo: 'PO002', createdAt: new Date('2026-07-01T08:00:00.000Z'), totalAmount: 200, netAmount: 180, status: 'completed' },
      { id: 3, orderNo: 'PO003', createdAt: new Date('2026-07-02T02:00:00.000Z'), totalAmount: 300, netAmount: 300, status: 'completed' },
    ]);
    const service = new AgentV2BusinessTrendQueryService({
      productOrder: { findMany },
    } as unknown as PrismaService);

    const result = await service.execute(
      { capabilityId: 'finance.revenue.trend', question: '最近三天营业额趋势怎么样' },
      { runId: 1, storeId: 6, role: 'manager' },
    );

    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        storeId: 6,
        status: { notIn: ['cancelled', 'void', '作废', '已取消'] },
      }),
      orderBy: { createdAt: 'asc' },
      take: 5000,
    }));
    expect(result.status).toBe('success');
    expect(result.evidence?.source).toContain('ProductOrder');
    expect((result.data as any).chart).toMatchObject({ chartType: 'line', title: '营业额趋势', xKey: 'date', yKeys: ['revenue'] });
    expect((result.data as any).items).toEqual(expect.arrayContaining([
      expect.objectContaining({ revenue: 270, orderCount: 2 }),
      expect.objectContaining({ revenue: 300, orderCount: 1 }),
    ]));
    expect((result.data as any).metrics).toMatchObject({
      totalRevenue: 570,
      orderCount: 3,
    });
  });

  it('uses recent month phrases from the question instead of the trend default window', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const service = new AgentV2BusinessTrendQueryService({
      productOrder: { findMany },
    } as unknown as PrismaService);

    const result = await service.execute(
      { capabilityId: 'finance.revenue.trend', question: '最近3个月营业额趋势' },
      { runId: 1, storeId: 6, role: 'manager' },
    );

    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        createdAt: {
          gte: new Date(2026, 4, 1),
          lt: new Date(2026, 6, 6, 12, 0, 0),
        },
      }),
    }));
    expect((result.data as any).timeRange).toMatchObject({
      label: '近 3 个月',
      preset: 'last_3_months',
      start: '2026-05-01',
      end: '2026-07-06',
    });
  });
});
