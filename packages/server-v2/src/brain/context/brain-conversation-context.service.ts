import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { BrainCognitionResult } from '../cognition/brain-cognition.service.js';
import type { BrainQuestionIntentResult } from '../cognition/brain-question-intent.service.js';
import { BrainTimeRangeParserService } from '../cognition/brain-time-range-parser.service.js';
import type {
  BrainDefinitionRef,
  BrainSemanticAmbiguity,
  BrainSemanticEntityReference,
  BrainSemanticIntent,
  BrainSemanticTimeRange,
} from '../cognition/brain-semantic-intent.types.js';
import { BRAIN_SEMANTIC_ANSWER_SHAPES, BRAIN_SEMANTIC_INTENTS } from '../cognition/brain-semantic-intent.types.js';
import type { ProductionReadyBusinessDefinitionSnapshot } from '../cognition/business-definition-snapshot.types.js';
import type { BrainRoleIntentPlan } from '../domain/brain-domain-adapter.types.js';
import type { SendBrainMessageDto } from '../dto/brain-chat.dto.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { isBrainModelResultSet, type BrainModelResultSet } from './brain-result-reference.service.js';

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

export interface BrainPreparedModelConversationTurn {
  dto: SendBrainMessageDto;
  previous?: BrainModelConversationContextSnapshot;
  directives?: BrainModelConversationTurnDirectives;
  rejectionCode?: 'MODEL_CONTEXT_INVALID' | 'MODEL_CONTEXT_STALE' | 'MODEL_CONTEXT_SNAPSHOT_UNAVAILABLE';
}

export interface BrainModelConversationCorrection {
  slot: 'entities' | 'metrics' | 'dimensions' | 'objective' | 'capability';
  previous: string;
  next: string;
}

export interface BrainModelConversationTurnDirectives {
  mode: 'continue' | 'resolve_pending_or_new';
  inherit: Array<'objective' | 'entities' | 'metrics' | 'dimensions' | 'timeRange' | 'capability'>;
  doNotInherit: Array<'objective' | 'entities' | 'metrics' | 'dimensions' | 'timeRange' | 'capability'>;
  replace?: { timeRange?: BrainSemanticTimeRange };
  resolve?: { comparisonTarget?: BrainSemanticTimeRange };
  corrections: BrainModelConversationCorrection[];
  pendingSlots?: string[];
  pendingQuestion?: string;
}

export interface BrainModelPendingClarification {
  missingSlots: string[];
  questions: string[];
  ambiguities: BrainSemanticAmbiguity[];
  turnCount?: number;
}

export interface BrainModelConversationContextSnapshot {
  version: 1;
  objective: string;
  definitionRefs: BrainDefinitionRef[];
  metrics: Array<BrainDefinitionRef<'metric'>>;
  dimensions: Array<BrainDefinitionRef<'dimension'>>;
  entities: BrainSemanticEntityReference[];
  intent: BrainSemanticIntent['intent'];
  answerShape: BrainSemanticIntent['answerShape'];
  timeRange?: BrainSemanticTimeRange;
  capability?: { key: string; version: number };
  resultSets: BrainModelResultSet[];
  pendingClarification?: BrainModelPendingClarification;
  lastCorrections: BrainModelConversationCorrection[];
  updatedFromRunId: number;
  updatedAt: string;
}

@Injectable()
export class BrainConversationContextService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly timeRangeParser: BrainTimeRangeParserService,
  ) {}

  async prepareModelTurn(input: {
    conversationId: number;
    dto: SendBrainMessageDto;
    snapshot?: ProductionReadyBusinessDefinitionSnapshot | null;
  }): Promise<BrainPreparedModelConversationTurn> {
    const conversation = await this.prisma.brainConversation.findUnique({
      where: { id: input.conversationId },
      select: { contextSnapshot: true },
    });
    const previous = this.parseModelSnapshot(conversation?.contextSnapshot);
    if (!previous) {
      return {
        dto: input.dto,
        ...(this.hasModelSnapshot(conversation?.contextSnapshot)
          ? { rejectionCode: 'MODEL_CONTEXT_INVALID' as const }
          : {}),
      };
    }
    if (input.snapshot === null) {
      return { dto: input.dto, rejectionCode: 'MODEL_CONTEXT_SNAPSHOT_UNAVAILABLE' };
    }
    if (input.snapshot && !this.isBoundToSnapshot(previous, input.snapshot)) {
      return { dto: input.dto, rejectionCode: 'MODEL_CONTEXT_STALE' };
    }
    return { dto: input.dto, previous, directives: this.buildModelTurnDirectives(input.dto, previous) };
  }

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
    if (
      !cognition.dimensions.length &&
      previous.dimensions.length &&
      /(继续|还是|同样|那些|这些|呢)/.test(input.dto.message)
    ) {
      cognition.dimensions = [...previous.dimensions];
      inheritedSlots.push('dimensions');
    }
    if (
      !cognition.entities.length &&
      previous.entities.length &&
      /(这个|那个|该|她|他|这位|上一个|刚才|继续|呢)/.test(input.dto.message)
    ) {
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
    if (inheritedSlots.includes('entities'))
      contextHints.push(previous.entities.map((entity) => entity.label).join('、'));

    const inheritedRole = input.dto.roleHint ?? (previous.roleHint as SendBrainMessageDto['roleHint'] | undefined);
    if (!input.dto.roleHint && inheritedRole) inheritedSlots.push('roleHint');

    return {
      dto: {
        ...input.dto,
        roleHint: inheritedRole,
        message: contextHints.length
          ? `${input.dto.message}（延续上下文：${contextHints.join('；')}）`
          : input.dto.message,
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
    const model = this.parseModelSnapshot(current.contextSnapshot);
    const parsedTime = this.timeRangeParser.parse(input.dto.message);
    const next: BrainConversationContextSnapshot = {
      roleHint: input.dto.roleHint ?? input.routePlan?.role ?? previous?.roleHint,
      metrics: input.cognition?.metrics.length ? input.cognition.metrics : (previous?.metrics ?? []),
      dimensions: input.cognition?.dimensions.length ? input.cognition.dimensions : (previous?.dimensions ?? []),
      entities: input.cognition?.entities.length ? input.cognition.entities : (previous?.entities ?? []),
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
        contextSnapshot: { ...next, ...(model ? { model } : {}) } as unknown as Prisma.InputJsonValue,
        contextVersion: current.contextVersion + 1,
      },
    });
  }

  async updateAfterModelRun(input: {
    conversationId: number;
    runId: number;
    userId: number;
    storeId: number;
    intent: BrainSemanticIntent;
    capability?: { key: string; version: number };
    resultSets?: BrainModelResultSet[];
    corrections?: BrainModelConversationCorrection[];
    pendingClarification?: BrainModelPendingClarification;
  }) {
    const current = await this.prisma.brainConversation.findFirst({
      where: { id: input.conversationId, userId: input.userId, storeId: input.storeId, deletedAt: null },
      select: { contextSnapshot: true, contextVersion: true },
    });
    if (!current) return null;

    const root =
      current.contextSnapshot && typeof current.contextSnapshot === 'object' && !Array.isArray(current.contextSnapshot)
        ? (current.contextSnapshot as Record<string, unknown>)
        : {};
    const previousModel = this.parseModelSnapshot(current.contextSnapshot);
    const resultSets = input.resultSets ?? previousModel?.resultSets ?? [];
    const next: BrainModelConversationContextSnapshot = {
      version: 1,
      objective: input.intent.objective.slice(0, 500),
      definitionRefs: this.intentDefinitionRefs(input.intent),
      metrics: input.intent.metrics.map((metric) => ({ ...metric })),
      dimensions: input.intent.dimensions.map((dimension) => ({ ...dimension })),
      entities: input.intent.entities.map((entity) => ({
        ...entity,
        ...(entity.definitionRef ? { definitionRef: { ...entity.definitionRef } } : {}),
      })),
      intent: input.intent.intent,
      answerShape: input.intent.answerShape,
      ...(input.intent.timeRange ? { timeRange: this.normalizeModelTimeRange(input.intent.timeRange) } : {}),
      ...(input.capability ? { capability: { ...input.capability } } : {}),
      resultSets: resultSets.map((set) => ({
        ...set,
        items: set.items.map((item) => ({
          ...item,
          ...(item.definitionRef ? { definitionRef: { ...item.definitionRef } } : {}),
        })),
      })),
      ...(input.pendingClarification
        ? {
            pendingClarification: {
              missingSlots: [...input.pendingClarification.missingSlots],
              questions: [...input.pendingClarification.questions],
              ...(input.pendingClarification.turnCount ? { turnCount: input.pendingClarification.turnCount } : {}),
              ambiguities: input.pendingClarification.ambiguities.map((ambiguity) => ({
                ...ambiguity,
                candidates: [...ambiguity.candidates],
              })),
            },
          }
        : {}),
      lastCorrections: (input.corrections ?? []).map((correction) => ({ ...correction })),
      updatedFromRunId: input.runId,
      updatedAt: new Date().toISOString(),
    };

    return this.prisma.brainConversation.update({
      where: { id: input.conversationId },
      data: {
        contextSnapshot: { ...root, model: next } as unknown as Prisma.InputJsonValue,
        contextVersion: current.contextVersion + 1,
      },
    });
  }

  private isContinuation(message: string) {
    return /^(再|继续|接着|那|这个|那个|该|她|她们|他|他们|其中|具体|换成|改成|上一个|刚才|不对|我不要|不要|太复杂|简单说|给她|给他们|给她们|比上|为什么比|适合搭配|能不能再)|[呢吗]$/.test(
      message.trim(),
    );
  }

  private parseSnapshot(value: Prisma.JsonValue | null | undefined): BrainConversationContextSnapshot | undefined {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
    const snapshot = value as Record<string, unknown>;
    return {
      roleHint: typeof snapshot.roleHint === 'string' ? snapshot.roleHint : undefined,
      metrics: Array.isArray(snapshot.metrics)
        ? snapshot.metrics.filter((item): item is string => typeof item === 'string')
        : [],
      dimensions: Array.isArray(snapshot.dimensions)
        ? snapshot.dimensions.filter((item): item is string => typeof item === 'string')
        : [],
      entities: Array.isArray(snapshot.entities)
        ? snapshot.entities.filter((item): item is BrainConversationContextSnapshot['entities'][number] =>
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

  private parseModelSnapshot(
    value: Prisma.JsonValue | null | undefined,
  ): BrainModelConversationContextSnapshot | undefined {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
    const root = value as Record<string, unknown>;
    const modelDescriptor = Object.getOwnPropertyDescriptor(root, 'model');
    if (!modelDescriptor || !('value' in modelDescriptor) || !this.isStrictJsonValue(modelDescriptor.value)) {
      return undefined;
    }
    if (!modelDescriptor.value || typeof modelDescriptor.value !== 'object' || Array.isArray(modelDescriptor.value)) {
      return undefined;
    }
    const snapshot = modelDescriptor.value as Record<string, unknown>;
    if (
      snapshot.version !== 1 ||
      !this.hasOnlyKeys(snapshot, [
        'version',
        'objective',
        'definitionRefs',
        'metrics',
        'dimensions',
        'entities',
        'intent',
        'answerShape',
        'timeRange',
        'capability',
        'resultSets',
        'pendingClarification',
        'lastCorrections',
        'updatedFromRunId',
        'updatedAt',
      ]) ||
      (snapshot.objective !== undefined &&
        (!this.isNonEmptyString(snapshot.objective) || (snapshot.objective as string).length > 500)) ||
      !Array.isArray(snapshot.definitionRefs) ||
      !snapshot.definitionRefs.every((ref) => this.isDefinitionRef(ref)) ||
      (snapshot.metrics !== undefined &&
        (!Array.isArray(snapshot.metrics) ||
          !snapshot.metrics.every((ref) => this.isDefinitionRef(ref) && ref.definitionType === 'metric'))) ||
      (snapshot.dimensions !== undefined &&
        (!Array.isArray(snapshot.dimensions) ||
          !snapshot.dimensions.every((ref) => this.isDefinitionRef(ref) && ref.definitionType === 'dimension'))) ||
      !Array.isArray(snapshot.entities) ||
      !snapshot.entities.every((entity) => this.isModelEntity(entity)) ||
      !BRAIN_SEMANTIC_INTENTS.includes(snapshot.intent as BrainSemanticIntent['intent']) ||
      !BRAIN_SEMANTIC_ANSWER_SHAPES.includes(snapshot.answerShape as BrainSemanticIntent['answerShape']) ||
      !Number.isInteger(snapshot.updatedFromRunId) ||
      (snapshot.updatedFromRunId as number) <= 0 ||
      !this.isIsoTimestamp(snapshot.updatedAt)
    ) {
      return undefined;
    }
    if (
      (snapshot.timeRange !== undefined && !this.isModelTimeRange(snapshot.timeRange)) ||
      (snapshot.capability !== undefined && !this.isModelCapability(snapshot.capability)) ||
      (snapshot.resultSets !== undefined &&
        (!Array.isArray(snapshot.resultSets) ||
          snapshot.resultSets.length > 12 ||
          !snapshot.resultSets.every((set) => isBrainModelResultSet(set)))) ||
      (snapshot.pendingClarification !== undefined &&
        !this.isModelPendingClarification(snapshot.pendingClarification)) ||
      (snapshot.lastCorrections !== undefined &&
        (!Array.isArray(snapshot.lastCorrections) ||
          !snapshot.lastCorrections.every((correction) => this.isModelCorrection(correction))))
    ) {
      return undefined;
    }

    return {
      version: 1,
      objective: typeof snapshot.objective === 'string' ? snapshot.objective : '延续上一轮目标',
      definitionRefs: snapshot.definitionRefs.map((ref) => ({ ...ref })),
      metrics: (Array.isArray(snapshot.metrics)
        ? snapshot.metrics
        : snapshot.definitionRefs.filter((ref) => ref.definitionType === 'metric')
      ).map((ref) => ({ ...ref })) as Array<BrainDefinitionRef<'metric'>>,
      dimensions: (Array.isArray(snapshot.dimensions)
        ? snapshot.dimensions
        : snapshot.definitionRefs.filter((ref) => ref.definitionType === 'dimension')
      ).map((ref) => ({ ...ref })) as Array<BrainDefinitionRef<'dimension'>>,
      entities: snapshot.entities.map((entity) => ({
        ...entity,
        ...(entity.definitionRef ? { definitionRef: { ...entity.definitionRef } } : {}),
      })),
      intent: snapshot.intent as BrainSemanticIntent['intent'],
      answerShape: snapshot.answerShape as BrainSemanticIntent['answerShape'],
      timeRange: snapshot.timeRange ? { ...snapshot.timeRange } : undefined,
      capability: snapshot.capability ? { ...snapshot.capability } : undefined,
      resultSets: Array.isArray(snapshot.resultSets)
        ? snapshot.resultSets.map((set) => ({
            ...set,
            items: set.items.map((item) => ({
              ...item,
              ...(item.definitionRef ? { definitionRef: { ...item.definitionRef } } : {}),
            })),
          }))
        : [],
      pendingClarification: snapshot.pendingClarification
        ? {
            missingSlots: [...snapshot.pendingClarification.missingSlots],
            questions: [...snapshot.pendingClarification.questions],
            ...(snapshot.pendingClarification.turnCount ? { turnCount: snapshot.pendingClarification.turnCount } : {}),
            ambiguities: snapshot.pendingClarification.ambiguities.map((ambiguity) => ({
              ...ambiguity,
              candidates: [...ambiguity.candidates],
            })),
          }
        : undefined,
      lastCorrections: Array.isArray(snapshot.lastCorrections)
        ? (snapshot.lastCorrections.map((correction) => ({ ...correction })) as BrainModelConversationCorrection[])
        : [],
      updatedFromRunId: snapshot.updatedFromRunId as number,
      updatedAt: snapshot.updatedAt,
    };
  }

  private isDefinitionRef(value: unknown): value is BrainDefinitionRef {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    const ref = value as Record<string, unknown>;
    return (
      this.hasOnlyKeys(ref, [
        'definitionType',
        'definitionKey',
        'definitionVersion',
        'definitionFingerprint',
        'sourceFingerprint',
      ]) &&
      ['entity', 'relation', 'metric', 'dimension', 'field', 'action'].includes(String(ref.definitionType)) &&
      this.isNonEmptyString(ref.definitionKey) &&
      Number.isInteger(ref.definitionVersion) &&
      (ref.definitionVersion as number) > 0 &&
      this.isSha256(ref.definitionFingerprint) &&
      this.isSha256(ref.sourceFingerprint)
    );
  }

  private isModelEntity(value: unknown): value is BrainSemanticEntityReference {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    const entity = value as Record<string, unknown>;
    return Boolean(
      this.hasOnlyKeys(entity, ['entityType', 'entityKey', 'mention', 'source', 'definitionRef', 'confidence']) &&
      this.isNonEmptyString(entity.entityType) &&
      (entity.entityKey === undefined || this.isNonEmptyString(entity.entityKey)) &&
      this.isNonEmptyString(entity.mention) &&
      ['user', 'conversation', 'memory', 'system'].includes(String(entity.source)) &&
      typeof entity.confidence === 'number' &&
      Number.isFinite(entity.confidence) &&
      entity.confidence >= 0 &&
      entity.confidence <= 1 &&
      (entity.definitionRef === undefined ||
        (this.isDefinitionRef(entity.definitionRef) && entity.definitionRef.definitionType === 'entity')),
    );
  }

  private isSnapshotTimeRange(value: unknown): value is NonNullable<BrainConversationContextSnapshot['timeRange']> {
    return Boolean(
      value &&
      typeof value === 'object' &&
      typeof (value as Record<string, unknown>).label === 'string' &&
      typeof (value as Record<string, unknown>).startDate === 'string' &&
      typeof (value as Record<string, unknown>).endDate === 'string' &&
      typeof (value as Record<string, unknown>).granularity === 'string',
    );
  }

  private isModelTimeRange(value: unknown): value is BrainSemanticTimeRange {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    const range = value as Record<string, unknown>;
    if (
      !this.hasOnlyKeys(range, ['preset', 'startDate', 'endDate', 'label', 'timezone']) ||
      !this.isNonEmptyString(range.label) ||
      !['Asia/Shanghai', 'UTC'].includes(String(range.timezone)) ||
      (range.preset !== undefined && !this.isNonEmptyString(range.preset)) ||
      (range.startDate !== undefined && !this.isIsoDate(range.startDate)) ||
      (range.endDate !== undefined && !this.isIsoDate(range.endDate))
    ) {
      return false;
    }
    return !(
      typeof range.startDate === 'string' &&
      typeof range.endDate === 'string' &&
      range.startDate > range.endDate
    );
  }

  private isModelCapability(value: unknown): value is { key: string; version: number } {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    const capability = value as Record<string, unknown>;
    return Boolean(
      this.hasOnlyKeys(capability, ['key', 'version']) &&
      this.isNonEmptyString(capability.key) &&
      Number.isInteger(capability.version) &&
      (capability.version as number) > 0,
    );
  }

  private isModelCorrection(value: unknown): value is BrainModelConversationCorrection {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    const correction = value as Record<string, unknown>;
    return Boolean(
      this.hasOnlyKeys(correction, ['slot', 'previous', 'next']) &&
      ['entities', 'metrics', 'dimensions', 'objective', 'capability'].includes(String(correction.slot)) &&
      this.isNonEmptyString(correction.previous) &&
      this.isNonEmptyString(correction.next) &&
      (correction.previous as string).length <= 80 &&
      (correction.next as string).length <= 80,
    );
  }

  private hasModelSnapshot(value: Prisma.JsonValue | null | undefined) {
    return Boolean(value && typeof value === 'object' && !Array.isArray(value) && 'model' in value);
  }

  private isBoundToSnapshot(
    context: BrainModelConversationContextSnapshot,
    snapshot: ProductionReadyBusinessDefinitionSnapshot,
  ) {
    const refs = [
      ...context.definitionRefs,
      ...context.entities.flatMap((entity) => (entity.definitionRef ? [entity.definitionRef] : [])),
      ...context.resultSets.flatMap((set) =>
        set.items.flatMap((item) => (item.definitionRef ? [item.definitionRef] : [])),
      ),
    ];
    return refs.every((ref) => this.hasCurrentDefinition(snapshot, ref));
  }

  private hasCurrentDefinition(snapshot: ProductionReadyBusinessDefinitionSnapshot, ref: BrainDefinitionRef) {
    const definitions =
      ref.definitionType === 'entity'
        ? snapshot.entities
        : ref.definitionType === 'relation'
          ? snapshot.relations
          : ref.definitionType === 'metric'
            ? snapshot.metrics
            : ref.definitionType === 'dimension'
              ? snapshot.dimensions
              : [];
    return definitions.some(
      (definition) =>
        definition.definitionKey === ref.definitionKey &&
        definition.version === ref.definitionVersion &&
        definition.definitionFingerprint === ref.definitionFingerprint &&
        definition.sourceFingerprint === ref.sourceFingerprint,
    );
  }

  private hasOnlyKeys(value: Record<string, unknown>, keys: string[]) {
    const allowed = new Set(keys);
    return Reflect.ownKeys(value).every((key) => typeof key === 'string' && allowed.has(key));
  }

  private isStrictJsonValue(value: unknown, seen = new WeakSet<object>(), state = { nodes: 0 }, depth = 0): boolean {
    if (value === null || typeof value === 'string' || typeof value === 'boolean') return true;
    if (typeof value === 'number') return Number.isFinite(value);
    if (typeof value !== 'object' || depth > 16 || state.nodes >= 512) return false;

    const objectValue = value as object;
    if (seen.has(objectValue)) return false;
    seen.add(objectValue);
    state.nodes += 1;

    try {
      const prototype = Object.getPrototypeOf(objectValue);
      if (Array.isArray(value)) {
        if (prototype !== Array.prototype) return false;
        const keys = Reflect.ownKeys(value);
        const indices = new Set<number>();
        for (const key of keys) {
          if (typeof key !== 'string') return false;
          if (key === 'length') continue;
          if (!/^(0|[1-9]\d*)$/.test(key)) return false;
          const index = Number(key);
          if (!Number.isSafeInteger(index) || index < 0 || index >= value.length) return false;
          const descriptor = Object.getOwnPropertyDescriptor(value, key);
          if (!descriptor || !('value' in descriptor) || !descriptor.enumerable) return false;
          if (!this.isStrictJsonValue(descriptor.value, seen, state, depth + 1)) return false;
          indices.add(index);
        }
        return indices.size === value.length;
      }

      if (prototype !== Object.prototype && prototype !== null) return false;
      for (const key of Reflect.ownKeys(objectValue)) {
        if (typeof key !== 'string' || ['__proto__', 'prototype', 'constructor'].includes(key)) return false;
        const descriptor = Object.getOwnPropertyDescriptor(objectValue, key);
        if (!descriptor || !('value' in descriptor) || !descriptor.enumerable) return false;
        if (!this.isStrictJsonValue(descriptor.value, seen, state, depth + 1)) return false;
      }
      return true;
    } catch {
      return false;
    } finally {
      seen.delete(objectValue);
    }
  }

  private isNonEmptyString(value: unknown): value is string {
    return typeof value === 'string' && value.trim().length > 0;
  }

  private isSha256(value: unknown): value is string {
    return typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
  }

  private isIsoDate(value: unknown): value is string {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const date = new Date(`${value}T00:00:00.000Z`);
    return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
  }

  private isIsoTimestamp(value: unknown): value is string {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)) {
      return false;
    }
    const date = new Date(value);
    return !Number.isNaN(date.getTime()) && date.toISOString() === value;
  }

  private intentDefinitionRefs(intent: BrainSemanticIntent): BrainDefinitionRef[] {
    const refs = [
      ...intent.metrics,
      ...intent.dimensions,
      ...intent.entities.flatMap((entity) => (entity.definitionRef ? [entity.definitionRef] : [])),
      ...intent.filters.map((filter) => filter.fieldRef),
      ...intent.orderBy.map((order) => order.definitionRef),
    ];
    const seen = new Set<string>();
    return refs.filter((ref) => {
      const key = `${ref.definitionType}:${ref.definitionKey}:${ref.definitionVersion}:${ref.definitionFingerprint}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  private buildModelTurnDirectives(
    dto: SendBrainMessageDto,
    previous: BrainModelConversationContextSnapshot,
  ): BrainModelConversationTurnDirectives | undefined {
    const corrections = this.detectModelCorrections(dto.message);
    const pendingClarification = previous.pendingClarification;
    const continuation = Boolean(pendingClarification) || this.isContinuation(dto.message) || corrections.length > 0;
    if (!continuation) {
      return corrections.length ? { mode: 'continue', inherit: [], doNotInherit: [], corrections } : undefined;
    }

    const inherit: BrainModelConversationTurnDirectives['inherit'] = [
      'objective',
      'entities',
      'metrics',
      'dimensions',
      'capability',
    ];
    const doNotInherit: BrainModelConversationTurnDirectives['doNotInherit'] = [];
    if (corrections.some((correction) => correction.slot === 'entities')) {
      this.removeDirective(inherit, 'entities');
      this.removeDirective(inherit, 'objective');
      doNotInherit.push('entities', 'objective');
    }

    const correctedTimeExpression = this.correctedTimeExpression(dto.message);
    const parsed = this.timeRangeParser.parse(correctedTimeExpression ?? dto.message);
    const timeRange =
      parsed?.mentionedTime && parsed.range ? this.fromLegacyTimeRange(parsed.range, dto.timezone) : undefined;
    const relativeComparison = Boolean(
      timeRange && previous.timeRange && /(?:比|相比|对比|高了多少|低了多少|多了多少|少了多少)/.test(dto.message),
    );
    const resolvesComparisonTarget = Boolean(
      timeRange && (pendingClarification?.missingSlots.includes('comparisonTarget') || relativeComparison),
    );
    if ((!timeRange || resolvesComparisonTarget) && previous.timeRange) inherit.push('timeRange');

    return {
      mode: pendingClarification ? 'resolve_pending_or_new' : 'continue',
      inherit,
      doNotInherit,
      ...(timeRange && !resolvesComparisonTarget ? { replace: { timeRange } } : {}),
      ...(timeRange && resolvesComparisonTarget ? { resolve: { comparisonTarget: timeRange } } : {}),
      corrections,
      ...(pendingClarification
        ? {
            pendingSlots: [...pendingClarification.missingSlots],
            pendingQuestion: pendingClarification.questions[0],
          }
        : {}),
    };
  }

  private correctedTimeExpression(message: string): string | undefined {
    const preferred = message.match(
      /(?:问的是|改成|要看|只看)\s*(今天|昨天|明天|本周|上周|本月|这个月|上个月|本季度|上季度|今年|去年)/,
    )?.[1];
    if (preferred) return preferred;
    const replacement = message.match(
      /不是\s*(今天|昨天|明天|本周|上周|本月|这个月|上个月|本季度|上季度|今年|去年)[^，,。；;]{0,20}(?:是|改成)\s*(今天|昨天|明天|本周|上周|本月|这个月|上个月|本季度|上季度|今年|去年)/,
    )?.[2];
    return replacement;
  }

  private isModelPendingClarification(value: unknown): value is BrainModelPendingClarification {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    const pending = value as Record<string, unknown>;
    if (!this.hasOnlyKeys(pending, ['missingSlots', 'questions', 'ambiguities', 'turnCount'])) return false;
    if (
      pending.turnCount !== undefined &&
      (!Number.isInteger(pending.turnCount) || (pending.turnCount as number) < 1 || (pending.turnCount as number) > 2)
    ) {
      return false;
    }
    if (!Array.isArray(pending.missingSlots) || !pending.missingSlots.every((slot) => this.isNonEmptyString(slot))) {
      return false;
    }
    if (!Array.isArray(pending.questions) || !pending.questions.every((question) => this.isNonEmptyString(question))) {
      return false;
    }
    if (!Array.isArray(pending.ambiguities)) return false;
    return pending.ambiguities.every((ambiguity) => {
      if (!ambiguity || typeof ambiguity !== 'object' || Array.isArray(ambiguity)) return false;
      const record = ambiguity as Record<string, unknown>;
      return (
        this.hasOnlyKeys(record, ['slot', 'reason', 'candidates']) &&
        this.isNonEmptyString(record.slot) &&
        this.isNonEmptyString(record.reason) &&
        Array.isArray(record.candidates) &&
        record.candidates.every((candidate) => this.isNonEmptyString(candidate))
      );
    });
  }

  private detectModelCorrections(message: string): BrainModelConversationCorrection[] {
    const match = message.trim().match(/不是\s*([^，,。；;]{1,40})\s*[，,。；;]?\s*是\s*([^，,。；;]{1,40})/);
    if (!match) return [];
    return [{ slot: 'entities', previous: match[1]!.trim(), next: match[2]!.trim() }];
  }

  private fromLegacyTimeRange(
    range: { label: string; startDate: Date; endDate: Date },
    timezone?: string,
  ): BrainSemanticTimeRange {
    const supportedTimezone = timezone === 'UTC' ? 'UTC' : 'Asia/Shanghai';
    return {
      label: range.label,
      startDate: this.localIsoDate(range.startDate, supportedTimezone),
      endDate: this.localIsoDate(range.endDate, supportedTimezone),
      timezone: supportedTimezone,
    };
  }

  private localIsoDate(value: Date, timezone: BrainSemanticTimeRange['timezone']): string {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(value);
    const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value;
    return `${part('year')}-${part('month')}-${part('day')}`;
  }

  private normalizeModelTimeRange(range: BrainSemanticTimeRange): BrainSemanticTimeRange {
    const normalize = (value: string | undefined) => value?.slice(0, 10);
    return {
      ...(range.preset ? { preset: range.preset } : {}),
      ...(range.startDate ? { startDate: normalize(range.startDate) } : {}),
      ...(range.endDate ? { endDate: normalize(range.endDate) } : {}),
      label: range.label,
      timezone: range.timezone,
    };
  }

  private removeDirective(
    directives: BrainModelConversationTurnDirectives['inherit'],
    key: BrainModelConversationTurnDirectives['inherit'][number],
  ) {
    const index = directives.indexOf(key);
    if (index >= 0) directives.splice(index, 1);
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
    if (
      cognition.entities.length &&
      previous.entities.length &&
      cognition.entities[0].entityKey !== previous.entities[0].entityKey
    ) {
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
