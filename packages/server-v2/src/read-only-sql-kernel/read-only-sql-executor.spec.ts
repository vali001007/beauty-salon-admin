import { ReadOnlySqlExecutor } from './read-only-sql-executor.js';

describe('ReadOnlySqlExecutor', () => {
  const executor = new ReadOnlySqlExecutor();

  afterEach(() => jest.restoreAllMocks());

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

  it('retries one transient connection failure and records attempts', async () => {
    const query = jest.spyOn(executor as any, 'queryReadOnly')
      .mockRejectedValueOnce(Object.assign(new Error('connection reset by peer'), { code: 'ECONNRESET' }))
      .mockResolvedValueOnce([{ payment_amount: 1280 }]);
    const result = await executor.execute({
      guard: {
        status: 'pass', safeSql: 'SELECT 1;', redactedSql: 'SELECT 1;', params: {}, selectedViews: [],
        parsed: {} as any, appliedPolicies: [], sqlFingerprint: 'x',
      },
      connectionString: 'postgresql://readonly:secret@example.invalid/db',
      timeoutMs: 5000,
      connectionTimeoutMs: 2500,
      maxRows: 10,
    });

    expect(result).toEqual(expect.objectContaining({
      status: 'success', attempts: 2, retryAttempted: true,
    }));
    expect(query).toHaveBeenCalledTimes(2);
    expect(query).toHaveBeenLastCalledWith(expect.objectContaining({ connectionTimeoutMs: 2500 }));
  });

  it('retries one statement timeout and succeeds when shared-pool contention clears', async () => {
    const query = jest.spyOn(executor as any, 'queryReadOnly')
      .mockRejectedValueOnce(Object.assign(new Error('canceling statement due to statement timeout'), { code: '57014' }))
      .mockResolvedValueOnce([{ movement_quantity: 12 }]);
    const result = await executor.execute({
      guard: {
        status: 'pass', safeSql: 'SELECT 1;', redactedSql: 'SELECT 1;', params: {}, selectedViews: [],
        parsed: {} as any, appliedPolicies: [], sqlFingerprint: 'x',
      },
      connectionString: 'postgresql://readonly:secret@example.invalid/db',
      timeoutMs: 5000,
      maxRows: 10,
    });

    expect(result).toEqual(expect.objectContaining({
      status: 'success', attempts: 2, retryAttempted: true,
    }));
    expect(query).toHaveBeenCalledTimes(2);
  });

  it('retries the generic timeout-expired error emitted while opening a pooled connection', async () => {
    const query = jest.spyOn(executor as any, 'queryReadOnly')
      .mockRejectedValueOnce(new Error('timeout expired'))
      .mockResolvedValueOnce([{ movement_quantity: 12 }]);
    const result = await executor.execute({
      guard: {
        status: 'pass', safeSql: 'SELECT 1;', redactedSql: 'SELECT 1;', params: {}, selectedViews: [],
        parsed: {} as any, appliedPolicies: [], sqlFingerprint: 'x',
      },
      connectionString: 'postgresql://readonly:secret@example.invalid/db',
      timeoutMs: 5000,
      maxRows: 10,
    });

    expect(result).toEqual(expect.objectContaining({
      status: 'success', attempts: 2, retryAttempted: true,
    }));
    expect(query).toHaveBeenCalledTimes(2);
  });

  it('fails closed after a second statement timeout', async () => {
    const query = jest.spyOn(executor as any, 'queryReadOnly')
      .mockRejectedValue(Object.assign(new Error('canceling statement due to statement timeout'), { code: '57014' }));
    const result = await executor.execute({
      guard: {
        status: 'pass', safeSql: 'SELECT 1;', redactedSql: 'SELECT 1;', params: {}, selectedViews: [],
        parsed: {} as any, appliedPolicies: [], sqlFingerprint: 'x',
      },
      connectionString: 'postgresql://readonly:secret@example.invalid/db',
      timeoutMs: 5000,
      maxRows: 10,
    });

    expect(result).toEqual(expect.objectContaining({ status: 'failed', blockedReason: 'timeout', attempts: 2 }));
    expect(query).toHaveBeenCalledTimes(2);
  });

  it('does not retry a permission failure', async () => {
    const query = jest.spyOn(executor as any, 'queryReadOnly')
      .mockRejectedValueOnce(Object.assign(new Error('permission denied for relation orders'), { code: '42501' }));
    const result = await executor.execute({
      guard: {
        status: 'pass', safeSql: 'SELECT 1;', redactedSql: 'SELECT 1;', params: {}, selectedViews: [],
        parsed: {} as any, appliedPolicies: [], sqlFingerprint: 'x',
      },
      connectionString: 'postgresql://readonly:secret@example.invalid/db',
      timeoutMs: 5000,
      maxRows: 10,
    });

    expect(result).toEqual(expect.objectContaining({ status: 'failed', blockedReason: 'permission_error', attempts: 1 }));
    expect(query).toHaveBeenCalledTimes(1);
  });
});
