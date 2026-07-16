import { Ajv } from 'ajv';
import addFormatsImport from 'ajv-formats';
import {
  BRAIN_SEMANTIC_INTENT_JSON_SCHEMA,
  BRAIN_SEMANTIC_INTENT_MODEL_JSON_SCHEMA,
} from './brain-semantic-intent.schema.js';
import type { BrainDefinitionRef, BrainSemanticIntent } from './brain-semantic-intent.types.js';

describe('BRAIN_SEMANTIC_INTENT_JSON_SCHEMA', () => {
  const ajv = new Ajv({ allErrors: true, strict: true });
  const applyAjvFormats = addFormatsImport as unknown as (instance: Ajv) => Ajv;
  applyAjvFormats(ajv);
  const validate = ajv.compile(BRAIN_SEMANTIC_INTENT_JSON_SCHEMA);
  const validateModel = ajv.compile(BRAIN_SEMANTIC_INTENT_MODEL_JSON_SCHEMA);

  const definitionRef = <T extends BrainDefinitionRef['definitionType']>(
    definitionType: T,
    definitionKey: string,
  ): BrainDefinitionRef<T> => ({
    definitionType,
    definitionKey,
    definitionVersion: 1,
    definitionFingerprint: 'a'.repeat(64),
    sourceFingerprint: 'b'.repeat(64),
  });

  const baseIntent = {
    schemaVersion: '1.0',
    objective: '查询本月商品销量排行',
    domains: ['product', 'order'],
    intent: 'ranking',
    entities: [
      {
        entityType: 'product',
        mention: '商品',
        source: 'user',
        definitionRef: definitionRef('entity', 'product'),
        confidence: 0.99,
      },
    ],
    metrics: [definitionRef('metric', 'product_sales_quantity')],
    dimensions: [definitionRef('dimension', 'product')],
    filters: [],
    timeRange: {
      preset: 'this_month',
      label: '本月',
      timezone: 'Asia/Shanghai',
    },
    orderBy: [{ definitionRef: definitionRef('metric', 'product_sales_quantity'), direction: 'desc' }],
    limit: 10,
    answerShape: 'ranking',
    successCriteria: ['返回商品名称、销量和排序'],
    ambiguities: [],
    missingSlots: [],
    assumptions: [],
    confidence: 0.97,
    decisionSummary: '明确的商品销量排行请求。',
  } satisfies BrainSemanticIntent;

  it('accepts compact model refs while the canonical schema still requires governed fingerprints', () => {
    const compactIntent = {
      ...baseIntent,
      intent: ['ranking', 'query'],
      answerShape: ['ranking', 'list'],
      entities: baseIntent.entities.map((entity) => ({
        ...entity,
        source: 'question',
        definitionRef: {
          definitionType: entity.definitionRef.definitionType,
          definitionKey: entity.definitionRef.definitionKey,
        },
      })),
      metrics: baseIntent.metrics.map((ref) => ({ definitionType: ref.definitionType, definitionKey: ref.definitionKey })),
      dimensions: baseIntent.dimensions.map((ref) => ({ definitionType: ref.definitionType, definitionKey: ref.definitionKey })),
      orderBy: baseIntent.orderBy.map((item) => ({
        ...item,
        definitionRef: {
          definitionType: item.definitionRef.definitionType,
          definitionKey: item.definitionRef.definitionKey,
        },
      })),
    };
    delete (compactIntent as { timeRange?: unknown }).timeRange;

    expect(validateModel(compactIntent)).toBe(true);
    expect(validate(compactIntent)).toBe(false);
    expect(validateModel({ ...compactIntent, timeRange: baseIntent.timeRange })).toBe(false);
    expect(validateModel({
      ...compactIntent,
      comparisonTarget: { type: 'time', timeRange: baseIntent.timeRange },
    })).toBe(false);
  });

  it.each([
    ['本月商品销售排行', baseIntent],
    [
      '哪些客户消费了但很少用次卡',
      {
        ...baseIntent,
        objective: '查找已消费但次卡使用频率低的客户',
        domains: ['customer', 'card'],
        intent: 'query',
        entities: [
          {
            entityType: 'customer',
            mention: '客户',
            source: 'user',
            definitionRef: definitionRef('entity', 'customer'),
            confidence: 0.96,
          },
        ],
        metrics: [definitionRef('metric', 'customer_paid_amount'), definitionRef('metric', 'card_usage_frequency')],
        dimensions: [definitionRef('dimension', 'customer')],
        timeRange: undefined,
        orderBy: [{ definitionRef: definitionRef('metric', 'card_usage_frequency'), direction: 'asc' }],
        answerShape: 'list',
        successCriteria: ['返回客户标识、消费金额、次卡使用频率和命中原因'],
      },
    ],
    [
      '写一条预约提醒',
      {
        ...baseIntent,
        objective: '生成预约提醒文案',
        domains: ['reservation', 'customer'],
        intent: 'draft',
        entities: [
          {
            entityType: 'reservation',
            mention: '预约',
            source: 'user',
            definitionRef: definitionRef('entity', 'reservation'),
            confidence: 0.98,
          },
        ],
        metrics: [],
        dimensions: [],
        timeRange: undefined,
        orderBy: [],
        limit: undefined,
        answerShape: 'draft',
        successCriteria: ['返回可编辑的预约提醒文案'],
      },
    ],
  ])('accepts valid semantic intent: %s', (_label, value) => {
    expect(validate(value)).toBe(true);
    expect(validate.errors).toBeNull();
  });

  it.each([
    ['unregistered answerShape', { ...baseIntent, answerShape: 'markdown_table' }],
    ['limit over maximum', { ...baseIntent, limit: 101 }],
    ['missing objective', (({ objective: _objective, ...value }) => value)(baseIntent)],
  ])('rejects invalid semantic intent: %s', (_label, value) => {
    expect(validate(value)).toBe(false);
  });

  it('rejects undeclared fields at the root and nested object levels', () => {
    expect(validate({ ...baseIntent, sql: 'select * from orders' })).toBe(false);
    expect(
      validate({
        ...baseIntent,
        entities: [{ ...baseIntent.entities[0], tableName: 'Product' }],
      }),
    ).toBe(false);
  });

  it('enforces semantic reference collection limits', () => {
    const collections = BRAIN_SEMANTIC_INTENT_JSON_SCHEMA.properties as unknown as Record<
      string,
      { maxItems?: number }
    >;
    expect(collections.entities.maxItems).toBe(20);
    expect(collections.metrics.maxItems).toBe(8);
    expect(collections.dimensions.maxItems).toBe(8);
    expect(
      validate({
        ...baseIntent,
        entities: Array.from({ length: 21 }, (_, index) => ({
          ...baseIntent.entities[0],
          mention: `客户${index}`,
        })),
      }),
    ).toBe(false);
    expect(
      validate({
        ...baseIntent,
        metrics: Array.from({ length: 9 }, (_, index) => definitionRef('metric', `metric_${index}`)),
      }),
    ).toBe(false);
    expect(
      validate({
        ...baseIntent,
        dimensions: Array.from({ length: 9 }, (_, index) => definitionRef('dimension', `dimension_${index}`)),
      }),
    ).toBe(false);
  });

  it('rejects arbitrary filters and incomplete business definition references', () => {
    expect(validate({ ...baseIntent, filters: { sql: 'select * from orders' } })).toBe(false);
    expect(
      validate({
        ...baseIntent,
        filters: [
          {
            fieldRef: definitionRef('field', 'order.status'),
            operator: 'eq',
            value: 'paid',
            sql: 'select * from orders',
          },
        ],
      }),
    ).toBe(false);
    expect(
      validate({
        ...baseIntent,
        filters: [
          {
            fieldRef: { definitionType: 'field', definitionKey: 'order.status' },
            operator: 'eq',
            value: 'paid',
          },
        ],
      }),
    ).toBe(false);
  });

  it('requires both immutable definition and source fingerprints on every reference', () => {
    const { definitionFingerprint: _definitionFingerprint, ...missingDefinitionFingerprint } = baseIntent.metrics[0];
    expect(validate({ ...baseIntent, metrics: [missingDefinitionFingerprint] })).toBe(false);
    expect(
      validate({
        ...baseIntent,
        metrics: [{ ...baseIntent.metrics[0], definitionFingerprint: 'not-sha256' }],
      }),
    ).toBe(false);
  });

  it('rejects empty semantic keys and malformed time ranges', () => {
    expect(validate({ ...baseIntent, domains: [''] })).toBe(false);
    expect(
      validate({
        ...baseIntent,
        metrics: [{ ...baseIntent.metrics[0], definitionKey: '' }],
      }),
    ).toBe(false);
    expect(
      validate({
        ...baseIntent,
        timeRange: { ...baseIntent.timeRange, startDate: '2026-02-31' },
      }),
    ).toBe(false);
    expect(
      validate({
        ...baseIntent,
        timeRange: { ...baseIntent.timeRange, timezone: 'Asia/Definitely_Not_Real' },
      }),
    ).toBe(false);
    expect(
      validate({
        ...baseIntent,
        metrics: [{ ...baseIntent.metrics[0], definitionKey: '   ', sourceFingerprint: '\t' }],
      }),
    ).toBe(false);
  });

  it('accepts an explicit governed comparison target for time comparisons', () => {
    expect(
      validate({
        ...baseIntent,
        objective: '比较本月与上月商品销售额',
        intent: 'comparison',
        answerShape: 'comparison',
        comparisonTarget: {
          type: 'time',
          timeRange: {
            preset: 'last_month',
            label: '上月',
            timezone: 'Asia/Shanghai',
          },
        },
      }),
    ).toBe(true);
    expect(validate.errors).toBeNull();
  });

  it('rejects incomplete or arbitrary comparison targets', () => {
    expect(
      validate({
        ...baseIntent,
        intent: 'comparison',
        answerShape: 'comparison',
        comparisonTarget: { type: 'time' },
      }),
    ).toBe(false);
    expect(
      validate({
        ...baseIntent,
        intent: 'comparison',
        answerShape: 'comparison',
        comparisonTarget: { type: 'entity', entityKeys: ['employee:1'], sql: 'select 1' },
      }),
    ).toBe(false);
  });

  it('allows an action to report missing success criteria for deterministic clarification', () => {
    expect(
      validate({
        ...baseIntent,
        intent: 'action',
        answerShape: 'action_preview',
        metrics: [],
        dimensions: [],
        orderBy: [],
        successCriteria: [],
        missingSlots: ['successCriteria'],
      }),
    ).toBe(true);
  });
});
