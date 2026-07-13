import { AgentV2TextToSqlController } from './agent-v2-text-to-sql.controller.js';
import { PERMISSIONS_KEY } from '../../common/decorators/permissions.decorator.js';

function makeController() {
  const service = {
    run: jest.fn(),
    inspectSql: jest.fn(),
    testSemanticView: jest.fn(),
    listSemanticViews: jest.fn(),
    getConfigStatus: jest.fn(),
  };
  const audit = {
    listRuns: jest.fn(),
    getRun: jest.fn(),
    createFeedback: jest.fn(),
  };
  const candidates = {
    listCandidates: jest.fn(),
    promoteRunToDraft: jest.fn(),
    promoteToDraft: jest.fn(),
  };
  return {
    controller: new AgentV2TextToSqlController(service as any, audit as any, candidates as any),
    service,
    audit,
  };
}

function textSqlResult() {
  return {
    status: 'dry_run',
    answer: 'ok',
    rows: [],
    evidence: { sourceViews: ['agent_v2_order_item_sales_view'] },
    queryTrace: {
      planner: {
        generatedSql: 'SELECT product_name FROM agent_v2_order_item_sales_view LIMIT 10',
      },
      guard: {
        safeSql: 'SELECT product_name FROM agent_v2_order_item_sales_view WHERE store_id = ANY(:allowedStoreIds) LIMIT 10',
        redactedSql: 'SELECT product_name FROM agent_v2_order_item_sales_view WHERE store_id = ANY(?) LIMIT 10',
      },
      executionMode: 'dry_run',
    },
  };
}

describe('AgentV2TextToSqlController', () => {
  function permissionsFor(methodName: keyof AgentV2TextToSqlController) {
    return Reflect.getMetadata(PERMISSIONS_KEY, AgentV2TextToSqlController.prototype[methodName]);
  }

  it('keeps execute and promote APIs behind manage permission', () => {
    expect(permissionsFor('dryRun')).toEqual(['core:agent-governance:view']);
    expect(permissionsFor('inspect')).toEqual(['core:agent-governance:view']);
    expect(permissionsFor('listRuns')).toEqual(['core:agent-governance:view']);
    expect(permissionsFor('getRun')).toEqual(['core:agent-governance:view']);
    expect(permissionsFor('createFeedback')).toEqual(['core:agent-governance:view']);
    expect(permissionsFor('execute')).toEqual(['core:agent-governance:manage']);
    expect(permissionsFor('promoteRun')).toEqual(['core:agent-governance:manage']);
    expect(permissionsFor('promoteCandidate')).toEqual(['core:agent-governance:manage']);
  });

  it('forces dry-run mode and redacts raw SQL for view-only users', async () => {
    const { controller, service } = makeController();
    service.run.mockResolvedValue(textSqlResult());

    const result = await controller.dryRun(
      { question: '本月销量最好的商品', storeId: 1, mode: 'execute' as any },
      { user: { id: 1, storeId: 1, permissions: ['core:agent-governance:view'], roles: [] } } as any,
    );

    expect(service.run).toHaveBeenCalledWith(expect.objectContaining({ mode: 'dry_run' }));
    expect((result as any).queryTrace.planner.generatedSql).toBe('仅 core:agent-governance:manage 可查看');
    expect((result as any).queryTrace.guard.safeSql).toBe('仅 core:agent-governance:manage 可查看');
    expect((result as any).queryTrace.guard.redactedSql).toContain('ANY(?)');
  });

  it('keeps raw SQL for manage users', async () => {
    const { controller, service } = makeController();
    service.run.mockResolvedValue(textSqlResult());

    const result = await controller.dryRun(
      { question: '本月销量最好的商品', storeId: 1 },
      { user: { id: 1, storeId: 1, permissions: ['core:agent-governance:manage'], roles: [] } } as any,
    );

    expect((result as any).queryTrace.planner.generatedSql).toContain('SELECT product_name');
    expect((result as any).queryTrace.guard.safeSql).toContain('store_id');
  });

  it('redacts guard inspect safe SQL for view-only users', () => {
    const { controller, service } = makeController();
    service.inspectSql.mockReturnValue({
      status: 'pass',
      safeSql: 'SELECT product_name FROM agent_v2_order_item_sales_view WHERE store_id = ANY(:allowedStoreIds) LIMIT 10',
      redactedSql: 'SELECT product_name FROM agent_v2_order_item_sales_view WHERE store_id = ANY(?) LIMIT 10',
      appliedPolicies: [],
    });

    const result = controller.inspect(
      { sql: 'SELECT product_name FROM agent_v2_order_item_sales_view LIMIT 10', storeId: 1 },
      { user: { id: 1, storeId: 1, permissions: ['core:agent-governance:view'], roles: [] } } as any,
    );

    expect((result as any).safeSql).toBe('仅 core:agent-governance:manage 可查看');
    expect((result as any).redactedSql).toContain('ANY(?)');
  });

  it('does not expose admin semantic views to view-only users', () => {
    const { controller, service } = makeController();
    service.listSemanticViews.mockReturnValue([]);

    controller.listViews(
      'true',
      'true',
      { user: { id: 1, storeId: 1, permissions: ['core:agent-governance:view'], roles: [] } } as any,
    );

    expect(service.listSemanticViews).toHaveBeenCalledWith({
      includePlanned: true,
      includeAdmin: false,
    });
  });

  it('allows manage users to request admin semantic views', () => {
    const { controller, service } = makeController();
    service.listSemanticViews.mockReturnValue([]);

    controller.listViews(
      'true',
      'true',
      { user: { id: 1, storeId: 1, permissions: ['core:agent-governance:manage'], roles: [] } } as any,
    );

    expect(service.listSemanticViews).toHaveBeenCalledWith({
      includePlanned: true,
      includeAdmin: true,
    });
  });

  it('exposes readiness status summary through view permission', () => {
    const { controller, service } = makeController();
    service.getConfigStatus.mockReturnValue({
      enabled: true,
      readonlyExecutionReady: false,
      executeMode: 'dry_run_only',
      viewReadiness: { totalViews: 40, enabledViews: 13, plannedViews: 27, adminViews: 4 },
      executeBlockers: ['readonly_database_url_missing'],
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
    });

    const result = controller.getStatus();

    expect(permissionsFor('getStatus')).toEqual(['core:agent-governance:view']);
    expect(result).toMatchObject({
      viewReadiness: { totalViews: 40, enabledViews: 13 },
      executeBlockers: ['readonly_database_url_missing'],
      readinessCommands: {
        completionAudit: 'npm.cmd run check:agent-v2-text-to-sql:completion-audit',
      },
      deploymentReadiness: {
        primaryMigrationName: '20260707013000_agent_v2_text_to_sql',
      },
    });
    expect(JSON.stringify(result)).not.toContain('postgres');
  });

  it('redacts raw SQL from audit run lists', async () => {
    const { controller, audit } = makeController();
    audit.listRuns.mockResolvedValue({
      items: [{
        id: 1,
        redactedSql: 'SELECT product_name FROM agent_v2_order_item_sales_view WHERE store_id = ANY(?)',
        queryTraceJson: {
          planner: { generatedSql: 'SELECT product_name FROM agent_v2_order_item_sales_view LIMIT 10' },
          guard: {
            safeSql: 'SELECT product_name FROM agent_v2_order_item_sales_view WHERE store_id = ANY(:allowedStoreIds) LIMIT 10',
            redactedSql: 'SELECT product_name FROM agent_v2_order_item_sales_view WHERE store_id = ANY(?) LIMIT 10',
          },
        },
      }],
      total: 1,
      page: 1,
      pageSize: 20,
    });

    const result = await controller.listRuns({ page: '1' });
    const item = (result as any).items[0];

    expect(item.queryTraceJson.planner.generatedSql).toBe('审计接口仅展示 redactedSql 和 SQL hash');
    expect(item.queryTraceJson.guard.safeSql).toBe('审计接口仅展示 redactedSql 和 SQL hash');
    expect(item.queryTraceJson.guard.redactedSql).toContain('ANY(?)');
  });

  it('redacts raw SQL from audit run details even for manage users', async () => {
    const { controller, audit } = makeController();
    audit.getRun.mockResolvedValue({
      id: 1,
      redactedSql: 'SELECT product_name FROM agent_v2_order_item_sales_view WHERE store_id = ANY(?)',
      queryTraceJson: {
        planner: { generatedSql: 'SELECT product_name FROM agent_v2_order_item_sales_view LIMIT 10' },
        guard: {
          safeSql: 'SELECT product_name FROM agent_v2_order_item_sales_view WHERE store_id = ANY(:allowedStoreIds) LIMIT 10',
          redactedSql: 'SELECT product_name FROM agent_v2_order_item_sales_view WHERE store_id = ANY(?) LIMIT 10',
        },
      },
    });

    const result = await controller.getRun(1);

    expect((result as any).queryTraceJson.planner.generatedSql).toBe('审计接口仅展示 redactedSql 和 SQL hash');
    expect((result as any).queryTraceJson.guard.safeSql).toBe('审计接口仅展示 redactedSql 和 SQL hash');
    expect((result as any).queryTraceJson.guard.redactedSql).toContain('ANY(?)');
  });

  it('records user feedback with view permission without executing or promoting', () => {
    const { controller, audit, service } = makeController();
    audit.createFeedback.mockResolvedValue({ id: 9 });

    controller.createFeedback(
      7,
      {
        rating: 1,
        feedbackText: '结果不对，怀疑缺少退款过滤',
        isUseful: false,
        isWrongAnswer: true,
        isPermissionConcern: true,
      },
      { user: { id: 3, storeId: 1, permissions: ['core:agent-governance:view'], roles: [] } } as any,
    );

    expect(audit.createFeedback).toHaveBeenCalledWith({
      runId: 7,
      userId: 3,
      rating: 1,
      feedbackText: '结果不对，怀疑缺少退款过滤',
      isUseful: false,
      isWrongAnswer: true,
      isPermissionConcern: true,
    });
    expect(service.run).not.toHaveBeenCalled();
  });
});
