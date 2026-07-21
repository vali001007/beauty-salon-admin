import { Injectable } from '@nestjs/common';
import { AiService } from '../../ai/ai.service.js';
import type {
  BrainCanonicalCapabilitySemantics,
  BrainCapabilityNarrative,
  BrainCapabilityNarrativeGenerator,
  BrainPublishedDefinitionRef,
} from './brain-capability-codegen.service.js';
import type { BrainCapabilityCandidate } from './brain-capability-scan.types.js';

const NARRATIVE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['description', 'positiveExamples', 'negativeExamples', 'synonyms', 'successSchema', 'riskExplanation'],
  properties: {
    description: { type: 'string', minLength: 1, maxLength: 500 },
    positiveExamples: {
      type: 'array',
      minItems: 1,
      maxItems: 12,
      items: { type: 'string', minLength: 1, maxLength: 120 },
    },
    negativeExamples: {
      type: 'array',
      minItems: 1,
      maxItems: 12,
      items: { type: 'string', minLength: 1, maxLength: 120 },
    },
    synonyms: {
      type: 'array',
      maxItems: 20,
      items: { type: 'string', minLength: 1, maxLength: 80 },
    },
    successSchema: { type: 'object', additionalProperties: true },
    riskExplanation: { type: 'string', minLength: 1, maxLength: 500 },
  },
} as const;

@Injectable()
export class BrainCapabilityNarrativeGeneratorService implements BrainCapabilityNarrativeGenerator {
  constructor(private readonly aiService: AiService) {}

  async generate(input: {
    capability: BrainCapabilityCandidate;
    businessDefinitions: BrainPublishedDefinitionRef[];
    canonicalSemantics: BrainCanonicalCapabilitySemantics;
  }): Promise<BrainCapabilityNarrative> {
    const messages = [
      {
        role: 'system' as const,
        content: [
          '你是 Ami Core Capability 契约文案编译器。',
          '只能根据输入中已发布的业务定义生成中文说明、问法和风险解释。',
          '不得发明新的业务口径、指标公式、状态含义、权限或执行能力。',
          '负例必须表达该能力不应处理的请求，successSchema 必须是有效 JSON Schema。',
          '当 storeScope=required 时，正例只能查询当前门店，不得生成跨门店比较、按门店排行或读取其他门店的问法。',
          '排行、趋势、对比等时间敏感分析的正例必须明确时间范围，确保每条正例可直接执行而无需追问。',
          '实体列表类能力的正例使用泛指实体，不得伪造实体 ID 或暗示未声明的筛选条件。',
        ].join('\n'),
      },
      {
        role: 'user' as const,
        content: JSON.stringify({
          capability: {
            key: input.capability.key,
            readOnly: input.capability.readOnly,
            riskLevel: input.capability.riskLevel,
            storeScope: input.capability.storeScope,
            requiredPermissions: input.capability.requiredPermissions,
            inputContract: input.capability.inputContract,
            outputContract: input.capability.outputContract,
          },
          canonicalSemantics: input.canonicalSemantics,
          businessDefinitions: input.businessDefinitions.map((item) => ({
            definitionId: item.definitionId,
            versionId: item.versionId,
            definitionKey: item.definitionKey,
            version: item.version,
            definitionFingerprint: item.definitionFingerprint,
            sourceFingerprint: item.sourceFingerprint,
          })),
        }),
      },
    ];
    const result = await this.aiService.generateStructured<BrainCapabilityNarrative>({
      scenario: 'brain_capability_narrative_codegen',
      allowFallback: true,
      timeoutMs: 20_000,
      temperature: 0,
      schema: NARRATIVE_SCHEMA,
      messages,
      fallbackMessages: messages,
    });
    return normalizeNarrative(result.data, input);
  }
}

function normalizeNarrative(
  narrative: BrainCapabilityNarrative,
  input: {
    capability: BrainCapabilityCandidate;
    canonicalSemantics: BrainCanonicalCapabilitySemantics;
  },
): BrainCapabilityNarrative {
  const requiresTime =
    input.capability.key === 'reservation_list' ||
    input.canonicalSemantics.intents.some((intent) => ['ranking', 'trend', 'comparison'].includes(intent));
  if (!requiresTime) return narrative;
  return {
    ...narrative,
    positiveExamples: narrative.positiveExamples.map((example) =>
      hasExplicitTimeExpression(example) ? example : `本月${example}`,
    ),
  };
}

function hasExplicitTimeExpression(value: string): boolean {
  return /(今天|明天|昨天|本周|这周|上周|下周|本月|这个月|上月|上个月|下月|下个月|季度|今年|去年|(?:最近|过去|近)\s*\d+\s*天)/.test(value);
}
