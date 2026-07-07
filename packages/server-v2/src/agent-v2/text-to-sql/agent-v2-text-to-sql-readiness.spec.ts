import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('Agent V2 Text-to-SQL readiness script', () => {
  function runReadiness(env: Record<string, string | undefined>, extraArgs: string[] = []) {
    const result = spawnSync(
      process.execPath,
      ['scripts/run-agent-v2-script.mjs', 'prisma/agent-v2-text-to-sql-readiness.ts', '--strict', '--store-id=1', ...extraArgs],
      {
        cwd: process.cwd(),
        encoding: 'utf8',
        env: {
          ...process.env,
          DATABASE_URL: undefined,
          AGENT_V2_TEXT_TO_SQL_READONLY_DATABASE_URL: undefined,
          AGENT_V2_TEXT_TO_SQL_SKIP_DOTENV: 'true',
          ...env,
        },
      },
    );
    const jsonStart = result.stdout.indexOf('{');
    const payload = jsonStart >= 0 ? JSON.parse(result.stdout.slice(jsonStart)) : null;
    return { ...result, payload };
  }

  it('fails before connecting when readonly URL exists but DATABASE_URL is missing', () => {
    const result = runReadiness({
      AGENT_V2_TEXT_TO_SQL_READONLY_DATABASE_URL: 'postgresql://readonly_user:password@example.invalid:5432/app',
    });

    expect(result.status).toBe(1);
    expect(result.payload.summary.pass).toBe(false);
    expect(result.payload.gates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'readonly_url_isolation',
          status: 'fail',
          actual: 'DATABASE_URL missing from current environment',
        }),
      ]),
    );
    expect(result.payload.gates.map((gate: { id: string }) => gate.id)).not.toContain('readonly_connection');
    expect(result.payload.nextActions).toEqual(
      expect.arrayContaining([
        'Set AGENT_V2_TEXT_TO_SQL_READONLY_DATABASE_URL to a different connection string and database username than DATABASE_URL.',
      ]),
    );
  });

  it('fails before connecting when readonly URL equals DATABASE_URL', () => {
    const url = 'postgresql://app_writer:password@example.invalid:5432/app';
    const result = runReadiness({
      DATABASE_URL: url,
      AGENT_V2_TEXT_TO_SQL_READONLY_DATABASE_URL: url,
    });

    expect(result.status).toBe(1);
    expect(result.payload.gates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'readonly_url_isolation',
          status: 'fail',
          actual: 'readonly URL matches DATABASE_URL',
        }),
      ]),
    );
    expect(result.payload.gates.map((gate: { id: string }) => gate.id)).not.toContain('readonly_connection');
    expect(result.payload.nextActions).toEqual(
      expect.arrayContaining([
        'Set AGENT_V2_TEXT_TO_SQL_READONLY_DATABASE_URL to a different connection string and database username than DATABASE_URL.',
      ]),
    );
  });

  it('fails before connecting when readonly URL reuses the primary database user', () => {
    const result = runReadiness({
      DATABASE_URL: 'postgresql://app_writer:password@example.invalid:5432/app',
      AGENT_V2_TEXT_TO_SQL_READONLY_DATABASE_URL:
        'postgresql://app_writer:other-password@example.invalid:5432/app?sslmode=require',
    });

    expect(result.status).toBe(1);
    expect(result.payload.gates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'readonly_url_isolation',
          status: 'fail',
          actual: 'readonly URL uses the same database user as DATABASE_URL',
        }),
      ]),
    );
    expect(result.payload.gates.map((gate: { id: string }) => gate.id)).not.toContain('readonly_connection');
    expect(result.payload.nextActions).toEqual(
      expect.arrayContaining([
        'Set AGENT_V2_TEXT_TO_SQL_READONLY_DATABASE_URL to a different connection string and database username than DATABASE_URL.',
      ]),
    );
  });

  it('can fail the completion audit before readonly checks when primary migration status cannot be verified', () => {
    const result = runReadiness(
      {},
      ['--check-primary-migration', '--allow-missing-readonly'],
    );

    expect(result.status).toBe(1);
    expect(result.payload.summary.pass).toBe(false);
    expect(result.payload.gates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'primary_migration_status',
          status: 'fail',
          actual: 'DATABASE_URL missing from current environment',
        }),
        expect.objectContaining({
          id: 'readonly_database_url',
          status: 'skip',
        }),
      ]),
    );
    expect(result.payload.nextActions).toEqual(
      expect.arrayContaining([
        'Apply Prisma migration 20260707013000_agent_v2_text_to_sql to the target DATABASE_URL during an authorized DB window.',
        'Create an independent readonly DB user with prisma/agent-v2-text-to-sql-readonly-grants.template.sql, then configure AGENT_V2_TEXT_TO_SQL_READONLY_DATABASE_URL.',
      ]),
    );
  });

  it('validates semantic view seed metadata fields in strict readiness', () => {
    const content = readFileSync(resolve(process.cwd(), 'prisma/agent-v2-text-to-sql-readiness.ts'), 'utf8');

    expect(content).toContain('"requiredPermissionsJson"');
    expect(content).toContain('"storeScopeField"');
    expect(content).toContain('"defaultTimeField"');
    expect(content).toContain('"fieldPoliciesJson"');
    expect(content).toContain('validateSemanticViewSeedRows');
    expect(content).toContain('hasStructuredFieldPolicies');
    expect(content).toContain('findMigrationSeedFieldDrift');
    expect(content).toContain('extractViewOutputColumns');
  });
});
