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

    const queryOnlyActionClarification = this.queryOnlyActionClarification(input.question, input.intent);
    if (queryOnlyActionClarification) {
      return this.withClarification(input.intent, queryOnlyActionClarification);
    }

    const genericEntityClarification = this.genericEntityClarification(input.question, input.intent);
    if (genericEntityClarification) {
      return this.withClarification(input.intent, genericEntityClarification);
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
      ['query', 'diagnosis'].includes(input.intent.intent) &&
      input.intent.metrics.length === 0 &&
      input.intent.entities.length === 0 &&
      input.intent.dimensions.length === 0 &&
      input.intent.domains.length > 1 &&
      this.isGenericBusinessAssessment(input.question)
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
    if (intent.metrics.some((metric) => this.isFinanceOrderProfitMetricDefinitionKey(metric.definitionKey))) return [];
    if (this.isGovernedStaffRevenueRanking(question, intent)) return [];
    const normalizedQuestion = this.normalizeMetricQuestion(question, intent);
    if (normalizedQuestion.length < 2) return [];
    if (/(?:服务收入|服务业绩|销售业绩|销售额|服务次数|服务量|提成)/.test(normalizedQuestion)) return [];
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
    if (matched.length > 1) {
      return [...new Set(matched.map((metric) => metric.name.trim()).filter(Boolean))].slice(0, 6);
    }

    if (!this.isGenericStaffPerformanceQuestion(normalizedQuestion)) return [];
    const performanceFamily = snapshot.metrics.filter((metric) => this.staffPerformanceMetricCategory(metric));
    const categories = new Set(performanceFamily.map((metric) => this.staffPerformanceMetricCategory(metric)));
    if (performanceFamily.length < 2 || categories.size < 2) return [];
    return [...new Set(performanceFamily.map((metric) => metric.name.trim()).filter(Boolean))].slice(0, 6);
  }

  private isGenericStaffPerformanceQuestion(normalizedQuestion: string): boolean {
    if (!/(?:业绩|绩效)/.test(normalizedQuestion)) return false;
    return !/(?:服务收入|服务业绩|销售业绩|销售额|服务次数|服务量|提成)/.test(normalizedQuestion);
  }

  private isGovernedStaffRevenueRanking(question: string, intent: BrainSemanticIntent): boolean {
    if (intent.intent !== 'ranking' || intent.answerShape !== 'ranking') return false;
    if (!intent.metrics.some((metric) => metric.definitionKey === 'metric.staff_service_revenue')) return false;
    return /(?:哪个|哪位|谁).*(?:美容师|员工|技师)?.*(?:业绩|服务收入|关联实收).*(?:最高|最好)|(?:美容师|员工|技师).*(?:业绩|服务收入|关联实收).*(?:最高|最好)/.test(
      question,
    );
  }

  private staffPerformanceMetricCategory(
    metric: ProductionReadyBusinessDefinitionSnapshot['metrics'][number],
  ): 'service_revenue' | 'sales_revenue' | 'service_count' | 'commission' | undefined {
    const semanticText = this.normalize(
      [metric.definitionKey, metric.metricKey, metric.name, metric.description, ...(metric.aliases ?? [])].join(' '),
    );
    const staffScoped = /(?:staff|beautician|employee|员工|美容师|顾问)/.test(semanticText);
    if (!staffScoped && !['staff', 'beautician', 'employee'].includes(metric.domain)) return undefined;
    if (/(?:commission|提成)/.test(semanticText)) return 'commission';
    if (/(?:servicecount|servicetimes|服务次数|服务量)/.test(semanticText)) return 'service_count';
    if (/(?:salesrevenue|salesamount|销售业绩|销售额)/.test(semanticText)) return 'sales_revenue';
    if (/(?:servicerevenue|服务收入|服务业绩)/.test(semanticText)) return 'service_revenue';
    return undefined;
  }

  private normalizeMetricQuestion(question: string, intent: BrainSemanticIntent): string {
    let normalized = this.normalize(question);
    for (const entity of intent.entities) normalized = normalized.replace(this.normalize(entity.mention), '');
    return normalized
      .replace(/^(?:帮我|请|看下|看看|查下|查询|分析)/, '')
      .replace(/(?:的|怎么样|如何|好不好|情况)$/g, '');
  }

  private isFinanceOrderProfitMetricDefinitionKey(definitionKey: string): boolean {
    const key = this.normalize(definitionKey);
    return (
      key.includes('order') &&
      (key.includes('grossprofit') || key.includes('totalcost') || key.includes('cost') || key.includes('margin'))
    );
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

  private queryOnlyActionClarification(
    question: string,
    intent: BrainSemanticIntent,
  ): { answerShape?: BrainSemanticIntent['answerShape']; missingSlots: string[]; reason: string; candidates: string[] } | undefined {
    if (!['action', 'workflow'].includes(intent.intent) && intent.answerShape !== 'action_preview') return undefined;
    if (/(?:充值|充钱|储值)/.test(question)) {
      const missingSlots = [
        ...(!this.hasSpecificEntity(intent, 'customer') ? ['customer'] : []),
        ...(!/(?:\d+(?:\.\d+)?\s*(?:元|块|人民币)|金额)/.test(question) ? ['amount'] : []),
      ];
      if (!missingSlots.length) return undefined;
      return {
        answerShape: 'clarification',
        missingSlots,
        reason: '充值属于资金动作，query_only 只能先核对客户与金额，不能直接执行充值成功',
        candidates: ['客户姓名/手机号', '充值金额', '充值卡项或账户'],
      };
    }
    if (/(?:核销|销卡|扣次|消次)/.test(question)) {
      const missingSlots = [
        ...(!this.hasSpecificEntity(intent, 'customer') ? ['customer'] : []),
        ...(!this.hasSpecificEntity(intent, 'project') ? ['project'] : []),
        ...(!/(?:卡|次卡|权益|服务记录|订单)/.test(question) ? ['cardOrServiceRecord'] : []),
      ];
      if (!missingSlots.length) return undefined;
      return {
        answerShape: 'clarification',
        missingSlots,
        reason: '核销属于权益/履约动作，query_only 只能查询可核销条件，不能直接执行核销成功',
        candidates: ['客户', '项目/服务记录', '卡项或权益'],
      };
    }
    return undefined;
  }

  private genericEntityClarification(
    question: string,
    intent: BrainSemanticIntent,
  ): { intent?: BrainSemanticIntent['intent']; answerShape?: BrainSemanticIntent['answerShape']; missingSlots: string[]; reason: string; candidates: string[] } | undefined {
    if (/(?:那个|这个|该|那位|这位).{0,8}(?:客户|客人|会员|卡|次卡|储值卡|会员卡)/.test(question) && !this.hasSpecificEntity(intent, 'customer')) {
      return {
        intent: 'clarify',
        answerShape: 'clarification',
        missingSlots: ['customer'],
        reason: '客户或卡项指代不唯一，需要先确认客户身份',
        candidates: ['客户姓名/手机号', '从上一轮客户列表选择序号', '补充卡项名称'],
      };
    }
    if (/(?:那个|这个|该).{0,8}(?:项目|服务|护理|耗材)/.test(question) && !this.hasSpecificEntity(intent, 'project')) {
      return {
        intent: 'clarify',
        answerShape: 'clarification',
        missingSlots: ['project'],
        reason: '项目或耗材对象不唯一，需要先确认项目名称或上一轮序号',
        candidates: ['项目名称', '上一轮列表序号', '商品/耗材名称'],
      };
    }
    return undefined;
  }

  private hasAmbiguousNamedPeriod(question: string): boolean {
    return (
      /(?:双十一|双十二|618|六一八|国庆|春节|五一|劳动节|元旦|中秋|端午|七夕)(?:期间|假期|前后)?/.test(question) &&
      !/(?:20\d{2}|今年|去年|前年)/.test(question)
    );
  }

  private isGenericBusinessAssessment(question: string): boolean {
    const normalized = this.normalize(question)
      .replace(/(?:今天|昨日|昨天|前天|本周|上周|这周|最近|近期|近来|这阵子|本月|上月|这个月|上个月)/g, '')
      .replace(/^(?:帮我|请|看下|看看|查下|查询|分析)/, '');
    return /^(?:(?:门店|店里|经营|生意)?(?:情况|表现)?(?:怎么样|如何|好不好|好吗|得好吗)|有什么问题(?:吗)?)$/.test(
      normalized,
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
