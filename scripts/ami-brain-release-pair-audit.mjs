import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { SERVER_ROOT, ensureRuntimeLayout, parseArgs, parseEnvFile, redact } from './ami-dev-common.mjs';

const args = parseArgs();
const envPath = resolve(args.value('env-file', join(SERVER_ROOT, '.env')));
if (!existsSync(envPath)) throw new Error(`环境文件不存在：${envPath}`);
const env = parseEnvFile(envPath);
const databaseUrl = new URL(env.DATABASE_URL);
const host = databaseUrl.hostname.toLowerCase();
const approved = String(args.value('approved-host', '')).trim().toLowerCase();
if (!approved || approved !== host) throw new Error(`必须通过 --approved-host=${host} 明确批准只读审计目标。`);
if (!host.endsWith('.supabase.co') && !host.endsWith('.pooler.supabase.com')) throw new Error(`目标不是 Supabase Host：${host}`);
const paths = ensureRuntimeLayout();
const output = resolve(args.value('output', join(paths.reportsDir, `brain-release-416-452-audit-${Date.now()}.json`)));
const result = spawnSync('node', [
  '--loader', 'ts-node/esm', '--experimental-specifier-resolution=node', 'prisma/brain-release-pair-audit.ts',
], {
  cwd: SERVER_ROOT,
  env: {
    ...process.env,
    ...env,
    TS_NODE_TRANSPILE_ONLY: 'true',
    AMI_DATABASE_MODE: 'shared',
    AMI_DATABASE_GUARD: 'required',
    AMI_APPROVED_SUPABASE_HOSTS: host,
    AMI_AUDIT_OUTPUT: output,
  },
  encoding: 'utf8',
  timeout: 300_000,
});
if (result.stdout) process.stdout.write(result.stdout);
if (result.stderr) process.stderr.write(redact(result.stderr));
if (result.error || result.status !== 0) process.exitCode = result.status ?? 1;
