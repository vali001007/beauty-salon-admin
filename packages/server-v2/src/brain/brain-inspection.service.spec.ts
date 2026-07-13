import { BrainRiskSkillsService } from './skills/brain-risk-skills.service.js';
import { BrainInspectionService } from './inspection/brain-inspection.service.js';

describe('BrainRiskSkillsService', () => {
  it('sorts risk items by severity and includes evidence and action', () => {
    const service = new BrainRiskSkillsService();
    const items = service.formatRisks([
      { title: '次卡临期未约', severity: 80, evidence: ['12 人到期前 14 天'], action: '创建邀约任务', entry: '/customer-marketing/workbench' },
      { title: '预约未确认', severity: 40, evidence: ['3 个预约未确认'], action: '提醒前台确认', entry: '/stores/reservations' },
    ]);

    expect(items[0].title).toBe('次卡临期未约');
    expect(items[0]).toHaveProperty('evidence');
    expect(items[0]).toHaveProperty('entry');
  });
});

describe('BrainInspectionService', () => {
  const rules = [
    {
      id: 1,
      ruleKey: 'customer_churn_risk',
      name: '高价值客户沉睡',
      domain: 'customer',
      condition: { minTotalSpent: 5000, inactiveDays: 60 },
      suggestionTpl: { action: '创建客户跟进任务' },
      riskLevel: 'high',
      enabled: true,
      version: 2,
    },
  ];
  const prisma = {
    brainInspectionRule: { findMany: jest.fn().mockResolvedValue(rules) },
    brainInspectionRun: {
      create: jest.fn().mockResolvedValue({ id: 11, storeId: 6, status: 'running' }),
      update: jest.fn().mockResolvedValue({ id: 11, status: 'completed', findingCount: 1 }),
    },
    brainInspectionFinding: {
      upsert: jest.fn().mockResolvedValue({ id: 21, dedupeKey: 'customer_churn_risk:customer:7', status: 'open' }),
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      findMany: jest.fn().mockResolvedValue([]),
      update: jest.fn(),
    },
    customer: {
      findMany: jest.fn().mockResolvedValue([{ id: 7, name: '张女士', totalSpent: 12000, lastVisitDate: new Date('2026-04-01') }]),
    },
    store: { findMany: jest.fn().mockResolvedValue([]) },
  };
  const service = new BrainInspectionService(prisma as never, {
    buildFinanceCostAnalysis: jest.fn(),
    buildInventoryRiskSummary: jest.fn(),
    buildReceptionOperationsSnapshot: jest.fn(),
    buildManagerStaffAnalysis: jest.fn(),
    buildMarketingAnalytics: jest.fn(),
  } as never);

  beforeEach(() => jest.clearAllMocks());

  it('loads enabled versioned rules from the database', async () => {
    prisma.brainInspectionRule.findMany.mockResolvedValueOnce(rules);

    await expect(service.listRules()).resolves.toEqual(rules);
    expect(prisma.brainInspectionRule.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { enabled: true } }));
  });

  it('runs real facts, upserts a deduplicated finding and completes the run', async () => {
    prisma.brainInspectionRule.findMany.mockResolvedValueOnce(rules);
    prisma.brainInspectionRun.create.mockResolvedValueOnce({ id: 11, storeId: 6, status: 'running' });
    prisma.customer.findMany.mockResolvedValueOnce([{ id: 7, name: '张女士', totalSpent: 12000, lastVisitDate: new Date('2026-04-01') }]);

    const result = await service.runInspection({ storeId: 6, triggerType: 'manual', now: new Date('2026-07-11T08:00:00+08:00') });

    expect(prisma.brainInspectionFinding.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { storeId_dedupeKey: { storeId: 6, dedupeKey: 'customer_churn_risk:customer:7' } },
      create: expect.objectContaining({ storeId: 6, objectId: '7', severity: 'high' }),
      update: expect.objectContaining({ status: 'open', resolvedAt: null }),
    }));
    expect(prisma.brainInspectionRun.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 11 },
      data: expect.objectContaining({ status: 'completed', ruleCount: 1, findingCount: 1 }),
    }));
    expect(result).toMatchObject({ runId: 11, findingCount: 1 });
  });

  it('closes an existing finding when the risk no longer matches', async () => {
    prisma.brainInspectionRule.findMany.mockResolvedValueOnce(rules);
    prisma.brainInspectionRun.create.mockResolvedValueOnce({ id: 12, storeId: 6, status: 'running' });
    prisma.customer.findMany.mockResolvedValueOnce([]);

    await service.runInspection({ storeId: 6, triggerType: 'manual', now: new Date('2026-07-11T08:00:00+08:00') });

    expect(prisma.brainInspectionFinding.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ storeId: 6, ruleKey: 'customer_churn_risk', status: 'open' }),
      data: expect.objectContaining({ status: 'resolved' }),
    }));
  });
});
