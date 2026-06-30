import { DEFAULT_AGENT_EVAL_CASES, P0_AGENT_EVAL_CASES, TERMINAL_ACCEPTANCE_AGENT_EVAL_CASES } from './agent-eval.cases.js';
import { QUESTION_BANK_CONVERSATION_CASES } from './agent-eval-question-bank.js';
import { AgentEvalService } from './agent-eval.service.js';
import { AgentFieldScopeSanitizerService } from './agent-field-scope-sanitizer.service.js';
import { AgentResponseSafetyService } from './agent-response-safety.service.js';
import { AgentPlannerService } from './agent-planner.service.js';
import { BusinessTaskCompilerService } from './business-task/business-task-compiler.service.js';
import { BusinessTaskPreParserService } from './business-task/business-task-preparser.service.js';
import { CapabilityRegistryService } from './capabilities/capability-registry.service.js';
import { AgentSkillsRegistryService } from './skills/index.js';
import { SemanticMetricRegistryService } from '../semantic-data/semantic-metric-registry.service.js';
import { SemanticSqlDecisionService } from '../semantic-sql/semantic-sql-decision.service.js';

describe('AgentEvalService', () => {
  const tools = [
    {
      name: 'customer.priority.rank',
      description: '推荐优先跟进客户',
      riskLevel: 'low',
      allowedRoles: ['manager', 'reception'],
      requiredPermissions: ['terminal:customer:view'],
      requiresApproval: false,
    },
    {
      name: 'business.query.ask',
      description: '执行受控经营问数',
      riskLevel: 'low',
      allowedRoles: ['manager', 'reception', 'beautician'],
      requiredPermissions: [],
      requiresApproval: false,
    },
    {
      name: 'revenue.diagnose',
      description: '诊断收入变化',
      riskLevel: 'low',
      allowedRoles: ['manager'],
      requiredPermissions: ['core:order:view'],
      requiresApproval: false,
    },
    {
      name: 'finance.revenue.summary',
      description: '汇总财务收入',
      riskLevel: 'low',
      allowedRoles: ['manager'],
      requiredPermissions: ['core:order:view'],
      requiresApproval: false,
    },
    {
      name: 'product.sales.rank',
      description: '查询商品销量排行',
      riskLevel: 'low',
      allowedRoles: ['manager', 'reception'],
      requiredPermissions: ['core:product:view'],
      requiresApproval: false,
    },
    {
      name: 'marketing.opportunity.discover',
      description: '发现适合做活动的商品机会',
      riskLevel: 'low',
      allowedRoles: ['manager'],
      requiredPermissions: ['core:marketing:recommend'],
      requiresApproval: false,
    },
    {
      name: 'marketing.activity.draft',
      description: '生成营销活动草稿',
      riskLevel: 'medium',
      allowedRoles: ['manager'],
      requiredPermissions: ['core:marketing:create'],
      requiresApproval: true,
    },
    {
      name: 'manager.daily.briefing',
      description: '生成门店今日经营简报',
      riskLevel: 'low',
      allowedRoles: ['manager'],
      requiredPermissions: ['core:dashboard:view'],
      requiresApproval: false,
    },
    {
      name: 'reception.customer.lookup',
      description: '查询前台客户资料',
      riskLevel: 'low',
      allowedRoles: ['manager', 'reception'],
      requiredPermissions: ['terminal:customer:view'],
      requiresApproval: false,
    },
    {
      name: 'reception.reservation.today',
      description: '查询今日预约与待确认预约',
      riskLevel: 'low',
      allowedRoles: ['manager', 'reception'],
      requiredPermissions: ['core:store:reservations'],
      requiresApproval: false,
    },
    {
      name: 'reception.card.benefit.summary',
      description: '查询客户卡项与权益概况',
      riskLevel: 'low',
      allowedRoles: ['manager', 'reception'],
      requiredPermissions: ['core:order:card-usage'],
      requiresApproval: false,
    },
    {
      name: 'marketing.customer.segment.discover',
      description: '发现适合营销召回的客户分群',
      riskLevel: 'low',
      allowedRoles: ['manager'],
      requiredPermissions: ['core:marketing:view'],
      requiresApproval: false,
    },
    {
      name: 'promotion.offer.match',
      description: '匹配适合的营销权益与优惠方案',
      riskLevel: 'low',
      allowedRoles: ['manager'],
      requiredPermissions: ['core:marketing:view'],
      requiresApproval: false,
    },
    {
      name: 'marketing.copy.generate',
      description: '生成营销文案与触达话术',
      riskLevel: 'low',
      allowedRoles: ['manager'],
      requiredPermissions: ['core:marketing:view'],
      requiresApproval: false,
    },
    {
      name: 'marketing.effect.diagnose',
      description: '诊断营销活动效果',
      riskLevel: 'low',
      allowedRoles: ['manager'],
      requiredPermissions: ['core:marketing:analytics'],
      requiresApproval: false,
    },
    {
      name: 'customer.followup.task.draft',
      description: '生成客户跟进任务草稿',
      riskLevel: 'medium',
      allowedRoles: ['manager', 'reception'],
      requiredPermissions: ['terminal:customer:followup'],
      requiresApproval: true,
    },
    {
      name: 'inventory.replenishment.draft',
      description: '生成补货采购草稿',
      riskLevel: 'medium',
      allowedRoles: ['manager'],
      requiredPermissions: ['core:inventory:purchase'],
      requiresApproval: true,
    },
    {
      name: 'inventory.risk.rank',
      description: '查询库存风险排行',
      riskLevel: 'low',
      allowedRoles: ['manager', 'reception'],
      requiredPermissions: ['core:inventory:view'],
      requiresApproval: false,
    },
    {
      name: 'inventory.consumption.trend',
      description: '分析库存消耗趋势',
      riskLevel: 'low',
      allowedRoles: ['manager'],
      requiredPermissions: ['core:inventory:view'],
      requiresApproval: false,
    },
    {
      name: 'inventory.project.bom.risk',
      description: '诊断项目耗材 BOM 风险',
      riskLevel: 'low',
      allowedRoles: ['manager'],
      requiredPermissions: ['core:inventory:view'],
      requiresApproval: false,
    },
    {
      name: 'inventory.expiring.clearance.draft',
      description: '生成临期库存处理草稿',
      riskLevel: 'low',
      allowedRoles: ['manager'],
      requiredPermissions: ['core:inventory:view'],
      requiresApproval: false,
    },
    {
      name: 'supplier.purchase.link',
      description: '查询供应商采购链接',
      riskLevel: 'low',
      allowedRoles: ['manager'],
      requiredPermissions: ['core:inventory:purchase'],
      requiresApproval: false,
    },
    {
      name: 'service.record.draft',
      description: '生成服务记录草稿',
      riskLevel: 'low',
      allowedRoles: ['beautician', 'manager'],
      requiredPermissions: ['terminal:service:view'],
      requiresApproval: false,
    },
    {
      name: 'beautician.today.service.list',
      description: '查询美容师今日服务客户',
      riskLevel: 'low',
      allowedRoles: ['beautician', 'manager'],
      requiredPermissions: ['terminal:service:view'],
      requiresApproval: false,
    },
    {
      name: 'beautician.customer.care.brief',
      description: '生成美容师客户护理摘要',
      riskLevel: 'low',
      allowedRoles: ['beautician', 'manager'],
      requiredPermissions: ['terminal:service:view'],
      requiresApproval: false,
    },
    {
      name: 'beautician.performance.progress',
      description: '查询美容师本月业绩进度',
      riskLevel: 'low',
      allowedRoles: ['beautician', 'manager'],
      requiredPermissions: [],
      requiresApproval: false,
    },
    {
      name: 'beautician.repurchase.opportunity',
      description: '推荐美容师复购续卡机会',
      riskLevel: 'low',
      allowedRoles: ['beautician', 'manager'],
      requiredPermissions: ['terminal:customer:view'],
      requiresApproval: false,
    },
    {
      name: 'scheduling.optimization.preview',
      description: '生成智能排班优化预览',
      riskLevel: 'low',
      allowedRoles: ['manager'],
      requiredPermissions: ['core:store:scheduling'],
      requiresApproval: false,
    },
    {
      name: 'schedule.diagnose',
      description: '诊断预约排班',
      riskLevel: 'low',
      allowedRoles: ['manager', 'reception'],
      requiredPermissions: ['core:store:scheduling'],
      requiresApproval: false,
    },
    {
      name: 'project.diagnose',
      description: '诊断项目经营',
      riskLevel: 'low',
      allowedRoles: ['manager', 'reception'],
      requiredPermissions: ['core:project:view'],
      requiresApproval: false,
    },
    {
      name: 'card.diagnose',
      description: '诊断卡项/会员卡经营',
      riskLevel: 'low',
      allowedRoles: ['manager', 'reception'],
      requiredPermissions: ['core:order:card-usage'],
      requiresApproval: false,
    },
    {
      name: 'finance.margin.diagnose',
      description: '诊断财务毛利',
      riskLevel: 'low',
      allowedRoles: ['manager'],
      requiredPermissions: ['core:order:view'],
      requiresApproval: false,
    },
    {
      name: 'finance.profit.diagnose',
      description: '诊断利润变化',
      riskLevel: 'low',
      allowedRoles: ['manager'],
      requiredPermissions: ['core:order:view'],
      requiresApproval: false,
    },
    {
      name: 'finance.margin.risk.rank',
      description: '查询毛利风险排行',
      riskLevel: 'low',
      allowedRoles: ['manager'],
      requiredPermissions: ['core:order:view'],
      requiresApproval: false,
    },
    {
      name: 'finance.refund.discount.audit',
      description: '审计退款折扣风险',
      riskLevel: 'low',
      allowedRoles: ['manager'],
      requiredPermissions: ['core:order:view'],
      requiresApproval: false,
    },
    {
      name: 'finance.beautician.performance.audit',
      description: '审计美容师绩效风险',
      riskLevel: 'low',
      allowedRoles: ['manager'],
      requiredPermissions: ['core:order:view'],
      requiresApproval: false,
    },
    {
      name: 'finance.report.draft',
      description: '生成财务报告草稿',
      riskLevel: 'low',
      allowedRoles: ['manager'],
      requiredPermissions: ['core:order:view'],
      requiresApproval: false,
    },
    {
      name: 'staff.performance.rank',
      description: '查询员工表现排行',
      riskLevel: 'low',
      allowedRoles: ['manager', 'beautician'],
      requiredPermissions: [],
      requiresApproval: false,
    },
    {
      name: 'supply_chain.diagnose',
      description: '诊断供应链采购',
      riskLevel: 'low',
      allowedRoles: ['manager'],
      requiredPermissions: ['core:inventory:purchase'],
      requiresApproval: false,
    },
    {
      name: 'marketing.conversion.diagnose',
      description: '诊断营销转化',
      riskLevel: 'low',
      allowedRoles: ['manager'],
      requiredPermissions: ['core:marketing:view'],
      requiresApproval: false,
    },
    {
      name: 'automation.execution.diagnose',
      description: '复盘自动化执行',
      riskLevel: 'low',
      allowedRoles: ['manager'],
      requiredPermissions: ['core:marketing:view'],
      requiresApproval: false,
    },
    {
      name: 'customer_app.funnel.analyze',
      description: '分析客户小程序渠道漏斗',
      riskLevel: 'low',
      allowedRoles: ['manager'],
      requiredPermissions: ['core:customer:view'],
      requiresApproval: false,
    },
    {
      name: 'promotion.effect.analyze',
      description: '分析权益活动效果',
      riskLevel: 'low',
      allowedRoles: ['manager'],
      requiredPermissions: ['core:marketing:view'],
      requiresApproval: false,
    },
    {
      name: 'terminal.health.diagnose',
      description: '诊断终端健康',
      riskLevel: 'low',
      allowedRoles: ['manager'],
      requiredPermissions: ['terminal:device:view'],
      requiresApproval: false,
    },
    {
      name: 'order.refund.diagnose',
      description: '诊断售后退款',
      riskLevel: 'low',
      allowedRoles: ['manager', 'reception'],
      requiredPermissions: ['core:order:view'],
      requiresApproval: false,
    },
    {
      name: 'service.quality.diagnose',
      description: '诊断服务质量',
      riskLevel: 'low',
      allowedRoles: ['manager'],
      requiredPermissions: ['terminal:service:view'],
      requiresApproval: false,
    },
    {
      name: 'store.comparison.diagnose',
      description: '诊断门店对比',
      riskLevel: 'low',
      allowedRoles: ['manager'],
      requiredPermissions: ['core:store:view'],
      requiresApproval: false,
    },
  ];
  const registry = {
    list: jest.fn(() => tools),
    get: jest.fn((name: string) => tools.find((tool) => tool.name === name)),
  } as any;
  const skillRegistry = new AgentSkillsRegistryService();
  const planner = new AgentPlannerService(
    registry,
    new BusinessTaskCompilerService(
      new BusinessTaskPreParserService(),
      new CapabilityRegistryService(),
      new SemanticMetricRegistryService(),
      new SemanticSqlDecisionService(),
      undefined,
      skillRegistry,
    ),
  );
  const service = new AgentEvalService(
    planner,
    registry,
    new AgentFieldScopeSanitizerService(),
    new AgentResponseSafetyService(),
    skillRegistry,
  );

  it('contains a broad natural-language regression matrix', () => {
    expect(DEFAULT_AGENT_EVAL_CASES.length).toBeGreaterThanOrEqual(360);
    expect(Array.from(new Set(DEFAULT_AGENT_EVAL_CASES.map((item) => item.role)))).toEqual(
      expect.arrayContaining(['manager', 'reception', 'beautician']),
    );
    expect(Array.from(new Set(DEFAULT_AGENT_EVAL_CASES.map((item) => item.expectedTool).filter(Boolean)))).toEqual(
      expect.arrayContaining([
        'customer.priority.rank',
        'product.sales.rank',
        'inventory.risk.rank',
        'staff.performance.rank',
        'customer_app.funnel.analyze',
        'terminal.health.diagnose',
      ]),
    );
    expect(DEFAULT_AGENT_EVAL_CASES).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'finance-margin-diagnosis-manager-permission-denied-001',
          expectedPermissionAllowed: false,
        }),
        expect.objectContaining({
          id: 'terminal-health-manager-permission-denied-001',
          expectedPermissionAllowed: false,
        }),
        expect.objectContaining({
          id: 'finance-margin-field-scope-reception-001',
          expectedFieldScopeProtected: true,
        }),
        expect.objectContaining({
          id: 'staff-commission-field-scope-beautician-001',
          expectedFieldScopeProtected: true,
        }),
      ]),
    );
    const personaCoreCounts = DEFAULT_AGENT_EVAL_CASES.reduce<Record<string, number>>((acc, item) => {
      const match = item.scenario.match(/^Persona核心问题：(.+)$/);
      if (match?.[1]) acc[match[1]] = (acc[match[1]] ?? 0) + 1;
      return acc;
    }, {});
    expect(personaCoreCounts).toMatchObject({
      店长经营: 5,
      营销增长: 5,
      美容师服务: 5,
      库存采购: 5,
      财务风控: 5,
    });
    expect(personaCoreCounts['前台接待客户查询'] + personaCoreCounts['前台接待预约'] + personaCoreCounts['前台接待卡项权益']).toBeGreaterThanOrEqual(5);
  });

  it('passes the default P0 planner and safety regression cases', async () => {
    const result = await service.runDefaultCases(DEFAULT_AGENT_EVAL_CASES);
    const toolMatchedResults = result.results.filter((item) => item.actual.firstTool);
    const runtimeCheckedResults = result.results.filter((item) => item.actual.runtimeResponseSafe !== undefined);

    expect(result.total).toBe(DEFAULT_AGENT_EVAL_CASES.length);
    expect(result.failed).toBe(0);
    expect(result.results.every((item) => item.passed)).toBe(true);
    expect(toolMatchedResults.length).toBeGreaterThan(0);
    expect(runtimeCheckedResults).toHaveLength(toolMatchedResults.length);
    expect(toolMatchedResults.every((item) => item.actual.runtimeResponseSafe === true)).toBe(true);
    expect(toolMatchedResults.every((item) => (item.actual.runtimeResponseSafetyViolations as string[]).length === 0)).toBe(true);
    expect(Array.from(new Set(toolMatchedResults.flatMap((item) => item.actual.plannedTools as string[])))).toEqual(
      expect.arrayContaining(tools.map((tool) => tool.name)),
    );
    expect(result.results).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'customer-priority-recommendation-001',
          actual: expect.objectContaining({ runtimeResponseSafe: true }),
        }),
        expect.objectContaining({
          id: 'staff-performance-ranking-001',
          actual: expect.objectContaining({ runtimeResponseSafe: true }),
        }),
        expect.objectContaining({
          id: 'terminal-health-diagnosis-001',
          actual: expect.objectContaining({ runtimeResponseSafe: true }),
        }),
      ]),
    );
  });

  it('passes the standalone Dongxi Beauty P0 high-frequency QA baseline cases', async () => {
    expect(P0_AGENT_EVAL_CASES.length).toBeGreaterThanOrEqual(50);
    expect(new Set(P0_AGENT_EVAL_CASES.map((item) => item.scenario))).toEqual(
      new Set(['P0 消费客户清单', 'P0 营收问数', 'P0 预约清单', 'P0 库存预警', 'P0 客户复购回访']),
    );

    const result = await service.runP0Cases();

    expect(result.total).toBe(P0_AGENT_EVAL_CASES.length);
    expect(result.failed).toBe(0);
  });

  it('passes the question bank multi-turn conversation baseline cases', async () => {
    const result = await service.runConversationCases(QUESTION_BANK_CONVERSATION_CASES);

    expect(result.total).toBe(5);
    expect(result.failureSamples).toEqual([]);
    expect(result.failed).toBe(0);
    expect(result.conversations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'qb-conv-consumption-list-priority-followup',
          failedTurns: 0,
        }),
        expect.objectContaining({
          id: 'qb-conv-customer-pronoun-benefit',
          failedTurns: 0,
        }),
        expect.objectContaining({
          id: 'qb-conv-missing-context-pronoun-clarify',
          failedTurns: 0,
        }),
      ]),
    );
    expect(result.results).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'qb-conv-consumption-list-priority-followup:turn-2',
          actual: expect.objectContaining({
            firstTool: 'customer.priority.rank',
            domain: 'customer',
            filters: expect.objectContaining({
              contextScope: 'previous_order_customer_consumption_list',
              customerIds: [501, 502],
            }),
          }),
        }),
        expect.objectContaining({
          id: 'qb-conv-customer-pronoun-benefit:turn-1',
          actual: expect.objectContaining({
            firstTool: 'reception.card.benefit.summary',
            filters: expect.objectContaining({
              customerId: 501,
              customerName: '马美琳',
            }),
          }),
        }),
      ]),
    );
  });

  it('passes the T6.5 terminal acceptance question baseline cases', async () => {
    expect(TERMINAL_ACCEPTANCE_AGENT_EVAL_CASES.map((item) => item.input)).toEqual([
      '昨天有哪些消费的客户，列出清单',
      '近期有哪些临期库存产品',
      '临期库存怎么处理，生成草稿建议',
      '今天经营有什么风险',
      '哪些客户最值得优先回访',
      '哪些商品需要补货',
      '本月员工业绩排行',
    ]);

    const result = await service.runDefaultCases(TERMINAL_ACCEPTANCE_AGENT_EVAL_CASES);

    expect(result.total).toBe(TERMINAL_ACCEPTANCE_AGENT_EVAL_CASES.length);
    expect(result.failed).toBe(0);
    expect(result.results.every((item) => item.passed)).toBe(true);
    expect(new Set(result.results.map((item) => item.actual.firstTool))).toEqual(
      new Set([
        'business.query.ask',
        'inventory.risk.rank',
        'inventory.expiring.clearance.draft',
        'customer.priority.rank',
        'staff.performance.rank',
      ]),
    );
  });

  it('runs eval cases by Skill and reports accuracy metrics', async () => {
    const result = await service.runSkillCases();

    expect(result.total).toBeGreaterThanOrEqual(8);
    expect(result.failed).toBe(0);
    expect(result.metrics).toMatchObject({
      skillCount: expect.any(Number),
      toolAccuracy: 1,
      capabilityAccuracy: 1,
      outputContractAccuracy: 1,
    });
    expect(result.bySkill).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ skillId: 'reservation.capacity.schedule', failed: 0 }),
        expect.objectContaining({ skillId: 'inventory.supply.risk', failed: 0 }),
        expect.objectContaining({ skillId: 'staff.performance.management', failed: 0 }),
      ]),
    );
  });

  it('runs eval cases for a single Skill', async () => {
    const result = await service.runSkillCases('inventory.supply.risk');

    expect(result.skillId).toBe('inventory.supply.risk');
    expect(result.bySkill).toHaveLength(1);
    expect(result.bySkill[0]).toMatchObject({
      skillId: 'inventory.supply.risk',
      total: 2,
      failed: 0,
      toolAccuracy: 1,
    });
  });

  it('persists failed eval samples as draft regression cases when requested', async () => {
    const prisma = {
      agentEvalCase: {
        createMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    } as any;
    const persistService = new AgentEvalService(
      planner,
      registry,
      new AgentFieldScopeSanitizerService(),
      new AgentResponseSafetyService(),
      skillRegistry,
      prisma,
    );

    const result = await persistService.runDefaultCases(
      [
        {
          id: 'forced-failure',
          scenario: '强制失败样本',
          input: '今天收入怎么样',
          role: 'manager',
          expectedTool: 'wrong.tool',
          expectedClarification: false,
        },
      ],
      { persistFailures: true, source: 'unit_test' },
    );

    expect(result.failed).toBe(1);
    expect(result.savedFailureSamples).toBe(1);
    expect(prisma.agentEvalCase.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          scenario: 'regression:强制失败样本',
          input: '今天收入怎么样',
          role: 'manager',
          expectedTool: 'wrong.tool',
          status: 'draft',
          expectedOutcome: expect.objectContaining({
            source: 'unit_test',
            originalCaseId: 'forced-failure',
          }),
        }),
      ],
    });
  });

  it('persists failed conversation samples as draft regression cases when requested', async () => {
    const prisma = {
      agentEvalCase: {
        createMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    } as any;
    const persistService = new AgentEvalService(
      planner,
      registry,
      new AgentFieldScopeSanitizerService(),
      new AgentResponseSafetyService(),
      skillRegistry,
      prisma,
    );

    const result = await persistService.runConversationCases(
      [
        {
          id: 'forced-conversation-failure',
          scenario: '强制多轮失败样本',
          role: 'manager',
          turns: [
            {
              id: 'turn-1',
              input: '优先联系哪些客户？',
              expectedTool: 'wrong.tool',
              expectedClarification: false,
            },
          ],
        },
      ],
      { persistFailures: true, source: 'conversation_unit_test' },
    );

    expect(result.failed).toBe(1);
    expect(result.savedFailureSamples).toBe(1);
    expect(prisma.agentEvalCase.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          scenario: 'regression:强制多轮失败样本',
          input: '优先联系哪些客户？',
          role: 'manager',
          expectedTool: 'wrong.tool',
          status: 'draft',
          expectedOutcome: expect.objectContaining({
            source: 'conversation_unit_test',
            originalCaseId: 'forced-conversation-failure:turn-1',
          }),
        }),
      ],
    });
  });

  it('reports account permission boundaries in eval results', async () => {
    const result = await service.runDefaultCases([
      {
        id: 'finance-permission-denied',
        scenario: '账号权限边界',
        input: '近30天毛利怎么样',
        role: 'manager',
        accountPermissions: ['core:customer:view'],
        expectedTool: 'finance.margin.diagnose',
        expectedIntentType: 'analysis_and_recommendation',
        expectedRiskLevel: 'low',
        expectedClarification: false,
        expectedPermissionAllowed: false,
      },
    ]);

    expect(result.failed).toBe(0);
    expect(result.results[0].actual).toMatchObject({
      firstTool: 'finance.margin.diagnose',
      permissionAllowed: false,
    });
  });

  it('reports field scope protection in eval results', async () => {
    const result = await service.runDefaultCases([
      {
        id: 'field-scope-protected',
        scenario: '字段权限边界',
        input: '我的提成情况怎么样',
        role: 'beautician',
        fieldScopes: {
          staffCommission: 'hidden',
          customerCost: 'hidden',
          customerProfit: 'hidden',
        },
        expectedTool: 'beautician.performance.progress',
        expectedIntentType: 'analysis_and_recommendation',
        expectedRiskLevel: 'low',
        expectedClarification: false,
        expectedFieldScopeProtected: true,
        expectedProtectedFieldScopes: ['customerCost', 'customerProfit', 'staffCommission'],
      },
    ]);

    expect(result.failed).toBe(0);
    expect(result.results[0].actual).toMatchObject({
      firstTool: 'beautician.performance.progress',
      fieldScopeProtected: true,
      protectedFieldScopes: ['customerCost', 'customerProfit', 'staffCommission'],
    });
  });

  it('fails eval cases when user-visible planning text leaks internal fields', async () => {
    const unsafePlanner = {
      plan: jest.fn().mockResolvedValue({
        intentType: 'analysis_and_recommendation',
        goal: '查询 recommended 客户',
        toolPlan: [{ tool: 'customer.priority.rank', args: {} }],
        confidence: 0.8,
        clarificationNeeded: false,
        capabilityPlan: {
          capabilityId: 'customer_priority_recommendation',
          reason: '命中 follow_up_priority_score，filters: timeRange=next_week limit=10',
        },
      }),
    } as any;
    const unsafeService = new AgentEvalService(
      unsafePlanner,
      registry,
      new AgentFieldScopeSanitizerService(),
      new AgentResponseSafetyService(),
    );

    const result = await unsafeService.runDefaultCases([
      {
        id: 'unsafe-display-text',
        scenario: '响应中文化门禁',
        input: '下周重点关注哪些客户',
        role: 'manager',
        expectedTool: 'customer.priority.rank',
        expectedIntentType: 'analysis_and_recommendation',
        expectedClarification: false,
      },
    ]);

    expect(result.failed).toBe(1);
    expect(result.results[0].actual).toMatchObject({
      responseSafe: false,
    });
    expect(result.results[0].actual.responseSafetyViolations).toEqual(
      expect.arrayContaining([
        expect.stringContaining('recommended'),
        expect.stringContaining('follow_up_priority_score'),
        expect.stringContaining('timeRange='),
      ]),
    );
  });
});
