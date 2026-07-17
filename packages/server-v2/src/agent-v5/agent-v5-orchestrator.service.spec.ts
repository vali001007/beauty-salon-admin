import { AgentV5BusinessToolAdapter } from './adapters/agent-v5-business-tool.adapter.js';
import { AgentV5CashierAdapter } from './adapters/agent-v5-cashier.adapter.js';
import { AgentV5BeauticianAdapter } from './adapters/agent-v5-beautician.adapter.js';
import { AgentV5FinanceAdapter } from './adapters/agent-v5-finance.adapter.js';
import { AgentV5GovernanceAdapter } from './adapters/agent-v5-governance.adapter.js';
import { AgentV5InventorySupplyAdapter } from './adapters/agent-v5-inventory-supply.adapter.js';
import { AgentV5LifecycleAdapter } from './adapters/agent-v5-lifecycle.adapter.js';
import { AgentV5MarketingAdapter } from './adapters/agent-v5-marketing.adapter.js';
import { AgentV5ReceptionAdapter } from './adapters/agent-v5-reception.adapter.js';
import { AgentV5ReadonlyQueryAdapter } from './adapters/agent-v5-readonly-query.adapter.js';
import { AgentV5ScheduleAdapter } from './adapters/agent-v5-schedule.adapter.js';
import { AgentV5StaffPerformanceAdapter } from './adapters/agent-v5-staff-performance.adapter.js';
import { AgentV5OrchestratorService } from './agent-v5-orchestrator.service.js';
import { AgentV5FailureDiagnosisService } from './eval/agent-v5-failure-diagnosis.service.js';
import { AgentV5ClarificationService } from './ontology/agent-v5-clarification.service.js';
import { AgentV5ConstraintGuardService } from './ontology/agent-v5-constraint-guard.service.js';
import { AgentV5ContextBuilderService } from './ontology/agent-v5-context-builder.service.js';
import { AgentV5EvidencePackService } from './ontology/agent-v5-evidence-pack.service.js';
import { AgentV5MemoryService } from './ontology/agent-v5-memory.service.js';
import { AgentV5SemanticRouterService } from './ontology/agent-v5-semantic-router.service.js';
import { BusinessOntologyRegistry } from './ontology/business-ontology.registry.js';

describe('AgentV5OrchestratorService', () => {
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
  const textToSql = { run: jest.fn() };
  const marketing = {
    getLifecycleOpportunities: jest.fn(),
    getLifecycleServiceCycles: jest.fn(),
    getLifecycleAttribution: jest.fn(),
    getLifecycleQuality: jest.fn(),
    getLifecycleRules: jest.fn(),
    createLifecycleBusinessPlan: jest.fn(),
    submitLifecycleBusinessPlanActions: jest.fn(),
  };
  const prisma = {
    productOrder: { count: jest.fn(), findMany: jest.fn() },
    reservation: { count: jest.fn(), findMany: jest.fn() },
    customerOpportunity: { count: jest.fn() },
    product: { findMany: jest.fn() },
    customer: { findMany: jest.fn() },
    customerCard: { findMany: jest.fn() },
    cardUsageRecord: { findMany: jest.fn() },
    commissionRecord: { findMany: jest.fn() },
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

  function createService() {
    const registry = new BusinessOntologyRegistry();
    const router = new AgentV5SemanticRouterService(registry);
    const evidencePack = new AgentV5EvidencePackService();
    const businessTool = new AgentV5BusinessToolAdapter(prisma as any);
    const lifecycle = new AgentV5LifecycleAdapter(marketing as any);
    return new AgentV5OrchestratorService(
      runtime as any,
      router,
      new AgentV5ContextBuilderService(),
      evidencePack,
      new AgentV5ClarificationService(),
      new AgentV5MemoryService(),
      new AgentV5ConstraintGuardService(),
      new AgentV5ReadonlyQueryAdapter(textToSql as any),
      lifecycle,
      businessTool,
      new AgentV5GovernanceAdapter(new AgentV5FailureDiagnosisService()),
      new AgentV5ReceptionAdapter(prisma as any),
      new AgentV5CashierAdapter(prisma as any),
      new AgentV5BeauticianAdapter(businessTool),
      new AgentV5ScheduleAdapter(businessTool),
      new AgentV5FinanceAdapter(businessTool),
      new AgentV5InventorySupplyAdapter(businessTool),
      new AgentV5StaffPerformanceAdapter(prisma as any),
      new AgentV5MarketingAdapter(lifecycle),
    );
  }

  beforeEach(() => {
    jest.clearAllMocks();
    runtime.createRun.mockResolvedValue({
      id: 501,
      runNo: 'ar_v5_501',
      status: 'created',
      agentCode: 'agent_v5',
      storeId: 1,
      personaCode: 'manager',
    });
    runtime.getRun.mockResolvedValue({
      id: 501,
      runNo: 'ar_v5_501',
      status: 'completed',
      agentCode: 'agent_v5',
      storeId: 1,
      personaCode: 'manager',
      contextJson: { agentEngine: 'agent_v5' },
    });
    runtime.setRunStatus.mockImplementation((id: number, status: string, data?: Record<string, unknown>) =>
      Promise.resolve({
        id,
        runNo: 'ar_v5_501',
        status,
        personaCode: 'manager',
        resultJson: data?.resultJson,
      }),
    );
    textToSql.run.mockResolvedValue({
      status: 'dry_run',
      answer: 'V3 只读查询服务返回了事实结果。',
      rows: [{ product_name: '面膜', quantity_sold: 12 }],
      evidence: {
        sourceViews: ['agent_v3_order_item_sales_view'],
        storeScope: '限定门店：1',
        fieldPolicies: [],
        limitations: ['仅允许 SELECT 只读查询。'],
      },
      queryTrace: { guard: { status: 'pass', appliedPolicies: ['select_only'] } },
    });
    marketing.getLifecycleOpportunities.mockResolvedValue({
      items: [{
        id: 11,
        customerId: 9,
        customer: { name: '王女士' },
        opportunityType: 'care_cycle_due',
        score: 88,
        evidence: ['距上次护理 31 天'],
        fulfillment: { inventoryReady: true, capacityReady: true },
      }],
      total: 1,
    });
    marketing.getLifecycleServiceCycles.mockResolvedValue({ items: [{ id: 21 }], total: 1 });
    marketing.createLifecycleBusinessPlan.mockResolvedValue({
      id: 61,
      storeId: 1,
      status: 'draft',
      actionsJson: [{ id: 'act-1', title: '护理周期召回', type: 'automation_draft', targetCustomerCount: 8 }],
    });
    marketing.submitLifecycleBusinessPlanActions.mockResolvedValue({
      submitted: true,
      approval: { id: 71, status: 'pending' },
      plan: { id: 61, status: 'waiting_approval' },
    });
    marketing.getLifecycleAttribution.mockResolvedValue({ items: [], total: 0 });
    marketing.getLifecycleQuality.mockResolvedValue({
      fieldCoverageRate: 0.8,
      ruleHitRate: 0.7,
      attributionCompletenessRate: 0.6,
    });
    marketing.getLifecycleRules.mockResolvedValue({ items: [{ id: 1, status: 'active' }] });
    prisma.productOrder.count.mockResolvedValue(3);
    prisma.reservation.count.mockResolvedValue(5);
    prisma.customerOpportunity.count.mockResolvedValue(9);
    prisma.productOrder.findMany.mockResolvedValue([{ id: 1, netAmount: 100, totalAmount: 120 }]);
    prisma.reservation.findMany.mockResolvedValue([{ id: 1, customerId: 9, projectId: 3, startTime: '10:00', status: 'pending' }]);
    prisma.product.findMany.mockResolvedValue([{ id: 1, name: '院装面膜', currentStock: 3, safetyStock: 10 }]);
    prisma.customer.findMany.mockResolvedValue([{ id: 9, name: '王女士', level: '金卡' }]);
    prisma.customerCard.findMany.mockResolvedValue([{ id: 19, customerId: 9, cardName: '护理卡' }]);
    prisma.cardUsageRecord.findMany.mockResolvedValue([{ id: 29, customerId: 9 }]);
    prisma.commissionRecord.findMany.mockResolvedValue([{ id: 39, userId: 2, amount: 88 }]);
  });

  it('creates an independent agent_v5 run and routes lifecycle diagnosis through V5 adapter', async () => {
    const service = createService();

    const result = await service.createRun({
      message: '本周哪些客户该触达，为什么',
      actor,
      context: { agentEngine: 'agent_v5' },
    });

    expect(runtime.createRun).toHaveBeenCalledWith(expect.objectContaining({ agentCode: 'agent_v5' }));
    expect(marketing.getLifecycleOpportunities).toHaveBeenCalledWith(expect.objectContaining({ status: 'open' }), 1);
    expect(result.answer).toContain('生命周期机会');
    expect(result.plan?.businessTask).toMatchObject({
      architecture: 'agent_v5_business_ontology_agent',
      runtime: 'agent_v5',
      versionBoundary: 'independent_v5_runtime',
      reusePolicy: 'reuse_underlying_services_via_v5_adapters_only',
    });
  });

  it('reuses V3 controlled text-to-sql service without creating an agent_v3 run', async () => {
    const service = createService();

    const result = await service.createRun({
      message: '本月销量最高的商品排行',
      actor,
      context: { agentEngine: 'agent_v5' },
    });

    expect(textToSql.run).toHaveBeenCalledWith(expect.objectContaining({
      question: '本月销量最高的商品排行',
      runtimeContext: expect.objectContaining({
        architecture: 'agent_v5_business_ontology_agent',
        readOnlyVia: 'agent_v3_text_to_sql_service',
        agentCode: 'agent_v5',
      }),
    }));
    expect(runtime.createRun).toHaveBeenCalledTimes(1);
    expect(runtime.createRun).not.toHaveBeenCalledWith(expect.objectContaining({ agentCode: 'agent_v3' }));
    expect(result.evidence?.limitations?.join(' ')).toContain('Agent V5 独立运行');
  });

  it('creates and submits lifecycle business plans with sourceAgentCode agent_v5', async () => {
    const service = createService();

    const draft = await service.createRun({
      message: '生成本周经营计划',
      actor,
      context: { agentEngine: 'agent_v5' },
    });
    const submitted = await service.appendMessage({
      runId: 501,
      message: '提交经营计划 61 审批',
      actor,
      context: { agentEngine: 'agent_v5' },
    });

    expect(marketing.createLifecycleBusinessPlan).toHaveBeenCalledWith(expect.objectContaining({
      goalsJson: expect.objectContaining({ sourceAgentCode: 'agent_v5', sourceRunId: 501 }),
    }), 1, 2);
    expect(marketing.submitLifecycleBusinessPlanActions).toHaveBeenCalledWith(61, 1, expect.objectContaining({
      sourceAgentCode: 'agent_v5',
      sourceRunId: 501,
      sourceEntrypoint: 'ami-agent:auto',
    }), 2);
    expect(draft.status).toBe('waiting_approval');
    expect(submitted.answer).toContain('已提交审批');
  });

  it('uses full-business tool adapters for overview without touching legacy orchestrators', async () => {
    const service = createService();

    const result = await service.createRun({
      message: '今天店里情况怎么样',
      actor,
      context: { agentEngine: 'agent_v5' },
    });

    expect(prisma.productOrder.count).toHaveBeenCalled();
    expect(prisma.reservation.count).toHaveBeenCalled();
    expect(textToSql.run).not.toHaveBeenCalled();
    expect(marketing.getLifecycleOpportunities).not.toHaveBeenCalled();
    expect(result.answer).toContain('今日经营概览');
  });
});
