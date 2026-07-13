import { AgentV3OrchestratorService } from './agent-v3-orchestrator.service.js';

describe('AgentV3OrchestratorService', () => {
  const runtime = {
    createRun: jest.fn(),
    addMessage: jest.fn(),
    persistPlan: jest.fn(),
    setRunStatus: jest.fn(),
    recordStep: jest.fn(),
    getRun: jest.fn(),
    getRunDetail: jest.fn(),
    findRuns: jest.fn(),
  };
  const textToSql = {
    run: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    runtime.createRun.mockResolvedValue({
      id: 101,
      runNo: 'ar_v3_101',
      status: 'created',
      agentCode: 'agent_v3',
      storeId: 1,
      personaCode: 'manager',
    });
    runtime.setRunStatus.mockImplementation((id: number, status: string, data?: Record<string, unknown>) =>
      Promise.resolve({
        id,
        runNo: 'ar_v3_101',
        status,
        personaCode: 'manager',
        resultJson: data?.resultJson,
      }),
    );
    textToSql.run.mockResolvedValue({
      status: 'dry_run',
      answer: '已生成受控只读查询计划，命中语义视图：agent_v3_order_item_sales_view。当前为 dry-run，未访问数据库。',
      rows: [],
      evidence: {
        sourceViews: ['agent_v3_order_item_sales_view'],
        storeScope: '限定门店：1',
        fieldPolicies: [],
        limitations: ['仅允许 SELECT 只读查询。'],
      },
      queryTrace: {
        planner: {
          status: 'planned',
          intent: { domain: 'product', type: 'ranking', metric: 'quantity_sold' },
          selectedViews: ['agent_v3_order_item_sales_view'],
          generatedSql: 'SELECT product_name FROM agent_v3_order_item_sales_view LIMIT 10',
          parameters: {},
          explanation: 'ok',
        },
        guard: {
          status: 'pass',
          safeSql: 'SELECT product_name FROM agent_v3_order_item_sales_view WHERE store_id = ANY(:allowedStoreIds) LIMIT 10;',
          redactedSql: 'SELECT product_name FROM agent_v3_order_item_sales_view WHERE store_id = ANY(:allowedStoreIds) LIMIT 10;',
          params: { allowedStoreIds: [1] },
          selectedViews: [],
          parsed: {},
          appliedPolicies: ['select_only'],
        },
        executionMode: 'dry_run',
        rowCount: 0,
      },
      auditRunId: 'v3-audit-1',
    });
  });

  it('creates an independent agent_v3 run and returns terminal-compatible blocks', async () => {
    const service = new AgentV3OrchestratorService(runtime as any, textToSql as any);

    const result = await service.createRun({
      message: '本月销量最好的商品',
      actor: {
        storeId: 1,
        userId: 2,
        deviceId: 3,
        role: 'manager',
        entrypoint: 'terminal:kiosk',
        personaCode: 'manager',
        permissions: ['*'],
      },
      context: { agentEngine: 'agent_v3' },
    });

    expect(runtime.createRun).toHaveBeenCalledWith(expect.objectContaining({ agentCode: 'agent_v3' }));
    expect(textToSql.run).toHaveBeenCalledWith(expect.objectContaining({
      question: '本月销量最好的商品',
      storeIds: [1],
      permissions: ['*'],
    }));
    expect(result.runId).toBe(101);
    expect(result.responseMode).toBe('structured_blocks');
    expect(result.renderedBlocks?.map((block) => block.kind)).toContain('evidence_panel');
    expect(result.plan?.businessTask).toMatchObject({
      architecture: 'agent_v3_text_to_sql',
      manifestUsed: false,
      readOnly: true,
    });
  });
});
