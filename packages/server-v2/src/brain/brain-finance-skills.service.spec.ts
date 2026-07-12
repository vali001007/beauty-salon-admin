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
});
