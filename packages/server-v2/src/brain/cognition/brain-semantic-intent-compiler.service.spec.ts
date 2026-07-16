import { MODULE_METADATA } from '@nestjs/common/constants';
import { AiModule } from '../../ai/ai.module.js';
import {
  AiStructuredOutputError,
  type AiService,
  type AiStructuredOutputInput,
  type AiStructuredOutputResult,
} from '../../ai/ai.service.js';
import { BrainModule } from '../brain.module.js';
import type { BrainRuntimeConfigService } from '../config/brain-runtime-config.service.js';
import { BRAIN_SEMANTIC_INTENT_SYSTEM_PROMPT } from './brain-semantic-intent-compiler.prompt.js';
import {
  BrainSemanticIntentCompilerService,
  type BrainSemanticIntentCompilerInput,
} from './brain-semantic-intent-compiler.service.js';
import {
  BRAIN_SEMANTIC_INTENT_MODEL_JSON_SCHEMA,
  BRAIN_SEMANTIC_INTENT_PROMPT_SCHEMA,
} from './brain-semantic-intent.schema.js';
import type { BrainSemanticIntent } from './brain-semantic-intent.types.js';
import type { ProductionReadyBusinessDefinitionSnapshot } from './business-definition-snapshot.types.js';
import { BrainTimeRangeParserService } from './brain-time-range-parser.service.js';

const productEntityRef = {
  definitionType: 'entity',
  definitionKey: 'entity.product',
  definitionVersion: 3,
  definitionFingerprint: '1'.repeat(64),
  sourceFingerprint: '2'.repeat(64),
} as const;

const productSalesMetricRef = {
  definitionType: 'metric',
  definitionKey: 'metric.product_sales_amount',
  definitionVersion: 2,
  definitionFingerprint: '3'.repeat(64),
  sourceFingerprint: '4'.repeat(64),
} as const;

const productDimensionRef = {
  definitionType: 'dimension',
  definitionKey: 'dimension.product',
  definitionVersion: 4,
  definitionFingerprint: '5'.repeat(64),
  sourceFingerprint: '6'.repeat(64),
} as const;

const paidAmountMetricRef = {
  definitionType: 'metric',
  definitionKey: 'metric.paid_amount',
  definitionVersion: 8,
  definitionFingerprint: '7'.repeat(64),
  sourceFingerprint: '8'.repeat(64),
} as const;

const refundAmountMetricRef = {
  definitionType: 'metric',
  definitionKey: 'metric.refund_amount',
  definitionVersion: 1,
  definitionFingerprint: '9'.repeat(64),
  sourceFingerprint: 'a'.repeat(64),
} as const;

const stockRiskMetricRef = {
  definitionType: 'metric',
  definitionKey: 'metric.stock_risk_score',
  definitionVersion: 6,
  definitionFingerprint: 'b'.repeat(64),
  sourceFingerprint: 'c'.repeat(64),
} as const;

const productNameDimensionRef = {
  definitionType: 'dimension',
  definitionKey: 'dimension.productName',
  definitionVersion: 4,
  definitionFingerprint: 'd'.repeat(64),
  sourceFingerprint: 'e'.repeat(64),
} as const;

const productRankingIntent: BrainSemanticIntent = {
  schemaVersion: '1.0',
  objective: '按商品汇总销售额并从高到低排名',
  domains: ['product_sales'],
  intent: 'ranking',
  entities: [
    {
      entityType: 'product',
      mention: '商品',
      source: 'user',
      definitionRef: productEntityRef,
      confidence: 0.98,
    },
  ],
  metrics: [productSalesMetricRef],
  dimensions: [productDimensionRef],
  filters: [],
  timeRange: { preset: 'this_month', label: '本月', timezone: 'Asia/Shanghai' },
  orderBy: [{ definitionRef: productSalesMetricRef, direction: 'desc' }],
  limit: 10,
  answerShape: 'ranking',
  successCriteria: ['返回商品销售额降序排行'],
  ambiguities: [],
  missingSlots: [],
  assumptions: [],
  confidence: 0.96,
  decisionSummary: '用户要查看商品销售排行。',
};

const draftIntent: BrainSemanticIntent = {
  schemaVersion: '1.0',
  objective: '起草一条提醒客户预约的消息',
  domains: ['customer_service'],
  intent: 'draft',
  entities: [],
  metrics: [],
  dimensions: [],
  filters: [],
  orderBy: [],
  answerShape: 'draft',
  successCriteria: ['输出可供员工审核的预约提醒文案'],
  ambiguities: [],
  missingSlots: [],
  assumptions: [],
  confidence: 0.95,
  decisionSummary: '用户要起草预约提醒，不是在查询预约数量。',
};

const ontologySnapshot: ProductionReadyBusinessDefinitionSnapshot = {
  productionReady: true,
  fingerprint: 'ontology-snapshot-v7',
  entities: [
    {
      definitionKey: productEntityRef.definitionKey,
      version: productEntityRef.definitionVersion,
      definitionFingerprint: productEntityRef.definitionFingerprint,
      sourceFingerprint: productEntityRef.sourceFingerprint,
      domain: 'product_sales',
      entityKey: 'product',
      name: '商品',
      aliases: ['货品', '产品'],
      attributes: { category: true },
      tableMap: { model: 'SensitiveProductTable' },
    },
  ],
  relations: [],
  metrics: [
    {
      definitionKey: productSalesMetricRef.definitionKey,
      version: productSalesMetricRef.definitionVersion,
      definitionFingerprint: productSalesMetricRef.definitionFingerprint,
      sourceFingerprint: productSalesMetricRef.sourceFingerprint,
      metricKey: 'product_sales_amount',
      name: '商品销售额',
      domain: 'product_sales',
      formula: { sql: 'SUM(secret_amount)' },
      source: { model: 'SensitiveOrderTable' },
      defaultFilters: {},
      permissions: ['store:finance:read'],
      description: '商品实收销售金额',
    },
  ],
  dimensions: [
    {
      definitionKey: productDimensionRef.definitionKey,
      version: productDimensionRef.definitionVersion,
      definitionFingerprint: productDimensionRef.definitionFingerprint,
      sourceFingerprint: productDimensionRef.sourceFingerprint,
      dimensionKey: 'product',
      name: '商品',
      domain: 'product_sales',
      source: { model: 'SensitiveProductTable' },
      permissions: ['store:product:read'],
    },
  ],
};

function compilerInput(question: string): BrainSemanticIntentCompilerInput {
  return {
    question,
    audit: { userId: 9, storeId: 6 },
    timezone: 'Asia/Shanghai',
    role: 'store_manager',
    conversationSlots: {
      lastEntity: 'product',
      lastTimeRange: 'this_month',
      userId: 998,
      nested: { storeId: 6, permissions: ['*'], safeSlot: 'keep-me' },
      user_id: 9,
      store_id: 6,
      permission: 'core:finance:view',
      requiredPermissions: ['*'],
      tenantId: 12,
      tenant: 'tenant-a',
      storeScope: 'all',
      visibleStoreIds: [6, 7],
      deniedPermissions: ['core:finance:view'],
      permissionCodes: ['*'],
      user: { id: 9 },
      store: { id: 6 },
      role: 'super_admin',
    },
    ontologySnapshot,
    ontologyCandidates: [],
    metricRefs: [productSalesMetricRef],
    dimensionRefs: [productDimensionRef],
    capabilitySummaries: [
      {
        key: 'product.sales.ranking',
        name: '商品销售排行',
        description: '按商品汇总并排序销售表现',
        domains: ['product_sales'],
        intents: ['ranking'],
        examples: ['本月商品销售排行'],
        readOnly: true,
      },
    ],
  };
}

function fakeAiService(
  generate: (input: AiStructuredOutputInput) => Promise<AiStructuredOutputResult<BrainSemanticIntent>>,
) {
  return {
    generateStructured: jest.fn(generate),
  } as unknown as AiService;
}

function structuredResult(data: BrainSemanticIntent): AiStructuredOutputResult<BrainSemanticIntent> {
  return {
    data,
    rawText: JSON.stringify(data),
    provider: 'fake-provider',
    model: 'fake-model',
    usage: {
      provider: 'fake-provider',
      model: 'fake-model',
      inputTokens: 120,
      outputTokens: 80,
    },
  };
}

function createCompiler(aiService: AiService) {
  const config = {
    runtime: { modelTimeoutMs: 4321 },
  } as BrainRuntimeConfigService;
  return new BrainSemanticIntentCompilerService(aiService, config, new BrainTimeRangeParserService());
}

describe('BrainSemanticIntentCompilerService', () => {
  it.each(['本月商品销售排行', '哪些货卖得最好'])(
    'compiles product ranking paraphrase into the same governed semantic intent: %s',
    async (question) => {
      const aiService = fakeAiService(async () => structuredResult(productRankingIntent));
      const compiler = createCompiler(aiService);

      const result = await compiler.compile(compilerInput(question));

      expect(result).toMatchObject({
        status: 'completed',
        intent: productRankingIntent,
        provider: 'fake-provider',
        model: 'fake-model',
      });
      const request = (aiService.generateStructured as jest.Mock).mock.calls[0][0] as AiStructuredOutputInput;
      expect(request.messages[1].content).toContain(question);
    },
  );

  it('hydrates compact model definition keys from the published Ontology snapshot', async () => {
    const compactIntent = {
      ...productRankingIntent,
      intent: ['ranking', 'query'],
      answerShape: ['ranking', 'list'],
      entities: productRankingIntent.entities.map((entity) => ({
        ...entity,
        source: 'question',
        definitionRef: { definitionType: 'entity', definitionKey: productEntityRef.definitionKey },
      })),
      metrics: [{ definitionType: 'metric', definitionKey: productSalesMetricRef.definitionKey }],
      dimensions: [{ definitionType: 'dimension', definitionKey: productDimensionRef.definitionKey }],
      orderBy: [{
        definitionRef: { definitionType: 'metric', definitionKey: productSalesMetricRef.definitionKey },
        direction: 'desc',
      }],
    } as unknown as BrainSemanticIntent;
    const compiler = createCompiler(fakeAiService(async () => structuredResult(compactIntent)));

    const result = await compiler.compile(compilerInput('本月商品销售排行'));

    expect(result).toMatchObject({
      status: 'completed',
      intent: {
        intent: 'ranking',
        answerShape: 'ranking',
        entities: [expect.objectContaining({ source: 'user', definitionRef: productEntityRef })],
        metrics: [productSalesMetricRef],
        dimensions: [productDimensionRef],
        orderBy: [{ definitionRef: productSalesMetricRef, direction: 'desc' }],
      },
    });
  });

  it('keeps appointment reminder copy as draft intent without appointment_count metric', async () => {
    const aiService = fakeAiService(async () => structuredResult(draftIntent));
    const compiler = createCompiler(aiService);

    const result = await compiler.compile(compilerInput('写一条提醒客户预约消息'));

    expect(result.status).toBe('completed');
    if (result.status === 'completed') {
      expect(result.intent.intent).toBe('draft');
      expect(result.intent.answerShape).toBe('draft');
      expect(result.intent.metrics).toEqual([]);
      expect(result.intent.metrics.some((ref) => ref.definitionKey === 'appointment_count')).toBe(false);
    }
  });

  it('fills an explicit question time range and removes a false model missing slot', async () => {
    const modelIntent: BrainSemanticIntent = {
      ...productRankingIntent,
      timeRange: undefined,
      missingSlots: ['timeRange'],
    };
    const compiler = createCompiler(fakeAiService(async () => structuredResult(modelIntent)));

    const result = await compiler.compile(compilerInput('本月商品销售排行'));

    expect(result).toMatchObject({
      status: 'completed',
      intent: {
        timeRange: { preset: 'this_month', label: '本月', timezone: 'Asia/Shanghai' },
        missingSlots: [],
      },
    });
  });

  it('removes a natural-language time missing slot when the intent already contains a governed range', async () => {
    const modelIntent: BrainSemanticIntent = {
      ...productRankingIntent,
      timeRange: {
        label: '最近30天',
        timezone: 'Asia/Shanghai',
        startDate: '2026-06-17',
        endDate: '2026-07-16',
      },
      missingSlots: ['用户未指定时间范围，默认使用最近周期（如本月）'],
    };
    const compiler = createCompiler(fakeAiService(async () => structuredResult(modelIntent)));

    const result = await compiler.compile(compilerInput('最近卖得最好的产品是什么'));

    expect(result).toMatchObject({
      status: 'completed',
      intent: {
        timeRange: { label: '最近30天', timezone: 'Asia/Shanghai' },
        missingSlots: [],
      },
    });
  });

  it('removes a time ambiguity after a deterministic inactivity threshold was resolved', async () => {
    const modelIntent: BrainSemanticIntent = {
      ...productRankingIntent,
      objective: '统计45天未到店客户',
      intent: 'query',
      metrics: [],
      dimensions: [],
      orderBy: [],
      answerShape: 'scalar',
      timeRange: undefined,
      ambiguities: [{ slot: 'timeRange', reason: '需要确认时间基准', candidates: ['当前时间', '指定日期'] }],
      missingSlots: ['timeRange'],
    };
    const compiler = createCompiler(fakeAiService(async () => structuredResult(modelIntent)));

    const result = await compiler.compile(compilerInput('帮我找一下45天没来的客户，大概有多少人'));

    expect(result).toMatchObject({
      status: 'completed',
      intent: {
        timeRange: { label: '45天未活跃阈值', timezone: 'Asia/Shanghai' },
        ambiguities: [],
        missingSlots: [],
      },
    });
  });

  it('materializes explicit current and previous periods after the model identifies a comparison', async () => {
    const modelIntent: BrainSemanticIntent = {
      ...productRankingIntent,
      objective: '找出本周与上周销售额差距最大的日期',
      intent: 'comparison',
      answerShape: 'comparison',
      timeRange: undefined,
      comparisonTarget: undefined,
      missingSlots: ['comparisonTarget', 'timeRange'],
    };
    const compiler = createCompiler(fakeAiService(async () => structuredResult(modelIntent)));

    const result = await compiler.compile(compilerInput('本周跟上周比，哪天销售额差距最大'));

    expect(result).toMatchObject({
      status: 'completed',
      intent: {
        timeRange: { preset: 'this_week', label: '本周', timezone: 'Asia/Shanghai' },
        comparisonTarget: {
          type: 'time',
          timeRange: { preset: 'last_week', label: '上周', timezone: 'Asia/Shanghai' },
        },
        missingSlots: [],
      },
    });
  });

  it('aligns a query intent with its model-selected diagnosis shape and referenced definition domains', async () => {
    const modelIntent: BrainSemanticIntent = {
      ...productRankingIntent,
      intent: 'query',
      domains: ['finance'],
      answerShape: 'diagnosis',
      orderBy: [],
    };
    const compiler = createCompiler(fakeAiService(async () => structuredResult(modelIntent)));

    const result = await compiler.compile(compilerInput('本月商品经营情况有什么异常'));

    expect(result).toMatchObject({
      status: 'completed',
      intent: {
        intent: 'diagnosis',
        domains: expect.arrayContaining(['finance', 'product_sales']),
      },
    });
  });

  it('materializes the governed usual baseline for an average-ticket comparison', async () => {
    const modelIntent: BrainSemanticIntent = {
      ...productRankingIntent,
      intent: 'comparison',
      metrics: [],
      dimensions: [],
      orderBy: [],
      answerShape: 'comparison',
      comparisonTarget: undefined,
    };
    const compiler = createCompiler(fakeAiService(async () => structuredResult(modelIntent)));

    const result = await compiler.compile(compilerInput('今天客单价多少，跟平时比怎么样'));

    expect(result).toMatchObject({
      status: 'completed',
      intent: {
        timeRange: { preset: 'today', label: '今天', timezone: 'Asia/Shanghai' },
        comparisonTarget: {
          type: 'time',
          timeRange: {
            label: '最近30个完整自然日',
            timezone: 'Asia/Shanghai',
            startDate: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
            endDate: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
          },
        },
      },
    });
  });

  it('removes internal ambiguities for an exact governed capability example', async () => {
    const modelIntent: BrainSemanticIntent = {
      ...productRankingIntent,
      intent: 'query',
      metrics: [],
      dimensions: [],
      orderBy: [],
      answerShape: 'scalar',
      ambiguities: [{
        slot: '到店定义',
        reason: '需要确认到店定义',
        candidates: ['预约签到', '订单创建'],
      }],
    };
    const input = compilerInput('今天来了几个客人，现在还有几个在店');
    input.capabilitySummaries = [{
      key: 'store_operations_overview',
      name: '店长经营概览',
      description: '包含预约到店和当前在店人数',
      domains: ['reservation'],
      intents: ['query'],
      examples: ['今天来了几个客人，现在还有几个在店'],
      readOnly: true,
    }];
    const compiler = createCompiler(fakeAiService(async () => structuredResult(modelIntent)));

    const result = await compiler.compile(input);

    expect(result).toMatchObject({ status: 'completed', intent: { ambiguities: [] } });
  });

  it('adds a governed descending order when ranking has one metric and no explicit order', async () => {
    const modelIntent: BrainSemanticIntent = {
      ...productRankingIntent,
      orderBy: [],
      missingSlots: ['orderBy'],
    };
    const compiler = createCompiler(fakeAiService(async () => structuredResult(modelIntent)));

    const result = await compiler.compile(compilerInput('本月商品销售排行'));

    expect(result).toMatchObject({
      status: 'completed',
      intent: {
        orderBy: [{ definitionRef: productRankingIntent.metrics[0], direction: 'desc' }],
        missingSlots: [],
      },
    });
  });

  it('passes validator repair feedback to the governed model context', async () => {
    const aiService = fakeAiService(async () => structuredResult(productRankingIntent));
    const compiler = createCompiler(aiService);
    const input = compilerInput('本月商品销售排行');
    input.repairFeedback = {
      previousIntent: productRankingIntent,
      issues: [{ code: 'UNKNOWN_DOMAIN', slot: 'domain', message: 'Domain service is not active.' }],
    };

    await compiler.compile(input);

    const request = (aiService.generateStructured as jest.Mock).mock.calls[0][0] as AiStructuredOutputInput;
    expect(request.messages[1].content).toContain('repairFeedback');
    expect(request.messages[1].content).toContain('UNKNOWN_DOMAIN');
  });

  it('removes a fabricated key from a generic ontology entity mention', async () => {
    const modelIntent: BrainSemanticIntent = {
      ...productRankingIntent,
      entities: [{ ...productRankingIntent.entities[0], entityKey: 'product-unknown' }],
    };
    const compiler = createCompiler(fakeAiService(async () => structuredResult(modelIntent)));

    const result = await compiler.compile(compilerInput('本月商品销售排行'));

    expect(result.status).toBe('completed');
    if (result.status === 'completed') expect(result.intent.entities[0].entityKey).toBeUndefined();
  });

  it('never treats an ontology type key as a resolved business instance', async () => {
    const modelIntent: BrainSemanticIntent = {
      ...productRankingIntent,
      entities: [{ ...productRankingIntent.entities[0], mention: '低库存产品', entityKey: 'product' }],
    };
    const compiler = createCompiler(fakeAiService(async () => structuredResult(modelIntent)));

    const result = await compiler.compile(compilerInput('现在哪些产品库存不够了'));

    expect(result.status).toBe('completed');
    if (result.status === 'completed') expect(result.intent.entities[0].entityKey).toBeUndefined();
  });

  it('drops only a redundant governed-entity identity filter emitted by the model', async () => {
    const modelIntent: BrainSemanticIntent = {
      ...productRankingIntent,
      entities: [{ ...productRankingIntent.entities[0], mention: '抗衰眼霜', entityKey: '抗衰眼霜' }],
      filters: [{
        fieldRef: {
          definitionType: 'field',
          definitionKey: 'field.product_name',
          definitionVersion: 1,
          definitionFingerprint: '7'.repeat(64),
          sourceFingerprint: '8'.repeat(64),
        },
        operator: 'eq',
        value: '抗衰眼霜',
      }],
    };
    const compiler = createCompiler(fakeAiService(async () => structuredResult(modelIntent)));

    const result = await compiler.compile(compilerInput('本月抗衰眼霜销售排行'));

    expect(result.status).toBe('completed');
    if (result.status === 'completed') expect(result.intent.filters).toEqual([]);
  });

  it('drops ungoverned field filters and treats an unordered list as query rather than ranking', async () => {
    const modelIntent: BrainSemanticIntent = {
      ...productRankingIntent,
      objective: '列出库存不足的产品',
      intent: 'ranking',
      metrics: [],
      orderBy: [],
      answerShape: 'list',
      filters: [{
        fieldRef: {
          definitionType: 'field',
          definitionKey: 'field.product_stock_quantity',
          definitionVersion: 1,
          definitionFingerprint: '7'.repeat(64),
          sourceFingerprint: '8'.repeat(64),
        },
        operator: 'lt',
        value: 10,
      }],
    };
    const compiler = createCompiler(fakeAiService(async () => structuredResult(modelIntent)));

    const result = await compiler.compile(compilerInput('现在哪些产品库存不够了'));

    expect(result.status).toBe('completed');
    if (result.status === 'completed') {
      expect(result.intent).toMatchObject({ intent: 'query', answerShape: 'list', filters: [], orderBy: [] });
    }
  });

  it('keeps an exact customer fact lookup executable without a second field-definition registry', async () => {
    const customerRef = {
      definitionType: 'entity' as const,
      definitionKey: 'entity.customer',
      definitionVersion: 1,
      definitionFingerprint: '9'.repeat(64),
      sourceFingerprint: 'a'.repeat(64),
    };
    const modelIntent: BrainSemanticIntent = {
      ...draftIntent,
      objective: '查询客户张三的姓名',
      domains: ['customer'],
      intent: 'query',
      answerShape: 'list',
      entities: [{
        entityType: 'customer',
        entityKey: 'customer:zhang-san',
        mention: '张三',
        source: 'user',
        confidence: 0.98,
      }],
      filters: [{
        fieldRef: {
          definitionType: 'field',
          definitionKey: 'field.customer_name',
          definitionVersion: 1,
          definitionFingerprint: 'b'.repeat(64),
          sourceFingerprint: 'c'.repeat(64),
        },
        operator: 'eq',
        value: '张三',
      }],
      ambiguities: [{
        slot: 'entity.customer.identity',
        reason: '可能存在重名客户',
        candidates: ['张三'],
      }],
      missingSlots: ['customer_field'],
    };
    const input = compilerInput('查询客户张三的姓名');
    input.ontologySnapshot = {
      ...ontologySnapshot,
      entities: [...ontologySnapshot.entities, {
        definitionKey: customerRef.definitionKey,
        version: customerRef.definitionVersion,
        definitionFingerprint: customerRef.definitionFingerprint,
        sourceFingerprint: customerRef.sourceFingerprint,
        domain: 'customer',
        entityKey: 'customer',
        name: '客户',
        aliases: ['顾客'],
        attributes: {},
        tableMap: { model: 'Customer' },
      }],
    };
    const compiler = createCompiler(fakeAiService(async () => structuredResult(modelIntent)));

    const result = await compiler.compile(input);

    expect(result.status).toBe('completed');
    if (result.status === 'completed') {
      expect(result.intent.filters).toEqual([]);
      expect(result.intent.ambiguities).toEqual([]);
      expect(result.intent.missingSlots).toEqual([]);
      expect(result.intent.entities[0].definitionRef).toEqual(customerRef);
    }
  });

  it('sends governed context, canonical schema, scenario and configured timeout to AiService', async () => {
    const aiService = fakeAiService(async () => structuredResult(productRankingIntent));
    const compiler = createCompiler(aiService);

    await compiler.compile(compilerInput('本月商品销售排行'));

    expect(aiService.generateStructured).toHaveBeenCalledTimes(1);
    const request = (aiService.generateStructured as jest.Mock).mock.calls[0][0] as AiStructuredOutputInput;
    expect(request.scenario).toBe('brain.semantic_intent.v1');
    expect(request.schema).toBe(BRAIN_SEMANTIC_INTENT_MODEL_JSON_SCHEMA);
    expect(request.promptSchema).toBe(BRAIN_SEMANTIC_INTENT_PROMPT_SCHEMA);
    expect(request.timeoutMs).toBe(4321);
    expect(request.userId).toBe(9);
    expect(request.storeId).toBe(6);
    expect(request.repairMessages).toBeDefined();
    expect(request.allowFallback).toBe(true);
    expect(request.fallbackMessages).toEqual(request.messages);
    const serializedMessages = JSON.stringify(request.messages);
    expect(serializedMessages).toContain('store_manager');
    expect(serializedMessages).toContain('Asia/Shanghai');
    expect(serializedMessages).toContain('lastEntity');
    expect(request.messages[1].content).toContain('safeSlot');
    expect(request.messages[1].content).not.toContain('"userId"');
    expect(request.messages[1].content).not.toContain('"storeId"');
    expect(request.messages[1].content).not.toContain('"permissions"');
    expect(request.messages[1].content).not.toContain('"user_id"');
    expect(request.messages[1].content).not.toContain('"store_id"');
    expect(request.messages[1].content).not.toContain('"requiredPermissions"');
    expect(request.messages[1].content).not.toContain('"tenantId"');
    expect(request.messages[1].content).not.toContain('"tenant"');
    expect(request.messages[1].content).not.toContain('"storeScope"');
    expect(request.messages[1].content).not.toContain('"visibleStoreIds"');
    expect(request.messages[1].content).not.toContain('"deniedPermissions"');
    expect(request.messages[1].content).not.toContain('"permissionCodes"');
    const modelContext = JSON.parse(request.messages[1].content.split('\n').slice(1).join('\n')) as Record<string, any>;
    expect(modelContext.role).toBe('store_manager');
    expect(modelContext).not.toHaveProperty('audit');
    expect(modelContext.conversationSlots).not.toHaveProperty('role');
    expect(serializedMessages).toContain(productEntityRef.definitionKey);
    expect(serializedMessages).toContain(productSalesMetricRef.definitionKey);
    expect(serializedMessages).toContain(productDimensionRef.definitionKey);
    expect(serializedMessages).toContain('product.sales.ranking');
    expect(serializedMessages).toContain(ontologySnapshot.fingerprint);
    expect(serializedMessages).not.toContain('SensitiveProductTable');
    expect(serializedMessages).not.toContain('SensitiveOrderTable');
    expect(serializedMessages).not.toContain('store:finance:read');
    expect(serializedMessages).not.toContain('secret_amount');
  });

  it('states the semantic compiler safety boundaries in the system prompt', () => {
    expect(BRAIN_SEMANTIC_INTENT_SYSTEM_PROMPT).toContain('只理解用户在问什么');
    expect(BRAIN_SEMANTIC_INTENT_SYSTEM_PROMPT).toContain('definitionKey');
    expect(BRAIN_SEMANTIC_INTENT_SYSTEM_PROMPT).toContain('版本号与指纹由服务端');
    expect(BRAIN_SEMANTIC_INTENT_SYSTEM_PROMPT).toContain('不得创造指标、实体或维度');
    expect(BRAIN_SEMANTIC_INTENT_SYSTEM_PROMPT).toContain('不得输出 SQL 或表名');
    expect(BRAIN_SEMANTIC_INTENT_SYSTEM_PROMPT).toContain('不得决定 userId、storeId、permissions 或 data scope');
    expect(BRAIN_SEMANTIC_INTENT_SYSTEM_PROMPT).toContain('不得输出隐藏推理');
    expect(BRAIN_SEMANTIC_INTENT_SYSTEM_PROMPT).toContain('decisionSummary');
    expect(BRAIN_SEMANTIC_INTENT_SYSTEM_PROMPT).toContain('本月商品销售排行');
    expect(BRAIN_SEMANTIC_INTENT_SYSTEM_PROMPT).toContain('哪些货卖得最好');
    expect(BRAIN_SEMANTIC_INTENT_SYSTEM_PROMPT).toContain('等价');
    expect(BRAIN_SEMANTIC_INTENT_SYSTEM_PROMPT).toContain('comparisonTarget');
  });

  it.each(['SCHEMA_INVALID', 'JSON_INVALID', 'PROVIDER_UNAVAILABLE'] as const)(
    'returns typed unavailable when AiService reports %s',
    async (errorCode) => {
      const aiService = fakeAiService(async () => {
        throw new AiStructuredOutputError(errorCode, `${errorCode} from fake provider`);
      });
      const compiler = createCompiler(aiService);

      await expect(compiler.compile(compilerInput('这个月商品卖得怎么样'))).resolves.toEqual({
        status: 'unavailable',
        errorCode,
        reason: `${errorCode} from fake provider`,
      });
    },
  );

  it('retries one schema-invalid model response before returning unavailable', async () => {
    const aiService = fakeAiService(jest.fn()
      .mockRejectedValueOnce(new AiStructuredOutputError('SCHEMA_INVALID', 'first invalid response'))
      .mockResolvedValueOnce(structuredResult(productRankingIntent)));
    const compiler = createCompiler(aiService);

    await expect(compiler.compile(compilerInput('本月商品销售排行'))).resolves.toMatchObject({
      status: 'completed',
      intent: productRankingIntent,
    });
    expect(aiService.generateStructured).toHaveBeenCalledTimes(2);
    expect((aiService.generateStructured as jest.Mock).mock.calls[1][0].scenario).toBe('brain.semantic_intent.retry1.v1');
  });

  it('shares one absolute deadline across semantic compiler retries', async () => {
    let now = 1_000;
    jest.spyOn(Date, 'now').mockImplementation(() => now);
    const generate = jest.fn()
      .mockImplementationOnce(async () => {
        now = 1_190;
        throw new AiStructuredOutputError('SCHEMA_INVALID', 'first invalid response');
      })
      .mockResolvedValueOnce(structuredResult(productRankingIntent));
    const aiService = fakeAiService(generate);
    const compiler = createCompiler(aiService);
    const input = compilerInput('本月商品销售排行');
    input.deadlineAt = 1_200;

    await expect(compiler.compile(input)).resolves.toMatchObject({ status: 'completed' });

    expect(generate.mock.calls[0][0].timeoutMs).toBe(200);
    expect(generate.mock.calls[1][0].timeoutMs).toBe(10);
  });

  it('does not call the provider after the semantic compiler deadline has expired', async () => {
    jest.spyOn(Date, 'now').mockReturnValue(2_000);
    const aiService = fakeAiService(async () => structuredResult(productRankingIntent));
    const compiler = createCompiler(aiService);
    const input = compilerInput('这个月商品卖得怎么样');
    input.deadlineAt = 1_999;

    await expect(compiler.compile(input)).resolves.toMatchObject({
      status: 'unavailable',
      errorCode: 'BUDGET_EXCEEDED',
    });
    expect(aiService.generateStructured).not.toHaveBeenCalled();
  });

  it('falls back only to an exact read-only governed capability example when the model budget is exhausted', async () => {
    const aiService = fakeAiService(async () => {
      throw new AiStructuredOutputError('BUDGET_EXCEEDED', 'structured budget exhausted');
    });
    const compiler = createCompiler(aiService);
    const input = compilerInput('本月我的服务和业绩怎么样');
    input.role = 'beautician';
    input.capabilitySummaries = [{
      key: 'beautician_service_overview',
      name: '美容师个人服务概览',
      description: '个人服务和业绩',
      domains: ['beautician', 'staff'],
      intents: ['query', 'diagnosis', 'recommendation'],
      examples: ['本月我的服务和业绩怎么样'],
      readOnly: true,
    }];

    await expect(compiler.compile(input)).resolves.toMatchObject({
      status: 'completed',
      provider: 'governed_contract',
      model: 'exact_example_fallback',
      intent: {
        intent: 'diagnosis',
        answerShape: 'diagnosis',
        domains: ['beautician', 'staff'],
        timeRange: { preset: 'this_month', label: '本月', timezone: 'Asia/Shanghai' },
        missingSlots: [],
      },
    });
  });

  it('materializes both periods for an exact governed comparison fallback', async () => {
    const aiService = fakeAiService(async () => {
      throw new AiStructuredOutputError('BUDGET_EXCEEDED', 'structured budget exhausted');
    });
    const compiler = createCompiler(aiService);
    const input = compilerInput('本周跟上周比，哪天差距最大');
    input.role = 'store_manager';
    input.capabilitySummaries = [{
      key: 'store_operations_overview',
      name: '店长经营概览',
      description: '经营周期对比，未指定指标时按实收金额比较',
      domains: ['order', 'payment'],
      intents: ['query', 'comparison', 'diagnosis'],
      examples: ['本周跟上周比，哪天差距最大'],
      readOnly: true,
    }];

    await expect(compiler.compile(input)).resolves.toMatchObject({
      status: 'completed',
      provider: 'governed_contract',
      model: 'exact_example_fallback',
      intent: {
        intent: 'comparison',
        answerShape: 'comparison',
        timeRange: { preset: 'this_week', label: '本周', timezone: 'Asia/Shanghai' },
        comparisonTarget: {
          type: 'time',
          timeRange: { preset: 'last_week', label: '上周', timezone: 'Asia/Shanghai' },
        },
        missingSlots: [],
      },
    });
  });

  it('hydrates governed metric, grouping dimension and ordering for an exact ranking fallback', async () => {
    const aiService = fakeAiService(async () => {
      throw new AiStructuredOutputError('BUDGET_EXCEEDED', 'structured budget exhausted');
    });
    const compiler = createCompiler(aiService);
    const input = compilerInput('本月商品销售排行');
    input.capabilitySummaries = [{
      key: 'product_sales_ranking',
      name: '商品销售排行',
      description: '按商品汇总销量并降序排序',
      domains: ['product_sales'],
      intents: ['ranking'],
      examples: ['本月商品销售排行'],
      readOnly: true,
      definitionRefs: [productEntityRef, productSalesMetricRef],
    }];

    await expect(compiler.compile(input)).resolves.toMatchObject({
      status: 'completed',
      provider: 'governed_contract',
      intent: {
        intent: 'ranking',
        entities: [expect.objectContaining({ entityType: 'product', definitionRef: productEntityRef })],
        metrics: [productSalesMetricRef],
        dimensions: [productDimensionRef],
        orderBy: [{ definitionRef: productSalesMetricRef, direction: 'desc' }],
        missingSlots: [],
      },
    });
  });

  it('executes an exact read-only published example from its frozen contract without calling the model', async () => {
    const aiService = fakeAiService(async () => {
      throw new Error('model must not be called for an exact frozen contract');
    });
    const compiler = createCompiler(aiService);
    const input = compilerInput('本月商品销售排行');
    input.capabilitySummaries[0] = {
      ...input.capabilitySummaries[0],
      definitionRefs: [productEntityRef, productSalesMetricRef],
    };

    await expect(compiler.compile(input)).resolves.toMatchObject({
      status: 'completed',
      provider: 'governed_contract',
      model: 'exact_example_fast_path',
      intent: {
        intent: 'ranking',
        metrics: [productSalesMetricRef],
        dimensions: [productDimensionRef],
      },
    });
    expect(aiService.generateStructured).not.toHaveBeenCalled();
  });

  it('hydrates the paid amount metric for an exact comparison example from published aliases', async () => {
    const aiService = fakeAiService(async () => {
      throw new Error('model must not be called for an exact frozen contract');
    });
    const compiler = createCompiler(aiService);
    const input = compilerInput('今天和昨天比营业额差多少');
    input.ontologySnapshot = {
      ...ontologySnapshot,
      metrics: [
        ...ontologySnapshot.metrics,
        {
          definitionKey: paidAmountMetricRef.definitionKey,
          version: paidAmountMetricRef.definitionVersion,
          definitionFingerprint: paidAmountMetricRef.definitionFingerprint,
          sourceFingerprint: paidAmountMetricRef.sourceFingerprint,
          metricKey: 'paid_amount',
          name: '实收金额',
          aliases: ['实收', '营业额', '营收', '流水'],
          domain: 'payment',
          formula: {},
          source: {},
          defaultFilters: {},
          permissions: [],
          description: '支付成功记录的实收金额',
        },
        {
          definitionKey: refundAmountMetricRef.definitionKey,
          version: refundAmountMetricRef.definitionVersion,
          definitionFingerprint: refundAmountMetricRef.definitionFingerprint,
          sourceFingerprint: refundAmountMetricRef.sourceFingerprint,
          metricKey: 'refund_amount',
          name: '退款金额',
          aliases: ['退款', '退回金额'],
          domain: 'refund',
          formula: {},
          source: {},
          defaultFilters: {},
          permissions: [],
          description: '已完成退款记录的退款金额',
        },
      ],
    };
    input.capabilitySummaries = [{
      key: 'store_operations_overview',
      name: '店长经营概览',
      description: '经营概览与对比',
      domains: ['payment', 'refund'],
      intents: ['query', 'comparison'],
      examples: [input.question],
      readOnly: true,
      definitionRefs: [paidAmountMetricRef, refundAmountMetricRef],
    }];

    await expect(compiler.compile(input)).resolves.toMatchObject({
      status: 'completed',
      model: 'exact_example_fast_path',
      intent: {
        intent: 'comparison',
        metrics: [paidAmountMetricRef],
      },
    });
    expect(aiService.generateStructured).not.toHaveBeenCalled();
  });

  it('hydrates the refund metric for an exact refund example without adding unrelated store metrics', async () => {
    const aiService = fakeAiService(async () => {
      throw new Error('model must not be called for an exact frozen contract');
    });
    const compiler = createCompiler(aiService);
    const input = compilerInput('今天退款有几笔，金额多少');
    input.ontologySnapshot = {
      ...ontologySnapshot,
      metrics: [
        ...ontologySnapshot.metrics,
        {
          definitionKey: paidAmountMetricRef.definitionKey,
          version: paidAmountMetricRef.definitionVersion,
          definitionFingerprint: paidAmountMetricRef.definitionFingerprint,
          sourceFingerprint: paidAmountMetricRef.sourceFingerprint,
          metricKey: 'paid_amount',
          name: '实收金额',
          aliases: ['营业额'],
          domain: 'payment',
          formula: {},
          source: {},
          defaultFilters: {},
          permissions: [],
          description: '支付成功记录的实收金额',
        },
        {
          definitionKey: refundAmountMetricRef.definitionKey,
          version: refundAmountMetricRef.definitionVersion,
          definitionFingerprint: refundAmountMetricRef.definitionFingerprint,
          sourceFingerprint: refundAmountMetricRef.sourceFingerprint,
          metricKey: 'refund_amount',
          name: '退款金额',
          aliases: ['退款', '退回金额'],
          domain: 'refund',
          formula: {},
          source: {},
          defaultFilters: {},
          permissions: [],
          description: '已完成退款记录的退款金额',
        },
      ],
    };
    input.capabilitySummaries = [{
      key: 'store_operations_overview',
      name: '店长经营概览',
      description: '经营概览与退款风险',
      domains: ['payment', 'refund'],
      intents: ['query', 'comparison'],
      examples: [input.question],
      readOnly: true,
      definitionRefs: [paidAmountMetricRef, refundAmountMetricRef],
    }];

    await expect(compiler.compile(input)).resolves.toMatchObject({
      status: 'completed',
      model: 'exact_example_fast_path',
      intent: {
        intent: 'query',
        metrics: [refundAmountMetricRef],
      },
    });
  });

  it('hydrates runtime grouping dimensions for an exact low-stock example', async () => {
    const aiService = fakeAiService(async () => {
      throw new Error('model must not be called for an exact frozen contract');
    });
    const compiler = createCompiler(aiService);
    const input = compilerInput('现在哪些产品库存不够了');
    input.ontologySnapshot = {
      ...ontologySnapshot,
      metrics: [
        ...ontologySnapshot.metrics,
        {
          definitionKey: stockRiskMetricRef.definitionKey,
          version: stockRiskMetricRef.definitionVersion,
          definitionFingerprint: stockRiskMetricRef.definitionFingerprint,
          sourceFingerprint: stockRiskMetricRef.sourceFingerprint,
          metricKey: 'stock_risk_score',
          name: '库存风险评分',
          aliases: ['库存风险', '缺货风险'],
          domain: 'product',
          formula: {},
          source: {},
          defaultFilters: {},
          permissions: [],
          description: '当前库存低于安全库存的缺口数量',
          runtimeQuery: { dimensions: ['productName'] } as never,
        },
      ],
      dimensions: [
        ...ontologySnapshot.dimensions,
        {
          definitionKey: productNameDimensionRef.definitionKey,
          version: productNameDimensionRef.definitionVersion,
          definitionFingerprint: productNameDimensionRef.definitionFingerprint,
          sourceFingerprint: productNameDimensionRef.sourceFingerprint,
          dimensionKey: 'productName',
          name: '商品名称',
          aliases: ['商品', '产品名称'],
          domain: 'product',
          source: {},
          permissions: [],
        },
      ],
    };
    input.capabilitySummaries = [{
      key: 'inventory_operations_overview',
      name: '库存运营概览',
      description: '低库存和临期风险',
      domains: ['product'],
      intents: ['query', 'diagnosis', 'ranking'],
      examples: [input.question],
      readOnly: true,
      definitionRefs: [stockRiskMetricRef],
    }];

    await expect(compiler.compile(input)).resolves.toMatchObject({
      status: 'completed',
      model: 'exact_example_fast_path',
      intent: {
        metrics: [stockRiskMetricRef],
        dimensions: [productNameDimensionRef],
      },
    });
  });

  it('recognizes an exact governed superlative top-N example as ranking during budget fallback', async () => {
    const aiService = fakeAiService(async () => {
      throw new AiStructuredOutputError('BUDGET_EXCEEDED', 'structured budget exhausted');
    });
    const compiler = createCompiler(aiService);
    const question = '本月1日至31日，本店服务次数最多的前5个项目';
    const input = compilerInput(question);
    input.capabilitySummaries = [{
      key: 'project_service_ranking',
      name: '项目服务次数排行',
      description: '按项目汇总服务次数并降序排序',
      domains: ['project', 'order'],
      intents: ['ranking'],
      examples: [question],
      readOnly: true,
    }];

    await expect(compiler.compile(input)).resolves.toMatchObject({
      status: 'completed',
      provider: 'governed_contract',
      model: 'exact_example_fallback',
      intent: {
        intent: 'ranking',
        answerShape: 'ranking',
        missingSlots: [],
      },
    });
  });

  it('uses the exact governed fast path before either model provider is needed', async () => {
    const aiService = fakeAiService(async () => {
      throw new AiStructuredOutputError('PROVIDER_UNAVAILABLE', 'all providers unavailable');
    });
    const compiler = createCompiler(aiService);
    const input = compilerInput('本月商品销售排行');
    input.capabilitySummaries = [{
      key: 'product_sales_ranking',
      name: '商品销售排行',
      description: '按商品汇总销量并降序排序',
      domains: ['product_sales'],
      intents: ['ranking'],
      examples: ['本月商品销售排行'],
      readOnly: true,
      definitionRefs: [productEntityRef, productSalesMetricRef],
    }];

    await expect(compiler.compile(input)).resolves.toMatchObject({
      status: 'completed',
      provider: 'governed_contract',
      model: 'exact_example_fast_path',
      intent: {
        metrics: [productSalesMetricRef],
        dimensions: [productDimensionRef],
        orderBy: [{ definitionRef: productSalesMetricRef, direction: 'desc' }],
      },
    });
  });

  it('does not use governed fallback for a paraphrase when the model budget is exhausted', async () => {
    const aiService = fakeAiService(async () => {
      throw new AiStructuredOutputError('BUDGET_EXCEEDED', 'structured budget exhausted');
    });
    const compiler = createCompiler(aiService);

    await expect(compiler.compile(compilerInput('这个月商品卖得怎么样'))).resolves.toEqual({
      status: 'unavailable',
      errorCode: 'BUDGET_EXCEEDED',
      reason: 'structured budget exhausted',
    });
  });

  it('returns MODEL_UNAVAILABLE for an untyped model failure without fabricating intent', async () => {
    const aiService = fakeAiService(async () => {
      throw new Error('model connection reset');
    });
    const compiler = createCompiler(aiService);

    await expect(compiler.compile(compilerInput('本月商品销售排行'))).resolves.toEqual({
      status: 'unavailable',
      errorCode: 'MODEL_UNAVAILABLE',
      reason: 'model connection reset',
    });
  });

  it('uses a PII-masked context for the single structured repair request', async () => {
    const aiService = fakeAiService(async () => structuredResult(draftIntent));
    const compiler = createCompiler(aiService);

    await compiler.compile(compilerInput('请联系 13800138000 或 owner@example.com 提醒预约'));

    const request = (aiService.generateStructured as jest.Mock).mock.calls[0][0] as AiStructuredOutputInput;
    const repairText = JSON.stringify(request.repairMessages);
    expect(repairText).toContain('***');
    expect(repairText).not.toContain('13800138000');
    expect(repairText).not.toContain('owner@example.com');
    expect(JSON.stringify(request.messages)).toContain('13800138000');
  });

  it('fails closed without calling AI for cyclic or oversized governed context', async () => {
    const aiService = fakeAiService(async () => structuredResult(productRankingIntent));
    const compiler = createCompiler(aiService);
    const cyclic: Record<string, unknown> = { safe: 'value' };
    cyclic.self = cyclic;
    const cyclicInput = compilerInput('本月商品销售排行');
    cyclicInput.conversationSlots = cyclic;

    await expect(compiler.compile(cyclicInput)).resolves.toMatchObject({
      status: 'unavailable',
      errorCode: 'CONTEXT_LIMIT_EXCEEDED',
    });

    const oversizedInput = compilerInput('本月商品销售排行');
    oversizedInput.capabilitySummaries = Array.from({ length: 101 }, (_, index) => ({
      key: `capability.${index}`,
      name: `能力${index}`,
      description: 'x',
      domains: ['product_sales'],
      intents: ['ranking'],
      readOnly: true,
    }));
    await expect(compiler.compile(oversizedInput)).resolves.toMatchObject({
      status: 'unavailable',
      errorCode: 'CONTEXT_LIMIT_EXCEEDED',
    });
    expect(aiService.generateStructured).not.toHaveBeenCalled();
  });

  it.each([
    [{ userId: 0, storeId: 6 }, 'userId'],
    [{ userId: 9, storeId: -1 }, 'storeId'],
    [{ userId: 1.5, storeId: 6 }, 'userId'],
  ])('fails closed before AI when audit identity is invalid: %j', async (audit, field) => {
    const aiService = fakeAiService(async () => structuredResult(productRankingIntent));
    const compiler = createCompiler(aiService);
    const input = compilerInput('本月商品销售排行');
    input.audit = audit;

    await expect(compiler.compile(input)).resolves.toMatchObject({
      status: 'unavailable',
      errorCode: 'INVALID_AUDIT_CONTEXT',
      reason: expect.stringContaining(field),
    });
    expect(aiService.generateStructured).not.toHaveBeenCalled();
  });

  it('is registered through BrainModule with AiModule as its only AI provider source', () => {
    const imports = Reflect.getMetadata(MODULE_METADATA.IMPORTS, BrainModule) as unknown[];
    const providers = Reflect.getMetadata(MODULE_METADATA.PROVIDERS, BrainModule) as unknown[];
    const exports = Reflect.getMetadata(MODULE_METADATA.EXPORTS, BrainModule) as unknown[];

    expect(imports).toContain(AiModule);
    expect(providers).toContain(BrainSemanticIntentCompilerService);
    expect(exports).toContain(BrainSemanticIntentCompilerService);
  });
});
