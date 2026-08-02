#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const serverRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = resolve(serverRoot, '../..');
const defaultManifestPath = resolve(
  repoRoot,
  'docs/04-测试数据/Ami-Brain-全领域题集治理/ami-brain-suite-manifest-v2.json',
);
const defaultGoldManifestPath = resolve(
  repoRoot,
  'docs/04-测试数据/Ami-Brain-事实金标准/ami-brain-gold-standard-manifest-v1.json',
);
const evalOutputRoot = resolve(repoRoot, 'docs/04-测试数据/Ami-Brain-分层验收');
const defaultOutputRoot = resolve(repoRoot, 'outputs/ami-brain-observe');

if (resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(`[brain:observe] ${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}

async function main() {
  const options = parseObserveArgs(process.argv.slice(2));
  const manifest = JSON.parse(readFileSync(options.manifestPath, 'utf8'));
  const goldManifest = JSON.parse(readFileSync(options.goldManifestPath, 'utf8'));
  const plan = createObservePlan({ manifest, goldManifest, options, environment: process.env });
  const outputDir = resolve(options.outputRoot, options.runKey);
  writeObservePlan(plan, outputDir);
  printPlan(plan);

  if (options.dryRun) {
    if (plan.blockers.length) process.exitCode = 1;
    return;
  }
  if (plan.blockers.length) throw new Error(`observe_preflight_blocked:${plan.blockers.join(',')}`);

  const executions = [];
  try {
    for (const stagePlan of plan.stages) {
      const execution = runObserveStage(stagePlan, options);
      executions.push(execution);
      if (execution.status !== 'completed') {
        throw new Error(`observe_stage_${execution.status}:${stagePlan.stage}:run=${execution.runId ?? 'unknown'}`);
      }
    }
    const views = buildObserveViews({ manifest, options, executions });
    writeObserveOutputs({ plan, executions, views, outputDir, status: 'completed' });
  } catch (error) {
    writeObserveOutputs({
      plan,
      executions,
      views: null,
      outputDir,
      status: 'failed',
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

export function parseObserveArgs(args) {
  const values = new Map();
  const flags = new Set();
  for (const argument of args) {
    if (argument === '--dry-run') flags.add('dry-run');
    else if (argument.startsWith('--') && argument.includes('=')) {
      const index = argument.indexOf('=');
      values.set(argument.slice(0, index), argument.slice(index + 1));
    } else throw new Error(`unknown_argument:${argument}`);
  }
  const integer = (name, fallback) => {
    const value = Number(values.get(name) ?? fallback);
    if (!Number.isInteger(value) || value < 0) throw new Error(`invalid_integer:${name}`);
    return value;
  };
  const runKey = values.get('--run-key') ?? `observe-${new Date().toISOString().replace(/[:.]/g, '-')}`;
  if (!/^[a-zA-Z0-9_-]+$/.test(runKey)) throw new Error('invalid_run_key');
  return {
    dryRun: flags.has('dry-run'),
    runKey,
    manifestPath: resolve(values.get('--manifest') ?? defaultManifestPath),
    goldManifestPath: resolve(values.get('--gold-manifest') ?? defaultGoldManifestPath),
    outputRoot: resolve(values.get('--output-root') ?? defaultOutputRoot),
    expectedReleaseId: integer('--expected-release-id', 0),
    storeId: integer('--store-id', 0),
    productionHealthUrl: values.get('--production-health-url') ?? '',
    expectedRuntimeCommit: values.get('--expected-runtime-commit') ?? '',
    concurrency: Math.max(1, Math.min(2, integer('--concurrency', 2))),
    checkpointEvery: Math.max(1, integer('--checkpoint-every', 25)),
    maxCasesPerInvocation: Math.max(1, integer('--max-cases-per-invocation', 100)),
    maxInvocationsPerStage: Math.max(1, integer('--max-invocations-per-stage', 20)),
    maxEvaluatedCases: Math.max(1, integer('--max-evaluated-cases', 1850)),
    providerFailureThreshold: Math.max(1, integer('--provider-failure-threshold', 8)),
    standardComparisonRunId: integer('--standard-comparison-run-id', 0) || null,
    rotationComparisonRunId: integer('--rotation-comparison-run-id', 0) || null,
    defaultOwner: values.get('--default-owner') ?? 'ami-brain-platform',
  };
}

export function createObservePlan({ manifest, goldManifest, options, environment = {} }) {
  const releaseCore = suite(manifest, 'releaseCore');
  const standard = suite(manifest, 'standardRegression');
  const rotation = suite(manifest, 'extendedRotation');
  const releaseCoreIds = new Set(releaseCore.caseIds);
  const standardIds = new Set(standard.caseIds);
  const rotationIds = new Set(rotation.caseIds);
  const blockers = [];
  if ([...releaseCoreIds].some((id) => !standardIds.has(id))) blockers.push('release_core_not_in_standard');
  if ([...rotationIds].some((id) => standardIds.has(id))) blockers.push('standard_rotation_overlap');
  if (releaseCore.caseCount !== releaseCoreIds.size) blockers.push('release_core_count_invalid');
  if (standard.caseCount !== standardIds.size) blockers.push('standard_count_invalid');
  if (rotation.caseCount !== rotationIds.size) blockers.push('rotation_count_invalid');
  const goldCaseCount = Array.isArray(goldManifest?.cases) ? goldManifest.cases.length : Number(goldManifest?.caseCount ?? 0);
  const uniqueSuiteCases = new Set([...standardIds, ...rotationIds]).size;
  const estimatedEvaluatedCases = uniqueSuiteCases + goldCaseCount;
  if (estimatedEvaluatedCases > options.maxEvaluatedCases) blockers.push('observe_case_budget_exceeded');
  if (!options.expectedReleaseId) blockers.push('expected_release_id_required');
  if (!options.storeId) blockers.push('store_id_required');
  if (!options.productionHealthUrl) blockers.push('production_health_url_required');
  if (!/^[0-9a-f]{40}$/i.test(options.expectedRuntimeCommit)) blockers.push('expected_runtime_commit_required');
  if (!environment.DATABASE_URL) blockers.push('database_url_required');
  if (environment.BRAIN_OBSERVE_ENVIRONMENT !== 'approved_development') {
    blockers.push('approved_development_environment_required');
  }
  if (!environment.LLM_PROVIDER) blockers.push('llm_provider_required');
  if (environment.LLM_PROVIDER === 'mock') blockers.push('real_llm_provider_required');
  if (!environment.LLM_MODEL) blockers.push('llm_model_required');
  if (environment.LLM_PROVIDER && environment.LLM_PROVIDER !== 'mock' && !environment.LLM_API_KEY) {
    blockers.push('llm_api_key_required');
  }
  const commonArgs = [
    `--run-key=${options.runKey}`,
    `--expected-release-id=${options.expectedReleaseId}`,
    `--store-id=${options.storeId}`,
    `--production-health-url=${options.productionHealthUrl}`,
    `--expected-runtime-commit=${options.expectedRuntimeCommit}`,
    `--concurrency=${options.concurrency}`,
    `--checkpoint-every=${options.checkpointEvery}`,
    `--max-cases-per-invocation=${options.maxCasesPerInvocation}`,
    `--provider-failure-threshold=${options.providerFailureThreshold}`,
  ];
  return {
    schemaVersion: 1,
    runKey: options.runKey,
    manifestVersion: manifest.manifestVersion,
    suiteCounts: {
      releaseCore: releaseCore.caseCount,
      standardRegression: standard.caseCount,
      extendedRotation: rotation.caseCount,
      goldStandard: goldCaseCount,
      uniqueExecutable: uniqueSuiteCases,
      estimatedEvaluatedCases,
    },
    budget: { maxEvaluatedCases: options.maxEvaluatedCases, withinBudget: estimatedEvaluatedCases <= options.maxEvaluatedCases },
    provider: environment.LLM_PROVIDER ?? null,
    model: environment.LLM_MODEL ?? null,
    blockers,
    stages: [
      {
        stage: 'standard-regression',
        expectedCaseCount: standard.caseCount,
        comparisonRunId: options.standardComparisonRunId,
        args: [
          '--stage=standard-regression',
          ...commonArgs,
          ...(options.standardComparisonRunId ? [`--comparison-run-id=${options.standardComparisonRunId}`] : []),
        ],
      },
      {
        stage: 'extended-rotation',
        expectedCaseCount: rotation.caseCount,
        comparisonRunId: options.rotationComparisonRunId,
        args: [
          '--stage=extended-rotation',
          ...commonArgs,
          ...(options.rotationComparisonRunId ? [`--comparison-run-id=${options.rotationComparisonRunId}`] : []),
        ],
      },
    ],
    views: [
      { key: 'release-core', sourceStage: 'standard-regression', caseCount: releaseCore.caseCount },
      { key: 'standard-regression', sourceStage: 'standard-regression', caseCount: standard.caseCount },
      { key: 'extended-rotation', sourceStage: 'extended-rotation', caseCount: rotation.caseCount },
    ],
  };
}

function runObserveStage(stagePlan, options) {
  let runId = null;
  let invocationCount = 0;
  let lastOutput = '';
  while (invocationCount < options.maxInvocationsPerStage) {
    invocationCount += 1;
    const args = [...stagePlan.args, ...(runId ? [`--resume-run-id=${runId}`] : [])];
    process.stdout.write(`\n[brain:observe] ${stagePlan.stage} invocation=${invocationCount}\n`);
    const result = spawnSync('npm', ['run', 'brain:eval:full-domain', '--', ...args], {
      cwd: serverRoot,
      encoding: 'utf8',
      maxBuffer: 128 * 1024 * 1024,
      env: process.env,
    });
    if (result.stdout) process.stdout.write(result.stdout);
    if (result.stderr) process.stderr.write(result.stderr);
    lastOutput = `${result.stdout ?? ''}\n${result.stderr ?? ''}`;
    runId = runId ?? numberFrom(lastOutput.match(/\[full-domain-eval\] run=(\d+)/u)?.[1]);
    if ((result.status ?? 1) !== 0) {
      return { stage: stagePlan.stage, status: 'failed', runId, invocationCount, exitCode: result.status ?? 1 };
    }
    if (/full-domain-eval safety blocked run=/u.test(lastOutput)) {
      return { stage: stagePlan.stage, status: 'blocked', runId, invocationCount, exitCode: 1 };
    }
    if (/\[full-domain-eval\] completed run=/u.test(lastOutput)) {
      return { stage: stagePlan.stage, status: 'completed', runId, invocationCount, exitCode: 0 };
    }
    if (!/full-domain-eval checkpointed run=|\[full-domain-eval\] gold checkpointed parent=/u.test(lastOutput)) {
      return { stage: stagePlan.stage, status: 'failed', runId, invocationCount, exitCode: 1, reason: 'unknown_eval_state' };
    }
    if (!runId) return { stage: stagePlan.stage, status: 'failed', runId, invocationCount, exitCode: 1, reason: 'resume_run_id_missing' };
  }
  return { stage: stagePlan.stage, status: 'failed', runId, invocationCount, exitCode: 1, reason: 'invocation_budget_exhausted' };
}

export function buildObserveViews({ manifest, options, executions, evalRoot = evalOutputRoot }) {
  const standardResults = readJson(resolve(evalRoot, options.runKey, 'standard-regression', 'results.json'));
  const standardSummary = readJson(resolve(evalRoot, options.runKey, 'standard-regression', 'summary.json'));
  const rotationResults = readJson(resolve(evalRoot, options.runKey, 'extended-rotation', 'results.json'));
  const rotationSummary = readJson(resolve(evalRoot, options.runKey, 'extended-rotation', 'summary.json'));
  if (!Array.isArray(standardResults) || !Array.isArray(rotationResults)) throw new Error('observe_results_missing');
  const releaseCoreIds = new Set(suite(manifest, 'releaseCore').caseIds);
  const releaseCoreResults = standardResults.filter((item) => releaseCoreIds.has(item.caseKey));
  if (releaseCoreResults.length !== releaseCoreIds.size) throw new Error('release_core_view_incomplete');
  const uniqueResults = [...standardResults, ...rotationResults];
  const failureClusters = clusterFailures(uniqueResults, options.defaultOwner);
  return {
    releaseCore: summarizeResults(releaseCoreResults),
    standardRegression: standardSummary ?? summarizeResults(standardResults),
    extendedRotation: rotationSummary ?? summarizeResults(rotationResults),
    releaseCoreResults,
    failureClusters,
    comparisons: {
      standardRegression: standardSummary?.comparison ?? null,
      extendedRotation: rotationSummary?.comparison ?? null,
    },
    runIds: Object.fromEntries(executions.map((item) => [item.stage, item.runId])),
  };
}

function writeObservePlan(plan, outputDir) {
  mkdirSync(outputDir, { recursive: true });
  writeFileSync(join(outputDir, 'plan.json'), `${JSON.stringify(plan, null, 2)}\n`);
}

function writeObserveOutputs({ plan, executions, views, outputDir, status, error = null }) {
  mkdirSync(outputDir, { recursive: true });
  const summary = {
    schemaVersion: 1,
    runKey: plan.runKey,
    status,
    error,
    suiteCounts: plan.suiteCounts,
    budget: plan.budget,
    provider: plan.provider,
    model: plan.model,
    executions,
    views: views
      ? {
          releaseCore: views.releaseCore,
          standardRegression: compactSummary(views.standardRegression),
          extendedRotation: compactSummary(views.extendedRotation),
          comparisons: views.comparisons,
          failureClusters: views.failureClusters,
          runIds: views.runIds,
        }
      : null,
    createdAt: new Date().toISOString(),
  };
  writeFileSync(join(outputDir, 'summary.json'), `${JSON.stringify(summary, null, 2)}\n`);
  if (views) writeFileSync(join(outputDir, 'release-core-results.json'), `${JSON.stringify(views.releaseCoreResults, null, 2)}\n`);
  writeFileSync(join(outputDir, 'latest-summary.md'), buildMarkdownSummary(summary));
}

function buildMarkdownSummary(summary) {
  const lines = [
    '# Ami Brain Observe 摘要',
    '',
    `- Run Key：${summary.runKey}`,
    `- 状态：${summary.status}`,
    `- Provider / 模型：${summary.provider ?? '未配置'} / ${summary.model ?? '未配置'}`,
    `- 套件：release-core ${summary.suiteCounts.releaseCore}，standard-regression ${summary.suiteCounts.standardRegression}，extended-rotation ${summary.suiteCounts.extendedRotation}`,
    `- 唯一执行题目：${summary.suiteCounts.uniqueExecutable}；含 Gold 预计评估：${summary.suiteCounts.estimatedEvaluatedCases}/${summary.budget.maxEvaluatedCases}`,
  ];
  if (summary.error) lines.push(`- 错误：${summary.error}`);
  const clusters = summary.views?.failureClusters ?? [];
  lines.push('', '## 失败聚类', '');
  if (!clusters.length) lines.push('- 无失败聚类。');
  else for (const item of clusters) lines.push(`- ${item.cluster}：${item.count}，负责人：${item.owner}`);
  return `${lines.join('\n')}\n`;
}

function printPlan(plan) {
  process.stdout.write('\nAmi Brain Observe 计划\n');
  process.stdout.write(`Run Key: ${plan.runKey}\n`);
  process.stdout.write(`套件题数: release-core=${plan.suiteCounts.releaseCore}, standard=${plan.suiteCounts.standardRegression}, rotation=${plan.suiteCounts.extendedRotation}\n`);
  process.stdout.write(`唯一执行题目: ${plan.suiteCounts.uniqueExecutable}, 含 Gold 预算: ${plan.suiteCounts.estimatedEvaluatedCases}/${plan.budget.maxEvaluatedCases}\n`);
  if (plan.blockers.length) process.stdout.write(`阻断项: ${plan.blockers.join(', ')}\n`);
}

function suite(manifest, key) {
  const value = manifest?.suites?.[key];
  if (!value || !Array.isArray(value.caseIds) || !Number.isInteger(value.caseCount)) {
    throw new Error(`observe_suite_invalid:${key}`);
  }
  return value;
}

function summarizeResults(results) {
  const passed = results.filter((item) => item.deterministicPassed).length;
  return {
    total: results.length,
    passed,
    failed: results.length - passed,
    passRate: results.length ? passed / results.length : null,
  };
}

function compactSummary(summary) {
  if (!summary) return null;
  return {
    runId: summary.runId,
    total: summary.total,
    passed: summary.passed,
    failed: summary.failed,
    providerUnavailable: summary.providerUnavailable,
    deterministicPassRate: summary.deterministicPassRate,
    failureClusters: summary.failureClusters,
  };
}

function clusterFailures(results, defaultOwner) {
  const counts = new Map();
  for (const item of results) {
    if (item.deterministicPassed) continue;
    const cluster = item.failureCluster ?? 'unknown';
    const metadata = item.metadata && typeof item.metadata === 'object' ? item.metadata : {};
    const domain = metadata.domain ?? 'unknown';
    const key = `${cluster}\u0000${domain}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([key, count]) => {
      const [cluster, domain] = key.split('\u0000');
      return { cluster, domain, count, owner: ownerFor(cluster, domain, defaultOwner) };
    })
    .sort((left, right) => right.count - left.count || left.cluster.localeCompare(right.cluster));
}

function ownerFor(cluster, domain, defaultOwner) {
  if (['permission_not_denied', 'action_not_previewed'].includes(cluster)) return 'ami-brain-security';
  if (['provider_unavailable', 'timeout'].includes(cluster)) return 'ami-brain-platform';
  if (['ambiguity_not_clarified', 'multi_turn_not_continued'].includes(cluster)) return 'ami-brain-conversation';
  return domain && domain !== 'unknown' ? `ami-brain-domain:${domain}` : defaultOwner;
}

function readJson(path) {
  if (!existsSync(path)) return null;
  return JSON.parse(readFileSync(path, 'utf8'));
}

function numberFrom(value) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : null;
}
