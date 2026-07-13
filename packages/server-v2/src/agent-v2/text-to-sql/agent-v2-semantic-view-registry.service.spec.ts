import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { AgentV2SemanticViewRegistryService } from './agent-v2-semantic-view-registry.service.js';

describe('AgentV2SemanticViewRegistryService', () => {
  const registry = new AgentV2SemanticViewRegistryService();
  const expectedEnabledViews = [
    'agent_v2_order_summary_view',
    'agent_v2_order_item_sales_view',
    'agent_v2_project_service_sales_view',
    'agent_v2_payment_refund_view',
    'agent_v2_daily_settlement_view',
    'agent_v2_product_inventory_view',
    'agent_v2_stock_movement_view',
    'agent_v2_inventory_scrap_view',
    'agent_v2_customer_profile_summary_view',
    'agent_v2_staff_profile_view',
    'agent_v2_staff_performance_view',
    'agent_v2_reservation_view',
    'agent_v2_marketing_conversion_view',
  ];

  it('registers the full-domain whitelist semantic views', () => {
    const all = registry.allDefinitions();

    expect(all).toHaveLength(40);
    expect(new Set(all.map((item) => item.viewName)).size).toBe(40);
    expect(all.some((item) => item.viewName === 'agent_v2_order_item_sales_view')).toBe(true);
    expect(all.some((item) => item.viewName === 'agent_v2_inventory_scrap_view')).toBe(true);
    expect(all.some((item) => item.viewName === 'agent_v2_agent_governance_view' && item.adminOnly)).toBe(true);
  });

  it('keeps business priority separate from runtime enabled status', () => {
    const all = registry.allDefinitions();
    const enabledViews = all.filter((item) => item.status === 'enabled').map((item) => item.viewName);

    expect(enabledViews.sort()).toEqual([...expectedEnabledViews].sort());
    expect(all.find((item) => item.viewName === 'agent_v2_store_summary_view')).toMatchObject({ batch: 'P0', status: 'planned' });
    expect(all.find((item) => item.viewName === 'agent_v2_card_asset_view')).toMatchObject({ batch: 'P0', status: 'planned' });
    expect(all.find((item) => item.viewName === 'agent_v2_card_usage_view')).toMatchObject({ batch: 'P0', status: 'planned' });
    expect(all.find((item) => item.viewName === 'agent_v2_marketing_activity_view')).toMatchObject({ batch: 'P0', status: 'planned' });
  });

  it('keeps every registry scope and default time field queryable', () => {
    const all = registry.allDefinitions();

    for (const view of all) {
      const fieldNames = new Set(view.fields.map((field) => field.name));
      if (view.storeScopeField && !fieldNames.has(view.storeScopeField)) {
        throw new Error(`${view.viewName} storeScopeField ${view.storeScopeField} is not registered as a queryable field`);
      }
      if (view.defaultTimeField && !fieldNames.has(view.defaultTimeField)) {
        throw new Error(`${view.viewName} defaultTimeField ${view.defaultTimeField} is not registered as a queryable field`);
      }
    }
    expect(registry.findByName('agent_v2_inventory_scrap_view')).toMatchObject({ defaultTimeField: 'occurred_at' });
    expect(registry.findByName('agent_v2_product_inventory_view')).toMatchObject({ defaultTimeField: 'nearest_expiry_date' });
  });

  it('keeps all registry fields aligned with migration view columns', () => {
    const migration = readFileSync(join(process.cwd(), 'prisma', 'migrations', '20260707013000_agent_v2_text_to_sql', 'migration.sql'), 'utf8');

    for (const view of registry.allDefinitions()) {
      const migrationColumns = extractMigrationViewColumns(migration, view.viewName);
      for (const field of view.fields) {
        if (!migrationColumns.has(field.name)) {
          throw new Error(`${view.viewName} registry field ${field.name} is not emitted by the migration view`);
        }
      }
    }
  });

  it('keeps registry metadata aligned with migration seed metadata', () => {
    const migration = readFileSync(join(process.cwd(), 'prisma', 'migrations', '20260707013000_agent_v2_text_to_sql', 'migration.sql'), 'utf8');
    const seedRows = extractSemanticViewSeedRows(migration);

    for (const view of registry.allDefinitions()) {
      const seed = seedRows.get(view.viewName);
      if (!seed) throw new Error(`Missing semantic view seed row for ${view.viewName}`);

      expect(view.domain).toBe(seed.domain);
      expect(view.requiredPermissions.sort()).toEqual(seed.requiredPermissions.sort());
      expect(view.storeScopeField ?? null).toBe(seed.storeScopeField);
      expect(view.defaultTimeField ?? null).toBe(seed.defaultTimeField);
      expect(view.status === 'enabled').toBe(seed.isEnabled);
    }
  });

  it('recalls product sales and inventory scrap views from natural language questions', () => {
    expect(registry.recall('本月销量最好的商品')[0]?.viewName).toBe('agent_v2_order_item_sales_view');
    expect(registry.recall('最近30天报废的产品有哪些')[0]?.viewName).toBe('agent_v2_inventory_scrap_view');
  });

  it('recalls planned semantic views for governance review without enabling them for runtime execution', () => {
    expect(registry.recall('高消费客户最近复购下降的是谁', { includePlanned: true }).map((item) => item.viewName)).toEqual(
      expect.arrayContaining(['agent_v2_customer_profile_summary_view', 'agent_v2_customer_behavior_view']),
    );
    expect(registry.recall('哪个营销活动转化最好', { includePlanned: true })[0]?.viewName).toBe('agent_v2_marketing_conversion_view');
    expect(registry.recall('哪个供应商交付最慢', { includePlanned: true })[0]?.viewName).toBe('agent_v2_supplier_performance_view');
    expect(registry.recall('哪些会员卡快到期', { includePlanned: true })[0]?.viewName).toBe('agent_v2_card_asset_view');
    expect(registry.recall('小程序最近带来多少客户', { includePlanned: true })[0]?.viewName).toBe('agent_v2_customer_app_funnel_view');
  });

  it('recalls admin-only Agent governance view only when admin views and planned views are requested', () => {
    expect(registry.recall('最近 Agent 发布有哪些失败', { includePlanned: true })[0]?.viewName).not.toBe(
      'agent_v2_agent_governance_view',
    );
    expect(registry.recall('最近 Agent 发布有哪些失败', { includePlanned: true, includeAdmin: true })[0]?.viewName).toBe(
      'agent_v2_agent_governance_view',
    );
  });

  it('does not expose planned admin views by default', () => {
    const visible = registry.list();

    expect(visible.every((item) => item.status === 'enabled')).toBe(true);
    expect(visible.every((item) => !item.adminOnly)).toBe(true);
  });
});

function extractMigrationViewColumns(migration: string, viewName: string) {
  const match = migration.match(new RegExp(`CREATE VIEW ${viewName} AS\\s*SELECT([\\s\\S]*?)\\nFROM `, 'm'));
  if (!match) throw new Error(`Missing CREATE VIEW block for ${viewName}`);
  return new Set(splitTopLevelColumns(match[1]).map(extractColumnName));
}

function splitTopLevelColumns(selectList: string) {
  const columns: string[] = [];
  let current = '';
  let depth = 0;
  let inString = false;
  for (let index = 0; index < selectList.length; index += 1) {
    const char = selectList[index];
    if (char === "'" && selectList[index - 1] !== '\\') inString = !inString;
    if (!inString) {
      if (char === '(') depth += 1;
      if (char === ')') depth -= 1;
      if (char === ',' && depth === 0) {
        columns.push(current.trim());
        current = '';
        continue;
      }
    }
    current += char;
  }
  if (current.trim()) columns.push(current.trim());
  return columns;
}

function extractColumnName(columnSql: string) {
  const aliasMatch = columnSql.match(/\bAS\s+([a-z_][a-z0-9_]*)\s*$/i);
  if (aliasMatch) return aliasMatch[1];
  const unquotedIdentifierMatch = columnSql.match(/\b(?:[a-z_][a-z0-9_]*\.)?([a-z_][a-z0-9_]*)\s*$/i);
  if (unquotedIdentifierMatch) return unquotedIdentifierMatch[1];
  const quotedIdentifierMatches = [...columnSql.matchAll(/"([A-Za-z0-9_]+)"/g)];
  const lastIdentifier = quotedIdentifierMatches.at(-1)?.[1];
  if (!lastIdentifier) return columnSql;
  return toSnakeCase(lastIdentifier);
}

function toSnakeCase(value: string) {
  return value.replace(/[A-Z]/g, (char) => `_${char.toLowerCase()}`).replace(/^_/, '');
}

function extractSemanticViewSeedRows(migration: string) {
  const rows = new Map<string, {
    domain: string;
    requiredPermissions: string[];
    storeScopeField: string | null;
    defaultTimeField: string | null;
    isEnabled: boolean;
  }>();
  const tuplePattern = /\('(agent_v2_[a-z_]+_view)',\s*'([^']+)',\s*'[^']+',\s*'([^']+)'::jsonb,\s*(NULL|'[^']+'),\s*(NULL|'[^']+'),\s*agent_v2_text_to_sql_field_policies\((?:ARRAY\[[^\]]*\])?\),\s*(true|false)\)/g;
  for (const match of migration.matchAll(tuplePattern)) {
    rows.set(match[1], {
      domain: match[2],
      requiredPermissions: JSON.parse(match[3]) as string[],
      storeScopeField: unquoteNullableSqlString(match[4]),
      defaultTimeField: unquoteNullableSqlString(match[5]),
      isEnabled: match[6] === 'true',
    });
  }
  return rows;
}

function unquoteNullableSqlString(value: string) {
  return value === 'NULL' ? null : value.slice(1, -1);
}
