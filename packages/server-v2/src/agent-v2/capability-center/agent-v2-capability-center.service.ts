import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { PrismaService } from '../../prisma/prisma.service.js';
import { AgentV2ToolRegistryService } from '../agent-v2-tool-registry.service.js';
import { listAgentV2CapabilityManifests } from '../capability/agent-v2-capability-manifest.js';
import type {
  AgentV2ActionIntent,
  AgentV2CapabilityManifest,
  AgentV2CapabilitySource,
  AgentV2ExecutorType,
  AgentV2ReleaseStrategy,
  AgentV2StoreScope,
} from '../capability/agent-v2-capability.types.js';
import { AgentV2RuntimeService } from '../agent-v2-runtime.service.js';
import { AgentV2ManifestProviderService } from './agent-v2-manifest-provider.service.js';

type DraftReport = {
  generatedAt?: string;
  total?: number;
  drafts?: RawCapabilityDraft[];
};

type RawCapabilityDraft = Record<string, unknown> & {
  capabilityId?: string;
  status?: string;
  source?: string;
  displayName?: string;
  displayNameZh?: string;
  description?: string;
  domain?: string;
  businessObject?: string;
  actions?: unknown[];
  personaCodes?: unknown[];
  releaseStrategy?: string;
  riskLevel?: string;
  permissionSource?: string;
  permissionCodes?: unknown[];
  sourceModels?: unknown[];
  sourceApis?: unknown[];
  sourceDtos?: unknown[];
  sourceRoutes?: unknown[];
  outputKinds?: unknown[];
  executor?: unknown;
  customServiceReason?: string;
  storeScope?: string;
  fieldPolicies?: unknown[];
  triggerKeywords?: unknown[];
  examples?: unknown[];
  negativeExamples?: unknown[];
  boundaryNotes?: unknown[];
  governanceIssues?: unknown[];
};

type ValidationIssue = {
  code: string;
  level: 'block' | 'warn';
  message: string;
  suggestion?: string;
};

const DEFAULT_DRAFT_REPORT = 'docs/04-测试数据/Agent评测与知识治理-2026-06-30至07-03/agent-v2-capability-drafts.json';
const DEFAULT_EVAL_DRAFT_REPORT = 'docs/04-测试数据/Agent评测与知识治理-2026-06-30至07-03/agent-v2-eval-drafts.json';
const DEFAULT_GOVERNANCE_REPORT = 'docs/04-测试数据/Agent评测与知识治理-2026-06-30至07-03/agent-v2-capability-governance-report.json';

type DryRunIssue = {
  code: string;
  level: 'block' | 'warn' | 'pass';
  message: string;
  suggestion?: string;
};

type EvalDraft = {
  id: string;
  question: string;
  expectedCapabilityId: string;
  permissionResult: 'allow' | 'deny' | 'needs_review' | string;
  contractResult: 'pass' | 'needs_review' | 'blocked' | string;
  failureCategory: string;
  priority: 'P0' | 'P1' | 'P2' | 'P3' | string;
};

type EvalGate = {
  gate: string;
  expected: string;
  actual: string;
  pass: boolean;
  level: 'block' | 'warn' | 'pass';
};

type GovernanceGateItem = {
  capabilityId?: string;
  displayName?: string;
  domain?: string;
  releaseStrategy?: string;
  riskLevel?: string;
};

@Injectable()
export class AgentV2CapabilityCenterService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly toolRegistry: AgentV2ToolRegistryService,
    private readonly manifestProvider: AgentV2ManifestProviderService,
    private readonly runtime: AgentV2RuntimeService,
  ) {}

  async listDrafts(query: {
    page?: number;
    pageSize?: number;
    keyword?: string;
    status?: string;
    domain?: string;
    riskLevel?: string;
    releaseStrategy?: string;
  }) {
    const page = this.toPositiveInt(query.page, 1);
    const pageSize = Math.min(this.toPositiveInt(query.pageSize, 20), 100);
    const where: Record<string, unknown> = {};
    if (query.status && query.status !== 'all') where.status = query.status;
    if (query.domain && query.domain !== 'all') where.domain = query.domain;
    if (query.riskLevel && query.riskLevel !== 'all') where.riskLevel = query.riskLevel;
    if (query.releaseStrategy && query.releaseStrategy !== 'all') where.releaseStrategy = query.releaseStrategy;
    if (query.keyword) {
      where.OR = [
        { capabilityId: { contains: query.keyword, mode: 'insensitive' } },
        { displayName: { contains: query.keyword, mode: 'insensitive' } },
        { displayNameZh: { contains: query.keyword, mode: 'insensitive' } },
        { description: { contains: query.keyword, mode: 'insensitive' } },
      ];
    }

    const [items, total, stats] = await Promise.all([
      this.prisma.agentCapabilityDraft.findMany({
        where,
        orderBy: [{ status: 'asc' }, { updatedAt: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.agentCapabilityDraft.count({ where }),
      this.getDraftStats(),
    ]);

    return {
      items: items.map((item) => this.toDraftDto(item)),
      total,
      page,
      pageSize,
      stats,
      activeManifestVersion: this.manifestProvider.getActiveVersion(),
    };
  }

  async getDraft(capabilityId: string) {
    const draft = await this.findDraft(capabilityId);
    return {
      ...this.toDraftDto(draft),
      validation: await this.validateDraft(capabilityId),
      reviews: await this.prisma.agentCapabilityReview.findMany({
        where: { capabilityId },
        orderBy: { createdAt: 'desc' },
        take: 20,
      }),
    };
  }

  async importDrafts(input: { path?: string; limit?: number; overwriteReviewed?: boolean; capabilityIds?: string[] } = {}) {
    const path = this.resolveWorkspacePath(input.path || DEFAULT_DRAFT_REPORT);
    if (!existsSync(path)) throw new NotFoundException(`候选能力草稿文件不存在：${input.path || DEFAULT_DRAFT_REPORT}`);

    const report = JSON.parse(readFileSync(path, 'utf8')) as DraftReport;
    const capabilityIdFilter = new Set((input.capabilityIds ?? []).map(String).filter(Boolean));
    const drafts = (report.drafts ?? []).filter((item) => {
      if (!item.capabilityId) return false;
      if (!capabilityIdFilter.size) return true;
      return capabilityIdFilter.has(String(item.capabilityId));
    });
    const limit = input.limit ? Math.min(this.toPositiveInt(input.limit, drafts.length), drafts.length) : drafts.length;
    const selected = [
      ...drafts.slice(0, limit),
      ...listAgentV2CapabilityManifests().map((manifest) => this.manifestToDraft(manifest)),
    ];

    let created = 0;
    let updated = 0;
    let skipped = 0;
    let deprecated = 0;
    for (const raw of selected) {
      const capabilityId = String(raw.capabilityId);
      const existing = await this.prisma.agentCapabilityDraft.findUnique({ where: { capabilityId } });
      if (existing && !input.overwriteReviewed && ['approved', 'published', 'rejected'].includes(existing.status)) {
        skipped += 1;
        continue;
      }
      const data = this.toDraftWriteData(raw);
      await this.prisma.agentCapabilityDraft.upsert({
        where: { capabilityId },
        create: data,
        update: data,
      });
      if (existing) updated += 1;
      else created += 1;
      await this.upsertQueryKeyFromDraft(raw);
    }
    if (!input.limit && !capabilityIdFilter.size) {
      const deprecatedResult = await this.prisma.agentCapabilityDraft.updateMany({
        where: {
          source: 'auto_scan_draft',
          capabilityId: { notIn: selected.map((item) => String(item.capabilityId)) },
          status: { notIn: ['published', 'rejected', 'deprecated'] },
        },
        data: { status: 'deprecated' },
      });
      deprecated = Number(deprecatedResult.count ?? 0);
    }

    return {
      source: input.path || DEFAULT_DRAFT_REPORT,
      reportGeneratedAt: report.generatedAt,
      reportTotal: report.total ?? drafts.length,
      imported: selected.length,
      scannedImported: Math.min(limit, drafts.length),
      builtinImported: listAgentV2CapabilityManifests().length,
      created,
      updated,
      skipped,
      deprecated,
    };
  }

  async updateDraft(capabilityId: string, input: Partial<RawCapabilityDraft>) {
    await this.findDraft(capabilityId);
    const data = this.toDraftWriteData({ ...input, capabilityId });
    const updated = await this.prisma.agentCapabilityDraft.update({
      where: { capabilityId },
      data: {
        ...data,
        status: String(input.status ?? data.status ?? 'draft'),
      },
    });
    return this.toDraftDto(updated);
  }

  async validateDraft(capabilityId: string) {
    const draft = await this.findDraft(capabilityId);
    const manifest = this.toManifest(draft);
    const issues: ValidationIssue[] = [];

    if (!manifest.permissionCodes.length) {
      issues.push({
        code: 'missing_permission',
        level: 'block',
        message: '缺少权限码，不能进入正式能力目录。',
        suggestion: '从接口装饰器或领域权限中补齐 permissionCodes。',
      });
    }
    if (!manifest.executor.tool || !this.toolRegistry.get(manifest.executor.tool)) {
      issues.push({
        code: 'missing_registered_tool',
        level: 'block',
        message: `执行工具未注册：${manifest.executor.tool || '空'}`,
        suggestion: '绑定到 business.record.query / business.metric.query 等通用工具，或补齐新工具。',
      });
    }
    if (!manifest.executor.queryKey) {
      issues.push({
        code: 'missing_query_key',
        level: 'warn',
        message: '缺少 queryKey，运行时只能按工具默认逻辑处理。',
        suggestion: '为能力生成稳定 queryKey 并登记到工具 QueryKey Registry。',
      });
    }
    if (manifest.executor.type === 'custom_service' && !manifest.customServiceReason?.trim()) {
      issues.push({
        code: 'missing_custom_service_reason',
        level: 'block',
        message: '专用服务能力缺少保留专用逻辑的原因，不能进入正式能力目录。',
        suggestion: '补充 customServiceReason，说明为何不能由 GenericQueryEngine 或通用工具直接承接。',
      });
    }
    if (!manifest.outputKinds.length) {
      issues.push({
        code: 'missing_output_kind',
        level: 'block',
        message: '缺少输出契约，无法约束最终回复形态。',
        suggestion: '至少选择 table、kpi、chart、evidence_panel 或 action_card 之一。',
      });
    }
    if (manifest.riskLevel === 'high' && manifest.releaseStrategy === 'auto_publish') {
      issues.push({
        code: 'high_risk_auto_publish',
        level: 'block',
        message: '高风险能力不能自动发布。',
        suggestion: '改为 approval_required 或 write_blocked。',
      });
    }
    if (manifest.releaseStrategy === 'write_blocked' && !manifest.actions.includes('draft')) {
      issues.push({
        code: 'write_blocked_without_draft',
        level: 'warn',
        message: '写入阻断类能力建议只生成草稿，不直接执行业务写入。',
        suggestion: '把动作调整为 draft，最终执行仍走人工确认。',
      });
    }

    return {
      capabilityId,
      pass: issues.every((item) => item.level !== 'block'),
      issues,
      manifest,
    };
  }

  async dryRunDraft(capabilityId: string, input: { storeId?: number; userId?: number } = {}) {
    const draft = await this.findDraft(capabilityId);
    const manifest = this.toManifest(draft);
    const toolName = manifest.executor.tool;
    const queryKey = manifest.executor.queryKey;
    const issues: DryRunIssue[] = [];
    const registry = queryKey
      ? await this.prisma.agentToolQueryKeyRegistry.findUnique({ where: { queryKey } })
      : null;

    if (!queryKey) {
      issues.push({
        code: 'missing_query_key',
        level: 'block',
        message: '缺少 queryKey，不能证明能力能被稳定路由到工具执行。',
        suggestion: '先为能力生成稳定 queryKey，并进入 QueryKey 工具登记表。',
      });
    }
    if (!toolName || !this.toolRegistry.get(toolName)) {
      issues.push({
        code: 'missing_registered_tool',
        level: 'block',
        message: `执行工具未注册：${toolName || '空'}`,
        suggestion: '绑定到已注册的 Agent V2 通用工具，或先补齐工具实现。',
      });
    }
    if (queryKey && !registry) {
      issues.push({
        code: 'missing_query_key_registry',
        level: 'block',
        message: `queryKey 未登记：${queryKey}`,
        suggestion: '重新导入候选草稿或手动登记 queryKey、工具、权限和输出契约。',
      });
    }
    if (registry && registry.toolName !== toolName) {
      issues.push({
        code: 'query_key_tool_mismatch',
        level: 'block',
        message: `queryKey 登记工具为 ${registry.toolName}，草稿工具为 ${toolName}。`,
        suggestion: '以 QueryKey Registry 为准修正草稿工具，或更新登记表后再发布。',
      });
    }

    let toolResult: Record<string, unknown> | null = null;
    if (!issues.some((issue) => issue.level === 'block') && toolName) {
      try {
        const result = await this.toolRegistry.execute(
          toolName,
          {
            capabilityId,
            queryKey,
            limit: 1,
            timeRange: 'today',
            dryRun: true,
            question: manifest.examples?.[0] ?? manifest.displayName,
          },
          {
            runId: 0,
            storeId: this.toPositiveInt(input.storeId, 1),
            userId: input.userId,
            role: 'manager',
          },
        );
        toolResult = {
          status: result.status,
          title: result.title,
          summary: result.summary,
          evidence: result.evidence,
        };
        if (result.status === 'unsupported') {
          issues.push({
            code: 'tool_capability_unsupported',
            level: 'block',
            message: `工具已注册，但内部尚未支持该 capabilityId：${capabilityId}`,
            suggestion: '在对应通用工具中补齐 capabilityId 分支，或调整草稿绑定到已实现能力。',
          });
        } else {
          issues.push({
            code: 'tool_contract_pass',
            level: 'pass',
            message: `工具 dry-run 已返回 ${result.status}，具备运行时执行入口。`,
          });
        }
      } catch (error) {
        issues.push({
          code: 'tool_execution_error',
          level: 'block',
          message: `工具 dry-run 执行失败：${error instanceof Error ? error.message : String(error)}`,
          suggestion: '先修复工具运行依赖、查询表或数据源，再发布能力。',
        });
      }
    }

    const pass = issues.every((issue) => issue.level !== 'block');
    if (queryKey && registry) {
      await this.prisma.agentToolQueryKeyRegistry.update({
        where: { queryKey },
        data: {
          status: pass ? 'implemented' : 'needs_development',
          validationJson: this.toJson({
            checkedAt: new Date().toISOString(),
            capabilityId,
            pass,
            issues,
            toolResult,
          }),
        },
      });
    }

    return {
      capabilityId,
      queryKey,
      toolName,
      status: pass ? 'pass' : 'blocked',
      pass,
      checkedAt: new Date(),
      registry: registry
        ? {
            status: registry.status,
            source: registry.source,
            implementationRef: registry.implementationRef,
          }
        : null,
      issues,
      toolResult,
    };
  }

  async runPostPublishSmokeTest(
    capabilityId: string,
    input: { storeId?: number; userId?: number; question?: string } = {},
  ) {
    const checkedAt = new Date();
    const draft = await this.findDraft(capabilityId);
    const manifest = this.toManifest(draft);
    const question = String(input.question || manifest.examples?.[0] || `${manifest.displayName} 查询`).trim();
    const storeId = this.toPositiveInt(input.storeId, 1);
    const issues: DryRunIssue[] = [];
    const toolResults: Array<{
      tool: string;
      status: string;
      title: string;
      summary: string;
      evidence?: unknown;
    }> = [];

    await this.manifestProvider.refreshFromDatabase();

    if (draft.status !== 'published') {
      issues.push({
        code: 'draft_not_published',
        level: 'block',
        message: '该能力尚未发布，Agent V2 当前 Manifest 不会稳定使用它。',
        suggestion: '先发布能力，再执行发布后烟测。',
      });
    }

    const runtimePlan = this.runtime.plan({
      message: question,
      actor: {
        storeId,
        userId: input.userId,
        role: 'manager',
        entrypoint: 'agent_capability_center_smoke_test',
        personaCode: 'manager',
      },
      context: {
        smokeTest: true,
        expectedCapabilityId: capabilityId,
      },
    });

    const selectedCapabilityId = runtimePlan?.decision.selected?.capabilityId ?? null;
    if (!runtimePlan) {
      issues.push({
        code: 'runtime_plan_missing',
        level: 'block',
        message: 'Agent V2 没有为代表问题生成可执行计划。',
        suggestion: '检查能力样例问题、触发词、工具绑定和 Agent V2 开关。',
      });
    } else if (selectedCapabilityId !== capabilityId) {
      issues.push({
        code: 'capability_route_mismatch',
        level: 'block',
        message: `代表问题命中了 ${selectedCapabilityId || '空能力'}，未命中当前能力。`,
        suggestion: '补充更贴近业务问法的 examples / triggerKeywords，或调整能力边界避免与其他能力冲突。',
      });
    } else if (!runtimePlan.plan.toolPlan.length) {
      issues.push({
        code: 'runtime_tool_plan_missing',
        level: 'block',
        message: 'Agent V2 命中了能力，但没有生成工具执行计划。',
        suggestion: '检查 executor.tool、executor.queryKey 和工具注册表。',
      });
    } else {
      for (const item of runtimePlan.plan.toolPlan) {
        try {
          const result = await this.runtime.executeTool(
            item.tool,
            {
              ...item.args,
              capabilityId: item.args.capabilityId ?? capabilityId,
              queryKey: item.args.queryKey ?? manifest.executor.queryKey,
              limit: item.args.limit ?? 1,
              dryRun: true,
              question,
            },
            {
              runId: 0,
              storeId,
              userId: input.userId,
              role: 'manager',
            },
          );
          toolResults.push({
            tool: item.tool,
            status: result.status,
            title: result.title,
            summary: result.summary,
            evidence: result.evidence,
          });
          if (result.status === 'unsupported' || result.status === 'failed') {
            issues.push({
              code: 'runtime_tool_execution_failed',
              level: 'block',
              message: `工具 ${item.tool} 执行结果为 ${result.status}：${result.summary}`,
              suggestion: '先修复工具 queryKey 分支或底层数据查询，再让该能力对 Agent V2 可用。',
            });
          }
        } catch (error) {
          issues.push({
            code: 'runtime_tool_execution_error',
            level: 'block',
            message: `工具执行异常：${error instanceof Error ? error.message : String(error)}`,
            suggestion: '检查工具实现、数据源和权限上下文。',
          });
        }
      }
      if (!issues.some((issue) => issue.level === 'block')) {
        issues.push({
          code: 'post_publish_smoke_pass',
          level: 'pass',
          message: '代表问题已命中当前能力，且工具 dry-run 可返回授权后的证据包。',
        });
      }
    }

    const pass = issues.every((issue) => issue.level !== 'block');
    return {
      capabilityId,
      pass,
      checkedAt,
      question,
      selectedCapabilityId,
      confidence: runtimePlan?.decision.confidence ?? 0,
      routeReason: runtimePlan?.decision.reason ?? '',
      activeManifestVersion: this.manifestProvider.getActiveVersion(),
      toolResults,
      issues,
    };
  }

  async runEvalGate(input: { capabilityIds?: string[] } = {}) {
    const generatedAt = new Date();
    const evalDrafts = this.readEvalDrafts();
    const governance = this.readGovernanceReport();
    const capabilitySet = new Set((input.capabilityIds ?? []).filter(Boolean));
    const scoped = capabilitySet.size
      ? evalDrafts.filter((draft) => capabilitySet.has(draft.expectedCapabilityId))
      : evalDrafts;
    const p0 = scoped.filter((draft) => draft.priority === 'P0');
    const p0Unmapped = p0.filter((draft) => draft.expectedCapabilityId.endsWith('.unmapped.eval_candidate'));
    const p0PermissionNeedsReview = p0.filter((draft) => draft.permissionResult !== 'allow');
    const p0ContractNotPass = p0.filter((draft) => draft.contractResult !== 'pass');
    const p0WrongRouteRisk = p0.filter((draft) => ['能力缺失', '语义错路由'].includes(draft.failureCategory));
    const highRiskAutoPublish = this.filterGovernanceItems(governance?.gates?.highRiskAutoPublish, capabilitySet);
    const inferredPermission = this.filterGovernanceItems(governance?.gates?.inferredPermission, capabilitySet);
    const gates: EvalGate[] = [
      {
        gate: 'P0 问题错路由率',
        expected: '0 个能力缺失或语义错路由',
        actual: `${p0WrongRouteRisk.length} / ${p0.length}`,
        pass: p0WrongRouteRisk.length === 0,
        level: p0WrongRouteRisk.length === 0 ? 'pass' : 'block',
      },
      {
        gate: 'P0 支持问题契约',
        expected: '全部 pass',
        actual: `${p0ContractNotPass.length} 个未通过`,
        pass: p0ContractNotPass.length === 0,
        level: p0ContractNotPass.length === 0 ? 'pass' : 'block',
      },
      {
        gate: 'P0 权限确认',
        expected: '全部 allow',
        actual: `${p0PermissionNeedsReview.length} 个需要复核`,
        pass: p0PermissionNeedsReview.length === 0,
        level: p0PermissionNeedsReview.length === 0 ? 'pass' : 'block',
      },
      {
        gate: '高风险自动发布',
        expected: '0 个',
        actual: `${highRiskAutoPublish.length} 个样例`,
        pass: highRiskAutoPublish.length === 0,
        level: highRiskAutoPublish.length === 0 ? 'pass' : 'block',
      },
      {
        gate: '评测覆盖',
        expected: '发布能力至少能关联到评测题或进入后续补题待办',
        actual: capabilitySet.size ? `${scoped.length} / ${capabilitySet.size} 个关联评测样例` : `${scoped.length} 个评测样例`,
        pass: true,
        level: scoped.length ? 'pass' : 'warn',
      },
      {
        gate: '候选草稿权限绑定',
        expected: '推断权限进入治理待办，不阻断已发布能力门禁',
        actual: `${inferredPermission.length} 个候选草稿需补权限`,
        pass: true,
        level: inferredPermission.length ? 'warn' : 'pass',
      },
    ];

    return {
      generatedAt,
      pass: gates.every((gate) => gate.pass),
      scope: capabilitySet.size ? 'selected' : 'all',
      capabilityIds: Array.from(capabilitySet),
      source: {
        evalDrafts: DEFAULT_EVAL_DRAFT_REPORT,
        governance: DEFAULT_GOVERNANCE_REPORT,
      },
      summary: {
        totalQuestions: evalDrafts.length,
        scopedQuestions: scoped.length,
        p0Questions: p0.length,
        p0Unmapped: p0Unmapped.length,
        p0PermissionNeedsReview: p0PermissionNeedsReview.length,
        p0ContractNotPass: p0ContractNotPass.length,
        p0WrongRouteRisk: p0WrongRouteRisk.length,
        highRiskAutoPublish: highRiskAutoPublish.length,
        inferredPermission: inferredPermission.length,
      },
      gates,
      samples: {
        p0Unmapped: this.summarizeEvalSamples(p0Unmapped),
        p0PermissionNeedsReview: this.summarizeEvalSamples(p0PermissionNeedsReview),
        p0ContractNotPass: this.summarizeEvalSamples(p0ContractNotPass),
        p0WrongRouteRisk: this.summarizeEvalSamples(p0WrongRouteRisk),
        highRiskAutoPublish: highRiskAutoPublish.slice(0, 20),
        inferredPermission: inferredPermission.slice(0, 20),
      },
    };
  }

  async reviewDraft(input: { capabilityId: string; decision: string; comment?: string; changes?: Partial<RawCapabilityDraft>; reviewerId?: number }) {
    const current = await this.findDraft(input.capabilityId);
    const statusByDecision: Record<string, string> = {
      approve: 'approved',
      reject: 'rejected',
      needs_changes: 'needs_changes',
      draft: 'draft',
    };
    const nextStatus = statusByDecision[input.decision] ?? input.decision;
    const updateData = input.changes ? this.toDraftWriteData({ ...input.changes, capabilityId: input.capabilityId }) : {};

    const [updated] = await this.prisma.$transaction([
      this.prisma.agentCapabilityDraft.update({
        where: { capabilityId: input.capabilityId },
        data: {
          ...updateData,
          status: nextStatus,
          reviewedBy: input.reviewerId ?? current.reviewedBy,
          reviewedAt: new Date(),
        },
      }),
      this.prisma.agentCapabilityReview.create({
        data: {
          draftId: current.id,
          capabilityId: input.capabilityId,
          decision: input.decision,
          comment: input.comment,
          changesJson: this.toJson(input.changes),
          reviewerId: input.reviewerId,
        },
      }),
    ]);

    return this.toDraftDto(updated);
  }

  async publish(input: { capabilityIds?: string[]; mode?: 'selected' | 'approved' | 'auto'; title?: string; summary?: string; publishedBy?: number }) {
    const where = this.publishWhere(input);
    const drafts = await this.prisma.agentCapabilityDraft.findMany({ where, orderBy: { updatedAt: 'desc' } });
    if (!drafts.length) throw new BadRequestException('没有可发布的候选能力。');

    const validations = await Promise.all(drafts.map((draft) => this.validateDraft(draft.capabilityId)));
    const blocked = validations.filter((item) => !item.pass);
    if (blocked.length) {
      throw new BadRequestException({
        message: '存在未通过预检的能力，不能发布。',
        blocked: blocked.map((item) => ({
          capabilityId: item.capabilityId,
          issues: item.issues,
        })),
      });
    }

    const dryRuns = await Promise.all(drafts.map((draft) => this.dryRunDraft(draft.capabilityId, { userId: input.publishedBy })));
    const blockedDryRuns = dryRuns.filter((item) => !item.pass);
    if (blockedDryRuns.length) {
      const runNo = `agent-cap-pub-${Date.now()}`;
      await this.prisma.agentCapabilityPublishRun.create({
        data: {
          runNo,
          status: 'failed',
          requestedBy: input.publishedBy,
          inputJson: this.toJson(input),
          resultJson: this.toJson({ dryRuns: blockedDryRuns }),
          completedAt: new Date(),
          errorMessage: 'queryKey dry-run 未通过。',
        },
      });
      throw new BadRequestException({
        message: 'queryKey dry-run 未通过，不能发布。',
        blocked: blockedDryRuns.map((item) => ({
          capabilityId: item.capabilityId,
          issues: item.issues,
        })),
      });
    }

    const evalGate = await this.runEvalGate({ capabilityIds: drafts.map((draft) => draft.capabilityId) });
    if (!evalGate.pass) {
      const runNo = `agent-cap-pub-${Date.now()}`;
      await this.prisma.agentCapabilityPublishRun.create({
        data: {
          runNo,
          status: 'failed',
          requestedBy: input.publishedBy,
          inputJson: this.toJson(input),
          resultJson: this.toJson({ evalGate }),
          completedAt: new Date(),
          errorMessage: 'Eval Gate 未通过。',
        },
      });
      throw new BadRequestException({
        message: 'Eval Gate 未通过，不能发布。',
        evalGate,
      });
    }

    const runNo = `agent-cap-pub-${Date.now()}`;
    const versionName = `cap-${this.formatTimestamp(new Date())}`;
    const manifests = drafts.map((draft) => this.toManifest(draft));
    const activeStatic = listAgentV2CapabilityManifests();
    const merged = new Map<string, AgentV2CapabilityManifest>();
    for (const item of activeStatic) merged.set(item.capabilityId, item);
    for (const item of manifests) merged.set(item.capabilityId, item);
    const allManifests = Array.from(merged.values());

    const result = await this.prisma.$transaction(async (tx) => {
      const run = await tx.agentCapabilityPublishRun.create({
        data: {
          runNo,
          status: 'running',
          requestedBy: input.publishedBy,
          inputJson: this.toJson(input),
        },
      });
      await tx.agentCapabilityManifestVersion.updateMany({
        where: { status: 'active' },
        data: { status: 'archived' },
      });
      const version = await tx.agentCapabilityManifestVersion.create({
        data: {
          version: versionName,
          status: 'active',
          source: 'capability_center',
          title: input.title ?? `Agent V2 能力发布 ${versionName}`,
          summary: input.summary,
          itemCount: allManifests.length,
          autoPublishedCount: allManifests.filter((item) => item.releaseStrategy === 'auto_publish').length,
          approvalRequiredCount: allManifests.filter((item) => item.releaseStrategy === 'approval_required').length,
          writeBlockedCount: allManifests.filter((item) => item.releaseStrategy === 'write_blocked').length,
          publishedBy: input.publishedBy,
          publishedAt: new Date(),
        },
      });
      await tx.agentCapabilityManifestItem.createMany({
        data: allManifests.map((manifest) => ({
          versionId: version.id,
          capabilityId: manifest.capabilityId,
          status: manifest.status,
          source: manifest.source,
          releaseStrategy: manifest.releaseStrategy,
          riskLevel: manifest.riskLevel,
          permissionCodes: this.toJson(manifest.permissionCodes) ?? [],
          manifestJson: this.toJson(manifest) ?? {},
          draftId: drafts.find((draft) => draft.capabilityId === manifest.capabilityId)?.id,
        })),
      });
      await tx.agentCapabilityDraft.updateMany({
        where: { capabilityId: { in: drafts.map((draft) => draft.capabilityId) } },
        data: { status: 'published', publishedAt: new Date() },
      });
      await tx.agentCapabilityPublishRun.update({
        where: { id: run.id },
        data: {
          status: 'completed',
          targetVersionId: version.id,
          completedAt: new Date(),
          resultJson: this.toJson({ version: version.version, itemCount: allManifests.length, publishedDraftCount: drafts.length, dryRuns, evalGate }),
        },
      });
      return { run, version };
    });

    await this.manifestProvider.refreshFromDatabase();
    return {
      version: result.version.version,
      itemCount: allManifests.length,
      publishedDraftCount: drafts.length,
      publishedCapabilityIds: drafts.map((draft) => draft.capabilityId),
      activeManifestVersion: this.manifestProvider.getActiveVersion(),
    };
  }

  async listVersions() {
    const versions = await this.prisma.agentCapabilityManifestVersion.findMany({
      orderBy: { createdAt: 'desc' },
      take: 30,
    });
    return versions;
  }

  async activateVersion(id: number) {
    const version = await this.prisma.agentCapabilityManifestVersion.findUnique({ where: { id } });
    if (!version) throw new NotFoundException('Manifest 版本不存在。');
    await this.prisma.$transaction([
      this.prisma.agentCapabilityManifestVersion.updateMany({
        where: { status: 'active' },
        data: { status: 'archived' },
      }),
      this.prisma.agentCapabilityManifestVersion.update({
        where: { id },
        data: { status: 'active', publishedAt: version.publishedAt ?? new Date() },
      }),
    ]);
    await this.manifestProvider.refreshFromDatabase();
    return { activeManifestVersion: version.version };
  }

  async listQueryKeys(query: { status?: string; domain?: string }) {
    const where: Record<string, unknown> = {};
    if (query.status && query.status !== 'all') where.status = query.status;
    if (query.domain && query.domain !== 'all') where.domain = query.domain;
    return this.prisma.agentToolQueryKeyRegistry.findMany({
      where,
      orderBy: [{ status: 'asc' }, { updatedAt: 'desc' }],
      take: 200,
    });
  }

  private async findDraft(capabilityId: string) {
    const draft = await this.prisma.agentCapabilityDraft.findUnique({ where: { capabilityId } });
    if (!draft) throw new NotFoundException(`候选能力不存在：${capabilityId}`);
    return draft;
  }

  private publishWhere(input: { capabilityIds?: string[]; mode?: 'selected' | 'approved' | 'auto' }) {
    const capabilityFilter = input.capabilityIds?.length ? { capabilityId: { in: input.capabilityIds } } : {};
    if (input.mode === 'auto') return { ...capabilityFilter, status: { in: ['draft', 'approved'] }, releaseStrategy: 'auto_publish' };
    if (input.capabilityIds?.length) return capabilityFilter;
    return { status: 'approved' };
  }

  private async getDraftStats() {
    const [groups, total, executorItems] = await Promise.all([
      this.prisma.agentCapabilityDraft.groupBy({
        by: ['status'],
        _count: { _all: true },
      }),
      this.prisma.agentCapabilityDraft.count(),
      this.prisma.agentCapabilityDraft.findMany({
        select: { executorJson: true },
        take: 1000,
      }),
    ]);
    const byExecutorType = (executorItems as Array<{ executorJson?: unknown }>).reduce<Record<string, number>>((acc, item) => {
      const executor = this.asObject(item.executorJson);
      const type = String(executor?.type ?? 'unknown');
      acc[type] = (acc[type] ?? 0) + 1;
      return acc;
    }, {});
    return {
      total,
      byStatus: Object.fromEntries(groups.map((item) => [item.status, item._count._all])),
      byExecutorType,
      customServiceTotal: byExecutorType.custom_service ?? 0,
    };
  }

  private toDraftWriteData(raw: RawCapabilityDraft) {
    const executor = this.asObject(raw.executor);
    const customServiceReason = String(raw.customServiceReason ?? executor?.customServiceReason ?? '').trim();
    if (executor && customServiceReason) executor.customServiceReason = customServiceReason;
    const classification = this.classifyDraft(raw, executor);
    return {
      capabilityId: String(raw.capabilityId),
      status: String(raw.status ?? classification.status),
      source: String(raw.source ?? 'auto_scan_draft'),
      displayName: String(raw.displayName ?? raw.capabilityId),
      displayNameZh: raw.displayNameZh ? String(raw.displayNameZh) : undefined,
      description: raw.description ? String(raw.description) : undefined,
      domain: String(raw.domain ?? 'unknown'),
      businessObject: String(raw.businessObject ?? 'Unknown'),
      actionCodes: this.toJson(this.stringArray(raw.actions)),
      personaCodes: this.toJson(this.stringArray(raw.personaCodes)),
      releaseStrategy: String(raw.releaseStrategy ?? classification.releaseStrategy),
      riskLevel: String(raw.riskLevel ?? 'low'),
      permissionSource: raw.permissionSource ? String(raw.permissionSource) : undefined,
      permissionCodes: this.toJson(this.stringArray(raw.permissionCodes)),
      sourceModels: this.toJson(this.stringArray(raw.sourceModels)),
      sourceApis: this.toJson(this.stringArray(raw.sourceApis)),
      sourceDtos: this.toJson(this.stringArray(raw.sourceDtos)),
      sourceRoutes: this.toJson(this.stringArray(raw.sourceRoutes)),
      outputKinds: this.toJson(this.stringArray(raw.outputKinds)),
      executorJson: this.toJson(executor),
      storeScope: raw.storeScope ? String(raw.storeScope) : undefined,
      fieldPoliciesJson: this.toJson(Array.isArray(raw.fieldPolicies) ? raw.fieldPolicies : undefined),
      triggerKeywords: this.toJson(this.stringArray(raw.triggerKeywords)),
      examples: this.toJson(this.stringArray(raw.examples)),
      negativeExamples: this.toJson(this.stringArray(raw.negativeExamples)),
      boundaryNotes: this.toJson(this.stringArray(raw.boundaryNotes)),
      governanceIssues: this.toJson([
        ...(Array.isArray(raw.governanceIssues) ? raw.governanceIssues : []),
        ...classification.governanceIssues,
      ]),
      scannerFingerprint: this.fingerprint(raw),
    };
  }

  private classifyDraft(raw: RawCapabilityDraft, executor: Record<string, unknown> | null) {
    const permissionCodes = this.stringArray(raw.permissionCodes);
    const sourceApis = this.stringArray(raw.sourceApis);
    const actions = this.stringArray(raw.actions);
    const outputKinds = this.stringArray(raw.outputKinds);
    const executorType = String(executor?.type ?? '');
    const queryKey = executor?.queryKey ? String(executor.queryKey) : '';
    const customServiceReason = String(executor?.customServiceReason ?? raw.customServiceReason ?? '').trim();
    const missingCustomServiceReason = executorType === 'custom_service' && !customServiceReason;
    const usedStrategyDefault = raw.releaseStrategy === undefined || raw.releaseStrategy === null || raw.releaseStrategy === '';
    const usedStatusDefault = raw.status === undefined || raw.status === null || raw.status === '';
    const draftLike = executorType === 'business_action_draft' || actions.includes('draft');
    const writeBlocked = !draftLike && this.isWriteBlockedDraft(raw, sourceApis, actions);
    const releaseStrategy: AgentV2ReleaseStrategy = writeBlocked
      ? 'write_blocked'
      : draftLike
        ? 'approval_required'
        : this.isAutoPublishDraft(sourceApis, executorType, outputKinds, actions)
          ? 'auto_publish'
          : 'approval_required';
    const status = !permissionCodes.length || missingCustomServiceReason
      ? 'needs_review'
      : this.requiresQueryKey(executorType) && !queryKey
        ? 'needs_development'
        : 'draft';
    const governanceIssues: Array<{ code: string; level: 'info' | 'warn' | 'block'; message: string }> = [];
    if (usedStrategyDefault || usedStatusDefault) {
      governanceIssues.push({
        code: 'auto_classification_applied',
        level: 'info',
        message: `自动分类：releaseStrategy=${releaseStrategy}, status=${status}`,
      });
    }
    if (!permissionCodes.length) {
      governanceIssues.push({
        code: 'missing_permission_needs_review',
        level: 'warn',
        message: '缺少明确权限码，进入 needs_review，不允许自动发布。',
      });
    }
    if (status === 'needs_development') {
      governanceIssues.push({
        code: 'query_key_needs_development',
        level: 'warn',
        message: '缺少 queryKey，进入 needs_development，等待工具登记和 dry-run。',
      });
    }
    if (missingCustomServiceReason) {
      governanceIssues.push({
        code: 'missing_custom_service_reason',
        level: 'block',
        message: '专用服务缺少保留原因，进入 needs_review，不能自动发布。',
      });
    }
    if (writeBlocked) {
      governanceIssues.push({
        code: 'write_operation_blocked',
        level: 'block',
        message: '疑似写入、删除、发券或下发能力，默认 write_blocked。',
      });
    }
    return { releaseStrategy, status, governanceIssues };
  }

  private isAutoPublishDraft(
    sourceApis: string[],
    executorType: string,
    outputKinds: string[],
    actions: string[],
  ) {
    if (executorType === 'navigation') return true;
    if (sourceApis.some((api) => /^get\s+/i.test(api.trim()))) return true;
    if (['business_record_query', 'business_metric_query', 'business_trend_query', 'business_detail_query', 'business_query', 'custom_service'].includes(executorType)) {
      return true;
    }
    if (outputKinds.some((kind) => ['table', 'kpi', 'chart', 'evidence_panel'].includes(kind))) return true;
    return actions.some((action) => ['lookup', 'list', 'summary', 'analyze', 'diagnose', 'recommend'].includes(action));
  }

  private isWriteBlockedDraft(raw: RawCapabilityDraft, sourceApis: string[], actions: string[]) {
    if (String(raw.riskLevel ?? '') === 'high') return true;
    const writeApi = sourceApis.some((api) => /^(post|put|patch|delete)\s+/i.test(api.trim()) && !/draft|preview|dry-run|query/i.test(api));
    const text = [
      raw.capabilityId,
      raw.displayName,
      raw.description,
      ...sourceApis,
      ...actions,
    ].join('|');
    return writeApi || /写入|删除|发券|下发|扣减|核销执行|create|update|delete|issue|send/i.test(text);
  }

  private requiresQueryKey(executorType: string) {
    return ['business_record_query', 'business_metric_query', 'business_trend_query', 'business_detail_query', 'business_query', 'custom_service'].includes(executorType);
  }

  private toDraftDto(draft: Record<string, any>) {
    return {
      id: draft.id,
      capabilityId: draft.capabilityId,
      status: draft.status,
      source: draft.source,
      displayName: draft.displayName,
      displayNameZh: draft.displayNameZh,
      description: draft.description,
      domain: draft.domain,
      businessObject: draft.businessObject,
      actions: this.arrayValue(draft.actionCodes),
      personaCodes: this.arrayValue(draft.personaCodes),
      releaseStrategy: draft.releaseStrategy,
      riskLevel: draft.riskLevel,
      permissionSource: draft.permissionSource,
      permissionCodes: this.arrayValue(draft.permissionCodes),
      sourceModels: this.arrayValue(draft.sourceModels),
      sourceApis: this.arrayValue(draft.sourceApis),
      sourceDtos: this.arrayValue(draft.sourceDtos),
      sourceRoutes: this.arrayValue(draft.sourceRoutes),
      outputKinds: this.arrayValue(draft.outputKinds),
      executor: draft.executorJson ?? null,
      customServiceReason: this.asObject(draft.executorJson)?.customServiceReason
        ? String(this.asObject(draft.executorJson)?.customServiceReason)
        : undefined,
      storeScope: draft.storeScope,
      fieldPolicies: this.arrayValue(draft.fieldPoliciesJson),
      triggerKeywords: this.arrayValue(draft.triggerKeywords),
      examples: this.arrayValue(draft.examples),
      negativeExamples: this.arrayValue(draft.negativeExamples),
      boundaryNotes: this.arrayValue(draft.boundaryNotes),
      governanceIssues: this.arrayValue(draft.governanceIssues),
      reviewedBy: draft.reviewedBy,
      reviewedAt: draft.reviewedAt,
      publishedAt: draft.publishedAt,
      createdAt: draft.createdAt,
      updatedAt: draft.updatedAt,
    };
  }

  private manifestToDraft(manifest: AgentV2CapabilityManifest): RawCapabilityDraft {
    return {
      capabilityId: manifest.capabilityId,
      status: 'approved',
      source: 'manual_builtin',
      displayName: manifest.displayName,
      displayNameZh: manifest.displayName,
      description: manifest.description,
      domain: manifest.domain,
      businessObject: manifest.businessObject,
      actions: manifest.actions,
      personaCodes: manifest.personaCodes,
      releaseStrategy: manifest.releaseStrategy,
      riskLevel: manifest.riskLevel,
      permissionSource: 'manifest',
      permissionCodes: manifest.permissionCodes,
      sourceModels: manifest.sourceModels,
      sourceApis: manifest.sourceApis,
      sourceDtos: [],
      sourceRoutes: [],
      outputKinds: manifest.outputKinds,
      executor: manifest.customServiceReason
        ? { ...manifest.executor, customServiceReason: manifest.customServiceReason }
        : manifest.executor,
      customServiceReason: manifest.customServiceReason,
      storeScope: manifest.storeScope,
      fieldPolicies: manifest.fieldPolicies,
      triggerKeywords: manifest.triggerKeywords,
      examples: manifest.examples,
      negativeExamples: manifest.negativeExamples,
      boundaryNotes: [
        ...manifest.boundaryNotes,
        '该能力来自当前 Agent V2 已启用 Manifest，用于能力中心治理、审核和版本化发布。',
      ],
      governanceIssues: [
        {
          code: 'builtin_manifest_synced',
          level: 'info',
          message: '当前 Agent V2 已启用能力已同步为能力中心候选。',
        },
      ],
    };
  }

  private toManifest(draft: Record<string, any>): AgentV2CapabilityManifest {
    const executor = this.asObject(draft.executorJson) ?? {};
    return {
      capabilityId: draft.capabilityId,
      version: 'v1',
      status: 'enabled',
      source: this.asCapabilitySource(draft.source),
      displayName: draft.displayNameZh || draft.displayName,
      description: draft.description || `${draft.displayNameZh || draft.displayName} 能力。`,
      domain: draft.domain,
      businessObject: draft.businessObject,
      personaCodes: this.arrayValue(draft.personaCodes) as AgentV2CapabilityManifest['personaCodes'],
      actions: this.arrayValue(draft.actionCodes) as AgentV2ActionIntent[],
      sourceModels: this.arrayValue(draft.sourceModels),
      sourceApis: this.arrayValue(draft.sourceApis),
      outputKinds: this.arrayValue(draft.outputKinds),
      executor: {
        type: String(executor.type ?? 'business_record_query') as AgentV2ExecutorType,
        tool: String(executor.tool ?? 'business.record.query'),
        queryKey: executor.queryKey ? String(executor.queryKey) : undefined,
      },
      customServiceReason: executor.customServiceReason ? String(executor.customServiceReason) : undefined,
      storeScope: String(draft.storeScope ?? 'required') as AgentV2StoreScope,
      permissionCodes: this.arrayValue(draft.permissionCodes),
      fieldPolicies: this.arrayValue(draft.fieldPoliciesJson) as unknown as AgentV2CapabilityManifest['fieldPolicies'],
      riskLevel: draft.riskLevel,
      releaseStrategy: String(draft.releaseStrategy ?? 'approval_required') as AgentV2ReleaseStrategy,
      examples: this.arrayValue(draft.examples),
      negativeExamples: this.arrayValue(draft.negativeExamples),
      triggerKeywords: this.arrayValue(draft.triggerKeywords),
      boundaryNotes: this.arrayValue(draft.boundaryNotes),
    };
  }

  private async upsertQueryKeyFromDraft(raw: RawCapabilityDraft) {
    const executor = this.asObject(raw.executor);
    const queryKey = executor?.queryKey ? String(executor.queryKey) : '';
    const toolName = executor?.tool ? String(executor.tool) : '';
    if (!queryKey || !toolName) return;
    await this.prisma.agentToolQueryKeyRegistry.upsert({
      where: { queryKey },
      create: {
        queryKey,
        toolName,
        domain: String(raw.domain ?? 'unknown'),
        businessObject: raw.businessObject ? String(raw.businessObject) : undefined,
        status: 'draft',
        source: 'auto_scan',
        requiredPermissions: this.toJson(this.stringArray(raw.permissionCodes)),
        sourceModels: this.toJson(this.stringArray(raw.sourceModels)),
        sourceApis: this.toJson(this.stringArray(raw.sourceApis)),
        outputKinds: this.toJson(this.stringArray(raw.outputKinds)),
        validationJson: this.toJson({ importedFrom: 'agent-v2-capability-drafts.json' }),
      },
      update: {
        toolName,
        domain: String(raw.domain ?? 'unknown'),
        businessObject: raw.businessObject ? String(raw.businessObject) : undefined,
        requiredPermissions: this.toJson(this.stringArray(raw.permissionCodes)),
        sourceModels: this.toJson(this.stringArray(raw.sourceModels)),
        sourceApis: this.toJson(this.stringArray(raw.sourceApis)),
        outputKinds: this.toJson(this.stringArray(raw.outputKinds)),
      },
    });
  }

  private resolveWorkspacePath(path: string) {
    if (/^[A-Za-z]:\\/.test(path)) return path;
    const cwd = process.cwd();
    const workspaceRoot = cwd.endsWith('packages\\server-v2') || cwd.endsWith('packages/server-v2') ? resolve(cwd, '../..') : cwd;
    return resolve(workspaceRoot, path);
  }

  private readEvalDrafts() {
    const path = this.resolveWorkspacePath(DEFAULT_EVAL_DRAFT_REPORT);
    if (!existsSync(path)) throw new BadRequestException(`缺少评测题草稿文件：${DEFAULT_EVAL_DRAFT_REPORT}`);
    const report = JSON.parse(readFileSync(path, 'utf8')) as { drafts?: EvalDraft[] };
    return Array.isArray(report.drafts) ? report.drafts : [];
  }

  private readGovernanceReport() {
    const path = this.resolveWorkspacePath(DEFAULT_GOVERNANCE_REPORT);
    if (!existsSync(path)) throw new BadRequestException(`缺少能力治理报告文件：${DEFAULT_GOVERNANCE_REPORT}`);
    return JSON.parse(readFileSync(path, 'utf8')) as { gates?: Record<string, GovernanceGateItem[]> };
  }

  private filterGovernanceItems(items: unknown, capabilitySet: Set<string>) {
    const list = Array.isArray(items) ? items as GovernanceGateItem[] : [];
    if (!capabilitySet.size) return list;
    return list.filter((item) => item.capabilityId && capabilitySet.has(item.capabilityId));
  }

  private summarizeEvalSamples(items: EvalDraft[]) {
    return items.slice(0, 20).map((item) => ({
      id: item.id,
      question: item.question,
      capabilityId: item.expectedCapabilityId,
      permissionResult: item.permissionResult,
      contractResult: item.contractResult,
      failureCategory: item.failureCategory,
      priority: item.priority,
    }));
  }

  private arrayValue(value: unknown): string[] {
    return Array.isArray(value) ? value.map(String).filter(Boolean) : [];
  }

  private stringArray(value: unknown): string[] {
    return this.arrayValue(value);
  }

  private asObject(value: unknown): Record<string, unknown> | null {
    return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
  }

  private toJson(value: unknown): Prisma.InputJsonValue | undefined {
    if (value === undefined || value === null) return undefined;
    return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
  }

  private asCapabilitySource(value: unknown): AgentV2CapabilitySource {
    const source = String(value ?? 'auto_scan_draft');
    if (source === 'manual_builtin' || source === 'eval_failure') return source;
    return 'auto_scan_draft';
  }

  private toPositiveInt(value: unknown, fallback: number) {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
  }

  private fingerprint(raw: RawCapabilityDraft) {
    const text = JSON.stringify({
      capabilityId: raw.capabilityId,
      sourceApis: raw.sourceApis,
      sourceModels: raw.sourceModels,
      executor: raw.executor,
      permissionCodes: raw.permissionCodes,
    });
    let hash = 0;
    for (let i = 0; i < text.length; i += 1) hash = ((hash << 5) - hash + text.charCodeAt(i)) | 0;
    return Math.abs(hash).toString(36);
  }

  private formatTimestamp(date: Date) {
    const parts = new Intl.DateTimeFormat('zh-CN', {
      timeZone: 'Asia/Shanghai',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    }).formatToParts(date);
    const get = (type: string) => parts.find((part) => part.type === type)?.value ?? '00';
    return `${get('year')}${get('month')}${get('day')}${get('hour')}${get('minute')}${get('second')}`;
  }
}
