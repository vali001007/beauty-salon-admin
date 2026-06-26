import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';

type AgentMemoryQuery = {
  storeId: number;
  personaCode?: string;
  memoryType?: string;
  status?: string;
  limit?: number | string;
};

type CreateAgentMemoryInput = {
  storeId: number;
  userId?: number;
  personaCode?: string;
  memoryType?: string;
  title: string;
  content: string;
  summary?: string;
  importance?: number;
  sourceRunId?: number;
  sourceJson?: unknown;
};

type ArchiveQuery = {
  storeId: number;
  personaCode?: string;
  page?: number | string;
  pageSize?: number | string;
};

@Injectable()
export class AgentMemoryService {
  constructor(private readonly prisma: PrismaService) {}

  async listMemories(query: AgentMemoryQuery) {
    const limit = this.normalizeLimit(query.limit, 20, 100);
    const where = {
      storeId: Number(query.storeId),
      status: query.status ?? 'active',
      ...(query.personaCode ? { personaCode: String(query.personaCode) } : {}),
      ...(query.memoryType ? { memoryType: String(query.memoryType) } : {}),
    };
    try {
      const items = await this.delegate('agentMemory').findMany({
        where,
        orderBy: [{ importance: 'desc' }, { updatedAt: 'desc' }],
        take: limit,
      });
      return { items, data: items, total: items.length, page: 1, pageSize: limit };
    } catch (error) {
      if (this.isMissingAgentSchemaError(error)) return this.emptyPage(1, limit, 'agent_memory_schema_pending');
      throw error;
    }
  }

  async createMemory(input: CreateAgentMemoryInput) {
    try {
      return await this.delegate('agentMemory').create({
        data: {
          storeId: Number(input.storeId),
          userId: input.userId ?? null,
          personaCode: input.personaCode ?? null,
          memoryType: input.memoryType ?? 'store_preference',
          title: input.title.trim(),
          content: input.content.trim(),
          summary: input.summary?.trim() || null,
          importance: Math.min(5, Math.max(1, Number(input.importance) || 1)),
          sourceRunId: input.sourceRunId ?? null,
          sourceJson: this.toJson(input.sourceJson),
          status: 'active',
        },
      });
    } catch (error) {
      if (this.isMissingAgentSchemaError(error)) throw this.schemaPendingError('Agent 记忆表尚未迁移，暂不能写入记忆。');
      throw error;
    }
  }

  async listDailyArchives(query: ArchiveQuery) {
    const page = this.normalizePage(query.page);
    const pageSize = this.normalizeLimit(query.pageSize, 10, 50);
    const where = {
      storeId: Number(query.storeId),
      ...(query.personaCode ? { personaCode: String(query.personaCode) } : {}),
    };
    try {
      const [items, total] = await Promise.all([
        this.delegate('agentDailyArchive').findMany({
          where,
          orderBy: { archiveDate: 'desc' },
          skip: (page - 1) * pageSize,
          take: pageSize,
        }),
        this.delegate('agentDailyArchive').count({ where }),
      ]);
      return { items, data: items, total, page, pageSize };
    } catch (error) {
      if (this.isMissingAgentSchemaError(error)) return this.emptyPage(page, pageSize, 'agent_archive_schema_pending');
      throw error;
    }
  }

  async generateDailyArchive(input: { storeId: number; personaCode?: string; date?: string | Date; createdBy?: number }) {
    const archiveDate = this.startOfDay(input.date ? new Date(input.date) : new Date());
    const nextDate = new Date(archiveDate.getTime() + 86_400_000);
    const archivePersonaCode = input.personaCode ? String(input.personaCode) : 'all';
    const runWhere = {
      storeId: Number(input.storeId),
      createdAt: { gte: archiveDate, lt: nextDate },
      ...(input.personaCode ? { personaCode: String(input.personaCode) } : {}),
    };
    const runs = await this.delegate('agentRun').findMany({
      where: runWhere,
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        status: true,
        role: true,
        entrypoint: true,
        personaCode: true,
        userInput: true,
        errorMessage: true,
        resultJson: true,
        createdAt: true,
      },
    });
    const runIds = runs.map((run: any) => Number(run.id)).filter(Boolean);
    const [feedbacks, toolCalls] = runIds.length
      ? await Promise.all([
          this.delegate('agentFeedback').findMany({ where: { runId: { in: runIds } } }),
          this.delegate('agentToolCall').findMany({
            where: { runId: { in: runIds } },
            select: { runId: true, toolName: true, status: true, latencyMs: true },
          }),
        ])
      : [[], []];
    const completed = runs.filter((run: any) => run.status === 'completed').length;
    const failed = runs.filter((run: any) => run.status === 'failed').length;
    const adopted = feedbacks.filter((item: any) => item.adopted === true).length;
    const rejected = feedbacks.filter((item: any) => item.adopted === false).length;
    const topTools = this.topCounts(toolCalls.map((item: any) => item.toolName), 5);
    const risks = [
      ...(failed > 0 ? [`${failed} 次 Agent 运行失败，需要复核失败问题和工具槽位。`] : []),
      ...(rejected > adopted && feedbacks.length ? ['负反馈多于采纳反馈，需要检查回答质量和建议可执行性。'] : []),
    ];
    const highlights = [
      ...(completed > 0 ? [`完成 ${completed} 次 Agent 问答。`] : []),
      ...(adopted > 0 ? [`收到 ${adopted} 次采纳反馈。`] : []),
      ...(topTools[0] ? [`最高频工具：${topTools[0].name}。`] : []),
    ];
    const actions = [
      ...(failed > 0 ? ['复盘失败 Run，补充 eval 或槽位校验用例。'] : []),
      ...(feedbacks.length === 0 ? ['引导店长对关键回答点击“有用/无用”，提升质量评估样本。'] : []),
      ...(topTools.length ? ['将高频工具沉淀为冷启动问题或自动化候选。'] : []),
    ];
    const metrics = {
      runCount: runs.length,
      completed,
      failed,
      successRate: runs.length ? completed / runs.length : 0,
      feedbackCount: feedbacks.length,
      adopted,
      rejected,
      adoptionRate: feedbacks.length ? adopted / feedbacks.length : 0,
      topTools,
    };
    const title = `${this.formatDate(archiveDate)} Agent 每日经营归档`;
    const summary = runs.length
      ? `今日共 ${runs.length} 次 Agent 运行，完成 ${completed} 次，失败 ${failed} 次，采纳反馈 ${adopted} 次。`
      : '今日暂无 Agent 运行记录，建议先完成至少一次经营问答后再归档。';

    try {
      return await this.delegate('agentDailyArchive').upsert({
        where: {
          storeId_archiveDate_personaCode: {
            storeId: Number(input.storeId),
            archiveDate,
            personaCode: archivePersonaCode,
          },
        },
        update: {
          title,
          summary,
          metricsJson: this.toJson(metrics),
          highlightsJson: this.toJson(highlights),
          risksJson: this.toJson(risks),
          actionsJson: this.toJson(actions),
          sourceRunIds: this.toJson(runIds),
          createdBy: input.createdBy ?? null,
          status: 'generated',
        },
        create: {
          storeId: Number(input.storeId),
          archiveDate,
          personaCode: archivePersonaCode,
          title,
          summary,
          metricsJson: this.toJson(metrics),
          highlightsJson: this.toJson(highlights),
          risksJson: this.toJson(risks),
          actionsJson: this.toJson(actions),
          sourceRunIds: this.toJson(runIds),
          createdBy: input.createdBy ?? null,
          status: 'generated',
        },
      });
    } catch (error) {
      if (this.isMissingAgentSchemaError(error)) {
        return {
          id: 0,
          storeId: Number(input.storeId),
          archiveDate,
          personaCode: archivePersonaCode,
          title,
          summary: 'Agent 归档表尚未迁移，已完成归档预览但暂不能持久化。',
          metricsJson: this.toJson(metrics),
          highlightsJson: this.toJson(highlights),
          risksJson: this.toJson([...risks, '数据库迁移未应用，归档未写入。']),
          actionsJson: this.toJson(['应用 20260626123000_agent_memory_archive 迁移后重新生成归档。']),
          sourceRunIds: this.toJson(runIds),
          status: 'migration_pending',
          createdBy: input.createdBy ?? null,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
      }
      throw error;
    }
  }

  private topCounts(values: string[], limit: number) {
    const counts = new Map<string, number>();
    for (const value of values.filter(Boolean)) counts.set(value, (counts.get(value) ?? 0) + 1);
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
      .map(([name, count]) => ({ name, count }));
  }

  private startOfDay(date: Date) {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate());
  }

  private formatDate(date: Date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  private normalizePage(value: unknown) {
    return Math.max(1, Number(value) || 1);
  }

  private normalizeLimit(value: unknown, fallback: number, max: number) {
    return Math.min(max, Math.max(1, Number(value) || fallback));
  }

  private delegate(name: string): any {
    const delegate = (this.prisma as any)[name];
    if (!delegate) throw new Error(`Prisma delegate ${name} is unavailable. Run prisma generate after applying agent schema.`);
    return delegate;
  }

  private emptyPage(page: number, pageSize: number, reason: string) {
    return { items: [], data: [], total: 0, page, pageSize, migrationPending: true, reason };
  }

  private isMissingAgentSchemaError(error: unknown) {
    const anyError = error as { code?: string; message?: string; meta?: { table?: string } };
    const message = String(anyError?.message ?? '').toLowerCase();
    const table = String(anyError?.meta?.table ?? '').toLowerCase();
    return (
      anyError?.code === 'P2021' ||
      anyError?.code === 'P2022' ||
      table.includes('agent_memories') ||
      table.includes('agent_daily_archives') ||
      message.includes('agent_memories') ||
      message.includes('agent_daily_archives') ||
      message.includes('agentmemory') ||
      message.includes('agentdailyarchive') ||
      message.includes('does not exist')
    );
  }

  private schemaPendingError(message: string) {
    return new ServiceUnavailableException({
      message,
      code: 'AGENT_SCHEMA_MIGRATION_PENDING',
      details: {
        migration: '20260626123000_agent_memory_archive',
      },
    });
  }

  private toJson(value: unknown) {
    if (value === undefined) return undefined;
    return JSON.parse(JSON.stringify(value));
  }
}
