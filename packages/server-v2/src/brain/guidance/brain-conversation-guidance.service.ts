import { Injectable } from '@nestjs/common';
import type { BrainSemanticIntent } from '../cognition/brain-semantic-intent.types.js';
import type { BrainRequestContext } from '../context/brain-request-context.js';
import type { BrainModelPendingClarification } from '../context/brain-conversation-context.service.js';
import type {
  BrainCapabilityRankedCandidate,
  BrainCapabilityRetrievalResult,
} from '../capability/brain-capability-retriever.service.js';
import { BrainCapabilityRetrieverService } from '../capability/brain-capability-retriever.service.js';
import type { BrainCapabilityCard } from '../capability/brain-capability.types.js';

export interface BrainGuidanceOption {
  id: string;
  label: string;
  value: string;
  capabilityKey: string;
}

export type BrainGuidanceClarificationResult =
  | {
      status: 'clarify';
      question: string;
      options: BrainGuidanceOption[];
      pendingClarification: BrainModelPendingClarification;
      capabilityKeys: string[];
    }
  | { status: 'insufficient'; capabilityKeys: string[] }
  | { status: 'exhausted'; capabilityKeys: string[] };

@Injectable()
export class BrainConversationGuidanceService {
  constructor(private readonly retriever: BrainCapabilityRetrieverService) {}

  isBroadQuestion(question: string, intent: Pick<BrainSemanticIntent, 'domains'>): boolean {
    if (!intent.domains.length) return false;
    const normalized = normalize(question);
    const hasBroadCue =
      /(?:情况怎么样|情况如何|怎么样|如何|整体|概览|总览|总结|最近怎样|最近如何|有什么风险|哪些风险|需要关注什么|有什么问题|负责情况)$/.test(
        normalized,
      );
    if (!hasBroadCue) return false;
    return !/(?:多少|金额|数量|占比|比例|排名|排行|top\d*|趋势|同比|环比|对比|明细|名单|哪一|哪个|谁|创建|修改|取消|发送|执行|确认|拒绝|今日|今天|明天|昨天|本周|上周|本月|上月|今年|去年|\d)/i.test(
      normalized,
    );
  }

  isOverviewCapability(card: BrainCapabilityCard): boolean {
    const content = [card.name, card.description, ...card.synonyms, ...card.examples].join(' ');
    return /(?:概览|总览|整体情况|经营情况|运营情况|风险全景|经营驾驶舱)/.test(content);
  }

  buildClarification(input: {
    question: string;
    intent: Pick<BrainSemanticIntent, 'domains'>;
    context: BrainRequestContext;
    cards: readonly BrainCapabilityCard[];
    seedCandidates?: readonly BrainCapabilityRankedCandidate[];
    previousPending?: BrainModelPendingClarification;
  }): BrainGuidanceClarificationResult {
    const previousTurns = input.previousPending?.turnCount ?? 0;
    if (previousTurns >= 2) return { status: 'exhausted', capabilityKeys: [] };

    const ranked = this.mergeCandidates(
      input.seedCandidates ?? [],
      this.retriever.retrieveGuidanceCandidates({
        domains: input.intent.domains,
        question: input.question,
        context: input.context,
        cards: input.cards,
        limit: 12,
      }),
    );
    const options = this.optionsFromCandidates(ranked, input.question, 4);
    if (options.length < 2) {
      return { status: 'insufficient', capabilityKeys: options.map((option) => option.capabilityKey) };
    }

    const question = input.intent.domains.length
      ? '我已经识别到业务范围，但还需要明确你最想看的目标。请选择一个方向：'
      : '请先选择你想了解的业务目标：';
    const pendingClarification: BrainModelPendingClarification = {
      missingSlots: ['objective'],
      questions: [question],
      turnCount: previousTurns + 1,
      ambiguities: [
        {
          slot: 'objective',
          reason: '当前问题可对应多个已发布业务能力，直接执行会扩大或误解查询范围',
          candidates: options.map((option) => option.value),
        },
      ],
    };
    return {
      status: 'clarify',
      question,
      options,
      pendingClarification,
      capabilityKeys: options.map((option) => option.capabilityKey),
    };
  }

  buildFollowUpQuestions(input: {
    question: string;
    intent: Pick<BrainSemanticIntent, 'domains'>;
    selected: BrainCapabilityCard;
    context: BrainRequestContext;
    cards: readonly BrainCapabilityCard[];
  }): BrainGuidanceOption[] {
    const ranked = this.retriever.retrieveGuidanceCandidates({
      domains: input.intent.domains.length ? input.intent.domains : input.selected.domains,
      question: input.question,
      context: input.context,
      cards: input.cards.filter((card) => card.key !== input.selected.key),
      limit: 20,
    });
    const options = this.optionsFromCandidates(ranked, input.question, 3, true);
    return options.length === 3 ? options : [];
  }

  shouldClarifySelectedBroadQuestion(input: {
    question: string;
    intent: Pick<BrainSemanticIntent, 'domains'>;
    retrieval: BrainCapabilityRetrievalResult;
  }): boolean {
    return Boolean(
      this.isBroadQuestion(input.question, input.intent) &&
      input.retrieval.status === 'selected' &&
      input.retrieval.selected &&
      !this.isOverviewCapability(input.retrieval.selected),
    );
  }

  private optionsFromCandidates(
    candidates: readonly BrainCapabilityRankedCandidate[],
    originalQuestion: string,
    limit: number,
    requireIntentDiversity = false,
  ): BrainGuidanceOption[] {
    const original = normalize(originalQuestion);
    const usedCards = new Set<string>();
    const usedTexts = new Set<string>();
    const usedIntents = new Set<string>();
    const options: BrainGuidanceOption[] = [];
    const append = (candidate: BrainCapabilityRankedCandidate, enforceIntentDiversity: boolean) => {
      if (usedCards.has(candidate.card.key)) return;
      const intent = candidate.card.intents[0] ?? 'query';
      if (enforceIntentDiversity && usedIntents.has(intent)) return;
      const example = candidate.card.examples.find((value) => {
        const normalized = normalize(value);
        return normalized.length >= 4 && normalized !== original && !usedTexts.has(normalized);
      });
      if (!example) return;
      const normalizedExample = normalize(example);
      usedCards.add(candidate.card.key);
      usedTexts.add(normalizedExample);
      usedIntents.add(intent);
      options.push({
        id: `${candidate.card.key}:${options.length + 1}`,
        label: candidate.card.name,
        value: ensureQuestion(example),
        capabilityKey: candidate.card.key,
      });
    };

    if (requireIntentDiversity) {
      for (const candidate of candidates) {
        append(candidate, true);
        if (options.length >= limit) return options;
      }
    }
    for (const candidate of candidates) {
      append(candidate, false);
      if (options.length >= limit) break;
    }
    return options;
  }

  private mergeCandidates(
    first: readonly BrainCapabilityRankedCandidate[],
    second: readonly BrainCapabilityRankedCandidate[],
  ): BrainCapabilityRankedCandidate[] {
    const byKey = new Map<string, BrainCapabilityRankedCandidate>();
    for (const candidate of [...first, ...second]) {
      const current = byKey.get(candidate.card.key);
      if (!current || candidate.score > current.score) byKey.set(candidate.card.key, candidate);
    }
    return [...byKey.values()].sort(
      (left, right) => right.score - left.score || left.card.name.localeCompare(right.card.name),
    );
  }
}

function normalize(value: string): string {
  return value.toLowerCase().replace(/[\s？?。！!，,、：:；;（）()_-]+/g, '');
}

function ensureQuestion(value: string): string {
  const trimmed = value.trim().replace(/[。！!]+$/u, '');
  return /[？?]$/u.test(trimmed) ? trimmed : `${trimmed}？`;
}
