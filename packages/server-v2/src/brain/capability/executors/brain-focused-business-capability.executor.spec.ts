import { BrainTimeRangeParserService } from '../../cognition/brain-time-range-parser.service.js';
import type { BrainCapabilityExecutionInput } from '../brain-capability-executor.registry.js';
import { BrainFocusedBusinessCapabilityExecutor } from './brain-focused-business-capability.executor.js';

describe('BrainFocusedBusinessCapabilityExecutor', () => {
  it('binds personal performance to the current user and returns focused KPIs', async () => {
    const skillRuntime = {
      buildBeauticianPersonalPerformance: jest.fn().mockResolvedValue({
        serviceCount: 8,
        completedCount: 7,
        scheduledMinutes: 420,
        actualMinutes: 390,
        revenueAmount: 2680,
        commissionAmount: 320,
        uniqueCustomerCount: 6,
        repeatCustomerCount: 2,
        projectRanking: [],
      }),
    };
    const executor = createExecutor({ skillRuntime });

    const result = await executor.execute(input('beautician_personal_performance', '我这个月业绩是多少', 'scalar'));

    expect(skillRuntime.buildBeauticianPersonalPerformance).toHaveBeenCalledWith(
      expect.objectContaining({ storeId: 6, userId: 9 }),
    );
    expect(result).toMatchObject({
      status: 'completed',
      grounding: 'db_skill',
      metadata: {
        capabilityKey: 'beautician_personal_performance',
        identitySource: 'server_context_user',
      },
    });
    expect(result.answer).toContain('个人服务业绩 2680.00 元');
  });

  it('uses the existing operation profit service for project margin ranking', async () => {
    const operationProfit = {
      getProjectMargins: jest.fn().mockResolvedValue({
        items: [
          projectMargin({ projectId: 1, projectName: '肩颈护理', materialCost: 100, contributionProfit: 300 }),
          projectMargin({ projectId: 2, projectName: '面部护理', materialCost: 260, contributionProfit: 500 }),
        ],
        total: 2,
        page: 1,
        pageSize: 100,
      }),
    };
    const executor = createExecutor({ operationProfit });

    const result = await executor.execute(input('project_margin_analysis', '哪个项目的成本最高', 'ranking'));

    expect(operationProfit.getProjectMargins).toHaveBeenCalledWith(
      expect.objectContaining({ storeId: 6, page: 1, pageSize: 100 }),
    );
    expect(result.answer).toContain('面部护理');
    expect(result.blocks).toEqual([
      expect.objectContaining({
        kind: 'ranking',
        rows: expect.arrayContaining([expect.objectContaining({ projectName: '面部护理', materialCost: 260 })]),
      }),
    ]);
  });

  it('calculates project income share from the management project profit facts', async () => {
    const operationProfit = {
      getProjectMargins: jest.fn().mockResolvedValue({
        items: [
          projectMargin({ projectId: 1, projectName: '肩颈护理', serviceIncome: 3000, materialCost: 100, contributionProfit: 1800 }),
          projectMargin({ projectId: 2, projectName: '面部护理', serviceIncome: 1000, materialCost: 260, contributionProfit: 500 }),
        ],
        total: 2,
        page: 1,
        pageSize: 100,
      }),
    };
    const executor = createExecutor({ operationProfit });

    const result = await executor.execute(
      input('project_margin_analysis', '帮我统计一下这个月每个项目的收入占比', 'ranking'),
    );

    expect(result.answer).toContain('项目服务收入合计 4000.00 元');
    expect(result.answer).toContain('肩颈护理');
    expect(result.answer).toContain('75.0%');
    expect(result).toMatchObject({ metadata: { answerScope: 'project_income_share_ranking' } });
    expect(result.blocks).toEqual([
      expect.objectContaining({
        kind: 'ranking',
        rows: [
          expect.objectContaining({ projectName: '肩颈护理', incomeShare: '75.0%' }),
          expect.objectContaining({ projectName: '面部护理', incomeShare: '25.0%' }),
        ],
      }),
    ]);
  });

  it('reports the actual material collection gap instead of substituting BOM or outbound data', async () => {
    const prisma = {
      serviceTask: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 1,
            projectId: 11,
            project: { name: '补水护理' },
            consumptionItems: [{ productName: '补水面膜', standardQty: 1, unit: '片' }],
          },
        ]),
      },
    };
    const executor = createExecutor({ prisma });

    const result = await executor.execute(
      input('project_material_consumption_analysis', '这个月哪个项目消耗耗材最多', 'ranking'),
    );

    expect(result.answer).toContain('实际耗材数量采集覆盖为 0');
    expect(result.answer).toContain('不会用标准 BOM 或商品出库排行替代');
    expect(result).toMatchObject({
      metadata: {
        unsupportedReason: 'project_actual_material_quantity_not_recorded',
        completedTaskCount: 1,
      },
    });
    expect(result.blocks).toEqual([
      expect.objectContaining({ kind: 'ranking', rows: [] }),
      expect.objectContaining({ kind: 'limitations', items: expect.arrayContaining([
        'no_data: project_actual_material_quantity_not_recorded',
      ]) }),
    ]);
  });

  it('uses the management project cost service for project material cost questions', async () => {
    const operationProfit = {
      getProjectMargins: jest.fn().mockResolvedValue({
        items: [
          projectMargin({ projectId: 1, projectName: '肩颈护理', materialCost: 100, contributionProfit: 300 }),
          projectMargin({ projectId: 2, projectName: '面部护理', materialCost: 260, contributionProfit: 500 }),
        ],
        total: 2,
        page: 1,
        pageSize: 100,
      }),
    };
    const executor = createExecutor({ operationProfit });

    const result = await executor.execute(
      input('project_material_consumption_analysis', '这个月各项目的耗材成本各是多少', 'ranking'),
    );

    expect(result.answer).toContain('面部护理');
    expect(result.answer).toContain('260.00 元');
    expect(result).toMatchObject({ metadata: { answerScope: 'project_material_cost_ranking' } });
    expect(result.blocks).toEqual([
      expect.objectContaining({
        kind: 'ranking',
        rows: expect.arrayContaining([expect.objectContaining({ projectName: '面部护理', materialCost: 260 })]),
      }),
    ]);
  });

  it('returns material cost rather than operating cost for a material cost question', async () => {
    const skillRuntime = {
      buildFinanceCostAnalysis: jest.fn().mockResolvedValue({
        revenue: 10000,
        materialCost: 1800,
        commissionCost: 900,
        operatingCost: 5600,
        grossProfit: 7300,
        grossMarginRate: 0.73,
        cardLiability: 0,
        costCategories: [],
      }),
    };
    const executor = createExecutor({ skillRuntime });

    const result = await executor.execute(input('finance_material_cost_summary', '这个月耗材成本占了多少', 'scalar'));

    expect(result.answer).toContain('耗材成本 1800.00 元');
    expect(result.answer).toContain('18.0%');
    expect(result.answer).not.toContain('5600');
  });

  it('does not substitute staff performance for an unavailable staff refund attribution', async () => {
    const prisma = {
      refundRecord: { count: jest.fn().mockResolvedValue(4) },
      serviceTask: { findMany: jest.fn() },
    };
    const executor = createExecutor({ prisma });

    const result = await executor.execute(
      input('finance_staff_refund_rate_boundary', '哪个美容师的退款率最高', 'ranking'),
    );

    expect(prisma.refundRecord.count).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ order: { storeId: 6 } }) }),
    );
    expect(result.answer).toContain('4 笔有效退款记录');
    expect(result.answer).toContain('不会用员工表现分、业绩或全店退款率替代');
    expect(result.blocks).toEqual([
      expect.objectContaining({ kind: 'ranking', rows: [] }),
      expect.objectContaining({ kind: 'limitations', items: expect.arrayContaining([
        'no_data: staff_refund_attribution_not_available',
      ]) }),
    ]);
  });

  it('keeps transaction anomaly claims within the currently published aggregate rules', async () => {
    const skillRuntime = {
      buildFinanceRiskSummary: jest.fn().mockResolvedValue({
        refundAmount: 300,
        refundCount: 2,
        discountAmount: 100,
        grossMarginRate: 0.5,
        riskItems: ['退款金额 300.00 元，需要复核原因。'],
      }),
    };
    const executor = createExecutor({ skillRuntime });

    const result = await executor.execute(
      input('finance_transaction_anomaly_review', '这个月有没有不正常的流水', 'diagnosis'),
    );

    expect(result.answer).toContain('聚合财务风险');
    expect(result.answer).toContain('未发布逐笔异常流水判定规则');
    expect(result).toMatchObject({
      metadata: {
        capabilityKey: 'finance_transaction_anomaly_review',
        transactionLevelRuleAvailable: false,
      },
    });
    expect(result.blocks).toEqual(
      expect.arrayContaining([expect.objectContaining({ kind: 'diagnosis' }), expect.objectContaining({ kind: 'limitations' })]),
    );
  });

  it('returns a cited informational diagnosis when no aggregate finance risk is found', async () => {
    const executor = createExecutor({
      skillRuntime: {
        buildFinanceRiskSummary: jest.fn().mockResolvedValue({ riskItems: [] }),
      },
    });

    const result = await executor.execute(
      input('finance_transaction_anomaly_review', '有没有需要复核的退款和优惠风险', 'diagnosis'),
    );

    expect(result.blocks).toEqual(expect.arrayContaining([
      expect.objectContaining({
        kind: 'diagnosis',
        findings: [expect.objectContaining({ severity: 'info', title: '当前未命中聚合风险' })],
      }),
    ]));
  });

  it('returns receipt discrepancy guidance without performing inventory writes', async () => {
    const executor = createExecutor({});

    const result = await executor.execute(
      input('inventory_receipt_discrepancy_guidance', '有货品到了但和采购单不符，怎么处理', 'diagnosis'),
    );

    expect(result).toMatchObject({
      status: 'completed',
      grounding: 'template_skill',
      metadata: {
        capabilityKey: 'inventory_receipt_discrepancy_guidance',
        deliveryStatus: 'guidance_only',
      },
    });
    expect(result.answer).toContain('先不要确认整单收货');
    expect(result.answer).toContain('不会自动入库');
  });

  it('returns attributed revenue and discloses the missing campaign cost fact', async () => {
    const skillRuntime = {
      buildMarketingAnalytics: jest.fn().mockResolvedValue({
        reachedCount: 100,
        convertedCount: 8,
        attributedRevenue: 3600,
      }),
    };
    const executor = createExecutor({ skillRuntime });

    const result = await executor.execute(
      input('marketing_campaign_cost_attribution_review', '这个月活动花了多少钱，带来了多少收入', 'diagnosis'),
    );

    expect(result.answer).toContain('已归因收入 3600.00 元');
    expect(result.answer).toContain('没有统一的营销活动成本事实');
    expect(result.blocks).toEqual(
      expect.arrayContaining([expect.objectContaining({ kind: 'kpi' }), expect.objectContaining({ kind: 'diagnosis' })]),
    );
  });
});

function createExecutor(overrides: {
  skillRuntime?: Record<string, jest.Mock>;
  operationProfit?: Record<string, jest.Mock>;
  prisma?: Record<string, unknown>;
}) {
  return new BrainFocusedBusinessCapabilityExecutor(
    (overrides.skillRuntime ?? {}) as never,
    (overrides.operationProfit ?? {}) as never,
    (overrides.prisma ?? { serviceTask: { findMany: jest.fn() } }) as never,
    new BrainTimeRangeParserService(),
  );
}

function input(capabilityKey: string, question: string, answerShape: BrainCapabilityExecutionInput['answerShape']) {
  return {
    card: {
      key: capabilityKey,
      version: 1,
      name: capabilityKey,
      description: capabilityKey,
      intents: ['query'],
      examples: [question],
      negativeExamples: [],
      synonyms: [],
      businessDefinitionKeys: [],
      requiredPermissions: ['core:brain:use'],
      allowedRoles: [],
      riskLevel: 'low',
      storeScope: 'required',
      readOnly: true,
      requiresConfirmation: false,
      idempotency: 'not_applicable',
      sourceFingerprint: 'test',
      sourceRefs: [],
      status: 'published',
    },
    context: {
      userId: 9,
      storeId: 6,
      visibleStoreIds: [6],
      roles: ['store_manager'],
      permissions: ['*'],
      deniedPermissions: [],
      requestId: `focused-${capabilityKey}`,
      timezone: 'Asia/Shanghai',
    },
    runId: 1,
    question,
    answerShape,
    args: {
      objective: question,
      entities: [],
      metrics: [],
      dimensions: [],
      filters: [],
      orderBy: [],
      time: {
        preset: 'this_month',
        label: '本月',
        timezone: 'Asia/Shanghai',
        startDate: '2026-07-01',
        endDate: '2026-07-31',
      },
    },
  } as unknown as BrainCapabilityExecutionInput;
}

function projectMargin(input: {
  projectId: number;
  projectName: string;
  serviceIncome?: number;
  materialCost: number;
  contributionProfit: number;
}) {
  return {
    projectId: input.projectId,
    projectName: input.projectName,
    serviceCount: 5,
    serviceIncome: input.serviceIncome ?? 1000,
    actualMaterialCost: input.materialCost,
    standardMaterialCost: 0,
    commissionCost: 100,
    contributionProfit: input.contributionProfit,
    marginRate: input.contributionProfit / (input.serviceIncome ?? 1000),
    status: 'complete',
    missingCostReasons: [],
  };
}
