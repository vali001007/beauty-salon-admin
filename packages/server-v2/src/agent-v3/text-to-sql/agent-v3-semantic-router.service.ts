import { Injectable } from '@nestjs/common';
import type { AgentV3QueryIntent, AgentV3SemanticView, AgentV3TextToSqlRequest } from './agent-v3-text-to-sql.types.js';
import { AgentV3SemanticViewRegistryService } from './agent-v3-semantic-view-registry.service.js';

type EntityDefinition = {
  type: string;
  canonicalName: string;
  domain: string;
  aliases: string[];
  expectedFields: string[];
  forbiddenFields: string[];
};

type MetricDefinition = {
  canonicalName: string;
  type: AgentV3QueryIntent['metric']['type'];
  aliases: string[];
  fields: string[];
  sortDirection?: 'asc' | 'desc';
  defaultByEntity?: Record<string, { canonicalName: string; fields: string[]; type?: AgentV3QueryIntent['metric']['type'] }>;
};

const ENTITY_DEFINITIONS: EntityDefinition[] = [
  {
    type: 'project',
    canonicalName: '项目',
    domain: 'project',
    aliases: ['项目', '护理项目', '服务项目', '疗程', '护理', '服务'],
    expectedFields: ['project_id', 'project_name', 'project_type'],
    forbiddenFields: ['customer_id', 'customer_name_masked', 'member_level'],
  },
  {
    type: 'product',
    canonicalName: '商品',
    domain: 'product',
    aliases: ['商品', '产品', 'sku', 'SKU', '耗材'],
    expectedFields: ['product_id', 'product_name', 'sku'],
    forbiddenFields: ['customer_id', 'customer_name_masked'],
  },
  {
    type: 'customer',
    canonicalName: '客户',
    domain: 'customer',
    aliases: ['客户', '顾客', '会员', '消费者'],
    expectedFields: ['customer_id', 'customer_name_masked'],
    forbiddenFields: ['product_id', 'product_name', 'project_id', 'project_name'],
  },
  {
    type: 'order',
    canonicalName: '经营订单',
    domain: 'order',
    aliases: ['营业额', '营收', '实收', '净收', '经营情况', '营业情况', '门店经营', '门店营业', '订单'],
    expectedFields: ['paid_amount', 'net_amount', 'refund_amount', 'order_count', 'order_created_at'],
    forbiddenFields: ['customer_name_masked', 'member_level'],
  },
  {
    type: 'inventory',
    canonicalName: '库存',
    domain: 'inventory',
    aliases: ['库存', '报废', '损耗', '出入库', '库存流水'],
    expectedFields: ['product_id', 'product_name', 'sku', 'scrap_quantity', 'current_stock'],
    forbiddenFields: ['customer_id', 'customer_name_masked'],
  },
  {
    type: 'staff',
    canonicalName: '员工',
    domain: 'staff',
    aliases: ['员工', '美容师', '人效', '绩效', '提成'],
    expectedFields: ['staff_id', 'staff_name'],
    forbiddenFields: ['customer_name_masked', 'member_level'],
  },
  {
    type: 'marketing',
    canonicalName: '营销',
    domain: 'marketing',
    aliases: ['营销', '活动', '转化', '线索', '渠道'],
    expectedFields: ['activity_id', 'activity_title', 'conversion_count', 'attributed_revenue'],
    forbiddenFields: ['customer_id', 'customer_name_masked'],
  },
  {
    type: 'reservation',
    canonicalName: '预约',
    domain: 'reservation',
    aliases: ['预约', '到店', '排班', '预约记录'],
    expectedFields: ['reservation_id', 'project_name', 'date', 'status'],
    forbiddenFields: ['sku'],
  },
];

const METRIC_DEFINITIONS: MetricDefinition[] = [
  {
    canonicalName: 'popularity',
    type: 'ranking',
    aliases: ['受欢迎', '热门', '最多人做', '做得最多', '卖得最多', '最常做', '最受客户欢迎'],
    fields: [],
    sortDirection: 'desc',
    defaultByEntity: {
      project: { canonicalName: 'service_quantity', fields: ['service_quantity'], type: 'quantity' },
      product: { canonicalName: 'quantity_sold', fields: ['quantity'], type: 'quantity' },
      marketing: { canonicalName: 'conversion_count', fields: ['conversion_count'], type: 'count' },
      staff: { canonicalName: 'service_count', fields: ['service_count'], type: 'count' },
      customer: { canonicalName: 'total_paid_amount', fields: ['total_paid_amount'], type: 'amount' },
    },
  },
  { canonicalName: 'quantity_sold', type: 'quantity', aliases: ['销量', '销售数量', '卖出数量'], fields: ['quantity'], sortDirection: 'desc' },
  { canonicalName: 'paid_amount', type: 'amount', aliases: ['营业额', '营收', '实收', '收入', '成交额'], fields: ['paid_amount', 'net_amount'], sortDirection: 'desc' },
  { canonicalName: 'net_sales_amount', type: 'amount', aliases: ['销售额', '销售金额', '净销售', '项目销售额'], fields: ['net_amount'], sortDirection: 'desc' },
  { canonicalName: 'refund_amount', type: 'amount', aliases: ['退款', '退款率', '退款金额'], fields: ['refund_amount'], sortDirection: 'desc' },
  { canonicalName: 'scrap_quantity', type: 'quantity', aliases: ['报废', '损耗'], fields: ['scrap_quantity'], sortDirection: 'desc' },
  { canonicalName: 'average_order_amount', type: 'amount', aliases: ['客单价'], fields: ['average_order_amount'], sortDirection: 'desc' },
  { canonicalName: 'inactivity', type: 'ranking', aliases: ['很久没来', '沉睡', '流失', '未到店'], fields: ['last_visit_at', 'last_order_at'], sortDirection: 'asc' },
];

const VIEW_BINDINGS: Array<{ entity: string; metrics: string[]; viewName: string; score: number; reasons: string[] }> = [
  { entity: 'project', metrics: ['popularity', 'service_quantity', 'net_sales_amount'], viewName: 'agent_v3_project_service_sales_view', score: 0.96, reasons: ['entity=project', 'project sales/service view'] },
  { entity: 'product', metrics: ['popularity', 'quantity_sold', 'net_sales_amount'], viewName: 'agent_v3_order_item_sales_view', score: 0.96, reasons: ['entity=product', 'product sales view'] },
  { entity: 'order', metrics: ['paid_amount', 'refund_amount', 'net_sales_amount'], viewName: 'agent_v3_order_summary_view', score: 0.92, reasons: ['entity=order', 'order finance view'] },
  { entity: 'inventory', metrics: ['scrap_quantity'], viewName: 'agent_v3_inventory_scrap_view', score: 0.94, reasons: ['entity=inventory', 'scrap movement view'] },
  { entity: 'customer', metrics: ['inactivity', 'total_paid_amount', 'popularity'], viewName: 'agent_v3_customer_profile_summary_view', score: 0.9, reasons: ['entity=customer', 'customer profile view'] },
  { entity: 'staff', metrics: ['average_order_amount', 'service_count', 'popularity'], viewName: 'agent_v3_staff_performance_view', score: 0.9, reasons: ['entity=staff', 'staff performance view'] },
  { entity: 'marketing', metrics: ['conversion_count', 'popularity'], viewName: 'agent_v3_marketing_conversion_view', score: 0.9, reasons: ['entity=marketing', 'marketing conversion view'] },
  { entity: 'reservation', metrics: ['count', 'status'], viewName: 'agent_v3_reservation_view', score: 0.86, reasons: ['entity=reservation', 'reservation view'] },
];

@Injectable()
export class AgentV3SemanticRouterService {
  constructor(private readonly registry: AgentV3SemanticViewRegistryService) {}

  route(request: Pick<AgentV3TextToSqlRequest, 'question' | 'permissions' | 'roleCodes'>): AgentV3QueryIntent {
    const normalizedQuestion = this.normalize(request.question);
    const rawEntity = this.resolveEntity(normalizedQuestion);
    const rawMetric = this.resolveMetric(normalizedQuestion, rawEntity.type);
    const entity = rawEntity.type === 'unknown' ? this.inferEntityFromMetric(rawMetric.canonicalName) : rawEntity;
    const metric = rawMetric.canonicalName === 'unknown' ? this.defaultMetricForEntity(entity.type, normalizedQuestion) : rawMetric;
    const candidates = this.viewCandidates(entity.type, metric.canonicalName, request);
    const top = candidates[0];
    const second = candidates[1];
    const risks: AgentV3QueryIntent['risks'] = [];
    if (entity.type === 'unknown') risks.push('ambiguous_entity');
    if (metric.canonicalName === 'unknown') risks.push('ambiguous_metric');
    if (!top) risks.push('no_view');
    if (top && top.score < 0.75) risks.push('low_confidence');
    if (top && second && top.score - second.score < 0.15) risks.push('low_confidence');

    return {
      originalQuestion: request.question,
      normalizedQuestion,
      domain: entity.domain,
      entity: {
        type: entity.type,
        canonicalName: entity.canonicalName,
        aliases: entity.aliases,
        confidence: entity.confidence,
      },
      metric: {
        type: metric.type,
        canonicalName: metric.canonicalName,
        fieldCandidates: metric.fields,
        sortDirection: metric.sortDirection,
        confidence: metric.confidence,
      },
      timeRange: {
        preset: this.timePreset(normalizedQuestion),
        confidence: this.timePreset(normalizedQuestion) ? 0.9 : 0.5,
      },
      shape: this.shape(normalizedQuestion),
      selectedView: top?.viewName,
      expectedFields: entity.expectedFields,
      forbiddenFields: entity.forbiddenFields,
      selectedViewCandidates: candidates,
      risks,
      source: 'v3_kg_local_fixture',
    };
  }

  exportLocalSnapshot() {
    const views = this.registry.allDefinitions();
    return {
      version: `v3-kg-local-${new Date().toISOString().slice(0, 10)}`,
      source: 'v3_kg_local_fixture',
      businessObjects: ENTITY_DEFINITIONS,
      metricVocabulary: METRIC_DEFINITIONS,
      viewBindings: VIEW_BINDINGS,
      semanticViews: views.map((viewDef) => ({
        viewName: viewDef.viewName,
        domain: viewDef.domain,
        description: viewDef.description,
        status: viewDef.status,
        requiredPermissions: viewDef.requiredPermissions,
        storeScopeField: viewDef.storeScopeField,
        defaultTimeField: viewDef.defaultTimeField,
      })),
      negativeExamples: [
        {
          question: '最近一个月最受欢迎的项目有哪几个',
          forbiddenViews: ['agent_v3_customer_profile_summary_view'],
          expectedView: 'agent_v3_project_service_sales_view',
        },
      ],
      stats: {
        entities: ENTITY_DEFINITIONS.length,
        metrics: METRIC_DEFINITIONS.length,
        viewBindings: VIEW_BINDINGS.length,
        semanticViews: views.length,
      },
    };
  }

  private normalize(question: string) {
    return question.trim().replace(/\s+/g, ' ');
  }

  private resolveEntity(question: string) {
    const scored = ENTITY_DEFINITIONS
      .map((entity) => {
        const hits = entity.aliases.filter((alias) => question.toLowerCase().includes(alias.toLowerCase()));
        return {
          ...entity,
          confidence: hits.length ? Math.min(0.98, 0.72 + hits.length * 0.12) : 0,
        };
      })
      .filter((entity) => entity.confidence > 0)
      .sort((left, right) => right.confidence - left.confidence);
    return scored[0] ?? {
      type: 'unknown',
      canonicalName: '未知对象',
      domain: 'unknown',
      aliases: [],
      expectedFields: [],
      forbiddenFields: [],
      confidence: 0,
    };
  }

  private resolveMetric(question: string, entityType: string) {
    const matched = METRIC_DEFINITIONS
      .map((metric) => {
        const hits = metric.aliases.filter((alias) => question.toLowerCase().includes(alias.toLowerCase()));
        return {
          ...metric,
          confidence: hits.length ? Math.min(0.96, 0.66 + hits.length * 0.12) : 0,
        };
      })
      .filter((metric) => metric.confidence > 0)
      .sort((left, right) => right.confidence - left.confidence)[0];
    const metric = matched ?? this.defaultMetric(question);
    const entityDefault = metric.defaultByEntity?.[entityType];
    if (entityDefault) {
      return {
        canonicalName: entityDefault.canonicalName,
        type: entityDefault.type ?? metric.type,
        fields: entityDefault.fields,
        sortDirection: metric.sortDirection,
        confidence: Math.max(metric.confidence, 0.82),
      };
    }
    return {
      canonicalName: metric.canonicalName,
      type: metric.type,
      fields: metric.fields,
      sortDirection: metric.sortDirection,
      confidence: metric.confidence,
    };
  }

  private inferEntityFromMetric(metric: string) {
    if (['paid_amount', 'refund_amount', 'net_sales_amount', 'average_order_amount'].includes(metric)) {
      return {
        ...ENTITY_DEFINITIONS.find((entity) => entity.type === 'order')!,
        confidence: 0.72,
      };
    }
    if (['quantity_sold'].includes(metric)) {
      return {
        ...ENTITY_DEFINITIONS.find((entity) => entity.type === 'product')!,
        confidence: 0.72,
      };
    }
    if (['scrap_quantity'].includes(metric)) {
      return {
        ...ENTITY_DEFINITIONS.find((entity) => entity.type === 'inventory')!,
        confidence: 0.72,
      };
    }
    return {
      type: 'unknown',
      canonicalName: '未知对象',
      domain: 'unknown',
      aliases: [],
      expectedFields: [],
      forbiddenFields: [],
      confidence: 0,
    };
  }

  private defaultMetricForEntity(entityType: string, question: string) {
    if (entityType === 'order') {
      return { canonicalName: 'paid_amount', type: 'amount' as const, fields: ['paid_amount', 'net_amount'], sortDirection: 'desc' as const, confidence: 0.72 };
    }
    if (entityType === 'product') {
      return { canonicalName: 'quantity_sold', type: 'quantity' as const, fields: ['quantity'], sortDirection: 'desc' as const, confidence: 0.72 };
    }
    if (entityType === 'project') {
      return /销售额|销售金额|金额|营收/.test(question)
        ? { canonicalName: 'net_sales_amount', type: 'amount' as const, fields: ['net_amount'], sortDirection: 'desc' as const, confidence: 0.72 }
        : { canonicalName: 'service_quantity', type: 'quantity' as const, fields: ['service_quantity'], sortDirection: 'desc' as const, confidence: 0.72 };
    }
    if (entityType === 'inventory') {
      return { canonicalName: 'scrap_quantity', type: 'quantity' as const, fields: ['scrap_quantity'], sortDirection: 'desc' as const, confidence: 0.72 };
    }
    return this.defaultMetric(question);
  }

  private defaultMetric(question: string): MetricDefinition & { confidence: number } {
    if (/排行|排名|最高|最多|最好|top/i.test(question)) {
      return { canonicalName: 'popularity', type: 'ranking', aliases: [], fields: [], sortDirection: 'desc', confidence: 0.62 };
    }
    if (/趋势|相比|变化/.test(question)) {
      return { canonicalName: 'paid_amount', type: 'trend', aliases: [], fields: ['paid_amount', 'net_amount'], confidence: 0.6 };
    }
    return { canonicalName: 'unknown', type: 'unknown', aliases: [], fields: [], confidence: 0 };
  }

  private viewCandidates(entityType: string, metric: string, request: Pick<AgentV3TextToSqlRequest, 'permissions' | 'roleCodes'>) {
    const bindings = VIEW_BINDINGS
      .filter((binding) => binding.entity === entityType && (binding.metrics.includes(metric) || binding.metrics.includes('popularity')))
      .map((binding) => this.toViewCandidate(binding, request))
      .filter((candidate): candidate is NonNullable<typeof candidate> => Boolean(candidate));
    return bindings.sort((left, right) => right.score - left.score);
  }

  private toViewCandidate(binding: typeof VIEW_BINDINGS[number], request: Pick<AgentV3TextToSqlRequest, 'permissions' | 'roleCodes'>) {
    const viewDef = this.registry.findByName(binding.viewName);
    if (!viewDef || viewDef.status !== 'enabled') return null;
    const hasPermission = this.hasViewPermission(viewDef, request);
    return {
      viewName: binding.viewName,
      score: hasPermission ? binding.score : Math.min(binding.score, 0.4),
      reasons: [
        ...binding.reasons,
        hasPermission ? 'permission=pass' : 'permission=missing',
        `timeField=${viewDef.defaultTimeField ?? 'none'}`,
      ],
    };
  }

  private hasViewPermission(viewDef: AgentV3SemanticView, request: Pick<AgentV3TextToSqlRequest, 'permissions' | 'roleCodes'>) {
    if (request.permissions.includes('*') || request.roleCodes.includes('super_admin')) return true;
    return viewDef.requiredPermissions.every((permission) => request.permissions.includes(permission));
  }

  private timePreset(question: string) {
    if (/最近\s*(?:一|1)\s*个?月|近\s*(?:一|1)\s*个?月|最近30天|近30天/.test(question)) return 'last_30_days';
    if (/最近\s*(?:三|3)\s*个?月|近\s*(?:三|3)\s*个?月/.test(question)) return 'last_3_months';
    if (/本月|这个月/.test(question)) return 'this_month';
    if (/上月|上个月/.test(question)) return 'last_month';
    if (/今天|今日/.test(question)) return 'today';
    if (/昨天|昨日/.test(question)) return 'yesterday';
    if (/最近7天|近7天|本周/.test(question)) return 'last_7_days';
    return undefined;
  }

  private shape(question: string): AgentV3QueryIntent['shape'] {
    if (/排行|排名|最高|最多|最好|top|受欢迎|热门/.test(question)) return 'ranking';
    if (/趋势|变化/.test(question)) return 'trend';
    if (/相比|对比|环比|同比/.test(question)) return 'comparison';
    if (/详情|明细/.test(question)) return 'detail';
    if (/哪些|哪几个|列表/.test(question)) return 'list';
    return 'metric';
  }
}
