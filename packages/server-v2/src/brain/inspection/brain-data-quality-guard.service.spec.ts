import { BrainDataQualityGuardService } from './brain-data-quality-guard.service.js';

describe('BrainDataQualityGuardService', () => {
  const prisma = {
    brainInspectionRule: { findMany: jest.fn() },
    brainInspectionFinding: { groupBy: jest.fn() },
  };

  beforeEach(() => jest.clearAllMocks());

  it('ignores disabled candidate rules by default', async () => {
    prisma.brainInspectionRule.findMany.mockResolvedValueOnce([]);
    const service = new BrainDataQualityGuardService(prisma as never, {
      runtime: { allowCandidateInspectionGuards: false },
    } as never);

    await expect(service.assess({ storeId: 6, capabilityKey: 'inventory_operations_overview' })).resolves.toEqual({
      status: 'trusted',
      ruleCounts: {},
      blockedFacts: [],
      limitations: [],
      candidateRulesIncluded: false,
    });
    expect(prisma.brainInspectionRule.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ enabled: true }),
    }));
    expect(prisma.brainInspectionFinding.groupBy).not.toHaveBeenCalled();
  });

  it('uses open candidate findings when the development guard is explicitly enabled', async () => {
    prisma.brainInspectionRule.findMany.mockResolvedValueOnce([
      { ruleKey: 'inventory_safety_stock_invalid' },
      { ruleKey: 'procurement_evidence_missing' },
    ]);
    prisma.brainInspectionFinding.groupBy.mockResolvedValueOnce([
      { ruleKey: 'inventory_safety_stock_invalid', _count: { _all: 26 } },
    ]);
    const service = new BrainDataQualityGuardService(prisma as never, {
      runtime: { allowCandidateInspectionGuards: true },
    } as never);

    const result = await service.assess({ storeId: 6, capabilityKey: 'inventory_operations_overview' });

    expect(result).toMatchObject({
      status: 'degraded',
      ruleCounts: { inventory_safety_stock_invalid: 26 },
      blockedFacts: expect.arrayContaining(['stock_risk', 'procurement_advice']),
      candidateRulesIncluded: true,
    });
    expect(result.limitations).toEqual(['发现 26 个商品安全库存无效，已隐藏缺货统计和采购建议。']);
    expect(prisma.brainInspectionFinding.groupBy).toHaveBeenCalledWith(expect.objectContaining({
      where: { storeId: 6, status: 'open', ruleKey: { in: ['inventory_safety_stock_invalid', 'procurement_evidence_missing'] } },
    }));
  });

  it('does not query the database for unrelated capabilities', async () => {
    const service = new BrainDataQualityGuardService(prisma as never, {
      runtime: { allowCandidateInspectionGuards: true },
    } as never);

    await expect(service.assess({ storeId: 6, capabilityKey: 'finance_risk_overview' })).resolves.toMatchObject({ status: 'trusted' });
    expect(prisma.brainInspectionRule.findMany).not.toHaveBeenCalled();
  });
});
