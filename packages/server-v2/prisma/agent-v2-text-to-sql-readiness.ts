import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';
import { config as loadDotenv } from 'dotenv';

if (process.env.AGENT_V2_TEXT_TO_SQL_SKIP_DOTENV !== 'true') {
  loadDotenv({ path: resolve(process.cwd(), '.env'), override: false });
}

type GateStatus = 'pass' | 'fail' | 'skip';

type Gate = {
  id: string;
  status: GateStatus;
  expected: string;
  actual: string;
};

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

const expectedTables = [
  'agent_v2_text_to_sql_runs',
  'agent_v2_text_to_sql_semantic_views',
  'agent_v2_text_to_sql_feedback',
];

const textToSqlMigrationName = '20260707013000_agent_v2_text_to_sql';

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

async function main() {
  const args = new Set(process.argv.slice(2));
  const allowMissingReadonly = args.has('--allow-missing-readonly');
  const strict = args.has('--strict');
  const checkPrimaryMigration = args.has('--check-primary-migration');
  const storeId = numericArg('--store-id') ?? 1;
  const migrationPath = resolve(process.cwd(), 'prisma/migrations/20260707013000_agent_v2_text_to_sql/migration.sql');
  const grantsTemplatePath = resolve(process.cwd(), 'prisma/agent-v2-text-to-sql-readonly-grants.template.sql');
  const gates: Gate[] = [];

  gates.push(checkMigrationFile(migrationPath));
  gates.push(checkReadonlyGrantsTemplate(grantsTemplatePath));

  let pg: typeof import('pg') | null = null;
  if (checkPrimaryMigration) {
    pg = await import('pg');
    gates.push(await checkPrimaryMigrationStatus(pg, process.env.DATABASE_URL));
  }

  const readonlyUrl = process.env.AGENT_V2_TEXT_TO_SQL_READONLY_DATABASE_URL;
  if (!readonlyUrl) {
    gates.push({
      id: 'readonly_database_url',
      status: allowMissingReadonly ? 'skip' : 'fail',
      expected: 'AGENT_V2_TEXT_TO_SQL_READONLY_DATABASE_URL points to an independent readonly database user',
      actual: 'missing',
    });
    report(gates, strict);
    return;
  }

  pg ??= await import('pg');
  gates.push(checkReadonlyUrlIsolation(readonlyUrl, process.env.DATABASE_URL));
  if (gates.some((gate) => gate.status === 'fail')) {
    report(gates, strict);
    return;
  }

  const Client = (pg as any).Client;
  const client = new Client({
    connectionString: readonlyUrl,
    statement_timeout: 5000,
    query_timeout: 5000,
    application_name: 'agent_v2_text_to_sql_readiness',
  });

  try {
    await client.connect();
    await client.query('SET statement_timeout = 5000');
    await client.query('SET default_transaction_read_only = on');

    gates.push(await checkDatabaseViews(client));
    gates.push(await checkDatabaseTables(client));
    gates.push(await checkSemanticViewRows(client));
    gates.push(await checkExplain(client, storeId));
    gates.push(await checkReadonlySelect(client, storeId));
    gates.push(await checkReadonlyWriteBlocked(client));
  } catch (error) {
    gates.push({
      id: 'readonly_connection',
      status: 'fail',
      expected: 'connect to readonly database and run readiness checks',
      actual: error instanceof Error ? error.message : String(error),
    });
  } finally {
    await client.end().catch(() => undefined);
  }

  report(gates, strict);
}

async function checkPrimaryMigrationStatus(pg: typeof import('pg'), primaryUrl?: string): Promise<Gate> {
  if (!primaryUrl) {
    return {
      id: 'primary_migration_status',
      status: 'fail',
      expected: `${textToSqlMigrationName} is applied on DATABASE_URL before readonly DB validation`,
      actual: 'DATABASE_URL missing from current environment',
    };
  }

  const Client = (pg as any).Client;
  const client = new Client({
    connectionString: primaryUrl,
    statement_timeout: 5000,
    query_timeout: 5000,
    application_name: 'agent_v2_text_to_sql_completion_audit',
  });

  try {
    await client.connect();
    const result = await client.query(
      `
        SELECT migration_name, finished_at, rolled_back_at
        FROM "_prisma_migrations"
        WHERE migration_name = $1
        ORDER BY started_at DESC
        LIMIT 1
      `,
      [textToSqlMigrationName],
    );
    const row = result.rows?.[0] as { finished_at?: Date | string | null; rolled_back_at?: Date | string | null } | undefined;
    const applied = Boolean(row?.finished_at && !row?.rolled_back_at);
    return {
      id: 'primary_migration_status',
      status: applied ? 'pass' : 'fail',
      expected: `${textToSqlMigrationName} is applied on DATABASE_URL before readonly DB validation`,
      actual: row
        ? row.rolled_back_at
          ? `${textToSqlMigrationName} was rolled back`
          : `${textToSqlMigrationName} is present but not finished`
        : `${textToSqlMigrationName} not applied`,
    };
  } catch (error) {
    return {
      id: 'primary_migration_status',
      status: 'fail',
      expected: `${textToSqlMigrationName} is applied on DATABASE_URL before readonly DB validation`,
      actual: error instanceof Error ? error.message : String(error),
    };
  } finally {
    await client.end().catch(() => undefined);
  }
}

function checkReadonlyUrlIsolation(readonlyUrl: string, primaryUrl?: string): Gate {
  if (!primaryUrl) {
    return {
      id: 'readonly_url_isolation',
      status: 'fail',
      expected: 'DATABASE_URL exists so readonly URL isolation can be verified',
      actual: 'DATABASE_URL missing from current environment',
    };
  }

  const sameUrl = normalizeConnectionString(readonlyUrl) === normalizeConnectionString(primaryUrl);
  const readonlyInfo = parseConnectionInfo(readonlyUrl);
  const primaryInfo = parseConnectionInfo(primaryUrl);
  const sameUser = Boolean(readonlyInfo?.username && primaryInfo?.username && readonlyInfo.username === primaryInfo.username);
  const parseFailure = !readonlyInfo || !primaryInfo;

  return {
    id: 'readonly_url_isolation',
    status: sameUrl || sameUser || parseFailure ? 'fail' : 'pass',
    expected: 'AGENT_V2_TEXT_TO_SQL_READONLY_DATABASE_URL must not equal DATABASE_URL and must use a different database user',
    actual: parseFailure
      ? 'failed to parse readonly URL or DATABASE_URL'
      : sameUrl
        ? 'readonly URL matches DATABASE_URL'
        : sameUser
          ? 'readonly URL uses the same database user as DATABASE_URL'
          : 'readonly URL differs from DATABASE_URL and uses a different database user',
  };
}

function normalizeConnectionString(value: string) {
  return value.trim().replace(/\/+$/, '');
}

function parseConnectionInfo(value: string) {
  try {
    const url = new URL(value);
    return {
      username: decodeURIComponent(url.username),
      host: url.host,
      database: url.pathname.replace(/^\/+/, ''),
    };
  } catch {
    return null;
  }
}

function checkMigrationFile(path: string): Gate {
  if (!existsSync(path)) {
    return {
      id: 'migration_file',
      status: 'fail',
      expected: 'Text-to-SQL migration file exists',
      actual: `missing: ${path}`,
    };
  }
  const content = readFileSync(path, 'utf8');
  const createdViews = [...content.matchAll(/CREATE VIEW (agent_v2_[a-z_]+_view) AS/g)].map((match) => match[1]);
  const createdViewSet = new Set(createdViews);
  const missingViews = expectedViews.filter((viewName) => !createdViewSet.has(viewName));
  const unexpectedViews = [...createdViewSet].filter((viewName) => !expectedViews.includes(viewName));
  const missingTables = expectedTables.filter((tableName) => !content.includes(`"${tableName}"`));
  const seededRows = extractSeedRows(content);
  const seededViewSet = new Set(seededRows.map((row) => row.viewName));
  const missingSeedRows = expectedViews.filter((viewName) => !seededViewSet.has(viewName));
  const unexpectedSeedRows = [...seededViewSet].filter((viewName) => !expectedViews.includes(viewName));
  const enabledViews = seededRows.filter((row) => row.isEnabled).map((row) => row.viewName).sort();
  const enabledMismatch = enabledViews.join(',') !== [...expectedEnabledViews].sort().join(',');
  const enabledAdminViews = adminOrSystemViews.filter((viewName) => seededRows.find((row) => row.viewName === viewName)?.isEnabled);
  const seedFieldDrift = findMigrationSeedFieldDrift(content, seededRows);
  const unsafeViewBodies = extractViewBodies(content)
    .filter((view) => /\b(INSERT|UPDATE|DELETE|TRUNCATE|ALTER|DROP|GRANT|REVOKE)\b/i.test(view.body))
    .map((view) => view.viewName);
  const emptyFieldPolicyRows = [...content.matchAll(/\('(agent_v2_[a-z_]+_view)'[\s\S]*?,\s*'\[\]'::jsonb,\s*(?:true|false)\)/g)]
    .map((match) => match[1]);
  const missingStructuredPolicies = !content.includes("jsonb_build_object('field', '*', 'policy', 'allow')")
    || !content.includes("jsonb_build_object('field', masked_field, 'policy', 'mask')");
  const failures = [
    missingViews.length ? `missing views: ${missingViews.join(', ')}` : '',
    unexpectedViews.length ? `unexpected views: ${unexpectedViews.join(', ')}` : '',
    missingTables.length ? `missing tables: ${missingTables.join(', ')}` : '',
    seededRows.length !== expectedViews.length ? `seed rows=${seededRows.length}` : '',
    missingSeedRows.length ? `missing seed rows: ${missingSeedRows.join(', ')}` : '',
    unexpectedSeedRows.length ? `unexpected seed rows: ${unexpectedSeedRows.join(', ')}` : '',
    enabledMismatch ? `enabled mismatch: ${enabledViews.join(', ')}` : '',
    enabledAdminViews.length ? `admin/system enabled: ${enabledAdminViews.join(', ')}` : '',
    seedFieldDrift.length ? `seed field drift: ${seedFieldDrift.join(', ')}` : '',
    unsafeViewBodies.length ? `unsafe view bodies: ${unsafeViewBodies.join(', ')}` : '',
    emptyFieldPolicyRows.length ? `empty fieldPoliciesJson rows: ${emptyFieldPolicyRows.join(', ')}` : '',
    missingStructuredPolicies ? 'missing structured allow/mask field policy helper' : '',
  ].filter(Boolean);
  return {
    id: 'migration_file',
    status: failures.length ? 'fail' : 'pass',
    expected: `${expectedViews.length} SELECT-only views, ${expectedViews.length} seed rows with structured field policies, seed scope/time fields aligned with view columns, ${expectedEnabledViews.length} enabled runtime views and ${expectedTables.length} audit/config tables in migration`,
    actual: failures.length ? failures.join('; ') : 'migration contains exact whitelist views, seed rows, seed scope/time field alignment, enabled set and audit/config tables',
  };
}

function checkReadonlyGrantsTemplate(path: string): Gate {
  if (!existsSync(path)) {
    return {
      id: 'readonly_grants_template',
      status: 'fail',
      expected: 'readonly grants template exists and grants SELECT only on the 40 semantic views',
      actual: `missing: ${path}`,
    };
  }
  const content = readFileSync(path, 'utf8');
  const missingViews = expectedViews.filter((viewName) => !content.includes(`'${viewName}'`));
  const broadSelectGrant = /\bGRANT\s+SELECT\s+ON\s+ALL\s+TABLES\b/i.test(content);
  const writeGrant = /\bGRANT\s+(INSERT|UPDATE|DELETE|CREATE|DROP|ALTER|TRUNCATE|ALL\s+PRIVILEGES)\b/i.test(content);
  const checksPublicSchemaCreate = content.includes("has_schema_privilege(readonly_role, 'public', 'CREATE')");
  const failures = [
    missingViews.length ? `missing views: ${missingViews.join(', ')}` : '',
    broadSelectGrant ? 'contains GRANT SELECT ON ALL TABLES' : '',
    writeGrant ? 'contains write or all-privilege grant' : '',
    checksPublicSchemaCreate ? '' : 'missing public schema CREATE privilege assertion',
  ].filter(Boolean);
  return {
    id: 'readonly_grants_template',
    status: failures.length ? 'fail' : 'pass',
    expected: 'readonly grants template exists, grants SELECT only on the 40 semantic views, and checks schema CREATE privilege',
    actual: failures.length ? failures.join('; ') : 'template contains exact semantic view allowlist, no broad/write grant, and schema CREATE assertion',
  };
}

async function checkDatabaseViews(client: any): Promise<Gate> {
  const result = await client.query(
    `
      SELECT table_name
      FROM information_schema.views
      WHERE table_schema = 'public'
        AND table_name = ANY($1)
    `,
    [expectedViews],
  );
  const found = new Set((result.rows as Array<{ table_name: string }>).map((row) => row.table_name));
  const missing = expectedViews.filter((viewName) => !found.has(viewName));
  return {
    id: 'database_views',
    status: missing.length ? 'fail' : 'pass',
    expected: `${expectedViews.length} Agent V2 semantic views exist in readonly database`,
    actual: missing.length ? `missing ${missing.length}: ${missing.join(', ')}` : 'all semantic views found',
  };
}

async function checkDatabaseTables(client: any): Promise<Gate> {
  const result = await client.query(
    `
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name = ANY($1)
    `,
    [expectedTables],
  );
  const found = new Set((result.rows as Array<{ table_name: string }>).map((row) => row.table_name));
  const missing = expectedTables.filter((tableName) => !found.has(tableName));
  return {
    id: 'database_tables',
    status: missing.length ? 'fail' : 'pass',
    expected: `${expectedTables.length} audit/config tables exist in readonly database`,
    actual: missing.length ? `missing: ${missing.join(', ')}` : 'all audit/config tables found',
  };
}

async function checkSemanticViewRows(client: any): Promise<Gate> {
  const result = await client.query(`
    SELECT
      "viewName",
      "isEnabled",
      "requiredPermissionsJson",
      "storeScopeField",
      "defaultTimeField",
      "fieldPoliciesJson"
    FROM "agent_v2_text_to_sql_semantic_views"
  `);
  const rows = (result.rows ?? []) as SemanticViewSeedRow[];
  const found = new Set(rows.map((row) => row.viewName));
  const missing = expectedViews.filter((viewName) => !found.has(viewName));
  const unexpected = rows.map((row) => row.viewName).filter((viewName) => !expectedViews.includes(viewName));
  const enabled = rows.filter((row) => row.isEnabled && expectedViews.includes(row.viewName)).map((row) => row.viewName).sort();
  const enabledMismatch = enabled.join(',') !== [...expectedEnabledViews].sort().join(',');
  const enabledAdminViews = adminOrSystemViews.filter((viewName) => rows.find((row) => row.viewName === viewName)?.isEnabled);
  const invalidMetadata = validateSemanticViewSeedRows(rows);
  const failures = [
    missing.length ? `missing: ${missing.join(', ')}` : '',
    unexpected.length ? `unexpected: ${unexpected.join(', ')}` : '',
    enabledMismatch ? `enabled mismatch: ${enabled.join(', ')}` : '',
    enabledAdminViews.length ? `admin/system enabled: ${enabledAdminViews.join(', ')}` : '',
    invalidMetadata.length ? `invalid metadata: ${invalidMetadata.join(', ')}` : '',
  ].filter(Boolean);
  return {
    id: 'semantic_view_seed_rows',
    status: failures.length ? 'fail' : 'pass',
    expected: `${expectedViews.length} metadata rows with expected enabled set, permissions, store scope, time field and field policies`,
    actual: failures.length ? failures.join('; ') : `rows=${rows.length}, enabled=${enabled.length}`,
  };
}

type SemanticViewSeedRow = {
  viewName: string;
  isEnabled: boolean;
  requiredPermissionsJson?: unknown;
  storeScopeField?: string | null;
  defaultTimeField?: string | null;
  fieldPoliciesJson?: unknown;
};

function validateSemanticViewSeedRows(rows: SemanticViewSeedRow[]) {
  return rows
    .filter((row) => expectedViews.includes(row.viewName))
    .flatMap((row) => {
      const failures: string[] = [];
      if (!isNonEmptyStringArray(row.requiredPermissionsJson)) failures.push(`${row.viewName}.requiredPermissionsJson`);
      if (!adminOrSystemViews.includes(row.viewName) && !isNonEmptyString(row.storeScopeField)) failures.push(`${row.viewName}.storeScopeField`);
      if (!isNonEmptyString(row.defaultTimeField) && !isSmallStaticSemanticView(row.viewName)) failures.push(`${row.viewName}.defaultTimeField`);
      if (!hasStructuredFieldPolicies(row.fieldPoliciesJson)) failures.push(`${row.viewName}.fieldPoliciesJson`);
      return failures;
    });
}

function isNonEmptyStringArray(value: unknown) {
  return Array.isArray(value) && value.some((item) => isNonEmptyString(item));
}

function isNonEmptyString(value: unknown) {
  return typeof value === 'string' && value.trim().length > 0;
}

function isSmallStaticSemanticView(viewName: string) {
  return viewName === 'agent_v2_industry_template_view';
}

function hasStructuredFieldPolicies(value: unknown) {
  if (!Array.isArray(value) || value.length === 0) return false;
  return value.some((item) => isFieldPolicy(item, 'allow')) || value.some((item) => isFieldPolicy(item, 'mask'));
}

function isFieldPolicy(value: unknown, policy: string) {
  return Boolean(
    value
      && typeof value === 'object'
      && isNonEmptyString((value as { field?: unknown }).field)
      && (value as { policy?: unknown }).policy === policy,
  );
}

function extractSeedRows(content: string) {
  const tuplePattern = /\('(agent_v2_[a-z_]+_view)',\s*'[^']+',\s*'[^']+',\s*'[^']+'::jsonb,\s*(NULL|'[^']+'),\s*(NULL|'[^']+'),\s*agent_v2_text_to_sql_field_policies\((?:ARRAY\[[^\]]*\])?\),\s*(true|false)\)/g;
  return [...content.matchAll(tuplePattern)]
    .map((match) => ({
      viewName: match[1],
      storeScopeField: unquoteNullableSqlString(match[2]),
      defaultTimeField: unquoteNullableSqlString(match[3]),
      isEnabled: match[4] === 'true',
    }));
}

function extractViewBodies(content: string) {
  return [...content.matchAll(/CREATE VIEW (agent_v2_[a-z_]+_view) AS([\s\S]*?)(?=\nCREATE VIEW agent_v2_|\nINSERT INTO "agent_v2_text_to_sql_semantic_views"|$)/g)]
    .map((match) => ({ viewName: match[1], body: match[2] }));
}

function findMigrationSeedFieldDrift(content: string, seededRows: Array<Pick<SemanticViewSeedRow, 'viewName' | 'storeScopeField' | 'defaultTimeField'>>) {
  const viewColumns = new Map(extractViewBodies(content).map((view) => [view.viewName, extractViewOutputColumns(view.body)]));
  return seededRows.flatMap((row) => {
    const columns = viewColumns.get(row.viewName) ?? new Set<string>();
    const failures: string[] = [];
    if (row.storeScopeField && !columns.has(row.storeScopeField)) failures.push(`${row.viewName}.storeScopeField=${row.storeScopeField}`);
    if (row.defaultTimeField && !columns.has(row.defaultTimeField)) failures.push(`${row.viewName}.defaultTimeField=${row.defaultTimeField}`);
    return failures;
  });
}

function extractViewOutputColumns(viewBody: string) {
  const selectMatch = viewBody.match(/\bSELECT\s+([\s\S]*?)\nFROM\s+/i);
  if (!selectMatch) return new Set<string>();
  return new Set(splitTopLevelColumns(selectMatch[1]).map(extractColumnName));
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
  return lastIdentifier ? toSnakeCase(lastIdentifier) : columnSql;
}

function toSnakeCase(value: string) {
  return value.replace(/[A-Z]/g, (char) => `_${char.toLowerCase()}`).replace(/^_/, '');
}

function unquoteNullableSqlString(value: string) {
  return value === 'NULL' ? null : value.slice(1, -1);
}

async function checkExplain(client: any, storeId: number): Promise<Gate> {
  const sql = `
    EXPLAIN (FORMAT JSON)
    SELECT product_id, product_name, SUM(quantity) AS quantity_sold
    FROM agent_v2_order_item_sales_view
    WHERE store_id = ANY($1)
      AND order_created_at >= $2
      AND order_created_at < $3
    GROUP BY product_id, product_name
    ORDER BY quantity_sold DESC
    LIMIT 1
  `;
  const result = await client.query(sql, [[storeId], startOfMonthIso(), nowIso()]);
  const cost = extractCost(result.rows?.[0]?.['QUERY PLAN']);
  return {
    id: 'explain_smoke',
    status: cost === null ? 'fail' : 'pass',
    expected: 'EXPLAIN (FORMAT JSON) works on agent_v2_order_item_sales_view',
    actual: cost === null ? 'cost unavailable' : `cost=${cost}`,
  };
}

async function checkReadonlySelect(client: any, storeId: number): Promise<Gate> {
  await client.query('BEGIN READ ONLY');
  try {
    const result = await client.query(
      `
        SELECT product_id, product_name
        FROM agent_v2_order_item_sales_view
        WHERE store_id = ANY($1)
          AND order_created_at >= $2
          AND order_created_at < $3
        LIMIT 1
      `,
      [[storeId], startOfMonthIso(), nowIso()],
    );
    return {
      id: 'readonly_select_smoke',
      status: 'pass',
      expected: 'readonly SELECT can execute inside BEGIN READ ONLY',
      actual: `rowCount=${result.rowCount ?? 0}`,
    };
  } finally {
    await client.query('ROLLBACK').catch(() => undefined);
  }
}

async function checkReadonlyWriteBlocked(client: any): Promise<Gate> {
  let began = false;
  try {
    await client.query('SET default_transaction_read_only = off');
    await client.query('BEGIN');
    began = true;
    await client.query('CREATE TABLE agent_v2_text_to_sql_readiness_write_probe (id integer)');
    return {
      id: 'readonly_write_block',
      status: 'fail',
      expected: 'readonly database user cannot create persistent tables even outside BEGIN READ ONLY',
      actual: 'CREATE TABLE succeeded',
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const expectedFailure = /read-only transaction|permission denied|must be owner|not authorized|insufficient privilege|cannot set/i.test(message);
    return {
      id: 'readonly_write_block',
      status: expectedFailure ? 'pass' : 'fail',
      expected: 'readonly database user cannot create persistent tables even outside BEGIN READ ONLY',
      actual: expectedFailure ? 'write blocked by readonly role or database policy' : message,
    };
  } finally {
    if (began) await client.query('ROLLBACK').catch(() => undefined);
    await client.query('SET default_transaction_read_only = on').catch(() => undefined);
  }
}

function extractCost(plan: unknown) {
  const root = Array.isArray(plan) ? plan[0] : plan;
  const cost = Number(root && typeof root === 'object' ? (root as any).Plan?.['Total Cost'] : NaN);
  return Number.isFinite(cost) ? cost : null;
}

function numericArg(name: string) {
  const prefix = `${name}=`;
  const value = process.argv.slice(2).find((arg) => arg.startsWith(prefix))?.slice(prefix.length);
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.trunc(parsed) : null;
}

function startOfMonthIso() {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
}

function nowIso() {
  return new Date().toISOString();
}

function report(gates: Gate[], strict: boolean) {
  const failCount = gates.filter((gate) => gate.status === 'fail').length;
  const summary = {
    pass: failCount === 0,
    gateCount: gates.length,
    failCount,
    skipCount: gates.filter((gate) => gate.status === 'skip').length,
  };
  console.log(JSON.stringify({ summary, gates, nextActions: buildNextActions(gates) }, null, 2));
  if (strict && failCount > 0) process.exit(1);
}

function buildNextActions(gates: Gate[]) {
  const gateById = new Map(gates.map((gate) => [gate.id, gate]));
  const nextActions: string[] = [];

  if (gateById.get('migration_file')?.status === 'fail') {
    nextActions.push('Fix the local Text-to-SQL migration file before any DB rollout.');
  }

  if (gateById.get('readonly_grants_template')?.status === 'fail') {
    nextActions.push('Fix the readonly grants template so it grants SELECT only on the semantic view allowlist.');
  }

  if (gateById.get('primary_migration_status')?.status === 'fail') {
    nextActions.push(
      `Apply Prisma migration ${textToSqlMigrationName} to the target DATABASE_URL during an authorized DB window.`,
    );
  }

  const readonlyUrlGate = gateById.get('readonly_database_url');
  if (readonlyUrlGate?.status === 'fail' || readonlyUrlGate?.status === 'skip') {
    nextActions.push(
      'Create an independent readonly DB user with prisma/agent-v2-text-to-sql-readonly-grants.template.sql, then configure AGENT_V2_TEXT_TO_SQL_READONLY_DATABASE_URL.',
    );
  }

  if (gateById.get('readonly_url_isolation')?.status === 'fail') {
    nextActions.push(
      'Set AGENT_V2_TEXT_TO_SQL_READONLY_DATABASE_URL to a different connection string and database username than DATABASE_URL.',
    );
  }

  if (gateById.get('readonly_connection')?.status === 'fail') {
    nextActions.push('Verify the readonly database URL, network access and credentials, then rerun strict readiness.');
  }

  if (['database_views', 'database_tables', 'semantic_view_seed_rows'].some((id) => gateById.get(id)?.status === 'fail')) {
    nextActions.push('Re-run the Text-to-SQL migration and semantic view seed, then rerun strict readiness.');
  }

  if (['explain_smoke', 'readonly_select_smoke'].some((id) => gateById.get(id)?.status === 'fail')) {
    nextActions.push('Verify readonly SELECT grants on all 40 semantic views and rerun strict readiness.');
  }

  if (gateById.get('readonly_write_block')?.status === 'fail') {
    nextActions.push('Tighten readonly role and schema privileges until the write probe is blocked.');
  }

  if (nextActions.length === 0 && gates.some((gate) => gate.status === 'skip')) {
    nextActions.push('Configure skipped external dependencies, then rerun strict readiness without --allow-missing-readonly.');
  }

  if (nextActions.length === 0) {
    nextActions.push('All readiness gates passed. Run npm.cmd run check:agent-v2-text-to-sql:release before enabling execute mode.');
  }

  return nextActions;
}

void main().catch((error) => {
  console.error(error);
  process.exit(1);
});
