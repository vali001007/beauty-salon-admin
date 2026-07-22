import { Injectable, Optional } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  BusinessSemanticAliasEvaluationPort,
  type BusinessSemanticAliasEvaluationResult,
  type BusinessSemanticAliasRegressionCase,
} from './business-semantic-alias-evaluation.service.js';
import {
  BusinessDefinitionRegistryService,
  canonicalizeBusinessDefinition,
} from './business-definition-registry.service.js';
import { normalizeBusinessSemanticValue, redactBusinessSemanticText } from './business-semantic-evidence.service.js';

const DEFAULT_CLUSTER_LIMIT = 100;
const MAX_CLUSTER_LIMIT = 500;
const DEFAULT_PROCESS_LIMIT = 20;
const MAX_PROCESS_LIMIT = 100;
const LEASE_DURATION_MS = 60_000;
const MAX_PROCESS_ATTEMPTS = 3;
const ALIAS_SOURCE_TYPES = ['feedback_correction', 'conversation_correction'] as const;
const PERSON_PLACEHOLDER_VALUES = new Set(['person_entity', 'personentity']);
const PII_PLACEHOLDER_PATTERN = /\[(?:PHONE|EMAIL|WECHAT|ID_CARD|LANDLINE|LONG_NUMBER|PERSON_ENTITY)\]/i;
const ALIAS_COMMAND_PATTERN =
  /^(?:请|麻烦|帮我|给我|替我|能否|可以)?(?:查|查询|查看|看看|查一下|看一下|统计|分析|计算|告诉我)/;
const ALIAS_QUESTION_PATTERN = /(?:多少|几|是什么|是多少|怎么样|如何|有没有|吗|呢|呀|啊|嘛|么|吧)[?？]?$/;

type AliasEvidenceRecord = {
  id: number;
  sourceType: string;
  evidenceKind: string;
  userId: number;
  definitionId: number;
  definitionVersionId: number;
  definitionType: string;
  definitionKey: string;
  definitionVersion: number;
  redactedText: string;
  normalizedValue: string;
  confidence: number;
  status: string;
  idempotencyFingerprint: string;
  aliasCandidateId: number | null;
  firstSeenAt: Date;
  lastSeenAt: Date;
  metadata: unknown;
};

type ClusterGroupResult = {
  candidateId: number;
  clusteredCount: number;
};

type AliasCandidateRecord = {
  id: number;
  definitionId: number;
  versionId: number;
  definitionType: string;
  definitionKey: string;
  alias: string;
  normalizedAlias: string;
  occurrenceCount: number;
  distinctUserCount: number;
  averageConfidence: number;
  explicitCorrectionCount: number;
  maxExplicitConfidence: number;
  conflictDefinitions: unknown;
  regressionCaseIds: unknown;
  status: string;
  blockReason?: string | null;
  evalReport?: unknown;
  draftVersionId?: number | null;
  publishedVersionId?: number | null;
  attemptCount: number;
  leaseOwner?: string | null;
  leaseExpiresAt?: Date | null;
};

type PublishedDefinitionRecord = {
  id: number;
  definitionKey: string;
  kind: string;
  domain: string;
  name: string;
  ownerType: string;
  ownerId?: string | null;
  status: string;
  currentPublishedVersionId: number | null;
  currentPublishedVersion: {
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
  } | null;
};

type CandidateEvidenceRecord = {
  id: number;
  aliasCandidateId: number | null;
  definitionId: number;
  sourceType: string;
  evidenceKind: string;
  idempotencyFingerprint: string;
  userId: number;
  confidence: number;
  firstSeenAt: Date;
  lastSeenAt: Date;
};

type CandidateLease = {
  owner: string;
  expiresAt: Date;
};

@Injectable()
export class BusinessSemanticEvidenceWorkerService {
  private readonly workerId = `semantic-evidence-${process.pid}-${randomUUID().slice(0, 8)}`;

  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly registry?: BusinessDefinitionRegistryService,
    @Optional() private readonly evaluator?: BusinessSemanticAliasEvaluationPort,
  ) {}

  @Cron('* * * * *', { timeZone: 'Asia/Shanghai' })
  async poll() {
    if (process.env.BRAIN_SEMANTIC_EVIDENCE_WORKER_ENABLED?.trim().toLowerCase() !== 'true') {
      return { enabled: false, status: 'disabled' as const };
    }
    try {
      const result = await this.runBatch();
      return { enabled: true, status: 'completed' as const, ...result };
    } catch (error) {
      return {
        enabled: true,
        status: 'failed' as const,
        error: errorMessage(error),
      };
    }
  }

  async runBatch(limit = configuredBatchSize(), now = new Date()) {
    const clustered = await this.clusterEvidence(limit);
    const processed = await this.processCandidates(Math.min(limit, MAX_PROCESS_LIMIT), this.workerId, now);
    return { clustered, processed };
  }

  async processCandidates(limit = DEFAULT_PROCESS_LIMIT, workerId = this.workerId, now = new Date()) {
    const take = normalizeProcessLimit(limit);
    const candidates = await this.prisma.businessDefinitionAliasCandidate.findMany({
      where: {
        status: { in: ['pending', 'retry'] },
        OR: [{ leaseExpiresAt: null }, { leaseExpiresAt: { lte: now } }],
      },
      select: { id: true },
      orderBy: [{ lastSeenAt: 'asc' }, { id: 'asc' }],
      take,
    });
    const results = await Promise.allSettled(
      candidates.map((candidate) => this.processCandidate(candidate.id, workerId, now)),
    );
    return {
      selectedCount: candidates.length,
      processedCount: results.filter((item) => item.status === 'fulfilled').length,
      failedCount: results.filter((item) => item.status === 'rejected').length,
    };
  }

  async processCandidate(candidateId: number, workerId = this.workerId, now = new Date()) {
    const lease: CandidateLease = {
      owner: workerId,
      expiresAt: new Date(now.getTime() + LEASE_DURATION_MS),
    };
    const claim = await this.prisma.businessDefinitionAliasCandidate.updateMany({
      where: {
        id: candidateId,
        status: { in: ['pending', 'retry'] },
        OR: [{ leaseExpiresAt: null }, { leaseExpiresAt: { lte: now } }],
      },
      data: {
        leaseOwner: lease.owner,
        leaseExpiresAt: lease.expiresAt,
      },
    });
    if (claim.count !== 1) return { claimed: false, status: 'not_claimed' as const };
    try {
      return await this.processClaimedCandidate(candidateId, lease, now);
    } catch (error) {
      if (error instanceof LeaseLostError) return { claimed: true, status: 'lease_lost' as const };
      return this.recordProcessingFailure(candidateId, lease, error);
    }
  }

  async clusterEvidence(limit = DEFAULT_CLUSTER_LIMIT) {
    const take = normalizeClusterLimit(limit);
    const evidence = (await this.prisma.businessSemanticEvidence.findMany({
      where: {
        evidenceKind: 'alias',
        sourceType: { in: [...ALIAS_SOURCE_TYPES] },
        status: 'pooled',
        aliasCandidateId: null,
        NOT: [
          { normalizedValue: { in: [...PERSON_PLACEHOLDER_VALUES] } },
          { redactedText: { contains: '[PERSON_ENTITY]' } },
        ],
      },
      orderBy: [{ firstSeenAt: 'asc' }, { id: 'asc' }],
      take,
    })) as unknown as AliasEvidenceRecord[];

    const groups = groupAliasEvidence(evidence.filter(isEligibleAliasEvidence));
    for (const group of groups.values()) assertConsistentDefinitionSnapshot(group);
    const candidateIds = new Set<number>();
    let clusteredCount = 0;
    for (const group of groups.values()) {
      const result = await this.clusterGroup(group);
      candidateIds.add(result.candidateId);
      clusteredCount += result.clusteredCount;
    }

    return {
      scannedCount: evidence.length,
      clusteredCount,
      candidateCount: candidateIds.size,
    };
  }

  private async processClaimedCandidate(candidateId: number, lease: CandidateLease, now: Date) {
    const candidate = (await this.prisma.businessDefinitionAliasCandidate.findUnique({
      where: { id: candidateId },
    })) as unknown as AliasCandidateRecord | null;
    if (!candidate) throw new Error('business_semantic_alias_candidate_not_found');
    const definition = (await this.prisma.businessDefinition.findUnique({
      where: { id: candidate.definitionId },
      include: { currentPublishedVersion: true },
    })) as unknown as PublishedDefinitionRecord | null;
    const currentVersion = definition?.currentPublishedVersion;
    if (!definition || definition.status !== 'active' || !currentVersion) {
      throw new Error('business_semantic_current_definition_not_found');
    }
    if (
      definition.id !== candidate.definitionId ||
      String(definition.kind) !== candidate.definitionType ||
      definition.definitionKey !== candidate.definitionKey
    ) {
      throw new Error('business_semantic_alias_definition_snapshot_conflict');
    }
    const evidence = (await this.prisma.businessSemanticEvidence.findMany({
      where: {
        aliasCandidateId: candidate.id,
        definitionId: candidate.definitionId,
        evidenceKind: 'alias',
        sourceType: { in: [...ALIAS_SOURCE_TYPES] },
        status: 'clustered',
      },
      orderBy: [{ firstSeenAt: 'asc' }, { id: 'asc' }],
    })) as unknown as CandidateEvidenceRecord[];
    const safety = evaluateAliasSafety(candidate.alias, candidate.normalizedAlias);
    const threshold = evaluateConfidenceThreshold(candidate);
    if (!safety.passed) {
      return this.markReviewRequired(
        candidate,
        lease,
        'unsafe_alias',
        createEvalReport(candidate, now, {
          passed: false,
          outcome: 'review_required',
          safety,
          threshold,
          errors: safety.errors,
        }),
      );
    }

    const publishedDefinitions = (await this.prisma.businessDefinition.findMany({
      where: { status: 'active', currentPublishedVersionId: { not: null } },
      include: { currentPublishedVersion: true },
      orderBy: { id: 'asc' },
    })) as unknown as PublishedDefinitionRecord[];
    const conflict = inspectAliasConflicts(candidate, publishedDefinitions);
    if (conflict.conflicts.length === 0 && conflict.acceptedExisting) {
      await this.loadRegressionCases(candidate);
      const recoveredAutoPublish = candidate.draftVersionId === currentVersion.id;
      const status = recoveredAutoPublish ? 'auto_published' : 'accepted_existing';
      return this.finalizeCandidateWithCases(
        candidate,
        lease,
        definition,
        currentVersion,
        status,
        createEvalReport(candidate, now, {
          passed: true,
          outcome: status,
          safety,
          threshold,
          conflicts: [],
          errors: [],
        }),
      );
    }

    const automationActor = automationUserId();
    const reviewReason = conflict.conflicts.length
      ? 'alias_conflict'
      : !threshold.passed
        ? 'confidence_threshold_not_met'
        : !automationActor
          ? 'automation_actor_missing'
          : null;
    const draftActor = automationActor ?? sourceActorId(evidence);
    const draft = await this.ensureCandidateDraft(candidate, lease, definition, currentVersion, evidence, draftActor);
    if (!isAliasOnlyPayloadChange(currentVersion.payload, draft.payload, candidate.alias)) {
      return this.markReviewRequired(
        candidate,
        lease,
        'canonical_payload_changed',
        createEvalReport(candidate, now, {
          passed: false,
          outcome: 'review_required',
          safety,
          threshold,
          conflicts: conflict.conflicts,
          errors: ['canonical_payload_changed'],
        }),
        draft.id,
        conflict.conflicts,
      );
    }
    if (reviewReason) {
      return this.markReviewRequired(
        candidate,
        lease,
        reviewReason,
        createEvalReport(candidate, now, {
          passed: false,
          outcome: 'review_required',
          safety,
          threshold,
          conflicts: conflict.conflicts,
          errors: [reviewReason],
        }),
        draft.id,
        conflict.conflicts,
      );
    }
    if (!automationActor) throw new Error('business_semantic_automation_actor_missing');

    const regressionCases = await this.loadRegressionCases(candidate);
    const evaluation = await this.evaluateCandidate(candidate, draft.id, regressionCases);
    if (!evaluation.passed) {
      return this.markReviewRequired(
        candidate,
        lease,
        'evaluation_failed',
        createEvalReport(candidate, now, {
          passed: false,
          outcome: 'review_required',
          safety,
          threshold,
          conflicts: conflict.conflicts,
          evaluation,
          errors: evaluation.errors,
        }),
        draft.id,
        conflict.conflicts,
      );
    }

    const registry = this.requireRegistry();
    const validated = await registry.validateVersion(draft.id, { validatedBy: automationActor });
    if (validated.lifecycleStatus !== 'validated' || validated.validationStatus !== 'passed') {
      return this.markReviewRequired(
        candidate,
        lease,
        'registry_validation_failed',
        createEvalReport(candidate, now, {
          passed: false,
          outcome: 'review_required',
          safety,
          threshold,
          conflicts: [],
          evaluation,
          errors: ['registry_validation_failed'],
        }),
        draft.id,
      );
    }
    let published: Awaited<ReturnType<BusinessDefinitionRegistryService['publishVersion']>>;
    try {
      published = await registry.publishVersion(draft.id, {
        publishedBy: automationActor,
        expectedCurrentVersionId: currentVersion.id,
      });
    } catch (error) {
      const committed = await this.findCommittedPublication(candidate.definitionId, draft.id);
      if (!committed) throw error;
      published = committed as Awaited<ReturnType<BusinessDefinitionRegistryService['publishVersion']>>;
    }
    const evalReport = createEvalReport(candidate, now, {
      passed: true,
      outcome: 'auto_published',
      safety,
      threshold,
      conflicts: [],
      evaluation,
      errors: [],
    });
    return this.finalizeCandidateWithCases(
      candidate,
      lease,
      definition,
      published as never,
      'auto_published',
      { ...evalReport, publishedVersionId: published.id },
      draft.id,
    );
  }

  private async findCommittedPublication(definitionId: number, versionId: number) {
    const [definition, version] = await Promise.all([
      this.prisma.businessDefinition.findUnique({
        where: { id: definitionId },
        select: { currentPublishedVersionId: true },
      }),
      this.prisma.businessDefinitionVersion.findUnique({ where: { id: versionId } }),
    ]);
    if (
      definition?.currentPublishedVersionId !== versionId ||
      !version ||
      version.definitionId !== definitionId ||
      version.lifecycleStatus !== 'published'
    ) {
      return null;
    }
    return version;
  }

  private async ensureCandidateDraft(
    candidate: AliasCandidateRecord,
    lease: CandidateLease,
    definition: PublishedDefinitionRecord,
    current: NonNullable<PublishedDefinitionRecord['currentPublishedVersion']>,
    evidence: CandidateEvidenceRecord[],
    createdBy: number,
  ) {
    if (candidate.draftVersionId) {
      const existing = await this.prisma.businessDefinitionVersion.findUnique({
        where: { id: candidate.draftVersionId },
      });
      if (
        existing &&
        existing.definitionId === candidate.definitionId &&
        existing.lifecycleStatus !== 'published' &&
        existing.version > current.version &&
        isAliasOnlyPayloadChange(current.payload, existing.payload, candidate.alias)
      ) {
        return existing;
      }
    }
    if (!this.registry) throw new Error('business_semantic_registry_unavailable');
    const draft = await this.registry.createOrReuseDraft({
      definitionKey: definition.definitionKey,
      kind: definition.kind as never,
      domain: definition.domain,
      name: definition.name,
      ownerType: definition.ownerType,
      ownerId: definition.ownerId ?? undefined,
      lifecycleStatus: 'candidate',
      schemaVersion: current.schemaVersion,
      payload: appendAlias(current.payload, candidate.alias),
      canonicalQueryRef: current.canonicalQueryRef ?? undefined,
      fixtureSetKey: current.fixtureSetKey ?? undefined,
      timezone: current.timezone as 'Asia/Shanghai' | 'UTC',
      storeScope: cloneJson(current.storeScope) as Record<string, unknown>,
      evidence: uniqueCandidateEvidence(evidence, candidate),
      createdBy,
      candidateDiagnostics: undefined,
    });
    const binding = await this.prisma.businessDefinitionAliasCandidate.updateMany({
      where: leaseFence(candidate.id, lease),
      data: { draftVersionId: draft.id },
    });
    if (binding.count !== 1) throw new LeaseLostError();
    candidate.draftVersionId = draft.id;
    return draft;
  }

  private async loadRegressionCases(candidate: AliasCandidateRecord) {
    const ids = integerArray(candidate.regressionCaseIds);
    if (!ids.length) return [];
    const cases = (await this.prisma.brainEvalCase.findMany({
      where: { id: { in: ids } },
      select: { id: true, caseKey: true, input: true, expected: true },
      orderBy: { id: 'asc' },
    })) as unknown as BusinessSemanticAliasRegressionCase[];
    return cases;
  }

  private async evaluateCandidate(
    candidate: AliasCandidateRecord,
    draftVersionId: number,
    regressionCases: BusinessSemanticAliasRegressionCase[],
  ): Promise<BusinessSemanticAliasEvaluationResult> {
    if (!this.registry || !this.evaluator) {
      return failedEvaluation('business_semantic_evaluator_unavailable', regressionCases);
    }
    if (regressionCases.length !== integerArray(candidate.regressionCaseIds).length) {
      return failedEvaluation('regression_case_missing', regressionCases);
    }
    try {
      const projections = await this.registry.previewProjections(draftVersionId);
      return await this.evaluator.evaluate({
        alias: candidate.alias,
        definitionId: candidate.definitionId,
        definitionType: candidate.definitionType,
        definitionKey: candidate.definitionKey,
        projections,
        regressionCases,
      });
    } catch (error) {
      return failedEvaluation(errorMessage(error), regressionCases);
    }
  }

  private requireRegistry() {
    if (!this.registry) throw new Error('business_semantic_registry_unavailable');
    return this.registry;
  }

  private async markReviewRequired(
    candidate: AliasCandidateRecord,
    lease: CandidateLease,
    blockReason: string,
    evalReport: Record<string, unknown>,
    draftVersionId?: number,
    conflicts: unknown[] = [],
  ) {
    const updated = await this.prisma.businessDefinitionAliasCandidate.updateMany({
      where: leaseFence(candidate.id, lease),
      data: {
        status: 'review_required',
        blockReason,
        conflictDefinitions: conflicts as Prisma.InputJsonValue,
        evalReport: evalReport as Prisma.InputJsonValue,
        ...(draftVersionId ? { draftVersionId } : {}),
        leaseOwner: null,
        leaseExpiresAt: null,
      },
    });
    if (updated.count !== 1) return { claimed: true, status: 'lease_lost' as const };
    return { claimed: true, status: 'review_required' as const };
  }

  private async finalizeCandidateWithCases(
    candidate: AliasCandidateRecord,
    lease: CandidateLease,
    definition: PublishedDefinitionRecord,
    version: NonNullable<PublishedDefinitionRecord['currentPublishedVersion']>,
    status: 'accepted_existing' | 'auto_published',
    evalReport: Record<string, unknown>,
    draftVersionId?: number,
  ) {
    const ids = integerArray(candidate.regressionCaseIds);
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.businessDefinitionAliasCandidate.updateMany({
        where: leaseFence(candidate.id, lease),
        data: {
          status,
          blockReason: null,
          conflictDefinitions: [] as Prisma.InputJsonValue,
          evalReport: evalReport as Prisma.InputJsonValue,
          ...(draftVersionId ? { draftVersionId } : {}),
          publishedVersionId: version.id,
          leaseOwner: null,
          leaseExpiresAt: null,
        },
      });
      if (updated.count !== 1) return { claimed: true, status: 'lease_lost' as const };
      if (ids.length) {
        await tx.brainEvalCase.updateMany({
          where: { id: { in: ids } },
          data: {
            enabled: true,
            businessDefinitionVersionId: version.id,
            definitionFingerprint: version.fingerprint,
            expected: {
              definitionType: definition.kind,
              definitionKey: definition.definitionKey,
              definitionVersion: version.version,
              definitionFingerprint: version.fingerprint,
              sourceFingerprint: version.sourceFingerprint,
            } as Prisma.InputJsonValue,
          },
        });
      }
      return { claimed: true, status };
    });
  }

  private async recordProcessingFailure(candidateId: number, lease: CandidateLease, error: unknown) {
    const message = errorMessage(error);
    return this.prisma.$transaction(async (tx) => {
      const deadLetter = await tx.businessDefinitionAliasCandidate.updateMany({
        where: {
          ...leaseFence(candidateId, lease),
          attemptCount: { gte: MAX_PROCESS_ATTEMPTS - 1 },
        },
        data: failureUpdateData('dead_letter', message),
      });
      if (deadLetter.count === 1) return { claimed: true, status: 'dead_letter' as const };
      const retry = await tx.businessDefinitionAliasCandidate.updateMany({
        where: {
          ...leaseFence(candidateId, lease),
          attemptCount: { lt: MAX_PROCESS_ATTEMPTS - 1 },
        },
        data: failureUpdateData('retry', message),
      });
      if (retry.count === 1) return { claimed: true, status: 'retry' as const };
      return { claimed: true, status: 'lease_lost' as const };
    });
  }

  private async clusterGroup(group: AliasEvidenceRecord[]): Promise<ClusterGroupResult> {
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      try {
        return await this.prisma.$transaction(async (tx) => this.clusterGroupInTransaction(group, tx), {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        });
      } catch (error) {
        if ((isPrismaCode(error, 'P2002') || isPrismaCode(error, 'P2034')) && attempt < 3) continue;
        throw error;
      }
    }
    throw new Error('business_semantic_alias_cluster_conflict');
  }

  private async clusterGroupInTransaction(
    group: AliasEvidenceRecord[],
    tx: Prisma.TransactionClient,
  ): Promise<ClusterGroupResult> {
    const representative = earliestEvidence(group);
    const latestVersion = latestVersionEvidence(group);
    const candidate = await tx.businessDefinitionAliasCandidate.upsert({
      where: {
        definitionId_normalizedAlias: {
          definitionId: representative.definitionId,
          normalizedAlias: representative.normalizedValue,
        },
      },
      create: {
        definitionId: latestVersion.definitionId,
        versionId: latestVersion.definitionVersionId,
        definitionType: representative.definitionType,
        definitionKey: representative.definitionKey,
        alias: representative.redactedText,
        normalizedAlias: representative.normalizedValue,
        occurrenceCount: 0,
        distinctUserCount: 0,
        averageConfidence: 0,
        explicitCorrectionCount: 0,
        maxExplicitConfidence: 0,
        conflictDefinitions: [] as Prisma.InputJsonValue,
        regressionCaseIds: [] as Prisma.InputJsonValue,
        status: 'pending',
        firstSeenAt: representative.firstSeenAt,
        lastSeenAt: latestSeenAt(group),
      },
      update: {},
    });
    if (
      candidate.definitionType !== representative.definitionType ||
      candidate.definitionKey !== representative.definitionKey
    ) {
      throw new Error('business_semantic_alias_definition_snapshot_conflict');
    }

    const linked = await tx.businessSemanticEvidence.updateMany({
      where: {
        id: { in: group.map((item) => item.id) },
        evidenceKind: 'alias',
        sourceType: { in: [...ALIAS_SOURCE_TYPES] },
        status: 'pooled',
        aliasCandidateId: null,
      },
      data: {
        aliasCandidateId: candidate.id,
        status: 'clustered',
      },
    });

    const associated = (await tx.businessSemanticEvidence.findMany({
      where: {
        aliasCandidateId: candidate.id,
        evidenceKind: 'alias',
        sourceType: { in: [...ALIAS_SOURCE_TYPES] },
        status: 'clustered',
      },
      orderBy: [{ firstSeenAt: 'asc' }, { id: 'asc' }],
    })) as unknown as AliasEvidenceRecord[];
    const statistics = calculateCandidateStatistics(associated);
    const caseKeys = associated.map((item) => `semantic-evidence:${item.idempotencyFingerprint}`);
    const regressionCases = caseKeys.length
      ? await tx.brainEvalCase.findMany({
          where: { caseKey: { in: caseKeys } },
          select: { id: true, caseKey: true },
        })
      : [];
    const sourceVersion = latestVersionEvidence(associated);
    const aliasSource = earliestEvidence(associated);

    await tx.businessDefinitionAliasCandidate.update({
      where: { id: candidate.id },
      data: {
        definitionId: sourceVersion.definitionId,
        versionId: sourceVersion.definitionVersionId,
        alias: aliasSource.redactedText,
        occurrenceCount: statistics.occurrenceCount,
        distinctUserCount: statistics.distinctUserCount,
        averageConfidence: statistics.averageConfidence,
        explicitCorrectionCount: statistics.explicitCorrectionCount,
        maxExplicitConfidence: statistics.maxExplicitConfidence,
        regressionCaseIds: regressionCases
          .map((item) => item.id)
          .sort((left, right) => left - right) as Prisma.InputJsonValue,
        firstSeenAt: statistics.firstSeenAt,
        lastSeenAt: statistics.lastSeenAt,
      },
    });

    return { candidateId: candidate.id, clusteredCount: linked.count };
  }
}

function groupAliasEvidence(evidence: AliasEvidenceRecord[]) {
  const groups = new Map<string, AliasEvidenceRecord[]>();
  for (const item of evidence) {
    const identity = [item.definitionId, item.normalizedValue].join('\u0000');
    const group = groups.get(identity) ?? [];
    group.push(item);
    groups.set(identity, group);
  }
  return groups;
}

function assertConsistentDefinitionSnapshot(evidence: AliasEvidenceRecord[]) {
  const representative = earliestEvidence(evidence);
  const conflict = evidence.some(
    (item) =>
      item.definitionId !== representative.definitionId ||
      item.definitionType !== representative.definitionType ||
      item.definitionKey !== representative.definitionKey,
  );
  if (conflict) throw new Error('business_semantic_alias_definition_snapshot_conflict');
}

function calculateCandidateStatistics(evidence: AliasEvidenceRecord[]) {
  if (!evidence.length) throw new Error('business_semantic_alias_cluster_empty');
  const explicit = evidence.filter(hasExplicitCorrection);
  return {
    occurrenceCount: evidence.length,
    distinctUserCount: new Set(evidence.map((item) => item.userId)).size,
    averageConfidence: evidence.reduce((sum, item) => sum + item.confidence, 0) / evidence.length,
    explicitCorrectionCount: explicit.length,
    maxExplicitConfidence: explicit.length ? Math.max(...explicit.map((item) => item.confidence)) : 0,
    firstSeenAt: new Date(Math.min(...evidence.map((item) => item.firstSeenAt.getTime()))),
    lastSeenAt: new Date(Math.max(...evidence.map((item) => item.lastSeenAt.getTime()))),
  };
}

function earliestEvidence(evidence: AliasEvidenceRecord[]) {
  if (!evidence.length) throw new Error('business_semantic_alias_cluster_empty');
  return [...evidence].sort(
    (left, right) => left.firstSeenAt.getTime() - right.firstSeenAt.getTime() || left.id - right.id,
  )[0]!;
}

function latestVersionEvidence(evidence: AliasEvidenceRecord[]) {
  if (!evidence.length) throw new Error('business_semantic_alias_cluster_empty');
  return [...evidence].sort(
    (left, right) =>
      right.definitionVersion - left.definitionVersion ||
      right.lastSeenAt.getTime() - left.lastSeenAt.getTime() ||
      right.id - left.id,
  )[0]!;
}

function latestSeenAt(evidence: AliasEvidenceRecord[]) {
  return new Date(Math.max(...evidence.map((item) => item.lastSeenAt.getTime())));
}

function isEligibleAliasEvidence(evidence: AliasEvidenceRecord) {
  return (
    evidence.evidenceKind === 'alias' &&
    ALIAS_SOURCE_TYPES.includes(evidence.sourceType as (typeof ALIAS_SOURCE_TYPES)[number]) &&
    evidence.status === 'pooled' &&
    evidence.aliasCandidateId === null &&
    !PERSON_PLACEHOLDER_VALUES.has(evidence.normalizedValue) &&
    !evidence.redactedText.includes('[PERSON_ENTITY]')
  );
}

function hasExplicitCorrection(evidence: AliasEvidenceRecord) {
  if (!evidence.metadata || typeof evidence.metadata !== 'object' || Array.isArray(evidence.metadata)) return false;
  return (evidence.metadata as Record<string, unknown>).explicitCorrection === true;
}

function normalizeClusterLimit(value: number) {
  if (!Number.isFinite(value)) return DEFAULT_CLUSTER_LIMIT;
  return Math.min(MAX_CLUSTER_LIMIT, Math.max(1, Math.trunc(value)));
}

function isPrismaCode(error: unknown, code: string) {
  return Boolean(error && typeof error === 'object' && 'code' in error && (error as { code?: unknown }).code === code);
}

function configuredBatchSize() {
  const value = Number(process.env.BRAIN_SEMANTIC_EVIDENCE_BATCH_SIZE ?? DEFAULT_CLUSTER_LIMIT);
  return normalizeClusterLimit(value);
}

function normalizeProcessLimit(value: number) {
  if (!Number.isFinite(value)) return DEFAULT_PROCESS_LIMIT;
  return Math.min(MAX_PROCESS_LIMIT, Math.max(1, Math.trunc(value)));
}

function automationUserId() {
  const value = Number(process.env.BRAIN_SEMANTIC_AUTOMATION_USER_ID);
  return Number.isInteger(value) && value > 0 ? value : null;
}

function evaluateAliasSafety(alias: string, normalizedAlias: string) {
  const value = String(alias ?? '')
    .normalize('NFKC')
    .trim();
  const normalized = normalizeBusinessSemanticValue(value);
  const compact = value.replace(/\s+/g, '');
  const piiProbe = value.replace(/[\s\-_‐‑‒–—﹘﹣－]+/gu, '');
  const errors: string[] = [];
  const length = Array.from(value).length;
  if (length < 2 || length > 40) errors.push('alias_length_invalid');
  if (!normalized || normalized !== normalizedAlias) errors.push('alias_normalization_mismatch');
  if (
    PII_PLACEHOLDER_PATTERN.test(value) ||
    PERSON_PLACEHOLDER_VALUES.has(normalized) ||
    normalized.includes('personentity') ||
    redactBusinessSemanticText(value) !== value ||
    redactBusinessSemanticText(piiProbe) !== piiProbe
  ) {
    errors.push('alias_sensitive_content');
  }
  if (/[?？]$/.test(value) || ALIAS_COMMAND_PATTERN.test(compact) || ALIAS_QUESTION_PATTERN.test(compact)) {
    errors.push('alias_question_or_command');
  }
  return { passed: errors.length === 0, length, normalizedAlias: normalized, errors: [...new Set(errors)] };
}

function evaluateConfidenceThreshold(candidate: AliasCandidateRecord) {
  const explicitPassed = candidate.explicitCorrectionCount >= 1 && candidate.maxExplicitConfidence >= 0.95;
  const independentUsersPassed = candidate.distinctUserCount >= 3 && candidate.averageConfidence >= 0.95;
  return {
    passed: explicitPassed || independentUsersPassed,
    explicitPassed,
    independentUsersPassed,
    explicitCorrectionCount: candidate.explicitCorrectionCount,
    maxExplicitConfidence: candidate.maxExplicitConfidence,
    distinctUserCount: candidate.distinctUserCount,
    averageConfidence: candidate.averageConfidence,
  };
}

function inspectAliasConflicts(candidate: AliasCandidateRecord, definitions: PublishedDefinitionRecord[]) {
  const alias = normalizeBusinessSemanticValue(candidate.alias);
  let acceptedExisting = false;
  const conflicts: Array<Record<string, unknown>> = [];
  for (const definition of definitions) {
    if (!definition.currentPublishedVersion) continue;
    const terms = [definition.name, ...payloadAliases(definition.currentPublishedVersion.payload)];
    const matched = terms.find((item) => normalizeBusinessSemanticValue(item) === alias);
    if (!matched) continue;
    if (definition.id === candidate.definitionId) {
      acceptedExisting = true;
      continue;
    }
    conflicts.push({
      definitionId: definition.id,
      definitionType: String(definition.kind),
      definitionKey: definition.definitionKey,
      name: definition.name,
      matchedTerm: matched,
      publishedVersionId: definition.currentPublishedVersion.id,
    });
  }
  return {
    acceptedExisting,
    conflicts: conflicts.sort((left, right) => Number(left.definitionId) - Number(right.definitionId)),
  };
}

function appendAlias(payload: unknown, alias: string): Record<string, unknown> {
  const value = cloneJson(record(payload));
  const aliases = payloadAliases(value);
  const normalized = new Set(aliases.map(normalizeBusinessSemanticValue));
  if (!normalized.has(normalizeBusinessSemanticValue(alias))) aliases.push(alias);
  return { ...value, aliases };
}

function isAliasOnlyPayloadChange(currentPayload: unknown, draftPayload: unknown, alias: string) {
  const current = cloneJson(record(currentPayload));
  const draft = cloneJson(record(draftPayload));
  const currentAliases = payloadAliases(current);
  const draftAliases = payloadAliases(draft);
  delete current.aliases;
  delete draft.aliases;
  if (canonicalizeBusinessDefinition(current) !== canonicalizeBusinessDefinition(draft)) return false;
  const expected = new Set(currentAliases.map(normalizeBusinessSemanticValue));
  expected.add(normalizeBusinessSemanticValue(alias));
  const actual = new Set(draftAliases.map(normalizeBusinessSemanticValue));
  return actual.size === expected.size && [...expected].every((item) => actual.has(item));
}

function uniqueCandidateEvidence(evidence: CandidateEvidenceRecord[], candidate: AliasCandidateRecord) {
  const unique = new Map<string, CandidateEvidenceRecord>();
  for (const item of evidence) unique.set(item.idempotencyFingerprint, item);
  const result = [...unique.values()].map((item) => ({
    sourceType: 'business_semantic_evidence',
    sourcePath: `business-semantic-evidence:${item.idempotencyFingerprint}`,
    sourceSymbol: candidate.alias,
    evidenceKind: 'alias_candidate',
    confidence: item.confidence,
  }));
  if (!result.length) throw new Error('business_semantic_alias_candidate_evidence_missing');
  return result;
}

function sourceActorId(evidence: CandidateEvidenceRecord[]) {
  const ids = evidence.map((item) => item.userId).filter((item) => Number.isInteger(item) && item > 0);
  if (!ids.length) throw new Error('business_semantic_alias_source_actor_missing');
  return Math.min(...ids);
}

function integerArray(value: unknown): number[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map(Number).filter((item) => Number.isInteger(item) && item > 0))].sort(
    (left, right) => left - right,
  );
}

function payloadAliases(value: unknown): string[] {
  const aliases = record(value).aliases;
  return Array.isArray(aliases)
    ? aliases.filter((item): item is string => typeof item === 'string' && Boolean(item.trim()))
    : [];
}

function failedEvaluation(
  error: string,
  cases: BusinessSemanticAliasRegressionCase[] = [],
): BusinessSemanticAliasEvaluationResult {
  return {
    passed: false,
    checks: {
      intentSemanticIndexContainsAlias: false,
      evalCaseProjectionContainsAlias: false,
      regressionCasesPassed: false,
    },
    caseResults: cases.map((item) => ({
      caseId: item.id,
      caseKey: item.caseKey,
      passed: false,
      errors: [error],
    })),
    errors: [error],
  };
}

function createEvalReport(candidate: AliasCandidateRecord, evaluatedAt: Date, detail: Record<string, unknown>) {
  return {
    version: '1.0',
    candidateId: candidate.id,
    definitionId: candidate.definitionId,
    definitionType: candidate.definitionType,
    definitionKey: candidate.definitionKey,
    alias: candidate.alias,
    normalizedAlias: candidate.normalizedAlias,
    evaluatedAt: evaluatedAt.toISOString(),
    statistics: {
      occurrenceCount: candidate.occurrenceCount,
      distinctUserCount: candidate.distinctUserCount,
      averageConfidence: candidate.averageConfidence,
      explicitCorrectionCount: candidate.explicitCorrectionCount,
      maxExplicitConfidence: candidate.maxExplicitConfidence,
    },
    ...detail,
  };
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error ?? 'business_semantic_alias_processing_failed');
}

function leaseFence(candidateId: number, lease: CandidateLease) {
  return {
    id: candidateId,
    leaseOwner: lease.owner,
    leaseExpiresAt: lease.expiresAt,
  };
}

function failureUpdateData(status: 'retry' | 'dead_letter', message: string) {
  return {
    status,
    attemptCount: { increment: 1 },
    blockReason: `processing_error:${message}`,
    evalReport: {
      passed: false,
      outcome: status,
      errors: [message],
    } as Prisma.InputJsonValue,
    leaseOwner: null,
    leaseExpiresAt: null,
  };
}

class LeaseLostError extends Error {
  constructor() {
    super('business_semantic_alias_candidate_lease_lost');
  }
}
