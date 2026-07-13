import { Injectable } from '@nestjs/common';
import { agentV3TextToSqlConfig } from './agent-v3-text-to-sql.config.js';
import type {
  AgentV3SqlGuardResult,
  AgentV3TextToSqlExecutionMode,
  AgentV3TextToSqlExecutionResult,
} from './agent-v3-text-to-sql.types.js';

@Injectable()
export class AgentV3ReadOnlySqlExecutorService {
  async execute(input: { guard: AgentV3SqlGuardResult; mode: AgentV3TextToSqlExecutionMode }): Promise<AgentV3TextToSqlExecutionResult> {
    const startedAt = Date.now();
    if (input.guard.status !== 'pass') {
      return {
        status: 'blocked',
        rows: [],
        executionMs: Date.now() - startedAt,
        blockedReason: input.guard.reasonCode,
      };
    }

    if (input.mode === 'dry_run') {
      return {
        status: 'dry_run',
        rows: [],
        executionMs: Date.now() - startedAt,
      };
    }

    const config = agentV3TextToSqlConfig();
    if (!config.readonlyDatabaseUrl) {
      return {
        status: 'blocked',
        rows: [],
        executionMs: Date.now() - startedAt,
        blockedReason: 'readonly_database_url_missing',
      };
    }

    try {
      const { sql, values } = this.parameterize(input.guard.safeSql, input.guard.params);
      const rows = await this.queryReadOnly({
        connectionString: config.readonlyDatabaseUrl,
        timeoutMs: config.timeoutMs,
        sql,
        values,
      });
      const limitedRows = rows.slice(0, config.maxLimit);
      return {
        status: limitedRows.length ? 'success' : 'no_data',
        rows: limitedRows,
        executionMs: Date.now() - startedAt,
      };
    } catch (error) {
      const reasonCode = this.classifyReadonlyError(error);
      return {
        status: 'failed',
        rows: [],
        executionMs: Date.now() - startedAt,
        blockedReason: reasonCode,
        errorMessage: reasonCode,
      };
    }
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

  private async queryReadOnly(input: { connectionString: string; timeoutMs: number; sql: string; values: unknown[] }) {
    const client = await this.createPgClient(input);
    await client.connect();
    let transactionClosed = false;
    try {
      const timeoutMs = String(Math.max(1000, Math.trunc(input.timeoutMs)));
      await client.query("SELECT set_config('statement_timeout', $1, false)", [timeoutMs]);
      await client.query("SELECT set_config('default_transaction_read_only', 'on', false)");
      await client.query('BEGIN READ ONLY');
      const result = await client.query(input.sql, input.values);
      await client.query('ROLLBACK');
      transactionClosed = true;
      return result.rows as Array<Record<string, unknown>>;
    } finally {
      if (!transactionClosed && !client._ending) {
        try {
          await client.query('ROLLBACK');
        } catch {
          // ignore rollback cleanup errors
        }
      }
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
      application_name: 'agent_v3_controlled_text_to_sql',
    });
  }

  private classifyReadonlyError(error: unknown) {
    const code = typeof error === 'object' && error && 'code' in error ? String((error as { code?: unknown }).code ?? '') : '';
    const message = error instanceof Error ? error.message.toLowerCase() : String(error ?? '').toLowerCase();
    if (code === '42501' || message.includes('permission denied') || message.includes('insufficient privilege')) {
      return 'permission_error';
    }
    if (code === '57014' || message.includes('timeout') || message.includes('query canceled')) {
      return 'timeout';
    }
    return 'db_error';
  }
}
