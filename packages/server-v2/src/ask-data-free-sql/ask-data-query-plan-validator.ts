import type { ReadOnlySqlGuardResult, ReadOnlySqlView } from '../read-only-sql-kernel/read-only-sql-kernel.types.js';
import type { AskDataControlledQueryPlan, AskDataQueryAggregation } from './ask-data-query-plan.js';
import { ASK_DATA_SEMANTIC_CONTRACTS } from './ask-data-semantic-contracts.js';

export type AskDataQueryPlanValidation = { valid: true } | { valid: false; reasonCode: string; message: string };

export function validateAskDataQueryPlan(plan: AskDataControlledQueryPlan, candidateViews: ReadOnlySqlView[]): AskDataQueryPlanValidation {
  const candidates = new Map(candidateViews.map((view) => [view.viewName, view]));
  if (!plan.metricKeys.length) return invalid('query_plan_metric_missing', '语义计划缺少可执行指标。');
  if (!plan.viewNames.length) return invalid('query_plan_view_missing', '语义计划缺少已授权视图。');
  if (plan.viewNames.length > 2) return invalid('query_plan_too_many_views', '单次查询计划最多使用两个视图。');
  if (plan.viewNames.some((viewName) => !candidates.has(viewName))) return invalid('query_plan_view_not_candidate', '查询计划包含候选范围外视图。');
  for (const joinKey of plan.requiredJoinKeys) {
    const missingView = plan.viewNames.find((viewName) =>
      !candidates.get(viewName)?.fields.some((field) => field.name === joinKey && field.policy !== 'deny'),
    );
    if (missingView) return invalid('query_plan_join_key_missing', `视图 ${missingView} 缺少关联键 ${joinKey}。`);
  }
  for (const metricKey of plan.metricKeys) {
    const contract = ASK_DATA_SEMANTIC_CONTRACTS.find((item) => item.metricKey === metricKey);
    if (!contract) return invalid('query_plan_metric_unknown', `未知指标：${metricKey}`);
    if (!plan.viewNames.includes(contract.preferredView)) return invalid('query_plan_metric_view_missing', `指标 ${metricKey} 缺少首选视图。`);
  }
  const allowedAcrossViews = new Set(
    plan.viewNames.flatMap((viewName) =>
      candidates.get(viewName)?.fields.filter((field) => field.policy !== 'deny').map((field) => field.name) ?? [],
    ),
  );
  const invalidField = [...plan.selectFields, ...plan.requiredGroupByFields]
    .filter((field) => field !== plan.timeGrain?.alias)
    .find((field) => !allowedAcrossViews.has(field));
  if (invalidField) return invalid('query_plan_field_not_allowed', `查询计划字段未登记：${invalidField}`);
  for (const aggregation of plan.aggregations) {
    const sourceFields = aggregation.sourceFields ?? [aggregation.field];
    const unknownSource = sourceFields.find((field) => !allowedAcrossViews.has(field));
    if (unknownSource) return invalid('query_plan_aggregation_field_not_allowed', `指标聚合字段未登记：${unknownSource}`);
    if (aggregation.fn === 'derived' && (!aggregation.expression || sourceFields.length < 1)) {
      return invalid('query_plan_derived_metric_invalid', `派生指标 ${aggregation.alias} 缺少受控公式。`);
    }
  }
  if (plan.answerShape === 'ranking' && (!plan.sort?.length || plan.limit > 100)) {
    return invalid('query_plan_ranking_incomplete', '排行查询必须包含排序和受控数量。');
  }
  if (plan.answerShape === 'comparison' && !plan.comparisonMode) {
    return invalid('query_plan_comparison_incomplete', '对比查询缺少比较关系。');
  }
  if (plan.metricKeys.length > 1 && plan.requiredViewNames.length < 2) {
    return invalid('query_plan_multi_metric_incomplete', '多指标查询计划未覆盖全部指标视图。');
  }
  if (plan.resultMode === 'detail' && !plan.requiredOutputFields.length) {
    return invalid('query_plan_detail_identity_missing', '明细查询缺少可识别字段。');
  }
  return { valid: true };
}

export function validateAskDataQueryPlanExecution(
  plan: AskDataControlledQueryPlan,
  guard: Extract<ReadOnlySqlGuardResult, { status: 'pass' }>,
): AskDataQueryPlanValidation {
  const selected = new Set(guard.selectedViews.map((view) => view.viewName));
  const missing = plan.requiredViewNames.filter((viewName) => !selected.has(viewName));
  if (missing.length) {
    return invalid('query_plan_required_view_missing', `SQL 未覆盖查询计划要求的视图：${missing.join(', ')}`);
  }
  if (plan.forbidAdditionalViews) {
    const extras = [...selected].filter((viewName) => !plan.viewNames.includes(viewName));
    if (extras.length) return invalid('query_plan_unplanned_view_selected', `SQL 使用了计划外视图：${extras.join(', ')}`);
    if (guard.parsed.hasJoin && plan.viewNames.length === 1) {
      return invalid('query_plan_unnecessary_join', '单视图查询不允许加入无关视图。');
    }
  }

  const selectItems = topLevelSelectItems(guard.parsed.tokens);
  const groupBy = topLevelClauseIdentifiers(guard.parsed.tokens, 'group', ['having', 'order', 'limit', ';']);
  const orderBy = topLevelClauseTokens(guard.parsed.tokens, 'order', ['limit', ';']);
  const sql = normalizeSql(guard.safeSql);

  if (plan.metricKeys.includes('inventory_usage_balance') && !plan.sort?.length && orderBy.length) {
    return invalid(
      'query_plan_inventory_usage_balance_unplanned_order_by',
      '期间消耗与当前库存未要求排名，不得添加额外排序增加查询成本。',
    );
  }

  if (
    plan.metricKeys.includes('inventory_movement')
    && plan.metricKeys.includes('order_revenue')
    && selectItems.some((item) =>
      (containsIdentifier(item, 'net_revenue') || containsIdentifier(item, 'net_amount'))
      && (containsIdentifier(item, 'movement_quantity') || containsIdentifier(item, 'quantity'))
      && /[+\-*/]/.test(item),
    )
  ) {
    return invalid('query_plan_incompatible_metric_arithmetic', '耗材数量与收入金额单位不同，只能并列展示，不能直接计算差额或比率。');
  }

  if (plan.requiredJoinKeys.length && !guard.parsed.hasJoin) {
    return invalid('query_plan_required_join_missing', '多视图客户明细必须按受控客户键关联。');
  }
  for (const joinKey of plan.requiredJoinKeys) {
    const key = escapeRegExp(joinKey);
    const equality = new RegExp(`(?:[a-z_][a-z0-9_]*\\.)?${key}\\s*=\\s*(?:[a-z_][a-z0-9_]*\\.)?${key}`, 'i');
    const using = new RegExp(`\\busing\\s*\\(\\s*${key}\\s*\\)`, 'i');
    if (!equality.test(sql) && !using.test(sql)) {
      return invalid('query_plan_join_key_mismatch', `多视图明细必须按 ${joinKey} 关联。`);
    }
  }

  const missingOutput = plan.requiredOutputFields.find((field) => !selectItems.some((item) => containsIdentifier(item, field)));
  if (missingOutput) {
    return invalid('query_plan_required_output_missing', `SQL 未输出查询计划要求的字段或指标：${missingOutput}`);
  }

  if (plan.metricKeys.includes('inventory_usage_balance')) {
    const inventoryUsageShape = validateInventoryUsageBalanceShape(selectItems, sql, guard.parsed.cteNames);
    if (!inventoryUsageShape.valid) return inventoryUsageShape;
  }

  for (const aggregation of plan.aggregations) {
    const aggregationValidation = validateAggregation(selectItems, aggregation, sql, {
      allowGovernedCteScalar:
        plan.resultMode === 'scalar'
        && plan.viewNames.length === 2
        && guard.parsed.cteNames.length === 1
        && !guard.parsed.hasGroupBy,
      allowGovernedCtePassthrough:
        ['grouped', 'detail', 'ranking'].includes(plan.resultMode)
        && plan.viewNames.length === 2
        && guard.parsed.cteNames.length === 1
        && guard.parsed.hasGroupBy,
      cteNames: guard.parsed.cteNames,
    });
    if (!aggregationValidation.valid) return aggregationValidation;
  }

  if (plan.timeGrain) {
    const grainItem = selectItems.find((item) => containsIdentifier(item, plan.timeGrain!.alias));
    const sourcePattern = escapeRegExp(plan.timeGrain.sourceField);
    const grainPattern = new RegExp(
      `(?:date_trunc\\s*\\(\\s*'${plan.timeGrain.granularity}'\\s*,\\s*(?:[a-z_][a-z0-9_]*\\.)?${sourcePattern}\\s*\\)|(?:[a-z_][a-z0-9_]*\\.)?${sourcePattern}::date)`,
      'i',
    );
    if (!grainItem || !grainPattern.test(grainItem)) {
      return invalid('query_plan_time_grain_mismatch', `趋势必须按 ${plan.timeGrain.granularity} 聚合 ${plan.timeGrain.sourceField}。`);
    }
    if (!groupBy.some((item) => grainPattern.test(item) || containsIdentifier(item, plan.timeGrain!.alias))) {
      return invalid('query_plan_time_group_by_missing', '趋势 SQL 缺少受控时间粒度分组。');
    }
  }
  const allowGovernedSupplierSummaryProjection =
    plan.resultMode === 'grouped'
    && plan.viewNames.length === 2
    && [...plan.viewNames].sort().join('|')
      === 'agent_v3_purchase_procurement_view|agent_v3_supplier_performance_view'
    && plan.requiredJoinKeys.length === 1
    && plan.requiredJoinKeys[0] === 'supplier_id'
    && guard.parsed.cteNames.length === 1
    && groupBy.length === 0;
  const missingGroup = allowGovernedSupplierSummaryProjection
    ? undefined
    : plan.requiredGroupByFields.find((field) =>
      field !== plan.timeGrain?.alias && !groupBy.some((item) => containsIdentifier(item, field)),
    );
  if (missingGroup) return invalid('query_plan_group_by_missing', `SQL 缺少要求的分组字段：${missingGroup}`);
  const forbiddenGroup = plan.forbiddenGroupByFields.find((field) => groupBy.some((item) => isBareIdentifier(item, field)));
  if (forbiddenGroup) return invalid('query_plan_group_by_forbidden', `SQL 使用了会改变统计粒度的额外分组字段：${forbiddenGroup}`);
  if (groupBy.length) {
    const ungroupedSelect = selectItems.find((item) => {
      if (isAggregateSelectItem(item)) return false;
      const expression = selectExpression(item);
      const alias = selectAlias(item);
      return !groupBy.some((group) =>
        normalizeExpression(group) === normalizeExpression(expression)
        || (alias ? isBareIdentifier(group, alias) : false),
      );
    });
    if (ungroupedSelect) {
      return invalid('query_plan_select_not_grouped', `SQL 输出了未参与聚合分组的字段：${selectExpression(ungroupedSelect)}`);
    }
  }
  if (!plan.requiredGroupByFields.length && plan.resultMode === 'scalar' && guard.parsed.hasGroupBy) {
    return invalid('query_plan_scalar_grouped', '标量查询不应被额外分组。');
  }
  if (plan.resultMode === 'detail' && guard.parsed.hasGroupBy && plan.aggregations.every((item) => item.fn === 'none')) {
    return invalid('query_plan_detail_grouped', '明细查询不应通过聚合分组改变记录粒度。');
  }
  if (
    plan.requireDistinctResult &&
    !/\bselect\s+distinct\b/i.test(sql) &&
    !plan.dimensions.every((dimension) => groupBy.some((item) => containsIdentifier(item, dimension.field)))
  ) {
    return invalid('query_plan_distinct_result_missing', '查询要求返回去重后的不同值。');
  }

  const expectedSort = plan.sort?.[0];
  if (expectedSort) {
    if (!orderBy.length || !containsIdentifier(orderBy.join(' '), expectedSort.field)) {
      return invalid('query_plan_order_by_metric_mismatch', `SQL 排序指标必须为 ${expectedSort.field}。`);
    }
    if (!new RegExp(`\\b${expectedSort.direction}\\b`, 'i').test(orderBy.join(' '))) {
      return invalid('query_plan_order_direction_mismatch', `SQL 排序方向必须为 ${expectedSort.direction.toUpperCase()}。`);
    }
    if (expectedSort.nulls && !new RegExp(`\\bnulls\\s+${expectedSort.nulls}\\b`, 'i').test(orderBy.join(' '))) {
      return invalid('query_plan_order_nulls_mismatch', `SQL 空值排序必须为 NULLS ${expectedSort.nulls.toUpperCase()}。`);
    }
  }
  const actualLimit = guard.parsed.limit ?? Number(sql.match(/\blimit\s+(\d+)\s*;?$/i)?.[1]);
  if (!Number.isFinite(actualLimit) || actualLimit !== plan.limit) {
    return invalid('query_plan_limit_mismatch', `SQL LIMIT 必须为 ${plan.limit}。`);
  }

  for (const filter of plan.filters) {
    if (!matchesFilter(sql, filter.field, filter.operator, filter.value)) {
      return invalid('query_plan_filter_missing', `SQL 缺少查询计划要求的筛选：${filter.field} ${filter.operator}`);
    }
  }
  if (plan.timeScopeMode === 'none' || plan.timeScopeMode === 'current_snapshot') {
    if (/:startat\b/i.test(sql)) {
      return invalid('query_plan_unexpected_time_filter', '状态或静态查询不得被默认事件时间范围裁剪。');
    }
    const hasGovernedEndAtFilter = plan.filters.some((filter) => END_AT_FILTER_OPERATORS.has(filter.operator));
    if (/:endat\b/i.test(sql) && !hasGovernedEndAtFilter) {
      return invalid('query_plan_unexpected_time_filter', '状态或静态查询不得被默认事件时间范围裁剪。');
    }
  }
  if (plan.timeScopeMode === 'active_interval') {
    const qualifiedStart = '(?:[a-z_][a-z0-9_]*\\.)?start_at';
    const qualifiedEnd = '(?:[a-z_][a-z0-9_]*\\.)?end_at';
    const asOf = ':(?:endat|asoftime)(?:\\s*::\\s*(?:date|timestamp|timestamptz))*';
    const startsBeforeAsOf = new RegExp(`${qualifiedStart}\\s*<=\\s*${asOf}`, 'i').test(sql);
    const endsAfterAsOf = new RegExp(`coalesce\\s*\\(\\s*${qualifiedEnd}\\s*,\\s*${asOf}\\s*\\)\\s*>=\\s*${asOf}`, 'i').test(sql);
    if (!startsBeforeAsOf || !endsAfterAsOf) {
      return invalid('query_plan_active_interval_missing', '当前生效活动必须按开始/结束有效区间判断。');
    }
  }
  return { valid: true };
}

function validateAggregation(
  selectItems: string[],
  aggregation: AskDataQueryAggregation,
  normalizedSql: string,
  options: {
    allowGovernedCteScalar: boolean;
    allowGovernedCtePassthrough: boolean;
    cteNames: string[];
  },
): AskDataQueryPlanValidation {
  const item = selectItems.find((candidate) => containsIdentifier(candidate, aggregation.alias));
  if (!item) return invalid('query_plan_aggregation_missing', `SQL 缺少指标：${aggregation.alias}`);
  const field = escapeRegExp(aggregation.field);
  const fnPattern = aggregation.fn === 'count_distinct'
    ? new RegExp(`count\\s*\\(\\s*distinct\\s+(?:[a-z_][a-z0-9_]*\\.)?${field}\\s*\\)`, 'i')
    : aggregation.fn === 'sum_abs'
      ? new RegExp(`sum\\s*\\(\\s*abs\\s*\\(\\s*(?:[a-z_][a-z0-9_]*\\.)?${field}\\s*\\)\\s*\\)`, 'i')
      : new RegExp(`${aggregation.fn}\\s*\\(\\s*(?:[a-z_][a-z0-9_]*\\.)?${field}\\s*\\)`, 'i');
  if (aggregation.zeroOnEmpty) {
    const zeroSafeAggregate = new RegExp(
      `coalesce\\s*\\(\\s*${fnPattern.source}\\s*,\\s*0(?:\\.0+)?\\s*\\)`,
      'i',
    );
    const governedZeroSafeCte = (options.allowGovernedCteScalar || options.allowGovernedCtePassthrough)
      && isGovernedZeroSafeCteProjection(item, aggregation.alias, fnPattern, normalizedSql, options.cteNames);
    const inherentlyZeroSafeCount = ['count', 'count_distinct'].includes(aggregation.fn) && fnPattern.test(item);
    if (!zeroSafeAggregate.test(item) && !governedZeroSafeCte && !inherentlyZeroSafeCount) {
      return invalid('query_plan_zero_safe_aggregation_missing', `指标 ${aggregation.alias} 必须在无记录时返回 0。`);
    }
  }
  if (aggregation.fn === 'none') {
    if (!containsIdentifier(item, aggregation.field)) {
      return invalid('query_plan_detail_field_mismatch', `明细字段 ${aggregation.alias} 未直接来自 ${aggregation.field}。`);
    }
    if (new RegExp(`(?:sum|avg|count|min|max)\\s*\\([^)]*${field}`, 'i').test(item)) {
      return invalid('query_plan_detail_field_aggregated', `明细字段 ${aggregation.alias} 不得被聚合。`);
    }
    return { valid: true };
  }
  if (aggregation.fn === 'derived') {
    const governedCteDerivedPassthrough = options.allowGovernedCtePassthrough
      && isGovernedCteDerivedPassthrough(item, aggregation, normalizedSql, options.cteNames);
    if (governedCteDerivedPassthrough) return { valid: true };
    const sources = aggregation.sourceFields ?? [];
    if (!sources.every((source) => containsIdentifier(item, source))) {
      return invalid('query_plan_derived_metric_source_missing', `派生指标 ${aggregation.alias} 缺少受控来源字段。`);
    }
    if (!item.includes('/') && !item.includes('+') && !item.includes('-') && !/\bfilter\b/i.test(item)) {
      return invalid('query_plan_derived_metric_formula_mismatch', `派生指标 ${aggregation.alias} 未使用受控计算公式。`);
    }
    if (/\bfilter\b/i.test(aggregation.expression ?? '') && !/\bfilter\s*\(/i.test(item)) {
      return invalid('query_plan_derived_metric_filter_missing', `派生指标 ${aggregation.alias} 缺少受控 FILTER 条件。`);
    }
    if (/rate|roi|utilization/.test(aggregation.alias) && !/nullif\s*\(/i.test(item)) {
      return invalid('query_plan_ratio_denominator_unprotected', `比率指标 ${aggregation.alias} 必须使用 NULLIF 保护分母。`);
    }
    if (
      /::numeric|cast\s*\([^)]*\s+as\s+numeric\s*\)/i.test(aggregation.expression ?? '')
      && !/::numeric|cast\s*\([^)]*\s+as\s+numeric\s*\)/i.test(item)
    ) {
      return invalid('query_plan_ratio_numeric_cast_missing', `比率指标 ${aggregation.alias} 必须转换为 numeric，禁止整数除法。`);
    }
    return { valid: true };
  }
  const governedCteScalar = options.allowGovernedCteScalar
    && isGovernedCteScalarProjection(item, aggregation.alias, fnPattern, normalizedSql, options.cteNames);
  const governedCtePassthrough = options.allowGovernedCtePassthrough
    && isGovernedCteAggregationPassthrough(item, aggregation.alias, fnPattern, normalizedSql, options.cteNames);
  return fnPattern.test(item) || governedCteScalar || governedCtePassthrough
    ? { valid: true }
    : invalid('query_plan_aggregation_formula_mismatch', `指标 ${aggregation.alias} 必须使用 ${aggregation.fn}(${aggregation.field})。`);
}

function isGovernedCteScalarProjection(
  selectItem: string,
  outputAlias: string,
  aggregationPattern: RegExp,
  normalizedSql: string,
  cteNames: string[],
) {
  if (cteNames.length !== 1) return false;
  const output = escapeRegExp(outputAlias);
  const projection = selectItem.match(
    new RegExp(
      `^\\s*(?:coalesce\\s*\\(\\s*)?max\\s*\\(\\s*[a-z_][a-z0-9_]*\\.([a-z_][a-z0-9_]*)\\s*\\)(?:\\s*,\\s*0(?:\\.0+)?\\s*\\))?\\s+as\\s+${output}\\s*$`,
      'i',
    ),
  );
  if (!projection) return false;
  const cte = extractSingleCte(normalizedSql, cteNames[0]);
  if (!cte) return false;
  return governedAggregateFormulaPattern(aggregationPattern, projection[1]).test(cte.body);
}

function isGovernedZeroSafeCteProjection(
  selectItem: string,
  outputAlias: string,
  aggregationPattern: RegExp,
  normalizedSql: string,
  cteNames: string[],
) {
  if (cteNames.length !== 1) return false;
  const projection = selectItem.match(
    new RegExp(
      `^\\s*coalesce\\s*\\(\\s*(?:max\\s*\\(\\s*)?[a-z_][a-z0-9_]*\\.([a-z_][a-z0-9_]*)(?:\\s*\\))?\\s*,\\s*0(?:\\.0+)?\\s*\\)\\s+as\\s+${escapeRegExp(outputAlias)}\\s*$`,
      'i',
    ),
  );
  if (!projection) return false;
  const cte = extractSingleCte(normalizedSql, cteNames[0]);
  return Boolean(cte && governedAggregateFormulaPattern(aggregationPattern, projection[1]).test(cte.body));
}

function isGovernedCteAggregationPassthrough(
  selectItem: string,
  aggregationAlias: string,
  aggregationPattern: RegExp,
  normalizedSql: string,
  cteNames: string[],
) {
  if (cteNames.length !== 1) return false;
  const alias = escapeRegExp(aggregationAlias);
  const directProjection = selectItem.match(
    new RegExp(`^\\s*([a-z_][a-z0-9_]*)\\s*\\.\\s*${alias}(?:\\s+as\\s+${alias})?\\s*$`, 'i'),
  );
  const zeroSafeProjection = selectItem.match(
    new RegExp(
      `^\\s*coalesce\\s*\\(\\s*max\\s*\\(\\s*([a-z_][a-z0-9_]*)\\s*\\.\\s*${alias}\\s*\\)\\s*,\\s*0(?:\\.0+)?\\s*\\)\\s+as\\s+${alias}\\s*$`,
      'i',
    ),
  );
  const groupedProjection = selectItem.match(
    new RegExp(
      `^\\s*max\\s*\\(\\s*([a-z_][a-z0-9_]*)\\s*\\.\\s*${alias}\\s*\\)\\s+as\\s+${alias}\\s*$`,
      'i',
    ),
  );
  const oneToOneZeroSafeProjection = selectItem.match(
    new RegExp(
      `^\\s*coalesce\\s*\\(\\s*([a-z_][a-z0-9_]*)\\s*\\.\\s*${alias}\\s*,\\s*0(?:\\.0+)?\\s*\\)\\s+as\\s+${alias}\\s*$`,
      'i',
    ),
  );
  const projection = directProjection ?? groupedProjection ?? zeroSafeProjection ?? oneToOneZeroSafeProjection;
  if (!projection) return false;

  const cte = extractSingleCte(normalizedSql, cteNames[0]);
  if (!cte) return false;
  const governedFormula = governedAggregateFormulaPattern(aggregationPattern, aggregationAlias);
  if (!governedFormula.test(cte.body)) return false;

  const cteName = escapeRegExp(cteNames[0]);
  const qualifier = projection[1];
  if (qualifier.toLowerCase() === cteNames[0].toLowerCase()) {
    return new RegExp(
      `\\b(?:from|join)\\s+${cteName}(?=\\s*(?:\\b(?:on|where|left|right|inner|full|cross|join|group|order|having|limit)\\b|$))`,
      'i',
    ).test(cte.remainder);
  }
  return new RegExp(
    `\\b(?:from|join)\\s+${cteName}(?:\\s+as)?\\s+${escapeRegExp(qualifier)}\\b`,
    'i',
  ).test(cte.remainder);
}

function isGovernedCteDerivedPassthrough(
  selectItem: string,
  aggregation: AskDataQueryAggregation,
  normalizedSql: string,
  cteNames: string[],
) {
  if (cteNames.length !== 1 || !aggregation.expression) return false;
  const alias = escapeRegExp(aggregation.alias);
  const directProjection = selectItem.match(
    new RegExp('^\\s*([a-z_][a-z0-9_]*)\\s*\\.\\s*' + alias + '(?:\\s+as\\s+' + alias + ')?\\s*$', 'i'),
  );
  const groupedProjection = selectItem.match(
    new RegExp('^\\s*max\\s*\\(\\s*([a-z_][a-z0-9_]*)\\s*\\.\\s*' + alias + '\\s*\\)\\s+as\\s+' + alias + '\\s*$', 'i'),
  );
  const projection = directProjection ?? groupedProjection;
  if (!projection) return false;

  const cte = extractSingleCte(normalizedSql, cteNames[0]);
  if (!cte) return false;
  const governedItem = topLevelSelectItemsFromSqlBody(cte.body)
    .find((candidate) => selectAlias(candidate)?.toLowerCase() === aggregation.alias.toLowerCase());
  if (!governedItem) return false;
  if (canonicalSqlExpression(selectExpression(governedItem)) !== canonicalSqlExpression(aggregation.expression)) {
    return false;
  }

  const qualifier = projection[1];
  const cteName = escapeRegExp(cteNames[0]);
  if (qualifier.toLowerCase() === cteNames[0].toLowerCase()) {
    return new RegExp(
      '\\b(?:from|join)\\s+' + cteName
        + '(?=\\s*(?:\\b(?:on|where|left|right|inner|full|cross|join|group|order|having|limit)\\b|$))',
      'i',
    ).test(cte.remainder);
  }
  return new RegExp(
    '\\b(?:from|join)\\s+' + cteName + '(?:\\s+as)?\\s+' + escapeRegExp(qualifier) + '\\b',
    'i',
  ).test(cte.remainder);
}

function governedAggregateFormulaPattern(aggregationPattern: RegExp, aggregationAlias: string) {
  const alias = escapeRegExp(aggregationAlias);
  return new RegExp(
    `(?:${aggregationPattern.source}|coalesce\\s*\\(\\s*${aggregationPattern.source}\\s*,\\s*0(?:\\.0+)?\\s*\\))\\s+as\\s+${alias}\\b`,
    'i',
  );
}

function validateInventoryUsageBalanceShape(
  selectItems: string[],
  normalizedSql: string,
  cteNames: string[],
): AskDataQueryPlanValidation {
  if (cteNames.length !== 1) {
    return invalid(
      'query_plan_inventory_usage_balance_shape_mismatch',
      '期间消耗与当前库存组合查询必须使用一个消耗聚合 CTE，并保留当前库存商品。',
    );
  }
  const cte = extractSingleCte(normalizedSql, cteNames[0]);
  if (!cte) {
    return invalid('query_plan_inventory_usage_balance_shape_mismatch', '未识别到受控的期间消耗聚合 CTE。');
  }
  const inventoryBase = cte.remainder.match(
    /\bfrom\s+agent_v3_product_inventory_view(?:\s+as)?\s+([a-z_][a-z0-9_]*)\b/i,
  );
  if (!inventoryBase) {
    return invalid(
      'query_plan_inventory_usage_balance_shape_mismatch',
      '必须以当前商品库存为主数据源，避免本期零消耗商品被遗漏。',
    );
  }
  const cteName = escapeRegExp(cteNames[0]);
  const aliasedLeftJoin = cte.remainder.match(
    new RegExp(`\\bleft\\s+join\\s+${cteName}(?:\\s+as)?\\s+(?!on\\b)([a-z_][a-z0-9_]*)\\s+on\\b`, 'i'),
  );
  const unaliasedLeftJoin = new RegExp(`\\bleft\\s+join\\s+${cteName}\\s+on\\b`, 'i').test(cte.remainder);
  if (!aliasedLeftJoin && !unaliasedLeftJoin) {
    return invalid(
      'query_plan_inventory_usage_balance_shape_mismatch',
      '期间消耗必须左连接到当前库存，不能用内连接丢弃本期零消耗商品。',
    );
  }
  const inventoryQualifier = escapeRegExp(inventoryBase[1]);
  if (!new RegExp(`\\b${inventoryQualifier}\\.product_name\\s+i?like\\b`, 'i').test(cte.remainder)) {
    return invalid(
      'query_plan_inventory_usage_balance_product_filter_missing',
      '商品名称范围必须作用于当前库存主数据源。',
    );
  }
  const usageQualifier = escapeRegExp(aliasedLeftJoin?.[1] ?? cteNames[0]);
  const zeroSafeConsumption = new RegExp(
    `coalesce\\s*\\(\\s*max\\s*\\(\\s*${usageQualifier}\\.consumed_quantity\\s*\\)\\s*,\\s*0(?:\\.0+)?\\s*\\)`,
    'i',
  );
  if (!selectItems.some((item) => zeroSafeConsumption.test(item))) {
    return invalid(
      'query_plan_inventory_usage_balance_zero_missing',
      '本期无消耗流水时 consumed_quantity 必须通过 COALESCE(MAX(CTE.consumed_quantity), 0) 返回 0。',
    );
  }
  return { valid: true };
}

function extractSingleCte(normalizedSql: string, cteName: string) {
  const declaration = new RegExp(
    `\\bwith\\s+${escapeRegExp(cteName)}(?:\\s*\\([^)]*\\))?\\s+as\\s*\\(`,
    'i',
  ).exec(normalizedSql);
  if (!declaration || declaration.index === undefined) return undefined;
  const openIndex = declaration.index + declaration[0].lastIndexOf('(');
  let depth = 0;
  for (let index = openIndex; index < normalizedSql.length; index += 1) {
    if (normalizedSql[index] === '(') depth += 1;
    if (normalizedSql[index] !== ')') continue;
    depth -= 1;
    if (depth === 0) {
      return {
        body: normalizedSql.slice(openIndex + 1, index),
        remainder: normalizedSql.slice(index + 1),
      };
    }
  }
  return undefined;
}

function topLevelSelectItemsFromSqlBody(sqlBody: string) {
  const normalized = normalizeSql(sqlBody);
  const selectMatch = /\bselect\b/i.exec(normalized);
  if (!selectMatch || selectMatch.index === undefined) return [];
  const start = selectMatch.index + selectMatch[0].length;
  let depth = 0;
  let fromIndex = -1;
  for (let index = start; index < normalized.length; index += 1) {
    if (normalized[index] === '(') depth += 1;
    if (normalized[index] === ')') depth = Math.max(0, depth - 1);
    if (
      depth === 0
      && normalized.slice(index, index + 4) === 'from'
      && !/[a-z0-9_]/.test(normalized[index - 1] ?? '')
      && !/[a-z0-9_]/.test(normalized[index + 4] ?? '')
    ) {
      fromIndex = index;
      break;
    }
  }
  if (fromIndex < 0) return [];

  const items: string[] = [];
  let current = '';
  depth = 0;
  for (const character of normalized.slice(start, fromIndex)) {
    if (character === '(') depth += 1;
    if (character === ')') depth = Math.max(0, depth - 1);
    if (character === ',' && depth === 0) {
      if (current.trim()) items.push(current.trim());
      current = '';
      continue;
    }
    current += character;
  }
  if (current.trim()) items.push(current.trim());
  return items;
}

function matchesFilter(sql: string, field: string, operator: string, value: unknown) {
  const qualified = `(?:[a-z_][a-z0-9_]*\\.)?${escapeRegExp(field)}`;
  if (operator === 'eq') return new RegExp(`${qualified}\\s*=`, 'i').test(sql);
  if (operator === 'not_in') return new RegExp(`${qualified}\\s+not\\s+in\\s*\\(`, 'i').test(sql);
  if (operator === 'in') return new RegExp(`${qualified}\\s+in\\s*\\(`, 'i').test(sql);
  if (operator === 'lte') return new RegExp(`${qualified}\\s*<=`, 'i').test(sql);
  if (operator === 'gte') {
    return new RegExp('(?:' + qualified + '|sum\\s*\\(\\s*' + qualified + '\\s*\\))\\s*>=', 'i').test(sql);
  }
  if (operator === 'lte_as_of') return new RegExp(`${qualified}\\s*<=\\s*:(?:endat|asoftime)`, 'i').test(sql);
  if (operator === 'gte_as_of') return new RegExp(`${qualified}\\s*>=\\s*:(?:endat|asoftime)`, 'i').test(sql);
  if (operator === 'gte_as_of_nullable') {
    return new RegExp(`coalesce\\s*\\(\\s*${qualified}\\s*,\\s*:(?:endat|asoftime)`, 'i').test(sql);
  }
  if (operator === 'contains') return new RegExp(`${qualified}\\s+(?:i?like)`, 'i').test(sql);
  if (operator === 'contains_any') return new RegExp(`${qualified}\\s+(?:i?like)`, 'i').test(sql);
  if (operator === 'is_not_null') return new RegExp(`${qualified}\\s+is\\s+not\\s+null`, 'i').test(sql);
  if (operator === 'sum_with_gt') {
    const input = value && typeof value === 'object' ? value as { field?: unknown; threshold?: unknown } : {};
    const other = escapeRegExp(String(input.field ?? ''));
    const threshold = escapeRegExp(String(input.threshold ?? 0));
    return new RegExp(`\\(?\\s*${qualified}\\s*\\+\\s*(?:[a-z_][a-z0-9_]*\\.)?${other}\\s*\\)?\\s*>\\s*${threshold}`, 'i').test(sql);
  }
  if (operator === 'gt') {
    return new RegExp('(?:' + qualified + '|sum\\s*\\(\\s*' + qualified + '\\s*\\))\\s*>', 'i').test(sql);
  }
  if (operator === 'lt') return new RegExp(`${qualified}\\s*<`, 'i').test(sql);
  if (operator === 'field_lt') {
    const otherField = typeof value === 'string' ? escapeRegExp(value) : String(value);
    return new RegExp(`${qualified}\\s*<\\s*(?:[a-z_][a-z0-9_]*\\.)?${otherField}`, 'i').test(sql);
  }
  if (operator === 'field_ratio_gt') {
    const ratio = value && typeof value === 'object' ? value as { field?: unknown; multiplier?: unknown } : {};
    const otherField = escapeRegExp(String(ratio.field ?? ''));
    const multiplier = escapeRegExp(String(ratio.multiplier ?? ''));
    return new RegExp(`${qualified}\\s*>\\s*(?:[a-z_][a-z0-9_]*\\.)?${otherField}\\s*\\*\\s*${multiplier}`, 'i').test(sql);
  }
  if (operator === 'neq') return new RegExp(`${qualified}\\s*(?:<>|!=)`, 'i').test(sql);
  if (operator === 'aggregate_gt') {
    const otherField = typeof value === 'string' ? escapeRegExp(value) : String(value);
    return new RegExp(`sum\\s*\\(\\s*${qualified}\\s*\\)\\s*>\\s*(?:sum\\s*\\(\\s*(?:[a-z_][a-z0-9_]*\\.)?${otherField}\\s*\\)|${otherField})`, 'i').test(sql);
  }
  if (operator === 'aggregate_lt') {
    const otherField = typeof value === 'string' ? escapeRegExp(value) : String(value);
    return new RegExp(`sum\\s*\\(\\s*${qualified}\\s*\\)\\s*<\\s*(?:sum\\s*\\(\\s*(?:[a-z_][a-z0-9_]*\\.)?${otherField}\\s*\\)|${otherField})`, 'i').test(sql);
  }
  if (operator === 'aggregate_eq') {
    return new RegExp(`sum\\s*\\(\\s*${qualified}\\s*\\)\\s*=`, 'i').test(sql);
  }
  if (operator === 'between' && Array.isArray(value)) return new RegExp(`${qualified}\\s+between`, 'i').test(sql);
  if (operator === 'between_as_of_days') {
    const days = Number(value);
    if (!Number.isFinite(days) || days < 0) return false;
    const cast = `(?:\\s*::\\s*(?:date|timestamp|timestamptz))*`;
    const asOfParameter = `:(?:endat|asoftime)`;
    const asOf = `\\(?\\s*${asOfParameter}${cast}\\s*\\)?`;
    const interval = `(?:${escapeRegExp(String(days))}|interval\\s*'\\s*${escapeRegExp(String(days))}\\s+days?\\s*')`;
    const upperBound = `\\(?\\s*${asOfParameter}${cast}\\s*\\+\\s*${interval}\\s*\\)?${cast}`;
    const between = new RegExp(`${qualified}\\s+between\\s+${asOf}\\s+and\\s+${upperBound}`, 'i');
    const lowerComparison = new RegExp(`${qualified}\\s*>=\\s*${asOf}`, 'i');
    const upperComparison = new RegExp(`${qualified}\\s*<=\\s*${upperBound}`, 'i');
    const exclusiveUpperComparison = new RegExp(`${qualified}\\s*<\\s*${upperBound}`, 'i');
    return between.test(sql) || (lowerComparison.test(sql) && (upperComparison.test(sql) || exclusiveUpperComparison.test(sql)));
  }
  if (operator === 'gte_as_of_time') return new RegExp(`${qualified}\\s*>=\\s*:asoftime`, 'i').test(sql);
  return containsIdentifier(sql, field);
}

const END_AT_FILTER_OPERATORS = new Set([
  'between_as_of_days',
  'lte_as_of',
  'gte_as_of',
  'gte_as_of_nullable',
]);

function topLevelSelectItems(tokens: string[]) {
  let depth = 0;
  let select = -1;
  let from = -1;
  for (let index = 0; index < tokens.length; index += 1) {
    if (tokens[index] === '(') depth += 1;
    if (tokens[index] === ')') depth = Math.max(0, depth - 1);
    const lowered = tokens[index].toLowerCase();
    if (depth === 0 && lowered === 'select') select = index;
    if (select >= 0 && depth === 0 && lowered === 'from') { from = index; break; }
  }
  if (select < 0 || from < 0) return [];
  return splitTopLevel(tokens.slice(select + 1, from)).map((parts) => parts.join(' ').toLowerCase());
}

function topLevelClauseIdentifiers(tokens: string[], start: string, stops: string[]) {
  return splitTopLevel(topLevelClauseTokens(tokens, start, stops)).map((parts) => parts.join(' ').toLowerCase());
}

function topLevelClauseTokens(tokens: string[], start: string, stops: string[]) {
  let depth = 0;
  let startIndex = -1;
  for (let index = 0; index < tokens.length; index += 1) {
    if (tokens[index] === '(') depth += 1;
    if (tokens[index] === ')') depth = Math.max(0, depth - 1);
    if (depth === 0 && tokens[index].toLowerCase() === start && tokens[index + 1]?.toLowerCase() === 'by') {
      startIndex = index + 2;
      break;
    }
  }
  if (startIndex < 0) return [];
  const collected: string[] = [];
  depth = 0;
  for (let index = startIndex; index < tokens.length; index += 1) {
    if (tokens[index] === '(') depth += 1;
    if (tokens[index] === ')') depth = Math.max(0, depth - 1);
    if (depth === 0 && stops.includes(tokens[index].toLowerCase())) break;
    collected.push(tokens[index]);
  }
  return collected;
}

function splitTopLevel(tokens: string[]) {
  const chunks: string[][] = [];
  let current: string[] = [];
  let depth = 0;
  for (const token of tokens) {
    if (token === '(') depth += 1;
    if (token === ')') depth = Math.max(0, depth - 1);
    if (token === ',' && depth === 0) {
      chunks.push(current);
      current = [];
    } else current.push(token);
  }
  if (current.length) chunks.push(current);
  return chunks;
}

function containsIdentifier(text: string, identifier: string) {
  return new RegExp(`(?:^|[^a-z0-9_])${escapeRegExp(identifier)}(?:$|[^a-z0-9_])`, 'i').test(text);
}

function isBareIdentifier(text: string, identifier: string) {
  const normalized = text.replace(/"/g, '').trim().toLowerCase();
  return new RegExp(`^(?:[a-z_][a-z0-9_]*\\.)?${escapeRegExp(identifier)}(?:\\s+(?:asc|desc))?$`, 'i').test(normalized);
}

function isAggregateSelectItem(item: string) {
  return /\b(?:sum|avg|count|min|max|bool_and|bool_or|string_agg|array_agg|json_agg|jsonb_agg)\s*\(/i.test(item)
    || /\bover\s*\(/i.test(item);
}

function selectExpression(item: string) {
  return item
    .replace(/\s+as\s+[a-z_][a-z0-9_]*\s*$/i, '')
    .trim();
}

function selectAlias(item: string) {
  return item.match(/\s+as\s+([a-z_][a-z0-9_]*)\s*$/i)?.[1];
}

function normalizeExpression(value: string) {
  return value.replace(/"/g, '').replace(/\s+/g, '').replace(/^[a-z_][a-z0-9_]*\./i, '').toLowerCase();
}

function canonicalSqlExpression(value: string) {
  return value
    .replace(/"/g, '')
    .replace(/\b[a-z_][a-z0-9_]*\./gi, '')
    .replace(/\s+/g, '')
    .toLowerCase();
}

function normalizeSql(sql: string) {
  return sql.replace(/"/g, '').replace(/\s+/g, ' ').trim().toLowerCase();
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function invalid(reasonCode: string, message: string): AskDataQueryPlanValidation {
  return { valid: false, reasonCode, message };
}
