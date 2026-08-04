import { AskDataFreeSqlAuditService } from './ask-data-free-sql-audit.service.js';

const context = {
  userId: 9,
  storeId: 6,
  visibleStoreIds: [6],
  permissions: ['core:dashboard:view', 'core:order:projects'],
  deniedPermissions: [],
};

describe('AskDataFreeSqlAuditService', () => {
  it('stores hashes and redacted SQL without persisting the raw generated SQL', async () => {
    const queryRaw = jest.fn().mockResolvedValue([{ id: BigInt(88) }]);
    const service = new AskDataFreeSqlAuditService({ $queryRaw: queryRaw } as any);
    const generatedSql =
      "SELECT project_name FROM agent_v3_project_service_sales_view WHERE customer_name = '张三' LIMIT 10";

    const id = await service.record({
      question: '张三最近做了什么项目？',
      context,
      status: 'success',
      generatedSql,
      explanation: '按客户和时间查询项目记录',
      guard: {
        status: 'pass',
        safeSql:
          'SELECT project_name FROM agent_v3_project_service_sales_view WHERE store_id = ANY(:allowedStoreIds) LIMIT 10',
        redactedSql:
          'SELECT project_name FROM agent_v3_project_service_sales_view WHERE store_id = ANY(:allowedStoreIds) LIMIT 10',
        params: { allowedStoreIds: [6] },
        selectedViews: [],
        parsed: {} as any,
        appliedPolicies: ['store_scope'],
        sqlFingerprint: 'fingerprint-1',
      },
      cost: { estimatedCost: 22 },
      execution: {
        status: 'success', rows: [{ project_name: '补水护理' }], executionMs: 14,
        attempts: 2, retryAttempted: true, retryLatencyMs: 7,
      },
      selectedViews: [{ viewName: 'agent_v3_project_service_sales_view' } as any],
      answer: {
        summary: '张三最近做了补水护理。',
        keyFindings: [],
        caveats: [],
        displayMode: 'table',
        coveredFacts: [],
      },
      structuredOutput: {
        attempts: 2,
        retryAttempted: true,
        retryLatencyMs: 31,
        firstErrorCode: 'PROVIDER_UNAVAILABLE',
      },
    });

    expect(id).toBe('88');
    const [sqlParts, ...values] = queryRaw.mock.calls[0] as [TemplateStringsArray, ...unknown[]];
    expect(sqlParts.join('?')).toContain('INSERT INTO "ask_data_free_sql_runs"');
    expect(values).toContain(6);
    expect(values).toContain(9);
    expect(values).toContain(14);
    expect(values).toContain(22);
    expect(values).toContain(1);
    expect(values).toContain(
      'SELECT project_name FROM agent_v3_project_service_sales_view WHERE store_id = ANY(:allowedStoreIds) LIMIT 10',
    );
    expect(values).not.toContain(generatedSql);
    expect(values.filter((value) => typeof value === 'string')).toEqual(
      expect.arrayContaining([expect.stringMatching(/^[a-f0-9]{64}$/)]),
    );
    const jsonValues = values.flatMap<Record<string, any>>((value) => {
      if (typeof value !== 'string') return [];
      try {
        return [JSON.parse(value)];
      } catch {
        return [];
      }
    });
    const queryMetaJson = jsonValues.find((value) => value?.structuredOutput);
    if (!queryMetaJson) throw new Error('query metadata JSON was not persisted');
    expect(queryMetaJson.structuredOutput).toEqual({
      attempts: 2,
      retryAttempted: true,
      retryLatencyMs: 31,
      firstErrorCode: 'PROVIDER_UNAVAILABLE',
    });
    expect(queryMetaJson.execution).toEqual({
      attempts: 2,
      retryAttempted: true,
      retryLatencyMs: 7,
    });
  });

  it('returns a traceable unavailable id when the audit database write fails', async () => {
    const service = new AskDataFreeSqlAuditService({
      $queryRaw: jest.fn().mockRejectedValue(new Error('database unavailable')),
    } as any);

    const id = await service.record({ question: '本月收入', context, status: 'failed' });

    expect(id).toMatch(/^ask-data-free-sql-audit-unavailable-\d+-[a-f0-9]{10}$/);
  });
});
