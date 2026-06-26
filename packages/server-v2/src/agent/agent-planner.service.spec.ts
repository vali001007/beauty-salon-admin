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
      { name: 'manager.daily.briefing', description: '生成门店今日经营简报' },
      { name: 'reception.customer.lookup', description: '查询前台客户资料' },
      { name: 'reception.reservation.today', description: '查询今日预约与待确认预约' },
      { name: 'reception.card.benefit.summary', description: '查询客户卡项与权益概况' },
      { name: 'marketing.customer.segment.discover', description: '发现适合营销召回的客户分群' },
      { name: 'promotion.offer.match', description: '匹配适合的营销权益与优惠方案' },
      { name: 'marketing.copy.generate', description: '生成营销文案与触达话术' },
      { name: 'marketing.effect.diagnose', description: '诊断营销活动效果' },
      { name: 'revenue.diagnose', description: '诊断收入变化' },
      { name: 'finance.revenue.summary', description: '汇总财务收入' },
      { name: 'finance.profit.diagnose', description: '诊断利润变化' },
      { name: 'finance.margin.risk.rank', description: '查询毛利风险排行' },
      { name: 'finance.refund.discount.audit', description: '审计退款折扣风险' },
      { name: 'finance.beautician.performance.audit', description: '审计美容师绩效风险' },
      { name: 'finance.report.draft', description: '生成财务报告草稿' },
      { name: 'product.sales.rank', description: '查询商品销量排行' },
      { name: 'inventory.risk.rank', description: '查询库存风险排行' },
      { name: 'customer.followup.task.draft', description: '生成客户跟进任务草稿' },
      { name: 'inventory.replenishment.draft', description: '生成补货采购草稿' },
      { name: 'inventory.consumption.trend', description: '分析库存消耗趋势' },
      { name: 'inventory.project.bom.risk', description: '诊断项目耗材 BOM 风险' },
      { name: 'inventory.expiring.clearance.draft', description: '生成临期库存处理草稿' },
      { name: 'supplier.purchase.link', description: '查询供应商采购链接' },
      { name: 'service.record.draft', description: '生成服务记录草稿' },
      { name: 'beautician.today.service.list', description: '查询美容师今日服务客户' },
      { name: 'beautician.customer.care.brief', description: '生成美容师客户护理摘要' },
      { name: 'beautician.performance.progress', description: '查询美容师本月业绩进度' },
      { name: 'beautician.repurchase.opportunity', description: '推荐美容师复购续卡机会' },
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

  it('plans finance revenue summary questions into finance revenue summary tool', async () => {
    const plan = await planner.plan({ message: '本月收入汇总和实收情况', actor });

    expect(plan).toMatchObject({
      intentType: 'analysis_and_recommendation',
      clarificationNeeded: false,
      capabilityPlan: {
        capabilityId: 'finance_revenue_summary',
      },
    });
    expect(plan.toolPlan[0]).toMatchObject({
      tool: 'finance.revenue.summary',
      args: expect.objectContaining({ question: '本月收入汇总和实收情况' }),
    });
  });

  it('plans manager daily briefing requests into manager briefing tool', async () => {
    const plan = await planner.plan({ message: '今天门店重点关注什么', actor });

    expect(plan.intentType).toBe('analysis_and_recommendation');
    expect(plan.capabilityPlan).toMatchObject({
      capabilityId: 'manager_daily_briefing',
    });
    expect(plan.toolPlan[0]).toMatchObject({
      tool: 'manager.daily.briefing',
      args: expect.objectContaining({ timeRange: 'today' }),
    });
  });

  it('plans reception customer lookup requests into reception customer lookup tool', async () => {
    const plan = await planner.plan({ message: '查客户张三', actor: { ...actor, role: 'reception' } });

    expect(plan.intentType).toBe('query');
    expect(plan.capabilityPlan).toMatchObject({
      capabilityId: 'reception_customer_lookup',
    });
    expect(plan.toolPlan[0]).toMatchObject({
      tool: 'reception.customer.lookup',
      args: expect.objectContaining({ query: expect.stringContaining('张三') }),
    });
  });

  it('plans today reservation questions into reception reservation tool', async () => {
    const plan = await planner.plan({ message: '今天有哪些预约待确认', actor: { ...actor, role: 'reception' } });

    expect(plan.intentType).toBe('query');
    expect(plan.capabilityPlan).toMatchObject({
      capabilityId: 'reception_reservation_today',
    });
    expect(plan.toolPlan[0]).toMatchObject({
      tool: 'reception.reservation.today',
      args: expect.objectContaining({ timeRange: 'today' }),
    });
  });

  it('plans card benefit summary requests into reception card benefit tool', async () => {
    const plan = await planner.plan({ message: '张三还有什么卡项权益', actor: { ...actor, role: 'reception' } });

    expect(plan.intentType).toBe('query');
    expect(plan.capabilityPlan).toMatchObject({
      capabilityId: 'reception_card_benefit_summary',
    });
    expect(plan.toolPlan[0]).toMatchObject({
      tool: 'reception.card.benefit.summary',
      args: expect.objectContaining({ customerQuery: expect.stringContaining('张三') }),
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

  it('plans finance profit diagnosis questions into profit diagnosis tool', async () => {
    const plan = await planner.plan({ message: '本月利润为什么下降，成本影响多大', actor });

    expect(plan).toMatchObject({
      intentType: 'analysis_and_recommendation',
      clarificationNeeded: false,
      capabilityPlan: {
        capabilityId: 'finance_profit_diagnosis',
      },
    });
    expect(plan.toolPlan[0]).toMatchObject({
      tool: 'finance.profit.diagnose',
      args: expect.objectContaining({ question: '本月利润为什么下降，成本影响多大' }),
    });
  });

  it('plans margin risk ranking questions into margin risk rank tool', async () => {
    const plan = await planner.plan({ message: '哪些项目和商品毛利风险最高，列前10', actor });

    expect(plan).toMatchObject({
      intentType: 'analysis_and_recommendation',
      clarificationNeeded: false,
      capabilityPlan: {
        capabilityId: 'finance_margin_risk_rank',
      },
    });
    expect(plan.toolPlan[0]).toMatchObject({
      tool: 'finance.margin.risk.rank',
      args: expect.objectContaining({ question: '哪些项目和商品毛利风险最高，列前10', limit: 10 }),
    });
  });

  it('plans refund and discount audit questions into finance audit tool', async () => {
    const plan = await planner.plan({ message: '本月退款和手工优惠有没有财务审计风险', actor });

    expect(plan).toMatchObject({
      intentType: 'analysis_and_recommendation',
      clarificationNeeded: false,
      capabilityPlan: {
        capabilityId: 'finance_refund_discount_audit',
      },
    });
    expect(plan.toolPlan[0]).toMatchObject({
      tool: 'finance.refund.discount.audit',
      args: expect.objectContaining({ question: '本月退款和手工优惠有没有财务审计风险' }),
    });
  });

  it('plans beautician performance audit questions into finance staff audit tool', async () => {
    const plan = await planner.plan({ message: '检查美容师提成和服务记录有没有绩效审计异常', actor });

    expect(plan).toMatchObject({
      intentType: 'analysis_and_recommendation',
      clarificationNeeded: false,
      capabilityPlan: {
        capabilityId: 'finance_beautician_performance_audit',
      },
    });
    expect(plan.toolPlan[0]).toMatchObject({
      tool: 'finance.beautician.performance.audit',
      args: expect.objectContaining({ question: '检查美容师提成和服务记录有没有绩效审计异常' }),
    });
  });

  it('plans finance report draft questions into report draft tool', async () => {
    const plan = await planner.plan({ message: '帮我生成本月财务报告草稿', actor });

    expect(plan).toMatchObject({
      intentType: 'analysis_and_recommendation',
      clarificationNeeded: false,
      capabilityPlan: {
        capabilityId: 'finance_report_draft',
      },
    });
    expect(plan.toolPlan[0]).toMatchObject({
      tool: 'finance.report.draft',
      args: expect.objectContaining({ question: '帮我生成本月财务报告草稿', timeRange: 'this_month' }),
    });
  });

  it('plans inventory consumption trend requests into consumption trend tool', async () => {
    const plan = await planner.plan({ message: '近30天哪些耗材消耗最快', actor });

    expect(plan.intentType).toBe('analysis_and_recommendation');
    expect(plan.capabilityPlan).toMatchObject({ capabilityId: 'inventory_consumption_trend' });
    expect(plan.toolPlan[0]).toMatchObject({
      tool: 'inventory.consumption.trend',
      args: expect.objectContaining({ timeRange: 'last_30_days', limit: 10 }),
    });
  });

  it('plans project BOM risk requests into BOM risk tool', async () => {
    const plan = await planner.plan({ message: '项目耗材 BOM 风险怎么样', actor });

    expect(plan.intentType).toBe('analysis_and_recommendation');
    expect(plan.capabilityPlan).toMatchObject({ capabilityId: 'inventory_project_bom_risk' });
    expect(plan.toolPlan[0]).toMatchObject({
      tool: 'inventory.project.bom.risk',
    });
  });

  it('plans expiring inventory clearance requests into clearance draft tool', async () => {
    const plan = await planner.plan({ message: '临期库存怎么处理，生成草稿建议', actor });

    expect(plan.intentType).toBe('analysis_and_recommendation');
    expect(plan.capabilityPlan).toMatchObject({ capabilityId: 'inventory_expiring_clearance_draft' });
    expect(plan.toolPlan[0]).toMatchObject({
      tool: 'inventory.expiring.clearance.draft',
      args: expect.objectContaining({ horizonDays: 90 }),
    });
  });

  it('plans supplier purchase link requests into supplier link tool', async () => {
    const plan = await planner.plan({ message: '低库存商品从哪个供应商采购，供货价和交期是多少', actor });

    expect(plan.intentType).toBe('analysis_and_recommendation');
    expect(plan.capabilityPlan).toMatchObject({ capabilityId: 'supplier_purchase_link' });
    expect(plan.toolPlan[0]).toMatchObject({
      tool: 'supplier.purchase.link',
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

  it('plans beautician today customer questions into today service list tool', async () => {
    const plan = await planner.plan({ message: '我今天有哪些客户', actor: { ...actor, role: 'beautician' } });

    expect(plan.intentType).toBe('query');
    expect(plan.capabilityPlan).toMatchObject({
      capabilityId: 'beautician_today_service_list',
    });
    expect(plan.toolPlan[0]).toMatchObject({
      tool: 'beautician.today.service.list',
      args: expect.objectContaining({ timeRange: 'today', limit: 10 }),
    });
  });

  it('plans next customer care questions into beautician care brief tool', async () => {
    const plan = await planner.plan({ message: '下一个客户要注意什么', actor: { ...actor, role: 'beautician' } });

    expect(plan.intentType).toBe('analysis_and_recommendation');
    expect(plan.capabilityPlan).toMatchObject({
      capabilityId: 'beautician_customer_care_brief',
    });
    expect(plan.toolPlan[0]).toMatchObject({
      tool: 'beautician.customer.care.brief',
    });
  });

  it('plans beautician monthly performance progress without treating 30 days as a target', async () => {
    const plan = await planner.plan({ message: '近30天我的表现怎么样', actor: { ...actor, role: 'beautician' } });

    expect(plan.intentType).toBe('analysis_and_recommendation');
    expect(plan.capabilityPlan).toMatchObject({
      capabilityId: 'beautician_performance_progress',
    });
    expect(plan.toolPlan[0]).toMatchObject({
      tool: 'beautician.performance.progress',
      args: expect.objectContaining({ timeRange: 'this_month', targetAmount: undefined }),
    });
  });

  it('plans beautician repurchase questions into repurchase opportunity tool', async () => {
    const plan = await planner.plan({ message: '我的客户哪些适合复购或续卡', actor: { ...actor, role: 'beautician' } });

    expect(plan.intentType).toBe('analysis_and_recommendation');
    expect(plan.capabilityPlan).toMatchObject({
      capabilityId: 'beautician_repurchase_opportunity',
    });
    expect(plan.toolPlan[0]).toMatchObject({
      tool: 'beautician.repurchase.opportunity',
      args: expect.objectContaining({ timeRange: 'last_30_days', limit: 10 }),
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

  it('plans marketing segment discovery requests into segment discovery tool', async () => {
    const plan = await planner.plan({ message: '给60天没来的客户做召回', actor });

    expect(plan.intentType).toBe('analysis_and_recommendation');
    expect(plan.capabilityPlan).toMatchObject({
      capabilityId: 'marketing_customer_segment_discover',
    });
    expect(plan.toolPlan[0]).toMatchObject({
      tool: 'marketing.customer.segment.discover',
      args: expect.objectContaining({ segment: 'churn', dateRange: 'last_90_days' }),
    });
  });

  it('plans promotion offer match requests into offer match tool', async () => {
    const plan = await planner.plan({ message: '沉睡客户适合发什么优惠券', actor });

    expect(plan.intentType).toBe('analysis_and_recommendation');
    expect(plan.capabilityPlan).toMatchObject({
      capabilityId: 'promotion_offer_match',
    });
    expect(plan.toolPlan[0]).toMatchObject({
      tool: 'promotion.offer.match',
      args: expect.objectContaining({ segment: 'churn', offerHint: 'coupon' }),
    });
  });

  it('plans marketing copy generation requests into copy generation tool', async () => {
    const plan = await planner.plan({ message: '帮我生成沉睡客户召回短信话术', actor });

    expect(plan.intentType).toBe('draft');
    expect(plan.capabilityPlan).toMatchObject({
      capabilityId: 'marketing_copy_generate',
    });
    expect(plan.toolPlan[0]).toMatchObject({
      tool: 'marketing.copy.generate',
      args: expect.objectContaining({ segment: 'churn' }),
    });
  });

  it('plans marketing effect diagnosis requests into effect diagnosis tool', async () => {
    const plan = await planner.plan({ message: '上次营销活动转化效果怎么样', actor });

    expect(plan.intentType).toBe('analysis_and_recommendation');
    expect(plan.capabilityPlan).toMatchObject({
      capabilityId: 'marketing_effect_diagnosis',
    });
    expect(plan.toolPlan[0]).toMatchObject({
      tool: 'marketing.effect.diagnose',
      args: expect.objectContaining({ dateRange: 'last_30_days' }),
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
