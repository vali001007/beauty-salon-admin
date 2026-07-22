import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service.js';
import {
  BusinessSemanticEvidenceService,
  isPersonSemanticEntity,
  redactBusinessSemanticText,
} from '../../semantic-data/business-semantic-evidence.service.js';

@Injectable()
export class BrainFeedbackService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly semanticEvidence: BusinessSemanticEvidenceService,
  ) {}

  async createFeedback(input: {
    runId: number;
    userId: number;
    storeId: number;
    rating: string;
    correction?: Prisma.InputJsonValue;
  }) {
    return this.prisma.$transaction(async (tx) => {
      const run = await tx.brainRun.findFirst({
        where: { id: input.runId, userId: input.userId, storeId: input.storeId },
        select: { id: true, userId: true, storeId: true, status: true, input: true, output: true },
      });
      if (!run) throw new ForbiddenException('brain_feedback_run_scope_mismatch');

      const correction = sanitizeFeedbackCorrection(input.correction);
      const structuredCorrection = parseStructuredCorrection(correction);
      if (structuredCorrection && run.status !== 'completed') {
        throw new BadRequestException('brain_feedback_correction_requires_completed_run');
      }
      if (structuredCorrection) {
        if (isPersonEntityRuntimeAlias(run.output, structuredCorrection.definitionType, structuredCorrection.definitionKey)) {
          throw new BadRequestException('person_entity_runtime_alias_forbidden');
        }
        const definitionRef = resolveRunDefinitionRef(
          run.output,
          structuredCorrection.definitionType,
          structuredCorrection.definitionKey,
        );
        await this.semanticEvidence.captureStructuredCorrectionWithClient({
          sourceType: 'feedback_correction',
          runId: input.runId,
          userId: input.userId,
          storeId: input.storeId,
          ...definitionRef,
          alias: structuredCorrection.alias,
          confidence: 0.99,
          question: readRunQuestion(run.input),
        }, tx);
      }
      return tx.brainFeedback.create({
        data: {
          runId: input.runId,
          userId: input.userId,
          storeId: input.storeId,
          rating: String(input.rating ?? '').trim().slice(0, 40),
          ...(correction ? { correction } : {}),
        },
      });
    });
  }

  listFeedback(input: { storeId: number }) {
    return this.prisma.brainFeedback.findMany({
      where: { storeId: input.storeId },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  async listUserIssues(input: { storeId: number; userId: number; page?: number; pageSize?: number }) {
    const page = Math.max(1, Math.trunc(Number(input.page) || 1));
    const pageSize = Math.min(50, Math.max(1, Math.trunc(Number(input.pageSize) || 10)));
    const where = {
      storeId: input.storeId,
      userId: input.userId,
      rating: 'needs_improvement',
    };
    const [feedback, total] = await Promise.all([
      this.prisma.brainFeedback.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: {
          id: true,
          runId: true,
          status: true,
          createdAt: true,
        },
      }),
      this.prisma.brainFeedback.count({ where }),
    ]);
    const runIds = [...new Set(feedback.map((item) => item.runId))];
    const runs = runIds.length
      ? await this.prisma.brainRun.findMany({
          where: {
            id: { in: runIds },
            storeId: input.storeId,
            userId: input.userId,
          },
          select: {
            id: true,
            conversationId: true,
            status: true,
            input: true,
            output: true,
          },
        })
      : [];
    const runsById = new Map(runs.map((run) => [run.id, run]));

    return {
      items: feedback.map((item) => {
        const run = runsById.get(item.runId);
        return {
          feedbackId: item.id,
          runId: item.runId,
          conversationId: run?.conversationId ?? null,
          question: readRunQuestion(run?.input) ?? '原问题未记录',
          answer: readRunAnswer(run?.output) ?? '原回答未记录',
          feedbackStatus: item.status,
          runStatus: run?.status ?? 'unavailable',
          createdAt: item.createdAt,
        };
      }),
      total,
      page,
      pageSize,
      storeId: input.storeId,
    };
  }

  async getDashboard(input: { storeId: number }) {
    const runs = await this.prisma.brainRun.findMany({
      where: { storeId: input.storeId },
      select: { status: true, latencyMs: true },
      orderBy: { createdAt: 'desc' },
      take: 1000,
    });
    const feedback = await this.prisma.brainFeedback.findMany({
      where: { storeId: input.storeId },
      select: { rating: true },
      take: 1000,
    });
    const actions = await this.prisma.brainActionExecution.findMany({
      where: { storeId: input.storeId },
      select: { status: true },
      take: 1000,
    });
    const findings = await this.prisma.brainInspectionFinding.findMany({
      where: { storeId: input.storeId },
      select: { status: true, feedback: true, disposition: true },
      take: 1000,
    });
    const latestEval = await this.prisma.brainEvalRun.findFirst({
      where: { storeId: input.storeId, status: 'completed' },
      orderBy: { createdAt: 'desc' },
      select: { summary: true },
    });
    const latencies = runs.map((run) => run.latencyMs).filter((value): value is number => value != null).sort((a, b) => a - b);
    const p95Index = latencies.length ? Math.min(latencies.length - 1, Math.ceil(latencies.length * 0.95) - 1) : -1;
    const actionSucceeded = actions.filter((action) => action.status === 'succeeded').length;
    const inspectionReviewed = findings.filter((finding) => finding.disposition != null).length;
    const falsePositive = findings.filter((finding) => finding.feedback === 'false_positive').length;
    return {
      runCount: runs.length,
      completedRate: runs.length ? runs.filter((run) => run.status === 'completed').length / runs.length : 0,
      failedRate: runs.length ? runs.filter((run) => run.status === 'failed').length / runs.length : 0,
      p95LatencyMs: p95Index >= 0 ? latencies[p95Index] : null,
      feedbackCount: feedback.length,
      helpfulRate: feedback.length ? feedback.filter((item) => item.rating === 'helpful').length / feedback.length : 0,
      actionCount: actions.length,
      actionSuccessRate: actions.length ? actionSucceeded / actions.length : 0,
      openFindingCount: findings.filter((finding) => finding.status === 'open').length,
      inspectionReviewedCount: inspectionReviewed,
      inspectionTruePositiveRate: inspectionReviewed ? (inspectionReviewed - falsePositive) / inspectionReviewed : null,
      latestEvalSummary: latestEval?.summary ?? null,
    };
  }
}

function parseStructuredCorrection(value: Prisma.InputJsonValue | undefined) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const root = value as Record<string, unknown>;
  const candidate =
    root.semanticCorrection && typeof root.semanticCorrection === 'object' && !Array.isArray(root.semanticCorrection)
      ? (root.semanticCorrection as Record<string, unknown>)
      : root;
  const definitionType = stringValue(candidate.definitionType);
  const definitionKey = stringValue(candidate.definitionKey);
  const alias = stringValue(candidate.alias);
  return definitionType && definitionKey && alias ? { definitionType, definitionKey, alias } : null;
}

function sanitizeFeedbackCorrection(value: Prisma.InputJsonValue | undefined): Prisma.InputJsonValue | undefined {
  if (value === undefined || value === null) return undefined;
  const sanitized = JSON.parse(
    JSON.stringify(value, (_key, item) =>
      typeof item === 'string' ? redactBusinessSemanticText(item).slice(0, 1000) : item,
    ),
  ) as Prisma.InputJsonValue;
  if (JSON.stringify(sanitized).length > 16_000) {
    throw new BadRequestException('brain_feedback_correction_too_large');
  }
  return sanitized;
}

function readRunQuestion(value: unknown): string | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const message = (value as Record<string, unknown>).message;
  return typeof message === 'string' ? message : undefined;
}

function readRunAnswer(value: unknown): string | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const answer = (value as Record<string, unknown>).answer;
  return typeof answer === 'string' ? answer : undefined;
}

type RunDefinitionRef = {
  definitionType: string;
  definitionKey: string;
  definitionVersion: number;
  definitionFingerprint: string;
  sourceFingerprint: string;
};

function resolveRunDefinitionRef(
  output: unknown,
  definitionType: string,
  definitionKey: string,
): RunDefinitionRef {
  const semanticIntent = readObject(readObject(output)?.semanticIntent);
  if (!semanticIntent) {
    throw new BadRequestException('brain_feedback_correction_definition_ref_missing');
  }

  const normalizedType = definitionType.trim().toLowerCase();
  const candidates = collectSemanticIntentRefs(semanticIntent).filter((candidate) => {
    const candidateType = stringValue(candidate.definitionType)?.toLowerCase();
    const candidateKey = stringValue(candidate.definitionKey);
    return candidateType === normalizedType && candidateKey === definitionKey;
  });
  if (!candidates.length) {
    throw new BadRequestException('brain_feedback_correction_definition_ref_missing');
  }

  const refs = candidates.map(parseCompleteRunDefinitionRef);
  if (refs.some((ref) => ref === null)) {
    throw new BadRequestException('brain_feedback_correction_definition_ref_incomplete');
  }
  const uniqueRefs = new Map(
    (refs as RunDefinitionRef[]).map((ref) => [definitionRefLineage(ref), ref]),
  );
  if (uniqueRefs.size !== 1) {
    throw new BadRequestException('brain_feedback_correction_definition_ref_ambiguous');
  }
  return [...uniqueRefs.values()][0];
}

function isPersonEntityRuntimeAlias(output: unknown, definitionType: string, definitionKey: string): boolean {
  if (definitionType.trim().toLowerCase() !== 'entity') return false;
  if (isPersonSemanticEntity({ definitionKey })) return true;

  const semanticIntent = readObject(readObject(output)?.semanticIntent);
  return readArray(semanticIntent?.entities).some((value) => {
    const entity = readObject(value);
    const definitionRef = readObject(entity?.definitionRef);
    return (
      stringValue(definitionRef?.definitionType)?.toLowerCase() === 'entity' &&
      stringValue(definitionRef?.definitionKey) === definitionKey &&
      isPersonSemanticEntity({
        entityType: entity?.entityType,
        definitionKey: definitionRef?.definitionKey,
      })
    );
  });
}

function collectSemanticIntentRefs(semanticIntent: Record<string, unknown>): Array<Record<string, unknown>> {
  return [
    ...readArray(semanticIntent.entities).flatMap((entity) => {
      const ref = readObject(readObject(entity)?.definitionRef);
      return ref ? [ref] : [];
    }),
    ...readArray(semanticIntent.metrics).flatMap((ref) => {
      const record = readObject(ref);
      return record ? [record] : [];
    }),
    ...readArray(semanticIntent.dimensions).flatMap((ref) => {
      const record = readObject(ref);
      return record ? [record] : [];
    }),
    ...readArray(semanticIntent.filters).flatMap((filter) => {
      const ref = readObject(readObject(filter)?.fieldRef);
      return ref ? [ref] : [];
    }),
    ...readArray(semanticIntent.orderBy).flatMap((orderBy) => {
      const ref = readObject(readObject(orderBy)?.definitionRef);
      return ref ? [ref] : [];
    }),
  ];
}

function parseCompleteRunDefinitionRef(value: Record<string, unknown>): RunDefinitionRef | null {
  const definitionType = stringValue(value.definitionType);
  const definitionKey = stringValue(value.definitionKey);
  const definitionVersion = value.definitionVersion;
  const definitionFingerprint = stringValue(value.definitionFingerprint);
  const sourceFingerprint = stringValue(value.sourceFingerprint);
  if (
    !definitionType ||
    !definitionKey ||
    !Number.isInteger(definitionVersion) ||
    Number(definitionVersion) <= 0 ||
    !definitionFingerprint ||
    !/^[0-9a-f]{64}$/i.test(definitionFingerprint) ||
    !sourceFingerprint ||
    !/^[0-9a-f]{64}$/i.test(sourceFingerprint)
  ) {
    return null;
  }
  return {
    definitionType,
    definitionKey,
    definitionVersion: Number(definitionVersion),
    definitionFingerprint,
    sourceFingerprint,
  };
}

function definitionRefLineage(ref: RunDefinitionRef): string {
  return [
    ref.definitionType.toLowerCase(),
    ref.definitionKey,
    ref.definitionVersion,
    ref.definitionFingerprint.toLowerCase(),
    ref.sourceFingerprint.toLowerCase(),
  ].join('\u0000');
}

function readObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function readArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function stringValue(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}
