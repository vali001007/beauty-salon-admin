import type { BrainBusinessDefinitionSnapshotEntry } from './brain-capability-codegen.service.js';
import type { BrainCapabilityCandidate } from './brain-capability-scan.types.js';
import {
  BrainCapabilitySemanticCompilationError,
  BrainCapabilitySemanticCompilerService,
  type BrainCapabilitySemanticModel,
} from './brain-capability-semantic-compiler.service.js';

describe('BrainCapabilitySemanticCompilerService', () => {
  it('combines model semantics with governed definition contributions and deterministic technical controls', async () => {
    const model: jest.Mocked<BrainCapabilitySemanticModel> = {
      generate: jest.fn().mockResolvedValue({
        name: '商品销售排行',
        description: '按已发布商品销量口径查询门店商品排行。',
        domains: ['product'],
        intents: ['ranking'],
        positiveExamples: ['本月商品销售排行'],
        negativeExamples: ['修改商品库存'],
        synonyms: ['热销商品榜'],
        riskExplanation: '只读取当前门店授权数据。',
      }),
    };
    const service = new BrainCapabilitySemanticCompilerService(model);

    const result = await service.compile({
      capability: candidate(),
      definitions: [definition('metric.product_sales_quantity', 'metric', 'product', ['product_sales_ranking'])],
      successSchema: { type: 'array', items: { type: 'object' } },
    });

    expect(model.generate).toHaveBeenCalledWith(
      expect.objectContaining({
        capability: expect.objectContaining({ key: 'product_sales_ranking' }),
        definitionViews: [
          expect.objectContaining({
            definitionKey: 'metric.product_sales_quantity',
            domain: 'product',
            aliases: ['商品销量', '商品销售数量'],
            allowedIntents: ['ranking'],
          }),
        ],
      }),
    );
    expect(result.canonicalSemantics).toEqual({
      key: 'product_sales_ranking',
      name: '商品销售排行',
      description: '按已发布商品销量口径查询门店商品排行。',
      domains: ['product'],
      intents: ['ranking'],
      riskLevel: 'low',
      requiredPermissions: ['core:order:products'],
      storeScope: 'required',
      examples: ['本月商品销售排行', '本月商品销售排行，列出前5名'],
      negativeExamples: ['修改商品库存'],
      synonyms: ['热销商品榜'],
      successSchema: { type: 'array', items: { type: 'object' } },
    });
    expect(result.narrative.riskExplanation).toBe('只读取当前门店授权数据。');
  });

  it('rejects model domains that are not backed by referenced business definitions', async () => {
    const model: BrainCapabilitySemanticModel = {
      generate: jest.fn().mockResolvedValue({
        name: '财务排行',
        description: '错误跨域。',
        domains: ['finance'],
        intents: ['ranking'],
        positiveExamples: ['商品排行'],
        negativeExamples: ['修改库存'],
        synonyms: [],
        riskExplanation: '只读。',
      }),
    };
    const service = new BrainCapabilitySemanticCompilerService(model);

    await expect(
      service.compile({
        capability: candidate(),
        definitions: [definition('metric.product_sales_quantity', 'metric', 'product', ['product_sales_ranking'])],
        successSchema: { type: 'object' },
      }),
    ).rejects.toMatchObject<Partial<BrainCapabilitySemanticCompilationError>>({
      reasons: ['model_domain_not_in_business_definitions:finance'],
    });
  });

  it('normalizes legacy operation-shaped intent labels into the shared semantic intent contract', async () => {
    const model: BrainCapabilitySemanticModel = {
      generate: jest.fn().mockResolvedValue({
        name: '预约列表',
        description: '查询预约记录。',
        domains: ['reservation'],
        intents: ['list_reservations', 'query_reservations'],
        positiveExamples: ['查看预约列表'],
        negativeExamples: ['修改预约'],
        synonyms: ['预约记录'],
        riskExplanation: '只读。',
      }),
    };
    const service = new BrainCapabilitySemanticCompilerService(model);

    const result = await service.compile({
      capability: { ...candidate(), key: 'reservation_list' },
      definitions: [definition('entity.reservation', 'entity', 'reservation', ['reservation_list'])],
      successSchema: { type: 'object' },
    });

    expect(result.canonicalSemantics.intents).toEqual(['query']);
    expect(result.canonicalSemantics.examples).toEqual(['本月查看预约列表', '今天查看预约列表']);
  });

  it('drops model intents and examples that exceed the published metric execution contract', async () => {
    const model: BrainCapabilitySemanticModel = {
      generate: jest.fn().mockResolvedValue({
        name: '实收金额查询',
        description: '查询当前门店实收金额。',
        domains: ['finance'],
        intents: ['query', 'comparison', 'trend', 'diagnosis'],
        positiveExamples: ['查询本月实收金额', '查询今天实收金额', '比较不同门店实收金额', '诊断实收下降原因'],
        negativeExamples: ['修改订单金额'],
        synonyms: ['实收查询'],
        riskExplanation: '只读当前门店。',
      }),
    };
    const service = new BrainCapabilitySemanticCompilerService(model);

    const result = await service.compile({
      capability: { ...candidate(), key: 'order_revenue_analysis' },
      definitions: [definition('metric.paid_amount', 'metric', 'finance', ['order_revenue_analysis'], ['query'])],
      successSchema: { type: 'object' },
    });

    expect(result.canonicalSemantics.intents).toEqual(['query']);
    expect(result.canonicalSemantics.examples).toEqual(['查询本月实收金额', '查询今天实收金额']);
  });

  it('normalizes generated named-store and unsupported absolute-month examples into current-store executable examples', async () => {
    const model: BrainCapabilitySemanticModel = {
      generate: jest.fn().mockResolvedValue({
        name: '项目服务排行',
        description: '项目服务次数排行。',
        domains: ['project'],
        intents: ['ranking'],
        positiveExamples: ['2024年1月门店A服务次数最多的5个项目', '本月项目服务次数排行'],
        negativeExamples: ['修改项目'],
        synonyms: [],
        riskExplanation: '当前门店只读。',
      }),
    };
    const service = new BrainCapabilitySemanticCompilerService(model);

    const result = await service.compile({
      capability: { ...candidate(), key: 'project_service_ranking' },
      definitions: [definition('metric.project_service_count', 'metric', 'project', ['project_service_ranking'])],
      successSchema: { type: 'object' },
    });

    expect(result.canonicalSemantics.examples).toEqual([
      '本月本店服务次数最多的5个项目',
      '本月项目服务次数排行',
    ]);
  });

  it('keeps governed draft examples executable instead of degrading them to query intent', async () => {
    const model: BrainCapabilitySemanticModel = {
      generate: jest.fn().mockResolvedValue({
        name: '营销文案草稿',
        description: '生成只读营销文案草稿。',
        domains: ['customer'],
        intents: ['draft'],
        positiveExamples: ['写一条预约提醒消息', '准备一段沉睡客户召回文案'],
        negativeExamples: ['直接群发消息'],
        synonyms: ['邀约话术'],
        riskExplanation: '只生成草稿，不发送。',
      }),
    };
    const service = new BrainCapabilitySemanticCompilerService(model);

    const result = await service.compile({
      capability: { ...candidate(), key: 'marketing_message_draft', businessDefinitionKeys: ['entity.customer'] },
      definitions: [definition('entity.customer', 'entity', 'customer', ['marketing_message_draft'], [])],
      successSchema: { type: 'object' },
    });

    expect(result.canonicalSemantics.intents).toEqual(['draft']);
    expect(result.canonicalSemantics.examples).toEqual(['写一条预约提醒消息', '准备一段沉睡客户召回文案']);
  });

  it('keeps confirmation-gated action preview examples executable', async () => {
    const model: BrainCapabilitySemanticModel = {
      generate: jest.fn().mockResolvedValue({
        name: '预约动作预览',
        description: '生成预约改期待确认预览。',
        domains: ['reservation'],
        intents: ['action'],
        positiveExamples: ['生成预约改期预览', '创建一份待确认的预约调整方案'],
        negativeExamples: ['直接执行改约'],
        synonyms: ['改约草稿'],
        riskExplanation: '确认前不写入。',
      }),
    };
    const service = new BrainCapabilitySemanticCompilerService(model);

    const result = await service.compile({
      capability: {
        ...candidate(), key: 'reservation_action_preview', businessDefinitionKeys: ['entity.reservation'],
        readOnly: false, sideEffect: true, riskLevel: 'high', requiresConfirmation: true, idempotency: 'required',
      },
      definitions: [definition('entity.reservation', 'entity', 'reservation', ['reservation_action_preview'], [])],
      successSchema: { type: 'object' },
    });

    expect(result.canonicalSemantics.intents).toEqual(['action']);
    expect(result.canonicalSemantics.examples).toEqual(['创建一份待确认的预约调整方案', '生成预约改期预览']);
  });

  it('keeps confirmation-gated card usage examples executable', async () => {
    const model: BrainCapabilitySemanticModel = {
      generate: jest.fn().mockResolvedValue({
        name: '次卡核销预览',
        description: '生成指定客户次卡核销待确认预览。',
        domains: ['customer'],
        intents: ['action'],
        positiveExamples: ['生成一次次卡核销预览', '给指定客户准备卡项扣次待确认方案'],
        negativeExamples: ['直接扣次不要确认'],
        synonyms: ['卡项划扣预览'],
        riskExplanation: '确认前不扣减客户权益。',
      }),
    };
    const service = new BrainCapabilitySemanticCompilerService(model);

    const result = await service.compile({
      capability: {
        ...candidate(), key: 'card_usage_action_preview', businessDefinitionKeys: ['entity.customer'],
        readOnly: false, sideEffect: true, riskLevel: 'high', requiresConfirmation: true, idempotency: 'required',
        semanticHints: {
          name: '次卡核销预览', description: '生成待确认次卡核销方案。', intents: ['action'],
          examples: ['预览为指定客户划扣一次卡项', '给指定客户生成次卡核销待确认方案'],
          negativeExamples: ['直接核销不要确认'], synonyms: ['次卡扣次预览'],
        },
      },
      definitions: [definition('entity.customer', 'entity', 'customer', ['card_usage_action_preview'], [])],
      successSchema: { type: 'object' },
    });

    expect(result.canonicalSemantics.intents).toEqual(['action']);
    expect(result.canonicalSemantics.examples).toEqual(expect.arrayContaining([
      '给指定客户生成次卡核销待确认方案',
      '预览为指定客户划扣一次卡项',
    ]));
  });

  it('uses explicit decorator examples when model wording is not executable for the governed intent', async () => {
    const model: BrainCapabilitySemanticModel = {
      generate: jest.fn().mockResolvedValue({
        name: '客户跟进任务预览',
        description: '生成客户跟进任务预览。',
        domains: ['customer'],
        intents: ['draft'],
        positiveExamples: ['查看客户资料', '查询客户记录'],
        negativeExamples: ['直接执行任务'],
        synonyms: ['跟进任务'],
        riskExplanation: '确认前不写入。',
      }),
    };
    const service = new BrainCapabilitySemanticCompilerService(model);

    const result = await service.compile({
      capability: {
        ...candidate(), key: 'customer_follow_up_draft', businessDefinitionKeys: ['entity.customer'],
        readOnly: false, sideEffect: true, riskLevel: 'high', requiresConfirmation: true, idempotency: 'required',
        semanticHints: {
          name: '客户跟进任务预览', description: '生成待确认的客户跟进任务。', intents: ['action'],
          examples: ['生成客户回访任务预览', '给指定客户准备一个待确认跟进任务'],
          negativeExamples: ['直接创建任务'], synonyms: ['客户跟进预览'],
        },
      },
      definitions: [definition('entity.customer', 'entity', 'customer', ['customer_follow_up_draft'], [])],
      successSchema: { type: 'object' },
    });

    expect(result.canonicalSemantics.intents).toEqual(['action']);
    expect(result.canonicalSemantics.examples).toEqual(['给指定客户准备一个待确认跟进任务', '生成客户回访任务预览']);
  });

  it('fails closed when a definition capability binding contradicts the technical candidate', async () => {
    const model: BrainCapabilitySemanticModel = { generate: jest.fn() };
    const service = new BrainCapabilitySemanticCompilerService(model);

    await expect(
      service.compile({
        capability: candidate(),
        definitions: [definition('metric.product_sales_quantity', 'metric', 'product', ['other_capability'])],
        successSchema: { type: 'object' },
      }),
    ).rejects.toMatchObject<Partial<BrainCapabilitySemanticCompilationError>>({
      reasons: ['capability_binding_conflict:metric.product_sales_quantity'],
    });
    expect(model.generate).not.toHaveBeenCalled();
  });
});

function candidate(): BrainCapabilityCandidate {
  return {
    key: 'product_sales_ranking',
    name: 'BrainSemanticQueryCapabilityExecutor.productSalesRanking',
    businessDefinitionKeys: ['metric.product_sales_quantity'],
    status: 'draft',
    enabled: false,
    explicit: true,
    readOnly: true,
    sideEffect: false,
    riskLevel: 'low',
    storeScope: 'required',
    requiredPermissions: ['core:order:products'],
    requiresConfirmation: false,
    idempotency: 'not_applicable',
    inputContract: { question: 'required:string' },
    outputContract: { return: 'Promise<BrainDomainAnswer>' },
    sourceFingerprint: 'f'.repeat(64),
    evidence: [],
    issues: [],
  };
}

function definition(
  definitionKey: string,
  kind: string,
  domain: string,
  capabilityBindings: string[],
  allowedTaskTypes: string[] = ['ranking'],
): BrainBusinessDefinitionSnapshotEntry {
  return {
    definitionId: 10,
    versionId: 21,
    definitionKey,
    kind,
    domain,
    name: '商品销量',
    ownerType: 'system',
    ownerId: 'semantic-data',
    version: 3,
    schemaVersion: '1.0',
    fingerprint: 'a'.repeat(64),
    sourceFingerprint: 'b'.repeat(64),
    validationStatus: 'passed',
    validationReport: null,
    payload: {},
    canonicalQueryRef: 'semantic.product_sales_quantity',
    fixtureSetKey: 'product-sales-v3',
    timezone: 'Asia/Shanghai',
    storeScope: { mode: 'current_store' },
    evidence: [],
    projections: [
      {
        definitionVersionId: 21,
        targetType: 'capability_semantic_view',
        targetKey: `${definitionKey}@3`,
        definitionKey,
        definitionVersion: 3,
        definitionFingerprint: 'a'.repeat(64),
        sourceFingerprint: 'b'.repeat(64),
        payload: {
          projectionSchemaVersion: '2.0',
          preview: false,
          projectionType: 'capability_semantic_view',
          definitionRef: {
            definitionKey,
            definitionVersion: 3,
            definitionFingerprint: 'a'.repeat(64),
            sourceFingerprint: 'b'.repeat(64),
          },
          data: {
            definitionKind: kind,
            domain,
            name: '商品销量',
            capabilityBindings,
            executorBindings: ['BusinessDefinitionRuntimeQueryExecutor.execute'],
            capabilities: [],
            semanticContribution: {
              aliases: ['商品销量', '商品销售数量'],
              description: '指定周期内商品售出数量。',
              permissionPolicies: [],
            },
          },
        },
        projectionFingerprint: 'c'.repeat(64),
        readOnly: true,
      },
      ...(kind === 'metric'
        ? [{
            definitionVersionId: 21,
            targetType: 'metric_query_view' as const,
            targetKey: `${definitionKey}@3`,
            definitionKey,
            definitionVersion: 3,
            definitionFingerprint: 'a'.repeat(64),
            sourceFingerprint: 'b'.repeat(64),
            payload: {
              projectionSchemaVersion: '2.0',
              preview: false,
              projectionType: 'metric_query_view',
              definitionRef: {
                definitionKey,
                definitionVersion: 3,
                definitionFingerprint: 'a'.repeat(64),
                sourceFingerprint: 'b'.repeat(64),
              },
              data: {
                definitionKind: kind,
                domain,
                name: '商品销量',
                applicable: true,
                runtimeDefinition: { allowedTaskTypes },
              },
            },
            projectionFingerprint: 'd'.repeat(64),
            readOnly: true,
          }]
        : []),
    ],
  };
}
