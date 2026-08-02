import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { createHash } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service.js';
import type { AskDataAuditInput } from './ask-data-free-sql.types.js';

@Injectable()
export class AskDataFreeSqlAuditService {
  constructor(private readonly prisma: PrismaService) {}

  async record(input: AskDataAuditInput) {
    try {
      const generatedSql = input.generatedSql;
      const safeSql = input.guard?.status === 'pass' ? input.guard.safeSql : undefined;
      const created = await this.prisma.askDataFreeSqlRun.create({
        data: {
          question: input.question,
          userId: input.context.userId,
          storeId: input.context.storeId,
          storeScopeJson: this.json({ storeId: input.context.storeId, visibleStoreIds: input.context.visibleStoreIds }),
          selectedViewsJson: this.json((input.selectedViews ?? []).map((view) => view.viewName)),
          generatedSqlHash: generatedSql ? this.sha256(generatedSql) : null,
          redactedSql: input.guard?.redactedSql ?? null,
          safeSqlHash: safeSql ? this.sha256(safeSql) : null,
          status: input.status,
          blockedReason:
            input.guard?.status === 'blocked' ? input.guard.reasonCode : (input.execution?.blockedReason ?? null),
          rowCount: input.execution?.rows.length ?? 0,
          executionMs: input.execution?.executionMs ?? null,
          estimatedCost: input.cost?.estimatedCost ?? null,
          answerJson: input.answer ? this.json(input.answer) : undefined,
          queryMetaJson: this.json({
            explanation: input.explanation,
            sqlFingerprint: input.guard?.sqlFingerprint,
            semanticRouting: input.semanticRouting,
          }),
        },
      });
      return String(created.id);
    } catch {
      return `ask-data-free-sql-audit-unavailable-${Date.now()}-${this.sha256(input.question).slice(0, 10)}`;
    }
  }

  private sha256(value: string) {
    return createHash('sha256').update(value).digest('hex');
  }

  private json(value: unknown): Prisma.InputJsonValue {
    return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
  }
}
