import { AgentSkillsRegistryService } from './agent-skills.registry.js';

describe('AgentSkillsRegistryService', () => {
  const registry = new AgentSkillsRegistryService();

  it('lists P0 business skills with output contracts and eval cases', () => {
    const ids = registry.list().map((skill) => skill.id);

    expect(ids).toEqual(
      expect.arrayContaining([
        'business.intent.planning',
        'order.customer.consumption.list',
        'revenue.order.analysis',
        'finance.profit.risk',
        'marketing.growth.execution',
        'reservation.capacity.schedule',
        'inventory.supply.risk',
        'staff.performance.management',
        'card.member.asset',
        'service.quality.record',
        'automation.event.trigger',
        'store.comparison.benchmark',
        'terminal.health.ops',
        'answer.contract.rendering',
        'customer.lifecycle.insight',
      ]),
    );
    expect(registry.get('order.customer.consumption.list')).toMatchObject({
      capabilityId: 'order_customer_consumption_list',
      outputContract: expect.objectContaining({
        requiredKinds: ['table', 'evidence'],
        evidenceRequired: true,
      }),
      evalCases: expect.arrayContaining([
        expect.objectContaining({ expectedCapabilityId: 'order_customer_consumption_list' }),
      ]),
    });
  });

  it('matches order consumption list tasks before generic capabilities', () => {
    const plan = registry.match(
      {
        domain: 'order',
        taskType: 'query',
        objective: '上周流水客户名单',
        entities: [{ type: 'order', value: 'order', confidence: 0.72 }],
        metrics: ['paid_amount', 'order_count'],
        filters: {},
        timeRange: { preset: 'last_week', label: '上周' },
        outputMode: 'card',
        riskLevel: 'low',
        requiresApproval: false,
        missingSlots: [],
        confidence: 0.9,
        actorRole: 'manager',
      },
      'manager',
    );

    expect(plan).toMatchObject({
      skillId: 'order.customer.consumption.list',
      capabilityId: 'order_customer_consumption_list',
      toolPlan: [{ tool: 'business.query.ask', args: expect.objectContaining({ timeRange: 'last_week' }) }],
      outputContract: expect.objectContaining({ requiredKinds: ['table', 'evidence'] }),
    });
  });

  it('matches revenue KPI questions to the revenue order analysis skill', () => {
    const plan = registry.match(
      {
        domain: 'business',
        taskType: 'query',
        objective: '今天营收多少',
        entities: [{ type: 'business', value: 'business', confidence: 0.72 }],
        metrics: ['revenue'],
        filters: {},
        timeRange: { preset: 'today', label: '今天' },
        outputMode: 'card',
        outputIntent: 'show_kpi',
        riskLevel: 'low',
        requiresApproval: false,
        missingSlots: [],
        confidence: 0.9,
        actorRole: 'manager',
      },
      'manager',
    );

    expect(plan).toMatchObject({
      skillId: 'revenue.order.analysis',
      capabilityId: 'order_revenue_analysis',
      toolPlan: [{ tool: 'business.query.ask', args: expect.objectContaining({ timeRange: 'today' }) }],
      outputContract: expect.objectContaining({ requiredKinds: ['kpi', 'evidence'] }),
    });
  });

  it('matches finance profit diagnosis questions to the finance profit risk skill', () => {
    const plan = registry.match(
      {
        domain: 'finance',
        taskType: 'diagnosis',
        objective: '为什么利润下降',
        entities: [{ type: 'finance', value: 'finance', confidence: 0.72 }],
        metrics: ['gross_margin', 'material_cost'],
        filters: {},
        timeRange: { preset: 'last_30_days', label: '近30天' },
        outputMode: 'summary',
        outputIntent: 'answer_text',
        riskLevel: 'low',
        requiresApproval: false,
        missingSlots: [],
        confidence: 0.9,
        actorRole: 'manager',
      },
      'manager',
    );

    expect(plan).toMatchObject({
      skillId: 'finance.profit.risk',
      capabilityId: 'finance_profit_diagnosis',
      toolPlan: [
        { tool: 'finance.revenue.summary', args: expect.objectContaining({ timeRange: 'last_30_days' }) },
        { tool: 'finance.profit.diagnose', args: expect.objectContaining({ timeRange: 'last_30_days' }) },
        { tool: 'finance.refund.discount.audit', args: expect.objectContaining({ timeRange: 'last_30_days' }) },
        { tool: 'finance.beautician.performance.audit', args: expect.objectContaining({ timeRange: 'last_30_days' }) },
      ],
      outputContract: expect.objectContaining({ requiredKinds: ['kpi', 'table', 'evidence'] }),
    });
  });

  it('matches recall activity draft questions to the marketing growth execution skill', () => {
    const plan = registry.match(
      {
        domain: 'marketing',
        taskType: 'draft',
        objective: '帮我生成召回活动',
        entities: [{ type: 'customer_segment', value: '流失客户', confidence: 0.72 }],
        metrics: ['churn_risk_score'],
        filters: {},
        timeRange: { preset: 'last_30_days', label: '近30天' },
        outputMode: 'draft',
        outputIntent: 'draft_document',
        riskLevel: 'medium',
        requiresApproval: true,
        missingSlots: [],
        confidence: 0.86,
        actorRole: 'manager',
      },
      'manager',
    );

    expect(plan).toMatchObject({
      skillId: 'marketing.growth.execution',
      capabilityId: 'marketing_growth_execution',
      toolPlan: [{ tool: 'marketing.activity.draft', args: expect.objectContaining({ title: '流失客户召回活动' }) }],
      outputContract: expect.objectContaining({
        requiredKinds: expect.arrayContaining(['action_card']),
        evidenceRequired: true,
      }),
    });
  });

  it('matches reservation and schedule capacity questions to schedule diagnosis', () => {
    const plan = registry.match(
      {
        domain: 'schedule',
        taskType: 'diagnosis',
        objective: '本周预约排班有什么风险',
        entities: [{ type: 'schedule', value: 'schedule', confidence: 0.72 }],
        metrics: ['schedule_utilization_rate', 'reservation_count'],
        filters: {},
        timeRange: { preset: 'this_week', label: '本周' },
        outputMode: 'card',
        outputIntent: 'show_table',
        riskLevel: 'low',
        requiresApproval: false,
        missingSlots: [],
        confidence: 0.88,
        actorRole: 'manager',
      },
      'manager',
    );

    expect(plan).toMatchObject({
      skillId: 'reservation.capacity.schedule',
      capabilityId: 'reservation_schedule_diagnosis',
      toolPlan: [{ tool: 'schedule.diagnose', args: expect.objectContaining({ timeRange: 'this_week' }) }],
      outputContract: expect.objectContaining({ requiredKinds: ['table', 'evidence'], evidenceRequired: true }),
    });
  });

  it('matches inventory supply risk questions and routes draft intents to replenishment draft', () => {
    const riskPlan = registry.match(
      {
        domain: 'inventory',
        taskType: 'ranking',
        objective: '哪些商品库存不足',
        entities: [{ type: 'inventory', value: '商品', confidence: 0.72 }],
        metrics: ['stock_risk_score'],
        filters: {},
        timeRange: { preset: 'last_30_days', label: '近30天' },
        outputMode: 'card',
        outputIntent: 'show_table',
        riskLevel: 'low',
        requiresApproval: false,
        missingSlots: [],
        confidence: 0.88,
        actorRole: 'manager',
      },
      'manager',
    );
    const draftPlan = registry.match(
      {
        domain: 'inventory',
        taskType: 'draft',
        objective: '生成补货采购草稿',
        entities: [{ type: 'inventory', value: '采购草稿', confidence: 0.72 }],
        metrics: ['stock_risk_score', 'supplier_purchase_score'],
        filters: {},
        timeRange: { preset: 'last_30_days', label: '近30天' },
        outputMode: 'draft',
        outputIntent: 'confirm_action',
        riskLevel: 'medium',
        requiresApproval: true,
        missingSlots: [],
        confidence: 0.86,
        actorRole: 'manager',
      },
      'manager',
    );

    expect(riskPlan).toMatchObject({
      skillId: 'inventory.supply.risk',
      capabilityId: 'inventory_supply_risk',
      toolPlan: [{ tool: 'inventory.risk.rank' }],
    });
    expect(draftPlan).toMatchObject({
      skillId: 'inventory.supply.risk',
      capabilityId: 'inventory_supply_risk',
      toolPlan: [{ tool: 'inventory.replenishment.draft' }],
      outputContract: expect.objectContaining({ preferredKinds: expect.arrayContaining(['action_card']) }),
    });
  });

  it('routes industry product chain gap questions to the operational report tool', () => {
    const plan = registry.match(
      {
        domain: 'inventory',
        taskType: 'diagnosis',
        objective: '哪些标准品还没有本地 SKU，哪些本地产品没有供应链映射，哪些 BOM 耗材没有库存',
        entities: [{ type: 'inventory', value: '标准品链路', confidence: 0.72 }],
        metrics: ['stock_risk_score', 'supplier_purchase_score'],
        filters: {},
        timeRange: { preset: 'last_30_days', label: '近30天' },
        outputMode: 'card',
        outputIntent: 'show_table',
        riskLevel: 'low',
        requiresApproval: false,
        missingSlots: [],
        confidence: 0.9,
        actorRole: 'manager',
      },
      'manager',
    );

    expect(plan).toMatchObject({
      skillId: 'inventory.supply.risk',
      capabilityId: 'inventory_supply_risk',
      toolPlan: [{ tool: 'industry.chain.operational.report' }],
      outputContract: expect.objectContaining({ requiredKinds: ['table', 'evidence'] }),
    });
  });

  it('matches staff performance management for manager and beautician self questions', () => {
    const managerPlan = registry.match(
      {
        domain: 'staff',
        taskType: 'ranking',
        objective: '近期表现较好的员工',
        entities: [{ type: 'staff', value: '员工', confidence: 0.72 }],
        metrics: ['staff_performance_score'],
        filters: {},
        timeRange: { preset: 'last_30_days', label: '近30天' },
        outputMode: 'card',
        outputIntent: 'show_table',
        riskLevel: 'low',
        requiresApproval: false,
        missingSlots: [],
        confidence: 0.88,
        actorRole: 'manager',
      },
      'manager',
    );
    const selfPlan = registry.match(
      {
        domain: 'staff',
        taskType: 'query',
        objective: '我的表现怎么样',
        entities: [{ type: 'staff', value: 'self', confidence: 0.72 }],
        metrics: ['staff_performance_score'],
        filters: { selfOnly: true },
        timeRange: { preset: 'this_month', label: '本月' },
        outputMode: 'card',
        outputIntent: 'show_table',
        riskLevel: 'low',
        requiresApproval: false,
        missingSlots: [],
        confidence: 0.88,
        actorRole: 'beautician',
      },
      'beautician',
    );

    expect(managerPlan).toMatchObject({
      skillId: 'staff.performance.management',
      capabilityId: 'staff_performance_ranking',
      toolPlan: [{ tool: 'staff.performance.rank', args: expect.objectContaining({ timeRange: 'last_30_days' }) }],
    });
    expect(selfPlan).toMatchObject({
      skillId: 'staff.performance.management',
      capabilityId: 'staff_performance_ranking',
      toolPlan: [{ tool: 'staff.performance.rank', args: expect.objectContaining({ timeRange: 'this_month' }) }],
    });
  });

  it('does not match skills for roles outside the risk policy', () => {
    const plan = registry.match(
      {
        domain: 'order',
        taskType: 'query',
        objective: '昨天有哪些消费客户',
        entities: [],
        metrics: ['paid_amount', 'order_count'],
        filters: {},
        timeRange: { preset: 'yesterday', label: '昨天' },
        outputMode: 'card',
        riskLevel: 'low',
        requiresApproval: false,
        missingSlots: [],
        confidence: 0.9,
        actorRole: 'beautician',
      },
      'beautician',
    );

    expect(plan).toBeNull();
  });

  it('registers P2 skills with tool plans, output contracts, and eval cases', () => {
    const p2SkillIds = [
      'card.member.asset',
      'service.quality.record',
      'automation.event.trigger',
      'store.comparison.benchmark',
      'terminal.health.ops',
    ];

    for (const skillId of p2SkillIds) {
      const skill = registry.get(skillId);
      expect(skill).toMatchObject({
        id: skillId,
        toolPlanFactory: expect.any(Function),
        outputContract: expect.objectContaining({ evidenceRequired: true }),
        evalCases: expect.arrayContaining([expect.objectContaining({ expectedTool: expect.any(String) })]),
      });
    }
  });

  it('matches card and member asset questions to the card diagnosis skill', () => {
    const cardPlan = registry.match(
      {
        domain: 'card',
        taskType: 'forecast',
        objective: '未来30天哪些次卡快到期',
        entities: [{ type: 'card', value: 'card', confidence: 0.72 }],
        metrics: ['card_expiry_risk'],
        filters: {},
        timeRange: { preset: 'next_30_days', label: '未来30天' },
        outputMode: 'card',
        outputIntent: 'show_table',
        riskLevel: 'low',
        requiresApproval: false,
        missingSlots: [],
        confidence: 0.88,
        actorRole: 'manager',
      },
      'manager',
    );
    const memberPlan = registry.match(
      {
        domain: 'memberCard',
        taskType: 'query',
        objective: '会员卡余额怎么样',
        entities: [{ type: 'memberCard', value: 'memberCard', confidence: 0.72 }],
        metrics: ['member_balance'],
        filters: {},
        timeRange: { preset: 'last_30_days', label: '近30天' },
        outputMode: 'card',
        outputIntent: 'show_kpi',
        riskLevel: 'low',
        requiresApproval: false,
        missingSlots: [],
        confidence: 0.88,
        actorRole: 'manager',
      },
      'manager',
    );

    expect(cardPlan).toMatchObject({
      skillId: 'card.member.asset',
      capabilityId: 'card_member_business_diagnosis',
      toolPlan: [{ tool: 'card.diagnose', args: expect.objectContaining({ timeRange: 'next_30_days' }) }],
      outputContract: expect.objectContaining({ requiredKinds: ['table', 'evidence'] }),
    });
    expect(memberPlan).toMatchObject({
      skillId: 'card.member.asset',
      capabilityId: 'card_member_business_diagnosis',
      toolPlan: [{ tool: 'card.diagnose', args: expect.objectContaining({ timeRange: 'last_30_days' }) }],
    });
  });

  it('matches service, automation, store comparison, and terminal P2 questions', () => {
    const cases = [
      {
        task: {
          domain: 'serviceQuality' as const,
          taskType: 'query' as const,
          objective: '服务记录完整性怎么样',
          metrics: ['service_completion_rate'],
          timeRange: { preset: 'last_30_days' as const, label: '近30天' },
        },
        expected: { skillId: 'service.quality.record', tool: 'service.quality.diagnose' },
      },
      {
        task: {
          domain: 'automation' as const,
          taskType: 'diagnosis' as const,
          objective: '自动化提醒执行怎么样',
          metrics: ['automation_touch_success_rate'],
          timeRange: { preset: 'last_30_days' as const, label: '近30天' },
        },
        expected: { skillId: 'automation.event.trigger', tool: 'automation.execution.diagnose' },
      },
      {
        task: {
          domain: 'store' as const,
          taskType: 'ranking' as const,
          objective: '各门店本月经营对比',
          metrics: ['store_rank_score'],
          timeRange: { preset: 'this_month' as const, label: '本月' },
        },
        expected: { skillId: 'store.comparison.benchmark', tool: 'store.comparison.diagnose' },
      },
      {
        task: {
          domain: 'terminal' as const,
          taskType: 'diagnosis' as const,
          objective: '终端设备今天有没有异常',
          metrics: ['terminal_failure_rate'],
          timeRange: { preset: 'today' as const, label: '今天' },
        },
        expected: { skillId: 'terminal.health.ops', tool: 'terminal.health.diagnose' },
      },
    ];

    for (const item of cases) {
      const plan = registry.match(
        {
          ...item.task,
          entities: [{ type: item.task.domain, value: item.task.domain, confidence: 0.72 }],
          filters: {},
          outputMode: 'card',
          outputIntent: 'show_table',
          riskLevel: 'low',
          requiresApproval: false,
          missingSlots: [],
          confidence: 0.88,
          actorRole: 'manager',
        },
        'manager',
      );

      expect(plan).toMatchObject({
        skillId: item.expected.skillId,
        toolPlan: [{ tool: item.expected.tool }],
        outputContract: expect.objectContaining({ evidenceRequired: true }),
      });
    }
  });
});
