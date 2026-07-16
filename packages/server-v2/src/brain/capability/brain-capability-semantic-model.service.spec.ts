import type { AiService, AiStructuredOutputInput } from '../../ai/ai.service.js';
import { BrainCapabilitySemanticModelService } from './brain-capability-semantic-model.service.js';

describe('BrainCapabilitySemanticModelService', () => {
  it('uses structured model output over unified definition views without source-code paths or duplicated permissions', async () => {
    const data = {
      name: '商品销售排行',
      description: '按统一商品销量口径生成排行。',
      domains: ['product'],
      intents: ['ranking'],
      positiveExamples: ['本月商品销售排行'],
      negativeExamples: ['修改库存'],
      synonyms: ['热销商品榜'],
      riskExplanation: '只读取当前门店授权数据。',
    };
    const aiService = {
      generateStructured: jest.fn().mockResolvedValue({ data, provider: 'test', model: 'test' }),
    } as unknown as jest.Mocked<AiService>;
    const service = new BrainCapabilitySemanticModelService(aiService);

    await expect(
      service.generate({
        capability: {
          key: 'product_sales_ranking',
          name: 'BrainSemanticQueryCapabilityExecutor.productSalesRanking',
          readOnly: true,
          riskLevel: 'low',
          storeScope: 'required',
          requiredPermissions: ['core:order:products'],
          inputContract: { question: 'required:string' },
          outputContract: { return: 'Promise<BrainDomainAnswer>' },
        },
        definitionViews: [
          {
            definitionKey: 'metric.product_sales_quantity',
            kind: 'metric',
            domain: 'product',
            name: '商品销量',
            aliases: ['商品销售数量'],
            description: '指定周期内商品售出的数量。',
            capabilityBindings: ['product_sales_ranking'],
            executorBindings: ['BusinessDefinitionRuntimeQueryExecutor.execute'],
            allowedIntents: ['ranking'],
          },
        ],
      }),
    ).resolves.toEqual(data);

    const request = aiService.generateStructured.mock.calls[0]?.[0] as AiStructuredOutputInput;
    expect(request.scenario).toBe('brain_capability_semantic_compiler');
    expect(request.schema).toMatchObject({
      type: 'object',
      additionalProperties: false,
      required: expect.arrayContaining(['domains', 'intents', 'positiveExamples', 'negativeExamples']),
    });
    expect(request.messages[0]?.content).toContain('不得用关键词子串规则');
    expect(request.messages[1]?.content).toContain('metric.product_sales_quantity');
    expect(request.messages[1]?.content).not.toContain('packages/server-v2');
    expect(request.allowFallback).toBe(true);
    expect(request.fallbackMessages).toEqual(request.messages);
  });
});
