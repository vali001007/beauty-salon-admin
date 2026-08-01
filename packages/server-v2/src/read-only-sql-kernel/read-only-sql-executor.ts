import { Injectable } from '@nestjs/common';
import type { ReadOnlySqlExecutionResult, ReadOnlySqlGuardResult } from './read-only-sql-kernel.types.js';

@Injectable()
export class ReadOnlySqlExecutor {
  async execute(input: {
    guard: ReadOnlySqlGuardResult;
    connectionString?: string;
    timeoutMs: number;
    maxRows: number;
    dryRunOnly?: boolean;
  }): Promise<ReadOnlySqlExecutionResult> {
    const startedAt = Date.now();
    if (input.guard.status !== 'pass') {
      return {
        status: 'blocked',
        rows: [],
        executionMs: Date.now() - startedAt,
        blockedReason: input.guard.reasonCode,
      };
    }
    if (input.dryRunOnly) {
      return { status: 'blocked', rows: [], executionMs: Date.now() - startedAt, blockedReason: 'dry_run_only' };
    }
    if (!input.connectionString) {
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
        connectionString: input.connectionString,
        timeoutMs: input.timeoutMs,
        sql,
        values,
      });
      const truncated = rows.length > input.maxRows;
      const limitedRows = rows.slice(0, input.maxRows);
      return {
        status: limitedRows.length ? 'success' : 'no_data',
        rows: limitedRows,
        executionMs: Date.now() - startedAt,
        truncated,
      };
    } catch (error) {
      const reasonCode = this.classifyError(error);
      return {
        status: 'failed',
        rows: [],
        executionMs: Date.now() - startedAt,
        blockedReason: reasonCode,
        errorMessage: reasonCode,
      };
    }
  }

  parameterize(sql: string, params: Record<string, unknown>) {
    const values: unknown[] = [];
    const indexes = new Map<string, number>();
    const rewritten = sql.replace(/(?<!:):([a-zA-Z][a-zA-Z0-9_]*)/g, (_match, name: string) => {
      if (!Object.prototype.hasOwnProperty.call(params, name)) throw new Error(`missing_sql_param:${name}`);
      if (!indexes.has(name)) {
        indexes.set(name, values.length + 1);
        values.push(params[name]);
      }
      return `$${indexes.get(name)}`;
    });
    return { sql: rewritten, values };
  }

  private async queryReadOnly(input: { connectionString: string; timeoutMs: number; sql: string; values: unknown[] }) {
    const pg = await import('pg');
    const Client = (pg as any).Client;
    const client = new Client({
      connectionString: input.connectionString,
      statement_timeout: input.timeoutMs,
      query_timeout: input.timeoutMs,
      application_name: 'ask_data_free_sql',
    });
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
          // ignore cleanup errors
        }
      }
      await client.end();
    }
  }

  private classifyError(error: unknown) {
    const code =
      typeof error === 'object' && error && 'code' in error ? String((error as { code?: unknown }).code ?? '') : '';
    const message = error instanceof Error ? error.message.toLowerCase() : String(error ?? '').toLowerCase();
    if (code === '42501' || message.includes('permission denied') || message.includes('insufficient privilege'))
      return 'permission_error';
    if (code === '57014' || message.includes('timeout') || message.includes('query canceled')) return 'timeout';
    if (message.includes('missing_sql_param')) return 'invalid_parameters';
    return 'db_error';
  }
}
