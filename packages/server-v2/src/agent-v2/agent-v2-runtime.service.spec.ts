import { AgentV2RuntimeService } from './agent-v2-runtime.service.js';
import { AgentV2GrayStrategyService } from './agent-v2-gray-strategy.service.js';
import { AgentV2ToolRegistryService } from './agent-v2-tool-registry.service.js';
import { AgentV2CapabilityDecisionService } from './capability/agent-v2-capability-decision.service.js';
import { AgentV2CapabilityMappingService } from './capability/agent-v2-capability-mapping.service.js';
import { AgentV2AnswerContractValidatorService } from './contracts/agent-v2-answer-contract-validator.service.js';
import { AgentV2IntentExtractionService } from './intent/agent-v2-intent-extraction.service.js';
import { KnowledgeGraphIntentContextService } from './intent/knowledge-graph-intent-context.service.js';

describe('AgentV2RuntimeService', () => {
  const businessRecordQuery = {
    execute: jest.fn().mockResolvedValue({
      status: 'success',
      title: '已发生报废记录',
      summary: '本周共有 1 条报废记录。',
      data: { items: [{ productName: '舒缓修护面膜', scrapQuantityText: '2片' }] },
      evidence: {
        source: ['StockMovement'],
        sourceTables: ['StockMovement'],
        metricDefinition: 'movementType=scrap_out',
        filters: ['storeId=1'],
        sampleSize: 1,
      },
      actions: [],
    }),
  };
  const businessMetricQuery = {
    execute: jest.fn().mockResolvedValue({
      status: 'success',
      title: '日结报表指标',
      summary: '本月日结实收 ¥1,200.00，退款 ¥100.00，净收 ¥1,100.00，订单 8 单。',
      data: {
        metrics: {
          totalRevenue: 1200,
          refundAmount: 100,
          netRevenue: 1100,
          orderCount: 8,
          totalRevenueText: '¥1,200.00',
          refundAmountText: '¥100.00',
          netRevenueText: '¥1,100.00',
        },
      },
      evidence: {
        source: ['DailySettlement'],
        sourceTables: ['DailySettlement'],
        metricDefinition: '日结报表指标 = DailySettlement 已生成日结汇总。',
        filters: ['storeId=1'],
        sampleSize: 1,
      },
      actions: [],
    }),
  };
  const businessTrendQuery = {
    execute: jest.fn().mockResolvedValue({
      status: 'success',
      title: '营业额趋势',
      summary: '近 3 天营业额 ¥570.00，订单 3 单。',
      data: {
        metrics: {
          totalRevenue: 570,
          orderCount: 3,
          totalRevenueText: '¥570.00',
          avgOrderValueText: '¥190.00',
        },
        chart: {
          chartType: 'line',
          title: '营业额趋势',
          data: [
            { date: '2026-07-01', revenue: 270, orderCount: 2 },
            { date: '2026-07-02', revenue: 300, orderCount: 1 },
          ],
          xKey: 'date',
          yKeys: ['revenue'],
        },
        items: [],
      },
      evidence: {
        source: ['ProductOrder'],
        sourceTables: ['ProductOrder'],
        metricDefinition: '营业额趋势 = ProductOrder.netAmount 按业务日期聚合。',
        filters: ['storeId=1'],
        sampleSize: 3,
      },
      actions: [],
    }),
  };
  const businessDetailQuery = {
    execute: jest.fn().mockResolvedValue({
      status: 'success',
      title: '订单详情',
      summary: '已找到订单 POMQPDGTF8。',
      data: {
        detail: { orderNo: 'POMQPDGTF8', netAmountText: '¥590.00' },
        items: [{ itemName: '玻尿酸保湿精华', lineNetAmountText: '¥590.00' }],
      },
      evidence: {
        source: ['ProductOrder'],
        sourceTables: ['ProductOrder'],
        metricDefinition: '订单详情 = ProductOrder 主表及明细。',
        filters: ['storeId=1'],
        sampleSize: 1,
      },
      actions: [],
    }),
  };
  const businessActionDraft = {
    execute: jest.fn().mockResolvedValue({
      status: 'success',
      title: '库存操作草稿',
      summary: '已生成库存报废草稿，等待确认后提交审批。',
      data: {
        actionDraft: {
          operationTypeLabel: '报废',
          productName: '舒缓修护面膜',
          quantityText: '2片',
          reason: '过期或临期处理',
          approvalRequired: true,
        },
      },
      evidence: {
        source: ['Product'],
        sourceTables: ['Product'],
        metricDefinition: '库存动作草稿只读取商品并生成草稿，不直接写入库存流水。',
        filters: ['storeId=1'],
        sampleSize: 1,
      },
      actions: [{ label: '提交库存审批', action: 'inventory:stock-operation-submit', riskLevel: 'medium' }],
    }),
  };
  const navigation = {
    execute: jest.fn().mockResolvedValue({
      status: 'success',
      title: '打开收银界面',
      summary: '已生成收银界面入口。',
      data: { target: 'operation.cashier' },
      evidence: {
        source: ['AgentV2CapabilityManifest'],
        sourceTables: ['AgentV2CapabilityManifest'],
        metricDefinition: '导航能力只生成入口，不执行写入。',
        filters: [],
        sampleSize: 1,
      },
      actions: [{ label: '打开收银界面', action: 'navigation:operation.cashier', riskLevel: 'low' }],
    }),
  };

  const service = new AgentV2RuntimeService(
    new AgentV2CapabilityDecisionService(),
    new AgentV2ToolRegistryService(
      businessRecordQuery as any,
      businessMetricQuery as any,
      businessTrendQuery as any,
      businessDetailQuery as any,
      businessActionDraft as any,
      navigation as any,
    ),
    new AgentV2AnswerContractValidatorService(),
    new AgentV2GrayStrategyService(),
  );

  it('plans occurred scrap record questions inside V2 runtime', () => {
    const result = service.plan({
      message: '本周有哪些报废产品',
      actor: { storeId: 1, userId: 1, role: 'manager', entrypoint: 'kiosk', permissions: ['*'] },
    });

      expect(result?.plan.capabilityPlan).toMatchObject({
        capabilityId: 'inventory.scrap.records.list',
      });
      expect((result?.plan.businessTask as any)?.agentV2GrayStrategy).toMatchObject({
        mode: 'kg_llm_preferred',
        finalEngine: 'legacy_regex',
        fallbackReason: 'KG intent engine dependencies are not registered.',
      });
      expect(result?.plan.toolPlan).toEqual([
      expect.objectContaining({
        tool: 'business.record.query',
        args: expect.objectContaining({ capabilityId: 'inventory.scrap.records.list' }),
      }),
    ]);
  });

  it('plans expiring inventory risk questions inside V2 runtime', () => {
    const result = service.plan({
      message: '哪些产品快报废了',
      actor: { storeId: 1, userId: 1, role: 'manager', entrypoint: 'kiosk', permissions: ['*'] },
    });

    expect(result?.plan.capabilityPlan).toMatchObject({
      capabilityId: 'inventory.expiring-risk.list',
    });
    expect(result?.plan.toolPlan[0]?.tool).toBe('business.record.query');
  });

  it('falls back when V2 switch is disabled', () => {
    const previous = process.env.AGENT_CAPABILITY_DECISION_V2;
    process.env.AGENT_CAPABILITY_DECISION_V2 = 'false';

    try {
      const result = service.plan({
        message: '本周有哪些报废产品',
        actor: { storeId: 1, userId: 1, role: 'manager', entrypoint: 'kiosk', permissions: ['*'] },
      });

      expect(result).toBeNull();
    } finally {
      if (previous === undefined) {
        delete process.env.AGENT_CAPABILITY_DECISION_V2;
      } else {
        process.env.AGENT_CAPABILITY_DECISION_V2 = previous;
      }
    }
  });

  it('executes registered V2 tools', async () => {
    const result = await service.executeTool(
      'business.record.query',
      { capabilityId: 'inventory.scrap.records.list' },
      { runId: 1, storeId: 1, userId: 1, role: 'manager' },
    );

    expect(result.status).toBe('success');
    expect(businessRecordQuery.execute).toHaveBeenCalledWith(
      { capabilityId: 'inventory.scrap.records.list' },
      { runId: 1, storeId: 1, userId: 1, role: 'manager' },
    );
  });

  it('executes registered V2 metric tools', async () => {
    const result = await service.executeTool(
      'business.metric.query',
      { capabilityId: 'finance.daily-settlement.metric' },
      { runId: 1, storeId: 1, userId: 1, role: 'manager' },
    );

    expect(result.status).toBe('success');
    expect(businessMetricQuery.execute).toHaveBeenCalledWith(
      { capabilityId: 'finance.daily-settlement.metric' },
      { runId: 1, storeId: 1, userId: 1, role: 'manager' },
    );
  });

  it('plans revenue trend questions as chart-capable V2 tools', () => {
    const result = service.plan({
      message: '最近三天营业额趋势怎么样',
      actor: { storeId: 1, userId: 1, role: 'manager', entrypoint: 'kiosk', permissions: ['*'] },
    });

    expect(result?.plan.capabilityPlan).toMatchObject({
      capabilityId: 'finance.revenue.trend',
    });
    expect(result?.decision.outputIntent).toBe('show_chart');
    expect(result?.plan.toolPlan[0]?.tool).toBe('business.trend.query');
    expect((result?.plan.outputContract as any)?.requiredKinds).toEqual(
      expect.arrayContaining(['chart', 'kpi', 'table', 'evidence_panel']),
    );
  });

  it('plans order number lookup as detail query instead of broad order list', () => {
    const result = service.plan({
      message: '看一下订单 POMQPDGTF8',
      actor: { storeId: 1, userId: 1, role: 'manager', entrypoint: 'kiosk', permissions: ['*'] },
    });

    expect(result?.plan.capabilityPlan).toMatchObject({
      capabilityId: 'order.detail.lookup',
    });
    expect(result?.decision.outputIntent).toBe('show_table');
    expect(result?.plan.toolPlan[0]?.tool).toBe('business.detail.query');
  });

  it('plans write-like stock requests as drafts instead of direct writes', () => {
    const result = service.plan({
      message: '帮我报废2片舒缓修护面膜',
      actor: { storeId: 1, userId: 1, role: 'manager', entrypoint: 'kiosk', permissions: ['*'] },
    });

    expect(result?.plan.capabilityPlan).toMatchObject({
      capabilityId: 'inventory.stock.operation.draft',
    });
    expect(result?.decision.outputIntent).toBe('confirm_action');
    expect(result?.plan.toolPlan[0]?.tool).toBe('business.action.draft');
  });

  it('plans high-risk coupon issue requests as write-blocked action drafts', () => {
    const contextService = new KnowledgeGraphIntentContextService();
    const kgService = new AgentV2RuntimeService(
      new AgentV2CapabilityDecisionService(),
      new AgentV2ToolRegistryService(
        businessRecordQuery as any,
        businessMetricQuery as any,
        businessTrendQuery as any,
        businessDetailQuery as any,
        businessActionDraft as any,
        navigation as any,
      ),
      new AgentV2AnswerContractValidatorService(),
      new AgentV2GrayStrategyService(),
      new AgentV2IntentExtractionService(contextService),
      new AgentV2CapabilityMappingService(),
    );

    const result = kgService.plan({
      message: '帮我给所有沉睡客户发券',
      actor: { storeId: 1, userId: 1, role: 'manager', entrypoint: 'agent_governance_debug', permissions: ['*'] },
      context: { agentV2GrayMode: 'kg_llm_only' },
    });

    expect((result?.plan.businessTask as any)?.agentV2GrayStrategy).toMatchObject({
      mode: 'kg_llm_only',
      finalEngine: 'kg_llm',
    });
    expect(result?.plan.capabilityPlan).toMatchObject({
      capabilityId: 'marketing.coupon.issue.blocked',
    });
    expect(result?.decision.selected).toMatchObject({
      capabilityId: 'marketing.coupon.issue.blocked',
      riskLevel: 'high',
      releaseStrategy: 'write_blocked',
    });
    expect(result?.decision.intent?.action).toBe('draft');
    expect(result?.decision.outputIntent).toBe('confirm_action');
    expect(result?.plan.toolPlan[0]).toEqual(expect.objectContaining({
      tool: 'business.action.draft',
      args: expect.objectContaining({
        capabilityId: 'marketing.coupon.issue.blocked',
        queryKey: 'marketing.coupon-issue-blocked',
      }),
    }));
    expect((result?.plan.businessTask as any)?.releaseStrategy).toBe('write_blocked');
  });

  it('plans staff efficiency questions through the KG engine as a metric query', () => {
    const contextService = new KnowledgeGraphIntentContextService();
    const kgService = new AgentV2RuntimeService(
      new AgentV2CapabilityDecisionService(),
      new AgentV2ToolRegistryService(
        businessRecordQuery as any,
        businessMetricQuery as any,
        businessTrendQuery as any,
        businessDetailQuery as any,
        businessActionDraft as any,
        navigation as any,
      ),
      new AgentV2AnswerContractValidatorService(),
      new AgentV2GrayStrategyService(),
      new AgentV2IntentExtractionService(contextService),
      new AgentV2CapabilityMappingService(),
    );

    const result = kgService.plan({
      message: '这个月人效怎么样',
      actor: { storeId: 1, userId: 1, role: 'manager', entrypoint: 'agent_governance_debug', permissions: ['*'] },
      context: { agentV2GrayMode: 'kg_llm_only' },
    });

    expect((result?.plan.businessTask as any)?.agentV2GrayStrategy).toMatchObject({
      mode: 'kg_llm_only',
      finalEngine: 'kg_llm',
    });
    expect(result?.plan.capabilityPlan).toMatchObject({
      capabilityId: 'finance.staff-efficiency.metric',
    });
    expect(result?.plan.toolPlan[0]).toMatchObject({
      tool: 'business.metric.query',
      args: expect.objectContaining({
        capabilityId: 'finance.staff-efficiency.metric',
        queryKey: 'finance.staff-efficiency.metric',
      }),
    });
  });

  it('executes registered V2 trend tools', async () => {
    const result = await service.executeTool(
      'business.trend.query',
      { capabilityId: 'finance.revenue.trend' },
      { runId: 1, storeId: 1, userId: 1, role: 'manager' },
    );

    expect(result.status).toBe('success');
    expect(businessTrendQuery.execute).toHaveBeenCalledWith(
      { capabilityId: 'finance.revenue.trend' },
      { runId: 1, storeId: 1, userId: 1, role: 'manager' },
    );
  });

  it('executes registered V2 detail tools', async () => {
    const result = await service.executeTool(
      'business.detail.query',
      { capabilityId: 'order.detail.lookup', orderNo: 'POMQPDGTF8' },
      { runId: 1, storeId: 1, userId: 1, role: 'manager' },
    );

    expect(result.status).toBe('success');
    expect(businessDetailQuery.execute).toHaveBeenCalledWith(
      { capabilityId: 'order.detail.lookup', orderNo: 'POMQPDGTF8' },
      { runId: 1, storeId: 1, userId: 1, role: 'manager' },
    );
  });

  it('executes registered V2 action draft tools', async () => {
    const result = await service.executeTool(
      'business.action.draft',
      { capabilityId: 'inventory.stock.operation.draft' },
      { runId: 1, storeId: 1, userId: 1, role: 'manager' },
    );

    expect(result.status).toBe('success');
    expect(businessActionDraft.execute).toHaveBeenCalledWith(
      { capabilityId: 'inventory.stock.operation.draft' },
      { runId: 1, storeId: 1, userId: 1, role: 'manager' },
    );
  });

  it('executes registered V2 navigation tools', async () => {
    const result = await service.executeTool(
      'navigation.open',
      { capabilityId: 'navigation.cashier.open' },
      { runId: 1, storeId: 1, userId: 1, role: 'manager' },
    );

    expect(result.status).toBe('success');
    expect(navigation.execute).toHaveBeenCalledWith(
      { capabilityId: 'navigation.cashier.open' },
      { runId: 1, storeId: 1, userId: 1, role: 'manager' },
    );
  });

  it('can plan through the KG intent engine when explicitly enabled', () => {
    const previous = process.env.AGENT_INTENT_ENGINE;
    process.env.AGENT_INTENT_ENGINE = 'kg_llm';
    const contextService = new KnowledgeGraphIntentContextService();
    const kgService = new AgentV2RuntimeService(
      new AgentV2CapabilityDecisionService(),
      new AgentV2ToolRegistryService(
        businessRecordQuery as any,
        businessMetricQuery as any,
        businessTrendQuery as any,
        businessDetailQuery as any,
        businessActionDraft as any,
        navigation as any,
      ),
      new AgentV2AnswerContractValidatorService(),
      new AgentV2GrayStrategyService(),
      new AgentV2IntentExtractionService(contextService),
      new AgentV2CapabilityMappingService(),
    );

    try {
      const result = kgService.plan({
        message: '哪些客户买了次卡但最近一直不来用',
        actor: { storeId: 1, userId: 1, role: 'manager', entrypoint: 'kiosk', permissions: ['*'] },
      });

      expect((result?.plan.businessTask as any)?.architecture).toBe('agent_v2_kg_llm');
      expect((result?.plan.businessTask as any)?.agentV2GrayStrategy).toMatchObject({
        mode: 'kg_llm_preferred',
        finalEngine: 'kg_llm',
      });
      expect(result?.plan.capabilityPlan).toMatchObject({
        capabilityId: 'card.package.inactive-customers.list',
      });
      expect(result?.plan.toolPlan[0]?.tool).toBe('business.record.query');
    } finally {
      if (previous === undefined) {
        delete process.env.AGENT_INTENT_ENGINE;
      } else {
        process.env.AGENT_INTENT_ENGINE = previous;
      }
    }
  });

  it('can plan asynchronously through the AI Gateway intent engine when enabled', async () => {
    const aiService = {
      chat: jest.fn().mockResolvedValue({
        text: JSON.stringify({
          objects: ['Customer', 'MemberCard'],
          domain: 'customer',
          action: 'list',
          timeIntent: 'historical_pattern',
          keywords: ['次卡沉睡'],
          candidateCapabilities: ['card.package.inactive-customers.list'],
          confidence: 0.92,
          needsClarification: false,
          unsupportedReason: null,
        }),
      }),
    };
    const contextService = new KnowledgeGraphIntentContextService();
    const kgService = new AgentV2RuntimeService(
      new AgentV2CapabilityDecisionService(),
      new AgentV2ToolRegistryService(
        businessRecordQuery as any,
        businessMetricQuery as any,
        businessTrendQuery as any,
        businessDetailQuery as any,
        businessActionDraft as any,
        navigation as any,
      ),
      new AgentV2AnswerContractValidatorService(),
      new AgentV2GrayStrategyService(),
      new AgentV2IntentExtractionService(contextService, aiService as any),
      new AgentV2CapabilityMappingService(),
    );

    const result = await kgService.planAsync({
      message: '哪些客户买了次卡但最近一直不来用',
      actor: { storeId: 1, userId: 1, role: 'manager', entrypoint: 'kiosk', permissions: ['*'] },
      context: { agentV2GrayMode: 'kg_llm_only' },
    });

    expect(aiService.chat).toHaveBeenCalled();
    expect((result?.plan.businessTask as any)?.architecture).toBe('agent_v2_kg_llm');
    expect((result?.plan.businessTask as any)?.agentV2GrayStrategy).toMatchObject({
      mode: 'kg_llm_only',
      finalEngine: 'kg_llm',
    });
    expect(result?.plan.capabilityPlan).toMatchObject({
      capabilityId: 'card.package.inactive-customers.list',
    });
    expect(result?.plan.toolPlan[0]?.tool).toBe('business.record.query');
  });

  it('can prefer KG intent per debug context without changing the global default', () => {
    const contextService = new KnowledgeGraphIntentContextService();
    const kgService = new AgentV2RuntimeService(
      new AgentV2CapabilityDecisionService(),
      new AgentV2ToolRegistryService(
        businessRecordQuery as any,
        businessMetricQuery as any,
        businessTrendQuery as any,
        businessDetailQuery as any,
        businessActionDraft as any,
        navigation as any,
      ),
      new AgentV2AnswerContractValidatorService(),
      new AgentV2GrayStrategyService(),
      new AgentV2IntentExtractionService(contextService),
      new AgentV2CapabilityMappingService(),
    );

    const result = kgService.plan({
      message: '哪些客户买了次卡但最近一直不来用',
      actor: { storeId: 1, userId: 1, role: 'manager', entrypoint: 'agent_governance_debug', permissions: ['*'] },
      context: { agentV2GrayMode: 'kg_llm_preferred' },
    });

    expect((result?.plan.businessTask as any)?.agentV2GrayStrategy).toMatchObject({
      mode: 'kg_llm_preferred',
      finalEngine: 'kg_llm',
    });
    expect(result?.plan.capabilityPlan).toMatchObject({
      capabilityId: 'card.package.inactive-customers.list',
    });
  });

  it('can switch a specific capability to KG preferred through gray rules without debug context', () => {
    const previousRules = process.env.AGENT_V2_GRAY_RULES;
    process.env.AGENT_V2_GRAY_RULES = JSON.stringify([
      {
        name: 'card-inactive-customers-kg-preferred',
        mode: 'kg_llm_preferred',
        capabilityIds: ['card.package.inactive-customers.list'],
        entrypoints: ['kiosk'],
      },
    ]);
    const contextService = new KnowledgeGraphIntentContextService();
    const kgService = new AgentV2RuntimeService(
      new AgentV2CapabilityDecisionService(),
      new AgentV2ToolRegistryService(
        businessRecordQuery as any,
        businessMetricQuery as any,
        businessTrendQuery as any,
        businessDetailQuery as any,
        businessActionDraft as any,
        navigation as any,
      ),
      new AgentV2AnswerContractValidatorService(),
      new AgentV2GrayStrategyService(),
      new AgentV2IntentExtractionService(contextService),
      new AgentV2CapabilityMappingService(),
    );

    try {
      const result = kgService.plan({
        message: '哪些客户买了次卡但最近一直不来用',
        actor: { storeId: 1, userId: 1, role: 'manager', entrypoint: 'kiosk', permissions: ['*'] },
      });

      expect((result?.plan.businessTask as any)?.agentV2GrayStrategy).toMatchObject({
        mode: 'kg_llm_preferred',
        source: 'env_rule',
        matchedRule: 'card-inactive-customers-kg-preferred',
        finalEngine: 'kg_llm',
        kgSelectedCapabilityId: 'card.package.inactive-customers.list',
      });
      expect(result?.plan.capabilityPlan).toMatchObject({
        capabilityId: 'card.package.inactive-customers.list',
      });
    } finally {
      if (previousRules === undefined) {
        delete process.env.AGENT_V2_GRAY_RULES;
      } else {
        process.env.AGENT_V2_GRAY_RULES = previousRules;
      }
    }
  });

  it('can switch a specific capability to KG preferred through DB gray rules in async runtime', async () => {
    const prisma = {
      agentV2GrayRule: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 31,
            name: 'db-card-kg-preferred',
            mode: 'kg_llm_preferred',
            status: 'active',
            priority: 1,
            storeIds: [],
            personaCodes: [],
            roles: [],
            entrypoints: ['kiosk'],
            capabilityIds: ['card.package.inactive-customers.list'],
          },
        ]),
      },
    };
    const contextService = new KnowledgeGraphIntentContextService();
    const kgService = new AgentV2RuntimeService(
      new AgentV2CapabilityDecisionService(),
      new AgentV2ToolRegistryService(
        businessRecordQuery as any,
        businessMetricQuery as any,
        businessTrendQuery as any,
        businessDetailQuery as any,
        businessActionDraft as any,
        navigation as any,
      ),
      new AgentV2AnswerContractValidatorService(),
      new AgentV2GrayStrategyService(prisma as any),
      new AgentV2IntentExtractionService(contextService),
      new AgentV2CapabilityMappingService(),
    );

    const result = await kgService.planAsync({
      message: '哪些客户买了次卡但最近一直不来用',
      actor: { storeId: 1, userId: 1, role: 'manager', entrypoint: 'kiosk', permissions: ['*'] },
    });

    expect(prisma.agentV2GrayRule.findMany).toHaveBeenCalled();
    expect((result?.plan.businessTask as any)?.agentV2GrayStrategy).toMatchObject({
      mode: 'kg_llm_preferred',
      source: 'db_rule',
      matchedRule: 'db-card-kg-preferred',
      finalEngine: 'kg_llm',
      kgSelectedCapabilityId: 'card.package.inactive-customers.list',
    });
    expect(result?.plan.capabilityPlan).toMatchObject({
      capabilityId: 'card.package.inactive-customers.list',
    });
  });

  it('keeps high-risk refund diagnostics on KG path in preferred mode', () => {
    const contextService = new KnowledgeGraphIntentContextService();
    const kgService = new AgentV2RuntimeService(
      new AgentV2CapabilityDecisionService(),
      new AgentV2ToolRegistryService(
        businessRecordQuery as any,
        businessMetricQuery as any,
        businessTrendQuery as any,
        businessDetailQuery as any,
        businessActionDraft as any,
        navigation as any,
      ),
      new AgentV2AnswerContractValidatorService(),
      new AgentV2GrayStrategyService(),
      new AgentV2IntentExtractionService(contextService),
      new AgentV2CapabilityMappingService(),
    );

    const result = kgService.plan({
      message: '有没有大额异常退款我不知道的',
      actor: { storeId: 1, userId: 1, role: 'manager', entrypoint: 'agent_governance_debug', permissions: ['*'] },
      context: { agentV2GrayMode: 'kg_llm_preferred' },
    });

    expect(result?.plan.capabilityPlan).toMatchObject({
      capabilityId: 'finance.risk-diagnostics.metric',
    });
    expect((result?.plan.businessTask as any)?.agentV2GrayStrategy).toMatchObject({
      mode: 'kg_llm_preferred',
      finalEngine: 'kg_llm',
      kgSelectedCapabilityId: 'finance.risk-diagnostics.metric',
    });
  });

  it('falls back to legacy in kg_llm_preferred when KG dependencies are unavailable', () => {
    const fallbackService = new AgentV2RuntimeService(
      new AgentV2CapabilityDecisionService(),
      new AgentV2ToolRegistryService(
        businessRecordQuery as any,
        businessMetricQuery as any,
        businessTrendQuery as any,
        businessDetailQuery as any,
        businessActionDraft as any,
        navigation as any,
      ),
      new AgentV2AnswerContractValidatorService(),
      new AgentV2GrayStrategyService(),
    );

    const result = fallbackService.plan({
      message: '本周有哪些报废产品',
      actor: { storeId: 1, userId: 1, role: 'manager', entrypoint: 'kiosk', permissions: ['*'] },
      context: { agentV2GrayMode: 'kg_llm_preferred' },
    });

    expect((result?.plan.businessTask as any)?.architecture).toBe('agent_v2_legacy_fallback');
    expect((result?.plan.businessTask as any)?.agentV2GrayStrategy).toMatchObject({
      mode: 'kg_llm_preferred',
      finalEngine: 'legacy_regex',
      legacySelectedCapabilityId: 'inventory.scrap.records.list',
    });
  });

  it('records shadow KG selection while returning legacy decision', () => {
    const contextService = new KnowledgeGraphIntentContextService();
    const shadowService = new AgentV2RuntimeService(
      new AgentV2CapabilityDecisionService(),
      new AgentV2ToolRegistryService(
        businessRecordQuery as any,
        businessMetricQuery as any,
        businessTrendQuery as any,
        businessDetailQuery as any,
        businessActionDraft as any,
        navigation as any,
      ),
      new AgentV2AnswerContractValidatorService(),
      new AgentV2GrayStrategyService(),
      new AgentV2IntentExtractionService(contextService),
      new AgentV2CapabilityMappingService(),
    );

    const result = shadowService.plan({
      message: '哪些客户买了次卡但最近一直不来用',
      actor: { storeId: 1, userId: 1, role: 'manager', entrypoint: 'kiosk', permissions: ['*'] },
      context: { agentV2GrayMode: 'shadow' },
    });

    expect((result?.plan.businessTask as any)?.architecture).toBe('agent_v2_shadow');
    expect((result?.plan.businessTask as any)?.agentV2GrayStrategy).toMatchObject({
      mode: 'shadow',
      finalEngine: 'legacy_regex',
      kgSelectedCapabilityId: 'card.package.inactive-customers.list',
      legacySelectedCapabilityId: 'card.package.inactive-customers.list',
    });
  });
});
