import { BrainOrchestratorService } from './orchestrator/brain-orchestrator.service.js';
import { ForbiddenException } from '@nestjs/common';

describe('BrainOrchestratorService', () => {
  it('routes finance question to finance agent and store manager summary', () => {
    const orchestrator = new BrainOrchestratorService({} as never, {} as never, {} as never);
    const plan = orchestrator.planTasks({ intent: 'diagnose_profit_drop', metrics: ['paid_revenue', 'gross_margin_rate'] });

    expect(plan.tasks.map((task) => task.roleKey)).toEqual(['finance', 'store_manager']);
  });

  it('keeps seven role keys fixed for MVP', () => {
    expect(BrainOrchestratorService.MVP_ROLE_KEYS).toEqual([
      'store_manager',
      'receptionist',
      'beautician',
      'marketing',
      'finance',
      'inventory',
      'customer_service',
    ]);
  });

  it('creates a permission-prechecked DAG for composite profit diagnosis', () => {
    const orchestrator = new BrainOrchestratorService();
    const plan = orchestrator.createTaskPlan({
      message: '为什么本周利润下降',
      runtimeIntent: { intent: 'diagnosis', expectedShape: 'non_metric', allowsScalarMetric: false, reason: 'diagnosis' },
      cognition: {
        normalizedText: '',
        terms: [],
        metrics: ['gross_margin_rate'],
        dimensions: [],
        entities: [],
        unsupportedTerms: [],
        intent: { key: 'diagnose_profit_drop', confidence: 0.9, reason: 'diagnosis' },
        needsClarification: false,
      },
      context: {
        userId: 9,
        storeId: 2,
        visibleStoreIds: [2],
        permissions: ['*'],
        deniedPermissions: [],
        requestId: 'req',
        timezone: 'Asia/Shanghai',
      },
    });

    expect(plan?.nodes.filter((node) => node.kind === 'adapter')).toHaveLength(4);
    expect(plan?.nodes.at(-1)).toMatchObject({ id: 'supervisor_summary', kind: 'summary' });
    expect(plan?.nodes.at(-1)?.dependencies).toHaveLength(4);
  });

  it('does not treat an employee performance decline question as a store profit diagnosis', () => {
    const orchestrator = new BrainOrchestratorService();
    const plan = orchestrator.createTaskPlan({
      message: '有没有员工这周业绩明显下滑',
      runtimeIntent: {
        intent: 'diagnosis',
        expectedShape: 'non_metric',
        allowsScalarMetric: false,
        reason: 'diagnosis',
      },
      cognition: {
        normalizedText: '有没有员工这周业绩明显下滑',
        terms: [],
        metrics: [],
        dimensions: [],
        entities: [],
        unsupportedTerms: [],
        intent: { key: 'diagnose_profit_drop', confidence: 0.9, reason: 'diagnosis' },
        needsClarification: false,
      },
      context: {
        userId: 9,
        storeId: 2,
        visibleStoreIds: [2],
        permissions: ['*'],
        deniedPermissions: [],
        requestId: 'req',
        timezone: 'Asia/Shanghai',
      },
    });

    expect(plan).toBeUndefined();
  });

  it('rejects composite plans when roleHint cannot grant missing permissions', () => {
    const orchestrator = new BrainOrchestratorService();

    expect(() =>
      orchestrator.createTaskPlan({
        message: '为什么本周利润下降',
        runtimeIntent: { intent: 'diagnosis', expectedShape: 'non_metric', allowsScalarMetric: false, reason: 'diagnosis' },
        cognition: {
          normalizedText: '',
          terms: [],
          metrics: [],
          dimensions: [],
          entities: [],
          unsupportedTerms: [],
          intent: { key: 'diagnose_profit_drop', confidence: 0.9, reason: 'diagnosis' },
          needsClarification: false,
        },
        context: {
          userId: 9,
          storeId: 2,
          visibleStoreIds: [2],
          permissions: ['core:finance:view'],
          deniedPermissions: [],
          requestId: 'req',
          timezone: 'Asia/Shanghai',
        },
      }),
    ).toThrow(ForbiddenException);
  });

  it.each([
    ['临近年底，帮我从经营、客户、库存三个维度做个盘点', 'year_end_multi_domain_review', 3],
    ['帮我把店里所有的问题都找出来，给我一个完整的改进方案', 'full_store_improvement_review', 5],
  ])('creates a real multi-domain DAG for broad review: %s', (message, planKey, adapterNodeCount) => {
    const orchestrator = new BrainOrchestratorService();
    const plan = orchestrator.createTaskPlan({
      message,
      runtimeIntent: { intent: 'diagnosis', expectedShape: 'non_metric', allowsScalarMetric: false, reason: 'edge_review' },
      cognition: {
        normalizedText: message,
        terms: [],
        metrics: [],
        dimensions: [],
        entities: [],
        unsupportedTerms: [],
        intent: { key: 'general_assistant', confidence: 0.8, reason: 'edge_review' },
        needsClarification: false,
      },
      context: {
        userId: 9,
        storeId: 2,
        visibleStoreIds: [2],
        permissions: ['*'],
        deniedPermissions: [],
        requestId: 'req',
        timezone: 'Asia/Shanghai',
      },
    });

    expect(plan?.planKey).toBe(planKey);
    expect(plan?.nodes.filter((node) => node.kind === 'adapter')).toHaveLength(adapterNodeCount);
    expect(plan?.nodes.at(-1)).toMatchObject({ id: 'supervisor_summary', kind: 'summary' });
  });
});
