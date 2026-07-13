import { AgentV2SqlCostGuardService } from './agent-v2-sql-cost-guard.service.js';
import type { AgentV2SqlGuardResult } from './agent-v2-text-to-sql.types.js';

describe('AgentV2SqlCostGuardService', () => {
  const service = new AgentV2SqlCostGuardService();

  afterEach(() => {
    delete process.env.AGENT_V2_TEXT_TO_SQL_MAX_RANGE_DAYS;
    delete process.env.AGENT_V2_TEXT_TO_SQL_MAX_ESTIMATED_COST;
    delete process.env.AGENT_V2_TEXT_TO_SQL_READONLY_DATABASE_URL;
    jest.restoreAllMocks();
  });

  it('passes static checks for time-scoped limited queries in dry-run', async () => {
    const result = await service.inspect({ guard: passGuard(), mode: 'dry_run' });

    expect(result).toMatchObject({
      status: 'pass',
      checkedBy: 'static',
    });
  });

  it('blocks time-scoped views when time range is missing', async () => {
    const result = await service.inspect({
      guard: passGuard({ params: { allowedStoreIds: [1] } }),
      mode: 'dry_run',
    });

    expect(result).toMatchObject({
      status: 'blocked',
      reasonCode: 'missing_time_range',
    });
  });

  it('blocks ranges beyond configured max days', async () => {
    process.env.AGENT_V2_TEXT_TO_SQL_MAX_RANGE_DAYS = '30';

    const result = await service.inspect({
      guard: passGuard({
        params: {
          allowedStoreIds: [1],
          startAt: '2026-01-01T00:00:00.000Z',
          endAt: '2026-03-01T00:00:00.000Z',
        },
      }),
      mode: 'dry_run',
    });

    expect(result).toMatchObject({
      status: 'blocked',
      reasonCode: 'time_range_exceeds_max',
    });
  });

  it('uses EXPLAIN in execute mode and blocks expensive plans', async () => {
    process.env.AGENT_V2_TEXT_TO_SQL_READONLY_DATABASE_URL = 'postgresql://readonly.example/db';
    process.env.AGENT_V2_TEXT_TO_SQL_MAX_ESTIMATED_COST = '100';
    jest.spyOn(service as any, 'explainCost').mockResolvedValue(120);

    const result = await service.inspect({ guard: passGuard(), mode: 'execute' });

    expect(result).toMatchObject({
      status: 'blocked',
      reasonCode: 'estimated_cost_exceeds_max',
      estimatedCost: 120,
    });
  });

  it('runs EXPLAIN through a parameterized readonly cost-check connection', async () => {
    const queries: Array<{ sql: string; values?: unknown[] }> = [];
    const client = {
      connect: jest.fn().mockResolvedValue(undefined),
      query: jest.fn().mockImplementation((sql: string, values?: unknown[]) => {
        queries.push({ sql, values });
        if (sql.startsWith('EXPLAIN')) {
          return Promise.resolve({ rows: [{ 'QUERY PLAN': [{ Plan: { 'Total Cost': 12 } }] }] });
        }
        return Promise.resolve({ rows: [] });
      }),
      end: jest.fn().mockResolvedValue(undefined),
    };
    jest.spyOn(service as any, 'createPgClient').mockResolvedValue(client);

    const cost = await (service as any).explainCost({
      connectionString: 'postgresql://readonly.example/db',
      timeoutMs: 5000,
      sql: 'SELECT product_id FROM agent_v2_order_item_sales_view WHERE store_id = ANY(:allowedStoreIds) LIMIT 10;',
      params: { allowedStoreIds: [1] },
    });

    expect(cost).toBe(12);
    expect(client.connect).toHaveBeenCalled();
    expect(queries[0]).toEqual({
      sql: "SELECT set_config('statement_timeout', $1, false)",
      values: ['5000'],
    });
    expect(queries[1]).toEqual({
      sql: 'EXPLAIN (FORMAT JSON) SELECT product_id FROM agent_v2_order_item_sales_view WHERE store_id = ANY($1) LIMIT 10',
      values: [[1]],
    });
    expect(client.end).toHaveBeenCalled();
  });
});

function passGuard(overrides: Partial<Extract<AgentV2SqlGuardResult, { status: 'pass' }>> = {}): Extract<AgentV2SqlGuardResult, { status: 'pass' }> {
  return {
    status: 'pass',
    safeSql: 'SELECT product_id FROM agent_v2_order_item_sales_view WHERE order_created_at >= :startAt AND order_created_at < :endAt AND store_id = ANY(:allowedStoreIds) LIMIT 10;',
    redactedSql: 'SELECT product_id FROM agent_v2_order_item_sales_view LIMIT 10;',
    params: {
      allowedStoreIds: [1],
      startAt: '2026-07-01T00:00:00.000Z',
      endAt: '2026-07-07T00:00:00.000Z',
    },
    selectedViews: [{
      id: 'order_item_sales',
      viewName: 'agent_v2_order_item_sales_view',
      domain: 'sales',
      description: '商品销量',
      status: 'enabled',
      batch: 'P0',
      requiredPermissions: ['core:order:view'],
      storeScopeField: 'store_id',
      defaultTimeField: 'order_created_at',
      fields: [],
      sampleQuestions: [],
    }],
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
    ...overrides,
  };
}
