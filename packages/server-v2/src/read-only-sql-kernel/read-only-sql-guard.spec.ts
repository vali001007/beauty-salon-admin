import { ReadOnlySqlCostGuard } from './read-only-sql-cost-guard.js';
import { ReadOnlySqlGuard } from './read-only-sql-guard.js';
import { ReadOnlySqlParser } from './read-only-sql-parser.js';
import { ASK_DATA_FREE_SQL_VIEWS } from '../ask-data-free-sql/ask-data-free-sql.catalog.js';

const context = {
  storeIds: [6],
  permissions: ['*'],
  deniedPermissions: [],
  maxLimit: 100,
  maxViews: 2,
  maxRangeDays: 730,
  parameters: { startAt: '2026-07-01T00:00:00.000Z', endAt: '2026-08-01T00:00:00.000Z' },
};

describe('ReadOnlySqlGuard', () => {
  const guard = new ReadOnlySqlGuard(new ReadOnlySqlParser());
  const cost = new ReadOnlySqlCostGuard();

  it.each([
    ['insert', 'INSERT INTO agent_v3_order_summary_view VALUES (1)'],
    [
      'multiple statements',
      'SELECT order_id FROM agent_v3_order_summary_view; SELECT order_id FROM agent_v3_order_summary_view',
    ],
    ['comment', 'SELECT order_id FROM agent_v3_order_summary_view -- bypass'],
    [
      'union',
      'SELECT order_id FROM agent_v3_order_summary_view UNION SELECT order_id FROM agent_v3_order_summary_view',
    ],
    [
      'intersect',
      'SELECT order_id FROM agent_v3_order_summary_view INTERSECT SELECT order_id FROM agent_v3_order_summary_view',
    ],
    [
      'boolean OR store-scope bypass',
      "SELECT order_id FROM agent_v3_order_summary_view o WHERE o.status = 'paid' OR o.store_id = 999 LIMIT 10",
    ],
    [
      'nested query',
      'SELECT order_id FROM agent_v3_order_summary_view WHERE order_id IN (SELECT id FROM ProductOrder)',
    ],
    ['recursive cte', 'WITH RECURSIVE x AS (SELECT order_id FROM agent_v3_order_summary_view) SELECT order_id FROM x'],
    ['wildcard', 'SELECT * FROM agent_v3_order_summary_view'],
    ['unknown view', 'SELECT order_id FROM ProductOrder'],
    ['unknown field', 'SELECT password FROM agent_v3_order_summary_view'],
    ['dangerous function', 'SELECT pg_sleep(1) FROM agent_v3_order_summary_view'],
  ])('blocks %s', (_name, sql) => {
    const result = guard.inspect(sql, ASK_DATA_FREE_SQL_VIEWS, context);
    expect(result.status).toBe('blocked');
  });

  it('injects store scope, time scope and limit into a valid query', () => {
    const result = guard.inspect(
      'SELECT project_name, SUM(net_amount) AS revenue FROM agent_v3_project_service_sales_view p GROUP BY project_name ORDER BY revenue DESC LIMIT 10',
      ASK_DATA_FREE_SQL_VIEWS,
      { ...context, permissions: ['core:order:projects', 'core:store:projects'] },
    );
    expect(result.status).toBe('pass');
    if (result.status !== 'pass') return;
    expect(result.safeSql).toContain('p.store_id = ANY(:allowedStoreIds)');
    expect(result.safeSql).toContain('p.order_created_at >= :startAt');
    expect(result.safeSql).toContain('LIMIT 10');
    expect(cost.inspect(result, 100).status).toBe('pass');
  });

  it('wraps an existing predicate when injecting mandatory scopes', () => {
    const result = guard.inspect(
      "SELECT project_name FROM agent_v3_project_service_sales_view p WHERE p.project_name = '补水护理' ORDER BY project_name LIMIT 10",
      ASK_DATA_FREE_SQL_VIEWS,
      { ...context, permissions: ['core:order:projects', 'core:store:projects'] },
    );
    expect(result.status).toBe('pass');
    if (result.status !== 'pass') return;
    expect(result.safeSql).toContain("AND (p.project_name = '补水护理') ORDER BY");
  });

  it('allows NULLS LAST without treating ordering keywords as fields', () => {
    const result = guard.inspect(
      'SELECT product_name, stock_value FROM agent_v3_product_inventory_view i ORDER BY stock_value DESC NULLS LAST LIMIT 10',
      ASK_DATA_FREE_SQL_VIEWS,
      { ...context, permissions: ['core:inventory:products', 'core:inventory:stock'] },
    );
    expect(result.status).toBe('pass');
  });

  it('injects scope into the top-level WHERE instead of a FILTER predicate', () => {
    const result = guard.inspect(
      "SELECT COUNT(reservation_id) FILTER (WHERE status = 'cancelled') AS cancelled_count FROM agent_v3_reservation_view r WHERE date >= :startAt AND date < :endAt LIMIT 1",
      ASK_DATA_FREE_SQL_VIEWS,
      { ...context, permissions: ['core:store:reservations'] },
    );
    expect(result.status).toBe('pass');
    if (result.status !== 'pass') return;
    expect(result.safeSql).toContain("FILTER (WHERE status = 'cancelled')");
    expect(result.safeSql).toContain('FROM agent_v3_reservation_view r WHERE r.store_id');
  });

  it('allows numeric literals inside aggregate expressions', () => {
    const result = guard.inspect(
      "SELECT ROUND(100.0 * COUNT(*) FILTER (WHERE r.status IN ('cancelled', 'canceled', '已取消', '取消')) / NULLIF(COUNT(*), 0), 2) AS cancellation_rate FROM agent_v3_reservation_view AS r LIMIT 1",
      ASK_DATA_FREE_SQL_VIEWS,
      { ...context, permissions: ['core:store:reservations'] },
    );
    expect(result.status).toBe('pass');
  });

  it('allows a bounded CASE expression over registered fields', () => {
    const result = guard.inspect(
      'SELECT strategy_name, CASE WHEN SUM(marketing_cost) = 0 THEN NULL ELSE SUM(attributed_net_revenue) / SUM(marketing_cost) END AS roi FROM ask_data_marketing_roi_view m GROUP BY strategy_name ORDER BY roi DESC NULLS LAST LIMIT 20',
      ASK_DATA_FREE_SQL_VIEWS,
      { ...context, permissions: ['core:marketing:analytics'] },
    );
    expect(result.status).toBe('pass');
  });

  it('allows a catalog date field to use the explicit PostgreSQL date cast', () => {
    const result = guard.inspect(
      'SELECT settlement_date::date AS settlement_day, SUM(net_amount) AS settled_amount FROM agent_v3_daily_settlement_view f GROUP BY settlement_date::date ORDER BY settlement_day LIMIT 31',
      ASK_DATA_FREE_SQL_VIEWS,
      { ...context, permissions: ['core:finance:view'] },
    );
    expect(result.status).toBe('pass');
  });

  it('blocks ambiguous date-parameter interval arithmetic before database execution', () => {
    const result = guard.inspect(
      "SELECT customer_id FROM ask_data_customer_profile_summary_view c WHERE COALESCE(last_visit_at, :startAt - INTERVAL '1 day') < :startAt LIMIT 20",
      ASK_DATA_FREE_SQL_VIEWS,
      { ...context, permissions: ['core:customer:view'] },
    );
    expect(result.status).toBe('blocked');
    expect(result.status === 'blocked' && result.reasonCode).toBe('ambiguous_interval_parameter_type');
  });

  it.each([
    "SELECT COUNT(service_task_id) FROM agent_v3_service_quality_view s WHERE DATE_TRUNC('month', completed_at) = DATE_TRUNC('month', :startAt) LIMIT 1",
    'SELECT customer_id FROM ask_data_customer_profile_summary_view c WHERE COALESCE(last_visit_at, :startAt) < :endAt LIMIT 20',
  ])('blocks an untyped date parameter used inside a function: %s', (sql) => {
    const result = guard.inspect(sql, ASK_DATA_FREE_SQL_VIEWS, { ...context, permissions: ['*'] });
    expect(result.status).toBe('blocked');
    expect(result.status === 'blocked' && result.reasonCode).toBe('ambiguous_date_parameter_type');
  });

  it('allows explicitly typed date parameters inside functions', () => {
    const result = guard.inspect(
      "SELECT COUNT(service_task_id) FROM agent_v3_service_quality_view s WHERE DATE_TRUNC('month', completed_at) = DATE_TRUNC('month', :startAt::timestamp) LIMIT 1",
      ASK_DATA_FREE_SQL_VIEWS,
      { ...context, permissions: ['*'] },
    );
    expect(result.status).toBe('pass');
  });

  it('does not allow unsupported casts to bypass field policy checks', () => {
    const result = guard.inspect(
      'SELECT settlement_date::regclass FROM agent_v3_daily_settlement_view f LIMIT 1',
      ASK_DATA_FREE_SQL_VIEWS,
      { ...context, permissions: ['core:finance:view'] },
    );
    expect(result.status).toBe('blocked');
    expect(result.status === 'blocked' && result.reasonCode).toBe('field_not_allowed');
  });

  it('enforces permissions and denied permission overrides', () => {
    const denied = guard.inspect(
      'SELECT product_name FROM agent_v3_product_inventory_view LIMIT 10',
      ASK_DATA_FREE_SQL_VIEWS,
      {
        ...context,
        permissions: ['core:inventory:products', 'core:inventory:stock'],
        deniedPermissions: ['core:inventory:stock'],
      },
    );
    expect(denied.status).toBe('blocked');
    expect(denied.status === 'blocked' && denied.reasonCode).toBe('permission_denied');

    const wildcardDenied = guard.inspect(
      'SELECT settlement_date, net_amount FROM agent_v3_daily_settlement_view f LIMIT 10',
      ASK_DATA_FREE_SQL_VIEWS,
      {
        ...context,
        permissions: ['*'],
        deniedPermissions: ['core:finance:view'],
      },
    );
    expect(wildcardDenied.status).toBe('blocked');
    expect(wildcardDenied.status === 'blocked' && wildcardDenied.reasonCode).toBe('permission_denied');
  });

  it('allows a limited CTE only when scope and time are explicit', () => {
    const sql = [
      'WITH scoped AS (',
      'SELECT project_name, net_amount FROM agent_v3_project_service_sales_view p',
      'WHERE p.store_id = ANY(:allowedStoreIds) AND p.order_created_at >= :startAt AND p.order_created_at < :endAt',
      ')',
      'SELECT project_name, SUM(net_amount) AS revenue FROM scoped GROUP BY project_name LIMIT 10',
    ].join(' ');
    const result = guard.inspect(sql, ASK_DATA_FREE_SQL_VIEWS, { ...context, permissions: ['*'] });
    expect(result.status).toBe('pass');
  });

  it('blocks a CTE without explicit scope', () => {
    const result = guard.inspect(
      'WITH scoped AS (SELECT project_name, net_amount FROM agent_v3_project_service_sales_view p) SELECT project_name FROM scoped LIMIT 10',
      ASK_DATA_FREE_SQL_VIEWS,
      context,
    );
    expect(result.status).toBe('blocked');
    expect(result.status === 'blocked' && result.reasonCode).toBe('cte_store_scope_missing');
  });

  it('blocks excessive date range and excessive view count', () => {
    const dateResult = guard.inspect(
      'SELECT project_name FROM agent_v3_project_service_sales_view LIMIT 10',
      ASK_DATA_FREE_SQL_VIEWS,
      {
        ...context,
        parameters: { startAt: '2020-01-01', endAt: '2026-08-01' },
      },
    );
    expect(dateResult.status).toBe('blocked');
    expect(dateResult.status === 'blocked' && dateResult.reasonCode).toBe('time_range_exceeded');

    const joinResult = guard.inspect(
      'SELECT p.project_name, o.net_amount FROM agent_v3_project_service_sales_view p JOIN agent_v3_order_summary_view o ON p.store_id = o.store_id LIMIT 10',
      ASK_DATA_FREE_SQL_VIEWS,
      { ...context, maxViews: 1 },
    );
    expect(joinResult.status).toBe('blocked');
    expect(joinResult.status === 'blocked' && joinResult.reasonCode).toBe('too_many_views');
  });
});
