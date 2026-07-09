import { AgentV4OrchestratorService } from './agent-v4-orchestrator.service.js';

describe('AgentV4OrchestratorService', () => {
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
  const marketing = {
    getLifecycleOpportunities: jest.fn(),
    getLifecycleServiceCycles: jest.fn(),
    getLifecycleAttribution: jest.fn(),
    getLifecycleQuality: jest.fn(),
    getLifecycleRules: jest.fn(),
    createLifecycleBusinessPlan: jest.fn(),
    submitLifecycleBusinessPlanActions: jest.fn(),
  };

  const actor = {
    storeId: 1,
    userId: 2,
    deviceId: 3,
    role: 'manager' as const,
    entrypoint: 'ami-agent:auto',
    personaCode: 'manager',
    permissions: ['*'],
  };

  beforeEach(() => {
    jest.clearAllMocks();
    runtime.createRun.mockResolvedValue({
      id: 401,
      runNo: 'ar_v4_401',
      status: 'created',
      agentCode: 'agent_v4',
      storeId: 1,
      personaCode: 'manager',
    });
    runtime.getRun.mockResolvedValue({
      id: 401,
      runNo: 'ar_v4_401',
      status: 'completed',
      agentCode: 'agent_v4',
      storeId: 1,
      personaCode: 'manager',
      contextJson: { agentEngine: 'agent_v4' },
    });
    runtime.setRunStatus.mockImplementation((id: number, status: string, data?: Record<string, unknown>) =>
      Promise.resolve({
        id,
        runNo: 'ar_v4_401',
        status,
        personaCode: 'manager',
        resultJson: data?.resultJson,
      }),
    );
    textToSql.run.mockResolvedValue({
      status: 'dry_run',
      answer: 'V3 只读查询已完成。',
      rows: [{ product_name: '面膜', quantity_sold: 12 }],
      evidence: {
        sourceViews: ['agent_v3_order_item_sales_view'],
        storeScope: '限定门店：1',
        fieldPolicies: [],
        limitations: ['仅允许 SELECT 只读查询。'],
      },
      queryTrace: {
        guard: {
          status: 'pass',
          appliedPolicies: ['select_only'],
          safeSql: 'SELECT * FROM agent_v3_order_item_sales_view LIMIT 20',
        },
      },
      auditRunId: 'v3-audit-for-v4',
    });
    marketing.getLifecycleOpportunities.mockResolvedValue({
      items: [{
        id: 11,
        customerId: 9,
        customer: { name: '王女士' },
        opportunityType: 'care_cycle_due',
        priority: 'P0',
        score: 88,
        evidence: ['距上次护理 31 天'],
        fulfillment: { inventoryReady: true, capacityReady: true },
      }],
      total: 1,
    });
    marketing.getLifecycleServiceCycles.mockResolvedValue({ items: [{ id: 21 }], total: 1 });
    marketing.getLifecycleAttribution.mockResolvedValue({ items: [], total: 0 });
    marketing.getLifecycleQuality.mockResolvedValue({
      fieldCoverageRate: 0.8,
      ruleHitRate: 0.6,
      attributionCompletenessRate: 0.5,
    });
    marketing.getLifecycleRules.mockResolvedValue({ items: [{ id: 1, status: 'active' }] });
    marketing.createLifecycleBusinessPlan.mockResolvedValue({
      id: 31,
      storeId: 1,
      status: 'draft',
      planPeriod: '2026-W28',
      actionsJson: [{ id: 'act-1', title: '护理周期召回', type: 'automation_draft', targetCustomerCount: 8 }],
      evidenceJson: ['8 位客户进入护理周期'],
    });
    marketing.submitLifecycleBusinessPlanActions.mockResolvedValue({
      submitted: true,
      approval: { id: 51, status: 'pending' },
      plan: { id: 31, status: 'waiting_approval' },
    });
  });

  it('creates an independent agent_v4 run and diagnoses lifecycle opportunities', async () => {
    const service = new AgentV4OrchestratorService(runtime as any, textToSql as any, marketing as any);

    const result = await service.createRun({
      message: '本周哪些客户该触达，为什么',
      actor,
      context: { agentEngine: 'agent_v4' },
    });

    expect(runtime.createRun).toHaveBeenCalledWith(expect.objectContaining({ agentCode: 'agent_v4' }));
    expect(marketing.getLifecycleOpportunities).toHaveBeenCalledWith(expect.objectContaining({ status: 'open' }), 1);
    expect(result.answer).toContain('生命周期机会');
    expect(result.renderedBlocks?.map((block) => block.kind)).toContain('table');
    expect(result.plan?.businessTask).toMatchObject({
      architecture: 'agent_v4_lifecycle_business_agent',
      runtime: 'agent_v4',
      approvalBoundary: 'drafts_and_approval_only',
    });
  });

  it('reuses Agent V3 controlled text-to-sql for readonly questions', async () => {
    const service = new AgentV4OrchestratorService(runtime as any, textToSql as any, marketing as any);

    const result = await service.createRun({
      message: '本月销量最高的商品排行',
      actor,
      context: { agentEngine: 'agent_v4' },
    });

    expect(textToSql.run).toHaveBeenCalledWith(expect.objectContaining({
      question: '本月销量最高的商品排行',
      runtimeContext: expect.objectContaining({
        architecture: 'agent_v4_lifecycle_business_agent',
        readOnlyVia: 'agent_v3_text_to_sql',
      }),
    }));
    expect(result.evidence?.limitations).toContain('readOnlyVia=agent_v3_text_to_sql');
  });

  it('creates a lifecycle business plan draft from V4', async () => {
    const service = new AgentV4OrchestratorService(runtime as any, textToSql as any, marketing as any);

    const result = await service.createRun({
      message: '生成本周经营计划',
      actor,
      context: { agentEngine: 'agent_v4' },
    });

    expect(marketing.createLifecycleBusinessPlan).toHaveBeenCalledWith(expect.objectContaining({
      storeId: 1,
      goalsJson: expect.objectContaining({ sourceAgentCode: 'agent_v4', sourceRunId: 401 }),
    }), 1, 2);
    expect(result.answer).toContain('#31');
    expect(result.renderedBlocks?.map((block) => block.kind)).toContain('action_card');
  });

  it('submits a lifecycle business plan into approval without direct execution', async () => {
    const service = new AgentV4OrchestratorService(runtime as any, textToSql as any, marketing as any);

    const result = await service.appendMessage({
      runId: 401,
      message: '提交经营计划 31 审批',
      actor,
      context: { agentEngine: 'agent_v4' },
    });

    expect(marketing.submitLifecycleBusinessPlanActions).toHaveBeenCalledWith(31, expect.objectContaining({
      sourceAgentCode: 'agent_v4',
      sourceRunId: 401,
      sourceEntrypoint: 'ami-agent:auto',
    }), 2);
    expect(result.answer).toContain('已提交审批');
    expect(result.actions.map((action) => action.action)).toContain('approve:51');
  });
});
