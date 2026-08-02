import { Injectable } from '@nestjs/common';
import { resolveAskDataDateRange } from './ask-data-free-sql.date-range.js';
import type {
  AskDataSemanticAnswerShape,
  AskDataSemanticIntent,
  AskDataSemanticIntentName,
} from './ask-data-free-sql.types.js';
import {
  ASK_DATA_DIMENSION_ALIASES,
  ASK_DATA_SEMANTIC_CONTRACTS,
  ASK_DATA_SEMANTIC_PATTERNS,
  normalizeSemanticText,
  type AskDataSemanticMetricContract,
} from './ask-data-semantic-contracts.js';

export type AskDataParsedIntent = {
  semanticIntent: AskDataSemanticIntent;
  matchedContracts: Array<{ contract: AskDataSemanticMetricContract; score: number; matchedAliases: string[] }>;
};

@Injectable()
export class AskDataIntentParser {
  parse(question: string, now = new Date()): AskDataParsedIntent {
    const normalized = normalizeSemanticText(question);
    const answerShape = this.answerShape(normalized);
    const intent = this.intent(normalized, answerShape);
    const allMatches = ASK_DATA_SEMANTIC_CONTRACTS.map((contract) => {
      const matchedAliases = contract.aliases.filter((alias) => normalized.includes(normalizeSemanticText(alias)));
      const matchedPatterns = (ASK_DATA_SEMANTIC_PATTERNS[contract.metricKey] ?? []).filter((pattern) => pattern.test(normalized));
      const longest = Math.max(0, ...matchedAliases.map((alias) => normalizeSemanticText(alias).length));
      return {
        contract,
        matchedAliases,
        score:
          matchedAliases.length || matchedPatterns.length
            ? (contract.priority ?? 10) + longest * 3 + matchedAliases.length + matchedPatterns.length * 24
            : 0,
      };
    })
      .filter((item) => item.score > 0)
      .sort((left, right) => right.score - left.score || left.contract.metricKey.localeCompare(right.contract.metricKey));
    const explicitCombination = /对比|比较|相比|分别|以及|和|与|、/.test(question);
    const topScore = allMatches[0]?.score ?? 0;
    const matchedContracts = explicitCombination
      ? allMatches
      : allMatches.filter((item) => topScore - item.score <= 8);
    const dimensions = ASK_DATA_DIMENSION_ALIASES.filter((dimension) =>
      dimension.aliases.some((alias) => normalized.includes(normalizeSemanticText(alias))),
    ).map((dimension) => dimension.key);
    const timeRange = resolveAskDataDateRange(question, now);
    const assumptions: string[] = [];
    if (/(?:最近|近期|近一个月)/.test(normalized) && timeRange?.label === '近 30 天') {
      assumptions.push('“最近”按近 30 天查询。');
    }
    if (answerShape === 'ranking' && !/(?:前|top)\s*\d+/i.test(question)) {
      assumptions.push('未指定排行数量，默认返回前 10 名。');
    }
    if (answerShape === 'trend' && !/(按日|每日|每天|按月|每月|按周|每周)/.test(normalized)) {
      const days = timeRange ? (Date.parse(timeRange.endAt) - Date.parse(timeRange.startAt)) / 86_400_000 : 30;
      assumptions.push(days <= 30 ? '未指定趋势粒度，默认按日统计。' : '未指定趋势粒度，默认按月统计。');
    }
    if (/当前|现在|目前/.test(normalized)) assumptions.push('“当前”按最新可用数据查询。');

    const ambiguities: AskDataSemanticIntent['ambiguities'] = [];
    if (/(双十一|双十二|春节|国庆|中秋|端午|元旦|五一|618)/i.test(question) && !/(?:19|20)\d{2}/.test(question)) {
      ambiguities.push({ slot: 'year', reason: '活动或节日跨年份，年份会改变查询结果。', candidates: [] });
    }
    if (/(大额退款|大额订单|大额消费|高消费金额|高价值订单)/.test(normalized) && !this.hasExplicitThreshold(question)) {
      ambiguities.push({ slot: 'threshold', reason: '“大额/高价值”没有统一金额阈值。', candidates: [] });
    }
    const entities = this.entities(question);
    for (const entity of entities) {
      if (entity.mention.length <= 2 && /^(客户|员工|项目)$/.test(entity.type)) {
        ambiguities.push({
          slot: `${entity.type}_identity`,
          reason: `${entity.type}名称过短，可能对应多个对象。`,
          candidates: [],
        });
      }
    }

    const metricKeys = matchedContracts.map((item) => item.contract.metricKey);
    const confidence = this.confidence({ matchedContracts, dimensions, timeRange: Boolean(timeRange), answerShape, question });
    return {
      matchedContracts,
      semanticIntent: {
        intent,
        answerShape,
        metricKeys,
        dimensionKeys: [...new Set(dimensions)],
        entities,
        filters: this.filters(normalized),
        ...(timeRange ? { timeRange } : {}),
        ambiguities,
        assumptions,
        confidence,
      },
    };
  }

  private answerShape(text: string): AskDataSemanticAnswerShape {
    if (/对比|比较|相比|环比|同比|分别/.test(text)) return 'comparison';
    if (/趋势|走势|变化|按日|每日|每天|按月|每月|按周|每周/.test(text)) return 'trend';
    if (/排行|排名|最高|最低|最多|最少|top\d*|最受欢迎|最热门/.test(text)) return 'ranking';
    if (/哪些|列表|明细|记录|流水|逐笔|各个|每个|所有/.test(text)) return 'list';
    return 'scalar';
  }

  private intent(text: string, answerShape: AskDataSemanticAnswerShape): AskDataSemanticIntentName {
    if (/为什么|原因|诊断|异常原因|怎么回事/.test(text)) return 'diagnosis';
    if (answerShape === 'ranking') return 'ranking';
    if (answerShape === 'comparison') return 'comparison';
    if (answerShape === 'trend') return 'trend';
    if (answerShape === 'list') return 'list';
    return 'query';
  }

  private confidence(input: {
    matchedContracts: AskDataParsedIntent['matchedContracts'];
    dimensions: string[];
    timeRange: boolean;
    answerShape: AskDataSemanticAnswerShape;
    question: string;
  }) {
    if (!input.matchedContracts.length) return 0.35;
    const explicitCombination = /对比|比较|相比|分别|以及|和|与|、/.test(input.question);
    let score = input.matchedContracts.length === 1 ? 0.88 : explicitCombination ? 0.82 : 0.64;
    if (input.dimensions.length) score += 0.03;
    if (input.timeRange) score += 0.03;
    if (input.answerShape !== 'scalar') score += 0.02;
    return Math.min(0.98, Number(score.toFixed(2)));
  }

  private hasExplicitThreshold(question: string) {
    return /(?:大于|超过|高于|不少于|至少|>=?|￥|¥)\s*\d+(?:\.\d+)?\s*(?:元|块|万)?/i.test(question);
  }

  private entities(question: string): AskDataSemanticIntent['entities'] {
    const entities: AskDataSemanticIntent['entities'] = [];
    const quoted = [...question.matchAll(/(客户|会员|员工|美容师|项目|商品|供应商)?[“\"']([^”\"']{1,24})[”\"']/g)];
    for (const match of quoted) {
      const rawType = match[1] ?? 'entity';
      const type = /客户|会员/.test(rawType)
        ? '客户'
        : /员工|美容师/.test(rawType)
          ? '员工'
          : rawType || 'entity';
      entities.push({ type, mention: match[2].trim() });
    }
    return entities;
  }

  private filters(text: string): AskDataSemanticIntent['filters'] {
    const filters: AskDataSemanticIntent['filters'] = [];
    if (/已完成/.test(text)) filters.push({ key: 'status', operator: 'eq', value: 'completed' });
    if (/未完成/.test(text)) filters.push({ key: 'status', operator: 'not_in', value: ['completed', 'received', 'done'] });
    if (/未处理|未解决/.test(text)) filters.push({ key: 'status', operator: 'in', value: ['open', 'in_progress'] });
    if (/低评分/.test(text)) filters.push({ key: 'rating', operator: 'lte', value: 2 });
    return filters;
  }
}
