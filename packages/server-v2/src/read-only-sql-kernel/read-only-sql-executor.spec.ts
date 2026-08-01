import { ReadOnlySqlExecutor } from './read-only-sql-executor.js';

describe('ReadOnlySqlExecutor', () => {
  const executor = new ReadOnlySqlExecutor();

  it('parameterizes named parameters without executing SQL', () => {
    const result = executor.parameterize(
      'SELECT * FROM view WHERE store_id = ANY(:allowedStoreIds) AND x >= :startAt',
      {
        allowedStoreIds: [6],
        startAt: '2026-08-01',
      },
    );
    expect(result.sql).toBe('SELECT * FROM view WHERE store_id = ANY($1) AND x >= $2');
    expect(result.values).toEqual([[6], '2026-08-01']);
  });

  it('preserves PostgreSQL shorthand casts while parameterizing named values', () => {
    const result = executor.parameterize(
      'SELECT settlement_date::date FROM agent_v3_daily_settlement_view WHERE settlement_date >= :startAt',
      { startAt: '2026-08-01' },
    );
    expect(result.sql).toBe(
      'SELECT settlement_date::date FROM agent_v3_daily_settlement_view WHERE settlement_date >= $1',
    );
    expect(result.values).toEqual(['2026-08-01']);
  });

  it('does not execute in dry-run mode', async () => {
    const result = await executor.execute({
      guard: {
        status: 'pass',
        safeSql: 'SELECT 1;',
        redactedSql: 'SELECT 1;',
        params: {},
        selectedViews: [],
        parsed: {} as any,
        appliedPolicies: [],
        sqlFingerprint: 'x',
      },
      timeoutMs: 1000,
      maxRows: 10,
      dryRunOnly: true,
    });
    expect(result.status).toBe('blocked');
    expect(result.blockedReason).toBe('dry_run_only');
  });
});
