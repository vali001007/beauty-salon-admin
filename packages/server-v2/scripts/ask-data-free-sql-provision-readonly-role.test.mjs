import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import {
  buildChildEnv,
  buildManagedEnvText,
  deriveReadonlyUrl,
  safeErrorMessage,
  writeManagedEnvFile,
} from './ask-data-free-sql-provision-readonly-role.mjs';

test('derives a dedicated Supabase pooler identity without changing the target database', () => {
  const readonlyUrl = deriveReadonlyUrl(
    'postgresql://postgres.project-ref:admin-secret@aws-0.example.supabase.com:6543/postgres?pgbouncer=true',
    'readonly secret with symbols:@',
  );

  assert.equal(decodeURIComponent(readonlyUrl.username), 'ask_data_free_sql_readonly.project-ref');
  assert.equal(decodeURIComponent(readonlyUrl.password), 'readonly secret with symbols:@');
  assert.equal(readonlyUrl.hostname, 'aws-0.example.supabase.com');
  assert.equal(readonlyUrl.port, '6543');
  assert.equal(readonlyUrl.pathname, '/postgres');
  assert.equal(readonlyUrl.searchParams.get('pgbouncer'), 'true');
});

test('does not pass the standalone password variable to readiness or live evaluation', () => {
  const childEnv = buildChildEnv(
    {
      DATABASE_URL: 'admin-url',
      ASK_DATA_FREE_SQL_READONLY_PASSWORD: 'must-not-leak',
    },
    'readonly-url',
  );

  assert.equal(childEnv.DATABASE_URL, 'admin-url');
  assert.equal(childEnv.ASK_DATA_FREE_SQL_READONLY_DATABASE_URL, 'readonly-url');
  assert.equal('ASK_DATA_FREE_SQL_READONLY_PASSWORD' in childEnv, false);
});

test('updates only managed Ask Data settings, removes password lines and preserves custom limits', () => {
  const updated = buildManagedEnvText(
    [
      'DATABASE_URL=keep-this-value',
      'ASK_DATA_FREE_SQL_ENABLED=false',
      'ASK_DATA_FREE_SQL_DRY_RUN_ONLY=true',
      'ASK_DATA_FREE_SQL_MAX_LIMIT=50',
      'ASK_DATA_FREE_SQL_READONLY_PASSWORD=remove-this',
      'ASK_DATA_FREE_SQL_READONLY_PASSWORD=remove-this-too',
      'UNRELATED_SETTING=preserve-me',
      '',
    ].join('\n'),
    'postgresql://readonly:secret@example.supabase.com/postgres',
  );

  assert.match(updated, /^DATABASE_URL=keep-this-value$/m);
  assert.match(updated, /^ASK_DATA_FREE_SQL_ENABLED=true$/m);
  assert.match(updated, /^ASK_DATA_FREE_SQL_DRY_RUN_ONLY=false$/m);
  assert.match(updated, /^ASK_DATA_FREE_SQL_MAX_LIMIT=50$/m);
  assert.match(updated, /^ASK_DATA_FREE_SQL_MAX_VIEWS=2$/m);
  assert.match(updated, /^UNRELATED_SETTING=preserve-me$/m);
  assert.doesNotMatch(updated, /ASK_DATA_FREE_SQL_READONLY_PASSWORD/);
  assert.equal((updated.match(/ASK_DATA_FREE_SQL_READONLY_DATABASE_URL=/g) ?? []).length, 1);
});

test('atomically writes the local env file with owner-only permissions', () => {
  const tempRoot = mkdtempSync(join(tmpdir(), 'ask-data-free-sql-env-test-'));
  const target = join(tempRoot, '.env');
  try {
    writeFileSync(target, 'DATABASE_URL=keep\n', { mode: 0o644 });
    writeManagedEnvFile(target, 'postgresql://readonly:secret@example.supabase.com/postgres');

    const updated = readFileSync(target, 'utf8');
    assert.match(updated, /^DATABASE_URL=keep$/m);
    assert.match(updated, /^ASK_DATA_FREE_SQL_ENABLED=true$/m);
    assert.equal(statSync(target).mode & 0o777, 0o600);
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
});

test('redacts passwords and database URLs from surfaced provisioning errors', () => {
  const message = safeErrorMessage(
    new Error(
      "ALTER ROLE failed: PASSWORD 'do-not-print-this-secret' at postgresql://admin:secret@example.supabase.com/postgres",
    ),
  );

  assert.doesNotMatch(message, /do-not-print-this-secret|admin:secret/);
  assert.match(message, /PASSWORD '<redacted>'/);
  assert.match(message, /postgresql:\/\/<redacted>/);
});
