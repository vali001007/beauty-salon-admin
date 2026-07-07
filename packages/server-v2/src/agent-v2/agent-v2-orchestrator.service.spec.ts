import type { AgentActor, AgentPlan, AgentToolDefinition, AgentToolResult } from '../agent/agent.types.js';
import { AgentV2OrchestratorService } from './agent-v2-orchestrator.service.js';
import { AGENT_V2_CAPABILITY_MANIFESTS } from './capability/agent-v2-capability-manifest.js';
import type { AgentV2CapabilityManifest } from './capability/agent-v2-capability.types.js';
import { AgentV2EvidenceService } from './evidence/agent-v2-evidence.service.js';
import { AgentV2PolicyGatewayService } from './policy/agent-v2-policy-gateway.service.js';

describe('AgentV2OrchestratorService contract retry', () => {
  const actor: AgentActor = {
    storeId: 1,
    userId: 1,
    role: 'manager',
    entrypoint: 'kiosk',
    permissions: ['*'],
  };
  const run = {
    id: 101,
    runNo: 'RUN101',
    status: 'created',
    storeId: 1,
    userId: 1,
    role: 'manager',
    entrypoint: 'kiosk',
    agentCode: 'agent_v2',
  };
  const tool: AgentToolDefinition = {
    name: 'business.metric.query',
    description: '本地测试工具',
    riskLevel: 'low',
    allowedRoles: ['manager', 'reception', 'beautician'],
    requiredPermissions: [],
    requiresApproval: false,
    timeoutMs: 1000,
    execute: async () => ({
      status: 'success',
      title: '本地测试工具',
      summary: '已完成。',
      actions: [],
    }),
  };

  it('excludes the failed capability and retries once when the answer contract fails', async () => {
    const firstCapability = manifest('inventory.scrap.records.list');
    const retryCapability = manifest('finance.daily-settlement.metric');
    const runtime = runtimeMock(run);
    const agentV2Runtime = {
      planAsync: jest.fn()
        .mockResolvedValueOnce(runtimePlan(firstCapability, 'business.metric.query'))
        .mockResolvedValueOnce(runtimePlan(retryCapability, 'business.metric.query')),
      getTool: jest.fn(() => tool),
      executeTool: jest.fn()
        .mockResolvedValueOnce(toolResult({
          title: '报废记录',
          summary: '返回了不符合列表契约的摘要。',
          data: { metrics: { total: 1 } },
          source: ['StockMovement'],
        }))
        .mockResolvedValueOnce(toolResult({
          title: '日结报表',
          summary: '今日实收 ¥100.00。',
          data: { metrics: { totalRevenueText: '¥100.00' } },
          source: ['DailySettlement'],
        })),
      validateAnswer: jest.fn()
        .mockReturnValueOnce({ valid: false, errors: ['missing_required_output_kind:table'], warnings: [] })
        .mockReturnValueOnce({ valid: true, errors: [], warnings: [] }),
    };
    const service = new AgentV2OrchestratorService(
      agentV2Runtime as any,
      runtime as any,
      new AgentV2EvidenceService(),
      new AgentV2PolicyGatewayService(),
      prismaMock() as any,
    );

    const result = await service.processRun({ run, message: '本周有哪些报废产品', actor, context: {} });

    expect(agentV2Runtime.planAsync).toHaveBeenCalledTimes(2);
    expect(agentV2Runtime.planAsync.mock.calls[1][0].context.agentV2ContractRetry).toMatchObject({
      excludedCapabilityIds: ['inventory.scrap.records.list'],
      errors: ['missing_required_output_kind:table'],
    });
    expect(runtime.recordStep).toHaveBeenCalledWith(expect.objectContaining({
      name: 'agent.v2.contract_failed.retry',
      status: 'success',
    }));
    expect(result.status).toBe('completed');
    expect(result.plan?.capabilityPlan?.capabilityId).toBe('finance.daily-settlement.metric');
    expect(result.answerContract?.valid).toBe(true);
  });

  it('blocks the answer as contract_failed when retry cannot select another capability', async () => {
    const firstCapability = manifest('inventory.scrap.records.list');
    const runtime = runtimeMock(run);
    const agentV2Runtime = {
      planAsync: jest.fn()
        .mockResolvedValueOnce(runtimePlan(firstCapability, 'business.metric.query'))
        .mockResolvedValueOnce(null),
      getTool: jest.fn(() => tool),
      executeTool: jest.fn().mockResolvedValueOnce(toolResult({
        title: '报废记录',
        summary: '返回了不符合列表契约的摘要。',
        data: { metrics: { total: 1 } },
        source: ['StockMovement'],
      })),
      validateAnswer: jest.fn().mockReturnValueOnce({
        valid: false,
        errors: ['missing_required_output_kind:table'],
        warnings: [],
      }),
    };
    const service = new AgentV2OrchestratorService(
      agentV2Runtime as any,
      runtime as any,
      new AgentV2EvidenceService(),
      new AgentV2PolicyGatewayService(),
      prismaMock() as any,
    );

    const result = await service.processRun({ run, message: '本周有哪些报废产品', actor, context: {} });

    expect(result.status).toBe('completed');
    expect(result.answer).toContain('系统已拦截');
    expect(result.answerContract?.valid).toBe(false);
    expect(result.answerContract?.errors).toContain('missing_required_output_kind:table');
    expect(result.renderedBlocks).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: 'alert' }),
    ]));
  });

  it('falls back to controlled Text-to-SQL when no published capability matches', async () => {
    const previous = process.env.AGENT_V2_TEXT_TO_SQL_ENABLED;
    process.env.AGENT_V2_TEXT_TO_SQL_ENABLED = 'true';
    const runtime = runtimeMock(run);
    const agentV2Runtime = {
      planAsync: jest.fn().mockResolvedValue(null),
    };
    const controlledTextToSql = {
      run: jest.fn().mockResolvedValue({
        status: 'dry_run',
        answer: '已生成受控只读查询计划，命中语义视图：agent_v2_order_item_sales_view。当前为 dry-run，未访问数据库。',
        rows: [],
        evidence: {
          sourceViews: ['agent_v2_order_item_sales_view'],
          storeScope: '限定门店：1',
          fieldPolicies: [],
          limitations: ['仅允许 SELECT 只读查询。'],
        },
        queryTrace: {
          executionMode: 'execute',
          rowCount: 0,
          planner: {
            status: 'planned',
            intent: { domain: 'product', type: 'ranking' },
            selectedViews: ['agent_v2_order_item_sales_view'],
            generatedSql: 'SELECT product_name FROM agent_v2_order_item_sales_view LIMIT 10;',
            parameters: {},
            explanation: 'unit-test',
          },
          guard: {
            status: 'pass',
            safeSql: 'SELECT product_name FROM agent_v2_order_item_sales_view WHERE store_id = ANY(:allowedStoreIds) LIMIT 10;',
            redactedSql: 'SELECT product_name FROM agent_v2_order_item_sales_view WHERE store_id = ANY(:allowedStoreIds) LIMIT 10;',
            params: { allowedStoreIds: [1] },
            selectedViews: [],
            parsed: {
              statementType: 'select',
              columns: ['product_name'],
              sourceViews: ['agent_v2_order_item_sales_view'],
              functions: [],
              hasWildcard: false,
              hasLimit: true,
              limit: 10,
              hasWhere: false,
              hasGroupBy: false,
              hasOrderBy: false,
              tokens: [],
            },
            appliedPolicies: ['select_only'],
          },
        },
        auditRunId: '12',
      }),
    };
    const service = new AgentV2OrchestratorService(
      agentV2Runtime as any,
      runtime as any,
      new AgentV2EvidenceService(),
      new AgentV2PolicyGatewayService(),
      prismaMock() as any,
      controlledTextToSql as any,
    );

    try {
      const result = await service.processRun({ run, message: '本月销量最好的商品', actor, context: {} });

      expect(controlledTextToSql.run).toHaveBeenCalledWith(expect.objectContaining({
        question: '本月销量最好的商品',
        storeIds: [1],
        mode: 'execute',
      }));
      expect(result.status).toBe('completed');
      expect(result.plan?.capabilityPlan?.capabilityId).toBe('agent_v2.text_to_sql.fallback');
      const runtimeTrace = result.evidence?.queryTraces?.[0] as any;
      expect(runtimeTrace?.planner?.generatedSql).toBe('redacted_for_user_runtime');
      expect(runtimeTrace?.guard?.safeSql).toBe('redacted_for_user_runtime');
      expect(JSON.stringify(result.evidence)).not.toContain('SELECT product_name');
      expect(result.renderedBlocks).toEqual(expect.arrayContaining([
        expect.objectContaining({ kind: 'evidence_panel' }),
      ]));
    } finally {
      if (previous === undefined) {
        delete process.env.AGENT_V2_TEXT_TO_SQL_ENABLED;
      } else {
        process.env.AGENT_V2_TEXT_TO_SQL_ENABLED = previous;
      }
    }
  });

  it('renders successful controlled Text-to-SQL rows as table blocks without leaking SQL traces', async () => {
    const previous = process.env.AGENT_V2_TEXT_TO_SQL_ENABLED;
    process.env.AGENT_V2_TEXT_TO_SQL_ENABLED = 'true';
    const runtime = runtimeMock(run);
    const agentV2Runtime = {
      planAsync: jest.fn().mockResolvedValue(null),
    };
    const controlledTextToSql = {
      run: jest.fn().mockResolvedValue({
        status: 'success',
        answer: '本月销量最高的是洁面乳，共销售 12 件，净销售额 ¥1,200.00。',
        rows: [
          { product_name: '洁面乳', quantity_sold: 12, net_sales_amount: 1200 },
          { product_name: '面膜', quantity_sold: 8, net_sales_amount: 960 },
        ],
        evidence: {
          sourceViews: ['agent_v2_order_item_sales_view'],
          storeScope: '限定门店：1',
          dateRange: '2026-07-01 至 2026-07-31',
          fieldPolicies: [{ field: '*', policy: 'allow' }],
          limitations: ['仅允许 SELECT 只读查询。'],
        },
        queryTrace: {
          executionMode: 'execute',
          rowCount: 2,
          planner: {
            status: 'planned',
            intent: { domain: 'product', type: 'ranking', metric: 'quantity_sold' },
            selectedViews: ['agent_v2_order_item_sales_view'],
            generatedSql: 'SELECT product_name, SUM(quantity) AS quantity_sold FROM agent_v2_order_item_sales_view GROUP BY product_name ORDER BY quantity_sold DESC LIMIT 10;',
            parameters: {},
            explanation: 'unit-test',
          },
          guard: {
            status: 'pass',
            safeSql: 'SELECT product_name, SUM(quantity) AS quantity_sold FROM agent_v2_order_item_sales_view WHERE store_id = ANY(:allowedStoreIds) GROUP BY product_name ORDER BY quantity_sold DESC LIMIT 10;',
            redactedSql: 'SELECT product_name, SUM(quantity) AS quantity_sold FROM agent_v2_order_item_sales_view WHERE store_id = ANY(?) GROUP BY product_name ORDER BY quantity_sold DESC LIMIT 10;',
            params: { allowedStoreIds: [1] },
            selectedViews: ['agent_v2_order_item_sales_view'],
            parsed: {
              statementType: 'select',
              columns: ['product_name', 'quantity'],
              sourceViews: ['agent_v2_order_item_sales_view'],
              functions: ['sum'],
              hasWildcard: false,
              hasLimit: true,
              limit: 10,
              hasWhere: true,
              hasGroupBy: true,
              hasOrderBy: true,
              tokens: [],
            },
            appliedPolicies: ['select_only', 'semantic_view_whitelist'],
          },
        },
        auditRunId: '18',
      }),
    };
    const service = new AgentV2OrchestratorService(
      agentV2Runtime as any,
      runtime as any,
      new AgentV2EvidenceService(),
      new AgentV2PolicyGatewayService(),
      prismaMock() as any,
      controlledTextToSql as any,
    );

    try {
      const result = await service.processRun({ run, message: '本月销量最好的商品', actor, context: {} });

      expect(controlledTextToSql.run).toHaveBeenCalledWith(expect.objectContaining({
        question: '本月销量最好的商品',
        storeIds: [1],
        mode: 'execute',
      }));
      expect(result.status).toBe('completed');
      expect(result.plan?.capabilityPlan?.capabilityId).toBe('agent_v2.text_to_sql.fallback');
      expect(result.toolResults[0]).toMatchObject({
        status: 'success',
        title: '受控 Text-to-SQL 只读分析',
        data: {
          status: 'success',
          auditRunId: '18',
        },
      });
      expect(result.renderedBlocks).toEqual(expect.arrayContaining([
        expect.objectContaining({ kind: 'table', caption: '受控 Text-to-SQL 查询结果' }),
        expect.objectContaining({ kind: 'evidence_panel', sources: ['agent_v2_order_item_sales_view'] }),
      ]));
      const table = (result.renderedBlocks ?? []).find((block) => block.kind === 'table') as any;
      expect(table.columns).toEqual(['product_name', 'quantity_sold', 'net_sales_amount']);
      expect(table.rows[0]).toEqual(['洁面乳', '12', '1200']);
      const runtimeTrace = result.evidence?.queryTraces?.[0] as any;
      expect(runtimeTrace?.planner?.generatedSql).toBe('redacted_for_user_runtime');
      expect(runtimeTrace?.guard?.safeSql).toBe('redacted_for_user_runtime');
      expect(runtimeTrace?.guard?.redactedSql).toBe('redacted_for_user_runtime');
      expect(runtimeTrace?.guard?.parsed).toBe('redacted_for_user_runtime');
      expect(JSON.stringify(result.evidence)).not.toContain('SELECT product_name');
    } finally {
      if (previous === undefined) {
        delete process.env.AGENT_V2_TEXT_TO_SQL_ENABLED;
      } else {
        process.env.AGENT_V2_TEXT_TO_SQL_ENABLED = previous;
      }
    }
  });

  it('does not fall back to controlled Text-to-SQL for ordinary users by default', async () => {
    const previousEnabled = process.env.AGENT_V2_TEXT_TO_SQL_ENABLED;
    const previousAdminOnly = process.env.AGENT_V2_TEXT_TO_SQL_ADMIN_ONLY;
    process.env.AGENT_V2_TEXT_TO_SQL_ENABLED = 'true';
    delete process.env.AGENT_V2_TEXT_TO_SQL_ADMIN_ONLY;
    const runtime = runtimeMock(run);
    const agentV2Runtime = {
      planAsync: jest.fn().mockResolvedValue(null),
    };
    const controlledTextToSql = {
      run: jest.fn(),
    };
    const service = new AgentV2OrchestratorService(
      agentV2Runtime as any,
      runtime as any,
      new AgentV2EvidenceService(),
      new AgentV2PolicyGatewayService(),
      prismaMock() as any,
      controlledTextToSql as any,
    );

    try {
      const result = await service.processRun({
        run,
        message: '本月销量最好的商品',
        actor: {
          storeId: 1,
          userId: 2,
          role: 'reception',
          entrypoint: 'kiosk',
          permissions: ['core:order:view'],
        },
        context: {},
      });

      expect(controlledTextToSql.run).not.toHaveBeenCalled();
      expect(result.plan?.capabilityPlan?.capabilityId).toBe('agent_v2.unsupported');
    } finally {
      if (previousEnabled === undefined) {
        delete process.env.AGENT_V2_TEXT_TO_SQL_ENABLED;
      } else {
        process.env.AGENT_V2_TEXT_TO_SQL_ENABLED = previousEnabled;
      }
      if (previousAdminOnly === undefined) {
        delete process.env.AGENT_V2_TEXT_TO_SQL_ADMIN_ONLY;
      } else {
        process.env.AGENT_V2_TEXT_TO_SQL_ADMIN_ONLY = previousAdminOnly;
      }
    }
  });
});

function manifest(capabilityId: string): AgentV2CapabilityManifest {
  const value = AGENT_V2_CAPABILITY_MANIFESTS.find((item) => item.capabilityId === capabilityId);
  if (!value) throw new Error(`Missing manifest: ${capabilityId}`);
  return value;
}

function runtimePlan(capability: AgentV2CapabilityManifest, toolName: string) {
  const plan: AgentPlan = {
    intentType: 'query',
    goal: capability.displayName,
    toolPlan: [{ tool: toolName, args: { capabilityId: capability.capabilityId, queryKey: capability.executor.queryKey } }],
    confidence: 0.9,
    clarificationNeeded: false,
    capabilityPlan: { capabilityId: capability.capabilityId, reason: 'unit-test' },
    outputContract: {
      requiredKinds: capability.outputKinds,
      preferredKinds: capability.outputKinds,
      evidenceRequired: true,
    },
  };
  return {
    plan,
    decision: {
      selected: capability,
      confidence: 0.9,
      reason: 'unit-test',
      candidates: [{ capabilityId: capability.capabilityId, score: 1, reason: 'unit-test' }],
      excluded: [],
      toolPlan: plan.toolPlan,
      boundaryWarnings: [],
    },
    strategy: { mode: 'all', finalEngine: 'legacy_regex' },
  };
}

function toolResult(input: {
  title: string;
  summary: string;
  data: Record<string, unknown>;
  source: string[];
}): AgentToolResult {
  return {
    status: 'success',
    title: input.title,
    summary: input.summary,
    data: input.data,
    evidence: {
      source: input.source,
      metricDefinition: input.title,
      filters: ['storeId=1'],
      sampleSize: 1,
      limitations: ['本地单测证据包。'],
    },
    actions: [],
  };
}

function runtimeMock(baseRun: Record<string, unknown>) {
  return {
    persistPlan: jest.fn(async () => undefined),
    recordStep: jest.fn(async () => undefined),
    addMessage: jest.fn(async () => undefined),
    createToolCall: jest.fn(async () => ({ id: 301 })),
    updateToolCall: jest.fn(async () => undefined),
    createApproval: jest.fn(async () => ({ id: 401, status: 'pending' })),
    setRunStatus: jest.fn(async (_runId: number, status: string) => ({ ...baseRun, status })),
  };
}

function prismaMock() {
  return {
    agentRunAuditDetail: {
      upsert: jest.fn(async () => undefined),
    },
  };
}
