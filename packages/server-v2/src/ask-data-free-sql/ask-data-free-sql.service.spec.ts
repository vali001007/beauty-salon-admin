import { AskDataFreeSqlService } from './ask-data-free-sql.service.js';
import { ReadOnlySqlParser } from '../read-only-sql-kernel/read-only-sql-parser.js';
import { ReadOnlySqlGuard } from '../read-only-sql-kernel/read-only-sql-guard.js';
import { ReadOnlySqlCostGuard } from '../read-only-sql-kernel/read-only-sql-cost-guard.js';
import { AskDataClarificationPolicy } from './ask-data-clarification-policy.js';
import { AskDataIntentParser } from './ask-data-intent-parser.js';
import { AskDataSemanticRouter } from './ask-data-semantic-router.js';
import { AiStructuredOutputError } from '../ai/ai.service.js';

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
        new AskDataSemanticRouter(ai as any, new AskDataIntentParser(), new AskDataClarificationPolicy()),
        (overrides.entityResolver ?? { resolve: jest.fn(async (intent) => ({ semanticIntent: intent })) }) as any,
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

    const catalog = service.getCatalog({ ...context, permissions: ['*'] });
    const result = await service.query(
      { question: '本月项目收入' },
      { ...context, permissions: [...context.permissions, 'core:system:logs'] },
    );

    expect(catalog.connectionMode).toBe('development_admin');
    expect(catalog.executeReady).toBe(true);
    expect(catalog.totalCount).toBe(37);
    expect((executor.execute as jest.Mock).mock.calls[0][0].connectionString).toContain('admin:secret');
    expect(result.queryMeta.connectionMode).toBe('development_admin');
    expect(result.limitations.join(' ')).toContain('开发环境管理员数据库连接冒烟模式');
  });

  it('returns only permission-authorized catalog entries and groups', () => {
    process.env.ASK_DATA_FREE_SQL_ENABLED = 'true';
    const { service } = build();
    const catalog = service.getCatalog({
      ...context,
      permissions: ['core:marketing:view'],
      deniedPermissions: [],
    });

    expect(catalog.totalCount).toBe(3);
    expect(catalog.groups).toEqual([{ domain: 'marketing', label: '营销效果', count: 3 }]);
    expect(catalog.tables.every((table) => table.domain === 'marketing')).toBe(true);
    expect(catalog.tables.some((table) => table.viewName === 'ask_data_marketing_roi_view')).toBe(false);
  });

  it('clarifies when a named customer is missing or duplicated before SQL generation', async () => {
    process.env.ASK_DATA_FREE_SQL_ENABLED = 'true';
    process.env.ASK_DATA_SEMANTIC_ROUTER_ENABLED = 'true';
    const entityResolver = {
      resolve: jest.fn(async (intent) => ({
        semanticIntent: {
          ...intent,
          ambiguities: [...intent.ambiguities, { slot: 'entity_identity', reason: '同名客户', candidates: [] }],
        },
        clarificationQuestion: '当前门店有多位姓名为“吴晓雯”的客户，无法唯一定位。请补充客户 ID。',
        clarificationReason: 'customer_entity_not_unique',
      })),
    };
    const { service, ai, executor } = build({ entityResolver });
    const result = await service.query(
      { question: '吴晓雯的会员等级是什么' },
      { ...context, permissions: ['core:customer:view'] },
    );

    expect(result.status).toBe('clarification');
    expect(result.clarificationQuestion).toContain('客户 ID');
    expect(result.queryMeta.statusReason).toBe('customer_entity_not_unique');
    expect(ai.generateStructured).not.toHaveBeenCalled();
    expect(executor.execute).not.toHaveBeenCalled();
  });

  it('uses the governed no-data reason for missing confirmed snapshots', async () => {
    process.env.ASK_DATA_FREE_SQL_ENABLED = 'true';
    process.env.ASK_DATA_FREE_SQL_DRY_RUN_ONLY = 'false';
    process.env.ASK_DATA_FREE_SQL_READONLY_DATABASE_URL = 'postgresql://readonly:secret@example.invalid/db';
    const ai = {
      generateStructured: jest.fn().mockResolvedValue({
        data: {
          status: 'ready',
          sql: 'SELECT period_month, operating_profit FROM ask_data_confirmed_profit_view p LIMIT 10',
          parameters: { startAt: '2026-07-01', endAt: '2026-08-01' },
          explanation: '查询已确认利润快照',
          expectedColumns: ['period_month', 'operating_profit'],
          clarificationQuestion: '',
        },
      }),
    };
    const executor = {
      execute: jest.fn().mockResolvedValue({ status: 'no_data', rows: [], executionMs: 8, truncated: false }),
    };
    const answer = {
      compose: jest.fn().mockResolvedValue({
        summary: '当前筛选范围内没有匹配数据。',
        keyFindings: [],
        caveats: [],
        displayMode: 'table',
      }),
    };
    const { service } = build({ ai, executor, answer });
    const result = await service.query(
      { question: '本月已确认实际利润是多少？' },
      { ...context, permissions: ['core:operation-profit:view'] },
    );

    expect(result.status).toBe('no_data');
    expect(result.summary).toContain('尚无已确认利润快照');
    expect(result.rows).toEqual([]);
  });

  it('normalizes a null-only aggregate row to governed no-data', async () => {
    process.env.ASK_DATA_FREE_SQL_ENABLED = 'true';
    process.env.ASK_DATA_FREE_SQL_DRY_RUN_ONLY = 'false';
    process.env.ASK_DATA_FREE_SQL_READONLY_DATABASE_URL = 'postgresql://readonly:secret@example.invalid/db';
    const ai = {
      generateStructured: jest.fn().mockResolvedValue({
        data: {
          status: 'ready',
          sql: 'SELECT SUM(operating_profit) AS operating_profit FROM ask_data_confirmed_profit_view p LIMIT 1',
          parameters: { startAt: '2026-07-01', endAt: '2026-08-01' },
          explanation: '汇总已确认利润快照',
          expectedColumns: ['operating_profit'],
          clarificationQuestion: '',
        },
      }),
    };
    const executor = {
      execute: jest.fn().mockResolvedValue({
        status: 'success',
        rows: [{ operating_profit: null }],
        executionMs: 8,
        truncated: false,
      }),
    };
    const answer = {
      compose: jest.fn().mockResolvedValue({
        summary: '当前筛选范围内没有匹配数据。',
        keyFindings: [],
        caveats: [],
        displayMode: 'table',
      }),
    };
    const { service } = build({ ai, executor, answer });

    const result = await service.query(
      { question: '本月已确认实际利润是多少？' },
      { ...context, permissions: ['core:operation-profit:view'] },
    );

    expect(result.status).toBe('no_data');
    expect(result.summary).toContain('尚无已确认利润快照');
    expect(result.rows).toEqual([]);
    expect(result.columns).toEqual([]);
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
          sql: 'SELECT staff_name, paid_amount FROM ask_data_staff_performance_view LIMIT 10',
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

  it('blocks an explicitly unauthorized domain before calling the model', async () => {
    process.env.ASK_DATA_FREE_SQL_ENABLED = 'true';
    const ai = { generateStructured: jest.fn() };
    const { service } = build({ ai });

    const result = await service.query(
      { question: '本月营业额、退款和净收分别是多少？' },
      {
        ...context,
        permissions: ['core:dashboard:view', 'core:store:scheduling'],
        deniedPermissions: [],
      },
    );

    expect(result.status).toBe('blocked');
    expect(result.queryMeta.statusReason).toBe('permission_denied');
    expect(ai.generateStructured).not.toHaveBeenCalled();
  });

  it('returns permission denied for an unauthorized 营业利润 question instead of a generic clarification', async () => {
    process.env.ASK_DATA_FREE_SQL_ENABLED = 'true';
    const ai = { generateStructured: jest.fn() };
    const { service } = build({ ai });

    const result = await service.query(
      { question: '本月营业利润是多少？' },
      {
        ...context,
        permissions: ['core:store:reservations'],
        deniedPermissions: [],
      },
    );

    expect(result.status).toBe('blocked');
    expect(result.queryMeta.statusReason).toBe('permission_denied');
    expect(result.summary).toContain('没有查询该类经营数据的权限');
    expect(ai.generateStructured).not.toHaveBeenCalled();
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

  it('retries a false clarification once when the time scope and ranking metric are explicit', async () => {
    process.env.ASK_DATA_FREE_SQL_ENABLED = 'true';
    process.env.ASK_DATA_FREE_SQL_DRY_RUN_ONLY = 'false';
    process.env.ASK_DATA_FREE_SQL_READONLY_DATABASE_URL = 'postgresql://readonly:secret@example.invalid/db';
    const ai = {
      generateStructured: jest
        .fn()
        .mockResolvedValueOnce({
          data: {
            status: 'clarification',
            sql: '',
            parameters: {},
            explanation: '误判为缺少范围',
            expectedColumns: [],
            clarificationQuestion: '需要补充条件吗？',
          },
        })
        .mockResolvedValueOnce({
          data: {
            status: 'ready',
            sql: 'SELECT promotion_name, used_count FROM agent_v3_promotion_offer_view p ORDER BY used_count DESC LIMIT 100',
            parameters: {},
            explanation: '按本月优惠使用次数排序',
            expectedColumns: ['promotion_name', 'used_count'],
            clarificationQuestion: '',
          },
        }),
    };
    const { service, executor, audit } = build({ ai });

    const result = await service.query(
      { question: '本月优惠活动使用次数排行？' },
      { ...context, permissions: ['core:marketing:view'] },
    );

    expect(result.status).toBe('success');
    expect(ai.generateStructured).toHaveBeenCalledTimes(2);
    expect(ai.generateStructured.mock.calls[1][0].scenario).toBe('ask_data_free_sql_clarification_repair');
    expect(executor.execute).toHaveBeenCalledTimes(1);
    expect(audit.record).toHaveBeenLastCalledWith(expect.objectContaining({
      structuredOutput: expect.objectContaining({
        attempts: 2,
        repairAttempts: [expect.objectContaining({
          kind: 'clarification',
          reasonCode: 'model_clarification',
          succeeded: true,
        })],
      }),
    }));
  });

  it('retries one transient SQL-generation provider failure and audits the recovery', async () => {
    process.env.ASK_DATA_FREE_SQL_ENABLED = 'true';
    process.env.ASK_DATA_FREE_SQL_DRY_RUN_ONLY = 'false';
    process.env.ASK_DATA_FREE_SQL_READONLY_DATABASE_URL = 'postgresql://readonly:secret@example.invalid/db';
    const ai = {
      generateStructured: jest
        .fn()
        .mockRejectedValueOnce(new AiStructuredOutputError('PROVIDER_UNAVAILABLE', 'temporary'))
        .mockResolvedValueOnce({
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
    const { service, audit } = build({ ai });

    const result = await service.query({ question: '本月项目收入排行' }, context);

    expect(result.status).toBe('success');
    expect(ai.generateStructured).toHaveBeenCalledTimes(2);
    expect(ai.generateStructured.mock.calls[1][0].scenario).toBe('ask_data_free_sql_generate_transient_retry');
    expect(audit.record).toHaveBeenLastCalledWith(expect.objectContaining({
      structuredOutput: expect.objectContaining({
        attempts: 2,
        retryAttempted: true,
        firstErrorCode: 'PROVIDER_UNAVAILABLE',
      }),
    }));
  });

  it('uses the independent semantic route and exposes governed assumptions when enabled', async () => {
    process.env.ASK_DATA_FREE_SQL_ENABLED = 'true';
    process.env.ASK_DATA_FREE_SQL_DRY_RUN_ONLY = 'false';
    process.env.ASK_DATA_FREE_SQL_READONLY_DATABASE_URL = 'postgresql://readonly:secret@example.invalid/db';
    process.env.ASK_DATA_SEMANTIC_ROUTER_ENABLED = 'true';
    process.env.ASK_DATA_SEMANTIC_ROUTER_SHADOW = 'false';
    process.env.ASK_DATA_SEMANTIC_ROUTER_MODEL_FALLBACK = 'false';
    const ai = {
      generateStructured: jest.fn().mockResolvedValue({
        data: {
          status: 'ready',
          sql: 'SELECT project_id, project_name, SUM(service_quantity) AS service_count, SUM(net_amount) AS project_revenue FROM agent_v3_project_service_sales_view p GROUP BY project_id, project_name ORDER BY service_count DESC LIMIT 10',
          parameters: {},
          explanation: '按项目服务次数排序',
          expectedColumns: ['project_id', 'project_name', 'service_count', 'project_revenue'],
          clarificationQuestion: '',
        },
      }),
    };
    const { service, audit } = build({ ai });

    const result = await service.query({ question: '最近哪个项目最受欢迎' }, context);

    expect(result.status).toBe('success');
    expect(result.queryPlan.semanticIntent).toEqual(
      expect.objectContaining({
        metricKeys: ['project_sales'],
        answerShape: 'ranking',
        routeMode: 'deterministic',
      }),
    );
    expect(result.limitations).toEqual(
      expect.arrayContaining(['“最近”按近 30 天查询。', '未指定排行数量，默认返回前 10 名。']),
    );
    const sqlPrompt = JSON.stringify((ai.generateStructured as jest.Mock).mock.calls[0][0]);
    expect(sqlPrompt).toContain('agent_v3_project_service_sales_view');
    expect(sqlPrompt).not.toContain('agent_v3_order_item_sales_view');
    expect(audit.record).toHaveBeenLastCalledWith(
      expect.objectContaining({
        semanticRouting: expect.objectContaining({
          finalCandidates: ['agent_v3_project_service_sales_view'],
          shadow: false,
        }),
      }),
    );
  });

  it('does not spend a semantic model call or change the scalar shape for a clear reservation situation query', async () => {
    process.env.ASK_DATA_FREE_SQL_ENABLED = 'true';
    process.env.ASK_DATA_FREE_SQL_DRY_RUN_ONLY = 'false';
    process.env.ASK_DATA_FREE_SQL_READONLY_DATABASE_URL = 'postgresql://readonly:secret@example.invalid/db';
    process.env.ASK_DATA_SEMANTIC_ROUTER_ENABLED = 'true';
    process.env.ASK_DATA_SEMANTIC_ROUTER_SHADOW = 'false';
    process.env.ASK_DATA_SEMANTIC_ROUTER_MODEL_FALLBACK = 'true';
    const ai = {
      generateStructured: jest.fn().mockResolvedValue({
        data: {
          status: 'ready',
          sql: 'SELECT COUNT(DISTINCT reservation_id) AS reservation_count FROM agent_v3_reservation_view LIMIT 1',
          parameters: {},
          explanation: '统计明天的非取消预约数量',
          expectedColumns: ['reservation_count'],
          clarificationQuestion: '',
        },
      }),
    };
    const executor = {
      execute: jest.fn().mockResolvedValue({
        status: 'success',
        rows: [{ reservation_count: 3 }],
        executionMs: 8,
        truncated: false,
      }),
    };
    const answer = {
      compose: jest.fn().mockResolvedValue({
        summary: '明天共有 3 个预约。',
        keyFindings: ['预约数量为 3。'],
        caveats: [],
        displayMode: 'scalar',
      }),
    };
    const { service } = build({ ai, executor, answer });

    const result = await service.query(
      { question: '帮我查一下明天的预约情况' },
      { ...context, permissions: ['core:store:reservations', 'core:system:logs'] },
    );

    expect(result.status).toBe('success');
    expect(result.queryPlan.semanticIntent).toEqual(expect.objectContaining({
      metricKeys: ['reservation_metrics'],
      answerShape: 'scalar',
      routeMode: 'deterministic',
    }));
    expect(result.queryPlan.controlled).toEqual(expect.objectContaining({
      resultMode: 'scalar',
      requiredViewNames: ['agent_v3_reservation_view'],
    }));
    expect(ai.generateStructured).toHaveBeenCalledTimes(1);
    expect(ai.generateStructured.mock.calls[0][0].scenario).toBe('ask_data_free_sql_generate');
  });

  it('only exposes query-plan-approved views to SQL generation', async () => {
    process.env.ASK_DATA_FREE_SQL_ENABLED = 'true';
    process.env.ASK_DATA_FREE_SQL_DRY_RUN_ONLY = 'false';
    process.env.ASK_DATA_FREE_SQL_READONLY_DATABASE_URL = 'postgresql://readonly:secret@example.invalid/db';
    process.env.ASK_DATA_SEMANTIC_ROUTER_ENABLED = 'true';
    process.env.ASK_DATA_SEMANTIC_ROUTER_SHADOW = 'false';
    process.env.ASK_DATA_SEMANTIC_ROUTER_MODEL_FALLBACK = 'false';
    const ai = {
      generateStructured: jest.fn().mockResolvedValue({
        data: {
          status: 'ready',
          sql: 'SELECT supplier_id, supplier_name, SUM(procurement_count) AS procurement_count, SUM(procurement_amount) AS procurement_amount, AVG(avg_delivery_days) AS avg_delivery_days FROM agent_v3_supplier_performance_view GROUP BY supplier_id, supplier_name LIMIT 100',
          parameters: {},
          explanation: '按供应商展示采购表现',
          expectedColumns: ['supplier_id', 'supplier_name', 'procurement_count', 'procurement_amount', 'avg_delivery_days'],
          clarificationQuestion: '',
        },
      }),
    };
    const { service } = build({ ai });

    const result = await service.query(
      { question: '比较各供应商的采购次数、采购金额和平均交付天数' },
      { ...context, permissions: ['*'] },
    );

    expect(ai.generateStructured).toHaveBeenCalled();
    const userPrompt = JSON.parse((ai.generateStructured as jest.Mock).mock.calls[0][0].messages[1].content);
    expect(userPrompt.catalog.map((view: { viewName: string }) => view.viewName)).toEqual([
      'agent_v3_supplier_performance_view',
    ]);
  });

  it('runs semantic routing in shadow without changing the legacy SQL prompt', async () => {
    process.env.ASK_DATA_FREE_SQL_ENABLED = 'true';
    process.env.ASK_DATA_FREE_SQL_DRY_RUN_ONLY = 'false';
    process.env.ASK_DATA_FREE_SQL_READONLY_DATABASE_URL = 'postgresql://readonly:secret@example.invalid/db';
    process.env.ASK_DATA_SEMANTIC_ROUTER_ENABLED = 'false';
    process.env.ASK_DATA_SEMANTIC_ROUTER_SHADOW = 'true';
    process.env.ASK_DATA_SEMANTIC_ROUTER_MODEL_FALLBACK = 'false';
    const { service, ai, audit } = build();

    const result = await service.query({ question: '最近哪个项目最受欢迎' }, context);

    expect(result.queryPlan.semanticIntent).toBeUndefined();
    const userPrompt = JSON.parse((ai.generateStructured as jest.Mock).mock.calls[0][0].messages[1].content);
    expect(userPrompt.semanticIntent).toBeUndefined();
    expect(audit.record).toHaveBeenLastCalledWith(
      expect.objectContaining({ semanticRouting: expect.objectContaining({ shadow: true }) }),
    );
  });

  it('clarifies a material ambiguity before SQL generation', async () => {
    process.env.ASK_DATA_FREE_SQL_ENABLED = 'true';
    process.env.ASK_DATA_SEMANTIC_ROUTER_ENABLED = 'true';
    process.env.ASK_DATA_SEMANTIC_ROUTER_SHADOW = 'false';
    process.env.ASK_DATA_SEMANTIC_ROUTER_MODEL_FALLBACK = 'false';
    const ai = { generateStructured: jest.fn() };
    const executor = { execute: jest.fn() };
    const { service } = build({ ai, executor });

    const result = await service.query(
      { question: '双十一商品销量是多少' },
      { ...context, permissions: ['*'] },
    );

    expect(result.status).toBe('clarification');
    expect(result.clarificationQuestion).toContain('具体年份');
    expect(ai.generateStructured).not.toHaveBeenCalled();
    expect(executor.execute).not.toHaveBeenCalled();
  });

  it.each([
    ['SELECT * FROM ProductOrder', 'raw_sql_input_not_allowed'],
    ['帮我删除昨天的订单', 'write_intent_not_allowed'],
    ['查出所有客户手机号', 'sensitive_data_intent_not_allowed'],
    ['对比所有门店营业额', 'cross_store_not_allowed'],
    ['帮我生成一份补货建议清单', 'inventory_recommendation_not_supported'],
    ['哪些产品开封后很久还没用完', 'inventory_opened_at_fact_missing'],
    ['有没有项目因为缺耗材没法做', 'project_bom_availability_fact_missing'],
    ['理疗仪器耗材还能做多少次', 'governed_bom_service_count_missing'],
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
