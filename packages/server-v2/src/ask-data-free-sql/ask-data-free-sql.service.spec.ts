import { AskDataFreeSqlService } from './ask-data-free-sql.service.js';
import { ReadOnlySqlParser } from '../read-only-sql-kernel/read-only-sql-parser.js';
import { ReadOnlySqlGuard } from '../read-only-sql-kernel/read-only-sql-guard.js';
import { ReadOnlySqlCostGuard } from '../read-only-sql-kernel/read-only-sql-cost-guard.js';

const context = {
  userId: 9,
  storeId: 6,
  visibleStoreIds: [6],
  permissions: ['core:order:projects', 'core:store:projects', 'core:dashboard:view'],
  deniedPermissions: [],
};

describe('AskDataFreeSqlService', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
    jest.restoreAllMocks();
  });

  function build(overrides: Record<string, any> = {}) {
    const ai = overrides.ai ?? {
      generateStructured: jest.fn().mockResolvedValue({
        data: {
          status: 'ready',
          sql: 'SELECT project_name, SUM(net_amount) AS revenue FROM agent_v3_project_service_sales_view p GROUP BY project_name ORDER BY revenue DESC LIMIT 10',
          parameters: { startAt: '2026-07-01', endAt: '2026-08-01' },
          explanation: '按项目汇总净销售额',
          expectedColumns: ['project_name', 'revenue'],
          clarificationQuestion: '',
        },
      }),
    };
    const legacy = overrides.legacy ?? { query: jest.fn() };
    const executor = overrides.executor ?? {
      execute: jest.fn().mockResolvedValue({
        status: 'success',
        rows: [{ project_name: '补水护理', revenue: 1280 }],
        executionMs: 12,
        truncated: false,
      }),
    };
    const answer = overrides.answer ?? {
      compose: jest.fn().mockResolvedValue({
        summary: '补水护理净销售额为 1280。',
        keyFindings: ['补水护理排名第一。'],
        caveats: [],
        displayMode: 'ranking',
      }),
    };
    const audit = overrides.audit ?? { record: jest.fn().mockResolvedValue('101') };
    return {
      service: new AskDataFreeSqlService(
        ai as any,
        legacy as any,
        new ReadOnlySqlGuard(new ReadOnlySqlParser()),
        new ReadOnlySqlCostGuard(),
        executor as any,
        answer as any,
        audit as any,
      ),
      ai,
      legacy,
      executor,
      answer,
      audit,
    };
  }

  it('executes guarded SQL and returns model-organized answer', async () => {
    process.env.ASK_DATA_FREE_SQL_ENABLED = 'true';
    process.env.ASK_DATA_FREE_SQL_DRY_RUN_ONLY = 'false';
    process.env.ASK_DATA_FREE_SQL_READONLY_DATABASE_URL = 'postgresql://readonly:secret@example.invalid/db';
    const { service, executor, audit } = build();
    const result = await service.query({ question: '本月哪个项目收入最高？' }, context);
    expect(result.status).toBe('success');
    expect(result.summary).toContain('1280');
    expect(result.queryPlan.planner).toBe('llm');
    expect(result.queryMeta.generatedSql).toBeUndefined();
    expect(result.auditRunId).toBe('101');
    const guardedSql = (executor.execute as jest.Mock).mock.calls[0][0].guard.safeSql;
    expect(guardedSql).toContain('p.store_id = ANY(:allowedStoreIds)');
    expect(guardedSql).toContain('p.order_created_at >= :startAt');
    expect(audit.record).toHaveBeenLastCalledWith(
      expect.objectContaining({ cost: expect.objectContaining({ estimatedCost: 36 }) }),
    );
  });

  it('shows redacted SQL only to audit-capable users', async () => {
    process.env.ASK_DATA_FREE_SQL_ENABLED = 'true';
    process.env.ASK_DATA_FREE_SQL_DRY_RUN_ONLY = 'false';
    process.env.ASK_DATA_FREE_SQL_READONLY_DATABASE_URL = 'postgresql://readonly:secret@example.invalid/db';
    const { service } = build();
    const result = await service.query(
      { question: '本月项目收入' },
      { ...context, permissions: [...context.permissions, 'core:system:logs'] },
    );
    expect(result.queryMeta.generatedSql).toContain('SELECT');
    expect(result.queryPlan.generatedSql).toContain('SELECT');
  });

  it('uses the admin database only in explicit development smoke mode and marks the response', async () => {
    process.env.NODE_ENV = 'development';
    process.env.DATABASE_URL = 'postgresql://admin:secret@example.invalid/db';
    process.env.ASK_DATA_FREE_SQL_ENABLED = 'true';
    process.env.ASK_DATA_FREE_SQL_DRY_RUN_ONLY = 'false';
    process.env.ASK_DATA_FREE_SQL_DEV_USE_ADMIN_DATABASE_URL = 'true';
    delete process.env.ASK_DATA_FREE_SQL_READONLY_DATABASE_URL;
    const { service, executor } = build();

    const catalog = service.getCatalog();
    const result = await service.query(
      { question: '本月项目收入' },
      { ...context, permissions: [...context.permissions, 'core:system:logs'] },
    );

    expect(catalog.connectionMode).toBe('development_admin');
    expect(catalog.executeReady).toBe(true);
    expect((executor.execute as jest.Mock).mock.calls[0][0].connectionString).toContain('admin:secret');
    expect(result.queryMeta.connectionMode).toBe('development_admin');
    expect(result.limitations.join(' ')).toContain('开发环境管理员数据库连接冒烟模式');
  });

  it('falls back to the four legacy templates when feature flag is off', async () => {
    process.env.ASK_DATA_FREE_SQL_ENABLED = 'false';
    const legacy = {
      query: jest.fn().mockResolvedValue({
        status: 'success',
        summary: '固定模板结果',
        columns: [],
        rows: [],
        sources: [],
        queryPlan: { intent: 'query', planner: 'rule', dateRange: { label: '本月' } },
      }),
    };
    const { service } = build({ legacy });
    const result = await service.query({ question: '本月项目收入' }, context);
    expect(result.queryPlan.planner).toBe('legacy');
    expect(result.limitations[0]).toContain('固定模板');
    expect(legacy.query).toHaveBeenCalledTimes(1);
  });

  it('blocks SQL that exceeds the current user permission', async () => {
    process.env.ASK_DATA_FREE_SQL_ENABLED = 'true';
    const ai = {
      generateStructured: jest.fn().mockResolvedValue({
        data: {
          status: 'ready',
          sql: 'SELECT staff_name, paid_amount FROM agent_v3_staff_performance_view LIMIT 10',
          parameters: {},
          explanation: '员工绩效',
          expectedColumns: [],
          clarificationQuestion: '',
        },
      }),
    };
    const executor = { execute: jest.fn() };
    const { service } = build({ ai, executor });
    const result = await service.query({ question: '员工绩效排行' }, context);
    expect(result.status).toBe('blocked');
    expect(result.queryMeta.statusReason).toBe('permission_denied');
    expect(executor.execute).not.toHaveBeenCalled();
  });

  it('repairs one model SQL shape failure without bypassing the guard', async () => {
    process.env.ASK_DATA_FREE_SQL_ENABLED = 'true';
    process.env.ASK_DATA_FREE_SQL_DRY_RUN_ONLY = 'false';
    process.env.ASK_DATA_FREE_SQL_READONLY_DATABASE_URL = 'postgresql://readonly:secret@example.invalid/db';
    const ai = {
      generateStructured: jest
        .fn()
        .mockResolvedValueOnce({
          data: {
            status: 'ready',
            sql: 'SELECT project_name, (SELECT SUM(net_amount) FROM agent_v3_project_service_sales_view) AS revenue FROM agent_v3_project_service_sales_view LIMIT 10',
            parameters: {},
            explanation: '按项目汇总净销售额',
            expectedColumns: ['project_name', 'revenue'],
            clarificationQuestion: '',
          },
        })
        .mockResolvedValueOnce({
          data: {
            status: 'ready',
            sql: 'SELECT project_name, SUM(net_amount) AS revenue FROM agent_v3_project_service_sales_view p GROUP BY project_name ORDER BY revenue DESC LIMIT 10',
            parameters: {},
            explanation: '按项目直接分组汇总净销售额',
            expectedColumns: ['project_name', 'revenue'],
            clarificationQuestion: '',
          },
        }),
    };
    const { service, executor } = build({ ai });

    const result = await service.query({ question: '本月项目收入排行' }, context);

    expect(result.status).toBe('success');
    expect(ai.generateStructured).toHaveBeenCalledTimes(2);
    expect(ai.generateStructured.mock.calls[1][0].scenario).toBe('ask_data_free_sql_repair');
    expect((executor.execute as jest.Mock).mock.calls[0][0].guard.safeSql).not.toContain('(SELECT');
  });

  it('returns clarification without executing SQL', async () => {
    process.env.ASK_DATA_FREE_SQL_ENABLED = 'true';
    const ai = {
      generateStructured: jest.fn().mockResolvedValue({
        data: {
          status: 'clarification',
          sql: '',
          parameters: {},
          explanation: '缺少时间',
          expectedColumns: [],
          clarificationQuestion: '想查哪个月？',
        },
      }),
    };
    const executor = { execute: jest.fn() };
    const { service } = build({ ai, executor });
    const result = await service.query({ question: '查一下收入' }, context);
    expect(result.status).toBe('clarification');
    expect(result.clarificationQuestion).toBe('想查哪个月？');
    expect(executor.execute).not.toHaveBeenCalled();
  });

  it.each([
    ['SELECT * FROM ProductOrder', 'raw_sql_input_not_allowed'],
    ['帮我删除昨天的订单', 'write_intent_not_allowed'],
    ['查出所有客户手机号', 'sensitive_data_intent_not_allowed'],
    ['对比所有门店营业额', 'cross_store_not_allowed'],
  ])('blocks unsafe question before calling the model: %s', async (question, reasonCode) => {
    process.env.ASK_DATA_FREE_SQL_ENABLED = 'true';
    const ai = { generateStructured: jest.fn() };
    const { service } = build({ ai });
    const result = await service.query({ question }, context);
    expect(result.status).toBe('blocked');
    expect(result.queryMeta.statusReason).toBe(reasonCode);
    expect(ai.generateStructured).not.toHaveBeenCalled();
  });
});
