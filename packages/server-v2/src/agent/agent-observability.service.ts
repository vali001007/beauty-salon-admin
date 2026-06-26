import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';

@Injectable()
export class AgentObservabilityService {
  constructor(private readonly prisma: PrismaService) {}

  async getQualityReport(query: { storeId: number; days?: number | string; personaCode?: string }) {
    const days = Math.min(90, Math.max(1, Number(query.days) || 7));
    const start = new Date();
    start.setDate(start.getDate() - days + 1);
    start.setHours(0, 0, 0, 0);
    const where = {
      storeId: Number(query.storeId),
      createdAt: { gte: start },
      ...(query.personaCode ? { personaCode: String(query.personaCode) } : {}),
    };
    const runs = await this.delegate('agentRun').findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 2000,
      select: {
        id: true,
        status: true,
        role: true,
        personaCode: true,
        entrypoint: true,
        userInput: true,
        errorMessage: true,
        createdAt: true,
        completedAt: true,
      },
    });
    const runIds = runs.map((run: any) => Number(run.id)).filter(Boolean);
    const [feedbacks, toolCalls, evalRuns] = runIds.length
      ? await Promise.all([
          this.delegate('agentFeedback').findMany({ where: { runId: { in: runIds } } }),
          this.delegate('agentToolCall').findMany({
            where: { runId: { in: runIds } },
            select: { runId: true, toolName: true, status: true, latencyMs: true },
          }),
          this.optionalFindMany('agentEvalRun', {
            where: { createdAt: { gte: start } },
            orderBy: { createdAt: 'desc' },
            take: 200,
          }),
        ])
      : [
          [],
          [],
          await this.optionalFindMany('agentEvalRun', {
            where: { createdAt: { gte: start } },
            orderBy: { createdAt: 'desc' },
            take: 200,
          }),
        ];
    const completed = runs.filter((run: any) => run.status === 'completed').length;
    const failed = runs.filter((run: any) => run.status === 'failed').length;
    const adopted = feedbacks.filter((item: any) => item.adopted === true).length;
    const rejected = feedbacks.filter((item: any) => item.adopted === false).length;
    const rated = feedbacks.filter((item: any) => Number(item.rating) > 0);
    const avgRating = rated.length
      ? rated.reduce((sum: number, item: any) => sum + Number(item.rating), 0) / rated.length
      : null;
    const latencies = toolCalls.map((item: any) => Number(item.latencyMs)).filter((value: number) => Number.isFinite(value) && value >= 0);
    const avgLatencyMs = latencies.length
      ? Math.round(latencies.reduce((sum: number, value: number) => sum + value, 0) / latencies.length)
      : null;
    const personaBreakdown = this.groupRunsBy(runs, 'personaCode');
    const toolBreakdown = this.groupToolCalls(toolCalls);
    const recentNegativeFeedback = feedbacks
      .filter((item: any) => item.adopted === false || Number(item.rating) <= 2)
      .slice(0, 10)
      .map((item: any) => ({
        runId: item.runId,
        rating: item.rating,
        adopted: item.adopted,
        comment: item.comment,
        createdAt: item.createdAt,
      }));
    const evalPassed = evalRuns.filter((item: any) => item.status === 'passed' || Number(item.score) >= 0.8).length;
    const recommendations = [
      ...(failed > 0 ? [`近 ${days} 天有 ${failed} 次失败，优先补失败工具的 eval 用例。`] : []),
      ...(feedbacks.length < Math.max(3, Math.round(runs.length * 0.2)) ? ['反馈样本偏少，建议在关键回答后引导店长点击有用/无用。'] : []),
      ...(rejected > adopted && feedbacks.length ? ['负反馈多于采纳反馈，需要复核回答口径和建议可执行性。'] : []),
      ...(avgLatencyMs && avgLatencyMs > 5000 ? ['平均工具耗时超过 5 秒，建议排查慢查询或拆分重工具。'] : []),
    ];

    return {
      range: {
        days,
        startDate: this.formatDate(start),
        endDate: this.formatDate(new Date()),
      },
      kpis: {
        runCount: runs.length,
        completed,
        failed,
        successRate: runs.length ? completed / runs.length : 0,
        feedbackCount: feedbacks.length,
        adopted,
        rejected,
        adoptionRate: feedbacks.length ? adopted / feedbacks.length : 0,
        avgRating,
        avgLatencyMs,
        evalRunCount: evalRuns.length,
        evalPassed,
        evalPassRate: evalRuns.length ? evalPassed / evalRuns.length : null,
      },
      personaBreakdown,
      toolBreakdown,
      recentNegativeFeedback,
      recommendations,
    };
  }

  private groupRunsBy(runs: any[], key: 'personaCode' | 'role') {
    const groups = new Map<string, { name: string; runCount: number; completed: number; failed: number }>();
    for (const run of runs) {
      const name = String(run[key] || run.role || 'unknown');
      const group = groups.get(name) ?? { name, runCount: 0, completed: 0, failed: 0 };
      group.runCount += 1;
      if (run.status === 'completed') group.completed += 1;
      if (run.status === 'failed') group.failed += 1;
      groups.set(name, group);
    }
    return [...groups.values()].map((group) => ({
      ...group,
      successRate: group.runCount ? group.completed / group.runCount : 0,
    }));
  }

  private groupToolCalls(toolCalls: any[]) {
    const groups = new Map<string, { toolName: string; callCount: number; failed: number; totalLatencyMs: number; latencyCount: number }>();
    for (const call of toolCalls) {
      const toolName = String(call.toolName || 'unknown');
      const group = groups.get(toolName) ?? { toolName, callCount: 0, failed: 0, totalLatencyMs: 0, latencyCount: 0 };
      group.callCount += 1;
      if (call.status === 'failed') group.failed += 1;
      const latency = Number(call.latencyMs);
      if (Number.isFinite(latency) && latency >= 0) {
        group.totalLatencyMs += latency;
        group.latencyCount += 1;
      }
      groups.set(toolName, group);
    }
    return [...groups.values()]
      .sort((a, b) => b.callCount - a.callCount)
      .slice(0, 20)
      .map((group) => ({
        toolName: group.toolName,
        callCount: group.callCount,
        failed: group.failed,
        failureRate: group.callCount ? group.failed / group.callCount : 0,
        avgLatencyMs: group.latencyCount ? Math.round(group.totalLatencyMs / group.latencyCount) : null,
      }));
  }

  private async optionalFindMany(delegateName: string, args: Record<string, unknown>) {
    const delegate = (this.prisma as any)[delegateName];
    return delegate?.findMany ? delegate.findMany(args) : [];
  }

  private delegate(name: string): any {
    const delegate = (this.prisma as any)[name];
    if (!delegate) throw new Error(`Prisma delegate ${name} is unavailable. Run prisma generate after applying agent schema.`);
    return delegate;
  }

  private formatDate(date: Date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
}
