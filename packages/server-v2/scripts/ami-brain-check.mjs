#!/usr/bin/env node
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  checksum,
  createIdentity,
  createImpactPlan,
  isReusableReceipt,
  parseArgs,
  stableStringify,
} from './ami-brain-check-core.mjs';

const serverRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = resolve(serverRoot, '../..');
const outputRoot = resolve(repoRoot, 'outputs/ami-brain-gates');
const receiptRoot = join(outputRoot, 'receipts');

main();

function main() {
  let options;
  try {
    options = parseArgs(process.argv.slice(2));
  } catch (error) {
    fail(error instanceof Error ? error.message : String(error));
  }
  if (options.help) {
    process.stdout.write('Usage: npm run brain:check -- --stage=dev|candidate|release|observe [--dry-run] [--force] [--json] [--scope=file1,file2]\n');
    return;
  }

  const manifest = JSON.parse(readFileSync(join(serverRoot, 'scripts/ami-brain-check-impact-map.json'), 'utf8'));
  const statusFiles = gitLines(['status', '--porcelain=v1', '--untracked-files=all']).map(parseStatusPath);
  const files = [...new Set([...statusFiles, ...(options.scope ?? [])])].filter(Boolean).sort();
  if (options.stage === 'release' && statusFiles.length > 0) fail('release_stage_requires_clean_worktree');

  const plan = createImpactPlan({ files, stage: options.stage, manifest });
  const source = createSourceIdentity(plan.files);
  const identity = createIdentity({
    plan,
    source,
    environment: {
      releaseFingerprint: process.env.BRAIN_RELEASE_FINGERPRINT,
      dataSnapshot: process.env.BRAIN_DATA_SNAPSHOT,
      provider: process.env.LLM_PROVIDER,
      model: process.env.LLM_MODEL,
      timeout: process.env.LLM_TIMEOUT_MS ? Number(process.env.LLM_TIMEOUT_MS) : null,
    },
  });
  const reusable = options.force ? null : findReusableReceipt(identity);
  const summary = { plan, identity, reusableReceiptId: reusable?.receiptId ?? null, dryRun: options.dryRun };

  if (options.dryRun || reusable) {
    printSummary(summary, options.json);
    return;
  }

  const startedAt = new Date();
  const results = [];
  let status = 'passed';
  for (const gate of plan.gates) {
    const result = runGate(gate);
    results.push(result);
    if (result.status !== 'passed') {
      status = 'failed';
      break;
    }
  }
  const createdAt = new Date();
  const receiptId = `${createdAt.toISOString().replace(/[:.]/g, '-')}-${identity.identityChecksum.slice(0, 12)}`;
  const receipt = {
    schemaVersion: 1,
    receiptId,
    ...identity,
    status,
    plan,
    results,
    resultChecksum: checksum(results),
    startedAt: startedAt.toISOString(),
    createdAt: createdAt.toISOString(),
    expiresAt: new Date(createdAt.getTime() + ttlMs(options.stage)).toISOString(),
  };
  mkdirSync(receiptRoot, { recursive: true });
  writeFileSync(join(receiptRoot, `${receiptId}.json`), `${JSON.stringify(receipt, null, 2)}\n`);
  writeLatestSummary(receipt);
  printSummary({ receipt }, options.json);
  if (status !== 'passed') process.exitCode = 1;
}

function createSourceIdentity(files) {
  const head = gitText(['rev-parse', 'HEAD']);
  const parts = [`HEAD ${head}`];
  for (const file of files) {
    const absolute = resolve(repoRoot, file);
    const tracked = gitExitCode(['ls-files', '--error-unmatch', '--', file]) === 0;
    if (tracked) parts.push(gitText(['diff', '--binary', 'HEAD', '--', file]));
    else if (existsSync(absolute) && statSync(absolute).isFile()) parts.push(`${file}\n${readFileSync(absolute)}`);
  }
  const diffChecksum = checksum(parts.join('\n'));
  return { head, diffChecksum, sourceFingerprint: checksum({ head, diffChecksum }) };
}

function runGate(gate) {
  const startedAt = new Date();
  process.stdout.write(`\n[brain:check] ${gate.description}\n`);
  const result = spawnSync(gate.command[0], gate.command.slice(1), {
    cwd: resolve(repoRoot, gate.cwd),
    stdio: 'inherit',
    env: process.env,
  });
  const finishedAt = new Date();
  return {
    gateId: gate.id,
    description: gate.description,
    command: gate.command,
    status: result.status === 0 ? 'passed' : 'failed',
    exitCode: result.status ?? 1,
    startedAt: startedAt.toISOString(),
    finishedAt: finishedAt.toISOString(),
  };
}

function findReusableReceipt(identity) {
  if (!existsSync(receiptRoot)) return null;
  return readdirSync(receiptRoot)
    .filter((name) => name.endsWith('.json'))
    .sort()
    .reverse()
    .map((name) => {
      try {
        return JSON.parse(readFileSync(join(receiptRoot, name), 'utf8'));
      } catch {
        return null;
      }
    })
    .find((receipt) => isReusableReceipt(receipt, identity)) ?? null;
}

function writeLatestSummary(receipt) {
  mkdirSync(outputRoot, { recursive: true });
  const lines = [
    '# Ami Brain 门禁最新摘要',
    '',
    `- Receipt：${receipt.receiptId}`,
    `- 阶段：${receipt.stage}`,
    `- 风险：${receipt.riskLevel}`,
    `- 结果：${receipt.status}`,
    `- 创建时间：${receipt.createdAt}`,
    `- 失效时间：${receipt.expiresAt}`,
    `- 受影响文件：${receipt.plan.files.length}`,
    `- 执行门禁：${receipt.plan.gates.map((gate) => gate.id).join(', ') || '无'}`,
    '',
  ];
  writeFileSync(join(outputRoot, 'latest-summary.md'), `${lines.join('\n')}\n`);
}

function printSummary(value, json) {
  if (json) {
    process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
    return;
  }
  const plan = value.plan ?? value.receipt?.plan;
  const identity = value.identity ?? value.receipt;
  process.stdout.write('\nAmi Brain 门禁计划\n');
  process.stdout.write(`阶段: ${plan.stage}\n风险: ${plan.riskLevel}\n`);
  process.stdout.write(`受影响文件: ${plan.files.length}\n忽略文件: ${plan.ignoredFiles.length}\n`);
  process.stdout.write(`门禁: ${plan.gates.map((gate) => gate.id).join(', ') || '无'}\n`);
  process.stdout.write(`身份: ${identity.identityChecksum}\n`);
  if (value.reusableReceiptId) process.stdout.write(`复用 receipt: ${value.reusableReceiptId}\n`);
  if (value.receipt) process.stdout.write(`结果: ${value.receipt.status}\nreceipt: ${value.receipt.receiptId}\n`);
}

function parseStatusPath(line) {
  const value = line.slice(3).trim();
  const renamed = value.includes(' -> ') ? value.split(' -> ').at(-1) : value;
  return renamed?.replace(/^"|"$/g, '') ?? '';
}

function gitLines(args) {
  const output = execFileSync('git', args, {
    cwd: repoRoot,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trimEnd();
  return output ? output.split(/\r?\n/).filter(Boolean) : [];
}

function gitText(args) {
  return execFileSync('git', args, { cwd: repoRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

function gitExitCode(args) {
  return spawnSync('git', args, { cwd: repoRoot, stdio: 'ignore' }).status ?? 1;
}

function ttlMs(stage) {
  if (stage === 'release') return 7 * 24 * 60 * 60 * 1000;
  if (stage === 'candidate') return 48 * 60 * 60 * 1000;
  return 24 * 60 * 60 * 1000;
}

function fail(message) {
  process.stderr.write(`ami-brain-check: ${message}\n`);
  process.exit(1);
}
