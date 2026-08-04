import 'dotenv/config';
import { Client } from 'pg';
import { ASK_DATA_FREE_SQL_VIEWS } from '../src/ask-data-free-sql/ask-data-free-sql.catalog.js';

const strict = process.argv.includes('--strict');
const roleName = 'ask_data_free_sql_readonly';
const connectionString = process.env.DATABASE_URL?.trim();
if (!connectionString) throw new Error('DATABASE_URL is required.');
const databaseUrl = new URL(connectionString);
const approvedHost =
  databaseUrl.hostname.endsWith('.supabase.com') || databaseUrl.hostname.endsWith('.supabase.co');
if (!approvedHost) throw new Error(`Refusing unapproved database host: ${databaseUrl.hostname}`);

const client = new Client({
  connectionString,
  statement_timeout: 10000,
  query_timeout: 10000,
  application_name: 'ask_data_free_sql_role_preflight',
});

await client.connect();
try {
  const roleResult = await client.query<{
    rolname: string;
    rolcanlogin: boolean;
    rolinherit: boolean;
    rolsuper: boolean;
    rolcreaterole: boolean;
    rolcreatedb: boolean;
    rolreplication: boolean;
    rolbypassrls: boolean;
    rolconfig: string[] | null;
  }>(
    `SELECT rolname, rolcanlogin, rolinherit, rolsuper, rolcreaterole, rolcreatedb,
            rolreplication, rolbypassrls, rolconfig
       FROM pg_roles
      WHERE rolname = $1`,
    [roleName],
  );
  const auditTable = await client.query<{ present: boolean }>(
    "SELECT to_regclass('public.ask_data_free_sql_runs') IS NOT NULL AS present",
  );
  const presentViews = await client.query<{ table_name: string }>(
    `SELECT table_name
       FROM information_schema.views
      WHERE table_schema = 'public'
        AND table_name = ANY($1::text[])`,
    [ASK_DATA_FREE_SQL_VIEWS.map((view) => view.viewName)],
  );
  const role = roleResult.rows[0];
  if (!role) {
    print({
      status: 'fail',
      reason: 'readonly_role_missing',
      databaseHost: databaseUrl.hostname,
      roleName,
      auditTablePresent: Boolean(auditTable.rows[0]?.present),
      registeredViewCount: ASK_DATA_FREE_SQL_VIEWS.length,
      presentViewCount: presentViews.rows.length,
    });
    if (strict) process.exitCode = 1;
  } else {
    const readableViews: string[] = [];
    const missingViews: string[] = [];
    for (const view of ASK_DATA_FREE_SQL_VIEWS) {
      const privilege = await client.query<{ allowed: boolean }>(
        "SELECT has_table_privilege($1, $2, 'SELECT') AS allowed",
        [roleName, view.viewName],
      );
      if (privilege.rows[0]?.allowed) readableViews.push(view.viewName);
      else missingViews.push(view.viewName);
    }
    const writableTables = await client.query<{ table_name: string }>(
      `SELECT c.relname AS table_name
         FROM pg_class c
         JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public'
          AND c.relkind IN ('r', 'p')
          AND (
            has_table_privilege($1, c.oid, 'INSERT')
            OR has_table_privilege($1, c.oid, 'UPDATE')
            OR has_table_privilege($1, c.oid, 'DELETE')
            OR has_table_privilege($1, c.oid, 'TRUNCATE')
            OR has_table_privilege($1, c.oid, 'REFERENCES')
            OR has_table_privilege($1, c.oid, 'TRIGGER')
          )
        ORDER BY c.relname`,
      [roleName],
    );
    const schemaCreate = await client.query<{ allowed: boolean }>(
      "SELECT has_schema_privilege($1, 'public', 'CREATE') AS allowed",
      [roleName],
    );
    const databaseConnect = await client.query<{ allowed: boolean }>(
      'SELECT has_database_privilege($1, current_database(), \'CONNECT\') AS allowed',
      [roleName],
    );
    const memberships = await client.query<{ granted_role: string }>(
      `SELECT parent.rolname AS granted_role
         FROM pg_auth_members membership
         JOIN pg_roles member ON member.oid = membership.member
         JOIN pg_roles parent ON parent.oid = membership.roleid
        WHERE member.rolname = $1
        ORDER BY parent.rolname`,
      [roleName],
    );
    const elevatedRole = Boolean(
      role.rolsuper || role.rolcreaterole || role.rolcreatedb || role.rolreplication || role.rolbypassrls,
    );
    const defaultReadOnly = (role.rolconfig ?? []).includes('default_transaction_read_only=on');
    const result = {
      status:
        !role.rolcanlogin ||
        role.rolinherit ||
        elevatedRole ||
        !defaultReadOnly ||
        missingViews.length ||
        writableTables.rows.length ||
        schemaCreate.rows[0]?.allowed ||
        !databaseConnect.rows[0]?.allowed ||
        memberships.rows.length ||
        !auditTable.rows[0]?.present
          ? 'fail'
          : 'pass',
      databaseHost: databaseUrl.hostname,
      roleName,
      role: {
        canLogin: role.rolcanlogin,
        inherit: role.rolinherit,
        elevatedRole,
        defaultReadOnly,
      },
      databaseConnect: Boolean(databaseConnect.rows[0]?.allowed),
      publicSchemaCreate: Boolean(schemaCreate.rows[0]?.allowed),
      readableViewCount: readableViews.length,
      missingViews,
      writableTableCount: writableTables.rows.length,
      writableTables: writableTables.rows.slice(0, 20).map((item) => item.table_name),
      grantedRoles: memberships.rows.map((item) => item.granted_role),
      auditTablePresent: Boolean(auditTable.rows[0]?.present),
    };
    print(result);
    if (strict && result.status !== 'pass') process.exitCode = 1;
  }
} finally {
  await client.end().catch(() => undefined);
}

function print(value: unknown) {
  console.log(JSON.stringify(value, null, 2));
}
