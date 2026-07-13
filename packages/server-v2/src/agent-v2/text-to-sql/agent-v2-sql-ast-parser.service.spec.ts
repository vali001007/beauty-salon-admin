import { AgentV2SqlAstParserService } from './agent-v2-sql-ast-parser.service.js';

describe('AgentV2SqlAstParserService', () => {
  const parser = new AgentV2SqlAstParserService();

  it('parses readonly SELECT shape', () => {
    const result = parser.parse('SELECT product_id, SUM(quantity) AS quantity_sold FROM agent_v2_order_item_sales_view WHERE order_created_at >= :startAt GROUP BY product_id LIMIT 10');

    expect(result.status).toBe('parsed');
    if (result.status !== 'parsed') return;
    expect(result.parsed.statementType).toBe('select');
    expect(result.parsed.sourceViews).toEqual(['agent_v2_order_item_sales_view']);
    expect(result.parsed.functions).toContain('sum');
    expect(result.parsed.columns).toContain('quantity');
    expect(result.parsed.referencedColumns).toEqual(['order_created_at', 'product_id']);
    expect(result.parsed.hasLimit).toBe(true);
  });

  it('recognizes wildcard for downstream guard blocking', () => {
    const result = parser.parse('SELECT * FROM agent_v2_order_item_sales_view LIMIT 1');

    expect(result.status).toBe('parsed');
    if (result.status !== 'parsed') return;
    expect(result.parsed.hasWildcard).toBe(true);
  });

  it('blocks write statements, comments, union and multi statements', () => {
    for (const sql of [
      'UPDATE users SET name = 1',
      'SELECT id FROM agent_v2_order_item_sales_view -- ignore',
      'SELECT id FROM agent_v2_order_item_sales_view UNION SELECT password FROM users',
      'SELECT id FROM agent_v2_order_item_sales_view; SELECT password FROM users',
    ]) {
      expect(parser.parse(sql).status).toBe('blocked');
    }
  });

  it('collects source views from subqueries and top-level FROM clauses', () => {
    const result = parser.parse([
      'SELECT (SELECT COUNT(*) FROM agent_v2_order_item_sales_view) AS order_count',
      'FROM raw_orders',
      'LIMIT 1',
    ].join(' '));

    expect(result.status).toBe('parsed');
    if (result.status !== 'parsed') return;
    expect(result.parsed.sourceViews).toEqual(['agent_v2_order_item_sales_view', 'raw_orders']);
  });

  it('blocks dangerous SQL functions', () => {
    const result = parser.parse('SELECT pg_sleep(1) FROM agent_v2_order_item_sales_view LIMIT 1');

    expect(result.status).toBe('blocked');
    if (result.status === 'blocked') expect(result.reasonCode).toBe('dangerous_function_not_allowed');
  });
});
