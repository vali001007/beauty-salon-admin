import { ASK_DATA_FREE_SQL_VIEWS } from './ask-data-free-sql.catalog.js';
import { AskDataIntentParser } from './ask-data-intent-parser.js';
import { askDataGuardParameters, askDataTimeScopeOverrides, buildAskDataQueryPlan } from './ask-data-query-plan.js';
import { validateAskDataQueryPlan, validateAskDataQueryPlanExecution } from './ask-data-query-plan-validator.js';
import { rankAskDataSemanticIndex } from './ask-data-semantic-index.js';
import { ReadOnlySqlCostGuard } from '../read-only-sql-kernel/read-only-sql-cost-guard.js';
import { ReadOnlySqlGuard } from '../read-only-sql-kernel/read-only-sql-guard.js';
import { ReadOnlySqlParser } from '../read-only-sql-kernel/read-only-sql-parser.js';

describe('Ami Ask controlled query plan', () => {
  const parser = new AskDataIntentParser();

  it('locks all requested metrics and both views for a multi-metric question', () => {
    const question = '今天项目收入和产品销售各多少';
    const parsed = parser.parse(question, new Date('2026-08-02T00:00:00.000Z'));
    const ranked = rankAskDataSemanticIndex({ question, parsed, authorizedViews: ASK_DATA_FREE_SQL_VIEWS });
    const semanticIntent = {
      ...parsed.semanticIntent,
      metricKeys: ranked.slice(0, 2).map((item) => item.contract.metricKey),
    };
    const candidates = ranked.slice(0, 2).map((item) => item.view);
    const plan = buildAskDataQueryPlan({ question, semanticIntent, candidateViews: candidates });

    expect(plan.metricKeys).toEqual(expect.arrayContaining(['project_sales', 'product_sales']));
    expect(plan.requiredViewNames).toEqual(
      expect.arrayContaining(['agent_v3_project_service_sales_view', 'agent_v3_order_item_sales_view']),
    );
    expect(plan.requiredAnswerFacts).toContain('all_requested_metrics');
    expect(plan.resultMode).toBe('scalar');
    expect(plan.requiredGroupByFields).toEqual([]);
    expect(validateAskDataQueryPlan(plan, candidates)).toEqual({ valid: true });
  });

  it('accepts governed aggregate formulas computed inside the single allowed CTE', () => {
    const question = '今天项目收入和产品销售各多少';
    const parsed = parser.parse(question, new Date('2026-08-02T00:00:00.000Z'));
    const ranked = rankAskDataSemanticIndex({ question, parsed, authorizedViews: ASK_DATA_FREE_SQL_VIEWS });
    const semanticIntent = { ...parsed.semanticIntent, metricKeys: ranked.slice(0, 2).map((item) => item.contract.metricKey) };
    const candidates = ranked.slice(0, 2).map((item) => item.view);
    const plan = buildAskDataQueryPlan({ question, semanticIntent, candidateViews: candidates });
    const sql = [
      'WITH project_totals AS (',
      'SELECT SUM(p.service_quantity) AS service_count, SUM(p.net_amount) AS project_revenue',
      'FROM agent_v3_project_service_sales_view AS p',
      'WHERE p.store_id = ANY(:allowedStoreIds) AND p.order_created_at >= :startAt AND p.order_created_at < :endAt',
      ')',
      'SELECT MAX(project_totals.service_count) AS service_count, MAX(project_totals.project_revenue) AS project_revenue,',
      'SUM(o.quantity) AS sales_quantity, SUM(o.net_amount) AS net_sales_amount',
      'FROM agent_v3_order_item_sales_view AS o JOIN project_totals ON TRUE',
      'WHERE o.store_id = ANY(:allowedStoreIds) AND o.order_created_at >= :startAt AND o.order_created_at < :endAt',
      'LIMIT 1',
    ].join(' ');
    const guard = new ReadOnlySqlGuard(new ReadOnlySqlParser()).inspect(sql, ASK_DATA_FREE_SQL_VIEWS, {
      storeIds: [6],
      permissions: ['*'],
      parameters: { startAt: '2026-08-02T00:00:00.000Z', endAt: '2026-08-03T00:00:00.000Z' },
    });
    if (guard.status !== 'pass') throw new Error(`${guard.reasonCode}: ${guard.message}`);
    expect(validateAskDataQueryPlanExecution(plan, guard)).toEqual({ valid: true });
  });

  it('still rejects a CTE alias when the governed aggregate formula is absent', () => {
    const question = '今天项目收入和产品销售各多少';
    const parsed = parser.parse(question, new Date('2026-08-02T00:00:00.000Z'));
    const ranked = rankAskDataSemanticIndex({ question, parsed, authorizedViews: ASK_DATA_FREE_SQL_VIEWS });
    const semanticIntent = { ...parsed.semanticIntent, metricKeys: ranked.slice(0, 2).map((item) => item.contract.metricKey) };
    const candidates = ranked.slice(0, 2).map((item) => item.view);
    const plan = buildAskDataQueryPlan({ question, semanticIntent, candidateViews: candidates });
    const sql = [
      'WITH project_totals AS (',
      'SELECT MAX(p.service_quantity) AS service_count, SUM(p.net_amount) AS project_revenue',
      'FROM agent_v3_project_service_sales_view AS p',
      'WHERE p.store_id = ANY(:allowedStoreIds) AND p.order_created_at >= :startAt AND p.order_created_at < :endAt',
      ')',
      'SELECT project_totals.service_count, project_totals.project_revenue,',
      'SUM(o.quantity) AS sales_quantity, SUM(o.net_amount) AS net_sales_amount',
      'FROM agent_v3_order_item_sales_view AS o JOIN project_totals ON TRUE',
      'WHERE o.store_id = ANY(:allowedStoreIds) AND o.order_created_at >= :startAt AND o.order_created_at < :endAt',
      'GROUP BY project_totals.service_count, project_totals.project_revenue LIMIT 1',
    ].join(' ');
    const guard = new ReadOnlySqlGuard(new ReadOnlySqlParser()).inspect(sql, ASK_DATA_FREE_SQL_VIEWS, {
      storeIds: [6],
      permissions: ['*'],
      parameters: { startAt: '2026-08-02T00:00:00.000Z', endAt: '2026-08-03T00:00:00.000Z' },
    });
    expect(guard.status).toBe('pass');
    if (guard.status !== 'pass') throw new Error(guard.message);
    expectPlanFailure(plan, guard, 'query_plan_aggregation_formula_mismatch');
  });

  it('adds deterministic ranking order and top-10 limit', () => {
    const question = '最近30天哪个项目最受欢迎';
    const parsed = parser.parse(question, new Date('2026-08-02T00:00:00.000Z'));
    const candidates = ASK_DATA_FREE_SQL_VIEWS.filter((view) => view.viewName === 'agent_v3_project_service_sales_view');
    const plan = buildAskDataQueryPlan({ question, semanticIntent: parsed.semanticIntent, candidateViews: candidates });

    expect(plan.answerShape).toBe('ranking');
    expect(plan.limit).toBe(10);
    expect(plan.sort).toEqual([{ field: 'service_count', direction: 'desc' }]);
    expect(plan.requiredAnswerFacts).toEqual(expect.arrayContaining(['ranking_order', 'ranking_limit']));
  });

  it.each([
    {
      question: '哪些产品毛利率最高',
      metricKey: 'item_contribution_margin',
      mode: 'ranking',
      groupBy: ['product_id', 'product_name', 'sku'],
      filter: { field: 'item_type', operator: 'eq', value: 'product' },
      sort: { field: 'contribution_margin_rate', direction: 'desc', nulls: 'last' },
    },
    {
      question: '帮我看各项目毛利',
      metricKey: 'item_contribution_margin',
      mode: 'grouped',
      groupBy: ['project_id', 'project_name'],
      filter: { field: 'item_type', operator: 'eq', value: 'project' },
      sort: undefined,
    },
    {
      question: '哪个项目耗材成本最高',
      metricKey: 'project_attributed_cost',
      mode: 'ranking',
      groupBy: ['project_id', 'project_name'],
      filter: { field: 'item_type', operator: 'eq', value: 'project' },
      sort: { field: 'attributed_cost', direction: 'desc' },
    },
  ])('builds governed item margin aggregation: $question', ({ question, metricKey, mode, groupBy, filter, sort }) => {
    const parsed = parser.parse(question, new Date('2026-08-04T00:00:00.000Z'));
    const candidates = ASK_DATA_FREE_SQL_VIEWS.filter((view) => view.viewName === 'ask_data_item_margin_view');
    const plan = buildAskDataQueryPlan({
      question,
      semanticIntent: { ...parsed.semanticIntent, metricKeys: [metricKey] },
      candidateViews: candidates,
    });

    expect(plan.requiredViewNames).toEqual(['ask_data_item_margin_view']);
    expect(plan.resultMode).toBe(mode);
    expect(plan.requiredGroupByFields).toEqual(expect.arrayContaining(groupBy));
    expect(plan.filters).toContainEqual(filter);
    if (sort) expect(plan.sort).toEqual([sort]);
    expect(plan.requiredOutputFields).toEqual(expect.arrayContaining([
      'net_revenue',
      'attributed_cost',
      metricKey === 'project_attributed_cost' ? 'attributed_cost_rate' : 'contribution_margin',
      'estimated_cost_event_count',
      'cost_missing_event_count',
    ]));
    if (metricKey !== 'project_attributed_cost') {
      for (const alias of ['gross_revenue', 'discount_amount', 'refund_amount', 'net_revenue', 'attributed_cost']) {
        expect(plan.aggregations).toContainEqual(expect.objectContaining({ alias, zeroOnEmpty: true }));
      }
    }
    expect(plan.assumptions.join(' ')).toContain('不等同已确认月结利润');
    expect(plan.assumptions.join(' ')).toContain('估算');
    expect(validateAskDataQueryPlan(plan, candidates)).toEqual({ valid: true });
  });

  it('keeps project attributable-cost ranking at project grain instead of splitting by consumable product', () => {
    const question = '哪个项目耗材成本最高';
    const parsed = parser.parse(question, new Date('2026-08-04T00:00:00.000Z'));
    const candidates = ASK_DATA_FREE_SQL_VIEWS.filter((view) => view.viewName === 'ask_data_item_margin_view');
    const plan = buildAskDataQueryPlan({
      question,
      semanticIntent: { ...parsed.semanticIntent, metricKeys: ['project_attributed_cost'] },
      candidateViews: candidates,
    });

    expect(plan.requiredGroupByFields).toEqual(['project_id', 'project_name']);
    expect(plan.requiredOutputFields).not.toEqual(expect.arrayContaining(['product_id', 'product_name', 'sku']));
  });

  it.each([
    ['本月次卡核销项目贡献毛利是多少', { field: 'event_type', operator: 'eq', value: 'card_redemption' }],
    ['本月商品退款冲减了多少收入和成本', { field: 'event_type', operator: 'eq', value: 'refund' }],
  ])('filters item margin economic event type: %s', (question, expectedFilter) => {
    const parsed = parser.parse(question, new Date('2026-08-04T00:00:00.000Z'));
    const candidates = ASK_DATA_FREE_SQL_VIEWS.filter((view) => view.viewName === 'ask_data_item_margin_view');
    const plan = buildAskDataQueryPlan({
      question,
      semanticIntent: { ...parsed.semanticIntent, metricKeys: ['item_contribution_margin'] },
      candidateViews: candidates,
    });

    expect(plan.filters).toContainEqual(expectedFilter);
    expect(plan.requiredViewNames).toEqual(['ask_data_item_margin_view']);
    expect(validateAskDataQueryPlan(plan, candidates)).toEqual({ valid: true });
  });

  it('groups contribution margin by governed cost basis without leaking economic-event detail', () => {
    const question = '本月按成本口径统计项目贡献毛利';
    const parsed = parser.parse(question, new Date('2026-08-04T00:00:00.000Z'));
    const candidates = ASK_DATA_FREE_SQL_VIEWS.filter((view) => view.viewName === 'ask_data_item_margin_view');
    const plan = buildAskDataQueryPlan({
      question,
      semanticIntent: { ...parsed.semanticIntent, metricKeys: ['item_contribution_margin'] },
      candidateViews: candidates,
    });

    expect(plan.resultMode).toBe('grouped');
    expect(plan.requiredGroupByFields).toEqual(['cost_basis', 'cost_completeness']);
    expect(plan.requiredOutputFields).not.toContain('event_id');
    expect(plan.filters).toContainEqual({ field: 'item_type', operator: 'eq', value: 'project' });
  });

  it('keeps contribution-margin trends grouped by item type and calendar month', () => {
    const question = '最近三个月商品与项目贡献毛利趋势';
    const parsed = parser.parse(question, new Date('2026-08-04T00:00:00.000Z'));
    const candidates = ASK_DATA_FREE_SQL_VIEWS.filter((view) => view.viewName === 'ask_data_item_margin_view');
    const plan = buildAskDataQueryPlan({
      question,
      semanticIntent: { ...parsed.semanticIntent, metricKeys: ['item_contribution_margin'] },
      candidateViews: candidates,
    });

    expect(plan.resultMode).toBe('trend');
    expect(plan.timeGrain).toEqual({
      sourceField: 'event_at',
      granularity: 'month',
      alias: 'trend_month',
      expression: "DATE_TRUNC('month', event_at)::date",
    });
    expect(plan.requiredGroupByFields).toEqual(['item_type', 'trend_month']);
    expect(plan.requiredOutputFields).toEqual(expect.arrayContaining(['item_type', 'trend_month', 'contribution_margin']));
  });

  it('keeps below-cost sales on non-null attributable costs and a governed aggregate comparison', () => {
    const question = '有没有产品卖价低于成本';
    const parsed = parser.parse(question, new Date('2026-08-04T00:00:00.000Z'));
    const candidates = ASK_DATA_FREE_SQL_VIEWS.filter((view) => view.viewName === 'ask_data_item_margin_view');
    const plan = buildAskDataQueryPlan({
      question,
      semanticIntent: { ...parsed.semanticIntent, metricKeys: ['below_cost_sale'] },
      candidateViews: candidates,
    });

    expect(plan.resultMode).toBe('ranking');
    expect(plan.filters).toEqual(expect.arrayContaining([
      { field: 'item_type', operator: 'eq', value: 'product' },
      { field: 'attributed_cost', operator: 'is_not_null', value: true },
      { field: 'net_revenue', operator: 'aggregate_lt', value: 'attributed_cost' },
    ]));
    expect(plan.sort).toEqual([{ field: 'contribution_margin', direction: 'asc', nulls: 'last' }]);
    expect(plan.requiredGroupByFields).toEqual(expect.arrayContaining(['product_id', 'product_name', 'sku']));
    expect(validateAskDataQueryPlan(plan, candidates)).toEqual({ valid: true });
  });

  it('compares product and project contribution margin by item type instead of mixing units or views', () => {
    const question = '产品销售和服务项目毛利哪个高';
    const parsed = parser.parse(question, new Date('2026-08-04T00:00:00.000Z'));
    const candidates = ASK_DATA_FREE_SQL_VIEWS.filter((view) => view.viewName === 'ask_data_item_margin_view');
    const plan = buildAskDataQueryPlan({
      question,
      semanticIntent: { ...parsed.semanticIntent, metricKeys: ['item_contribution_margin'] },
      candidateViews: candidates,
    });

    expect(plan.resultMode).toBe('grouped');
    expect(plan.comparisonMode).toBeDefined();
    expect(plan.requiredGroupByFields).toEqual(['item_type']);
    expect(plan.filters).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ field: 'item_type' }),
    ]));
    expect(plan.requiredViewNames).toEqual(['ask_data_item_margin_view']);
    expect(validateAskDataQueryPlan(plan, candidates)).toEqual({ valid: true });
  });

  it('treats best-selling product wording as a product ranking instead of a scalar store total', () => {
    const question = '最近卖得最好的产品是什么';
    const parsed = parser.parse(question, new Date('2026-08-02T00:00:00.000Z'));
    const candidates = ASK_DATA_FREE_SQL_VIEWS.filter((view) => view.viewName === 'agent_v3_order_item_sales_view');
    const plan = buildAskDataQueryPlan({ question, semanticIntent: parsed.semanticIntent, candidateViews: candidates });

    expect(parsed.semanticIntent.answerShape).toBe('ranking');
    expect(plan.resultMode).toBe('ranking');
    expect(plan.requiredOutputFields).toEqual(expect.arrayContaining(['product_id', 'product_name', 'sales_quantity']));
    expect(plan.requiredGroupByFields).toEqual(expect.arrayContaining(['product_id', 'product_name']));
    expect(plan.sort).toEqual([{ field: 'sales_quantity', direction: 'desc' }]);
    expect(plan.limit).toBe(10);
  });

  it('sorts customer spending rankings by cumulative paid amount instead of customer count', () => {
    const question = '消费金额最高的客户前10名';
    const parsed = parser.parse(question, new Date('2026-08-04T00:00:00.000Z'));
    const candidates = ASK_DATA_FREE_SQL_VIEWS.filter(
      (view) => view.viewName === 'ask_data_customer_profile_summary_view',
    );
    const plan = buildAskDataQueryPlan({
      question,
      semanticIntent: { ...parsed.semanticIntent, metricKeys: ['customer_profile'] },
      candidateViews: candidates,
    });

    expect(plan.resultMode).toBe('ranking');
    expect(plan.requiredOutputFields).toEqual(
      expect.arrayContaining(['customer_id', 'customer_name_masked', 'total_paid_amount']),
    );
    expect(plan.sort).toEqual([{ field: 'total_paid_amount', direction: 'desc' }]);
    expect(plan.limit).toBe(10);
  });

  it('groups service counts by staff for who-served-how-many wording', () => {
    const question = '今天谁服务了几个客人';
    const parsed = parser.parse(question, new Date('2026-08-03T00:00:00.000Z'));
    const candidates = ASK_DATA_FREE_SQL_VIEWS.filter(
      (view) => view.viewName === 'agent_v3_service_quality_view',
    );
    const plan = buildAskDataQueryPlan({
      question,
      semanticIntent: parsed.semanticIntent,
      candidateViews: candidates,
    });

    expect(plan.resultMode).toBe('grouped');
    expect(plan.requiredOutputFields).toEqual(
      expect.arrayContaining(['beautician_id', 'beautician_name', 'service_task_count']),
    );
    expect(plan.requiredGroupByFields).toEqual(
      expect.arrayContaining(['beautician_id', 'beautician_name']),
    );
    expect(plan.aggregations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          field: 'service_task_id',
          fn: 'count_distinct',
          alias: 'service_task_count',
        }),
      ]),
    );
  });

  it.each([
    ['按次卡名称统计最近 30 天核销次数', 'card_usage', 'agent_v3_card_usage_view', ['card_name', 'usage_times']],
    ['各操作人的库存报废金额分别是多少', 'inventory_scrap', 'agent_v3_inventory_scrap_view', ['operator_name', 'loss_amount']],
    ['帮我统计一下这个月每个项目的收入占比', 'project_sales', 'agent_v3_project_service_sales_view', ['project_id', 'project_name', 'project_revenue']],
    ['各员工级别分别有多少人', 'staff_profile', 'agent_v3_staff_profile_view', ['level_name', 'staff_count']],
    ['按流失风险等级统计当前客户数量', 'customer_lifecycle', 'ask_data_customer_lifecycle_view', ['churn_risk_level', 'customer_count']],
    ['按客户生命周期阶段统计当前客户数量', 'customer_lifecycle', 'ask_data_customer_lifecycle_view', ['lifecycle_stage', 'customer_count']],
    ['按 LTV 档位统计当前客户数量', 'customer_lifecycle', 'ask_data_customer_lifecycle_view', ['ltv_tier', 'customer_count']],
    ['各美容师今天的排班情况，有没有空档', 'staff_capacity', 'ask_data_staff_capacity_view', ['staff_id', 'staff_name', 'idle_minutes']],
    ['各对方门店的调入商品数量分别是多少', 'transfer_status', 'ask_data_transfer_status_view', ['counterpart_store_id', 'counterpart_store_name', 'transfer_count', 'product_count']],
  ])('keeps governed dimension wording grouped: %s', (question, metricKey, viewName, requiredFields) => {
    const parsed = parser.parse(question, new Date('2026-08-03T00:00:00.000Z'));
    const candidates = ASK_DATA_FREE_SQL_VIEWS.filter((view) => view.viewName === viewName);
    const plan = buildAskDataQueryPlan({
      question,
      semanticIntent: { ...parsed.semanticIntent, metricKeys: [metricKey] },
      candidateViews: candidates,
    });

    expect(plan.resultMode).toBe('grouped');
    expect(plan.requiredOutputFields).toEqual(expect.arrayContaining(requiredFields));
  });

  it('routes promotion-type activity counts to promotion facts', () => {
    const question = '按优惠类型统计当前活动数量';
    const parsed = parser.parse(question, new Date('2026-08-03T00:00:00.000Z'));
    const ranked = rankAskDataSemanticIndex({ question, parsed, authorizedViews: ASK_DATA_FREE_SQL_VIEWS });

    expect(ranked[0]?.contract.metricKey).toBe('promotion_offer');
    expect(ranked[0]?.view.viewName).toBe('agent_v3_promotion_offer_view');
    const plan = buildAskDataQueryPlan({
      question,
      semanticIntent: { ...parsed.semanticIntent, metricKeys: ['promotion_offer'] },
      candidateViews: [ranked[0]!.view],
    });
    expect(plan.resultMode).toBe('grouped');
    expect(plan.requiredOutputFields).toEqual(expect.arrayContaining(['type', 'promotion_count']));
  });

  it('keeps complaint follow-up lists as detail rows without forcing statistics', () => {
    const question = '最近有没有客户投诉或者表达不满';
    const parsed = parser.parse(question, new Date('2026-08-03T00:00:00.000Z'));
    const candidates = ASK_DATA_FREE_SQL_VIEWS.filter(
      (view) => view.viewName === 'ask_data_customer_feedback_view',
    );
    const plan = buildAskDataQueryPlan({
      question,
      semanticIntent: { ...parsed.semanticIntent, metricKeys: ['customer_feedback'] },
      candidateViews: candidates,
    });

    expect(plan.resultMode).toBe('detail');
    expect(plan.requiredOutputFields).toEqual(
      expect.arrayContaining(['feedback_id', 'customer_id', 'customer_name_masked', 'feedback_type', 'rating', 'severity', 'status']),
    );
    expect(plan.requiredOutputFields).not.toEqual(expect.arrayContaining(['feedback_count', 'average_rating']));
    expect(plan.aggregations).toEqual([]);
  });

  it('retains governed rating facts for customer satisfaction detail questions', () => {
    const question = '顾然服务过的客户这半年满意度如何';
    const parsed = parser.parse(question, new Date('2026-08-03T00:00:00.000Z'));
    const candidates = ASK_DATA_FREE_SQL_VIEWS.filter(
      (view) => view.viewName === 'ask_data_customer_feedback_view',
    );
    const plan = buildAskDataQueryPlan({
      question,
      semanticIntent: { ...parsed.semanticIntent, metricKeys: ['customer_feedback'] },
      candidateViews: candidates,
    });

    expect(plan.resultMode).toBe('detail');
    expect(plan.requiredOutputFields).toEqual(
      expect.arrayContaining(['feedback_id', 'customer_id', 'customer_name_masked', 'feedback_count', 'average_rating']),
    );
  });

  it('uses a zero-safe absolute quantity for month-over-month inventory consumption', () => {
    const question = '这个月库存消耗和上个月比有没有异常';
    const parsed = parser.parse(question, new Date('2026-08-03T00:00:00.000Z'));
    const candidates = ASK_DATA_FREE_SQL_VIEWS.filter(
      (view) => view.viewName === 'agent_v3_stock_movement_view',
    );
    const plan = buildAskDataQueryPlan({
      question,
      semanticIntent: { ...parsed.semanticIntent, metricKeys: ['inventory_movement'] },
      candidateViews: candidates,
    });

    expect(plan.aggregations).toContainEqual(
      expect.objectContaining({ field: 'quantity', fn: 'sum_abs', alias: 'movement_quantity', zeroOnEmpty: true }),
    );
  });

  it('does not clarify a fully specified revenue trend just because it says how it looks', () => {
    const question = '最近三天营业额趋势怎么样';
    const parsed = parser.parse(question, new Date('2026-08-03T00:00:00.000Z'));
    const candidates = ASK_DATA_FREE_SQL_VIEWS.filter(
      (view) => view.viewName === 'agent_v3_order_summary_view',
    );
    const plan = buildAskDataQueryPlan({ question, semanticIntent: parsed.semanticIntent, candidateViews: candidates });

    expect(parsed.semanticIntent.ambiguities).toEqual([]);
    expect(plan.resultMode).toBe('trend');
    expect(plan.requiredOutputFields).toEqual(expect.arrayContaining(['trend_day', 'net_revenue']));
  });

  it('treats product sell-through analysis as a product-level grouped result', () => {
    const question = '今年产品动销分析';
    const parsed = parser.parse(question, new Date('2026-08-02T00:00:00.000Z'));
    const candidates = ASK_DATA_FREE_SQL_VIEWS.filter((view) => view.viewName === 'agent_v3_order_item_sales_view');
    const plan = buildAskDataQueryPlan({ question, semanticIntent: parsed.semanticIntent, candidateViews: candidates });

    expect(parsed.semanticIntent.metricKeys).toEqual(['product_sales']);
    expect(plan.resultMode).toBe('grouped');
    expect(plan.requiredOutputFields).toEqual(expect.arrayContaining(['product_id', 'product_name', 'sales_quantity', 'net_sales_amount']));
    expect(plan.requiredGroupByFields).toEqual(expect.arrayContaining(['product_id', 'product_name']));
  });

  it('keeps a current expiring-inventory question on the snapshot while using an as-of expiry window', () => {
    const question = '哪些产品快过期了，还有多少';
    const parsed = parser.parse(question, new Date('2026-08-02T00:00:00.000Z'));
    const candidates = ASK_DATA_FREE_SQL_VIEWS.filter((view) => view.viewName === 'agent_v3_product_inventory_view');
    const plan = buildAskDataQueryPlan({ question, semanticIntent: parsed.semanticIntent, candidateViews: candidates });

    expect(plan.timeScopeMode).toBe('none');
    expect(plan.filters).toEqual(expect.arrayContaining([
      { field: 'nearest_expiry_date', operator: 'between_as_of_days', value: 30 },
      { field: 'current_stock', operator: 'gt', value: 0 },
    ]));
    expect(askDataTimeScopeOverrides(plan)).toEqual({ skipDefaultTimeScopeViewNames: ['agent_v3_product_inventory_view'] });
    expect(askDataGuardParameters(plan, {}, undefined, new Date('2026-08-02T00:00:00.000Z'))).toEqual({
      endAt: '2026-08-02T00:00:00.000Z',
    });
  });

  it('requires separate face and body reservation counts', () => {
    const question = '今天有几个预约是做面部的，几个是身体的';
    const parsed = parser.parse(question, new Date('2026-08-02T00:00:00.000Z'));
    const candidates = ASK_DATA_FREE_SQL_VIEWS.filter((view) => view.viewName === 'agent_v3_reservation_view');
    const plan = buildAskDataQueryPlan({ question, semanticIntent: parsed.semanticIntent, candidateViews: candidates });

    expect(plan.resultMode).toBe('scalar');
    expect(plan.requiredOutputFields).toEqual(expect.arrayContaining(['face_reservation_count', 'body_reservation_count']));
    expect(plan.selectFields).toEqual(expect.arrayContaining(['reservation_id', 'project_type']));
    expect(plan.filters).toContainEqual({ field: 'status', operator: 'not_in', value: ['cancelled', 'canceled'] });
    expect(plan.requiredAnswerFacts).toContain('all_requested_dimensions');

    const sql = [
      "SELECT COUNT(DISTINCT reservation_id) FILTER (WHERE project_type LIKE '%面部%') AS face_reservation_count,",
      "COUNT(DISTINCT reservation_id) FILTER (WHERE project_type LIKE '%身体%') AS body_reservation_count",
      "FROM agent_v3_reservation_view WHERE status NOT IN ('cancelled', 'canceled') LIMIT 1",
    ].join(' ');
    const guard = new ReadOnlySqlGuard(new ReadOnlySqlParser()).inspect(sql, ASK_DATA_FREE_SQL_VIEWS, {
      storeIds: [6], permissions: ['*'], parameters: { startAt: '2026-08-02T00:00:00.000Z', endAt: '2026-08-03T00:00:00.000Z' },
    });
    if (guard.status !== 'pass') throw new Error(`${guard.reasonCode}: ${guard.message}`);
    expect(validateAskDataQueryPlanExecution(plan, guard)).toEqual({ valid: true });
  });

  it('returns the last afternoon reservation as one detail row instead of a reservation count', () => {
    const question = '今天下午最后一个预约是几点，是谁';
    const parsed = parser.parse(question, new Date('2026-08-02T00:00:00.000Z'));
    const candidates = ASK_DATA_FREE_SQL_VIEWS.filter((view) => view.viewName === 'agent_v3_reservation_view');
    const plan = buildAskDataQueryPlan({ question, semanticIntent: parsed.semanticIntent, candidateViews: candidates });

    expect(plan.resultMode).toBe('detail');
    expect(plan.requiredOutputFields).toEqual(expect.arrayContaining([
      'reservation_id',
      'customer_id',
      'customer_name_masked',
      'date',
      'start_time',
      'project_name',
    ]));
    expect(plan.filters).toEqual(expect.arrayContaining([
      { field: 'status', operator: 'not_in', value: ['cancelled', 'canceled'] },
      { field: 'start_time', operator: 'gte', value: '12:00' },
    ]));
    expect(plan.sort).toEqual([{ field: 'start_time', direction: 'desc' }]);
    expect(plan.limit).toBe(1);
  });

  it('returns the 14:00 reservation customer and project instead of a scalar count', () => {
    const question = '下午两点那个客人想做什么项目';
    const parsed = parser.parse(question, new Date('2026-08-02T00:00:00.000Z'));
    const candidates = ASK_DATA_FREE_SQL_VIEWS.filter((view) => view.viewName === 'agent_v3_reservation_view');
    const plan = buildAskDataQueryPlan({ question, semanticIntent: parsed.semanticIntent, candidateViews: candidates });

    expect(plan.resultMode).toBe('detail');
    expect(plan.requiredOutputFields).toEqual(expect.arrayContaining([
      'reservation_id', 'customer_id', 'customer_name_masked', 'date', 'start_time', 'project_id', 'project_name',
    ]));
    expect(plan.filters).toContainEqual({ field: 'start_time', operator: 'eq', value: '14:00' });
    expect(plan.requiredOutputFields).not.toContain('reservation_count');
  });

  it.each([
    ['有没有什么产品只剩最后几瓶了', ['product_id', 'product_name', 'current_stock', 'safety_stock']],
    ['客人要买产品带走，我们现在有什么产品可以卖', ['product_id', 'product_name', 'current_stock', 'status']],
    ['帮我看一下30天内要过期的东西', ['product_id', 'product_name', 'current_stock', 'nearest_expiry_date']],
  ])('keeps requested inventory objects in detail output: %s', (question, expectedFields) => {
    const parsed = parser.parse(question, new Date('2026-08-02T00:00:00.000Z'));
    const candidates = ASK_DATA_FREE_SQL_VIEWS.filter((view) => view.viewName === 'agent_v3_product_inventory_view');
    const plan = buildAskDataQueryPlan({ question, semanticIntent: parsed.semanticIntent, candidateViews: candidates });

    expect(plan.resultMode).toBe('detail');
    expect(plan.requiredOutputFields).toEqual(expect.arrayContaining(expectedFields));
  });

  it('ranks employees with available capacity instead of returning a store-level scalar', () => {
    const question = '帮我看一下今天哪个美容师可以接新单';
    const parsed = parser.parse(question, new Date('2026-08-02T00:00:00.000Z'));
    const candidates = ASK_DATA_FREE_SQL_VIEWS.filter((view) => view.viewName === 'ask_data_staff_capacity_view');
    const plan = buildAskDataQueryPlan({ question, semanticIntent: parsed.semanticIntent, candidateViews: candidates });

    expect(plan.resultMode).toBe('ranking');
    expect(plan.requiredOutputFields).toEqual(expect.arrayContaining([
      'staff_id', 'staff_name', 'idle_minutes', 'overbooked_minutes',
    ]));
    expect(plan.filters).toEqual(expect.arrayContaining([
      { field: 'idle_minutes', operator: 'gt', value: 0 },
      { field: 'overbooked_minutes', operator: 'eq', value: 0 },
    ]));
    expect(plan.sort).toEqual([{ field: 'idle_minutes', direction: 'desc' }]);
  });

  it('keeps a general reservation situation question as one scalar count', () => {
    const question = '帮我查一下明天的预约情况';
    const parsed = parser.parse(question, new Date('2026-08-02T00:00:00.000Z'));
    const candidates = ASK_DATA_FREE_SQL_VIEWS.filter((view) => view.viewName === 'agent_v3_reservation_view');
    const plan = buildAskDataQueryPlan({ question, semanticIntent: parsed.semanticIntent, candidateViews: candidates });

    expect(parsed.semanticIntent.metricKeys).toEqual(['reservation_metrics']);
    expect(parsed.semanticIntent.answerShape).toBe('scalar');
    expect(plan.resultMode).toBe('scalar');
    expect(plan.requiredViewNames).toEqual(['agent_v3_reservation_view']);
    expect(plan.requiredOutputFields).toContain('reservation_count');
    expect(plan.requiredGroupByFields).toEqual([]);
    expect(plan.limit).toBe(1);
  });

  it('computes reservation arrival conversion from non-cancelled and arrived reservations', () => {
    const question = '今年的预约到店转化率是多少';
    const parsed = parser.parse(question, new Date('2026-08-02T00:00:00.000Z'));
    const candidates = ASK_DATA_FREE_SQL_VIEWS.filter((view) => view.viewName === 'agent_v3_reservation_view');
    const plan = buildAskDataQueryPlan({ question, semanticIntent: parsed.semanticIntent, candidateViews: candidates });

    expect(plan.resultMode).toBe('scalar');
    expect(plan.requiredOutputFields).toEqual(expect.arrayContaining([
      'reservation_count', 'completed_reservation_count', 'arrival_conversion_rate',
    ]));
    expect(plan.filters).toContainEqual({ field: 'status', operator: 'not_in', value: ['cancelled', 'canceled'] });
  });

  it('ranks full reservation time slots by non-cancelled reservation count', () => {
    const question = '本周末哪些时段的预约最满';
    const parsed = parser.parse(question, new Date('2026-08-02T00:00:00.000Z'));
    const candidates = ASK_DATA_FREE_SQL_VIEWS.filter((view) => view.viewName === 'agent_v3_reservation_view');
    const plan = buildAskDataQueryPlan({ question, semanticIntent: parsed.semanticIntent, candidateViews: candidates });

    expect(plan.resultMode).toBe('ranking');
    expect(plan.requiredOutputFields).toEqual(expect.arrayContaining(['start_time', 'reservation_count']));
    expect(plan.requiredGroupByFields).toContain('start_time');
    expect(plan.sort).toEqual([{ field: 'reservation_count', direction: 'desc' }]);
    expect(plan.limit).toBe(10);
  });

  it('uses strategy marketing facts for an automation conversion funnel', () => {
    const question = '最近7天自动化策略的转化漏斗';
    const parsed = parser.parse(question, new Date('2026-08-02T00:00:00.000Z'));
    const candidates = ASK_DATA_FREE_SQL_VIEWS.filter((view) => view.viewName === 'ask_data_marketing_roi_view');
    const semanticIntent = { ...parsed.semanticIntent, metricKeys: ['marketing_roi'] };
    const plan = buildAskDataQueryPlan({ question, semanticIntent, candidateViews: candidates });

    expect(plan.resultMode).toBe('grouped');
    expect(plan.requiredOutputFields).toEqual(expect.arrayContaining([
      'strategy_id', 'strategy_name', 'exposure_count', 'click_count', 'conversion_count', 'conversion_rate',
    ]));
    expect(plan.requiredGroupByFields).toEqual(expect.arrayContaining(['strategy_id', 'strategy_name']));
  });

  it('requires zero-safe marketing conversion facts when an activity has no conversion rows', () => {
    const question = '本季度每场活动参与人数和转化数分别多少';
    const parsed = parser.parse(question);
    const requiredViews = ['agent_v3_marketing_activity_view', 'agent_v3_marketing_conversion_view'];
    const candidates = ASK_DATA_FREE_SQL_VIEWS.filter((view) => requiredViews.includes(view.viewName));
    const plan = buildAskDataQueryPlan({
      question,
      semanticIntent: { ...parsed.semanticIntent, metricKeys: ['marketing_activity', 'marketing_conversion'] },
      candidateViews: candidates,
    });

    expect(plan.aggregations).toEqual(expect.arrayContaining([
      expect.objectContaining({ alias: 'event_count', zeroOnEmpty: true }),
      expect.objectContaining({ alias: 'lead_count', zeroOnEmpty: true }),
      expect.objectContaining({ alias: 'conversion_count', zeroOnEmpty: true }),
      expect.objectContaining({ alias: 'attributed_revenue', zeroOnEmpty: true }),
    ]));

    const sql = [
      'WITH conversion_agg AS (',
      'SELECT c.activity_id, COALESCE(SUM(c.event_count), 0) AS event_count,',
      'COALESCE(SUM(c.lead_count), 0) AS lead_count,',
      'COALESCE(SUM(c.conversion_count), 0) AS conversion_count,',
      'COALESCE(SUM(c.attributed_revenue), 0) AS attributed_revenue',
      'FROM agent_v3_marketing_conversion_view c',
      'WHERE c.store_id = ANY(:allowedStoreIds)',
      'AND c.latest_event_at >= :startAt AND c.latest_event_at < :endAt GROUP BY c.activity_id',
      ')',
      'SELECT a.activity_id, a.activity_title, SUM(a.participants) AS participants,',
      'COALESCE(MAX(conversion_agg.event_count), 0) AS event_count,',
      'COALESCE(MAX(conversion_agg.lead_count), 0) AS lead_count,',
      'COALESCE(MAX(conversion_agg.conversion_count), 0) AS conversion_count,',
      'COALESCE(MAX(conversion_agg.attributed_revenue), 0) AS attributed_revenue',
      'FROM agent_v3_marketing_activity_view a',
      'LEFT JOIN conversion_agg ON conversion_agg.activity_id = a.activity_id',
      'WHERE a.store_id = ANY(:allowedStoreIds)',
      'AND a.start_at >= :startAt AND a.start_at < :endAt',
      'GROUP BY a.activity_id, a.activity_title LIMIT 100',
    ].join(' ');
    const guard = new ReadOnlySqlGuard(new ReadOnlySqlParser()).inspect(sql, ASK_DATA_FREE_SQL_VIEWS, {
      storeIds: [6], permissions: ['*'], parameters: parsed.semanticIntent.timeRange,
      allowedJoinViewSets: [requiredViews],
      ...askDataTimeScopeOverrides(plan),
    });

    if (guard.status !== 'pass') throw new Error(`${guard.reasonCode}: ${guard.message}`);
    expect(validateAskDataQueryPlanExecution(plan, guard)).toEqual({ valid: true });
  });

  it('uses the expiry date range and detail evidence for weekend expiry risk', () => {
    const question = '本周末临期库存的损失风险有多大';
    const parsed = parser.parse(question, new Date('2026-08-02T00:00:00.000Z'));
    const candidates = ASK_DATA_FREE_SQL_VIEWS.filter((view) => view.viewName === 'agent_v3_product_inventory_view');
    const plan = buildAskDataQueryPlan({ question, semanticIntent: parsed.semanticIntent, candidateViews: candidates });

    expect(plan.resultMode).toBe('detail');
    expect(plan.timeScopeMode).toBe('event_range');
    expect(plan.timeFieldOverrides).toEqual({ agent_v3_product_inventory_view: 'nearest_expiry_date' });
    expect(plan.requiredOutputFields).toEqual(expect.arrayContaining([
      'product_id', 'product_name', 'nearest_expiry_date', 'current_stock', 'stock_value',
    ]));
  });

  it('plans loss-making activities from estimated marketing ROI facts', () => {
    const question = '今年哪些活动在亏钱';
    const parsed = parser.parse(question, new Date('2026-08-02T00:00:00.000Z'));
    const candidates = ASK_DATA_FREE_SQL_VIEWS.filter((view) => view.viewName === 'ask_data_marketing_roi_view');
    const plan = buildAskDataQueryPlan({ question, semanticIntent: parsed.semanticIntent, candidateViews: candidates });

    expect(plan.metricKeys).toEqual(['marketing_roi']);
    expect(plan.resultMode).toBe('grouped');
    expect(plan.requiredOutputFields).toEqual(expect.arrayContaining([
      'activity_id', 'activity_title', 'attributed_net_revenue', 'marketing_cost', 'marketing_profit', 'roi',
    ]));
    expect(plan.requiredGroupByFields).toEqual(expect.arrayContaining(['activity_id', 'activity_title']));
    expect(plan.filters).toContainEqual({ field: 'attributed_net_revenue', operator: 'aggregate_lt', value: 'marketing_cost' });
  });

  it('does not invent a metric whose view is absent from the authorized candidate set', () => {
    const question = '今天项目收入和产品销售各多少';
    const parsed = parser.parse(question);
    const projectView = ASK_DATA_FREE_SQL_VIEWS.filter((view) => view.viewName === 'agent_v3_project_service_sales_view');
    const plan = buildAskDataQueryPlan({ question, semanticIntent: parsed.semanticIntent, candidateViews: projectView });
    expect(plan.metricKeys).toEqual(['project_sales']);
    expect(plan.viewNames).toEqual(['agent_v3_project_service_sales_view']);
    expect(validateAskDataQueryPlan(plan, projectView)).toEqual({ valid: true });
  });

  it('blocks execution when SQL selected only one of two required views', () => {
    const question = '今天项目收入和产品销售各多少';
    const parsed = parser.parse(question);
    const ranked = rankAskDataSemanticIndex({ question, parsed, authorizedViews: ASK_DATA_FREE_SQL_VIEWS });
    const semanticIntent = { ...parsed.semanticIntent, metricKeys: ranked.slice(0, 2).map((item) => item.contract.metricKey) };
    const candidates = ranked.slice(0, 2).map((item) => item.view);
    const plan = buildAskDataQueryPlan({ question, semanticIntent, candidateViews: candidates });
    const guard = new ReadOnlySqlGuard(new ReadOnlySqlParser()).inspect(
      'SELECT SUM(net_amount) AS project_revenue FROM agent_v3_project_service_sales_view LIMIT 1',
      ASK_DATA_FREE_SQL_VIEWS,
      { storeIds: [6], permissions: ['*'] },
    );
    expect(guard.status).toBe('pass');
    if (guard.status !== 'pass') throw new Error(guard.message);
    const result = validateAskDataQueryPlanExecution(plan, guard);

    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.reasonCode).toBe('query_plan_required_view_missing');
  });

  it.each([
    ['张美丽的预约是几点，做什么项目', 'reservation_metrics', 'agent_v3_reservation_view', ['date', 'start_time', 'project_name']],
    ['预测马欣怡的流失风险有多高', 'customer_lifecycle', 'ask_data_customer_lifecycle_view', ['churn_risk_level', 'computed_at']],
    ['吴晓雯的会员等级是什么', 'customer_profile', 'ask_data_customer_profile_summary_view', ['member_level']],
  ])('locks a named-customer question to customer detail instead of store aggregation: %s', (question, metricKey, viewName, outputs) => {
    const parsed = parser.parse(question);
    const semanticIntent = {
      ...parsed.semanticIntent,
      metricKeys: [metricKey],
      entities: parsed.semanticIntent.entities.map((entity) => ({ ...entity, resolvedValue: '4023' })),
    };
    const candidates = ASK_DATA_FREE_SQL_VIEWS.filter((view) => view.viewName === viewName);
    const plan = buildAskDataQueryPlan({ question, semanticIntent, candidateViews: candidates });

    expect(plan.resultMode).toBe('detail');
    expect(plan.requiredOutputFields).toEqual(expect.arrayContaining(['customer_id', 'customer_name_masked', ...outputs]));
    expect(plan.filters).toContainEqual(expect.objectContaining({ field: 'customer_id', operator: 'eq', value: 4023 }));
    expect(plan.aggregations.every((aggregation) => aggregation.fn === 'none')).toBe(true);
  });

  it('requires customer-key joining and all requested facts for balance plus unused-card detail', () => {
    const question = '哪些客户同时有储值余额和未用完的综合养护 20 次卡';
    const parsed = parser.parse(question);
    const candidates = ASK_DATA_FREE_SQL_VIEWS.filter((view) =>
      ['agent_v3_customer_balance_view', 'agent_v3_card_asset_view'].includes(view.viewName),
    );
    const plan = buildAskDataQueryPlan({ question, semanticIntent: parsed.semanticIntent, candidateViews: candidates });

    expect(plan.metricKeys).toEqual(expect.arrayContaining(['customer_balance', 'card_assets']));
    expect(plan.requiredViewNames).toEqual(expect.arrayContaining([
      'agent_v3_customer_balance_view',
      'agent_v3_card_asset_view',
    ]));
    expect(plan.requiredJoinKeys).toEqual(['customer_id']);
    expect(plan.resultMode).toBe('detail');
    expect(plan.requiredOutputFields).toEqual(expect.arrayContaining([
      'customer_id', 'customer_name_masked', 'cash_balance', 'gift_balance', 'card_name', 'remaining_times',
    ]));
    expect(plan.filters).toEqual(expect.arrayContaining([
      expect.objectContaining({ field: 'cash_balance', operator: 'sum_with_gt' }),
      { field: 'remaining_times', operator: 'gt', value: 0 },
      { field: 'card_name', operator: 'contains', value: '综合养护 20 次卡' },
    ]));
    expect(validateAskDataQueryPlan(plan, candidates)).toEqual({ valid: true });
  });

  it('parses a Chinese cash-balance threshold for balance plus unused-card detail', () => {
    const question = '列出现金余额超过五百且还有未用次卡的客户';
    const parsed = parser.parse(question);
    const candidates = ASK_DATA_FREE_SQL_VIEWS.filter((view) =>
      ['agent_v3_customer_balance_view', 'agent_v3_card_asset_view'].includes(view.viewName),
    );
    const plan = buildAskDataQueryPlan({ question, semanticIntent: parsed.semanticIntent, candidateViews: candidates });

    expect(plan.metricKeys).toEqual(['customer_balance', 'card_assets']);
    expect(plan.requiredViewNames).toEqual([
      'agent_v3_customer_balance_view',
      'agent_v3_card_asset_view',
    ]);
    expect(plan.filters).toEqual(expect.arrayContaining([
      { field: 'cash_balance', operator: 'gt', value: 500 },
      { field: 'remaining_times', operator: 'gt', value: 0 },
    ]));
    expect(plan.requiredOutputFields).toEqual(expect.arrayContaining([
      'customer_id', 'customer_name_masked', 'cash_balance', 'card_name', 'remaining_times',
    ]));
  });

  it('accepts a governed cash-balance threshold inside the customer balance CTE', () => {
    const question = '列出现金余额超过五百且还有未用次卡的客户';
    const parsed = parser.parse(question);
    const metricKeys = ['customer_balance', 'card_assets'];
    const requiredViews = ['agent_v3_customer_balance_view', 'agent_v3_card_asset_view'];
    const candidates = ASK_DATA_FREE_SQL_VIEWS.filter((view) => requiredViews.includes(view.viewName));
    const plan = buildAskDataQueryPlan({
      question,
      semanticIntent: { ...parsed.semanticIntent, metricKeys },
      candidateViews: candidates,
    });
    const sql = [
      'WITH customer_balances AS (',
      'SELECT cb.customer_id, cb.customer_name_masked, SUM(cb.cash_balance) AS cash_balance,',
      'SUM(cb.gift_balance) AS gift_balance FROM agent_v3_customer_balance_view cb',
      'WHERE cb.store_id = ANY(:allowedStoreIds)',
      'GROUP BY cb.customer_id, cb.customer_name_masked HAVING SUM(cb.cash_balance) > 500',
      ')',
      'SELECT ca.customer_id, cb.customer_name_masked, ca.customer_card_id, ca.card_name,',
      'MAX(cb.cash_balance) AS cash_balance, MAX(cb.gift_balance) AS gift_balance,',
      'ca.remaining_times, ca.expiry_date',
      'FROM agent_v3_card_asset_view ca JOIN customer_balances cb ON cb.customer_id = ca.customer_id',
      'WHERE ca.store_id = ANY(:allowedStoreIds) AND ca.remaining_times > 0',
      'GROUP BY ca.customer_id, cb.customer_name_masked, ca.customer_card_id, ca.card_name,',
      'ca.remaining_times, ca.expiry_date LIMIT 100',
    ].join(' ');
    const guard = new ReadOnlySqlGuard(new ReadOnlySqlParser()).inspect(sql, ASK_DATA_FREE_SQL_VIEWS, {
      storeIds: [6], permissions: ['*'], parameters: parsed.semanticIntent.timeRange,
      allowedJoinViewSets: [requiredViews],
      ...askDataTimeScopeOverrides(plan),
    });

    if (guard.status !== 'pass') throw new Error(guard.reasonCode + ': ' + guard.message);
    expect(validateAskDataQueryPlanExecution(plan, guard as any)).toEqual({ valid: true });
  });

  it.each([
    [
      '这周订单净收和日结净收各多少，差额单独给我',
      ['order_revenue', 'daily_net_receipts'],
      ['agent_v3_order_summary_view', 'agent_v3_daily_settlement_view'],
      ['net_revenue', 'net_receipts', 'order_settlement_difference'],
    ],
    [
      '昨天订单实收和支付流水金额能不能对上，两个数和差额都要',
      ['order_revenue', 'payment_flow'],
      ['agent_v3_order_summary_view', 'agent_v3_payment_refund_view'],
      ['order_paid_amount', 'payment_amount', 'order_payment_difference'],
    ],
  ])('requires both requested values and their cross-view difference: %s', (question, metricKeys, viewNames, outputs) => {
    const parsed = parser.parse(question);
    const semanticIntent = { ...parsed.semanticIntent, metricKeys };
    const candidates = ASK_DATA_FREE_SQL_VIEWS.filter((view) => viewNames.includes(view.viewName));
    const plan = buildAskDataQueryPlan({ question, semanticIntent, candidateViews: candidates });

    expect(plan.requiredViewNames).toEqual(viewNames);
    expect(plan.resultMode).toBe('scalar');
    expect(plan.requiredOutputFields).toEqual(expect.arrayContaining(outputs));
    expect(validateAskDataQueryPlan(plan, candidates)).toEqual({ valid: true });
  });

  it('treats cash and gift balances as side-by-side submetrics instead of period comparison slots', () => {
    const question = '门店现有现金余额和赠送余额分别合计多少';
    const parsed = parser.parse(question);
    const candidates = ASK_DATA_FREE_SQL_VIEWS.filter((view) => view.viewName === 'agent_v3_customer_balance_view');
    const plan = buildAskDataQueryPlan({ question, semanticIntent: parsed.semanticIntent, candidateViews: candidates });

    expect(plan.resultMode).toBe('scalar');
    expect(plan.requiredOutputFields).toEqual(expect.arrayContaining(['cash_balance', 'gift_balance']));
    expect(plan.requiredAnswerFacts).not.toEqual(expect.arrayContaining([
      'comparison_current', 'comparison_previous', 'comparison_difference',
    ]));
  });

  it('does not require a fabricated difference for inbound and outbound counts requested separately', () => {
    const question = '近三个月调入和调出单量分别多少';
    const parsed = parser.parse(question);
    const candidates = ASK_DATA_FREE_SQL_VIEWS.filter((view) => view.viewName === 'ask_data_transfer_status_view');
    const plan = buildAskDataQueryPlan({ question, semanticIntent: parsed.semanticIntent, candidateViews: candidates });

    expect(plan.resultMode).toBe('grouped');
    expect(plan.requiredOutputFields).toEqual(expect.arrayContaining(['direction', 'transfer_count', 'product_count']));
    expect(plan.requiredAnswerFacts).not.toEqual(expect.arrayContaining([
      'comparison_current', 'comparison_previous', 'comparison_difference',
    ]));
  });

  it('uses absolute zero-safe aggregation for per-product net outbound quantity', () => {
    const question = '这周每种耗材净出库量分别多少';
    const parsed = parser.parse(question);
    const candidates = ASK_DATA_FREE_SQL_VIEWS.filter((view) => view.viewName === 'agent_v3_stock_movement_view');
    const plan = buildAskDataQueryPlan({
      question,
      semanticIntent: { ...parsed.semanticIntent, metricKeys: ['inventory_movement'] },
      candidateViews: candidates,
    });

    expect(plan.aggregations).toEqual(expect.arrayContaining([
      expect.objectContaining({ field: 'quantity', alias: 'movement_quantity', fn: 'sum_abs', zeroOnEmpty: true }),
    ]));
  });

  it('accepts a one-source governed window share for operating cost structure', () => {
    const question = '本季度各成本科目金额和占比';
    const parsed = parser.parse(question);
    const candidates = ASK_DATA_FREE_SQL_VIEWS.filter((view) => view.viewName === 'ask_data_operating_cost_view');
    const plan = buildAskDataQueryPlan({ question, semanticIntent: parsed.semanticIntent, candidateViews: candidates });
    const guard = new ReadOnlySqlGuard(new ReadOnlySqlParser()).inspect(
      'SELECT category, SUM(amount) AS operating_cost, SUM(amount) / NULLIF(SUM(SUM(amount)) OVER (), 0) AS cost_share FROM ask_data_operating_cost_view WHERE store_id = ANY(:allowedStoreIds) AND cost_date >= :startAt AND cost_date < :endAt GROUP BY category LIMIT 100',
      ASK_DATA_FREE_SQL_VIEWS,
      { storeIds: [6], permissions: ['*'], parameters: parsed.semanticIntent.timeRange },
    );

    expect(validateAskDataQueryPlan(plan, candidates)).toEqual({ valid: true });
    if (guard.status !== 'pass') throw new Error(`${guard.reasonCode}: ${guard.message}`);
    expect(validateAskDataQueryPlanExecution(plan, guard as any)).toEqual({ valid: true });
  });

  it('sorts available booked staff by remaining idle minutes', () => {
    const question = '明天有预约的美容师里谁还剩最多空闲分钟';
    const parsed = parser.parse(question);
    const candidates = ASK_DATA_FREE_SQL_VIEWS.filter((view) =>
      ['ask_data_staff_capacity_view', 'agent_v3_reservation_view'].includes(view.viewName),
    );
    const plan = buildAskDataQueryPlan({ question, semanticIntent: parsed.semanticIntent, candidateViews: candidates });

    expect(plan.resultMode).toBe('ranking');
    expect(plan.sort).toEqual([{ field: 'idle_minutes', direction: 'desc' }]);
  });

  it('keeps tomorrow staff-capacity grouping on the tomorrow date window', () => {
    const question = '明天每位员工排班、预约和空闲分钟分别多少';
    const parsed = parser.parse(question);
    const candidates = ASK_DATA_FREE_SQL_VIEWS.filter((view) => view.viewName === 'ask_data_staff_capacity_view');
    const plan = buildAskDataQueryPlan({
      question,
      semanticIntent: { ...parsed.semanticIntent, metricKeys: ['staff_capacity'] },
      candidateViews: candidates,
    });

    expect(plan.timeRange?.label).toBe('明天');
    expect(plan.timeScopeMode).toBe('event_range');
    expect(plan.requiredGroupByFields).toEqual(['staff_id', 'staff_name']);
  });

  it('accepts a governed reservation-count CTE in a staff-capacity ranking', () => {
    const question = '明天有预约的美容师里谁还剩最多空闲分钟';
    const parsed = parser.parse(question);
    const metricKeys = ['staff_capacity', 'reservation_metrics'];
    const requiredViews = ['ask_data_staff_capacity_view', 'agent_v3_reservation_view'];
    const candidates = ASK_DATA_FREE_SQL_VIEWS.filter((view) => requiredViews.includes(view.viewName));
    const plan = buildAskDataQueryPlan({
      question,
      semanticIntent: { ...parsed.semanticIntent, metricKeys },
      candidateViews: candidates,
    });
    const sql = [
      'WITH booked_staff AS (',
      'SELECT r.staff_id, COUNT(DISTINCT r.reservation_id) AS reservation_count',
      'FROM agent_v3_reservation_view r',
      'WHERE r.store_id = ANY(:allowedStoreIds) AND r.date >= :startAt::date AND r.date < :endAt::date',
      "AND r.status NOT IN ('cancelled', 'canceled') GROUP BY r.staff_id",
      ')',
      'SELECT c.staff_id, c.staff_name, SUM(c.scheduled_minutes) AS scheduled_minutes,',
      'SUM(c.booked_minutes) AS booked_minutes, SUM(c.idle_minutes) AS idle_minutes,',
      'SUM(c.overbooked_minutes) AS overbooked_minutes,',
      'SUM(c.booked_minutes)::numeric / NULLIF(SUM(c.scheduled_minutes), 0) AS utilization_rate,',
      'MAX(b.reservation_count) AS reservation_count',
      'FROM ask_data_staff_capacity_view c JOIN booked_staff b ON b.staff_id = c.staff_id',
      'WHERE c.store_id = ANY(:allowedStoreIds) AND c.work_date >= :startAt::date AND c.work_date < :endAt::date',
      'AND c.idle_minutes > 0 AND c.overbooked_minutes = 0',
      'GROUP BY c.staff_id, c.staff_name',
      'ORDER BY idle_minutes DESC LIMIT 10',
    ].join(' ');
    const guard = new ReadOnlySqlGuard(new ReadOnlySqlParser()).inspect(sql, ASK_DATA_FREE_SQL_VIEWS, {
      storeIds: [6], permissions: ['*'], parameters: parsed.semanticIntent.timeRange,
      allowedJoinViewSets: [requiredViews],
      ...askDataTimeScopeOverrides(plan),
    });

    expect(plan.resultMode).toBe('ranking');
    if (guard.status !== 'pass') throw new Error(`${guard.reasonCode}: ${guard.message}`);
    expect(validateAskDataQueryPlanExecution(plan, guard as any)).toEqual({ valid: true });
  });

  it('accepts an exact governed ROI formula from a grouped CTE passthrough', () => {
    const question = '本月各活动转化数和估算 ROI 放在一起看';
    const parsed = parser.parse(question);
    const metricKeys = ['marketing_conversion', 'marketing_roi'];
    const requiredViews = ['agent_v3_marketing_conversion_view', 'ask_data_marketing_roi_view'];
    const candidates = ASK_DATA_FREE_SQL_VIEWS.filter((view) => requiredViews.includes(view.viewName));
    const plan = buildAskDataQueryPlan({
      question,
      semanticIntent: { ...parsed.semanticIntent, metricKeys },
      candidateViews: candidates,
    });
    const sql = [
      'WITH roi_metrics AS (',
      'SELECT r.activity_id, SUM(r.exposure_count) AS exposure_count, SUM(r.click_count) AS click_count,',
      'SUM(r.attributed_net_revenue) AS attributed_net_revenue, SUM(r.marketing_cost) AS marketing_cost,',
      'SUM(r.attributed_net_revenue) / NULLIF(SUM(r.marketing_cost), 0) AS roi,',
      'MAX(r.cost_source) AS cost_source',
      'FROM ask_data_marketing_roi_view r',
      'WHERE r.store_id = ANY(:allowedStoreIds) AND r.effect_date >= :startAt::date AND r.effect_date < :endAt::date',
      'AND r.activity_id IS NOT NULL AND r.activity_title IS NOT NULL',
      'GROUP BY r.activity_id',
      ')',
      'SELECT c.activity_id, c.activity_title, COALESCE(SUM(c.event_count), 0) AS event_count,',
      'COALESCE(SUM(c.lead_count), 0) AS lead_count, COALESCE(SUM(c.conversion_count), 0) AS conversion_count,',
      'COALESCE(SUM(c.attributed_revenue), 0) AS attributed_revenue,',
      'MAX(rm.exposure_count) AS exposure_count, MAX(rm.click_count) AS click_count,',
      'MAX(rm.attributed_net_revenue) AS attributed_net_revenue, MAX(rm.marketing_cost) AS marketing_cost,',
      'MAX(rm.roi) AS roi, MAX(rm.cost_source) AS cost_source',
      'FROM agent_v3_marketing_conversion_view c LEFT JOIN roi_metrics rm ON rm.activity_id = c.activity_id',
      'WHERE c.store_id = ANY(:allowedStoreIds) AND c.latest_event_at >= :startAt AND c.latest_event_at < :endAt',
      'AND c.activity_id IS NOT NULL AND c.activity_title IS NOT NULL',
      'GROUP BY c.activity_id, c.activity_title LIMIT 100',
    ].join(' ');
    const guard = new ReadOnlySqlGuard(new ReadOnlySqlParser()).inspect(sql, ASK_DATA_FREE_SQL_VIEWS, {
      storeIds: [6], permissions: ['*'], parameters: parsed.semanticIntent.timeRange,
      allowedJoinViewSets: [requiredViews],
      ...askDataTimeScopeOverrides(plan),
    });

    if (guard.status !== 'pass') throw new Error(guard.reasonCode + ': ' + guard.message);
    expect(validateAskDataQueryPlanExecution(plan, guard as any)).toEqual({ valid: true });
  });

  it('rejects a CTE ROI passthrough when the governed formula is changed', () => {
    const question = '本月各活动转化数和估算 ROI 放在一起看';
    const parsed = parser.parse(question);
    const metricKeys = ['marketing_conversion', 'marketing_roi'];
    const requiredViews = ['agent_v3_marketing_conversion_view', 'ask_data_marketing_roi_view'];
    const candidates = ASK_DATA_FREE_SQL_VIEWS.filter((view) => requiredViews.includes(view.viewName));
    const plan = buildAskDataQueryPlan({
      question,
      semanticIntent: { ...parsed.semanticIntent, metricKeys },
      candidateViews: candidates,
    });
    const sql = [
      'WITH roi_metrics AS (',
      'SELECT r.activity_id, SUM(r.exposure_count) AS exposure_count, SUM(r.click_count) AS click_count,',
      'SUM(r.attributed_net_revenue) AS attributed_net_revenue, SUM(r.marketing_cost) AS marketing_cost,',
      'SUM(r.attributed_net_revenue) / NULLIF(SUM(r.exposure_count), 0) AS roi,',
      'MAX(r.cost_source) AS cost_source',
      'FROM ask_data_marketing_roi_view r',
      'WHERE r.store_id = ANY(:allowedStoreIds) AND r.effect_date >= :startAt::date AND r.effect_date < :endAt::date',
      'AND r.activity_id IS NOT NULL AND r.activity_title IS NOT NULL',
      'GROUP BY r.activity_id',
      ')',
      'SELECT c.activity_id, c.activity_title, COALESCE(SUM(c.event_count), 0) AS event_count,',
      'COALESCE(SUM(c.lead_count), 0) AS lead_count, COALESCE(SUM(c.conversion_count), 0) AS conversion_count,',
      'COALESCE(SUM(c.attributed_revenue), 0) AS attributed_revenue,',
      'MAX(rm.exposure_count) AS exposure_count, MAX(rm.click_count) AS click_count,',
      'MAX(rm.attributed_net_revenue) AS attributed_net_revenue, MAX(rm.marketing_cost) AS marketing_cost,',
      'MAX(rm.roi) AS roi, MAX(rm.cost_source) AS cost_source',
      'FROM agent_v3_marketing_conversion_view c LEFT JOIN roi_metrics rm ON rm.activity_id = c.activity_id',
      'WHERE c.store_id = ANY(:allowedStoreIds) AND c.latest_event_at >= :startAt AND c.latest_event_at < :endAt',
      'AND c.activity_id IS NOT NULL AND c.activity_title IS NOT NULL',
      'GROUP BY c.activity_id, c.activity_title LIMIT 100',
    ].join(' ');
    const guard = new ReadOnlySqlGuard(new ReadOnlySqlParser()).inspect(sql, ASK_DATA_FREE_SQL_VIEWS, {
      storeIds: [6], permissions: ['*'], parameters: parsed.semanticIntent.timeRange,
      allowedJoinViewSets: [requiredViews],
      ...askDataTimeScopeOverrides(plan),
    });

    if (guard.status !== 'pass') throw new Error(guard.reasonCode + ': ' + guard.message);
    expect(validateAskDataQueryPlanExecution(plan, guard as any)).toEqual({
      valid: false,
      reasonCode: 'query_plan_derived_metric_source_missing',
      message: '派生指标 roi 缺少受控来源字段。',
    });
  });

  it('accepts a zero-safe one-to-one procurement CTE in a supplier grouped result', () => {
    const question = '每家供应商未到货采购单有多少，平均交付天数也带上';
    const parsed = parser.parse(question);
    const metricKeys = ['procurement_detail', 'supplier_performance'];
    const requiredViews = ['agent_v3_purchase_procurement_view', 'agent_v3_supplier_performance_view'];
    const candidates = ASK_DATA_FREE_SQL_VIEWS.filter((view) => requiredViews.includes(view.viewName));
    const plan = buildAskDataQueryPlan({
      question,
      semanticIntent: { ...parsed.semanticIntent, metricKeys },
      candidateViews: candidates,
    });
    const sql = [
      'WITH pending AS (',
      'SELECT p.supplier_id, COUNT(DISTINCT p.procurement_id) AS pending_procurement_count',
      'FROM agent_v3_purchase_procurement_view p',
      'WHERE p.store_id = ANY(:allowedStoreIds)',
      "AND p.status NOT IN ('received', 'completed', 'cancelled', 'canceled')",
      'GROUP BY p.supplier_id',
      ')',
      'SELECT s.supplier_id, s.supplier_name,',
      'COALESCE(pending.pending_procurement_count, 0) AS pending_procurement_count,',
      's.avg_delivery_days AS avg_delivery_days, s.procurement_count AS procurement_count,',
      's.procurement_amount AS procurement_amount',
      'FROM agent_v3_supplier_performance_view s',
      'LEFT JOIN pending ON pending.supplier_id = s.supplier_id',
      'WHERE s.store_id = ANY(:allowedStoreIds)',
      'LIMIT 100',
    ].join(' ');
    const guard = new ReadOnlySqlGuard(new ReadOnlySqlParser()).inspect(sql, ASK_DATA_FREE_SQL_VIEWS, {
      storeIds: [6], permissions: ['*'], parameters: parsed.semanticIntent.timeRange,
      allowedJoinViewSets: [requiredViews],
      ...askDataTimeScopeOverrides(plan),
    });

    expect(plan.resultMode).toBe('grouped');
    if (guard.status !== 'pass') throw new Error(`${guard.reasonCode}: ${guard.message}`);
    expect(validateAskDataQueryPlanExecution(plan, guard as any)).toEqual({ valid: true });
  });

  it('accepts a governed CTE aggregation projected under the requested cross-view alias', () => {
    const question = '昨天订单实收和支付流水金额能不能对上，两个数和差额都要';
    const parsed = parser.parse(question);
    const metricKeys = ['order_revenue', 'payment_flow'];
    const semanticIntent = { ...parsed.semanticIntent, metricKeys };
    const requiredViews = ['agent_v3_order_summary_view', 'agent_v3_payment_refund_view'];
    const candidates = ASK_DATA_FREE_SQL_VIEWS.filter((view) => requiredViews.includes(view.viewName));
    const plan = buildAskDataQueryPlan({ question, semanticIntent, candidateViews: candidates });
    const sql = [
      'WITH order_totals AS (',
      'SELECT COALESCE(SUM(o.paid_amount), 0) AS paid_amount FROM agent_v3_order_summary_view o',
      'WHERE o.store_id = ANY(:allowedStoreIds) AND o.order_created_at >= :startAt AND o.order_created_at < :endAt',
      ')',
      'SELECT COALESCE(MAX(ot.paid_amount), 0) AS order_paid_amount, COALESCE(SUM(p.payment_amount), 0) AS payment_amount,',
      'COALESCE(SUM(p.refund_amount), 0) AS refund_amount, COUNT(p.order_id) AS flow_count,',
      'COALESCE(MAX(ot.paid_amount), 0) - COALESCE(SUM(p.payment_amount), 0) AS order_payment_difference',
      'FROM agent_v3_payment_refund_view p CROSS JOIN order_totals ot',
      'WHERE p.store_id = ANY(:allowedStoreIds) AND p.paid_at >= :startAt AND p.paid_at < :endAt LIMIT 1',
    ].join(' ');
    const guard = new ReadOnlySqlGuard(new ReadOnlySqlParser()).inspect(sql, ASK_DATA_FREE_SQL_VIEWS, {
      storeIds: [6], permissions: ['*'], parameters: parsed.semanticIntent.timeRange,
      allowedJoinViewSets: [requiredViews],
    });

    expect(guard.status).toBe('pass');
    expect(validateAskDataQueryPlanExecution(plan, guard as any)).toEqual({ valid: true });
  });

  it('rejects grouped repair for balance plus unused-card detail and accepts the row-level sum filter', () => {
    const question = '哪些客户同时有储值余额和未用完的焕肤清洁 12 次卡';
    const parsed = parser.parse(question);
    const candidates = ASK_DATA_FREE_SQL_VIEWS.filter((view) =>
      ['agent_v3_customer_balance_view', 'agent_v3_card_asset_view'].includes(view.viewName),
    );
    const plan = buildAskDataQueryPlan({ question, semanticIntent: parsed.semanticIntent, candidateViews: candidates });
    const inspectSql = (sql: string) => new ReadOnlySqlGuard(new ReadOnlySqlParser()).inspect(
      sql,
      ASK_DATA_FREE_SQL_VIEWS,
      { storeIds: [6], permissions: ['*'] },
    );
    const grouped = inspectSql([
      'SELECT b.customer_id, b.customer_name_masked, c.customer_card_id, c.card_name, b.cash_balance, b.gift_balance, c.remaining_times, c.expiry_date',
      'FROM agent_v3_customer_balance_view b JOIN agent_v3_card_asset_view c ON b.customer_id = c.customer_id',
      "WHERE c.remaining_times > 0 AND c.card_name ILIKE '%焕肤清洁 12 次卡%'",
      'GROUP BY b.customer_id, b.customer_name_masked, c.customer_card_id, c.card_name, b.cash_balance, b.gift_balance, c.remaining_times, c.expiry_date',
      'HAVING SUM(b.cash_balance) + SUM(b.gift_balance) > 0 LIMIT 100',
    ].join(' '));
    expect(grouped.status).toBe('pass');
    if (grouped.status !== 'pass') throw new Error(grouped.message);
    expectPlanFailure(plan, grouped, 'query_plan_detail_grouped');

    const detail = inspectSql([
      'SELECT b.customer_id, b.customer_name_masked, c.customer_card_id, c.card_name, b.cash_balance, b.gift_balance, c.remaining_times, c.expiry_date',
      'FROM agent_v3_customer_balance_view b JOIN agent_v3_card_asset_view c ON b.customer_id = c.customer_id',
      "WHERE (b.cash_balance + b.gift_balance) > 0 AND c.remaining_times > 0 AND c.card_name ILIKE '%焕肤清洁 12 次卡%' LIMIT 100",
    ].join(' '));
    expect(detail.status).toBe('pass');
    if (detail.status !== 'pass') throw new Error(detail.message);
    expect(validateAskDataQueryPlanExecution(plan, detail)).toEqual({ valid: true });
  });

  it('rejects a cartesian two-view customer result and accepts a customer-id join', () => {
    const question = '哪些客户同时有储值余额和未用完的综合养护 20 次卡';
    const parsed = parser.parse(question);
    const candidates = ASK_DATA_FREE_SQL_VIEWS.filter((view) =>
      ['agent_v3_customer_balance_view', 'agent_v3_card_asset_view'].includes(view.viewName),
    );
    const plan = buildAskDataQueryPlan({ question, semanticIntent: parsed.semanticIntent, candidateViews: candidates });
    const baseSelect = 'SELECT b.customer_id, b.customer_name_masked, b.cash_balance, b.gift_balance, c.customer_card_id, c.card_name, c.remaining_times, c.expiry_date';
    const where = "WHERE (b.cash_balance + b.gift_balance) > 0 AND c.remaining_times > 0 AND c.card_name ILIKE '%综合养护 20 次卡%' LIMIT 100";
    const inspectSql = (join: string) => new ReadOnlySqlGuard(new ReadOnlySqlParser()).inspect(
      `${baseSelect} FROM agent_v3_customer_balance_view b JOIN agent_v3_card_asset_view c ON ${join} ${where}`,
      ASK_DATA_FREE_SQL_VIEWS,
      { storeIds: [6], permissions: ['*'] },
    );
    const cartesian = inspectSql('TRUE');
    expect(cartesian.status).toBe('pass');
    if (cartesian.status !== 'pass') throw new Error(cartesian.message);
    expectPlanFailure(plan, cartesian, 'query_plan_join_key_mismatch');

    const joined = inspectSql('b.customer_id = c.customer_id');
    expect(joined.status).toBe('pass');
    if (joined.status !== 'pass') throw new Error(joined.message);
    expect(validateAskDataQueryPlanExecution(plan, joined)).toEqual({ valid: true });
  });

  it('blocks a balance ranking that sorts cash instead of governed total balance', () => {
    const { plan, guard } = inspect(
      '当前储值余额最高的前 10 位客户是谁',
      'customer_balance',
      'agent_v3_customer_balance_view',
      'SELECT customer_id, SUM(cash_balance) AS cash_balance, SUM(gift_balance) AS gift_balance FROM agent_v3_customer_balance_view GROUP BY customer_id ORDER BY cash_balance DESC LIMIT 10',
    );
    expect(plan.sort).toEqual([{ field: 'total_balance', direction: 'desc', nulls: 'last' }]);
    expectPlanFailure(plan, guard, 'query_plan_required_output_missing');
  });

  it('blocks a promotion type count that returns issue and usage totals only', () => {
    const { plan, guard } = inspect(
      '按优惠类型统计当前活动数量',
      'promotion_offer',
      'agent_v3_promotion_offer_view',
      'SELECT SUM(issued_count) AS issued_count, SUM(used_count) AS used_count FROM agent_v3_promotion_offer_view LIMIT 1',
    );
    expect(plan.requiredOutputFields).toEqual(expect.arrayContaining(['type', 'promotion_count']));
    expectPlanFailure(plan, guard, 'query_plan_required_output_missing');
  });

  it('blocks a promotion usage ranking ordered by issued count', () => {
    const { plan, guard } = inspect(
      '使用次数最多的优惠活动前 10 名',
      'promotion_offer',
      'agent_v3_promotion_offer_view',
      'SELECT promotion_id, promotion_name, SUM(used_count) AS used_count FROM agent_v3_promotion_offer_view GROUP BY promotion_id, promotion_name ORDER BY SUM(issued_count) DESC LIMIT 10',
    );
    expect(plan.sort).toEqual([{ field: 'used_count', direction: 'desc' }]);
    expectPlanFailure(plan, guard, 'query_plan_order_by_metric_mismatch');
  });

  it('blocks a recent-hire query that omits employee identity and hire time', () => {
    const { plan, guard } = inspect(
      '最近入职的员工前 10 名是谁',
      'staff_profile',
      'agent_v3_staff_profile_view',
      'SELECT staff_id, COUNT(staff_id) AS staff_count FROM agent_v3_staff_profile_view GROUP BY staff_id ORDER BY staff_count DESC LIMIT 10',
    );
    expect(plan.requiredOutputFields).toEqual(expect.arrayContaining(['staff_id', 'staff_name', 'created_at']));
    expectPlanFailure(plan, guard, 'query_plan_required_output_missing');
  });

  it('blocks a BOM deviation-rate ranking ordered by standard quantity', () => {
    const { plan, guard } = inspect(
      '按项目列出实际耗材偏差率最高的前 10 名',
      'bom_variance',
      'ask_data_bom_consumption_variance_view',
      'SELECT project_id, project_name, SUM(standard_qty) AS standard_qty, SUM(actual_qty) AS actual_qty, SUM(deviation_qty) AS deviation_qty, AVG(deviation_rate) AS deviation_rate FROM ask_data_bom_consumption_variance_view GROUP BY project_id, project_name ORDER BY standard_qty DESC LIMIT 10',
    );
    expect(plan.sort).toEqual([{ field: 'deviation_rate', direction: 'desc', nulls: 'last' }]);
    expectPlanFailure(plan, guard, 'query_plan_derived_metric_source_missing');
  });

  it('blocks feedback statistics grouped by customer in addition to feedback type', () => {
    const { plan, guard } = inspect(
      '按反馈类型统计客户反馈数量和平均评分',
      'customer_feedback',
      'ask_data_customer_feedback_view',
      'SELECT feedback_type, customer_id, COUNT(DISTINCT feedback_id) AS feedback_count, AVG(rating) AS average_rating FROM ask_data_customer_feedback_view GROUP BY feedback_type, customer_id LIMIT 100',
    );
    expect(plan.forbiddenGroupByFields).toContain('customer_id');
    expectPlanFailure(plan, guard, 'query_plan_group_by_forbidden');
  });

  it('blocks completed-transfer detail rows when the question asks for a total count', () => {
    const { plan, guard } = inspect(
      '已经完成的库存调拨单一共有多少张',
      'transfer_status',
      'ask_data_transfer_status_view',
      "SELECT transfer_id, product_count FROM ask_data_transfer_status_view WHERE status IN ('completed','received','done') LIMIT 20",
    );
    expect(plan.resultMode).toBe('scalar');
    expect(plan.limit).toBe(1);
    expectPlanFailure(plan, guard, 'query_plan_required_output_missing');
  });

  it('blocks a daily trend grouped by the raw timestamp', () => {
    const { plan, guard } = inspect(
      '最近三个月库存报废金额的按日趋势',
      'inventory_scrap',
      'agent_v3_inventory_scrap_view',
      'SELECT occurred_at AS trend_day, SUM(scrap_quantity) AS scrap_quantity, SUM(loss_amount) AS loss_amount FROM agent_v3_inventory_scrap_view GROUP BY occurred_at ORDER BY trend_day ASC LIMIT 100',
    );
    expect(plan.timeGrain).toEqual(expect.objectContaining({ granularity: 'day', alias: 'trend_day' }));
    expectPlanFailure(plan, guard, 'query_plan_time_grain_mismatch');
  });

  it('blocks a grouped trend that also selects an ungrouped raw timestamp', () => {
    const { plan, guard } = inspect(
      '最近三个月库存报废金额的按日趋势',
      'inventory_scrap',
      'agent_v3_inventory_scrap_view',
      "SELECT DATE_TRUNC('day', occurred_at)::date AS trend_day, SUM(scrap_quantity) AS scrap_quantity, SUM(loss_amount) AS loss_amount, occurred_at FROM agent_v3_inventory_scrap_view GROUP BY DATE_TRUNC('day', occurred_at)::date ORDER BY trend_day ASC LIMIT 100",
    );
    expectPlanFailure(plan, guard, 'query_plan_select_not_grouped');
  });

  it('requires an implicit monthly time dimension for a multi-month trend', () => {
    const { plan } = inspect(
      '最近三个月实际耗材偏差率的变化趋势',
      'bom_variance',
      'ask_data_bom_consumption_variance_view',
      "SELECT DATE_TRUNC('month', occurred_at)::date AS trend_month, SUM(standard_qty) AS standard_qty, SUM(actual_qty) AS actual_qty, SUM(deviation_qty) / NULLIF(SUM(standard_qty), 0) AS deviation_rate FROM ask_data_bom_consumption_variance_view GROUP BY trend_month ORDER BY trend_month ASC LIMIT 100",
    );
    expect(plan.timeGrain).toEqual(expect.objectContaining({ granularity: 'month', alias: 'trend_month' }));
    expect(plan.requiredOutputFields).toContain('trend_month');
    expect(plan.requiredGroupByFields).toContain('trend_month');
  });

  it('forbids arithmetic between inventory quantity and revenue amount', () => {
    const question = '这个季度耗材消耗和收入的对比怎么样';
    const parsed = parser.parse(question, new Date('2026-08-02T00:00:00.000Z'));
    const candidates = ASK_DATA_FREE_SQL_VIEWS.filter((view) =>
      ['agent_v3_stock_movement_view', 'agent_v3_order_summary_view'].includes(view.viewName),
    );
    const plan = buildAskDataQueryPlan({
      question,
      semanticIntent: { ...parsed.semanticIntent, metricKeys: ['inventory_movement', 'order_revenue'] },
      candidateViews: candidates,
    });
    const sql = [
      'WITH revenue_summary AS (',
      'SELECT SUM(o.net_amount) AS net_revenue, COUNT(DISTINCT o.order_id) AS order_count',
      'FROM agent_v3_order_summary_view AS o',
      'WHERE o.store_id = ANY(:allowedStoreIds) AND o.order_created_at >= :startAt AND o.order_created_at < :endAt',
      ')',
      'SELECT s.product_id, s.product_name, s.sku, MAX(r.net_revenue) AS net_revenue,',
      'MAX(r.order_count) AS order_count, SUM(s.quantity) AS movement_quantity, COUNT(s.movement_id) AS movement_count,',
      'MAX(r.net_revenue) - SUM(s.quantity) AS comparison_difference',
      'FROM agent_v3_stock_movement_view AS s CROSS JOIN revenue_summary AS r',
      'WHERE s.store_id = ANY(:allowedStoreIds) AND s.occurred_at >= :startAt AND s.occurred_at < :endAt',
      'GROUP BY s.product_id, s.product_name, s.sku LIMIT 100',
    ].join(' ');
    const guard = new ReadOnlySqlGuard(new ReadOnlySqlParser()).inspect(sql, ASK_DATA_FREE_SQL_VIEWS, {
      storeIds: [6],
      permissions: ['*'],
      parameters: parsed.semanticIntent.timeRange,
    });

    expect(plan.requiredAnswerFacts).toContain('all_requested_metrics');
    expect(plan.requiredAnswerFacts).not.toContain('comparison_difference');
    expect(plan.assumptions).toContain('耗材消耗数量与收入金额单位不同，仅并列展示，不计算差额、变化率或投入产出；如需经营对比，应改用耗材成本金额。');
    if (guard.status !== 'pass') throw new Error(`${guard.reasonCode}: ${guard.message}`);
    expectPlanFailure(plan, guard, 'query_plan_incompatible_metric_arithmetic');
  });

  it('does not inject creation-time scope into current transfer state queries', () => {
    const { plan, guard } = inspect(
      '当前有哪些未完成的调出单',
      'transfer_status',
      'ask_data_transfer_status_view',
      "SELECT transfer_id, transfer_no, product_count, status, direction, counterpart_store_name, created_at, updated_at FROM ask_data_transfer_status_view WHERE direction = 'outbound' AND status NOT IN ('completed','received','done') LIMIT 100",
    );
    expect(plan.timeScopeMode).toBe('current_snapshot');
    expect(guard.status).toBe('pass');
    if (guard.status === 'pass') expect(guard.safeSql).not.toContain('created_at >= :startAt');
  });

  it.each([
    ':endAt::date + 30',
    ":endAt::date + INTERVAL '30 days'",
    "(:endAt::date + INTERVAL '30 days')::date",
  ])('accepts governed expiring-card as-of SQL using %s', (upperBound) => {
    const question = '哪些敏感修护 8 次卡快过期还没核销完';
    const sql = [
      'SELECT customer_id, customer_name_masked, customer_card_id, card_name, remaining_times, expiry_date',
      'FROM agent_v3_card_asset_view',
      'WHERE remaining_times > 0',
      `AND expiry_date BETWEEN :endAt::date AND ${upperBound}`,
      "AND card_name ILIKE '%敏感修护 8 次卡%'",
      'LIMIT 100',
    ].join(' ');
    const { plan, guard } = inspect(question, 'card_assets', 'agent_v3_card_asset_view', sql);

    expect(plan.filters).toEqual(expect.arrayContaining([
      { field: 'remaining_times', operator: 'gt', value: 0 },
      { field: 'expiry_date', operator: 'between_as_of_days', value: 30 },
      { field: 'card_name', operator: 'contains', value: '敏感修护 8 次卡' },
    ]));
    expect(validateAskDataQueryPlanExecution(plan, guard as any)).toEqual({ valid: true });
  });

  it('parses Chinese expiry and remaining-count thresholds for card details', () => {
    const question = '六十天内到期并且还剩五次以上的卡项客户有哪些';
    const sql = [
      'SELECT customer_card_id, customer_id, customer_name_masked, card_name, remaining_times, expiry_date',
      'FROM agent_v3_card_asset_view',
      'WHERE remaining_times >= 5',
      'AND expiry_date BETWEEN :endAt::date AND (:endAt::date + 60)',
      'LIMIT 100',
    ].join(' ');
    const { plan, guard } = inspect(question, 'card_assets', 'agent_v3_card_asset_view', sql);

    expect(plan.filters).toEqual(expect.arrayContaining([
      { field: 'remaining_times', operator: 'gte', value: 5 },
      { field: 'expiry_date', operator: 'between_as_of_days', value: 60 },
    ]));
    expect(plan.timeScopeMode).toBe('none');
    expect(validateAskDataQueryPlanExecution(plan, guard as any)).toEqual({ valid: true });
  });

  it('scopes an explicit future card-expiry window by expiry_date instead of treating it as a static snapshot', () => {
    const question = '列出未来 30 天到期且剩余次数超过 5 次的客户次卡';
    const sql = [
      'SELECT customer_card_id, customer_id, customer_name_masked, card_name, remaining_times, expiry_date',
      'FROM agent_v3_card_asset_view',
      'WHERE remaining_times > 5',
      'AND expiry_date >= :startAt::date',
      'AND expiry_date < :endAt::date',
      'LIMIT 100',
    ].join(' ');
    const { plan, guard } = inspect(question, 'card_assets', 'agent_v3_card_asset_view', sql);

    expect(plan.timeScopeMode).toBe('event_range');
    expect(plan.timeFieldOverrides).toEqual({ agent_v3_card_asset_view: 'expiry_date' });
    expect(plan.filters).toContainEqual({ field: 'remaining_times', operator: 'gt', value: 5 });
    expect(plan.filters.some((filter) => filter.field === 'card_name')).toBe(false);
    expect(validateAskDataQueryPlanExecution(plan, guard as any)).toEqual({ valid: true });
  });

  it('accepts a governed expiring-card window based on asOfTime', () => {
    const question = '哪些焕肤清洁 12 次卡快过期还没核销完';
    const sql = [
      'SELECT customer_id, customer_name_masked, customer_card_id, card_name, remaining_times, expiry_date',
      'FROM agent_v3_card_asset_view',
      'WHERE remaining_times > 0',
      'AND expiry_date BETWEEN :asOfTime::date AND (:asOfTime::date + 30)',
      "AND card_name ILIKE '%焕肤清洁 12 次卡%'",
      'LIMIT 100',
    ].join(' ');
    const { plan, guard } = inspect(question, 'card_assets', 'agent_v3_card_asset_view', sql);

    expect(validateAskDataQueryPlanExecution(plan, guard as any)).toEqual({ valid: true });
  });

  it('accepts equivalent qualified lower and upper bounds for an expiring-card window', () => {
    const question = '哪些焕肤清洁 12 次卡快过期还没核销完';
    const sql = [
      'SELECT customer_id, customer_name_masked, customer_card_id, card_name, remaining_times, expiry_date',
      'FROM agent_v3_card_asset_view',
      'WHERE agent_v3_card_asset_view.remaining_times > 0',
      'AND agent_v3_card_asset_view.expiry_date >= :endAt::date',
      'AND agent_v3_card_asset_view.expiry_date <= (:endAt::date + 30)',
      "AND agent_v3_card_asset_view.card_name ILIKE '%焕肤清洁 12 次卡%'",
      'LIMIT 100',
    ].join(' ');
    const { plan, guard } = inspect(question, 'card_assets', 'agent_v3_card_asset_view', sql);

    expect(validateAskDataQueryPlanExecution(plan, guard as any)).toEqual({ valid: true });
  });

  it('still rejects an ungoverned endAt filter on a current snapshot query', () => {
    const { plan, guard } = inspect(
      '当前有哪些未完成的调出单',
      'transfer_status',
      'ask_data_transfer_status_view',
      "SELECT transfer_id, transfer_no, product_count, status, direction, counterpart_store_name, created_at, updated_at FROM ask_data_transfer_status_view WHERE direction = 'outbound' AND status NOT IN ('completed','received','done') AND updated_at < :endAt LIMIT 100",
    );

    expect(plan.timeScopeMode).toBe('current_snapshot');
    expectPlanFailure(plan, guard, 'query_plan_unexpected_time_filter');
  });

  it('accepts qualified and date-cast active promotion interval bounds', () => {
    const { plan, guard } = inspect(
      '当前有哪些仍在生效的全局优惠',
      'promotion_offer',
      'agent_v3_promotion_offer_view',
      "SELECT p.promotion_id, p.promotion_name, p.scope_type, p.issued_count, p.used_count, p.type, p.status, p.start_at, p.end_at FROM agent_v3_promotion_offer_view p WHERE p.scope_type = 'global' AND p.start_at <= :endAt::date AND COALESCE(p.end_at, :endAt::date) >= :endAt::date LIMIT 100",
    );

    expect(plan.timeScopeMode).toBe('active_interval');
    expect(validateAskDataQueryPlanExecution(plan, guard as any)).toEqual({ valid: true });
  });

  it('accepts the server-controlled asOfTime parameter for a current active promotion interval', () => {
    const { plan, guard } = inspect(
      '当前有哪些仍在生效的全局优惠',
      'promotion_offer',
      'agent_v3_promotion_offer_view',
      "SELECT p.promotion_id, p.promotion_name, p.scope_type, p.issued_count, p.used_count, p.type, p.status, p.start_at, p.end_at FROM agent_v3_promotion_offer_view p WHERE p.scope_type = 'global' AND p.start_at <= :asOfTime::date AND COALESCE(p.end_at, :asOfTime::date) >= :asOfTime::date LIMIT 100",
    );

    expect(validateAskDataQueryPlanExecution(plan, guard as any)).toEqual({ valid: true });
  });

  it('treats recent updates as an ordered detail list rather than a 30-day aggregate', () => {
    const parsed = parser.parse('列出最近更新的 20 张库存调拨单', new Date('2026-08-02T00:00:00.000Z'));
    const candidates = ASK_DATA_FREE_SQL_VIEWS.filter((view) => view.viewName === 'ask_data_transfer_status_view');
    const plan = buildAskDataQueryPlan({
      question: '列出最近更新的 20 张库存调拨单',
      semanticIntent: { ...parsed.semanticIntent, metricKeys: ['transfer_status'] },
      candidateViews: candidates,
    });
    expect(plan.resultMode).toBe('detail');
    expect(plan.timeRange).toBeUndefined();
    expect(plan.timeScopeMode).toBe('none');
    expect(plan.requiredOutputFields).toEqual(expect.arrayContaining(['transfer_id', 'transfer_no', 'updated_at']));
    expect(plan.sort).toEqual([{ field: 'updated_at', direction: 'desc' }]);
    expect(plan.limit).toBe(20);
  });

  it('pivots inbound and outbound comparison so an absent direction is still reported as zero', () => {
    const parsed = parser.parse('调入和调出方向的调拨单数量对比');
    const candidates = ASK_DATA_FREE_SQL_VIEWS.filter((view) => view.viewName === 'ask_data_transfer_status_view');
    const plan = buildAskDataQueryPlan({
      question: '调入和调出方向的调拨单数量对比',
      semanticIntent: { ...parsed.semanticIntent, metricKeys: ['transfer_status'] },
      candidateViews: candidates,
    });
    expect(plan.resultMode).toBe('scalar');
    expect(plan.dimensions).toEqual([]);
    expect(plan.filters.some((item) => item.field === 'direction')).toBe(false);
    expect(plan.requiredOutputFields).toEqual(['inbound_transfer_count', 'outbound_transfer_count', 'transfer_count_difference']);
    expect(plan.comparisonMode).toBe('dimension');
    expect(plan.requiredAnswerFacts).toEqual(expect.arrayContaining(['all_requested_dimensions', 'comparison_difference']));
    expect(plan.requiredAnswerFacts).not.toEqual(expect.arrayContaining(['comparison_current', 'comparison_previous']));
  });

  it('turns inactive-customer wording into a governed snapshot threshold', () => {
    const question = '帮我找一下45天没来的客户，大概有多少人';
    const parsed = parser.parse(question, new Date('2026-08-02T00:00:00.000Z'));
    const candidates = ASK_DATA_FREE_SQL_VIEWS.filter((view) => view.viewName === 'ask_data_customer_profile_summary_view');
    const plan = buildAskDataQueryPlan({ question, semanticIntent: parsed.semanticIntent, candidateViews: candidates });
    expect(plan.metricKeys).toEqual(['customer_profile']);
    expect(plan.timeScopeMode).toBe('none');
    expect(plan.filters).toContainEqual({ field: 'days_since_last_visit', operator: 'gte', value: 45 });
    expect(plan.requiredOutputFields).toContain('customer_count');
  });

  it('uses the governed birthday window instead of profile update time', () => {
    const question = '帮我找下这个月快过生日的客户';
    const parsed = parser.parse(question, new Date('2026-08-02T00:00:00.000Z'));
    const candidates = ASK_DATA_FREE_SQL_VIEWS.filter((view) => view.viewName === 'ask_data_customer_profile_summary_view');
    const plan = buildAskDataQueryPlan({ question, semanticIntent: parsed.semanticIntent, candidateViews: candidates });
    expect(plan.resultMode).toBe('detail');
    expect(plan.timeFieldOverrides).toEqual({ ask_data_customer_profile_summary_view: 'next_birthday_date' });
    expect(plan.filters).toContainEqual({ field: 'days_until_birthday', operator: 'between', value: [0, 30] });
    expect(plan.requiredOutputFields).toEqual(expect.arrayContaining(['customer_id', 'customer_name_masked', 'next_birthday_date', 'days_until_birthday']));
    expect(plan.assumptions).toContain('“快过生日”默认查询未来 30 天。');
  });

  it('groups new customers by governed source channel', () => {
    const question = '这个月新客主要来自什么渠道';
    const parsed = parser.parse(question, new Date('2026-08-02T00:00:00.000Z'));
    const candidates = ASK_DATA_FREE_SQL_VIEWS.filter((view) => view.viewName === 'ask_data_customer_profile_summary_view');
    const plan = buildAskDataQueryPlan({ question, semanticIntent: parsed.semanticIntent, candidateViews: candidates });
    expect(plan.answerShape).toBe('ranking');
    expect(plan.dimensions.map((item) => item.field)).toContain('source_channel');
    expect(plan.timeFieldOverrides).toEqual({ ask_data_customer_profile_summary_view: 'first_order_at' });
    expect(plan.filters).toContainEqual({ field: 'customer_status', operator: 'eq', value: 'new' });
  });

  it('requires card-use facts for customers who bought a card but never used it', () => {
    const question = '哪些客户买了次卡但最近一直不来用';
    const parsed = parser.parse(question, new Date('2026-08-02T00:00:00.000Z'));
    const candidates = ASK_DATA_FREE_SQL_VIEWS.filter((view) => view.viewName === 'ask_data_customer_profile_summary_view');
    const plan = buildAskDataQueryPlan({ question, semanticIntent: parsed.semanticIntent, candidateViews: candidates });
    expect(plan.resultMode).toBe('detail');
    expect(plan.filters).toContainEqual({ field: 'unused_card_count', operator: 'gt', value: 0 });
    expect(plan.requiredOutputFields).toEqual(expect.arrayContaining(['remaining_card_times', 'unused_card_count', 'last_card_usage_at']));
  });

  it.each([
    '我们每个月大概会损耗多少货值',
    '每个月库存报废金额大概多少',
    '逐月看一下报损货值',
    '每个月通常损耗多少钱',
    '按每个月展示库存损失',
  ])('governs open-ended monthly loss wording as a three-complete-month trend: %s', (question) => {
    const parsed = parser.parse(question, new Date('2026-08-02T00:00:00.000Z'));
    const candidates = ASK_DATA_FREE_SQL_VIEWS.filter((view) => view.viewName === 'agent_v3_inventory_scrap_view');
    const plan = buildAskDataQueryPlan({
      question,
      semanticIntent: { ...parsed.semanticIntent, metricKeys: ['inventory_scrap'] },
      candidateViews: candidates,
    });

    expect(plan.answerShape).toBe('trend');
    expect(plan.timeRange?.label).toBe('近 3 个完整自然月');
    expect(plan.timeGrain).toEqual(expect.objectContaining({
      sourceField: 'occurred_at',
      granularity: 'month',
      alias: 'trend_month',
      expression: "DATE_TRUNC('month', occurred_at)::date",
    }));
    expect(plan.assumptions).toContain('“每个月”未指定范围，默认查询近 3 个完整自然月并按月展示。');
  });

  it.each([
    '今天现金、微信、支付宝各收了多少',
    '今天现金和微信分别收了多少',
    '本月微信、支付宝各收款多少',
    '现金、银行卡、支付宝分别收了多少钱',
    '会员余额、微信和现金各支付多少',
  ])('uses complete conditional payment-method aggregates instead of a one-sided filter: %s', (question) => {
    const parsed = parser.parse(question, new Date('2026-08-02T00:00:00.000Z'));
    const candidates = ASK_DATA_FREE_SQL_VIEWS.filter((view) => view.viewName === 'agent_v3_payment_refund_view');
    const plan = buildAskDataQueryPlan({
      question,
      semanticIntent: { ...parsed.semanticIntent, metricKeys: ['payment_flow'] },
      candidateViews: candidates,
    });

    expect(plan.resultMode).toBe('scalar');
    expect(plan.comparisonMode).toBe('dimension');
    expect(plan.filters.some((filter) => filter.field === 'payment_method')).toBe(false);
    expect(plan.aggregations.length).toBeGreaterThanOrEqual(2);
    expect(plan.aggregations.every((item) => item.fn === 'derived' && item.expression?.includes('FILTER'))).toBe(true);
    expect(plan.requiredAnswerFacts).toContain('all_requested_dimensions');
    expect(plan.requiredAnswerFacts).not.toEqual(expect.arrayContaining(['comparison_current', 'comparison_difference']));
    expect(plan.requiredOutputFields).toEqual(plan.aggregations.map((item) => item.alias));
  });

  it('uses a zero-safe payment aggregate for a plain receipt total', () => {
    const question = '今天收了多少钱';
    const parsed = parser.parse(question, new Date('2026-08-02T00:00:00.000Z'));
    const candidates = ASK_DATA_FREE_SQL_VIEWS.filter((view) => view.viewName === 'agent_v3_payment_refund_view');
    const plan = buildAskDataQueryPlan({
      question,
      semanticIntent: { ...parsed.semanticIntent, metricKeys: ['payment_flow'] },
      candidateViews: candidates,
    });

    expect(plan.resultMode).toBe('scalar');
    expect(plan.aggregations).toEqual([
      expect.objectContaining({
        alias: 'payment_amount',
        fn: 'sum',
        zeroOnEmpty: true,
      }),
    ]);
    expect(plan.requiredOutputFields).toEqual(['payment_amount']);
  });

  it('locks month-over-month revenue comparison to current, previous and difference outputs', () => {
    const question = '这个月跟上个月比收入差多少';
    const parsed = parser.parse(question, new Date('2026-08-02T00:00:00.000Z'));
    const candidates = ASK_DATA_FREE_SQL_VIEWS.filter((view) => view.viewName === 'agent_v3_order_summary_view');
    const plan = buildAskDataQueryPlan({
      question,
      semanticIntent: { ...parsed.semanticIntent, metricKeys: ['order_revenue'] },
      candidateViews: candidates,
    });

    expect(plan.resultMode).toBe('scalar');
    expect(plan.comparisonMode).toBe('previous_period');
    expect(plan.timeRange?.label).toBe('上月与本月');
    expect(plan.requiredOutputFields).toEqual([
      'current_period_net_revenue',
      'previous_period_net_revenue',
      'revenue_difference',
    ]);
    expect(plan.aggregations.every((item) => item.fn === 'derived' && item.expression?.includes('FILTER'))).toBe(true);
    expect(plan.requiredAnswerFacts).toEqual(expect.arrayContaining([
      'comparison_current', 'comparison_previous', 'comparison_difference',
    ]));
  });

  it('pushes a governed product-family name filter into inventory SQL', () => {
    const question = '帮我看一下补水系列产品的库存';
    const parsed = parser.parse(question, new Date('2026-08-02T00:00:00.000Z'));
    const candidates = ASK_DATA_FREE_SQL_VIEWS.filter((view) => view.viewName === 'agent_v3_product_inventory_view');
    const plan = buildAskDataQueryPlan({
      question,
      semanticIntent: { ...parsed.semanticIntent, metricKeys: ['inventory_on_hand'] },
      candidateViews: candidates,
    });

    expect(plan.resultMode).toBe('grouped');
    expect(plan.filters).toContainEqual({ field: 'product_name', operator: 'contains', value: '补水' });
    expect(plan.requiredOutputFields).toEqual(expect.arrayContaining(['product_id', 'product_name', 'current_stock']));
  });

  it('keeps a specifically named product as a grouped result dimension', () => {
    const question = '这个月用了多少洗面奶，还剩多少';
    const parsed = parser.parse(question, new Date('2026-08-02T00:00:00.000Z'));
    const candidates = ASK_DATA_FREE_SQL_VIEWS.filter((view) =>
      ['agent_v3_stock_movement_view', 'agent_v3_product_inventory_view'].includes(view.viewName),
    );
    const plan = buildAskDataQueryPlan({
      question,
      semanticIntent: { ...parsed.semanticIntent, metricKeys: ['inventory_usage_balance'] },
      candidateViews: candidates,
    });
    expect(plan.resultMode).toBe('grouped');
    expect(plan.sort).toBeUndefined();
    expect(plan.requiredGroupByFields).toEqual(expect.arrayContaining(['product_id', 'product_name', 'sku']));
    expect(plan.filters).toContainEqual({ field: 'product_name', operator: 'contains', value: '洁面' });
    expect(plan.assumptions).toContain('“洗面奶”按商品名称包含“洁面”的已登记商品查询。');
  });

  it('accepts a zero-safe governed consumption CTE left joined from current inventory', () => {
    const { plan, guard } = inspect(
      '这个月用了多少洗面奶，还剩多少',
      'inventory_usage_balance',
      ['agent_v3_stock_movement_view', 'agent_v3_product_inventory_view'],
      `WITH consumption AS (
        SELECT m.product_id, m.product_name, m.sku, SUM(ABS(m.quantity)) AS consumed_quantity
        FROM agent_v3_stock_movement_view AS m
        WHERE m.store_id = ANY(:allowedStoreIds)
          AND m.occurred_at >= :startAt::timestamptz
          AND m.occurred_at < :endAt::timestamptz
          AND m.quantity < 0
        GROUP BY m.product_id, m.product_name, m.sku
      )
      SELECT i.product_id, i.product_name, i.sku,
             COALESCE(MAX(c.consumed_quantity), 0) AS consumed_quantity,
             MAX(i.current_stock) AS current_stock
      FROM agent_v3_product_inventory_view AS i
      LEFT JOIN consumption AS c ON c.product_id = i.product_id
      WHERE i.store_id = ANY(:allowedStoreIds)
        AND i.product_name ILIKE '%洁面%'
      GROUP BY i.product_id, i.product_name, i.sku
      LIMIT 100`,
    );

    expect(validateAskDataQueryPlanExecution(plan, guard as any)).toEqual({ valid: true });
    expect(new ReadOnlySqlCostGuard().inspect(guard as any, 100)).toEqual({
      status: 'pass',
      estimatedCost: 95,
      appliedPolicies: ['static_cost_estimate'],
    });
  });

  it('rejects an unplanned inventory usage order before the static cost gate', () => {
    const { plan, guard } = inspect(
      '这个月用了多少洗面奶，还剩多少',
      'inventory_usage_balance',
      ['agent_v3_stock_movement_view', 'agent_v3_product_inventory_view'],
      `WITH consumption AS (
        SELECT m.product_id, m.product_name, m.sku, SUM(ABS(m.quantity)) AS consumed_quantity
        FROM agent_v3_stock_movement_view AS m
        WHERE m.store_id = ANY(:allowedStoreIds)
          AND m.occurred_at >= :startAt::timestamptz
          AND m.occurred_at < :endAt::timestamptz
          AND m.quantity < 0
        GROUP BY m.product_id, m.product_name, m.sku
      )
      SELECT i.product_id, i.product_name, i.sku,
             COALESCE(MAX(c.consumed_quantity), 0) AS consumed_quantity,
             MAX(i.current_stock) AS current_stock
      FROM agent_v3_product_inventory_view AS i
      LEFT JOIN consumption AS c ON c.product_id = i.product_id
      WHERE i.store_id = ANY(:allowedStoreIds)
        AND i.product_name ILIKE '%洁面%'
      GROUP BY i.product_id, i.product_name, i.sku
      ORDER BY i.product_name ASC
      LIMIT 100`,
    );

    expectPlanFailure(plan, guard, 'query_plan_inventory_usage_balance_unplanned_order_by');
    expect(new ReadOnlySqlCostGuard().inspect(guard as any, 100)).toEqual(expect.objectContaining({
      status: 'blocked',
      estimatedCost: 105,
    }));
  });

  it('accepts the same zero-safe inventory CTE without an explicit CTE alias', () => {
    const { plan, guard } = inspect(
      '这个月用了多少洗面奶，还剩多少',
      'inventory_usage_balance',
      ['agent_v3_stock_movement_view', 'agent_v3_product_inventory_view'],
      `WITH usage AS (
        SELECT sm.product_id, SUM(ABS(sm.quantity)) AS consumed_quantity
        FROM agent_v3_stock_movement_view AS sm
        WHERE sm.store_id = ANY(:allowedStoreIds)
          AND sm.occurred_at >= :startAt::timestamptz
          AND sm.occurred_at < :endAt::timestamptz
          AND sm.quantity < 0
          AND sm.product_name ILIKE '%洁面%'
        GROUP BY sm.product_id
      )
      SELECT pi.product_id, pi.product_name, pi.sku,
             COALESCE(MAX(usage.consumed_quantity), 0) AS consumed_quantity,
             MAX(pi.current_stock) AS current_stock
      FROM agent_v3_product_inventory_view AS pi
      LEFT JOIN usage ON usage.product_id = pi.product_id
      WHERE pi.store_id = ANY(:allowedStoreIds)
        AND pi.product_name ILIKE '%洁面%'
      GROUP BY pi.product_id, pi.product_name, pi.sku
      LIMIT 100`,
    );

    expect(validateAskDataQueryPlanExecution(plan, guard as any)).toEqual({ valid: true });
  });

  it('rejects a grouped CTE passthrough when the governed aggregation formula is absent', () => {
    const { plan, guard } = inspect(
      '这个月用了多少洗面奶，还剩多少',
      'inventory_usage_balance',
      ['agent_v3_stock_movement_view', 'agent_v3_product_inventory_view'],
      `WITH consumption AS (
        SELECT m.product_id, m.product_name, m.sku, SUM(m.quantity) AS consumed_quantity
        FROM agent_v3_stock_movement_view AS m
        WHERE m.store_id = ANY(:allowedStoreIds)
          AND m.occurred_at >= :startAt::timestamptz
          AND m.occurred_at < :endAt::timestamptz
          AND m.quantity < 0
        GROUP BY m.product_id, m.product_name, m.sku
      )
      SELECT i.product_id, i.product_name, i.sku,
             COALESCE(MAX(c.consumed_quantity), 0) AS consumed_quantity,
             MAX(i.current_stock) AS current_stock
      FROM agent_v3_product_inventory_view AS i
      LEFT JOIN consumption AS c ON c.product_id = i.product_id
      WHERE i.store_id = ANY(:allowedStoreIds)
        AND i.product_name ILIKE '%洁面%'
      GROUP BY i.product_id, i.product_name, i.sku
      LIMIT 100`,
    );

    expectPlanFailure(plan, guard, 'query_plan_aggregation_formula_mismatch');
  });

  it('rejects inventory usage SQL that drops products with no movement rows', () => {
    const { plan, guard } = inspect(
      '这个月用了多少洗面奶，还剩多少',
      'inventory_usage_balance',
      ['agent_v3_stock_movement_view', 'agent_v3_product_inventory_view'],
      `WITH consumption AS (
        SELECT m.product_id, m.product_name, m.sku, SUM(ABS(m.quantity)) AS consumed_quantity
        FROM agent_v3_stock_movement_view AS m
        WHERE m.store_id = ANY(:allowedStoreIds)
          AND m.occurred_at >= :startAt::timestamptz
          AND m.occurred_at < :endAt::timestamptz
          AND m.quantity < 0
        GROUP BY m.product_id, m.product_name, m.sku
      )
      SELECT c.product_id, c.product_name, c.sku, c.consumed_quantity, MAX(i.current_stock) AS current_stock
      FROM consumption AS c
      JOIN agent_v3_product_inventory_view AS i ON i.product_id = c.product_id
      WHERE i.store_id = ANY(:allowedStoreIds)
        AND i.product_name ILIKE '%洁面%'
      GROUP BY c.product_id, c.product_name, c.sku, c.consumed_quantity
      LIMIT 100`,
    );

    expectPlanFailure(plan, guard, 'query_plan_inventory_usage_balance_shape_mismatch');
  });

  it('accepts a complete cash, WeChat and Alipay conditional aggregate SQL', () => {
    const { plan, guard } = inspect(
      '今天现金、微信、支付宝各收了多少',
      'payment_flow',
      'agent_v3_payment_refund_view',
      "SELECT COALESCE(SUM(payment_amount) FILTER (WHERE payment_method IN ('cash','现金')), 0) AS cash_payment_amount, COALESCE(SUM(payment_amount) FILTER (WHERE payment_method IN ('wechat','weixin','微信','微信支付')), 0) AS wechat_payment_amount, COALESCE(SUM(payment_amount) FILTER (WHERE payment_method IN ('alipay','支付宝')), 0) AS alipay_payment_amount FROM agent_v3_payment_refund_view LIMIT 1",
    );
    expect(validateAskDataQueryPlanExecution(plan, guard as any)).toEqual({ valid: true });
  });

  it.each([
    '最近7天拓客成本的趋势',
    '最近14天获客成本走势',
    '最近30天营销成本趋势',
    '本周拓客成本每天怎么变化',
    '昨天营销成本的按日趋势',
  ])('locks short marketing cost trends to effect_date day grain: %s', (question) => {
    const parsed = parser.parse(question, new Date('2026-08-02T00:00:00.000Z'));
    const candidates = ASK_DATA_FREE_SQL_VIEWS.filter((view) => view.viewName === 'ask_data_marketing_roi_view');
    const plan = buildAskDataQueryPlan({
      question,
      semanticIntent: { ...parsed.semanticIntent, metricKeys: ['marketing_roi'] },
      candidateViews: candidates,
    });

    expect(plan.timeGrain).toEqual({
      sourceField: 'effect_date',
      granularity: 'day',
      alias: 'trend_day',
      expression: "DATE_TRUNC('day', effect_date)::date",
    });
    expect(plan.requiredOutputFields).toContain('trend_day');
    expect(plan.requiredGroupByFields).toContain('trend_day');
  });

  it.each([
    '最近30天营销ROI最高的渠道是什么？',
    '哪个渠道投产比最高',
    '各渠道投入产出率排行',
  ])('ranks marketing ROI questions by governed ROI instead of exposure count: %s', (question) => {
    const { plan } = inspect(
      question,
      'marketing_roi',
      'ask_data_marketing_roi_view',
      "SELECT channel, SUM(exposure_count) AS exposure_count, SUM(click_count) AS click_count, SUM(conversion_count) AS conversion_count, SUM(attributed_net_revenue) AS attributed_net_revenue, SUM(marketing_cost) AS marketing_cost, SUM(attributed_net_revenue) / NULLIF(SUM(marketing_cost), 0) AS roi FROM ask_data_marketing_roi_view WHERE effect_date >= :startAt AND effect_date < :endAt GROUP BY channel ORDER BY roi DESC NULLS LAST LIMIT 10",
    );

    expect(plan.sort).toEqual([{ field: 'roi', direction: 'desc', nulls: 'last' }]);
  });

  it('rejects an ROI ranking ordered by exposure count', () => {
    const { plan, guard } = inspect(
      '最近30天营销ROI最高的渠道是什么？',
      'marketing_roi',
      'ask_data_marketing_roi_view',
      "SELECT channel, SUM(exposure_count) AS exposure_count, SUM(click_count) AS click_count, SUM(conversion_count) AS conversion_count, SUM(attributed_net_revenue) AS attributed_net_revenue, SUM(marketing_cost) AS marketing_cost, SUM(attributed_net_revenue) / NULLIF(SUM(marketing_cost), 0) AS roi FROM ask_data_marketing_roi_view WHERE effect_date >= :startAt AND effect_date < :endAt GROUP BY channel ORDER BY exposure_count DESC LIMIT 10",
    );

    expectPlanFailure(plan, guard, 'query_plan_order_by_metric_mismatch');
  });

  it('rejects an ROI ranking that lets null ROI sort before real values', () => {
    const { plan, guard } = inspect(
      '最近30天营销ROI最高的渠道是什么？',
      'marketing_roi',
      'ask_data_marketing_roi_view',
      "SELECT channel, SUM(exposure_count) AS exposure_count, SUM(click_count) AS click_count, SUM(conversion_count) AS conversion_count, SUM(attributed_net_revenue) AS attributed_net_revenue, SUM(marketing_cost) AS marketing_cost, SUM(attributed_net_revenue) / NULLIF(SUM(marketing_cost), 0) AS roi FROM ask_data_marketing_roi_view WHERE effect_date >= :startAt AND effect_date < :endAt GROUP BY channel ORDER BY roi DESC LIMIT 10",
    );

    expectPlanFailure(plan, guard, 'query_plan_order_nulls_mismatch');
  });

  it('governs average order value as net revenue divided by distinct orders', () => {
    const question = '最近三个月的客单价是多少';
    const parsed = parser.parse(question, new Date('2026-08-02T00:00:00.000Z'));
    const candidates = ASK_DATA_FREE_SQL_VIEWS.filter((view) => view.viewName === 'agent_v3_order_summary_view');
    const plan = buildAskDataQueryPlan({ question, semanticIntent: parsed.semanticIntent, candidateViews: candidates });

    expect(plan.requiredOutputFields).toEqual(expect.arrayContaining(['net_revenue', 'order_count', 'average_order_value']));
    expect(plan.aggregations.find((item) => item.alias === 'average_order_value')).toEqual(expect.objectContaining({
      fn: 'derived',
      expression: 'SUM(net_amount) / NULLIF(COUNT(DISTINCT order_id), 0)',
    }));
  });

  it('routes project margin contribution to estimated project margin instead of confirmed store profit', () => {
    const question = '本月哪个项目的利润贡献最大';
    const parsed = parser.parse(question, new Date('2026-08-02T00:00:00.000Z'));
    const ranked = rankAskDataSemanticIndex({ question, parsed, authorizedViews: ASK_DATA_FREE_SQL_VIEWS });
    const candidates = ranked.slice(0, 2).map((item) => item.view);
    const plan = buildAskDataQueryPlan({ question, semanticIntent: parsed.semanticIntent, candidateViews: candidates });

    expect(parsed.semanticIntent.metricKeys[0]).toBe('project_sales');
    expect(plan.viewNames).toEqual(['agent_v3_project_service_sales_view']);
    expect(plan.requiredOutputFields).toEqual(expect.arrayContaining(['project_id', 'project_name', 'estimated_margin']));
    expect(plan.sort).toEqual([{ field: 'estimated_margin', direction: 'desc' }]);
  });

  it('pivots inbound and outbound transfer counts so an absent direction is still reported as zero', () => {
    const question = '调入和调出方向的调拨单数量对比';
    const parsed = parser.parse(question);
    const candidates = ASK_DATA_FREE_SQL_VIEWS.filter((view) => view.viewName === 'ask_data_transfer_status_view');
    const plan = buildAskDataQueryPlan({ question, semanticIntent: parsed.semanticIntent, candidateViews: candidates });

    expect(plan.resultMode).toBe('scalar');
    expect(plan.dimensions).toEqual([]);
    expect(plan.requiredOutputFields).toEqual(['inbound_transfer_count', 'outbound_transfer_count', 'transfer_count_difference']);
    expect(plan.aggregations.every((item) => item.fn === 'derived' && item.expression?.includes('FILTER'))).toBe(true);
  });

  it('accepts an exclusive upper bound for a governed future expiry window', () => {
    const { plan, guard } = inspect(
      '哪些产品快过期了，还有多少',
      'inventory_on_hand',
      'agent_v3_product_inventory_view',
      "SELECT product_id, product_name, sku, current_stock, safety_stock, stock_value, unit, status, nearest_expiry_date FROM agent_v3_product_inventory_view WHERE nearest_expiry_date >= :endAt::date AND nearest_expiry_date < (:endAt::date + INTERVAL '30 days') AND current_stock > 0 ORDER BY nearest_expiry_date ASC LIMIT 100",
    );

    expect(validateAskDataQueryPlanExecution(plan, guard as any)).toEqual({ valid: true });
  });

  it('keeps reservation customer lists as detail rows', () => {
    const question = '帮我搜一下今天预约了但还没来的客人';
    const parsed = parser.parse(question);
    const candidates = ASK_DATA_FREE_SQL_VIEWS.filter((view) => view.viewName === 'agent_v3_reservation_view');
    const plan = buildAskDataQueryPlan({ question, semanticIntent: parsed.semanticIntent, candidateViews: candidates });

    expect(plan.resultMode).toBe('detail');
    expect(plan.requiredOutputFields).toEqual(expect.arrayContaining([
      'reservation_id', 'customer_id', 'customer_name_masked', 'date', 'start_time', 'project_name', 'status',
    ]));
  });

  it('computes acquisition cost as marketing cost per conversion with a null zero-denominator result', () => {
    const question = '今年拓客成本的趋势';
    const parsed = parser.parse(question, new Date('2026-08-02T00:00:00.000Z'));
    const candidates = ASK_DATA_FREE_SQL_VIEWS.filter((view) => view.viewName === 'ask_data_marketing_roi_view');
    const plan = buildAskDataQueryPlan({ question, semanticIntent: parsed.semanticIntent, candidateViews: candidates });

    expect(plan.requiredOutputFields).toEqual(expect.arrayContaining(['trend_month', 'marketing_cost', 'conversion_count', 'acquisition_cost']));
    expect(plan.aggregations.find((item) => item.alias === 'acquisition_cost')).toEqual(expect.objectContaining({
      expression: 'SUM(marketing_cost) / NULLIF(SUM(conversion_count), 0)',
    }));
  });

  it('builds a real previous-vs-current employee improvement ranking', () => {
    const question = '哪个员工这个月进步最快';
    const parsed = parser.parse(question, new Date('2026-08-02T00:00:00.000Z'));
    const candidates = ASK_DATA_FREE_SQL_VIEWS.filter((view) => view.viewName === 'ask_data_staff_performance_view');
    const plan = buildAskDataQueryPlan({ question, semanticIntent: parsed.semanticIntent, candidateViews: candidates });

    expect(plan.timeRange?.label).toBe('上月与本月');
    expect(plan.requiredOutputFields).toEqual(expect.arrayContaining([
      'staff_id', 'staff_name', 'current_period_paid_amount', 'previous_period_paid_amount', 'paid_amount_difference',
    ]));
    expect(plan.sort).toEqual([{ field: 'paid_amount_difference', direction: 'desc', nulls: 'last' }]);
  });

  it('builds cost category changes with both periods and the difference', () => {
    const question = '有没有成本项目异常增加的情况';
    const parsed = parser.parse(question, new Date('2026-08-02T00:00:00.000Z'));
    const candidates = ASK_DATA_FREE_SQL_VIEWS.filter((view) => view.viewName === 'ask_data_operating_cost_view');
    const plan = buildAskDataQueryPlan({ question, semanticIntent: parsed.semanticIntent, candidateViews: candidates });

    expect(plan.timeRange?.label).toBe('上月与本月');
    expect(plan.requiredOutputFields).toEqual(expect.arrayContaining([
      'category', 'current_period_cost', 'previous_period_cost', 'cost_difference',
    ]));
    expect(plan.requiredGroupByFields).toContain('category');
  });

  it('returns reconciliation issue evidence instead of a count-only false positive', () => {
    const question = '有没有重复退款或者重复消费的情况';
    const parsed = parser.parse(question, new Date('2026-08-02T00:00:00.000Z'));
    const candidates = ASK_DATA_FREE_SQL_VIEWS.filter((view) => view.viewName === 'ask_data_reconciliation_issue_view');
    const plan = buildAskDataQueryPlan({ question, semanticIntent: parsed.semanticIntent, candidateViews: candidates });

    expect(plan.resultMode).toBe('detail');
    expect(plan.requiredOutputFields).toEqual(expect.arrayContaining([
      'issue_id', 'business_date', 'category', 'severity', 'issue_status', 'amount', 'title', 'last_detected_at',
    ]));
    expect(plan.aggregations).toEqual([]);
  });

  it('includes automation completion rate, run state and freshness evidence', () => {
    const question = '帮我检查一下现在有哪些自动化规则在运行，效果怎么样';
    const parsed = parser.parse(question, new Date('2026-08-02T00:00:00.000Z'));
    const candidates = ASK_DATA_FREE_SQL_VIEWS.filter((view) => view.viewName === 'agent_v3_marketing_automation_view');
    const plan = buildAskDataQueryPlan({ question, semanticIntent: parsed.semanticIntent, candidateViews: candidates });

    expect(plan.requiredOutputFields).toEqual(expect.arrayContaining([
      'automation_source', 'trigger_type', 'status', 'task_count', 'completed_count', 'completion_rate', 'latest_task_at',
    ]));
  });

  it('returns current pending reservation customers as actionable detail instead of a count', () => {
    const question = '有没有预约了但还没确认的客人';
    const parsed = parser.parse(question, new Date('2026-08-02T00:00:00.000Z'));
    const candidates = ASK_DATA_FREE_SQL_VIEWS.filter((view) => view.viewName === 'agent_v3_reservation_view');
    const plan = buildAskDataQueryPlan({ question, semanticIntent: parsed.semanticIntent, candidateViews: candidates });

    expect(plan.resultMode).toBe('detail');
    expect(plan.timeScopeMode).toBe('current_snapshot');
    expect(plan.aggregations).toEqual([]);
    expect(plan.requiredOutputFields).toEqual(expect.arrayContaining([
      'reservation_id',
      'customer_id',
      'customer_name_masked',
      'date',
      'start_time',
      'project_id',
      'project_name',
      'status',
    ]));
    expect(plan.filters).toEqual(expect.arrayContaining([
      expect.objectContaining({ field: 'status', operator: 'eq', value: 'pending' }),
    ]));
    expect(plan.assumptions).toContain('“还没确认”按预约当前状态为 pending 查询，并返回可行动的脱敏客户预约明细。');
  });

  it('uses a governed cash alias for a single cash-payment question', () => {
    const question = '帮我查一下今天收了多少现金';
    const parsed = parser.parse(question, new Date('2026-08-02T00:00:00.000Z'));
    const candidates = ASK_DATA_FREE_SQL_VIEWS.filter((view) => view.viewName === 'agent_v3_payment_refund_view');
    const plan = buildAskDataQueryPlan({ question, semanticIntent: parsed.semanticIntent, candidateViews: candidates });

    expect(plan.requiredOutputFields).toEqual(['cash_payment_amount']);
    expect(plan.aggregations[0]).toEqual(expect.objectContaining({ alias: 'cash_payment_amount', fn: 'derived' }));
  });

  it('preserves all three refund comparison outputs and uses refunded_at', () => {
    const question = '本月退款和上月比增加了多少';
    const parsed = parser.parse(question, new Date('2026-08-02T00:00:00.000Z'));
    const candidates = ASK_DATA_FREE_SQL_VIEWS.filter((view) => view.viewName === 'agent_v3_payment_refund_view');
    const plan = buildAskDataQueryPlan({ question, semanticIntent: parsed.semanticIntent, candidateViews: candidates });

    expect(plan.requiredOutputFields).toEqual([
      'current_period_refund_amount', 'previous_period_refund_amount', 'refund_amount_difference',
    ]);
    expect(plan.timeFieldOverrides).toEqual({ agent_v3_payment_refund_view: 'refunded_at' });
  });

  it.each([
    '这周预约爽约率高不高',
    '我给客户发了优惠券，核销率高不高',
    '帮我查一下我们的库存损耗率高不高',
  ])('keeps qualitative rate judgements as threshold clarifications: %s', (question) => {
    const parsed = parser.parse(question, new Date('2026-08-02T00:00:00.000Z'));
    expect(parsed.semanticIntent.ambiguities).toEqual(expect.arrayContaining([
      expect.objectContaining({ slot: 'threshold' }),
    ]));
  });

  it('returns zero instead of null for an empty inbound movement aggregate', () => {
    const question = '最近14天入库了多少货';
    const parsed = parser.parse(question, new Date('2026-08-02T00:00:00.000Z'));
    const candidates = ASK_DATA_FREE_SQL_VIEWS.filter((view) => view.viewName === 'agent_v3_stock_movement_view');
    const plan = buildAskDataQueryPlan({ question, semanticIntent: parsed.semanticIntent, candidateViews: candidates });

    expect(plan.aggregations).toEqual(expect.arrayContaining([
      expect.objectContaining({ alias: 'movement_quantity', fn: 'sum', zeroOnEmpty: true }),
    ]));
  });

  it('ranks fastest consumables by zero-safe absolute outbound quantity', () => {
    const question = '哪些耗材消耗速度最快';
    const parsed = parser.parse(question, new Date('2026-08-02T00:00:00.000Z'));
    const candidates = ASK_DATA_FREE_SQL_VIEWS.filter((view) => view.viewName === 'agent_v3_stock_movement_view');
    const plan = buildAskDataQueryPlan({ question, semanticIntent: parsed.semanticIntent, candidateViews: candidates });

    expect(parsed.semanticIntent.answerShape).toBe('ranking');
    expect(plan.resultMode).toBe('ranking');
    expect(plan.aggregations).toEqual([
      expect.objectContaining({ alias: 'movement_quantity', fn: 'sum_abs', zeroOnEmpty: true }),
    ]);
    expect(plan.filters).toContainEqual({ field: 'quantity', operator: 'lt', value: 0 });
    expect(plan.requiredGroupByFields).toEqual(expect.arrayContaining(['product_id', 'product_name']));
    expect(plan.requiredGroupByFields).not.toContain('movement_id');
    expect(plan.sort).toEqual([{ field: 'movement_quantity', direction: 'desc' }]);
    expect(plan.limit).toBe(10);

    const guard = new ReadOnlySqlGuard(new ReadOnlySqlParser()).inspect(
      `SELECT sm.product_id, sm.product_name, sm.sku,
              COALESCE(SUM(ABS(sm.quantity)), 0) AS movement_quantity
       FROM agent_v3_stock_movement_view AS sm
       WHERE sm.quantity < 0
       GROUP BY sm.product_id, sm.product_name, sm.sku
       ORDER BY movement_quantity DESC
       LIMIT 10`,
      ASK_DATA_FREE_SQL_VIEWS,
      {
        storeIds: [6],
        permissions: ['*'],
        parameters: parsed.semanticIntent.timeRange,
      },
    );
    if (guard.status !== 'pass') throw new Error(guard.message);
    expect(validateAskDataQueryPlanExecution(plan, guard)).toEqual({ valid: true });
  });

  it('accepts zero-safe aggregates inside a governed two-view scalar CTE', () => {
    const question = '最近三个月项目订单和产品订单各占多少';
    const parsed = parser.parse(question, new Date('2026-08-02T00:00:00.000Z'));
    const candidates = ASK_DATA_FREE_SQL_VIEWS.filter((view) =>
      ['agent_v3_project_service_sales_view', 'agent_v3_order_item_sales_view'].includes(view.viewName),
    );
    const plan = buildAskDataQueryPlan({
      question,
      semanticIntent: { ...parsed.semanticIntent, metricKeys: ['project_sales', 'product_sales'] },
      candidateViews: candidates,
    });
    const guard = new ReadOnlySqlGuard(new ReadOnlySqlParser()).inspect(
      `WITH project_sales AS (
         SELECT COALESCE(SUM(p.service_quantity), 0) AS service_count,
                COALESCE(SUM(p.net_amount), 0) AS project_revenue
         FROM agent_v3_project_service_sales_view AS p
         WHERE p.store_id = ANY(:allowedStoreIds)
           AND p.order_created_at >= :startAt::timestamptz
           AND p.order_created_at < :endAt::timestamptz
       )
       SELECT MAX(project_sales.service_count) AS service_count,
              MAX(project_sales.project_revenue) AS project_revenue,
              COALESCE(SUM(o.quantity), 0) AS sales_quantity,
              COALESCE(SUM(o.net_amount), 0) AS net_sales_amount
       FROM agent_v3_order_item_sales_view AS o
       CROSS JOIN project_sales
       WHERE o.store_id = ANY(:allowedStoreIds)
         AND o.order_created_at >= :startAt::timestamptz
         AND o.order_created_at < :endAt::timestamptz
       LIMIT 1`,
      ASK_DATA_FREE_SQL_VIEWS,
      {
        storeIds: [6],
        permissions: ['*'],
        parameters: parsed.semanticIntent.timeRange,
      },
    );
    if (guard.status !== 'pass') throw new Error(guard.message);
    expect(validateAskDataQueryPlanExecution(plan, guard)).toEqual({ valid: true });
  });

  it('separates stored-value liability from card liability in one scalar result', () => {
    const question = '储值负债和次卡负债分别多少';
    const parsed = parser.parse(question, new Date('2026-08-02T00:00:00.000Z'));
    const candidates = ASK_DATA_FREE_SQL_VIEWS.filter((view) => view.viewName === 'ask_data_member_liability_view');
    const plan = buildAskDataQueryPlan({ question, semanticIntent: parsed.semanticIntent, candidateViews: candidates });

    expect(plan.resultMode).toBe('scalar');
    expect(plan.aggregations).toEqual(expect.arrayContaining([
      expect.objectContaining({
        alias: 'stored_value_liability',
        expression: 'SUM(cash_contract_liability) + SUM(gift_obligation)',
      }),
      expect.objectContaining({ alias: 'card_liability', fn: 'sum' }),
    ]));
    expect(plan.requiredOutputFields).toEqual(expect.arrayContaining(['stored_value_liability', 'card_liability']));
    expect(plan.requiredAnswerFacts).toContain('all_requested_metrics');
    expect(plan.requiredAnswerFacts).not.toEqual(expect.arrayContaining([
      'comparison_current',
      'comparison_previous',
      'comparison_difference',
    ]));
  });

  it('groups product sales by category for category sales questions', () => {
    const question = '最近三个月各品类销售额';
    const parsed = parser.parse(question, new Date('2026-08-02T00:00:00.000Z'));
    const candidates = ASK_DATA_FREE_SQL_VIEWS.filter((view) => view.viewName === 'agent_v3_order_item_sales_view');
    const plan = buildAskDataQueryPlan({ question, semanticIntent: parsed.semanticIntent, candidateViews: candidates });

    expect(plan.resultMode).toBe('grouped');
    expect(plan.requiredOutputFields).toEqual(expect.arrayContaining(['category_name', 'net_sales_amount']));
    expect(plan.requiredGroupByFields).toContain('category_name');
  });

  it('treats explicit descending customer balance wording as a customer ranking', () => {
    const question = '客户储值总余额从高到低怎么排';
    const parsed = parser.parse(question, new Date('2026-08-02T00:00:00.000Z'));
    const candidates = ASK_DATA_FREE_SQL_VIEWS.filter((view) => view.viewName === 'agent_v3_customer_balance_view');
    const plan = buildAskDataQueryPlan({ question, semanticIntent: parsed.semanticIntent, candidateViews: candidates });

    expect(parsed.semanticIntent.answerShape).toBe('ranking');
    expect(plan.resultMode).toBe('ranking');
    expect(plan.requiredOutputFields).toEqual(expect.arrayContaining([
      'customer_id', 'customer_name_masked', 'total_balance',
    ]));
    expect(plan.sort).toEqual([{ field: 'total_balance', direction: 'desc', nulls: 'last' }]);
  });

  it('uses numeric division for marketing lead conversion rate', () => {
    const question = '最近7天营销页的线索转化率';
    const parsed = parser.parse(question, new Date('2026-08-02T00:00:00.000Z'));
    const candidates = ASK_DATA_FREE_SQL_VIEWS.filter((view) => view.viewName === 'agent_v3_marketing_conversion_view');
    const plan = buildAskDataQueryPlan({ question, semanticIntent: parsed.semanticIntent, candidateViews: candidates });

    expect(plan.requiredOutputFields).toEqual(expect.arrayContaining(['lead_count', 'conversion_count', 'conversion_rate']));
    expect(plan.aggregations).toContainEqual(expect.objectContaining({
      alias: 'conversion_rate',
      expression: 'SUM(conversion_count)::numeric / NULLIF(SUM(lead_count), 0)',
    }));
  });

  it('uses aggregate profit facts instead of averaging monthly gross-margin percentages', () => {
    const question = '本月的毛利率';
    const parsed = parser.parse(question, new Date('2026-08-02T00:00:00.000Z'));
    const candidates = ASK_DATA_FREE_SQL_VIEWS.filter((view) => view.viewName === 'ask_data_confirmed_profit_view');
    const plan = buildAskDataQueryPlan({ question, semanticIntent: parsed.semanticIntent, candidateViews: candidates });

    expect(plan.aggregations).toContainEqual(expect.objectContaining({
      alias: 'gross_margin_rate',
      expression: 'SUM(gross_profit) / NULLIF(SUM(operating_revenue), 0)',
    }));
    expect(plan.aggregations).not.toContainEqual(expect.objectContaining({ alias: 'gross_margin_rate', fn: 'avg' }));
  });

  it('groups card usage by card name and ranks confirmed income by the requested metric', () => {
    for (const question of ['本月各次卡名称的核销次数分别是多少', '最近 7 天每种次卡分别核销了多少次']) {
      const parsed = parser.parse(question, new Date('2026-08-02T00:00:00.000Z'));
      const candidates = ASK_DATA_FREE_SQL_VIEWS.filter((view) => view.viewName === 'agent_v3_card_usage_view');
      const plan = buildAskDataQueryPlan({ question, semanticIntent: parsed.semanticIntent, candidateViews: candidates });
      expect(plan.resultMode).toBe('grouped');
      expect(plan.requiredOutputFields).toEqual(expect.arrayContaining(['card_name', 'usage_times']));
      expect(plan.requiredGroupByFields).toContain('card_name');
    }

    const rankingQuestion = '最近 30 天确认收入最高的次卡前 10 名';
    const rankingParsed = parser.parse(rankingQuestion, new Date('2026-08-02T00:00:00.000Z'));
    const rankingCandidates = ASK_DATA_FREE_SQL_VIEWS.filter((view) => view.viewName === 'agent_v3_card_usage_view');
    const rankingPlan = buildAskDataQueryPlan({
      question: rankingQuestion,
      semanticIntent: rankingParsed.semanticIntent,
      candidateViews: rankingCandidates,
    });
    expect(rankingParsed.semanticIntent.metricKeys).toEqual(['card_usage']);
    expect(rankingPlan.requiredOutputFields).toEqual(expect.arrayContaining(['card_name', 'recognized_amount']));
    expect(rankingPlan.sort).toEqual([{ field: 'recognized_amount', direction: 'desc' }]);
  });

  it('excludes identity-less activity ROI and null opportunity rankings', () => {
    const activityQuestion = '最近7天哪些活动ROI最高';
    const activityParsed = parser.parse(activityQuestion, new Date('2026-08-02T00:00:00.000Z'));
    const activityViews = ASK_DATA_FREE_SQL_VIEWS.filter((view) => view.viewName === 'ask_data_marketing_roi_view');
    const activityPlan = buildAskDataQueryPlan({
      question: activityQuestion,
      semanticIntent: activityParsed.semanticIntent,
      candidateViews: activityViews,
    });
    expect(activityPlan.requiredOutputFields).toEqual(expect.arrayContaining(['activity_id', 'activity_title', 'roi']));
    expect(activityPlan.filters).toEqual(expect.arrayContaining([
      { field: 'activity_id', operator: 'is_not_null', value: true },
      { field: 'activity_title', operator: 'is_not_null', value: true },
    ]));

    const lifecycleQuestion = '机会评分最高的前 10 位客户';
    const lifecycleParsed = parser.parse(lifecycleQuestion, new Date('2026-08-02T00:00:00.000Z'));
    const lifecycleViews = ASK_DATA_FREE_SQL_VIEWS.filter((view) => view.viewName === 'ask_data_customer_lifecycle_view');
    const lifecyclePlan = buildAskDataQueryPlan({
      question: lifecycleQuestion,
      semanticIntent: lifecycleParsed.semanticIntent,
      candidateViews: lifecycleViews,
    });
    expect(lifecyclePlan.requiredOutputFields).toEqual(expect.arrayContaining(['customer_id', 'customer_name_masked', 'top_score']));
    expect(lifecyclePlan.filters).toContainEqual({ field: 'top_score', operator: 'is_not_null', value: true });
    expect(lifecyclePlan.sort).toEqual([{ field: 'top_score', direction: 'desc' }]);
  });

  it('builds governed inventory turnover rankings with null ratios last', () => {
    const question = '哪些产品的周转率最低';
    const parsed = parser.parse(question, new Date('2026-08-04T00:00:00.000Z'));
    const candidates = ASK_DATA_FREE_SQL_VIEWS.filter((view) => view.viewName === 'ask_data_inventory_turnover_view');
    const plan = buildAskDataQueryPlan({ question, semanticIntent: parsed.semanticIntent, candidateViews: candidates });

    expect(plan.metricKeys).toEqual(['inventory_operational_turnover']);
    expect(plan.viewNames).toEqual(['ask_data_inventory_turnover_view']);
    expect(plan.timeScopeMode).toBe('none');
    expect(plan.requiredOutputFields).toEqual(expect.arrayContaining([
      'product_id',
      'product_name',
      'operational_turnover_ratio_30d',
      'outbound_quantity_30d',
      'event_weighted_avg_stock_30d',
    ]));
    expect(plan.sort).toEqual([{ field: 'operational_turnover_ratio_30d', direction: 'asc', nulls: 'last' }]);
    expect(validateAskDataQueryPlan(plan, candidates)).toEqual({ valid: true });
  });

  it('limits an explicit 90-day no-outbound question to no-outbound products', () => {
    const question = '哪些产品一直有但90天没出库';
    const parsed = parser.parse(question, new Date('2026-08-04T00:00:00.000Z'));
    const candidates = ASK_DATA_FREE_SQL_VIEWS.filter((view) => view.viewName === 'ask_data_inventory_turnover_view');
    const plan = buildAskDataQueryPlan({ question, semanticIntent: parsed.semanticIntent, candidateViews: candidates });

    expect(plan.metricKeys).toEqual(['inventory_slow_moving']);
    expect(plan.filters).toEqual(expect.arrayContaining([
      { field: 'slow_moving_status', operator: 'eq', value: 'no_outbound_90d' },
      { field: 'current_stock', operator: 'gt', value: 0 },
    ]));
    expect(plan.filters).not.toContainEqual({
      field: 'slow_moving_status',
      operator: 'in',
      value: ['no_outbound_90d', 'low_turnover'],
    });
    expect(plan.assumptions.join(' ')).toContain('不包含仅低周转的商品');
    expect(plan.assumptions.join(' ')).toContain('不生成补货建议');
    expect(validateAskDataQueryPlan(plan, candidates)).toEqual({ valid: true });
  });

  it('uses the explicit operational-turnover threshold without including null-ratio no-outbound products', () => {
    const question = '列出近 30 天运营周转率低于 0.5 的慢动销产品';
    const parsed = parser.parse(question, new Date('2026-08-04T00:00:00.000Z'));
    const ranked = rankAskDataSemanticIndex({ question, parsed, authorizedViews: ASK_DATA_FREE_SQL_VIEWS });
    const semanticIntent = {
      ...parsed.semanticIntent,
      metricKeys: [ranked[0].contract.metricKey],
    };
    const candidates = ASK_DATA_FREE_SQL_VIEWS.filter((view) => view.viewName === 'ask_data_inventory_turnover_view');
    const plan = buildAskDataQueryPlan({ question, semanticIntent, candidateViews: candidates });

    expect(plan.filters).toEqual(expect.arrayContaining([
      { field: 'operational_turnover_ratio_30d', operator: 'lt', value: 0.5 },
      { field: 'current_stock', operator: 'gt', value: 0 },
    ]));
    expect(plan.filters.some((filter) => filter.field === 'slow_moving_status')).toBe(false);
    expect(plan.assumptions.join(' ')).toContain('运营周转率低于 0.5');
    expect(validateAskDataQueryPlan(plan, candidates)).toEqual({ valid: true });
  });

  it('keeps both governed statuses for a generic slow-moving question', () => {
    const question = '有哪些慢动销和库存积压产品';
    const parsed = parser.parse(question, new Date('2026-08-04T00:00:00.000Z'));
    const candidates = ASK_DATA_FREE_SQL_VIEWS.filter((view) => view.viewName === 'ask_data_inventory_turnover_view');
    const plan = buildAskDataQueryPlan({ question, semanticIntent: parsed.semanticIntent, candidateViews: candidates });

    expect(plan.filters).toEqual(expect.arrayContaining([
      { field: 'slow_moving_status', operator: 'in', value: ['no_outbound_90d', 'low_turnover'] },
      { field: 'current_stock', operator: 'gt', value: 0 },
    ]));
    expect(plan.assumptions.join(' ')).toContain('泛化“慢动销/库存积压”');
    expect(validateAskDataQueryPlan(plan, candidates)).toEqual({ valid: true });
  });

  it('uses current-quarter outbound facts without adding an event-time filter', () => {
    const question = '帮我统计一下这季度每个产品的用量';
    const parsed = parser.parse(question, new Date('2026-08-04T00:00:00.000Z'));
    const candidates = ASK_DATA_FREE_SQL_VIEWS.filter((view) => view.viewName === 'ask_data_inventory_turnover_view');
    const plan = buildAskDataQueryPlan({ question, semanticIntent: parsed.semanticIntent, candidateViews: candidates });

    expect(plan.metricKeys).toEqual(['inventory_outbound_usage']);
    expect(plan.timeScopeMode).toBe('none');
    expect(plan.requiredOutputFields).toEqual(expect.arrayContaining([
      'product_id',
      'product_name',
      'outbound_quantity_current_quarter',
    ]));
    expect(plan.aggregations).toContainEqual({
      field: 'outbound_quantity_current_quarter',
      alias: 'outbound_quantity_current_quarter',
      fn: 'none',
    });
    expect(validateAskDataQueryPlan(plan, candidates)).toEqual({ valid: true });
  });

  it('filters products below safety stock with no open procurement', () => {
    const question = '有没有产品快断货但还没采购的';
    const parsed = parser.parse(question, new Date('2026-08-04T00:00:00.000Z'));
    const candidates = ASK_DATA_FREE_SQL_VIEWS.filter((view) => view.viewName === 'ask_data_inventory_turnover_view');
    const plan = buildAskDataQueryPlan({ question, semanticIntent: parsed.semanticIntent, candidateViews: candidates });

    expect(plan.metricKeys).toEqual(['inventory_procurement_coverage']);
    expect(plan.filters).toContainEqual({
      field: 'replenishment_fact_status',
      operator: 'eq',
      value: 'below_safety_no_open_procurement',
    });
    expect(plan.requiredOutputFields).toEqual(expect.arrayContaining([
      'current_stock',
      'safety_stock',
      'open_procurement_quantity',
      'replenishment_fact_status',
    ]));
    expect(validateAskDataQueryPlan(plan, candidates)).toEqual({ valid: true });
  });

  it('keeps the literal below-safety question strict even though the warning status includes equality', () => {
    const question = '哪些产品低于安全库存且没有未完成采购';
    const parsed = parser.parse(question, new Date('2026-08-04T00:00:00.000Z'));
    const candidates = ASK_DATA_FREE_SQL_VIEWS.filter((view) => view.viewName === 'ask_data_inventory_turnover_view');
    const plan = buildAskDataQueryPlan({ question, semanticIntent: parsed.semanticIntent, candidateViews: candidates });

    expect(plan.filters).toEqual(expect.arrayContaining([
      { field: 'replenishment_fact_status', operator: 'eq', value: 'below_safety_no_open_procurement' },
      { field: 'current_stock', operator: 'field_lt', value: 'safety_stock' },
    ]));
    expect(plan.filters.some((filter) => filter.field === 'status')).toBe(false);
    expect(validateAskDataQueryPlan(plan, candidates)).toEqual({ valid: true });
  });

  it('marks daily outbound cost as a catalog-cost estimate', () => {
    const question = '这个月每日平均耗材费用是多少';
    const parsed = parser.parse(question, new Date('2026-08-04T00:00:00.000Z'));
    const candidates = ASK_DATA_FREE_SQL_VIEWS.filter((view) => view.viewName === 'ask_data_inventory_turnover_view');
    const plan = buildAskDataQueryPlan({ question, semanticIntent: parsed.semanticIntent, candidateViews: candidates });

    expect(plan.metricKeys).toEqual(['inventory_outbound_cost_estimate']);
    expect(plan.aggregations).toContainEqual({
      field: 'estimated_avg_daily_outbound_cost_current_month',
      alias: 'estimated_avg_daily_outbound_cost_current_month',
      fn: 'sum',
    });
    expect(plan.assumptions.join(' ')).toContain('商品档案成本估算');
    expect(validateAskDataQueryPlan(plan, candidates)).toEqual({ valid: true });
  });

  it('applies the explicit demand growth threshold from Coverage R2 wording', () => {
    const question = '最近 30 天需求比前 30 天增长超过 50% 的产品有哪些';
    const parsed = parser.parse(question, new Date('2026-08-04T00:00:00.000Z'));
    const candidates = ASK_DATA_FREE_SQL_VIEWS.filter((view) => view.viewName === 'ask_data_inventory_turnover_view');
    const plan = buildAskDataQueryPlan({ question, semanticIntent: parsed.semanticIntent, candidateViews: candidates });

    expect(plan.metricKeys).toEqual(['inventory_demand_change']);
    expect(plan.resultMode).toBe('detail');
    expect(plan.filters).toContainEqual({
      field: 'demand_change_rate_30d',
      operator: 'gt',
      value: 0.5,
    });
    expect(validateAskDataQueryPlan(plan, candidates)).toEqual({ valid: true });
  });

  it('requires historical consumption and no procurement for Coverage R2 procurement gaps', () => {
    const question = '哪些产品最近 90 天有消耗但没有采购记录';
    const parsed = parser.parse(question, new Date('2026-08-04T00:00:00.000Z'));
    const candidates = ASK_DATA_FREE_SQL_VIEWS.filter((view) => view.viewName === 'ask_data_inventory_turnover_view');
    const plan = buildAskDataQueryPlan({ question, semanticIntent: parsed.semanticIntent, candidateViews: candidates });

    expect(plan.metricKeys).toEqual(['inventory_procurement_coverage']);
    expect(plan.filters).toEqual(expect.arrayContaining([
      { field: 'outbound_quantity_90d', operator: 'gt', value: 0 },
      { field: 'procurement_order_count_90d', operator: 'eq', value: 0 },
    ]));
    expect(plan.requiredOutputFields).toEqual(expect.arrayContaining([
      'product_id',
      'product_name',
      'outbound_quantity_90d',
      'procurement_order_count_90d',
      'last_procurement_at',
    ]));
    expect(validateAskDataQueryPlan(plan, candidates)).toEqual({ valid: true });
  });

  it('builds an approved supplier quote comparison without procurement-performance leakage', () => {
    const question = '哪些商品存在更低的供应商报价，差额是多少';
    const parsed = parser.parse(question, new Date('2026-08-04T00:00:00.000Z'));
    const candidates = ASK_DATA_FREE_SQL_VIEWS.filter((view) => view.viewName === 'ask_data_supplier_quote_terms_view');
    const plan = buildAskDataQueryPlan({ question, semanticIntent: parsed.semanticIntent, candidateViews: candidates });

    expect(plan.metricKeys).toEqual(['supplier_price_comparison']);
    expect(plan.viewNames).toEqual(['ask_data_supplier_quote_terms_view']);
    expect(plan.filters).toEqual(expect.arrayContaining([
      { field: 'is_current_valid', operator: 'eq', value: true },
      { field: 'alternative_supplier_count', operator: 'gt', value: 0 },
    ]));
    expect(plan.requiredOutputFields).toEqual(expect.arrayContaining([
      'product_id',
      'product_name',
      'supplier_id',
      'supplier_name',
      'quote_price',
      'lowest_current_quote_price',
      'price_difference_from_lowest',
    ]));
    expect(plan.assumptions.join(' ')).toContain('最低报价不代表质量或综合性价比最好');
    expect(validateAskDataQueryPlan(plan, candidates)).toEqual({ valid: true });
  });

  it('keeps supplier payment terms as static approved quote facts', () => {
    const question = '我们和各供应商的账期是怎么约定的';
    const parsed = parser.parse(question, new Date('2026-08-04T00:00:00.000Z'));
    const candidates = ASK_DATA_FREE_SQL_VIEWS.filter((view) => view.viewName === 'ask_data_supplier_quote_terms_view');
    const plan = buildAskDataQueryPlan({ question, semanticIntent: parsed.semanticIntent, candidateViews: candidates });

    expect(plan.metricKeys).toEqual(['supplier_payment_terms']);
    expect(plan.timeScopeMode).toBe('none');
    expect(plan.filters).toContainEqual({ field: 'is_current_valid', operator: 'eq', value: true });
    expect(plan.requiredOutputFields).toEqual(expect.arrayContaining(['supplier_id', 'supplier_name', 'payment_terms', 'settlement_mode']));
    expect(validateAskDataQueryPlan(plan, candidates)).toEqual({ valid: true });
  });

  it('sorts current supplier quote rankings by the governed price ascending', () => {
    const question = '同一商品哪个供应商报价最低';
    const parsed = parser.parse(question, new Date('2026-08-04T00:00:00.000Z'));
    const candidates = ASK_DATA_FREE_SQL_VIEWS.filter((view) => view.viewName === 'ask_data_supplier_quote_terms_view');
    const plan = buildAskDataQueryPlan({ question, semanticIntent: parsed.semanticIntent, candidateViews: candidates });

    expect(plan.metricKeys).toEqual(['supplier_price_comparison']);
    expect(plan.resultMode).toBe('ranking');
    expect(plan.sort).toContainEqual({ field: 'quote_price', direction: 'asc' });
    expect(plan.limit).toBe(10);
    expect(validateAskDataQueryPlan(plan, candidates)).toEqual({ valid: true });
  });

  it('compares only the preferred supplier mapping when explicitly requested', () => {
    const question = '当前首选供应商报价与同商品最低报价差多少';
    const parsed = parser.parse(question, new Date('2026-08-04T00:00:00.000Z'));
    const candidates = ASK_DATA_FREE_SQL_VIEWS.filter((view) => view.viewName === 'ask_data_supplier_quote_terms_view');
    const plan = buildAskDataQueryPlan({ question, semanticIntent: parsed.semanticIntent, candidateViews: candidates });

    expect(plan.metricKeys).toEqual(['supplier_price_comparison']);
    expect(plan.resultMode).toBe('detail');
    expect(plan.filters).toEqual(expect.arrayContaining([
      { field: 'is_current_valid', operator: 'eq', value: true },
      { field: 'alternative_supplier_count', operator: 'gt', value: 0 },
      { field: 'is_preferred_supplier', operator: 'eq', value: true },
    ]));
    expect(plan.requiredOutputFields).toEqual(expect.arrayContaining([
      'product_id',
      'product_name',
      'supplier_id',
      'supplier_name',
      'quote_price',
      'lowest_current_quote_price',
      'price_difference_from_lowest',
    ]));
    expect(validateAskDataQueryPlan(plan, candidates)).toEqual({ valid: true });
  });

  it('rejects integer division for governed count-based rates', () => {
    const question = '最近7天营销页的线索转化率';
    const sql = [
      'SELECT SUM(lead_count) AS lead_count, SUM(conversion_count) AS conversion_count,',
      'SUM(conversion_count) / NULLIF(SUM(lead_count), 0) AS conversion_rate',
      'FROM agent_v3_marketing_conversion_view LIMIT 1',
    ].join(' ');
    const { plan, guard } = inspect(question, 'marketing_conversion', 'agent_v3_marketing_conversion_view', sql);
    expectPlanFailure(plan, guard, 'query_plan_ratio_numeric_cast_missing');
  });

  function inspect(question: string, metricKey: string, viewName: string | string[], sql: string) {
    const parsed = parser.parse(question, new Date('2026-08-02T00:00:00.000Z'));
    const viewNames = Array.isArray(viewName) ? viewName : [viewName];
    const candidates = ASK_DATA_FREE_SQL_VIEWS.filter((view) => viewNames.includes(view.viewName));
    const semanticIntent = { ...parsed.semanticIntent, metricKeys: [metricKey] };
    const plan = buildAskDataQueryPlan({ question, semanticIntent, candidateViews: candidates });
    const guard = new ReadOnlySqlGuard(new ReadOnlySqlParser()).inspect(sql, ASK_DATA_FREE_SQL_VIEWS, {
      storeIds: [6],
      permissions: ['*'],
      parameters: semanticIntent.timeRange,
      ...askDataTimeScopeOverrides(plan),
    });
    expect(guard.status).toBe('pass');
    return { plan, guard };
  }

  function expectPlanFailure(
    plan: ReturnType<typeof buildAskDataQueryPlan>,
    guard: ReturnType<ReadOnlySqlGuard['inspect']>,
    reasonCode: string,
  ) {
    if (guard.status !== 'pass') throw new Error(guard.message);
    const result = validateAskDataQueryPlanExecution(plan, guard);
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.reasonCode).toBe(reasonCode);
  }
});
