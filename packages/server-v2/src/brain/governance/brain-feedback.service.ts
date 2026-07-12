import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service.js';

@Injectable()
export class BrainFeedbackService {
  constructor(private readonly prisma: PrismaService) {}

  createFeedback(input: {
    runId: number;
    userId: number;
    storeId: number;
    rating: string;
    correction?: Prisma.InputJsonValue;
  }) {
    return this.prisma.brainFeedback.create({ data: input });
  }

  listFeedback(input: { storeId: number }) {
    return this.prisma.brainFeedback.findMany({
      where: { storeId: input.storeId },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
  }

  async getDashboard(input: { storeId: number }) {
    const [runs, feedback, actions, findings, latestEval] = await Promise.all([
      this.prisma.brainRun.findMany({
        where: { storeId: input.storeId },
        select: { status: true, latencyMs: true, cost: true },
        orderBy: { createdAt: 'desc' },
        take: 1000,
      }),
      this.prisma.brainFeedback.findMany({ where: { storeId: input.storeId }, select: { rating: true, status: true } }),
      this.prisma.brainActionExecution.findMany({ where: { storeId: input.storeId }, select: { status: true } }),
      this.prisma.brainInspectionFinding.findMany({ where: { storeId: input.storeId }, select: { status: true, feedback: true, disposition: true } }),
      this.prisma.brainEvalRun.findFirst({ where: { storeId: input.storeId, status: 'completed' }, orderBy: { createdAt: 'desc' } }),
    ]);
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
