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

  it('filters the proactive inbox by the rule permission and exposes review only to executors', async () => {
    prisma.brainInspectionFinding.findMany.mockResolvedValueOnce([
      {
        id: 31,
        ruleKey: 'finance_margin_drop',
        ruleVersion: 1,
        domain: 'finance',
        title: '本月毛利下降',
        severity: 'high',
        status: 'open',
        objectType: 'store',
        objectId: '6',
        evidence: { dropRate: 0.2 },
        suggestion: { entry: '/brain' },
        firstDetectedAt: new Date('2026-07-20T01:00:00Z'),
        lastDetectedAt: new Date('2026-07-21T01:00:00Z'),
      },
      {
        id: 32,
        ruleKey: 'inventory_expiry',
        ruleVersion: 1,
        domain: 'inventory',
        title: '商品临期',
        severity: 'medium',
        status: 'open',
        objectType: 'stock_batch',
        objectId: '9',
        evidence: { productName: '修护面膜' },
        suggestion: { action: '处理临期库存', entry: '/inventory/expiry' },
        firstDetectedAt: new Date('2026-07-20T01:00:00Z'),
        lastDetectedAt: new Date('2026-07-21T01:00:00Z'),
      },
    ]);
    prisma.brainInspectionRule.findMany.mockResolvedValueOnce([
      { ruleKey: 'finance_margin_drop', version: 1, enabled: true, condition: { permission: 'core:operation-profit:view' } },
      { ruleKey: 'inventory_expiry', version: 1, enabled: true, condition: { permission: 'core:inventory:expiry' } },
    ]);

    const result = await service.listInbox({
      storeId: 6,
      permissions: ['core:operation-profit:view', 'core:brain:execute'],
      deniedPermissions: [],
      userId: 9,
      roles: ['store_manager'],
    });

    expect(result.items).toEqual([
      expect.objectContaining({
        id: 31,
        canReview: true,
        suggestion: expect.objectContaining({
          action: '复核成本、折扣与低毛利项目',
          entry: '/finance/profit',
        }),
      }),
    ]);
    expect(result.summary).toMatchObject({ total: 1, high: 1, medium: 0 });
  });

  it('keeps disabled candidate findings out of the product inbox', async () => {
    prisma.brainInspectionFinding.findMany.mockResolvedValueOnce([{
      id: 34,
      ruleKey: 'inventory_safety_stock_invalid',
      ruleVersion: 1,
      domain: 'product',
      title: '库存安全线缺失',
      severity: 'medium',
      status: 'open',
      objectType: 'product',
      objectId: '301',
      evidence: {},
      suggestion: {},
      firstDetectedAt: new Date(),
      lastDetectedAt: new Date(),
    }]);
    prisma.brainInspectionRule.findMany.mockResolvedValueOnce([
      { ruleKey: 'inventory_safety_stock_invalid', version: 1, enabled: false, condition: { permission: 'core:inventory:stock' } },
    ]);

    const result = await service.listInbox({
      storeId: 6,
      permissions: ['*'],
      deniedPermissions: [],
      userId: 9,
      roles: ['store_manager'],
    });

    expect(result.items).toEqual([]);
    expect(result.summary.total).toBe(0);
  });

  it('limits beautician findings to personally assigned service tasks and reservations', async () => {
    prisma.brainInspectionFinding.findMany.mockResolvedValueOnce([
      { id: 35, ruleKey: 'service_task_state_inconsistent', ruleVersion: 1, objectType: 'service_task', objectId: '201' },
      { id: 36, ruleKey: 'service_task_state_inconsistent', ruleVersion: 1, objectType: 'service_task', objectId: '202' },
      { id: 37, ruleKey: 'reception_in_store_state_stale', ruleVersion: 1, objectType: 'reservation', objectId: '301' },
    ]);
    prisma.brainInspectionRule.findMany.mockResolvedValueOnce([
      { ruleKey: 'service_task_state_inconsistent', version: 1, enabled: true, condition: { permission: 'core:store:reservations' } },
      { ruleKey: 'reception_in_store_state_stale', version: 1, enabled: true, condition: { permission: 'core:store:reservations' } },
    ]);
    prisma.serviceTask.findMany.mockResolvedValueOnce([{ id: 201 }]);
    prisma.reservation.findMany.mockResolvedValueOnce([]);

    const result = await service.listFindings({
      storeId: 6,
      permissions: ['core:store:reservations'],
      deniedPermissions: [],
      userId: 32,
      roles: ['beautician'],
      enabledRulesOnly: true,
    });

    expect(result.map((item) => item.id)).toEqual([35]);
    expect(prisma.serviceTask.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ storeId: 6, beautician: { userId: 32 } }),
    }));
  });

  it('honors denied permissions when filtering inspection findings', async () => {
    prisma.brainInspectionFinding.findMany.mockResolvedValueOnce([{
      id: 33,
      ruleKey: 'finance_margin_drop',
      ruleVersion: 1,
      severity: 'high',
      status: 'open',
      lastDetectedAt: new Date(),
    }]);
    prisma.brainInspectionRule.findMany.mockResolvedValueOnce([
      { ruleKey: 'finance_margin_drop', version: 1, condition: { permission: 'core:operation-profit:view' } },
    ]);

    await expect(service.listFindings({
      storeId: 6,
      permissions: ['*'],
      deniedPermissions: ['core:operation-profit:view'],
    })).resolves.toEqual([]);
  });

  it('runs only rules due in the current scheduled minute', async () => {
    const scheduledRules = [
      { ...rules[0], ruleKey: 'morning-8', scheduleCron: '0 8 * * *' },
      { ...rules[0], ruleKey: 'morning-9', scheduleCron: '0 9 * * *' },
    ];
    prisma.brainInspectionRule.findMany.mockResolvedValueOnce(scheduledRules);
    prisma.store.findMany.mockResolvedValueOnce([{ id: 6 }, { id: 7 }]);
    const run = jest.spyOn(service, 'runInspection').mockResolvedValue({ status: 'completed' } as never);

    const result = await service.runScheduledInspections(new Date('2026-07-21T09:00:00+08:00'));

    expect(result).toMatchObject({ storeCount: 2, ruleCount: 1, ruleKeys: ['morning-9'] });
    expect(run).toHaveBeenCalledTimes(2);
    expect(run).toHaveBeenCalledWith(expect.objectContaining({ ruleKeys: ['morning-9'], triggerType: 'schedule' }));
    run.mockRestore();
  });

  it('does not scan stores when no valid rule is due', async () => {
    prisma.brainInspectionRule.findMany.mockResolvedValueOnce([
      { ...rules[0], scheduleCron: 'invalid cron' },
    ]);

    await expect(service.runScheduledInspections(new Date('2026-07-21T09:00:00+08:00'))).resolves.toMatchObject({
      storeCount: 0,
      ruleCount: 0,
    });
    expect(prisma.store.findMany).not.toHaveBeenCalled();
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
