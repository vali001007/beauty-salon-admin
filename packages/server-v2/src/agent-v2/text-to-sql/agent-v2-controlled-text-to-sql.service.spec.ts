import { AgentV2ControlledTextToSqlService } from './agent-v2-controlled-text-to-sql.service.js';
import { AgentV2ReadOnlySqlExecutorService } from './agent-v2-readonly-sql-executor.service.js';
import { AgentV2SemanticViewRegistryService } from './agent-v2-semantic-view-registry.service.js';
import { AgentV2SqlAstParserService } from './agent-v2-sql-ast-parser.service.js';
import { AgentV2SqlCostGuardService } from './agent-v2-sql-cost-guard.service.js';
import { AgentV2SqlGuardService } from './agent-v2-sql-guard.service.js';
import { AgentV2TextToSqlAnswerComposerService } from './agent-v2-text-to-sql-answer-composer.service.js';
import { AgentV2TextToSqlAuditService } from './agent-v2-text-to-sql-audit.service.js';
import { AgentV2TextToSqlPlannerService } from './agent-v2-text-to-sql-planner.service.js';

describe('AgentV2ControlledTextToSqlService', () => {
  beforeAll(() => {
    process.env.AGENT_V2_TEXT_TO_SQL_ENABLED = 'true';
  });

  afterAll(() => {
    delete process.env.AGENT_V2_TEXT_TO_SQL_ENABLED;
  });

  const registry = new AgentV2SemanticViewRegistryService();
  const prisma = {
    agentV2TextToSqlRun: {
      create: jest.fn().mockResolvedValue({ id: 101 }),
    },
  } as any;
  const service = new AgentV2ControlledTextToSqlService(
    new AgentV2TextToSqlPlannerService(registry),
    new AgentV2SqlGuardService(registry, new AgentV2SqlAstParserService()),
    new AgentV2SqlCostGuardService(),
    new AgentV2ReadOnlySqlExecutorService(),
    new AgentV2TextToSqlAnswerComposerService(),
    new AgentV2TextToSqlAuditService(prisma),
    registry,
  );

  it('dry-runs product ranking through planner, guard, evidence and audit', async () => {
    const result = await service.run({
      question: '本月销量最好的商品',
      storeIds: [1],
      roleCodes: ['manager'],
      permissions: ['core:order:view', 'core:product:view'],
      mode: 'dry_run',
    });

    expect(result.status).toBe('dry_run');
    expect(result.evidence.sourceViews).toEqual(['agent_v2_order_item_sales_view']);
    expect(result.queryTrace.planner.selectedViews).toEqual(['agent_v2_order_item_sales_view']);
    expect(result.queryTrace.guard.status).toBe('pass');
    expect(result.queryTrace.costGuard?.status).toBe('pass');
    expect(result.auditRunId).toBe('101');
    expect(prisma.agentV2TextToSqlRun.create).toHaveBeenCalled();
  });

  it.each([
    ['本月销量最好的商品', 'ORDER BY quantity_sold DESC, net_sales_amount DESC'],
    ['最近30天销售额最高的商品', 'ORDER BY net_sales_amount DESC, quantity_sold DESC'],
  ])('dry-runs product sales metric wording through sales view: %s', async (question, orderBy) => {
    const result = await service.run({
      question,
      storeIds: [1],
      roleCodes: ['manager'],
      permissions: ['core:order:view', 'core:product:view'],
      mode: 'dry_run',
    });

    expect(result.status).toBe('dry_run');
    expect(result.evidence.sourceViews).toEqual(['agent_v2_order_item_sales_view']);
    expect(result.queryTrace.planner.selectedViews).toEqual(['agent_v2_order_item_sales_view']);
    expect(result.queryTrace.guard.status).toBe('pass');
    if (result.queryTrace.guard.status === 'pass') {
      expect(result.queryTrace.guard.safeSql).toContain(orderBy);
      expect(result.queryTrace.guard.safeSql).not.toContain('agent_v2_product_inventory_view');
    }
  });

  it.each([
    ['最近30天报废最多的产品有哪些', ['core:inventory:view', 'core:product:view'], 'agent_v2_inventory_scrap_view'],
    ['上个月营业额和本月相比怎么样', ['core:order:view'], 'agent_v2_order_summary_view'],
    ['哪个员工客单价最高', ['core:staff:view', 'core:finance:view'], 'agent_v2_staff_performance_view'],
    ['高消费客户最近复购下降的是谁', ['core:customer:view'], 'agent_v2_customer_profile_summary_view'],
  ])('dry-runs acceptance question through the full controlled path: %s', async (question, permissions, expectedView) => {
    const result = await service.run({
      question,
      storeIds: [1],
      roleCodes: ['manager'],
      permissions,
      mode: 'dry_run',
    });

    expect(result.status).toBe('dry_run');
    expect(result.evidence.sourceViews).toEqual([expectedView]);
    expect(result.queryTrace.guard.status).toBe('pass');
    expect(result.queryTrace.costGuard?.status).toBe('pass');
    if (expectedView === 'agent_v2_inventory_scrap_view' && result.queryTrace.guard.status === 'pass') {
      expect(result.queryTrace.guard.safeSql).toContain('occurred_at >= :startAt');
      expect(result.queryTrace.guard.safeSql).not.toContain('scrap_at');
    }
    expect(result.rows).toEqual([]);
  });

  it('blocks when required permissions are missing', async () => {
    const result = await service.run({
      question: '本月销量最好的商品',
      storeIds: [1],
      roleCodes: ['manager'],
      permissions: ['core:order:view'],
      mode: 'dry_run',
    });

    expect(result.status).toBe('blocked');
    expect(result.blockedReason).toBe('permission_denied');
    expect(prisma.agentV2TextToSqlRun.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        status: 'blocked',
        blockedReason: 'permission_denied',
      }),
    }));
  });

  it('reports readiness summary and execute blockers without exposing database URLs', () => {
    delete process.env.AGENT_V2_TEXT_TO_SQL_READONLY_DATABASE_URL;

    const status = service.getConfigStatus();

    expect(status).toMatchObject({
      enabled: true,
      readonlyExecutionReady: false,
      executeMode: 'dry_run_only',
      viewReadiness: {
        totalViews: 40,
        enabledViews: 13,
        plannedViews: 27,
        adminViews: 4,
      },
      executeBlockers: ['readonly_database_url_missing'],
      readinessCommands: {
        localGate: 'npm.cmd run check:agent-v2-text-to-sql',
        completionAudit: 'npm.cmd run check:agent-v2-text-to-sql:completion-audit',
      },
      deploymentReadiness: {
        primaryMigrationName: '20260707013000_agent_v2_text_to_sql',
        completionAuditRequired: true,
        readonlyUrlRequired: true,
      },
    });
    expect(JSON.stringify(status)).not.toContain('postgres');
    expect(status.viewReadiness.enabledViewNames).toContain('agent_v2_order_item_sales_view');
    expect(status.nextActions[0]).toContain('completion-audit');
    expect(status.nextActions.join(' ')).toContain('strict readiness');
  });

  it('returns no_data through the full service without fabricating answer rows', async () => {
    const localPrisma = {
      agentV2TextToSqlRun: {
        create: jest.fn().mockResolvedValue({ id: 202 }),
      },
    } as any;
    const localService = new AgentV2ControlledTextToSqlService(
      new AgentV2TextToSqlPlannerService(registry),
      new AgentV2SqlGuardService(registry, new AgentV2SqlAstParserService()),
      new AgentV2SqlCostGuardService(),
      { execute: jest.fn().mockResolvedValue({ status: 'no_data', rows: [], executionMs: 3 }) } as any,
      new AgentV2TextToSqlAnswerComposerService(),
      new AgentV2TextToSqlAuditService(localPrisma),
      registry,
    );

    const result = await localService.run({
      question: '本月销量最好的商品',
      storeIds: [1],
      roleCodes: ['manager'],
      permissions: ['core:order:view', 'core:product:view'],
      mode: 'execute',
    });

    expect(result.status).toBe('no_data');
    expect(result.rows).toEqual([]);
    expect(result.answer).toContain('没有匹配数据');
    expect(result.answer).not.toMatch(/第一名|最高的是|共\s*\d+\s*条/);
    expect(localPrisma.agentV2TextToSqlRun.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        status: 'no_data',
        rowCount: 0,
      }),
    }));
  });
});
