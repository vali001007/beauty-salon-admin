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

  it('does not fall back to controlled Text-to-SQL when no published capability matches', async () => {
    const previous = process.env.AGENT_V2_TEXT_TO_SQL_ENABLED;
    process.env.AGENT_V2_TEXT_TO_SQL_ENABLED = 'true';
    const runtime = runtimeMock(run);
    const agentV2Runtime = {
      planAsync: jest.fn().mockResolvedValue(null),
    };
    const service = new AgentV2OrchestratorService(
      agentV2Runtime as any,
      runtime as any,
      new AgentV2EvidenceService(),
      new AgentV2PolicyGatewayService(),
      prismaMock() as any,
    );

    try {
      const result = await service.processRun({ run, message: '本月销量最好的商品', actor, context: {} });

      expect(result.status).toBe('completed');
      expect(result.plan?.capabilityPlan?.capabilityId).toBe('agent_v2.unsupported');
      expect(result.plan?.capabilityPlan?.reason).toContain('能力中心补齐');
      expect(result.answer).toContain('Agent V2 当前没有匹配的已发布能力');
      expect(result.renderedBlocks).toEqual([]);
      expect(runtime.recordStep).not.toHaveBeenCalledWith(expect.objectContaining({
        name: expect.stringContaining('agent.v2.text_to_sql'),
      }));
    } finally {
      if (previous === undefined) {
        delete process.env.AGENT_V2_TEXT_TO_SQL_ENABLED;
      } else {
        process.env.AGENT_V2_TEXT_TO_SQL_ENABLED = previous;
      }
    }
  });

  it('does not fall back to controlled Text-to-SQL for ordinary users', async () => {
    const previousEnabled = process.env.AGENT_V2_TEXT_TO_SQL_ENABLED;
    const previousAdminOnly = process.env.AGENT_V2_TEXT_TO_SQL_ADMIN_ONLY;
    process.env.AGENT_V2_TEXT_TO_SQL_ENABLED = 'true';
    delete process.env.AGENT_V2_TEXT_TO_SQL_ADMIN_ONLY;
    const runtime = runtimeMock(run);
    const agentV2Runtime = {
      planAsync: jest.fn().mockResolvedValue(null),
    };
    const service = new AgentV2OrchestratorService(
      agentV2Runtime as any,
      runtime as any,
      new AgentV2EvidenceService(),
      new AgentV2PolicyGatewayService(),
      prismaMock() as any,
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

      expect(result.plan?.capabilityPlan?.capabilityId).toBe('agent_v2.unsupported');
      expect(runtime.recordStep).not.toHaveBeenCalledWith(expect.objectContaining({
        name: expect.stringContaining('agent.v2.text_to_sql'),
      }));
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
