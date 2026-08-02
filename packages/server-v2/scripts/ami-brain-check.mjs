#!/usr/bin/env node
import { execFileSync, spawnSync } from 'node:child_process';
import { createHmac } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  checksum,
  createGateInputChecksum,
  createIdentity,
  createImpactPlan,
  createPrevalidatedGateResult,
  extractCapabilityKeys,
  isReusableGateResult,
  isReusableReceipt,
  parseArgs,
  releaseIdentityBlockers,
  selectPlanFiles,
  stableStringify,
  validatePrevalidatedGateSelection,
  withReleaseCandidateCloseGate,
  withResolvedCapabilities,
} from './ami-brain-check-core.mjs';
import {
  sha256 as candidateSha256,
  validateReleaseCandidateLockBinding,
} from './ami-brain-candidate-identity-core.mjs';

const serverRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = resolve(serverRoot, '../..');
const outputRoot = resolve(repoRoot, 'outputs/ami-brain-gates');
const receiptRoot = join(outputRoot, 'receipts');

if (resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) {
  main().catch((error) => fail(error instanceof Error ? error.message : String(error)));
}

async function main() {
  let options;
  try {
    options = parseArgs(process.argv.slice(2));
  } catch (error) {
    fail(error instanceof Error ? error.message : String(error));
  }
  if (options.help) {
    process.stdout.write('Usage: npm run brain:check -- --stage=dev|candidate|release|observe [--candidate-lock=path] [--dry-run] [--force] [--json] [--scope=file1,file2] [--repository=owner/repo --branch=branch --workflow=name --base-commit=sha --head-commit=sha --merge-base=sha --candidate-key=key] [--eval-run-id=id --evaluation-release-id=id] [--upload-receipt]\n');
    return;
  }

  const manifest = JSON.parse(readFileSync(join(serverRoot, 'scripts/ami-brain-check-impact-map.json'), 'utf8'));
  const statusFiles = workingTreeFiles();
  const blockers = [];
  const candidateLock = loadCandidateLock(options, blockers);
  const candidate = resolveCandidateIdentity(options, candidateLock);
  const diffFiles = candidate
    ? gitNul(['diff', '--name-only', '-z', candidate.mergeBaseCommit, candidate.headCommit, '--'])
    : statusFiles;
  const files = selectPlanFiles({ stage: options.stage, detectedFiles: diffFiles, scope: options.scope });
  if (['candidate', 'release'].includes(options.stage) && !candidate) blockers.push('candidate_identity_required');
  if (options.stage === 'release' && statusFiles.length > 0) blockers.push('release_stage_requires_clean_worktree');
  if (options.stage === 'release' && !candidateLock) blockers.push('release_candidate_lock_required');
  const prevalidatedGates = new Set(options.prevalidatedGates);
  blockers.push(...validatePrevalidatedGateSelection({
    stage: options.stage,
    gateIds: [...prevalidatedGates],
    githubActions: process.env.GITHUB_ACTIONS,
    allowed: process.env.BRAIN_CHECK_PREVALIDATED_GATES_ALLOWED,
  }));

  const unresolvedPlan = createImpactPlan({ files, stage: options.stage, manifest });
  const capabilities = resolveCapabilityKeys(unresolvedPlan);
  const capabilityPlan = withResolvedCapabilities(unresolvedPlan, capabilities);
  const plan = options.stage === 'release' && candidateLock
    ? withReleaseCandidateCloseGate(capabilityPlan, options.candidateLock)
    : capabilityPlan;
  if (plan.files.length > 0 && plan.capabilityImpacts.includes('all_runtime') && plan.capabilities.length === 0) {
    blockers.push('real_capability_mapping_missing');
  }
  const detectedSource = createSourceIdentity(plan.files, candidate, options);
  const source = candidateLock
    ? {
        ...detectedSource,
        diffChecksum: candidateLock.identity.diffChecksum,
        sourceFingerprint: candidateSha256(candidateLock.identity),
      }
    : detectedSource;
  const releaseEnvironment = candidateLock?.identity;
  const identity = createIdentity({
    plan,
    source,
    environment: {
      releaseFingerprint: releaseEnvironment?.releaseFingerprint ?? process.env.BRAIN_RELEASE_FINGERPRINT,
      dataSnapshot: releaseEnvironment?.dataSnapshot ?? process.env.BRAIN_DATA_SNAPSHOT,
      provider: releaseEnvironment?.provider ?? process.env.LLM_PROVIDER,
      model: releaseEnvironment?.model ?? process.env.LLM_MODEL,
      timeout: releaseEnvironment?.timeoutMs ?? (process.env.LLM_TIMEOUT_MS ? Number(process.env.LLM_TIMEOUT_MS) : null),
      candidateId: candidateLock?.candidateId ?? null,
    },
  });
  blockers.push(...releaseIdentityBlockers(identity));
  const reusable = options.force ? null : findReusableReceipt(identity);
  const externalReceipts = loadExternalReceipts(options.consumeGateReceipts);
  const summary = {
    plan,
    identity,
    blockers,
    reusableReceiptId: reusable?.receiptId ?? null,
    dryRun: options.dryRun,
    estimatedCommands: plan.gates.map((gate) => gate.command),
    estimatedModelInvocations: plan.gates.filter((gate) => ['release_acceptance', 'full_domain_observe'].includes(gate.id)).length,
  };

  if (options.dryRun || blockers.length > 0) {
    printSummary(summary, options.json);
    if (blockers.length > 0) process.exitCode = 1;
    return;
  }

  if (reusable) {
    if (options.receiptOutput) {
      writeReceiptArtifacts(reusable, resolve(options.receiptOutput), outputRoot);
    } else {
      writeLatestSummary(reusable, outputRoot);
    }
    printSummary({ receipt: reusable, reusedWholeReceipt: true }, options.json);
    return;
  }

  const startedAt = new Date();
  const results = [];
  let status = 'passed';
  for (const gate of plan.gates) {
    const inputChecksum = createGateInputChecksum({ gate, identity, fileFingerprints: source.fileFingerprints });
    const reusedGate = options.force || prevalidatedGates.has(gate.id)
      ? null
      : findReusableGateResult(inputChecksum, [...externalReceipts, ...localReceipts()]);
    const result = prevalidatedGates.has(gate.id)
      ? createPrevalidatedGateResult({
        gate,
        inputChecksum,
        pipelineEvidence: process.env.BRAIN_CHECK_PIPELINE_EVIDENCE || 'required-jobs',
      })
      : reusedGate
        ? { ...reusedGate.result, reused: true, reusedFromReceiptId: reusedGate.receipt.receiptId }
        : runGate(gate, inputChecksum);
    results.push(result);
    if (result.status !== 'passed') {
      status = 'failed';
      break;
    }
  }
  const createdAt = new Date();
  const receiptId = `${createdAt.toISOString().replace(/[:.]/g, '-')}-${identity.identityChecksum.slice(0, 12)}`;
  const receipt = {
    schemaVersion: 3,
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
  const receiptPath = resolve(options.receiptOutput || join(receiptRoot, `${receiptId}.json`));
  writeReceiptArtifacts(receipt, receiptPath, outputRoot);
  if (options.uploadReceipt) await uploadReceipt(receipt);
  printSummary({ receipt }, options.json);
  if (status !== 'passed') process.exitCode = 1;
}

function createSourceIdentity(files, candidate, options) {
  const head = candidate?.headCommit ?? gitText(['rev-parse', 'HEAD']);
  const parts = [`HEAD ${head}`];
  const fileFingerprints = {};
  for (const file of files) {
    const absolute = resolve(repoRoot, file);
    let content = '';
    if (candidate) content = gitText(['diff', '--binary', candidate.mergeBaseCommit, candidate.headCommit, '--', file]);
    else {
      const tracked = gitExitCode(['ls-files', '--error-unmatch', '--', file]) === 0;
      if (tracked) content = gitText(['diff', '--binary', 'HEAD', '--', file]);
      else if (existsSync(absolute) && statSync(absolute).isFile()) content = `${file}\n${readFileSync(absolute)}`;
    }
    fileFingerprints[file] = checksum(content);
    parts.push(content);
  }
  const diffChecksum = checksum(parts.join('\n'));
  return {
    head,
    headCommit: head,
    baseCommit: candidate?.baseCommit ?? null,
    mergeBaseCommit: candidate?.mergeBaseCommit ?? null,
    repository: candidate?.repository ?? options.repository ?? null,
    branch: candidate?.branch ?? options.branch ?? null,
    workflow: candidate?.workflow ?? options.workflow ?? process.env.GITHUB_WORKFLOW ?? null,
    eventName: candidate?.eventName ?? options.eventName ?? null,
    candidateKey: candidate?.candidateKey ?? options.candidateKey ?? null,
    evalRunId: options.evalRunId ?? null,
    evaluationReleaseId: options.evaluationReleaseId ?? null,
    diffChecksum,
    sourceFingerprint: checksum({ head, diffChecksum, fileFingerprints }),
    fileFingerprints,
  };
}

function runGate(gate, inputChecksum) {
  const startedAt = new Date();
  process.stdout.write(`\n[brain:check] ${gate.description}\n`);
  const result = spawnSync(gate.command[0], gate.command.slice(1), {
    cwd: resolve(repoRoot, gate.cwd),
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: process.env,
  });
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  const finishedAt = new Date();
  const exitCode = result.status ?? 1;
  const outputChecksum = checksum({ stdout: result.stdout ?? '', stderr: result.stderr ?? '' });
  return {
    gateId: gate.id,
    gateKey: gate.id,
    description: gate.description,
    command: gate.command,
    status: exitCode === 0 ? 'passed' : 'failed',
    exitCode,
    inputChecksum,
    outputChecksum,
    resultChecksum: checksum({ gateId: gate.id, inputChecksum, exitCode, outputChecksum }),
    durationMs: finishedAt.getTime() - startedAt.getTime(),
    modelInvocationCount: ['release_acceptance', 'full_domain_observe'].includes(gate.id) ? 1 : 0,
    reused: false,
    startedAt: startedAt.toISOString(),
    finishedAt: finishedAt.toISOString(),
  };
}

function findReusableReceipt(identity) {
  return localReceipts().find((receipt) => isReusableReceipt(receipt, identity)) ?? null;
}

function localReceipts() {
  if (!existsSync(receiptRoot)) return [];
  return readdirSync(receiptRoot)
    .filter((name) => name.endsWith('.json'))
    .sort()
    .reverse()
    .map((name) => readJson(join(receiptRoot, name)))
    .filter(Boolean);
}

function loadExternalReceipts(paths) {
  return paths.map((path) => readJson(resolve(repoRoot, path))).filter(Boolean);
}

function findReusableGateResult(inputChecksum, receipts) {
  for (const receipt of receipts) {
    for (const result of receipt?.results ?? []) {
      if (isReusableGateResult(result, inputChecksum, receipt.expiresAt)) return { receipt, result };
    }
  }
  return null;
}

export function writeReceiptArtifacts(receipt, receiptPath, summaryOutputRoot) {
  mkdirSync(dirname(receiptPath), { recursive: true });
  writeFileSync(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`);
  writeLatestSummary(receipt, summaryOutputRoot);
}

function writeLatestSummary(receipt, summaryOutputRoot = outputRoot) {
  mkdirSync(summaryOutputRoot, { recursive: true });
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
  writeFileSync(join(summaryOutputRoot, 'latest-summary.md'), `${lines.join('\n')}\n`);
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
  process.stdout.write(`真实能力: ${plan.capabilities.join(', ') || '无'}\n`);
  process.stdout.write(`身份: ${identity.identityChecksum}\n`);
  if (value.blockers?.length) process.stdout.write(`阻断项: ${value.blockers.join(', ')}\n`);
  if (value.reusableReceiptId) process.stdout.write(`复用 receipt: ${value.reusableReceiptId}\n`);
  if (value.reusedWholeReceipt) process.stdout.write('整份 receipt 已复用并写入当前流水线输出\n');
  if (value.receipt) process.stdout.write(`结果: ${value.receipt.status}\nreceipt: ${value.receipt.receiptId}\n`);
}

function gitNul(args) {
  const output = execFileSync('git', args, {
    cwd: repoRoot,
    encoding: 'buffer',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  return output.toString('utf8').split('\0').filter(Boolean);
}

function gitText(args) {
  return execFileSync('git', args, { cwd: repoRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

function gitExitCode(args) {
  return spawnSync('git', args, { cwd: repoRoot, stdio: 'ignore' }).status ?? 1;
}

function workingTreeFiles() {
  return [...new Set([
    ...gitNul(['diff', '--name-only', '-z', 'HEAD', '--']),
    ...gitNul(['ls-files', '--others', '--exclude-standard', '-z']),
  ])].sort();
}

function loadCandidateLock(options, blockers) {
  if (options.stage !== 'release') return null;
  if (!options.candidateLock) return null;
  try {
    const head = gitText(['rev-parse', 'HEAD']).toLowerCase();
    return validateReleaseCandidateLockBinding(
      JSON.parse(readFileSync(resolve(repoRoot, options.candidateLock), 'utf8')),
      head,
    );
  } catch (error) {
    blockers.push(error instanceof Error ? error.message : 'release_candidate_lock_invalid');
    return null;
  }
}

function resolveCandidateIdentity(options, candidateLock) {
  if (!['candidate', 'release'].includes(options.stage)) return null;
  if (options.stage === 'release' && candidateLock) {
    const repository = options.repository || process.env.GITHUB_REPOSITORY || gitRepository();
    const runtimeCommit = candidateLock.identity.runtimeCommit;
    return {
      repository,
      branch: candidateLock.branch,
      workflow: options.workflow || process.env.GITHUB_WORKFLOW || 'ami-brain-release-candidate',
      eventName: options.eventName || 'release_candidate',
      baseCommit: runtimeCommit,
      headCommit: runtimeCommit,
      mergeBaseCommit: runtimeCommit,
      candidateKey: candidateLock.candidateId,
    };
  }
  const baseCommit = options.baseCommit || process.env.BRAIN_BASE_COMMIT || process.env.GITHUB_BASE_SHA;
  const headCommit = options.headCommit || process.env.BRAIN_HEAD_COMMIT || process.env.GITHUB_HEAD_SHA || process.env.GITHUB_SHA;
  if (!baseCommit || !headCommit) return null;
  const mergeBaseCommit = options.mergeBaseCommit || process.env.BRAIN_MERGE_BASE || gitText(['merge-base', baseCommit, headCommit]);
  for (const commit of [baseCommit, headCommit, mergeBaseCommit]) {
    if (gitExitCode(['cat-file', '-e', `${commit}^{commit}`]) !== 0) throw new Error(`candidate_commit_invalid:${commit}`);
  }
  const repository = options.repository || process.env.GITHUB_REPOSITORY || gitRepository();
  const branch = options.branch
    || process.env.GITHUB_HEAD_REF
    || process.env.GITHUB_REF_NAME
    || gitTextOptional(['branch', '--show-current'])
    || null;
  const eventName = options.eventName || process.env.GITHUB_EVENT_NAME || 'manual';
  const workflow = options.workflow || process.env.GITHUB_WORKFLOW || process.env.BRAIN_GOVERNANCE_RECEIPT_ISSUER || 'local-ci';
  const candidateKey = options.candidateKey || `${repository}:${headCommit}:${mergeBaseCommit}`;
  return { repository, branch, workflow, eventName, baseCommit, headCommit, mergeBaseCommit, candidateKey };
}

function gitRepository() {
  const remote = gitTextOptional(['config', '--get', 'remote.origin.url']);
  return remote.replace(/^git@github\.com:/, '').replace(/^https:\/\/github\.com\//, '').replace(/\.git$/, '') || 'local/beauty-salon-admin';
}

function gitTextOptional(args) {
  try {
    return gitText(args);
  } catch {
    return '';
  }
}

function resolveCapabilityKeys(plan) {
  if (!plan.capabilityImpacts.includes('all_runtime')) return [];
  const changedSources = plan.files
    .filter((file) => file.startsWith('packages/server-v2/src/brain/capability/executors/') && file.endsWith('.ts'))
    .map((file) => resolve(repoRoot, file))
    .filter((file) => existsSync(file));
  const sources = changedSources.length ? changedSources : capabilitySourceFiles(resolve(serverRoot, 'src/brain/capability/executors'));
  return [...new Set(sources.flatMap((file) => extractCapabilityKeys(readFileSync(file, 'utf8'))))].sort();
}

function capabilitySourceFiles(root) {
  if (!existsSync(root)) return [];
  return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const path = join(root, entry.name);
    if (entry.isDirectory()) return capabilitySourceFiles(path);
    return entry.isFile() && entry.name.endsWith('.ts') && !entry.name.endsWith('.spec.ts') ? [path] : [];
  });
}

async function uploadReceipt(receipt) {
  const endpoint = process.env.BRAIN_GOVERNANCE_RECEIPT_URL;
  if (!endpoint) throw new Error('receipt_upload_url_missing');
  const body = JSON.stringify(receipt);
  const headers = await createReceiptUploadHeaders(receipt);
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...headers,
    },
    body,
  });
  if (!response.ok) throw new Error(`receipt_upload_failed:${response.status}:${(await response.text()).slice(0, 300)}`);
}

export async function createReceiptUploadHeaders(
  receipt,
  { environment = process.env, fetchImpl = fetch, now = () => new Date() } = {},
) {
  const requestUrl = environment.ACTIONS_ID_TOKEN_REQUEST_URL;
  const requestToken = environment.ACTIONS_ID_TOKEN_REQUEST_TOKEN;
  const audience = environment.BRAIN_GOVERNANCE_RECEIPT_OIDC_AUDIENCE;
  if (requestUrl && requestToken) {
    if (!audience) throw new Error('receipt_upload_oidc_audience_missing');
    const separator = requestUrl.includes('?') ? '&' : '?';
    const response = await fetchImpl(`${requestUrl}${separator}audience=${encodeURIComponent(audience)}`, {
      headers: { authorization: `Bearer ${requestToken}` },
    });
    if (!response.ok) throw new Error(`receipt_upload_oidc_token_failed:${response.status}`);
    const token = String((await response.json())?.value ?? '').trim();
    if (!token) throw new Error('receipt_upload_oidc_token_missing');
    return { authorization: `Bearer ${token}` };
  }

  if (environment.BRAIN_GOVERNANCE_RECEIPT_ALLOW_HMAC_FALLBACK !== 'true') {
    throw new Error('receipt_upload_oidc_identity_required');
  }
  const secret = environment.BRAIN_GOVERNANCE_RECEIPT_INGEST_SECRET;
  if (!secret) throw new Error('receipt_upload_secret_missing');
  const timestamp = now().toISOString();
  const issuer = environment.GITHUB_WORKFLOW || environment.BRAIN_GOVERNANCE_RECEIPT_ISSUER || 'local-ci';
  const bodyChecksum = checksum(stableStringify(receipt));
  const signature = createHmac('sha256', secret).update(`${timestamp}.${issuer}.${bodyChecksum}`).digest('hex');
  return {
    'x-brain-receipt-timestamp': timestamp,
    'x-brain-receipt-signature': signature,
    'x-brain-receipt-issuer': issuer,
  };
}

function readJson(path) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return null;
  }
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
