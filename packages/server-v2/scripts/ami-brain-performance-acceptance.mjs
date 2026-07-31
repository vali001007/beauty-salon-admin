import 'dotenv/config';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import {
  buildPerformanceAcceptance,
  buildPerformancePreflight,
  sha256,
  validatePerformanceManifest,
} from './ami-brain-performance-suite-core.mjs';
import { buildCandidatePreflight } from './ami-brain-release-acceptance-core.mjs';
import { assertProductLoopRegistry } from './ami-brain-product-loop-registry.mjs';
import {
  AMI_BRAIN_CROSS_CLIENT_IDENTITY_CHECKSUM,
  runAmiBrainCrossClientContract,
} from '../../../scripts/check-ami-brain-cross-client-contract.mjs';
import {
  AMI_BRAIN_ACTION_RELEASE_CONTRACT_IDENTITY_CHECKSUM,
  inspectAmiBrainActionReleaseContract,
} from './ami-brain-action-release-contract.mjs';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const SERVER_ROOT = resolve(SCRIPT_DIR, '..');
const REPO_ROOT = resolve(SERVER_ROOT, '..', '..');
const DEFAULT_MANIFEST = resolve(REPO_ROOT, 'docs/04-测试数据/Ami-Brain-性能回归/ami-brain-performance-suite-v1.json');
const OUTPUT_ROOT = resolve(REPO_ROOT, 'outputs/ami-brain-performance-acceptance');
const EVAL_OUTPUT_ROOT = resolve(REPO_ROOT, 'docs/04-测试数据/Ami-Brain-分层验收');

const options = parseOptions(process.argv.slice(2));
const manifestRaw = readFileSync(options.manifestPath, 'utf8');
const manifest = JSON.parse(manifestRaw);
const classificationRaw = readFileSync(resolve(REPO_ROOT, manifest.source.classificationPath), 'utf8');
const suiteManifestRaw = readFileSync(resolve(REPO_ROOT, manifest.source.suiteManifestPath), 'utf8');
const productLoopRaw = readFileSync(resolve(REPO_ROOT, manifest.source.productLoopEligibilityPath), 'utf8');
assertProductLoopRegistry(REPO_ROOT);
validatePerformanceManifest(manifest, { classificationRaw, suiteManifestRaw, productLoopRaw });
const executionSuiteManifestRaw = readFileSync(options.suiteManifestPath, 'utf8');
if (sha256(executionSuiteManifestRaw) !== manifest.source.suiteManifestChecksum) {
  throw new Error('performance execution suite manifest does not match performance manifest source');
}

const commands = Object.entries(manifest.buckets).map(([bucketKey, bucket]) => ({
  bucketKey,
  runKey: `${options.runKey}-${bucketKey}`,
  args: buildEvalArgs(options, `${options.runKey}-${bucketKey}`, bucket.caseIds),
}));
const identity = {
  schemaVersion: 'ami-brain-performance-run-identity/v1',
  diagnosticOnly: options.diagnosticOnly,
  runKey: options.runKey,
  releaseId: options.releaseId,
  standardRegressionRunId: options.standardRegressionRunId,
  runtimeCommit: options.runtimeCommit,
  productionHealthUrl: options.productionHealthUrl,
  storeId: options.storeId,
  performanceManifestPath: relative(options.manifestPath),
  performanceManifestVersion: manifest.manifestVersion,
  performanceManifestChecksum: sha256(manifestRaw),
  performanceCaseIdsChecksum: manifest.caseIdsChecksum,
  suiteManifestChecksum: manifest.source.suiteManifestChecksum,
};
const preflight = options.diagnosticOnly
  ? {
      schemaVersion: 'ami-brain-performance-preflight/v1',
      ready: true,
      diagnosticOnly: true,
      blockingReasons: [],
      note: 'Task 9 performance diagnosis is not attachable to product activation evidence.',
    }
  : await buildFormalPreflight(identity, options, manifest);
const acceptanceDir = resolve(OUTPUT_ROOT, options.runKey);
mkdirSync(acceptanceDir, { recursive: true });
writeJson(resolve(acceptanceDir, 'identity.json'), identity);
writeJson(resolve(acceptanceDir, 'preflight.json'), preflight);
if (options.dryRun) {
  const preview = {
    identity,
    preflight,
    ready: preflight.ready,
    blockingReasons: preflight.blockingReasons,
    commands,
  };
  writeJson(resolve(acceptanceDir, 'dry-run.json'), preview);
  console.log(JSON.stringify(preview, null, 2));
  process.exit(preflight.ready ? 0 : 2);
}

if (!preflight.ready) {
  console.error(
    JSON.stringify(
      {
        status: 'preflight_blocked',
        ready: false,
        blockingReasons: preflight.blockingReasons,
        output: relative(acceptanceDir),
      },
      null,
      2,
    ),
  );
  process.exit(2);
}

const summaries = {};
for (const command of commands) {
  const result = spawnSync('npm', ['run', 'brain:eval:full-domain', '--', ...command.args], {
    cwd: SERVER_ROOT,
    env: process.env,
    encoding: 'utf8',
    stdio: 'inherit',
  });
  const summaryPath = resolve(EVAL_OUTPUT_ROOT, command.runKey, 'targeted', 'summary.json');
  if (existsSync(summaryPath)) summaries[command.bucketKey] = JSON.parse(readFileSync(summaryPath, 'utf8'));
  if (result.status !== 0) break;
}
const evidence = {
  ...buildPerformanceAcceptance(manifest, summaries),
  executionPurpose: options.diagnosticOnly ? 'task9_performance_diagnostic_only' : 'product_activation_performance',
  eligibleForProductActivation: !options.diagnosticOnly,
  generatedAt: new Date().toISOString(),
  expiresAt: new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString(),
  runIdentity: identity,
};
writeJson(resolve(acceptanceDir, 'performance-evidence.json'), evidence);
writeFileSync(resolve(acceptanceDir, 'performance-report.md'), renderReport(evidence), 'utf8');
if (!options.diagnosticOnly) await attachPerformanceEvidence(options, evidence);
console.log(JSON.stringify(evidence, null, 2));
if (evidence.status !== 'ready') process.exitCode = 1;

function buildEvalArgs(input, runKey, caseIds) {
  return [
    '--stage=targeted',
    `--case-ids=${caseIds.join(',')}`,
    `--suite-manifest=${input.suiteManifestPath}`,
    `--expected-release-id=${input.releaseId}`,
    `--expected-runtime-commit=${input.runtimeCommit}`,
    `--production-health-url=${input.productionHealthUrl}`,
    `--store-id=${input.storeId}`,
    `--run-key=${runKey}`,
    `--run-label=Ami Brain performance ${runKey}`,
    ...(input.diagnosticOnly ? [`--evaluation-release-id=${input.releaseId}`] : ['--require-clean-candidate']),
    `--concurrency=${input.concurrency}`,
    `--checkpoint-every=${caseIds.length}`,
    `--max-cases-per-invocation=${caseIds.length}`,
  ];
}

async function buildFormalPreflight(identity, options, manifest) {
  const candidatePreflight = await inspectCandidatePreflight(identity);
  const parentInspection = await inspectStandardRegressionParent(options);
  return buildPerformancePreflight({
    candidatePreflight,
    parentRun: parentInspection.run,
    parentInspectionError: parentInspection.error,
    expected: {
      standardRegressionRunId: options.standardRegressionRunId,
      releaseId: options.releaseId,
      storeId: options.storeId,
      runtimeCommit: options.runtimeCommit,
      suiteManifestChecksum: manifest.source.suiteManifestChecksum,
    },
  });
}

async function inspectCandidatePreflight(identity) {
  const headResult = spawnSync('git', ['rev-parse', 'HEAD'], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const worktreeResult = spawnSync('git', ['status', '--porcelain=v1', '--untracked-files=all'], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const crossClientContract = runAmiBrainCrossClientContract({ repoRoot: REPO_ROOT });
  const headCommit = headResult.status === 0 ? headResult.stdout.trim() : null;
  const actionReleaseContract = await inspectActionReleaseContract({
    releaseId: identity.releaseId,
    headCommit,
  });
  const health = await fetchProductionHealth(identity.productionHealthUrl);
  return buildCandidatePreflight({
    expectedReleaseId: identity.releaseId,
    expectedRuntimeCommit: identity.runtimeCommit,
    productionHealthUrl: identity.productionHealthUrl,
    headCommit,
    dirtyFileCount:
      worktreeResult.status === 0
        ? worktreeResult.stdout.split(/\r?\n/u).filter((line) => line.trim().length > 0).length
        : null,
    health,
    crossClientContract,
    expectedCrossClientContractIdentityChecksum: AMI_BRAIN_CROSS_CLIENT_IDENTITY_CHECKSUM,
    actionReleaseContract,
    expectedActionReleaseContractIdentityChecksum: AMI_BRAIN_ACTION_RELEASE_CONTRACT_IDENTITY_CHECKSUM,
  });
}

async function inspectActionReleaseContract({ releaseId, headCommit }) {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    return inspectAmiBrainActionReleaseContract({
      prisma: unavailablePrisma('DATABASE_URL_missing'),
      releaseId,
      repoRoot: REPO_ROOT,
      headCommit,
    });
  }
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: databaseUrl, max: 1, connectionTimeoutMillis: 10_000 }),
  });
  try {
    return await inspectAmiBrainActionReleaseContract({
      prisma,
      releaseId,
      repoRoot: REPO_ROOT,
      headCommit,
    });
  } finally {
    await prisma.$disconnect();
  }
}

function unavailablePrisma(code) {
  return {
    brainRelease: {
      findUnique() {
        const error = new Error(code);
        error.code = code;
        throw error;
      },
    },
  };
}

async function fetchProductionHealth(url) {
  try {
    const response = await fetch(url, {
      headers: { accept: 'application/json' },
      signal: AbortSignal.timeout(10_000),
    });
    const raw = await response.text();
    let body = null;
    let error = null;
    try {
      body = raw ? JSON.parse(raw) : null;
    } catch (parseError) {
      error = `invalid_json:${parseError instanceof Error ? parseError.message : String(parseError)}`;
    }
    return { requestSucceeded: true, statusCode: response.status, body, error };
  } catch (error) {
    return {
      requestSucceeded: false,
      statusCode: null,
      body: null,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function inspectStandardRegressionParent(input) {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) return { run: null, error: 'DATABASE_URL_missing' };
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: databaseUrl, max: 1, connectionTimeoutMillis: 10_000 }),
  });
  try {
    const run = await prisma.brainEvalRun.findUnique({
      where: { id: input.standardRegressionRunId },
      select: { id: true, releaseId: true, storeId: true, status: true, summary: true },
    });
    return { run, error: null };
  } catch (error) {
    return { run: null, error: error instanceof Error ? error.name : 'unknown_error' };
  } finally {
    await prisma.$disconnect();
  }
}

function parseOptions(args) {
  const get = (name) => args.find((value) => value.startsWith(`${name}=`))?.slice(name.length + 1);
  const has = (name) => args.includes(name) || get(name) === 'true';
  const required = (name) => {
    const value = get(name);
    if (!value) throw new Error(`${name} is required`);
    return value;
  };
  const runKey = required('--run-key');
  if (!/^[a-zA-Z0-9_-]+$/u.test(runKey)) throw new Error('run-key is invalid');
  const runtimeCommit = required('--expected-runtime-commit');
  if (!/^[0-9a-f]{40}$/iu.test(runtimeCommit)) throw new Error('expected-runtime-commit is invalid');
  const releaseId = Number(required('--expected-release-id'));
  const diagnosticOnly = has('--diagnostic-only');
  const standardRegressionRunId = Number(
    diagnosticOnly ? get('--standard-regression-run-id') ?? 0 : required('--standard-regression-run-id'),
  );
  const storeId = Number(required('--store-id'));
  if (!Number.isInteger(releaseId) || releaseId <= 0) throw new Error('expected-release-id is invalid');
  if (!diagnosticOnly && (!Number.isInteger(standardRegressionRunId) || standardRegressionRunId <= 0)) {
    throw new Error('standard-regression-run-id is invalid');
  }
  if (!Number.isInteger(storeId) || storeId <= 0) throw new Error('store-id is invalid');
  return {
    runKey,
    runtimeCommit,
    releaseId,
    standardRegressionRunId,
    diagnosticOnly,
    storeId,
    productionHealthUrl: diagnosticOnly
      ? get('--production-health-url') ?? 'local-diagnostic'
      : required('--production-health-url'),
    manifestPath: resolve(get('--performance-manifest') ?? DEFAULT_MANIFEST),
    suiteManifestPath: get('--suite-manifest')
      ? resolve(get('--suite-manifest'))
      : resolve(REPO_ROOT, 'docs/04-测试数据/Ami-Brain-全领域题集治理/ami-brain-suite-manifest-v2.json'),
    concurrency: Math.max(1, Math.min(2, Number(get('--concurrency') ?? 2))),
    dryRun: has('--dry-run'),
  };
}

async function attachPerformanceEvidence(input, evidence) {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error('DATABASE_URL is required');
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: databaseUrl, max: 1, connectionTimeoutMillis: 10_000 }),
  });
  try {
    const run = await prisma.brainEvalRun.findFirst({
      where: {
        id: input.standardRegressionRunId,
        releaseId: input.releaseId,
        storeId: input.storeId,
        status: 'completed',
      },
      select: { id: true, summary: true },
    });
    if (!run) throw new Error('performance standard-regression run missing');
    const summary = record(run.summary);
    const productAcceptance = record(summary.productAcceptance);
    const mismatches = [
      summary.stage !== 'standard-regression' ? 'stage' : null,
      summary.executionMode !== 'delta_after_release_core' ? 'execution_mode' : null,
      Number(summary.runId) !== input.standardRegressionRunId ? 'run_id' : null,
      Number(summary.activeRelease?.id) !== input.releaseId ? 'release_id' : null,
      Number(summary.storeId) !== input.storeId ? 'store_id' : null,
      summary.sourceCommit !== input.runtimeCommit ? 'source_commit' : null,
      summary.productionHealth?.commit !== input.runtimeCommit ? 'runtime_commit' : null,
      summary.releaseFingerprint !== evidence.identity?.releaseFingerprint ? 'release_fingerprint' : null,
      summary.suiteManifestChecksum !== evidence.runIdentity.suiteManifestChecksum ? 'suite_manifest_checksum' : null,
      productAcceptance.canActivate !== true ? 'product_acceptance' : null,
      Number(productAcceptance.standardRegressionRunId) !== input.standardRegressionRunId
        ? 'product_acceptance_run_id'
        : null,
    ].filter(Boolean);
    if (mismatches.length) throw new Error(`performance standard-regression identity mismatch:${mismatches.join(',')}`);
    const updated = await prisma.brainEvalRun.updateMany({
      where: { id: run.id, status: 'completed' },
      data: { summary: { ...summary, performanceAcceptance: evidence } },
    });
    if (updated.count !== 1) throw new Error('performance standard-regression evidence attach conflict');
  } finally {
    await prisma.$disconnect();
  }
}

function record(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function writeJson(path, value) {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function relative(path) {
  return path.replace(`${REPO_ROOT}/`, '');
}

function renderReport(evidence) {
  const rows = Object.entries(evidence.buckets).map(([key, bucket]) =>
    `| ${key} | ${bucket.runId ?? '-'} | ${bucket.caseCount ?? '-'} | ${bucket.latency?.p50Ms ?? '-'} | ${bucket.latency?.p95Ms ?? '-'} | ${bucket.latency?.maxMs ?? '-'} |`,
  );
  return `# Ami Brain 60 题性能验收报告

> 状态：${evidence.status}<br>
> manifest：${evidence.manifestVersion}

| bucket | runId | 题数 | P50 ms | P95 ms | max ms |
| --- | ---: | ---: | ---: | ---: | ---: |
${rows.join('\n')}

## 阻断原因

${evidence.blockingReasons.length ? evidence.blockingReasons.map((item) => `- ${item}`).join('\n') : '无'}
`;
}
