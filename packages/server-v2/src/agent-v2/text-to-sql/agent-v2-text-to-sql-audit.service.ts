import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { createHash } from 'node:crypto';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { AgentV2TextToSqlResult } from './agent-v2-text-to-sql.types.js';

@Injectable()
export class AgentV2TextToSqlAuditService {
  constructor(private readonly prisma: PrismaService) {}

  async record(input: { question: string; result: AgentV2TextToSqlResult; userId?: number }) {
    try {
      const planner = input.result.queryTrace.planner;
      const guard = input.result.queryTrace.guard;
      const generatedSql = planner.generatedSql;
      const safeSql = guard.status === 'pass' ? guard.safeSql : undefined;
      const created = await this.prisma.agentV2TextToSqlRun.create({
        data: {
          question: input.question,
          normalizedIntentJson: this.json(planner.intent),
          userId: input.userId,
          storeScopeJson: this.json({ label: input.result.evidence.storeScope }),
          selectedViewsJson: this.json(planner.selectedViews),
          generatedSqlHash: generatedSql ? this.sha256(generatedSql) : null,
          redactedSql: guard.redactedSql ?? null,
          safeSqlHash: safeSql ? this.sha256(safeSql) : null,
          status: input.result.status,
          blockedReason: input.result.blockedReason ?? null,
          rowCount: input.result.rows.length,
          executionMs: input.result.queryTrace.executionMs ?? null,
          evidenceJson: this.json(input.result.evidence),
          queryTraceJson: this.json(input.result.queryTrace),
        },
      });
      return String(created.id);
    } catch {
      return `agent-v2-text-to-sql-audit-unavailable-${Date.now()}-${Math.abs(this.hash(input.question))}`;
    }
  }

  listRuns(input: { page?: number; pageSize?: number; status?: string; userId?: number }) {
    const page = Math.max(1, Number(input.page) || 1);
    const pageSize = Math.min(Math.max(1, Number(input.pageSize) || 20), 100);
    const where = {
      ...(input.status ? { status: input.status } : {}),
      ...(input.userId ? { userId: input.userId } : {}),
    };
    return this.prisma.$transaction([
      this.prisma.agentV2TextToSqlRun.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.agentV2TextToSqlRun.count({ where }),
    ]).then(([items, total]) => ({ items, total, page, pageSize }));
  }

  getRun(id: number) {
    return this.prisma.agentV2TextToSqlRun.findUnique({
      where: { id },
      include: { feedback: { orderBy: { createdAt: 'desc' } } },
    });
  }

  createFeedback(input: {
    runId: number;
    userId?: number;
    rating?: number;
    feedbackText?: string;
    isUseful?: boolean;
    isWrongAnswer?: boolean;
    isPermissionConcern?: boolean;
  }) {
    return this.prisma.agentV2TextToSqlFeedback.create({
      data: {
        runId: input.runId,
        userId: input.userId,
        rating: input.rating,
        feedbackText: input.feedbackText,
        isUseful: input.isUseful,
        isWrongAnswer: input.isWrongAnswer ?? false,
        isPermissionConcern: input.isPermissionConcern ?? false,
      },
    });
  }

  private hash(value: string) {
    let hash = 0;
    for (let index = 0; index < value.length; index += 1) {
      hash = (hash << 5) - hash + value.charCodeAt(index);
      hash |= 0;
    }
    return hash;
  }

  private sha256(value: string) {
    return createHash('sha256').update(value).digest('hex');
  }

  private json(value: unknown): Prisma.InputJsonValue {
    return JSON.parse(JSON.stringify(value ?? null)) as Prisma.InputJsonValue;
  }
}
