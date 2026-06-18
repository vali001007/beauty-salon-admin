import { AgentPlannerService } from './agent-planner.service.js';
import { BusinessTaskCompilerService } from './business-task/business-task-compiler.service.js';
import { BusinessTaskPreParserService } from './business-task/business-task-preparser.service.js';
import { CapabilityRegistryService } from './capabilities/capability-registry.service.js';
import { SemanticMetricRegistryService } from '../semantic-data/semantic-metric-registry.service.js';
import { SemanticSqlDecisionService } from '../semantic-sql/semantic-sql-decision.service.js';

describe('AgentPlannerService', () => {
  const toolRegistry = {
    list: jest.fn(() => [
      { name: 'customer.priority.rank', description: '推荐优先跟进客户' },
      { name: 'business.query.ask', description: '执行受控经营问数' },
      { name: 'marketing.opportunity.discover', description: '发现营销机会' },
      { name: 'marketing.activity.draft', description: '生成活动草稿' },
      { name: 'revenue.diagnose', description: '诊断收入变化' },
      { name: 'product.sales.rank', description: '查询商品销量排行' },
      { name: 'inventory.risk.rank', description: '查询库存风险排行' },
      { name: 'customer.followup.task.draft', description: '生成客户跟进任务草稿' },
      { name: 'inventory.replenishment.draft', description: '生成补货采购草稿' },
      { name: 'service.record.draft', description: '生成服务记录草稿' },
      { name: 'scheduling.optimization.preview', description: '生成智能排班优化预览' },
      { name: 'schedule.diagnose', description: '诊断预约排班' },
      { name: 'project.diagnose', description: '诊断项目经营' },
      { name: 'card.diagnose', description: '诊断卡项/会员卡经营' },
      { name: 'finance.margin.diagnose', description: '诊断财务毛利' },
    ]),
  } as any;
  const compiler = new BusinessTaskCompilerService(
    new BusinessTaskPreParserService(),
    new CapabilityRegistryService(),
    new SemanticMetricRegistryService(),
    new SemanticSqlDecisionService(),
  );
  const planner = new AgentPlannerService(toolRegistry, compiler);
  const actor = { storeId: 1, userId: 7, role: 'manager' as const, entrypoint: 'test' };

  it('plans random product activity questions into marketing opportunity discovery', async () => {
    const cases = [
      '有哪些商品适合做活动',
      '最近哪些产品可以推一下',
      '库存里有没有适合清一清的商品',
      '有什么东西适合搞会员权益',
    ];

    for (const message of cases) {
      const plan = await planner.plan({ message, actor });

      expect(plan.clarificationNeeded).toBe(false);
      expect(plan.intentType).toBe('analysis_and_recommendation');
      expect(plan.toolPlan[0]).toMatchObject({
        tool: 'marketing.opportunity.discover',
        args: expect.objectContaining({ targetType: 'product' }),
      });
    }
  });

  it('plans revenue questions into revenue diagnosis tool', async () => {
    const plan = await planner.plan({ message: '今天收入怎么样', actor });

    expect(plan.intentType).toBe('analysis_and_recommendation');
    expect(plan.capabilityPlan).toMatchObject({
      capabilityId: 'revenue_diagnosis',
    });
    expect(plan.businessTask).toMatchObject({
      domain: 'business',
      taskType: 'query',
      metrics: ['revenue'],
    });
    expect(plan.toolPlan[0]).toMatchObject({
      tool: 'revenue.diagnose',
      args: expect.objectContaining({ question: '今天收入怎么样', timeRange: 'today' }),
    });
  });

  it('plans inventory risk questions into inventory risk ranking tool', async () => {
    const plan = await planner.plan({ message: '哪些商品库存不足', actor });

    expect(plan.intentType).toBe('analysis_and_recommendation');
    expect(plan.capabilityPlan).toMatchObject({
      capabilityId: 'inventory_risk_ranking',
    });
    expect(plan.businessTask).toMatchObject({
      domain: 'inventory',
      taskType: 'query',
      metrics: ['stock_risk_score'],
    });
    expect(plan.toolPlan[0]).toMatchObject({
      tool: 'inventory.risk.rank',
      args: expect.objectContaining({ question: '哪些商品库存不足' }),
    });
  });

  it('plans card and member balance questions into card member diagnosis tool', async () => {
    const balancePlan = await planner.plan({ message: '会员卡余额怎么样', actor });
    const cardPlan = await planner.plan({ message: '未来30天哪些次卡快到期', actor });

    expect(balancePlan.intentType).toBe('analysis_and_recommendation');
    expect(balancePlan.capabilityPlan).toMatchObject({
      capabilityId: 'card_member_business_diagnosis',
    });
    expect(balancePlan.businessTask).toMatchObject({
      domain: 'memberCard',
      taskType: 'query',
      metrics: ['member_balance'],
    });
    expect(balancePlan.toolPlan[0]).toMatchObject({
      tool: 'card.diagnose',
      args: expect.objectContaining({ question: '会员卡余额怎么样' }),
    });
    expect(cardPlan.capabilityPlan).toMatchObject({
      capabilityId: 'card_member_business_diagnosis',
    });
    expect(cardPlan.businessTask).toMatchObject({
      domain: 'card',
      metrics: ['card_expiry_risk'],
    });
    expect(cardPlan.toolPlan[0]).toMatchObject({
      tool: 'card.diagnose',
      args: expect.objectContaining({ question: '未来30天哪些次卡快到期' }),
    });
  });

  it('plans product sales growth questions into product sales ranking tool', async () => {
    const plan = await planner.plan({ message: '近30天销量增长最快的10个商品', actor });

    expect(plan.intentType).toBe('analysis_and_recommendation');
    expect(plan.capabilityPlan).toMatchObject({
      capabilityId: 'product_sales_ranking',
    });
    expect(plan.businessTask).toMatchObject({
      domain: 'product',
      taskType: 'ranking',
      limit: 10,
      metrics: ['product_sales_growth'],
    });
    expect(plan.semanticSqlCandidate).toMatchObject({
      fallbackCapability: 'product_sales_ranking',
    });
    expect(plan.toolPlan[0]).toMatchObject({
      tool: 'product.sales.rank',
      args: expect.objectContaining({ limit: 10, timeRange: 'last_30_days' }),
    });
  });

  it('plans scheduling status questions into reservation schedule diagnosis tool', async () => {
    const plan = await planner.plan({ message: '今天哪些美容师空闲', actor });

    expect(plan.intentType).toBe('analysis_and_recommendation');
    expect(plan.capabilityPlan).toMatchObject({
      capabilityId: 'reservation_schedule_diagnosis',
    });
    expect(plan.businessTask).toMatchObject({
      domain: 'schedule',
      taskType: 'query',
    });
    expect((plan.businessTask as any).metrics).toEqual(expect.arrayContaining(['schedule_utilization_rate']));
    expect(plan.toolPlan[0]).toMatchObject({
      tool: 'schedule.diagnose',
      args: expect.objectContaining({ question: '今天哪些美容师空闲', timeRange: 'today' }),
    });
  });

  it('plans project margin questions into project business diagnosis tool', async () => {
    const plan = await planner.plan({ message: '项目耗材毛利怎么样', actor });

    expect(plan.intentType).toBe('analysis_and_recommendation');
    expect(plan.capabilityPlan).toMatchObject({
      capabilityId: 'project_business_diagnosis',
    });
    expect(plan.businessTask).toMatchObject({
      domain: 'project',
      taskType: 'query',
      metrics: expect.arrayContaining(['gross_margin']),
    });
    expect(plan.toolPlan[0]).toMatchObject({
      tool: 'project.diagnose',
      args: expect.objectContaining({ question: '项目耗材毛利怎么样' }),
    });
  });

  it('plans finance margin questions into finance margin diagnosis tool', async () => {
    const plan = await planner.plan({ message: '近30天毛利怎么样', actor });

    expect(plan.intentType).toBe('analysis_and_recommendation');
    expect(plan.capabilityPlan).toMatchObject({
      capabilityId: 'finance_margin_diagnosis',
    });
    expect(plan.businessTask).toMatchObject({
      domain: 'finance',
      taskType: 'query',
      metrics: ['gross_margin'],
    });
    expect(plan.toolPlan[0]).toMatchObject({
      tool: 'finance.margin.diagnose',
      args: expect.objectContaining({ question: '近30天毛利怎么样' }),
    });
  });

  it('plans customer priority recommendation through BusinessTask instead of customer lookup', async () => {
    const plan = await planner.plan({ message: '今天最值得跟进的10个客户', actor });

    expect(plan.intentType).toBe('analysis_and_recommendation');
    expect(plan.clarificationNeeded).toBe(false);
    expect(plan.capabilityPlan).toMatchObject({
      capabilityId: 'customer_priority_recommendation',
    });
    expect(plan.businessTask).toMatchObject({
      domain: 'customer',
      taskType: 'recommendation',
      limit: 10,
      outputMode: 'ranked_list',
      metrics: ['follow_up_priority_score'],
    });
    expect(plan.semanticSqlCandidate).toMatchObject({
      allowed: false,
      fallbackCapability: 'customer_priority_recommendation',
    });
    expect(plan.toolPlan[0]).toMatchObject({
      tool: 'customer.priority.rank',
      args: expect.objectContaining({ limit: 10, timeRange: 'today' }),
    });
  });

  it('keeps spoken callback limit in the customer priority tool args', async () => {
    const plan = await planner.plan({ message: '今天优先回访5个老客', actor });

    expect(plan.toolPlan[0]).toMatchObject({
      tool: 'customer.priority.rank',
      args: expect.objectContaining({ limit: 5 }),
    });
  });

  it('plans next week customer focus questions into priority ranking with next week slot', async () => {
    const plan = await planner.plan({ message: '下周重点关注哪些客户', actor });

    expect(plan.clarificationNeeded).toBe(false);
    expect(plan.capabilityPlan).toMatchObject({
      capabilityId: 'customer_priority_recommendation',
    });
    expect(plan.toolPlan[0]).toMatchObject({
      tool: 'customer.priority.rank',
      args: expect.objectContaining({ timeRange: 'next_week', limit: 10 }),
    });
  });

  it('requires context before creating marketing drafts', async () => {
    const plan = await planner.plan({ message: '帮我生成活动草稿', actor });

    expect(plan.clarificationNeeded).toBe(true);
    expect(plan.toolPlan).toEqual([]);
    expect(plan.clarificationQuestion).toContain('先说明');
  });

  it('plans customer follow-up task requests into the follow-up draft tool', async () => {
    const plan = await planner.plan({ message: '帮我生成流失客户跟进任务', actor });

    expect(plan.intentType).toBe('draft');
    expect(plan.clarificationNeeded).toBe(false);
    expect(plan.toolPlan[0]).toMatchObject({
      tool: 'customer.followup.task.draft',
      args: expect.objectContaining({ target: 'churn', channel: 'phone' }),
    });
  });

  it('plans inventory replenishment draft requests into the replenishment draft tool', async () => {
    const plan = await planner.plan({ message: '根据低库存生成补货采购草稿', actor });

    expect(plan.intentType).toBe('draft');
    expect(plan.clarificationNeeded).toBe(false);
    expect(plan.toolPlan[0]).toMatchObject({
      tool: 'inventory.replenishment.draft',
      args: expect.objectContaining({ question: '根据低库存生成补货采购草稿' }),
    });
  });

  it('plans service record draft requests into the service record draft tool', async () => {
    const plan = await planner.plan({ message: '帮我生成服务记录草稿', actor: { ...actor, role: 'beautician' } });

    expect(plan.intentType).toBe('draft');
    expect(plan.clarificationNeeded).toBe(false);
    expect(plan.toolPlan[0]).toMatchObject({
      tool: 'service.record.draft',
      args: expect.objectContaining({ question: '帮我生成服务记录草稿' }),
    });
  });

  it('plans scheduling optimization requests into preview tool', async () => {
    const plan = await planner.plan({ message: '优化下周排班', actor });

    expect(plan.intentType).toBe('analysis_and_recommendation');
    expect(plan.clarificationNeeded).toBe(false);
    expect(plan.toolPlan[0]).toMatchObject({
      tool: 'scheduling.optimization.preview',
      args: expect.objectContaining({ weekStart: 'next_week', mode: 'copy_last_week_optimize' }),
    });
  });

  it('blocks direct high-risk execution requests', async () => {
    const plan = await planner.plan({ message: '发布活动并群发给所有客户', actor });

    expect(plan.intentType).toBe('clarify');
    expect(plan.clarificationNeeded).toBe(true);
    expect(plan.toolPlan).toEqual([]);
    expect(plan.clarificationQuestion).toContain('不能直接执行');
  });
});
