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
    reservation: { findMany: jest.fn().mockResolvedValue([]) },
    serviceTask: { findMany: jest.fn().mockResolvedValue([]) },
    product: { findMany: jest.fn().mockResolvedValue([]) },
    store: { findMany: jest.fn().mockResolvedValue([]) },
  };
  const skillRuntime = {
    buildFinanceCostAnalysis: jest.fn(),
    buildInventoryRiskSummary: jest.fn(),
    buildReceptionOperationsSnapshot: jest.fn(),
    buildManagerStaffAnalysis: jest.fn(),
    buildMarketingAnalytics: jest.fn(),
    buildInventoryProcurementAnalysis: jest.fn(),
  };
  const service = new BrainInspectionService(prisma as never, skillRuntime as never);

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

  it('stores a shared-planner proposal without executing it during inspection', async () => {
    const bridge = {
      planFinding: jest.fn().mockResolvedValue({
        status: 'planned',
        semanticIntent: { schemaVersion: '1.0', intent: 'workflow' },
        plan: { planId: 'inspection:customer:7', nodes: [] },
        actionPreviews: [{ capabilityKey: 'create_customer_followup', previewOnly: true }],
      }),
    };
    const plannedService = new BrainInspectionService(prisma as never, {
      buildFinanceCostAnalysis: jest.fn(),
      buildInventoryRiskSummary: jest.fn(),
      buildReceptionOperationsSnapshot: jest.fn(),
      buildManagerStaffAnalysis: jest.fn(),
      buildMarketingAnalytics: jest.fn(),
    } as never, bridge as never);
    prisma.brainInspectionRule.findMany.mockResolvedValueOnce(rules);
    prisma.brainInspectionRun.create.mockResolvedValueOnce({ id: 13, storeId: 6, status: 'running' });
    prisma.customer.findMany.mockResolvedValueOnce([{ id: 7, name: '张女士', totalSpent: 12000, lastVisitDate: new Date('2026-04-01') }]);

    await plannedService.runInspection({ storeId: 6, triggerType: 'manual', now: new Date('2026-07-11T08:00:00+08:00') });

    expect(bridge.planFinding).toHaveBeenCalledWith(expect.objectContaining({
      storeId: 6,
      finding: expect.objectContaining({ dedupeKey: 'customer_churn_risk:customer:7' }),
    }));
    expect(prisma.brainInspectionFinding.upsert).toHaveBeenCalledWith(expect.objectContaining({
      create: expect.objectContaining({ suggestion: expect.objectContaining({ planning: expect.objectContaining({ status: 'planned' }) }) }),
    }));
  });

  it('flags stale in-store reservations and keeps the concrete remediation entry', async () => {
    prisma.brainInspectionRule.findMany.mockResolvedValueOnce([{
      ...rules[0],
      ruleKey: 'reception_in_store_state_stale',
      domain: 'reservation',
      condition: { staleHours: 12 },
      suggestionTpl: { requiresUserReview: true, autoRepair: false },
    }]);
    prisma.brainInspectionRun.create.mockResolvedValueOnce({ id: 14, storeId: 6, status: 'running' });
    prisma.reservation.findMany.mockResolvedValueOnce([{
      id: 101,
      status: 'checked_in',
      checkedInAt: new Date('2026-07-10T08:00:00+08:00'),
      customer: { name: '李女士' },
      project: { name: '补水护理' },
    }]);

    await service.runInspection({ storeId: 6, triggerType: 'manual', now: new Date('2026-07-11T08:00:00+08:00') });

    expect(prisma.reservation.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ storeId: 6, checkedInAt: expect.objectContaining({ not: null }) }),
    }));
    expect(prisma.brainInspectionFinding.upsert).toHaveBeenCalledWith(expect.objectContaining({
      create: expect.objectContaining({
        dedupeKey: 'reception_in_store_state_stale:reservation:101',
        suggestion: expect.objectContaining({
          action: '核对客户是否仍在店，并修正预约履约状态',
          entry: '/stores/reservations',
          autoRepair: false,
        }),
      }),
    }));
  });

  it('flags inconsistent and stale service-task states with explicit reasons', async () => {
    prisma.brainInspectionRule.findMany.mockResolvedValueOnce([{
      ...rules[0],
      ruleKey: 'service_task_state_inconsistent',
      domain: 'beautician',
      condition: { staleHours: 12, historyDays: 90 },
      suggestionTpl: {},
    }]);
    prisma.brainInspectionRun.create.mockResolvedValueOnce({ id: 15, storeId: 6, status: 'running' });
    prisma.serviceTask.findMany.mockResolvedValueOnce([{
      id: 201,
      taskNo: 'TASK-201',
      status: 'in_progress',
      startedAt: new Date('2026-07-10T08:00:00+08:00'),
      completedAt: null,
      customer: { name: '王女士' },
      project: { name: '舒缓护理' },
    }]);

    await service.runInspection({ storeId: 6, triggerType: 'manual', now: new Date('2026-07-11T08:00:00+08:00') });

    expect(prisma.brainInspectionFinding.upsert).toHaveBeenCalledWith(expect.objectContaining({
      create: expect.objectContaining({
        dedupeKey: 'service_task_state_inconsistent:service_task:201',
        evidence: expect.objectContaining({ reasons: ['进行中超过 12 小时'] }),
      }),
    }));
  });

  it('flags active products with invalid inventory baselines', async () => {
    prisma.brainInspectionRule.findMany.mockResolvedValueOnce([{
      ...rules[0],
      ruleKey: 'inventory_safety_stock_invalid',
      domain: 'product',
      condition: {},
      suggestionTpl: {},
    }]);
    prisma.brainInspectionRun.create.mockResolvedValueOnce({ id: 16, storeId: 6, status: 'running' });
    prisma.product.findMany.mockResolvedValueOnce([{
      id: 301,
      sku: 'SKU-301',
      name: '补水精华',
      currentStock: -1,
      safetyStock: 0,
      minPurchaseQty: 0,
    }]);

    await service.runInspection({ storeId: 6, triggerType: 'manual', now: new Date('2026-07-11T08:00:00+08:00') });

    expect(prisma.brainInspectionFinding.upsert).toHaveBeenCalledWith(expect.objectContaining({
      create: expect.objectContaining({
        dedupeKey: 'inventory_safety_stock_invalid:product:301',
        evidence: expect.objectContaining({ reasons: ['未配置有效安全库存', '当前库存为负数'] }),
      }),
    }));
  });

  it('blocks procurement confidence when a replenishment suggestion lacks supplier evidence', async () => {
    prisma.brainInspectionRule.findMany.mockResolvedValueOnce([{
      ...rules[0],
      ruleKey: 'procurement_evidence_missing',
      domain: 'product',
      condition: {},
      suggestionTpl: { requiresUserReview: true, autoRepair: false },
    }]);
    prisma.brainInspectionRun.create.mockResolvedValueOnce({ id: 17, storeId: 6, status: 'running' });
    skillRuntime.buildInventoryProcurementAnalysis.mockResolvedValueOnce({
      suggestions: [{
        productId: 401,
        sku: 'SKU-401',
        productName: '修护面膜',
        currentStock: 2,
        safetyStock: 10,
        suggestedQty: 18,
        supplierName: undefined,
        unitPrice: undefined,
      }],
    });

    await service.runInspection({ storeId: 6, triggerType: 'manual', now: new Date('2026-07-11T08:00:00+08:00') });

    expect(prisma.brainInspectionFinding.upsert).toHaveBeenCalledWith(expect.objectContaining({
      create: expect.objectContaining({
        dedupeKey: 'procurement_evidence_missing:product:401',
        evidence: expect.objectContaining({ supplierName: null, unitPrice: null }),
        suggestion: expect.objectContaining({ autoRepair: false, entry: '/inventory/purchase' }),
      }),
    }));
  });

  it('can evaluate named disabled candidate rules without invoking model planning', async () => {
    const bridge = { planFinding: jest.fn() };
    const targetedService = new BrainInspectionService(prisma as never, skillRuntime as never, bridge as never);
    prisma.brainInspectionRule.findMany.mockResolvedValueOnce([{
      ...rules[0],
      enabled: false,
      ruleKey: 'inventory_safety_stock_invalid',
      domain: 'product',
      condition: {},
      suggestionTpl: {},
    }]);
    prisma.brainInspectionRun.create.mockResolvedValueOnce({ id: 18, storeId: 6, status: 'running' });
    prisma.product.findMany.mockResolvedValueOnce([]);

    await targetedService.runInspection({
      storeId: 6,
      triggerType: 'manual',
      ruleKeys: ['inventory_safety_stock_invalid'],
      includeDisabledRules: true,
      planFindings: false,
    });

    expect(prisma.brainInspectionRule.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { ruleKey: { in: ['inventory_safety_stock_invalid'] } },
    }));
    expect(bridge.planFinding).not.toHaveBeenCalled();
  });
});
