import { Injectable } from '@nestjs/common';
import type { BusinessTask, BusinessTimeRange } from '../agent/business-task/business-task.types.js';
import { DimensionRegistryService } from '../semantic-data/dimension-registry.service.js';
import { SemanticMetricRegistryService } from '../semantic-data/semantic-metric-registry.service.js';
import type { SemanticQueryAggregation, SemanticQueryOutputShape, SemanticQueryPlan, SemanticQueryPlanInput } from './query-plan.types.js';
import { QuerySafetyGuardService } from './query-safety-guard.service.js';
import { QueryTemplateRegistryService, type SemanticQueryTemplateDefinition } from './query-template-registry.service.js';

const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 100;

@Injectable()
export class QueryPlannerService {
  constructor(
    private readonly metricRegistry: SemanticMetricRegistryService,
    private readonly dimensionRegistry: DimensionRegistryService,
    private readonly safetyGuard: QuerySafetyGuardService,
    private readonly templateRegistry: QueryTemplateRegistryService,
  ) {}

  plan(input: SemanticQueryPlanInput): { plan?: SemanticQueryPlan; rejectedReason?: string; warnings: string[] } {
    const task = input.task;
    const template = this.resolveTemplate(input.capabilityId, task.metrics);
    const metrics = this.resolveMetrics(task, template);
    const dimensions = this.resolveDimensions(task, metrics.map((metric) => metric.key), template);
    const timeRange = this.resolveTimeRange(task);
    const outputShape = this.resolveOutputShape(task, dimensions, template);
    const limit = Math.min(Math.max(Number(task.limit) || template?.defaultLimit || DEFAULT_LIMIT, 1), MAX_LIMIT);
    const plan: SemanticQueryPlan = {
      queryId: `sq_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
      capabilityId: input.capabilityId ?? template?.capabilityIds?.[0] ?? this.inferCapabilityId(task),
      templateId: template?.id,
      taskId: `task_${Date.now().toString(36)}`,
      originalQuestion: task.objective,
      role: input.role,
      storeScope: { storeIds: [input.storeId], scopeType: 'current_store' },
      metrics,
      dimensions,
      filters: {
        ...task.filters,
        storeId: input.storeId,
        operatorId: input.operatorId,
      },
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

  private resolveMetrics(task: BusinessTask, template?: SemanticQueryTemplateDefinition) {
    const keys = template?.metricKeys.length
      ? [...new Set([...task.metrics.filter((key) => template.metricKeys.includes(key)), ...template.metricKeys])]
      : task.metrics.length
        ? task.metrics
        : this.defaultMetrics(task);
    return keys
      .map((key) => this.metricRegistry.findByKey(key))
      .filter((metric): metric is NonNullable<ReturnType<SemanticMetricRegistryService['findByKey']>> => Boolean(metric))
      .map((metric) => ({
        key: metric.key,
        aggregation: (metric.defaultAggregation ?? this.defaultAggregation(metric.key)) as SemanticQueryAggregation,
      }))
      .slice(0, 4);
  }

  private defaultMetrics(task: BusinessTask) {
    if (task.domain === 'order' || task.domain === 'business') return ['paid_amount', 'order_count', 'average_order_value'];
    if (task.domain === 'product') return ['product_sales_quantity', 'product_sales_amount'];
    if (task.domain === 'inventory') return ['stock_risk_score'];
    if (task.domain === 'staff') return ['staff_performance_score'];
    if (task.domain === 'reservation' || task.domain === 'schedule') return ['reservation_count', 'arrival_rate'];
    if (task.domain === 'card') return ['card_usage_times'];
    if (task.domain === 'memberCard') return ['member_balance'];
    if (task.domain === 'marketing') return ['campaign_conversion_rate'];
    return [];
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
      if (metricKeys.includes('campaign_conversion_rate')) return ['campaignId', 'campaignName'];
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
    if (task.domain === 'marketing') return 'marketing_conversion_diagnosis';
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
