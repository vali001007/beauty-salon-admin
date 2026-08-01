import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('Ask Data Free SQL migration and grants', () => {
  it('creates the independent audit table', () => {
    const sql = readFileSync(
      resolve(process.cwd(), 'prisma/migrations/20260801020000_ask_data_free_sql/migration.sql'),
      'utf8',
    );
    expect(sql).toContain('CREATE TABLE "ask_data_free_sql_runs"');
    expect(sql).toContain('"status" TEXT NOT NULL');
    expect(sql).toContain('"storeId" INTEGER NOT NULL');
  });

  it('grants the read-only role only the 13 registered views', () => {
    const sql = readFileSync(resolve(process.cwd(), 'prisma/ask-data-free-sql-readonly-grants.template.sql'), 'utf8');
    expect(sql).toContain('ALTER ROLE ask_data_free_sql_readonly SET default_transaction_read_only = on');
    expect(sql).toContain('NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS');
    expect((sql.match(/^\s+NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS;/gm) ?? []).length).toBe(1);
    expect(sql).toContain("ALTER ROLE ask_data_free_sql_readonly PASSWORD '<SET_LOCALLY>'");
    expect(sql).toContain('REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public');
    expect(sql).toContain('REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public');
    expect(sql).not.toContain('GRANT SELECT ON ALL TABLES');
    expect(sql).not.toContain('GRANT INSERT');
    expect((sql.match(/agent_v3_[a-z_]+_view/g) ?? []).length).toBe(13);
  });

  it('fails readiness when the independent audit table is missing', () => {
    const source = readFileSync(resolve(process.cwd(), 'prisma/ask-data-free-sql-readiness.ts'), 'utf8');
    expect(source).toContain('!auditTablePresent');
    expect(source).toContain("current_user === 'ask_data_free_sql_readonly'");
    expect(source).toContain("default_transaction_read_only === 'on'");
    expect(source).toContain("has_table_privilege(current_user, c.oid, 'INSERT')");
    expect(source).toContain("await client.query('BEGIN')");
  });

  it('isolates the Ask Data migration from the pending Ami Brain migration', () => {
    const source = readFileSync(resolve(process.cwd(), 'scripts/ask-data-free-sql-isolated-migration.mjs'), 'utf8');
    const packageJson = JSON.parse(readFileSync(resolve(process.cwd(), 'package.json'), 'utf8')) as {
      scripts?: Record<string, string>;
    };
    expect(source).toContain("const TARGET_MIGRATION = '20260801020000_ask_data_free_sql'");
    expect(source).toContain(
      "const EXCLUDED_BRAIN_MIGRATION = '20260801010000_brain_governance_tasks_and_gate_receipts'",
    );
    expect(source).toContain("name !== EXCLUDED_BRAIN_MIGRATION");
    expect(source).toContain("if (apply && !confirmed)");
    expect(source).toContain("after.excludedBrainMigrationApplied");
    expect(packageJson.scripts?.['ask-data:free-sql:migration:plan']).toContain(
      'ask-data-free-sql-isolated-migration.mjs',
    );
    expect(packageJson.scripts?.['ask-data:free-sql:migration:apply']).toContain('--apply --yes');
    expect(packageJson.scripts?.['ask-data:free-sql:role:apply-and-eval']).toContain('--run-live-eval');
    expect(packageJson.scripts?.['ask-data:free-sql:configure']).toContain('--write-env');
    expect(packageJson.scripts?.['ask-data:free-sql:api-acceptance']).toContain('--mode=execute');
    expect(packageJson.scripts?.['ask-data:free-sql:dev-admin:api-smoke']).toContain('--mode=development_admin');
    expect(packageJson.scripts?.['ask-data:free-sql:rollback-acceptance']).toContain('--mode=legacy');
  });

  it('provides an admin-side role preflight without requiring the read-only password', () => {
    const source = readFileSync(resolve(process.cwd(), 'prisma/ask-data-free-sql-role-preflight.ts'), 'utf8');
    expect(source).toContain("const roleName = 'ask_data_free_sql_readonly'");
    expect(source).toContain('has_table_privilege($1, $2, \'SELECT\')');
    expect(source).toContain("has_schema_privilege($1, 'public', 'CREATE')");
    expect(source).toContain('default_transaction_read_only=on');
    expect(source).toContain('writableTableCount');
  });

  it('requires a local password and explicit confirmation before provisioning the role', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'scripts/ask-data-free-sql-provision-readonly-role.mjs'),
      'utf8',
    );
    expect(source).toContain('ASK_DATA_FREE_SQL_READONLY_PASSWORD');
    expect(source).toContain("process.argv.includes('--apply')");
    expect(source).toContain("process.argv.includes('--yes')");
    expect(source).toContain('buildChildEnv(process.env, readonlyUrl.toString())');
    expect(source).toContain("process.argv.includes('--run-live-eval')");
    expect(source).toContain("process.argv.includes('--write-env')");
    expect(source).toContain('readHiddenLine');
    expect(source).toContain('writeManagedEnvFile');
    expect(source).toContain('printSafeFailure');
    expect(source).toContain('safeErrorMessage');
    expect(source).toContain('prisma/ask-data-free-sql-live-eval.ts');
    expect(source).not.toContain('console.log(readonlyUrl');
  });

  it('provides an authenticated API, permission, audit and rollback acceptance gate', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'scripts/ask-data-free-sql-api-acceptance.mjs'),
      'utf8',
    );
    expect(source).toContain('/ask-data/free-sql/catalog');
    expect(source).toContain("'/ask-data/free-sql'");
    expect(source).toContain('ordinary_user_debug_sql_visible');
    expect(source).toContain('cross_store_expected_403');
    expect(source).toContain('ask_data_free_sql_runs');
    expect(source).toContain("options.mode === 'legacy'");
    expect(source).toContain("options.mode === 'development_admin'");
    expect(source).not.toContain('console.log(token)');
  });
});
