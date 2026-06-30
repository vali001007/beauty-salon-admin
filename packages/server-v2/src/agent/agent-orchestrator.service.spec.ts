import { AgentEvidenceService } from './agent-evidence.service.js';
import { AnswerContractValidatorService } from './answer-contract/index.js';
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
  let router: jest.Mocked<any>;
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
      updateRun: jest.fn().mockResolvedValue({}),
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
      runP0Cases: jest.fn(),
      runSkillCases: jest.fn(),
    };
    router = {
      route: jest.fn().mockImplementation(async (input: any) => ({
        personaCode: input.previousPersonaCode ?? input.manualPersonaCode ?? 'manager',
        confidence: 0.88,
        reason: input.previousPersonaCode ? '测试继承分诊' : '测试默认分诊',
        candidates: [{ personaCode: input.previousPersonaCode ?? input.manualPersonaCode ?? 'manager', score: 0.88, matchedCapabilities: ['经营'] }],
        clarificationNeeded: false,
        clarificationQuestion: null,
        deniedReason: null,
        mode: input.previousPersonaCode ? 'context_inherit' : input.manualPersonaCode ? 'manual' : 'auto',
      })),
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
      router,
      new AnswerContractValidatorService(),
    );
  });

  it('exposes default eval results for Agent Studio governance', async () => {
    evalService.runDefaultCases.mockResolvedValue({ total: 1, passed: 1, failed: 0, results: [] });

    await expect(service.runDefaultEvals()).resolves.toEqual({ total: 1, passed: 1, failed: 0, results: [] });
    expect(evalService.runDefaultCases).toHaveBeenCalledTimes(1);
  });

  it('exposes P0 eval results for high-frequency business QA baseline', async () => {
    evalService.runP0Cases.mockResolvedValue({ total: 8, passed: 8, failed: 0, results: [] });

    await expect(service.runP0Evals()).resolves.toEqual({ total: 8, passed: 8, failed: 0, results: [] });
    expect(evalService.runP0Cases).toHaveBeenCalledTimes(1);
  });

  it('resolves persona before creating a run when personaCode is omitted', async () => {
    const plan = {
      intentType: 'clarify',
      goal: '澄清问题',
      toolPlan: [],
      confidence: 0.5,
      clarificationNeeded: true,
      clarificationQuestion: '要查看哪类风险？',
    };
    router.route.mockResolvedValue({
      personaCode: 'inventory',
      confidence: 0.86,
      reason: '命中库存风险',
      candidates: [{ personaCode: 'inventory', score: 0.86, matchedCapabilities: ['库存'] }],
      clarificationNeeded: false,
      clarificationQuestion: null,
      deniedReason: null,
      mode: 'auto',
    });
    planner.plan.mockResolvedValue(plan);

    const result = await service.createRun({ message: '哪些库存临期', actor });

    expect(runtime.createRun).toHaveBeenCalledWith(expect.objectContaining({
      actor: expect.objectContaining({ personaCode: 'inventory' }),
      context: expect.objectContaining({
        routeDecision: expect.objectContaining({ personaCode: 'inventory' }),
      }),
    }));
    expect(runtime.addMessage).toHaveBeenCalledWith(101, 'user', '哪些库存临期', expect.objectContaining({
      personaCode: 'inventory',
      routeDecision: expect.objectContaining({ personaCode: 'inventory' }),
    }));
    expect(result.routeDecision?.personaCode).toBe('inventory');
  });

  it('uses manual personaCode when explicitly provided', async () => {
    const manualActor = { ...actor, personaCode: 'finance' };
    const plan = {
      intentType: 'clarify',
      goal: '澄清问题',
      toolPlan: [],
      confidence: 0.5,
      clarificationNeeded: true,
      clarificationQuestion: '要查看哪个财务周期？',
    };
    router.route.mockResolvedValue({
      personaCode: 'finance',
      confidence: 1,
      reason: '手动指定',
      candidates: [{ personaCode: 'finance', score: 1, matchedCapabilities: ['财务'] }],
      clarificationNeeded: false,
      clarificationQuestion: null,
      deniedReason: null,
      mode: 'manual',
    });
    planner.plan.mockResolvedValue(plan);

    await service.createRun({ message: '本月利润为什么下降', actor: manualActor });

    expect(router.route).toHaveBeenCalledWith(expect.objectContaining({ manualPersonaCode: 'finance' }));
    expect(runtime.createRun).toHaveBeenCalledWith(expect.objectContaining({
      actor: expect.objectContaining({ personaCode: 'finance' }),
    }));
  });

  it('appendMessage routes without requiring actor.personaCode and updates the run when changed', async () => {
    runtime.getRun.mockResolvedValue({
      id: 101,
      runNo: 'ar_test',
      status: 'completed',
      personaCode: 'inventory',
      contextJson: { routeDecision: { personaCode: 'inventory' } },
      resultJson: { answer: '库存风险', conversationFocus: { topic: 'inventory' } },
    });
    runtime.updateRun.mockImplementation(async (_id: number, data: any) => ({
      id: 101,
      runNo: 'ar_test',
      status: 'completed',
      personaCode: data.personaCode ?? 'inventory',
      contextJson: data.contextJson,
      resultJson: { answer: '库存风险' },
    }));
    router.route.mockResolvedValue({
      personaCode: 'finance',
      confidence: 0.9,
      reason: '追问切换到财务域',
      candidates: [{ personaCode: 'finance', score: 0.9, matchedCapabilities: ['利润'] }],
      clarificationNeeded: false,
      clarificationQuestion: null,
      deniedReason: null,
      mode: 'auto',
      routeChanged: true,
    });
    const plan = {
      intentType: 'clarify',
      goal: '澄清财务问题',
      toolPlan: [],
      confidence: 0.5,
      clarificationNeeded: true,
      clarificationQuestion: '要查看哪个周期？',
    };
    planner.plan.mockResolvedValue(plan);

    const result = await service.appendMessage({ runId: 101, message: '本月利润为什么下降', actor });

    expect(router.route).toHaveBeenCalledWith(expect.objectContaining({
      previousPersonaCode: 'inventory',
      manualPersonaCode: undefined,
    }));
    expect(runtime.updateRun).toHaveBeenCalledWith(101, { personaCode: 'finance' });
    expect(runtime.addMessage).toHaveBeenCalledWith(101, 'user', '本月利润为什么下降', expect.objectContaining({
      personaCode: 'finance',
      routeDecision: expect.objectContaining({ routeChanged: true }),
    }));
    expect(result.routeDecision?.personaCode).toBe('finance');
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
    expect(runtime.recordStep).toHaveBeenCalledWith(
      expect.objectContaining({
        stepType: 'planner',
        name: 'agent.planner',
        startedAt: expect.any(Date),
        endedAt: expect.any(Date),
      }),
    );
    expect(runtime.recordStep).toHaveBeenCalledWith(
      expect.objectContaining({
        stepType: 'tool',
        name: 'business.query.ask',
        startedAt: expect.any(Date),
        endedAt: expect.any(Date),
      }),
    );
    expect(runtime.recordStep).toHaveBeenCalledWith(
      expect.objectContaining({
        stepType: 'rendering',
        name: 'agent.response.render',
        startedAt: expect.any(Date),
        endedAt: expect.any(Date),
      }),
    );
  });

  it('renders schedule diagnosis items as a table and passes the answer contract', async () => {
    const plan = {
      intentType: 'analysis_and_recommendation',
      goal: '诊断预约排班',
      toolPlan: [{ tool: 'schedule.diagnose', args: { question: '今天预约排班情况', timeRange: 'today', limit: 10 } }],
      confidence: 0.86,
      clarificationNeeded: false,
      businessTask: {
        domain: 'reservation',
        taskType: 'query',
        outputIntent: 'show_table',
        metrics: ['schedule_utilization_rate'],
        timeRange: { preset: 'today', label: '今天' },
        confidence: 0.86,
      },
      skillPlan: {
        skillId: 'reservation.schedule.capacity',
        capabilityId: 'reservation_schedule_diagnosis',
        confidence: 0.86,
        reason: '命中预约排班容量诊断。',
        outputContract: {
          requiredKinds: ['table', 'evidence'],
          evidenceRequired: true,
        },
      },
    };
    planner.plan.mockResolvedValue(plan);
    toolRegistry.get.mockReturnValue({
      name: 'schedule.diagnose',
      riskLevel: 'low',
      allowedRoles: ['manager'],
      requiresApproval: false,
    });
    policy.validateToolAccess.mockReturnValue({ allowed: true, requiresApproval: false, riskLevel: 'low' });
    toolRegistry.execute.mockResolvedValue({
      status: 'success',
      title: '预约排班诊断',
      summary: '今日有效预约 4 条，已到店/完成 2 条；王璐 占用率最高，为 0%。',
      data: {
        columns: ['beauticianName', 'utilizationRateText', 'reservationCount', 'availableCount', 'busyCount', 'leaveCount'],
        items: [
          {
            beauticianName: '王璐',
            utilizationRateText: '0%',
            reservationCount: 4,
            availableCount: 0,
            busyCount: 0,
            leaveCount: 0,
          },
        ],
        staffItems: [
          {
            beauticianName: '王璐',
            utilizationRateText: '0%',
            reservationCount: 4,
            availableCount: 0,
            busyCount: 0,
            leaveCount: 0,
          },
        ],
      },
      evidence: {
        source: ['Schedule', 'Reservation', 'Beautician'],
        metricDefinition: '预约排班诊断统计预约数、排班占用率和未覆盖预约。',
        filters: ['storeId=当前门店'],
        sampleSize: 4,
      },
      actions: [{ label: '查看排班表', action: 'scheduling:open', riskLevel: 'low' }],
    });

    const result = await service.createRun({ message: '今天预约排班情况', actor });

    expect(result.status).toBe('completed');
    expect(result.answerContract).toMatchObject({ valid: true, missingKinds: [] });
    expect(result.renderedBlocks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'table',
          columns: ['员工姓名', '占用率', '预约数', '空闲时段', '忙碌时段', '请假时段'],
          rows: [['王璐', '0%', '4', '0', '0', '0']],
        }),
        expect.objectContaining({ kind: 'evidence_panel' }),
      ]),
    );
  });

  it('executes deep-path multi-tool plans and composes numbered summaries', async () => {
    const plan = {
      intentType: 'analysis_and_recommendation',
      goal: '诊断利润下降',
      executionPath: 'deep',
      toolPlan: [
        { tool: 'finance.revenue.summary', args: { question: '本月利润为什么下降', timeRange: 'this_month' } },
        { tool: 'finance.profit.diagnose', args: { question: '本月利润为什么下降', timeRange: 'this_month', limit: 10 } },
        { tool: 'finance.refund.discount.audit', args: { question: '本月利润为什么下降', timeRange: 'this_month', limit: 10 } },
        { tool: 'finance.beautician.performance.audit', args: { question: '本月利润为什么下降', timeRange: 'this_month', limit: 10 } },
      ],
      confidence: 0.87,
      clarificationNeeded: false,
      capabilityPlan: { capabilityId: 'finance_profit_diagnosis', reason: '多维利润诊断。' },
      progressNotice: '正在分析本月的收入、利润成本、退款折扣和员工绩效风险。',
    };
    planner.plan.mockResolvedValue(plan);
    toolRegistry.get.mockImplementation((name: string) => ({
      name,
      riskLevel: 'low',
      allowedRoles: ['manager'],
      requiresApproval: false,
    }));
    policy.validateToolAccess.mockReturnValue({ allowed: true, requiresApproval: false, riskLevel: 'low', reason: '低风险只读工具可直接执行。' });
    toolRegistry.execute.mockImplementation(async (name: string) => ({
      status: 'success',
      title: name,
      summary: `${name} 已完成`,
      evidence: {
        source: [name],
        metricDefinition: `${name} 口径`,
        filters: ['storeId=当前门店'],
        sampleSize: 1,
      },
      actions: [],
    }));

    const result = await service.createRun({ message: '本月利润为什么下降', actor });

    expect(result.status).toBe('completed');
    expect(runtime.addMessage).toHaveBeenCalledWith(
      101,
      'assistant',
      '正在分析本月的收入、利润成本、退款折扣和员工绩效风险。',
      { status: 'analyzing', executionPath: 'deep' },
    );
    expect(toolRegistry.execute).toHaveBeenCalledTimes(4);
    expect(toolRegistry.execute.mock.calls.map((call: unknown[]) => call[0])).toEqual([
      'finance.revenue.summary',
      'finance.profit.diagnose',
      'finance.refund.discount.audit',
      'finance.beautician.performance.audit',
    ]);
    expect(result.answer).toContain('1. finance.revenue.summary 已完成');
    expect(result.answer).toContain('4. finance.beautician.performance.audit 已完成');
    expect(result.phaseOutputs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ phase: 'core_conclusion', title: '核心结论' }),
        expect.objectContaining({ phase: 'details', title: '数据明细' }),
        expect.objectContaining({ phase: 'recommendations', title: '建议动作' }),
      ]),
    );
    expect(result.evidence?.source).toEqual([
      'finance.revenue.summary',
      'finance.profit.diagnose',
      'finance.refund.discount.audit',
      'finance.beautician.performance.audit',
    ]);
    const toolSteps = runtime.recordStep.mock.calls
      .map((call: unknown[]) => call[0] as { stepType?: string })
      .filter((step: { stepType?: string }) => step.stepType === 'tool');
    expect(toolSteps).toHaveLength(4);
    expect(runtime.recordStep).toHaveBeenCalledWith(
      expect.objectContaining({
        stepType: 'rendering',
        outputJson: expect.objectContaining({
          phaseOutputs: expect.arrayContaining([
            expect.objectContaining({ phase: 'core_conclusion' }),
            expect.objectContaining({ phase: 'details' }),
          ]),
        }),
      }),
    );
  });

  it('renders BusinessQuery card kpis and items as KPI cards and a table', async () => {
    const plan = {
      intentType: 'query',
      goal: '查询消费客户清单',
      toolPlan: [{ tool: 'business.query.ask', args: { question: '昨天有哪些消费的客户，列出清单' } }],
      confidence: 0.86,
      clarificationNeeded: false,
      executionPath: 'fast',
      businessTask: {
        domain: 'order',
        taskType: 'list',
        outputIntent: 'show_table',
        metrics: ['paid_amount', 'order_count'],
        timeRange: { preset: 'yesterday', label: '昨天' },
        confidence: 0.9,
      },
      capabilityPlan: { capabilityId: 'order_customer_consumption_list', reason: '命中消费客户清单能力。' },
      skillPlan: {
        skillId: 'order.customer.consumption.list',
        capabilityId: 'order_customer_consumption_list',
        confidence: 0.9,
        reason: '命中消费客户清单 Skill。',
        outputContract: {
          requiredKinds: ['table', 'evidence'],
          evidenceRequired: true,
        },
      },
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
      title: '消费客户清单',
      summary: '昨天共有 2 位消费客户，3 笔有效订单，消费合计 ¥1,980。',
      data: {
        card: {
          type: 'orderCustomerConsumptionList',
          title: '消费客户清单',
          summary: '昨天共有 2 位消费客户，3 笔有效订单，消费合计 ¥1,980。',
          kpis: [
            { label: '消费客户', value: '2' },
            { label: '有效订单', value: '3' },
          ],
          items: [
            {
              customerName: '马美琳',
              phoneMasked: '138****1234',
              memberLevel: 'VIP2',
              paidAmountText: '¥1,500',
              orderCount: 2,
              lastOrderTimeText: '2026-06-26 15:20',
            },
          ],
        },
        queryPlan: {
          requestId: 'bq_test',
          domain: 'order',
          capability: 'order_customer_consumption_list',
          filters: { storeId: 1, dateRange: { type: 'yesterday' } },
          limit: 20,
        },
      },
      evidence: {
        source: ['ProductOrder', 'PaymentRecord', 'OrderItem', 'Customer'],
        metricDefinition: '消费客户清单按有效订单聚合。',
        filters: ['storeId=当前门店'],
        sampleSize: 3,
      },
      actions: [{ label: '查看订单明细', action: 'orders:open', riskLevel: 'low' }],
    });

    const result = await service.createRun({ message: '昨天有哪些消费的客户，列出清单', actor });

    expect(result.status).toBe('completed');
    expect(result.responseMode).toBe('structured_blocks');
    expect(result.renderedBlocks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: 'kpi_card', label: '消费客户', value: '2' }),
        expect.objectContaining({
          kind: 'table',
          columns: expect.arrayContaining(['客户', '消费金额', '订单数']),
          rows: [expect.arrayContaining(['马美琳', '¥1,500', '2'])],
        }),
        expect.objectContaining({ kind: 'evidence_panel' }),
      ]),
    );
    expect(result.answerContract).toMatchObject({
      valid: true,
      contract: expect.objectContaining({ source: 'skill', requiredKinds: ['table', 'evidence_panel'] }),
      missingKinds: [],
    });
    expect(runtime.setRunStatus).toHaveBeenCalledWith(
      101,
      'completed',
      expect.objectContaining({
        resultJson: expect.objectContaining({
          answerContract: expect.objectContaining({ valid: true }),
          responseMode: 'structured_blocks',
          conversationFocus: expect.objectContaining({
            sourceRunId: 101,
            timeRange: expect.objectContaining({ preset: 'yesterday', label: '昨天' }),
            currentCustomer: expect.objectContaining({
              customerName: '马美琳',
              phoneMasked: '138****1234',
              paidAmountText: '¥1,500',
            }),
            currentItems: expect.arrayContaining([
              expect.objectContaining({ customerName: '马美琳' }),
            ]),
          }),
          traceSummary: expect.objectContaining({
            skillId: 'order.customer.consumption.list',
            capabilityId: 'order_customer_consumption_list',
            executionPath: 'fast',
            responseMode: 'structured_blocks',
            businessTask: expect.objectContaining({
              domain: 'order',
              taskType: 'list',
              outputIntent: 'show_table',
            }),
            answerContract: expect.objectContaining({
              valid: true,
              source: 'skill',
            }),
          }),
        }),
      }),
    );
    expect(runtime.recordStep).toHaveBeenCalledWith(
      expect.objectContaining({
        stepType: 'planner',
        outputJson: expect.objectContaining({
          traceSummary: expect.objectContaining({
            skillId: 'order.customer.consumption.list',
            businessTask: expect.objectContaining({ domain: 'order', taskType: 'list' }),
          }),
        }),
      }),
    );
    expect(runtime.recordStep).toHaveBeenCalledWith(
      expect.objectContaining({
        stepType: 'rendering',
        outputJson: expect.objectContaining({
          traceSummary: expect.objectContaining({
            skillId: 'order.customer.consumption.list',
            answerContract: expect.objectContaining({ valid: true, source: 'skill' }),
          }),
        }),
      }),
    );
    expect(runtime.recordStep).toHaveBeenCalledWith(
      expect.objectContaining({
        stepType: 'tool',
        name: 'business.query.ask',
        outputJson: expect.objectContaining({
          observability: expect.objectContaining({
            queryPlan: expect.objectContaining({
              capability: 'order_customer_consumption_list',
              limit: 20,
            }),
            dataVolume: expect.objectContaining({
              itemCount: 1,
              sampleSize: 3,
            }),
            slowQuery: false,
            performanceHints: expect.objectContaining({
              cacheCandidate: true,
              preaggregationCandidate: false,
            }),
          }),
        }),
      }),
    );
    expect(runtime.addMessage).toHaveBeenCalledWith(
      101,
      'assistant',
      '昨天共有 2 位消费客户，3 笔有效订单，消费合计 ¥1,980。',
      { status: 'completed', executionPath: 'fast', responseMode: 'structured_blocks' },
    );
  });

  it('renders marketing activity link query as entity badge and link card', async () => {
    const plan = {
      intentType: 'answer',
      goal: '查询营销活动链接',
      toolPlan: [{ tool: 'business.query.ask', args: { question: '老朋友回店护理礼活动链接发我' } }],
      confidence: 0.9,
      clarificationNeeded: false,
      executionPath: 'fast',
      outputContract: {
        requiredKinds: ['link_card', 'evidence_panel'],
        evidenceRequired: true,
      },
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
      title: '营销活动链接',
      summary: '已找到「老朋友回店礼」的活动链接：https://example.com/old-friend',
      data: {
        card: {
          type: 'marketingActivityLink',
          title: '营销活动链接',
          summary: '已找到「老朋友回店礼」的活动链接：https://example.com/old-friend',
          columns: ['活动名称', '活动状态', '发布状态', '页面标题', '活动链接', '小程序路径', '二维码'],
          items: [
            {
              活动名称: '老朋友回店礼',
              活动状态: 'active',
              发布状态: 'published',
              页面标题: '老朋友回店礼 H5',
              活动链接: 'https://example.com/old-friend',
              小程序路径: '/pages/marketing/old-friend',
              二维码: 'https://example.com/old-friend.png',
            },
          ],
        },
        queryPlan: {
          requestId: 'bq_link',
          domain: 'marketing',
          capability: 'marketing_activity_link_lookup',
          filters: {
            storeId: 1,
            selectedEntity: {
              objectType: 'MarketingActivity',
              entityId: '7',
              displayName: '老朋友回店礼',
              sourceModel: 'MarketingActivity',
            },
            entityResolution: {
              status: 'resolved',
              action: 'get_link',
              capabilityId: 'marketing.activity.link.lookup',
              candidates: [
                {
                  objectType: 'MarketingActivity',
                  entityId: '7',
                  displayName: '老朋友回店礼',
                  confidence: 0.92,
                  matchStrategy: 'fuzzy',
                  sourceModel: 'MarketingActivity',
                },
              ],
            },
          },
          plannerTrace: {
            capabilityId: 'marketing.activity.link.lookup',
            queryTemplateId: 'marketing_activity_link_lookup',
            actionIntent: 'get_link',
            executionPath: 'business_query',
            schemaPath: ['MarketingActivity', 'MarketingPage'],
            confidence: 0.92,
          },
        },
      },
      evidence: {
        source: ['MarketingActivity', 'MarketingPage'],
        sourceTables: ['MarketingActivity', 'MarketingPage'],
        metricDefinition: '营销活动链接 = 查询关联推广页链接。',
        filters: ['storeId=1'],
        sampleSize: 2,
      },
      actions: [{ label: '打开活动链接', action: 'https://example.com/old-friend', riskLevel: 'low' }],
    });

    const result = await service.createRun({
      message: '老朋友回店护理礼活动链接发我',
      actor,
      context: { debugTrace: true },
    });

    expect(result.status).toBe('completed');
    expect(result.responseMode).toBe('structured_blocks');
    expect(result.renderedBlocks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'entity_resolution_badge',
          objectType: '营销活动',
          entityName: '老朋友回店礼',
          confidence: 0.92,
        }),
        expect.objectContaining({
          kind: 'link_card',
          title: '老朋友回店礼',
          primaryUrl: 'https://example.com/old-friend',
          miniappPath: '/pages/marketing/old-friend',
          qrCodeUrl: 'https://example.com/old-friend.png',
        }),
        expect.objectContaining({
          kind: 'capability_trace',
          capabilityId: 'marketing.activity.link.lookup',
          queryTemplateId: 'marketing_activity_link_lookup',
          schemaPath: ['营销活动', '推广页'],
        }),
        expect.objectContaining({ kind: 'evidence_panel', sources: ['MarketingActivity', 'MarketingPage'] }),
      ]),
    );
    expect(result.renderedBlocks?.some((block) => block.kind === 'table')).toBe(false);
    expect(result.answerContract).toMatchObject({
      valid: true,
      missingKinds: [],
    });
  });

  it('uses tool-provided table columns when items are array rows', async () => {
    const plan = {
      intentType: 'analysis_and_recommendation',
      goal: '发现营销客群',
      toolPlan: [{ tool: 'marketing.customer.segment.discover', args: { question: '有哪些待召回客户' } }],
      confidence: 0.86,
      clarificationNeeded: false,
    };
    planner.plan.mockResolvedValue(plan);
    toolRegistry.get.mockReturnValue({
      name: 'marketing.customer.segment.discover',
      riskLevel: 'low',
      allowedRoles: ['manager'],
      requiresApproval: false,
    });
    policy.validateToolAccess.mockReturnValue({ allowed: true, requiresApproval: false, riskLevel: 'low' });
    toolRegistry.execute.mockResolvedValue({
      status: 'success',
      title: '可运营客群发现',
      summary: '共发现939位可运营客户，分4个客群',
      data: {
        items: [
          ['沉睡客户（45-90天未到店）', '585人', '高', '发召回优惠券'],
          ['深度沉睡（90天以上）', '25人', '中', '发专属回访话术'],
        ],
        columns: ['客群', '人数', '优先级', '建议动作'],
      },
      evidence: {
        source: ['Customer'],
        metricDefinition: '按到店间隔和消费金额分群',
      },
    });

    const result = await service.createRun({ message: '有哪些待召回客户', actor });

    expect(result.renderedBlocks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'table',
          columns: ['客群', '人数', '优先级', '建议动作'],
          rows: [
            ['沉睡客户（45-90天未到店）', '585人', '高', '发召回优惠券'],
            ['深度沉睡（90天以上）', '25人', '中', '发专属回访话术'],
          ],
        }),
      ]),
    );
  });

  it('injects the previous conversation focus when appending a follow-up message', async () => {
    runtime.getRun.mockResolvedValue({
      id: 101,
      runNo: 'ar_test',
      status: 'completed',
      contextJson: { locale: 'zh-CN' },
      resultJson: {
        conversationFocus: {
          sourceRunId: 101,
          timeRange: { preset: 'yesterday', label: '昨天' },
          currentCustomer: {
            customerId: 501,
            customerName: '马美琳',
            phoneMasked: '138****1234',
          },
        },
      },
    });
    const plan = {
      intentType: 'query',
      goal: '查询当前客户权益',
      toolPlan: [],
      confidence: 0.72,
      clarificationNeeded: true,
      clarificationQuestion: '请确认要查看该客户的卡项还是优惠券权益？',
    };
    planner.plan.mockResolvedValue(plan);

    const result = await service.appendMessage({
      runId: 101,
      message: '这个客户还有什么卡和权益？',
      actor,
      context: {
        terminal: {
          entrypoint: 'terminal:kiosk',
          personaCode: 'reception',
        },
        terminalFacts: {
          customers: { items: [{ customerId: 501, customerName: '马美琳' }] },
        },
      },
    });

    expect(result.status).toBe('completed');
    expect(planner.plan).toHaveBeenCalledWith(
      expect.objectContaining({
        message: '这个客户还有什么卡和权益？',
        context: expect.objectContaining({
          locale: 'zh-CN',
          conversationFocus: expect.objectContaining({
            currentCustomer: expect.objectContaining({ customerName: '马美琳' }),
            timeRange: expect.objectContaining({ preset: 'yesterday' }),
          }),
          previousResult: expect.objectContaining({
            conversationFocus: expect.objectContaining({
              currentCustomer: expect.objectContaining({ customerId: 501 }),
            }),
          }),
          terminal: expect.objectContaining({
            entrypoint: 'terminal:kiosk',
            personaCode: 'reception',
          }),
          terminalFacts: expect.objectContaining({
            customers: expect.objectContaining({
              items: [expect.objectContaining({ customerName: '马美琳' })],
            }),
          }),
        }),
      }),
    );
    expect(runtime.updateRun).toHaveBeenCalledWith(
      101,
      expect.objectContaining({
        contextJson: expect.objectContaining({
          locale: 'zh-CN',
          conversationFocus: expect.objectContaining({
            currentCustomer: expect.objectContaining({ customerName: '马美琳' }),
          }),
          previousResult: expect.objectContaining({
            conversationFocus: expect.objectContaining({
              currentCustomer: expect.objectContaining({ customerId: 501 }),
            }),
          }),
          terminalFacts: expect.objectContaining({
            customers: expect.objectContaining({
              items: [expect.objectContaining({ customerName: '马美琳' })],
            }),
          }),
        }),
      }),
    );
  });

  it('renders marketing opportunity results as opportunity cards', async () => {
    const plan = {
      intentType: 'analysis_and_recommendation',
      goal: '发现适合做营销活动的商品、项目或客户机会',
      toolPlan: [{ tool: 'marketing.opportunity.discover', args: { question: '有哪些商品适合做活动', targetType: 'product', dateRange: 'last_30_days', limit: 10 } }],
      confidence: 0.86,
      clarificationNeeded: false,
    };
    planner.plan.mockResolvedValue(plan);
    toolRegistry.get.mockReturnValue({
      name: 'marketing.opportunity.discover',
      riskLevel: 'low',
      allowedRoles: ['manager'],
      requiredPermissions: ['core:product:view'],
      requiresApproval: false,
    });
    policy.validateToolAccess.mockReturnValue({ allowed: true, requiresApproval: false, riskLevel: 'low' });
    toolRegistry.execute.mockResolvedValue({
      status: 'success',
      title: '商品活动机会',
      summary: '优先推荐 玻尿酸修护套装 做会员权益，匹配分 82。',
      data: {
        items: [
          {
            productId: 301,
            productName: '玻尿酸修护套装',
            sku: 'SKU-301',
            opportunityType: '会员权益',
            fitScore: 82,
            currentStock: 120,
            safetyStock: 40,
            salesQuantity: 36,
            salesAmount: 12800,
            customerCount: 21,
            expiringStock: 18,
            daysToExpiry: 23,
            marginRateText: '38%',
            reason: '库存高于安全库存 80；近 30 天销售 36；90 天内临期库存 18；毛利率约 38%',
            suggestedCampaign: '会员专属活动',
            suggestedChannels: ['miniapp', 'wechat', 'store'],
            riskWarnings: ['毛利空间偏低，优惠力度需严格控制。'],
          },
        ],
      },
      evidence: {
        source: ['Product', 'StockBatch', 'ProductOrder', 'OrderItem'],
        sourceTables: ['Product', 'StockBatch', 'ProductOrder', 'OrderItem'],
        metricDefinition: '商品活动机会评分。',
        filters: ['storeId=当前门店'],
        sampleSize: 3,
      },
      actions: [
        { label: '生成活动草稿', action: 'agent:tool:marketing.activity.draft', riskLevel: 'medium' },
        { label: '查看商品详情', action: 'product:301', riskLevel: 'low' },
      ],
    });

    const result = await service.createRun({ message: '有哪些商品适合做活动', actor });

    expect(result.status).toBe('completed');
    expect(result.renderedBlocks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'opportunity_card',
          productName: '玻尿酸修护套装',
          fitScore: 82,
          suggestedCampaign: '会员专属活动',
        }),
        expect.objectContaining({ kind: 'evidence_panel', sources: ['Product', 'StockBatch', 'ProductOrder', 'OrderItem'] }),
      ]),
    );
    expect(result.followUpSuggestions).toEqual(['生成活动草稿', '查看商品详情']);
  });

  it('renders marketing copy results as selectable copy variants', async () => {
    const plan = {
      intentType: 'analysis_and_recommendation',
      goal: '生成营销话术',
      toolPlan: [{ tool: 'marketing.copy.generate', args: { target: '沉睡客户', offer: '护理券' } }],
      confidence: 0.86,
      clarificationNeeded: false,
    };
    planner.plan.mockResolvedValue(plan);
    toolRegistry.get.mockReturnValue({
      name: 'marketing.copy.generate',
      riskLevel: 'low',
      allowedRoles: ['manager'],
      requiresApproval: false,
    });
    policy.validateToolAccess.mockReturnValue({ allowed: true, requiresApproval: false, riskLevel: 'low' });
    toolRegistry.execute.mockResolvedValue({
      status: 'success',
      title: '营销话术生成',
      summary: '已生成3条针对沉睡客户的触达话术',
      data: {
        target: '沉睡客户',
        offer: '护理券',
        copies: ['话术A', '话术B', '话术C'],
      },
      evidence: { source: [], metricDefinition: '基于目标客群和权益生成', filters: [] },
      actions: [{ label: '生成活动草稿', action: 'marketing.activity.draft', riskLevel: 'medium' }],
    });

    const result = await service.createRun({ message: '帮我写沉睡客户召回短信', actor });

    expect(result.status).toBe('completed');
    expect(result.renderedBlocks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'copy_variants',
          target: '沉睡客户',
          offer: '护理券',
          variants: expect.arrayContaining([
            expect.objectContaining({ label: '变体1', content: '话术A' }),
          ]),
        }),
      ]),
    );
  });

  it('renders marketing effect diagnosis as a funnel chart', async () => {
    const plan = {
      intentType: 'analysis_and_recommendation',
      goal: '复盘营销效果',
      toolPlan: [{ tool: 'marketing.effect.diagnose', args: { timeRange: 'last_30_days' } }],
      confidence: 0.86,
      clarificationNeeded: false,
    };
    planner.plan.mockResolvedValue(plan);
    toolRegistry.get.mockReturnValue({
      name: 'marketing.effect.diagnose',
      riskLevel: 'low',
      allowedRoles: ['manager'],
      requiresApproval: false,
    });
    policy.validateToolAccess.mockReturnValue({ allowed: true, requiresApproval: false, riskLevel: 'low' });
    toolRegistry.execute.mockResolvedValue({
      status: 'success',
      title: '活动效果复盘',
      summary: '近30天触达100人，转化12人。',
      data: {
        total: 100,
        converted: 12,
        revenue: 3600,
        funnel: [
          { name: '触达', value: 100, valueText: '100人', rateText: '100%' },
          { name: '核销/转化', value: 12, valueText: '12人', rateText: '12%' },
          { name: '收入贡献', value: 12, valueText: '¥3,600', rateText: '12%' },
        ],
      },
      evidence: { source: ['MarketingAutomationTouch'], metricDefinition: '触达→转化→收入漏斗', filters: [] },
      actions: [{ label: '生成话术优化', action: 'marketing.copy.generate', riskLevel: 'low' }],
    });

    const result = await service.createRun({ message: '复盘一下最近营销活动效果', actor });

    expect(result.status).toBe('completed');
    expect(result.renderedBlocks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'chart',
          chartType: 'funnel',
          title: '营销效果漏斗',
          data: expect.arrayContaining([
            expect.objectContaining({ name: '触达', value: 100 }),
            expect.objectContaining({ name: '收入贡献', valueText: '¥3,600' }),
          ]),
        }),
      ]),
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

  it('renders inventory consumption results as inventory item cards', async () => {
    const plan = {
      intentType: 'analysis_and_recommendation',
      goal: '分析库存消耗趋势',
      toolPlan: [{ tool: 'inventory.consumption.trend', args: { question: '近30天耗材消耗趋势', timeRange: 'last_30_days', limit: 10 } }],
      confidence: 0.86,
      clarificationNeeded: false,
    };
    planner.plan.mockResolvedValue(plan);
    toolRegistry.get.mockReturnValue({
      name: 'inventory.consumption.trend',
      riskLevel: 'low',
      allowedRoles: ['manager'],
      requiredPermissions: ['core:inventory:view'],
      requiresApproval: false,
      consumedSlots: ['timeRange', 'limit'],
    });
    policy.validateToolAccess.mockReturnValue({ allowed: true, requiresApproval: false, riskLevel: 'low' });
    toolRegistry.execute.mockResolvedValue({
      status: 'success',
      title: '库存消耗趋势',
      summary: '近30天消耗最高的是 修护面膜，累计消耗 30片，预计可用 6 天。',
      data: {
        items: [{
          productName: '修护面膜',
          sku: 'M601',
          unit: '片',
          currentStock: 6,
          safetyStock: 10,
          consumeQty: 30,
          suggestedQty: 12,
          projectedDaysLeft: 6,
          riskLevel: 'high',
          reason: '按近30天日均消耗 1片，当前库存预计可用 6 天。',
        }],
        consumedSlots: {
          timeRange: { preset: 'last_30_days', label: '近30天', start: '2026-05-27', end: '2026-06-26' },
          limit: 10,
        },
      },
      evidence: { source: ['StockMovement', 'Product'], metricDefinition: '库存消耗趋势。', filters: ['当前门店'] },
      actions: [{ label: '生成补货采购草稿', action: 'agent:tool:inventory.replenishment.draft', riskLevel: 'medium' }],
    });

    const result = await service.createRun({ message: '近30天耗材消耗趋势', actor });

    expect(result.status).toBe('completed');
    expect(result.renderedBlocks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'inventory_item_card',
          title: '库存消耗趋势',
          itemName: '修护面膜',
          riskLevel: 'high',
          statusLabel: '预计可用 6 天',
        }),
      ]),
    );
  });

  it('renders supplier purchase links as supplier cards and validates the limit slot', async () => {
    const plan = {
      intentType: 'analysis_and_recommendation',
      goal: '查询供应商采购链接',
      toolPlan: [{ tool: 'supplier.purchase.link', args: { question: '补水面膜供应商采购链接', limit: 10 } }],
      confidence: 0.86,
      clarificationNeeded: false,
    };
    planner.plan.mockResolvedValue(plan);
    toolRegistry.get.mockReturnValue({
      name: 'supplier.purchase.link',
      riskLevel: 'low',
      allowedRoles: ['manager'],
      requiredPermissions: ['core:inventory:purchase'],
      requiresApproval: false,
      consumedSlots: ['limit'],
    });
    policy.validateToolAccess.mockReturnValue({ allowed: true, requiresApproval: false, riskLevel: 'low' });
    toolRegistry.execute.mockResolvedValue({
      status: 'success',
      title: '供应商采购链接',
      summary: '已整理 1 个采购建议，优先处理 补水面膜：已绑定 1 个供应商，优先 华东耗材。',
      data: {
        items: [{
          productName: '补水面膜',
          supplierName: '华东耗材',
          currentStock: 2,
          safetyStock: 10,
          suggestedQty: 8,
          unit: '片',
          supplyPriceText: '¥12',
          leadDays: 3,
          status: 'linked',
          reason: '已绑定 1 个供应商，优先 华东耗材。',
        }],
        consumedSlots: { limit: 10 },
      },
      evidence: { source: ['Product', 'ProductSupplier', 'Supplier'], metricDefinition: '供应商采购链接。', filters: ['当前门店'] },
      actions: [{ label: '生成补货采购草稿', action: 'agent:tool:inventory.replenishment.draft', riskLevel: 'medium' }],
    });

    const result = await service.createRun({ message: '补水面膜供应商采购链接', actor });

    expect(result.status).toBe('completed');
    expect(result.renderedBlocks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'supplier_purchase_card',
          productName: '补水面膜',
          supplierName: '华东耗材',
          statusLabel: '已绑定供应商',
        }),
      ]),
    );
  });

  it('renders finance report drafts as document preview blocks', async () => {
    const plan = {
      intentType: 'analysis_and_recommendation',
      goal: '生成财务报告草稿',
      toolPlan: [{ tool: 'finance.report.draft', args: { question: '生成本月财务报告草稿', timeRange: 'this_month' } }],
      confidence: 0.88,
      clarificationNeeded: false,
    };
    planner.plan.mockResolvedValue(plan);
    toolRegistry.get.mockReturnValue({
      name: 'finance.report.draft',
      riskLevel: 'low',
      allowedRoles: ['manager'],
      requiredPermissions: ['core:order:view'],
      requiresApproval: false,
      consumedSlots: ['timeRange'],
    });
    policy.validateToolAccess.mockReturnValue({ allowed: true, requiresApproval: false, riskLevel: 'low' });
    toolRegistry.execute.mockResolvedValue({
      status: 'success',
      title: '财务报告草稿',
      summary: '本月财务经营报告草稿已生成。',
      data: {
        document: {
          title: '本月财务经营报告草稿',
          content: '# 本月财务经营报告草稿\n\n## 收入概览\n收入稳定。',
          downloadable: true,
        },
        consumedSlots: {
          timeRange: { preset: 'this_month', label: '本月', start: '2026-06-01', end: '2026-07-01' },
        },
      },
      evidence: { source: ['ProductOrder'], metricDefinition: '财务报告草稿。', filters: ['当前门店'] },
      actions: [{ label: '查看收银对账', action: 'finance:reconciliation:open', riskLevel: 'low' }],
    });

    const result = await service.createRun({ message: '生成本月财务报告草稿', actor });

    expect(result.status).toBe('completed');
    expect(result.renderedBlocks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'document_preview',
          title: '本月财务经营报告草稿',
          content: expect.stringContaining('## 收入概览'),
          downloadable: true,
        }),
      ]),
    );
  });

  it('masks sensitive finance text inside report document previews', async () => {
    const plan = {
      intentType: 'analysis_and_recommendation',
      goal: '生成财务报告草稿',
      toolPlan: [{ tool: 'finance.report.draft', args: { question: '生成本月财务报告草稿', timeRange: 'this_month' } }],
      confidence: 0.88,
      clarificationNeeded: false,
    };
    planner.plan.mockResolvedValue(plan);
    toolRegistry.get.mockReturnValue({
      name: 'finance.report.draft',
      riskLevel: 'low',
      allowedRoles: ['manager'],
      requiredPermissions: ['core:order:view'],
      requiresApproval: false,
      consumedSlots: ['timeRange'],
    });
    policy.validateToolAccess.mockReturnValue({ allowed: true, requiresApproval: false, riskLevel: 'low' });
    toolRegistry.execute.mockResolvedValue({
      status: 'success',
      title: '财务报告草稿',
      summary: '本月毛利 ¥900，提成 ¥120。',
      data: {
        document: {
          title: '本月财务经营报告草稿',
          content: '# 本月财务经营报告草稿\n\n毛利 ¥900，提成 ¥120，净收入 ¥1,200。',
          downloadable: true,
        },
        consumedSlots: {
          timeRange: { preset: 'this_month', label: '本月', start: '2026-06-01', end: '2026-07-01' },
        },
      },
      evidence: { source: ['ProductOrder'], metricDefinition: '财务报告草稿。', filters: ['当前门店'] },
      actions: [],
    });

    const result = await service.createRun({
      message: '生成本月财务报告草稿',
      actor: { ...actor, fieldScopes: { customerProfit: 'masked', staffCommission: 'hidden' } },
    });
    const documentBlock = (result.renderedBlocks ?? []).find((block: any) => block.kind === 'document_preview') as any;

    expect(result.answer).toContain('毛利 已脱敏');
    expect(result.answer).toContain('提成 已隐藏');
    expect(documentBlock.content).toContain('毛利 已脱敏');
    expect(documentBlock.content).toContain('提成 已隐藏');
    expect(documentBlock.content).not.toContain('¥900');
    expect(documentBlock.content).not.toContain('¥120');
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
      toolPlan: [
        {
          tool: 'marketing.activity.draft',
          args: {
            productIds: [301],
            context: {
              previousRun: {
                toolResults: [
                  {
                    data: {
                      items: [
                        {
                          productName: '玻尿酸修护套装',
                          fitScore: 82,
                          customerCount: 126,
                          salesAmount: 12800,
                          currentStock: 38,
                          suggestedCampaign: '会员专属活动',
                          reason: '库存高于安全库存，近 30 天销量较好。',
                        },
                      ],
                    },
                  },
                ],
              },
            },
          },
        },
      ],
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
    policy.validateToolAccess.mockReturnValue({
      allowed: true,
      requiresApproval: true,
      riskLevel: 'medium',
      reason: '工具「marketing.activity.draft」为中风险能力，可能生成草稿、任务或业务动作，执行前需要人工确认。',
    });

    const result = await service.createRun({ message: '帮我生成活动草稿', actor, context: { productId: 301 } });

    expect(result.status).toBe('waiting_approval');
    expect(result.approval).toMatchObject({
      id: 301,
      toolName: 'marketing.activity.draft',
      riskLevel: 'medium',
      status: 'pending',
      reason: '工具「marketing.activity.draft」为中风险能力，可能生成草稿、任务或业务动作，执行前需要人工确认。',
    });
    expect(result.answer).toContain('中风险能力');
    expect(result.renderedBlocks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'activity_draft_card',
          title: '玻尿酸修护套装会员专属活动',
          offerSummary: '会员专属活动',
          offerCostEstimate: expect.arrayContaining([
            expect.objectContaining({ label: '权益成本估算' }),
            expect.objectContaining({ label: '预计触达', value: '126人' }),
          ]),
          audienceDetails: expect.arrayContaining([
            expect.objectContaining({ label: '玻尿酸修护套装', value: '126位相关客户' }),
          ]),
          actions: expect.arrayContaining([
            expect.objectContaining({ actionId: 'approve:301' }),
            expect.objectContaining({ actionId: 'reject:301' }),
          ]),
        }),
        expect.objectContaining({
          kind: 'confirm_action',
          title: '确认创建活动草稿：玻尿酸修护套装会员专属活动',
          actionId: 'approve:301',
          impactSummary: expect.stringContaining('不会自动发布或触达客户'),
        }),
      ]),
    );
    expect(toolRegistry.execute).not.toHaveBeenCalled();
    expect(runtime.createApproval).toHaveBeenCalledWith(
      expect.objectContaining({
        toolCallId: 201,
        beforeJson: expect.objectContaining({
          reason: '工具「marketing.activity.draft」为中风险能力，可能生成草稿、任务或业务动作，执行前需要人工确认。',
        }),
      }),
    );
    expect(runtime.setRunStatus).toHaveBeenCalledWith(
      101,
      'waiting_approval',
      expect.objectContaining({
        resultJson: expect.objectContaining({
          conversationFocus: expect.objectContaining({
            currentActivity: expect.objectContaining({
              activityTitle: '玻尿酸修护套装会员专属活动',
              targetAudience: '近期购买/适合该商品的会员客户',
              offerSummary: '会员专属活动',
            }),
          }),
        }),
      }),
    );
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
      data: {
        activityId: 901,
        title: '编辑后的沉睡客户召回活动',
        status: 'draft',
        targetAudience: '60 天未到店高价值客户',
        offerSummary: '护理券',
        copyPreview: '亲爱的会员，为您保留护理券。',
        scheduleHint: '明天 10:00',
        recommendedItems: [{ productName: '补水精华', fitScore: 88, reason: '适合沉睡客户召回。' }],
      },
      evidence: {
        source: ['AgentApproval', 'MarketingActivity'],
        metricDefinition: '审批后创建草稿。',
        filters: ['status=draft'],
      },
      actions: [
        { label: '查看活动草稿', action: 'marketing:activity:901', riskLevel: 'low' },
        { label: '继续完善活动', action: 'marketing:activity:edit:901', riskLevel: 'medium' },
      ],
    });

    const result = await service.approve({
      approvalId: 301,
      actor,
      comment: '确认生成草稿',
      args: {
        title: '编辑后的沉睡客户召回活动',
        targetAudience: '60 天未到店高价值客户',
        offerSummary: '护理券',
        copyPreview: '亲爱的会员，为您保留护理券。',
        scheduleHint: '明天 10:00',
      },
    });

    expect(result.status).toBe('completed');
    expect(result.answer).toContain('已创建营销活动草稿');
    expect(result.renderedBlocks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'activity_draft_card',
          editable: false,
          title: '编辑后的沉睡客户召回活动',
          targetAudience: '60 天未到店高价值客户',
          offerSummary: '护理券',
          actions: expect.arrayContaining([
            expect.objectContaining({ actionId: 'marketing:activity:901' }),
            expect.objectContaining({ actionId: 'marketing:activity:edit:901' }),
          ]),
        }),
      ]),
    );
    expect(runtime.updateApproval).toHaveBeenCalledWith(301, expect.objectContaining({ status: 'approved', approvedBy: 7 }));
    expect(runtime.updateToolCall).toHaveBeenCalledWith(201, expect.objectContaining({ status: 'success' }));
    expect(runtime.setRunStatus).toHaveBeenCalledWith(
      101,
      'completed',
      expect.objectContaining({
        resultJson: expect.objectContaining({
          conversationFocus: expect.objectContaining({
            currentActivity: expect.objectContaining({
              activityId: 901,
              activityTitle: '编辑后的沉睡客户召回活动',
              status: 'draft',
            }),
          }),
        }),
      }),
    );
    expect(toolRegistry.execute).toHaveBeenCalledWith(
      'marketing.activity.draft',
      expect.objectContaining({
        context: { previousRun: { toolResults: [] } },
        title: '编辑后的沉睡客户召回活动',
        targetAudience: '60 天未到店高价值客户',
        offerSummary: '护理券',
        copyPreview: '亲爱的会员，为您保留护理券。',
        scheduleHint: '明天 10:00',
      }),
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
