import { BrainCapabilityContractRefreshNarrativeService } from './brain-capability-contract-refresh-narrative.service.js';

describe('BrainCapabilityContractRefreshNarrativeService', () => {
  const capability = {
    key: 'order_revenue_analysis',
    sourceFingerprint: 'a'.repeat(64),
    requiredPermissions: ['core:brain:use'],
    storeScope: 'required',
    readOnly: true,
    sideEffect: false,
    requiresConfirmation: false,
    idempotency: 'not_applicable',
  } as never;
  const successSchema = { type: 'object', properties: { paidAmount: { type: 'number' } } };
  const canonicalSemantics = {
    description: '当前发布口径的实收查询。',
    successSchema,
  } as never;

  it('reuses governed language samples while taking semantics from the current definition snapshot', async () => {
    const service = new BrainCapabilityContractRefreshNarrativeService(
      new Map([['order_revenue_analysis', snapshot()]]),
    );

    await expect(service.generate({ capability, businessDefinitions: [], canonicalSemantics })).resolves.toEqual({
      description: '当前发布口径的实收查询。',
      positiveExamples: ['今天营业额多少', '本月实收'],
      negativeExamples: ['帮我退款'],
      synonyms: ['营业额', '实收'],
      successSchema,
      riskExplanation: '仅刷新已发布业务定义与实现依赖指纹，不改变权限、写入边界或确认策略。',
    });
  });

  it('rebuilds canonical semantics from current domains and the existing governed contract', () => {
    const service = new BrainCapabilityContractRefreshNarrativeService(
      new Map([['order_revenue_analysis', snapshot()]]),
    );

    expect(
      service.resolve({
        capability,
        definitions: [{ domain: 'payment' }] as never,
        successSchema,
      }),
    ).toMatchObject({
      key: 'order_revenue_analysis',
      domains: ['payment'],
      intents: ['query'],
      requiredPermissions: ['core:brain:use'],
      storeScope: 'required',
      successSchema,
    });
  });

  it('accepts a permission-only contract refresh while using only current Scanner permissions', async () => {
    const narrowedCapability = {
      ...(capability as Record<string, unknown>),
      requiredPermissions: ['core:brain:beautician-view', 'core:brain:use'],
    } as never;
    const service = new BrainCapabilityContractRefreshNarrativeService(
      new Map([['order_revenue_analysis', snapshot()]]),
    );

    await expect(service.generate({
      capability: narrowedCapability,
      businessDefinitions: [],
      canonicalSemantics,
    })).resolves.toMatchObject({
      riskExplanation: '权限合同已按当前 Scanner 结果更新，旧权限未复用；读写边界、确认策略与幂等要求保持不变，候选需治理审批。',
    });
    expect(service.resolve({
      capability: narrowedCapability,
      definitions: [{ domain: 'staff' }] as never,
      successSchema,
    }).requiredPermissions).toEqual(['core:brain:beautician-view', 'core:brain:use']);
  });

  it('fails closed when no governed snapshot exists or the safety contract changed', async () => {
    const missing = new BrainCapabilityContractRefreshNarrativeService(new Map());
    await expect(missing.generate({ capability, businessDefinitions: [], canonicalSemantics })).rejects.toThrow(
      'snapshot_missing',
    );
    const drifted = new BrainCapabilityContractRefreshNarrativeService(
      new Map([['order_revenue_analysis', { ...snapshot(), readOnly: false }]]),
    );
    await expect(drifted.generate({ capability, businessDefinitions: [], canonicalSemantics })).rejects.toThrow(
      'safety_drift',
    );
  });

  it.each([
    ['readOnly', false],
    ['sideEffect', true],
    ['requiresConfirmation', true],
    ['idempotency', 'required'],
  ])('fails closed when the %s safety invariant changed', async (field, value) => {
    const service = new BrainCapabilityContractRefreshNarrativeService(
      new Map([['order_revenue_analysis', { ...snapshot(), [field]: value }]]),
    );

    await expect(service.generate({ capability, businessDefinitions: [], canonicalSemantics })).rejects.toThrow(
      'safety_drift',
    );
  });

  it('generates a first read-only candidate from its colocated source semantic contract', async () => {
    const service = new BrainCapabilityContractRefreshNarrativeService(new Map());
    const firstCandidate = {
      key: 'store_operations_overview',
      name: '店长经营概览',
      businessDefinitionKeys: ['metric.paid_amount'],
      status: 'draft',
      enabled: false,
      explicit: true,
      readOnly: true,
      sideEffect: false,
      riskLevel: 'low',
      storeScope: 'required',
      requiredPermissions: ['core:dashboard:view'],
      requiresConfirmation: false,
      idempotency: 'not_applicable',
      inputContract: {},
      outputContract: {},
      sourceFingerprint: 'a'.repeat(64),
      evidence: [],
      issues: [],
      semanticHints: {
        name: '店长经营概览',
        description: '组合门店经营事实。',
        intents: ['query', 'diagnosis'],
        examples: ['今天店里情况怎么样', '本月经营风险有哪些'],
        negativeExamples: ['修改经营目标', '查询其他门店'],
        synonyms: ['经营概览'],
      },
    } as never;
    const semantics = service.resolve({
      capability: firstCandidate,
      definitions: [{ domain: 'payment' }] as never,
      successSchema,
    });

    expect(semantics).toMatchObject({
      key: 'store_operations_overview',
      name: '店长经营概览',
      domains: ['payment'],
      intents: ['query', 'diagnosis'],
      riskLevel: 'low',
    });
    await expect(service.generate({
      capability: firstCandidate,
      businessDefinitions: [],
      canonicalSemantics: semantics,
    })).resolves.toMatchObject({
      positiveExamples: ['今天店里情况怎么样', '本月经营风险有哪些'],
      negativeExamples: ['修改经营目标', '查询其他门店'],
      synonyms: ['经营概览'],
    });
  });

  it('refreshes a confirmation-gated action snapshot without weakening its safety contract', async () => {
    const actionCapability = {
      ...(capability as Record<string, unknown>),
      key: 'gap_fill_touch_preview',
      readOnly: false,
      sideEffect: true,
      requiresConfirmation: true,
      idempotency: 'required',
      requiredPermissions: ['core:brain:use', 'core:marketing:create'],
    } as never;
    const actionSnapshot = {
      ...snapshot(),
      key: 'gap_fill_touch_preview',
      readOnly: false,
      sideEffect: true,
      requiresConfirmation: true,
      idempotency: 'required',
      requiredPermissions: ['core:brain:use', 'core:marketing:create'],
      intents: ['workflow', 'action'],
      examples: ['找出空档并生成触达预览'],
      negativeExamples: ['直接发送消息'],
      synonyms: ['空档补位'],
    };
    const service = new BrainCapabilityContractRefreshNarrativeService(
      new Map([['gap_fill_touch_preview', actionSnapshot]]),
    );

    await expect(service.generate({
      capability: actionCapability,
      businessDefinitions: [],
      canonicalSemantics,
    })).resolves.toMatchObject({
      positiveExamples: ['找出空档并生成触达预览'],
      negativeExamples: ['直接发送消息'],
      riskExplanation: '仅刷新已发布业务定义与实现依赖指纹，不改变权限、写入边界或确认策略。',
    });
  });
});

function snapshot() {
  return {
    generatedCapability: true,
    sourceFingerprint: 'a'.repeat(64),
    name: '实收分析',
    description: '旧版实收分析描述',
    domains: ['payment'],
    intents: ['query'],
    riskLevel: 'low',
    requiredPermissions: ['core:brain:use'],
    readOnly: true,
    sideEffect: false,
    requiresConfirmation: false,
    idempotency: 'not_applicable',
    examples: ['今天营业额多少', '本月实收'],
    negativeExamples: ['帮我退款'],
    synonyms: ['营业额', '实收'],
  };
}
