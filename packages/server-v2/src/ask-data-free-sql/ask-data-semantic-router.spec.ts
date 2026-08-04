import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ASK_DATA_FREE_SQL_VIEWS } from './ask-data-free-sql.catalog.js';
import { AskDataClarificationPolicy } from './ask-data-clarification-policy.js';
import { AskDataIntentParser } from './ask-data-intent-parser.js';
import {
  ASK_DATA_SEMANTIC_CONTRACTS,
  validateAskDataSemanticContracts,
} from './ask-data-semantic-contracts.js';
import { AskDataSemanticRouter, askDataSemanticRouterConfig } from './ask-data-semantic-router.js';
import { authorizedAskDataViews } from './ask-data-free-sql-view-selector.js';

const adminContext = {
  userId: 9,
  storeId: 6,
  permissions: ['*'],
  deniedPermissions: [],
};

describe('Ami Ask independent semantic router', () => {
  const parser = new AskDataIntentParser();
  const policy = new AskDataClarificationPolicy();

  it('defines valid metrics that cover every registered Ask view', () => {
    const knownViews = ASK_DATA_FREE_SQL_VIEWS.map((view) => view.viewName);
    expect(ASK_DATA_SEMANTIC_CONTRACTS.length).toBeGreaterThanOrEqual(34);
    expect(new Set(ASK_DATA_SEMANTIC_CONTRACTS.map((item) => item.metricKey)).size).toBe(ASK_DATA_SEMANTIC_CONTRACTS.length);
    expect(new Set(ASK_DATA_SEMANTIC_CONTRACTS.map((item) => item.preferredView))).toEqual(new Set(knownViews));
    expect(validateAskDataSemanticContracts(knownViews)).toEqual([]);
  });

  it.each([
    ['最近三个月产品订单有多少', 'product_sales', 'scalar'],
    ['最近30天哪个项目最受欢迎', 'project_sales', 'ranking'],
    ['最近14天的实收流水', 'payment_flow', 'list'],
    ['今天现金、微信、支付宝各收了多少', 'payment_flow', 'comparison'],
    ['今天现金收了多少，微信支付宝各多少', 'payment_flow', 'comparison'],
    ['本月微信、支付宝分别收款多少', 'payment_flow', 'comparison'],
    ['各供应商采购金额排行', 'supplier_performance', 'ranking'],
    ['当前价格最高的项目有哪些', 'project_catalog', 'ranking'],
    ['最近三个月经营成本趋势', 'operating_cost', 'trend'],
    ['本月财务对账异常有哪些', 'reconciliation_issue', 'list'],
    ['帮我看一下这周的预约密度，哪里有空位', 'appointment_gap', 'list'],
    ['各渠道营销 ROI 对比', 'marketing_roi', 'comparison'],
    ['本月每日净收最高的是哪一天，金额是多少', 'daily_net_receipts', 'ranking'],
    ['帮我找一下45天没来的客户，大概有多少人', 'customer_profile', 'scalar'],
    ['帮我找下这个月快过生日的客户', 'customer_profile', 'list'],
    ['这个月新客主要来自什么渠道', 'customer_profile', 'ranking'],
    ['哪些客户买了次卡但最近一直不来用', 'customer_profile', 'list'],
    ['哪些客户卡里的次数快用完了还没约', 'customer_profile', 'list'],
    ['今年产品动销分析', 'product_sales', 'scalar'],
    ['烟酰胺亮肤精华最近30天的消耗趋势', 'inventory_movement', 'trend'],
    ['今年预约水氧清洁焕肤的客户有哪些', 'reservation_metrics', 'list'],
    ['帮我查一下明天的预约情况', 'reservation_metrics', 'scalar'],
    ['今年哪些活动在亏钱', 'marketing_roi', 'list'],
    ['BOM理论消耗和屏障安瓶精华实际出库差得多吗', 'bom_variance', 'scalar'],
    ['最近三个月实际耗材偏差率的变化趋势', 'bom_variance', 'trend'],
    ['库存的周转率怎么样', 'inventory_operational_turnover', 'scalar'],
    ['哪些产品的周转率最低', 'inventory_operational_turnover', 'ranking'],
    ['服务用的一次性耗材还够用多久', 'inventory_days_of_stock', 'scalar'],
    ['有什么产品积压太久了', 'inventory_slow_moving', 'list'],
    ['哪些产品一直有但90天没出库', 'inventory_slow_moving', 'list'],
    ['有没有最近需求突然增加的产品', 'inventory_demand_change', 'list'],
    ['最近 30 天需求比前 30 天增长超过 50% 的产品有哪些', 'inventory_demand_change', 'list'],
    ['有没有产品快断货但还没采购的', 'inventory_procurement_coverage', 'list'],
    ['帮我统计一下这季度每个产品的用量', 'inventory_outbound_usage', 'list'],
    ['这个月每日平均耗材费用是多少', 'inventory_outbound_cost_estimate', 'scalar'],
    ['帮我看一下每个供应商当前报价', 'supplier_latest_quote', 'list'],
    ['帮我比较两个供应商的价格', 'supplier_price_comparison', 'comparison'],
    ['各品类的最低采购量要求是什么', 'supplier_minimum_order_quantity', 'list'],
    ['我们和供应商的账期是怎么约定的', 'supplier_payment_terms', 'list'],
    ['哪些供应商报价交期最短', 'supplier_lead_time', 'ranking'],
    ['哪些产品毛利率最高', 'item_contribution_margin', 'ranking'],
    ['帮我看各项目毛利', 'item_contribution_margin', 'list'],
    ['哪个项目耗材成本最高', 'project_attributed_cost', 'ranking'],
    ['有没有产品卖价低于成本', 'below_cost_sale', 'list'],
    ['产品销售和服务项目毛利哪个高', 'item_contribution_margin', 'comparison'],
    ['本月次卡核销项目贡献毛利是多少', 'item_contribution_margin', 'scalar'],
    ['本月商品退款冲减了多少收入和成本', 'item_contribution_margin', 'scalar'],
  ])('maps governed wording to a unique metric: %s', (question, metricKey, answerShape) => {
    const parsed = parser.parse(question, new Date('2026-08-02T00:00:00.000Z'));
    expect(parsed.semanticIntent.metricKeys[0]).toBe(metricKey);
    expect(parsed.semanticIntent.answerShape).toBe(answerShape);
  });

  it.each([
    ['哪些产品毛利率最高', 'item_contribution_margin'],
    ['帮我看各项目毛利', 'item_contribution_margin'],
    ['哪个项目耗材成本最高', 'project_attributed_cost'],
    ['有没有产品卖价低于成本', 'below_cost_sale'],
    ['产品销售和服务项目毛利哪个高', 'item_contribution_margin'],
  ])('routes contribution-margin wording only to the Ask item margin view: %s', async (question, metricKey) => {
    const ai = { generateStructured: jest.fn() };
    const router = new AskDataSemanticRouter(ai as any, parser, policy);
    const result = await router.route({
      question,
      context: adminContext,
      authorizedViews: ASK_DATA_FREE_SQL_VIEWS,
      config: { enabled: true, shadow: false, modelFallback: false, minConfidence: 0.75 },
    });

    expect(result.semanticIntent.metricKeys).toEqual([metricKey]);
    expect(result.candidateViews.map((view) => view.viewName)).toEqual(['ask_data_item_margin_view']);
    expect(result.clarificationQuestion).toBeUndefined();
    expect(ai.generateStructured).not.toHaveBeenCalled();
  });

  it('requires a governed threshold or comparison baseline before declaring contribution margin abnormal', () => {
    const parsed = parser.parse('哪些项目毛利明显偏低', new Date('2026-08-04T00:00:00.000Z'));
    const decision = policy.inspect(parsed.semanticIntent);

    expect(parsed.semanticIntent.metricKeys).toEqual(['item_contribution_margin']);
    expect(parsed.semanticIntent.ambiguities).toEqual(expect.arrayContaining([
      expect.objectContaining({ slot: 'threshold' }),
    ]));
    expect(decision.required).toBe(true);
    expect(decision.question).toContain('贡献毛利率低于 20%');
    expect(decision.question).toContain('贡献毛利为负');
    expect(decision.question).toContain('低于上月');
  });

  it('routes inventory turnover only to the stock-authorized Ask view', async () => {
    const ai = { generateStructured: jest.fn() };
    const router = new AskDataSemanticRouter(ai as any, parser, policy);
    const inventoryContext = {
      ...adminContext,
      permissions: ['core:inventory:stock'],
    };
    const result = await router.route({
      question: '哪些产品的周转率最低',
      context: inventoryContext,
      authorizedViews: authorizedAskDataViews(inventoryContext),
      config: { enabled: true, shadow: false, modelFallback: true, minConfidence: 0.75 },
    });
    expect(result.permissionDenied).toBe(false);
    expect(result.semanticIntent.metricKeys).toEqual(['inventory_operational_turnover']);
    expect(result.candidateViews.map((view) => view.viewName)).toEqual(['ask_data_inventory_turnover_view']);
    expect(ai.generateStructured).not.toHaveBeenCalled();
  });

  it('keeps promotion issue and usage submetrics on the promotion view only', async () => {
    const ai = { generateStructured: jest.fn() };
    const router = new AskDataSemanticRouter(ai as any, parser, policy);
    const result = await router.route({
      question: '各优惠活动的发放数量和使用数量分别是多少',
      context: adminContext,
      authorizedViews: ASK_DATA_FREE_SQL_VIEWS,
      config: { enabled: true, shadow: false, modelFallback: false, minConfidence: 0.75 },
    });

    expect(result.semanticIntent.metricKeys).toEqual(['promotion_offer']);
    expect(result.candidateViews.map((view) => view.viewName)).toEqual(['agent_v3_promotion_offer_view']);
    expect(result.clarificationQuestion).toBeUndefined();
    expect(ai.generateStructured).not.toHaveBeenCalled();
  });

  it.each([
    ['哪些产品当前有库存但最近 90 天没有出库', 'inventory_slow_moving'],
    ['哪些产品一直有但90天没出库', 'inventory_slow_moving'],
    ['长期无出库的商品有哪些', 'inventory_slow_moving'],
    ['列出近 30 天运营周转率低于 0.5 的慢动销产品', 'inventory_slow_moving'],
    ['最近 30 天需求比前 30 天增长超过 50% 的产品有哪些', 'inventory_demand_change'],
    ['哪些产品最近 90 天有消耗但没有采购记录', 'inventory_procurement_coverage'],
    ['本季度每个产品累计出库用量是多少', 'inventory_outbound_usage'],
    ['本月每日平均耗材出库成本估算是多少', 'inventory_outbound_cost_estimate'],
  ])('keeps Coverage R2 contract wording on the inventory turnover view: %s', async (question, metricKey) => {
    const ai = { generateStructured: jest.fn() };
    const router = new AskDataSemanticRouter(ai as any, parser, policy);
    const result = await router.route({
      question,
      context: adminContext,
      authorizedViews: ASK_DATA_FREE_SQL_VIEWS,
      config: { enabled: true, shadow: false, modelFallback: false, minConfidence: 0.75 },
    });

    expect(result.semanticIntent.metricKeys).toEqual([metricKey]);
    expect(result.candidateViews.map((view) => view.viewName)).toEqual(['ask_data_inventory_turnover_view']);
    expect(result.clarificationQuestion).toBeUndefined();
    expect(ai.generateStructured).not.toHaveBeenCalled();
  });

  it.each([
    ['帮我看一下每个供应商当前报价', 'supplier_latest_quote'],
    ['帮我比较两个供应商的价格', 'supplier_price_comparison'],
    ['有没有哪个产品可以换个供应商降低成本', 'supplier_price_comparison'],
    ['各品类的最低采购量要求是什么', 'supplier_minimum_order_quantity'],
    ['我们和供应商的账期是怎么约定的', 'supplier_payment_terms'],
    ['哪些供应商报价交期最短', 'supplier_lead_time'],
  ])('routes supplier commercial wording only to the approved quote view: %s', async (question, metricKey) => {
    const ai = { generateStructured: jest.fn() };
    const router = new AskDataSemanticRouter(ai as any, parser, policy);
    const result = await router.route({
      question,
      context: adminContext,
      authorizedViews: ASK_DATA_FREE_SQL_VIEWS,
      config: { enabled: true, shadow: false, modelFallback: false, minConfidence: 0.75 },
    });

    expect(result.semanticIntent.metricKeys).toEqual([metricKey]);
    expect(result.candidateViews.map((view) => view.viewName)).toEqual(['ask_data_supplier_quote_terms_view']);
    expect(result.clarificationQuestion).toBeUndefined();
    expect(ai.generateStructured).not.toHaveBeenCalled();
  });

  it('keeps a supplier quote difference question on one governed comparison metric', async () => {
    const ai = { generateStructured: jest.fn() };
    const router = new AskDataSemanticRouter(ai as any, parser, policy);
    const result = await router.route({
      question: '哪些商品存在更低的供应商报价，差额是多少',
      context: adminContext,
      authorizedViews: ASK_DATA_FREE_SQL_VIEWS,
      config: { enabled: true, shadow: false, modelFallback: false, minConfidence: 0.75 },
    });

    expect(result.semanticIntent.metricKeys).toEqual(['supplier_price_comparison']);
    expect(result.candidateViews.map((view) => view.viewName)).toEqual(['ask_data_supplier_quote_terms_view']);
    expect(ai.generateStructured).not.toHaveBeenCalled();
  });

  it('requires a comparison baseline before calling one supplier the best value', () => {
    const parsed = parser.parse('我们常用的哪个供应商性价比最好', new Date('2026-08-04T00:00:00.000Z'));
    const decision = policy.inspect(parsed.semanticIntent);
    expect(decision.required).toBe(true);
    expect(decision.question).toContain('最低报价');
    expect(decision.question).toContain('预计交期');
  });

  it('denies inventory turnover when stock permission is absent', async () => {
    const ai = { generateStructured: jest.fn() };
    const router = new AskDataSemanticRouter(ai as any, parser, policy);
    const dashboardContext = {
      ...adminContext,
      permissions: ['core:dashboard:view'],
    };
    const result = await router.route({
      question: '哪些产品的周转率最低',
      context: dashboardContext,
      authorizedViews: authorizedAskDataViews(dashboardContext),
      config: { enabled: true, shadow: false, modelFallback: true, minConfidence: 0.75 },
    });
    expect(result.permissionDenied).toBe(true);
    expect(result.candidateViews).toEqual([]);
    expect(ai.generateStructured).not.toHaveBeenCalled();
  });

  it('keeps supplier summary questions on the supplier performance metric only', async () => {
    const parsed = parser.parse('比较各供应商的采购次数、采购金额和平均交付天数');
    expect(parsed.semanticIntent.metricKeys).toEqual(['supplier_performance']);

    const router = new AskDataSemanticRouter({ generateStructured: jest.fn() } as any, parser, policy);
    const result = await router.route({
      question: '比较各供应商的采购次数、采购金额和平均交付天数',
      context: adminContext,
      authorizedViews: ASK_DATA_FREE_SQL_VIEWS,
      config: { enabled: true, shadow: false, modelFallback: false, minConfidence: 0.75 },
    });
    expect(result.candidateViews.map((view) => view.viewName)).toEqual(['agent_v3_supplier_performance_view']);
  });

  it('keeps explicitly combined finance metrics as a comparison instead of forcing clarification', () => {
    const parsed = parser.parse('本月营业额与日结净收分别是多少');
    expect(parsed.semanticIntent.metricKeys).toEqual(expect.arrayContaining(['order_revenue', 'daily_net_receipts']));
    expect(parsed.semanticIntent.answerShape).toBe('comparison');
    expect(policy.inspect(parsed.semanticIntent).required).toBe(false);
  });

  it('does not treat a single metric grouped by operator as an explicit metric combination', async () => {
    const parsed = parser.parse('各操作人的库存报废金额分别是多少');
    expect(parsed.semanticIntent.answerShape).toBe('list');
    expect(parsed.semanticIntent.metricKeys).toEqual(['inventory_scrap']);

    const ai = { generateStructured: jest.fn() };
    const router = new AskDataSemanticRouter(ai as any, parser, policy);
    const result = await router.route({
      question: '各操作人的库存报废金额分别是多少',
      context: adminContext,
      authorizedViews: ASK_DATA_FREE_SQL_VIEWS,
      config: { enabled: true, shadow: false, modelFallback: true, minConfidence: 0.75 },
    });
    expect(result.semanticIntent.metricKeys).toEqual(['inventory_scrap']);
    expect(result.candidateViews.map((view) => view.viewName)).toEqual(['agent_v3_inventory_scrap_view']);
    expect(ai.generateStructured).not.toHaveBeenCalled();
  });

  it('applies governed defaults and exposes them as assumptions', () => {
    const recent = parser.parse('最近哪个项目最受欢迎', new Date('2026-08-02T00:00:00.000Z'));
    expect(recent.semanticIntent.timeRange?.label).toBe('近 30 天');
    expect(recent.semanticIntent.assumptions).toEqual(
      expect.arrayContaining(['“最近”按近 30 天查询。', '未指定排行数量，默认返回前 10 名。']),
    );
  });

  it.each([
    ['双十一的商品销量', 'year', '具体年份'],
    ['本月大额退款有哪些', 'threshold', '金额阈值'],
    ['今天客单价多少，跟平时比怎么样', 'comparison_baseline', '比较基线'],
    ['有美容师长期闲置产能浪费吗', 'threshold', '观察周期'],
    ['分析下最近7天所有活动的效果', 'comparison_relation', '比较的指标'],
    ['最近三个月退款率正常吗', 'threshold', '退款率判断阈值'],
    ['哪些产品最近14天即将过期且库存金额高', 'threshold', '金额阈值'],
    ['最近30天耗占比的趋势', 'comparison_relation', '分子和分母'],
    ['最近30天库存结构合理吗', 'comparison_baseline', '库存结构的判断基线'],
    ['最近7天自动化触达失败率高吗', 'threshold', '失败率阈值'],
    ['开业至今有异常成本支出吗', 'threshold', '成本异常标准'],
    ['春节所在月的成本是不是太高', 'year', '具体年份'],
    ['最近三个月采购结构分析', 'comparison_relation', '采购结构维度'],
    ['会员负债变化是否安全', 'comparison_baseline', '比较基线'],
  ])('preserves a material ambiguity: %s', (question, slot, expectedQuestionText) => {
    const parsed = parser.parse(question);
    expect(parsed.semanticIntent.ambiguities[0]?.slot).toBe(slot);
    const decision = policy.inspect(parsed.semanticIntent);
    expect(decision.required).toBe(true);
    expect(decision.question).toContain(expectedQuestionText);
  });

  it('keeps a plain metric trend query executable without inventing a comparison baseline', () => {
    const parsed = parser.parse('最近三天营业额趋势怎么样');
    expect(parsed.semanticIntent.ambiguities).toEqual([]);
  });

  it('asks for every material slot in one clarification turn', () => {
    const parsed = parser.parse('双十一期间退款率正常吗');
    expect(parsed.semanticIntent.ambiguities.map((ambiguity) => ambiguity.slot)).toEqual(['year', 'threshold']);
    const decision = policy.inspect(parsed.semanticIntent);
    expect(decision.required).toBe(true);
    expect(decision.question).toContain('具体年份');
    expect(decision.question).toContain('退款率判断阈值');
  });

  it('asks for both year and threshold for holiday automation failure risk', () => {
    const parsed = parser.parse('国庆期间自动化触达失败率高吗');
    expect(parsed.semanticIntent.ambiguities.map((ambiguity) => ambiguity.slot)).toEqual(['year', 'threshold']);
    const decision = policy.inspect(parsed.semanticIntent);
    expect(decision.question).toContain('具体年份');
    expect(decision.question).toContain('失败率阈值');
  });

  it('asks for both year and threshold when a holiday-month cost judgment lacks both', () => {
    const parsed = parser.parse('春节所在月的成本是不是太高');
    expect(parsed.semanticIntent.ambiguities.map((ambiguity) => ambiguity.slot)).toEqual(['year', 'threshold']);
    const decision = policy.inspect(parsed.semanticIntent);
    expect(decision.question).toContain('具体年份');
    expect(decision.question).toContain('成本异常标准');
  });

  it('keeps balance plus unused-card customer detail on both governed views', async () => {
    const question = '列出现金余额超过五百且还有未用次卡的客户';
    const ai = { generateStructured: jest.fn() };
    const router = new AskDataSemanticRouter(ai as any, parser, policy);
    const result = await router.route({
      question,
      context: adminContext,
      authorizedViews: ASK_DATA_FREE_SQL_VIEWS,
      config: { enabled: true, shadow: false, modelFallback: true, minConfidence: 0.75 },
    });
    expect(result.semanticIntent.metricKeys).toEqual(['customer_balance', 'card_assets']);
    expect(result.candidateViews.map((view) => view.viewName)).toEqual([
      'agent_v3_customer_balance_view',
      'agent_v3_card_asset_view',
    ]);
    expect(result.clarificationQuestion).toBeUndefined();
    expect(ai.generateStructured).not.toHaveBeenCalled();
  });

  it('uses the customer profile summary for dormant high-value high-risk customers', async () => {
    const question = '九十天没到店的高价值客户里，哪些现在是高流失风险';
    const ai = { generateStructured: jest.fn() };
    const router = new AskDataSemanticRouter(ai as any, parser, policy);
    const result = await router.route({
      question,
      context: adminContext,
      authorizedViews: ASK_DATA_FREE_SQL_VIEWS,
      config: { enabled: true, shadow: false, modelFallback: true, minConfidence: 0.75 },
    });
    expect(result.semanticIntent.metricKeys).toEqual(['customer_profile']);
    expect(result.candidateViews.map((view) => view.viewName)).toEqual(['ask_data_customer_profile_summary_view']);
    expect(ai.generateStructured).not.toHaveBeenCalled();
  });

  it('routes high-confidence questions deterministically to one governed view', async () => {
    const ai = { generateStructured: jest.fn() };
    const router = new AskDataSemanticRouter(ai as any, parser, policy);
    const result = await router.route({
      question: '最近30天哪个项目最受欢迎',
      context: adminContext,
      authorizedViews: ASK_DATA_FREE_SQL_VIEWS,
      config: { enabled: true, shadow: false, modelFallback: true, minConfidence: 0.75 },
    });
    expect(result.routeMode).toBe('deterministic');
    expect(result.candidateViews.map((view) => view.viewName)).toEqual(['agent_v3_project_service_sales_view']);
    expect(ai.generateStructured).not.toHaveBeenCalled();
  });

  it('freezes a clear reservation-count question as deterministic scalar routing', async () => {
    const ai = { generateStructured: jest.fn() };
    const router = new AskDataSemanticRouter(ai as any, parser, policy);
    const result = await router.route({
      question: '帮我查一下明天的预约情况',
      context: adminContext,
      authorizedViews: ASK_DATA_FREE_SQL_VIEWS,
      config: { enabled: true, shadow: false, modelFallback: true, minConfidence: 0.75 },
    });

    expect(result.routeMode).toBe('deterministic');
    expect(result.semanticIntent.metricKeys).toEqual(['reservation_metrics']);
    expect(result.semanticIntent.answerShape).toBe('scalar');
    expect(result.candidateViews.map((view) => view.viewName)).toEqual(['agent_v3_reservation_view']);
    expect(ai.generateStructured).not.toHaveBeenCalled();
  });

  it('returns permission denied before model routing when the governed target view is unauthorized', async () => {
    const ai = { generateStructured: jest.fn() };
    const router = new AskDataSemanticRouter(ai as any, parser, policy);
    const context = {
      ...adminContext,
      permissions: ['core:store:scheduling'],
    };
    const result = await router.route({
      question: '本月营业额是多少',
      context,
      authorizedViews: authorizedAskDataViews(context),
      config: { enabled: true, shadow: false, modelFallback: true, minConfidence: 0.75 },
    });
    expect(result.permissionDenied).toBe(true);
    expect(result.candidateViews).toEqual([]);
    expect(ai.generateStructured).not.toHaveBeenCalled();
  });

  it('treats the common 营业利润 wording as an unauthorized governed finance metric', async () => {
    const ai = { generateStructured: jest.fn() };
    const router = new AskDataSemanticRouter(ai as any, parser, policy);
    const context = {
      ...adminContext,
      permissions: ['core:store:reservations'],
    };
    const result = await router.route({
      question: '本月营业利润是多少？',
      context,
      authorizedViews: authorizedAskDataViews(context),
      config: { enabled: true, shadow: false, modelFallback: true, minConfidence: 0.75 },
    });
    expect(result.semanticIntent.metricKeys).toEqual(['confirmed_profit']);
    expect(result.permissionDenied).toBe(true);
    expect(result.candidateViews).toEqual([]);
    expect(ai.generateStructured).not.toHaveBeenCalled();
  });

  it('uses one bounded structured model call only for low-confidence questions', async () => {
    const ai = {
      generateStructured: jest.fn().mockResolvedValue({
        data: {
          intent: 'query',
          answerShape: 'scalar',
          metricKeys: ['order_revenue'],
          viewNames: ['agent_v3_order_summary_view'],
          confidence: 0.82,
          ambiguitySlot: '',
          clarificationQuestion: '',
        },
      }),
    };
    const router = new AskDataSemanticRouter(ai as any, parser, policy);
    const result = await router.route({
      question: '帮我看看最近经营情况',
      context: adminContext,
      authorizedViews: ASK_DATA_FREE_SQL_VIEWS,
      config: { enabled: true, shadow: false, modelFallback: true, minConfidence: 0.75 },
    });
    expect(result.routeMode).toBe('model_fallback');
    expect(result.candidateViews.map((view) => view.viewName)).toEqual(['agent_v3_order_summary_view']);
    expect(ai.generateStructured).toHaveBeenCalledTimes(1);
    const prompt = JSON.stringify(ai.generateStructured.mock.calls[0][0]);
    expect(prompt).not.toContain('business_definition');
  });

  it('does not accept a model-selected view outside the authorized candidate pool', async () => {
    const ai = {
      generateStructured: jest.fn().mockResolvedValue({
        data: {
          intent: 'query',
          answerShape: 'scalar',
          metricKeys: ['order_revenue'],
          viewNames: ['forbidden_bottom_table'],
          confidence: 0.99,
          ambiguitySlot: '',
          clarificationQuestion: '',
        },
      }),
    };
    const router = new AskDataSemanticRouter(ai as any, parser, policy);
    const result = await router.route({
      question: '帮我看看经营情况',
      context: adminContext,
      authorizedViews: ASK_DATA_FREE_SQL_VIEWS,
      config: { enabled: true, shadow: false, modelFallback: true, minConfidence: 0.75 },
    });
    expect(result.candidateViews).toEqual([]);
    expect(result.clarificationReason).toBe('model_returned_no_allowed_view');
  });

  it('rejects a model-invented ambiguity that was not approved by the deterministic policy', async () => {
    const ai = {
      generateStructured: jest.fn().mockResolvedValue({
        data: {
          intent: 'query',
          answerShape: 'scalar',
          metricKeys: ['order_revenue'],
          viewNames: ['agent_v3_order_summary_view'],
          confidence: 0.6,
          ambiguitySlot: 'comparison_basis',
          clarificationQuestion: '',
        },
      }),
    };
    const router = new AskDataSemanticRouter(ai as any, parser, policy);
    const result = await router.route({
      question: '帮我看看经营情况',
      context: adminContext,
      authorizedViews: ASK_DATA_FREE_SQL_VIEWS,
      config: { enabled: true, shadow: false, modelFallback: true, minConfidence: 0.75 },
    });
    expect(result.clarificationQuestion).toBeUndefined();
    expect(result.clarificationReason).toBeUndefined();
    expect(result.candidateViews.map((view) => view.viewName)).toEqual(['agent_v3_order_summary_view']);
  });

  it('falls back safely to deterministic candidates when the semantic model fails', async () => {
    const ai = { generateStructured: jest.fn().mockRejectedValue(new Error('timeout')) };
    const router = new AskDataSemanticRouter(ai as any, parser, policy);
    const result = await router.route({
      question: '营业额还是日结净收',
      context: adminContext,
      authorizedViews: ASK_DATA_FREE_SQL_VIEWS,
      config: { enabled: true, shadow: false, modelFallback: true, minConfidence: 0.9 },
    });
    expect(result.routeMode).toBe('deterministic');
    expect(result.candidateViews.length).toBeGreaterThan(0);
    expect(result.fallbackReason).toContain('model_failed');
  });

  it('parses independent router environment flags without changing the SQL kernel config', () => {
    expect(
      askDataSemanticRouterConfig({
        ASK_DATA_SEMANTIC_ROUTER_ENABLED: 'true',
        ASK_DATA_SEMANTIC_ROUTER_SHADOW: 'false',
        ASK_DATA_SEMANTIC_ROUTER_MODEL_FALLBACK: 'false',
        ASK_DATA_SEMANTIC_ROUTER_MIN_CONFIDENCE: '0.8',
      }),
    ).toEqual({ enabled: true, shadow: false, modelFallback: false, minConfidence: 0.8 });
  });

  it('has no Brain or semantic-data runtime imports', () => {
    const files = [
      'ask-data-semantic-contracts.ts',
      'ask-data-intent-parser.ts',
      'ask-data-semantic-router.ts',
      'ask-data-clarification-policy.ts',
    ];
    for (const file of files) {
      const source = readFileSync(resolve(process.cwd(), 'src/ask-data-free-sql', file), 'utf8');
      expect(source).not.toMatch(/from ['"]\.\.\/brain\//);
      expect(source).not.toMatch(/from ['"]\.\.\/semantic-data\//);
      expect(source).not.toContain('business_definition');
      expect(source).not.toContain('BrainRelease');
    }
  });

  it('keeps deterministic routing comfortably below the 50ms P95 target', () => {
    const samples: number[] = [];
    for (let index = 0; index < 200; index += 1) {
      const startedAt = performance.now();
      parser.parse('最近30天哪个项目最受欢迎');
      samples.push(performance.now() - startedAt);
    }
    samples.sort((left, right) => left - right);
    expect(samples[Math.floor(samples.length * 0.95)]).toBeLessThan(50);
  });
});
