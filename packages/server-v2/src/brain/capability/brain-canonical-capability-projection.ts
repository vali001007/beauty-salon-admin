import { canonicalizeBusinessDefinition } from '../../semantic-data/business-definition-projection-compiler.service.js';
import type { BrainCapabilityScanRiskLevel } from './brain-capability-scan.types.js';
import type { BrainBusinessDefinitionSnapshotEntry } from './brain-capability-codegen.service.js';

export interface BrainCanonicalCapabilitySemantics {
  key: string;
  name: string;
  description: string;
  domains: string[];
  intents: string[];
  riskLevel: BrainCapabilityScanRiskLevel;
  requiredPermissions: string[];
  storeScope: 'required' | 'optional' | 'none';
  examples: string[];
  negativeExamples: string[];
  synonyms: string[];
  successSchema: Record<string, unknown>;
}

export type BrainCanonicalCapabilityProjectionIssue = 'invalid' | 'missing' | 'conflict';

export class BrainCanonicalCapabilityProjectionError extends Error {
  constructor(readonly issues: BrainCanonicalCapabilityProjectionIssue[]) {
    super(`canonical_capability_projection_${issues.join('_')}`);
  }
}

export function resolveCanonicalCapabilityProjection(input: {
  capabilityKey: string;
  definitions: BrainBusinessDefinitionSnapshotEntry[];
}): {
  semantics: BrainCanonicalCapabilitySemantics;
  grounding: 'semantic_query' | 'domain_service';
} {
  const matches: BrainCanonicalCapabilitySemantics[] = [];
  let invalid = false;
  for (const definition of input.definitions) {
    for (const projection of definition.projections) {
      if (projection.targetType !== 'capability_semantic_view') continue;
      const projectionDefinition = projectionSemanticDefinition(projection.payload);
      const capabilities = projectionDefinition?.capabilities;
      if (!Array.isArray(capabilities)) continue;
      for (const item of capabilities) {
        if (!isRecord(item) || item.key !== input.capabilityKey) continue;
        const parsed = parseCanonicalCapabilitySemantics(item);
        if (parsed) matches.push(parsed);
        else invalid = true;
      }
    }
  }
  if (matches.length === 0) {
    throw new BrainCanonicalCapabilityProjectionError(invalid ? ['invalid', 'missing'] : ['missing']);
  }
  if (new Set(matches.map((item) => canonicalizeBusinessDefinition(item))).size !== 1) {
    throw new BrainCanonicalCapabilityProjectionError(['conflict']);
  }
  return {
    semantics: matches[0]!,
    grounding: deriveCanonicalCapabilityGrounding(input.capabilityKey, input.definitions),
  };
}

export function parseCanonicalCapabilitySemantics(
  value: Record<string, unknown>,
): BrainCanonicalCapabilitySemantics | undefined {
  const riskLevels = new Set<BrainCapabilityScanRiskLevel>(['low', 'medium', 'high', 'critical']);
  const storeScopes = new Set(['required', 'optional', 'none']);
  if (
    !nonEmpty(value.key) ||
    !nonEmpty(value.name) ||
    !nonEmpty(value.description) ||
    !nonEmptyStrings(value.domains) ||
    !nonEmptyStrings(value.intents) ||
    !riskLevels.has(value.riskLevel as BrainCapabilityScanRiskLevel) ||
    !storeScopes.has(String(value.storeScope)) ||
    !Array.isArray(value.requiredPermissions) ||
    !nonEmptyStrings(value.examples) ||
    !nonEmptyStrings(value.negativeExamples) ||
    !Array.isArray(value.synonyms) ||
    value.synonyms.some((item) => !nonEmpty(item)) ||
    !isRecord(value.successSchema)
  ) {
    return undefined;
  }
  return {
    key: value.key,
    name: value.name,
    description: value.description,
    domains: uniqueSorted(value.domains),
    intents: uniqueSorted(value.intents),
    riskLevel: value.riskLevel as BrainCapabilityScanRiskLevel,
    requiredPermissions: uniqueSorted(value.requiredPermissions.filter((item): item is string => nonEmpty(item))),
    storeScope: value.storeScope as 'required' | 'optional' | 'none',
    examples: uniqueSorted(value.examples),
    negativeExamples: uniqueSorted(value.negativeExamples),
    synonyms: uniqueSorted(value.synonyms.filter((item): item is string => nonEmpty(item))),
    successSchema: value.successSchema,
  };
}

export function deriveCanonicalCapabilityGrounding(
  capabilityKey: string,
  definitions: BrainBusinessDefinitionSnapshotEntry[],
): 'semantic_query' | 'domain_service' {
  return definitions.some(
    (definition) =>
      nonEmpty(definition.canonicalQueryRef) &&
      [definition.payload, ...definition.projections.map((projection) => projectionSemanticDefinition(projection.payload))].some(
        (candidate) => hasCapabilityBinding(candidate, capabilityKey),
      ),
  )
    ? 'semantic_query'
    : 'domain_service';
}

function projectionSemanticDefinition(payload: Record<string, unknown>): Record<string, unknown> | undefined {
  if (isRecord(payload.definition)) return payload.definition;
  if (!isRecord(payload.data)) return undefined;
  return isRecord(payload.data.runtimeDefinition) ? payload.data.runtimeDefinition : payload.data;
}

function hasCapabilityBinding(candidate: unknown, capabilityKey: string): boolean {
  if (!isRecord(candidate)) return false;
  const runtimeQuery = isRecord(candidate.runtimeQuery) ? candidate.runtimeQuery : undefined;
  if (Array.isArray(runtimeQuery?.capabilityKeys) && runtimeQuery.capabilityKeys.includes(capabilityKey)) return true;
  const bindings = isRecord(candidate.bindings) ? candidate.bindings : undefined;
  return Array.isArray(bindings?.capability) && bindings.capability.includes(capabilityKey);
}

function uniqueSorted(values: string[]): string[] {
  return [...new Set(values.map((item) => item.trim()).filter(Boolean))].sort((left, right) =>
    left.localeCompare(right),
  );
}

function nonEmpty(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function nonEmptyStrings(value: unknown): value is string[] {
  return Array.isArray(value) && value.length > 0 && value.every(nonEmpty);
}

function isRecord(value: unknown): value is Record<string, any> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
