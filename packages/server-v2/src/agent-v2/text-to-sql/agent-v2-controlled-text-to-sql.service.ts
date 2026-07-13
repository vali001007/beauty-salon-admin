import { Injectable } from '@nestjs/common';
import { agentV2TextToSqlConfig } from './agent-v2-text-to-sql.config.js';
import { AgentV2ReadOnlySqlExecutorService } from './agent-v2-readonly-sql-executor.service.js';
import { AgentV2SemanticViewRegistryService } from './agent-v2-semantic-view-registry.service.js';
import { AgentV2SqlCostGuardService } from './agent-v2-sql-cost-guard.service.js';
import { AgentV2SqlGuardService } from './agent-v2-sql-guard.service.js';
import { AgentV2TextToSqlAnswerComposerService } from './agent-v2-text-to-sql-answer-composer.service.js';
import { AgentV2TextToSqlAuditService } from './agent-v2-text-to-sql-audit.service.js';
import { AgentV2TextToSqlPlannerService } from './agent-v2-text-to-sql-planner.service.js';
import type {
  AgentV2SemanticView,
  AgentV2SqlGuardResult,
  AgentV2TextToSqlRequest,
  AgentV2TextToSqlResult,
} from './agent-v2-text-to-sql.types.js';

@Injectable()
export class AgentV2ControlledTextToSqlService {
  constructor(
    private readonly planner: AgentV2TextToSqlPlannerService,
    private readonly guard: AgentV2SqlGuardService,
    private readonly costGuard: AgentV2SqlCostGuardService,
    private readonly executor: AgentV2ReadOnlySqlExecutorService,
    private readonly composer: AgentV2TextToSqlAnswerComposerService,
    private readonly audit: AgentV2TextToSqlAuditService,
    private readonly registry: AgentV2SemanticViewRegistryService,
  ) {}

  async run(request: AgentV2TextToSqlRequest): Promise<AgentV2TextToSqlResult> {
    const config = agentV2TextToSqlConfig();
    const mode = request.mode ?? 'dry_run';
    const plan = this.planner.plan(request);
    if (!config.enabled) {
      return this.blocked(request, plan, { status: 'blocked', reasonCode: 'feature_disabled', message: '受控 Text-to-SQL 未启用。', appliedPolicies: [] });
    }
    if (plan.status !== 'planned' || !plan.generatedSql) {
      return this.blocked(request, plan, { status: 'blocked', reasonCode: plan.reasonCode ?? 'unable_to_plan', message: plan.explanation, appliedPolicies: [] });
    }

    const guard = this.guard.inspect(plan.generatedSql, request);
    const selectedViews = guard.status === 'pass' ? guard.selectedViews : this.registry.findMany(plan.selectedViews);
    const costGuard = await this.costGuard.inspect({ guard, mode });
    const execution = costGuard.status === 'blocked'
      ? {
          status: 'blocked' as const,
          rows: [],
          executionMs: 0,
          blockedReason: costGuard.reasonCode,
        }
      : await this.executor.execute({ guard, mode });
    const result: AgentV2TextToSqlResult = {
      status: execution.status,
      answer: this.composer.compose({ question: request.question, plan, execution, selectedViews }),
      rows: execution.rows,
      evidence: this.composer.evidence({ selectedViews, storeIds: request.storeIds }),
      queryTrace: {
        planner: plan,
        guard,
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
    const config = agentV2TextToSqlConfig();
    const allViews = this.registry.allDefinitions();
    const enabledViews = allViews.filter((viewDef) => viewDef.status === 'enabled');
    const plannedViews = allViews.filter((viewDef) => viewDef.status === 'planned');
    const adminViews = allViews.filter((viewDef) => viewDef.adminOnly);
    const executeBlockers = [
      config.enabled ? '' : 'feature_disabled',
      config.readonlyDatabaseUrl ? '' : 'readonly_database_url_missing',
      enabledViews.length ? '' : 'no_enabled_semantic_view',
    ].filter(Boolean);
    return {
      enabled: config.enabled,
      adminOnly: config.adminOnly,
      maxLimit: config.maxLimit,
      timeoutMs: config.timeoutMs,
      maxRangeDays: config.maxRangeDays,
      maxEstimatedCost: config.maxEstimatedCost,
      readonlyExecutionReady: Boolean(config.readonlyDatabaseUrl),
      executeMode: config.readonlyDatabaseUrl ? 'readonly_execute_ready' : 'dry_run_only',
      readinessCommands: {
        localGate: 'npm.cmd run check:agent-v2-text-to-sql',
        completionAudit: 'npm.cmd run check:agent-v2-text-to-sql:completion-audit',
        strictReadiness: 'npm.cmd --prefix packages/server-v2 run agent-v2:text-to-sql-readiness:strict -- --store-id=1',
      },
      deploymentReadiness: {
        primaryMigrationName: '20260707013000_agent_v2_text_to_sql',
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
        '运行 npm.cmd run check:agent-v2-text-to-sql:completion-audit 确认真实库 migration 和只读 URL。',
        ...(executeBlockers.includes('readonly_database_url_missing')
          ? ['配置 AGENT_V2_TEXT_TO_SQL_READONLY_DATABASE_URL 后运行 strict readiness。']
          : []),
      ],
    };
  }

  private async blocked(request: AgentV2TextToSqlRequest, plan: AgentV2TextToSqlResult['queryTrace']['planner'], guard: AgentV2SqlGuardResult): Promise<AgentV2TextToSqlResult> {
    const selectedViews: AgentV2SemanticView[] = this.registry.findMany(plan.selectedViews);
    const result: AgentV2TextToSqlResult = {
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
