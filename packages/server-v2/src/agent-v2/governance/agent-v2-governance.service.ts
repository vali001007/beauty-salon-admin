import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { PrismaService } from '../../prisma/prisma.service.js';
import { AgentV2RuntimeService, type AgentV2RuntimePlan } from '../agent-v2-runtime.service.js';
import {
  AgentV2ManifestProviderService,
  type AgentV2ManifestVersionSnapshot,
} from '../capability-center/agent-v2-manifest-provider.service.js';
import { AgentV2AutoPublishService } from '../capability-center/agent-v2-auto-publish.service.js';
import { AGENT_V2_KNOWLEDGE_GRAPH_SNAPSHOT } from '../knowledge-graph/generated/knowledge-graph.generated.js';
import { AgentV2GrayStrategyService, isGrayMode, type AgentV2GrayMode } from '../agent-v2-gray-strategy.service.js';
import type { AgentPlan, AgentRole, AgentToolPlanItem, AgentToolResult, AuraResponseBlock } from '../../agent/agent.types.js';
import type { AgentV2CapabilityDecision, AgentV2CapabilityManifest } from '../capability/agent-v2-capability.types.js';

const DEFAULT_EVAL_DRAFT_REPORT = 'docs/04-测试数据/Agent评测与知识治理-2026-06-30至07-03/agent-v2-eval-drafts.json';
const DEFAULT_EVAL_GATE_REPORT = 'docs/04-测试数据/Agent评测与知识治理-2026-06-30至07-03/agent-v2-eval-gate-report.json';
const DAY_MS = 86_400_000;
const READ_ONLY_EVAL_REPLAY_TOOLS = new Set([
  'business.record.query',
  'business.metric.query',
  'business.trend.query',
  'business.detail.query',
  'navigation.open',
]);
const EVAL_REPLAY_TABLE_LABELS: Record<string, string> = {
  orderNo: '订单编号',
  customerName: '客户',
  itemSummary: '业务明细',
  itemName: '明细',
  quantityText: '数量',
  totalAmountText: '合计金额',
  totalNetAmountText: '合计实收',
  paidAt: '支付时间',
  occurredAt: '发生时间',
  operatorName: '操作人',
  productName: '产品',
  projectName: '项目',
  statusLabel: '状态',
};

type GovernanceEvalCase = {
  id: string;
  source?: string;
  question: string;
  roleGroup?: string;
  priority: string;
  expectedCapabilityId?: string;
  expectedIntent?: string;
  expectedObjects?: string[];
  expectedPersonaCodes?: string[];
  expectedOutputKinds?: string[];
  evidenceRequired?: boolean | string[];
  permissionProfile?: string;
  unsupportedAllowed?: boolean;
  permissionResult?: string;
  contractResult?: string;
  failureCategory?: string;
};

type KnowledgeGraphOverrideType = 'synonym' | 'exclude';

@Injectable()
export class AgentV2GovernanceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly manifestProvider: AgentV2ManifestProviderService,
    private readonly autoPublish: AgentV2AutoPublishService,
    private readonly runtime: AgentV2RuntimeService,
    private readonly grayStrategy: AgentV2GrayStrategyService,
  ) {}

  async listRuns(query: { page?: number; pageSize?: number; status?: string; keyword?: string; storeId?: number } = {}) {
    const page = this.toPositiveInt(query.page, 1);
    const pageSize = Math.min(this.toPositiveInt(query.pageSize, 20), 100);
    const keyword = String(query.keyword ?? '').trim();
    const where: Record<string, unknown> = {
      agentCode: 'agent_v2',
      ...(query.storeId ? { storeId: Number(query.storeId) } : {}),
      ...(query.status && query.status !== 'all' ? { status: query.status } : {}),
      ...(keyword
        ? { OR: [{ runNo: { contains: keyword, mode: 'insensitive' } }, { userInput: { contains: keyword, mode: 'insensitive' } }] }
        : {}),
    };
    const [items, total] = await Promise.all([
      this.agentRun.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.agentRun.count({ where }),
    ]);
    return { items, total, page, pageSize };
  }

  async getRunDetail(id: number, storeId?: number) {
    const run = await this.agentRun.findFirst({
      where: { id, agentCode: 'agent_v2', ...(storeId ? { storeId: Number(storeId) } : {}) },
    });
    if (!run) throw new NotFoundException('Agent V2 run not found');
    const [messages, steps, toolCalls, approvals] = await Promise.all([
      this.delegate('agentMessage').findMany({ where: { runId: id }, orderBy: { createdAt: 'asc' } }),
      this.delegate('agentStep').findMany({ where: { runId: id }, orderBy: { startedAt: 'asc' } }),
      this.delegate('agentToolCall').findMany({ where: { runId: id }, orderBy: { createdAt: 'asc' } }),
      this.delegate('agentApproval').findMany({ where: { runId: id }, orderBy: { createdAt: 'asc' } }),
    ]);
    return { run, messages, steps, toolCalls, approvals, replay: this.buildRunReplay({ run, messages, steps, toolCalls, approvals }) };
  }

  async getRunStats(query: { storeId?: number } = {}) {
    const where = { agentCode: 'agent_v2', ...(query.storeId ? { storeId: Number(query.storeId) } : {}) };
    const [total, byStatus] = await Promise.all([
      this.agentRun.count({ where }),
      this.agentRun.groupBy({ by: ['status'], where, _count: { _all: true } }),
    ]);
    return {
      total,
      byStatus: Object.fromEntries((byStatus as Array<{ status: string; _count: { _all: number } }>).map((item) => [item.status, item._count._all])),
      activeManifestVersion: this.manifestProvider.getActiveVersion(),
    };
  }

  async listRunFailures(query: { page?: number; pageSize?: number; storeId?: number } = {}) {
    return this.listRuns({ ...query, status: 'failed' });
  }

  async listUncoveredTop(query: { limit?: number; storeId?: number } = {}) {
    const limit = Math.min(this.toPositiveInt(query.limit, 20), 100);
    const runs = await this.agentRun.findMany({
      where: {
        agentCode: 'agent_v2',
        ...(query.storeId ? { storeId: Number(query.storeId) } : {}),
        OR: [
          { status: 'failed' },
          { errorMessage: { not: null } },
        ],
      },
      select: { userInput: true, errorMessage: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
      take: 500,
    });
    const grouped = new Map<string, { question: string; count: number; latestAt?: Date; lastError?: string }>();
    for (const run of runs as Array<{ userInput?: string; errorMessage?: string; createdAt?: Date }>) {
      const question = String(run.userInput ?? '').trim() || '未记录问题';
      const current = grouped.get(question) ?? { question, count: 0 };
      current.count += 1;
      current.latestAt = run.createdAt;
      current.lastError = run.errorMessage;
      grouped.set(question, current);
    }
    return Array.from(grouped.values()).sort((a, b) => b.count - a.count).slice(0, limit);
  }

  async healthMetrics(query: { days?: number; storeId?: number } = {}) {
    const days = Math.min(this.toPositiveInt(query.days, 7), 90);
    const until = new Date();
    const since = new Date(until.getTime() - days * DAY_MS);
    const where = {
      agentCode: 'agent_v2',
      createdAt: { gte: since, lte: until },
      ...(query.storeId ? { storeId: Number(query.storeId) } : {}),
    };
    const runs = await this.agentRun.findMany({
      where,
      select: {
        id: true,
        status: true,
        startedAt: true,
        completedAt: true,
        planJson: true,
        contextJson: true,
        evidenceJson: true,
        resultJson: true,
        errorMessage: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
      take: 5000,
    });
    const runIds = (runs as Array<{ id: number }>).map((run) => run.id);
    const [toolCalls, approvals, evalRuns, auditDetails] = await Promise.all([
      runIds.length
        ? this.delegate('agentToolCall').findMany({
            where: { runId: { in: runIds } },
            select: { toolName: true, status: true, riskLevel: true, latencyMs: true, approvalId: true, createdAt: true, completedAt: true },
            take: 10000,
          })
        : [],
      runIds.length
        ? this.delegate('agentApproval').findMany({ where: { runId: { in: runIds } }, select: { status: true } })
        : [],
      this.optionalDelegate('agentEvalRun')?.findMany({
        where: { createdAt: { gte: since, lte: until } },
        select: { status: true, score: true, createdAt: true },
        orderBy: { createdAt: 'desc' },
        take: 1000,
      }) ?? [],
      runIds.length
        ? this.optionalDelegate('agentRunAuditDetail')?.findMany({
            where: { runId: { in: runIds } },
            select: { runId: true, costJson: true, latencyBreakdownJson: true, createdAt: true },
            take: 5000,
          }) ?? []
        : [],
    ]);
    const runLatencyMs = (runs as any[])
      .map((run) => this.durationMs(run.startedAt, run.completedAt))
      .filter((value): value is number => value !== null);
    const toolLatencyMs = (toolCalls as any[])
      .map((tool) => this.toNullableNumber(tool.latencyMs) ?? this.durationMs(tool.createdAt, tool.completedAt))
      .filter((value): value is number => value !== null);
    const strategyTraces = (runs as any[]).map((run) => this.extractStrategyTrace(run.planJson, run.contextJson, run.resultJson)).filter(Boolean) as Array<Record<string, unknown>>;
    const cacheSamples = (runs as any[]).map((run) => this.findBooleanDeep([run.planJson, run.contextJson, run.resultJson], ['cacheHit', 'fromCache'])).filter((value): value is boolean => value !== null);
    const unauthorizedEvidenceCount = (runs as any[]).filter((run) => this.containsRiskText([run.evidenceJson, run.resultJson, run.planJson], ['越权', 'unauthorized', 'permission_denied'])).length;
    const highRiskAutoExecutionCount = (toolCalls as any[]).filter((tool) => String(tool.riskLevel) === 'high' && String(tool.status) === 'success' && !tool.approvalId).length;
    const cost = this.aggregateCostTelemetry([
      ...(runs as any[]).flatMap((run) => [run.contextJson, run.resultJson, run.planJson]),
      ...(auditDetails as any[]).flatMap((detail) => [detail.costJson, detail.latencyBreakdownJson]),
    ]);
    const completedCount = (runs as any[]).filter((run) => ['completed', 'success'].includes(String(run.status))).length;
    const failedCount = (runs as any[]).filter((run) => String(run.status) === 'failed' || run.errorMessage).length;

    return {
      generatedAt: new Date().toISOString(),
      activeManifestVersion: this.manifestProvider.getActiveVersion(),
      window: { days, since: since.toISOString(), until: until.toISOString(), storeId: query.storeId ?? null },
      runs: {
        total: runs.length,
        completed: completedCount,
        failed: failedCount,
        successRate: this.ratio(completedCount, runs.length),
        byStatus: this.countBy((runs as any[]).map((run) => String(run.status ?? 'unknown'))),
        runLatencyP99Ms: this.percentile(runLatencyMs, 0.99),
        latencySampleCount: runLatencyMs.length,
      },
      tools: {
        total: (toolCalls as any[]).length,
        failed: (toolCalls as any[]).filter((tool) => String(tool.status) === 'failed').length,
        highRiskAutoExecutionCount,
        byStatus: this.countBy((toolCalls as any[]).map((tool) => String(tool.status ?? 'unknown'))),
        byRiskLevel: this.countBy((toolCalls as any[]).map((tool) => String(tool.riskLevel ?? 'unknown'))),
        topTools: this.topCounts((toolCalls as any[]).map((tool) => String(tool.toolName ?? 'unknown')), 10),
        toolLatencyP99Ms: this.percentile(toolLatencyMs, 0.99),
        latencySampleCount: toolLatencyMs.length,
      },
      approvals: {
        total: (approvals as any[]).length,
        byStatus: this.countBy((approvals as any[]).map((approval) => String(approval.status ?? 'unknown'))),
      },
      strategy: {
        byMode: this.countBy(strategyTraces.map((trace) => String(trace.mode ?? 'unknown'))),
        byFinalEngine: this.countBy(strategyTraces.map((trace) => String(trace.finalEngine ?? 'unknown'))),
        legacyFallbackCount: strategyTraces.filter((trace) => trace.finalEngine === 'legacy_regex' && String(trace.mode ?? '').startsWith('kg_llm')).length,
        shadowCount: strategyTraces.filter((trace) => trace.mode === 'shadow').length,
        sampleCount: strategyTraces.length,
      },
      cache: cacheSamples.length
        ? {
            status: 'measured',
            hitRate: this.ratio(cacheSamples.filter(Boolean).length, cacheSamples.length),
            sampleCount: cacheSamples.length,
          }
        : {
            status: 'not_measured',
            hitRate: null,
            sampleCount: 0,
            reason: '运行审计中尚未发现 Intent cacheHit/fromCache trace。',
          },
      cost,
      eval: {
        total: (evalRuns as any[]).length,
        byStatus: this.countBy((evalRuns as any[]).map((run) => String(run.status ?? 'unknown'))),
      },
      risks: {
        unauthorizedEvidenceCount,
        highRiskAutoExecutionCount,
      },
    };
  }

  knowledgeGraphSummary() {
    return {
      ...AGENT_V2_KNOWLEDGE_GRAPH_SNAPSHOT.summary,
      passed: AGENT_V2_KNOWLEDGE_GRAPH_SNAPSHOT.report.passed,
      blockerCount: AGENT_V2_KNOWLEDGE_GRAPH_SNAPSHOT.report.blockers.length,
      warningCount: AGENT_V2_KNOWLEDGE_GRAPH_SNAPSHOT.report.warnings.length,
    };
  }

  listKnowledgeGraphNodes(query: { page?: number; pageSize?: number; type?: string; keyword?: string } = {}) {
    const page = this.toPositiveInt(query.page, 1);
    const pageSize = Math.min(this.toPositiveInt(query.pageSize, 50), 200);
    const keyword = String(query.keyword ?? '').trim().toLowerCase();
    const nodes = AGENT_V2_KNOWLEDGE_GRAPH_SNAPSHOT.nodes.filter((node) => {
      if (query.type && query.type !== 'all' && node.type !== query.type) return false;
      if (!keyword) return true;
      return [node.id, node.name, node.displayName, node.description].some((value) => String(value ?? '').toLowerCase().includes(keyword));
    });
    return {
      items: nodes.slice((page - 1) * pageSize, page * pageSize),
      total: nodes.length,
      page,
      pageSize,
    };
  }

  getKnowledgeGraphNode(id: string) {
    const node = AGENT_V2_KNOWLEDGE_GRAPH_SNAPSHOT.nodes.find((item) => item.id === id);
    if (!node) throw new NotFoundException('Knowledge graph node not found');
    const outgoing = AGENT_V2_KNOWLEDGE_GRAPH_SNAPSHOT.edges.filter((edge) => edge.from === id).slice(0, 200);
    const incoming = AGENT_V2_KNOWLEDGE_GRAPH_SNAPSHOT.edges.filter((edge) => edge.to === id).slice(0, 200);
    const relatedIds = new Set([...outgoing.map((edge) => edge.to), ...incoming.map((edge) => edge.from)]);
    return {
      node,
      outgoing,
      incoming,
      relatedNodes: AGENT_V2_KNOWLEDGE_GRAPH_SNAPSHOT.nodes.filter((item) => relatedIds.has(item.id)).slice(0, 200),
    };
  }

  listKnowledgeGraphGaps() {
    return AGENT_V2_KNOWLEDGE_GRAPH_SNAPSHOT.report.gaps;
  }

  visualizeKnowledgeGraph(query: { type?: string; limit?: number; focusId?: string; depth?: number } = {}) {
    const limit = Math.min(this.toPositiveInt(query.limit, 200), 500);
    const focusId = String(query.focusId ?? '').trim();
    if (focusId) {
      const focusNode = AGENT_V2_KNOWLEDGE_GRAPH_SNAPSHOT.nodes.find((node) => node.id === focusId);
      if (!focusNode) throw new NotFoundException('Knowledge graph focus node not found');
      const depth = Math.min(this.toPositiveInt(query.depth, 2), 4);
      const nodeIds = this.collectKnowledgeGraphNeighborhood(focusId, depth, limit);
      return {
        focusId,
        depth,
        nodes: AGENT_V2_KNOWLEDGE_GRAPH_SNAPSHOT.nodes.filter((node) => nodeIds.has(node.id)),
        edges: AGENT_V2_KNOWLEDGE_GRAPH_SNAPSHOT.edges.filter((edge) => nodeIds.has(edge.from) && nodeIds.has(edge.to)),
      };
    }
    const nodeIds = new Set(
      AGENT_V2_KNOWLEDGE_GRAPH_SNAPSHOT.nodes
        .filter((node) => !query.type || query.type === 'all' || node.type === query.type)
        .slice(0, limit)
        .map((node) => node.id),
    );
    return {
      nodes: AGENT_V2_KNOWLEDGE_GRAPH_SNAPSHOT.nodes.filter((node) => nodeIds.has(node.id)),
      edges: AGENT_V2_KNOWLEDGE_GRAPH_SNAPSHOT.edges.filter((edge) => nodeIds.has(edge.from) && nodeIds.has(edge.to)),
    };
  }

  private collectKnowledgeGraphNeighborhood(focusId: string, depth: number, limit: number) {
    const nodeIds = new Set<string>([focusId]);
    const queue: Array<{ id: string; depth: number }> = [{ id: focusId, depth: 0 }];
    const visited = new Set<string>();
    const edges = AGENT_V2_KNOWLEDGE_GRAPH_SNAPSHOT.edges;
    while (queue.length && nodeIds.size < limit) {
      const current = queue.shift();
      if (!current || visited.has(current.id)) continue;
      visited.add(current.id);
      if (current.depth >= depth) continue;
      const adjacent = edges
        .filter((edge) => edge.from === current.id || edge.to === current.id)
        .sort((a, b) => this.edgePriority(a.type) - this.edgePriority(b.type));
      for (const edge of adjacent) {
        const nextId = edge.from === current.id ? edge.to : edge.from;
        if (!nodeIds.has(nextId)) {
          nodeIds.add(nextId);
          if (nodeIds.size >= limit) break;
        }
        queue.push({ id: nextId, depth: current.depth + 1 });
      }
    }
    return nodeIds;
  }

  private edgePriority(type: string) {
    if (type === 'COMPOSED_OF' || type === 'FK_RELATION') return 1;
    if (type === 'REQUIRES_PERM') return 2;
    if (type === 'TRIGGERS' || type === 'SYNONYM_OF') return 3;
    if (type === 'EXCLUDES') return 4;
    return 5;
  }

  knowledgeGraphPath(input: { from: string; to: string; maxDepth?: number }) {
    const maxDepth = Math.min(this.toPositiveInt(input.maxDepth, 4), 8);
    const queue: Array<{ id: string; path: string[] }> = [{ id: input.from, path: [input.from] }];
    const visited = new Set<string>();
    while (queue.length) {
      const current = queue.shift();
      if (!current) break;
      if (current.id === input.to) return { found: true, path: current.path, maxDepth };
      if (current.path.length > maxDepth + 1 || visited.has(current.id)) continue;
      visited.add(current.id);
      for (const edge of AGENT_V2_KNOWLEDGE_GRAPH_SNAPSHOT.edges.filter((item) => item.from === current.id)) {
        queue.push({ id: edge.to, path: [...current.path, edge.to] });
      }
    }
    return { found: false, path: [], maxDepth };
  }

  async listKnowledgeGraphOverrides(query: { page?: number; pageSize?: number; type?: string; status?: string } = {}) {
    const page = this.toPositiveInt(query.page, 1);
    const pageSize = Math.min(this.toPositiveInt(query.pageSize, 20), 100);
    const where: Record<string, unknown> = {
      ...(query.type && query.type !== 'all' ? { overrideType: query.type } : {}),
      ...(query.status && query.status !== 'all' ? { status: query.status } : { status: { not: 'deleted' } }),
    };
    const delegate = this.delegate('agentKnowledgeGraphOverride');
    const [items, total] = await Promise.all([
      delegate.findMany({
        where,
        orderBy: { updatedAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      delegate.count({ where }),
    ]);
    return { items: (items as any[]).map((item) => this.mapKnowledgeGraphOverride(item)), total, page, pageSize };
  }

  listKnowledgeGraphSynonyms(query: { page?: number; pageSize?: number; status?: string } = {}) {
    return this.listKnowledgeGraphOverrides({ ...query, type: 'synonym' });
  }

  listKnowledgeGraphExcludes(query: { page?: number; pageSize?: number; status?: string } = {}) {
    return this.listKnowledgeGraphOverrides({ ...query, type: 'exclude' });
  }

  async createKnowledgeGraphSynonym(input: { targetNodeId?: string; synonym?: string; reason?: string; confidence?: number; createdBy?: number }) {
    const targetNodeId = this.requiredText(input.targetNodeId, 'targetNodeId');
    const synonym = this.requiredText(input.synonym, 'synonym');
    const targetNode = this.requireKnowledgeGraphNode(targetNodeId);
    const created = await this.delegate('agentKnowledgeGraphOverride').create({
      data: {
        overrideType: 'synonym',
        relationType: 'SYNONYM_OF',
        targetNodeId,
        value: synonym,
        label: `${synonym} -> ${targetNode.displayName ?? targetNode.name}`,
        reason: this.optionalText(input.reason),
        confidence: this.clampConfidence(input.confidence),
        payloadJson: this.toJson({
          targetNode: { id: targetNode.id, type: targetNode.type, name: targetNode.name, displayName: targetNode.displayName },
          generatedNode: { type: 'Word', name: synonym },
          nextGraphMerge: 'kg:generate',
          source: 'manual_override',
        }),
        createdBy: input.createdBy,
      },
    });
    return this.mapKnowledgeGraphOverride(created);
  }

  async createKnowledgeGraphExclude(input: { sourceNodeId?: string; targetNodeId?: string; reason?: string; confidence?: number; createdBy?: number }) {
    const sourceNodeId = this.requiredText(input.sourceNodeId, 'sourceNodeId');
    const targetNodeId = this.requiredText(input.targetNodeId, 'targetNodeId');
    const sourceNode = this.requireKnowledgeGraphNode(sourceNodeId);
    const targetNode = this.requireKnowledgeGraphNode(targetNodeId);
    const created = await this.delegate('agentKnowledgeGraphOverride').create({
      data: {
        overrideType: 'exclude',
        relationType: 'EXCLUDES',
        sourceNodeId,
        targetNodeId,
        value: targetNodeId,
        label: `${sourceNode.displayName ?? sourceNode.name} 排除 ${targetNode.displayName ?? targetNode.name}`,
        reason: this.optionalText(input.reason),
        confidence: this.clampConfidence(input.confidence),
        payloadJson: this.toJson({
          sourceNode: { id: sourceNode.id, type: sourceNode.type, name: sourceNode.name, displayName: sourceNode.displayName },
          targetNode: { id: targetNode.id, type: targetNode.type, name: targetNode.name, displayName: targetNode.displayName },
          nextGraphMerge: 'kg:generate',
          source: 'manual_override',
        }),
        createdBy: input.createdBy,
      },
    });
    return this.mapKnowledgeGraphOverride(created);
  }

  async deleteKnowledgeGraphOverride(id: number, type?: KnowledgeGraphOverrideType, actorId?: number) {
    const delegate = this.delegate('agentKnowledgeGraphOverride');
    const existing = await delegate.findFirst({ where: { id, ...(type ? { overrideType: type } : {}) } });
    if (!existing) throw new NotFoundException('Knowledge graph override not found');
    const updated = await delegate.update({
      where: { id },
      data: {
        status: 'deleted',
        payloadJson: this.toJson({
          ...(this.asObject(existing.payloadJson) ?? {}),
          deletedBy: actorId ?? null,
          deletedAt: new Date().toISOString(),
        }),
      },
    });
    return this.mapKnowledgeGraphOverride(updated);
  }

  capabilitiesHealth() {
    const manifests = this.manifestProvider.listManifests();
    const byReleaseStrategy = this.countBy(manifests.map((item) => item.releaseStrategy));
    const byRiskLevel = this.countBy(manifests.map((item) => item.riskLevel));
    return {
      activeManifestVersion: this.manifestProvider.getActiveVersion(),
      total: manifests.length,
      enabled: manifests.filter((item) => item.status === 'enabled').length,
      disabled: manifests.filter((item) => item.status !== 'enabled').length,
      byReleaseStrategy,
      byRiskLevel,
    };
  }

  capabilitiesHeatMap() {
    const manifests = this.manifestProvider.listManifests();
    return Array.from(
      manifests.reduce((map, manifest) => {
        const key = `${manifest.domain}:${manifest.releaseStrategy}`;
        const current = map.get(key) ?? { domain: manifest.domain, releaseStrategy: manifest.releaseStrategy, count: 0 };
        current.count += 1;
        map.set(key, current);
        return map;
      }, new Map<string, { domain: string; releaseStrategy: string; count: number }>()),
    ).map(([, value]) => value);
  }

  listAutoPublishLogs(query: { page?: number; pageSize?: number; status?: string; trigger?: string }) {
    return this.autoPublish.listRuns(query);
  }

  getAutoPublishLog(id: number) {
    return this.autoPublish.getRun(id);
  }

  async listGrayRules(query: { page?: number; pageSize?: number; status?: string; mode?: string } = {}) {
    const page = this.toPositiveInt(query.page, 1);
    const pageSize = Math.min(this.toPositiveInt(query.pageSize, 20), 100);
    const where: Record<string, unknown> = {
      ...(query.status && query.status !== 'all' ? { status: query.status } : { status: { not: 'deleted' } }),
      ...(query.mode && query.mode !== 'all' ? { mode: query.mode } : {}),
    };
    const delegate = this.delegate('agentV2GrayRule');
    const [items, total] = await Promise.all([
      delegate.findMany({
        where,
        orderBy: [{ priority: 'asc' }, { id: 'asc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      delegate.count({ where }),
    ]);
    return { items: (items as any[]).map((item) => this.mapGrayRule(item)), total, page, pageSize };
  }

  async createGrayRule(input: {
    name?: string;
    mode?: string;
    priority?: number;
    storeIds?: Array<number | string>;
    personaCodes?: string[];
    roles?: string[];
    entrypoints?: string[];
    capabilityIds?: string[];
    reason?: string;
    createdBy?: number;
  }) {
    const name = this.requiredText(input.name, 'name');
    const mode = this.requiredGrayMode(input.mode);
    this.assertGrayRuleCreationAllowed(mode);
    const priority = this.toPositiveInt(input.priority, 100);
    const scope = {
      storeIds: this.numberList(input.storeIds),
      personaCodes: this.textList(input.personaCodes),
      roles: this.textList(input.roles),
      entrypoints: this.textList(input.entrypoints),
      capabilityIds: this.textList(input.capabilityIds),
    };
    const created = await this.delegate('agentV2GrayRule').create({
      data: {
        name,
        mode,
        priority,
        ...scope,
        reason: this.optionalText(input.reason),
        createdBy: input.createdBy,
        payloadJson: this.toJson({
          source: 'agent_governance',
          scopeSummary: this.grayRuleScopeSummary(scope),
        }),
      },
    });
    await this.grayStrategy.refreshDbRules();
    return this.mapGrayRule(created);
  }

  async deleteGrayRule(id: number, actorId?: number) {
    const delegate = this.delegate('agentV2GrayRule');
    const existing = await delegate.findFirst({ where: { id, status: { not: 'deleted' } } });
    if (!existing) throw new NotFoundException('Agent V2 gray rule not found');
    const updated = await delegate.update({
      where: { id },
      data: {
        status: 'deleted',
        deletedBy: actorId,
        updatedBy: actorId,
        payloadJson: this.toJson({
          ...(this.asObject(existing.payloadJson) ?? {}),
          deletedBy: actorId ?? null,
          deletedAt: new Date().toISOString(),
        }),
      },
    });
    await this.grayStrategy.refreshDbRules();
    return this.mapGrayRule(updated);
  }

  async evalCases(query: { page?: number; pageSize?: number; priority?: string } = {}) {
    const page = this.toPositiveInt(query.page, 1);
    const pageSize = Math.min(this.toPositiveInt(query.pageSize, 50), 200);
    const persistedCases = await this.listPersistedEvalCases();
    const cases = [...persistedCases, ...this.readEvalDrafts()]
      .filter((item) => !query.priority || query.priority === 'all' || item.priority === query.priority);
    return {
      items: cases.slice((page - 1) * pageSize, page * pageSize),
      total: cases.length,
      page,
      pageSize,
    };
  }

  async createEvalCase(input: Record<string, unknown>) {
    const question = this.requiredText(input.question ?? input.input, 'question');
    const role = String(input.role ?? input.roleGroup ?? 'manager').trim() || 'manager';
    const scenario = String(input.scenario ?? input.priority ?? 'agent_governance_manual').trim() || 'agent_governance_manual';
    const expectedCapabilityId = this.optionalText(input.expectedCapabilityId ?? input.expectedTool);
    const expectedOutcome = {
      priority: this.optionalText(input.priority) ?? 'P2',
      expectedIntent: this.optionalText(input.expectedIntent),
      expectedObjects: Array.isArray(input.expectedObjects) ? input.expectedObjects : undefined,
      expectedPersonaCodes: Array.isArray(input.expectedPersonaCodes) ? input.expectedPersonaCodes : undefined,
      expectedOutputKinds: Array.isArray(input.expectedOutputKinds) ? input.expectedOutputKinds : undefined,
      evidenceRequired: this.normalizeEvidenceRequiredInput(input.evidenceRequired),
      permissionProfile: this.optionalText(input.permissionProfile),
      unsupportedAllowed: typeof input.unsupportedAllowed === 'boolean' ? input.unsupportedAllowed : undefined,
      permissionResult: this.optionalText(input.permissionResult),
      contractResult: this.optionalText(input.contractResult),
      failureCategory: this.optionalText(input.failureCategory),
      source: 'agent_governance_manual',
    };
    const created = await this.delegate('agentEvalCase').create({
      data: {
        scenario,
        input: question,
        role,
        expectedTool: expectedCapabilityId,
        expectedOutcome: this.toJson(expectedOutcome),
        status: this.optionalText(input.status) ?? 'active',
      },
    });
    return this.mapEvalCase(created);
  }

  async updateEvalCase(id: number, input: Record<string, unknown>) {
    const delegate = this.delegate('agentEvalCase');
    const existing = await delegate.findFirst({ where: { id } });
    if (!existing) throw new NotFoundException(`Agent eval case not found: ${id}`);
    const currentOutcome = this.asObject(existing.expectedOutcome) ?? {};
    const nextOutcome = {
      ...currentOutcome,
      ...(input.priority !== undefined ? { priority: this.optionalText(input.priority) } : {}),
      ...(input.expectedIntent !== undefined ? { expectedIntent: this.optionalText(input.expectedIntent) } : {}),
      ...(input.expectedObjects !== undefined ? { expectedObjects: Array.isArray(input.expectedObjects) ? input.expectedObjects : [] } : {}),
      ...(input.expectedPersonaCodes !== undefined ? { expectedPersonaCodes: Array.isArray(input.expectedPersonaCodes) ? input.expectedPersonaCodes : [] } : {}),
      ...(input.expectedOutputKinds !== undefined ? { expectedOutputKinds: Array.isArray(input.expectedOutputKinds) ? input.expectedOutputKinds : [] } : {}),
      ...(input.evidenceRequired !== undefined ? { evidenceRequired: this.normalizeEvidenceRequiredInput(input.evidenceRequired) } : {}),
      ...(input.permissionProfile !== undefined ? { permissionProfile: this.optionalText(input.permissionProfile) } : {}),
      ...(input.unsupportedAllowed !== undefined ? { unsupportedAllowed: input.unsupportedAllowed === true } : {}),
      ...(input.permissionResult !== undefined ? { permissionResult: this.optionalText(input.permissionResult) } : {}),
      ...(input.contractResult !== undefined ? { contractResult: this.optionalText(input.contractResult) } : {}),
      ...(input.failureCategory !== undefined ? { failureCategory: this.optionalText(input.failureCategory) } : {}),
      source: currentOutcome.source ?? 'agent_governance_manual',
    };
    const updated = await delegate.update({
      where: { id },
      data: {
        ...(input.scenario !== undefined ? { scenario: this.requiredText(input.scenario, 'scenario') } : {}),
        ...(input.question !== undefined || input.input !== undefined ? { input: this.requiredText(input.question ?? input.input, 'question') } : {}),
        ...(input.role !== undefined || input.roleGroup !== undefined ? { role: this.requiredText(input.role ?? input.roleGroup, 'role') } : {}),
        ...(input.expectedCapabilityId !== undefined || input.expectedTool !== undefined ? { expectedTool: this.optionalText(input.expectedCapabilityId ?? input.expectedTool) } : {}),
        ...(input.status !== undefined ? { status: this.requiredText(input.status, 'status') } : {}),
        expectedOutcome: this.toJson(nextOutcome),
      },
    });
    return this.mapEvalCase(updated);
  }

  evalRuns() {
    return this.readJson(DEFAULT_EVAL_GATE_REPORT);
  }

  async listPersistedEvalRuns(query: { page?: number; pageSize?: number; status?: string } = {}) {
    const page = this.toPositiveInt(query.page, 1);
    const pageSize = Math.min(this.toPositiveInt(query.pageSize, 20), 100);
    const where: Record<string, unknown> = {};
    if (query.status && query.status !== 'all') where.status = query.status;
    const delegate = this.delegate('agentEvalRun');
    const [items, total] = await Promise.all([
      delegate.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      delegate.count({ where }),
    ]);
    return { items, total, page, pageSize };
  }

  async getPersistedEvalRunDetail(id: number) {
    const run = await this.delegate('agentEvalRun').findFirst({ where: { id } });
    if (!run) throw new NotFoundException(`Agent eval run not found: ${id}`);
    const result = this.normalizeEvalRunResult(run.resultJson);
    const gates = Array.isArray(result.gates) ? result.gates : [];
    const failures = this.extractEvalRunFailures(result, run.errorMessage);
    return {
      id: Number(run.id),
      caseId: run.caseId ?? null,
      runId: run.runId ?? null,
      status: run.status,
      score: run.score ?? null,
      errorMessage: run.errorMessage ?? null,
      createdAt: run.createdAt,
      source: result.source ?? null,
      importedAt: result.importedAt ?? null,
      summary: this.asObject(result.summary) ?? {},
      metrics: this.asObject(result.metrics) ?? {},
      gates,
      failedGates: gates.filter((gate: any) => gate?.pass === false),
      samples: this.asObject(result.samples) ?? {},
      failureCount: failures.length,
      failures: failures.slice(0, 20),
    };
  }

  async listPersistedEvalRunFailures(id: number, query: { page?: number; pageSize?: number; category?: string } = {}) {
    const detail = await this.getPersistedEvalRunDetail(id);
    const page = this.toPositiveInt(query.page, 1);
    const pageSize = Math.min(this.toPositiveInt(query.pageSize, 20), 100);
    const category = String(query.category ?? '').trim();
    const allFailures = category && category !== 'all'
      ? detail.failures.filter((item: any) => item.category === category)
      : detail.failures;
    return {
      items: allFailures.slice((page - 1) * pageSize, page * pageSize),
      total: allFailures.length,
      page,
      pageSize,
      categories: this.countBy(detail.failures.map((item: any) => String(item.category ?? 'unknown'))),
      run: {
        id: detail.id,
        status: detail.status,
        score: detail.score,
        createdAt: detail.createdAt,
      },
      summary: allFailures.length
        ? `本次评测有 ${allFailures.length} 条失败或阻断样例。`
        : '本次评测没有失败样例。',
    };
  }

  async replayEvalRunFailure(id: number, input: {
    category?: string;
    index?: number;
    failureId?: string | number;
    storeId?: number;
    role?: 'manager' | 'reception' | 'beautician' | string;
    entrypoint?: string;
    grayMode?: string;
    toolReplay?: boolean;
  } = {}) {
    const detail = await this.getPersistedEvalRunDetail(id);
    const failure = this.findEvalRunFailure(detail.failures, input);
    if (!failure) throw new NotFoundException('Agent eval failure sample not found');
    const question = this.optionalText((failure as any).question ?? this.asObject((failure as any).sample)?.question ?? this.asObject((failure as any).sample)?.input);
    if (!question) throw new BadRequestException('Selected failure does not contain a replayable question');

    const storeId = this.toNullableNumber(input.storeId) ?? 1;
    const role = this.normalizeDebugRole(input.role ?? this.asObject((failure as any).sample)?.role);
    const debug = this.debugExecute({
      question,
      storeId,
      role,
      entrypoint: this.optionalText(input.entrypoint) ?? 'agent_governance_eval_replay',
      grayMode: input.grayMode,
    });
    const toolReplay = input.toolReplay
      ? await this.replayEvalFailureReadOnlyTools(debug, { storeId, role })
      : this.replayEvalFailureToolsNotRequested();
    const contractReplay = input.toolReplay
      ? this.buildEvalFailureContractReplay(question, debug.plan ?? null, toolReplay.results as AgentToolResult[])
      : this.evalFailureContractReplayNotRequested();
    const queryReplay = input.toolReplay
      ? this.buildReadOnlyQueryReplay(toolReplay.results as AgentToolResult[])
      : this.queryReplayNotRequested();
    const expectedCapabilityId = this.optionalText((failure as any).expectedCapabilityId ?? this.asObject((failure as any).sample)?.expectedCapabilityId) ?? null;
    const previousActualCapabilityId = this.optionalText((failure as any).actualCapabilityId ?? this.asObject((failure as any).sample)?.actualCapabilityId) ?? null;
    const replayCapabilityId = debug.selectedCapabilityId ?? null;
    return {
      run: {
        id: detail.id,
        status: detail.status,
        score: detail.score,
        createdAt: detail.createdAt,
      },
      failure,
      replay: debug,
      comparison: {
        expectedCapabilityId,
        previousActualCapabilityId,
        replayCapabilityId,
        previousMatchedExpected: expectedCapabilityId && previousActualCapabilityId ? expectedCapabilityId === previousActualCapabilityId : null,
        replayMatchedExpected: expectedCapabilityId && replayCapabilityId ? expectedCapabilityId === replayCapabilityId : null,
        changedFromPrevious: previousActualCapabilityId && replayCapabilityId ? previousActualCapabilityId !== replayCapabilityId : null,
      },
      diagnosis: this.evalFailureReplayDiagnosis(failure, {
        expectedCapabilityId,
        previousActualCapabilityId,
        replayCapabilityId,
      }),
      safety: {
        dryRun: true,
        toolExecution: toolReplay.executed,
        readOnlyToolReplay: toolReplay.executed,
        writeExecution: false,
        note: toolReplay.executed
          ? '失败回放已按只读白名单执行查询类工具，仍禁止草稿、审批和写入动作。'
          : '失败回放只复用运行时规划链路，不执行真实工具和写入动作。',
      },
      toolReplay,
      queryReplay,
      contractReplay,
    };
  }

  async createEvalRun(input: { requestedBy?: number; note?: string } = {}) {
    const report = this.readJson(DEFAULT_EVAL_GATE_REPORT);
    const pass = this.asObject(report.summary)?.pass === true;
    const created = await this.delegate('agentEvalRun').create({
      data: {
        status: pass ? 'pass' : 'failed',
        score: pass ? 1 : 0,
        resultJson: this.toJson({
          source: 'agent-v2-eval-gate-report.json',
          trigger: 'manual_governance_api',
          requestedBy: input.requestedBy ?? null,
          note: input.note ?? null,
          importedAt: new Date().toISOString(),
          summary: report.summary,
          metrics: report.metrics,
          gates: report.gates,
          samples: report.samples,
        }),
        errorMessage: pass ? undefined : 'Agent V2 Eval Gate 未通过。',
      },
    });
    return {
      id: created.id,
      status: created.status,
      score: created.score,
      totalQuestions: Number(this.asObject(report.summary)?.totalQuestions ?? 0),
      p0Questions: Number(this.asObject(report.summary)?.p0Questions ?? 0),
      createdAt: created.createdAt,
      source: 'agent-v2-eval-gate-report.json',
      trigger: 'manual_governance_api',
    };
  }

  async runEvalDryRunBatch(input: {
    requestedBy?: number;
    priority?: string;
    limit?: number;
    role?: 'manager' | 'reception' | 'beautician' | string;
    storeId?: number;
    entrypoint?: string;
    grayMode?: string;
    note?: string;
  } = {}) {
    const priority = this.optionalText(input.priority) ?? 'P0';
    const limit = Math.min(this.toPositiveInt(input.limit, 25), 100);
    const role = this.normalizeDebugRole(input.role);
    const grayMode = this.normalizeGrayMode(input.grayMode) ?? 'kg_llm_preferred';
    const entrypoint = this.optionalText(input.entrypoint) ?? 'agent_governance_eval_batch';
    const cases = (await this.evalCases({ priority, page: 1, pageSize: limit })).items;
    const evaluatedAt = new Date().toISOString();

    const rows = cases.map((item) => {
      try {
        const replay = this.debugExecute({
          question: item.question,
          storeId: this.toNullableNumber(input.storeId) ?? 1,
          role,
          entrypoint,
          grayMode,
        });
        const expectedCapabilityId = item.expectedCapabilityId ?? null;
        const actualCapabilityId = replay.selectedCapabilityId ?? null;
        const matched = expectedCapabilityId ? expectedCapabilityId === actualCapabilityId : Boolean(actualCapabilityId);
        const outcome = expectedCapabilityId
          ? matched ? 'pass' : actualCapabilityId ? 'wrong_route' : 'unmapped'
          : actualCapabilityId ? 'needs_expected_metadata' : 'unmapped';
        return {
          id: item.id,
          priority: item.priority,
          question: item.question,
          roleGroup: item.roleGroup ?? role,
          expectedCapabilityId,
          actualCapabilityId,
          confidence: replay.confidence ?? 0,
          outcome,
          reason: replay.reason ?? null,
          dryRun: true,
          toolExecution: false,
          replay: {
            grayMode: replay.grayMode,
            selectedCapabilityId: replay.selectedCapabilityId ?? null,
            confidence: replay.confidence ?? 0,
            reason: replay.reason ?? null,
            strategy: replay.strategy ?? null,
          },
        };
      } catch (error) {
        return {
          id: item.id,
          priority: item.priority,
          question: item.question,
          roleGroup: item.roleGroup ?? role,
          expectedCapabilityId: item.expectedCapabilityId ?? null,
          actualCapabilityId: null,
          confidence: 0,
          outcome: 'runtime_error',
          reason: error instanceof Error ? error.message : 'dry-run evaluation failed',
          dryRun: true,
          toolExecution: false,
        };
      }
    });

    const expectedRows = rows.filter((item) => item.expectedCapabilityId);
    const passRows = rows.filter((item) => item.outcome === 'pass');
    const unmappedRows = rows.filter((item) => item.outcome === 'unmapped');
    const wrongRouteRows = rows.filter((item) => item.outcome === 'wrong_route');
    const runtimeErrorRows = rows.filter((item) => item.outcome === 'runtime_error');
    const pass = rows.length > 0 && wrongRouteRows.length === 0 && unmappedRows.length === 0 && runtimeErrorRows.length === 0;
    const score = rows.length ? Number((passRows.length / rows.length).toFixed(4)) : 0;
    const gates = [
      {
        gate: 'dry-run 能力命中',
        expected: '全部题目至少命中一个能力',
        actual: `${rows.length - unmappedRows.length}/${rows.length}`,
        pass: unmappedRows.length === 0,
        level: priority === 'P0' ? 'p0' : 'p1',
      },
      {
        gate: 'dry-run 预期能力一致',
        expected: '有 expectedCapabilityId 的题全部一致',
        actual: `${passRows.length}/${expectedRows.length}`,
        pass: wrongRouteRows.length === 0 && runtimeErrorRows.length === 0,
        level: priority === 'P0' ? 'p0' : 'p1',
      },
    ];
    const summary = {
      pass,
      totalQuestions: rows.length,
      p0Questions: rows.filter((item) => item.priority === 'P0').length,
      priority,
      limit,
      matched: passRows.length,
      unmapped: unmappedRows.length,
      wrongRoute: wrongRouteRows.length,
      runtimeError: runtimeErrorRows.length,
    };
    const resultJson = this.toJson({
      source: 'agent_governance_dry_run_batch',
      trigger: 'manual_governance_eval_batch',
      requestedBy: input.requestedBy ?? null,
      note: input.note ?? null,
      evaluatedAt,
      summary,
      metrics: {
        dryRunAccuracy: score,
        totalQuestions: rows.length,
        expectedQuestionCount: expectedRows.length,
        unmappedCount: unmappedRows.length,
        wrongRouteCount: wrongRouteRows.length,
        runtimeErrorCount: runtimeErrorRows.length,
      },
      gates,
      samples: {
        evaluated: rows.slice(0, 100),
        p0Unmapped: unmappedRows,
        p0WrongRouteRisk: wrongRouteRows,
        runtimeUnstable: runtimeErrorRows,
      },
      safety: {
        dryRun: true,
        toolExecution: false,
        writeExecution: false,
        note: '批量评测只执行 runtime.plan，不执行真实工具和写入动作。',
      },
    });
    const created = await this.delegate('agentEvalRun').create({
      data: {
        status: pass ? 'pass' : 'failed',
        score,
        resultJson,
        errorMessage: pass ? undefined : 'Agent V2 dry-run batch evaluation has failures.',
      },
    });
    return {
      id: created.id,
      status: created.status,
      score: created.score,
      totalQuestions: rows.length,
      p0Questions: summary.p0Questions,
      createdAt: created.createdAt,
      source: 'agent_governance_dry_run_batch',
      trigger: 'manual_governance_eval_batch',
      summary,
      gates,
      samples: resultJson.samples,
    };
  }

  async importLatestEvalGateReport(input: { requestedBy?: number } = {}) {
    const report = this.readJson(DEFAULT_EVAL_GATE_REPORT);
    const pass = this.asObject(report.summary)?.pass === true;
    const totalQuestions = Number(this.asObject(report.summary)?.totalQuestions ?? 0);
    const p0Questions = Number(this.asObject(report.summary)?.p0Questions ?? 0);
    const created = await this.delegate('agentEvalRun').create({
      data: {
        status: pass ? 'pass' : 'failed',
        score: pass ? 1 : 0,
        resultJson: this.toJson({
          source: 'agent-v2-eval-gate-report.json',
          importedBy: input.requestedBy ?? null,
          importedAt: new Date().toISOString(),
          summary: report.summary,
          metrics: report.metrics,
          gates: report.gates,
          samples: report.samples,
        }),
        errorMessage: pass ? undefined : 'Agent V2 Eval Gate 未通过。',
      },
    });
    return {
      id: created.id,
      status: created.status,
      score: created.score,
      totalQuestions,
      p0Questions,
      createdAt: created.createdAt,
    };
  }

  debugExecute(input: {
    question: string;
    role?: 'manager' | 'reception' | 'beautician';
    storeId?: number;
    entrypoint?: string;
    grayMode?: string;
  }) {
    const grayMode = this.normalizeGrayMode(input.grayMode) ?? 'kg_llm_preferred';
    const plan = this.runtime.plan({
      message: input.question,
      actor: {
        storeId: input.storeId ?? 1,
        role: input.role ?? 'manager',
        entrypoint: input.entrypoint ?? 'agent_governance_debug',
        permissions: ['*'],
      },
      context: { debug: true, dryRun: true, agentV2GrayMode: grayMode },
    });
    return this.buildDebugExecuteResult(input, grayMode, plan);
  }

  async debugExecuteAsync(input: {
    question: string;
    role?: 'manager' | 'reception' | 'beautician';
    storeId?: number;
    entrypoint?: string;
    grayMode?: string;
    toolReplay?: boolean;
  }) {
    const grayMode = this.normalizeGrayMode(input.grayMode) ?? 'kg_llm_preferred';
    const storeId = input.storeId ?? 1;
    const role = this.normalizeDebugRole(input.role);
    const plan = await this.runtime.planAsync({
      message: input.question,
      actor: {
        storeId,
        role,
        entrypoint: input.entrypoint ?? 'agent_governance_debug',
        permissions: ['*'],
      },
      context: { debug: true, dryRun: true, agentV2GrayMode: grayMode },
    });
    const debug = this.buildDebugExecuteResult(input, grayMode, plan);
    if (!input.toolReplay) return debug;

    const toolReplay = await this.replayEvalFailureReadOnlyTools({ plan: plan?.plan ?? null }, { storeId, role });
    const contractReplay = this.buildEvalFailureContractReplay(input.question, plan?.plan ?? null, toolReplay.results as AgentToolResult[]);
    const queryReplay = this.buildReadOnlyQueryReplay(toolReplay.results as AgentToolResult[]);
    return {
      ...debug,
      safety: {
        dryRun: true,
        toolExecution: toolReplay.executed,
        readOnlyToolReplay: toolReplay.executed,
        writeExecution: false,
        note: toolReplay.executed
          ? '单题调试已按只读白名单执行查询类工具，仍禁止草稿、审批和写入动作。'
          : '单题调试只生成运行时规划，没有可执行的只读白名单工具。',
      },
      toolReplay,
      queryReplay,
      contractReplay,
    };
  }

  private buildDebugExecuteResult(
    input: {
      question: string;
      role?: 'manager' | 'reception' | 'beautician';
      storeId?: number;
      entrypoint?: string;
      grayMode?: string;
    },
    grayMode: AgentV2GrayMode,
    plan: AgentV2RuntimePlan | null,
  ) {
    const intentTrace = plan?.decision.intent?.trace ?? null;
    const debugContext = this.buildDebugContext(input, grayMode);
    const graphTrace = this.buildDebugGraphTrace(plan);
    const policyTrace = this.buildDebugPolicyTrace(input, plan);
    return {
      question: input.question,
      dryRun: true,
      grayMode,
      debugContext,
      selectedCapabilityId: plan?.decision.selected?.capabilityId ?? null,
      confidence: plan?.decision.confidence ?? 0,
      reason: plan?.decision.reason ?? '未命中能力。',
      plan: plan?.plan ?? null,
      decision: plan?.decision ?? null,
      strategy: plan?.strategy ?? null,
      intentTrace,
      graphTrace,
      llmTrace: this.buildLlmTraceSummary(intentTrace),
      policyTrace,
      replay: this.buildDebugReplay(input, grayMode, plan),
    };
  }

  async debugCompare(input: {
    question: string;
    storeId?: number;
    role?: 'manager' | 'reception' | 'beautician';
    entrypoint?: string;
    compareManifestVersion?: string;
  }) {
    const modes: AgentV2GrayMode[] = ['legacy_regex', 'shadow', 'kg_llm_preferred', 'kg_llm_only'];
    const measuredRuns = modes.map((grayMode) => this.debugExecuteMeasured(input, grayMode));
    const results = Object.fromEntries(measuredRuns.map((run) => [run.mode, run.result]));
    const consistencyRuns = Array.from({ length: 5 }, () => this.debugExecuteMeasured(input, 'kg_llm_preferred'));
    const differences = this.debugDifferences(results, measuredRuns);
    const consistency = this.buildDebugConsistencySummary(consistencyRuns);
    const manifestVersionComparison = await this.buildDebugManifestVersionComparison(
      input,
      results.kg_llm_preferred,
      measuredRuns.find((run) => run.mode === 'kg_llm_preferred')?.summary ?? null,
    );
    const comparisonResults = manifestVersionComparison?.targetResult
      ? { ...results, manifest_version_target: manifestVersionComparison.targetResult }
      : results;
    const combinedDifferences = manifestVersionComparison
      ? { ...differences, manifestVersion: manifestVersionComparison }
      : differences;
    return {
      question: input.question,
      dryRun: true,
      grayMode: 'compare',
      selectedCapabilityId: results.kg_llm_preferred?.selectedCapabilityId ?? null,
      confidence: results.kg_llm_preferred?.confidence ?? 0,
      reason: manifestVersionComparison
        ? '已生成 legacy regex、shadow、kg_llm、5 次一致性和指定 Manifest 版本 dry-run 对比。'
        : '已生成 legacy regex、shadow、kg_llm 和 5 次一致性 dry-run 对比。',
      debugContext: results.kg_llm_preferred?.debugContext ?? null,
      current: results.kg_llm_preferred,
      legacyRegex: results.legacy_regex,
      modes: comparisonResults,
      comparison: {
        manifestVersions: {
          active: this.manifestProvider.getActiveVersion() ?? 'builtin',
          target: manifestVersionComparison?.targetVersion ?? null,
          targetAvailable: manifestVersionComparison?.targetAvailable ?? null,
          selectedByMode: Object.fromEntries(measuredRuns.map((run) => [
            run.mode,
            run.summary.selectedManifestVersion ?? run.summary.activeManifestVersion ?? 'builtin',
          ])),
          selectedByVersion: manifestVersionComparison ? {
            active: manifestVersionComparison.active?.selectedManifestVersion ?? manifestVersionComparison.active?.activeManifestVersion ?? null,
            target: manifestVersionComparison.target?.selectedManifestVersion ?? manifestVersionComparison.target?.activeManifestVersion ?? null,
          } : undefined,
          changedAcrossModes: differences.changedManifestVersion || Boolean(manifestVersionComparison?.changedManifestVersion),
        },
        graphContext: {
          withGraphMode: 'kg_llm_only',
          withoutGraphMode: 'legacy_regex',
          withGraph: measuredRuns.find((run) => run.mode === 'kg_llm_only')?.summary ?? null,
          withoutGraph: measuredRuns.find((run) => run.mode === 'legacy_regex')?.summary ?? null,
        },
        legacyVsKgLlm: {
          legacy: measuredRuns.find((run) => run.mode === 'legacy_regex')?.summary ?? null,
          kgLlm: measuredRuns.find((run) => run.mode === 'kg_llm_only')?.summary ?? null,
          changedCapability: differences.changedCapability,
          changedOutputShape: differences.changedOutputShape,
          changedEvidence: differences.changedEvidence,
        },
        consistency,
        manifestVersionComparison,
        differences: combinedDifferences,
        verdict: this.buildDebugCompareVerdict(combinedDifferences, consistency),
      },
      differences: combinedDifferences,
      note: '对比结果仅生成 dry-run 计划，不执行真实工具和写入动作。',
    };
  }

  private async buildDebugManifestVersionComparison(
    input: {
      question: string;
      storeId?: number;
      role?: 'manager' | 'reception' | 'beautician';
      entrypoint?: string;
      compareManifestVersion?: string;
    },
    activeResult: any,
    activeSummary: any,
  ) {
    const requestedVersion = this.optionalText(input.compareManifestVersion);
    if (!requestedVersion) return null;

    const snapshot = await this.manifestProvider.listManifestsForVersion(requestedVersion);
    const grayMode: AgentV2GrayMode = 'kg_llm_preferred';
    const basePlan = this.debugRuntimePlanFromResult(activeResult);
    const targetPlan = snapshot.found
      ? this.buildManifestVersionOverlayPlan(input, grayMode, basePlan, snapshot)
      : null;
    const targetDebug = {
      ...this.buildDebugExecuteResult(input, grayMode, targetPlan),
      reason: snapshot.found
        ? targetPlan?.decision.reason ?? '指定 Manifest 版本未命中可执行能力。'
        : snapshot.reason ?? '指定 Manifest 版本不可用。',
    };
    targetDebug.debugContext = {
      ...targetDebug.debugContext,
      manifestVersion: snapshot.version ?? requestedVersion,
      activeManifestVersion: this.manifestProvider.getActiveVersion(),
      manifestVersionSource: snapshot.source,
    };
    const active = activeSummary ?? this.summarizeDebugCompareResult('active_manifest', activeResult, 0);
    const target = this.summarizeDebugCompareResult('manifest_version_target', targetDebug, 0);
    const activeIds = new Set(this.manifestProvider.listManifests().map((manifest) => manifest.capabilityId));
    const targetIds = new Set(snapshot.manifests.map((manifest) => manifest.capabilityId));
    const addedCapabilities = Array.from(targetIds).filter((capabilityId) => !activeIds.has(capabilityId)).slice(0, 20);
    const removedCapabilities = Array.from(activeIds).filter((capabilityId) => !targetIds.has(capabilityId)).slice(0, 20);
    const changedOutputKinds = this.debugSignature(active.outputShape?.requiredKinds) !== this.debugSignature(target.outputShape?.requiredKinds);
    return {
      requestedVersion,
      activeVersion: this.manifestProvider.getActiveVersion() ?? 'builtin',
      targetVersion: snapshot.version ?? requestedVersion,
      targetAvailable: snapshot.found,
      targetStatus: snapshot.status ?? null,
      source: snapshot.source,
      itemCount: snapshot.itemCount,
      active,
      target,
      targetResult: targetDebug,
      changedManifestVersion: (active.selectedManifestVersion ?? active.activeManifestVersion ?? 'builtin') !== (target.selectedManifestVersion ?? snapshot.version ?? requestedVersion),
      changedCapability: active.selectedCapabilityId !== target.selectedCapabilityId,
      changedOutputShape: changedOutputKinds,
      changedEvidence: this.debugSignature(active.evidence?.queryKeys) !== this.debugSignature(target.evidence?.queryKeys),
      addedCapabilities,
      removedCapabilities,
      reason: snapshot.reason ?? null,
      note: '指定版本对比只在本次调试中使用目标 Manifest 快照，不激活版本、不刷新 Runtime 全局 active Manifest。',
    };
  }

  private buildManifestVersionOverlayPlan(
    input: { question: string; storeId?: number; role?: 'manager' | 'reception' | 'beautician'; entrypoint?: string },
    grayMode: AgentV2GrayMode,
    basePlan: AgentV2RuntimePlan | null,
    snapshot: AgentV2ManifestVersionSnapshot,
  ) {
    const manifest = this.selectManifestForVersionCompare(input.question, basePlan, snapshot.manifests);
    if (!manifest) return null;
    return this.buildSimulatedPlan(
      input,
      grayMode,
      basePlan,
      {
        ...manifest,
        version: snapshot.version ?? manifest.version,
      },
      'manifest_version_compare',
    );
  }

  private selectManifestForVersionCompare(
    question: string,
    basePlan: AgentV2RuntimePlan | null,
    manifests: AgentV2CapabilityManifest[],
  ) {
    const manifestById = new Map(manifests.map((manifest) => [manifest.capabilityId, manifest]));
    const candidateIds = this.uniqueDebugCandidates([
      ...this.debugStringList(basePlan?.decision.intent?.candidateCapabilities).map((capabilityId, index) => ({
        capabilityId,
        score: 1 - index * 0.05,
        reason: 'structured_intent_candidate',
      })),
      ...(basePlan?.decision.selected?.capabilityId ? [{
        capabilityId: basePlan.decision.selected.capabilityId,
        score: 0.9,
        reason: 'active_selected_capability',
      }] : []),
    ]).map((candidate) => candidate.capabilityId);
    const normalizedQuestion = this.normalizeDebugText(question);
    for (const capabilityId of candidateIds) {
      const manifest = manifestById.get(capabilityId);
      if (!manifest) continue;
      if (manifest.status !== 'enabled') continue;
      const negativeMatched = this.debugStringList(manifest.negativeExamples).some((example) => this.includesNormalized(normalizedQuestion, example));
      if (!negativeMatched) return manifest;
    }
    return null;
  }

  private debugRuntimePlanFromResult(result: any): AgentV2RuntimePlan | null {
    if (!result?.plan || !result?.decision) return null;
    return {
      plan: result.plan as AgentPlan,
      decision: result.decision as AgentV2CapabilityDecision,
      strategy: (result.strategy ?? {
        mode: 'kg_llm_preferred',
        engine: 'kg_llm',
        source: 'debug_compare',
        finalEngine: 'kg_llm',
        reason: 'manifest_version_compare',
        allowLegacyFallback: true,
        recordShadow: false,
        legacyRetired: false,
      }) as AgentV2RuntimePlan['strategy'],
    };
  }

  simulateManifest(input: {
    question: string;
    storeId?: number;
    role?: 'manager' | 'reception' | 'beautician';
    entrypoint?: string;
    grayMode?: string;
    capabilityId?: string;
    enabled?: boolean;
    triggerKeywords?: string[];
    negativeExamples?: string[];
    outputKinds?: string[];
  }) {
    const grayMode = this.normalizeGrayMode(input.grayMode) ?? 'kg_llm_preferred';
    const basePlan = this.runtime.plan({
      message: input.question,
      actor: {
        storeId: input.storeId ?? 1,
        role: input.role ?? 'manager',
        entrypoint: input.entrypoint ?? 'agent_governance_debug',
        permissions: ['*'],
      },
      context: { debug: true, dryRun: true, agentV2GrayMode: grayMode },
    });
    const simulation = this.buildManifestSimulation(input, grayMode, basePlan);
    const debug = this.buildDebugExecuteResult(input, grayMode, simulation.plan ?? basePlan);
    return {
      ...debug,
      simulation: simulation.meta,
    };
  }

  private buildManifestSimulation(
    input: {
      question: string;
      storeId?: number;
      role?: 'manager' | 'reception' | 'beautician';
      entrypoint?: string;
      capabilityId?: string;
      enabled?: boolean;
      triggerKeywords?: string[];
      negativeExamples?: string[];
      outputKinds?: string[];
    },
    grayMode: AgentV2GrayMode,
    basePlan: AgentV2RuntimePlan | null,
  ) {
    const activeVersion = this.manifestProvider.getActiveVersion() ?? 'builtin';
    const capabilityId = this.optionalText(input.capabilityId) ?? basePlan?.decision.selected?.capabilityId ?? null;
    const baseSelectedCapabilityId = basePlan?.decision.selected?.capabilityId ?? null;
    if (!capabilityId) {
      return {
        plan: basePlan,
        meta: {
          activeManifestVersion: activeVersion,
          temporaryOnly: true,
          applied: false,
          reason: '没有可模拟的 capabilityId。',
          note: '当前模拟仅在本次调试上下文中生效，未修改 active Manifest。',
        },
      };
    }

    const selectedManifest = basePlan?.decision.selected?.capabilityId === capabilityId ? basePlan.decision.selected : null;
    const providerManifest = this.manifestProvider.listManifests().find((item) => item.capabilityId === capabilityId) ?? null;
    const baseManifest = selectedManifest ?? providerManifest;
    if (!baseManifest) {
      return {
        plan: basePlan,
        meta: {
          activeManifestVersion: activeVersion,
          temporaryOnly: true,
          applied: false,
          capabilityId,
          reason: '当前 active Manifest 中找不到该能力，无法做本地模拟。',
          formalEditUrl: `/system/agent-capabilities?capabilityId=${encodeURIComponent(capabilityId)}`,
          note: '当前模拟未修改 active Manifest。',
        },
      };
    }

    const patch = {
      enabled: typeof input.enabled === 'boolean' ? input.enabled : undefined,
      triggerKeywords: this.debugStringList(input.triggerKeywords),
      negativeExamples: this.debugStringList(input.negativeExamples),
      outputKinds: this.debugStringList(input.outputKinds),
    };
    const changedFields = [
      typeof patch.enabled === 'boolean' ? 'status' : '',
      patch.triggerKeywords.length ? 'triggerKeywords' : '',
      patch.negativeExamples.length ? 'negativeExamples' : '',
      patch.outputKinds.length ? 'outputKinds' : '',
    ].filter(Boolean);
    const baseTriggerKeywords = this.debugStringList(baseManifest.triggerKeywords);
    const baseNegativeExamples = this.debugStringList(baseManifest.negativeExamples);
    const baseOutputKinds = this.debugStringList(baseManifest.outputKinds);
    const simulatedManifest: AgentV2CapabilityManifest = {
      ...baseManifest,
      status: patch.enabled === false ? 'disabled' : patch.enabled === true ? 'enabled' : baseManifest.status,
      triggerKeywords: patch.triggerKeywords.length ? Array.from(new Set([...baseTriggerKeywords, ...patch.triggerKeywords])) : baseTriggerKeywords,
      negativeExamples: patch.negativeExamples.length ? patch.negativeExamples : baseNegativeExamples,
      outputKinds: patch.outputKinds.length ? patch.outputKinds : baseOutputKinds,
    };
    const normalizedQuestion = this.normalizeDebugText(input.question);
    const triggerMatched = simulatedManifest.triggerKeywords.some((keyword) => this.includesNormalized(normalizedQuestion, keyword));
    const negativeMatched = simulatedManifest.negativeExamples.some((example) => this.includesNormalized(normalizedQuestion, example));
    const shouldExclude = simulatedManifest.status !== 'enabled' || negativeMatched;
    const shouldForceSelect = !shouldExclude && (
      triggerMatched ||
      patch.enabled === true ||
      (patch.outputKinds.length > 0 && baseSelectedCapabilityId === capabilityId)
    );
    const hasExecutableManifest = Boolean(
      (simulatedManifest as Partial<AgentV2CapabilityManifest>).executor?.tool &&
      Array.isArray((simulatedManifest as Partial<AgentV2CapabilityManifest>).actions) &&
      (simulatedManifest as Partial<AgentV2CapabilityManifest>).actions?.length,
    );
    const plan = shouldExclude
      ? this.debugPlanWithExcluded(input, grayMode, capabilityId)
      : shouldForceSelect && hasExecutableManifest
        ? this.buildSimulatedPlan(input, grayMode, basePlan, simulatedManifest, triggerMatched ? 'temporary_trigger_keyword_matched' : 'temporary_manifest_overlay_selected')
        : basePlan;

    return {
      plan,
      meta: {
        activeManifestVersion: activeVersion,
        temporaryOnly: true,
        applied: changedFields.length > 0,
        capabilityId,
        baseSelectedCapabilityId,
        simulatedSelectedCapabilityId: plan?.decision.selected?.capabilityId ?? null,
        changedFields,
        patch,
        triggerMatched,
        negativeMatched,
        effect: shouldExclude
          ? 'excluded_by_temporary_manifest'
          : shouldForceSelect && hasExecutableManifest
            ? 'selected_by_temporary_manifest'
            : shouldForceSelect
              ? 'manifest_missing_executor'
              : 'no_selection_change',
        formalEditUrl: `/system/agent-capabilities?capabilityId=${encodeURIComponent(capabilityId)}`,
        note: 'Manifest 模拟仅在本次调试 session 生效，未写入草稿、未发布版本、未修改 active Manifest。',
      },
    };
  }

  private debugPlanWithExcluded(
    input: { question: string; storeId?: number; role?: 'manager' | 'reception' | 'beautician'; entrypoint?: string },
    grayMode: AgentV2GrayMode,
    capabilityId: string,
  ) {
    const plan = this.runtime.plan({
      message: input.question,
      actor: {
        storeId: input.storeId ?? 1,
        role: input.role ?? 'manager',
        entrypoint: input.entrypoint ?? 'agent_governance_debug',
        permissions: ['*'],
      },
      context: {
        debug: true,
        dryRun: true,
        agentV2GrayMode: grayMode,
        agentV2ContractRetry: { excludedCapabilityIds: [capabilityId] },
      },
    });
    if (plan?.decision.selected?.capabilityId !== capabilityId) return plan;
    return {
      ...plan,
      decision: {
        ...plan.decision,
        selected: null,
        confidence: 0,
        reason: `Manifest 模拟已在本次调试中临时排除 ${capabilityId}。`,
        candidates: (plan.decision.candidates ?? []).filter((candidate) => candidate.capabilityId !== capabilityId),
        excluded: this.uniqueDebugCandidates([
          ...(plan.decision.excluded ?? []),
          { capabilityId, score: 0, reason: 'temporary_manifest_excluded' },
        ]),
        outputIntent: 'answer_text' as AgentV2CapabilityDecision['outputIntent'],
        toolPlan: [],
      },
      plan: {
        ...plan.plan,
        goal: 'Manifest 模拟临时排除能力',
        toolPlan: [],
        confidence: 0,
        clarificationNeeded: true,
        capabilityPlan: {
          capabilityId,
          reason: 'temporary_manifest_excluded',
        },
        outputContract: {
          requiredKinds: ['summary_text'],
          preferredKinds: ['summary_text'],
          evidenceRequired: false,
          maxFollowUps: 1,
        },
      } as any,
    };
  }

  private buildSimulatedPlan(
    input: { question: string; storeId?: number; role?: 'manager' | 'reception' | 'beautician'; entrypoint?: string },
    grayMode: AgentV2GrayMode,
    basePlan: AgentV2RuntimePlan | null,
    manifest: AgentV2CapabilityManifest,
    reason: string,
  ): AgentV2RuntimePlan {
    const toolPlan: AgentToolPlanItem[] = [{
      tool: manifest.executor.tool,
      args: {
        question: input.question,
        capabilityId: manifest.capabilityId,
        queryKey: manifest.executor.queryKey,
        filters: {},
      },
    }];
    const outputIntent: AgentV2CapabilityDecision['outputIntent'] = manifest.outputKinds.includes('chart')
      ? 'show_chart'
      : manifest.outputKinds.includes('table')
        ? 'show_table'
        : manifest.outputKinds.includes('action_card')
          ? 'confirm_action'
          : manifest.outputKinds.includes('kpi')
            ? 'show_kpi'
            : 'answer_text';
    const decision = {
      selected: manifest,
      confidence: Math.max(basePlan?.decision.confidence ?? 0.86, 0.86),
      reason: `Manifest 模拟命中：${manifest.displayName}（${reason}）。`,
      candidates: this.uniqueDebugCandidates([
        { capabilityId: manifest.capabilityId, score: 0.96, reason },
        ...(basePlan?.decision.candidates ?? []),
      ]),
      excluded: basePlan?.decision.excluded ?? [],
      outputIntent,
      toolPlan,
      boundaryWarnings: basePlan?.decision.boundaryWarnings ?? [],
      intent: basePlan?.decision.intent,
    };
    const strategy = basePlan?.strategy ?? {
      mode: grayMode,
      engine: grayMode === 'legacy_regex' ? 'legacy_regex' : grayMode === 'shadow' ? 'shadow' : 'kg_llm',
      source: 'context',
      finalEngine: grayMode === 'legacy_regex' ? 'legacy_regex' : 'kg_llm',
      reason: 'manifest_simulation_context',
      allowLegacyFallback: grayMode === 'kg_llm_preferred',
      recordShadow: grayMode === 'shadow',
      legacyRetired: grayMode === 'legacy_retired',
    };
    const plan: AgentPlan = {
      intentType: manifest.actions.includes('draft') ? 'draft' : 'query',
      goal: manifest.displayName,
      toolPlan,
      confidence: decision.confidence,
      clarificationNeeded: false,
      executionPath: 'fast',
      businessTask: {
        architecture: 'agent_v2_manifest_simulation',
        question: input.question,
        domain: manifest.domain,
        businessObject: manifest.businessObject,
        eventTypes: manifest.eventTypes ?? [],
        sourceModels: manifest.sourceModels,
        releaseStrategy: manifest.releaseStrategy,
        boundaryWarnings: decision.boundaryWarnings,
        agentV2GrayStrategy: strategy,
        engineVersion: grayMode,
      } as any,
      capabilityPlan: {
        capabilityId: manifest.capabilityId,
        reason: decision.reason,
      },
      outputContract: {
        requiredKinds: manifest.outputKinds,
        preferredKinds: manifest.outputKinds,
        evidenceRequired: manifest.outputKinds.includes('evidence_panel'),
        maxFollowUps: 2,
      },
    };
    return { plan, decision, strategy };
  }

  private uniqueDebugCandidates(candidates: Array<{ capabilityId: string; score: number; reason: string }>) {
    const seen = new Set<string>();
    return candidates.filter((candidate) => {
      if (seen.has(candidate.capabilityId)) return false;
      seen.add(candidate.capabilityId);
      return true;
    });
  }

  private mapKnowledgeGraphOverride(item: any) {
    return {
      id: Number(item.id),
      overrideType: item.overrideType,
      relationType: item.relationType,
      sourceNodeId: item.sourceNodeId ?? null,
      targetNodeId: item.targetNodeId ?? null,
      value: item.value ?? null,
      label: item.label ?? null,
      reason: item.reason ?? null,
      status: item.status,
      source: item.source ?? 'manual_override',
      confidence: this.toNullableNumber(item.confidence) ?? 1,
      payload: item.payloadJson ?? null,
      createdBy: item.createdBy ?? null,
      createdAt: this.toIsoString(item.createdAt),
      updatedAt: this.toIsoString(item.updatedAt),
      nextGraphMerge: 'kg:generate',
    };
  }

  private mapGrayRule(item: any) {
    const scope = {
      storeIds: this.numberList(item.storeIds),
      personaCodes: this.textList(item.personaCodes),
      roles: this.textList(item.roles),
      entrypoints: this.textList(item.entrypoints),
      capabilityIds: this.textList(item.capabilityIds),
    };
    return {
      id: Number(item.id),
      name: item.name,
      mode: item.mode,
      status: item.status,
      priority: Number(item.priority ?? 100),
      ...scope,
      scopeSummary: this.grayRuleScopeSummary(scope),
      reason: item.reason ?? null,
      source: item.source ?? 'governance_config',
      payload: item.payloadJson ?? null,
      createdBy: item.createdBy ?? null,
      updatedBy: item.updatedBy ?? null,
      deletedBy: item.deletedBy ?? null,
      createdAt: this.toIsoString(item.createdAt),
      updatedAt: this.toIsoString(item.updatedAt),
      nextRuntimeRefresh: 'agent_v2_gray_strategy_cache',
    };
  }

  private requireKnowledgeGraphNode(id: string) {
    const node = AGENT_V2_KNOWLEDGE_GRAPH_SNAPSHOT.nodes.find((item) => item.id === id);
    if (!node) throw new NotFoundException(`Knowledge graph node not found: ${id}`);
    return node;
  }

  private requiredText(value: unknown, field: string) {
    const text = String(value ?? '').trim();
    if (!text) throw new BadRequestException(`${field} is required`);
    return text;
  }

  private requiredGrayMode(value: unknown): AgentV2GrayMode {
    const mode = String(value ?? '').trim();
    if (!isGrayMode(mode)) throw new BadRequestException('mode must be one of legacy_regex, shadow, kg_llm_preferred, kg_llm_only, legacy_retired');
    return mode;
  }

  private assertGrayRuleCreationAllowed(mode: AgentV2GrayMode) {
    if (mode !== 'legacy_retired') return;
    if (!this.isProductionRuntime()) return;
    if (this.isTruthy(process.env.AGENT_V2_LEGACY_RETIREMENT_CONFIRMED)) return;
    throw new BadRequestException('生产 legacy_retired 灰度规则需要先设置 AGENT_V2_LEGACY_RETIREMENT_CONFIRMED=true。');
  }

  private optionalText(value: unknown) {
    const text = String(value ?? '').trim();
    return text || undefined;
  }

  private textList(value: unknown): string[] {
    if (!Array.isArray(value)) return [];
    return Array.from(new Set(value.map((item) => String(item ?? '').trim()).filter(Boolean)));
  }

  private numberList(value: unknown): number[] {
    if (!Array.isArray(value)) return [];
    return Array.from(new Set(value.map((item) => Number(item)).filter((item) => Number.isFinite(item))));
  }

  private grayRuleScopeSummary(scope: {
    storeIds: number[];
    personaCodes: string[];
    roles: string[];
    entrypoints: string[];
    capabilityIds: string[];
  }) {
    const parts = [
      scope.storeIds.length ? `门店 ${scope.storeIds.join(',')}` : '',
      scope.personaCodes.length ? `persona ${scope.personaCodes.join(',')}` : '',
      scope.roles.length ? `角色 ${scope.roles.join(',')}` : '',
      scope.entrypoints.length ? `入口 ${scope.entrypoints.join(',')}` : '',
      scope.capabilityIds.length ? `能力 ${scope.capabilityIds.join(',')}` : '',
    ].filter(Boolean);
    return parts.length ? parts.join('；') : '全局';
  }

  private clampConfidence(value: unknown) {
    const confidence = Number(value ?? 1);
    if (!Number.isFinite(confidence)) return 1;
    return Math.max(0, Math.min(1, confidence));
  }

  private toIsoString(value: unknown) {
    if (!value) return null;
    const date = new Date(value as any);
    return Number.isNaN(date.getTime()) ? String(value) : date.toISOString();
  }

  private get agentRun() {
    return this.delegate('agentRun');
  }

  private delegate(name: string): any {
    const delegate = (this.prisma as any)[name];
    if (!delegate) throw new Error(`Prisma delegate ${name} is unavailable.`);
    return delegate;
  }

  private optionalDelegate(name: string): any | null {
    return (this.prisma as any)[name] ?? null;
  }

  private readEvalDrafts(): GovernanceEvalCase[] {
    const drafts = this.readJson(DEFAULT_EVAL_DRAFT_REPORT).drafts ?? [];
    return drafts.map((item: any) => this.normalizeEvalDraft(item));
  }

  private async listPersistedEvalCases(): Promise<GovernanceEvalCase[]> {
    const delegate = this.optionalDelegate('agentEvalCase');
    if (!delegate?.findMany) return [];
    const rows = await delegate.findMany({
      where: { status: { not: 'deleted' } },
      orderBy: { updatedAt: 'desc' },
      take: 500,
    });
    return (rows ?? []).map((item: any) => this.mapEvalCase(item));
  }

  private mapEvalCase(item: any): GovernanceEvalCase {
    const outcome = this.asObject(item.expectedOutcome) ?? {};
    const expectedCapabilityId = item.expectedTool ? String(item.expectedTool) : undefined;
    return {
      id: String(item.id),
      source: 'agent_eval_cases',
      question: String(item.input ?? ''),
      roleGroup: String(item.role ?? ''),
      expectedCapabilityId,
      expectedIntent: outcome.expectedIntent ? String(outcome.expectedIntent) : undefined,
      expectedObjects: Array.isArray(outcome.expectedObjects)
        ? outcome.expectedObjects.map(String)
        : this.expectedObjectsFromCapability(expectedCapabilityId),
      expectedPersonaCodes: Array.isArray(outcome.expectedPersonaCodes) ? outcome.expectedPersonaCodes.map(String) : undefined,
      expectedOutputKinds: Array.isArray(outcome.expectedOutputKinds) ? outcome.expectedOutputKinds.map(String) : undefined,
      evidenceRequired: this.normalizeEvidenceRequiredOutput(outcome.evidenceRequired, outcome.expectedOutputKinds),
      permissionProfile: this.permissionProfileFor(outcome.permissionProfile, outcome.permissionResult),
      unsupportedAllowed: this.unsupportedAllowedFor(outcome.unsupportedAllowed, expectedCapabilityId, outcome.failureCategory),
      permissionResult: outcome.permissionResult ? String(outcome.permissionResult) : undefined,
      contractResult: outcome.contractResult ? String(outcome.contractResult) : undefined,
      failureCategory: outcome.failureCategory ? String(outcome.failureCategory) : undefined,
      priority: outcome.priority ? String(outcome.priority) : 'P2',
    };
  }

  private normalizeEvalDraft(item: any): GovernanceEvalCase {
    const expectedCapabilityId = this.optionalText(item.expectedCapabilityId);
    return {
      id: String(item.id),
      source: this.optionalText(item.source) ?? DEFAULT_EVAL_DRAFT_REPORT,
      question: String(item.question ?? item.input ?? ''),
      roleGroup: this.optionalText(item.roleGroup ?? item.role),
      priority: this.optionalText(item.priority) ?? 'P2',
      expectedCapabilityId,
      expectedIntent: this.optionalText(item.expectedIntent),
      expectedObjects: Array.isArray(item.expectedObjects)
        ? item.expectedObjects.map(String)
        : this.expectedObjectsFromCapability(expectedCapabilityId),
      expectedPersonaCodes: Array.isArray(item.expectedPersonaCodes) ? item.expectedPersonaCodes.map(String) : undefined,
      expectedOutputKinds: Array.isArray(item.expectedOutputKinds) ? item.expectedOutputKinds.map(String) : undefined,
      evidenceRequired: this.normalizeEvidenceRequiredOutput(item.evidenceRequired, item.expectedOutputKinds),
      permissionProfile: this.permissionProfileFor(item.permissionProfile, item.permissionResult),
      unsupportedAllowed: this.unsupportedAllowedFor(item.unsupportedAllowed, expectedCapabilityId, item.failureCategory),
      permissionResult: this.optionalText(item.permissionResult),
      contractResult: this.optionalText(item.contractResult),
      failureCategory: this.optionalText(item.failureCategory),
    };
  }

  private normalizeEvidenceRequiredInput(value: unknown) {
    if (typeof value === 'boolean') return value;
    return Array.isArray(value) ? value.map(String).filter(Boolean) : undefined;
  }

  private normalizeEvidenceRequiredOutput(value: unknown, outputKinds: unknown) {
    if (typeof value === 'boolean') return value;
    if (Array.isArray(value)) return value.map(String).filter(Boolean);
    return Array.isArray(outputKinds) && outputKinds.map(String).includes('evidence_panel');
  }

  private permissionProfileFor(value: unknown, permissionResult: unknown) {
    const explicit = this.optionalText(value);
    if (explicit) return explicit;
    const result = this.optionalText(permissionResult) ?? 'needs_review';
    if (result === 'allow') return 'authorized_manager';
    if (result === 'deny') return 'unauthorized_actor';
    return `permission_${result}`;
  }

  private unsupportedAllowedFor(value: unknown, expectedCapabilityId?: string, failureCategory?: unknown) {
    if (typeof value === 'boolean') return value;
    if (expectedCapabilityId?.endsWith('.unmapped.eval_candidate')) return true;
    return this.optionalText(failureCategory) === '能力缺失';
  }

  private expectedObjectsFromCapability(capabilityId?: string) {
    const value = capabilityId ?? '';
    const objects: string[] = [];
    const push = (item: string) => {
      if (!objects.includes(item)) objects.push(item);
    };
    if (/finance|settlement|payment|refund|commission|margin|revenue/.test(value)) push('Finance');
    if (/order|cashier/.test(value)) push('Order');
    if (/card|package|usage/.test(value)) push('Card');
    if (/customer|coupon/.test(value)) push('Customer');
    if (/inventory|stock|product|bom/.test(value)) push('Inventory');
    if (/staff|beautician/.test(value)) push('Staff');
    if (/marketing|promotion|campaign/.test(value)) push('Marketing');
    if (!objects.length && value) push(value.split('.')[0] ?? 'Unknown');
    return objects.length ? objects : undefined;
  }

  private normalizeEvalRunResult(value: unknown): Record<string, any> {
    const result = this.asObject(value) as Record<string, any> | null;
    if (!result) return {};
    if (result.summary || result.metrics || result.gates || result.samples) return result;
    const nested = this.asObject(result.report) as Record<string, any> | null;
    return nested ?? result;
  }

  private extractEvalRunFailures(result: Record<string, any>, errorMessage?: string | null) {
    const failures: Array<Record<string, unknown>> = [];
    const gates = Array.isArray(result.gates) ? result.gates : [];
    for (const gate of gates) {
      if (gate?.pass === false) {
        failures.push({
          type: 'gate_failed',
          category: 'gate_failed',
          title: gate.gate ?? '评测门禁失败',
          expected: gate.expected ?? '',
          actual: gate.actual ?? '',
          severity: gate.level ?? 'p0',
        });
      }
    }

    const samples = this.asObject(result.samples) ?? {};
    const failureSampleKeys = [
      'p0Unmapped',
      'p0PermissionNeedsReview',
      'p0ContractNotPass',
      'p0WrongRouteRisk',
      'runtimeMismatches',
      'runtimeUnstable',
      'highRiskAutoPublish',
      'unauthorizedEvidence',
    ];
    for (const key of failureSampleKeys) {
      const rows = samples[key];
      if (!Array.isArray(rows)) continue;
      rows.forEach((row, index) => {
        const item = (this.asObject(row) ?? { value: row }) as Record<string, any>;
        failures.push({
          type: 'sample_failed',
          category: key,
          index,
          id: item.id ?? item.caseId ?? null,
          question: item.question ?? item.input ?? '',
          expectedCapabilityId: item.expectedCapabilityId ?? null,
          actualCapabilityId: item.actualCapabilityId ?? item.capabilityId ?? item.kgCapabilityId ?? null,
          reason: item.reason ?? item.error ?? key,
          sample: item,
        });
      });
    }

    if (errorMessage && !failures.length) {
      failures.push({
        type: 'run_failed',
        category: 'run_failed',
        title: '评测运行失败',
        reason: errorMessage,
      });
    }
    return failures;
  }

  private findEvalRunFailure(failures: Array<Record<string, unknown>>, input: { category?: string; index?: number; failureId?: string | number }) {
    const failureId = this.optionalText(input.failureId);
    if (failureId) {
      return failures.find((failure) => {
        const sample = this.asObject(failure.sample);
        return String(failure.id ?? '') === failureId || String(sample?.id ?? sample?.caseId ?? '') === failureId;
      }) ?? null;
    }

    const category = this.optionalText(input.category);
    const candidates = category && category !== 'all'
      ? failures.filter((failure) => failure.category === category)
      : failures;
    if (!candidates.length) return null;

    const requestedIndex = Number(input.index);
    if (Number.isFinite(requestedIndex)) {
      return candidates.find((failure) => Number(failure.index) === requestedIndex) ?? candidates[requestedIndex] ?? null;
    }
    return candidates.find((failure) => failure.type === 'sample_failed') ?? candidates[0] ?? null;
  }

  private evalFailureReplayDiagnosis(
    failure: Record<string, unknown>,
    comparison: { expectedCapabilityId: string | null; previousActualCapabilityId: string | null; replayCapabilityId: string | null },
  ) {
    if (!comparison.expectedCapabilityId) {
      return {
        category: failure.category ?? 'unknown',
        status: 'needs_case_metadata',
        message: '该失败样例缺少 expectedCapabilityId，无法自动判断回放是否修复。',
      };
    }
    if (comparison.replayCapabilityId === comparison.expectedCapabilityId) {
      return {
        category: failure.category ?? 'unknown',
        status: 'replay_matched_expected',
        message: '当前运行时 dry-run 已命中预期能力，可继续用真实评测或 shadow 数据确认稳定性。',
      };
    }
    if (!comparison.replayCapabilityId) {
      return {
        category: failure.category ?? 'unknown',
        status: 'still_unmapped',
        message: '当前运行时 dry-run 仍未命中能力，优先检查图谱同义词、能力映射和 Manifest 触发条件。',
      };
    }
    if (comparison.previousActualCapabilityId && comparison.replayCapabilityId !== comparison.previousActualCapabilityId) {
      return {
        category: failure.category ?? 'unknown',
        status: 'route_changed_but_not_expected',
        message: '当前回放路由已不同于原失败结果，但仍未命中预期能力，需要继续校准负例、候选能力优先级或互斥规则。',
      };
    }
    return {
      category: failure.category ?? 'unknown',
      status: 'still_wrong_route',
      message: '当前运行时 dry-run 仍命中非预期能力，优先检查 Manifest 触发词、negativeExamples 和 KG 互斥边界。',
    };
  }

  private replayEvalFailureToolsNotRequested() {
    return {
      requested: false,
      executed: false,
      mode: 'planning_only',
      allowedTools: Array.from(READ_ONLY_EVAL_REPLAY_TOOLS),
      skipped: [],
      results: [],
    };
  }

  private async replayEvalFailureReadOnlyTools(
    debug: { plan?: { toolPlan?: AgentToolPlanItem[] } | null },
    context: { storeId: number; role: AgentRole },
  ) {
    const toolPlan = Array.isArray(debug.plan?.toolPlan) ? debug.plan.toolPlan : [];
    const skipped: Array<{ tool: string; reason: string }> = [];
    const results: Array<{
      tool: string;
      args: Record<string, unknown>;
      status: AgentToolResult['status'];
      title: string;
      summary: string;
      data?: unknown;
      evidence?: AgentToolResult['evidence'];
      actions?: AgentToolResult['actions'];
    }> = [];

    for (const item of toolPlan) {
      if (!READ_ONLY_EVAL_REPLAY_TOOLS.has(item.tool)) {
        skipped.push({ tool: item.tool, reason: 'not_in_read_only_replay_whitelist' });
        continue;
      }
      const definition = this.runtime.getTool(item.tool);
      if (!definition || definition.riskLevel !== 'low' || definition.requiresApproval) {
        skipped.push({ tool: item.tool, reason: 'tool_definition_not_low_risk_read_only' });
        continue;
      }
      try {
        const result = await this.runtime.executeTool(item.tool, item.args ?? {}, {
          runId: 0,
          storeId: context.storeId,
          role: context.role,
        });
        results.push({
          tool: item.tool,
          args: item.args ?? {},
          status: result.status,
          title: result.title,
          summary: this.maskSensitiveDebugText(result.summary),
          data: this.redactSensitiveDebugValue(result.data),
          evidence: this.redactSensitiveDebugValue(result.evidence) as AgentToolResult['evidence'],
          actions: this.redactSensitiveDebugValue(result.actions) as AgentToolResult['actions'],
        });
      } catch (error) {
        skipped.push({ tool: item.tool, reason: error instanceof Error ? error.message : 'read_only_tool_replay_failed' });
      }
    }

    return {
      requested: true,
      executed: results.length > 0,
      mode: 'read_only_whitelist',
      allowedTools: Array.from(READ_ONLY_EVAL_REPLAY_TOOLS),
      skipped,
      results,
      note: results.length
        ? '仅执行低风险只读白名单工具，未执行草稿、审批或写入动作。'
        : '当前回放没有可执行的只读白名单工具。',
    };
  }

  private evalFailureContractReplayNotRequested() {
    return {
      requested: false,
      executed: false,
      reason: 'tool_replay_not_requested',
      answer: null,
      renderedBlocks: [],
      answerContract: null,
      phaseOutputs: [],
    };
  }

  private queryReplayNotRequested() {
    return {
      requested: false,
      available: false,
      reason: 'tool_replay_not_requested',
      source: 'planning_only',
      toolCount: 0,
      queryTraces: [],
      sqlSummaries: [],
    };
  }

  private buildReadOnlyQueryReplay(toolResults: AgentToolResult[]) {
    const dataValues = toolResults.map((result) => result.data);
    const evidenceQueryTraces = toolResults.flatMap((result) => Array.isArray(result.evidence?.queryTraces) ? result.evidence.queryTraces : []);
    const evidenceSqlSummaries = toolResults.flatMap((result) => Array.isArray(result.evidence?.sqlSummaries) ? result.evidence.sqlSummaries : []);
    const queryTraces = this.uniqueObjects([
      ...evidenceQueryTraces,
      ...this.findObjectsByKeyDeep(dataValues, 'queryTrace', 20),
    ]).slice(0, 20);
    const sqlSummaries = this.uniqueObjects([
      ...evidenceSqlSummaries,
      ...this.findObjectsByKeyDeep(dataValues, 'sqlSummary', 20),
    ]).slice(0, 20);
    const available = queryTraces.length > 0 || sqlSummaries.length > 0;
    return {
      requested: true,
      available,
      source: 'read_only_tool_replay',
      toolCount: toolResults.length,
      queryTraces,
      sqlSummaries,
      note: available
        ? '已从只读工具结果抽取 queryTrace 和脱敏 SQL 摘要。'
        : '只读工具结果未提供 queryTrace 或 sqlSummary。',
    };
  }

  private buildEvalFailureContractReplay(question: string, plan: AgentPlan | null, toolResults: AgentToolResult[]) {
    if (!plan) {
      return {
        requested: true,
        executed: false,
        reason: 'missing_plan',
        answer: null,
        renderedBlocks: [],
        answerContract: null,
        phaseOutputs: [],
      };
    }
    if (!toolResults.length) {
      return {
        requested: true,
        executed: false,
        reason: 'no_tool_results',
        answer: null,
        renderedBlocks: [],
        answerContract: null,
        phaseOutputs: [],
      };
    }

    const answer = this.composeEvalReplayAnswer(plan, toolResults);
    const renderedBlocks = this.buildEvalReplayBlocks(answer, toolResults);
    const answerContract = this.runtime.validateAnswer({
      question,
      plan,
      answer,
      toolResults,
      renderedBlocks,
    });
    const finalAnswer = answerContract.valid ? answer : this.evalReplayContractFailureAnswer(answerContract);
    const finalBlocks = answerContract.valid ? renderedBlocks : this.evalReplayContractFailureBlocks(finalAnswer, answerContract);
    return {
      requested: true,
      executed: true,
      answer: finalAnswer,
      renderedBlocks: finalBlocks,
      answerContract,
      phaseOutputs: [
        {
          phase: 'core_conclusion',
          title: '查询结果',
          summary: finalAnswer,
          blockKinds: finalBlocks.map((block) => block.kind),
        },
      ],
      note: answerContract.valid ? '只读工具结果已通过 Agent V2 输出契约校验。' : '只读工具结果未通过输出契约校验，已返回拦截提示。',
    };
  }

  private composeEvalReplayAnswer(plan: AgentPlan, results: AgentToolResult[]) {
    if (!results.length) return plan.clarificationQuestion ?? '没有执行任何工具。';
    if (results.length === 1) return results[0].summary;
    return results.map((result) => result.summary).filter(Boolean).join('\n');
  }

  private buildEvalReplayBlocks(answer: string, results: AgentToolResult[]): AuraResponseBlock[] {
    const blocks: AuraResponseBlock[] = [{ kind: 'summary_text', content: answer }];
    for (const result of results) {
      const data = this.asObject(result.data);
      const items = Array.isArray(data?.items) ? data.items : [];
      const metrics = this.asObject(data?.metrics);
      const chart = this.asObject(data?.chart);
      if (metrics) blocks.push(...this.evalReplayKpiBlocks(metrics));
      if (chart && this.isSupportedReplayChartType(chart.chartType)) {
        blocks.push({
          kind: 'chart',
          chartType: chart.chartType,
          title: String(chart.title ?? result.title),
          data: chart.data ?? [],
          xKey: typeof chart.xKey === 'string' ? chart.xKey : undefined,
          yKeys: Array.isArray(chart.yKeys) ? chart.yKeys.map(String) : undefined,
        });
      }
      if (items.length) {
        blocks.push(this.evalReplayTableBlock(items));
      } else if (result.status === 'no_data') {
        blocks.push({
          kind: 'data_gap',
          title: result.title,
          message: result.summary,
          missingData: ['当前筛选范围内没有匹配记录'],
        });
      }
      if (result.evidence) {
        blocks.push({
          kind: 'evidence_panel',
          sources: result.evidence.sourceTables ?? result.evidence.source,
          dateRange: result.evidence.dateRange,
          metricDefinition: result.evidence.metricDefinition,
          limitations: result.evidence.limitations,
        });
      }
      for (const action of result.actions ?? []) {
        blocks.push({
          kind: 'action_card',
          title: action.label,
          preview: action.label,
          actionId: action.action ?? 'agent-v2:action',
          riskLevel: action.riskLevel,
          impactSummary: '治理中心回放只展示动作，不会执行写入。',
        });
      }
    }
    return blocks;
  }

  private evalReplayTableBlock(items: unknown[]): AuraResponseBlock {
    const rows = items.map((item) => this.asObject(item) ?? {});
    const columns = Object.keys(rows[0] ?? {}).filter((key) => !/Id$|^id$/.test(key)).slice(0, 8);
    return {
      kind: 'table',
      columns: columns.map((column) => EVAL_REPLAY_TABLE_LABELS[column] ?? column),
      rows: rows.map((row) => columns.map((column) => this.formatReplayCell(row[column]))),
      sortable: true,
    };
  }

  private evalReplayKpiBlocks(metrics: Record<string, unknown>): AuraResponseBlock[] {
    const mapping: Array<[string, string]> = [
      ['totalRevenueText', '实收'],
      ['refundAmountText', '退款'],
      ['netRevenueText', '净收'],
      ['orderCount', '订单数'],
      ['customerCount', '客户数'],
      ['totalAmountText', '合计金额'],
      ['totalNetAmountText', '合计实收'],
      ['avgOrderValueText', '客单价'],
      ['revenueChangeText', '变化'],
      ['revenueChangeRateText', '变化率'],
    ];
    return mapping
      .filter(([key]) => metrics[key] !== undefined && metrics[key] !== null && metrics[key] !== '')
      .slice(0, 6)
      .map(([key, label]) => ({
        kind: 'kpi_card',
        label,
        value: this.formatReplayCell(metrics[key]),
      }));
  }

  private isSupportedReplayChartType(value: unknown): value is 'line' | 'bar' | 'pie' | 'funnel' {
    return value === 'line' || value === 'bar' || value === 'pie' || value === 'funnel';
  }

  private evalReplayContractFailureAnswer(answerContract: { errors: string[]; warnings: string[] }) {
    const reasons = answerContract.errors.length ? answerContract.errors.join('；') : '未满足输出契约';
    return `当前回放结果未通过 Agent V2 证据和格式校验，系统已拦截，避免返回不可靠结论。失败原因：${reasons}。`;
  }

  private evalReplayContractFailureBlocks(
    answer: string,
    answerContract: { errors: string[]; warnings: string[] },
  ): AuraResponseBlock[] {
    return [
      { kind: 'summary_text', content: answer },
      {
        kind: 'alert',
        level: 'warning',
        message: `已记录为 contract_failed：${answerContract.errors.join('；') || '输出契约未通过'}`,
      },
    ];
  }

  private formatReplayCell(value: unknown) {
    if (value === null || value === undefined) return '';
    if (value instanceof Date) return value.toISOString();
    if (typeof value === 'number') return Number.isInteger(value) ? String(value) : value.toFixed(2);
    if (typeof value === 'string') return this.maskSensitiveDebugText(value);
    return JSON.stringify(value);
  }

  private redactSensitiveDebugValue(value: unknown, key?: string): unknown {
    if (value === null || value === undefined) return value;
    if (typeof value === 'string') {
      if (this.isFieldNameListKey(key) || key === 'field') return value;
      if (this.isSensitiveDebugKey(key)) return this.maskSensitiveDebugScalar(value, key);
      return this.maskSensitiveDebugText(value);
    }
    if (typeof value === 'number' || typeof value === 'boolean') {
      return this.isSensitiveDebugKey(key) ? '已脱敏' : value;
    }
    if (Array.isArray(value)) {
      if (this.isFieldNameListKey(key)) return value;
      return value.map((item) => this.redactSensitiveDebugValue(item, key));
    }
    if (typeof value !== 'object') return value;
    const output: Record<string, unknown> = {};
    for (const [entryKey, entryValue] of Object.entries(value as Record<string, unknown>)) {
      output[entryKey] = this.redactSensitiveDebugValue(entryValue, entryKey);
    }
    return output;
  }

  private isFieldNameListKey(key?: string) {
    return Boolean(key && /^(allowedFields|maskedFields|deniedFields|droppedFields|requiredFields|selectedFields)$/i.test(key));
  }

  private isSensitiveDebugKey(key?: string) {
    return Boolean(key && /(phone|mobile|wechat|idcard|idCard|identity|certificate|address|email|openid|unionid|password|token|secret)/i.test(key));
  }

  private maskSensitiveDebugScalar(value: string, key?: string) {
    const maskedText = this.maskSensitiveDebugText(value);
    if (/(phone|mobile)/i.test(key ?? '') && maskedText !== value) return maskedText;
    if (/^\s*$/.test(value)) return value;
    if (/(phone|mobile)/i.test(key ?? '')) return maskedText;
    return '已脱敏';
  }

  private maskSensitiveDebugText(value: string) {
    return value.replace(/1[3-9]\d{9}/g, (phone) => `${phone.slice(0, 3)}****${phone.slice(-4)}`);
  }

  private readJson(path: string): any {
    const absolute = this.resolveWorkspacePath(path);
    if (!existsSync(absolute)) throw new NotFoundException(`治理报告不存在：${path}`);
    return JSON.parse(readFileSync(absolute, 'utf8'));
  }

  private toJson(value: unknown) {
    if (value === undefined || value === null) return undefined;
    return JSON.parse(JSON.stringify(value));
  }

  private resolveWorkspacePath(path: string) {
    if (/^[A-Za-z]:\\/.test(path)) return path;
    const cwd = process.cwd();
    const workspaceRoot = cwd.endsWith('packages\\server-v2') || cwd.endsWith('packages/server-v2') ? resolve(cwd, '../..') : cwd;
    return resolve(workspaceRoot, path);
  }

  private countBy(values: string[]) {
    return values.reduce<Record<string, number>>((result, value) => {
      result[value] = (result[value] ?? 0) + 1;
      return result;
    }, {});
  }

  private topCounts(values: string[], limit: number) {
    return Object.entries(this.countBy(values))
      .map(([key, count]) => ({ key, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, limit);
  }

  private ratio(numerator: number, denominator: number) {
    if (!denominator) return 0;
    return Number((numerator / denominator).toFixed(4));
  }

  private percentile(values: number[], percentile: number) {
    if (!values.length) return null;
    const sorted = [...values].sort((a, b) => a - b);
    const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * percentile) - 1));
    return sorted[index];
  }

  private durationMs(start?: Date | string | null, end?: Date | string | null) {
    if (!start || !end) return null;
    const value = new Date(end).getTime() - new Date(start).getTime();
    return Number.isFinite(value) && value >= 0 ? value : null;
  }

  private toNullableNumber(value: unknown) {
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
  }

  private extractStrategyTrace(...values: unknown[]) {
    for (const value of values) {
      const found = this.findObjectDeep(value, ['agentV2GrayStrategy']);
      if (found) return found;
      const direct = this.asObject(value);
      const businessTask = this.asObject(this.asObject(direct?.plan)?.businessTask ?? direct?.businessTask);
      const strategy = this.asObject(businessTask?.agentV2GrayStrategy);
      if (strategy) return strategy;
    }
    return null;
  }

  private findObjectDeep(value: unknown, keys: string[]): Record<string, unknown> | null {
    if (!value || typeof value !== 'object') return null;
    const record = value as Record<string, unknown>;
    for (const key of keys) {
      const nested = this.asObject(record[key]);
      if (nested) return nested;
    }
    for (const nestedValue of Object.values(record)) {
      const found = this.findObjectDeep(nestedValue, keys);
      if (found) return found;
    }
    return null;
  }

  private findBooleanDeep(values: unknown[], keys: string[]) {
    for (const value of values) {
      const found = this.findBooleanInValue(value, keys);
      if (found !== null) return found;
    }
    return null;
  }

  private findBooleanInValue(value: unknown, keys: string[]): boolean | null {
    if (!value || typeof value !== 'object') return null;
    const record = value as Record<string, unknown>;
    for (const key of keys) {
      if (typeof record[key] === 'boolean') return record[key] as boolean;
    }
    for (const nestedValue of Object.values(record)) {
      const found = this.findBooleanInValue(nestedValue, keys);
      if (found !== null) return found;
    }
    return null;
  }

  private aggregateCostTelemetry(values: unknown[]) {
    const allCostKeys = [
      'totalTokens',
      'tokens',
      'tokenCount',
      'promptTokens',
      'inputTokens',
      'completionTokens',
      'outputTokens',
      'totalChars',
      'chars',
      'characterCount',
      'estimatedUsd',
      'costUsd',
      'usd',
    ];
    const costValues = values.filter((value) => this.findNumbersDeep(value, allCostKeys).length > 0);
    const totalTokens = this.sumNumbersByKeys(costValues, ['totalTokens', 'tokens', 'tokenCount']);
    const promptTokens = this.sumNumbersByKeys(costValues, ['promptTokens', 'inputTokens']);
    const completionTokens = this.sumNumbersByKeys(costValues, ['completionTokens', 'outputTokens']);
    const totalChars = this.sumNumbersByKeys(costValues, ['totalChars', 'chars', 'characterCount']);
    const estimatedUsd = this.sumNumbersByKeys(costValues, ['estimatedUsd', 'costUsd', 'usd']);
    const sampleCount = costValues.length;

    if (!sampleCount || (!totalTokens && !promptTokens && !completionTokens && !totalChars && !estimatedUsd)) {
      return {
        status: 'not_measured',
        sampleCount: 0,
        totalTokens: 0,
        promptTokens: 0,
        completionTokens: 0,
        totalChars: 0,
        estimatedUsd: 0,
        reason: '运行审计中尚未发现 token、字符或金额成本 trace。',
      };
    }

    return {
      status: estimatedUsd > 0 || totalTokens > 0 ? 'measured' : 'estimated',
      sampleCount,
      totalTokens,
      promptTokens,
      completionTokens,
      totalChars,
      estimatedUsd: Number(estimatedUsd.toFixed(6)),
      source: estimatedUsd > 0 ? 'llm_cost_trace' : totalTokens > 0 ? 'token_trace' : 'char_estimate',
    };
  }

  private sumNumbersByKeys(values: unknown[], keys: string[]): number {
    return values.reduce<number>(
      (sum, value) => sum + this.findNumbersDeep(value, keys).reduce<number>((innerSum, item) => innerSum + item, 0),
      0,
    );
  }

  private findNumbersDeep(value: unknown, keys: string[]): number[] {
    if (!value || typeof value !== 'object') return [];
    const record = value as Record<string, unknown>;
    const result: number[] = [];
    for (const key of keys) {
      const number = this.toNullableNumber(record[key]);
      if (number !== null) result.push(number);
    }
    for (const nestedValue of Object.values(record)) {
      if (nestedValue && typeof nestedValue === 'object') {
        result.push(...this.findNumbersDeep(nestedValue, keys));
      }
    }
    return result;
  }

  private containsRiskText(values: unknown[], terms: string[]) {
    const text = values.map((value) => {
      try {
        return JSON.stringify(value ?? '');
      } catch {
        return String(value ?? '');
      }
    }).join('\n').toLowerCase();
    return terms.some((term) => text.includes(term.toLowerCase()));
  }

  private asObject(value: unknown): Record<string, unknown> | null {
    return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
  }

  private toPositiveInt(value: unknown, fallback: number) {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
  }

  private normalizeGrayMode(value: unknown): AgentV2GrayMode | null {
    if (
      value === 'legacy_regex' ||
      value === 'shadow' ||
      value === 'kg_llm_preferred' ||
      value === 'kg_llm_only' ||
      value === 'legacy_retired'
    ) {
      return value;
    }
    return null;
  }

  private isProductionRuntime() {
    return String(process.env.NODE_ENV ?? '').trim().toLowerCase() === 'production';
  }

  private isTruthy(value: unknown) {
    return ['1', 'true', 'yes', 'on'].includes(String(value ?? '').trim().toLowerCase());
  }

  private normalizeDebugRole(value: unknown): 'manager' | 'reception' | 'beautician' {
    if (value === 'reception' || value === 'beautician') return value;
    return 'manager';
  }

  private debugExecuteMeasured(
    input: { question: string; storeId?: number; role?: 'manager' | 'reception' | 'beautician'; entrypoint?: string },
    grayMode: AgentV2GrayMode,
  ) {
    const startedAt = Date.now();
    const result = this.debugExecute({
      question: input.question,
      storeId: input.storeId,
      role: input.role,
      entrypoint: input.entrypoint,
      grayMode,
    }) as any;
    const latencyMs = Math.max(0, Date.now() - startedAt);
    return {
      mode: grayMode,
      latencyMs,
      result,
      summary: this.summarizeDebugCompareResult(grayMode, result, latencyMs),
    };
  }

  private summarizeDebugCompareResult(mode: string, result: any, latencyMs: number) {
    const outputKinds = this.debugStringList(result?.plan?.outputContract?.requiredKinds);
    const sourceModels = this.debugStringList(result?.decision?.selected?.sourceModels);
    const toolPlan = Array.isArray(result?.plan?.toolPlan) ? result.plan.toolPlan : [];
    const toolNames = toolPlan.map((tool: any) => String(tool?.tool ?? '')).filter(Boolean);
    const queryKeys = toolPlan
      .map((tool: any) => this.optionalText(this.asObject(tool?.args)?.queryKey ?? this.asObject(tool?.args)?.capabilityId))
      .filter(Boolean);
    return {
      mode,
      selectedCapabilityId: result?.selectedCapabilityId ?? null,
      finalEngine: result?.strategy?.finalEngine ?? null,
      confidence: result?.confidence ?? 0,
      fallbackReason: result?.strategy?.fallbackReason ?? null,
      activeManifestVersion: result?.debugContext?.activeManifestVersion ?? result?.debugContext?.manifestVersion ?? null,
      selectedManifestVersion: result?.decision?.selected?.version ?? null,
      graphContextAvailable: result?.graphTrace?.available === true,
      graphContextSource: result?.graphTrace?.source ?? null,
      outputShape: {
        requiredKinds: outputKinds,
        evidenceRequired: result?.plan?.outputContract?.evidenceRequired === true,
      },
      evidence: {
        sourceModels,
        toolNames,
        queryKeys,
        evidenceRequired: result?.plan?.outputContract?.evidenceRequired === true,
      },
      latencyMs,
      costEstimate: this.estimateDebugCost(result),
    };
  }

  private estimateDebugCost(result: any) {
    const promptText = JSON.stringify(result?.llmTrace?.prompt ?? '');
    const responseText = JSON.stringify(result?.llmTrace?.response ?? '');
    const promptChars = result?.llmTrace?.available ? promptText.length : 0;
    const responseChars = result?.llmTrace?.available ? responseText.length : 0;
    return {
      unit: 'local_debug_char_estimate',
      promptChars,
      responseChars,
      totalChars: promptChars + responseChars,
      note: '本地调试估算，不代表生产 LLM 真实费用。',
    };
  }

  private debugDifferences(results: Record<string, any>, measuredRuns?: Array<{ mode: string; summary: any }>) {
    const entries = (measuredRuns ?? Object.entries(results).map(([mode, result]) => ({
      mode,
      summary: this.summarizeDebugCompareResult(mode, result, 0),
    }))).map((item) => ({ mode: item.mode, ...item.summary }));
    const outputShapes = Object.fromEntries(entries.map((item) => [item.mode, this.debugSignature(item.outputShape?.requiredKinds)]));
    const evidenceProfiles = Object.fromEntries(entries.map((item) => [item.mode, this.debugSignature([
      ...(item.evidence?.sourceModels ?? []),
      ...(item.evidence?.toolNames ?? []),
      ...(item.evidence?.queryKeys ?? []),
      item.evidence?.evidenceRequired ? 'evidence_required' : 'evidence_optional',
    ])]));
    const latencyValues = entries.map((item) => Number(item.latencyMs ?? 0)).filter((value) => Number.isFinite(value));
    const costValues = entries.map((item) => Number(item.costEstimate?.totalChars ?? 0)).filter((value) => Number.isFinite(value));
    return {
      selectedCapabilityIds: Object.fromEntries(entries.map((item) => [item.mode, item.selectedCapabilityId])),
      finalEngines: Object.fromEntries(entries.map((item) => [item.mode, item.finalEngine])),
      confidence: Object.fromEntries(entries.map((item) => [item.mode, item.confidence])),
      fallbackReasons: Object.fromEntries(entries.map((item) => [item.mode, item.fallbackReason])),
      outputShapes,
      evidenceProfiles,
      manifestVersions: Object.fromEntries(entries.map((item) => [item.mode, item.selectedManifestVersion ?? item.activeManifestVersion ?? 'builtin'])),
      latencyMs: {
        byMode: Object.fromEntries(entries.map((item) => [item.mode, item.latencyMs ?? 0])),
        min: latencyValues.length ? Math.min(...latencyValues) : 0,
        max: latencyValues.length ? Math.max(...latencyValues) : 0,
      },
      costEstimate: {
        unit: 'local_debug_char_estimate',
        byMode: Object.fromEntries(entries.map((item) => [item.mode, item.costEstimate?.totalChars ?? 0])),
        min: costValues.length ? Math.min(...costValues) : 0,
        max: costValues.length ? Math.max(...costValues) : 0,
      },
      changedCapability: new Set(entries.map((item) => item.selectedCapabilityId)).size > 1,
      changedEngine: new Set(entries.map((item) => item.finalEngine)).size > 1,
      changedOutputShape: new Set(Object.values(outputShapes)).size > 1,
      changedEvidence: new Set(Object.values(evidenceProfiles)).size > 1,
      changedManifestVersion: new Set(entries.map((item) => item.selectedManifestVersion ?? item.activeManifestVersion ?? 'builtin')).size > 1,
    };
  }

  private buildDebugConsistencySummary(runs: Array<{ mode: string; latencyMs: number; result: any; summary: any }>) {
    const samples = runs.map((run, index) => ({
      index: index + 1,
      selectedCapabilityId: run.summary.selectedCapabilityId,
      finalEngine: run.summary.finalEngine,
      confidence: run.summary.confidence,
      outputShape: run.summary.outputShape,
      evidence: run.summary.evidence,
      latencyMs: run.latencyMs,
      costEstimate: run.summary.costEstimate,
    }));
    const capabilityCounts = this.countBy(samples.map((sample) => sample.selectedCapabilityId ?? 'unsupported'));
    const engineCounts = this.countBy(samples.map((sample) => sample.finalEngine ?? 'unknown'));
    const outputShapeCounts = this.countBy(samples.map((sample) => this.debugSignature(sample.outputShape.requiredKinds)));
    const evidenceCounts = this.countBy(samples.map((sample) => this.debugSignature([
      ...sample.evidence.sourceModels,
      ...sample.evidence.toolNames,
      ...sample.evidence.queryKeys,
      sample.evidence.evidenceRequired ? 'evidence_required' : 'evidence_optional',
    ])));
    const latencyValues = samples.map((sample) => sample.latencyMs);
    const totalCostChars = samples.reduce((sum, sample) => sum + Number(sample.costEstimate.totalChars ?? 0), 0);
    return {
      mode: 'kg_llm_preferred',
      iterations: samples.length,
      stable: Object.keys(capabilityCounts).length === 1 && Object.keys(engineCounts).length === 1 && Object.keys(outputShapeCounts).length === 1,
      capabilityCounts,
      finalEngineCounts: engineCounts,
      outputShapeCounts,
      evidenceCounts,
      latencyMs: {
        min: latencyValues.length ? Math.min(...latencyValues) : 0,
        max: latencyValues.length ? Math.max(...latencyValues) : 0,
        p50: this.percentile(latencyValues, 0.5) ?? 0,
      },
      costEstimate: {
        unit: 'local_debug_char_estimate',
        totalChars: totalCostChars,
        avgChars: samples.length ? Math.round(totalCostChars / samples.length) : 0,
        note: '本地调试估算，不代表生产 LLM 真实费用。',
      },
      samples,
    };
  }

  private buildDebugCompareVerdict(differences: any, consistency: any) {
    const reasons = [
      differences.changedCapability ? '新旧链路命中能力不一致，需要评估哪条链路更符合预期。' : '新旧链路命中能力一致。',
      differences.changedOutputShape ? '输出形态存在差异，需要检查 table/kpi/chart/evidence 是否符合问题形态。' : '输出形态一致。',
      differences.changedEvidence ? '证据来源存在差异，需要检查 sourceModel/tool/queryKey。' : '证据来源一致。',
      consistency.stable ? 'kg_llm_preferred 5 次 dry-run 一致。' : 'kg_llm_preferred 5 次 dry-run 不一致，暂不能判定更稳。',
    ];
    return {
      localDryRunStable: consistency.stable && !differences.changedCapability && !differences.changedOutputShape && !differences.changedEvidence,
      canJudgeNewArchitectureMoreStable: consistency.stable && !differences.changedCapability,
      reasons,
      productionEvidenceRequired: '仍需 7 天 shadow、真实延迟、真实成本和线上有用率后，才能替代旧正则退役判断。',
    };
  }

  private debugSignature(value: unknown) {
    const items = Array.isArray(value) ? value.map((item) => String(item ?? '')).filter(Boolean).sort() : [String(value ?? '')];
    return items.length ? items.join('|') : '-';
  }

  private normalizeDebugText(value: unknown) {
    return String(value ?? '').toLowerCase().replace(/\s+/g, '');
  }

  private includesNormalized(text: string, term: unknown) {
    const normalized = this.normalizeDebugText(term);
    return Boolean(normalized) && (text.includes(normalized) || normalized.includes(text));
  }

  private buildDebugContext(
    input: {
      question: string;
      role?: 'manager' | 'reception' | 'beautician' | string;
      storeId?: number;
      entrypoint?: string;
    },
    grayMode?: AgentV2GrayMode | string,
  ) {
    const activeManifestVersion = this.manifestProvider.getActiveVersion();
    return {
      question: input.question,
      storeId: this.toNullableNumber(input.storeId) ?? 1,
      role: this.normalizeDebugRole(input.role),
      entrypoint: this.optionalText(input.entrypoint) ?? 'agent_governance_debug',
      grayMode: grayMode ?? 'kg_llm_preferred',
      manifestVersion: activeManifestVersion,
      activeManifestVersion,
      manifestVersionSource: 'active_manifest',
      permissions: ['*'],
      dryRun: true,
    };
  }

  private buildDebugGraphTrace(plan: AgentV2RuntimePlan | null) {
    const intent = plan?.decision.intent ?? null;
    const trace = this.asObject(intent?.trace) as Record<string, any> | null;
    if (!trace) {
      return {
        available: false,
        reason: '当前运行计划没有返回图谱预处理 trace。',
      };
    }

    const llmPrompt = this.asObject(trace.llmPrompt);
    const promptCounts = this.asObject(llmPrompt?.graphContextCounts);
    const objectHints = this.debugObjectHints(trace.objectHints);
    const domainHints = this.debugDomainHints(trace.domainHints);
    const capabilityHints = this.debugCapabilityHints(trace.capabilityHints);
    const exclusions = this.debugExclusionHints(trace.exclusions);
    return {
      available: true,
      source: trace.source ?? 'unknown',
      cacheHit: trace.cacheHit === true,
      normalizedQuestion: this.optionalText(trace.normalizedQuestion) ?? null,
      graphContextCounts: {
        objectHints: this.toNullableNumber(promptCounts?.objectHints) ?? objectHints.length,
        domainHints: this.toNullableNumber(promptCounts?.domainHints) ?? domainHints.length,
        capabilityHints: this.toNullableNumber(promptCounts?.capabilityHints) ?? capabilityHints.length,
        exclusions: this.toNullableNumber(promptCounts?.exclusions) ?? exclusions.length,
        fieldHints: this.toNullableNumber(promptCounts?.fieldHints) ?? 0,
      },
      selectedIntent: intent ? {
        objects: Array.isArray(intent.objects) ? intent.objects : [],
        domain: intent.domain,
        action: intent.action,
        timeIntent: intent.timeIntent,
        candidateCapabilities: Array.isArray(intent.candidateCapabilities) ? intent.candidateCapabilities : [],
        confidence: intent.confidence,
      } : null,
      objectHints,
      domainHints,
      capabilityHints,
      exclusions,
      note: '图谱预处理只提供结构化提示，不直接授权、不直接执行工具。',
    };
  }

  private debugObjectHints(value: unknown) {
    return this.debugRecordList(value).slice(0, 8).map((hint) => ({
      objectId: this.optionalText(hint.objectId) ?? null,
      objectType: this.optionalText(hint.objectType) ?? null,
      displayName: this.optionalText(hint.displayName) ?? null,
      matchedTerms: this.debugStringList(hint.matchedTerms),
      sourceModels: this.debugStringList(hint.sourceModels),
      score: this.toNullableNumber(hint.score) ?? 0,
    }));
  }

  private debugDomainHints(value: unknown) {
    return this.debugRecordList(value).slice(0, 8).map((hint) => ({
      domain: this.optionalText(hint.domain) ?? null,
      displayName: this.optionalText(hint.displayName) ?? null,
      reasons: this.debugStringList(hint.reasons),
      score: this.toNullableNumber(hint.score) ?? 0,
    }));
  }

  private debugCapabilityHints(value: unknown) {
    return this.debugRecordList(value).slice(0, 8).map((hint) => ({
      capabilityId: this.optionalText(hint.capabilityId) ?? null,
      displayName: this.optionalText(hint.displayName) ?? null,
      domain: this.optionalText(hint.domain) ?? null,
      outputKinds: this.debugStringList(hint.outputKinds),
      triggerTerms: this.debugStringList(hint.triggerTerms),
      score: this.toNullableNumber(hint.score) ?? 0,
    }));
  }

  private debugExclusionHints(value: unknown) {
    return this.debugRecordList(value).slice(0, 8).map((hint) => ({
      fromCapabilityId: this.optionalText(hint.fromCapabilityId) ?? null,
      toCapabilityId: this.optionalText(hint.toCapabilityId) ?? null,
      reason: this.optionalText(hint.reason) ?? null,
    }));
  }

  private debugRecordList(value: unknown): Record<string, unknown>[] {
    return Array.isArray(value) ? value.map((item) => this.asObject(item)).filter(Boolean) as Record<string, unknown>[] : [];
  }

  private debugStringList(value: unknown): string[] {
    return Array.isArray(value) ? value.map((item) => String(item ?? '').trim()).filter(Boolean) : [];
  }

  private buildLlmTraceSummary(intentTrace: Record<string, any> | null) {
    if (!intentTrace) {
      return {
        available: false,
        source: 'not_available',
        reason: 'intent_trace_missing',
      };
    }
    return {
      available: Boolean(intentTrace.llmPrompt || intentTrace.llmResponse || intentTrace.llmRawTextPreview || intentTrace.llmFallbackReason),
      source: intentTrace.source ?? 'unknown',
      fallbackReason: intentTrace.llmFallbackReason ?? null,
      prompt: intentTrace.llmPrompt ?? null,
      response: intentTrace.llmResponse ?? (
        intentTrace.llmRawTextPreview
          ? { rawTextPreview: intentTrace.llmRawTextPreview, parsed: intentTrace.source === 'llm' }
          : null
      ),
    };
  }

  private buildDebugPolicyTrace(
    input: {
      role?: 'manager' | 'reception' | 'beautician' | string;
      storeId?: number;
    },
    plan: AgentV2RuntimePlan | null,
  ) {
    const capability = plan?.decision.selected ?? null;
    const toolName = plan?.plan.toolPlan?.[0]?.tool ?? capability?.executor?.tool ?? null;
    const tool = toolName ? this.runtime.getTool(toolName) : null;
    const actor = {
      role: this.normalizeDebugRole(input.role),
      storeId: this.toNullableNumber(input.storeId) ?? 1,
      permissions: ['*'],
    };

    if (!capability) {
      return {
        available: false,
        overallStatus: 'not_applicable',
        allowed: false,
        requiresApproval: false,
        actor,
        capability: null,
        tool: toolName ? { name: toolName, found: Boolean(tool) } : null,
        checks: [],
        note: '当前调试未命中 Manifest 能力，无法生成 Policy 决策。',
      };
    }

    const checks = [
      this.debugStatusPolicyCheck(capability),
      this.debugStoreScopePolicyCheck(capability, actor.storeId),
      this.debugPersonaPolicyCheck(capability, actor.role),
      this.debugPermissionPolicyCheck(capability, actor.permissions),
      this.debugReleaseStrategyPolicyCheck(capability, tool),
      this.debugToolRolePolicyCheck(toolName, tool, actor.role),
      this.debugToolApprovalPolicyCheck(capability, tool),
      this.debugFieldPolicyCheck(capability),
    ];
    const overallStatus = checks.some((check) => check.status === 'deny')
      ? 'deny'
      : checks.some((check) => check.status === 'review')
        ? 'review'
        : 'pass';

    return {
      available: true,
      overallStatus,
      allowed: overallStatus !== 'deny',
      requiresApproval: checks.some((check) => check.status === 'review'),
      actor,
      capability: {
        capabilityId: capability.capabilityId,
        displayName: capability.displayName,
        status: capability.status,
        releaseStrategy: capability.releaseStrategy,
        riskLevel: capability.riskLevel,
        storeScope: capability.storeScope,
        personaCodes: capability.personaCodes ?? [],
        permissionCodes: capability.permissionCodes ?? [],
      },
      tool: toolName ? {
        name: toolName,
        found: Boolean(tool),
        riskLevel: tool?.riskLevel ?? null,
        requiresApproval: Boolean(tool?.requiresApproval),
        allowedRoles: Array.isArray(tool?.allowedRoles) ? tool.allowedRoles : [],
      } : null,
      fieldPolicySummary: {
        allow: (capability.fieldPolicies ?? []).filter((policy) => policy.visibility === 'allow').map((policy) => policy.field),
        mask: (capability.fieldPolicies ?? []).filter((policy) => policy.visibility === 'mask').map((policy) => policy.field),
        deny: (capability.fieldPolicies ?? []).filter((policy) => policy.visibility === 'deny').map((policy) => policy.field),
      },
      checks,
      note: overallStatus === 'pass'
        ? 'Policy 决策允许当前 dry-run 只读调试继续。'
        : overallStatus === 'review'
          ? 'Policy 决策要求人工确认或仅允许治理回放，不应自动写入。'
          : 'Policy 决策阻断当前能力执行。',
    };
  }

  private debugStatusPolicyCheck(capability: AgentV2CapabilityManifest) {
    const enabled = capability.status === 'enabled';
    return {
      name: 'status',
      status: enabled ? 'pass' : 'deny',
      reason: enabled ? `能力「${capability.displayName}」已启用。` : `能力「${capability.displayName}」未启用。`,
    };
  }

  private debugStoreScopePolicyCheck(capability: AgentV2CapabilityManifest, storeId: number) {
    if (capability.storeScope === 'required' && !storeId) {
      return { name: 'store_scope', status: 'deny', reason: `能力「${capability.displayName}」需要明确门店范围。` };
    }
    if (capability.storeScope === 'forbidden' && storeId) {
      return { name: 'store_scope', status: 'deny', reason: `能力「${capability.displayName}」不能携带门店范围执行。` };
    }
    return { name: 'store_scope', status: 'pass', reason: `门店范围符合 ${capability.storeScope} 策略。` };
  }

  private debugPersonaPolicyCheck(capability: AgentV2CapabilityManifest, role: AgentRole) {
    const personaCodes = capability.personaCodes ?? [];
    const allowed = !personaCodes.length || personaCodes.includes(role as any);
    return {
      name: 'persona',
      status: allowed ? 'pass' : 'deny',
      reason: allowed ? `当前身份 ${role} 可访问该能力。` : `当前身份 ${role} 不在能力「${capability.displayName}」允许范围内。`,
    };
  }

  private debugPermissionPolicyCheck(capability: AgentV2CapabilityManifest, permissions: string[]) {
    const requiredPermissions = capability.permissionCodes ?? [];
    const missingPermissions = requiredPermissions.filter((permission) => !permissions.includes(permission));
    const allowed = !requiredPermissions.length || permissions.includes('*') || missingPermissions.length === 0;
    return {
      name: 'permission',
      status: allowed ? 'pass' : 'deny',
      reason: allowed ? '权限码满足能力要求。' : `缺少权限：${missingPermissions.join('、')}。`,
    };
  }

  private debugReleaseStrategyPolicyCheck(capability: AgentV2CapabilityManifest, tool: ReturnType<AgentV2RuntimeService['getTool']> | null) {
    if (capability.releaseStrategy === 'write_blocked') {
      return { name: 'release_strategy', status: 'deny', reason: `能力「${capability.displayName}」当前不允许自动执行。` };
    }
    if (capability.releaseStrategy === 'approval_required' && this.isDebugDirectMutationCapability(capability, tool)) {
      return { name: 'release_strategy', status: 'review', reason: `能力「${capability.displayName}」涉及写入或高风险动作，必须人工确认。` };
    }
    return { name: 'release_strategy', status: 'pass', reason: `发布策略 ${capability.releaseStrategy} 允许当前只读/草稿能力自动返回。` };
  }

  private debugToolRolePolicyCheck(toolName: string | null, tool: ReturnType<AgentV2RuntimeService['getTool']> | null, role: AgentRole) {
    if (!toolName) return { name: 'tool_role', status: 'review', reason: '当前计划没有声明工具。' };
    if (!tool) return { name: 'tool_role', status: 'review', reason: `工具 ${toolName} 未注册，运行时不能直接执行。` };
    const allowedRoles = Array.isArray(tool.allowedRoles) ? tool.allowedRoles : [];
    const allowed = !allowedRoles.length || allowedRoles.includes(role);
    return {
      name: 'tool_role',
      status: allowed ? 'pass' : 'deny',
      reason: allowed ? `工具 ${tool.name} 允许角色 ${role}。` : `当前角色 ${role} 不能执行工具 ${tool.name}。`,
    };
  }

  private debugToolApprovalPolicyCheck(capability: AgentV2CapabilityManifest, tool: ReturnType<AgentV2RuntimeService['getTool']> | null) {
    if (!tool) return { name: 'tool_approval', status: 'review', reason: '工具未注册，无法确认审批策略。' };
    if (tool.requiresApproval) return { name: 'tool_approval', status: 'review', reason: `工具 ${tool.name} 要求人工确认。` };
    if (capability.releaseStrategy === 'approval_required' && this.isDebugDirectMutationCapability(capability, tool)) {
      return { name: 'tool_approval', status: 'review', reason: `能力「${capability.displayName}」对应动作需要人工确认。` };
    }
    return { name: 'tool_approval', status: 'pass', reason: `工具 ${tool.name} 当前不需要前置审批。` };
  }

  private debugFieldPolicyCheck(capability: AgentV2CapabilityManifest) {
    const policies = capability.fieldPolicies ?? [];
    return {
      name: 'field_policy',
      status: 'pass',
      reason: policies.length
        ? `字段策略已声明：allow ${policies.filter((policy) => policy.visibility === 'allow').length}，mask ${policies.filter((policy) => policy.visibility === 'mask').length}，deny ${policies.filter((policy) => policy.visibility === 'deny').length}。`
        : '当前能力未声明字段策略，仍会经过调试页面兜底脱敏。',
    };
  }

  private isDebugDirectMutationCapability(capability: AgentV2CapabilityManifest, tool: ReturnType<AgentV2RuntimeService['getTool']> | null) {
    if (capability.executor?.type === 'business_action_draft' || capability.executor?.type === 'navigation') return false;
    if (this.isDebugReadOnlyBusinessTool(capability, tool)) return false;
    const actionText = [
      capability.capabilityId,
      capability.displayName,
      capability.description,
      capability.executor?.tool,
      tool?.name,
      ...(capability.actions ?? []),
      ...(capability.eventTypes ?? []),
    ].join('|');
    return /写入|删除|发券|下发|退款|核销|扣减|create|update|delete|issue|send|follow/i.test(actionText);
  }

  private isDebugReadOnlyBusinessTool(capability: AgentV2CapabilityManifest, tool: ReturnType<AgentV2RuntimeService['getTool']> | null) {
    const toolName = tool?.name ?? capability.executor?.tool;
    const readOnlyTools = new Set([
      'business.record.query',
      'business.metric.query',
      'business.trend.query',
      'business.detail.query',
      'business.query',
    ]);
    const readOnlyActions = new Set(['lookup', 'list', 'summary', 'analyze', 'diagnose', 'recommend']);
    return (
      Boolean(toolName) &&
      readOnlyTools.has(String(toolName)) &&
      capability.riskLevel === 'low' &&
      tool?.riskLevel !== 'high' &&
      ((capability.actions ?? []).length === 0 || (capability.actions ?? []).every((action) => readOnlyActions.has(action)))
    );
  }

  private buildDebugReplay(
    input: { question: string; role?: 'manager' | 'reception' | 'beautician' | string; storeId?: number; entrypoint?: string },
    grayMode: AgentV2GrayMode,
    plan: AgentV2RuntimePlan | null,
  ) {
    const decision = plan?.decision;
    const selected = decision?.selected ?? null;
    const intent = decision?.intent ?? null;
    const llmTrace = this.buildLlmTraceSummary(intent?.trace ?? null);
    const debugContext = this.buildDebugContext(input, grayMode);
    const graphTrace = this.buildDebugGraphTrace(plan);
    const policyTrace = this.buildDebugPolicyTrace(input, plan);
    return {
      dryRun: true,
      question: input.question,
      phases: [
        {
          key: 'debug_input',
          status: 'available',
          data: debugContext,
        },
        {
          key: 'kg_preprocessing',
          status: graphTrace.available ? 'available' : 'not_available',
          data: graphTrace,
        },
        {
          key: 'llm_prompt_response',
          status: llmTrace.available ? 'available' : 'not_available',
          data: llmTrace,
        },
        {
          key: 'intent_extraction',
          status: intent ? 'available' : 'not_available',
          data: intent ? {
            source: intent.trace.source,
            cacheHit: intent.trace.cacheHit ?? false,
            llmFallbackReason: intent.trace.llmFallbackReason ?? null,
            llmPrompt: intent.trace.llmPrompt ?? null,
            llmResponse: intent.trace.llmResponse ?? null,
            objects: intent.objects,
            domain: intent.domain,
            action: intent.action,
            timeIntent: intent.timeIntent,
            candidateCapabilities: intent.candidateCapabilities,
            confidence: intent.confidence,
            graphHints: {
              objects: intent.trace.objectHints,
              domains: intent.trace.domainHints,
              capabilities: intent.trace.capabilityHints,
              exclusions: intent.trace.exclusions,
            },
          } : null,
        },
        {
          key: 'manifest_mapping',
          status: selected ? 'selected' : 'unsupported',
          data: {
            selectedCapabilityId: selected?.capabilityId ?? null,
            reason: decision?.reason ?? null,
            candidates: decision?.candidates ?? [],
            excluded: decision?.excluded ?? [],
            boundaryWarnings: decision?.boundaryWarnings ?? [],
          },
        },
        {
          key: 'policy_boundary',
          status: policyTrace.available ? policyTrace.overallStatus : 'not_applicable',
          data: policyTrace,
        },
        {
          key: 'tool_plan',
          status: plan?.plan.toolPlan.length ? 'planned' : 'empty',
          data: plan?.plan.toolPlan ?? [],
        },
        {
          key: 'output_contract',
          status: plan?.plan.outputContract ? 'declared' : 'missing',
          data: plan?.plan.outputContract ?? null,
        },
        {
          key: 'runtime_execution',
          status: 'dry_run_not_executed',
          data: { toolResults: [], renderedBlocks: [], answerContract: null },
        },
      ],
    };
  }

  private buildRunReplay(input: { run: any; messages: any[]; steps: any[]; toolCalls: any[]; approvals: any[] }) {
    const plannerStep = input.steps.find((step) => String(step.name ?? '').includes('agent.v2.planner'));
    const toolSteps = input.steps.filter((step) => String(step.stepType ?? '') === 'tool');
    const renderingStep = input.steps.find((step) => String(step.name ?? '') === 'agent.v2.response.render');
    const result = this.asObject(input.run.resultJson) ?? {};
    const plannerOutput = this.asObject(plannerStep?.outputJson) ?? {};
    const decision = this.asObject(plannerOutput.decision);
    const plan = this.asObject(plannerOutput.plan) ?? this.asObject(input.run.planJson);
    const intent = this.asObject(decision?.intent);
    const intentTrace = this.asObject(intent?.trace);
    const graphTrace = this.buildRunGraphTrace(intent, intentTrace);
    const llmTrace = this.buildLlmTraceSummary(intentTrace);
    const manifestMapping = this.buildRunManifestMapping(plan, decision);
    const policyTrace = this.buildRunPolicyTrace(plan, decision, toolSteps);
    const lastAssistantMessage = [...input.messages].reverse().find((message) => String(message.role ?? '') === 'assistant');
    const toolReplayValues = [input.toolCalls, toolSteps.map((step) => step.outputJson), result.toolResults, result.phaseOutputs, result.renderedBlocks];
    const evidenceTrace = this.buildRunEvidenceTrace(input.run.evidenceJson, toolReplayValues);
    return {
      dryRun: false,
      runId: input.run.id,
      runNo: input.run.runNo,
      phases: [
        {
          key: 'planner',
          status: plannerStep?.status ?? 'missing',
          startedAt: plannerStep?.startedAt,
          endedAt: plannerStep?.endedAt,
          data: plannerStep?.outputJson ?? null,
        },
        {
          key: 'kg_preprocessing',
          status: graphTrace.available ? 'available' : 'not_available',
          data: graphTrace,
        },
        {
          key: 'llm_prompt_response',
          status: llmTrace.available ? 'available' : 'not_available',
          data: llmTrace,
        },
        {
          key: 'manifest_mapping',
          status: manifestMapping.selectedCapabilityId ? 'selected' : 'missing',
          data: manifestMapping,
        },
        {
          key: 'policy_boundary',
          status: policyTrace.available ? policyTrace.overallStatus : 'not_available',
          data: policyTrace,
        },
        {
          key: 'tool_execution',
          status: toolSteps.some((step) => step.status === 'failed') ? 'has_failure' : toolSteps.length ? 'completed' : 'not_executed',
          data: {
            toolCalls: input.toolCalls,
            toolSteps: toolSteps.map((step) => ({
              name: step.name,
              status: step.status,
              input: step.inputJson,
              output: step.outputJson,
              startedAt: step.startedAt,
              endedAt: step.endedAt,
            })),
            approvals: input.approvals,
            queryTraces: this.findObjectsByKeyDeep(toolReplayValues, 'queryTrace', 20),
            sqlSummaries: this.findObjectsByKeyDeep(toolReplayValues, 'sqlSummary', 20),
          },
        },
        {
          key: 'contract_and_rendering',
          status: renderingStep?.status ?? 'missing',
          startedAt: renderingStep?.startedAt,
          endedAt: renderingStep?.endedAt,
          data: {
            answerContract: result.answerContract ?? this.asObject(renderingStep?.outputJson)?.answerContract ?? null,
            renderedBlocks: result.renderedBlocks ?? [],
            phaseOutputs: result.phaseOutputs ?? [],
          },
        },
        {
          key: 'evidence_trace',
          status: evidenceTrace.available ? 'available' : 'missing',
          data: evidenceTrace,
        },
        {
          key: 'final_answer',
          status: input.run.status,
          data: {
            answer: result.answer ?? lastAssistantMessage?.content ?? null,
            actions: result.actions ?? [],
            evidence: input.run.evidenceJson ?? null,
          },
        },
      ],
    };
  }

  private buildRunGraphTrace(intent: Record<string, unknown> | null, trace: Record<string, unknown> | null) {
    if (!trace) {
      return {
        available: false,
        reason: 'persisted_intent_trace_missing',
      };
    }
    const llmPrompt = this.asObject(trace.llmPrompt);
    const promptCounts = this.asObject(llmPrompt?.graphContextCounts);
    const objectHints = this.debugObjectHints(trace.objectHints);
    const domainHints = this.debugDomainHints(trace.domainHints);
    const capabilityHints = this.debugCapabilityHints(trace.capabilityHints);
    const exclusions = this.debugExclusionHints(trace.exclusions);
    return {
      available: true,
      source: trace.source ?? 'unknown',
      cacheHit: trace.cacheHit === true,
      normalizedQuestion: this.optionalText(trace.normalizedQuestion) ?? null,
      graphContextCounts: {
        objectHints: this.toNullableNumber(promptCounts?.objectHints) ?? objectHints.length,
        domainHints: this.toNullableNumber(promptCounts?.domainHints) ?? domainHints.length,
        capabilityHints: this.toNullableNumber(promptCounts?.capabilityHints) ?? capabilityHints.length,
        exclusions: this.toNullableNumber(promptCounts?.exclusions) ?? exclusions.length,
        fieldHints: this.toNullableNumber(promptCounts?.fieldHints) ?? 0,
      },
      selectedIntent: intent ? {
        objects: this.debugStringList(intent.objects),
        domain: this.optionalText(intent.domain) ?? null,
        action: this.optionalText(intent.action) ?? null,
        timeIntent: this.optionalText(intent.timeIntent) ?? null,
        candidateCapabilities: this.debugStringList(intent.candidateCapabilities),
        confidence: this.toNullableNumber(intent.confidence) ?? null,
      } : null,
      objectHints,
      domainHints,
      capabilityHints,
      exclusions,
      note: '图谱预处理只提供结构化提示，不直接授权、不直接执行工具。',
    };
  }

  private buildRunManifestMapping(plan: Record<string, unknown> | null, decision: Record<string, unknown> | null) {
    const selected = this.asObject(decision?.selected);
    const capabilityPlan = this.asObject(plan?.capabilityPlan);
    const outputContract = this.asObject(plan?.outputContract);
    return {
      selectedCapabilityId: this.optionalText(selected?.capabilityId) ?? this.optionalText(capabilityPlan?.capabilityId) ?? null,
      displayName: this.optionalText(selected?.displayName) ?? null,
      status: this.optionalText(selected?.status) ?? null,
      releaseStrategy: this.optionalText(selected?.releaseStrategy) ?? null,
      riskLevel: this.optionalText(selected?.riskLevel) ?? null,
      executor: this.asObject(selected?.executor) ?? null,
      sourceModels: this.debugStringList(selected?.sourceModels),
      permissionCodes: this.debugStringList(selected?.permissionCodes),
      outputKinds: this.debugStringList(selected?.outputKinds ?? capabilityPlan?.outputKinds),
      requiredKinds: this.debugStringList(outputContract?.requiredKinds),
      reason: this.optionalText(decision?.reason) ?? null,
      candidates: this.debugRecordList(decision?.candidates).slice(0, 8),
      excluded: this.debugRecordList(decision?.excluded).slice(0, 8),
      boundaryWarnings: this.debugStringList(decision?.boundaryWarnings),
      toolPlan: Array.isArray(plan?.toolPlan) ? plan?.toolPlan : [],
      activeManifestVersion: this.manifestProvider.getActiveVersion(),
    };
  }

  private buildRunPolicyTrace(plan: Record<string, unknown> | null, decision: Record<string, unknown> | null, toolSteps: any[]) {
    const checks = toolSteps.flatMap((step) => this.debugRecordList(this.asObject(step.outputJson)?.policyChecks));
    const selected = this.asObject(decision?.selected);
    const toolPlan = Array.isArray(plan?.toolPlan) ? plan?.toolPlan : [];
    const toolNames = this.debugRecordList(toolPlan).map((item) => this.optionalText(item.tool)).filter(Boolean);
    if (!checks.length) {
      return {
        available: false,
        overallStatus: 'not_available',
        allowed: false,
        requiresApproval: false,
        capability: selected ? {
          capabilityId: this.optionalText(selected.capabilityId) ?? null,
          releaseStrategy: this.optionalText(selected.releaseStrategy) ?? null,
          riskLevel: this.optionalText(selected.riskLevel) ?? null,
        } : null,
        tools: toolNames,
        checks: [],
        note: '当前持久化运行没有记录 Policy checks；请确认运行是否经过 Agent V2 policy gateway。',
      };
    }
    const overallStatus = checks.some((check) => check.status === 'deny')
      ? 'deny'
      : checks.some((check) => check.status === 'review')
        ? 'review'
        : 'pass';
    return {
      available: true,
      overallStatus,
      allowed: overallStatus !== 'deny',
      requiresApproval: overallStatus === 'review',
      capability: selected ? {
        capabilityId: this.optionalText(selected.capabilityId) ?? null,
        displayName: this.optionalText(selected.displayName) ?? null,
        status: this.optionalText(selected.status) ?? null,
        releaseStrategy: this.optionalText(selected.releaseStrategy) ?? null,
        riskLevel: this.optionalText(selected.riskLevel) ?? null,
        permissionCodes: this.debugStringList(selected.permissionCodes),
      } : null,
      tools: toolNames,
      checks,
      note: 'Policy checks 来自持久化 tool step，覆盖能力状态、门店、角色、权限、发布策略和工具审批边界。',
    };
  }

  private buildRunEvidenceTrace(evidence: unknown, replayValues: unknown[]) {
    const evidenceRecord = this.asObject(evidence);
    const queryTraces = this.uniqueObjects(this.findObjectsByKeyDeep(replayValues, 'queryTrace', 20));
    const sqlSummaries = this.uniqueObjects(this.findObjectsByKeyDeep([...replayValues, queryTraces], 'sqlSummary', 20));
    return {
      available: Boolean(evidenceRecord || queryTraces.length || sqlSummaries.length),
      evidence: evidenceRecord,
      sourceModels: this.debugStringList(evidenceRecord?.sourceModels ?? evidenceRecord?.sourceTables ?? evidenceRecord?.source),
      filters: this.debugStringList(evidenceRecord?.filters),
      fieldPolicy: this.asObject(evidenceRecord?.fieldPolicy) ?? null,
      evidencePolicy: this.asObject(evidenceRecord?.evidencePolicy) ?? null,
      queryTraces,
      sqlSummaries,
      note: 'Evidence trace 汇总运行级 evidence、字段策略、通用查询 trace 和脱敏 SQL 摘要。',
    };
  }

  private findObjectsByKeyDeep(values: unknown[], key: string, limit: number) {
    const results: Record<string, unknown>[] = [];
    for (const value of values) {
      this.collectObjectsByKeyDeep(value, key, results, limit);
      if (results.length >= limit) break;
    }
    return results;
  }

  private uniqueObjects(values: Record<string, unknown>[]) {
    const seen = new Set<string>();
    const result: Record<string, unknown>[] = [];
    for (const value of values) {
      const key = JSON.stringify(value);
      if (seen.has(key)) continue;
      seen.add(key);
      result.push(value);
    }
    return result;
  }

  private collectObjectsByKeyDeep(value: unknown, key: string, results: Record<string, unknown>[], limit: number) {
    if (results.length >= limit || value === null || value === undefined) return;
    if (Array.isArray(value)) {
      for (const item of value) this.collectObjectsByKeyDeep(item, key, results, limit);
      return;
    }
    if (typeof value !== 'object') return;
    const record = value as Record<string, unknown>;
    const nested = this.asObject(record[key]);
    if (nested) results.push(nested);
    for (const nestedValue of Object.values(record)) {
      if (results.length >= limit) break;
      this.collectObjectsByKeyDeep(nestedValue, key, results, limit);
    }
  }
}
