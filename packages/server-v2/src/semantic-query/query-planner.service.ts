import { Inject, Injectable } from '@nestjs/common';
import type { BusinessTask, BusinessTaskDomain, BusinessTimeRange } from '../agent/business-task/business-task.types.js';
import { DimensionRegistryService } from '../semantic-data/dimension-registry.service.js';
import {
  BUSINESS_METRIC_CATALOG,
  type BusinessMetricCatalogDefinition,
  type BusinessMetricCatalogReader,
} from '../semantic-data/business-metric-catalog.types.js';
import type { SemanticQueryAggregation, SemanticQueryOutputShape, SemanticQueryPlan, SemanticQueryPlanInput } from './query-plan.types.js';
import { QuerySafetyGuardService } from './query-safety-guard.service.js';
import { QueryTemplateRegistryService, type SemanticQueryTemplateDefinition } from './query-template-registry.service.js';

const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 100;

export const QUERY_PLANNER_DEFAULT_METRICS: Readonly<Partial<Record<BusinessTaskDomain, readonly string[]>>> =
  Object.freeze({
    order: Object.freeze(['paid_amount', 'order_count', 'average_order_value']),
    business: Object.freeze(['paid_amount', 'order_count', 'average_order_value']),
    product: Object.freeze(['product_sales_quantity', 'product_sales_amount']),
    inventory: Object.freeze(['stock_risk_score']),
    staff: Object.freeze(['staff_performance_score']),
    reservation: Object.freeze(['reservation_count', 'arrival_rate']),
    schedule: Object.freeze(['reservation_count', 'arrival_rate']),
    card: Object.freeze(['card_usage_times']),
    memberCard: Object.freeze(['member_balance']),
    marketing: Object.freeze(['marketing_activity_count']),
  });

export const QUERY_PLANNER_DEFAULT_METRIC_KEYS = Object.freeze([
  ...new Set(Object.values(QUERY_PLANNER_DEFAULT_METRICS).flatMap((keys) => keys ?? [])),
]);

@Injectable()
export class QueryPlannerService {
  constructor(
    @Inject(BUSINESS_METRIC_CATALOG)
    private readonly metricCatalog: BusinessMetricCatalogReader,
    private readonly dimensionRegistry: DimensionRegistryService,
    private readonly safetyGuard: QuerySafetyGuardService,
    private readonly templateRegistry: QueryTemplateRegistryService,
  ) {}

  plan(input: SemanticQueryPlanInput): { plan?: SemanticQueryPlan; rejectedReason?: string; warnings: string[] } {
    const actor = input.actor;
    if (!actor) throw new Error('semantic_query_actor_required');
    const task = input.task;
    const template = this.resolveTemplate(input.capabilityId, task.metrics);
    const metrics = this.resolveMetrics(task, actor.permissions, template);
    const dimensions = this.resolveDimensions(task, metrics.map((metric) => metric.key), template);
    const dimensionBindings = this.resolveDimensionBindings(dimensions, metrics);
    const timeRange = this.resolveTimeRange(task);
    const outputShape = this.resolveOutputShape(task, dimensions, template);
    const limit = Math.min(Math.max(Number(task.limit) || template?.defaultLimit || DEFAULT_LIMIT, 1), MAX_LIMIT);
    const plan: SemanticQueryPlan = {
      queryId: `sq_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
      capabilityId: input.capabilityId ?? template?.capabilityIds?.[0] ?? this.inferCapabilityId(task),
      templateId: template?.id,
      taskId: `task_${Date.now().toString(36)}`,
      originalQuestion: task.objective,
      taskType: task.taskType,
      role: actor.role,
      actor,
      storeScope: { storeIds: [actor.storeId], scopeType: 'current_store' },
      metrics,
      dimensions,
      dimensionBindings,
      ...(actor.role === 'beautician' && actor.beauticianId
        ? { selfScope: { dimensionKey: 'beauticianId' as const, value: actor.beauticianId } }
        : {}),
      filters:
        actor.role === 'beautician' && actor.beauticianId
          ? { storeId: actor.storeId, scope: 'self', beauticianId: actor.beauticianId }
          : { storeId: actor.storeId },
      timeRange,
      orderBy: this.resolveOrderBy(task, metrics, template),
      limit,
      outputShape,
      riskLevel: task.riskLevel,
    };

    const safety = this.safetyGuard.validate(plan);
    if (!safety.allowed) {
      return { rejectedReason: safety.rejectedReason, warnings: safety.warnings };
    }
    return { plan, warnings: safety.warnings };
  }

  private resolveTemplate(capabilityId: string | undefined, metricKeys: string[]) {
    return this.templateRegistry.findByCapability(capabilityId) ?? this.templateRegistry.findForMetrics(metricKeys);
  }

  private resolveMetrics(
    task: BusinessTask,
    permissions: readonly string[],
    template?: SemanticQueryTemplateDefinition,
  ) {
    const keys = template?.metricKeys.length
      ? [...new Set([...task.metrics.filter((key) => template.metricKeys.includes(key)), ...template.metricKeys])]
      : task.metrics.length
        ? task.metrics
        : this.defaultMetrics(task);
    return keys
      .map((key) => this.requireMetric(key, task.taskType, permissions))
      .map((metric) => ({
        key: metric.key,
        aggregation: (metric.defaultAggregation ?? this.defaultAggregation(metric.key)) as SemanticQueryAggregation,
        runtimeBinding: deepFreeze({
          definitionKey: metric.definitionKey,
          version: metric.version,
          definitionFingerprint: metric.definitionFingerprint,
          sourceFingerprint: metric.sourceFingerprint,
          name: metric.name,
          description: metric.description,
          permissions: [...metric.permissions],
          allowedTaskTypes: [...metric.allowedTaskTypes],
          sensitive: metric.sensitive,
          formula: structuredClone(metric.formula),
          sourceDefinition: structuredClone(metric.sourceDefinition),
          runtimeQuery: structuredClone(metric.runtimeQuery),
        }),
      }))
      .slice(0, 4);
  }

  private defaultMetrics(task: BusinessTask) {
    return QUERY_PLANNER_DEFAULT_METRICS[task.domain] ?? [];
  }

  private requireMetric(
    key: string,
    taskType: BusinessTask['taskType'],
    permissions: readonly string[],
  ): BusinessMetricCatalogDefinition {
    const metric = this.metricCatalog.findByKey(key);
    if (!metric) throw new Error(`business_metric_catalog_metric_missing:${key}`);
    if (!metric.allowedTaskTypes.includes(taskType)) {
      throw new Error(`business_metric_catalog_task_type_not_allowed:${key}:${taskType}`);
    }
    const missingPermission = metric.permissions.find(
      (permission) => !permissions.includes('*') && !permissions.includes(permission),
    );
    if (missingPermission) {
      throw new Error(`business_metric_catalog_permission_denied:${key}:${missingPermission}`);
    }
    return metric;
  }

  private resolveDimensionBindings(
    dimensionKeys: string[],
    metrics: Array<{ runtimeBinding: { formula: unknown; runtimeQuery: BusinessMetricCatalogDefinition['runtimeQuery'] } }>,
  ) {
    const primary = metrics[0]?.runtimeBinding;
    if (!primary && dimensionKeys.length) throw new Error('semantic_dimension_metric_binding_missing');
    return Object.freeze(
      dimensionKeys.map((key) => {
        const dimension = this.dimensionRegistry.findByKey(key);
        if (!dimension) throw new Error(`semantic_dimension_not_registered:${key}`);
        const formula = asRecord(primary?.formula);
        const baseModel = requiredString(formula.model, `semantic_dimension_formula_model_missing:${key}`);
        const timeField = primary?.runtimeQuery.timePolicy.field;
        const source = key === 'date'
          ? (typeof timeField === 'string' && timeField.trim() ? timeField : `${baseModel}.createdAt`)
          : dimension.source.find((candidate) => candidate.includes('.')) ?? `${baseModel}.${dimension.source[0]}`;
        const separator = source.lastIndexOf('.');
        return deepFreeze({
          key,
          name: dimension.label,
          model: separator >= 0 ? source.slice(0, separator) : baseModel,
          field: separator >= 0 ? source.slice(separator + 1) : source,
          sensitive: dimension.sensitive,
        });
      }),
    );
  }

  private resolveDimensions(task: BusinessTask, metricKeys: string[], template?: SemanticQueryTemplateDefinition) {
    const explicit = this.extractExplicitDimensions(task);
    if (explicit.length) return explicit.filter((dimension) => this.dimensionRegistry.findByKey(dimension));
    if (this.isTrendTask(task) && template?.supportedOutputShapes.includes('trend') && this.dimensionRegistry.findByKey('date')) return ['date'];
    if (template?.defaultDimensions.length) return template.defaultDimensions.filter((dimension) => this.dimensionRegistry.findByKey(dimension));
    if (metricKeys.some((key) => key.startsWith('product_') || key === 'stock_risk_score')) return ['productId', 'productName'];
    if (metricKeys.some((key) => key.startsWith('project_'))) return ['projectId', 'projectName'];
    if (metricKeys.some((key) => ['follow_up_priority_score', 'churn_risk_score', 'repurchase_opportunity_score'].includes(key))) return ['customerId', 'customerName'];
    if (metricKeys.includes('member_balance')) return ['customerId', 'customerName'];
    if (metricKeys.includes('card_usage_times')) return ['cardName'];
    if (metricKeys.includes('card_expiry_risk')) return ['customerId', 'customerName', 'cardName'];
    if (metricKeys.includes('staff_performance_score')) return ['beauticianId', 'beauticianName'];
    if (task.outputMode === 'table' || task.outputMode === 'ranked_list' || task.taskType === 'ranking') {
      if (metricKeys.includes('campaign_conversion_rate') || metricKeys.includes('marketing_activity_count')) return ['campaignId', 'campaignName'];
    }
    if (this.isTrendTask(task)) return ['date'];
    if (task.domain === 'order' || task.domain === 'business' || task.domain === 'finance') return ['date'];
    return ['date'];
  }

  private extractExplicitDimensions(task: BusinessTask) {
    const sortFields = task.sort?.map((item) => item.field) ?? [];
    return sortFields.filter((field) => this.dimensionRegistry.findByKey(field));
  }

  private resolveTimeRange(task: BusinessTask): BusinessTimeRange {
    if (task.timeRange) return task.timeRange;
    if (task.domain === 'order' || task.domain === 'business' || task.domain === 'reservation' || task.domain === 'schedule') {
      return { preset: 'today', label: '今天' };
    }
    return { preset: 'last_30_days', label: '近30天' };
  }

  private resolveOrderBy(task: BusinessTask, metrics: Array<{ key: string }>, template?: SemanticQueryTemplateDefinition) {
    if (task.sort?.length) return task.sort.map((item) => ({ key: item.field, direction: item.direction }));
    if (template?.defaultOrderBy?.length) return template.defaultOrderBy;
    const primary = metrics[0]?.key;
    if (!primary) return [];
    return [{ key: primary, direction: 'desc' as const }];
  }

  private resolveOutputShape(task: BusinessTask, dimensions: string[], template?: SemanticQueryTemplateDefinition): SemanticQueryOutputShape {
    if (task.taskType === 'ranking' || task.outputMode === 'ranked_list') return 'list';
    if (task.outputIntent === 'show_table' && template?.supportedOutputShapes.includes('table')) return 'table';
    if (template?.id === 'marketing_activity_list') return 'table';
    if (this.isTrendTask(task) || dimensions.includes('date')) return 'trend';
    if (task.outputMode === 'table') return 'table';
    return 'summary';
  }

  private isTrendTask(task: BusinessTask) {
    return /趋势|走势|变化|近7天|最近7天|近一周|最近一周|本周|本月/.test(task.objective);
  }

  private inferCapabilityId(task: BusinessTask) {
    if (task.domain === 'product') return 'product_sales_ranking';
    if (task.domain === 'project') return 'project_service_ranking';
    if (task.domain === 'customer') return 'customer_follow_up_ranking';
    if (task.domain === 'inventory') return 'inventory_risk_ranking';
    if (task.domain === 'staff') return 'staff_performance_ranking';
    if (task.domain === 'card' || task.domain === 'memberCard') return 'card_member_business_diagnosis';
    if (task.domain === 'marketing') return 'marketing_activity_list';
    if (task.domain === 'order' || task.domain === 'business' || task.domain === 'finance') return 'revenue_diagnosis';
    return 'business_query';
  }

  private defaultAggregation(key: string) {
    if (key.includes('rate') || key.includes('ratio')) return 'ratio';
    if (key.includes('score')) return 'score';
    if (key.includes('count') || key.includes('times') || key.includes('quantity')) return 'sum';
    return 'sum';
  }
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function requiredString(value: unknown, message: string): string {
  if (typeof value !== 'string' || !value.trim()) throw new Error(message);
  return value.trim();
}

function deepFreeze<T>(value: T): T {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const nested of Object.values(value as Record<string, unknown>)) deepFreeze(nested);
  return value;
}
