import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { PrismaService } from '../../prisma/prisma.service.js';
import { AgentV2SemanticViewRegistryService } from './agent-v2-semantic-view-registry.service.js';
import type { AgentV2SemanticView, AgentV2TextToSqlCandidate } from './agent-v2-text-to-sql.types.js';

@Injectable()
export class AgentV2TextToSqlCandidateService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly registry: AgentV2SemanticViewRegistryService,
  ) {}

  async listCandidates(input: { limit?: number; minHitCount?: number } = {}) {
    const runs = await this.prisma.agentV2TextToSqlRun.findMany({
      orderBy: { createdAt: 'desc' },
      take: Math.min(Math.max(Number(input.limit) || 500, 20), 2000),
      include: { feedback: true },
    });
    const grouped = new Map<string, any[]>();
    for (const run of runs) {
      const key = this.clusterKey(run);
      grouped.set(key, [...(grouped.get(key) ?? []), run]);
    }
    const minHitCount = Math.max(1, Number(input.minHitCount) || 1);
    return [...grouped.entries()]
      .map(([clusterKey, items]) => this.toCandidate(clusterKey, items))
      .filter((item) => item.hitCount >= minHitCount)
      .sort((a, b) => b.hitCount - a.hitCount || b.successRate - a.successRate);
  }

  async promoteToDraft(input: { clusterKey: string; requestedBy?: number }) {
    const candidates = await this.listCandidates({ minHitCount: 1 });
    const candidate = candidates.find((item) => item.clusterKey === input.clusterKey);
    if (!candidate) throw new NotFoundException('Text-to-SQL candidate not found');
    if (candidate.status !== 'candidate') throw new NotFoundException('Blocked Text-to-SQL cluster cannot be promoted to a capability draft');

    return this.writeDraft(candidate, input.requestedBy);
  }

  async promoteRunToDraft(input: { runId: number; requestedBy?: number }) {
    const target = await this.prisma.agentV2TextToSqlRun.findUnique({
      where: { id: input.runId },
      include: { feedback: true },
    });
    if (!target) throw new NotFoundException('Text-to-SQL audit run not found');
    if (!['success', 'dry_run', 'no_data'].includes(target.status)) {
      throw new BadRequestException('Only successful Text-to-SQL runs can be promoted to a capability draft');
    }

    const clusterKey = this.clusterKey(target);
    const recentRuns = await this.prisma.agentV2TextToSqlRun.findMany({
      orderBy: { createdAt: 'desc' },
      take: 2000,
      include: { feedback: true },
    });
    const clusterRuns = recentRuns.filter((run) => this.clusterKey(run) === clusterKey);
    const candidate = this.toCandidate(
      clusterKey,
      clusterRuns.some((run) => run.id === target.id) ? clusterRuns : [target, ...clusterRuns],
    );
    if (candidate.status !== 'candidate') {
      throw new BadRequestException('Blocked Text-to-SQL run cannot be promoted to a capability draft');
    }

    return this.writeDraft(candidate, input.requestedBy);
  }

  private writeDraft(candidate: AgentV2TextToSqlCandidate, requestedBy?: number) {
    const viewDefs = this.registry.findMany(candidate.selectedViews);
    const fieldPolicies = this.fieldPoliciesFor(viewDefs);
    const permissionCodes = this.permissionCodesFor(viewDefs);
    const storeScope = this.storeScopeFor(viewDefs);
    const executorJson = {
      tool: 'text_to_sql.template',
      queryKey: candidate.suggestedCapabilityId,
      selectedViews: candidate.selectedViews,
      viewDescriptions: viewDefs.map((viewDef) => ({
        viewName: viewDef.viewName,
        domain: viewDef.domain,
        status: viewDef.status,
        defaultTimeField: viewDef.defaultTimeField,
        storeScopeField: viewDef.storeScopeField,
      })),
      fieldPolicies,
      safeSqlHash: candidate.safeSqlHash,
      generatedSqlHash: candidate.generatedSqlHash,
      source: 'text_to_sql_candidate',
    };
    return this.prisma.agentCapabilityDraft.upsert({
      where: { capabilityId: candidate.suggestedCapabilityId },
      create: {
        capabilityId: candidate.suggestedCapabilityId,
        status: 'draft',
        source: 'text_to_sql_candidate',
        displayName: candidate.displayName,
        displayNameZh: candidate.displayName,
        description: `由受控 Text-to-SQL 高频问题沉淀，样例：${candidate.sampleQuestions[0] ?? '-'}`,
        domain: String(candidate.normalizedIntent?.domain ?? candidate.selectedViews[0]?.replace(/^agent_v2_/, '').replace(/_view$/, '') ?? 'text_to_sql'),
        businessObject: candidate.selectedViews[0] ?? 'text_to_sql',
        actionCodes: ['summary', 'analyze'],
        personaCodes: ['manager'],
        releaseStrategy: 'approval_required',
        riskLevel: candidate.riskLevel,
        permissionSource: 'semantic_view_registry',
        permissionCodes,
        sourceModels: candidate.selectedViews,
        outputKinds: ['text', 'table', 'evidence_panel'],
        executorJson,
        storeScope,
        fieldPoliciesJson: fieldPolicies,
        triggerKeywords: candidate.sampleQuestions.slice(0, 5),
        examples: candidate.sampleQuestions.slice(0, 5),
        negativeExamples: [],
        boundaryNotes: [
          '该草稿来自受控 Text-to-SQL 高频候选，不允许直接发布。',
          '发布前必须补齐 QueryPlan 或 template，且通过 dry-run、Eval Gate 和权限校验。',
        ],
        governanceIssues: [{
          code: 'text_to_sql_candidate_needs_governance',
          level: 'warn',
          message: '需要人工治理 SQL 模板、权限和输出契约后才能发布。',
          requestedBy: requestedBy ?? null,
        }],
        scannerFingerprint: candidate.clusterKey,
      },
      update: {
        source: 'text_to_sql_candidate',
        status: 'draft',
        description: `由受控 Text-to-SQL 高频问题沉淀，样例：${candidate.sampleQuestions[0] ?? '-'}`,
        executorJson,
        permissionSource: 'semantic_view_registry',
        permissionCodes,
        sourceModels: candidate.selectedViews,
        storeScope,
        fieldPoliciesJson: fieldPolicies,
        triggerKeywords: candidate.sampleQuestions.slice(0, 5),
        examples: candidate.sampleQuestions.slice(0, 5),
        governanceIssues: [{
          code: 'text_to_sql_candidate_refreshed',
          level: 'warn',
          message: '候选能力已根据最新 Text-to-SQL 聚类刷新，仍需人工治理。',
          requestedBy: requestedBy ?? null,
        }],
        scannerFingerprint: candidate.clusterKey,
      },
    });
  }

  private fieldPoliciesFor(viewDefs: AgentV2SemanticView[]) {
    const policies = new Map<string, { field: string; policy: string; sourceView: string; reason: string }>();
    for (const viewDef of viewDefs) {
      for (const field of viewDef.fields) {
        const key = `${viewDef.viewName}.${field.name}`;
        policies.set(key, {
          field: field.name,
          policy: field.policy,
          sourceView: viewDef.viewName,
          reason: field.policy === 'mask' ? '语义视图仅允许脱敏展示该字段。' : '语义视图字段白名单。',
        });
      }
    }
    return [...policies.values()];
  }

  private permissionCodesFor(viewDefs: AgentV2SemanticView[]) {
    return [...new Set(viewDefs.flatMap((viewDef) => viewDef.requiredPermissions))];
  }

  private storeScopeFor(viewDefs: AgentV2SemanticView[]) {
    const fields = [...new Set(viewDefs.map((viewDef) => viewDef.storeScopeField).filter((value): value is string => Boolean(value)))];
    return fields[0] ?? 'admin_only_or_global';
  }

  private clusterKey(run: any) {
    const selectedViews = this.stringList(run.selectedViewsJson).sort().join('|');
    const intent = this.object(run.normalizedIntentJson);
    const intentKey = [intent.domain, intent.type, intent.metric].filter(Boolean).join(':') || 'unknown';
    return this.sha256([intentKey, selectedViews, run.safeSqlHash ?? run.generatedSqlHash ?? 'no-sql'].join('|'));
  }

  private toCandidate(clusterKey: string, items: any[]): AgentV2TextToSqlCandidate {
    const first = items[0];
    const selectedViews = this.stringList(first.selectedViewsJson);
    const successCount = items.filter((item) => ['success', 'dry_run', 'no_data'].includes(item.status)).length;
    const blockedCount = items.filter((item) => item.status === 'blocked').length;
    const failedCount = items.filter((item) => item.status === 'failed').length;
    const feedback = items.flatMap((item) => item.feedback ?? []);
    const usefulFeedbackCount = feedback.filter((item) => item.isUseful === true).length;
    const normalizedIntent = this.object(first.normalizedIntentJson);
    const hitCount = items.length;
    const blockedRate = hitCount ? blockedCount / hitCount : 0;
    const successRate = hitCount ? successCount / hitCount : 0;
    const feedbackUsefulRate = feedback.length ? usefulFeedbackCount / feedback.length : null;
    const status = blockedRate >= 0.5 || successCount === 0 ? 'blocked_report' : 'candidate';
    return {
      clusterKey,
      normalizedIntent,
      selectedViews,
      safeSqlHash: first.safeSqlHash ?? null,
      generatedSqlHash: first.generatedSqlHash ?? null,
      sampleQuestions: [...new Set(items.map((item) => item.question).filter(Boolean))].slice(0, 8),
      hitCount,
      successCount,
      blockedCount,
      failedCount,
      usefulFeedbackCount,
      feedbackCount: feedback.length,
      successRate,
      blockedRate,
      feedbackUsefulRate,
      riskLevel: selectedViews.some((view) => /customer|user|permission/i.test(view)) ? 'medium' : 'low',
      status,
      reason: status === 'candidate' ? '高频成功问题可进入能力中心待治理。' : '高频阻断问题进入缺视图/缺权限/缺能力报表。',
      suggestedCapabilityId: this.suggestedCapabilityId(normalizedIntent, selectedViews),
      displayName: this.displayName(normalizedIntent, selectedViews),
    };
  }

  private suggestedCapabilityId(intent: Record<string, unknown>, views: string[]) {
    if (views.includes('agent_v2_order_item_sales_view') && intent.type === 'ranking') return 'sales.product-ranking.metric';
    if (views.includes('agent_v2_inventory_scrap_view')) return 'inventory.scrap-ranking.metric';
    const domain = String(intent.domain ?? 'text-to-sql').replace(/_/g, '-');
    const type = String(intent.type ?? 'analysis').replace(/_/g, '-');
    return `${domain}.${type}.text-to-sql`;
  }

  private displayName(intent: Record<string, unknown>, views: string[]) {
    if (views.includes('agent_v2_order_item_sales_view') && intent.type === 'ranking') return '商品销量排行分析';
    if (views.includes('agent_v2_inventory_scrap_view')) return '报废产品排行分析';
    return `${intent.domain ?? '业务'} ${intent.type ?? '分析'}能力`;
  }

  private stringList(value: unknown) {
    if (Array.isArray(value)) return value.map(String).filter(Boolean);
    if (typeof value === 'string') {
      try {
        const parsed = JSON.parse(value);
        return Array.isArray(parsed) ? parsed.map(String).filter(Boolean) : [value].filter(Boolean);
      } catch {
        return [value].filter(Boolean);
      }
    }
    return [];
  }

  private object(value: unknown): Record<string, unknown> {
    return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
  }

  private sha256(value: string) {
    return createHash('sha256').update(value).digest('hex');
  }
}
