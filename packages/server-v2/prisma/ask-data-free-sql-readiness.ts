import { Client } from 'pg';
import { ASK_DATA_FREE_SQL_VIEWS } from '../src/ask-data-free-sql/ask-data-free-sql.catalog.js';

const strict = process.argv.includes('--strict');
const connectionString = process.env.ASK_DATA_FREE_SQL_READONLY_DATABASE_URL?.trim();
const views = ASK_DATA_FREE_SQL_VIEWS.map((view) => view.viewName);

if (!connectionString) {
  const result = { status: strict ? 'fail' : 'skip', reason: 'readonly_database_url_missing', views };
  console.log(JSON.stringify(result, null, 2));
  if (strict) process.exitCode = 1;
} else {
  const client = new Client({
    connectionString,
    statement_timeout: 5000,
    query_timeout: 5000,
    application_name: 'ask_data_free_sql_readiness',
  });
  try {
    await client.connect();
    const identity = await client.query<{
      current_user: string;
      default_transaction_read_only: string;
      rolsuper: boolean;
      rolcreaterole: boolean;
      rolcreatedb: boolean;
      rolbypassrls: boolean;
    }>(
      `SELECT current_user,
              current_setting('default_transaction_read_only') AS default_transaction_read_only,
              rolsuper,
              rolcreaterole,
              rolcreatedb,
              rolbypassrls
         FROM pg_roles
        WHERE rolname = current_user`,
    );
    const auditTable = await client.query<{ present: boolean }>(
      "SELECT to_regclass('public.ask_data_free_sql_runs') IS NOT NULL AS present",
    );
    const readableViews: string[] = [];
    const missingViews: string[] = [];
    for (const view of views) {
      const privilege = await client.query<{ allowed: boolean }>(
        "SELECT has_table_privilege(current_user, $1, 'SELECT') AS allowed",
        [view],
      );
      if (privilege.rows[0]?.allowed) readableViews.push(view);
      else missingViews.push(view);
    }
    let writeProbe = 'not_run';
    try {
      await client.query('BEGIN');
      await client.query('CREATE TABLE public.ask_data_free_sql_readiness_write_probe (id integer)');
      await client.query('ROLLBACK');
      writeProbe = 'unexpectedly_succeeded';
    } catch {
      await client.query('ROLLBACK').catch(() => undefined);
      writeProbe = 'blocked';
    }
    const schemaCreate = await client.query<{ allowed: boolean }>(
      "SELECT has_schema_privilege(current_user, 'public', 'CREATE') AS allowed",
    );
    const writableTables = await client.query<{ schema_name: string; table_name: string }>(
      `SELECT n.nspname AS schema_name, c.relname AS table_name
         FROM pg_class c
         JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public'
          AND c.relkind IN ('r', 'p')
          AND (
            has_table_privilege(current_user, c.oid, 'INSERT')
            OR has_table_privilege(current_user, c.oid, 'UPDATE')
            OR has_table_privilege(current_user, c.oid, 'DELETE')
            OR has_table_privilege(current_user, c.oid, 'TRUNCATE')
            OR has_table_privilege(current_user, c.oid, 'REFERENCES')
            OR has_table_privilege(current_user, c.oid, 'TRIGGER')
          )
        ORDER BY n.nspname, c.relname`,
    );
    const auditTablePresent = Boolean(auditTable.rows[0]?.present);
    const role = identity.rows[0];
    const dedicatedRole = role?.current_user === 'ask_data_free_sql_readonly';
    const defaultReadOnly = role?.default_transaction_read_only === 'on';
    const elevatedRole = Boolean(role?.rolsuper || role?.rolcreaterole || role?.rolcreatedb || role?.rolbypassrls);
    const result = {
      status:
        missingViews.length ||
        !auditTablePresent ||
        !dedicatedRole ||
        !defaultReadOnly ||
        elevatedRole ||
        writableTables.rows.length ||
        writeProbe !== 'blocked' ||
        schemaCreate.rows[0]?.allowed
          ? 'fail'
          : 'pass',
      identity: role,
      dedicatedRole,
      defaultReadOnly,
      elevatedRole,
      readableViewCount: readableViews.length,
      missingViews,
      auditTablePresent,
      writeProbe,
      publicSchemaCreate: Boolean(schemaCreate.rows[0]?.allowed),
      writableTableCount: writableTables.rows.length,
      writableTables: writableTables.rows.slice(0, 20),
    };
    console.log(JSON.stringify(result, null, 2));
    if (result.status !== 'pass') process.exitCode = 1;
  } catch (error) {
    console.error(
      JSON.stringify({ status: 'fail', reason: error instanceof Error ? error.message : String(error) }, null, 2),
    );
    process.exitCode = 1;
  } finally {
    await client.end().catch(() => undefined);
  }
}
