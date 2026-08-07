import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import {
  COMPOSE_FILE,
  POSTGRES_CONTAINER,
  REPO_ROOT,
  SERVER_ROOT,
  ensurePostgresSecrets,
  parseArgs,
  parseEnvFile,
  redact,
  slotConfig,
  writeSlotRuntime,
} from './ami-dev-common.mjs';

const args = parseArgs();
const command = args.positional[0] || 'doctor';

function run(program, programArgs, options = {}) {
  const result = spawnSync(program, programArgs, {
    cwd: options.cwd ?? REPO_ROOT,
    env: options.env ?? process.env,
    encoding: 'utf8',
    timeout: options.timeout ?? 300_000,
    stdio: options.stdio ?? 'pipe',
  });
  if (result.error || result.status !== 0) {
    throw new Error(
      redact([`命令失败：${program} ${programArgs.join(' ')}`, result.error?.message, result.stdout, result.stderr]
        .filter(Boolean)
        .join('\n')),
    );
  }
  return { stdout: result.stdout?.trim() ?? '', stderr: result.stderr?.trim() ?? '' };
}

function composeArgs(extra) {
  const { paths } = ensurePostgresSecrets();
  return ['compose', '--env-file', paths.postgresEnv, '-f', COMPOSE_FILE, ...extra];
}

function startPostgres() {
  run('docker', composeArgs(['up', '-d', 'postgres17']), { timeout: 180_000 });
  const deadline = Date.now() + 90_000;
  while (Date.now() < deadline) {
    const status = spawnSync('docker', ['inspect', '--format', '{{.State.Health.Status}}', POSTGRES_CONTAINER], {
      encoding: 'utf8',
    });
    if (status.status === 0 && status.stdout.trim() === 'healthy') return;
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 1000);
  }
  throw new Error('PostgreSQL 17 在 90 秒内未达到 healthy。');
}

function stopPostgres() {
  run('docker', composeArgs(['stop', 'postgres17']), { timeout: 60_000 });
}

function psql(database, sql) {
  const { env } = ensurePostgresSecrets();
  return run('docker', [
    'exec',
    POSTGRES_CONTAINER,
    'psql',
    '-v',
    'ON_ERROR_STOP=1',
    '-U',
    env.AMI_LOCAL_POSTGRES_USER,
    '-d',
    database,
    '-At',
    '-c',
    sql,
  ]).stdout;
}

function ensureSlotDatabase(slot) {
  const config = slotConfig(slot);
  startPostgres();
  const { env } = ensurePostgresSecrets();
  const exists = psql('postgres', `SELECT 1 FROM pg_database WHERE datname = '${config.database}'`);
  if (exists !== '1') {
    run('docker', ['exec', POSTGRES_CONTAINER, 'createdb', '-U', env.AMI_LOCAL_POSTGRES_USER, config.database]);
  }
  return config;
}

function slotEnvironment(slot) {
  const config = ensureSlotDatabase(slot);
  const { env: postgresEnv } = ensurePostgresSecrets();
  const runtime = existsSync(config.runtimeEnvPath)
    ? parseEnvFile(config.runtimeEnvPath)
    : writeSlotRuntime(config, postgresEnv);
  return { config, runtime };
}

function migrate(slot) {
  const { config, runtime } = slotEnvironment(slot);
  run('npx', ['prisma', 'validate', '--schema', 'prisma/schema.prisma'], {
    cwd: SERVER_ROOT,
    env: { ...process.env, ...runtime },
  });
  run('npx', ['prisma', 'migrate', 'deploy', '--schema', 'prisma/schema.prisma'], {
    cwd: SERVER_ROOT,
    env: { ...process.env, ...runtime },
    timeout: 600_000,
  });
  psql(config.database, 'CREATE EXTENSION IF NOT EXISTS pgcrypto');
  return doctor(slot);
}

function seed(slot) {
  const { runtime } = slotEnvironment(slot);
  run('node', ['--loader', 'ts-node/esm', '--experimental-specifier-resolution=node', 'prisma/seed-local-slot.ts'], {
    cwd: SERVER_ROOT,
    env: { ...process.env, ...runtime, TS_NODE_TRANSPILE_ONLY: 'true' },
    timeout: 600_000,
    stdio: 'inherit',
  });
}

function migrationInventory() {
  const root = join(SERVER_ROOT, 'prisma', 'migrations');
  const names = readdirSync(root)
    .filter((name) => statSync(join(root, name)).isDirectory())
    .sort();
  return { count: names.length, first: names[0] ?? null, latest: names.at(-1) ?? null };
}

function doctor(slotValue) {
  startPostgres();
  const base = JSON.parse(
    psql(
      'postgres',
      `SELECT json_build_object(
        'serverVersion', current_setting('server_version'),
        'timezone', current_setting('TimeZone'),
        'collate', (SELECT datcollate FROM pg_database WHERE datname = current_database()),
        'ctype', (SELECT datctype FROM pg_database WHERE datname = current_database())
      )`,
    ),
  );
  const report = {
    status: 'ready',
    image: 'postgres:17-bookworm',
    container: POSTGRES_CONTAINER,
    server: base,
    inventory: migrationInventory(),
    slot: null,
  };
  if (!String(base.serverVersion).startsWith('17.')) throw new Error(`PostgreSQL 主版本不匹配：${base.serverVersion}`);
  if (base.timezone !== 'UTC') throw new Error(`PostgreSQL 时区不匹配：${base.timezone}`);
  if (slotValue) {
    const config = slotConfig(slotValue);
    const exists = psql('postgres', `SELECT 1 FROM pg_database WHERE datname = '${config.database}'`) === '1';
    const pgcrypto = exists
      ? psql(config.database, "SELECT extversion FROM pg_extension WHERE extname = 'pgcrypto'") || null
      : null;
    const migrations = exists
      ? Number(psql(config.database, 'SELECT COUNT(*) FROM "_prisma_migrations" WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL'))
      : 0;
    report.slot = {
      slotId: config.slot,
      database: config.database,
      exists,
      pgcrypto,
      appliedMigrations: migrations,
      migrationsAligned: exists && migrations === report.inventory.count,
    };
    if (!exists) report.status = 'database_missing';
    else if (!pgcrypto || migrations !== report.inventory.count) report.status = 'not_ready';
  }
  console.log(JSON.stringify(report, null, 2));
  return report;
}

try {
  if (command === 'start') {
    startPostgres();
    console.log(JSON.stringify({ status: 'ready', container: POSTGRES_CONTAINER, port: 55432 }, null, 2));
  } else if (command === 'stop') {
    stopPostgres();
    console.log(JSON.stringify({ status: 'stopped', preservedVolume: 'ami_local_postgres17_data' }, null, 2));
  } else if (command === 'doctor') {
    doctor(args.value('slot'));
  } else if (command === 'migrate') {
    migrate(args.value('slot'));
  } else if (command === 'seed') {
    seed(args.value('slot'));
  } else {
    throw new Error(`未知数据库命令：${command}`);
  }
} catch (error) {
  console.error(redact(error instanceof Error ? error.message : String(error)));
  process.exitCode = 1;
}
