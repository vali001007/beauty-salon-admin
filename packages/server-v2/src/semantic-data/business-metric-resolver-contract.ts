import type {
  BusinessMetricRuntimeExpression,
  BusinessMetricRuntimeQuery,
} from '../brain/cognition/business-definition-snapshot.types.js';

export interface BusinessMetricResolverContract {
  readonly key:
    | 'manager_staff_analysis'
    | 'manager_operations_analysis'
    | 'finance_cost_analysis'
    | 'inventory_risk_summary'
    | 'inventory_consumption_rows'
    | 'product_margin_rows'
    | 'marketing_follow_up_opportunities'
    | 'customer_retention_summary'
    | 'customer_acquisition_conversion_summary'
    | 'customer_service_feedback_summary'
    | 'customer_service_feedback_by_staff'
    | 'customer_waiting_summary'
    | 'customer_dormant_reactivation_rows';
  readonly storeModel: string;
  readonly dimensionFields: readonly string[];
  readonly numericExpressionFields: readonly string[];
}

export interface BusinessMetricResolverRowSource {
  loadRows(input: {
    resolverKey: BusinessMetricResolverContract['key'];
    storeId: number;
    startDate: Date;
    endExclusive: Date;
  }): Promise<Record<string, unknown>[]>;
}

export interface BusinessMetricResolverEvaluationInput {
  metricKey: string;
  resolver: NonNullable<BusinessMetricRuntimeQuery['resolver']>;
  dimensions: readonly string[];
  outputField: string;
  sourceModels: readonly string[];
  storeScope: BusinessMetricRuntimeQuery['storeScope'];
  rows: readonly Record<string, unknown>[];
}

export interface BusinessMetricResolverEvaluationResult {
  outputField: string;
  groups: Array<{ dimensions: Record<string, unknown>; value: number }>;
  overallValue: number;
}

const CONTRACTS: Readonly<Record<BusinessMetricResolverContract['key'], BusinessMetricResolverContract>> =
  Object.freeze({
    manager_staff_analysis: Object.freeze({
      key: 'manager_staff_analysis' as const,
      storeModel: 'Beautician',
      dimensionFields: Object.freeze(['beauticianId', 'name']),
      numericExpressionFields: Object.freeze([
        'serviceCount',
        'completedCount',
        'uniqueCustomerCount',
        'repeatCustomerCount',
        'revenueAmount',
        'commissionAmount',
        'timeOffHours',
      ]),
    }),
    manager_operations_analysis: Object.freeze({
      key: 'manager_operations_analysis' as const,
      storeModel: 'ProductOrder',
      dimensionFields: Object.freeze([]),
      numericExpressionFields: Object.freeze(['revenue', 'orderCount', 'customerCount', 'avgTransaction']),
    }),
    finance_cost_analysis: Object.freeze({
      key: 'finance_cost_analysis' as const,
      storeModel: 'ProductOrder',
      dimensionFields: Object.freeze([]),
      numericExpressionFields: Object.freeze([
        'revenue',
        'materialCost',
        'commissionCost',
        'operatingCost',
        'grossProfit',
        'grossMarginRate',
        'cardLiability',
      ]),
    }),
    inventory_risk_summary: Object.freeze({
      key: 'inventory_risk_summary' as const,
      storeModel: 'Product',
      dimensionFields: Object.freeze(['productId', 'name']),
      numericExpressionFields: Object.freeze(['currentStock', 'safetyStock']),
    }),
    inventory_consumption_rows: Object.freeze({
      key: 'inventory_consumption_rows' as const,
      storeModel: 'Product',
      dimensionFields: Object.freeze(['productId', 'name']),
      numericExpressionFields: Object.freeze(['outboundQty']),
    }),
    product_margin_rows: Object.freeze({
      key: 'product_margin_rows' as const,
      storeModel: 'Product',
      dimensionFields: Object.freeze(['productId', 'productName']),
      numericExpressionFields: Object.freeze([
        'quantity', 'netRevenue', 'costAmount', 'grossProfit', 'grossMarginRate',
        'belowCostSaleCount', 'costCoverageRate',
      ]),
    }),
    marketing_follow_up_opportunities: Object.freeze({
      key: 'marketing_follow_up_opportunities' as const,
      storeModel: 'CustomerOpportunity',
      dimensionFields: Object.freeze(['customerId', 'customerName']),
      numericExpressionFields: Object.freeze(['score']),
    }),
    customer_retention_summary: Object.freeze({
      key: 'customer_retention_summary' as const,
      storeModel: 'Customer',
      dimensionFields: Object.freeze([]),
      numericExpressionFields: Object.freeze([
        'activeCustomerCount',
        'repeatCustomerCount',
        'repurchaseRate',
        'repeatIntervalCount',
        'averageReturnIntervalDays',
      ]),
    }),
    customer_acquisition_conversion_summary: Object.freeze({
      key: 'customer_acquisition_conversion_summary' as const,
      storeModel: 'Customer',
      dimensionFields: Object.freeze([]),
      numericExpressionFields: Object.freeze([
        'newCustomerCount',
        'convertedCustomerCount',
        'unconvertedCustomerCount',
        'conversionRate',
      ]),
    }),
    customer_service_feedback_summary: Object.freeze({
      key: 'customer_service_feedback_summary' as const,
      storeModel: 'CustomerServiceFeedback',
      dimensionFields: Object.freeze([]),
      numericExpressionFields: Object.freeze([
        'feedbackCount',
        'complaintCount',
        'unresolvedComplaintCount',
        'ratedFeedbackCount',
        'ratingTotal',
        'lowRatingCount',
        'completedServiceTaskCount',
        'linkedServiceTaskCount',
        'collectionCoverageRate',
      ]),
    }),
    customer_service_feedback_by_staff: Object.freeze({
      key: 'customer_service_feedback_by_staff' as const,
      storeModel: 'CustomerServiceFeedback',
      dimensionFields: Object.freeze(['beauticianId', 'beauticianName']),
      numericExpressionFields: Object.freeze([
        'feedbackCount',
        'complaintCount',
        'unresolvedComplaintCount',
        'lowRatingCount',
        'ratedFeedbackCount',
        'averageRating',
      ]),
    }),
    customer_waiting_summary: Object.freeze({
      key: 'customer_waiting_summary' as const,
      storeModel: 'CustomerWaitingEpisode',
      dimensionFields: Object.freeze([]),
      numericExpressionFields: Object.freeze([
        'waitingEpisodeCount',
        'activeWaitingCount',
        'endedWaitingCount',
        'servedCount',
        'leftCount',
        'longWaitDepartureCount',
        'averageWaitMinutes',
        'checkedInReservationCount',
        'linkedReservationCount',
        'collectionCoverageRate',
      ]),
    }),
    customer_dormant_reactivation_rows: Object.freeze({
      key: 'customer_dormant_reactivation_rows' as const,
      storeModel: 'Customer',
      dimensionFields: Object.freeze(['customerId', 'customerName']),
      numericExpressionFields: Object.freeze(['reactivationSignal']),
    }),
  });

export function getBusinessMetricResolverContract(key: string): BusinessMetricResolverContract | undefined {
  return CONTRACTS[key as BusinessMetricResolverContract['key']];
}

export function validateBusinessMetricResolverStoreScope(input: {
  resolverKey: string;
  sourceModels: readonly string[];
  anchorModel: string;
  terminalModel: string;
  field: string;
  joinPathLength: number;
}): string | undefined {
  const contract = getBusinessMetricResolverContract(input.resolverKey);
  if (!contract) return `resolver_key:${input.resolverKey}`;
  if (input.anchorModel !== contract.storeModel) return `anchor_model:${input.anchorModel}`;
  if (input.terminalModel !== contract.storeModel) return `terminal_model:${input.terminalModel}`;
  if (input.field !== 'storeId') return `field:${input.field}`;
  if (input.joinPathLength !== 0) return `join_path:${input.joinPathLength}`;
  if (!input.sourceModels.includes(contract.storeModel)) return `source_model:${contract.storeModel}`;
  return undefined;
}

export function evaluateBusinessMetricResolver(
  input: BusinessMetricResolverEvaluationInput,
): BusinessMetricResolverEvaluationResult {
  const contract = getBusinessMetricResolverContract(input.resolver.key);
  if (!contract) throw new Error(`semantic_resolver_key_unsupported:${input.resolver.key}`);
  if (!input.sourceModels.includes(contract.storeModel)) {
    throw new Error(`semantic_resolver_source_model_missing:${contract.storeModel}`);
  }
  const storeScopeIssue = validateBusinessMetricResolverStoreScope({
    resolverKey: input.resolver.key,
    sourceModels: input.sourceModels,
    anchorModel: input.storeScope.anchorModel ?? input.storeScope.model,
    terminalModel: input.storeScope.model,
    field: input.storeScope.field,
    joinPathLength: input.storeScope.joinPath.length,
  });
  if (storeScopeIssue) throw new Error(`semantic_resolver_store_scope_invalid:${storeScopeIssue}`);

  const expectedDimensions = new Set(input.dimensions);
  const mappedDimensions = Object.keys(input.resolver.dimensionFields);
  if (
    mappedDimensions.length !== expectedDimensions.size ||
    mappedDimensions.some((dimensionKey) => !expectedDimensions.has(dimensionKey))
  ) {
    throw new Error(`semantic_resolver_dimension_mapping_mismatch:${input.metricKey}`);
  }
  for (const field of new Set(Object.values(input.resolver.dimensionFields))) {
    if (!contract.dimensionFields.includes(field)) {
      throw new Error(`semantic_resolver_dimension_field_not_allowed:${input.resolver.key}:${field}`);
    }
  }
  for (const field of new Set(expressionFields(input.resolver.expression))) {
    if (!contract.numericExpressionFields.includes(field)) {
      throw new Error(`semantic_resolver_numeric_field_not_allowed:${input.resolver.key}:${field}`);
    }
  }

  const groups: BusinessMetricResolverEvaluationResult['groups'] = [];
  const seen = new Set<string>();
  for (const row of input.rows) {
    const dimensions = Object.fromEntries(
      input.dimensions.map((dimensionKey) => {
        const sourceField = input.resolver.dimensionFields[dimensionKey];
        if (!sourceField || !(sourceField in row)) {
          throw new Error(`semantic_resolver_dimension_field_missing:${dimensionKey}`);
        }
        return [dimensionKey, row[sourceField]];
      }),
    );
    const groupKey = JSON.stringify(dimensions);
    if (seen.has(groupKey)) throw new Error(`semantic_resolver_duplicate_dimension:${groupKey}`);
    seen.add(groupKey);
    groups.push({
      dimensions,
      value: normalizeCalculatedNumber(evaluateExpression(input.resolver.expression, row, 0)),
    });
  }
  return {
    outputField: input.outputField,
    groups,
    overallValue: normalizeCalculatedNumber(
      aggregateResolvedValues(
        input.resolver.overallAggregation,
        groups.map((group) => group.value),
      ),
    ),
  };
}

function expressionFields(expression: BusinessMetricRuntimeExpression): string[] {
  if (expression.op === 'field') return [expression.field];
  if (expression.op === 'constant') return [];
  if (expression.op === 'add') return expression.operands.flatMap((operand) => expressionFields(operand));
  if (expression.op === 'subtract' || expression.op === 'multiply') {
    return [...expressionFields(expression.left), ...expressionFields(expression.right)];
  }
  if (expression.op === 'divide') {
    return [...expressionFields(expression.numerator), ...expressionFields(expression.denominator)];
  }
  return expressionFields(expression.value);
}

function evaluateExpression(
  expression: BusinessMetricRuntimeExpression,
  row: Record<string, unknown>,
  depth: number,
): number {
  if (depth > 12) throw new Error('semantic_resolver_expression_too_deep');
  if (expression.op === 'field') {
    if (!Object.prototype.hasOwnProperty.call(row, expression.field)) {
      throw new Error(`semantic_resolver_field_missing:${expression.field}`);
    }
    return toNumber(row[expression.field]);
  }
  if (expression.op === 'constant') return toNumber(expression.value);
  if (expression.op === 'add') {
    if (!expression.operands.length || expression.operands.length > 16) {
      throw new Error('semantic_resolver_add_operands_invalid');
    }
    return expression.operands.reduce((sum, operand) => sum + evaluateExpression(operand, row, depth + 1), 0);
  }
  if (expression.op === 'subtract') {
    return evaluateExpression(expression.left, row, depth + 1) - evaluateExpression(expression.right, row, depth + 1);
  }
  if (expression.op === 'multiply') {
    return evaluateExpression(expression.left, row, depth + 1) * evaluateExpression(expression.right, row, depth + 1);
  }
  if (expression.op === 'divide') {
    const numerator = evaluateExpression(expression.numerator, row, depth + 1);
    const denominator = evaluateExpression(expression.denominator, row, depth + 1);
    if (denominator === 0) {
      if (expression.zero === 'zero') return 0;
      throw new Error('semantic_resolver_division_by_zero');
    }
    return numerator / denominator;
  }
  const value = evaluateExpression(expression.value, row, depth + 1);
  if (!Number.isFinite(expression.min) || !Number.isFinite(expression.max) || expression.min > expression.max) {
    throw new Error('semantic_resolver_clamp_invalid');
  }
  return Math.min(expression.max, Math.max(expression.min, value));
}

function aggregateResolvedValues(
  aggregation: NonNullable<BusinessMetricRuntimeQuery['resolver']>['overallAggregation'],
  values: number[],
): number {
  if (!values.length) return 0;
  if (aggregation === 'sum') return values.reduce((sum, value) => sum + value, 0);
  if (aggregation === 'avg') return values.reduce((sum, value) => sum + value, 0) / values.length;
  if (aggregation === 'min') return Math.min(...values);
  return Math.max(...values);
}

function normalizeCalculatedNumber(value: number): number {
  if (!Number.isFinite(value)) throw new Error('semantic_calculated_value_invalid');
  return Number(value.toFixed(8));
}

function toNumber(value: unknown): number {
  if (typeof value === 'number') return value;
  if (typeof value === 'bigint') return Number(value);
  if (typeof value === 'string' && value.trim()) return Number(value);
  if (value && typeof value === 'object' && 'toString' in value) return Number(value.toString());
  throw new Error('semantic_resolver_value_not_numeric');
}
