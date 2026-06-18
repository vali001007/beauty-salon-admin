import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';

type CandidateQuery = {
  storeId?: number;
  days?: number | string;
  minCount?: number | string;
  limit?: number | string;
};

type CandidateBucket = {
  key: string;
  normalizedQuestion: string;
  domain: string;
  taskType: string;
  metrics: string[];
  capabilityId?: string;
  fallbackCapability?: string;
  count: number;
  unsupportedCount: number;
  noDataCount: number;
  businessQueryCount: number;
  latestAt?: Date;
  examples: Array<{ runId: number; runNo: string; question: string; createdAt: Date; toolName?: string; toolStatus?: string }>;
};

@Injectable()
export class AgentCapabilityCandidateService {
  constructor(private readonly prisma: PrismaService) {}

  async listCandidates(query: CandidateQuery = {}) {
    const days = this.clamp(Number(query.days) || 14, 1, 90);
    const minCount = this.clamp(Number(query.minCount) || 2, 1, 100);
    const limit = this.clamp(Number(query.limit) || 20, 1, 100);
    const since = new Date(Date.now() - days * 86_400_000);
    const runs = await (this.prisma as any).agentRun.findMany({
      where: {
        createdAt: { gte: since },
        ...(query.storeId ? { storeId: Number(query.storeId) } : {}),
      },
      select: {
        id: true,
        runNo: true,
        storeId: true,
        userInput: true,
        planJson: true,
        resultJson: true,
        status: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
      take: 2000,
    });
    const runIds = (runs as any[]).map((run) => Number(run.id)).filter(Boolean);
    const toolCalls = runIds.length
      ? await (this.prisma as any).agentToolCall.findMany({
          where: { runId: { in: runIds } },
          select: { runId: true, toolName: true, status: true, resultJson: true },
          orderBy: { createdAt: 'desc' },
        })
      : [];
    const toolCallsByRun = this.groupByRunId(toolCalls as any[]);
    const buckets = new Map<string, CandidateBucket>();

    for (const run of runs as any[]) {
      const plan = this.asObject(run.planJson);
      const task = this.asObject(plan?.businessTask);
      const capabilityPlan = this.asObject(plan?.capabilityPlan);
      const semanticSql = this.asObject(plan?.semanticSqlCandidate);
      const runToolCalls = toolCallsByRun.get(Number(run.id)) ?? [];
      const primaryTool = runToolCalls[0];
      const result = this.asObject(primaryTool?.resultJson);
      const status = String(primaryTool?.status || result?.status || run.status || '');
      const capabilityId = String(capabilityPlan?.capabilityId || '');
      const fallbackCapability = String(semanticSql?.fallbackCapability || '');
      const shouldInclude =
        capabilityId === 'business_query' ||
        !capabilityId ||
        !fallbackCapability ||
        ['unsupported', 'no_data', 'failed'].includes(status);
      if (!shouldInclude) continue;

      const domain = String(task?.domain || 'unknown');
      const taskType = String(task?.taskType || 'unknown');
      const metrics = Array.isArray(task?.metrics) ? task.metrics.map(String).filter(Boolean) : [];
      const normalizedQuestion = this.normalizeQuestion(String(run.userInput || ''));
      const key = [domain, taskType, metrics.sort().join('+') || normalizedQuestion || 'no_metric'].join('|');
      const bucket =
        buckets.get(key) ??
        ({
          key,
          normalizedQuestion,
          domain,
          taskType,
          metrics,
          capabilityId: capabilityId || undefined,
          fallbackCapability: fallbackCapability || undefined,
          count: 0,
          unsupportedCount: 0,
          noDataCount: 0,
          businessQueryCount: 0,
          examples: [],
        } satisfies CandidateBucket);
      bucket.count += 1;
      if (status === 'unsupported') bucket.unsupportedCount += 1;
      if (status === 'no_data') bucket.noDataCount += 1;
      if (capabilityId === 'business_query' || primaryTool?.toolName === 'business.query.ask') bucket.businessQueryCount += 1;
      const createdAt = new Date(run.createdAt);
      if (!bucket.latestAt || createdAt > bucket.latestAt) bucket.latestAt = createdAt;
      if (bucket.examples.length < 5) {
        bucket.examples.push({
          runId: Number(run.id),
          runNo: String(run.runNo),
          question: String(run.userInput || ''),
          createdAt,
          toolName: primaryTool?.toolName,
          toolStatus: status,
        });
      }
      buckets.set(key, bucket);
    }

    const items = Array.from(buckets.values())
      .filter((item) => item.count >= minCount || item.unsupportedCount > 0 || item.businessQueryCount >= minCount)
      .map((item) => ({
        ...item,
        latestAt: item.latestAt?.toISOString(),
        candidateCapabilityId: this.suggestCapabilityId(item),
        priorityScore: this.scoreCandidate(item),
        reason: this.describeReason(item),
      }))
      .sort((a, b) => b.priorityScore - a.priorityScore || b.count - a.count)
      .slice(0, limit);

    return {
      items,
      total: items.length,
      filters: {
        days,
        minCount,
        limit,
        storeId: query.storeId,
      },
      generatedAt: new Date().toISOString(),
      evidence: {
        source: ['AgentRun', 'AgentToolCall'],
        metricDefinition: '高频问题候选池 = 最近 AgentRun 中 fallback 到 business_query、无专用 capability、unsupported/no_data/failed 的问题按领域、任务类型、指标和规范化问法聚合。',
        filters: ['createdAt>=查询窗口', query.storeId ? 'storeId=当前门店' : 'storeId=全部可见范围', `minCount=${minCount}`, `limit=${limit}`],
        sampleSize: (runs as any[]).length,
        limitations: ['候选池只读统计审计数据，不自动创建 Capability。', 'P0 仅给出候选建议，仍需产品/运营确认口径后沉淀为正式能力。'],
      },
    };
  }

  private normalizeQuestion(value: string) {
    return value
      .trim()
      .toLowerCase()
      .replace(/\d+/g, '{n}')
      .replace(/[，。！？,.!?；;：:\s]/g, '')
      .slice(0, 80);
  }

  private suggestCapabilityId(item: CandidateBucket) {
    const metric = item.metrics[0] ?? 'unknown_metric';
    if (item.domain === 'unknown') return undefined;
    return `${item.domain}_${metric}_${item.taskType}`.replace(/[^a-zA-Z0-9_]/g, '_').toLowerCase();
  }

  private scoreCandidate(item: CandidateBucket) {
    return item.count * 10 + item.businessQueryCount * 8 + item.unsupportedCount * 12 + item.noDataCount * 4;
  }

  private describeReason(item: CandidateBucket) {
    const parts = [
      item.businessQueryCount ? `${item.businessQueryCount} 次落入受控问数兜底` : '',
      item.unsupportedCount ? `${item.unsupportedCount} 次 unsupported` : '',
      item.noDataCount ? `${item.noDataCount} 次 no_data` : '',
      item.count >= 2 ? `近周期出现 ${item.count} 次` : '',
    ].filter(Boolean);
    return parts.join('；') || '需要运营确认是否沉淀为正式 Capability。';
  }

  private groupByRunId(toolCalls: any[]) {
    const map = new Map<number, any[]>();
    for (const toolCall of toolCalls) {
      const runId = Number(toolCall.runId);
      map.set(runId, [...(map.get(runId) ?? []), toolCall]);
    }
    return map;
  }

  private asObject(value: unknown): Record<string, any> | undefined {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
    return value as Record<string, any>;
  }

  private clamp(value: number, min: number, max: number) {
    if (!Number.isFinite(value)) return min;
    return Math.min(Math.max(Math.trunc(value), min), max);
  }
}
