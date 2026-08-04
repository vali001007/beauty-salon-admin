import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import {
  REPO_ROOT,
  SERVER_ROOT,
  currentGitIdentity,
  parseArgs,
  parseEnvFile,
  slotConfig,
} from './ami-dev-common.mjs';

const args = parseArgs();
const config = slotConfig(args.value('slot'));
if (!existsSync(config.runtimeEnvPath)) throw new Error(`slot ${config.slot} runtime env 不存在。`);
mkdirSync(config.logDir, { recursive: true, mode: 0o700 });
const runtime = parseEnvFile(config.runtimeEnvPath);
const git = currentGitIdentity();
const migrations = spawnSync('find', ['prisma/migrations', '-mindepth', '1', '-maxdepth', '1', '-type', 'd'], {
  cwd: SERVER_ROOT,
  encoding: 'utf8',
}).stdout.trim().split('\n').filter(Boolean).length;
const output = join(config.logDir, `brain-warmup-shadow-${Date.now()}.json`);
const childArgs = [
  '--loader', 'ts-node/esm', '--experimental-specifier-resolution=node',
  'prisma/brain-warmup-shadow.ts',
  `--output=${output}`,
  `--receipt=${config.receiptPath}`,
];
for (const name of ['manifest', 'shared-base-url', 'artifact-base-url']) {
  const value = args.value(name);
  if (value) childArgs.push(`--${name}=${value}`);
}
if (args.flag('require-full')) childArgs.push('--require-full');
const result = spawnSync('node', childArgs, {
  cwd: SERVER_ROOT,
  env: {
    ...process.env,
    ...runtime,
    TS_NODE_TRANSPILE_ONLY: 'true',
    GIT_COMMIT_SHA: git.commit,
    AMI_DIFF_CHECKSUM: git.diffChecksum,
    AMI_MIGRATION_INVENTORY: String(migrations),
  },
  encoding: 'utf8',
  timeout: 1_800_000,
});
if (result.stdout) process.stdout.write(result.stdout);
if (result.stderr) process.stderr.write(result.stderr);
if (result.error || result.status !== 0) process.exitCode = result.status ?? 1;
