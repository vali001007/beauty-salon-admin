import { Injectable } from '@nestjs/common';
import { AiService } from '../../ai/ai.service.js';
import { BRAIN_SEMANTIC_INTENTS } from '../cognition/brain-semantic-intent.types.js';
import type {
  BrainCapabilitySemanticModel,
  BrainCapabilitySemanticModelOutput,
} from './brain-capability-semantic-compiler.service.js';

const CAPABILITY_SEMANTIC_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: [
    'name',
    'description',
    'domains',
    'intents',
    'positiveExamples',
    'negativeExamples',
    'synonyms',
    'riskExplanation',
  ],
  properties: {
    name: { type: 'string', minLength: 1, maxLength: 80 },
    description: { type: 'string', minLength: 1, maxLength: 500 },
    domains: {
      type: 'array',
      minItems: 1,
      maxItems: 8,
      items: { type: 'string', pattern: '^[a-z][a-z0-9_-]{1,63}$' },
    },
    intents: {
      type: 'array',
      minItems: 1,
      maxItems: 12,
      items: { type: 'string', enum: BRAIN_SEMANTIC_INTENTS },
    },
    positiveExamples: {
      type: 'array',
      minItems: 2,
      maxItems: 16,
      items: { type: 'string', minLength: 1, maxLength: 120 },
    },
    negativeExamples: {
      type: 'array',
      minItems: 1,
      maxItems: 16,
      items: { type: 'string', minLength: 1, maxLength: 120 },
    },
    synonyms: {
      type: 'array',
      maxItems: 24,
      items: { type: 'string', minLength: 1, maxLength: 80 },
    },
    riskExplanation: { type: 'string', minLength: 1, maxLength: 500 },
  },
} as const;

@Injectable()
export class BrainCapabilitySemanticModelService implements BrainCapabilitySemanticModel {
  constructor(private readonly aiService: AiService) {}

  async generate(
    input: Parameters<BrainCapabilitySemanticModel['generate']>[0],
  ): Promise<BrainCapabilitySemanticModelOutput> {
    const messages = [
      {
        role: 'system' as const,
        content: [
          '你是 Ami Core 能力语义编译器。',
          '根据技术能力合同和已发布的统一 Business Definition Semantic View，生成能力名称、业务域、意图、正反例、同义表达和风险解释。',
          '不得发明指标公式、状态口径、权限、门店范围、执行器或数据字段。',
          '不得用关键词子串规则判断意图，必须综合能力合同和所有业务定义证据。',
          'domains 只能从 definitionViews.domain 选择；技术权限和成功 Schema 由确定性编译器负责，不在输出中维护。',
          `intents 只能使用统一语义枚举：${BRAIN_SEMANTIC_INTENTS.join(', ')}。`,
          'definitionViews.allowedIntents 非空时，intents 必须是这些允许意图的子集；不得扩张为比较、趋势、诊断或排行。',
          '至少生成 2 条可直接执行的 positiveExamples；storeScope=required 时不得生成跨门店、不同门店或按门店比较。',
          '排行、趋势、比较和预约列表样例必须写明时间范围，不能依赖隐含的全量或默认周期。',
          'positiveExamples 必须能仅凭 definitionViews 中已发布的实体、指标、维度和字段证据执行；不得引入未发布的状态、标签、筛选字段或业务口径。',
        ].join('\n'),
      },
      {
        role: 'user' as const,
        content: JSON.stringify(input),
      },
    ];
    const result = await this.aiService.generateStructured<BrainCapabilitySemanticModelOutput>({
      scenario: 'brain_capability_semantic_compiler',
      allowFallback: true,
      timeoutMs: 20_000,
      temperature: 0,
      schema: CAPABILITY_SEMANTIC_SCHEMA,
      messages,
      fallbackMessages: messages,
    });
    return result.data;
  }
}
