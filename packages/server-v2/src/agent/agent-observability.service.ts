import { Injectable } from '@nestjs/common';
import {
  AGENT_EVAL_QUESTION_BANK_P0_TOTAL,
  AGENT_EVAL_QUESTION_BANK_TOTAL,
  QUESTION_BANK_CONVERSATION_CASES,
} from './agent-eval-question-bank.js';
import { PrismaService } from '../prisma/prisma.service.js';

type FeedbackFailureItem = {
  feedbackId: number;
  runId: number;
  role: string;
  personaCode: string | null;
  rating: number | null;
  adopted: boolean | null;
  reason: string;
  question: string;
  answer: string;
  skillId: string;
  capabilityId: string;
  toolNames: string[];
  createdAt: unknown;
};

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
    const entrypointBreakdown = this.groupRunsBy(runs, 'entrypoint');
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
    const questionBank = this.buildQuestionBankQuality(evalRuns);
    const recommendations = [
      ...(failed > 0 ? [`近 ${days} 天有 ${failed} 次失败，优先补失败工具的 eval 用例。`] : []),
      ...(feedbacks.length < Math.max(3, Math.round(runs.length * 0.2)) ? ['反馈样本偏少，建议在关键回答后引导店长点击有用/无用。'] : []),
      ...(rejected > adopted && feedbacks.length ? ['负反馈多于采纳反馈，需要复核回答口径和建议可执行性。'] : []),
      ...(avgLatencyMs && avgLatencyMs > 5000 ? ['平均工具耗时超过 5 秒，建议排查慢查询或拆分重工具。'] : []),
      ...(questionBank.priorityPassRates.some((item) => item.total === 0)
        ? ['问题库 P0/P1/P2 分层评测尚未全部持久化，建议接入每日 P0 自动回归结果。']
        : []),
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
      questionBank,
      personaBreakdown,
      entrypointBreakdown,
      toolBreakdown,
      recentNegativeFeedback,
      recommendations,
    };
  }

  private buildQuestionBankQuality(evalRuns: any[]) {
    const conversationTurns = QUESTION_BANK_CONVERSATION_CASES.reduce((sum, item) => sum + item.turns.length, 0);
    return {
      totalQuestions: AGENT_EVAL_QUESTION_BANK_TOTAL,
      structuredQuestions: AGENT_EVAL_QUESTION_BANK_TOTAL,
      coverageRate: 1,
      p0Cases: AGENT_EVAL_QUESTION_BANK_P0_TOTAL,
      conversationCases: QUESTION_BANK_CONVERSATION_CASES.length,
      conversationTurns,
      priorityPassRates: (['P0', 'P1', 'P2'] as const).map((priority) => {
        const runs = evalRuns.filter((item: any) => this.extractEvalPriority(item) === priority);
        const passed = runs.filter((item: any) => item.status === 'passed' || Number(item.score) >= 0.8).length;
        return {
          priority,
          total: runs.length,
          passed,
          failed: runs.length - passed,
          passRate: runs.length ? passed / runs.length : null,
        };
      }),
    };
  }

  private extractEvalPriority(evalRun: any) {
    const result = this.asRecord(evalRun?.resultJson);
    const expected = this.asRecord(result?.expected);
    const caseMeta = this.asRecord(result?.case);
    const candidates = [result?.priority, expected?.priority, caseMeta?.priority, result?.level, result?.sourcePriority];
    const matched = candidates.find((item) => ['P0', 'P1', 'P2'].includes(String(item)));
    return matched ? String(matched) : null;
  }

  private asRecord(value: unknown): Record<string, unknown> | null {
    return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
  }

  async getFeedbackFailureReport(query: { storeId: number; days?: number | string; personaCode?: string; limit?: number | string }) {
    const { days, start, limit } = this.resolveFailureQuery(query);
    const runs = await this.delegate('agentRun').findMany({
      where: {
        storeId: Number(query.storeId),
        createdAt: { gte: start },
        ...(query.personaCode ? { personaCode: String(query.personaCode) } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: 2000,
      select: {
        id: true,
        role: true,
        personaCode: true,
        userInput: true,
        planJson: true,
        resultJson: true,
        errorMessage: true,
        createdAt: true,
      },
    });
    const runMap = new Map(runs.map((run: any) => [Number(run.id), run]));
    const runIds = [...runMap.keys()];
    const feedbacks = runIds.length
      ? await this.delegate('agentFeedback').findMany({
          where: { runId: { in: runIds } },
          orderBy: { createdAt: 'desc' },
          take: 2000,
        })
      : [];
    const items: FeedbackFailureItem[] = feedbacks
      .filter((feedback: any) => feedback.adopted === false || Number(feedback.rating) <= 2)
      .map((feedback: any) => this.buildFeedbackFailureItem(feedback, runMap.get(Number(feedback.runId))))
      .slice(0, limit);
    return {
      range: {
        days,
        startDate: this.formatDate(start),
        endDate: this.formatDate(new Date()),
      },
      kpis: {
        negativeFeedbackCount: items.length,
        affectedSkillCount: new Set(items.map((item: FeedbackFailureItem) => item.skillId)).size,
      },
      bySkill: this.groupFeedbackFailuresBySkill(items),
      items,
    };
  }

  async importFeedbackFailuresToEvalCases(query: {
    storeId: number;
    days?: number | string;
    personaCode?: string;
    limit?: number | string;
    dryRun?: boolean;
  }) {
    const report = await this.getFeedbackFailureReport(query);
    const candidates = report.items.map((item: FeedbackFailureItem) => ({
      scenario: `feedback_failure:${item.skillId || item.capabilityId || 'unknown'}`,
      input: item.question || `run:${item.runId}`,
      role: item.role || 'manager',
      expectedTool: item.toolNames[0] || null,
      expectedOutcome: this.toJsonObject({
        source: 'agent_feedback',
        runId: item.runId,
        feedbackId: item.feedbackId,
        skillId: item.skillId,
        capabilityId: item.capabilityId,
        reason: item.reason,
        answer: item.answer,
      }),
      status: 'draft',
    }));
    if (query.dryRun || !candidates.length) {
      return { dryRun: Boolean(query.dryRun), candidates, created: 0 };
    }
    const created = await this.delegate('agentEvalCase').createMany({ data: candidates });
    return { dryRun: false, candidates, created: Number(created?.count ?? candidates.length) };
  }

  private groupRunsBy(runs: any[], key: 'personaCode' | 'role' | 'entrypoint') {
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

  private resolveFailureQuery(query: { days?: number | string; limit?: number | string }) {
    const days = Math.min(90, Math.max(1, Number(query.days) || 7));
    const limit = Math.min(100, Math.max(1, Number(query.limit) || 20));
    const start = new Date();
    start.setDate(start.getDate() - days + 1);
    start.setHours(0, 0, 0, 0);
    return { days, start, limit };
  }

  private buildFeedbackFailureItem(feedback: any, run: any): FeedbackFailureItem {
    const action = this.asObject(feedback.businessActionJson);
    const snapshot = this.asObject(action?.snapshot);
    const result = this.asObject(run?.resultJson);
    const plan = this.asObject(run?.planJson);
    const traceSummary = this.asObject(result?.traceSummary);
    const skillPlan = this.asObject(plan?.skillPlan);
    const capabilityPlan = this.asObject(plan?.capabilityPlan);
    const planToolNames = Array.isArray(plan?.toolPlan)
      ? plan.toolPlan.map((item: any) => String(this.asObject(item)?.tool ?? '')).filter(Boolean)
      : [];
    const snapshotToolNames = Array.isArray(snapshot?.toolNames) ? snapshot.toolNames.map(String).filter(Boolean) : [];
    return {
      feedbackId: Number(feedback.id),
      runId: Number(feedback.runId),
      role: String(run?.role ?? 'manager'),
      personaCode: run?.personaCode ?? null,
      rating: feedback.rating ?? null,
      adopted: feedback.adopted ?? null,
      reason: feedback.comment ?? snapshot?.feedbackReason ?? '用户负反馈',
      question: String(snapshot?.question ?? run?.userInput ?? ''),
      answer: String(snapshot?.answer ?? result?.answer ?? run?.errorMessage ?? ''),
      skillId: String(snapshot?.skillId ?? traceSummary?.skillId ?? skillPlan?.skillId ?? ''),
      capabilityId: String(snapshot?.capabilityId ?? traceSummary?.capabilityId ?? skillPlan?.capabilityId ?? capabilityPlan?.capabilityId ?? ''),
      toolNames: snapshotToolNames.length ? snapshotToolNames : planToolNames,
      createdAt: feedback.createdAt,
    };
  }

  private groupFeedbackFailuresBySkill(items: Array<{ skillId: string; capabilityId: string; reason: string; createdAt: unknown }>) {
    const groups = new Map<string, { skillId: string; capabilityId: string; count: number; latestAt: unknown; reasons: string[] }>();
    for (const item of items) {
      const key = item.skillId || item.capabilityId || 'unknown';
      const group = groups.get(key) ?? { skillId: item.skillId || 'unknown', capabilityId: item.capabilityId || 'unknown', count: 0, latestAt: item.createdAt, reasons: [] };
      group.count += 1;
      group.latestAt = item.createdAt ?? group.latestAt;
      if (item.reason && !group.reasons.includes(item.reason)) group.reasons.push(item.reason);
      groups.set(key, group);
    }
    return [...groups.values()].sort((a, b) => b.count - a.count).slice(0, 20);
  }

  private asObject(value: unknown): Record<string, any> | null {
    return typeof value === 'object' && value !== null ? (value as Record<string, any>) : null;
  }

  private toJsonObject(value: Record<string, unknown>) {
    return JSON.parse(JSON.stringify(value));
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
