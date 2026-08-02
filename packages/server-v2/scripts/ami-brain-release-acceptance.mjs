import 'dotenv/config';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import {
  buildAcceptanceEvidence,
  buildCoreBlockedEvidence,
  buildEvalArgs,
  buildReleaseAcceptancePreflight,
  clamp,
  positiveNumber,
  renderReport,
  resolveResumePlan,
  sha256,
  standardDeltaCaseIds,
  validateManifest,
  validateProductLoopEligibility,
} from './ami-brain-release-acceptance-core.mjs';
import { assertProductLoopRegistry } from './ami-brain-product-loop-registry.mjs';
import { assertAmiBrainTestQuestionGovernance } from './ami-brain-test-question-governance.mjs';
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
const DEFAULT_MANIFEST = resolve(
  REPO_ROOT,
  'docs/04-测试数据/Ami-Brain-全领域题集治理/ami-brain-suite-manifest-v2.json',
);
const EVAL_OUTPUT_ROOT = resolve(REPO_ROOT, 'docs/04-测试数据/Ami-Brain-分层验收');
const ACCEPTANCE_OUTPUT_ROOT = resolve(REPO_ROOT, 'outputs/ami-brain-release-acceptance');

const options = parseOptions(process.argv.slice(2));
const manifestRaw = readFileSync(options.suiteManifest, 'utf8');
const manifest = JSON.parse(manifestRaw);
assertProductLoopRegistry(REPO_ROOT);
assertAmiBrainTestQuestionGovernance(REPO_ROOT);
validateManifest(manifest);
const productLoopEligibilityPath = resolveRepoArtifact(manifest.productLoopEligibility.path);
const productLoopEligibilityRaw = readFileSync(productLoopEligibilityPath, 'utf8');
const supplementalQuestionRegistryRaw = readFileSync(
  resolveRepoArtifact(manifest.productLoopEligibility.supplementalRegistry.path),
  'utf8',
);
validateProductLoopEligibility(manifest, productLoopEligibilityRaw, supplementalQuestionRegistryRaw);

const standardDeltaIds = standardDeltaCaseIds(manifest);
const identity = {
  contractVersion: 'ami-brain-release-acceptance/v1',
  runKey: options.runKey,
  releaseId: options.releaseId,
  runtimeCommit: options.runtimeCommit,
  productionHealthUrl: options.productionHealthUrl,
  storeId: options.storeId,
  suiteManifestPath: relativeToRepo(options.suiteManifest),
  suiteManifestVersion: manifest.manifestVersion,
  suiteManifestChecksum: sha256(manifestRaw),
  sourceBaselineChecksum: manifest.sourceBaseline.checksum,
  productLoopEligibilityChecksum: manifest.productLoopEligibility.checksum,
  releaseCoreCaseCount: manifest.suites.releaseCore.caseCount,
  standardRegressionCaseCount: manifest.suites.standardRegression.caseCount,
  standardDeltaCaseCount: standardDeltaIds.length,
};
const preflight = await inspectReleaseAcceptancePreflight(identity);
const acceptanceDir = resolve(ACCEPTANCE_OUTPUT_ROOT, options.runKey);
mkdirSync(acceptanceDir, { recursive: true });
const statePath = resolve(acceptanceDir, 'orchestrator-state.json');
let orchestratorState = options.resume && existsSync(statePath) ? readJson(statePath) : {};
const resumePlan = resolveResumePlan({ options, state: orchestratorState, identity });
writeJson(resolve(acceptanceDir, 'identity.json'), identity);
writeJson(resolve(acceptanceDir, 'preflight.json'), preflight);

if (options.dryRun) {
  const preview = {
    identity,
    preflight,
    ready: preflight.ready,
    blockingReasons: preflight.blockingReasons,
    stages: [
      buildEvalArgs(options, 'release-core', resumePlan.coreRunId),
      buildEvalArgs(
        options,
        'standard-regression',
        resumePlan.standardRunId,
        true,
        resumePlan.coreRunId ?? '<release-core-run-id-from-stage-1>',
      ),
    ],
    resumePlan,
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
        output: relativeToRepo(acceptanceDir),
      },
      null,
      2,
    ),
  );
  process.exit(2);
}

const coreStage = resumePlan.skipReleaseCore
  ? { runId: resumePlan.coreRunId, blocked: false, skipped: true }
  : runStage('release-core', resumePlan.coreRunId, false);
const coreRunId = coreStage.runId;
if (!coreRunId) throw new Error('release-core run id missing');
updateState({ coreRunId, status: 'release_core_complete', stage: null, resumeRunId: null });
if (coreStage.blocked) {
  updateState({ coreRunId, status: 'release_core_blocked', stage: null, resumeRunId: null });
  const coreDir = resolve(EVAL_OUTPUT_ROOT, options.runKey, 'release-core');
  const coreSummary = readJson(resolve(coreDir, 'summary.json'));
  const coreResults = readJson(resolve(coreDir, 'results.json'));
  const evidence = buildCoreBlockedEvidence({ identity, manifest, coreSummary, coreResults });
  finalizeEvidence(evidence, { coreSummary, coreResults });
  process.exitCode = 2;
  process.exit();
}
const standardStage = resumePlan.skipStandardRegression
  ? { runId: resumePlan.standardRunId, blocked: false, skipped: true }
  : runStage('standard-regression', resumePlan.standardRunId, true, coreRunId);
const standardRunId = standardStage.runId;
if (!standardRunId) throw new Error('standard-regression run id missing');
updateState({
  coreRunId,
  standardRunId,
  status: 'standard_delta_complete',
  stage: null,
  resumeRunId: null,
});

const coreDir = resolve(EVAL_OUTPUT_ROOT, options.runKey, 'release-core');
const standardDir = resolve(EVAL_OUTPUT_ROOT, options.runKey, 'standard-regression');
const coreSummary = readJson(resolve(coreDir, 'summary.json'));
const standardDeltaSummary = readJson(resolve(standardDir, 'summary.json'));
const coreResults = readJson(resolve(coreDir, 'results.json'));
const standardDeltaResults = readJson(resolve(standardDir, 'results.json'));
const evidence = buildAcceptanceEvidence({
  identity,
  manifest,
  coreSummary,
  standardDeltaSummary,
  coreResults,
  standardDeltaResults,
});
if (standardStage.blocked && !evidence.blockingReasons.includes('standard_regression_safety_blocked')) {
  updateState({
    coreRunId,
    standardRunId,
    status: 'standard_regression_blocked',
    stage: null,
    resumeRunId: null,
  });
  evidence.blockingReasons.push('standard_regression_safety_blocked');
  evidence.canActivate = false;
  evidence.decision = 'blocked';
}
finalizeEvidence(evidence, {
  coreSummary,
  standardDeltaSummary,
  coreResults,
  standardDeltaResults,
  coreRunId,
  standardRunId,
});
if (!evidence.canActivate) process.exitCode = 2;

function runStage(stage, initialResumeRunId, standardDelta, releaseCoreRunId) {
  let resumeRunId = initialResumeRunId;
  for (let invocation = 1; invocation <= options.maxInvocations; invocation += 1) {
    const args = buildEvalArgs(options, stage, resumeRunId, standardDelta, releaseCoreRunId);
    const result = spawnSync('npm', ['run', 'brain:eval:full-domain', '--', ...args], {
      cwd: SERVER_ROOT,
      encoding: 'utf8',
      stdio: ['inherit', 'pipe', 'pipe'],
    });
    if (result.stdout) process.stdout.write(result.stdout);
    if (result.stderr) process.stderr.write(result.stderr);
    const output = `${result.stdout ?? ''}\n${result.stderr ?? ''}`;
    const detectedRunId = Number(output.match(/\[full-domain-eval\] run=(\d+)/u)?.[1] ?? resumeRunId);
    if (Number.isInteger(detectedRunId) && detectedRunId > 0) resumeRunId = detectedRunId;
    updateState({
      status: `${stage}_invocation_${invocation}`,
      stage,
      resumeRunId: resumeRunId ?? null,
    });
    if (result.status !== 0) throw new Error(`${stage} execution failed with status ${result.status}`);
    if (/\[full-domain-eval\] completed run=/u.test(output)) return { runId: resumeRunId, blocked: false };
    if (/full-domain-eval safety blocked run=/u.test(output)) return { runId: resumeRunId, blocked: true };
    if (!/full-domain-eval checkpointed run=/u.test(output)) {
      throw new Error(`${stage} neither completed nor produced a resumable checkpoint`);
    }
  }
  throw new Error(`${stage} exceeded max invocations ${options.maxInvocations}`);
}

function finalizeEvidence(evidence, summaries) {
  if (summaries.coreSummary) writeJson(resolve(acceptanceDir, 'release-core-summary.json'), summaries.coreSummary);
  if (summaries.coreResults) {
    writeJson(
      resolve(acceptanceDir, 'release-core-legacy-subsets.json'),
      {
        targeted12: summarizeSubset(summaries.coreResults, manifest.legacySubsets.targeted12),
        preflight140: summarizeSubset(summaries.coreResults, manifest.legacySubsets.preflight140),
      },
    );
  }
  if (summaries.standardDeltaSummary) {
    writeJson(resolve(acceptanceDir, 'standard-regression-delta-summary.json'), summaries.standardDeltaSummary);
    writeJson(resolve(acceptanceDir, 'standard-regression-summary.json'), {
      stage: 'standard-regression',
      executionMode: 'release_core_plus_delta',
      expectedTotal: evidence.mergedStandardRegression?.expectedCaseCount ?? null,
      total: evidence.mergedStandardRegression?.resultCount ?? null,
      verifiedCapabilityTotal: evidence.mergedStandardRegression?.verifiedCapabilityTotal ?? 0,
      releaseCoreRunId: summaries.coreRunId,
      standardRegressionRunId: summaries.standardRunId,
      caseIdsChecksum: evidence.mergedStandardRegression?.caseIdsChecksum ?? null,
      canActivate: evidence.canActivate,
      blockingReasons: evidence.blockingReasons,
    });
  }
  writeJson(resolve(acceptanceDir, 'extended-rotation-reference.json'), {
    suiteManifestVersion: manifest.manifestVersion,
    suiteManifestChecksum: identity.suiteManifestChecksum,
    suite: manifest.suites.extendedRotation,
    blocksCurrentAcceptance: false,
    invalidatesEvidenceOnSafetyFailure: true,
  });
  writeJson(resolve(acceptanceDir, 'latency-breakdown.json'), {
    releaseCore: summaries.coreSummary?.latencyBreakdown ?? null,
    standardRegressionDelta: summaries.standardDeltaSummary?.latencyBreakdown ?? null,
    productPerformanceGateUses: 'userResponse',
    judgeExcludedFromUserLatency: true,
  });
  writeJson(resolve(acceptanceDir, 'failure-clusters.json'), {
    releaseCore: summaries.coreSummary?.failureClusters ?? {},
    standardRegressionDelta: summaries.standardDeltaSummary?.failureClusters ?? {},
  });
  const allResults = [...(summaries.coreResults ?? []), ...(summaries.standardDeltaResults ?? [])];
  writeJson(
    resolve(acceptanceDir, 'manual-review.json'),
    allResults
      .filter((item) => item?.metadata?.qualityBucket === 'manual_review')
      .map((item) => ({ caseKey: item.caseKey, domain: item.metadata?.domain, reason: item.llmJudge?.reason ?? null })),
  );
  writeJson(resolve(acceptanceDir, 'acceptance-evidence.json'), evidence);
  writeFileSync(resolve(acceptanceDir, 'acceptance-report.md'), renderReport(evidence), 'utf8');
  const evidenceFiles = [
    'identity.json',
    'preflight.json',
    ...(summaries.coreSummary ? ['release-core-summary.json'] : []),
    ...(summaries.coreResults ? ['release-core-legacy-subsets.json'] : []),
    ...(summaries.standardDeltaSummary ? ['standard-regression-delta-summary.json'] : []),
    ...(summaries.standardDeltaSummary ? ['standard-regression-summary.json'] : []),
    'extended-rotation-reference.json',
    'latency-breakdown.json',
    'failure-clusters.json',
    'manual-review.json',
    'acceptance-evidence.json',
    'acceptance-report.md',
  ];
  const checksums = Object.fromEntries(
    evidenceFiles.map((name) => [name, sha256(readFileSync(resolve(acceptanceDir, name), 'utf8'))]),
  );
  writeJson(resolve(acceptanceDir, 'sha256-manifest.json'), checksums);
  console.log(
    JSON.stringify(
      {
        status: evidence.canActivate ? 'ready_for_activation' : 'blocked',
        blockingReasons: evidence.blockingReasons,
        output: relativeToRepo(acceptanceDir),
        coreRunId: summaries.coreRunId ?? evidence.stages?.releaseCore?.runId ?? null,
        standardRunId: summaries.standardRunId ?? evidence.stages?.standardRegressionDelta?.runId ?? null,
      },
      null,
      2,
    ),
  );
}

function summarizeSubset(results, expectedCaseIds) {
  const expected = new Set(expectedCaseIds);
  const selected = results.filter((item) => expected.has(item.caseKey));
  const actual = new Set(selected.map((item) => item.caseKey));
  return {
    expectedCount: expectedCaseIds.length,
    resultCount: selected.length,
    complete: selected.length === expectedCaseIds.length && expectedCaseIds.every((caseKey) => actual.has(caseKey)),
    passed: selected.filter((item) => item.deterministicPassed === true).length,
    failed: selected.filter((item) => item.deterministicPassed !== true).length,
    caseIdsChecksum: sha256(expectedCaseIds.join('\n')),
  };
}

async function inspectReleaseAcceptancePreflight(identity) {
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
  const headCommit = headResult.status === 0 ? headResult.stdout.trim() : null;
  const dirtyFileCount =
    worktreeResult.status === 0
      ? worktreeResult.stdout.split(/\r?\n/u).filter((line) => line.trim().length > 0).length
      : null;
  const crossClientContract = runAmiBrainCrossClientContract({ repoRoot: REPO_ROOT });
  const actionReleaseContract = await inspectActionReleaseContract({
    releaseId: identity.releaseId,
    headCommit,
  });
  const health = await fetchProductionHealth(identity.productionHealthUrl);
  return buildReleaseAcceptancePreflight({
    expectedReleaseId: identity.releaseId,
    expectedRuntimeCommit: identity.runtimeCommit,
    productionHealthUrl: identity.productionHealthUrl,
    headCommit,
    dirtyFileCount,
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
    return {
      requestSucceeded: true,
      statusCode: response.status,
      body,
      error,
    };
  } catch (error) {
    return {
      requestSucceeded: false,
      statusCode: null,
      body: null,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}


function parseOptions(args) {
  const get = (name) => args.find((value) => value.startsWith(`${name}=`))?.slice(name.length + 1);
  const has = (name) => args.includes(name) || get(name) === 'true';
  const releaseId = Number(get('--release-id'));
  const runtimeCommit = String(get('--runtime-commit') ?? '');
  const productionHealthUrl = String(get('--production-health-url') ?? '');
  const storeId = Number(get('--store-id'));
  const runKey = String(get('--run-key') ?? '');
  if (!Number.isInteger(releaseId) || releaseId <= 0) throw new Error('release-id is required');
  if (!/^[0-9a-f]{40}$/iu.test(runtimeCommit)) throw new Error('runtime-commit must be a full 40-character SHA');
  if (!/^https?:\/\//iu.test(productionHealthUrl)) throw new Error('production-health-url is required');
  if (!Number.isInteger(storeId) || storeId <= 0) throw new Error('store-id is required');
  if (!/^[a-zA-Z0-9_-]+$/u.test(runKey)) throw new Error('run-key is required and must be filesystem safe');
  return {
    releaseId,
    runtimeCommit,
    productionHealthUrl,
    storeId,
    runKey,
    suiteManifest: resolve(get('--suite-manifest') ?? DEFAULT_MANIFEST),
    concurrency: clamp(Number(get('--concurrency') ?? 2), 1, 2),
    checkpointEvery: Math.max(1, Number(get('--checkpoint-every') ?? 25)),
    maxCasesPerInvocation: Math.max(1, Number(get('--max-cases-per-invocation') ?? 100)),
    maxInvocations: Math.max(1, Number(get('--max-invocations') ?? 30)),
    releaseCoreResumeRunId: positiveNumber(get('--release-core-resume-run-id')),
    standardResumeRunId: positiveNumber(get('--standard-resume-run-id')),
    dryRun: has('--dry-run'),
    resume: has('--resume'),
  };
}

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function writeJson(path, value) {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function updateState(patch) {
  orchestratorState = { ...orchestratorState, ...identity, ...patch };
  writeJson(statePath, orchestratorState);
}

function relativeToRepo(value) {
  return value.replace(`${REPO_ROOT}/`, '');
}

function resolveRepoArtifact(path) {
  const resolved = resolve(REPO_ROOT, path);
  if (resolved !== REPO_ROOT && !resolved.startsWith(`${REPO_ROOT}/`)) {
    throw new Error('suite manifest artifact path escapes repository root');
  }
  return resolved;
}
