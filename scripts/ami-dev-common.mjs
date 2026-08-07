import { execFileSync } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import {
  chmodSync,
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, resolve } from 'node:path';

export const REPO_ROOT = resolve(import.meta.dirname, '..');
export const SERVER_ROOT = join(REPO_ROOT, 'packages', 'server-v2');
export const COMPOSE_FILE = join(REPO_ROOT, 'infra', 'dev', 'postgres17.compose.yml');
export const POSTGRES_CONTAINER = 'ami-local-postgres17';

export function gitOutput(args, cwd = REPO_ROOT) {
  return execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
}

export function runtimePaths() {
  const commonDirValue = gitOutput(['rev-parse', '--git-common-dir']);
  const commonDir = resolve(REPO_ROOT, commonDirValue);
  const root = join(commonDir, 'ami-dev-v2');
  return {
    commonDir,
    root,
    postgresEnv: join(root, 'postgres.env'),
    slotsDir: join(root, 'slots'),
    logsDir: join(root, 'logs'),
    reportsDir: join(root, 'reports'),
    supabaseLease: join(root, 'supabase-write-lease.json'),
  };
}

export function ensureRuntimeLayout() {
  const paths = runtimePaths();
  for (const path of [paths.root, paths.slotsDir, paths.logsDir, paths.reportsDir]) {
    mkdirSync(path, { recursive: true, mode: 0o700 });
    chmodSync(path, 0o700);
  }
  return paths;
}

export function parseArgs(argv = process.argv.slice(2)) {
  const values = new Map();
  const flags = new Set();
  const positional = [];
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (!value.startsWith('--')) {
      positional.push(value);
      continue;
    }
    const equalsIndex = value.indexOf('=');
    if (equalsIndex > 2) {
      values.set(value.slice(2, equalsIndex), value.slice(equalsIndex + 1));
      continue;
    }
    const name = value.slice(2);
    const next = argv[index + 1];
    if (next && !next.startsWith('--')) {
      values.set(name, next);
      index += 1;
    } else {
      flags.add(name);
    }
  }
  return {
    positional,
    flag: (name) => flags.has(name),
    value: (name, fallback) => values.get(name) ?? fallback,
  };
}

export function parseEnvFile(path) {
  if (!existsSync(path)) return {};
  const output = {};
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/u)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const index = trimmed.indexOf('=');
    if (index <= 0) continue;
    output[trimmed.slice(0, index)] = trimmed.slice(index + 1);
  }
  return output;
}

export function writePrivateFile(path, content, { exclusive = false } = {}) {
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  if (exclusive) {
    const handle = openSync(path, 'wx', 0o600);
    try {
      writeFileSync(handle, content, 'utf8');
    } finally {
      closeSync(handle);
    }
  } else {
    const temporary = `${path}.${process.pid}.tmp`;
    writeFileSync(temporary, content, { encoding: 'utf8', mode: 0o600 });
    chmodSync(temporary, 0o600);
    renameSync(temporary, path);
  }
  chmodSync(path, 0o600);
}

export function ensurePostgresSecrets() {
  const paths = ensureRuntimeLayout();
  if (!existsSync(paths.postgresEnv)) {
    const password = randomBytes(24).toString('base64url');
    const fixturePassword = randomBytes(15).toString('base64url');
    writePrivateFile(
      paths.postgresEnv,
      [
        'AMI_LOCAL_POSTGRES_USER=ami_local',
        `AMI_LOCAL_POSTGRES_PASSWORD=${password}`,
        'AMI_LOCAL_POSTGRES_PORT=55432',
        `AMI_LOCAL_FIXTURE_PASSWORD=${fixturePassword}`,
        '',
      ].join('\n'),
      { exclusive: true },
    );
  }
  let env = parseEnvFile(paths.postgresEnv);
  if (!env.AMI_LOCAL_JWT_SECRET || !env.AMI_LOCAL_JWT_REFRESH_SECRET) {
    env = {
      ...env,
      AMI_LOCAL_JWT_SECRET: env.AMI_LOCAL_JWT_SECRET || randomBytes(32).toString('base64url'),
      AMI_LOCAL_JWT_REFRESH_SECRET: env.AMI_LOCAL_JWT_REFRESH_SECRET || randomBytes(32).toString('base64url'),
    };
    writePrivateFile(
      paths.postgresEnv,
      [
        `AMI_LOCAL_POSTGRES_USER=${env.AMI_LOCAL_POSTGRES_USER}`,
        `AMI_LOCAL_POSTGRES_PASSWORD=${env.AMI_LOCAL_POSTGRES_PASSWORD}`,
        `AMI_LOCAL_POSTGRES_PORT=${env.AMI_LOCAL_POSTGRES_PORT || '55432'}`,
        `AMI_LOCAL_FIXTURE_PASSWORD=${env.AMI_LOCAL_FIXTURE_PASSWORD}`,
        `AMI_LOCAL_JWT_SECRET=${env.AMI_LOCAL_JWT_SECRET}`,
        `AMI_LOCAL_JWT_REFRESH_SECRET=${env.AMI_LOCAL_JWT_REFRESH_SECRET}`,
        '',
      ].join('\n'),
    );
  }
  if (!env.AMI_LOCAL_POSTGRES_USER || !env.AMI_LOCAL_POSTGRES_PASSWORD || !env.AMI_LOCAL_FIXTURE_PASSWORD) {
    throw new Error(`本地 PostgreSQL 凭据文件不完整：${paths.postgresEnv}`);
  }
  return { paths, env };
}

export function normalizeSlot(value) {
  const slot = String(value ?? '').trim().toLowerCase();
  if (!/^s(?:0[1-9]|[1-9][0-9])$/u.test(slot)) throw new Error(`无效 slot：${value ?? '(empty)'}`);
  return slot;
}

export function slotNumber(slot) {
  return Number(normalizeSlot(slot).slice(1));
}

export function slotConfig(slotValue) {
  const slot = normalizeSlot(slotValue);
  const number = slotNumber(slot);
  const paths = ensureRuntimeLayout();
  const slotDir = join(paths.slotsDir, slot);
  return {
    slot,
    number,
    slotDir,
    leasePath: join(slotDir, 'lease.json'),
    runtimeEnvPath: join(slotDir, 'runtime.env'),
    processesPath: join(slotDir, 'processes.json'),
    receiptPath: join(slotDir, 'artifact-shadow-receipt.json'),
    apiPort: 8200 + number,
    adminPort: 5200 + number,
    kioskPort: 5300 + number,
    database: `ami_dev_${slot}`,
    redisKeyPrefix: `ami:${slot}:`,
    logDir: join(paths.logsDir, slot),
  };
}

export function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

export function writeJson(path, value, options) {
  writePrivateFile(path, `${JSON.stringify(value, null, 2)}\n`, options);
}

export function currentGitIdentity() {
  const commit = gitOutput(['rev-parse', 'HEAD']);
  const branch = gitOutput(['branch', '--show-current']) || null;
  const worktree = gitOutput(['rev-parse', '--show-toplevel']);
  const diff = execFileSync('git', ['diff', '--binary', 'HEAD'], { cwd: REPO_ROOT });
  const untracked = execFileSync('git', ['ls-files', '-z', '--others', '--exclude-standard'], { cwd: REPO_ROOT })
    .toString('utf8')
    .split('\0')
    .filter(Boolean)
    .sort();
  const hash = createHash('sha256').update(diff);
  for (const path of untracked) {
    hash.update(`\0${path}\0`);
    hash.update(readFileSync(join(REPO_ROOT, path)));
  }
  return { commit, branch, worktree, diffChecksum: hash.digest('hex'), untrackedCount: untracked.length };
}

export function slotDatabaseUrl(slot, postgresEnv) {
  const config = slotConfig(slot);
  const user = encodeURIComponent(postgresEnv.AMI_LOCAL_POSTGRES_USER);
  const password = encodeURIComponent(postgresEnv.AMI_LOCAL_POSTGRES_PASSWORD);
  const port = postgresEnv.AMI_LOCAL_POSTGRES_PORT || '55432';
  return `postgresql://${user}:${password}@127.0.0.1:${port}/${config.database}?schema=public`;
}

export function writeSlotRuntime(config, postgresEnv, mode = 'local-fast') {
  mkdirSync(config.slotDir, { recursive: true, mode: 0o700 });
  mkdirSync(config.logDir, { recursive: true, mode: 0o700 });
  const databaseUrl = slotDatabaseUrl(config.slot, postgresEnv);
  const lines = [
    `AMI_DEV_SLOT=${config.slot}`,
    `AMI_WORKTREE=${REPO_ROOT}`,
    'AMI_DATABASE_MODE=local',
    'AMI_DATABASE_GUARD=required',
    `AMI_RUNTIME_MODE=${mode}`,
    'AMI_DATA_ENV=local-synthetic',
    `DATABASE_URL=${databaseUrl}`,
    `PORT=${config.apiPort}`,
    `REDIS_KEY_PREFIX=${config.redisKeyPrefix}`,
    `VITE_API_PROXY_TARGET=http://127.0.0.1:${config.apiPort}`,
    `VITE_ADMIN_DEV_PORT=${config.adminPort}`,
    `VITE_KIOSK_DEV_PORT=${config.kioskPort}`,
    `VITE_AMI_DEV_SLOT=${config.slot}`,
    `VITE_AMI_RUNTIME_MODE=${mode}`,
    'VITE_AMI_DATA_ENV=local-synthetic',
    `CORS_ORIGINS=http://127.0.0.1:${config.adminPort},http://localhost:${config.adminPort},http://127.0.0.1:${config.kioskPort},http://localhost:${config.kioskPort}`,
    `AMI_LOCAL_FIXTURE_USERNAME=local_admin_${config.slot}`,
    `AMI_LOCAL_FIXTURE_PASSWORD=${postgresEnv.AMI_LOCAL_FIXTURE_PASSWORD}`,
    `JWT_SECRET=${postgresEnv.AMI_LOCAL_JWT_SECRET}`,
    `JWT_REFRESH_SECRET=${postgresEnv.AMI_LOCAL_JWT_REFRESH_SECRET}`,
    '',
  ];
  writePrivateFile(config.runtimeEnvPath, lines.join('\n'));
  return { ...parseEnvFile(config.runtimeEnvPath), runtimeEnvPath: config.runtimeEnvPath };
}

export function redact(value) {
  return String(value)
    .replace(/(postgres(?:ql)?:\/\/[^:]+:)[^@]+@/giu, '$1***@')
    .replace(/(PASSWORD=)[^\s]+/giu, '$1***');
}

export function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}
