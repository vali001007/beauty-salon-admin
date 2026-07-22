import type { BusinessDefinitionKindValue } from './business-definition.dto.js';

export interface PrismaFieldAst {
  name: string;
  kind: 'scalar' | 'object' | 'enum' | 'unsupported';
  type: string;
  isRequired?: boolean;
  isList?: boolean;
  isId?: boolean;
  isUnique?: boolean;
  relationName?: string;
  relationFromFields?: string[];
  relationToFields?: string[];
  sourcePath?: string;
  lineStart?: number;
}

export interface PrismaModelAst {
  name: string;
  fields: PrismaFieldAst[];
  sourcePath?: string;
  lineStart?: number;
}

export interface PrismaEnumAst {
  name: string;
  values: Array<string | { name: string }>;
  sourcePath?: string;
  lineStart?: number;
}

export interface PrismaDatamodelAst {
  models: PrismaModelAst[];
  enums: PrismaEnumAst[];
}

export interface CandidateSourceFile {
  path: string;
  content: string;
}

export interface SemanticLabelEvidence {
  targetSymbol: string;
  label: string;
  sourceType: 'controller' | 'dto' | 'route' | 'menu' | 'eval_question' | 'metric_card' | 'report_service';
  sourcePath: string;
  sourceSymbol?: string;
  lineStart?: number;
  confidence: number;
  conflictGroup?: string;
  metadata?: Record<string, unknown>;
}

export interface BusinessDefinitionCandidateEvidence {
  sourceType: string;
  sourcePath: string;
  sourceSymbol?: string;
  lineStart?: number;
  lineEnd?: number;
  evidenceKind: string;
  confidence: number;
  conflictGroup?: string;
  observedLabel?: string;
}

export interface BusinessDefinitionCandidateDraft {
  definitionKey: string;
  kind: BusinessDefinitionKindValue;
  domain: string;
  name: string;
  ownerType: string;
  ownerId?: string;
  lifecycleStatus: 'candidate';
  schemaVersion: string;
  payload: Record<string, unknown>;
  canonicalQueryRef?: string;
  fixtureSetKey?: string;
  timezone?: 'Asia/Shanghai' | 'UTC';
  storeScope?: Record<string, unknown>;
  evidence: BusinessDefinitionCandidateEvidence[];
}

export interface VerifiedBusinessDefinitionCandidate {
  status: 'draft' | 'blocked';
  blockedReasons: string[];
  draftInput: Omit<BusinessDefinitionCandidateDraft, 'lifecycleStatus'> & { lifecycleStatus: 'draft' };
}

export interface CanonicalOntologyCandidateIdentity {
  definitionKey: string;
  domain: string;
  name: string;
  ownerType: 'ami_core_semantic_scanner';
  ownerId: string;
  schemaVersion: '1.0';
}

export function deriveCanonicalOntologyIdentity(
  kind: BusinessDefinitionKindValue,
  payload: Record<string, unknown>,
): CanonicalOntologyCandidateIdentity | undefined {
  if (kind === 'entity') {
    const model = nonEmptyString(payload.model);
    return model
      ? canonicalIdentity(
          `entity.${snakeCaseIdentifier(model)}`,
          snakeCaseIdentifier(model),
          model,
          `prisma:model:${model}`,
        )
      : undefined;
  }
  if (kind === 'field') {
    const model = nonEmptyString(payload.model);
    const field = nonEmptyString(payload.field);
    return model && field
      ? canonicalIdentity(
          `field.${snakeCaseIdentifier(model)}.${snakeCaseIdentifier(field)}`,
          snakeCaseIdentifier(model),
          `${model}.${field}`,
          `prisma:field:${model}.${field}`,
        )
      : undefined;
  }
  if (kind === 'relation') {
    const model = nonEmptyString(payload.fromModel);
    const field = nonEmptyString(payload.relationField);
    return model && field
      ? canonicalIdentity(
          `relation.${snakeCaseIdentifier(model)}.${snakeCaseIdentifier(field)}`,
          snakeCaseIdentifier(model),
          `${model}.${field}`,
          `prisma:relation:${model}.${field}`,
        )
      : undefined;
  }
  if (kind === 'status_dictionary') {
    const enumName = nonEmptyString(payload.enumName);
    return enumName
      ? canonicalIdentity(
          `status_dictionary.${snakeCaseIdentifier(enumName)}`,
          'shared',
          enumName,
          `prisma:enum:${enumName}`,
        )
      : undefined;
  }
  return undefined;
}

export function normalizeSemanticAlias(value: string) {
  const normalized = value.normalize('NFKC').trim().toLocaleLowerCase('zh-CN');
  let result = '';
  const punctuation = new Set([
    ' ',
    '\t',
    '\r',
    '\n',
    '-',
    '_',
    '.',
    ',',
    '，',
    '。',
    '、',
    ':',
    '：',
    ';',
    '；',
    '(',
    ')',
    '（',
    '）',
    '[',
    ']',
    '【',
    '】',
  ]);
  for (const character of normalized) {
    if (!punctuation.has(character)) result += character;
  }
  return result;
}

export function findSemanticAliasConflicts(evidence: Array<{ targetSymbol: string; label: string }>) {
  const targetsByAlias = new Map<string, Set<string>>();
  for (const item of evidence) {
    if (!item.targetSymbol || item.targetSymbol === '__unbound__') continue;
    const normalized = normalizeSemanticAlias(item.label);
    if (!normalized) continue;
    const targets = targetsByAlias.get(normalized) ?? new Set<string>();
    targets.add(item.targetSymbol);
    targetsByAlias.set(normalized, targets);
  }
  return new Set([...targetsByAlias.entries()].filter(([, targets]) => targets.size > 1).map(([alias]) => alias));
}

export function createPrismaStoreScopeResolver(datamodel: PrismaDatamodelAst) {
  const models = new Map(datamodel.models.map((model) => [model.name, model]));
  const memo = new Map<string, boolean>();
  for (const model of datamodel.models) {
    memo.set(
      model.name,
      model.name === 'Store' || model.fields.some((field) => field.kind !== 'object' && field.name === 'storeId'),
    );
  }

  let changed = true;
  while (changed) {
    changed = false;
    for (const model of datamodel.models) {
      if (memo.get(model.name)) continue;
      const scoped = model.fields.filter(isExecutableOwnerRelation).some((field) => memo.get(field.type) === true);
      if (scoped) {
        memo.set(model.name, true);
        changed = true;
      }
    }
  }

  return (modelName: string) => memo.get(modelName) === true && models.has(modelName);
}

export function isExecutableOwnerRelation(field: PrismaFieldAst) {
  return (
    field.kind === 'object' &&
    field.isList !== true &&
    Boolean(field.relationFromFields?.length) &&
    Boolean(field.relationToFields?.length)
  );
}

function canonicalIdentity(
  definitionKey: string,
  domain: string,
  name: string,
  ownerId: string,
): CanonicalOntologyCandidateIdentity {
  return {
    definitionKey,
    domain,
    name,
    ownerType: 'ami_core_semantic_scanner',
    ownerId,
    schemaVersion: '1.0',
  };
}

function nonEmptyString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function snakeCaseIdentifier(value: string) {
  let result = '';
  for (let index = 0; index < value.length; index += 1) {
    const character = value[index];
    const previous = value[index - 1];
    const isUpper = character >= 'A' && character <= 'Z';
    const previousIsLowerOrDigit =
      Boolean(previous) && ((previous >= 'a' && previous <= 'z') || (previous >= '0' && previous <= '9'));
    if (isUpper && previousIsLowerOrDigit) result += '_';
    if (
      (character >= 'A' && character <= 'Z') ||
      (character >= 'a' && character <= 'z') ||
      (character >= '0' && character <= '9')
    ) {
      result += character.toLowerCase();
    } else if (result && result[result.length - 1] !== '_') {
      result += '_';
    }
  }
  while (result.startsWith('_')) result = result.slice(1);
  while (result.endsWith('_')) result = result.slice(0, -1);
  return result;
}
