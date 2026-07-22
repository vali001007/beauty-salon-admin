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
jest.mock('./knowledge/capability-catalog.service.js', () => ({ CapabilityCatalogService: class CapabilityCatalogService {} }));
jest.mock('./knowledge/entity-resolver.service.js', () => ({ EntityResolverService: class EntityResolverService {} }));
jest.mock('./knowledge/schema-graph.service.js', () => ({ SchemaGraphService: class SchemaGraphService {} }));

import { AgentController } from './agent.controller.js';

describe('AgentController', () => {
  let orchestrator: jest.Mocked<any>;
  let personaService: jest.Mocked<any>;
  let businessTaskCompiler: jest.Mocked<any>;
  let queryPlanner: jest.Mocked<any>;
  let semanticQueryExecutor: jest.Mocked<any>;
  let responseComposer: jest.Mocked<any>;
  let memoryService: jest.Mocked<any>;
  let observabilityService: jest.Mocked<any>;
  let automationService: jest.Mocked<any>;
  let schemaReadinessService: jest.Mocked<any>;
  let capabilityCatalog: jest.Mocked<any>;
  let entityResolver: jest.Mocked<any>;
  let schemaGraph: jest.Mocked<any>;
  let prisma: jest.Mocked<any>;
  let controller: AgentController;

  beforeEach(() => {
    delete process.env.AGENT_TERMINAL_RUNTIME_ENABLED;
    orchestrator = {
      createRun: jest.fn().mockResolvedValue({ runId: 101 }),
      appendMessage: jest.fn().mockResolvedValue({ runId: 101 }),
      approve: jest.fn().mockResolvedValue({ runId: 101 }),
      reject: jest.fn().mockResolvedValue({ runId: 101 }),
    };
    personaService = {
      listForRole: jest.fn(),
      listAll: jest.fn(),
      getByCode: jest.fn(),
      update: jest.fn(),
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
    capabilityCatalog = {
      list: jest.fn().mockReturnValue([
        {
          capabilityId: 'marketing.activity.link.lookup',
          businessQueryCapabilityId: 'marketing_activity_link_lookup',
          displayName: '营销活动链接查询',
          personaCodes: ['manager', 'marketing'],
          objectTypes: ['MarketingActivity'],
          actions: ['get_link'],
          outputKinds: ['link_card', 'evidence_panel'],
          riskLevel: 'low',
          examples: ['活动链接发我'],
        },
      ]),
    };
    entityResolver = {
      resolve: jest.fn().mockResolvedValue({ status: 'not_found', query: '', candidates: [] }),
    };
    schemaGraph = {
      listNodes: jest.fn().mockReturnValue([
        {
          modelName: 'MarketingActivity',
          objectType: 'MarketingActivity',
          displayName: '营销活动',
          storeScoped: false,
          relations: [],
          fields: [{ name: 'title', queryable: true }],
        },
      ]),
    };
    prisma = {
      user: {
        findFirst: jest.fn(),
      },
      beautician: {
        findFirst: jest.fn(),
      },
      agentRun: {
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn(),
      },
      agentFeedback: {
        create: jest.fn(),
      },
    };
    controller = new AgentController(
      orchestrator,
      personaService,
      businessTaskCompiler,
      {} as any,
      {} as any,
      prisma as any,
      memoryService,
      observabilityService,
      automationService,
      schemaReadinessService,
      capabilityCatalog,
      entityResolver,
      schemaGraph,
      queryPlanner,
      semanticQueryExecutor,
      responseComposer,
    );
  });

  it('stores message-level question and answer snapshot when submitting feedback', async () => {
    prisma.agentRun.findFirst.mockResolvedValue({
      id: 101,
      storeId: 6,
      userId: 2,
      userInput: '第一问：今天营收多少',
      planJson: {},
      resultJson: { answer: '第一问回答' },
      errorMessage: null,
    });
    prisma.agentFeedback.create.mockResolvedValue({ id: 301 });

    await controller.submitFeedback(
      101,
      {
        adopted: false,
        feedbackScope: 'message',
        messageId: 'a-2',
        questionIndex: 2,
        question: '第二问：哪些客户今天要跟进',
        answer: '第二问回答',
      },
      { storeId: 6, userId: 2 },
    );

    expect(prisma.agentFeedback.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        runId: 101,
        adopted: false,
        businessActionJson: expect.objectContaining({
          snapshot: expect.objectContaining({
            feedbackScope: 'message',
            messageId: 'a-2',
            questionIndex: 2,
            question: '第二问：哪些客户今天要跟进',
            answer: '第二问回答',
          }),
        }),
      }),
    }));
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

  it('returns read-only knowledge governance summary for Agent Studio', async () => {
    entityResolver.resolve.mockResolvedValue({
      status: 'resolved',
      query: '活动链接发我',
      entity: { objectType: 'MarketingActivity', entityId: '7', displayName: '老朋友回店礼', confidence: 0.95 },
      candidates: [{ objectType: 'MarketingActivity', entityId: '7', displayName: '老朋友回店礼', confidence: 0.95 }],
    });
    prisma.agentRun.findMany.mockResolvedValue([
      {
        id: 1,
        runNo: 'AR001',
        userInput: '未知问题',
        planJson: { plannerTrace: { executionPath: 'legacy_fallback', fallbackReason: 'capability_not_found' } },
        resultJson: {},
        createdAt: new Date('2026-06-30T08:00:00Z'),
      },
    ]);

    const result = await controller.knowledgeGovernance(
      { storeId: 6, role: 'manager' },
      'marketing.activity.link.lookup',
      '活动链接发我',
    );

    expect(result.capabilityCatalog.filtered).toBe(1);
    expect(result.schemaGraph.nodeCount).toBe(1);
    expect(result.entityDebug?.status).toBe('resolved');
    expect(result.legacyRules.legacyFallbackRuns).toBe(1);
    expect(result.legacyRules.usageByReason[0]).toEqual({ reason: 'capability_not_found', count: 1 });
    expect(result.legacyRules.retainedReasons).toEqual(
      expect.arrayContaining([expect.objectContaining({ reason: 'capability_not_found', latestCount: 1 })]),
    );
    expect(result.legacyRules.deprecationCandidates).toHaveLength(0);
  });

  it('marks legacy fallback reasons as deprecation candidates after two unhit windows', async () => {
    entityResolver.resolve.mockResolvedValue({
      status: 'not_found',
      query: '未知问题',
      candidates: [],
    });
    prisma.agentRun.findMany.mockResolvedValue([
      {
        id: 1,
        runNo: 'AR001',
        userInput: '未知问题 A',
        planJson: { plannerTrace: { executionPath: 'legacy_fallback', fallbackReason: 'capability_not_found' } },
        resultJson: {},
        createdAt: new Date('2026-06-30T08:00:00Z'),
      },
      {
        id: 2,
        runNo: 'AR002',
        userInput: '普通问题 B',
        planJson: { plannerTrace: { executionPath: 'knowledge_graph', fallbackReason: null } },
        resultJson: {},
        createdAt: new Date('2026-06-29T08:00:00Z'),
      },
      {
        id: 3,
        runNo: 'AR003',
        userInput: '普通问题 C',
        planJson: { plannerTrace: { executionPath: 'knowledge_graph', fallbackReason: null } },
        resultJson: {},
        createdAt: new Date('2026-06-28T08:00:00Z'),
      },
      {
        id: 4,
        runNo: 'AR004',
        userInput: '普通问题 D',
        planJson: { plannerTrace: { executionPath: 'knowledge_graph', fallbackReason: null } },
        resultJson: {},
        createdAt: new Date('2026-06-27T08:00:00Z'),
      },
    ]);

    const result = await controller.knowledgeGovernance(
      { storeId: 6, role: 'manager' },
      undefined,
      '未知问题',
    );

    expect(result.legacyRules.deprecationWindows.latest.runCount).toBe(2);
    expect(result.legacyRules.deprecationWindows.previous.runCount).toBe(2);
    expect(result.legacyRules.retainedReasons).toEqual(
      expect.arrayContaining([expect.objectContaining({ reason: 'capability_not_found', latestCount: 1, previousCount: 0 })]),
    );
    expect(result.legacyRules.deprecationCandidates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          reason: 'legacy_rule_fallback',
          latestCount: 0,
          previousCount: 0,
          action: 'move_to_deprecated_candidate',
        }),
      ]),
    );
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

  it('updates an Agent Persona configuration', async () => {
    personaService.update.mockResolvedValue({
      code: 'inventory',
      name: '库存采购 Agent',
      toolGroups: ['inventory.risk.rank'],
      suggestedQuestions: ['近期有哪些临期库存产品？'],
    });

    const result = await controller.updatePersona('inventory', {
      toolGroups: ['inventory.risk.rank'],
      suggestedQuestions: ['近期有哪些临期库存产品？'],
    });

    expect(result).toEqual({
      code: 'inventory',
      name: '库存采购 Agent',
      toolGroups: ['inventory.risk.rank'],
      suggestedQuestions: ['近期有哪些临期库存产品？'],
    });
    expect(personaService.update).toHaveBeenCalledWith('inventory', {
      toolGroups: ['inventory.risk.rank'],
      suggestedQuestions: ['近期有哪些临期库存产品？'],
    });
  });

  it('preserves terminal entrypoint and context when creating a Kiosk AgentRun', async () => {
    await controller.createRun(
      1,
      7,
      9,
      ['terminal:agent:ask'],
      { customerPhone: 'masked' },
      {
        message: '近期有哪些临期库存产品',
        role: 'manager',
        entrypoint: 'terminal:kiosk',
        personaCode: 'inventory',
        context: {
          terminal: {
            entrypoint: 'terminal:kiosk',
            personaCode: 'inventory',
            sourceAction: 'manager.inventory',
          },
        },
      },
      ['manager', 'reception', 'beautician'],
    );

    expect(orchestrator.createRun).toHaveBeenCalledWith({
      message: '近期有哪些临期库存产品',
      context: {
        terminal: {
          entrypoint: 'terminal:kiosk',
          personaCode: 'inventory',
          sourceAction: 'manager.inventory',
        },
      },
      actor: {
        storeId: 1,
        userId: 7,
        deviceId: 9,
        role: 'manager',
        entrypoint: 'terminal:kiosk',
        personaCode: 'inventory',
        permissions: ['terminal:agent:ask'],
        fieldScopes: { customerPhone: 'masked' },
      },
    });
  });

  it('rejects Kiosk AgentRun creation when terminal runtime is disabled', async () => {
    process.env.AGENT_TERMINAL_RUNTIME_ENABLED = 'false';

    await expect(
      controller.createRun(
        1,
        7,
        9,
        ['terminal:agent:ask'],
        { customerPhone: 'masked' },
        {
          message: '今天经营有什么风险',
          role: 'manager',
          entrypoint: 'terminal:kiosk',
        },
        ['manager'],
      ),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        code: 'AGENT_TERMINAL_RUNTIME_DISABLED',
      }),
    });
    expect(orchestrator.createRun).not.toHaveBeenCalled();
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
        entrypoint: 'terminal:kiosk',
        personaCode: 'beautician',
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
        entrypoint: 'terminal:kiosk',
        personaCode: 'beautician',
        permissions: ['terminal:service:view'],
        fieldScopes: { customerPhone: 'masked' },
      },
    });
  });

  it('rejects Kiosk AgentRun append when terminal runtime is disabled', async () => {
    process.env.AGENT_TERMINAL_RUNTIME_ENABLED = 'off';

    await expect(
      controller.appendMessage(
        101,
        1,
        7,
        9,
        ['terminal:service:view'],
        { customerPhone: 'masked' },
        {
          message: '继续看库存风险',
          role: 'manager',
          entrypoint: 'terminal:kiosk',
        },
      ),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        code: 'AGENT_TERMINAL_RUNTIME_DISABLED',
      }),
    });
    expect(orchestrator.appendMessage).not.toHaveBeenCalled();
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

    const result = await controller.previewQueryPlan({
      storeId: 1,
      userId: 7,
      permissions: ['*'],
      availableRoles: ['manager'],
    }, {
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
      actor: {
        principalType: 'user',
        userId: 7,
        storeId: 1,
        role: 'manager',
        permissions: ['*'],
      },
      capabilityId: 'revenue_diagnosis',
    });
    expect(result.queryPlan).toMatchObject({
      queryId: 'sq_test',
      dimensions: ['date'],
    });
  });

  it('does not trust DTO role or operatorId for semantic query authorization', async () => {
    const task = {
      taskType: 'ranking',
      domain: 'staff',
      objective: '我的业绩排行',
      metrics: ['staff_performance_score'],
      filters: {},
      missingSlots: [],
      confidence: 0.9,
    };
    prisma.beautician.findFirst.mockResolvedValue({ id: 17 });
    businessTaskCompiler.compile.mockResolvedValue({
      task,
      validation: { warnings: [] },
      capabilityMatches: [{ capabilityId: 'staff_performance_ranking', reason: 'staff', toolPlan: [] }],
      semanticSqlCandidate: { fallbackCapability: 'staff_performance_ranking' },
    });
    queryPlanner.plan.mockReturnValue({ plan: { queryId: 'sq_self' }, warnings: [] });

    await (controller as any).previewQueryPlan(
      {
        storeId: 1,
        userId: 9,
        roles: ['beautician'],
        permissions: ['core:beautician-performance:view'],
        availableRoles: ['beautician'],
      },
      { message: '我的业绩排行', role: 'manager', operatorId: 999 },
    );

    expect(businessTaskCompiler.compile).toHaveBeenCalledWith({
      message: '我的业绩排行',
      role: 'beautician',
      context: undefined,
    });
    expect(queryPlanner.plan).toHaveBeenCalledWith(
      expect.objectContaining({
        actor: expect.objectContaining({
          userId: 9,
          storeId: 1,
          role: 'beautician',
          beauticianId: 17,
        }),
      }),
    );
    expect(prisma.user.findFirst).not.toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ id: 999 }) }),
    );
  });

  it('rejects a device-only principal even when DTO role claims manager', async () => {
    await expect(
      (controller as any).previewQueryPlan(
        { storeId: 1, id: 88, deviceCode: 'AURA-88' },
        { message: '今天实收多少', role: 'manager' },
      ),
    ).rejects.toThrow('semantic_query_user_principal_required');
    expect(businessTaskCompiler.compile).not.toHaveBeenCalled();
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

    const result = await controller.executeSemanticQuery(
      { storeId: 1, userId: 7, permissions: ['*'], availableRoles: ['manager'] },
      { message: '今天收银多少', role: 'manager', operatorId: 7 },
    );

    expect(semanticQueryExecutor.execute).toHaveBeenCalledWith(plan);
    expect(responseComposer.compose).toHaveBeenCalledWith(semanticResult);
    expect(result).toMatchObject({
      result: semanticResult,
      composed: { title: '收银收入', overview: { conclusion: '今天实收 ¥300。' } },
      warnings: ['使用当前门店'],
    });
  });
});
