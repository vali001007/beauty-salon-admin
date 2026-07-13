import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { BrainCognitionResult } from '../cognition/brain-cognition.service.js';
import type { BrainQuestionIntentResult } from '../cognition/brain-question-intent.service.js';
import { BrainTimeRangeParserService } from '../cognition/brain-time-range-parser.service.js';
import type { BrainRoleIntentPlan } from '../domain/brain-domain-adapter.types.js';
import type { SendBrainMessageDto } from '../dto/brain-chat.dto.js';
import { PrismaService } from '../../prisma/prisma.service.js';

export interface BrainConversationContextSnapshot {
  roleHint?: string;
  metrics: string[];
  dimensions: string[];
  entities: Array<{ slot: string; entityKey: string; label: string }>;
  intent?: string;
  answerShape?: string;
  timeRange?: {
    label: string;
    startDate: string;
    endDate: string;
    granularity: string;
  };
  updatedFromRunId?: number;
  updatedAt: string;
}

export interface BrainPreparedConversationTurn {
  dto: SendBrainMessageDto;
  cognition: BrainCognitionResult;
  runtimeIntent: BrainQuestionIntentResult;
  previous?: BrainConversationContextSnapshot;
  inheritedSlots: string[];
  corrections: Array<{ slot: string; previous: unknown; next: unknown }>;
}

@Injectable()
export class BrainConversationContextService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly timeRangeParser: BrainTimeRangeParserService,
  ) {}

  async prepareTurn(input: {
    conversationId: number;
    dto: SendBrainMessageDto;
    cognition: BrainCognitionResult;
    runtimeIntent: BrainQuestionIntentResult;
  }): Promise<BrainPreparedConversationTurn> {
    const conversation = await this.prisma.brainConversation.findUnique({
      where: { id: input.conversationId },
      select: { contextSnapshot: true },
    });
    const previous = this.parseSnapshot(conversation?.contextSnapshot);
    if (!previous || !this.isContinuation(input.dto.message)) {
      return {
        dto: input.dto,
        cognition: input.cognition,
        runtimeIntent: input.runtimeIntent,
        previous,
        inheritedSlots: [],
        corrections: this.detectCorrections(previous, input.cognition, input.dto.roleHint),
      };
    }

    const inheritedSlots: string[] = [];
    const cognition: BrainCognitionResult = {
      ...input.cognition,
      metrics: [...input.cognition.metrics],
      dimensions: [...input.cognition.dimensions],
      entities: [...input.cognition.entities],
    };

    if (!cognition.metrics.length && previous.metrics.length) {
      cognition.metrics = [...previous.metrics];
      inheritedSlots.push('metrics');
    }
    if (!cognition.dimensions.length && previous.dimensions.length && /(继续|还是|同样|那些|这些|呢)/.test(input.dto.message)) {
      cognition.dimensions = [...previous.dimensions];
      inheritedSlots.push('dimensions');
    }
    if (!cognition.entities.length && previous.entities.length && /(这个|那个|该|她|他|这位|上一个|刚才|继续|呢)/.test(input.dto.message)) {
      const ambiguous = this.findAmbiguousEntities(previous.entities);
      if (ambiguous.length) {
        cognition.needsClarification = true;
        cognition.clarification = this.buildEntityClarification(ambiguous);
      } else {
        cognition.entities = [...previous.entities];
        inheritedSlots.push('entities');
      }
    }

    let runtimeIntent = input.runtimeIntent;
    if (runtimeIntent.intent === 'unknown' && cognition.metrics.length) {
      runtimeIntent = {
        intent: 'scalar_metric',
        expectedShape: 'scalar_metric',
        allowsScalarMetric: true,
        expectedMetric: cognition.metrics[0],
        reason: 'conversation_context_metric_inheritance',
      };
      inheritedSlots.push('intent');
    } else if (!runtimeIntent.expectedMetric && cognition.metrics.length) {
      runtimeIntent = { ...runtimeIntent, expectedMetric: cognition.metrics[0] };
    }

    const parsedTime = this.timeRangeParser.parse(input.dto.message);
    const contextHints: string[] = [];
    if (!parsedTime.mentionedTime && previous.timeRange) {
      contextHints.push(previous.timeRange.label);
      inheritedSlots.push('timeRange');
    }
    if (inheritedSlots.includes('entities')) contextHints.push(previous.entities.map((entity) => entity.label).join('、'));

    const inheritedRole = input.dto.roleHint ?? (previous.roleHint as SendBrainMessageDto['roleHint'] | undefined);
    if (!input.dto.roleHint && inheritedRole) inheritedSlots.push('roleHint');

    return {
      dto: {
        ...input.dto,
        roleHint: inheritedRole,
        message: contextHints.length ? `${input.dto.message}（延续上下文：${contextHints.join('；')}）` : input.dto.message,
      },
      cognition,
      runtimeIntent,
      previous,
      inheritedSlots: [...new Set(inheritedSlots)],
      corrections: this.detectCorrections(previous, input.cognition, input.dto.roleHint),
    };
  }

  async updateAfterRun(input: {
    conversationId: number;
    runId: number;
    userId: number;
    storeId: number;
    dto: SendBrainMessageDto;
    cognition?: BrainCognitionResult;
    routePlan?: BrainRoleIntentPlan;
  }) {
    const current = await this.prisma.brainConversation.findFirst({
      where: { id: input.conversationId, userId: input.userId, storeId: input.storeId, deletedAt: null },
      select: { contextSnapshot: true, contextVersion: true },
    });
    if (!current) return null;

    const previous = this.parseSnapshot(current.contextSnapshot);
    const parsedTime = this.timeRangeParser.parse(input.dto.message);
    const next: BrainConversationContextSnapshot = {
      roleHint: input.dto.roleHint ?? input.routePlan?.role ?? previous?.roleHint,
      metrics: input.cognition?.metrics.length ? input.cognition.metrics : previous?.metrics ?? [],
      dimensions: input.cognition?.dimensions.length ? input.cognition.dimensions : previous?.dimensions ?? [],
      entities: input.cognition?.entities.length ? input.cognition.entities : previous?.entities ?? [],
      intent: input.routePlan?.intent ?? input.cognition?.intent.key ?? previous?.intent,
      answerShape: input.routePlan?.answerShape ?? previous?.answerShape,
      timeRange: parsedTime.range
        ? {
            label: parsedTime.range.label,
            startDate: parsedTime.range.startDate.toISOString(),
            endDate: parsedTime.range.endDate.toISOString(),
            granularity: parsedTime.range.granularity,
          }
        : previous?.timeRange,
      updatedFromRunId: input.runId,
      updatedAt: new Date().toISOString(),
    };

    return this.prisma.brainConversation.update({
      where: { id: input.conversationId },
      data: {
        contextSnapshot: next as unknown as Prisma.InputJsonValue,
        contextVersion: current.contextVersion + 1,
      },
    });
  }

  private isContinuation(message: string) {
    return /^(再|继续|接着|那|这个|那个|该|她|他|换成|改成|上一个|刚才)|[呢吗]$/.test(message.trim());
  }

  private parseSnapshot(value: Prisma.JsonValue | null | undefined): BrainConversationContextSnapshot | undefined {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
    const snapshot = value as Record<string, unknown>;
    return {
      roleHint: typeof snapshot.roleHint === 'string' ? snapshot.roleHint : undefined,
      metrics: Array.isArray(snapshot.metrics) ? snapshot.metrics.filter((item): item is string => typeof item === 'string') : [],
      dimensions: Array.isArray(snapshot.dimensions)
        ? snapshot.dimensions.filter((item): item is string => typeof item === 'string')
        : [],
      entities: Array.isArray(snapshot.entities)
        ? snapshot.entities.filter(
            (item): item is BrainConversationContextSnapshot['entities'][number] =>
              Boolean(item && typeof item === 'object' && 'slot' in item && 'entityKey' in item && 'label' in item),
          )
        : [],
      intent: typeof snapshot.intent === 'string' ? snapshot.intent : undefined,
      answerShape: typeof snapshot.answerShape === 'string' ? snapshot.answerShape : undefined,
      timeRange:
        snapshot.timeRange && typeof snapshot.timeRange === 'object' && !Array.isArray(snapshot.timeRange)
          ? (snapshot.timeRange as BrainConversationContextSnapshot['timeRange'])
          : undefined,
      updatedFromRunId: typeof snapshot.updatedFromRunId === 'number' ? snapshot.updatedFromRunId : undefined,
      updatedAt: typeof snapshot.updatedAt === 'string' ? snapshot.updatedAt : new Date(0).toISOString(),
    };
  }

  private detectCorrections(
    previous: BrainConversationContextSnapshot | undefined,
    cognition: BrainCognitionResult,
    roleHint?: string,
  ) {
    if (!previous) return [];
    const corrections: Array<{ slot: string; previous: unknown; next: unknown }> = [];
    if (cognition.metrics.length && previous.metrics.length && cognition.metrics[0] !== previous.metrics[0]) {
      corrections.push({ slot: 'metrics', previous: previous.metrics, next: cognition.metrics });
    }
    if (cognition.entities.length && previous.entities.length && cognition.entities[0].entityKey !== previous.entities[0].entityKey) {
      corrections.push({ slot: 'entities', previous: previous.entities, next: cognition.entities });
    }
    if (roleHint && previous.roleHint && roleHint !== previous.roleHint) {
      corrections.push({ slot: 'roleHint', previous: previous.roleHint, next: roleHint });
    }
    return corrections;
  }

  private findAmbiguousEntities(entities: BrainConversationContextSnapshot['entities']) {
    const bySlot = new Map<string, BrainConversationContextSnapshot['entities']>();
    for (const entity of entities) bySlot.set(entity.slot, [...(bySlot.get(entity.slot) ?? []), entity]);
    return [...bySlot.entries()].filter(([, items]) => items.length > 1);
  }

  private buildEntityClarification(ambiguous: Array<[string, BrainConversationContextSnapshot['entities']]>) {
    const options = ambiguous.flatMap(([slot, entities]) =>
      entities.map((entity) => ({
        id: `${slot}:${entity.entityKey}`,
        label: entity.label,
        value: { slot, candidate: entity.label },
      })),
    );
    return {
      question: `请确认你指的是：${options.map((option) => option.label).join(' / ')}`,
      options,
    };
  }
}
