jest.mock('./agent-orchestrator.service.js', () => ({ AgentOrchestratorService: class AgentOrchestratorService {} }));
jest.mock('./business-task/business-task-compiler.service.js', () => ({
  BusinessTaskCompilerService: class BusinessTaskCompilerService {},
}));
jest.mock('../semantic-sql/semantic-sql-executor.service.js', () => ({
  SemanticSqlExecutorService: class SemanticSqlExecutorService {},
}));
jest.mock('./agent-capability-candidate.service.js', () => ({
  AgentCapabilityCandidateService: class AgentCapabilityCandidateService {},
}));

import { AgentController } from './agent.controller.js';

describe('AgentController', () => {
  let orchestrator: jest.Mocked<any>;
  let businessTaskCompiler: jest.Mocked<any>;
  let queryPlanner: jest.Mocked<any>;
  let semanticQueryExecutor: jest.Mocked<any>;
  let responseComposer: jest.Mocked<any>;
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
    prisma = {
      user: {
        findFirst: jest.fn(),
      },
    };
    controller = new AgentController(orchestrator, businessTaskCompiler, {} as any, {} as any, prisma as any, queryPlanner, semanticQueryExecutor, responseComposer);
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
