import { BrainFinanceSkillsService } from './skills/brain-finance-skills.service.js';

describe('BrainFinanceSkillsService cost analysis', () => {
  it('combines settlements, operating costs, commissions and active-card liability', async () => {
    const prisma = {
      dailySettlement: {
        findMany: jest.fn().mockResolvedValue([
          { totalRevenue: 10000, materialCost: 2000, grossProfit: 8000, commissionTotal: 900 },
        ]),
      },
      operatingCost: {
        findMany: jest.fn().mockResolvedValue([
          { category: '房租', amount: 1000 },
          { category: '水电', amount: 500 },
        ]),
      },
      commissionRecord: { findMany: jest.fn().mockResolvedValue([{ amount: 1000 }]) },
      customerCard: {
        findMany: jest.fn().mockResolvedValue([
          { remainingTimes: 10, recognizedUnitValue: 500 },
        ]),
      },
    };
    const service = new BrainFinanceSkillsService(prisma as never);

    const result = await service.buildCostAnalysis({
      storeId: 6,
      startDate: new Date('2026-07-01T00:00:00.000Z'),
      endDate: new Date('2026-07-31T23:59:59.999Z'),
    });

    expect(result).toMatchObject({
      revenue: 10000,
      materialCost: 2000,
      commissionCost: 1000,
      operatingCost: 1500,
      grossProfit: 8000,
      grossMarginRate: 0.8,
      cardLiability: 5000,
    });
  });
});
