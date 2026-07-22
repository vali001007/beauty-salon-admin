import { Injectable } from '@nestjs/common';
import type { BrainSemanticIntent } from './brain-semantic-intent.types.js';
import type { ProductionReadyBusinessDefinitionSnapshot } from './business-definition-snapshot.types.js';

interface BrainIntentCompletenessInput {
  intent: BrainSemanticIntent;
  question: string;
  snapshot: ProductionReadyBusinessDefinitionSnapshot;
  catalogAmbiguous: boolean;
  conversationSlots: Record<string, unknown>;
}

@Injectable()
export class BrainIntentCompletenessPolicyService {
  assess(input: BrainIntentCompletenessInput): BrainSemanticIntent {
    if (input.intent.intent === 'clarify') return input.intent;

    const pending = this.pendingClarification(input.conversationSlots);
    if (pending.includes('entity') && this.hasUnresolvedPersonalReference(input.question, input.intent)) {
      return this.withClarification(input.intent, {
        intent: 'action',
        answerShape: 'action_preview',
        missingSlots: ['entity', ...(!input.intent.timeRange ? ['timeRange'] : [])],
        reason: '上一轮客户身份仍未唯一确认，请先选择同名客户并补充预约时间',
        candidates: [],
      });
    }

    if (
      ['action', 'workflow'].includes(input.intent.intent) &&
      input.intent.answerShape === 'action_preview' &&
      input.intent.domains.includes('reservation')
    ) {
      const hasCustomer = this.hasSpecificEntity(input.intent, 'customer');
      const hasProject = this.hasSpecificEntity(input.intent, 'project');
      const missingSlots = [
        ...(!hasCustomer ? ['customer'] : []),
        ...(!hasProject ? ['project'] : []),
        ...(!input.intent.timeRange ? ['timeRange'] : []),
      ];
      if (missingSlots.length) {
        return this.withClarification(input.intent, {
          missingSlots,
          reason: '预约动作缺少明确的客户、项目或时间，确认前不能生成可执行预览',
          candidates: [],
        });
      }
    }

    if (
      input.intent.intent === 'comparison' &&
      !input.intent.comparisonTarget &&
      this.hasAmbiguousNamedPeriod(input.question)
    ) {
      return this.withClarification(input.intent, {
        missingSlots: ['comparisonTarget'],
        reason: '对比周期只给出了节假日名称，尚未明确年份和具体日期范围',
        candidates: ['今年对应节假日', '去年对应节假日', '指定开始和结束日期'],
      });
    }

    const metricCollision = this.metricAliasCollision(input.question, input.intent, input.snapshot);
    if (metricCollision.length > 1) {
      return this.withClarification(input.intent, {
        missingSlots: ['metric'],
        reason: '当前表达对应多个已发布业绩口径，请先确认要查看哪一个',
        candidates: metricCollision,
      });
    }

    if (
      input.catalogAmbiguous &&
      ['query', 'diagnosis'].includes(input.intent.intent) &&
      input.intent.metrics.length === 0 &&
      input.intent.entities.length === 0 &&
      input.intent.dimensions.length === 0 &&
      input.intent.domains.length > 1
    ) {
      return this.withClarification(input.intent, {
        intent: 'clarify',
        answerShape: 'clarification',
        missingSlots: ['objective'],
        reason: '问题尚未明确要检查的业务范围和经营口径',
        candidates: ['门店经营', '客户与营销', '预约现场', '财务', '库存与采购'],
      });
    }

    return input.intent;
  }

  private withClarification(
    intent: BrainSemanticIntent,
    input: {
      intent?: BrainSemanticIntent['intent'];
      answerShape?: BrainSemanticIntent['answerShape'];
      missingSlots: string[];
      reason: string;
      candidates: string[];
    },
  ): BrainSemanticIntent {
    const missingSlots = [...new Set([...intent.missingSlots, ...input.missingSlots])];
    return {
      ...intent,
      ...(input.intent ? { intent: input.intent } : {}),
      ...(input.answerShape ? { answerShape: input.answerShape } : {}),
      missingSlots,
      ambiguities: [
        ...intent.ambiguities.filter((ambiguity) => !input.missingSlots.includes(ambiguity.slot)),
        {
          slot: input.missingSlots[0] ?? 'objective',
          reason: input.reason,
          candidates: input.candidates,
        },
      ],
    };
  }

  private metricAliasCollision(
    question: string,
    intent: BrainSemanticIntent,
    snapshot: ProductionReadyBusinessDefinitionSnapshot,
  ): string[] {
    const normalizedQuestion = this.normalizeMetricQuestion(question, intent);
    if (normalizedQuestion.length < 2) return [];
    const matched = snapshot.metrics.filter((metric) =>
      [metric.name, ...(metric.aliases ?? [])]
        .map((alias) => this.normalize(alias))
        .filter((alias) => alias.length >= 2)
        .some(
          (alias) =>
            normalizedQuestion.includes(alias) ||
            alias.endsWith(normalizedQuestion) ||
            normalizedQuestion.endsWith(alias),
        ),
    );
    if (matched.length < 2) return [];
    return [...new Set(matched.map((metric) => metric.name.trim()).filter(Boolean))].slice(0, 6);
  }

  private normalizeMetricQuestion(question: string, intent: BrainSemanticIntent): string {
    let normalized = this.normalize(question);
    for (const entity of intent.entities) normalized = normalized.replace(this.normalize(entity.mention), '');
    return normalized
      .replace(/^(?:帮我|请|看下|看看|查下|查询|分析)/, '')
      .replace(/(?:的|怎么样|如何|好不好|情况)$/g, '');
  }

  private hasUnresolvedPersonalReference(question: string, intent: BrainSemanticIntent): boolean {
    if (!/(?:她|他|这个客户|这位客户|这个客人|这位客人)/.test(question)) return false;
    return !intent.entities.some(
      (entity) =>
        entity.entityType === 'customer' && Boolean(entity.entityKey && entity.entityKey !== entity.entityType),
    );
  }

  private hasSpecificEntity(intent: BrainSemanticIntent, expectedType: 'customer' | 'project'): boolean {
    return intent.entities.some((entity) => {
      if (entity.entityType !== expectedType) return false;
      if (entity.entityKey && entity.entityKey !== entity.entityType) return true;
      const mention = this.normalize(entity.mention);
      return expectedType === 'customer'
        ? Boolean(mention && !/^(?:客户|顾客|客人|会员|她|他|这个客户|这位客户)$/.test(mention))
        : Boolean(mention && !/^(?:项目|服务|护理|这个项目|该项目)$/.test(mention));
    });
  }

  private hasAmbiguousNamedPeriod(question: string): boolean {
    return (
      /(?:国庆|春节|五一|劳动节|元旦|中秋)(?:期间|假期|前后)?/.test(question) &&
      !/(?:20\d{2}|今年|去年|前年)/.test(question)
    );
  }

  private pendingClarification(slots: Record<string, unknown>): string[] {
    const modelContext = this.record(slots.modelContext);
    const pending = this.record(modelContext.pendingClarification);
    return Array.isArray(pending.missingSlots)
      ? pending.missingSlots.filter((slot): slot is string => typeof slot === 'string')
      : [];
  }

  private normalize(value: string): string {
    return value
      .trim()
      .toLocaleLowerCase('zh-CN')
      .replace(/[\s，。！？、,.!?：:；;()（）_-]+/g, '');
  }

  private record(value: unknown): Record<string, unknown> {
    return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
  }
}
