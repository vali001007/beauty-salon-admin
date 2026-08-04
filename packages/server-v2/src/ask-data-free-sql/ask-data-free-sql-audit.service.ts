import { Injectable } from '@nestjs/common';
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
      const storeScopeJson = JSON.stringify({
        storeId: input.context.storeId,
        visibleStoreIds: input.context.visibleStoreIds,
      });
      const selectedViewsJson = JSON.stringify((input.selectedViews ?? []).map((view) => view.viewName));
      const answerJson = input.answer ? JSON.stringify(input.answer) : null;
      const queryMetaJson = JSON.stringify({
        explanation: input.explanation,
        sqlFingerprint: input.guard?.sqlFingerprint,
        semanticRouting: input.semanticRouting,
        controlledQueryPlan: input.controlledQueryPlan,
        structuredOutput: input.structuredOutput,
        execution: input.execution
          ? {
              attempts: input.execution.attempts ?? 1,
              retryAttempted: Boolean(input.execution.retryAttempted),
              retryLatencyMs: input.execution.retryLatencyMs ?? 0,
              blockedReason: input.execution.blockedReason,
            }
          : undefined,
      });
      const [created] = await this.prisma.$queryRaw<Array<{ id: number | bigint }>>`
        INSERT INTO "ask_data_free_sql_runs" (
          "question", "userId", "storeId", "storeScopeJson", "selectedViewsJson",
          "generatedSqlHash", "redactedSql", "safeSqlHash", "status", "blockedReason",
          "rowCount", "executionMs", "estimatedCost", "answerJson", "queryMetaJson"
        ) VALUES (
          ${input.question},
          ${input.context.userId},
          ${input.context.storeId},
          CAST(${storeScopeJson} AS jsonb),
          CAST(${selectedViewsJson} AS jsonb),
          ${generatedSql ? this.sha256(generatedSql) : null},
          ${input.guard?.redactedSql ?? null},
          ${safeSql ? this.sha256(safeSql) : null},
          ${input.status},
          ${input.guard?.status === 'blocked' ? input.guard.reasonCode : (input.execution?.blockedReason ?? null)},
          ${input.execution?.rows.length ?? 0},
          ${input.execution?.executionMs ?? null},
          ${input.cost?.estimatedCost ?? null},
          CAST(${answerJson} AS jsonb),
          CAST(${queryMetaJson} AS jsonb)
        )
        RETURNING "id"
      `;
      if (!created) throw new Error('Ask Data audit insert returned no id');
      return String(created.id);
    } catch {
      return `ask-data-free-sql-audit-unavailable-${Date.now()}-${this.sha256(input.question).slice(0, 10)}`;
    }
  }

  private sha256(value: string) {
    return createHash('sha256').update(value).digest('hex');
  }
}
