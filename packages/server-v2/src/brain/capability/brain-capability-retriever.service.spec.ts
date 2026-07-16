import { MODULE_METADATA } from '@nestjs/common/constants.js';
import { BrainModule } from '../brain.module.js';
import type { BrainSemanticIntent } from '../cognition/brain-semantic-intent.types.js';
import type { BrainRequestContext } from '../context/brain-request-context.js';
import { BRAIN_CAPABILITY_RETRIEVER_CASES } from './brain-capability-retriever.cases.js';
import { BrainCapabilityRetrieverService } from './brain-capability-retriever.service.js';
import type { BrainCapabilityCard, BrainCapabilityDefinitionRef } from './brain-capability.types.js';

describe('BrainCapabilityRetrieverService', () => {
  const sourceFingerprint = 'a'.repeat(64);
  const definitionFingerprint = 'b'.repeat(64);
  const context: BrainRequestContext = {
    userId: 9,
    storeId: 6,
    visibleStoreIds: [6],
    roles: ['store_manager'],
    permissions: ['core:metric:view'],
    deniedPermissions: [],
    requestId: 'request-retriever',
    timezone: 'Asia/Shanghai',
  };
  const service = new BrainCapabilityRetrieverService({
    runtime: { capabilityMinConfidence: 0.3, capabilityTopK: 5 },
  } as never);

  const ref = (definitionKey: string, index: number): BrainCapabilityDefinitionRef => ({
    definitionId: index,
    versionId: index + 100,
    definitionKey,
    version: 1,
    definitionFingerprint,
    sourceFingerprint,
  });

  const card = (
    key: string,
    options: {
      name: string;
      domain: string;
      intent: string;
      refs: string[];
      synonyms: string[];
      examples: string[];
      description?: string;
      inputProperties?: string[];
      permissions?: string[];
      roles?: string[];
      riskLevel?: BrainCapabilityCard['riskLevel'];
      readOnly?: boolean;
    },
  ): BrainCapabilityCard => ({
    key,
    version: 1,
    name: options.name,
    description: options.description ?? options.name,
    domains: [options.domain],
    intents: [options.intent],
    inputSchema: {
      type: 'object',
      properties: Object.fromEntries((options.inputProperties ?? ['timeRange', 'limit']).map((name) => [name, {}])),
    },
    outputSchema: { type: 'object' },
    requiredPermissions: options.permissions ?? ['core:metric:view'],
    allowedRoles: options.roles ?? ['store_manager'],
    readOnly: options.readOnly ?? true,
    sideEffect: options.readOnly === false,
    riskLevel: options.riskLevel ?? 'low',
    requiresConfirmation: options.readOnly === false,
    idempotency: options.readOnly === false ? 'required' : 'not_applicable',
    timeoutMs: 10_000,
    grounding: 'semantic_query',
    examples: options.examples,
    sourceFingerprint,
    definitionRefs: options.refs.map((key, index) => ref(key, index + 1)),
    synonyms: options.synonyms,
    negativeExamples: [],
    successSchema: { type: 'object' },
  });

  const cards = (): BrainCapabilityCard[] => [
    card('product_sales_ranking', {
      name: '商品销售排行',
      domain: 'sales',
      intent: 'ranking',
      refs: ['metric.product_sales_quantity', 'entity.product'],
      synonyms: ['商品销量榜', '产品销量榜', '产品热销排行', '商品销售数量'],
      examples: ['本月商品销售排行'],
    }),
    card('project_service_ranking', {
      name: '项目服务排行',
      domain: 'service',
      intent: 'ranking',
      refs: ['metric.project_service_count', 'entity.project'],
      synonyms: [
        '护理项目榜',
        '护理项目服务次数榜',
        '项目服务量排行',
        '低频服务项目',
        '服务做得最少',
        '服务项目热度',
        '项目服务次数',
      ],
      examples: ['本月项目服务排行'],
    }),
    card('staff_performance_ranking', {
      name: '员工表现排行',
      domain: 'staff',
      intent: 'ranking',
      refs: ['metric.staff_performance_score', 'entity.beautician'],
      synonyms: [
        '美容师绩效榜',
        '美容师业绩排名',
        '员工绩效排行榜',
        '人员绩效比较',
        '员工绩效高低',
        '绩效最低员工',
        '技师表现排名',
        '员工综合表现',
      ],
      examples: ['本月员工表现排行'],
    }),
    card('order_revenue_analysis', {
      name: '订单收入分析',
      description: '分析已支付订单收入、订单数量和平均客单价',
      domain: 'finance',
      intent: 'query',
      refs: ['metric.paid_amount', 'entity.order'],
      synonyms: ['订单实收', '已支付订单金额', '订单营收', '订单客单价'],
      examples: ['本月订单收入分析', '分析已支付订单金额', '看订单金额和数量'],
    }),
    card('inventory_risk_ranking', {
      name: '库存风险排行',
      domain: 'inventory',
      intent: 'ranking',
      refs: ['metric.stock_risk_score', 'entity.product'],
      synonyms: ['库存预警榜', '产品库存风险榜', '库存预警商品排行', '商品库存风险', '缺货临期风险'],
      examples: ['本月库存风险排行'],
    }),
    card('paid_revenue', {
      name: '支付渠道实收',
      description: '按微信、支付宝、银行卡等支付渠道拆分实收',
      domain: 'finance',
      intent: 'query',
      refs: ['metric.paid_amount', 'entity.order'],
      synonyms: ['支付渠道金额', '支付方式收入', '微信支付实收'],
      examples: ['各支付渠道实收多少'],
    }),
    card('product_language_distractor', {
      name: '零售高峰时段',
      description: '使用商品销售数量识别小时和星期高峰',
      domain: 'sales',
      intent: 'ranking',
      refs: ['metric.product_sales_quantity', 'entity.product'],
      synonyms: ['小时热力图', '星期销售热力'],
      examples: ['上午和下午哪个时段更忙'],
    }),
    card('project_language_distractor', {
      name: '服务高峰时段',
      description: '使用项目服务次数识别小时和星期高峰',
      domain: 'service',
      intent: 'ranking',
      refs: ['metric.project_service_count', 'entity.project'],
      synonyms: ['预约时段热力', '小时服务热力'],
      examples: ['哪个时段服务最忙'],
    }),
    card('staff_language_distractor', {
      name: '班次效率对比',
      description: '使用员工绩效得分比较早班、中班和晚班',
      domain: 'staff',
      intent: 'ranking',
      refs: ['metric.staff_performance_score', 'entity.beautician'],
      synonyms: ['早晚班绩效', '班次效率榜'],
      examples: ['早班和晚班哪个效率高'],
    }),
    card('order_language_distractor', {
      name: '支付高峰时段',
      description: '使用已支付订单金额识别小时和星期高峰',
      domain: 'finance',
      intent: 'query',
      refs: ['metric.paid_amount', 'entity.order'],
      synonyms: ['小时支付热力', '收款高峰'],
      examples: ['一天中哪个时段收款最高'],
    }),
    card('inventory_language_distractor', {
      name: '仓位预警热力',
      description: '使用商品库存风险比较仓库和货架仓位',
      domain: 'inventory',
      intent: 'ranking',
      refs: ['metric.stock_risk_score', 'entity.product'],
      synonyms: ['货架风险热力', '仓位健康'],
      examples: ['哪个仓位需要优先处理'],
    }),
  ];

  const intent = (input: {
    domain: string;
    intent: BrainSemanticIntent['intent'];
    metricDefinitionKey?: string;
    entityDefinitionKey?: string;
  }): BrainSemanticIntent => ({
    schemaVersion: '1.0',
    objective: '回答经营问题',
    domains: [input.domain],
    intent: input.intent,
    entities: input.entityDefinitionKey
      ? [
          {
            entityType: input.entityDefinitionKey,
            mention: input.entityDefinitionKey,
            source: 'user',
            definitionRef: {
              definitionType: 'entity',
              definitionKey: input.entityDefinitionKey,
              definitionVersion: 1,
              definitionFingerprint,
              sourceFingerprint,
            },
            confidence: 1,
          },
        ]
      : [],
    metrics: input.metricDefinitionKey
      ? [
          {
            definitionType: 'metric',
            definitionKey: input.metricDefinitionKey,
            definitionVersion: 1,
            definitionFingerprint,
            sourceFingerprint,
          },
        ]
      : [],
    dimensions: [],
    filters: [],
    orderBy: [],
    answerShape: input.intent === 'ranking' ? 'ranking' : 'scalar',
    successCriteria: [],
    ambiguities: [],
    missingSlots: [],
    assumptions: [],
    confidence: 0.95,
    decisionSummary: 'test',
  });

  it('selects product sales ranking instead of paid revenue or staff ranking', () => {
    const result = service.retrieve({
      intent: intent({
        domain: 'sales',
        intent: 'ranking',
        metricDefinitionKey: 'metric.product_sales_quantity',
        entityDefinitionKey: 'entity.product',
      }),
      question: '本月商品销售排行',
      context,
      cards: cards(),
    });

    expect(result.status).toBe('selected');
    expect(result.selected?.key).toBe('product_sales_ranking');
    expect(result.topK.map((item) => item.card.key)).not.toContain('paid_revenue');
    expect(result.topK.map((item) => item.card.key)).not.toContain('staff_performance_ranking');
  });

  it('hard-filters permission denies, missing grants, roles, risk and read-only policy', () => {
    const candidates = [
      card('allowed', {
        name: '客户查询',
        domain: 'customer',
        intent: 'query',
        refs: ['entity.customer'],
        synonyms: ['客户资料'],
        examples: ['查询客户'],
      }),
      card('denied', {
        name: '客户查询',
        domain: 'customer',
        intent: 'query',
        refs: ['entity.customer'],
        synonyms: ['客户资料'],
        examples: ['查询客户'],
        permissions: ['core:customer:secret'],
      }),
      card('wrong_role', {
        name: '客户查询',
        domain: 'customer',
        intent: 'query',
        refs: ['entity.customer'],
        synonyms: ['客户资料'],
        examples: ['查询客户'],
        roles: ['finance'],
      }),
      card('high_risk', {
        name: '客户查询',
        domain: 'customer',
        intent: 'query',
        refs: ['entity.customer'],
        synonyms: ['客户资料'],
        examples: ['查询客户'],
        riskLevel: 'high',
      }),
      card('write', {
        name: '客户查询',
        domain: 'customer',
        intent: 'query',
        refs: ['entity.customer'],
        synonyms: ['客户资料'],
        examples: ['查询客户'],
        readOnly: false,
      }),
    ];
    const result = service.retrieve({
      intent: intent({ domain: 'customer', intent: 'query', entityDefinitionKey: 'entity.customer' }),
      question: '查询客户资料',
      context: { ...context, permissions: ['*'], deniedPermissions: ['core:customer:secret'] },
      cards: candidates,
      maxRisk: 'medium',
      readOnlyOnly: true,
    });

    expect(result.topK.map((item) => item.card.key)).toEqual(['allowed']);
  });

  it('defaults to low-risk read-only retrieval when the caller omits policy options', () => {
    const candidates = [
      card('safe_read', {
        name: '客户资料',
        domain: 'customer',
        intent: 'query',
        refs: ['entity.customer'],
        synonyms: ['客户查询'],
        examples: ['查询客户'],
      }),
      card('medium_read', {
        name: '客户资料',
        domain: 'customer',
        intent: 'query',
        refs: ['entity.customer'],
        synonyms: ['客户查询'],
        examples: ['查询客户'],
        riskLevel: 'medium',
      }),
      card('write_action', {
        name: '客户资料',
        domain: 'customer',
        intent: 'query',
        refs: ['entity.customer'],
        synonyms: ['客户查询'],
        examples: ['查询客户'],
        readOnly: false,
      }),
    ];

    const result = service.retrieve({
      intent: intent({ domain: 'customer', intent: 'query', entityDefinitionKey: 'entity.customer' }),
      question: '查询客户资料',
      context,
      cards: candidates,
    });

    expect(result.topK.map((item) => item.card.key)).toEqual(['safe_read']);
  });

  it('computes the margin before topK slicing and uses the configured confidence threshold', () => {
    const topOneService = new BrainCapabilityRetrieverService({
      runtime: { capabilityMinConfidence: 0.3, capabilityTopK: 1 },
    } as never);
    const candidates = [
      card('candidate_a', {
        name: '商品排行',
        domain: 'sales',
        intent: 'ranking',
        refs: ['metric.a'],
        synonyms: [],
        examples: [],
      }),
      card('candidate_b', {
        name: '商品排行',
        domain: 'sales',
        intent: 'ranking',
        refs: ['metric.b'],
        synonyms: [],
        examples: [],
      }),
    ];

    const result = topOneService.retrieve({
      intent: intent({ domain: 'sales', intent: 'ranking' }),
      question: '商品排行',
      context,
      cards: candidates,
    });

    expect(result.status).toBe('clarify');
    expect(result.reason).toBe('top1_margin_insufficient');
    expect(result.margin).toBe(0);
    expect(result.topK).toHaveLength(1);
  });

  it('uses the runtime capability confidence threshold instead of a permissive constant', () => {
    const strictService = new BrainCapabilityRetrieverService({
      runtime: { capabilityMinConfidence: 0.95, capabilityTopK: 5 },
    } as never);
    const result = strictService.retrieve({
      intent: intent({ domain: 'customer', intent: 'query', entityDefinitionKey: 'entity.customer' }),
      question: '客户',
      context,
      cards: [
        card('customer_query', {
          name: '客户资料查询',
          domain: 'customer',
          intent: 'query',
          refs: ['entity.customer'],
          synonyms: ['客户档案'],
          examples: ['查询客户资料'],
        }),
      ],
    });

    expect(result.status).toBe('clarify');
    expect(result.reason).toBe('top1_below_confidence_threshold');
  });

  it('treats the question as literal ranking text after structured intent hard filters', () => {
    const shared = {
      domain: 'finance',
      intent: 'query',
      refs: ['metric.paid_amount', 'entity.order'],
      synonyms: [] as string[],
      examples: [] as string[],
    };
    const result = service.retrieve({
      intent: intent({
        domain: 'finance',
        intent: 'query',
        metricDefinitionKey: 'metric.paid_amount',
        entityDefinitionKey: 'entity.order',
      }),
      question: '不要订单收入',
      context,
      cards: [
        card('literal_phrase', { ...shared, name: '不要订单收入' }),
        card('other_phrase', { ...shared, name: '支付渠道分析' }),
      ],
    });

    expect(result).toMatchObject({ status: 'selected', selected: { key: 'literal_phrase' } });
  });

  it('returns clarify for low confidence or insufficient top-two margin and none after hard filtering', () => {
    const low = service.retrieve({
      intent: intent({ domain: 'sales', intent: 'ranking' }),
      question: '完全无关的问题',
      context,
      cards: [cards()[0]],
    });
    const close = service.retrieve({
      intent: intent({ domain: 'sales', intent: 'ranking' }),
      question: '商品排行',
      context,
      cards: [
        card('candidate_a', {
          name: '商品排行',
          domain: 'sales',
          intent: 'ranking',
          refs: ['metric.a'],
          synonyms: [],
          examples: [],
        }),
        card('candidate_b', {
          name: '商品排行',
          domain: 'sales',
          intent: 'ranking',
          refs: ['metric.b'],
          synonyms: [],
          examples: [],
        }),
      ],
    });
    const none = service.retrieve({
      intent: intent({ domain: 'inventory', intent: 'ranking', metricDefinitionKey: 'metric.unknown' }),
      question: '库存',
      context,
      cards: cards(),
    });

    expect(low.status).toBe('clarify');
    expect(close.status).toBe('clarify');
    expect(close.margin).toBe(0);
    expect(none.status).toBe('none');
  });

  it('runs at least 150 real selection samples through the retriever', () => {
    expect(BRAIN_CAPABILITY_RETRIEVER_CASES.length).toBeGreaterThanOrEqual(150);
    const failures: Array<Record<string, unknown>> = [];
    for (const sample of BRAIN_CAPABILITY_RETRIEVER_CASES) {
      const result = service.retrieve({
        intent: intent({
          domain: sample.domain,
          intent: sample.intent,
          metricDefinitionKey: sample.metricDefinitionKey,
          entityDefinitionKey: sample.entityDefinitionKey,
        }),
        question: sample.question,
        context,
        cards: cards(),
      });
      expect(result.topK.length).toBeGreaterThanOrEqual(2);
      if (result.status !== 'selected' || result.selected?.key !== sample.expectedKey) {
        failures.push({
          id: sample.id,
          status: result.status,
          selected: result.selected?.key,
          confidence: result.confidence,
          margin: result.margin,
          topK: result.topK.map((item) => item.card.key),
        });
      }
    }
    expect(failures).toEqual([]);
  });

  it('is registered and exported by BrainModule', () => {
    const providers = Reflect.getMetadata(MODULE_METADATA.PROVIDERS, BrainModule) as unknown[];
    const exports = Reflect.getMetadata(MODULE_METADATA.EXPORTS, BrainModule) as unknown[];
    expect(providers).toContain(BrainCapabilityRetrieverService);
    expect(exports).toContain(BrainCapabilityRetrieverService);
  });
});
