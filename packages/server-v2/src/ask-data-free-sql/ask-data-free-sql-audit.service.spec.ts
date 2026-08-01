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
    const create = jest.fn().mockResolvedValue({ id: BigInt(88) });
    const service = new AskDataFreeSqlAuditService({ askDataFreeSqlRun: { create } } as any);
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
      execution: { status: 'success', rows: [{ project_name: '补水护理' }], executionMs: 14 },
      selectedViews: [{ viewName: 'agent_v3_project_service_sales_view' } as any],
      answer: {
        summary: '张三最近做了补水护理。',
        keyFindings: [],
        caveats: [],
        displayMode: 'table',
      },
    });

    expect(id).toBe('88');
    const data = create.mock.calls[0][0].data;
    expect(data.generatedSqlHash).toMatch(/^[a-f0-9]{64}$/);
    expect(data.safeSqlHash).toMatch(/^[a-f0-9]{64}$/);
    expect(data.redactedSql).toContain(':allowedStoreIds');
    expect(data.redactedSql).not.toContain('张三');
    expect(JSON.stringify(data)).not.toContain(generatedSql);
    expect(data.storeId).toBe(6);
    expect(data.userId).toBe(9);
    expect(data.rowCount).toBe(1);
    expect(data.executionMs).toBe(14);
    expect(data.estimatedCost).toBe(22);
  });

  it('returns a traceable unavailable id when the audit database write fails', async () => {
    const service = new AskDataFreeSqlAuditService({
      askDataFreeSqlRun: { create: jest.fn().mockRejectedValue(new Error('database unavailable')) },
    } as any);

    const id = await service.record({ question: '本月收入', context, status: 'failed' });

    expect(id).toMatch(/^ask-data-free-sql-audit-unavailable-\d+-[a-f0-9]{10}$/);
  });
});
