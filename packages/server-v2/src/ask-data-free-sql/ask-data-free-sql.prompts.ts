import type { ReadOnlySqlView } from '../read-only-sql-kernel/read-only-sql-kernel.types.js';
import type { AskDataFreeSqlContext, AskDataFreeSqlRequest, AskDataSemanticIntent } from './ask-data-free-sql.types.js';
import type { AskDataSqlGeneration } from './ask-data-free-sql.types.js';

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
  required: ['summary', 'keyFindings', 'caveats', 'displayMode'],
  properties: {
    summary: { type: 'string', maxLength: 240 },
    keyFindings: { type: 'array', items: { type: 'string', maxLength: 180 }, maxItems: 5 },
    caveats: { type: 'array', items: { type: 'string', maxLength: 180 }, maxItems: 5 },
    displayMode: { type: 'string', enum: ['table', 'ranking', 'trend', 'metric'] },
  },
} as const;

export function buildSqlGenerationMessages(input: {
  request: AskDataFreeSqlRequest;
  context: AskDataFreeSqlContext;
  views: ReadOnlySqlView[];
  semanticIntent?: AskDataSemanticIntent;
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
        'SQL 不需要自行拼接门店过滤和默认时间过滤，服务端会强制注入；如使用 WITH，则每个真实视图必须显式包含 alias.store_id = ANY(:allowedStoreIds)。',
        '日期参数只能使用 :startAt 和 :endAt；已完成订单可使用 :paidStatuses。',
        '日期参数作为 DATE_TRUNC、EXTRACT、COALESCE、GREATEST、LEAST 等函数参数时必须显式转换为 ::date、::timestamp 或 ::timestamptz；只需默认时间范围时不要自行写时间条件，由服务端注入。',
        '日期参数参与 INTERVAL 加减前必须先显式转换为与字段一致的类型，例如 :startAt::date；禁止直接写 :startAt - INTERVAL。',
        '用户明确了今天、本周、本月、上月或近 N 天时，parameters 必须给出对应 startAt/endAt；服务端会再次按问题校正。',
        '口径规则：库存出库按 quantity < 0，出库数量汇总 ABS(quantity)；员工“在职”对应 status=active。',
        '预约取消率分母为时段内全部预约，分子为 status IN (cancelled,canceled,已取消,取消)；普通预约数量默认排除这些取消状态。相对日期由服务端解析，不要追问绝对日期。',
        '财务口径：实际利润和会员履约负债只能查询已登记的 confirmed 快照视图；无数据时不得改查草稿或用订单流水自行冒充已确认快照。',
        '对账口径：“最近一次对账运行”按 run_id 分组，以 MAX(last_detected_at) 倒序取第一组，可同时 COUNT(issue_id) 统计异常数。',
        '排班口径：员工产能直接使用排班产能视图中的 scheduled_minutes、booked_minutes、idle_minutes、overbooked_minutes 和 utilization_rate。',
        '服务任务口径：status 仅有 pending、in_progress、completed、cancelled、no_show；“已完成”只能使用 status=completed，不得添加 done 等未登记状态。',
        'BOM 口径：只在 standard_status=matched 时判断偏差；is_abnormal=true 表示绝对偏差率超过20%，标准缺失不得计算为零偏差。',
        '调拨口径：completed、received、done 均视为已完成；“未完成”使用 status NOT IN (completed,received,done)。',
        '客户反馈口径：投诉为 feedback_type=complaint；低评分为 rating<=2；open、in_progress 为未解决；严重反馈为 severity=critical。',
        '营销 ROI 口径：attributed_net_revenue 已包含退款冲减；marketing_cost=0 时 roi 必须为空；聚合 ROI 使用 SUM(attributed_net_revenue)/NULLIF(SUM(marketing_cost),0)，不要使用 CASE；cost_source=estimated 时必须在 explanation 说明成本是估算值。',
        '优惠范围：scope_type=global 表示所有门店可见的全局优惠，scope_type=store 表示当前门店优惠。',
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
        '必须消除门禁问题，不得放宽门店、时间、字段、视图、函数、LIMIT 或只读约束。禁止嵌套 SELECT；可直接使用已登记视图的 GROUP BY 聚合。',
      ].join('\n'),
    },
  ];
}

export function buildAnswerMessages(input: {
  question: string;
  explanation: string;
  rows: Array<Record<string, unknown>>;
  sources: string[];
  timeRange: string;
  storeScope: string;
  truncated: boolean;
  assumptions?: string[];
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
      ].join('\n'),
    },
    {
      role: 'user',
      content: JSON.stringify(input),
    },
  ];
}
