import { execFileSync, spawnSync } from 'node:child_process';
import { createHash, randomBytes, randomInt } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

const packageRoot = resolve(import.meta.dirname, '..');
const migrationsRoot = join(packageRoot, 'prisma', 'migrations');
const schemaPath = join(packageRoot, 'prisma', 'schema.prisma');

function argValue(name) {
  const prefix = `--${name}=`;
  return process.argv.find((value) => value.startsWith(prefix))?.slice(prefix.length);
}

function run(program, args, options = {}) {
  const result = spawnSync(program, args, {
    cwd: options.cwd ?? packageRoot,
    env: options.env ?? process.env,
    encoding: 'utf8',
    timeout: options.timeout ?? 600_000,
  });
  if (result.error || result.status !== 0) {
    throw new Error([`Command failed: ${program} ${args.join(' ')}`, result.error?.message, result.stdout, result.stderr].filter(Boolean).join('\n'));
  }
  return result.stdout.trim();
}

function inspectInventory() {
  const migrations = readdirSync(migrationsRoot)
    .filter((name) => statSync(join(migrationsRoot, name)).isDirectory())
    .sort()
    .map((name) => {
      const path = join(migrationsRoot, name, 'migration.sql');
      if (!existsSync(path)) throw new Error(`migration.sql missing: ${name}`);
      const bytes = readFileSync(path);
      if (!bytes.length) throw new Error(`migration.sql empty: ${name}`);
      return { name, checksum: createHash('sha256').update(bytes).digest('hex'), bytes: bytes.length };
    });
  const groups = new Map();
  for (const migration of migrations) {
    const prefix = migration.name.slice(0, 14);
    groups.set(prefix, [...(groups.get(prefix) ?? []), migration.name]);
  }
  return {
    count: migrations.length,
    first: migrations[0]?.name ?? null,
    latest: migrations.at(-1)?.name ?? null,
    chainHash: createHash('sha256').update(migrations.map((item) => `${item.name}:${item.checksum}`).join('\n')).digest('hex'),
    duplicateTimestampPrefixes: [...groups.entries()].filter(([, names]) => names.length > 1).map(([prefix, names]) => ({ prefix, names })),
  };
}

function waitForPostgres(container, user) {
  const deadline = Date.now() + 90_000;
  while (Date.now() < deadline) {
    const result = spawnSync('docker', ['exec', container, 'pg_isready', '-U', user, '-d', 'ami_migration_gate'], { encoding: 'utf8' });
    if (result.status === 0) return;
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 1000);
  }
  throw new Error('PostgreSQL 17 migration gate startup timeout');
}

function psql(container, user, sql) {
  return run('docker', ['exec', container, 'psql', '-v', 'ON_ERROR_STOP=1', '-U', user, '-d', 'ami_migration_gate', '-At', '-c', sql]);
}

async function main() {
  if (!process.argv.includes('--apply') || !process.argv.includes('--yes')) {
    throw new Error('空库 migration gate 会创建并销毁专用临时容器；请显式传入 --apply --yes。');
  }
  const inventory = inspectInventory();
  if (!inventory.count) throw new Error('Migration inventory is empty');

  const container = `ami-pg17-gate-${Date.now().toString(36)}-${randomInt(1000, 9999)}`;
  const port = Number(argValue('port') ?? randomInt(40000, 49999));
  const user = 'ami_gate';
  const password = randomBytes(24).toString('base64url');
  const databaseUrl = `postgresql://${user}:${encodeURIComponent(password)}@127.0.0.1:${port}/ami_migration_gate?schema=public`;
  const startedAt = new Date().toISOString();
  let started = false;
  try {
    run('docker', ['version', '--format', '{{.Server.Version}}']);
    run('docker', [
      'run', '--rm', '--name', container,
      '-e', `POSTGRES_USER=${user}`,
      '-e', `POSTGRES_PASSWORD=${password}`,
      '-e', 'POSTGRES_DB=ami_migration_gate',
      '-e', 'POSTGRES_INITDB_ARGS=--encoding=UTF8 --locale=en_US.UTF-8',
      '-e', 'TZ=UTC', '-e', 'PGTZ=UTC',
      '-p', `127.0.0.1:${port}:5432`,
      '-d', 'postgres:17-bookworm',
      'postgres', '-c', 'timezone=UTC', '-c', 'log_timezone=UTC',
    ], { timeout: 180_000 });
    started = true;
    waitForPostgres(container, user);

    const prismaEnv = { ...process.env, DATABASE_URL: databaseUrl };
    delete prismaEnv.AMI_DATABASE_GUARD;
    delete prismaEnv.AMI_DATABASE_MODE;
    delete prismaEnv.AMI_DEV_SLOT;
    run('npx', ['prisma', 'validate', '--schema', schemaPath], { env: prismaEnv });
    run('npx', ['prisma', 'migrate', 'deploy', '--schema', schemaPath], { env: prismaEnv });
    const statusOutput = run('npx', ['prisma', 'migrate', 'status', '--schema', schemaPath], { env: prismaEnv });
    const database = JSON.parse(psql(container, user, `SELECT json_build_object(
      'serverVersion', current_setting('server_version'),
      'timezone', current_setting('TimeZone'),
      'collate', (SELECT datcollate FROM pg_database WHERE datname = current_database()),
      'ctype', (SELECT datctype FROM pg_database WHERE datname = current_database()),
      'pgcrypto', (SELECT extversion FROM pg_extension WHERE extname = 'pgcrypto'),
      'appliedMigrations', (SELECT COUNT(*) FROM "_prisma_migrations" WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL),
      'failedMigrations', (SELECT COUNT(*) FROM "_prisma_migrations" WHERE finished_at IS NULL OR rolled_back_at IS NOT NULL)
    )`));
    const checks = {
      postgres17: String(database.serverVersion).startsWith('17.'),
      utc: database.timezone === 'UTC',
      localePresent: Boolean(database.collate && database.ctype),
      pgcrypto: Boolean(database.pgcrypto),
      migrationInventoryAligned: Number(database.appliedMigrations) === inventory.count,
      noFailedMigrations: Number(database.failedMigrations) === 0,
      prismaStatusUpToDate: /Database schema is up to date/u.test(statusOutput),
    };
    const failedChecks = Object.entries(checks).filter(([, passed]) => !passed).map(([name]) => name);
    const report = {
      status: failedChecks.length ? 'failed' : 'passed',
      generatedAt: new Date().toISOString(),
      startedAt,
      environment: { image: 'postgres:17-bookworm', temporaryContainer: container, port },
      inventory,
      database,
      checks,
      failedChecks,
    };
    const repositoryRoot = resolve(packageRoot, '..', '..');
    const gitCommonDir = resolve(repositoryRoot, execFileSync('git', ['rev-parse', '--git-common-dir'], { cwd: repositoryRoot, encoding: 'utf8' }).trim());
    const output = resolve(argValue('output') ?? join(gitCommonDir, 'ami-dev-v2', 'reports', `postgres17-migration-gate-${Date.now()}.json`));
    mkdirSync(dirname(output), { recursive: true });
    writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 });
    console.log(JSON.stringify({ ...report, reportPath: output }, null, 2));
    if (failedChecks.length) process.exitCode = 1;
  } finally {
    if (started) spawnSync('docker', ['stop', '--time', '10', container], { encoding: 'utf8', timeout: 30_000 });
  }
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message.replace(/(postgres(?:ql)?:\/\/[^:]+:)[^@]+@/giu, '$1***@'));
  process.exitCode = 1;
});
