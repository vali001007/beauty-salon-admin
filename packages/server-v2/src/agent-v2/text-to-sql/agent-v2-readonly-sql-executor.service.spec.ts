import { AgentV2ReadOnlySqlExecutorService } from './agent-v2-readonly-sql-executor.service.js';
import type { AgentV2SqlGuardResult } from './agent-v2-text-to-sql.types.js';

describe('AgentV2ReadOnlySqlExecutorService', () => {
  const executor = new AgentV2ReadOnlySqlExecutorService();

  afterEach(() => {
    delete process.env.AGENT_V2_TEXT_TO_SQL_READONLY_DATABASE_URL;
    delete process.env.AGENT_V2_TEXT_TO_SQL_MAX_LIMIT;
    jest.restoreAllMocks();
  });

  it('does not execute database calls in dry-run', async () => {
    const spy = jest.spyOn(executor as any, 'queryReadOnly');
    const result = await executor.execute({ guard: passGuard(), mode: 'dry_run' });

    expect(result.status).toBe('dry_run');
    expect(spy).not.toHaveBeenCalled();
  });

  it('blocks execute when readonly database URL is missing', async () => {
    const result = await executor.execute({ guard: passGuard(), mode: 'execute' });

    expect(result.status).toBe('blocked');
    expect(result.blockedReason).toBe('readonly_database_url_missing');
  });

  it('executes safe SQL through the readonly connection when configured', async () => {
    process.env.AGENT_V2_TEXT_TO_SQL_READONLY_DATABASE_URL = 'postgresql://readonly.example/db';
    jest.spyOn(executor as any, 'queryReadOnly').mockResolvedValue([{ product_id: 1, product_name: '洁面乳' }]);

    const result = await executor.execute({ guard: passGuard(), mode: 'execute' });

    expect(result.status).toBe('success');
    expect(result.rows).toEqual([{ product_id: 1, product_name: '洁面乳' }]);
    expect((executor as any).queryReadOnly).toHaveBeenCalledWith(expect.objectContaining({
      connectionString: 'postgresql://readonly.example/db',
      sql: expect.stringContaining('$1'),
      values: [[1]],
    }));
  });

  it('clips database rows to the configured maximum result limit', async () => {
    process.env.AGENT_V2_TEXT_TO_SQL_READONLY_DATABASE_URL = 'postgresql://readonly.example/db';
    process.env.AGENT_V2_TEXT_TO_SQL_MAX_LIMIT = '2';
    jest.spyOn(executor as any, 'queryReadOnly').mockResolvedValue([
      { product_id: 1 },
      { product_id: 2 },
      { product_id: 3 },
    ]);

    const result = await executor.execute({ guard: passGuard(), mode: 'execute' });

    expect(result.status).toBe('success');
    expect(result.rows).toEqual([{ product_id: 1 }, { product_id: 2 }]);
  });

  it('classifies readonly database errors without leaking raw database details', async () => {
    process.env.AGENT_V2_TEXT_TO_SQL_READONLY_DATABASE_URL = 'postgresql://readonly.example/db';
    const error = new Error('permission denied for table CustomerSensitive');
    (error as Error & { code: string }).code = '42501';
    jest.spyOn(executor as any, 'queryReadOnly').mockRejectedValue(error);

    const result = await executor.execute({ guard: passGuard(), mode: 'execute' });

    expect(result.status).toBe('failed');
    expect(result.blockedReason).toBe('permission_error');
    expect(result.errorMessage).toBe('permission_error');
  });

  it('wraps readonly execution in a readonly transaction', async () => {
    const queries: Array<{ sql: string; values?: unknown[] }> = [];
    const client = {
      _ending: false,
      connect: jest.fn().mockResolvedValue(undefined),
      query: jest.fn().mockImplementation((sql: string, values?: unknown[]) => {
        queries.push({ sql, values });
        if (sql.startsWith('SELECT')) return Promise.resolve({ rows: [{ product_id: 1 }] });
        return Promise.resolve({ rows: [] });
      }),
      end: jest.fn().mockResolvedValue(undefined),
    };
    jest.spyOn(executor as any, 'createPgClient').mockResolvedValue(client);

    const rows = await (executor as any).queryReadOnly({
      connectionString: 'postgresql://readonly.example/db',
      timeoutMs: 5000,
      sql: 'SELECT product_id FROM agent_v2_order_item_sales_view WHERE store_id = ANY($1)',
      values: [[1]],
    });

    expect(rows).toEqual([{ product_id: 1 }]);
    expect(client.connect).toHaveBeenCalled();
    expect(queries.map((item) => item.sql)).toEqual([
      "SELECT set_config('statement_timeout', $1, false)",
      "SELECT set_config('default_transaction_read_only', 'on', false)",
      'BEGIN READ ONLY',
      'SELECT product_id FROM agent_v2_order_item_sales_view WHERE store_id = ANY($1)',
      'ROLLBACK',
    ]);
    expect(queries[0].values).toEqual(['5000']);
    expect(client.end).toHaveBeenCalled();
  });

  it('rolls back and closes the readonly connection when the query fails', async () => {
    const queries: Array<{ sql: string; values?: unknown[] }> = [];
    const client = {
      _ending: false,
      connect: jest.fn().mockResolvedValue(undefined),
      query: jest.fn().mockImplementation((sql: string, values?: unknown[]) => {
        queries.push({ sql, values });
        if (sql === 'SELECT product_id FROM agent_v2_order_item_sales_view WHERE store_id = ANY($1)') {
          return Promise.reject(Object.assign(new Error('permission denied for view'), { code: '42501' }));
        }
        return Promise.resolve({ rows: [] });
      }),
      end: jest.fn().mockResolvedValue(undefined),
    };
    jest.spyOn(executor as any, 'createPgClient').mockResolvedValue(client);

    await expect((executor as any).queryReadOnly({
      connectionString: 'postgresql://readonly.example/db',
      timeoutMs: 5000,
      sql: 'SELECT product_id FROM agent_v2_order_item_sales_view WHERE store_id = ANY($1)',
      values: [[1]],
    })).rejects.toMatchObject({ code: '42501' });

    expect(queries.map((item) => item.sql)).toEqual([
      "SELECT set_config('statement_timeout', $1, false)",
      "SELECT set_config('default_transaction_read_only', 'on', false)",
      'BEGIN READ ONLY',
      'SELECT product_id FROM agent_v2_order_item_sales_view WHERE store_id = ANY($1)',
      'ROLLBACK',
    ]);
    expect(client.end).toHaveBeenCalled();
  });

  it('reuses repeated SQL parameters instead of duplicating values', () => {
    const result = (executor as any).parameterize(
      'SELECT product_id FROM agent_v2_order_item_sales_view WHERE store_id = ANY(:allowedStoreIds) AND :startAt <= order_created_at AND order_created_at < :endAt AND store_id = ANY(:allowedStoreIds)',
      { allowedStoreIds: [1], startAt: '2026-07-01', endAt: '2026-08-01' },
    );

    expect(result.sql).toBe('SELECT product_id FROM agent_v2_order_item_sales_view WHERE store_id = ANY($1) AND $2 <= order_created_at AND order_created_at < $3 AND store_id = ANY($1)');
    expect(result.values).toEqual([[1], '2026-07-01', '2026-08-01']);
  });

  it('does not execute when guard is blocked', async () => {
    const spy = jest.spyOn(executor as any, 'queryReadOnly');
    const result = await executor.execute({
      guard: { status: 'blocked', reasonCode: 'source_view_not_allowed', message: 'blocked', appliedPolicies: [] },
      mode: 'execute',
    });

    expect(result.status).toBe('blocked');
    expect(spy).not.toHaveBeenCalled();
  });
});

function passGuard(): Extract<AgentV2SqlGuardResult, { status: 'pass' }> {
  return {
    status: 'pass',
    safeSql: 'SELECT product_id FROM agent_v2_order_item_sales_view WHERE store_id = ANY(:allowedStoreIds) LIMIT 10;',
    redactedSql: 'SELECT product_id FROM agent_v2_order_item_sales_view WHERE store_id = ANY(:allowedStoreIds) LIMIT 10;',
    params: { allowedStoreIds: [1] },
    selectedViews: [],
    parsed: {
      statementType: 'select',
      columns: ['product_id'],
      sourceViews: ['agent_v2_order_item_sales_view'],
      functions: [],
      hasWildcard: false,
      hasLimit: true,
      limit: 10,
      hasWhere: true,
      hasGroupBy: false,
      hasOrderBy: false,
      tokens: [],
    },
    appliedPolicies: [],
  };
}
