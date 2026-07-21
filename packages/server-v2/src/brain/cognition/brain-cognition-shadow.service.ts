import { Injectable, type OnModuleInit } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { BrainDomainRole, BrainRoleIntentPlan } from '../domain/brain-domain-adapter.types.js';
import { BrainTraceService } from '../governance/brain-trace.service.js';
import { BrainRuntimeConfigService } from '../config/brain-runtime-config.service.js';
import type { BrainCognitionResult } from './brain-cognition.service.js';
import { BrainOntologyRuntimeService } from './brain-ontology-runtime.service.js';
import { BrainSemanticIntentCompilerService } from './brain-semantic-intent-compiler.service.js';
import { BrainSemanticIntentValidatorService } from './brain-semantic-intent-validator.service.js';
import type { BrainDefinitionRef, BrainSemanticIntent, BrainSupportedTimezone } from './brain-semantic-intent.types.js';
import type {
  BusinessDefinitionBase,
  ProductionReadyBusinessDefinitionSnapshot,
} from './business-definition-snapshot.types.js';

export interface BrainCognitionShadowInput {
  runId: number;
  requestId: string;
  userId: number;
  storeId: number;
  question: string;
  timezone: BrainSupportedTimezone;
  role: BrainDomainRole;
  conversationSlots: object;
  rules: {
    cognition: BrainCognitionResult;
    routePlan?: BrainRoleIntentPlan;
  };
  force?: boolean;
}

export interface BrainCognitionShadowObservation {
  scheduled: boolean;
  completion: Promise<void>;
}

type ShadowStatus = 'valid' | 'clarification_required' | 'invalid' | 'unavailable';

interface ShadowModelObservation {
  status: ShadowStatus;
  intent?: BrainSemanticIntent;
  details: Record<string, unknown>;
}

@Injectable()
export class BrainCognitionShadowService implements OnModuleInit {
  private readonly inFlight = new Set<Promise<void>>();

  constructor(
    private readonly config: BrainRuntimeConfigService,
    private readonly compiler: BrainSemanticIntentCompilerService,
    private readonly validator: BrainSemanticIntentValidatorService,
    private readonly ontologyRuntime: BrainOntologyRuntimeService,
    private readonly traceService: BrainTraceService,
  ) {}

  onModuleInit(): void {
    // Task 12 owns the primary model path; this service remains shadow-only.
  }

  observe(input: BrainCognitionShadowInput): BrainCognitionShadowObservation {
    if (!input.force && !this.shouldSchedule(input.requestId)) {
      return { scheduled: false, completion: Promise.resolve() };
    }

    let completion!: Promise<void>;
    completion = Promise.resolve()
      .then(() => this.execute(input))
      .catch(() => undefined)
      .finally(() => {
        this.inFlight.delete(completion);
      });
    this.inFlight.add(completion);
    return { scheduled: true, completion };
  }

  getInFlightCount(): number {
    return this.inFlight.size;
  }

  private shouldSchedule(requestId: string): boolean {
    try {
      return this.config.runtime.cognitionMode === 'shadow' && this.config.isInShadow(requestId);
    } catch {
      return false;
    }
  }

  private async execute(input: BrainCognitionShadowInput): Promise<void> {
    let snapshot: ProductionReadyBusinessDefinitionSnapshot | null = null;
    let modelObservation: ShadowModelObservation = {
      status: 'unavailable',
      details: { reason: 'production_ready_snapshot_unavailable' },
    };

    try {
      snapshot = this.ontologyRuntime.getSnapshot();
      if (snapshot) {
        const compilation = await this.compiler.compile({
          question: input.question,
          audit: { userId: input.userId, storeId: input.storeId },
          timezone: input.timezone,
          role: input.role,
          conversationSlots: withCatalogMetadata(input.conversationSlots),
          ontologySnapshot: snapshot,
          ontologyCandidates: buildOntologyCandidates(snapshot),
          metricRefs: snapshot.metrics.map((metric) => definitionRef('metric', metric)),
          dimensionRefs: snapshot.dimensions.map((dimension) => definitionRef('dimension', dimension)),
          capabilitySummaries: [],
        });

        if (compilation.status === 'completed') {
          const validation = this.validator.validate(compilation.intent);
          modelObservation = {
            status: validation.status,
            intent: compilation.intent,
            details: {
              provider: compilation.provider,
              model: compilation.model,
              usage: compilation.usage,
              validationStatus: validation.status,
              snapshotFingerprint: validation.snapshotFingerprint,
              ...('issues' in validation ? { issues: validation.issues } : {}),
              ...('clarification' in validation ? { clarification: validation.clarification } : {}),
            },
          };
        } else {
          modelObservation = {
            status: 'unavailable',
            details: { errorCode: compilation.errorCode, reason: compilation.reason },
          };
        }
      }
    } catch (error) {
      modelObservation = {
        status: 'unavailable',
        details: { reason: errorMessage(error) },
      };
    }

    const modelSummary = buildModelSummary(modelObservation.intent, snapshot);
    await this.safeRecordStep({
      runId: input.runId,
      stepKey: 'cognition_model',
      layer: 'cognition',
      input: toJsonValue({
        question: input.question,
        role: input.role,
        timezone: input.timezone,
        metadata: { catalogPhase: 'p11_not_available' },
      }),
      output: toJsonValue({ status: modelObservation.status, ...modelObservation.details, ...modelSummary }),
      status: modelObservation.status === 'valid' ? 'completed' : 'failed',
    });

    const diff = buildCognitionDiff(input, modelObservation.intent, snapshot, modelObservation.status);
    await this.safeRecordStep({
      runId: input.runId,
      stepKey: 'cognition_diff',
      layer: 'cognition',
      input: toJsonValue({ modelStatus: modelObservation.status, snapshotFingerprint: snapshot?.fingerprint ?? null }),
      output: toJsonValue(diff),
      status: 'completed',
    });
  }

  private async safeRecordStep(input: Parameters<BrainTraceService['recordStep']>[0]): Promise<void> {
    try {
      await this.traceService.recordStep(input);
    } catch {
      // Shadow traces must never affect the rules response path.
    }
  }
}

function withCatalogMetadata(slots: object): Record<string, unknown> {
  const slotRecord = Object.fromEntries(Object.entries(slots));
  const existingMetadata =
    slotRecord.metadata && typeof slotRecord.metadata === 'object' && !Array.isArray(slotRecord.metadata)
      ? (slotRecord.metadata as Record<string, unknown>)
      : {};
  return {
    ...slotRecord,
    metadata: { ...existingMetadata, catalogPhase: 'p11_not_available' },
  };
}

function buildOntologyCandidates(snapshot: ProductionReadyBusinessDefinitionSnapshot) {
  return [
    ...snapshot.entities.map((entity) => ({
      definitionRef: definitionRef('entity', entity),
      name: entity.name,
      domain: entity.domain,
      aliases: [...entity.aliases],
      entityKey: entity.entityKey,
    })),
    ...snapshot.relations.map((relation) => ({
      definitionRef: definitionRef('relation', relation),
      name: relation.name,
      fromEntityKey: relation.fromEntityKey,
      toEntityKey: relation.toEntityKey,
    })),
  ];
}

function definitionRef<T extends 'entity' | 'relation' | 'metric' | 'dimension'>(
  definitionType: T,
  definition: BusinessDefinitionBase,
): BrainDefinitionRef<T> {
  return {
    definitionType,
    definitionKey: definition.definitionKey,
    definitionVersion: definition.version,
    definitionFingerprint: definition.definitionFingerprint,
    sourceFingerprint: definition.sourceFingerprint,
  };
}

function buildCognitionDiff(
  input: BrainCognitionShadowInput,
  modelIntent: BrainSemanticIntent | undefined,
  snapshot: ProductionReadyBusinessDefinitionSnapshot | null,
  modelStatus: ShadowStatus,
) {
  const rules = input.rules;
  const ruleTime = readRuleTime(input.conversationSlots);
  const ruleSummary = {
    domain: rules.routePlan ? [rules.routePlan.domain] : [],
    intent: rules.routePlan?.intent ?? rules.cognition.intent.key,
    metric: uniqueSorted(rules.cognition.metrics),
    dimension: uniqueSorted(rules.cognition.dimensions),
    entity: uniqueSorted(rules.cognition.entities.map((entity) => entity.entityKey)),
    time: ruleTime,
    answerShape: rules.routePlan?.answerShape ?? null,
    confidence: rules.routePlan?.confidence ?? rules.cognition.intent.confidence,
  };
  const modelSummary = buildModelSummary(modelIntent, snapshot);

  return {
    modelStatus,
    domain: diffValue(ruleSummary.domain, modelSummary.domain),
    intent: diffValue(ruleSummary.intent, modelSummary.intent),
    metric: diffValue(ruleSummary.metric, modelSummary.metric),
    dimension: diffValue(ruleSummary.dimension, modelSummary.dimension),
    entity: diffValue(ruleSummary.entity, modelSummary.entity),
    time: diffValue(ruleSummary.time, modelSummary.time),
    answerShape: diffValue(ruleSummary.answerShape, modelSummary.answerShape),
    confidence: diffValue(ruleSummary.confidence, modelSummary.confidence),
  };
}

function buildModelSummary(
  modelIntent: BrainSemanticIntent | undefined,
  snapshot: ProductionReadyBusinessDefinitionSnapshot | null,
) {
  return {
    domain: uniqueSorted(modelIntent?.domains ?? []),
    intent: modelIntent?.intent ?? null,
    metric: resolveMetricKeys(modelIntent, snapshot),
    dimension: resolveDimensionKeys(modelIntent, snapshot),
    entity: resolveEntityKeys(modelIntent, snapshot),
    time: modelIntent?.timeRange ?? null,
    answerShape: modelIntent?.answerShape ?? null,
    confidence: modelIntent?.confidence ?? null,
  };
}

function resolveMetricKeys(
  intent: BrainSemanticIntent | undefined,
  snapshot: ProductionReadyBusinessDefinitionSnapshot | null,
): string[] {
  return uniqueSorted(
    (intent?.metrics ?? []).map(
      (ref) => snapshot?.metrics.find((metric) => refMatches(ref, metric))?.metricKey ?? ref.definitionKey,
    ),
  );
}

function resolveDimensionKeys(
  intent: BrainSemanticIntent | undefined,
  snapshot: ProductionReadyBusinessDefinitionSnapshot | null,
): string[] {
  return uniqueSorted(
    (intent?.dimensions ?? []).map(
      (ref) => snapshot?.dimensions.find((dimension) => refMatches(ref, dimension))?.dimensionKey ?? ref.definitionKey,
    ),
  );
}

function resolveEntityKeys(
  intent: BrainSemanticIntent | undefined,
  snapshot: ProductionReadyBusinessDefinitionSnapshot | null,
): string[] {
  return uniqueSorted(
    (intent?.entities ?? []).map((entity) => {
      if (entity.definitionRef) {
        return (
          snapshot?.entities.find((definition) => refMatches(entity.definitionRef!, definition))?.entityKey ??
          entity.entityKey ??
          entity.definitionRef.definitionKey
        );
      }
      return entity.entityKey ?? entity.mention;
    }),
  );
}

function refMatches(ref: BrainDefinitionRef, definition: BusinessDefinitionBase): boolean {
  return (
    ref.definitionKey === definition.definitionKey &&
    ref.definitionVersion === definition.version &&
    ref.sourceFingerprint === definition.sourceFingerprint
  );
}

function readRuleTime(slots: object): unknown {
  return Object.fromEntries(Object.entries(slots)).timeRange ?? null;
}

function diffValue(rules: unknown, model: unknown) {
  return { rules, model, matched: canonicalJson(rules) === canonicalJson(model) };
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return JSON.stringify(value.map((item) => canonicalJson(item)));
  if (value && typeof value === 'object') {
    return JSON.stringify(
      Object.keys(value as Record<string, unknown>)
        .sort()
        .map((key) => [key, canonicalJson((value as Record<string, unknown>)[key])]),
    );
  }
  return JSON.stringify(value);
}

function uniqueSorted(values: string[]): string[] {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}

function toJsonValue(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
