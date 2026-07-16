import { MODULE_METADATA } from '@nestjs/common/constants';
import { Test } from '@nestjs/testing';
import { BrainOntologyRuntimeService } from './brain-ontology-runtime.service.js';
import type { BrainSemanticIntent } from './brain-semantic-intent.types.js';
import { BrainSemanticIntentValidatorService } from './brain-semantic-intent-validator.service.js';
import type { ProductionReadyBusinessDefinitionSnapshot } from './business-definition-snapshot.types.js';
import { BrainModule } from '../brain.module.js';

const entityRef = {
  definitionType: 'entity',
  definitionKey: 'entity.product',
  definitionVersion: 2,
  definitionFingerprint: '1'.repeat(64),
  sourceFingerprint: '2'.repeat(64),
} as const;
const metricRef = {
  definitionType: 'metric',
  definitionKey: 'metric.product_sales_amount',
  definitionVersion: 3,
  definitionFingerprint: '3'.repeat(64),
  sourceFingerprint: '4'.repeat(64),
} as const;
const dimensionRef = {
  definitionType: 'dimension',
  definitionKey: 'dimension.product',
  definitionVersion: 4,
  definitionFingerprint: '5'.repeat(64),
  sourceFingerprint: '6'.repeat(64),
} as const;
const employeeEntityRef = {
  definitionType: 'entity',
  definitionKey: 'entity.employee',
  definitionVersion: 1,
  definitionFingerprint: '7'.repeat(64),
  sourceFingerprint: '8'.repeat(64),
} as const;

const snapshot: ProductionReadyBusinessDefinitionSnapshot = {
  productionReady: true,
  fingerprint: 'snapshot-v1',
  entities: [
    {
      definitionKey: entityRef.definitionKey,
      version: entityRef.definitionVersion,
      definitionFingerprint: entityRef.definitionFingerprint,
      sourceFingerprint: entityRef.sourceFingerprint,
      domain: 'product_sales',
      entityKey: 'product',
      name: '商品',
      aliases: ['货品'],
      attributes: {},
      tableMap: { model: 'Product' },
    },
    {
      definitionKey: employeeEntityRef.definitionKey,
      version: employeeEntityRef.definitionVersion,
      definitionFingerprint: employeeEntityRef.definitionFingerprint,
      sourceFingerprint: employeeEntityRef.sourceFingerprint,
      domain: 'staff',
      entityKey: 'employee',
      name: '员工',
      aliases: ['美容师'],
      attributes: {},
      tableMap: { model: 'Employee' },
    },
  ],
  relations: [],
  metrics: [
    {
      definitionKey: metricRef.definitionKey,
      version: metricRef.definitionVersion,
      definitionFingerprint: metricRef.definitionFingerprint,
      sourceFingerprint: metricRef.sourceFingerprint,
      metricKey: 'product_sales_amount',
      name: '商品销售额',
      domain: 'product_sales',
      formula: { aggregation: 'sum', field: 'amount' },
      source: { model: 'OrderItem' },
      defaultFilters: {},
      permissions: [],
      description: '商品销售额',
    },
  ],
  dimensions: [
    {
      definitionKey: dimensionRef.definitionKey,
      version: dimensionRef.definitionVersion,
      definitionFingerprint: dimensionRef.definitionFingerprint,
      sourceFingerprint: dimensionRef.sourceFingerprint,
      dimensionKey: 'product',
      name: '商品',
      domain: 'product_sales',
      source: { model: 'Product' },
      permissions: [],
    },
  ],
};

function rankingIntent(overrides: Partial<BrainSemanticIntent> = {}): BrainSemanticIntent {
  return {
    schemaVersion: '1.0',
    objective: '查看本月商品销售排行',
    domains: ['product_sales'],
    intent: 'ranking',
    entities: [
      {
        entityType: 'product',
        entityKey: 'product',
        mention: '商品',
        source: 'user',
        definitionRef: entityRef,
        confidence: 0.98,
      },
    ],
    metrics: [metricRef],
    dimensions: [dimensionRef],
    filters: [],
    timeRange: { preset: 'this_month', label: '本月', timezone: 'Asia/Shanghai' },
    orderBy: [{ definitionRef: metricRef, direction: 'desc' }],
    limit: 10,
    answerShape: 'ranking',
    successCriteria: ['返回商品名称、销售额和排名'],
    ambiguities: [],
    missingSlots: [],
    assumptions: [],
    confidence: 0.96,
    decisionSummary: '明确的商品销售排行请求。',
    ...overrides,
  };
}

function createValidator(activeSnapshot: ProductionReadyBusinessDefinitionSnapshot | null = snapshot) {
  const runtime = { getSnapshot: jest.fn(() => activeSnapshot) } as unknown as BrainOntologyRuntimeService;
  return new BrainSemanticIntentValidatorService(runtime);
}

describe('BrainSemanticIntentValidatorService', () => {
  it('accepts a ranking intent only when all canonical references match the active snapshot', () => {
    expect(createValidator().validate(rankingIntent())).toEqual({
      status: 'valid',
      intent: rankingIntent(),
      snapshotFingerprint: snapshot.fingerprint,
    });
  });

  it('rejects unknown domains and stale definition versions or fingerprints', () => {
    const result = createValidator().validate(
      rankingIntent({
        domains: ['invented_domain'],
        metrics: [{ ...metricRef, definitionVersion: 99, sourceFingerprint: 'stale' }],
      }),
    );

    expect(result.status).toBe('invalid');
    if (result.status === 'invalid') {
      expect(result.issues.map((issue) => issue.code)).toEqual(
        expect.arrayContaining(['UNKNOWN_DOMAIN', 'UNKNOWN_METRIC_REFERENCE']),
      );
    }
  });

  it('rejects a reference when only the definition fingerprint is forged', () => {
    const result = createValidator().validate(
      rankingIntent({ metrics: [{ ...metricRef, definitionFingerprint: '9'.repeat(64) }] }),
    );

    expect(result.status).toBe('invalid');
    if (result.status === 'invalid') {
      expect(result.issues.map((issue) => issue.code)).toContain('UNKNOWN_METRIC_REFERENCE');
    }
  });

  it('rejects field references until a governed field snapshot exists and compares definition types canonically', () => {
    const fieldRef = {
      definitionType: 'field',
      definitionKey: 'field.order.status',
      definitionVersion: 1,
      definitionFingerprint: 'a'.repeat(64),
      sourceFingerprint: 'field-order-status-v1',
    } as const;
    const result = createValidator().validate(
      rankingIntent({
        metrics: [{ ...metricRef, definitionType: 'dimension' } as never],
        filters: [{ fieldRef, operator: 'eq', value: 'completed' }],
        orderBy: [{ definitionRef: fieldRef, direction: 'asc' }],
      }),
    );

    expect(result.status).toBe('invalid');
    if (result.status === 'invalid') {
      expect(result.issues.map((issue) => issue.code)).toEqual(
        expect.arrayContaining(['UNKNOWN_METRIC_REFERENCE', 'UNKNOWN_FIELD_REFERENCE']),
      );
    }
  });

  it('merges all missing ranking slots into one clarification request', () => {
    const result = createValidator().validate(
      rankingIntent({ metrics: [], dimensions: [], orderBy: [], missingSlots: ['timeRange'] }),
    );

    expect(result.status).toBe('clarification_required');
    if (result.status === 'clarification_required') {
      expect(result.clarification.questions).toHaveLength(1);
      expect(result.clarification.missingSlots).toEqual(
        expect.arrayContaining(['metric', 'dimension', 'orderBy', 'timeRange']),
      );
      expect(result.clarification.questions[0]).toContain('指标');
      expect(result.clarification.questions[0]).toContain('分组维度');
    }
  });

  it('accepts an explicit time comparison target and rejects a scalar comparison without a target', () => {
    const valid = createValidator().validate(
      rankingIntent({
        intent: 'comparison',
        answerShape: 'comparison',
        comparisonTarget: {
          type: 'time',
          timeRange: { preset: 'last_month', label: '上月', timezone: 'Asia/Shanghai' },
        },
      }),
    );
    expect(valid.status).toBe('valid');

    const missing = createValidator().validate(
      rankingIntent({
        intent: 'comparison',
        answerShape: 'comparison',
        dimensions: [],
        comparisonTarget: undefined,
      }),
    );
    expect(missing.status).toBe('clarification_required');
    if (missing.status === 'clarification_required') {
      expect(missing.clarification.missingSlots).toContain('comparisonTarget');
    }
  });

  it('accepts a grouped dimension comparison without a pairwise comparison target', () => {
    const result = createValidator().validate(
      rankingIntent({
        objective: '对比各美容师的服务次数',
        intent: 'comparison',
        answerShape: 'comparison',
        comparisonTarget: undefined,
        missingSlots: ['comparisonTarget'],
      }),
    );

    expect(result.status).toBe('valid');
  });

  it('requires executable primary and comparison time ranges', () => {
    const result = createValidator().validate(
      rankingIntent({
        intent: 'comparison',
        answerShape: 'comparison',
        timeRange: { label: '当前周期', timezone: 'Asia/Shanghai' },
        comparisonTarget: {
          type: 'time',
          timeRange: { label: '基准周期', timezone: 'Asia/Shanghai' },
        },
      }),
    );

    expect(result.status).toBe('invalid');
    if (result.status === 'invalid') {
      expect(result.issues.map((issue) => issue.code)).toContain('INVALID_COMPARISON_TARGET');
    }
  });

  it.each([
    ['an unknown preset', { preset: 'whenever_the_model_wants', label: '任意周期', timezone: 'Asia/Shanghai' }],
    [
      'a malformed date',
      { startDate: '2026-02-31', endDate: '2026-03-01', label: '错误日期', timezone: 'Asia/Shanghai' },
    ],
    [
      'a reversed date range',
      { startDate: '2026-03-10', endDate: '2026-03-01', label: '反向周期', timezone: 'Asia/Shanghai' },
    ],
  ])('fails closed for %s in a comparison target', (_label, timeRange) => {
    const result = createValidator().validate(
      rankingIntent({
        intent: 'comparison',
        answerShape: 'comparison',
        comparisonTarget: { type: 'time', timeRange } as never,
      }),
    );

    expect(result.status).toBe('invalid');
  });

  it('clarifies a missing primary comparison time range instead of treating it as a model violation', () => {
    const result = createValidator().validate(
      rankingIntent({
        intent: 'comparison',
        answerShape: 'comparison',
        timeRange: undefined,
        comparisonTarget: {
          type: 'time',
          timeRange: { preset: 'last_month', label: '上月', timezone: 'Asia/Shanghai' },
        },
      }),
    );

    expect(result.status).toBe('clarification_required');
    if (result.status === 'clarification_required') {
      expect(result.clarification.missingSlots).toContain('timeRange');
    }
  });

  it('requires entity comparison keys to resolve to entities in the current intent', () => {
    const result = createValidator().validate(
      rankingIntent({
        intent: 'comparison',
        answerShape: 'comparison',
        comparisonTarget: { type: 'entity', entityKeys: ['product:a', 'product:b'] },
      }),
    );

    expect(result.status).toBe('clarification_required');
    if (result.status === 'clarification_required') {
      expect(result.clarification.missingSlots).toContain('comparisonEntities');
    }
  });

  it('does not ask the user to resolve an internal capability-coverage note', () => {
    const result = createValidator().validate(rankingIntent({
      intent: 'query',
      answerShape: 'scalar',
      metrics: [],
      dimensions: [],
      orderBy: [],
      ambiguities: [{
        slot: 'metric',
        reason: '没有独立指标定义，但组合能力已经覆盖。',
        candidates: ['预约到店（checkedInAt非空）', '当前在店（status=in_store）'],
      }],
      missingSlots: [],
    }));

    expect(result.status).toBe('valid');
  });

  it('requires action target entities and success criteria', () => {
    const result = createValidator().validate(
      rankingIntent({
        intent: 'action',
        answerShape: 'action_preview',
        entities: [],
        metrics: [],
        dimensions: [],
        orderBy: [],
        successCriteria: [],
      }),
    );

    expect(result.status).toBe('clarification_required');
    if (result.status === 'clarification_required') {
      expect(result.clarification.missingSlots).toEqual(expect.arrayContaining(['actionTarget', 'successCriteria']));
    }
  });

  it('clarifies an unresolved entity instead of treating it as a hallucinated active reference', () => {
    const result = createValidator().validate(
      rankingIntent({
        entities: [
          {
            entityType: 'employee',
            mention: '张老师',
            source: 'user',
            confidence: 0.52,
          },
        ],
      }),
    );

    expect(result.status).toBe('clarification_required');
    if (result.status === 'clarification_required') {
      expect(result.clarification.missingSlots).toContain('entity');
      expect(result.issues.map((issue) => issue.code)).not.toContain('UNKNOWN_ENTITY_REFERENCE');
    }
  });

  it('merges model ambiguities and entity conflicts into the same single clarification', () => {
    const result = createValidator().validate(
      rankingIntent({
        entities: [
          rankingIntent().entities[0],
          {
            ...rankingIntent().entities[0],
            entityType: 'employee',
            entityKey: 'employee',
            definitionRef: employeeEntityRef,
          },
        ],
        ambiguities: [{ slot: 'metric', reason: '业绩口径不明确', candidates: ['实收', '消耗'] }],
      }),
    );

    expect(result.status).toBe('clarification_required');
    if (result.status === 'clarification_required') {
      expect(result.clarification.questions).toHaveLength(1);
      expect(result.issues.map((issue) => issue.code)).toEqual(
        expect.arrayContaining(['SEMANTIC_AMBIGUITY', 'ENTITY_CONFLICT']),
      );
      expect(result.clarification.questions[0]).not.toContain('entity:');
      expect(result.clarification.questions[0]).not.toContain('source:');
    }
  });

  it('deduplicates repeated hard issues and does not turn every ambiguity into a duplicate missing-slot issue', () => {
    const unknownMetric = { ...metricRef, definitionKey: 'metric.unknown' };
    const invalid = createValidator().validate(rankingIntent({ metrics: [unknownMetric, unknownMetric] }));
    expect(invalid.status).toBe('invalid');
    if (invalid.status === 'invalid') {
      expect(invalid.issues.filter((issue) => issue.code === 'UNKNOWN_METRIC_REFERENCE')).toHaveLength(1);
    }

    const clarification = createValidator().validate(
      rankingIntent({
        missingSlots: ['metric'],
        ambiguities: [{ slot: 'metric', reason: '业绩口径不明确', candidates: ['实收', '消耗'] }],
      }),
    );
    expect(clarification.status).toBe('clarification_required');
    if (clarification.status === 'clarification_required') {
      expect(
        clarification.issues.filter((issue) => issue.code === 'MISSING_REQUIRED_SLOT' && issue.slot === 'metric'),
      ).toHaveLength(0);
    }
  });

  it('never exposes unknown slot names or canonical definition candidates in a user-facing clarification', () => {
    const result = createValidator().validate(
      rankingIntent({
        missingSlots: ['internal_metric_definition_key'],
        ambiguities: [
          {
            slot: 'metric',
            reason: '指标口径不明确',
            candidates: [
              'metric:paid_revenue@3#secret-fingerprint',
              'metric.product_sales_amount',
              'entity.product',
              '实收流水',
            ],
          },
        ],
      }),
    );

    expect(result.status).toBe('clarification_required');
    if (result.status === 'clarification_required') {
      const question = result.clarification.questions[0];
      expect(question).toContain('必要信息');
      expect(question).toContain('实收流水');
      expect(question).not.toContain('internal_metric_definition_key');
      expect(question).not.toContain('metric:paid_revenue');
      expect(question).not.toContain('metric.product_sales_amount');
      expect(question).not.toContain('entity.product');
      expect(question).not.toContain('fingerprint');
    }
  });

  it('clarifies when one mention resolves to two concrete objects of the same entity definition', () => {
    const result = createValidator().validate(
      rankingIntent({
        entities: [
          {
            entityType: 'employee',
            entityKey: 'employee:1',
            mention: '张老师',
            source: 'user',
            definitionRef: employeeEntityRef,
            confidence: 0.8,
          },
          {
            entityType: 'employee',
            entityKey: 'employee:2',
            mention: '张老师',
            source: 'user',
            definitionRef: employeeEntityRef,
            confidence: 0.8,
          },
        ],
      }),
    );

    expect(result.status).toBe('clarification_required');
    if (result.status === 'clarification_required') {
      expect(result.issues.map((issue) => issue.code)).toContain('ENTITY_CONFLICT');
      expect(result.clarification.questions).toHaveLength(1);
    }
  });

  it('fails closed for malformed comparison targets even when a caller bypasses JSON Schema', () => {
    const missingTimeRange = createValidator().validate(
      rankingIntent({
        intent: 'comparison',
        answerShape: 'comparison',
        comparisonTarget: { type: 'time' } as never,
      }),
    );
    const singleEntity = createValidator().validate(
      rankingIntent({
        intent: 'comparison',
        answerShape: 'comparison',
        comparisonTarget: { type: 'entity', entityKeys: ['product'] },
      }),
    );

    expect(missingTimeRange.status).toBe('invalid');
    expect(singleEntity.status).toBe('invalid');
    if (missingTimeRange.status === 'invalid') {
      expect(missingTimeRange.issues.map((issue) => issue.code)).toContain('INVALID_COMPARISON_TARGET');
    }
  });

  it('rejects model-supplied permission or store scope conclusions', () => {
    const untrusted = {
      ...rankingIntent(),
      requiredPermissions: ['*'],
      storeId: 999,
      user: { id: 1 },
      store: { id: 6 },
      tenantId: 12,
      storeIds: [6],
      storeScope: 'all',
      role: 'super_admin',
      visibleStoreIds: [6],
      deniedPermissions: ['core:finance:view'],
      permissionCodes: ['*'],
    } as BrainSemanticIntent;
    const result = createValidator().validate(untrusted);

    expect(result.status).toBe('invalid');
    if (result.status === 'invalid') {
      expect(result.issues.map((issue) => issue.code)).toContain('UNTRUSTED_SECURITY_SCOPE');
      expect(result.issues[0].message).toContain('user');
      expect(result.issues[0].message).toContain('store');
    }
  });

  it('bounds recursive security scanning and handles cyclic objects without throwing', () => {
    const cyclic: Record<string, unknown> = { role: 'super_admin' };
    cyclic.self = cyclic;
    const untrusted = { ...rankingIntent(), nested: cyclic } as BrainSemanticIntent;

    expect(() => createValidator().validate(untrusted)).not.toThrow();
    expect(createValidator().validate(untrusted).status).toBe('invalid');
  });

  it('fails closed for a pure cyclic object even without an explicit forbidden key', () => {
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    const untrusted = { ...rankingIntent(), nested: cyclic } as BrainSemanticIntent;

    const result = createValidator().validate(untrusted);
    expect(result.status).toBe('invalid');
    if (result.status === 'invalid') {
      expect(result.issues[0].message).toContain('__cycle__');
    }
  });

  it('fails closed when no production-ready snapshot is loaded', () => {
    const result = createValidator(null).validate(rankingIntent());
    expect(result).toMatchObject({ status: 'invalid', issues: [{ code: 'SNAPSHOT_UNAVAILABLE' }] });
  });

  it('is registered and exported by BrainModule', () => {
    const providers = Reflect.getMetadata(MODULE_METADATA.PROVIDERS, BrainModule) as unknown[];
    const exports = Reflect.getMetadata(MODULE_METADATA.EXPORTS, BrainModule) as unknown[];

    expect(providers).toContain(BrainSemanticIntentValidatorService);
    expect(exports).toContain(BrainSemanticIntentValidatorService);
  });

  it('compiles through Nest dependency injection with the ontology runtime token', async () => {
    const module = await Test.createTestingModule({
      providers: [
        BrainSemanticIntentValidatorService,
        { provide: BrainOntologyRuntimeService, useValue: { getSnapshot: () => snapshot } },
      ],
    }).compile();

    expect(module.get(BrainSemanticIntentValidatorService)).toBeInstanceOf(BrainSemanticIntentValidatorService);
    await module.close();
  });
});
