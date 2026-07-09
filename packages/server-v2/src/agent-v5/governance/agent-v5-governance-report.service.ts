import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { AGENT_V5_CODE } from '../agent-v5.types.js';
import { BusinessOntologyRegistry } from '../ontology/business-ontology.registry.js';

@Injectable()
export class AgentV5GovernanceReportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly registry: BusinessOntologyRegistry,
  ) {}

  async getOverview(storeId: number) {
    const runs = await this.findRecentRuns(storeId, 120);
    const totalRuns = runs.length;
    const failedRuns = runs.filter((run) => run.status === 'failed').length;
    const clarificationRuns = runs.filter((run) => this.hasClarification(run)).length;
    const memoryRuns = runs.filter((run) => this.hasMemory(run)).length;
    const adapterCounts = this.countBy(runs.map((run) => this.firstAdapter(run) ?? 'unknown'));
    return {
      agentCode: AGENT_V5_CODE,
      totalRuns,
      failedRuns,
      failureRate: totalRuns ? failedRuns / totalRuns : 0,
      clarificationRuns,
      clarificationRate: totalRuns ? clarificationRuns / totalRuns : 0,
      memoryRuns,
      memoryUsageRate: totalRuns ? memoryRuns / totalRuns : 0,
      adapterCounts,
      recentRuns: runs.slice(0, 12).map((run) => this.toRunSummary(run)),
      limitations: ['治理报表基于 AgentRun.resultJson 轻量聚合，不新增评测表；精细能力质量仍需结合离线评测集。'],
    };
  }

  async getRoutes(storeId: number) {
    const runs = await this.findRecentRuns(storeId, 160);
    const intentCounts = this.countBy(runs.map((run) => this.routeOf(run)?.intent ?? 'unknown'));
    const capabilities = this.registry.listCapabilities().map((capability) => ({
      code: capability.code,
      label: capability.label,
      domain: capability.domain,
      adapter: capability.adapter,
      riskLevel: capability.riskLevel,
      evidenceRequired: capability.evidenceRequired,
      hitCount: runs.filter((run) => this.routeOf(run)?.capabilityCandidates?.includes(capability.code)).length,
    }));
    return { intentCounts, capabilities };
  }

  getAdapters() {
    const capabilities = this.registry.listCapabilities();
    const adapters = this.countBy(capabilities.map((item) => item.adapter));
    return {
      adapters: Object.entries(adapters).map(([adapterCode, capabilityCount]) => ({
        adapterCode,
        capabilityCount,
        capabilities: capabilities.filter((item) => item.adapter === adapterCode).map((item) => item.code),
      })),
      verticalAdapters: ['reception', 'cashier', 'beautician', 'schedule', 'finance', 'inventory_supply', 'staff_performance', 'marketing', 'lifecycle'],
      boundary: 'V5 adapter 可复用底层 service，但不递归调用 V1/V2/V3/V4 Agent 入口。',
    };
  }

  async getClarifications(storeId: number) {
    const runs = (await this.findRecentRuns(storeId, 160)).filter((run) => this.hasClarification(run));
    return {
      total: runs.length,
      items: runs.slice(0, 30).map((run) => ({
        runId: run.id,
        runNo: run.runNo,
        status: run.status,
        question: this.resultOf(run)?.evidence?.evidencePolicy?.clarification?.question ?? this.findClarificationBlock(run)?.question ?? '',
        candidates: this.resultOf(run)?.evidence?.evidencePolicy?.clarification?.candidates ?? this.findClarificationBlock(run)?.options?.map((item: any) => item.value) ?? [],
        createdAt: run.createdAt,
      })),
    };
  }

  async getMemory(storeId: number) {
    const runs = await this.findRecentRuns(storeId, 120);
    const snapshots = runs.map((run) => this.resultOf(run)?.memory).filter((memory) => memory && typeof memory === 'object');
    return {
      snapshotCount: snapshots.length,
      workingKeyCounts: this.countBy(snapshots.flatMap((memory: any) => this.asArray(memory.working).map((item: any) => item.key))),
      preferenceKeyCounts: this.countBy(snapshots.flatMap((memory: any) => this.asArray(memory.preferences).map((item: any) => item.key))),
      policy: '只保留 V5 短期业务上下文、偏好和治理摘要；不保存完整手机号、身份证、聊天长文本等敏感原文。',
    };
  }

  async getFailures(storeId: number) {
    const runs = (await this.findRecentRuns(storeId, 160)).filter((run) => run.status === 'failed');
    return {
      total: runs.length,
      items: runs.slice(0, 30).map((run) => ({
        runId: run.id,
        runNo: run.runNo,
        intent: this.routeOf(run)?.intent ?? 'unknown',
        adapter: this.firstAdapter(run) ?? 'unknown',
        errorMessage: run.errorMessage ?? this.resultOf(run)?.answer ?? '',
        createdAt: run.createdAt,
      })),
    };
  }

  async getEval(storeId: number) {
    const runs = await this.findRecentRuns(storeId, 200);
    const total = runs.length;
    const completed = runs.filter((run) => run.status === 'completed' || run.status === 'waiting_approval').length;
    return {
      sampleSize: total,
      completionRate: total ? completed / total : 0,
      failureRate: total ? runs.filter((run) => run.status === 'failed').length / total : 0,
      clarificationRate: total ? runs.filter((run) => this.hasClarification(run)).length / total : 0,
      memoryUsageRate: total ? runs.filter((run) => this.hasMemory(run)).length / total : 0,
      adapterCoverage: this.getAdapters(),
      recommendation: total
        ? '优先补齐低命中 adapter 的实体解析、证据链和追问候选。'
        : '暂无 V5 运行样本，建议先用评测题库跑一轮生成基线。',
    };
  }

  private async findRecentRuns(storeId: number, take: number) {
    const delegate = (this.prisma as any).agentRun;
    if (!delegate?.findMany) return [];
    const rows = await delegate.findMany({
      where: { storeId, agentCode: AGENT_V5_CODE },
      take,
      orderBy: { createdAt: 'desc' },
    }).catch(() => []);
    return Array.isArray(rows) ? rows : [];
  }

  private toRunSummary(run: any) {
    const route = this.routeOf(run);
    return {
      runId: run.id,
      runNo: run.runNo,
      status: run.status,
      intent: route?.intent ?? 'unknown',
      adapter: this.firstAdapter(run) ?? 'unknown',
      answer: this.resultOf(run)?.answer ?? '',
      createdAt: run.createdAt,
    };
  }

  private hasClarification(run: any) {
    const result = this.resultOf(run);
    return Boolean(result?.evidence?.evidencePolicy?.clarification || this.findClarificationBlock(run));
  }

  private findClarificationBlock(run: any) {
    return this.asArray(this.resultOf(run)?.renderedBlocks).find((block: any) => block?.kind === 'clarification_card') ?? null;
  }

  private hasMemory(run: any) {
    const result = this.resultOf(run);
    return Boolean(this.asArray(result?.memory?.working).length || this.asArray(result?.memoryUsed).length);
  }

  private firstAdapter(run: any) {
    return this.routeOf(run)?.adapterCandidates?.[0] ?? null;
  }

  private routeOf(run: any) {
    return this.resultOf(run)?.route ?? null;
  }

  private resultOf(run: any) {
    return run?.resultJson && typeof run.resultJson === 'object' ? run.resultJson : {};
  }

  private countBy(values: Array<string | null | undefined>) {
    return values.filter(Boolean).reduce<Record<string, number>>((acc, value) => {
      const key = String(value);
      acc[key] = (acc[key] ?? 0) + 1;
      return acc;
    }, {});
  }

  private asArray(value: unknown): any[] {
    return Array.isArray(value) ? value : [];
  }
}
