jest.mock('./agent-orchestrator.service.js', () => ({ AgentOrchestratorService: class AgentOrchestratorService {} }));
jest.mock('./agent-persona.service.js', () => ({ AgentPersonaService: class AgentPersonaService {} }));
jest.mock('./business-task/business-task-compiler.service.js', () => ({
  BusinessTaskCompilerService: class BusinessTaskCompilerService {},
}));
jest.mock('../semantic-sql/semantic-sql-executor.service.js', () => ({
  SemanticSqlExecutorService: class SemanticSqlExecutorService {},
}));
jest.mock('./agent-capability-candidate.service.js', () => ({
  AgentCapabilityCandidateService: class AgentCapabilityCandidateService {},
}));
jest.mock('./agent-automation.service.js', () => ({ AgentAutomationService: class AgentAutomationService {} }));
jest.mock('./agent-memory.service.js', () => ({ AgentMemoryService: class AgentMemoryService {} }));
jest.mock('./agent-observability.service.js', () => ({ AgentObservabilityService: class AgentObservabilityService {} }));
jest.mock('./agent-schema-readiness.service.js', () => ({ AgentSchemaReadinessService: class AgentSchemaReadinessService {} }));

import { AgentController } from './agent.controller.js';

describe('AgentController', () => {
  let orchestrator: jest.Mocked<any>;
  let businessTaskCompiler: jest.Mocked<any>;
  let queryPlanner: jest.Mocked<any>;
  let semanticQueryExecutor: jest.Mocked<any>;
  let responseComposer: jest.Mocked<any>;
  let memoryService: jest.Mocked<any>;
  let observabilityService: jest.Mocked<any>;
  let automationService: jest.Mocked<any>;
  let schemaReadinessService: jest.Mocked<any>;
  let prisma: jest.Mocked<any>;
  let controller: AgentController;

  beforeEach(() => {
    orchestrator = {
      createRun: jest.fn().mockResolvedValue({ runId: 101 }),
      appendMessage: jest.fn().mockResolvedValue({ runId: 101 }),
      approve: jest.fn().mockResolvedValue({ runId: 101 }),
      reject: jest.fn().mockResolvedValue({ runId: 101 }),
    };
    businessTaskCompiler = {
      compile: jest.fn(),
    };
    queryPlanner = {
      plan: jest.fn(),
    };
    semanticQueryExecutor = {
      execute: jest.fn(),
    };
    responseComposer = {
      compose: jest.fn(),
    };
    memoryService = {
      listMemories: jest.fn(),
      createMemory: jest.fn(),
      listDailyArchives: jest.fn(),
      generateDailyArchive: jest.fn(),
    };
    observabilityService = {
      getQualityReport: jest.fn(),
    };
    automationService = {
      listTriggerTemplates: jest.fn(),
      listDefinitions: jest.fn(),
      createDraft: jest.fn(),
      listRuns: jest.fn(),
      listEffects: jest.fn(),
      runOnce: jest.fn(),
      runDueAutomations: jest.fn(),
      evaluateEvent: jest.fn(),
      listPendingApprovals: jest.fn(),
      decideRunApproval: jest.fn(),
      recoverDefinition: jest.fn(),
      recordAttribution: jest.fn(),
    };
    schemaReadinessService = {
      getStatus: jest.fn(),
    };
    prisma = {
      user: {
        findFirst: jest.fn(),
      },
    };
    controller = new AgentController(
      orchestrator,
      {} as any,
      businessTaskCompiler,
      {} as any,
      {} as any,
      prisma as any,
      memoryService,
      observabilityService,
      automationService,
      schemaReadinessService,
      queryPlanner,
      semanticQueryExecutor,
      responseComposer,
    );
  });

  it('returns Agent schema readiness status without mutating business data', async () => {
    schemaReadinessService.getStatus.mockResolvedValue({
      ready: false,
      missingTables: ['agent_daily_archives'],
    });

    const result = await controller.schemaReadiness();

    expect(result).toEqual({ ready: false, missingTables: ['agent_daily_archives'] });
    expect(schemaReadinessService.getStatus).toHaveBeenCalledWith();
  });

  it('creates an Agent automation draft for the current store', async () => {
    automationService.createDraft.mockResolvedValue({ id: 7, status: 'draft' });

    const result = await controller.createAutomationDraft(6, 2, {
      personaCode: 'marketing',
      goal: '沉睡客户自动召回',
      sourceRunId: 88,
    });

    expect(result).toEqual({ id: 7, status: 'draft' });
    expect(automationService.createDraft).toHaveBeenCalledWith({
      storeId: 6,
      userId: 2,
      personaCode: 'marketing',
      goal: '沉睡客户自动召回',
      name: undefined,
      description: undefined,
      triggerType: undefined,
      triggerConfig: undefined,
      actionPlan: undefined,
      approvalPolicy: undefined,
      schedule: undefined,
      riskLevel: undefined,
      sourceRunId: 88,
    });
  });

  it('manually runs an Agent automation in current store context', async () => {
    automationService.runOnce.mockResolvedValue({ run: { id: 31 }, approvalRequired: true });

    const result = await controller.runAutomationOnce(7, 6, 2, { dryRun: true });

    expect(result).toEqual({ run: { id: 31 }, approvalRequired: true });
    expect(automationService.runOnce).toHaveBeenCalledWith({
      storeId: 6,
      userId: 2,
      definitionId: 7,
      mode: undefined,
      dryRun: true,
      input: undefined,
    });
  });

  it('runs due Agent automations in current store context', async () => {
    automationService.runDueAutomations.mockResolvedValue({ triggeredCount: 1 });

    const result = await controller.runDueAutomations(6, 2, { now: '2026-06-26T09:00:00Z', limit: 3 });

    expect(result).toEqual({ triggeredCount: 1 });
    expect(automationService.runDueAutomations).toHaveBeenCalledWith({
      storeId: 6,
      userId: 2,
      now: '2026-06-26T09:00:00Z',
      limit: 3,
      dryRun: undefined,
    });
  });

  it('evaluates Agent automation events in current store context', async () => {
    automationService.evaluateEvent.mockResolvedValue({ matchedCount: 1 });

    const result = await controller.evaluateAutomationEvent(6, 2, {
      eventType: 'metric_threshold',
      payload: { metricKey: 'refund_amount', value: 1200 },
    });

    expect(result).toEqual({ matchedCount: 1 });
    expect(automationService.evaluateEvent).toHaveBeenCalledWith({
      storeId: 6,
      userId: 2,
      eventType: 'metric_threshold',
      payload: { metricKey: 'refund_amount', value: 1200 },
      limit: undefined,
      dryRun: undefined,
    });
  });

  it('approves a pending Agent automation run in current store context', async () => {
    automationService.decideRunApproval.mockResolvedValue({ approved: true });

    const result = await controller.approveAutomationRun(77, 6, 2, { comment: '确认执行' });

    expect(result).toEqual({ approved: true });
    expect(automationService.decideRunApproval).toHaveBeenCalledWith({
      storeId: 6,
      userId: 2,
      runId: 77,
      decision: 'approve',
      comment: '确认执行',
    });
  });

  it('records Agent automation attribution in current store context', async () => {
    automationService.recordAttribution.mockResolvedValue({ id: 91 });

    const result = await controller.recordAutomationAttribution(6, 2, {
      definitionId: 7,
      runId: 77,
      metricKey: 'attributed_revenue',
      impact: { revenue: 399 },
    });

    expect(result).toEqual({ id: 91 });
    expect(automationService.recordAttribution).toHaveBeenCalledWith({
      storeId: 6,
      userId: 2,
      definitionId: 7,
      runId: 77,
      effectType: undefined,
      objectType: undefined,
      objectId: undefined,
      customerId: undefined,
      metricKey: 'attributed_revenue',
      impact: { revenue: 399 },
    });
  });

  it('uses only roles available to the authenticated terminal account', async () => {
    await controller.createRun(
      1,
      7,
      9,
      ['terminal:service:view'],
      { customerPhone: 'masked' },
      {
        message: '我的表现怎么样',
        role: 'beautician',
      },
      ['beautician'],
    );

    expect(orchestrator.createRun).toHaveBeenCalledWith({
      message: '我的表现怎么样',
      context: undefined,
      actor: {
        storeId: 1,
        userId: 7,
        deviceId: 9,
        role: 'beautician',
        entrypoint: 'api',
        permissions: ['terminal:service:view'],
        fieldScopes: { customerPhone: 'masked' },
      },
    });
  });

  it('uses the selected terminal operator as the Agent actor after validating store and role', async () => {
    prisma.user.findFirst.mockResolvedValue({
      id: 31,
      status: 'active',
      deletedAt: null,
      stores: [{ storeId: 1 }],
      roles: [
        {
          role: {
            key: 'beautician',
            permissions: ['terminal:service:view'],
            fieldScopes: { customerPhone: 'masked' },
          },
        },
      ],
    });

    await controller.createRun(
      1,
      7,
      9,
      ['*'],
      { customerPhone: 'visible' },
      {
        message: '我的表现怎么样',
        role: 'beautician',
        operatorId: 31,
      },
      ['manager', 'reception', 'beautician'],
    );

    expect(prisma.user.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: 31 }),
      }),
    );
    expect(orchestrator.createRun).toHaveBeenCalledWith({
      message: '我的表现怎么样',
      context: undefined,
      actor: {
        storeId: 1,
        userId: 31,
        deviceId: 9,
        role: 'beautician',
        entrypoint: 'api',
        permissions: ['terminal:service:view'],
        fieldScopes: {
          customerPhone: 'masked',
          customerWechat: 'masked',
          customerBalance: 'hidden',
          customerCost: 'hidden',
          customerProfit: 'hidden',
          customerPrivateNote: 'hidden',
          customerRemark: 'visible',
          staffCommission: 'hidden',
        },
      },
    });
  });

  it('rejects a requested Agent role that is not available to the account', async () => {
    await expect(
      controller.createRun(
        1,
        7,
        9,
        ['terminal:device:view'],
        {},
        {
          message: '终端最近失败最多的问题',
          role: 'manager',
        },
        ['beautician'],
      ),
    ).rejects.toThrow('当前账号不能使用「店长」角色');
    expect(orchestrator.createRun).not.toHaveBeenCalled();
  });

  it('passes the request role when appending an Agent message', async () => {
    await controller.appendMessage(
      101,
      1,
      7,
      9,
      ['terminal:service:view'],
      { customerPhone: 'masked' },
      {
        message: '继续看我的服务质量',
        role: 'beautician',
        context: { source: 'test' },
      },
    );

    expect(orchestrator.appendMessage).toHaveBeenCalledWith({
      runId: 101,
      message: '继续看我的服务质量',
      context: { source: 'test' },
      actor: {
        storeId: 1,
        userId: 7,
        deviceId: 9,
        role: 'beautician',
        entrypoint: 'api',
        permissions: ['terminal:service:view'],
        fieldScopes: { customerPhone: 'masked' },
      },
    });
  });

  it('passes the request role when approving an Agent action', async () => {
    await controller.approve(
      301,
      1,
      7,
      9,
      ['core:order:create'],
      { customerPhone: 'masked' },
      {
        role: 'reception',
        comment: '前台确认',
        args: { limit: 5 },
      },
    );

    expect(orchestrator.approve).toHaveBeenCalledWith({
      approvalId: 301,
      comment: '前台确认',
      args: { limit: 5 },
      actor: {
        storeId: 1,
        userId: 7,
        deviceId: 9,
        role: 'reception',
        entrypoint: 'api',
        permissions: ['core:order:create'],
        fieldScopes: { customerPhone: 'masked' },
      },
    });
  });

  it('passes the request role when rejecting an Agent action', async () => {
    await controller.reject(
      302,
      1,
      7,
      9,
      ['terminal:service:view'],
      { customerPhone: 'masked' },
      {
        role: 'beautician',
        comment: '本人不执行',
      },
    );

    expect(orchestrator.reject).toHaveBeenCalledWith({
      approvalId: 302,
      comment: '本人不执行',
      actor: {
        storeId: 1,
        userId: 7,
        deviceId: 9,
        role: 'beautician',
        entrypoint: 'api',
        permissions: ['terminal:service:view'],
        fieldScopes: { customerPhone: 'masked' },
      },
    });
  });

  it('previews unified query plan without executing database queries', async () => {
    const task = {
      taskType: 'query',
      domain: 'order',
      objective: '最近七天收银趋势',
      metrics: ['paid_amount'],
      filters: {},
      missingSlots: [],
      confidence: 0.9,
    };
    businessTaskCompiler.compile.mockResolvedValue({
      task,
      validation: { warnings: [] },
      capabilityMatches: [{ capabilityId: 'revenue_diagnosis', reason: '命中收入诊断', toolPlan: [] }],
      semanticSqlCandidate: { fallbackCapability: 'revenue_diagnosis' },
    });
    queryPlanner.plan.mockReturnValue({
      plan: { queryId: 'sq_test', metrics: [{ key: 'paid_amount', aggregation: 'sum' }], dimensions: ['date'] },
      warnings: [],
    });

    const result = await controller.previewQueryPlan(1, {
      message: '最近七天收银趋势',
      role: 'manager',
      operatorId: 7,
    });

    expect(businessTaskCompiler.compile).toHaveBeenCalledWith({
      message: '最近七天收银趋势',
      role: 'manager',
      context: undefined,
    });
    expect(queryPlanner.plan).toHaveBeenCalledWith({
      task,
      role: 'manager',
      storeId: 1,
      operatorId: 7,
      capabilityId: 'revenue_diagnosis',
    });
    expect(result.queryPlan).toMatchObject({
      queryId: 'sq_test',
      dimensions: ['date'],
    });
  });

  it('executes unified semantic query and returns composed user-facing response', async () => {
    const task = {
      taskType: 'query',
      domain: 'order',
      objective: '今天收银多少',
      metrics: ['paid_amount'],
      filters: {},
      missingSlots: [],
      confidence: 0.9,
    };
    const plan = { queryId: 'sq_exec', metrics: [{ key: 'paid_amount', aggregation: 'sum' }], dimensions: ['date'] };
    const semanticResult = {
      status: 'success',
      queryId: 'sq_exec',
      capabilityId: 'revenue_diagnosis',
      title: '收银收入',
      summary: '今天实收 ¥300。',
      rows: [{ paidAmount: 300 }],
      actions: [],
      auditEvidence: { source: ['ProductOrder'], metricDefinition: '测试', filters: ['当前门店'] },
    };
    businessTaskCompiler.compile.mockResolvedValue({
      task,
      validation: { warnings: [] },
      capabilityMatches: [{ capabilityId: 'revenue_diagnosis', reason: '命中收入诊断', toolPlan: [] }],
      semanticSqlCandidate: { fallbackCapability: 'revenue_diagnosis' },
    });
    queryPlanner.plan.mockReturnValue({ plan, warnings: ['使用当前门店'] });
    semanticQueryExecutor.execute.mockResolvedValue(semanticResult);
    responseComposer.compose.mockReturnValue({ title: '收银收入', overview: { conclusion: '今天实收 ¥300。' }, details: [], nextActions: [] });

    const result = await controller.executeSemanticQuery(1, { message: '今天收银多少', role: 'manager', operatorId: 7 });

    expect(semanticQueryExecutor.execute).toHaveBeenCalledWith(plan);
    expect(responseComposer.compose).toHaveBeenCalledWith(semanticResult);
    expect(result).toMatchObject({
      result: semanticResult,
      composed: { title: '收银收入', overview: { conclusion: '今天实收 ¥300。' } },
      warnings: ['使用当前门店'],
    });
  });
});
