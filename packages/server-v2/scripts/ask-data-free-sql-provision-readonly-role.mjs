import { spawnSync } from 'node:child_process';
import {
  chmodSync,
  existsSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { basename, join, resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { config as loadEnv } from 'dotenv';
import pg from 'pg';

const { Client } = pg;
const roleName = 'ask_data_free_sql_readonly';
const packageRoot = resolve(import.meta.dirname, '..');
const envPath = join(packageRoot, '.env');
const passwordEnvKey = 'ASK_DATA_FREE_SQL_READONLY_PASSWORD';
const readonlyUrlEnvKey = 'ASK_DATA_FREE_SQL_READONLY_DATABASE_URL';

if (isMainModule()) {
  try {
    await main();
  } catch (error) {
    printSafeFailure(error);
  }
}

async function main() {
  loadEnv({ path: envPath, quiet: true });
  const runLiveEval = process.argv.includes('--run-live-eval');
  const writeEnv = process.argv.includes('--write-env');

  if (!process.argv.includes('--apply') || !process.argv.includes('--yes')) {
    throw new Error('Provisioning requires both --apply and --yes.');
  }
  if (writeEnv && !runLiveEval) {
    throw new Error('--write-env requires --run-live-eval so credentials are persisted only after the full strict gate passes.');
  }

  const adminConnectionString = process.env.DATABASE_URL?.trim();
  if (!adminConnectionString) throw new Error('DATABASE_URL is required.');
  const adminUrl = new URL(adminConnectionString);
  if (!isApprovedSupabaseHost(adminUrl.hostname)) {
    throw new Error(`Refusing unapproved database host: ${adminUrl.hostname}`);
  }

  const password = await resolveReadonlyPassword({
    explicitPassword: process.env[passwordEnvKey],
    existingReadonlyConnectionString: process.env[readonlyUrlEnvKey],
    adminUrl,
  });
  validatePassword(password);

  const templatePath = join(packageRoot, 'prisma', 'ask-data-free-sql-readonly-grants.template.sql');
  const template = readFileSync(templatePath, 'utf8');
  if ((template.match(/<SET_LOCALLY>/g) ?? []).length !== 2) {
    throw new Error('Read-only role template must contain exactly two local password placeholders.');
  }
  const sql = template.replaceAll("'<SET_LOCALLY>'", quoteLiteral(password));
  const admin = new Client({
    connectionString: adminConnectionString,
    statement_timeout: 15000,
    query_timeout: 15000,
    application_name: 'ask_data_free_sql_role_provision',
  });

  await admin.connect();
  try {
    await admin.query('BEGIN');
    await admin.query(sql);
    await admin.query('COMMIT');
  } catch (error) {
    await admin.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    await admin.end().catch(() => undefined);
  }

  const readonlyUrl = deriveReadonlyUrl(adminConnectionString, password);
  const childEnv = buildChildEnv(process.env, readonlyUrl.toString());
  runStrictScript({
    scriptPath: 'prisma/ask-data-free-sql-readiness.ts',
    args: ['--strict'],
    timeout: 60000,
    env: childEnv,
    errorMessage: 'Read-only role was provisioned but strict readiness failed.',
  });

  let liveEvalStatus = 'not_requested';
  if (runLiveEval) {
    runStrictScript({
      scriptPath: 'prisma/ask-data-free-sql-live-eval.ts',
      args: ['--strict', '--concurrency=2'],
      timeout: 600000,
      env: childEnv,
      errorMessage: 'Strict live evaluation failed after role provisioning.',
    });
    liveEvalStatus = 'pass';
  }

  let environmentUpdated = false;
  if (writeEnv) {
    writeManagedEnvFile(envPath, readonlyUrl.toString());
    environmentUpdated = true;
  }

  console.log(
    JSON.stringify(
      {
        status: 'pass',
        databaseHost: adminUrl.hostname,
        roleName,
        readonlyUser: decodeURIComponent(readonlyUrl.username),
        strictReadiness: 'pass',
        liveEval: liveEvalStatus,
        environmentUpdated,
        enabled: environmentUpdated ? true : undefined,
        dryRunOnly: environmentUpdated ? false : undefined,
        nextStep: environmentUpdated
          ? 'Restart server-v2, then complete the authenticated permission matrix and rollback acceptance.'
          : 'Persist the read-only URL locally, or rerun with --run-live-eval --write-env after the strict gate passes.',
      },
      null,
      2,
    ),
  );
}

function runStrictScript({ scriptPath, args, timeout, env, errorMessage }) {
  const result = spawnSync(
    process.execPath,
    ['--loader', 'ts-node/esm', '--experimental-specifier-resolution=node', scriptPath, ...args],
    {
      cwd: packageRoot,
      env,
      encoding: 'utf8',
      shell: false,
      timeout,
    },
  );
  if (result.error || result.status !== 0) {
    throw new Error(
      [errorMessage, result.error?.message, result.stdout?.trim(), result.stderr?.trim()]
        .filter(Boolean)
        .join('\n'),
    );
  }
}

async function resolveReadonlyPassword({ explicitPassword, existingReadonlyConnectionString, adminUrl }) {
  if (explicitPassword) return explicitPassword;

  const existingPassword = passwordFromExistingReadonlyUrl(existingReadonlyConnectionString, adminUrl);
  if (existingPassword) return existingPassword;

  if (!process.stdin.isTTY || !process.stdout.isTTY || typeof process.stdin.setRawMode !== 'function') {
    throw new Error(
      `Set ${passwordEnvKey} locally to at least 24 characters, or run this command in an interactive terminal.`,
    );
  }
  return readHiddenLine('请输入智能问数专用只读账号密码（至少 24 位，不会回显）：');
}

function passwordFromExistingReadonlyUrl(connectionString, adminUrl) {
  if (!connectionString?.trim()) return undefined;
  let readonlyUrl;
  try {
    readonlyUrl = new URL(connectionString.trim());
  } catch {
    throw new Error(`${readonlyUrlEnvKey} is not a valid URL.`);
  }
  const currentUser = decodeURIComponent(readonlyUrl.username);
  if (currentUser !== expectedReadonlyUsername(adminUrl)) {
    throw new Error(`${readonlyUrlEnvKey} must use the dedicated ${roleName} identity.`);
  }
  if (readonlyUrl.hostname !== adminUrl.hostname) {
    throw new Error(`${readonlyUrlEnvKey} must use the same approved database host as DATABASE_URL.`);
  }
  return decodeURIComponent(readonlyUrl.password);
}

function readHiddenLine(prompt) {
  return new Promise((resolvePromise, rejectPromise) => {
    const input = process.stdin;
    const output = process.stdout;
    const previousRawMode = Boolean(input.isRaw);
    let value = '';

    const cleanup = () => {
      input.off('data', onData);
      input.setRawMode(previousRawMode);
      input.pause();
    };
    const fail = (error) => {
      cleanup();
      output.write('\n');
      rejectPromise(error);
    };
    const finish = () => {
      cleanup();
      output.write('\n');
      resolvePromise(value);
    };
    const onData = (chunk) => {
      for (const character of String(chunk)) {
        if (character === '\u0003') {
          fail(new Error('Password input cancelled.'));
          return;
        }
        if (character === '\r' || character === '\n') {
          finish();
          return;
        }
        if (character === '\u007f' || character === '\b') {
          value = value.slice(0, -1);
          continue;
        }
        if (character >= ' ' && character !== '\u007f') value += character;
      }
    };

    output.write(prompt);
    input.setEncoding('utf8');
    input.setRawMode(true);
    input.resume();
    input.on('data', onData);
  });
}

function validatePassword(password) {
  if (!password || password.length < 24 || password.includes('<SET_LOCALLY>')) {
    throw new Error(`${passwordEnvKey} must contain at least 24 characters.`);
  }
  if (password !== password.trim()) {
    throw new Error(`${passwordEnvKey} must not start or end with whitespace.`);
  }
}

function expectedReadonlyUsername(adminUrl) {
  const adminUser = decodeURIComponent(adminUrl.username);
  const poolerSuffix = adminUser.includes('.') ? adminUser.slice(adminUser.indexOf('.')) : '';
  return `${roleName}${poolerSuffix}`;
}

export function deriveReadonlyUrl(adminConnectionString, password) {
  const readonlyUrl = new URL(adminConnectionString);
  readonlyUrl.username = expectedReadonlyUsername(readonlyUrl);
  readonlyUrl.password = password;
  return readonlyUrl;
}

export function buildChildEnv(sourceEnv, readonlyConnectionString) {
  const childEnv = { ...sourceEnv, [readonlyUrlEnvKey]: readonlyConnectionString };
  delete childEnv[passwordEnvKey];
  return childEnv;
}

export function buildManagedEnvText(existingText, readonlyConnectionString) {
  const forcedValues = new Map([
    [readonlyUrlEnvKey, readonlyConnectionString],
    ['ASK_DATA_FREE_SQL_ENABLED', 'true'],
    ['ASK_DATA_FREE_SQL_DRY_RUN_ONLY', 'false'],
  ]);
  const defaultValues = new Map([
    ['ASK_DATA_FREE_SQL_MAX_LIMIT', '100'],
    ['ASK_DATA_FREE_SQL_MAX_VIEWS', '2'],
    ['ASK_DATA_FREE_SQL_TIMEOUT_MS', '5000'],
    ['ASK_DATA_FREE_SQL_MAX_RANGE_DAYS', '730'],
    ['ASK_DATA_FREE_SQL_MAX_ESTIMATED_COST', '100'],
  ]);
  const managedKeys = new Set([...forcedValues.keys(), ...defaultValues.keys(), passwordEnvKey]);
  const seen = new Set();
  const outputLines = [];

  for (const line of existingText.split(/\r?\n/)) {
    const match = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=/.exec(line);
    const key = match?.[1];
    if (!key || !managedKeys.has(key)) {
      outputLines.push(line);
      continue;
    }
    if (key === passwordEnvKey || seen.has(key)) continue;
    seen.add(key);
    if (forcedValues.has(key)) outputLines.push(`${key}=${forcedValues.get(key)}`);
    else outputLines.push(line);
  }

  for (const [key, value] of forcedValues) {
    if (!seen.has(key)) outputLines.push(`${key}=${value}`);
  }
  for (const [key, value] of defaultValues) {
    if (!seen.has(key)) outputLines.push(`${key}=${value}`);
  }

  while (outputLines.at(-1) === '') outputLines.pop();
  return `${outputLines.join('\n')}\n`;
}

export function writeManagedEnvFile(targetEnvPath, readonlyConnectionString) {
  const existingText = existsSync(targetEnvPath) ? readFileSync(targetEnvPath, 'utf8') : '';
  const updatedText = buildManagedEnvText(existingText, readonlyConnectionString);
  const tempPath = join(
    resolve(targetEnvPath, '..'),
    `.${basename(targetEnvPath)}.${process.pid}.${Date.now()}.tmp`,
  );
  try {
    writeFileSync(tempPath, updatedText, { encoding: 'utf8', flag: 'wx', mode: 0o600 });
    chmodSync(tempPath, 0o600);
    renameSync(tempPath, targetEnvPath);
  } finally {
    if (existsSync(tempPath)) rmSync(tempPath);
  }
  if ((statSync(targetEnvPath).mode & 0o777) !== 0o600) chmodSync(targetEnvPath, 0o600);
}

function quoteLiteral(value) {
  return `'${value.replaceAll("'", "''")}'`;
}

function isApprovedSupabaseHost(hostname) {
  const normalized = hostname.toLowerCase();
  return normalized.endsWith('.supabase.com') || normalized.endsWith('.supabase.co');
}

function printSafeFailure(error) {
  const code =
    typeof error === 'object' && error && 'code' in error
      ? String(error.code ?? '')
      : undefined;
  console.error(
    JSON.stringify(
      {
        status: 'fail',
        code: code || undefined,
        reason: safeErrorMessage(error),
        ...(code === '42501'
          ? {
              hint:
                'The database identity cannot change a restricted role attribute. The script does not print SQL details; verify the role with role-preflight:strict.',
            }
          : {}),
      },
      null,
      2,
    ),
  );
  process.exitCode = 1;
}

export function safeErrorMessage(error) {
  const message = error instanceof Error ? error.message : String(error ?? 'unknown_error');
  return message
    .replace(/PASSWORD\s+'(?:''|[^'])*'/gi, "PASSWORD '<redacted>'")
    .replace(/ASK_DATA_FREE_SQL_READONLY_PASSWORD\s*=\s*[^\s]+/gi, 'ASK_DATA_FREE_SQL_READONLY_PASSWORD=<redacted>')
    .replace(/postgres(?:ql)?:\/\/[^\s]+/gi, 'postgresql://<redacted>')
    .slice(0, 1000);
}

function isMainModule() {
  return Boolean(process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url));
}
