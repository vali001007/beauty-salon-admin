import { Injectable } from '@nestjs/common';
import { AgentV3AnswerRelevanceGuardService } from './agent-v3-answer-relevance-guard.service.js';
import { agentV3TextToSqlConfig } from './agent-v3-text-to-sql.config.js';
import { AgentV3ReadOnlySqlExecutorService } from './agent-v3-readonly-sql-executor.service.js';
import { AgentV3SemanticViewRegistryService } from './agent-v3-semantic-view-registry.service.js';
import { AgentV3SqlCostGuardService } from './agent-v3-sql-cost-guard.service.js';
import { AgentV3SqlGuardService } from './agent-v3-sql-guard.service.js';
import { AgentV3TextToSqlAnswerComposerService } from './agent-v3-text-to-sql-answer-composer.service.js';
import { AgentV3TextToSqlAuditService } from './agent-v3-text-to-sql-audit.service.js';
import { AgentV3TextToSqlPlannerService } from './agent-v3-text-to-sql-planner.service.js';
import type {
  AgentV3SemanticView,
  AgentV3SqlGuardResult,
  AgentV3TextToSqlRequest,
  AgentV3TextToSqlResult,
} from './agent-v3-text-to-sql.types.js';

@Injectable()
export class AgentV3ControlledTextToSqlService {
  constructor(
    private readonly planner: AgentV3TextToSqlPlannerService,
    private readonly guard: AgentV3SqlGuardService,
    private readonly costGuard: AgentV3SqlCostGuardService,
    private readonly executor: AgentV3ReadOnlySqlExecutorService,
    private readonly composer: AgentV3TextToSqlAnswerComposerService,
    private readonly audit: AgentV3TextToSqlAuditService,
    private readonly registry: AgentV3SemanticViewRegistryService,
    private readonly relevanceGuard: AgentV3AnswerRelevanceGuardService,
  ) {}

  async run(request: AgentV3TextToSqlRequest): Promise<AgentV3TextToSqlResult> {
    const config = agentV3TextToSqlConfig();
    const mode = config.dryRunOnly ? 'dry_run' : request.mode ?? 'execute';
    const plan = await this.planner.plan(request);
    if (!config.enabled) {
      return this.blocked(request, plan, { status: 'blocked', reasonCode: 'feature_disabled', message: '受控 Text-to-SQL 未启用。', appliedPolicies: [] });
    }
    if (plan.status !== 'planned' || !plan.generatedSql) {
      return this.blocked(request, plan, { status: 'blocked', reasonCode: plan.reasonCode ?? 'unable_to_plan', message: plan.explanation, appliedPolicies: [] });
    }

    const guard = this.guard.inspect(plan.generatedSql, request);
    const selectedViews = guard.status === 'pass' ? guard.selectedViews : this.registry.findMany(plan.selectedViews);
    const relevanceGuard = this.relevanceGuard.inspect({ plan, guard });
    const costGuard = relevanceGuard.status === 'pass' ? await this.costGuard.inspect({ guard, mode }) : undefined;
    const execution = relevanceGuard.status === 'blocked'
      ? {
          status: 'blocked' as const,
          rows: [],
          executionMs: 0,
          blockedReason: relevanceGuard.reasonCode,
        }
      : costGuard?.status === 'blocked'
      ? {
          status: 'blocked' as const,
          rows: [],
          executionMs: 0,
          blockedReason: costGuard.reasonCode,
        }
      : await this.executor.execute({ guard, mode });
    const result: AgentV3TextToSqlResult = {
      status: execution.status,
      answer: this.composer.compose({ question: request.question, plan, execution, selectedViews }),
      rows: execution.rows,
      evidence: this.composer.evidence({ selectedViews, storeIds: request.storeIds }),
      queryTrace: {
        planner: plan,
        guard,
        relevanceGuard,
        costGuard,
        executionMode: mode,
        executionMs: execution.executionMs,
        rowCount: execution.rows.length,
      },
      blockedReason: execution.blockedReason,
    };
    result.auditRunId = await this.audit.record({ question: request.question, result, userId: request.userId });
    return result;
  }

  inspectSql(input: { sql: string; storeIds: number[]; permissions: string[]; roleCodes: string[] }) {
    return this.guard.inspect(input.sql, input);
  }

  testSemanticView(input: { viewName: string; storeIds: number[]; permissions: string[]; roleCodes: string[] }) {
    const viewDef = this.registry.findByName(input.viewName);
    if (!viewDef) {
      return {
        status: 'blocked' as const,
        reasonCode: 'semantic_view_not_found',
        message: '语义视图不存在。',
        appliedPolicies: [],
      };
    }
    const fields = viewDef.fields.filter((field) => field.policy !== 'deny').slice(0, 5).map((field) => field.name);
    const sql = `SELECT ${fields.length ? fields.join(', ') : '1'} FROM ${viewDef.viewName} LIMIT 5`;
    return this.guard.inspect(sql, {
      question: viewDef.sampleQuestions[0] ?? viewDef.description,
      storeIds: input.storeIds,
      permissions: input.permissions,
      roleCodes: input.roleCodes,
    });
  }

  listSemanticViews(input: { includePlanned?: boolean; includeAdmin?: boolean }) {
    return this.registry.list(input);
  }

  getConfigStatus() {
    const config = agentV3TextToSqlConfig();
    const allViews = this.registry.allDefinitions();
    const enabledViews = allViews.filter((viewDef) => viewDef.status === 'enabled');
    const plannedViews = allViews.filter((viewDef) => viewDef.status === 'planned');
    const adminViews = allViews.filter((viewDef) => viewDef.adminOnly);
    const executeBlockers = [
      config.enabled ? '' : 'feature_disabled',
      config.dryRunOnly || config.readonlyDatabaseUrl ? '' : 'readonly_database_url_missing',
      enabledViews.length ? '' : 'no_enabled_semantic_view',
    ].filter(Boolean);
    return {
      enabled: config.enabled,
      adminOnly: config.adminOnly,
      dryRunOnly: config.dryRunOnly,
      maxLimit: config.maxLimit,
      timeoutMs: config.timeoutMs,
      maxRangeDays: config.maxRangeDays,
      maxEstimatedCost: config.maxEstimatedCost,
      readonlyExecutionReady: Boolean(config.readonlyDatabaseUrl) && !config.dryRunOnly,
      executeMode: config.dryRunOnly ? 'dry_run_only' : config.readonlyDatabaseUrl ? 'readonly_execute_ready' : 'readonly_url_missing',
      readinessCommands: {
        localGate: 'npm.cmd run check:agent-v3-text-to-sql',
        completionAudit: 'npm.cmd run check:agent-v3-text-to-sql:completion-audit',
        strictReadiness: 'npm.cmd --prefix packages/server-v2 run agent-v3:text-to-sql-readiness:strict -- --store-id=1',
      },
      deploymentReadiness: {
        primaryMigrationName: '20260707013000_agent_v3_text_to_sql',
        completionAuditRequired: true,
        readonlyUrlRequired: true,
      },
      viewReadiness: {
        totalViews: allViews.length,
        enabledViews: enabledViews.length,
        plannedViews: plannedViews.length,
        adminViews: adminViews.length,
        enabledViewNames: enabledViews.map((viewDef) => viewDef.viewName),
      },
      executeBlockers,
      nextActions: [
        '运行 npm.cmd run check:agent-v3-text-to-sql:completion-audit 确认真实库 migration 和只读 URL。',
        ...(executeBlockers.includes('readonly_database_url_missing')
          ? ['配置 AGENT_V3_READONLY_DATABASE_URL 后运行 strict readiness。']
          : []),
      ],
    };
  }

  private async blocked(request: AgentV3TextToSqlRequest, plan: AgentV3TextToSqlResult['queryTrace']['planner'], guard: AgentV3SqlGuardResult): Promise<AgentV3TextToSqlResult> {
    const selectedViews: AgentV3SemanticView[] = this.registry.findMany(plan.selectedViews);
    const result: AgentV3TextToSqlResult = {
      status: 'blocked',
      answer: '受控 Text-to-SQL 当前无法生成安全查询计划。',
      rows: [],
      evidence: this.composer.evidence({ selectedViews, storeIds: request.storeIds }),
      queryTrace: {
        planner: plan,
        guard,
        executionMode: request.mode ?? 'dry_run',
        rowCount: 0,
      },
      blockedReason: guard.status === 'blocked' ? guard.reasonCode : 'blocked',
    };
    result.auditRunId = await this.audit.record({ question: request.question, result, userId: request.userId });
    return result;
  }
}
