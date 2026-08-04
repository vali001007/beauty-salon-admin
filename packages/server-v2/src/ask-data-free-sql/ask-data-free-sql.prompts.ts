import type { ReadOnlySqlView } from '../read-only-sql-kernel/read-only-sql-kernel.types.js';
import type { AskDataFreeSqlContext, AskDataFreeSqlRequest, AskDataSemanticIntent } from './ask-data-free-sql.types.js';
import type { AskDataSqlGeneration } from './ask-data-free-sql.types.js';
import type { AskDataControlledQueryPlan } from './ask-data-query-plan.js';

const REPAIRABLE_SQL_GUARD_REASONS = new Set([
  'ambiguous_date_parameter_type',
  'ambiguous_interval_parameter_type',
  'boolean_or_not_allowed',
  'cte_store_scope_missing',
  'cte_time_scope_missing',
  'derived_table_not_allowed',
  'field_not_allowed',
  'function_not_allowed',
  'limit_exceeds_max',
  'multiple_statements_not_allowed',
  'nested_query_not_allowed',
  'recursive_cte_not_allowed',
  'set_operation_not_allowed',
  'source_view_not_allowed',
  'sql_comment_not_allowed',
  'too_many_ctes',
  'too_many_views',
  'view_join_not_allowed',
  'wildcard_not_allowed',
]);

export const ASK_DATA_SQL_GENERATION_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['status', 'sql', 'parameters', 'explanation', 'expectedColumns', 'clarificationQuestion'],
  properties: {
    status: { type: 'string', enum: ['ready', 'clarification', 'blocked'] },
    sql: { type: 'string' },
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {
        startAt: { type: 'string' },
        endAt: { type: 'string' },
        asOfTime: { type: 'string' },
      },
    },
    explanation: { type: 'string' },
    expectedColumns: { type: 'array', items: { type: 'string' }, maxItems: 20 },
    clarificationQuestion: { type: 'string' },
  },
} as const;

export const ASK_DATA_ANSWER_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['summary', 'keyFindings', 'caveats', 'displayMode', 'coveredFacts'],
  properties: {
    summary: { type: 'string', maxLength: 240 },
    keyFindings: { type: 'array', items: { type: 'string', maxLength: 180 }, maxItems: 5 },
    caveats: { type: 'array', items: { type: 'string', maxLength: 180 }, maxItems: 5 },
    displayMode: { type: 'string', enum: ['table', 'ranking', 'trend', 'metric'] },
    coveredFacts: { type: 'array', items: { type: 'string' }, maxItems: 12 },
  },
} as const;

export function buildSqlGenerationMessages(input: {
  request: AskDataFreeSqlRequest;
  context: AskDataFreeSqlContext;
  views: ReadOnlySqlView[];
  semanticIntent?: AskDataSemanticIntent;
  controlledQueryPlan?: AskDataControlledQueryPlan;
}) {
  const catalog = input.views.map((view) => ({
    viewName: view.viewName,
    label: view.label,
    description: view.description,
    dataPolicy: view.dataPolicy,
    noDataHint: view.noDataHint,
    storeScopeField: view.storeScopeField,
    defaultTimeField: view.defaultTimeField,
    fields: view.fields
      .filter((field) => field.policy !== 'deny')
      .map((field) => ({
        name: field.name,
        type: field.type,
        description: field.description,
        policy: field.policy,
      })),
  }));
  const history = (input.request.history ?? [])
    .slice(-4)
    .map((item) => ({ role: item.role, content: item.content.slice(0, 500) }));
  return [
    {
      role: 'system',
      content: [
        '你是智能问数 SQL 生成器，只输出符合 Schema 的 JSON。',
        '只能生成单条 PostgreSQL SELECT；非必要不要使用 WITH，禁止嵌套 SELECT、FROM 子查询、UNION、OR、写操作、多语句、注释、系统表、底表和未登记视图。需要多值条件时使用 IN 或 ANY。',
        '维度分布、趋势和排名应直接使用 GROUP BY、ORDER BY 和 LIMIT，不要为了计算时间范围、合计或占比生成子查询。',
        '最多使用 2 个登记视图。只能选择目录中的字段，禁止 SELECT *。',
        '如果输入包含 semanticIntent，它是 Ask 已治理的指标、维度、答案形态、时间和假设合同；不得自行更换指标口径、候选视图或时间范围。',
        '如果输入包含 controlledQueryPlan，必须覆盖其中全部 metricKeys、requiredViewNames、requiredOutputFields、dimensions、filters 和 requiredAnswerFacts；只能使用 plan.viewNames，禁止遗漏多指标问题中的任一指标。',
        'aggregations 是强制指标合同：count_distinct 使用 COUNT(DISTINCT field)，sum_abs 使用 SUM(ABS(field))，none 表示直接选择明细字段，derived 必须原样采用 expression 的业务公式。不得用相邻指标、AVG(行级比率)或其他近似写法替代。',
        'aggregation.zeroOnEmpty=true 时必须在合同聚合公式外使用 COALESCE(..., 0) AS alias，确保无记录的合计回答为 0 而不是空值；若该指标来自唯一 CTE，主 SELECT 必须使用 COALESCE(MAX(CTE.alias), 0) AS alias。',
        'requiredGroupByFields 必须全部且仅按业务所需粒度分组；forbiddenGroupByFields 禁止进入 GROUP BY。明细查询必须输出可识别主键，标量查询不得额外分组。',
        'requireDistinctResult=true 时必须使用 SELECT DISTINCT，或严格按全部计划维度 GROUP BY，确保返回不同值而不是重复明细。',
        '排行必须严格遵守 plan.sort 和 plan.limit；plan.sort 声明 nulls=last 时必须生成 NULLS LAST，避免分母为零的空比率被排到最高；plan.sort 不存在时不得自行添加 ORDER BY；列表、标量及“哪一张/哪一天”同样必须使用 plan.limit。不得把“使用最多”改成“发放最多”，也不得把偏差率排行改成标准用量排行。',
        'timeScopeMode=event_range 时使用治理时间范围；current_snapshot 或 none 时禁止自行添加 :startAt/:endAt 事件时间筛选；active_interval 时使用 start_at <= :endAt 且 COALESCE(end_at,:endAt) >= :endAt 判断当前生效。',
        'timeGrain 存在时，SELECT 必须原样使用 timeGrain.expression AS timeGrain.alias，并以同一表达式或别名 GROUP BY；不得换成其他日期字段或其他粒度。',
        '禁止使用 plan 之外的第二视图。单视图计划不得为了补充无关字段 JOIN 其他视图，避免聚合被多对多关系放大。',
        '不使用 WITH 时，SQL 不需要自行拼接默认门店和时间过滤，服务端会强制注入。只要使用 WITH，CTE 内和主 SELECT 中的每个真实视图都必须使用明确别名，并在各自作用域显式写 alias.store_id = ANY(:allowedStoreIds) 及所需时间条件。',
        '日期参数只能使用 :startAt、:endAt 和服务端提供的 :asOfTime；已完成订单可使用 :paidStatuses。下一个预约必须用 start_time >= :asOfTime，禁止把当天零点当成当前时刻。',
        '日期参数作为 DATE_TRUNC、EXTRACT、COALESCE、GREATEST、LEAST 等函数参数时必须显式转换为 ::date、::timestamp 或 ::timestamptz；只需默认时间范围时不要自行写时间条件，由服务端注入。',
        '日期参数参与 INTERVAL 加减前必须先显式转换为与字段一致的类型，例如 :startAt::date；禁止直接写 :startAt - INTERVAL。',
        '用户明确了今天、本周、本月、上月或近 N 天时，parameters 必须给出对应 startAt/endAt；服务端会再次按问题校正。',
        '口径规则：库存出库按 quantity < 0，出库数量汇总 ABS(quantity)；员工“在职”对应 status=active。',
        '库存周转与采购覆盖口径：ask_data_inventory_turnover_view 已按商品预计算滚动窗口，禁止再用 :startAt/:endAt 裁剪；days_of_stock_30d 无近 30 天出库时为空；operational_turnover_ratio_30d 是运营周转率，不是财务库存周转率；slow_moving_status 仅使用 no_outbound_90d、low_turnover、moving。',
        '库存采购覆盖只使用 replenishment_fact_status、open_procurement_quantity、procurement_order_count_90d 和 last_procurement_at 陈述事实，不得生成补货数量、采购优先级或项目可服务次数。',
        '库存消耗成本使用 estimated_* 字段，cost_policy=catalog_cost_estimated_not_batch_actual 时 explanation 必须说明为商品档案成本估算，不得称为实际批次成本、真实采购成本或已确认材料成本。',
        '供应商报价口径：ask_data_supplier_quote_terms_view 仅包含当前门店商品映射的 active + approved 报价；默认筛选 is_current_valid=true。quote_price 是已审批报价，不等于最终采购成交价；lowest_current_quote_price 只代表同商品当前最低报价，禁止表述为质量最好或综合性价比最好；lead_days 是报价预计交期，不是历史实际交付天数。',
        '受控过滤：field_lt 表示左字段小于右字段；aggregate_lt 表示 HAVING SUM(左字段) < SUM(右字段)；sum_with_gt 表示在 WHERE 中使用行级 `(左字段 + 右字段) > 阈值`，禁止改为 GROUP BY/HAVING；field_ratio_gt 表示左字段大于右字段乘治理倍率；is_not_null 表示字段 IS NOT NULL；between_as_of_days 表示从 :endAt 或 :asOfTime 起未来 N 天；gte_as_of_time 表示不早于 :asOfTime。必须按 filters 原样生成。',
        'inventory_usage_balance 必须用唯一一个 CTE 按商品聚合期间负向库存流水；主查询以 agent_v3_product_inventory_view 为主数据源并按商品过滤，再 LEFT JOIN 该 CTE；consumed_quantity 使用 COALESCE(MAX(CTE.consumed_quantity), 0)，确保本期零消耗时仍返回当前库存。',
        '组合指标必须先按共同业务主键和各自粒度聚合再关联，禁止明细对明细 JOIN 导致多对多放大。库存使用与余额按 product_id 关联，库存快照使用 MAX(current_stock)；损耗率只在库存流水中计算 scrap_out 占全部出库；支付订单差额直接使用日结视图 paid_amount 与 revenue_amount。',
        '受限 WITH 最多只能定义 1 个命名 CTE。两个视图做独立标量汇总时，只将一个视图放入 CTE，另一个视图在主 SELECT 中聚合并与 CTE 关联；禁止为每个视图分别建 CTE。标量计划的主 SELECT 禁止 GROUP BY；CTE 中 zeroOnEmpty 指标必须先 COALESCE 聚合为 0，主 SELECT 再使用 COALESCE(MAX(CTE.alias), 0) 保持单行和零值，差额也必须使用补零后的两个值。',
        '预约取消率分母为时段内全部预约，分子为 status IN (cancelled,canceled,已取消,取消)；普通预约数量默认排除这些取消状态。相对日期由服务端解析，不要追问绝对日期。',
        '“预约了但还没确认的客人”是当前状态明细：status 必须等于 pending，返回预约 ID、脱敏客户、日期、开始时间、项目和状态；不得退化为预约数量或按客户聚合。',
        '财务口径：实际利润和会员履约负债只能查询已登记的 confirmed 快照视图；无数据时不得改查草稿或用订单流水自行冒充已确认快照。',
        '对账口径：“最近一次对账运行”按 run_id 分组，以 MAX(last_detected_at) 倒序取第一组，可同时 COUNT(issue_id) 统计异常数。',
        '排班口径：员工产能直接使用排班产能视图中的 scheduled_minutes、booked_minutes、idle_minutes、overbooked_minutes 和 utilization_rate。',
        '服务任务口径：status 仅有 pending、in_progress、completed、cancelled、no_show；“已完成”只能使用 status=completed，不得添加 done 等未登记状态。',
        'BOM 口径：只在 standard_status=matched 时判断偏差；is_abnormal=true 表示绝对偏差率超过20%，标准缺失不得计算为零偏差。',
        '调拨口径：completed、received、done 均视为已完成；“未完成”使用 status NOT IN (completed,received,done)。',
        '客户反馈口径：投诉为 feedback_type=complaint；低评分为 rating<=2；open、in_progress 为未解决；严重反馈为 severity=critical。',
        '营销 ROI 口径：attributed_net_revenue 已包含退款冲减；marketing_cost=0 时 roi 必须为空；聚合 ROI 使用 SUM(attributed_net_revenue)/NULLIF(SUM(marketing_cost),0)，不要使用 CASE；cost_source=estimated 时必须在 explanation 说明成本是估算值。',
        '优惠范围：scope_type=global 表示所有门店可见的全局优惠，scope_type=store 表示当前门店优惠。',
        '优惠活动“即将结束”的时间字段是 end_at，不得附加 start_at 也必须落入未来区间的条件；“当前生效”按有效区间判断。',
        '状态截面问题（当前、未完成、待接收、已经完成）按当前状态查询，不得用创建时间默认裁掉历史仍有效记录。',
        '排名只能使用 ORDER BY 指标 DESC/ASC 加 LIMIT；禁止 RANK、DENSE_RANK、ROW_NUMBER、OVER 等窗口函数。',
        '必须带 LIMIT，最大 100。仅当缺少会改变查询口径的必要条件时才 status=clarification；已经包含时间范围和明确指标、排名、趋势或列表的问题必须直接 status=ready。涉及写操作、敏感字段或越权时 status=blocked。',
        'SQL 别名使用英文 snake_case；explanation 用中文说明查询口径。',
      ].join('\n'),
    },
    {
      role: 'user',
      content: JSON.stringify({
        question: input.request.question,
        history,
        authorizedStoreIds: [input.context.storeId],
        permissions: input.context.permissions,
        deniedPermissions: input.context.deniedPermissions,
        semanticIntent: input.semanticIntent,
        controlledQueryPlan: input.controlledQueryPlan,
        catalog,
      }),
    },
  ];
}

export function isRepairableSqlGuardReason(reasonCode: string) {
  return REPAIRABLE_SQL_GUARD_REASONS.has(reasonCode);
}

export function shouldRetryClearQuestionClarification(question: string, views: ReadOnlySqlView[]) {
  if (!views.length) return false;
  const normalized = question.trim().toLowerCase();
  const hasTimeScope = /今天|今日|本周|这周|本月|这个月|上月|未来\s*\d+\s*天|最近\s*\d+\s*(?:天|个月|月)|近\s*\d+\s*(?:天|个月|月)/i.test(
    normalized,
  );
  const hasMetric = /多少|排行|排名|趋势|分布|有哪些|最高|最低|合计|总计|分别|占比|率/.test(normalized);
  return hasTimeScope && hasMetric;
}

export function buildClarificationRepairMessages(input: {
  request: AskDataFreeSqlRequest;
  context: AskDataFreeSqlContext;
  views: ReadOnlySqlView[];
  previous: AskDataSqlGeneration;
  semanticIntent?: AskDataSemanticIntent;
  controlledQueryPlan?: AskDataControlledQueryPlan;
}) {
  return [
    ...buildSqlGenerationMessages(input),
    { role: 'assistant', content: JSON.stringify(input.previous) },
    {
      role: 'user',
      content: [
        '上一版误判为需要澄清。Ask 语义路由已经确认指标、答案形态和必要默认口径，可以直接查询。',
        '请仅使用已提供目录生成 status=ready 的单条只读 SQL；不得扩大门店、时间、字段或视图范围。',
      ].join('\n'),
    },
  ];
}

export function buildSqlRepairMessages(input: {
  request: AskDataFreeSqlRequest;
  context: AskDataFreeSqlContext;
  views: ReadOnlySqlView[];
  previous: AskDataSqlGeneration;
  reasonCode: string;
  reasonMessage: string;
  redactedSql: string;
  semanticIntent?: AskDataSemanticIntent;
  controlledQueryPlan?: AskDataControlledQueryPlan;
}) {
  return [
    ...buildSqlGenerationMessages(input),
    { role: 'assistant', content: JSON.stringify(input.previous) },
    {
      role: 'user',
      content: [
        '上一版 SQL 尚未执行，未通过只读门禁。请保持原问题和业务口径不变，重新生成完整 JSON。',
        `门禁原因：${input.reasonCode}；${input.reasonMessage}`,
        `脱敏 SQL：${input.redactedSql}`,
        '必须消除门禁问题，不得放宽门店、时间、字段、视图、函数、LIMIT 或只读约束。禁止嵌套 SELECT；可直接使用已登记视图的 GROUP BY 聚合。too_many_ctes 时必须改为最多 1 个命名 CTE，禁止为两个视图各建一个 CTE；query_plan_scalar_grouped 时删除主 SELECT 的 GROUP BY，对 CTE 输出使用 MAX 保持单行；cte_store_scope_missing 时必须给 CTE 内和主 SELECT 的每个真实视图加别名，并在各自 WHERE 中写 alias.store_id = ANY(:allowedStoreIds)。',
        '当门禁原因是 cte_time_scope_missing 时，CTE 内和主查询的每个时序视图都必须分别写 `alias.time_field >= :startAt::timestamptz AND alias.time_field < :endAt::timestamptz`；结束边界必须是 `< :endAt`，禁止使用 `<= :endAt`。',
        '当门禁原因是 query_plan_detail_grouped 且计划包含 sum_with_gt 时，删除 GROUP BY 和 HAVING，在 WHERE 中使用行级 `(左字段 + 右字段) > 阈值`，保留客户/卡明细粒度。',
        '当门禁原因是 query_plan_aggregation_formula_mismatch 或 query_plan_zero_safe_aggregation_missing，且计划是两视图单行标量时，仅允许一个 CTE 内按合同聚合；zeroOnEmpty 指标在 CTE 内使用 COALESCE(合同聚合, 0)，主 SELECT 对 CTE 别名使用 COALESCE(MAX(CTE.alias), 0)，并用补零后的值计算差额。不得修改 CTE 内的 SUM/COUNT/AVG 公式。',
        '当门禁原因是 query_plan_inventory_usage_balance_shape_mismatch、query_plan_inventory_usage_balance_product_filter_missing 或 query_plan_inventory_usage_balance_zero_missing 时，必须以 agent_v3_product_inventory_view 为主表并在主表应用商品名称过滤，LEFT JOIN 唯一消耗 CTE，外层使用 COALESCE(MAX(CTE.consumed_quantity), 0) AS consumed_quantity。',
        '当门禁原因是 query_plan_inventory_usage_balance_unplanned_order_by 时，删除主查询的 ORDER BY；该问题只要求返回命中的商品消耗与结存，不要求排名。',
      ].join('\n'),
    },
  ];
}

export function buildAnswerMessages(input: {
  question: string;
  explanation: string;
  rows: Array<Record<string, unknown>>;
  totalRowCount: number;
  rowsSampled: number;
  sources: string[];
  timeRange: string;
  storeScope: string;
  truncated: boolean;
  assumptions?: string[];
  requiredAnswerFacts?: string[];
  controlledQueryPlan?: Partial<Pick<
    AskDataControlledQueryPlan,
    'answerShape' | 'metricKeys' | 'dimensions' | 'comparisonMode' | 'requiredOutputFields' | 'sort' | 'limit' | 'resultMode' | 'timeGrain'
  >>;
}) {
  return [
    {
      role: 'system',
      content: [
        '你是门店经营数据回答助手，只能根据输入的查询结果组织答案。',
        '不得补造原因、客户、员工、订单、金额、比例或趋势。不得修改结果中的数字。',
        '没有数据支持时明确说“数据无法判断”。回答简洁，summary 一句话，keyFindings 最多 5 条。',
        '如果结果被截断，要在 caveats 说明。不要输出 SQL。只输出符合 Schema 的 JSON。',
        '输入中的 assumptions 是已采用的查询默认口径；有内容时必须在 caveats 中用自然语言披露，不得改写其含义。',
        'requiredAnswerFacts 是回答完整性合同。coveredFacts 只能填写答案实际覆盖的事实项；缺少任一项时必须在 caveats 明确说明，不得假装已经回答。',
        'rows 是从查询结果中选出的代表性样本，totalRowCount 是实际返回总行数，rowsSampled 是发给模型的样本行数。不得声称 Schema、结果或字段未提供 rows 中实际存在的列，也不得把 rowsSampled 冒充 totalRowCount。list_items 表示列出最有代表性的前 5 项；结果超过 5 行时说明总条数和仅展示前 5 项即可，不得因此声称无法回答。',
        '聚合结果中的金额为 0 时明确回答 0，不得写成“数据无法判断”。',
        '库存周转回答必须说明是运营口径而非财务周转率；estimated_* 或 catalog_cost_estimated_not_batch_actual 成本必须标注为商品档案成本估算；采购覆盖结果只能陈述是否有在途采购，不得扩写成补货建议。',
      ].join('\n'),
    },
    {
      role: 'user',
      content: JSON.stringify(input),
    },
  ];
}
