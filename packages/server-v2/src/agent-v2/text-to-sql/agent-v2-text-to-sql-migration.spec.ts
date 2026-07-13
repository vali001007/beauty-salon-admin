import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('Agent V2 Text-to-SQL migration', () => {
  const expectedViews = [
    'agent_v2_store_summary_view',
    'agent_v2_customer_profile_summary_view',
    'agent_v2_customer_behavior_view',
    'agent_v2_customer_health_skin_view',
    'agent_v2_order_summary_view',
    'agent_v2_order_item_sales_view',
    'agent_v2_project_service_sales_view',
    'agent_v2_payment_refund_view',
    'agent_v2_daily_settlement_view',
    'agent_v2_cashier_shift_view',
    'agent_v2_product_inventory_view',
    'agent_v2_stock_movement_view',
    'agent_v2_inventory_scrap_view',
    'agent_v2_purchase_procurement_view',
    'agent_v2_supplier_performance_view',
    'agent_v2_project_catalog_view',
    'agent_v2_card_asset_view',
    'agent_v2_card_usage_view',
    'agent_v2_customer_balance_view',
    'agent_v2_reservation_view',
    'agent_v2_schedule_resource_view',
    'agent_v2_staff_profile_view',
    'agent_v2_staff_performance_view',
    'agent_v2_service_quality_view',
    'agent_v2_marketing_activity_view',
    'agent_v2_marketing_conversion_view',
    'agent_v2_marketing_automation_view',
    'agent_v2_promotion_offer_view',
    'agent_v2_customer_app_funnel_view',
    'agent_v2_recommendation_prediction_view',
    'agent_v2_terminal_device_view',
    'agent_v2_print_job_view',
    'agent_v2_appointment_gap_view',
    'agent_v2_industry_template_view',
    'agent_v2_operating_cost_view',
    'agent_v2_store_comparison_view',
    'agent_v2_user_role_permission_view',
    'agent_v2_agent_governance_view',
    'agent_v2_ai_audit_view',
    'agent_v2_data_quality_view',
  ];
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
  const adminOrSystemViews = [
    'agent_v2_user_role_permission_view',
    'agent_v2_agent_governance_view',
    'agent_v2_ai_audit_view',
    'agent_v2_data_quality_view',
  ];
  const migration = readFileSync(
    join(process.cwd(), 'prisma', 'migrations', '20260707013000_agent_v2_text_to_sql', 'migration.sql'),
    'utf8',
  );
  const prismaSchema = readFileSync(join(process.cwd(), 'prisma', 'schema.prisma'), 'utf8');
  const readonlyGrantsTemplate = readFileSync(
    join(process.cwd(), 'prisma', 'agent-v2-text-to-sql-readonly-grants.template.sql'),
    'utf8',
  );

  it('creates the audit tables required by the controlled runtime', () => {
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS "agent_v2_text_to_sql_runs"');
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS "agent_v2_text_to_sql_semantic_views"');
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS "agent_v2_text_to_sql_feedback"');
  });

  it('creates and seeds the full whitelist semantic view set', () => {
    const createdViews = [...migration.matchAll(/CREATE VIEW (agent_v2_[a-z_]+_view) AS/g)].map((match) => match[1]);
    const seededViews = [...migration.matchAll(/'(agent_v2_[a-z_]+_view)'/g)].map((match) => match[1]);

    expect(new Set(createdViews).size).toBe(40);
    expect(new Set(seededViews).size).toBe(40);
    expect([...new Set(createdViews)].sort()).toEqual([...expectedViews].sort());
    expect([...new Set(seededViews)].sort()).toEqual([...expectedViews].sort());
    expect(createdViews).toContain('agent_v2_order_item_sales_view');
    expect(createdViews).toContain('agent_v2_inventory_scrap_view');
    expect(createdViews).toContain('agent_v2_agent_governance_view');
  });

  it('only enables the intended initial P0 runtime views', () => {
    const seededRows = [...migration.matchAll(/\('(agent_v2_[a-z_]+_view)'[\s\S]*?,\s*(true|false)\)/g)]
      .map((match) => ({ viewName: match[1], isEnabled: match[2] === 'true' }));
    const enabledViews = seededRows.filter((row) => row.isEnabled).map((row) => row.viewName);

    expect(new Set(seededRows.map((row) => row.viewName)).size).toBe(40);
    expect(enabledViews.sort()).toEqual([...expectedEnabledViews].sort());
    for (const viewName of adminOrSystemViews) {
      expect(seededRows.find((row) => row.viewName === viewName)).toMatchObject({ isEnabled: false });
    }
  });

  it('seeds non-empty structured field policies for every semantic view', () => {
    const emptyFieldPolicyRows = [...migration.matchAll(/\('(agent_v2_[a-z_]+_view)'[\s\S]*?,\s*'\[\]'::jsonb,\s*(?:true|false)\)/g)]
      .map((match) => match[1]);

    expect(emptyFieldPolicyRows).toEqual([]);
    expect(migration).toContain("jsonb_build_object('field', '*', 'policy', 'allow')");
    expect(migration).toContain("agent_v2_text_to_sql_field_policies(ARRAY['customer_name_masked','phone_last4'])");
    expect(migration).toContain("jsonb_build_object('field', masked_field, 'policy', 'mask')");
  });

  it('only references Prisma-backed tables and columns in semantic view SQL', () => {
    const models = parsePrismaModels(prismaSchema);
    const missingReferences: string[] = [];

    for (const viewBlock of extractCreateViewBlocks(migration)) {
      const aliases = extractSourceAliases(viewBlock.sql);
      const fieldReferences = [...viewBlock.sql.matchAll(/\b([a-z][a-z0-9_]*)\."([A-Za-z_][A-Za-z0-9_]*)"/g)];

      for (const [, alias, column] of fieldReferences) {
        const tableName = aliases.get(alias);
        if (!tableName) continue;
        const model = models.get(tableName);
        if (!model) {
          missingReferences.push(`${viewBlock.viewName}: missing Prisma model/table ${tableName} for ${alias}."${column}"`);
          continue;
        }
        if (!model.columns.has(column)) {
          missingReferences.push(`${viewBlock.viewName}: missing column ${tableName}."${column}"`);
        }
      }
    }

    expect(missingReferences).toEqual([]);
  });

  it('keeps the readonly grants template limited to semantic views', () => {
    const grantedViews = [...readonlyGrantsTemplate.matchAll(/'(agent_v2_[a-z_]+_view)'/g)].map((match) => match[1]);

    expect(new Set(grantedViews).size).toBe(40);
    expect([...new Set(grantedViews)].sort()).toEqual([...expectedViews].sort());
    expect(readonlyGrantsTemplate).not.toMatch(/\bGRANT\s+SELECT\s+ON\s+ALL\s+TABLES\b/i);
    expect(readonlyGrantsTemplate).not.toMatch(/\bGRANT\s+(INSERT|UPDATE|DELETE|CREATE|DROP|ALTER|TRUNCATE|ALL\s+PRIVILEGES)\b/i);
    expect(readonlyGrantsTemplate).toContain('ALTER ROLE %I SET default_transaction_read_only = on');
    expect(readonlyGrantsTemplate).toContain("has_schema_privilege(readonly_role, 'public', 'CREATE')");
  });
});

function parsePrismaModels(schema: string) {
  const models = new Map<string, { modelName: string; columns: Set<string> }>();
  for (const match of schema.matchAll(/model\s+(\w+)\s*\{([\s\S]*?)\n\}/g)) {
    const [, modelName, body] = match;
    const tableName = body.match(/@@map\("([^"]+)"\)/)?.[1] ?? modelName;
    const columns = new Set<string>();
    for (const rawLine of body.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith('//') || line.startsWith('@@')) continue;
      const fieldName = line.match(/^(\w+)\s+/)?.[1];
      if (!fieldName) continue;
      columns.add(line.match(/@map\("([^"]+)"\)/)?.[1] ?? fieldName);
    }
    models.set(tableName, { modelName, columns });
  }
  return models;
}

function extractCreateViewBlocks(migrationSql: string) {
  return [...migrationSql.matchAll(/CREATE VIEW (agent_v2_[a-z_]+_view) AS\n([\s\S]*?)(?=\nCREATE VIEW |\nCREATE OR REPLACE FUNCTION |\nINSERT INTO )/g)]
    .map((match) => ({ viewName: match[1], sql: match[2] }));
}

function extractSourceAliases(sql: string) {
  const aliases = new Map<string, string>();
  for (const match of sql.matchAll(/(?:FROM|JOIN)\s+"([A-Za-z_][A-Za-z0-9_]*)"\s+([a-z][a-z0-9_]*)/gi)) {
    aliases.set(match[2], match[1]);
  }
  return aliases;
}
