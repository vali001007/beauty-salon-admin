import { Injectable } from '@nestjs/common';
import {
  createPrismaStoreScopeResolver,
  deriveCanonicalOntologyIdentity,
  findSemanticAliasConflicts,
  isExecutableOwnerRelation,
  normalizeSemanticAlias,
} from './brain-semantic-candidate.types.js';
import type {
  BusinessDefinitionCandidateDraft,
  BusinessDefinitionCandidateEvidence,
  CanonicalOntologyCandidateIdentity,
  PrismaDatamodelAst,
  PrismaFieldAst,
  PrismaModelAst,
  SemanticLabelEvidence,
  VerifiedBusinessDefinitionCandidate,
} from './brain-semantic-candidate.types.js';

const PRISMA_SCHEMA_PATH = 'packages/server-v2/prisma/schema.prisma';

@Injectable()
export class BrainSemanticCandidateVerifierService {
  verify(
    candidate: BusinessDefinitionCandidateDraft,
    context: { datamodel: PrismaDatamodelAst; semanticEvidence: SemanticLabelEvidence[] },
  ): VerifiedBusinessDefinitionCandidate {
    const blockedReasons: string[] = [];
    const models = new Map(context.datamodel.models.map((model) => [model.name, model]));
    const enums = new Map(
      context.datamodel.enums.map((item) => [
        item.name,
        item.values.map((value) => (typeof value === 'string' ? value : value.name)),
      ]),
    );
    const resolveStoreScope = createPrismaStoreScopeResolver(context.datamodel);
    const identity = deriveCanonicalOntologyIdentity(candidate.kind, candidate.payload);
    const hasAliasConflictContext = Array.isArray(context.semanticEvidence);
    const aliasConflicts = collectAliasConflicts(
      candidate.evidence,
      hasAliasConflictContext ? context.semanticEvidence : [],
    );

    if (!candidate.evidence.some(isStructuralEvidence)) blockedReasons.push('structural_evidence_missing');
    if (!identity) blockedReasons.push('canonical_identity_not_derivable');
    else verifyCanonicalIdentity(candidate, identity, blockedReasons);
    if (!hasAliasConflictContext && stringArray(candidate.payload.aliases).length > 0) {
      blockedReasons.push('alias_conflict_context_missing');
    }
    verifyCandidateAliasConflicts(candidate, aliasConflicts, blockedReasons);

    const aliases = hasAliasConflictContext ? verifiedAliases(candidate.evidence, aliasConflicts) : [];
    let payload: Record<string, unknown> = { aliases };
    let storeScope: Record<string, unknown> = { mode: 'global' };

    if (candidate.kind === 'entity') {
      const modelName = stringValue(candidate.payload.model);
      const model = assertModel(modelName, models, blockedReasons);
      if (model) verifyStructuralEvidence(candidate.evidence, model.name, model.sourcePath, blockedReasons);
      storeScope = verifyStoreScope(candidate, modelName, resolveStoreScope, blockedReasons);
      payload = model ? entityPayload(model, aliases) : { model: modelName, aliases };
    } else if (candidate.kind === 'field') {
      const modelName = stringValue(candidate.payload.model);
      const fieldName = stringValue(candidate.payload.field);
      const model = assertModel(modelName, models, blockedReasons);
      const field = model?.fields.find((item) => item.name === fieldName && item.kind !== 'object');
      if (!field) blockedReasons.push(`field_not_found:${modelName}.${fieldName}`);
      if (field) {
        verifyFieldContract(candidate, modelName, field, enums, blockedReasons);
        verifyStructuralEvidence(
          candidate.evidence,
          `${modelName}.${field.name}`,
          field.sourcePath ?? model?.sourcePath,
          blockedReasons,
        );
      }
      storeScope = verifyStoreScope(candidate, modelName, resolveStoreScope, blockedReasons);
      payload = field ? fieldPayload(modelName, field, aliases) : { model: modelName, field: fieldName, aliases };
    } else if (candidate.kind === 'relation') {
      const fromModelName = stringValue(candidate.payload.fromModel);
      const relationField = stringValue(candidate.payload.relationField);
      const fromModel = assertModel(fromModelName, models, blockedReasons);
      const field = fromModel?.fields.find((item) => item.name === relationField && item.kind === 'object');
      if (!field) blockedReasons.push(`relation_field_not_found:${fromModelName}.${relationField}`);
      if (field) {
        verifyRelationContract(candidate, fromModelName, field, models, blockedReasons);
        verifyStructuralEvidence(
          candidate.evidence,
          `${fromModelName}.${field.name}`,
          field.sourcePath ?? fromModel?.sourcePath,
          blockedReasons,
        );
      }
      storeScope = verifyStoreScope(candidate, fromModelName, resolveStoreScope, blockedReasons);
      payload = field
        ? relationPayload(fromModelName, field, aliases)
        : {
            fromModel: fromModelName,
            relationField,
            aliases,
          };
    } else if (candidate.kind === 'status_dictionary') {
      const enumName = stringValue(candidate.payload.enumName);
      const sourceValues = enums.get(enumName);
      if (!sourceValues) blockedReasons.push(`enum_not_found:${enumName}`);
      const values = stringArray(candidate.payload.values);
      if (!values.length) blockedReasons.push('enum_values_empty');
      if (sourceValues && !sameValues(values, sourceValues)) blockedReasons.push(`enum_values_mismatch:${enumName}`);
      const enumRecord = context.datamodel.enums.find((item) => item.name === enumName);
      if (enumRecord) verifyStructuralEvidence(candidate.evidence, enumName, enumRecord.sourcePath, blockedReasons);
      payload = {
        enumName,
        values: sourceValues ? [...sourceValues] : values,
        aliases,
      };
      storeScope = { mode: 'global' };
    } else {
      blockedReasons.push(`candidate_kind_not_supported_in_ontology_slice:${candidate.kind}`);
    }

    const uniqueReasons = [...new Set(blockedReasons)].sort();
    return {
      status: uniqueReasons.length ? 'blocked' : 'draft',
      blockedReasons: uniqueReasons,
      draftInput: rebuildDraftInput(candidate, identity, payload, storeScope),
    };
  }
}

function verifyCanonicalIdentity(
  candidate: BusinessDefinitionCandidateDraft,
  identity: CanonicalOntologyCandidateIdentity,
  blockedReasons: string[],
) {
  if (candidate.definitionKey !== identity.definitionKey) {
    blockedReasons.push(`identity_definition_key_mismatch:${identity.definitionKey}`);
  }
  if (candidate.domain !== identity.domain) blockedReasons.push(`identity_domain_mismatch:${identity.domain}`);
  if (candidate.name !== identity.name) blockedReasons.push(`identity_name_mismatch:${identity.name}`);
  if (candidate.ownerType !== identity.ownerType) {
    blockedReasons.push(`identity_owner_type_mismatch:${identity.ownerType}`);
  }
  if (candidate.ownerId !== identity.ownerId) {
    blockedReasons.push(`identity_owner_id_mismatch:${identity.ownerId}`);
  }
  if (candidate.schemaVersion !== identity.schemaVersion) {
    blockedReasons.push(`identity_schema_version_mismatch:${identity.schemaVersion}`);
  }
  if (candidate.canonicalQueryRef !== undefined) blockedReasons.push('canonical_query_ref_not_allowed');
  if (candidate.fixtureSetKey !== undefined) blockedReasons.push('fixture_set_key_not_allowed');
}

function verifyStructuralEvidence(
  evidence: BusinessDefinitionCandidateEvidence[],
  expectedSymbol: string,
  sourcePath: string | undefined,
  blockedReasons: string[],
) {
  const structural = evidence.filter(isStructuralEvidence);
  if (!structural.length) return;
  const expectedPath = sourcePath ?? PRISMA_SCHEMA_PATH;
  if (structural.some((item) => item.sourceSymbol !== expectedSymbol)) {
    blockedReasons.push(`structural_evidence_symbol_mismatch:${expectedSymbol}`);
  }
  if (structural.some((item) => item.sourcePath !== expectedPath)) {
    blockedReasons.push(`structural_evidence_path_mismatch:${expectedPath}`);
  }
}

function verifyFieldContract(
  candidate: BusinessDefinitionCandidateDraft,
  modelName: string,
  field: PrismaFieldAst,
  enums: Map<string, string[]>,
  blockedReasons: string[],
) {
  const symbol = `${modelName}.${field.name}`;
  if (candidate.payload.scalarType !== field.type)
    blockedReasons.push(`field_scalar_type_mismatch:${symbol}:${field.type}`);
  if (candidate.payload.required !== Boolean(field.isRequired)) {
    blockedReasons.push(`field_required_mismatch:${symbol}:${Boolean(field.isRequired)}`);
  }
  if (candidate.payload.list !== Boolean(field.isList)) {
    blockedReasons.push(`field_list_mismatch:${symbol}:${Boolean(field.isList)}`);
  }
  if (candidate.payload.id !== Boolean(field.isId)) {
    blockedReasons.push(`field_id_mismatch:${symbol}:${Boolean(field.isId)}`);
  }
  if (candidate.payload.unique !== Boolean(field.isUnique)) {
    blockedReasons.push(`field_unique_mismatch:${symbol}:${Boolean(field.isUnique)}`);
  }
  const expectedEnum = field.kind === 'enum' ? field.type : null;
  if ((candidate.payload.enumName ?? null) !== expectedEnum) {
    blockedReasons.push(`field_enum_mismatch:${symbol}:${expectedEnum ?? 'null'}`);
  }
  if (expectedEnum && !enums.has(expectedEnum)) blockedReasons.push(`enum_not_found:${expectedEnum}`);
}

function verifyRelationContract(
  candidate: BusinessDefinitionCandidateDraft,
  fromModelName: string,
  field: PrismaFieldAst,
  models: Map<string, PrismaModelAst>,
  blockedReasons: string[],
) {
  const symbol = `${fromModelName}.${field.name}`;
  if (!models.has(field.type)) blockedReasons.push(`model_not_found:${field.type}`);
  if (candidate.payload.toModel !== field.type) blockedReasons.push(`relation_target_mismatch:${symbol}:${field.type}`);
  if ((candidate.payload.relationName ?? null) !== (field.relationName ?? null)) {
    blockedReasons.push(`relation_name_mismatch:${symbol}:${field.relationName ?? 'null'}`);
  }
  if (!sameValues(stringArray(candidate.payload.relationFromFields), field.relationFromFields ?? [])) {
    blockedReasons.push(`relation_from_fields_mismatch:${symbol}:${(field.relationFromFields ?? []).join(',')}`);
  }
  if (!sameValues(stringArray(candidate.payload.relationToFields), field.relationToFields ?? [])) {
    blockedReasons.push(`relation_to_fields_mismatch:${symbol}:${(field.relationToFields ?? []).join(',')}`);
  }
  const cardinality = relationCardinality(field);
  if (candidate.payload.cardinality !== cardinality) {
    blockedReasons.push(`relation_cardinality_mismatch:${symbol}:${cardinality}`);
  }
  if (!isExecutableOwnerRelation(field) || candidate.payload.executableJoin !== true) {
    blockedReasons.push(`relation_join_not_executable:${symbol}`);
  }
}

function verifyStoreScope(
  candidate: BusinessDefinitionCandidateDraft,
  modelName: string,
  resolveStoreScope: (modelName: string) => boolean,
  blockedReasons: string[],
) {
  const expected = resolveStoreScope(modelName) ? 'current_store' : 'global';
  if (candidate.storeScope?.mode !== expected) blockedReasons.push(`store_scope_mismatch:${modelName}:${expected}`);
  return { mode: expected };
}

function rebuildDraftInput(
  candidate: BusinessDefinitionCandidateDraft,
  identity: CanonicalOntologyCandidateIdentity | undefined,
  payload: Record<string, unknown>,
  storeScope: Record<string, unknown>,
): VerifiedBusinessDefinitionCandidate['draftInput'] {
  const evidence = candidate.evidence.map(sanitizeEvidence);
  const canonical = identity ?? {
    definitionKey: candidate.definitionKey,
    domain: candidate.domain,
    name: candidate.name,
    ownerType: 'ami_core_semantic_scanner' as const,
    ownerId: '',
    schemaVersion: '1.0' as const,
  };
  return {
    definitionKey: canonical.definitionKey,
    kind: candidate.kind,
    domain: canonical.domain,
    name: canonical.name,
    ownerType: canonical.ownerType,
    ...(canonical.ownerId ? { ownerId: canonical.ownerId } : {}),
    lifecycleStatus: 'draft',
    schemaVersion: canonical.schemaVersion,
    payload,
    ...(candidate.timezone ? { timezone: candidate.timezone } : {}),
    storeScope,
    evidence,
  };
}

function entityPayload(model: PrismaModelAst, aliases: string[]) {
  return {
    model: model.name,
    storeScopeField: model.fields.some((field) => field.kind !== 'object' && field.name === 'storeId')
      ? 'storeId'
      : null,
    fields: model.fields.filter((field) => field.kind !== 'object').map((field) => field.name),
    relationFields: model.fields.filter((field) => field.kind === 'object').map((field) => field.name),
    aliases,
  };
}

function fieldPayload(modelName: string, field: PrismaFieldAst, aliases: string[]) {
  return {
    model: modelName,
    field: field.name,
    scalarType: field.type,
    enumName: field.kind === 'enum' ? field.type : null,
    required: Boolean(field.isRequired),
    list: Boolean(field.isList),
    id: Boolean(field.isId),
    unique: Boolean(field.isUnique),
    aliases,
  };
}

function relationPayload(modelName: string, field: PrismaFieldAst, aliases: string[]) {
  return {
    fromModel: modelName,
    relationField: field.name,
    toModel: field.type,
    relationName: field.relationName ?? null,
    relationFromFields: [...(field.relationFromFields ?? [])],
    relationToFields: [...(field.relationToFields ?? [])],
    cardinality: relationCardinality(field),
    executableJoin: isExecutableOwnerRelation(field),
    aliases,
  };
}

function sanitizeEvidence(evidence: BusinessDefinitionCandidateEvidence) {
  return {
    sourceType: evidence.sourceType,
    sourcePath: evidence.sourcePath,
    ...(evidence.sourceSymbol ? { sourceSymbol: evidence.sourceSymbol } : {}),
    ...(evidence.lineStart ? { lineStart: evidence.lineStart } : {}),
    ...(evidence.lineEnd ? { lineEnd: evidence.lineEnd } : {}),
    evidenceKind: evidence.evidenceKind,
    confidence: evidence.confidence,
    ...(evidence.conflictGroup ? { conflictGroup: evidence.conflictGroup } : {}),
  };
}

function verifiedAliases(evidence: BusinessDefinitionCandidateEvidence[], aliasConflicts: Set<string>) {
  return [
    ...new Set(
      evidence
        .filter(
          (item) =>
            item.evidenceKind === 'alias_observation' &&
            !item.conflictGroup &&
            item.confidence >= 0.8 &&
            Boolean(item.observedLabel?.trim()) &&
            !aliasConflicts.has(normalizeSemanticAlias(item.observedLabel ?? '')),
        )
        .map((item) => item.observedLabel!.trim()),
    ),
  ].sort();
}

function collectAliasConflicts(
  candidateEvidence: BusinessDefinitionCandidateEvidence[],
  semanticEvidence: SemanticLabelEvidence[],
) {
  const conflicts = findSemanticAliasConflicts(semanticEvidence);
  for (const item of candidateEvidence) {
    if (item.conflictGroup && item.observedLabel) conflicts.add(normalizeSemanticAlias(item.observedLabel));
  }
  return conflicts;
}

function verifyCandidateAliasConflicts(
  candidate: BusinessDefinitionCandidateDraft,
  aliasConflicts: Set<string>,
  blockedReasons: string[],
) {
  for (const alias of stringArray(candidate.payload.aliases)) {
    const normalized = normalizeSemanticAlias(alias);
    if (aliasConflicts.has(normalized)) blockedReasons.push(`alias_conflict:${normalized}`);
  }
}

function assertModel(
  modelName: string,
  models: Map<string, PrismaModelAst>,
  blockedReasons: string[],
): PrismaModelAst | undefined {
  const model = models.get(modelName);
  if (!model) blockedReasons.push(`model_not_found:${modelName}`);
  return model;
}

function isStructuralEvidence(evidence: BusinessDefinitionCandidateEvidence) {
  return (
    (evidence.sourceType === 'prisma_dmmf' || evidence.sourceType === 'prisma_schema_ast') &&
    evidence.evidenceKind !== 'alias_observation'
  );
}

function relationCardinality(field: PrismaFieldAst) {
  return field.isList ? 'many' : field.isRequired === false ? 'zero_or_one' : 'one';
}

function stringValue(value: unknown) {
  return typeof value === 'string' ? value : '';
}

function stringArray(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

function sameValues(left: string[], right: string[]) {
  return [...left].sort().join('\u0000') === [...right].sort().join('\u0000');
}
