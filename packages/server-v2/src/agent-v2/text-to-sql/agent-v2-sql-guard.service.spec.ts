import { AgentV2SemanticViewRegistryService } from './agent-v2-semantic-view-registry.service.js';
import { AgentV2SqlAstParserService } from './agent-v2-sql-ast-parser.service.js';
import { AgentV2SqlGuardService } from './agent-v2-sql-guard.service.js';

describe('AgentV2SqlGuardService', () => {
  const registry = new AgentV2SemanticViewRegistryService();
  const parser = new AgentV2SqlAstParserService();
  const guard = new AgentV2SqlGuardService(registry, parser);
  const actor = {
    question: '本月销量最好的商品',
    storeIds: [1],
    roleCodes: ['manager'],
    permissions: ['core:order:view', 'core:product:view', 'core:inventory:view'],
  };

  it('passes a whitelisted readonly aggregate query and injects store scope before group by', () => {
    const result = guard.inspect(
      [
        'SELECT product_id, product_name, SUM(quantity) AS quantity_sold',
        'FROM agent_v2_order_item_sales_view',
        'GROUP BY product_id, product_name',
        'ORDER BY quantity_sold DESC',
        'LIMIT 10',
      ].join(' '),
      actor,
    );

    expect(result.status).toBe('pass');
    if (result.status !== 'pass') return;
    expect(result.safeSql).toContain('FROM agent_v2_order_item_sales_view WHERE order_created_at >= :startAt AND order_created_at < :endAt AND store_id = ANY(:allowedStoreIds) GROUP BY');
    expect(result.params.allowedStoreIds).toEqual([1]);
    expect(result.params.startAt).toEqual(expect.any(String));
    expect(result.appliedPolicies).toContain('time_range_injected');
  });

  it('blocks write statements and non-whitelisted views', () => {
    expect(guard.inspect('UPDATE users SET name = 1', actor).status).toBe('blocked');

    const unknown = guard.inspect('SELECT id FROM raw_orders LIMIT 1', actor);
    expect(unknown.status).toBe('blocked');
    if (unknown.status !== 'blocked') return;
    expect(unknown.reasonCode).toBe('source_view_not_allowed');
  });

  it('blocks wildcard and planned views', () => {
    const wildcard = guard.inspect('SELECT * FROM agent_v2_order_item_sales_view LIMIT 1', actor);
    expect(wildcard.status).toBe('blocked');
    if (wildcard.status === 'blocked') expect(wildcard.reasonCode).toBe('wildcard_not_allowed');

    const planned = guard.inspect('SELECT store_id, shift_id FROM agent_v2_cashier_shift_view LIMIT 1', {
      ...actor,
      permissions: ['core:finance:view'],
    });
    expect(planned.status).toBe('blocked');
    if (planned.status === 'blocked') expect(planned.reasonCode).toBe('source_view_not_enabled');
  });

  it('blocks fields outside the semantic view field whitelist', () => {
    const result = guard.inspect('SELECT product_id, raw_margin_secret FROM agent_v2_order_item_sales_view LIMIT 10', actor);

    expect(result.status).toBe('blocked');
    if (result.status === 'blocked') expect(result.reasonCode).toBe('field_not_allowed');
  });

  it('blocks unregistered fields used only in WHERE clauses', () => {
    const result = guard.inspect(
      'SELECT product_id FROM agent_v2_order_item_sales_view WHERE internal_margin_secret > 0 LIMIT 10',
      actor,
    );

    expect(result.status).toBe('blocked');
    if (result.status === 'blocked') expect(result.reasonCode).toBe('field_not_allowed');
  });

  it('allows masked fields that are explicitly exposed by semantic views', () => {
    const result = guard.inspect(
      'SELECT customer_id, customer_name_masked, phone_last4 FROM agent_v2_customer_profile_summary_view LIMIT 10',
      {
        ...actor,
        permissions: ['core:customer:view'],
      },
    );

    expect(result.status).toBe('pass');
    if (result.status !== 'pass') return;
    expect(result.safeSql).toContain('customer_name_masked');
    expect(result.safeSql).toContain('phone_last4');
  });

  it('blocks raw tables hidden in joins or subqueries', () => {
    const joined = guard.inspect(
      'SELECT s.product_id FROM agent_v2_order_item_sales_view s JOIN raw_orders r ON r.id = s.order_id LIMIT 10',
      actor,
    );
    expect(joined.status).toBe('blocked');
    if (joined.status === 'blocked') expect(joined.reasonCode).toBe('source_view_not_allowed');

    const subquery = guard.inspect(
      'SELECT (SELECT COUNT(*) FROM agent_v2_order_item_sales_view) AS order_count FROM raw_orders LIMIT 1',
      actor,
    );
    expect(subquery.status).toBe('blocked');
    if (subquery.status === 'blocked') expect(subquery.reasonCode).toBe('source_view_not_allowed');
  });

  it('blocks dangerous functions with a structured reason code', () => {
    const result = guard.inspect('SELECT pg_sleep(1) FROM agent_v2_order_item_sales_view LIMIT 1', actor);

    expect(result.status).toBe('blocked');
    if (result.status === 'blocked') expect(result.reasonCode).toBe('dangerous_function_not_allowed');
  });
});
