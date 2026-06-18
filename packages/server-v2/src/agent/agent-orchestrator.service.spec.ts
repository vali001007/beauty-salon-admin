import { AgentEvidenceService } from './agent-evidence.service.js';
import { AgentFieldScopeSanitizerService } from './agent-field-scope-sanitizer.service.js';
import { AgentOrchestratorService } from './agent-orchestrator.service.js';
import { AgentResponseSafetyService } from './agent-response-safety.service.js';

describe('AgentOrchestratorService', () => {
  const actor = { storeId: 1, userId: 7, deviceId: 0, role: 'manager' as const, entrypoint: 'test' };
  let runtime: jest.Mocked<any>;
  let planner: jest.Mocked<any>;
  let policy: jest.Mocked<any>;
  let toolRegistry: jest.Mocked<any>;
  let evalService: jest.Mocked<any>;
  let service: AgentOrchestratorService;

  beforeEach(() => {
    runtime = {
      createRun: jest.fn().mockResolvedValue({ id: 101, runNo: 'ar_test', status: 'created' }),
      getRun: jest.fn(),
      addMessage: jest.fn().mockResolvedValue({}),
      setRunStatus: jest.fn(async (id: number, status: string, data?: any) => ({
        id,
        runNo: 'ar_test',
        status,
        ...(data ?? {}),
      })),
      persistPlan: jest.fn().mockResolvedValue({}),
      recordStep: jest.fn().mockResolvedValue({}),
      createToolCall: jest.fn().mockResolvedValue({ id: 201 }),
      updateToolCall: jest.fn().mockResolvedValue({}),
      createApproval: jest.fn().mockResolvedValue({ id: 301, status: 'pending' }),
      getApproval: jest.fn(),
      getToolCall: jest.fn(),
      updateApproval: jest.fn().mockResolvedValue({}),
    };
    planner = {
      plan: jest.fn(),
    };
    policy = {
      validateToolAccess: jest.fn(),
    };
    toolRegistry = {
      get: jest.fn(),
      execute: jest.fn(),
      list: jest.fn(),
    };
    evalService = {
      runDefaultCases: jest.fn(),
    };
    service = new AgentOrchestratorService(
      runtime,
      planner,
      policy,
      toolRegistry,
      new AgentEvidenceService(),
      evalService,
      new AgentFieldScopeSanitizerService(),
      new AgentResponseSafetyService(),
    );
  });

  it('exposes default eval results for Agent Studio governance', async () => {
    evalService.runDefaultCases.mockResolvedValue({ total: 1, passed: 1, failed: 0, results: [] });

    await expect(service.runDefaultEvals()).resolves.toEqual({ total: 1, passed: 1, failed: 0, results: [] });
    expect(evalService.runDefaultCases).toHaveBeenCalledTimes(1);
  });

  it('executes low-risk tools and completes the run with evidence', async () => {
    const plan = {
      intentType: 'query',
      goal: '执行受控经营问数',
      toolPlan: [{ tool: 'business.query.ask', args: { question: '今天收入怎么样' } }],
      confidence: 0.8,
      clarificationNeeded: false,
    };
    planner.plan.mockResolvedValue(plan);
    toolRegistry.get.mockReturnValue({
      name: 'business.query.ask',
      riskLevel: 'low',
      allowedRoles: ['manager'],
      requiresApproval: false,
    });
    policy.validateToolAccess.mockReturnValue({ allowed: true, requiresApproval: false, riskLevel: 'low' });
    toolRegistry.execute.mockResolvedValue({
      status: 'success',
      title: '订单收入分析',
      summary: '今天收入 ¥8,000。',
      evidence: {
        source: ['ProductOrder'],
        metricDefinition: '收入 = 有效订单金额汇总。',
        filters: ['storeId=当前门店'],
        sampleSize: 8,
      },
      actions: [{ label: '查看订单', action: 'orders:open', riskLevel: 'low' }],
    });

    const result = await service.createRun({ message: '今天收入怎么样', actor });

    expect(result.status).toBe('completed');
    expect(result.answer).toBe('今天收入 ¥8,000。');
    expect(result.evidence?.source).toEqual(['订单']);
    expect(runtime.createToolCall).toHaveBeenCalledWith(expect.objectContaining({ status: 'running' }));
    expect(toolRegistry.execute).toHaveBeenCalledWith(
      'business.query.ask',
      { question: '今天收入怎么样' },
      expect.objectContaining({ storeId: 1, userId: 7, role: 'manager' }),
    );
  });

  it('fails before tool execution when policy rejects required permissions', async () => {
    const plan = {
      intentType: 'analysis_and_recommendation',
      goal: '诊断财务毛利',
      toolPlan: [{ tool: 'finance.margin.diagnose', args: { question: '近30天毛利怎么样' } }],
      confidence: 0.84,
      clarificationNeeded: false,
    };
    planner.plan.mockResolvedValue(plan);
    toolRegistry.get.mockReturnValue({
      name: 'finance.margin.diagnose',
      riskLevel: 'low',
      allowedRoles: ['manager'],
      requiredPermissions: ['core:order:view'],
      requiresApproval: false,
    });
    policy.validateToolAccess.mockImplementation(() => {
      throw new Error('当前账号缺少工具「finance.margin.diagnose」所需权限，无法执行该经营查询。');
    });

    const result = await service.createRun({
      message: '近30天毛利怎么样',
      actor: { ...actor, permissions: ['core:customer:view'] },
    });

    expect(result.status).toBe('failed');
    expect(result.answer).toContain('缺少工具「finance.margin.diagnose」所需权限');
    expect(runtime.createToolCall).not.toHaveBeenCalled();
    expect(toolRegistry.execute).not.toHaveBeenCalled();
  });

  it('completes with a no-data answer instead of fabricating a result', async () => {
    const plan = {
      intentType: 'analysis_and_recommendation',
      goal: '诊断库存风险',
      toolPlan: [{ tool: 'inventory.risk.rank', args: { question: '哪些商品库存不足', timeRange: 'last_30_days', limit: 10 } }],
      confidence: 0.86,
      clarificationNeeded: false,
    };
    planner.plan.mockResolvedValue(plan);
    toolRegistry.get.mockReturnValue({
      name: 'inventory.risk.rank',
      riskLevel: 'low',
      allowedRoles: ['manager'],
      requiredPermissions: ['core:inventory:view'],
      requiresApproval: false,
      consumedSlots: ['timeRange', 'limit'],
    });
    policy.validateToolAccess.mockReturnValue({ allowed: true, requiresApproval: false, riskLevel: 'low' });
    toolRegistry.execute.mockResolvedValue({
      status: 'no_data',
      title: '库存风险排行',
      summary: '近30天暂无低库存或临期商品。建议保持当前补货节奏。',
      data: {
        items: [],
        consumedSlots: {
          timeRange: { preset: 'last_30_days', label: '近30天', start: '2026-05-18', end: '2026-06-17' },
          limit: 10,
        },
      },
      evidence: {
        source: ['Product', 'StockBatch'],
        metricDefinition: '库存风险 = 当前库存、安全库存和临期批次综合判断。',
        filters: ['当前门店', '最多返回 10 条'],
        sampleSize: 0,
      },
      actions: [],
    });

    const result = await service.createRun({ message: '哪些商品库存不足', actor });

    expect(result.status).toBe('completed');
    expect(result.answer).toBe('近30天暂无低库存或临期商品。建议保持当前补货节奏。');
    expect(result.toolResults[0]).toMatchObject({ status: 'no_data', title: '库存风险排行' });
    expect(runtime.addMessage).toHaveBeenLastCalledWith(
      101,
      'assistant',
      '近30天暂无低库存或临期商品。建议保持当前补货节奏。',
      { status: 'completed' },
    );
  });

  it('normalizes user-visible internal enums and evidence text before returning Agent results', async () => {
    const plan = {
      intentType: 'analysis_and_recommendation',
      goal: '推荐优先跟进客户',
      toolPlan: [{ tool: 'customer.priority.rank', args: { question: '下周重点关注哪些客户', timeRange: 'next_week', limit: 10 } }],
      confidence: 0.86,
      clarificationNeeded: false,
    };
    planner.plan.mockResolvedValue(plan);
    toolRegistry.get.mockReturnValue({
      name: 'customer.priority.rank',
      riskLevel: 'low',
      allowedRoles: ['manager'],
      requiredPermissions: ['terminal:customer:view'],
      requiresApproval: false,
      consumedSlots: ['timeRange', 'limit'],
    });
    policy.validateToolAccess.mockReturnValue({ allowed: true, requiresApproval: false, riskLevel: 'low' });
    toolRegistry.execute.mockResolvedValue({
      status: 'success',
      title: '优先跟进客户',
      summary: '建议跟进 recommended 客户，依据 follow_up_priority_score。',
      data: {
        items: [{ customerName: '杨晓雯', priority: 'recommended' }],
        consumedSlots: {
          timeRange: { preset: 'next_week', label: '下周', start: '2026-06-21', end: '2026-06-28' },
          limit: 10,
        },
      },
      evidence: {
        source: ['CustomerPredictionSnapshot'],
        metricDefinition: 'follow_up_priority_score 综合评分。',
        filters: ['timeRange=下周', 'limit=10'],
        sampleSize: 1,
      },
      actions: [{ label: '执行 agent:tool:customer.followup.task.draft', action: 'agent:tool:customer.followup.task.draft', riskLevel: 'low' }],
    });

    const result = await service.createRun({ message: '下周重点关注哪些客户', actor });

    expect(result.status).toBe('completed');
    expect(result.answer).toContain('建议优先跟进');
    expect(result.answer).toContain('客户跟进优先评分');
    expect(result.answer).not.toContain('recommended');
    expect(result.answer).not.toContain('follow_up_priority_score');
    expect(result.toolResults[0].evidence?.metricDefinition).toBe('客户跟进优先评分 综合评分。');
    expect(result.toolResults[0].evidence?.filters).toEqual(['统计周期：下周', '最多返回 10 条']);
    expect(result.toolResults[0].actions?.[0].label).toBe('执行 Agent 动作');
  });

  it('masks customer contact fields before composing and persisting Agent results', async () => {
    const plan = {
      intentType: 'analysis_and_recommendation',
      goal: '推荐优先跟进客户',
      toolPlan: [{ tool: 'customer.priority.rank', args: { question: '今天优先回访客户', timeRange: 'today', limit: 1 } }],
      confidence: 0.86,
      clarificationNeeded: false,
    };
    planner.plan.mockResolvedValue(plan);
    toolRegistry.get.mockReturnValue({
      name: 'customer.priority.rank',
      riskLevel: 'low',
      allowedRoles: ['manager', 'reception', 'beautician'],
      requiredPermissions: ['core:customer:view'],
      requiresApproval: false,
      consumedSlots: ['timeRange', 'limit'],
    });
    policy.validateToolAccess.mockReturnValue({ allowed: true, requiresApproval: false, riskLevel: 'low' });
    toolRegistry.execute.mockResolvedValue({
      status: 'success',
      title: '优先跟进客户',
      summary: '建议今天优先联系张敏，手机号 13812345678。',
      data: {
        items: [{ customer: '张敏', phone: '13812345678', customerPhone: '13987654321', wechat: 'zhangmin88' }],
        consumedSlots: {
          timeRange: { preset: 'today', label: '今天', start: '2026-06-17', end: '2026-06-18' },
          limit: 1,
        },
      },
      evidence: {
        source: ['Customer'],
        metricDefinition: '客户优先级。',
        filters: ['当前门店'],
        sampleSize: 1,
      },
      actions: [],
    });

    const result = await service.createRun({
      message: '今天优先回访客户',
      actor: { ...actor, fieldScopes: { customerPhone: 'masked', customerWechat: 'hidden' } },
    });

    expect(result.status).toBe('completed');
    expect(result.answer).toContain('138****5678');
    expect(result.answer).not.toContain('13812345678');
    expect(result.toolResults[0].data).toMatchObject({
      items: [{ customer: '张敏', phone: '138****5678', customerPhone: '139****4321' }],
    });
    expect(JSON.stringify(result.toolResults[0].data)).not.toContain('zhangmin88');
    expect(runtime.updateToolCall).toHaveBeenCalledWith(
      201,
      expect.objectContaining({
        resultJson: expect.objectContaining({
          summary: expect.stringContaining('138****5678'),
          data: expect.objectContaining({
            items: [expect.objectContaining({ phone: '138****5678', customerPhone: '139****4321' })],
          }),
        }),
      }),
    );
  });

  it('applies the full field scope matrix to financial remarks and commission fields', async () => {
    const plan = {
      intentType: 'analysis_and_recommendation',
      goal: '诊断财务和员工提成',
      toolPlan: [{ tool: 'finance.margin.diagnose', args: { question: '本月成本利润和提成', timeRange: 'this_month' } }],
      confidence: 0.86,
      clarificationNeeded: false,
    };
    planner.plan.mockResolvedValue(plan);
    toolRegistry.get.mockReturnValue({
      name: 'finance.margin.diagnose',
      riskLevel: 'low',
      allowedRoles: ['manager', 'reception'],
      requiredPermissions: ['core:order:view'],
      requiresApproval: false,
      consumedSlots: ['timeRange'],
    });
    policy.validateToolAccess.mockReturnValue({ allowed: true, requiresApproval: false, riskLevel: 'low' });
    toolRegistry.execute.mockResolvedValue({
      status: 'success',
      title: '财务毛利诊断',
      summary: '本月余额 ¥1,200，成本 ¥300，毛利 ¥900，提成 ¥120，备注 老客价格敏感。',
      data: {
        totalBalance: 1200,
        totalBalanceText: '¥1,200',
        materialCost: 300,
        materialCostText: '¥300',
        grossProfit: 900,
        grossProfitText: '¥900',
        marginRate: 0.3,
        commissionTotal: 120,
        commissionTotalText: '¥120',
        remark: '老客价格敏感',
        privateNote: '不要公开客户投诉',
        nested: {
          costPrice: 80,
          profitRate: 0.25,
          commissionAmount: 60,
          note: '内部复核',
        },
        consumedSlots: {
          timeRange: { preset: 'this_month', label: '本月', start: '2026-06-01', end: '2026-07-01' },
        },
      },
      evidence: {
        source: ['ProductOrder', 'CommissionRecord'],
        metricDefinition: '财务诊断。',
        filters: ['当前门店'],
        sampleSize: 2,
      },
      actions: [],
    });

    const result = await service.createRun({
      message: '本月成本利润和提成',
      actor: {
        ...actor,
        fieldScopes: {
          customerBalance: 'hidden',
          customerCost: 'hidden',
          customerProfit: 'masked',
          staffCommission: 'hidden',
          customerRemark: 'hidden',
          customerPrivateNote: 'hidden',
        },
      },
    });

    const data = result.toolResults[0].data as any;
    expect(result.status).toBe('completed');
    expect(result.answer).toContain('余额 已隐藏');
    expect(result.answer).toContain('成本 已隐藏');
    expect(result.answer).toContain('毛利 已脱敏');
    expect(result.answer).toContain('提成 已隐藏');
    expect(JSON.stringify(data)).not.toContain('1200');
    expect(JSON.stringify(data)).not.toContain('¥1,200');
    expect(JSON.stringify(data)).not.toContain('300');
    expect(JSON.stringify(data)).not.toContain('¥300');
    expect(data.grossProfit).toBe('已脱敏');
    expect(data.grossProfitText).toBe('已脱敏');
    expect(data.marginRate).toBe('已脱敏');
    expect(data.commissionTotal).toBeUndefined();
    expect(data.commissionTotalText).toBeUndefined();
    expect(data.remark).toBeUndefined();
    expect(data.privateNote).toBeUndefined();
    expect(data.nested).toMatchObject({ profitRate: '已脱敏' });
    expect(data.nested.costPrice).toBeUndefined();
    expect(data.nested.commissionAmount).toBeUndefined();
    expect(data.nested.note).toBeUndefined();
  });

  it('fails the run when a required tool slot is not consumed by the tool result', async () => {
    const plan = {
      intentType: 'analysis_and_recommendation',
      goal: '推荐优先跟进客户',
      toolPlan: [{ tool: 'customer.priority.rank', args: { question: '下周重点关注哪些客户', timeRange: 'next_week', limit: 10 } }],
      confidence: 0.86,
      clarificationNeeded: false,
    };
    planner.plan.mockResolvedValue(plan);
    toolRegistry.get.mockReturnValue({
      name: 'customer.priority.rank',
      riskLevel: 'low',
      allowedRoles: ['manager'],
      requiresApproval: false,
      consumedSlots: ['timeRange', 'limit'],
    });
    policy.validateToolAccess.mockReturnValue({ allowed: true, requiresApproval: false, riskLevel: 'low' });
    toolRegistry.execute.mockResolvedValue({
      status: 'success',
      title: '下周优先跟进客户',
      summary: '已返回客户。',
      data: { items: [] },
      evidence: {
        source: ['Customer'],
        metricDefinition: '客户优先级。',
        filters: ['storeId=当前门店'],
      },
      actions: [],
    });

    const result = await service.createRun({ message: '下周重点关注哪些客户', actor });

    expect(result.status).toBe('failed');
    expect(result.answer).toContain('未回写关键槽位');
    expect(runtime.addMessage).toHaveBeenLastCalledWith(
      101,
      'assistant',
      expect.stringContaining('Agent 执行失败：工具「customer.priority.rank」未回写关键槽位'),
      { status: 'failed' },
    );
  });

  it('uses the tool default time range when validating consumed slots', async () => {
    const plan = {
      intentType: 'diagnosis',
      goal: '诊断今日收入',
      toolPlan: [{ tool: 'revenue.diagnose', args: { question: '今天收入怎么样' } }],
      confidence: 0.86,
      clarificationNeeded: false,
    };
    planner.plan.mockResolvedValue(plan);
    toolRegistry.get.mockReturnValue({
      name: 'revenue.diagnose',
      riskLevel: 'low',
      allowedRoles: ['manager'],
      requiresApproval: false,
      consumedSlots: ['timeRange'],
    });
    policy.validateToolAccess.mockReturnValue({ allowed: true, requiresApproval: false, riskLevel: 'low' });
    toolRegistry.execute.mockResolvedValue({
      status: 'success',
      title: '收入诊断',
      summary: '今天收入 ¥8,000。',
      data: {
        consumedSlots: {
          timeRange: { preset: 'today', label: '今天', start: '2026-06-17', end: '2026-06-18' },
        },
      },
      evidence: {
        source: ['ProductOrder'],
        metricDefinition: '收入诊断。',
        filters: ['storeId=当前门店'],
      },
      actions: [],
    });

    const result = await service.createRun({ message: '今天收入怎么样', actor });

    expect(result.status).toBe('completed');
    expect(result.answer).toBe('今天收入 ¥8,000。');
    expect(runtime.addMessage).toHaveBeenLastCalledWith(101, 'assistant', '今天收入 ¥8,000。', { status: 'completed' });
  });

  it('fails the run when a declared filter slot is not consumed', async () => {
    const plan = {
      intentType: 'analysis_and_recommendation',
      goal: '推荐流失风险客户',
      toolPlan: [
        {
          tool: 'customer.priority.rank',
          args: {
            question: '优先跟进流失风险客户',
            timeRange: 'today',
            limit: 10,
            filters: { customerSegment: 'churn_risk' },
          },
        },
      ],
      confidence: 0.86,
      clarificationNeeded: false,
    };
    planner.plan.mockResolvedValue(plan);
    toolRegistry.get.mockReturnValue({
      name: 'customer.priority.rank',
      riskLevel: 'low',
      allowedRoles: ['manager'],
      requiresApproval: false,
      consumedSlots: ['timeRange', 'limit', 'filters.customerSegment'],
    });
    policy.validateToolAccess.mockReturnValue({ allowed: true, requiresApproval: false, riskLevel: 'low' });
    toolRegistry.execute.mockResolvedValue({
      status: 'success',
      title: '优先跟进客户',
      summary: '已返回客户。',
      data: {
        items: [],
        consumedSlots: {
          timeRange: { preset: 'today', label: '今天', start: '2026-06-17', end: '2026-06-18' },
          limit: 10,
          filters: {},
        },
      },
      evidence: {
        source: ['Customer'],
        metricDefinition: '客户优先级。',
        filters: ['storeId=当前门店'],
      },
      actions: [],
    });

    const result = await service.createRun({ message: '优先跟进流失风险客户', actor });

    expect(result.status).toBe('failed');
    expect(result.answer).toContain('未消费请求过滤条件');
    expect(runtime.addMessage).toHaveBeenLastCalledWith(
      101,
      'assistant',
      expect.stringContaining('customerSegment 请求 churn_risk'),
      { status: 'failed' },
    );
  });

  it('creates pending approval for medium-risk draft tools instead of executing them', async () => {
    const plan = {
      intentType: 'draft',
      goal: '生成活动草稿',
      toolPlan: [{ tool: 'marketing.activity.draft', args: { productIds: [301] } }],
      confidence: 0.82,
      clarificationNeeded: false,
    };
    planner.plan.mockResolvedValue(plan);
    toolRegistry.get.mockReturnValue({
      name: 'marketing.activity.draft',
      riskLevel: 'medium',
      allowedRoles: ['manager'],
      requiresApproval: true,
    });
    policy.validateToolAccess.mockReturnValue({ allowed: true, requiresApproval: true, riskLevel: 'medium' });

    const result = await service.createRun({ message: '帮我生成活动草稿', actor, context: { productId: 301 } });

    expect(result.status).toBe('waiting_approval');
    expect(result.approval).toMatchObject({
      id: 301,
      toolName: 'marketing.activity.draft',
      riskLevel: 'medium',
      status: 'pending',
    });
    expect(toolRegistry.execute).not.toHaveBeenCalled();
    expect(runtime.createApproval).toHaveBeenCalledWith(expect.objectContaining({ toolCallId: 201 }));
  });

  it('executes the pending tool after approval and completes the run', async () => {
    runtime.getApproval.mockResolvedValue({
      id: 301,
      runId: 101,
      toolCallId: 201,
      status: 'pending',
      beforeJson: { tool: 'marketing.activity.draft' },
    });
    runtime.getRun.mockResolvedValue({
      id: 101,
      runNo: 'ar_test',
      storeId: 1,
      planJson: {
        intentType: 'draft',
        goal: '生成活动草稿',
        toolPlan: [{ tool: 'marketing.activity.draft', args: { context: { previousRun: {} } } }],
        confidence: 0.82,
        clarificationNeeded: false,
      },
    });
    runtime.getToolCall.mockResolvedValue({
      id: 201,
      runId: 101,
      toolName: 'marketing.activity.draft',
      argsJson: { context: { previousRun: { toolResults: [] } } },
    });
    toolRegistry.get.mockReturnValue({
      name: 'marketing.activity.draft',
      riskLevel: 'medium',
      allowedRoles: ['manager'],
      requiresApproval: true,
    });
    policy.validateToolAccess.mockReturnValue({ allowed: true, requiresApproval: true, riskLevel: 'medium' });
    toolRegistry.execute.mockResolvedValue({
      status: 'success',
      title: '营销活动草稿',
      summary: '已创建营销活动草稿「补水精华会员专属满赠」。',
      data: { activityId: 901, status: 'draft' },
      evidence: {
        source: ['AgentApproval', 'MarketingActivity'],
        metricDefinition: '审批后创建草稿。',
        filters: ['status=draft'],
      },
      actions: [{ label: '查看活动草稿', action: 'marketing:activity:901', riskLevel: 'low' }],
    });

    const result = await service.approve({ approvalId: 301, actor, comment: '确认生成草稿' });

    expect(result.status).toBe('completed');
    expect(result.answer).toContain('已创建营销活动草稿');
    expect(runtime.updateApproval).toHaveBeenCalledWith(301, expect.objectContaining({ status: 'approved', approvedBy: 7 }));
    expect(runtime.updateToolCall).toHaveBeenCalledWith(201, expect.objectContaining({ status: 'success' }));
    expect(toolRegistry.execute).toHaveBeenCalledWith(
      'marketing.activity.draft',
      expect.objectContaining({ context: { previousRun: { toolResults: [] } } }),
      expect.objectContaining({ runId: 101, storeId: 1, userId: 7 }),
    );
  });

  it('rejects the pending approval without executing the tool', async () => {
    runtime.getApproval.mockResolvedValue({
      id: 301,
      runId: 101,
      toolCallId: 201,
      status: 'pending',
      beforeJson: { tool: 'marketing.activity.draft' },
    });
    runtime.getRun.mockResolvedValue({ id: 101, runNo: 'ar_test', storeId: 1, planJson: undefined });
    runtime.getToolCall.mockResolvedValue({ id: 201, toolName: 'marketing.activity.draft' });

    const result = await service.reject({ approvalId: 301, actor, comment: '暂不生成' });

    expect(result.status).toBe('cancelled');
    expect(result.answer).toBe('已拒绝执行该 Agent 动作，未写入任何业务数据。');
    expect(runtime.updateApproval).toHaveBeenCalledWith(301, expect.objectContaining({ status: 'rejected', approvedBy: 7 }));
    expect(runtime.updateToolCall).toHaveBeenCalledWith(201, expect.objectContaining({ status: 'rejected' }));
    expect(toolRegistry.execute).not.toHaveBeenCalled();
  });
});
