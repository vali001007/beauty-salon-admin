import { DEFAULT_AGENT_EVAL_CASES } from './agent-eval.cases.js';
import { AgentEvalService } from './agent-eval.service.js';
import { AgentFieldScopeSanitizerService } from './agent-field-scope-sanitizer.service.js';
import { AgentResponseSafetyService } from './agent-response-safety.service.js';
import { AgentPlannerService } from './agent-planner.service.js';
import { BusinessTaskCompilerService } from './business-task/business-task-compiler.service.js';
import { BusinessTaskPreParserService } from './business-task/business-task-preparser.service.js';
import { CapabilityRegistryService } from './capabilities/capability-registry.service.js';
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
      name: 'service.record.draft',
      description: '生成服务记录草稿',
      riskLevel: 'low',
      allowedRoles: ['beautician', 'manager'],
      requiredPermissions: ['terminal:service:view'],
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
  const planner = new AgentPlannerService(
    registry,
    new BusinessTaskCompilerService(
      new BusinessTaskPreParserService(),
      new CapabilityRegistryService(),
      new SemanticMetricRegistryService(),
      new SemanticSqlDecisionService(),
    ),
  );
  const service = new AgentEvalService(
    planner,
    registry,
    new AgentFieldScopeSanitizerService(),
    new AgentResponseSafetyService(),
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
    expect(Array.from(new Set(toolMatchedResults.map((item) => item.actual.firstTool)))).toEqual(
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
        expectedTool: 'staff.performance.rank',
        expectedIntentType: 'analysis_and_recommendation',
        expectedRiskLevel: 'low',
        expectedClarification: false,
        expectedFieldScopeProtected: true,
        expectedProtectedFieldScopes: ['customerCost', 'customerProfit', 'staffCommission'],
      },
    ]);

    expect(result.failed).toBe(0);
    expect(result.results[0].actual).toMatchObject({
      firstTool: 'staff.performance.rank',
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
