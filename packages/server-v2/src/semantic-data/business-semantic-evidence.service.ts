import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { createHash } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service.js';

const MAX_EVIDENCE_TEXT_LENGTH = 1000;
const MAX_NORMALIZED_VALUE_LENGTH = 256;
const MAX_DEFINITION_KEY_LENGTH = 160;
const MAX_METADATA_JSON_LENGTH = 16_000;
const SUPPORTED_DEFINITION_TYPES = new Set(['entity', 'field', 'relation', 'metric', 'dimension']);
const PERSON_ENTITY_PLACEHOLDER = '[PERSON_ENTITY]';
const PERSON_ENTITY_MARKERS = [
  'customer',
  'client',
  'person',
  'user',
  'staff',
  'employee',
  'beautician',
  'receptionist',
  '客户',
  '顾客',
  '员工',
  '美容师',
  '前台',
];
const ALIAS_COMMAND_PATTERN = /^(?:请|麻烦|帮我|给我|替我|能否|可以)?(?:查|查询|查看|看看|查一下|看一下|统计|分析|计算|告诉我)/;
const ALIAS_QUESTION_PATTERN = /(?:多少|几|是什么|是多少|怎么样|如何|有没有|吗|呢)[?？]?$/;

export type BusinessSemanticEvidenceClient = Pick<
  Prisma.TransactionClient,
  'brainRun' | 'businessDefinition' | 'businessDefinitionVersion' | 'businessSemanticEvidence' | 'brainEvalCase'
>;

type DefinitionRef = {
  definitionType: string;
  definitionKey: string;
  definitionVersion: number;
  definitionFingerprint: string;
  sourceFingerprint?: string;
};

type StructuredCorrection = Partial<DefinitionRef> & {
  sourceType?: string;
  alias?: string;
  confidence?: number;
};

type ModelIntentEvidence = {
  entities?: Array<{
    entityType?: string;
    mention?: string;
    source?: string;
    confidence?: number;
    definitionRef?: DefinitionRef;
  }>;
  metrics?: DefinitionRef[];
  dimensions?: DefinitionRef[];
};

export type CaptureModelSemanticEvidenceInput = {
  runId: number;
  storeId: number;
  userId: number;
  question: string;
  intent: ModelIntentEvidence;
  corrections?: StructuredCorrection[];
};

export type CaptureStructuredCorrectionInput = {
  sourceType: 'feedback_correction' | 'conversation_correction' | string;
  runId: number;
  storeId: number;
  userId: number;
  definitionType: string;
  definitionKey: string;
  alias: string;
  confidence?: number;
  question?: string;
  definitionVersion: number;
  definitionFingerprint: string;
  sourceFingerprint: string;
};

type ResolvedDefinition = {
  id: number;
  kind: string;
  definitionKey: string;
  targetVersion: {
    id: number;
    definitionId: number;
    version: number;
    fingerprint: string;
    sourceFingerprint: string;
  };
};

@Injectable()
export class BusinessSemanticEvidenceService {
  constructor(private readonly prisma: PrismaService) {}

  captureModelSuccess(input: CaptureModelSemanticEvidenceInput) {
    return this.prisma.$transaction((tx) => this.captureModelSuccessWithClient(input, tx));
  }

  async captureModelSuccessWithClient(
    input: CaptureModelSemanticEvidenceInput,
    client: BusinessSemanticEvidenceClient,
  ) {
    assertPositiveInteger(input.runId, 'runId');
    assertPositiveInteger(input.storeId, 'storeId');
    assertPositiveInteger(input.userId, 'userId');
    assertIntentCollectionLimits(input.intent);
    await this.assertRunScope(input, client);
    const question = redactModelQuestion(input.question, input.intent.entities ?? []);
    if (!question) throw new BadRequestException('business_semantic_question_required');

    const intentRefs = uniqueDefinitionRefs([
      ...(input.intent.entities ?? []).flatMap((entity) => (entity.definitionRef ? [entity.definitionRef] : [])),
      ...(input.intent.metrics ?? []),
      ...(input.intent.dimensions ?? []),
    ]);
    const validCorrections = (input.corrections ?? []).filter(isStructuredCorrection);
    const correctionRefs = validCorrections.map((correction) => correction as DefinitionRef);
    const allRefs = uniqueDefinitionRefs([...intentRefs, ...correctionRefs]);
    const resolvedByRef = await this.resolveCurrentDefinitions(allRefs, client);

    const evidenceIds: number[] = [];
    for (const entity of input.intent.entities ?? []) {
      if (entity.source !== 'user' || !entity.definitionRef || !entity.mention?.trim()) continue;
      const resolved = resolvedByRef.get(definitionRefIdentity(entity.definitionRef));
      if (!resolved) continue;
      const personEntity = isPersonEntity(entity);
      const evidence = await this.persistEvidence({
        sourceType: 'model_success',
        evidenceKind: 'entity_mention',
        status: 'grounding_only',
        runId: input.runId,
        storeId: input.storeId,
        userId: input.userId,
        definition: resolved,
        text: personEntity ? PERSON_ENTITY_PLACEHOLDER : entity.mention,
        ...(personEntity ? { normalizedValue: 'person_entity' } : {}),
        confidence: normalizeConfidence(entity.confidence, 0.9),
        metadata: personEntity ? { redaction: 'person_entity' } : { mentionSource: 'user' },
      }, client);
      evidenceIds.push(evidence.id);
    }

    for (const correction of validCorrections) {
      if (correctionAliasLooksLikeQuestion(correction.definitionType, correction.alias, input.question)) continue;
      const ref = correction as DefinitionRef;
      const resolved = resolvedByRef.get(definitionRefIdentity(ref));
      if (!resolved) continue;
      const evidence = await this.persistEvidence({
        sourceType: correction.sourceType ?? 'conversation_correction',
        evidenceKind: 'alias',
        status: 'pooled',
        runId: input.runId,
        storeId: input.storeId,
        userId: input.userId,
        definition: resolved,
        text: correction.alias!,
        confidence: normalizeConfidence(correction.confidence, 0.99),
        metadata: { explicitCorrection: true },
      }, client);
      evidenceIds.push(evidence.id);
    }

    for (const ref of intentRefs) {
      const resolved = resolvedByRef.get(definitionRefIdentity(ref));
      if (!resolved) continue;
      const evidence = await this.persistEvidence({
        sourceType: 'model_success',
        evidenceKind: 'regression_question',
        status: 'pooled',
        runId: input.runId,
        storeId: input.storeId,
        userId: input.userId,
        definition: resolved,
        text: question,
        confidence: 1,
        metadata: { sourceFingerprint: resolved.targetVersion.sourceFingerprint },
      }, client);
      evidenceIds.push(evidence.id);
      await this.upsertRegressionCase({
        evidenceFingerprint: evidence.idempotencyFingerprint,
        question,
        definition: resolved,
      }, client);
    }

    return { capturedCount: evidenceIds.length, evidenceIds: [...new Set(evidenceIds)] };
  }

  async captureStructuredCorrection(
    input: CaptureStructuredCorrectionInput,
    client?: BusinessSemanticEvidenceClient,
  ) {
    if (client) return this.captureStructuredCorrectionWithClient(input, client);
    return this.prisma.$transaction((tx) => this.captureStructuredCorrectionWithClient(input, tx));
  }

  async captureStructuredCorrectionWithClient(
    input: CaptureStructuredCorrectionInput,
    client: BusinessSemanticEvidenceClient,
  ) {
    assertPositiveInteger(input.runId, 'runId');
    assertPositiveInteger(input.storeId, 'storeId');
    assertPositiveInteger(input.userId, 'userId');
    await this.assertRunScope(input, client);
    assertCorrectionAlias(input.definitionType, input.alias, input.question);
    const definition = await this.resolveHistoricalDefinition({
      definitionType: input.definitionType,
      definitionKey: input.definitionKey,
      definitionVersion: input.definitionVersion,
      definitionFingerprint: input.definitionFingerprint,
      sourceFingerprint: input.sourceFingerprint,
    }, client);
    const evidence = await this.persistEvidence({
      sourceType: boundedString(input.sourceType, 40, 'sourceType'),
      evidenceKind: 'alias',
      status: 'pooled',
      runId: input.runId,
      storeId: input.storeId,
      userId: input.userId,
      definition,
      text: input.alias,
      confidence: normalizeConfidence(input.confidence, 0.99),
      metadata: {
        explicitCorrection: true,
        ...(input.question ? { redactedQuestion: redactBusinessSemanticText(input.question) } : {}),
      },
    }, client);
    await this.upsertAliasRegressionCase({
      evidenceFingerprint: evidence.idempotencyFingerprint,
      alias: evidence.redactedText,
      definition,
    }, client);
    return { evidenceId: evidence.id, idempotencyFingerprint: evidence.idempotencyFingerprint };
  }

  private async resolveCurrentDefinitions(
    refs: DefinitionRef[],
    client: BusinessSemanticEvidenceClient,
  ): Promise<Map<string, ResolvedDefinition>> {
    if (!refs.length) return new Map();
    const identities = new Map<string, { kind: string; definitionKey: string }>();
    for (const ref of refs) {
      assertCompleteDefinitionRef(ref);
      const kind = normalizeDefinitionType(ref.definitionType);
      const definitionKey = boundedString(ref.definitionKey, MAX_DEFINITION_KEY_LENGTH, 'definitionKey');
      identities.set(definitionIdentity({ definitionType: kind, definitionKey }), { kind, definitionKey });
    }
    const definitions = await client.businessDefinition.findMany({
      where: { OR: [...identities.values()].map((identity) => ({
        kind: identity.kind as never,
        definitionKey: identity.definitionKey,
      })) },
      include: { currentPublishedVersion: true },
    });
    const definitionsByKey = new Map(
      definitions.map((definition) => [
        definitionIdentity({ definitionType: String(definition.kind), definitionKey: definition.definitionKey }),
        definition,
      ]),
    );
    const resolved = new Map<string, ResolvedDefinition>();
    for (const ref of refs) {
      const definition = definitionsByKey.get(definitionIdentity(ref));
      const version = definition?.currentPublishedVersion;
      if (!definition || !version) {
        throw new BadRequestException('business_semantic_published_definition_not_found');
      }
      if (
        version.version !== ref.definitionVersion ||
        version.fingerprint !== ref.definitionFingerprint ||
        version.sourceFingerprint !== ref.sourceFingerprint
      ) {
        throw new BadRequestException('business_semantic_definition_ref_stale');
      }
      resolved.set(definitionRefIdentity(ref), {
        id: definition.id,
        kind: String(definition.kind),
        definitionKey: definition.definitionKey,
        targetVersion: {
          id: version.id,
          definitionId: definition.id,
          version: version.version,
          fingerprint: version.fingerprint,
          sourceFingerprint: version.sourceFingerprint,
        },
      });
    }
    return resolved;
  }

  private async resolveHistoricalDefinition(
    ref: DefinitionRef,
    client: BusinessSemanticEvidenceClient,
  ): Promise<ResolvedDefinition> {
    assertCompleteDefinitionRef(ref);
    const definitionType = normalizeDefinitionType(ref.definitionType);
    const definitionKey = boundedString(ref.definitionKey, MAX_DEFINITION_KEY_LENGTH, 'definitionKey');
    const version = await client.businessDefinitionVersion.findFirst({
      where: {
        version: ref.definitionVersion,
        fingerprint: ref.definitionFingerprint,
        sourceFingerprint: ref.sourceFingerprint,
        lifecycleStatus: 'published',
        definition: { kind: definitionType as never, definitionKey },
      },
      include: { definition: true },
    });
    if (
      !version ||
      version.definitionId !== version.definition.id ||
      version.definition.kind !== definitionType ||
      version.definition.definitionKey !== definitionKey
    ) {
      throw new BadRequestException('business_semantic_definition_ref_stale');
    }
    return {
      id: version.definition.id,
      kind: String(version.definition.kind),
      definitionKey: version.definition.definitionKey,
      targetVersion: {
        id: version.id,
        definitionId: version.definitionId,
        version: version.version,
        fingerprint: version.fingerprint,
        sourceFingerprint: version.sourceFingerprint,
      },
    };
  }

  private async assertRunScope(
    input: { runId: number; userId: number; storeId: number },
    client: BusinessSemanticEvidenceClient,
  ) {
    const run = await client.brainRun.findFirst({
      where: { id: input.runId, userId: input.userId, storeId: input.storeId },
      select: { id: true, userId: true, storeId: true, status: true },
    });
    if (!run) throw new ForbiddenException('business_semantic_run_scope_mismatch');
    return run;
  }

  private async persistEvidence(input: {
    sourceType: string;
    evidenceKind: 'alias' | 'entity_mention' | 'regression_question';
    status: 'pooled' | 'grounding_only';
    runId: number;
    storeId: number;
    userId: number;
    definition: ResolvedDefinition;
    text: string;
    normalizedValue?: string;
    confidence: number;
    metadata?: Record<string, unknown>;
  }, client: BusinessSemanticEvidenceClient) {
    const redactedText = redactBusinessSemanticText(input.text);
    const normalizedValue = input.normalizedValue
      ? boundedString(input.normalizedValue, MAX_NORMALIZED_VALUE_LENGTH, 'normalizedValue')
      : normalizeBusinessSemanticValue(redactedText);
    if (!redactedText || !normalizedValue) {
      throw new BadRequestException('business_semantic_evidence_text_required');
    }
    const sourceType = boundedString(input.sourceType, 40, 'sourceType').toLowerCase();
    const idempotencyFingerprint = createBusinessSemanticEvidenceFingerprint({
      sourceType,
      runId: input.runId,
      definitionType: input.definition.kind,
      definitionKey: input.definition.definitionKey,
      evidenceKind: input.evidenceKind,
      definitionVersionId: input.definition.targetVersion.id,
      definitionVersion: input.definition.targetVersion.version,
      definitionFingerprint: input.definition.targetVersion.fingerprint,
      normalizedValue,
    });
    const now = new Date();
    const metadata = sanitizeMetadata(input.metadata);
    return client.businessSemanticEvidence.upsert({
      where: { idempotencyFingerprint },
      create: {
        sourceType,
        evidenceKind: input.evidenceKind,
        runId: input.runId,
        storeId: input.storeId,
        userId: input.userId,
        definitionId: input.definition.id,
        definitionVersionId: input.definition.targetVersion.id,
        definitionType: input.definition.kind,
        definitionKey: input.definition.definitionKey,
        definitionVersion: input.definition.targetVersion.version,
        definitionFingerprint: input.definition.targetVersion.fingerprint,
        definitionSourceFingerprint: input.definition.targetVersion.sourceFingerprint,
        redactedText,
        normalizedValue,
        confidence: input.confidence,
        status: input.status,
        idempotencyFingerprint,
        firstSeenAt: now,
        lastSeenAt: now,
        ...(metadata ? { metadata } : {}),
      },
      update: {
        lastSeenAt: now,
        confidence: input.confidence,
        ...(metadata ? { metadata } : {}),
      },
    });
  }

  private upsertRegressionCase(input: {
    evidenceFingerprint: string;
    question: string;
    definition: ResolvedDefinition;
  }, client: BusinessSemanticEvidenceClient) {
    const caseKey = `semantic-evidence:${input.evidenceFingerprint}`;
    const expected = {
      definitionType: input.definition.kind,
      definitionKey: input.definition.definitionKey,
      definitionVersion: input.definition.targetVersion.version,
      definitionFingerprint: input.definition.targetVersion.fingerprint,
    };
    const caseInput = { message: input.question, source: 'business_semantic_evidence' };
    return client.brainEvalCase.upsert({
      where: { caseKey },
      create: {
        caseKey,
        scenario: 'runtime_semantic_regression',
        input: caseInput as Prisma.InputJsonValue,
        expected: expected as Prisma.InputJsonValue,
        assertionType: 'business_definition_ref',
        enabled: false,
        businessDefinitionVersionId: input.definition.targetVersion.id,
        definitionFingerprint: input.definition.targetVersion.fingerprint,
        generatedByProjection: false,
      },
      update: {
        input: caseInput as Prisma.InputJsonValue,
        expected: expected as Prisma.InputJsonValue,
        businessDefinitionVersionId: input.definition.targetVersion.id,
        definitionFingerprint: input.definition.targetVersion.fingerprint,
      },
    });
  }

  private upsertAliasRegressionCase(input: {
    evidenceFingerprint: string;
    alias: string;
    definition: ResolvedDefinition;
  }, client: BusinessSemanticEvidenceClient) {
    const caseKey = `semantic-evidence:${input.evidenceFingerprint}`;
    const expected = {
      definitionType: input.definition.kind,
      definitionKey: input.definition.definitionKey,
      definitionVersion: input.definition.targetVersion.version,
      definitionFingerprint: input.definition.targetVersion.fingerprint,
      sourceFingerprint: input.definition.targetVersion.sourceFingerprint,
    };
    const caseInput = { message: input.alias, source: 'business_semantic_alias_evidence' };
    return client.brainEvalCase.upsert({
      where: { caseKey },
      create: {
        caseKey,
        scenario: 'runtime_semantic_alias_regression',
        input: caseInput as Prisma.InputJsonValue,
        expected: expected as Prisma.InputJsonValue,
        assertionType: 'business_definition_ref',
        enabled: false,
        businessDefinitionVersionId: input.definition.targetVersion.id,
        definitionFingerprint: input.definition.targetVersion.fingerprint,
        generatedByProjection: false,
      },
      update: {
        input: caseInput as Prisma.InputJsonValue,
        expected: expected as Prisma.InputJsonValue,
        enabled: false,
        businessDefinitionVersionId: input.definition.targetVersion.id,
        definitionFingerprint: input.definition.targetVersion.fingerprint,
        generatedByProjection: false,
      },
    });
  }
}

export function redactBusinessSemanticText(value: unknown): string {
  return String(value ?? '')
    .normalize('NFKC')
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[EMAIL]')
    .replace(/(?:微信号|微信|wechat|wx)\s*[:：]?\s*[A-Za-z][A-Za-z0-9_-]{5,19}/gi, '[WECHAT]')
    .replace(/(?<!\d)\d{17}[\dXx](?!\d)/g, '[ID_CARD]')
    .replace(/(?<!\d)1[3-9]\d{9}(?!\d)/g, '[PHONE]')
    .replace(/(?<!\d)0\d{2,3}[-\s]?\d{7,8}(?!\d)/g, '[LANDLINE]')
    .replace(/(?<!\d)\d{6,}(?!\d)/g, '[LONG_NUMBER]')
    .trim()
    .slice(0, MAX_EVIDENCE_TEXT_LENGTH);
}

export function normalizeBusinessSemanticValue(value: unknown): string {
  return redactBusinessSemanticText(value)
    .toLowerCase()
    .replace(/[\s\p{P}\p{S}]+/gu, '')
    .slice(0, MAX_NORMALIZED_VALUE_LENGTH);
}

function redactModelQuestion(
  question: unknown,
  entities: NonNullable<ModelIntentEvidence['entities']>,
): string {
  let redacted = String(question ?? '').normalize('NFKC');
  const personMentions = [...new Set(
    entities
      .filter(isPersonEntity)
      .map((entity) => String(entity.mention ?? '').normalize('NFKC').trim())
      .filter(Boolean),
  )].sort((left, right) => right.length - left.length);
  for (const mention of personMentions) {
    redacted = redacted.split(mention).join(PERSON_ENTITY_PLACEHOLDER);
  }
  return redactBusinessSemanticText(redacted);
}

function isPersonEntity(entity: NonNullable<ModelIntentEvidence['entities']>[number]): boolean {
  return isPersonSemanticEntity({
    entityType: entity.entityType,
    definitionKey: entity.definitionRef?.definitionKey,
  });
}

export function isPersonSemanticEntity(input: { entityType?: unknown; definitionKey?: unknown }): boolean {
  return [input.entityType, input.definitionKey]
    .filter((value): value is string => typeof value === 'string' && Boolean(value.trim()))
    .map((value) => value.normalize('NFKC').trim().toLowerCase())
    .some((value) => PERSON_ENTITY_MARKERS.some((marker) => value.includes(marker)));
}

export function createBusinessSemanticEvidenceFingerprint(input: {
  sourceType: string;
  evidenceKind: string;
  runId: number;
  definitionType: string;
  definitionKey: string;
  definitionVersionId: number;
  definitionVersion: number;
  definitionFingerprint: string;
  normalizedValue: string;
}): string {
  return createHash('sha256')
    .update(
      JSON.stringify({
        sourceType: input.sourceType.trim().toLowerCase(),
        evidenceKind: input.evidenceKind.trim().toLowerCase(),
        runId: input.runId,
        definitionType: input.definitionType.trim().toLowerCase(),
        definitionKey: input.definitionKey,
        definitionVersionId: input.definitionVersionId,
        definitionVersion: input.definitionVersion,
        definitionFingerprint: input.definitionFingerprint.toLowerCase(),
        normalizedValue: input.normalizedValue,
      }),
    )
    .digest('hex');
}

function uniqueDefinitionRefs(refs: DefinitionRef[]): DefinitionRef[] {
  const unique = new Map<string, DefinitionRef>();
  for (const ref of refs) {
    if (!ref?.definitionType || !ref.definitionKey) continue;
    unique.set(definitionRefIdentity(ref), ref);
  }
  return [...unique.values()];
}

function definitionIdentity(ref: Pick<DefinitionRef, 'definitionType' | 'definitionKey'>): string {
  return `${ref.definitionType.toLowerCase()}\u0000${ref.definitionKey}`;
}

function definitionRefIdentity(ref: DefinitionRef): string {
  return [
    definitionIdentity(ref),
    ref.definitionVersion,
    ref.definitionFingerprint.toLowerCase(),
    String(ref.sourceFingerprint ?? '').toLowerCase(),
  ].join('\u0000');
}

function isStructuredCorrection(value: StructuredCorrection): value is StructuredCorrection & DefinitionRef & { alias: string } {
  return Boolean(
    value &&
      typeof value.definitionType === 'string' &&
      typeof value.definitionKey === 'string' &&
      typeof value.definitionVersion === 'number' &&
      typeof value.definitionFingerprint === 'string' &&
      typeof value.sourceFingerprint === 'string' &&
      typeof value.alias === 'string' &&
      value.alias.trim(),
  );
}

function assertIntentCollectionLimits(intent: ModelIntentEvidence) {
  const entityCount = intent.entities?.length ?? 0;
  const metricCount = intent.metrics?.length ?? 0;
  const dimensionCount = intent.dimensions?.length ?? 0;
  if (entityCount > 20) throw new BadRequestException('business_semantic_entities_limit_exceeded');
  if (metricCount > 8) throw new BadRequestException('business_semantic_metrics_limit_exceeded');
  if (dimensionCount > 8) throw new BadRequestException('business_semantic_dimensions_limit_exceeded');
  if (entityCount + metricCount + dimensionCount > 32) {
    throw new BadRequestException('business_semantic_total_refs_limit_exceeded');
  }
}

function assertCompleteDefinitionRef(ref: DefinitionRef) {
  normalizeDefinitionType(ref.definitionType);
  boundedString(ref.definitionKey, MAX_DEFINITION_KEY_LENGTH, 'definitionKey');
  if (!Number.isInteger(ref.definitionVersion) || ref.definitionVersion <= 0) {
    throw new BadRequestException('business_semantic_definition_version_invalid');
  }
  if (!/^[0-9a-f]{64}$/i.test(ref.definitionFingerprint)) {
    throw new BadRequestException('business_semantic_definition_fingerprint_invalid');
  }
  if (!/^[0-9a-f]{64}$/i.test(ref.sourceFingerprint ?? '')) {
    throw new BadRequestException('business_semantic_source_fingerprint_invalid');
  }
}

function normalizeDefinitionType(value: unknown): string {
  const definitionType = boundedString(value, 40, 'definitionType').toLowerCase();
  if (!SUPPORTED_DEFINITION_TYPES.has(definitionType)) {
    throw new BadRequestException('business_semantic_definition_type_invalid');
  }
  return definitionType;
}

function normalizeConfidence(value: unknown, fallback: number): number {
  const confidence = value === undefined ? fallback : Number(value);
  if (!Number.isFinite(confidence) || confidence < 0 || confidence > 1) {
    throw new BadRequestException('business_semantic_confidence_invalid');
  }
  return confidence;
}

function assertCorrectionAlias(definitionType: string, alias: string, question?: string) {
  if (correctionAliasLooksLikeQuestion(definitionType, alias, question)) {
    throw new BadRequestException('business_semantic_alias_looks_like_question');
  }
}

function correctionAliasLooksLikeQuestion(definitionType: string, alias: string, question?: string): boolean {
  const normalizedType = String(definitionType ?? '').trim().toLowerCase();
  if (normalizedType !== 'metric' && normalizedType !== 'dimension') return false;
  const redactedAlias = redactBusinessSemanticText(alias);
  const normalizedAlias = normalizeBusinessSemanticValue(redactedAlias);
  const normalizedQuestion = question ? normalizeBusinessSemanticValue(question) : '';
  const compactAlias = redactedAlias.replace(/\s+/g, '');
  return Boolean(
    (normalizedQuestion && normalizedAlias === normalizedQuestion) ||
    redactedAlias.length > 40 ||
    /[?？]$/.test(redactedAlias) ||
    ALIAS_COMMAND_PATTERN.test(compactAlias) ||
    ALIAS_QUESTION_PATTERN.test(compactAlias),
  );
}

function boundedString(value: unknown, maxLength: number, field: string): string {
  if (typeof value !== 'string' || !value.trim()) throw new BadRequestException(`business_semantic_${field}_required`);
  const normalized = value.trim();
  if (normalized.length > maxLength) throw new BadRequestException(`business_semantic_${field}_too_long`);
  return normalized;
}

function sanitizeMetadata(value: Record<string, unknown> | undefined): Prisma.InputJsonValue | undefined {
  if (!value) return undefined;
  const sanitized = JSON.parse(
    JSON.stringify(value, (_key, item) => (typeof item === 'string' ? item.slice(0, 1000) : item)),
  ) as Prisma.InputJsonValue;
  if (JSON.stringify(sanitized).length > MAX_METADATA_JSON_LENGTH) {
    throw new BadRequestException('business_semantic_metadata_too_large');
  }
  return sanitized;
}

function assertPositiveInteger(value: number, field: string) {
  if (!Number.isInteger(value) || value <= 0) throw new BadRequestException(`business_semantic_${field}_invalid`);
}
