import { Injectable } from '@nestjs/common';
import { agentV3TextToSqlConfig } from './agent-v3-text-to-sql.config.js';
import type {
  AgentV3SqlCostGuardResult,
  AgentV3SqlGuardResult,
  AgentV3TextToSqlExecutionMode,
} from './agent-v3-text-to-sql.types.js';

@Injectable()
export class AgentV3SqlCostGuardService {
  async inspect(input: { guard: AgentV3SqlGuardResult; mode: AgentV3TextToSqlExecutionMode }): Promise<AgentV3SqlCostGuardResult> {
    const config = agentV3TextToSqlConfig();
    if (input.guard.status !== 'pass') {
      return {
        status: 'blocked',
        reasonCode: input.guard.reasonCode,
        message: input.guard.message,
        appliedPolicies: ['guard_blocked_before_cost_check'],
      };
    }

    const staticResult = this.staticCheck(input.guard, config.maxRangeDays);
    if (staticResult.status === 'blocked') return staticResult;
    if (input.mode === 'dry_run') return staticResult;

    if (!config.readonlyDatabaseUrl) {
      return {
        status: 'pass',
        checkedBy: 'static_without_readonly_connection',
        appliedPolicies: [...staticResult.appliedPolicies, 'explain_skipped_readonly_database_url_missing'],
      };
    }

    const estimatedCost = await this.explainCost({
      connectionString: config.readonlyDatabaseUrl,
      timeoutMs: config.timeoutMs,
      sql: input.guard.safeSql,
      params: input.guard.params,
    });
    if (estimatedCost !== null && estimatedCost > config.maxEstimatedCost) {
      return {
        status: 'blocked',
        reasonCode: 'estimated_cost_exceeds_max',
        message: `查询预估成本 ${estimatedCost} 超过最大限制 ${config.maxEstimatedCost}。`,
        estimatedCost,
        appliedPolicies: [...staticResult.appliedPolicies, 'explain_cost_checked'],
      };
    }

    return {
      status: 'pass',
      checkedBy: 'explain',
      estimatedCost,
      appliedPolicies: [...staticResult.appliedPolicies, 'explain_cost_checked'],
    };
  }

  private staticCheck(guard: Extract<AgentV3SqlGuardResult, { status: 'pass' }>, maxRangeDays: number): AgentV3SqlCostGuardResult {
    const startAt = this.dateParam(guard.params.startAt);
    const endAt = this.dateParam(guard.params.endAt);
    const hasTimeScopedView = guard.selectedViews.some((viewDef) => Boolean(viewDef.defaultTimeField));
    if (hasTimeScopedView && (!startAt || !endAt)) {
      return {
        status: 'blocked',
        reasonCode: 'missing_time_range',
        message: '大数据语义视图必须带时间范围。',
        appliedPolicies: ['time_range_required'],
      };
    }
    if (startAt && endAt) {
      const days = (endAt.getTime() - startAt.getTime()) / 86_400_000;
      if (!Number.isFinite(days) || days <= 0) {
        return {
          status: 'blocked',
          reasonCode: 'invalid_time_range',
          message: '时间范围无效。',
          appliedPolicies: ['time_range_required'],
        };
      }
      if (days > maxRangeDays) {
        return {
          status: 'blocked',
          reasonCode: 'time_range_exceeds_max',
          message: `时间范围超过最大限制 ${maxRangeDays} 天。`,
          appliedPolicies: ['time_range_required', 'max_time_range_checked'],
        };
      }
    }
    return {
      status: 'pass',
      checkedBy: 'static',
      estimatedCost: null,
      appliedPolicies: ['time_range_required', 'max_time_range_checked', 'max_limit_checked'],
    };
  }

  private dateParam(value: unknown) {
    if (typeof value !== 'string') return null;
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  private async explainCost(input: { connectionString: string; timeoutMs: number; sql: string; params: Record<string, unknown> }) {
    const { sql, values } = this.parameterize(input.sql.replace(/;$/, ''), input.params);
    const client = await this.createPgClient(input);
    await client.connect();
    try {
      const timeoutMs = String(Math.max(1000, Math.trunc(input.timeoutMs)));
      await client.query("SELECT set_config('statement_timeout', $1, false)", [timeoutMs]);
      const result = await client.query(`EXPLAIN (FORMAT JSON) ${sql}`, values);
      return this.extractExplainCost(result.rows?.[0]?.['QUERY PLAN']);
    } finally {
      await client.end();
    }
  }

  private async createPgClient(input: { connectionString: string; timeoutMs: number }) {
    const pg = await import('pg');
    const Client = (pg as any).Client;
    return new Client({
      connectionString: input.connectionString,
      statement_timeout: input.timeoutMs,
      query_timeout: input.timeoutMs,
      application_name: 'agent_v3_text_to_sql_cost_guard',
    });
  }

  private extractExplainCost(plan: unknown): number | null {
    const root = Array.isArray(plan) ? plan[0] : plan;
    const value = root && typeof root === 'object' ? (root as any).Plan?.['Total Cost'] : null;
    const cost = Number(value);
    return Number.isFinite(cost) ? cost : null;
  }

  private parameterize(sql: string, params: Record<string, unknown>) {
    const values: unknown[] = [];
    const indexes = new Map<string, number>();
    const rewritten = sql.replace(/:([a-zA-Z][a-zA-Z0-9_]*)/g, (_match, name: string) => {
      if (!Object.prototype.hasOwnProperty.call(params, name)) {
        throw new Error(`missing_sql_param:${name}`);
      }
      if (!indexes.has(name)) {
        indexes.set(name, values.length + 1);
        values.push(params[name]);
      }
      return `$${indexes.get(name)}`;
    });
    return { sql: rewritten, values };
  }
}
