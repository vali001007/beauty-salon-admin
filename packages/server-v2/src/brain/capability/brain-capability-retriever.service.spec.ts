import { MODULE_METADATA } from '@nestjs/common/constants.js';
import { BrainModule } from '../brain.module.js';
import type { BrainSemanticIntent } from '../cognition/brain-semantic-intent.types.js';
import type { BusinessActionDefinitionSnapshot } from '../cognition/business-definition-snapshot.types.js';
import { createTestBusinessActionInformationArtifactProfile } from '../cognition/business-action-information-artifact.testing.js';
import { createTestBusinessActionLexicalFrame } from '../cognition/business-action-lexical-frame.testing.js';
import { createTestBusinessActionModalityPolicy } from '../cognition/business-action-modality-policy.testing.js';
import { createTestBusinessActionSideEffectInvariantProfile } from '../cognition/business-action-side-effect-invariant.testing.js';
import { createTestBusinessActionSituationContextProfile } from '../cognition/business-action-situation-context.testing.js';
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
      negativeExamples?: string[];
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
    grounding: options.readOnly === false ? 'preview_action' : 'semantic_query',
    examples: options.examples,
    sourceFingerprint,
    definitionRefs: options.refs.map((key, index) => ref(key, index + 1)),
    synonyms: options.synonyms,
    negativeExamples: options.negativeExamples ?? [],
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

  it('allows only an authenticated super admin to cross capability role boundaries', () => {
    const marketing = card('marketing_message_draft', {
      name: '营销提醒文案',
      domain: 'marketing',
      intent: 'draft',
      refs: ['entity.customer'],
      synonyms: ['预约提醒文案'],
      examples: ['写一条提醒客户预约空档的消息'],
      permissions: ['core:marketing:create'],
      roles: ['marketing'],
    });
    const superAdmin = {
      ...context,
      roles: ['super_admin'],
      permissions: ['*'],
    };
    const ordinaryManager = {
      ...context,
      roles: ['store_manager'],
      permissions: ['*'],
    };

    expect(
      service.discover({ question: '写一条提醒客户预约空档的消息', context: superAdmin, cards: [marketing] }).status,
    ).toBe('selected');
    expect(
      service.discover({ question: '写一条提醒客户预约空档的消息', context: ordinaryManager, cards: [marketing] })
        .status,
    ).toBe('none');
  });

  it('uses explicit draft shape before comparing action and draft capabilities', () => {
    const draft = card('marketing_message_draft', {
      name: '营销提醒文案',
      domain: 'marketing',
      intent: 'draft',
      refs: ['entity.customer'],
      synonyms: ['预约提醒文案'],
      examples: ['写一条空档邀约短信'],
      permissions: ['core:marketing:create'],
      roles: ['store_manager'],
    });
    const genericDraft = card('marketing_touch_draft', {
      name: '营销触达草稿',
      domain: 'marketing',
      intent: 'draft',
      refs: ['entity.customer'],
      synonyms: ['客户触达'],
      examples: ['准备客户触达内容'],
      permissions: ['core:marketing:create'],
      roles: ['store_manager'],
    });
    const action = card('reservation_action_preview', {
      name: '预约动作预览',
      domain: 'reservation',
      intent: 'action',
      refs: ['entity.reservation'],
      synonyms: ['预约提醒'],
      examples: ['提醒客户预约'],
      permissions: ['core:marketing:create'],
      roles: ['store_manager'],
      readOnly: false,
      riskLevel: 'high',
    });
    const result = service.discover({
      question: '写一条提醒客户预约空档的消息',
      context: { ...context, permissions: ['core:marketing:create'] },
      cards: [action, genericDraft, draft],
    });

    expect(result).toMatchObject({
      status: 'selected',
      selected: { key: 'marketing_message_draft' },
    });
    expect(result.topK.map((item) => item.card.key)).not.toContain('reservation_action_preview');
  });

  it('discovers the unique governed capability before semantic intent compilation', () => {
    expect(
      service.discover({
        question: '这个月各种支付渠道分别收了多少',
        context,
        cards: cards(),
      }),
    ).toMatchObject({
      status: 'selected',
      selected: { key: 'paid_revenue' },
      reason: 'catalog_top1_selected',
    });
  });

  it('penalizes a capability whose governed negative example matches the question', () => {
    const result = service.retrieve({
      intent: {
        domains: ['finance'],
        intent: 'query',
        metrics: [],
        dimensions: [],
        entities: [],
      } as unknown as BrainSemanticIntent,
      question: '耗材成本占服务收入的比例',
      context,
      cards: [
        card('project_material_consumption_analysis', {
          name: '项目耗材消耗',
          domain: 'finance',
          intent: 'query',
          refs: [],
          synonyms: ['耗材成本'],
          examples: ['各项目耗材成本'],
          negativeExamples: ['耗材成本占服务收入的比例'],
        }),
        card('finance_material_cost_summary', {
          name: '耗材成本率',
          domain: 'finance',
          intent: 'query',
          refs: [],
          synonyms: ['耗材成本占收入比例'],
          examples: ['耗材成本占服务收入的比例'],
        }),
      ],
    });

    expect(result).toMatchObject({ status: 'selected', selected: { key: 'finance_material_cost_summary' } });
    expect(result.topK[0]?.score).toBeGreaterThan(result.topK[1]?.score ?? 0);
  });

  it('does not route generic cost-income ratio questions to material cost summary', () => {
    const result = service.retrieve({
      intent: {
        domains: ['finance'],
        intent: 'query',
        metrics: [],
        dimensions: [],
        entities: [],
      } as unknown as BrainSemanticIntent,
      question: '2026年6月成本占收入的比例',
      context,
      cards: [
        card('finance_material_cost_summary', {
          name: '耗材成本率',
          domain: 'finance',
          intent: 'query',
          refs: ['metric.material_cost_rate'],
          synonyms: ['耗材成本', '物料成本', '耗材成本率'],
          examples: ['耗材成本占收入比例多少'],
          negativeExamples: ['成本占收入的比例', '成本收入比'],
        }),
        card('finance_risk_overview', {
          name: '财务经营风险概览',
          domain: 'finance',
          intent: 'query',
          refs: ['metric.cost_income_ratio', 'metric.operating_profit_amount', 'metric.gross_profit_amount'],
          synonyms: ['成本收入比', '经营利润', '毛利'],
          examples: ['本月毛利、经营利润和成本收入比分别多少'],
        }),
      ],
    });

    expect(result).toMatchObject({ status: 'selected', selected: { key: 'finance_risk_overview' } });
  });

  const intent = (input: {
    domain: string;
    intent: BrainSemanticIntent['intent'];
    metricDefinitionKey?: string;
    entityDefinitionKey?: string;
    entityKey?: string;
    dimensionDefinitionKey?: string;
  }): BrainSemanticIntent => ({
    schemaVersion: '1.0',
    objective: '回答经营问题',
    domains: [input.domain],
    intent: input.intent,
    entities: input.entityDefinitionKey
      ? [
          {
            entityType: input.entityDefinitionKey,
            ...(input.entityKey ? { entityKey: input.entityKey } : {}),
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
    dimensions: input.dimensionDefinitionKey
      ? [
          {
            definitionType: 'dimension',
            definitionKey: input.dimensionDefinitionKey,
            definitionVersion: 1,
            definitionFingerprint,
            sourceFingerprint,
          },
        ]
      : [],
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

  it('does not reject an exact metric capability because the model also emitted a generic entity', () => {
    const result = service.retrieve({
      intent: intent({
        domain: 'finance',
        intent: 'query',
        metricDefinitionKey: 'metric.paid_amount',
        entityDefinitionKey: 'entity.payment_record',
      }),
      question: '这个月店里实际收了多少钱',
      context,
      cards: [cards().find((item) => item.key === 'order_revenue_analysis')!],
    });

    expect(result).toMatchObject({ status: 'selected', selected: { key: 'order_revenue_analysis' } });
  });

  it('selects a published finance capability that declares the trend intent', () => {
    const result = service.retrieve({
      intent: intent({
        domain: 'finance',
        intent: 'trend',
        metricDefinitionKey: 'metric.paid_amount',
        entityDefinitionKey: 'entity.payment_record',
      }),
      question: '最近三十天每天收入走势',
      context,
      cards: [
        card('finance_payment_breakdown', {
          name: '实收、支付方式与收入趋势',
          domain: 'finance',
          intent: 'trend',
          refs: ['metric.paid_amount', 'dimension.paymentMethod'],
          synonyms: ['收入趋势', '实收走势'],
          examples: ['最近三十天每天收入走势'],
        }),
      ],
    });

    expect(result).toMatchObject({ status: 'selected', selected: { key: 'finance_payment_breakdown' } });
  });

  it('keeps the unique minimum-sufficient metric and dimension contract ahead of a broader text match', () => {
    const result = service.retrieve({
      intent: intent({
        domain: 'finance',
        intent: 'query',
        metricDefinitionKey: 'metric.paid_amount',
        dimensionDefinitionKey: 'dimension.paymentMethod',
      }),
      question: '2026年6月30日各支付方式的金额分别多少', // BQ0705
      context,
      cards: [
        card('order_revenue_analysis', {
          name: '2026年6月30日各支付方式的金额分别多少',
          domain: 'finance',
          intent: 'query',
          refs: ['metric.paid_amount', 'dimension.paymentMethod', 'entity.product_order'],
          synonyms: ['支付方式金额'],
          examples: ['2026年6月30日各支付方式的金额分别多少'],
        }),
        card('finance_payment_breakdown', {
          name: '实收与储值流水拆分',
          domain: 'finance',
          intent: 'query',
          refs: ['metric.paid_amount', 'dimension.paymentMethod'],
          synonyms: ['收款渠道'],
          examples: ['今天实收按支付方式怎么分'],
        }),
      ],
    });

    expect(result).toMatchObject({
      status: 'selected',
      selected: { key: 'finance_payment_breakdown' },
      reason: 'unique_minimum_sufficient_definition_contract',
      confidence: 1,
    });
    expect(result.topK[0]).toMatchObject({
      card: { key: 'finance_payment_breakdown' },
      matchedFields: expect.arrayContaining(['definition_contract']),
    });
  });

  it('falls back to text ranking when minimum-sufficient contracts remain tied', () => {
    const result = service.retrieve({
      intent: intent({
        domain: 'finance',
        intent: 'query',
        metricDefinitionKey: 'metric.paid_amount',
        dimensionDefinitionKey: 'dimension.paymentMethod',
      }),
      // ami-brain-unit-only: tied contract fallback, not a product evaluation question.
      question: '渠道明细甲',
      context,
      cards: [
        card('candidate_a', {
          name: '渠道明细甲',
          domain: 'finance',
          intent: 'query',
          refs: ['metric.paid_amount', 'dimension.paymentMethod'],
          synonyms: [],
          examples: [],
        }),
        card('candidate_b', {
          name: '渠道明细乙',
          domain: 'finance',
          intent: 'query',
          refs: ['metric.paid_amount', 'dimension.paymentMethod'],
          synonyms: [],
          examples: [],
        }),
      ],
    });

    expect(result).toMatchObject({ status: 'selected', selected: { key: 'candidate_a' }, reason: 'top1_selected' });
  });

  it('ranks the reservation member-level capability above a generic VIP customer capability', () => {
    const reservationCard = card('reservation_list', {
      name: '门店预约清单',
      description: '查询预约客户原始会员等级和特别接待准备，未发布统一 VIP 映射时披露口径缺口',
      domain: 'reservation',
      intent: 'query',
      refs: ['entity.reservation', 'entity.customer', 'dimension.customerLevel'],
      synonyms: ['预约客户会员等级', '预约 VIP 接待准备', '高等级会员预约'],
      examples: ['今天有预约的客人里有没有 VIP 需要特别准备', '明天预约客户的会员等级分别是什么'],
    });
    const customerCard = card('customer_facts', {
      name: '客户事实与客群查询',
      description: '查询门店 VIP、新老客和客户分层事实',
      domain: 'customer',
      intent: 'query',
      refs: ['entity.customer', 'dimension.customerLevel'],
      synonyms: ['VIP 客户', '高等级客户'],
      examples: ['我们店里的 VIP 客户有多少个'],
    });
    const ranked = service.retrieveTopKForSupervisor({
      intent: {
        ...intent({ domain: 'reservation', intent: 'query' }),
        domains: ['reservation', 'customer'],
        answerShape: 'list',
      },
      question: '今天预约的顾客中哪些会员等级需要特别接待',
      context,
      cards: [customerCard, reservationCard],
      maxRisk: 'low',
    });

    expect(ranked.map((item) => item.card.key)).toEqual(['reservation_list', 'customer_facts']);
    expect(ranked[0]!.score - ranked[1]!.score).toBeGreaterThanOrEqual(0.08);
  });

  it('keeps an explicit customer level filter inside the hard capability contract', () => {
    const result = service.retrieve({
      intent: {
        ...intent({ domain: 'customer', intent: 'query' }),
        objective: '统计钻石会员客户数量',
        filters: [
          {
            fieldRef: {
              definitionType: 'dimension',
              definitionKey: 'dimension.customerLevel',
              definitionVersion: 1,
              definitionFingerprint,
              sourceFingerprint,
            },
            operator: 'eq',
            value: '钻石',
          },
        ],
      },
      question: '一共有多少个钻石会员',
      context,
      cards: [
        card('customer_facts', {
          name: '客户事实与客群查询',
          description: '查询当前门店精确客户事实与会员等级客户数量',
          domain: 'customer',
          intent: 'query',
          refs: ['entity.customer', 'dimension.customerLevel'],
          synonyms: ['VIP 客户', '高等级客户', '钻石会员'],
          examples: ['我们店里的 VIP 客户有多少个'],
        }),
        card('reservation_list', {
          name: '门店预约清单',
          description: '查询预约客户原始会员等级和特别接待准备',
          domain: 'reservation',
          intent: 'query',
          refs: ['entity.reservation', 'entity.customer', 'dimension.customerLevel'],
          synonyms: ['预约客户会员等级', '预约 VIP 接待准备', '高等级会员预约'],
          examples: ['今天有预约的客人里有没有 VIP 需要特别准备'],
        }),
      ],
    });

    expect(result.status).toBe('selected');
    expect(result.selected?.key).toBe('customer_facts');
    expect(result.reason).toBe('top1_selected');
  });

  it('keeps concrete entity constraints and requested dimensions as hard contract filters', () => {
    const financeCard = cards().find((item) => item.key === 'order_revenue_analysis')!;
    const concreteEntity = service.retrieve({
      intent: intent({
        domain: 'finance',
        intent: 'query',
        metricDefinitionKey: 'metric.paid_amount',
        entityDefinitionKey: 'entity.payment_record',
        entityKey: 'payment-record-42',
      }),
      question: '查这笔支付',
      context,
      cards: [financeCard],
    });
    const groupedDimension = service.retrieve({
      intent: intent({
        domain: 'finance',
        intent: 'query',
        metricDefinitionKey: 'metric.paid_amount',
        dimensionDefinitionKey: 'dimension.paymentMethod',
      }),
      question: '按支付方式拆分实收',
      context,
      cards: [financeCard],
    });

    expect(concreteEntity.status).toBe('none');
    expect(groupedDimension.status).toBe('none');
  });

  it('accepts a governed concrete entity instance when the capability publishes its identity dimensions', () => {
    const result = service.retrieve({
      intent: intent({
        domain: 'finance',
        intent: 'query',
        metricDefinitionKey: 'metric.staff_commission_component_amount',
        dimensionDefinitionKey: 'dimension.commissionType',
        entityDefinitionKey: 'entity.beautician',
        entityKey: '19',
      }),
      question: '查询指定美容师的提成构成', // ami-brain-unit-only: entity-instance contract coverage.
      context,
      cards: [
        card('finance_risk_overview', {
          name: '财务经营风险概览',
          domain: 'finance',
          intent: 'query',
          refs: [
            'metric.staff_commission_component_amount',
            'dimension.commissionType',
            'dimension.beauticianId',
            'dimension.beauticianName',
          ],
          synonyms: ['员工提成构成'],
          examples: ['查询某位美容师的提成构成'],
        }),
      ],
    });

    expect(result).toMatchObject({ status: 'selected', selected: { key: 'finance_risk_overview' } });
  });

  it('keeps governed staff commission composition on finance risk when the release card has stale refs', () => {
    const result = service.retrieve({
      intent: intent({
        domain: 'finance',
        intent: 'query',
        metricDefinitionKey: 'metric.staff_commission_component_amount',
        dimensionDefinitionKey: 'dimension.commissionType',
      }),
      question: '顾然2026年6月22日至28日的提成构成', // BQ1332
      context,
      cards: [
        card('finance_risk_overview', {
          name: '财务经营风险概览',
          domain: 'finance',
          intent: 'query',
          refs: [
            'metric.paid_amount',
            'dimension.paymentMethod',
            'dimension.productId',
            'dimension.productName',
            'dimension.projectName',
          ],
          synonyms: ['财务风险', '提成构成'],
          examples: ['某位美容师本周的提成构成'],
        }),
      ],
    });

    expect(result).toMatchObject({ status: 'selected', selected: { key: 'finance_risk_overview' } });
  });

  it('accepts governed staff commission composition with a beautician entity when the stale card omitted that entity ref', () => {
    const result = service.retrieve({
      intent: intent({
        domain: 'finance',
        intent: 'query',
        metricDefinitionKey: 'metric.staff_commission_component_amount',
        dimensionDefinitionKey: 'dimension.commissionType',
        entityDefinitionKey: 'entity.beautician',
        entityKey: '19',
      }),
      question: '顾然2026年6月22日至28日的提成构成', // BQ1332
      context,
      cards: [
        card('finance_risk_overview', {
          name: '财务经营风险概览',
          domain: 'finance',
          intent: 'query',
          refs: ['metric.paid_amount', 'dimension.paymentMethod'],
          synonyms: ['财务风险', '提成构成'],
          examples: ['某位美容师本周的提成构成'],
        }),
      ],
    });

    expect(result).toMatchObject({ status: 'selected', selected: { key: 'finance_risk_overview' } });
  });

  it('keeps an unknown concrete entity definition fail-closed despite unrelated identity dimensions', () => {
    const result = service.retrieve({
      intent: intent({
        domain: 'finance',
        intent: 'query',
        metricDefinitionKey: 'metric.staff_commission_component_amount',
        dimensionDefinitionKey: 'dimension.commissionType',
        entityDefinitionKey: 'entity.staff_member',
        entityKey: '19',
      }),
      question: '查询指定员工实例的提成构成', // ami-brain-unit-only: unknown entity contract rejection.
      context,
      cards: [
        card('finance_risk_overview', {
          name: '财务经营风险概览',
          domain: 'finance',
          intent: 'query',
          refs: [
            'metric.staff_commission_component_amount',
            'dimension.commissionType',
            'dimension.beauticianId',
          ],
          synonyms: ['员工提成构成'],
          examples: ['查询某位美容师的提成构成'],
        }),
      ],
    });

    expect(result).toMatchObject({ status: 'none', reason: 'no_capability_after_hard_filters' });
  });

  it('does not let identity dimensions bypass a stale publication of the same entity definition', () => {
    const currentCard = card('finance_risk_overview', {
      name: '财务经营风险概览',
      domain: 'finance',
      intent: 'query',
      refs: [
        'metric.staff_commission_component_amount',
        'dimension.commissionType',
        'entity.beautician',
        'dimension.beauticianId',
      ],
      synonyms: ['员工提成构成'],
      examples: ['查询某位美容师的提成构成'],
    });
    const staleCard: BrainCapabilityCard = {
      ...currentCard,
      definitionRefs: currentCard.definitionRefs.map((published) =>
        published.definitionKey === 'entity.beautician'
          ? { ...published, definitionFingerprint: 'c'.repeat(64) }
          : published,
      ),
    };

    const result = service.retrieve({
      intent: intent({
        domain: 'finance',
        intent: 'query',
        metricDefinitionKey: 'metric.staff_commission_component_amount',
        dimensionDefinitionKey: 'dimension.commissionType',
        entityDefinitionKey: 'entity.beautician',
        entityKey: '19',
      }),
      question: '查询指定美容师的提成构成', // ami-brain-unit-only: stale entity definition rejection.
      context,
      cards: [staleCard],
    });

    expect(result).toMatchObject({ status: 'none', reason: 'no_capability_after_hard_filters' });
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

  it('filters guidance candidates by domain, permission, role and side-effect policy', () => {
    const candidates = [
      card('safe_guidance', {
        name: '会员卡负债',
        domain: 'membership',
        intent: 'query',
        refs: [],
        synonyms: [],
        examples: ['会员卡负债是多少'],
      }),
      card('wrong_domain', {
        name: '库存风险',
        domain: 'inventory',
        intent: 'diagnosis',
        refs: [],
        synonyms: [],
        examples: ['库存有什么风险'],
      }),
      card('missing_permission', {
        name: '会员卡余额',
        domain: 'membership',
        intent: 'query',
        refs: [],
        synonyms: [],
        examples: ['会员卡余额是多少'],
        permissions: ['core:customer:secret'],
      }),
      card('write_guidance', {
        name: '调整会员卡余额',
        domain: 'membership',
        intent: 'action',
        refs: [],
        synonyms: [],
        examples: ['调整会员卡余额'],
        readOnly: false,
      }),
    ];
    const result = service.retrieveGuidanceCandidates({
      domains: ['membership'],
      question: '会员卡情况怎么样',
      context,
      cards: candidates,
    });

    expect(result.map((item) => item.card.key)).toEqual(['safe_guidance']);
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

  it('selects an action only through the exact published action binding', () => {
    const actionRef = {
      definitionType: 'action' as const,
      definitionKey: 'action.create_purchase_order',
      definitionVersion: 1,
      definitionFingerprint,
      sourceFingerprint,
    };
    const actionDefinition: BusinessActionDefinitionSnapshot = {
      definitionKey: actionRef.definitionKey,
      version: actionRef.definitionVersion,
      definitionFingerprint: actionRef.definitionFingerprint,
      sourceFingerprint: actionRef.sourceFingerprint,
      domain: 'inventory',
      actionKey: actionRef.definitionKey,
      name: '创建采购单',
      aliases: ['下采购单'],
      description: '创建采购单预览',
      actionClass: 'create',
      targetEntityRefs: ['entity.product'],
      inputSlots: [],
      preconditions: [],
      preconditionPredicateRefs: [],
      effects: ['purchase_order_created'],
      effectAssertionRefs: [{ key: 'purchase_order_created', version: 1, fingerprint: 'd'.repeat(64) }],
      lexicalFrame: createTestBusinessActionLexicalFrame({
        actionKey: actionRef.definitionKey,
        name: '创建采购单',
        aliases: ['下采购单'],
        inputSlots: [],
      }),
      situationContext: createTestBusinessActionSituationContextProfile(actionRef.definitionKey),
      modalityPolicy: createTestBusinessActionModalityPolicy(actionRef.definitionKey),
      informationArtifact: createTestBusinessActionInformationArtifactProfile(actionRef.definitionKey),
      sideEffectInvariant: createTestBusinessActionSideEffectInvariantProfile(actionRef.definitionKey, {
        effects: ['purchase_order_created'],
        effectAssertionRefs: [{ key: 'purchase_order_created', version: 1, fingerprint: 'd'.repeat(64) }],
      }),
      triggeredByEventRefs: [],
      emitsEventRefs: [],
      riskPolicy: 'high',
      confirmationPolicy: 'required',
      idempotencyPolicy: 'required',
      capabilityBindings: [
        {
          capabilityKey: 'purchase_order_draft',
          bindingMode: 'preview_and_execute',
          gatewayActionKey: 'create_purchase_order',
          priority: 0,
          enabled: true,
        },
      ],
      bindingFingerprint: 'c'.repeat(64),
    };
    const purchase = card('purchase_order_draft', {
      name: '采购单预览',
      domain: 'inventory',
      intent: 'action',
      refs: [actionRef.definitionKey, 'entity.product'],
      synonyms: [],
      examples: [],
      readOnly: false,
      riskLevel: 'high',
    });
    const transfer = card('inventory_transfer_draft', {
      name: '库存调拨预览',
      domain: 'inventory',
      intent: 'action',
      refs: ['action.create_transfer_order', 'entity.product'],
      synonyms: ['调拨'],
      examples: ['把商品调到二店'],
      readOnly: false,
      riskLevel: 'high',
    });
    const actionIntent: BrainSemanticIntent = {
      ...intent({ domain: 'inventory', intent: 'action' }),
      schemaVersion: '1.1',
      answerShape: 'action_preview',
      actionRef,
      actionPolarity: 'affirmative',
      actionModality: 'request',
      actionSlots: [],
    };

    expect(
      service.retrieve({
        intent: actionIntent,
        // ami-brain-unit-only: deterministic action binding contract, not a product-eval input.
        question: '把舒缓修护面膜调到二店',
        context,
        cards: [transfer, purchase],
        readOnlyOnly: false,
        maxRisk: 'high',
        actionDefinition,
      }),
    ).toMatchObject({
      status: 'selected',
      selected: { key: 'purchase_order_draft' },
      reason: 'action_binding_selected',
    });

    for (const actionModality of ['proposal', 'confirm', 'schedule', 'cancel_request'] as const) {
      expect(
        service.retrieve({
          intent: { ...actionIntent, actionModality },
          // ami-brain-unit-only: action modality routing contract, not a product-eval input.
          question: '确认、定时或撤销既有采购动作',
          context,
          cards: [purchase],
          readOnlyOnly: false,
          maxRisk: 'high',
          actionDefinition,
        }),
      ).toMatchObject({ status: 'none', reason: 'action_modality_requires_dedicated_flow' });
    }

    expect(
      service.retrieve({
        intent: { ...actionIntent, actionPolarity: 'negated' },
        // ami-brain-unit-only: deterministic negative-action execution guard, not a product-eval input.
        question: '别下采购单',
        context,
        cards: [purchase],
        readOnlyOnly: false,
        maxRisk: 'high',
        actionDefinition,
      }),
    ).toMatchObject({ status: 'none', reason: 'action_polarity_not_executable' });
  });

  it('fails closed when an action binding is missing or lacks the reverse action definition reference', () => {
    const actionRef = {
      definitionType: 'action' as const,
      definitionKey: 'action.create_purchase_order',
      definitionVersion: 1,
      definitionFingerprint,
      sourceFingerprint,
    };
    const actionDefinition: BusinessActionDefinitionSnapshot = {
      definitionKey: actionRef.definitionKey,
      version: actionRef.definitionVersion,
      definitionFingerprint: actionRef.definitionFingerprint,
      sourceFingerprint: actionRef.sourceFingerprint,
      domain: 'inventory',
      actionKey: actionRef.definitionKey,
      name: '创建采购单',
      aliases: ['下采购单'],
      description: '创建采购单预览',
      actionClass: 'create',
      targetEntityRefs: ['entity.product'],
      inputSlots: [],
      preconditions: [],
      preconditionPredicateRefs: [],
      effects: ['purchase_order_created'],
      effectAssertionRefs: [{ key: 'purchase_order_created', version: 1, fingerprint: 'd'.repeat(64) }],
      lexicalFrame: createTestBusinessActionLexicalFrame({
        actionKey: actionRef.definitionKey,
        name: '创建采购单',
        aliases: ['下采购单'],
        inputSlots: [],
      }),
      situationContext: createTestBusinessActionSituationContextProfile(actionRef.definitionKey),
      modalityPolicy: createTestBusinessActionModalityPolicy(actionRef.definitionKey),
      informationArtifact: createTestBusinessActionInformationArtifactProfile(actionRef.definitionKey),
      sideEffectInvariant: createTestBusinessActionSideEffectInvariantProfile(actionRef.definitionKey, {
        effects: ['purchase_order_created'],
        effectAssertionRefs: [{ key: 'purchase_order_created', version: 1, fingerprint: 'd'.repeat(64) }],
      }),
      triggeredByEventRefs: [],
      emitsEventRefs: [],
      riskPolicy: 'high',
      confirmationPolicy: 'required',
      idempotencyPolicy: 'required',
      capabilityBindings: [
        {
          capabilityKey: 'purchase_order_draft',
          bindingMode: 'preview_and_execute',
          gatewayActionKey: 'create_purchase_order',
          priority: 0,
          enabled: true,
        },
      ],
      bindingFingerprint: 'c'.repeat(64),
    };
    const actionIntent = {
      ...intent({ domain: 'inventory', intent: 'action' }),
      schemaVersion: '1.1',
      answerShape: 'action_preview',
      actionRef,
      actionPolarity: 'affirmative',
      actionModality: 'request',
      actionSlots: [],
    } as BrainSemanticIntent;
    const cardWithoutActionRef = card('purchase_order_draft', {
      name: '采购单预览',
      domain: 'inventory',
      intent: 'action',
      refs: ['entity.product'],
      synonyms: [],
      examples: [],
      readOnly: false,
      riskLevel: 'high',
    });

    expect(
      service.retrieve({
        intent: actionIntent,
        // ami-brain-unit-only: reverse-definition binding contract, not a product-eval input.
        question: '下采购单',
        context,
        cards: [cardWithoutActionRef],
        readOnlyOnly: false,
        maxRisk: 'high',
        actionDefinition,
      }),
    ).toMatchObject({ status: 'none', reason: 'action_binding_not_published' });
  });

  it('does not select a preview-only binding for a confirmable chat action', () => {
    const actionRef = {
      definitionType: 'action' as const,
      definitionKey: 'action.create_purchase_order',
      definitionVersion: 1,
      definitionFingerprint,
      sourceFingerprint,
    };
    const purchase = card('purchase_order_draft', {
      name: '采购单预览',
      domain: 'inventory',
      intent: 'action',
      refs: [actionRef.definitionKey, 'entity.product'],
      synonyms: [],
      examples: [],
      readOnly: false,
      riskLevel: 'high',
    });
    const actionDefinition: BusinessActionDefinitionSnapshot = {
      definitionKey: actionRef.definitionKey,
      version: 1,
      definitionFingerprint,
      sourceFingerprint,
      domain: 'inventory',
      actionKey: actionRef.definitionKey,
      name: '创建采购单',
      aliases: ['下采购单'],
      description: '仅允许生成不可执行的采购预览',
      actionClass: 'create',
      targetEntityRefs: ['entity.product'],
      inputSlots: [],
      preconditions: [],
      preconditionPredicateRefs: [],
      effects: [],
      effectAssertionRefs: [],
      lexicalFrame: createTestBusinessActionLexicalFrame({
        actionKey: actionRef.definitionKey,
        name: '创建采购单',
        aliases: ['下采购单'],
        inputSlots: [],
      }),
      situationContext: createTestBusinessActionSituationContextProfile(actionRef.definitionKey),
      modalityPolicy: createTestBusinessActionModalityPolicy(actionRef.definitionKey),
      informationArtifact: createTestBusinessActionInformationArtifactProfile(actionRef.definitionKey),
      sideEffectInvariant: createTestBusinessActionSideEffectInvariantProfile(actionRef.definitionKey),
      triggeredByEventRefs: [],
      emitsEventRefs: [],
      riskPolicy: 'high',
      confirmationPolicy: 'required',
      idempotencyPolicy: 'required',
      capabilityBindings: [
        {
          capabilityKey: 'purchase_order_draft',
          bindingMode: 'preview_only',
          gatewayActionKey: 'create_purchase_order',
          priority: 0,
          enabled: true,
        },
      ],
      bindingFingerprint: 'c'.repeat(64),
    };
    const actionIntent = {
      ...intent({ domain: 'inventory', intent: 'action' }),
      schemaVersion: '1.1',
      answerShape: 'action_preview',
      actionRef,
      actionPolarity: 'affirmative',
      actionModality: 'request',
      actionSlots: [],
    } as BrainSemanticIntent;

    expect(
      service.retrieve({
        intent: actionIntent,
        // ami-brain-unit-only: preview-only binding contract, not a product-eval input.
        question: '下采购单',
        context,
        cards: [purchase],
        readOnlyOnly: false,
        maxRisk: 'high',
        actionDefinition,
      }),
    ).toMatchObject({ status: 'none', reason: 'action_binding_not_published' });
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
