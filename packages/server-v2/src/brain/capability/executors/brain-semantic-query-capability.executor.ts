import { ForbiddenException, Inject, Injectable, Optional } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service.js';
import { BrainTimeRangeParserService } from '../../cognition/brain-time-range-parser.service.js';
import { BrainCustomerFactResolverService } from '../../domain/brain-customer-fact-resolver.service.js';
import {
  BUSINESS_DEFINITION_SNAPSHOT_PROVIDER,
  type BusinessDefinitionSnapshotInput,
  type BusinessDefinitionSnapshotProvider,
  type BusinessDimensionDefinitionSnapshot,
  type BusinessMetricDefinitionSnapshot,
  type BusinessMetricRuntimeAggregation,
  type BusinessMetricRuntimeQuery,
  type PrismaRuntimeDataModel,
} from '../../cognition/business-definition-snapshot.types.js';
import type { BrainDomainAnswer } from '../../domain/brain-domain-adapter.types.js';
import { BrainSkillRuntimeService } from '../../skills/brain-skill-runtime.service.js';
import { evaluateBusinessMetricResolver } from '../../../semantic-data/business-metric-resolver-contract.js';
import { BusinessDefinitionRuntimeQueryEngineService } from '../../../semantic-query/business-definition-runtime-query-engine.service.js';
import type {
  BrainCapabilityExecutionInput,
  BrainCapabilityExecutor,
  BrainCapabilityToolArgs,
} from '../brain-capability-executor.registry.js';
import { BrainCapability } from '../brain-capability.decorator.js';
import { readCapabilityStructuredTime, structuredEntityMentions, structuredTimeUtcRange } from '../brain-capability-structured-args.js';

const ALLOWED_CAPABILITY_KEYS = [
  'product_sales_ranking',
  'project_service_ranking',
  'staff_performance_ranking',
  'order_revenue_analysis',
  'inventory_risk_ranking',
  'customer_priority_recommendation',
] as const;
const RUNTIME_EXECUTOR_KEY = 'BusinessDefinitionRuntimeQueryExecutor.execute';
const CAPABILITY_TASK_TYPES: Readonly<Record<(typeof ALLOWED_CAPABILITY_KEYS)[number], readonly string[]>> = {
  product_sales_ranking: ['ranking', 'query'],
  project_service_ranking: ['ranking', 'query'],
  staff_performance_ranking: ['ranking', 'query'],
  order_revenue_analysis: ['diagnosis', 'query'],
  inventory_risk_ranking: ['ranking', 'query'],
  customer_priority_recommendation: ['ranking', 'query', 'recommendation'],
};
const MAX_READ_ROWS = 5000;
const SHANGHAI_UTC_OFFSET_MS = 8 * 60 * 60 * 1000;
const NUMERIC_FIELD_TYPES = new Set(['Int', 'BigInt', 'Float', 'Decimal']);
const FILTER_OPERATORS = new Set(['eq', 'in', 'notIn', 'gt', 'gte', 'lt', 'lte', 'not', 'contains']);

type RuntimeMetric = BusinessMetricDefinitionSnapshot & { runtimeQuery: BusinessMetricRuntimeQuery };
type UnknownRecord = Record<string, unknown>;

interface FormulaDefinition {
  type: BusinessMetricRuntimeAggregation;
  model: string;
  field: string;
}

interface ResolvedDimension {
  key: string;
  name: string;
  model: string;
  field: string;
  path: RuntimePathStep[];
  definition: BusinessDimensionDefinitionSnapshot;
}

interface RuntimePathStep {
  fromModel: string;
  relationField: string;
  toModel: string;
  isList: boolean;
}

interface MetricGroup {
  dimensions: Record<string, unknown>;
  value: number;
}

@Injectable()
export class BrainSemanticQueryCapabilityExecutor implements BrainCapabilityExecutor {
  readonly kind = 'semantic' as const;
  readonly capabilityKeys = ALLOWED_CAPABILITY_KEYS;
  private readonly runtimeQueryEngine: BusinessDefinitionRuntimeQueryEngineService;

  constructor(
    @Inject(BUSINESS_DEFINITION_SNAPSHOT_PROVIDER)
    private readonly definitionProvider: BusinessDefinitionSnapshotProvider,
    private readonly timeRangeParser: BrainTimeRangeParserService,
    private readonly prisma: PrismaService,
    @Optional() private readonly skillRuntime?: BrainSkillRuntimeService,
    @Optional() private readonly customerFacts?: BrainCustomerFactResolverService,
  ) {
    this.runtimeQueryEngine = new BusinessDefinitionRuntimeQueryEngineService(prisma, definitionProvider);
  }

  @BrainCapability({
    key: 'product_sales_ranking',
    name: '商品销售数量与销售额分析',
    description: '按当前门店和时间范围查询商品销售数量或商品净销售额；支持总额问数和按商品排行，严格区分商品销售额与全店实收。',
    intents: ['query', 'ranking'],
    examples: ['本月商品销售排行', '本月商品销售额', '哪些商品卖得最多', '哪些商品销售额最高'],
    negativeExamples: ['查询全店所有收入', '查看其他门店商品销售', '我今天要用到什么产品和耗材', '根据预约准备护理产品和耗材'],
    synonyms: ['商品销量排行', '产品销量排行', '商品销售额', '产品销售额', '热销商品'],
    businessDefinitionKeys: [
      'metric.product_sales_quantity',
      'metric.product_sales_amount',
      'entity.product',
      'dimension.productId',
      'dimension.productName',
    ],
    readOnly: true,
    storeScope: 'required',
    permissions: ['core:brain:use', 'core:order:products'],
    requiresConfirmation: false,
    idempotency: 'not_applicable',
  })
  productSalesRanking(args: BrainCapabilityToolArgs, input: BrainCapabilityExecutionInput) {
    return this.executeDeclared('product_sales_ranking', args, input);
  }

  @BrainCapability({
    key: 'project_service_ranking',
    businessDefinitionKeys: ['metric.project_service_count', 'entity.project'],
    readOnly: true,
    storeScope: 'required',
    permissions: ['core:brain:use', 'core:project-order-profit:view'],
    requiresConfirmation: false,
    idempotency: 'not_applicable',
  })
  projectServiceRanking(args: BrainCapabilityToolArgs, input: BrainCapabilityExecutionInput) {
    return this.executeDeclared('project_service_ranking', args, input);
  }

  @BrainCapability({
    key: 'staff_performance_ranking',
    businessDefinitionKeys: ['metric.staff_performance_score', 'entity.beautician'],
    readOnly: true,
    storeScope: 'required',
    permissions: ['core:brain:use', 'core:beautician-performance:view'],
    requiresConfirmation: false,
    idempotency: 'not_applicable',
  })
  staffPerformanceRanking(args: BrainCapabilityToolArgs, input: BrainCapabilityExecutionInput) {
    return this.executeDeclared('staff_performance_ranking', args, input);
  }

  @BrainCapability({
    key: 'order_revenue_analysis',
    businessDefinitionKeys: ['metric.paid_amount', 'entity.product_order'],
    readOnly: true,
    storeScope: 'required',
    permissions: ['core:brain:use', 'core:finance:view'],
    requiresConfirmation: false,
    idempotency: 'not_applicable',
  })
  orderRevenueAnalysis(args: BrainCapabilityToolArgs, input: BrainCapabilityExecutionInput) {
    return this.executeDeclared('order_revenue_analysis', args, input);
  }

  @BrainCapability({
    key: 'inventory_risk_ranking',
    name: '库存缺货风险排行',
    description: '按当前门店已发布库存风险评分返回最紧急的缺货或低库存商品，不用普通库存数量排行替代风险优先级。',
    intents: ['ranking', 'query'],
    examples: ['现在缺货最紧急的是什么', '哪些商品缺货风险最高', '库存风险排行'],
    negativeExamples: ['查询商品销量排行', '查询项目耗材成本', '自动创建采购单'],
    synonyms: ['缺货优先级', '库存风险排行', '紧急补货商品'],
    businessDefinitionKeys: ['metric.stock_risk_score', 'entity.product'],
    readOnly: true,
    storeScope: 'required',
    permissions: ['core:brain:use', 'core:inventory:stock'],
    requiresConfirmation: false,
    idempotency: 'not_applicable',
  })
  inventoryRiskRanking(args: BrainCapabilityToolArgs, input: BrainCapabilityExecutionInput) {
    return this.executeDeclared('inventory_risk_ranking', args, input);
  }

  @BrainCapability({
    key: 'customer_priority_recommendation',
    mappingOutputs: ['resultRows'],
    businessDefinitionKeys: ['entity.customer', 'metric.follow_up_priority_score'],
    readOnly: true,
    storeScope: 'required',
    permissions: ['core:brain:use', 'core:marketing:analytics'],
    requiresConfirmation: false,
    idempotency: 'not_applicable',
  })
  customerPriorityRecommendation(args: BrainCapabilityToolArgs, input: BrainCapabilityExecutionInput) {
    return this.executeDeclared('customer_priority_recommendation', args, input);
  }

  async execute(input: BrainCapabilityExecutionInput): Promise<BrainDomainAnswer> {
    if (!this.capabilityKeys.includes(input.card.key as (typeof ALLOWED_CAPABILITY_KEYS)[number])) {
      throw new Error(`unsupported_semantic_capability:${input.card.key}`);
    }

    this.assertStructuredArgsSupported(input);
    const snapshot = await this.definitionProvider.loadActiveDefinitions();
    const availableMetrics = snapshot.metrics.filter((metric): metric is RuntimeMetric =>
      Boolean(metric.runtimeQuery?.capabilityKeys.includes(input.card.key)),
    );
    const requestedMetricKeys = new Set(
      (Array.isArray(input.args.metrics) ? input.args.metrics : []).flatMap((value) => {
        if (!value || typeof value !== 'object' || Array.isArray(value)) return [];
        const definitionKey = (value as Record<string, unknown>).definitionKey;
        return typeof definitionKey === 'string' ? [definitionKey] : [];
      }),
    );
    const metrics = requestedMetricKeys.size > 0
      ? availableMetrics.filter((metric) => requestedMetricKeys.has(metric.definitionKey))
      : availableMetrics;
    if (!metrics.length) throw new Error(`semantic_capability_binding_missing:${input.card.key}`);
    this.assertAllowedTaskTypes(input.card.key as (typeof ALLOWED_CAPABILITY_KEYS)[number], metrics);
    this.assertMetricPermissionsCovered(metrics, input.card.requiredPermissions, input.context);
    this.assertDimensionPermissionsCovered(snapshot, metrics, input.card.requiredPermissions, input.context);
    this.assertExecutorBindings(metrics);
    this.assertTimezones(metrics, input.context.timezone);
    this.assertMatchingDimensions(metrics);
    this.assertUniqueOutputFields(metrics);
    const sort = this.resolveSort(metrics);
    this.assertStructuredOrderSupported(input, metrics, sort);

    const timeRange = this.resolveTimeRange(input.question, input.args, input.context.timezone);
    const metricResults = await Promise.all(
      metrics.map((metric) => this.executeMetric(metric, snapshot, input.context.storeId, timeRange)),
    );
    const limit = this.resolveLimit(input.args.limit);
    const allRows = this.mergeMetricResults(metricResults, sort);
    const displayRows = allRows.slice(0, limit);
    const kpis = metrics.map((metric, index) => ({
      label: `指标：${metric.name}`,
      value: this.formatNumber(metricResults[index].overallValue),
      hint: `口径版本 ${metric.version}`,
    }));
    const scalarAnswer = input.answerShape === 'scalar';
    const resultKind = input.answerShape === 'ranking' || (input.answerShape !== 'scalar' && input.card.intents.includes('ranking'))
      ? 'ranking'
      : 'table';

    return {
      status: 'completed',
      answer: scalarAnswer
        ? `${timeRange.rangeLabel}${metrics.map((metric, index) => `${metric.name} ${this.formatNumber(metricResults[index].overallValue)}`).join('，')}。`
        : metrics[0].runtimeQuery.dimensions.length
        ? `查询完成，共生成 ${allRows.length} 条经营指标结果，当前展示 ${displayRows.length} 条。`
        : `查询完成，已生成 ${metrics.length} 项经营指标汇总。`,
      citations: metrics.map((metric) => ({
        sourceType: 'business_definition',
        sourceId: `${metric.definitionKey}@${metric.version}`,
        label: `业务定义：${metric.name}`,
        definition: metric.description,
      })),
      grounding: 'metric_query',
      blocks: scalarAnswer
        ? [{ kind: 'kpi', items: kpis }]
        : [
            { kind: resultKind, rows: displayRows, columns: this.outputColumns(displayRows, metrics) },
            { kind: 'kpi', items: kpis },
          ],
      metadata: {
        mappingOutputs: { resultRows: displayRows },
        queryCount: metrics.length,
        resultCount: allRows.length,
        rangeLabel: timeRange.rangeLabel,
        timeRange: {
          startDate: timeRange.startDate.toISOString(),
          endExclusive: timeRange.endExclusive.toISOString(),
          boundary: '[start,end)',
          timezone: input.context.timezone,
        },
        metricDefinitions: metrics.map((metric) => ({
          definitionKey: metric.definitionKey,
          version: metric.version,
          sourceFingerprint: metric.sourceFingerprint,
        })),
        dimensionDefinitions: this.dimensionLineage(snapshot, metrics[0].runtimeQuery.dimensions),
        executorKey: RUNTIME_EXECUTOR_KEY,
        outputLimit: limit,
      },
    };
  }

  private assertAllowedTaskTypes(
    capabilityKey: (typeof ALLOWED_CAPABILITY_KEYS)[number],
    metrics: RuntimeMetric[],
  ) {
    const allowed = CAPABILITY_TASK_TYPES[capabilityKey];
    for (const metric of metrics) {
      const metricTaskTypes = metric.allowedTaskTypes ?? [];
      if (!metricTaskTypes.length || !metricTaskTypes.some((taskType) => allowed.includes(taskType))) {
        throw new Error(
          `semantic_capability_task_type_not_allowed:${capabilityKey}:${metric.metricKey}:${metricTaskTypes.join(',') || 'missing'}`,
        );
      }
    }
  }

  private executeDeclared(
    key: (typeof ALLOWED_CAPABILITY_KEYS)[number],
    args: BrainCapabilityToolArgs,
    input: BrainCapabilityExecutionInput,
  ) {
    if (input.card.key !== key) throw new Error(`capability_contract_key_mismatch:${key}:${input.card.key}`);
    return this.execute({ ...input, args });
  }

  private async executeMetric(
    metric: RuntimeMetric,
    snapshot: BusinessDefinitionSnapshotInput,
    storeId: number,
    timeRange: { startDate: Date; endExclusive: Date; rangeLabel: string },
  ): Promise<{ outputField: string; groups: MetricGroup[]; overallValue: number }> {
    if (metric.runtimeQuery.resolver) {
      return this.executeResolvedMetric(metric, storeId, timeRange);
    }
    return this.runtimeQueryEngine.executeMetric({
      metric,
      dimensions: snapshot.dimensions.map((dimension) => {
        const source = this.asRecord(dimension.source, `semantic_dimension_source_invalid:${dimension.dimensionKey}`);
        return {
          key: dimension.dimensionKey,
          name: dimension.name,
          model: this.requiredString(source.model, `semantic_dimension_model_invalid:${dimension.dimensionKey}`),
          field: this.requiredString(source.field, `semantic_dimension_field_invalid:${dimension.dimensionKey}`),
        };
      }),
      storeId,
      timeRange,
    });
  }

  private async executeResolvedMetric(
    metric: RuntimeMetric,
    storeId: number,
    timeRange: { startDate: Date; endExclusive: Date; rangeLabel: string },
  ): Promise<{ outputField: string; groups: MetricGroup[]; overallValue: number }> {
    const resolver = metric.runtimeQuery.resolver;
    if (!resolver) throw new Error(`semantic_resolver_missing:${metric.metricKey}`);
    if (!this.skillRuntime) throw new Error(`semantic_resolver_runtime_unavailable:${resolver.key}`);
    const sourceModels = Array.isArray(metric.source)
      ? metric.source.flatMap((item) => {
          if (!item || typeof item !== 'object' || Array.isArray(item)) return [];
          const model = (item as UnknownRecord).model;
          return typeof model === 'string' ? [model] : [];
        })
      : [];
    const evaluationInput = {
      metricKey: metric.metricKey,
      resolver,
      dimensions: metric.runtimeQuery.dimensions,
      outputField: metric.runtimeQuery.outputFields[0],
      sourceModels,
      storeScope: metric.runtimeQuery.storeScope,
    };
    evaluateBusinessMetricResolver({ ...evaluationInput, rows: [] });
    const rows = await this.loadResolverRows(resolver.key, storeId, timeRange);
    return evaluateBusinessMetricResolver({
      ...evaluationInput,
      rows,
    });
  }

  private async loadResolverRows(
    resolverKey: NonNullable<BusinessMetricRuntimeQuery['resolver']>['key'],
    storeId: number,
    timeRange: { startDate: Date; endExclusive: Date },
  ): Promise<UnknownRecord[]> {
    if (resolverKey === 'manager_staff_analysis') {
      const result = await this.skillRuntime!.buildManagerStaffAnalysis({
        storeId,
        startDate: timeRange.startDate,
        endDate: new Date(timeRange.endExclusive.getTime() - 1),
      });
      return result.staff as unknown as UnknownRecord[];
    }
    if (resolverKey === 'inventory_risk_summary') {
      const result = await this.skillRuntime!.buildInventoryRiskSummary({
        storeId,
        expiringBefore: new Date(timeRange.endExclusive.getTime() - 1),
      });
      return result.lowStockProducts as unknown as UnknownRecord[];
    }
    if (resolverKey === 'inventory_consumption_rows') {
      const result = await this.skillRuntime!.buildInventoryDetailAnalysis({
        storeId,
        startDate: timeRange.startDate,
        endDate: new Date(timeRange.endExclusive.getTime() - 1),
      });
      return result.products as unknown as UnknownRecord[];
    }
    if (resolverKey === 'product_margin_rows') {
      const result = await this.skillRuntime!.buildFinanceProductMarginAnalysis({
        storeId,
        startDate: timeRange.startDate,
        endDate: new Date(timeRange.endExclusive.getTime() - 1),
      });
      return result.rows as unknown as UnknownRecord[];
    }
    if (resolverKey === 'marketing_follow_up_opportunities') {
      return this.skillRuntime!.buildMarketingFollowUpPriority({
        storeId,
        asOf: new Date(Math.min(Date.now(), timeRange.endExclusive.getTime() - 1)),
      });
    }
    if (resolverKey === 'customer_retention_summary') {
      if (!this.customerFacts) throw new Error('semantic_customer_retention_resolver_unavailable');
      const result = await this.customerFacts.getCustomerRetentionSummary({
        storeId,
        startDate: timeRange.startDate,
        endDate: new Date(timeRange.endExclusive.getTime() - 1),
      });
      return [result as unknown as UnknownRecord];
    }
    if (resolverKey === 'customer_acquisition_conversion_summary') {
      if (!this.customerFacts) throw new Error('semantic_customer_acquisition_resolver_unavailable');
      const result = await this.customerFacts.getNewCustomerConversionSummary({
        storeId,
        startDate: timeRange.startDate,
        endDate: new Date(timeRange.endExclusive.getTime() - 1),
      });
      return [result as unknown as UnknownRecord];
    }
    throw new Error(`semantic_resolver_key_unsupported:${resolverKey}`);
  }

  private formula(metric: RuntimeMetric): FormulaDefinition {
    const formula = this.asRecord(metric.formula, `semantic_formula_invalid:${metric.metricKey}`);
    const type = String(formula.type) as BusinessMetricRuntimeAggregation;
    const model = this.requiredString(formula.model, `semantic_formula_model_invalid:${metric.metricKey}`);
    const field = this.requiredString(formula.field, `semantic_formula_field_invalid:${metric.metricKey}`);
    if (type !== metric.runtimeQuery.aggregation) {
      throw new Error(`semantic_formula_aggregation_mismatch:${metric.metricKey}`);
    }
    return { type, model, field };
  }

  private validateFormula(metric: RuntimeMetric, formula: FormulaDefinition, dataModel: PrismaRuntimeDataModel) {
    if (formula.type === 'ratio' || formula.type === 'score') {
      throw new Error(`semantic_aggregation_expression_required:${metric.metricKey}:${formula.type}`);
    }
    const field = this.field(dataModel, formula.model, formula.field);
    if (field.kind === 'object') throw new Error(`semantic_measure_field_not_scalar:${formula.model}.${formula.field}`);
    if (['sum', 'avg', 'ratio', 'score'].includes(formula.type) && !NUMERIC_FIELD_TYPES.has(field.type)) {
      throw new Error(`semantic_measure_field_not_numeric:${metric.metricKey}:${formula.model}.${formula.field}`);
    }
  }

  private resolveDimensions(
    snapshot: BusinessDefinitionSnapshotInput,
    metric: RuntimeMetric,
    baseModel: string,
    joinGraph: BusinessMetricRuntimeQuery['joinPath'],
    dataModel: PrismaRuntimeDataModel,
  ): ResolvedDimension[] {
    return metric.runtimeQuery.dimensions.map((dimensionKey) => {
      const definition = snapshot.dimensions.find((item) => item.dimensionKey === dimensionKey);
      if (!definition) throw new Error(`semantic_dimension_not_published:${dimensionKey}`);
      const source = this.asRecord(definition.source, `semantic_dimension_source_invalid:${dimensionKey}`);
      const model = this.requiredString(source.model, `semantic_dimension_model_invalid:${dimensionKey}`);
      const field = this.requiredString(source.field, `semantic_dimension_field_invalid:${dimensionKey}`);
      const modelField = this.field(dataModel, model, field);
      if (modelField.kind === 'object') throw new Error(`semantic_dimension_field_not_scalar:${dimensionKey}`);
      const path = this.pathToModel(baseModel, model, joinGraph, dataModel);
      const listStep = path.find((step) => step.isList);
      if (listStep) {
        throw new Error(`semantic_list_relation_dimension_unsupported:${listStep.fromModel}.${listStep.relationField}`);
      }
      return {
        key: dimensionKey,
        name: definition.name,
        model,
        field,
        path,
        definition,
      };
    });
  }

  private filterCondition(
    baseModel: string,
    joinGraph: BusinessMetricRuntimeQuery['joinPath'],
    filter: Readonly<Record<string, unknown>>,
    dataModel: PrismaRuntimeDataModel,
  ): UnknownRecord {
    const model = this.requiredString(filter.model, 'semantic_filter_model_invalid');
    const fieldName = this.requiredString(filter.field, 'semantic_filter_field_invalid');
    const operator = this.requiredString(filter.operator, 'semantic_filter_operator_invalid');
    if (!FILTER_OPERATORS.has(operator)) throw new Error(`semantic_filter_operator_unsupported:${operator}`);
    const field = this.field(dataModel, model, fieldName);
    if (field.kind === 'object') throw new Error(`semantic_filter_field_not_scalar:${model}.${fieldName}`);
    if ((operator === 'in' || operator === 'notIn') && !Array.isArray(filter.value)) {
      throw new Error(`semantic_filter_value_invalid:${operator}`);
    }
    if (operator === 'contains' && typeof filter.value !== 'string') {
      throw new Error('semantic_filter_value_invalid:contains');
    }
    const path = this.pathToModel(baseModel, model, joinGraph, dataModel);
    const condition = operator === 'eq' ? filter.value : { [operator]: filter.value };
    return this.nestedWhere(path, { [fieldName]: condition });
  }

  private storeCondition(
    baseModel: string,
    scope: BusinessMetricRuntimeQuery['storeScope'],
    storeId: number,
    dataModel: PrismaRuntimeDataModel,
  ): UnknownRecord {
    if (scope.mode !== 'current_store') {
      throw new Error(`semantic_store_scope_invalid:${baseModel}`);
    }
    const anchorModel = scope.anchorModel ?? scope.joinPath[0]?.fromModel ?? scope.model;
    if (anchorModel !== baseModel) {
      throw new Error(`semantic_store_scope_anchor_mismatch:${anchorModel}:${baseModel}`);
    }
    const expectedField = scope.model === 'Store' ? 'id' : 'storeId';
    if (scope.field !== expectedField) {
      throw new Error(`semantic_store_scope_field_invalid:${scope.model}.${scope.field}`);
    }
    const path = this.declaredPath(baseModel, scope.model, scope.joinPath, dataModel, 'semantic_store_scope_path');
    const field = this.field(dataModel, scope.model, scope.field);
    if (field.kind === 'object') throw new Error(`semantic_store_field_not_scalar:${scope.model}.${scope.field}`);
    return this.nestedWhere(path, { [scope.field]: storeId });
  }

  private timeCondition(
    baseModel: string,
    runtimeQuery: BusinessMetricRuntimeQuery,
    joinGraph: BusinessMetricRuntimeQuery['joinPath'],
    range: { startDate: Date; endExclusive: Date },
    dataModel: PrismaRuntimeDataModel,
  ): UnknownRecord {
    const fieldRef = this.requiredString(runtimeQuery.timePolicy.field, 'semantic_time_field_required');
    const separator = fieldRef.lastIndexOf('.');
    const model = separator >= 0 ? fieldRef.slice(0, separator) : baseModel;
    const fieldName = separator >= 0 ? fieldRef.slice(separator + 1) : fieldRef;
    const field = this.field(dataModel, model, fieldName);
    if (field.kind === 'object' || field.type !== 'DateTime') {
      throw new Error(`semantic_time_field_invalid:${model}.${fieldName}`);
    }
    const path = this.pathToModel(baseModel, model, joinGraph, dataModel);
    const value =
      runtimeQuery.timePolicy.mode === 'event_time'
        ? { gte: range.startDate, lt: range.endExclusive }
        : { lte: new Date(range.endExclusive.getTime() - 1) };
    return this.nestedWhere(path, { [fieldName]: value });
  }

  private validateJoinGraph(joinGraph: BusinessMetricRuntimeQuery['joinPath'], dataModel: PrismaRuntimeDataModel) {
    for (const step of joinGraph) {
      const relation = dataModel.models[step.fromModel]?.fields.find((item) => item.name === step.relationField);
      if (!relation || relation.kind !== 'object' || relation.type !== step.toModel) {
        throw new Error(`semantic_join_path_invalid:${step.fromModel}.${step.relationField}`);
      }
    }
  }

  private pathToModel(
    baseModel: string,
    targetModel: string,
    joinGraph: BusinessMetricRuntimeQuery['joinPath'],
    dataModel: PrismaRuntimeDataModel,
  ): RuntimePathStep[] {
    if (baseModel === targetModel) return [];
    const queue: Array<{ model: string; path: RuntimePathStep[] }> = [{ model: baseModel, path: [] }];
    const visited = new Set([baseModel]);
    while (queue.length) {
      const current = queue.shift();
      if (!current) break;
      for (const step of joinGraph.filter((candidate) => candidate.fromModel === current.model)) {
        const relation = this.field(dataModel, step.fromModel, step.relationField);
        const pathStep: RuntimePathStep = {
          fromModel: step.fromModel,
          relationField: step.relationField,
          toModel: step.toModel,
          isList: relation.isList,
        };
        const path = [...current.path, pathStep];
        if (step.toModel === targetModel) return path;
        if (!visited.has(step.toModel)) {
          visited.add(step.toModel);
          queue.push({ model: step.toModel, path });
        }
      }
    }
    throw new Error(`semantic_join_path_missing:${baseModel}:${targetModel}`);
  }

  private declaredPath(
    baseModel: string,
    targetModel: string,
    declaredSteps: BusinessMetricRuntimeQuery['joinPath'],
    dataModel: PrismaRuntimeDataModel,
    errorPrefix: string,
  ): RuntimePathStep[] {
    if (baseModel === targetModel) {
      if (declaredSteps.length) throw new Error(`${errorPrefix}_unexpected:${baseModel}`);
      return [];
    }
    const path: RuntimePathStep[] = [];
    let currentModel = baseModel;
    for (const step of declaredSteps) {
      if (step.fromModel !== currentModel) {
        throw new Error(`${errorPrefix}_disconnected:${currentModel}:${step.fromModel}`);
      }
      const relation = this.field(dataModel, step.fromModel, step.relationField);
      if (relation.kind !== 'object' || relation.type !== step.toModel) {
        throw new Error(`${errorPrefix}_invalid:${step.fromModel}.${step.relationField}`);
      }
      path.push({
        fromModel: step.fromModel,
        relationField: step.relationField,
        toModel: step.toModel,
        isList: relation.isList,
      });
      currentModel = step.toModel;
    }
    if (currentModel !== targetModel) {
      throw new Error(`${errorPrefix}_target_mismatch:${currentModel}:${targetModel}`);
    }
    return path;
  }

  private field(dataModel: PrismaRuntimeDataModel, model: string, fieldName: string) {
    const definition = dataModel.models[model];
    if (!definition) throw new Error(`semantic_model_not_found:${model}`);
    const field = definition.fields.find((item) => item.name === fieldName);
    if (!field) throw new Error(`semantic_field_not_found:${model}.${fieldName}`);
    return field;
  }

  private prismaDelegate(model: string): { findMany(args: UnknownRecord): Promise<unknown[]> } {
    const delegateName = `${model.charAt(0).toLowerCase()}${model.slice(1)}`;
    const delegate = (this.prisma as unknown as Record<string, unknown>)[delegateName] as
      | { findMany?: (args: UnknownRecord) => Promise<unknown[]> }
      | undefined;
    if (!delegate || typeof delegate.findMany !== 'function') {
      throw new Error(`semantic_prisma_delegate_not_found:${model}`);
    }
    return { findMany: delegate.findMany.bind(delegate) };
  }

  private addSelect(select: UnknownRecord, path: RuntimePathStep[], field: string) {
    if (!path.length) {
      select[field] = true;
      return;
    }
    const [step, ...rest] = path;
    if (step.isList) {
      throw new Error(`semantic_list_relation_select_unsupported:${step.fromModel}.${step.relationField}`);
    }
    const current = (select[step.relationField] as { select?: UnknownRecord } | undefined) ?? {};
    const nested = current.select ?? {};
    current.select = nested;
    select[step.relationField] = current;
    this.addSelect(nested, rest, field);
  }

  private nestedWhere(path: RuntimePathStep[], leaf: UnknownRecord): UnknownRecord {
    return path.reduceRight<UnknownRecord>(
      (value, step) => ({ [step.relationField]: step.isList ? { some: value } : value }),
      leaf,
    );
  }

  private readValue(row: UnknownRecord, path: RuntimePathStep[], field: string): unknown {
    let current: unknown = row;
    for (const step of path) {
      if (!current || typeof current !== 'object' || Array.isArray(current)) {
        throw new Error(`semantic_dimension_value_invalid:${step.relationField}`);
      }
      current = (current as UnknownRecord)[step.relationField];
    }
    if (Array.isArray(current)) throw new Error(`semantic_dimension_value_not_scalar:${field}`);
    if (!current || typeof current !== 'object') return undefined;
    return (current as UnknownRecord)[field];
  }

  private aggregate(aggregation: BusinessMetricRuntimeAggregation, values: unknown[]): number {
    const presentValues = values.filter((value) => value !== null && value !== undefined);
    if (aggregation === 'count') return presentValues.length;
    if (aggregation === 'count_distinct') {
      return new Set(presentValues.map((value) => String(value))).size;
    }
    const numbers = presentValues.map((value) => this.toNumber(value));
    if (!numbers.length) return 0;
    if (aggregation === 'sum') return numbers.reduce((sum, value) => sum + value, 0);
    if (aggregation === 'avg') {
      return numbers.reduce((sum, value) => sum + value, 0) / numbers.length;
    }
    throw new Error(`semantic_aggregation_unsupported:${aggregation}`);
  }

  private mergeMetricResults(
    results: Array<{ outputField: string; groups: MetricGroup[]; overallValue: number }>,
    sort: NonNullable<BusinessMetricRuntimeQuery['sort']>,
  ): Array<Record<string, unknown>> {
    const merged = new Map<string, Record<string, unknown>>();
    for (const result of results) {
      for (const group of result.groups) {
        const key = JSON.stringify(group.dimensions);
        const row = merged.get(key) ?? { ...group.dimensions };
        row[result.outputField] = group.value;
        merged.set(key, row);
      }
    }
    const rows = [...merged.values()];
    if (rows.some((row) => row[sort.outputField] === undefined)) {
      throw new Error(`semantic_primary_output_missing:${sort.outputField}`);
    }
    return rows.sort((left, right) => {
      const delta = this.toNumber(left[sort.outputField]) - this.toNumber(right[sort.outputField]);
      return sort.direction === 'asc' ? delta : -delta;
    });
  }

  private resolveSort(metrics: RuntimeMetric[]): NonNullable<BusinessMetricRuntimeQuery['sort']> {
    const declarations = metrics.map((metric) => metric.runtimeQuery.sort).filter(Boolean);
    if (!declarations.length) {
      if (metrics.length > 1) throw new Error('semantic_sort_binding_required');
      return { outputField: metrics[0].runtimeQuery.outputFields[0], direction: 'desc', missing: 'error' };
    }
    if (declarations.length !== metrics.length) throw new Error('semantic_sort_binding_incomplete');
    const expected = JSON.stringify(declarations[0]);
    if (declarations.some((declaration) => JSON.stringify(declaration) !== expected)) {
      throw new Error('semantic_sort_binding_mismatch');
    }
    const sort = declarations[0];
    if (!sort || sort.missing !== 'error' || !['asc', 'desc'].includes(sort.direction)) {
      throw new Error('semantic_sort_binding_invalid');
    }
    const outputFields = new Set(metrics.flatMap((metric) => metric.runtimeQuery.outputFields));
    if (!outputFields.has(sort.outputField)) throw new Error(`semantic_sort_output_not_bound:${sort.outputField}`);
    return sort;
  }

  private assertExecutorBindings(metrics: RuntimeMetric[]) {
    for (const metric of metrics) {
      const bindings = [...metric.runtimeQuery.executorKeys];
      if (bindings.length !== 1 || bindings[0] !== RUNTIME_EXECUTOR_KEY) {
        throw new Error(`semantic_executor_binding_unsupported:${bindings.join(',') || 'missing'}`);
      }
    }
  }

  private assertMatchingDimensions(metrics: RuntimeMetric[]) {
    const expected = JSON.stringify(metrics[0].runtimeQuery.dimensions);
    for (const metric of metrics.slice(1)) {
      if (JSON.stringify(metric.runtimeQuery.dimensions) !== expected) {
        throw new Error(`semantic_metric_dimensions_mismatch:${metric.metricKey}`);
      }
    }
  }

  private assertUniqueOutputFields(metrics: RuntimeMetric[]) {
    const seen = new Set<string>();
    for (const metric of metrics) {
      if (metric.runtimeQuery.outputFields.length !== 1 || !metric.runtimeQuery.outputFields[0]) {
        throw new Error(`semantic_output_binding_invalid:${metric.metricKey}`);
      }
      const outputField = metric.runtimeQuery.outputFields[0];
      if (seen.has(outputField)) throw new Error(`semantic_output_field_duplicate:${outputField}`);
      seen.add(outputField);
    }
  }

  private assertTimezones(metrics: RuntimeMetric[], contextTimezone: string) {
    for (const metric of metrics) {
      const definitionTimezone = metric.runtimeQuery.timePolicy.timezone;
      if (definitionTimezone !== 'Asia/Shanghai') {
        throw new Error(`semantic_timezone_unsupported:${definitionTimezone}`);
      }
      if (definitionTimezone !== contextTimezone) {
        throw new Error(`semantic_timezone_mismatch:${definitionTimezone}:${contextTimezone}`);
      }
    }
  }

  private assertMetricPermissionsCovered(
    metrics: RuntimeMetric[],
    cardPermissions: readonly string[],
    context: BrainCapabilityExecutionInput['context'],
  ) {
    const covered = new Set(cardPermissions);
    for (const metric of metrics) {
      for (const permission of this.metricPermissions(metric)) {
        if (!covered.has('*') && !covered.has(permission)) {
          throw new Error(`metric_permission_not_covered:${metric.metricKey}:${permission}`);
        }
        this.assertActorPermission(permission, context, `metric:${metric.metricKey}`);
      }
    }
  }

  private assertDimensionPermissionsCovered(
    snapshot: BusinessDefinitionSnapshotInput,
    metrics: RuntimeMetric[],
    cardPermissions: readonly string[],
    context: BrainCapabilityExecutionInput['context'],
  ) {
    const covered = new Set(cardPermissions);
    const dimensionKeys = new Set(metrics.flatMap((metric) => metric.runtimeQuery.dimensions));
    for (const dimensionKey of dimensionKeys) {
      const dimension = snapshot.dimensions.find((item) => item.dimensionKey === dimensionKey);
      if (!dimension) throw new Error(`semantic_dimension_not_published:${dimensionKey}`);
      const permissions = this.definitionPermissions(dimension.permissions, `dimension:${dimensionKey}`);
      for (const permission of permissions) {
        if (!covered.has('*') && !covered.has(permission)) {
          throw new Error(`dimension_permission_not_covered:${dimensionKey}:${permission}`);
        }
        this.assertActorPermission(permission, context, `dimension:${dimensionKey}`);
      }
    }
  }

  private assertActorPermission(permission: string, context: BrainCapabilityExecutionInput['context'], source: string) {
    if (context.deniedPermissions.includes('*') || context.deniedPermissions.includes(permission)) {
      throw new ForbiddenException(`definition_permission_denied:${source}:${permission}`);
    }
    if (!context.permissions.includes('*') && !context.permissions.includes(permission)) {
      throw new ForbiddenException(`definition_permission_missing:${source}:${permission}`);
    }
  }

  private metricPermissions(metric: BusinessMetricDefinitionSnapshot): string[] {
    return this.definitionPermissions(metric.permissions, `metric:${metric.metricKey}`);
  }

  private definitionPermissions(value: unknown, source: string): string[] {
    if (!Array.isArray(value) || !value.every((permission) => typeof permission === 'string')) {
      throw new Error(`semantic_definition_permissions_invalid:${source}`);
    }
    return Array.from(new Set(value as string[]));
  }

  private resolveTimeRange(
    question: string,
    args: Record<string, unknown>,
    contextTimezone: string,
  ): { startDate: Date; endExclusive: Date; rangeLabel: string } {
    const structuredTime = readCapabilityStructuredTime(args, contextTimezone);
    const structuredRange = structuredTime ? structuredTimeUtcRange(structuredTime) : undefined;
    if (structuredRange) {
      return {
        startDate: structuredRange.startDate,
        endExclusive: structuredRange.endExclusive,
        rangeLabel: structuredRange.label,
      };
    }
    const wallClockNow = this.toShanghaiWallClock(new Date());
    const parsed = this.timeRangeParser.parse(structuredTime?.label ?? structuredTime?.preset ?? question, { now: wallClockNow });
    if (parsed.range) {
      return {
        startDate: this.shanghaiWallClockToUtc(parsed.range.startDate),
        endExclusive: new Date(this.shanghaiWallClockToUtc(parsed.range.endDate).getTime() + 1),
        rangeLabel: parsed.range.label,
      };
    }
    const startWallClock = new Date(wallClockNow);
    startWallClock.setDate(startWallClock.getDate() - 29);
    startWallClock.setHours(0, 0, 0, 0);
    const endWallClock = new Date(wallClockNow);
    endWallClock.setHours(23, 59, 59, 999);
    return {
      startDate: this.shanghaiWallClockToUtc(startWallClock),
      endExclusive: new Date(this.shanghaiWallClockToUtc(endWallClock).getTime() + 1),
      rangeLabel: '最近30天',
    };
  }

  private assertStructuredArgsSupported(input: BrainCapabilityExecutionInput) {
    if (Array.isArray(input.args.filters) && input.args.filters.length) {
      throw new Error(`semantic_filter_args_unsupported:${input.card.key}`);
    }
    if (
      structuredEntityMentions(input.args as BrainCapabilityToolArgs).some(
        (entity) =>
          entity.entityKey &&
          entity.entityKey.trim().toLocaleLowerCase('en-US') !== entity.entityType.trim().toLocaleLowerCase('en-US'),
      )
    ) {
      throw new Error(`semantic_entity_filter_args_unsupported:${input.card.key}`);
    }
  }

  private assertStructuredOrderSupported(
    input: BrainCapabilityExecutionInput,
    metrics: RuntimeMetric[],
    sort: { outputField: string; direction: 'asc' | 'desc'; missing: string },
  ) {
    if (!Array.isArray(input.args.orderBy) || input.args.orderBy.length === 0) return;
    if (input.args.orderBy.length !== 1) throw new Error(`semantic_order_args_unsupported:${input.card.key}`);
    const order = input.args.orderBy[0];
    if (!order || typeof order !== 'object' || Array.isArray(order)) {
      throw new Error(`semantic_order_args_unsupported:${input.card.key}`);
    }
    const record = order as Record<string, unknown>;
    const ref = record.definitionRef;
    const definitionKey = ref && typeof ref === 'object' && !Array.isArray(ref)
      ? (ref as Record<string, unknown>).definitionKey
      : undefined;
    const metricKeys = new Set(metrics.map((metric) => metric.definitionKey));
    if (!metricKeys.has(String(definitionKey)) || record.direction !== sort.direction) {
      throw new Error(`semantic_order_args_unsupported:${input.card.key}`);
    }
  }

  private toShanghaiWallClock(instant: Date): Date {
    const shifted = new Date(instant.getTime() + SHANGHAI_UTC_OFFSET_MS);
    return new Date(
      shifted.getUTCFullYear(),
      shifted.getUTCMonth(),
      shifted.getUTCDate(),
      shifted.getUTCHours(),
      shifted.getUTCMinutes(),
      shifted.getUTCSeconds(),
      shifted.getUTCMilliseconds(),
    );
  }

  private shanghaiWallClockToUtc(wallClock: Date): Date {
    return new Date(
      Date.UTC(
        wallClock.getFullYear(),
        wallClock.getMonth(),
        wallClock.getDate(),
        wallClock.getHours(),
        wallClock.getMinutes(),
        wallClock.getSeconds(),
        wallClock.getMilliseconds(),
      ) - SHANGHAI_UTC_OFFSET_MS,
    );
  }

  private outputColumns(rows: Array<Record<string, unknown>>, metrics: RuntimeMetric[]): string[] {
    if (rows.length) return Object.keys(rows[0]);
    return [...metrics[0].runtimeQuery.dimensions, ...metrics.map((metric) => metric.runtimeQuery.outputFields[0])];
  }

  private resolveLimit(value: unknown) {
    const parsed = typeof value === 'number' ? value : Number(value);
    if (!Number.isFinite(parsed)) return 10;
    return Math.min(100, Math.max(1, Math.trunc(parsed)));
  }

  private dimensionLineage(snapshot: BusinessDefinitionSnapshotInput, dimensionKeys: readonly string[]) {
    return dimensionKeys.map((dimensionKey) => {
      const dimension = snapshot.dimensions.find((item) => item.dimensionKey === dimensionKey);
      if (!dimension) throw new Error(`semantic_dimension_not_published:${dimensionKey}`);
      return {
        definitionKey: dimension.definitionKey,
        version: dimension.version,
        sourceFingerprint: dimension.sourceFingerprint,
      };
    });
  }

  private formatNumber(value: number) {
    return Number.isInteger(value) ? String(value) : value.toFixed(2);
  }

  private toNumber(value: unknown): number {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'bigint') return Number(value);
    if (value && typeof value === 'object' && 'toNumber' in value && typeof value.toNumber === 'function') {
      const result = value.toNumber();
      if (Number.isFinite(result)) return result;
    }
    const result = Number(value);
    if (!Number.isFinite(result)) throw new Error('semantic_numeric_value_invalid');
    return result;
  }

  private asRecord(value: unknown, errorMessage: string): UnknownRecord {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(errorMessage);
    return value as UnknownRecord;
  }

  private requiredString(value: unknown, errorMessage: string): string {
    if (typeof value !== 'string' || !value.trim()) throw new Error(errorMessage);
    return value.trim();
  }
}
