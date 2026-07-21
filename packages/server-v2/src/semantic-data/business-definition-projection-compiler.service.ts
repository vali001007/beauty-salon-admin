import { BadRequestException, Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';

export const BUSINESS_DEFINITION_PROJECTION_TYPES = [
  'intent_semantic_index',
  'capability_semantic_view',
  'metric_query_view',
  'ui_definition_view',
  'eval_case_projection',
] as const;

export type BusinessDefinitionProjectionTypeValue = (typeof BUSINESS_DEFINITION_PROJECTION_TYPES)[number];

export interface BusinessDefinitionVersionRecord {
  id: number;
  definitionId: number;
  version: number;
  schemaVersion: string;
  payload: unknown;
  lifecycleStatus: string;
  fingerprint: string;
  sourceFingerprint: string;
  validationStatus: string;
  validationReport?: unknown;
  canonicalQueryRef?: string | null;
  fixtureSetKey?: string | null;
  timezone: string;
  storeScope: unknown;
  definition: {
    id: number;
    definitionKey: string;
    kind: string;
    domain: string;
    name: string;
    ownerType: string;
    ownerId?: string | null;
  };
  evidence?: unknown[];
  projections?: unknown[];
}

export interface CompiledBusinessDefinitionProjection {
  definitionVersionId: number;
  targetType: BusinessDefinitionProjectionTypeValue;
  targetKey: string;
  definitionKey: string;
  definitionVersion: number;
  definitionFingerprint: string;
  sourceFingerprint: string;
  payload: Record<string, unknown>;
  projectionFingerprint: string;
  generatedAt: Date;
  readOnly: true;
}

export interface BusinessDefinitionProjectionV2Payload extends Record<string, unknown> {
  projectionSchemaVersion: '2.0';
  preview: boolean;
  projectionType: BusinessDefinitionProjectionTypeValue;
  definitionRef: {
    definitionKey: string;
    definitionVersion: number;
    definitionFingerprint: string;
    sourceFingerprint: string;
  };
  data: Record<string, unknown>;
}

@Injectable()
export class BusinessDefinitionProjectionCompilerService {
  compilePublishedVersion(
    version: BusinessDefinitionVersionRecord,
  ): ReadonlyArray<CompiledBusinessDefinitionProjection> {
    if (version.lifecycleStatus !== 'published') {
      throw new BadRequestException('business_definition_version_not_published');
    }
    return this.compile(version, false);
  }

  previewVersion(version: BusinessDefinitionVersionRecord): ReadonlyArray<CompiledBusinessDefinitionProjection> {
    return this.compile(version, true);
  }

  private compile(
    version: BusinessDefinitionVersionRecord,
    preview: boolean,
  ): ReadonlyArray<CompiledBusinessDefinitionProjection> {
    const definitionRef = {
      definitionKey: version.definition.definitionKey,
      definitionVersion: version.version,
      definitionFingerprint: version.fingerprint,
      sourceFingerprint: version.sourceFingerprint,
    };
    const targetKey = `${version.definition.definitionKey}@${version.version}`;
    const generatedAt = new Date();

    return deepFreeze(
      BUSINESS_DEFINITION_PROJECTION_TYPES.map((targetType) => {
        const payload = createBusinessDefinitionProjectionV2Payload(version, targetType, preview);
        const fingerprintInput = {
          targetType,
          targetKey,
          definitionVersionId: version.id,
          definitionRef,
          payload,
          readOnly: true,
        };
        return {
          definitionVersionId: version.id,
          targetType,
          targetKey,
          definitionKey: version.definition.definitionKey,
          definitionVersion: version.version,
          definitionFingerprint: version.fingerprint,
          sourceFingerprint: version.sourceFingerprint,
          payload,
          projectionFingerprint: createBusinessDefinitionProjectionFingerprint(fingerprintInput),
          generatedAt,
          readOnly: true as const,
        };
      }),
    );
  }
}

export function createBusinessDefinitionProjectionV2Payload(
  version: BusinessDefinitionVersionRecord,
  targetType: BusinessDefinitionProjectionTypeValue,
  preview: boolean,
): BusinessDefinitionProjectionV2Payload {
  const definitionRef = {
    definitionKey: version.definition.definitionKey,
    definitionVersion: version.version,
    definitionFingerprint: version.fingerprint,
    sourceFingerprint: version.sourceFingerprint,
  };
  const definition = asRecord(version.payload);
  return {
    projectionSchemaVersion: '2.0',
    preview,
    projectionType: targetType,
    definitionRef,
    data: projectionData(version, definition, targetType),
  };
}

export function isBusinessDefinitionProjectionV2Payload(
  value: unknown,
): value is BusinessDefinitionProjectionV2Payload {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const payload = value as Record<string, unknown>;
  return (
    payload.projectionSchemaVersion === '2.0' &&
    typeof payload.preview === 'boolean' &&
    BUSINESS_DEFINITION_PROJECTION_TYPES.includes(payload.projectionType as BusinessDefinitionProjectionTypeValue) &&
    Boolean(payload.definitionRef) &&
    typeof payload.definitionRef === 'object' &&
    !Array.isArray(payload.definitionRef) &&
    Boolean(payload.data) &&
    typeof payload.data === 'object' &&
    !Array.isArray(payload.data)
  );
}

function projectionData(
  version: BusinessDefinitionVersionRecord,
  definition: Record<string, unknown>,
  targetType: BusinessDefinitionProjectionTypeValue,
): Record<string, unknown> {
  const aliases = uniqueStrings(definition.aliases);
  const base = {
    definitionKind: version.definition.kind,
    domain: version.definition.domain,
    name: version.definition.name,
  };
  if (targetType === 'intent_semantic_index') {
    return compactRecord({
      ...base,
      aliases,
      searchableTerms: uniqueStrings([version.definition.name, ...aliases]),
      semanticKey: version.definition.definitionKey,
      runtimeDefinition:
        version.definition.kind === 'entity' ||
        version.definition.kind === 'relation' ||
        version.definition.kind === 'dimension'
          ? cloneJson(definition)
          : undefined,
    });
  }
  if (targetType === 'capability_semantic_view') {
    const bindings = isRecord(definition.bindings) ? definition.bindings : {};
    return compactRecord({
      ...base,
      capabilities: Array.isArray(definition.capabilities) ? cloneJson(definition.capabilities) : [],
      capabilityBindings: uniqueStrings(bindings.capability),
      executorBindings: uniqueStrings(bindings.executor),
      semanticContribution: compactRecord({
        aliases,
        description: optionalString(definition.description),
        permissionPolicies: Array.isArray(definition.permissionPolicies)
          ? cloneJson(definition.permissionPolicies)
          : [],
      }),
    });
  }
  if (targetType === 'metric_query_view') {
    const applicable = version.definition.kind === 'metric';
    return compactRecord({
      ...base,
      applicable,
      canonicalQueryRef: version.canonicalQueryRef ?? null,
      fixtureSetKey: version.fixtureSetKey ?? null,
      timezone: version.timezone,
      storeScope: cloneJson(version.storeScope),
      runtimeDefinition: applicable ? cloneJson(definition) : undefined,
      unsupportedReason: applicable ? undefined : 'definition_kind_not_metric',
    });
  }
  if (targetType === 'ui_definition_view') {
    return {
      ...base,
      aliases,
      summary: buildBusinessDefinitionSummary(version, definition),
      owner: {
        type: version.definition.ownerType,
        id: version.definition.ownerId ?? null,
      },
      validation: {
        status: version.validationStatus,
        report: cloneJson(version.validationReport ?? null),
      },
      evidenceCount: Array.isArray(version.evidence) ? version.evidence.length : 0,
      readOnly: true,
    };
  }
  return {
    ...base,
    cases: uniqueStrings([version.definition.name, ...aliases]).map((input, index) => ({
      caseKey: `${version.definition.definitionKey}@${version.version}:${index + 1}`,
      input,
      expectedDefinitionKey: version.definition.definitionKey,
      expectedKind: version.definition.kind,
      expectedDomain: version.definition.domain,
    })),
  };
}

function buildBusinessDefinitionSummary(
  version: BusinessDefinitionVersionRecord,
  definition: Record<string, unknown>,
): string {
  if (version.definition.kind === 'metric') {
    const measure = isRecord(definition.measure) ? definition.measure : {};
    const aggregation = optionalString(measure.aggregation) ?? '未声明聚合';
    const sourceModels = uniqueStrings(definition.sourceModels);
    return `${version.definition.name}：${aggregation}，数据来源 ${sourceModels.join('、') || '未声明'}`;
  }
  return `${version.definition.name}：${version.definition.domain} 域 ${version.definition.kind} 定义`;
}

function compactRecord(value: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined));
}

function uniqueStrings(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [
    ...new Set(
      value
        .filter((item): item is string => typeof item === 'string')
        .map((item) => item.trim())
        .filter(Boolean),
    ),
  ];
}

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!isRecord(value)) throw new BadRequestException('business_definition_payload_must_be_an_object');
  return value;
}

export function createBusinessDefinitionProjectionFingerprint(value: unknown): string {
  return createHash('sha256').update(canonicalizeBusinessDefinition(value)).digest('hex');
}

export function canonicalizeBusinessDefinition(value: unknown): string {
  return JSON.stringify(canonicalizeValue(value, new WeakSet<object>()));
}

function canonicalizeValue(value: unknown, seen: WeakSet<object>): unknown {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new BadRequestException('business_definition_contains_non_finite_number');
    return value;
  }
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) {
    if (seen.has(value)) throw new BadRequestException('business_definition_contains_cycle');
    seen.add(value);
    const result = value.map((item) => canonicalizeValue(item, seen));
    seen.delete(value);
    return result;
  }
  if (typeof value === 'object') {
    if (seen.has(value)) throw new BadRequestException('business_definition_contains_cycle');
    seen.add(value);
    const source = value as Record<string, unknown>;
    const result: Record<string, unknown> = {};
    for (const key of Object.keys(source).sort()) {
      if (source[key] === undefined) throw new BadRequestException('business_definition_contains_undefined');
      result[key] = canonicalizeValue(source[key], seen);
    }
    seen.delete(value);
    return result;
  }
  throw new BadRequestException('business_definition_contains_unsupported_value');
}

function cloneJson<T>(value: T): T {
  return structuredClone(value);
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const nested of Object.values(value as Record<string, unknown>)) deepFreeze(nested);
  }
  return value;
}
