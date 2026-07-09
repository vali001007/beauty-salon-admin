import { AgentV3SemanticViewRegistryService } from './agent-v3-semantic-view-registry.service.js';
import { AgentV3SqlAstParserService } from './agent-v3-sql-ast-parser.service.js';
import { AgentV3SqlGuardService } from './agent-v3-sql-guard.service.js';

describe('AgentV3SqlGuardService', () => {
  let guard: AgentV3SqlGuardService;

  beforeEach(() => {
    guard = new AgentV3SqlGuardService(
      new AgentV3SemanticViewRegistryService(),
      new AgentV3SqlAstParserService(),
    );
  });

  it('does not inject expiry date range for current low-stock inventory questions', () => {
    const result = guard.inspect(
      [
        'SELECT product_id, product_name, sku, current_stock, safety_stock, stock_value, status',
        'FROM agent_v3_product_inventory_view',
        "WHERE (current_stock <= safety_stock OR status IN ('低库存', '缺货', 'low_stock', 'out_of_stock'))",
        'ORDER BY current_stock ASC, safety_stock DESC, product_id ASC',
        'LIMIT 10',
      ].join(' '),
      {
        question: '库存不足的产品',
        storeIds: [1],
        permissions: ['*'],
        roleCodes: ['manager'],
      },
    );

    expect(result.status).toBe('pass');
    if (result.status === 'pass') {
      expect(result.safeSql).toContain('store_id = ANY(:allowedStoreIds)');
      expect(result.safeSql).toContain('(current_stock <= safety_stock OR status IN');
      expect(result.safeSql).not.toContain('nearest_expiry_date >=');
      expect(result.params).not.toHaveProperty('startAt');
      expect(result.params).not.toHaveProperty('endAt');
      expect(result.appliedPolicies).toContain('snapshot_state_time_range_skipped');
    }
  });
});
