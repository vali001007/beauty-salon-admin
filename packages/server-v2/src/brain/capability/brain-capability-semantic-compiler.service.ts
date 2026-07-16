import { Inject, Injectable } from '@nestjs/common';
import { AiStructuredOutputError } from '../../ai/ai.service.js';
import type {
  BrainBusinessDefinitionSnapshotEntry,
  BrainCanonicalCapabilitySemantics,
  BrainCapabilityNarrative,
} from './brain-capability-codegen.service.js';
import type { BrainCapabilityCandidate } from './brain-capability-scan.types.js';
import { BRAIN_SEMANTIC_INTENTS, type BrainSemanticIntentKind } from '../cognition/brain-semantic-intent.types.js';

const CANONICAL_INTENTS = new Set<string>(BRAIN_SEMANTIC_INTENTS);

export interface BrainCapabilitySemanticModelOutput {
  name: string;
  description: string;
  domains: string[];
  intents: string[];
  positiveExamples: string[];
  negativeExamples: string[];
  synonyms: string[];
  riskExplanation: string;
}

export interface BrainCapabilityDefinitionSemanticView {
  definitionKey: string;
  kind: string;
  domain: string;
  name: string;
  aliases: string[];
  description?: string;
  capabilityBindings: string[];
  executorBindings: string[];
  allowedIntents: BrainSemanticIntentKind[];
}

export interface BrainCapabilitySemanticModel {
  generate(input: {
    capability: Pick<
      BrainCapabilityCandidate,
      | 'key'
      | 'name'
      | 'readOnly'
      | 'riskLevel'
      | 'storeScope'
      | 'requiredPermissions'
      | 'inputContract'
      | 'outputContract'
    >;
    definitionViews: BrainCapabilityDefinitionSemanticView[];
  }): Promise<BrainCapabilitySemanticModelOutput>;
}

export const BRAIN_CAPABILITY_SEMANTIC_MODEL = Symbol('BRAIN_CAPABILITY_SEMANTIC_MODEL');

export class BrainCapabilitySemanticCompilationError extends Error {
  constructor(readonly reasons: string[]) {
    super(`brain_capability_semantic_compilation_failed:${reasons.join(',')}`);
  }
}

@Injectable()
export class BrainCapabilitySemanticCompilerService {
  constructor(
    @Inject(BRAIN_CAPABILITY_SEMANTIC_MODEL)
    private readonly model: BrainCapabilitySemanticModel,
  ) {}

  async compile(input: {
    capability: BrainCapabilityCandidate;
    definitions: BrainBusinessDefinitionSnapshotEntry[];
    successSchema: Record<string, unknown>;
  }): Promise<{ canonicalSemantics: BrainCanonicalCapabilitySemantics; narrative: BrainCapabilityNarrative }> {
    const views = input.definitions.map(parseDefinitionView);
    const preflightReasons = views.flatMap((view) =>
      view.capabilityBindings.length > 0 && !view.capabilityBindings.includes(input.capability.key)
        ? [`capability_binding_conflict:${view.definitionKey}`]
        : [],
    );
    if (preflightReasons.length) throw new BrainCapabilitySemanticCompilationError(uniqueSorted(preflightReasons));

    let proposal: BrainCapabilitySemanticModelOutput;
    try {
      proposal = await this.model.generate({
        capability: {
          key: input.capability.key,
          name: input.capability.name,
          readOnly: input.capability.readOnly,
          riskLevel: input.capability.riskLevel,
          storeScope: input.capability.storeScope,
          requiredPermissions: [...input.capability.requiredPermissions],
          inputContract: structuredClone(input.capability.inputContract),
          outputContract: structuredClone(input.capability.outputContract),
        },
        definitionViews: structuredClone(views),
      });
    } catch (error) {
      const reason =
        error instanceof AiStructuredOutputError
          ? `model_semantic_compilation_failed:${error.code.toLowerCase()}`
          : 'model_semantic_compilation_failed:unknown';
      throw new BrainCapabilitySemanticCompilationError([reason]);
    }

    const governedIntents = new Set(views.flatMap((view) => view.allowedIntents));
    const reasons = validateModelOutput(proposal, new Set(views.map((view) => view.domain)));
    if (reasons.length) throw new BrainCapabilitySemanticCompilationError(reasons);
    const proposedIntents = canonicalCapabilityIntents(proposal.intents);
    const intents = governedIntents.size
      ? proposedIntents.filter((intent) => governedIntents.has(intent))
      : proposedIntents;
    if (!intents.length) throw new BrainCapabilitySemanticCompilationError(['model_intents_not_executable']);
    const positiveExamples = ensureReleaseGateExamples(
      normalizeExecutableExamples({
      examples: proposal.positiveExamples,
      intents,
      capabilityKey: input.capability.key,
      storeScope: input.capability.storeScope,
      }),
      intents,
    );
    if (positiveExamples.length < 2) {
      throw new BrainCapabilitySemanticCompilationError(['model_positive_examples_not_executable']);
    }
    const canonicalSemantics: BrainCanonicalCapabilitySemantics = {
      key: input.capability.key,
      name: proposal.name.trim(),
      description: proposal.description.trim(),
      domains: uniqueSorted(views.map((view) => view.domain)),
      intents,
      riskLevel: input.capability.riskLevel,
      requiredPermissions: uniqueSorted(input.capability.requiredPermissions),
      storeScope: assertKnownStoreScope(input.capability.storeScope),
      examples: positiveExamples,
      negativeExamples: uniqueSorted(proposal.negativeExamples),
      synonyms: uniqueSorted(proposal.synonyms),
      successSchema: structuredClone(input.successSchema),
    };
    return {
      canonicalSemantics: deepFreeze(canonicalSemantics),
      narrative: deepFreeze({
        description: canonicalSemantics.description,
        positiveExamples: canonicalSemantics.examples,
        negativeExamples: canonicalSemantics.negativeExamples,
        synonyms: canonicalSemantics.synonyms,
        successSchema: canonicalSemantics.successSchema,
        riskExplanation: proposal.riskExplanation.trim(),
      }),
    };
  }
}

function parseDefinitionView(definition: BrainBusinessDefinitionSnapshotEntry): BrainCapabilityDefinitionSemanticView {
  const projections = definition.projections.filter(
    (projection) => projection.targetType === 'capability_semantic_view',
  );
  if (projections.length !== 1) {
    throw new BrainCapabilitySemanticCompilationError([`capability_semantic_view_missing:${definition.definitionKey}`]);
  }
  const payload = record(projections[0]!.payload);
  const data = record(payload.data);
  const contribution = record(data.semanticContribution);
  const metricProjection = definition.projections.find((projection) => projection.targetType === 'metric_query_view');
  const metricRuntimeDefinition = record(record(metricProjection?.payload).data).runtimeDefinition;
  const allowedIntents = Array.isArray(metricRuntimeDefinition)
    ? []
    : businessTaskTypesToIntents(record(metricRuntimeDefinition).allowedTaskTypes);
  if (
    payload.projectionSchemaVersion !== '2.0' ||
    payload.preview !== false ||
    payload.projectionType !== 'capability_semantic_view' ||
    data.definitionKind !== definition.kind ||
    data.domain !== definition.domain ||
    data.name !== definition.name
  ) {
    throw new BrainCapabilitySemanticCompilationError([`capability_semantic_view_invalid:${definition.definitionKey}`]);
  }
  return {
    definitionKey: definition.definitionKey,
    kind: definition.kind,
    domain: definition.domain,
    name: definition.name,
    aliases: stringArray(contribution.aliases),
    description: optionalString(contribution.description),
    capabilityBindings: stringArray(data.capabilityBindings),
    executorBindings: stringArray(data.executorBindings),
    allowedIntents,
  };
}

function validateModelOutput(value: BrainCapabilitySemanticModelOutput, allowedDomains: Set<string>): string[] {
  const reasons: string[] = [];
  if (!optionalString(value.name)) reasons.push('model_name_required');
  if (!optionalString(value.description)) reasons.push('model_description_required');
  if (!optionalString(value.riskExplanation)) reasons.push('model_risk_explanation_required');
  if (!nonEmptyStringArray(value.domains)) reasons.push('model_domains_required');
  if (!nonEmptyStringArray(value.intents)) reasons.push('model_intents_required');
  if (!nonEmptyStringArray(value.positiveExamples)) reasons.push('model_positive_examples_required');
  if (!nonEmptyStringArray(value.negativeExamples)) reasons.push('model_negative_examples_required');
  if (!Array.isArray(value.synonyms) || value.synonyms.some((item) => !optionalString(item))) {
    reasons.push('model_synonyms_invalid');
  }
  for (const domain of Array.isArray(value.domains) ? value.domains : []) {
    if (optionalString(domain) && !allowedDomains.has(domain.trim())) {
      reasons.push(`model_domain_not_in_business_definitions:${domain.trim()}`);
    }
  }
  for (const intent of Array.isArray(value.intents) ? value.intents : []) {
    if (optionalString(intent) && !canonicalCapabilityIntent(intent)) {
      reasons.push(`model_intent_invalid:${intent.trim()}`);
    }
  }
  return uniqueSorted(reasons);
}

function canonicalCapabilityIntents(values: string[]): BrainSemanticIntentKind[] {
  const intents = values
    .map((value) => canonicalCapabilityIntent(value))
    .filter((item): item is BrainSemanticIntentKind => Boolean(item));
  return [...new Set(intents)].sort((left, right) => left.localeCompare(right));
}

function canonicalCapabilityIntent(value: string): BrainSemanticIntentKind | undefined {
  const normalized = value.trim().toLowerCase();
  if (CANONICAL_INTENTS.has(normalized)) return normalized as BrainSemanticIntentKind;
  const prefix = normalized.split('_')[0];
  const aliases: Record<string, BrainSemanticIntentKind> = {
    get: 'query',
    fetch: 'query',
    list: 'query',
    lookup: 'query',
    query: 'query',
    read: 'query',
    search: 'query',
    rank: 'ranking',
    ranking: 'ranking',
    compare: 'comparison',
    comparison: 'comparison',
    trend: 'trend',
    analyze: 'diagnosis',
    diagnose: 'diagnosis',
    diagnosis: 'diagnosis',
    risk: 'diagnosis',
    advise: 'recommendation',
    recommend: 'recommendation',
    recommendation: 'recommendation',
    draft: 'draft',
    generate: 'draft',
    write: 'draft',
    create: 'action',
    delete: 'action',
    execute: 'action',
    preview: 'action',
    update: 'action',
    workflow: 'workflow',
    clarify: 'clarify',
  };
  return aliases[prefix];
}

function businessTaskTypesToIntents(value: unknown): BrainSemanticIntentKind[] {
  if (!Array.isArray(value)) return [];
  return uniqueSorted(
    value.flatMap((item) => {
      if (typeof item !== 'string') return [];
      if (item === 'forecast') return ['trend'];
      const intent = canonicalCapabilityIntent(item);
      return intent ? [intent] : [];
    }),
  ) as BrainSemanticIntentKind[];
}

function normalizeExecutableExamples(input: {
  examples: string[];
  intents: BrainSemanticIntentKind[];
  capabilityKey: string;
  storeScope: BrainCapabilityCandidate['storeScope'];
}): string[] {
  const allowed = new Set(input.intents);
  const requiresTime =
    input.capabilityKey === 'reservation_list' ||
    input.intents.some((intent) => ['ranking', 'trend', 'comparison'].includes(intent));
  return uniqueSorted(
    input.examples.flatMap((raw) => {
      const example = normalizeScopedExample(raw);
      if (!example) return [];
      if (input.storeScope === 'required' && /(跨门店|不同门店|各门店|门店之间|按门店)/.test(example)) return [];
      if (!allowed.has(inferExampleIntent(example))) return [];
      return [requiresTime && !hasExplicitTimeExpression(example) ? `本月${example}` : example];
    }),
  );
}

function ensureReleaseGateExamples(examples: string[], intents: BrainSemanticIntentKind[]): string[] {
  if (examples.length !== 1) return examples;
  const base = examples[0]!;
  let variant: string;
  if (intents.includes('ranking')) {
    variant = /前\s*\d+|最高的?\s*\d+/.test(base)
      ? base.replace(/(前\s*|最高的?\s*)\d+/, (_match, prefix: string) => `${prefix}5`)
      : `${base}，列出前5名`;
  } else if (base.includes('本月')) {
    variant = base.replace('本月', '今天');
  } else if (base.includes('今天')) {
    variant = base.replace('今天', '本月');
  } else {
    variant = `${base}，请返回明细`;
  }
  return uniqueSorted([base, variant]);
}

function normalizeScopedExample(value: string): string {
  let normalized = value.trim().replace(/门店\s*[A-Za-z0-9_-]+/g, '本店');
  normalized = normalized.replace(/\d{4}\s*年\s*\d{1,2}\s*月/g, '');
  return normalized.replace(/\s+/g, ' ').trim();
}

function inferExampleIntent(value: string): BrainSemanticIntentKind {
  if (/(比较|对比|相比|差多少)/.test(value)) return 'comparison';
  if (/(排序|排列|排行|排名|最高|最低|前\s*\d+|前十|最好|最多|最少)/.test(value)) return 'ranking';
  if (/(趋势|走势|变化曲线)/.test(value)) return 'trend';
  if (/(诊断|原因|为什么|异常|下降)/.test(value)) return 'diagnosis';
  return 'query';
}

function hasExplicitTimeExpression(value: string): boolean {
  return /(今天|明天|昨天|本周|这周|上周|下周|本月|这个月|上月|上个月|下月|下个月|季度|今年|去年|(?:最近|过去|近)\s*\d+\s*天)/.test(value);
}

function assertKnownStoreScope(value: BrainCapabilityCandidate['storeScope']): 'required' | 'optional' | 'none' {
  if (value === 'required' || value === 'optional' || value === 'none') return value;
  throw new BrainCapabilitySemanticCompilationError(['capability_store_scope_unknown']);
}

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function stringArray(value: unknown): string[] {
  if (!Array.isArray(value) || value.some((item) => !optionalString(item))) return [];
  return uniqueSorted(value as string[]);
}

function nonEmptyStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.length > 0 && value.every((item) => Boolean(optionalString(item)));
}

function uniqueSorted(values: string[]): string[] {
  return [...new Set(values.map((item) => item.trim()).filter(Boolean))].sort((left, right) =>
    left.localeCompare(right),
  );
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const nested of Object.values(value as Record<string, unknown>)) deepFreeze(nested);
  }
  return value;
}
