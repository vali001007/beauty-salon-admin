import type { AiService, AiStructuredOutputInput } from '../../ai/ai.service.js';
import { BrainCapabilityNarrativeGeneratorService } from './brain-capability-narrative.service.js';
import type { BrainCapabilityCandidate } from './brain-capability-scan.types.js';

describe('BrainCapabilityNarrativeGeneratorService', () => {
  it('uses structured output and only supplies published definition semantics to the model', async () => {
    const data = {
      description: '查询客户基础事实。',
      positiveExamples: ['查看客户资料'],
      negativeExamples: ['修改客户资料'],
      synonyms: ['客户信息查询'],
      successSchema: { type: 'object' },
      riskExplanation: '仅允许读取授权门店数据。',
    };
    const aiService = {
      generateStructured: jest.fn().mockResolvedValue({
        data,
        rawText: JSON.stringify(data),
        usage: { provider: 'test', model: 'test', inputTokens: 1, outputTokens: 1 },
        provider: 'test',
        model: 'test',
      }),
    } as unknown as jest.Mocked<AiService>;
    const service = new BrainCapabilityNarrativeGeneratorService(aiService);

    await expect(
      service.generate({
        capability: candidate(),
        businessDefinitions: [
          {
            definitionId: 10,
            versionId: 21,
            definitionKey: 'customer.entity',
            version: 3,
            definitionFingerprint: 'b'.repeat(64),
            sourceFingerprint: 'c'.repeat(64),
          },
        ],
        canonicalSemantics: {
          key: 'customer_facts',
          name: '客户事实',
          description: '门店授权范围内的客户基础事实。',
          domains: ['customer'],
          intents: ['query_customer_facts'],
          riskLevel: 'low',
          requiredPermissions: ['core:customer:view'],
          storeScope: 'required',
          examples: ['查看客户事实'],
          negativeExamples: ['修改客户事实'],
          synonyms: ['客户资料查询'],
          successSchema: { type: 'array', items: { type: 'object' } },
        },
      }),
    ).resolves.toEqual(data);

    const request = aiService.generateStructured.mock.calls[0]?.[0] as AiStructuredOutputInput;
    expect(request.scenario).toBe('brain_capability_narrative_codegen');
    expect(request.schema).toMatchObject({
      type: 'object',
      additionalProperties: false,
      required: expect.arrayContaining(['description', 'positiveExamples', 'negativeExamples', 'successSchema']),
    });
    expect(request.messages[0]?.content).toContain('不得发明新的业务口径');
    expect(request.messages[1]?.content).toContain('customer.entity');
    expect(request.messages[1]?.content).toContain('门店授权范围内的客户基础事实');
    expect(request.messages[1]?.content).not.toContain('packages/server-v2');
    expect(request.allowFallback).toBe(true);
    expect(request.fallbackMessages).toEqual(request.messages);
  });

  it('adds an executable default period to time-sensitive generated examples', async () => {
    const data = {
      description: '按商品销量排名。',
      positiveExamples: ['按销量排序的商品列表', '上个月销量最高的商品'],
      negativeExamples: ['库存最多的商品'],
      synonyms: ['商品销量榜'],
      successSchema: { type: 'object' },
      riskExplanation: '只读当前门店数据。',
    };
    const aiService = {
      generateStructured: jest.fn().mockResolvedValue({
        data,
        rawText: JSON.stringify(data),
        usage: { provider: 'test', model: 'test', inputTokens: 1, outputTokens: 1 },
        provider: 'test',
        model: 'test',
      }),
    } as unknown as jest.Mocked<AiService>;
    const service = new BrainCapabilityNarrativeGeneratorService(aiService);

    await expect(service.generate({
      capability: { ...candidate(), key: 'product_sales_ranking' },
      businessDefinitions: [],
      canonicalSemantics: {
        key: 'product_sales_ranking',
        name: '商品销售排行',
        description: '按商品销量排名。',
        domains: ['product'],
        intents: ['ranking'],
        riskLevel: 'low',
        requiredPermissions: ['core:order:products'],
        storeScope: 'required',
        examples: [],
        negativeExamples: [],
        synonyms: [],
        successSchema: { type: 'object' },
      },
    })).resolves.toMatchObject({
      positiveExamples: ['本月按销量排序的商品列表', '上个月销量最高的商品'],
    });
  });
});

function candidate(): BrainCapabilityCandidate {
  return {
    key: 'customer_facts',
    name: 'CustomersController.list',
    businessDefinitionKeys: ['customer.entity'],
    status: 'draft',
    enabled: false,
    explicit: true,
    readOnly: true,
    sideEffect: false,
    riskLevel: 'low',
    storeScope: 'required',
    requiredPermissions: ['core:customer:view'],
    requiresConfirmation: false,
    idempotency: 'not_applicable',
    inputContract: { storeId: 'required:number' },
    outputContract: { return: 'Promise<Customer[]>' },
    sourceFingerprint: 'a'.repeat(64),
    evidence: [],
    issues: [],
  };
}
