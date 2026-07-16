import { BrainFinanceSkillsService } from './skills/brain-finance-skills.service.js';

describe('BrainFinanceSkillsService', () => {
  it('does not report 0% gross margin when no settlement rows exist', async () => {
    const prisma = {
      refundRecord: { findMany: jest.fn().mockResolvedValue([]) },
      productOrder: { findMany: jest.fn().mockResolvedValue([]) },
      dailySettlement: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const service = new BrainFinanceSkillsService(prisma as never);

    const summary = await service.buildFinanceRiskSummary({
      storeId: 2,
      startDate: new Date('2026-07-01'),
      endDate: new Date('2026-07-10'),
    });

    expect(summary.grossMarginRate).toBeUndefined();
    expect(summary.riskItems.join('')).not.toContain('毛利率 0.0%');
  });

  it('returns one rounded point per Shanghai calendar day for income trends', async () => {
    const prisma = {
      dailySettlement: {
        findMany: jest.fn().mockResolvedValue([
          {
            settleDate: new Date('2026-07-01T00:00:00.000Z'), totalRevenue: 25553.27000000001,
            cashRevenue: 0, wechatRevenue: 25553.27000000001, alipayRevenue: 0, cardRevenue: 0, balanceRevenue: 0,
            rechargeIncome: 0, orderCount: 5, customerCount: 4, avgTransaction: 0,
            status: 'confirmed', reconciliationStatus: 'passed',
            confirmedAt: new Date('2026-07-04T00:00:00.000Z'), updatedAt: new Date('2026-07-04T00:00:00.000Z'),
          },
          {
            settleDate: new Date('2026-07-01T08:00:00.000Z'), totalRevenue: 3407,
            cashRevenue: 0, wechatRevenue: 3407, alipayRevenue: 0, cardRevenue: 0, balanceRevenue: 0,
            rechargeIncome: 0, orderCount: 1, customerCount: 1, avgTransaction: 0,
            status: 'draft', reconciliationStatus: 'pending', confirmedAt: null,
            updatedAt: new Date('2026-07-02T00:00:00.000Z'),
          },
          {
            settleDate: new Date('2026-07-03T00:00:00.000Z'), totalRevenue: 100,
            cashRevenue: 0, wechatRevenue: 100, alipayRevenue: 0, cardRevenue: 0, balanceRevenue: 0,
            rechargeIncome: 0, orderCount: 1, customerCount: 1, avgTransaction: 0,
            status: 'confirmed', reconciliationStatus: 'passed',
            confirmedAt: new Date('2026-07-04T00:00:00.000Z'), updatedAt: new Date('2026-07-04T00:00:00.000Z'),
          },
        ]),
      },
      paymentRecord: { findMany: jest.fn().mockResolvedValue([]) },
      productOrder: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const service = new BrainFinanceSkillsService(prisma as never);

    const result = await service.buildIncomeAnalysis({
      storeId: 6,
      startDate: new Date('2026-07-01T00:00:00+08:00'),
      endDate: new Date('2026-07-03T23:59:59+08:00'),
    });

    expect(result.totalCollected).toBe(25653.27);
    expect(result.paymentBreakdown).toEqual([{ method: 'wechat', amount: 25653.27, count: 0 }]);
    expect(result.dailyTrend).toEqual([
      { date: '2026-07-01', revenue: 25553.27, orderCount: 5, customerCount: 4, avgTransaction: 5110.65 },
      { date: '2026-07-02', revenue: 0, orderCount: 0, customerCount: 0, avgTransaction: 0 },
      { date: '2026-07-03', revenue: 100, orderCount: 1, customerCount: 1, avgTransaction: 100 },
    ]);
  });

  it('uses the authoritative settlement once for risk and cost calculations', async () => {
    const confirmed = {
      settleDate: new Date('2026-07-01T00:00:00.000Z'),
      totalRevenue: 1000,
      grossProfit: 600,
      materialCost: 200,
      commissionTotal: 100,
      status: 'confirmed',
      reconciliationStatus: 'passed',
      confirmedAt: new Date('2026-07-02T00:00:00.000Z'),
      updatedAt: new Date('2026-07-02T00:00:00.000Z'),
    };
    const draft = {
      ...confirmed,
      totalRevenue: 900,
      grossProfit: 300,
      materialCost: 400,
      commissionTotal: 200,
      status: 'draft',
      reconciliationStatus: 'pending',
      confirmedAt: null,
      updatedAt: new Date('2026-07-01T12:00:00.000Z'),
    };
    const prisma = {
      refundRecord: { findMany: jest.fn().mockResolvedValue([]) },
      productOrder: { findMany: jest.fn().mockResolvedValue([]) },
      dailySettlement: { findMany: jest.fn().mockResolvedValue([draft, confirmed]) },
      operatingCost: { findMany: jest.fn().mockResolvedValue([]) },
      commissionRecord: { findMany: jest.fn().mockResolvedValue([]) },
      customerCard: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const service = new BrainFinanceSkillsService(prisma as never);
    const input = {
      storeId: 6,
      startDate: new Date('2026-07-01T00:00:00+08:00'),
      endDate: new Date('2026-07-01T23:59:59+08:00'),
    };

    const [risk, cost] = await Promise.all([
      service.buildFinanceRiskSummary(input),
      service.buildCostAnalysis(input),
    ]);

    expect(risk.grossMarginRate).toBe(0.6);
    expect(cost).toMatchObject({
      revenue: 1000,
      grossProfit: 600,
      materialCost: 200,
      commissionCost: 100,
      grossMarginRate: 0.6,
    });
  });
});
