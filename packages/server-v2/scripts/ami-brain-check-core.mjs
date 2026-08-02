import { createHash } from 'node:crypto';

export const STAGES = ['dev', 'candidate', 'release', 'observe'];
export const RISK_ORDER = ['low', 'medium', 'high', 'critical'];
export const PREVALIDATED_GATE_ALLOWLIST = Object.freeze([
  'frontend_typecheck',
  'frontend_brain_unit',
  'permission_unit',
  'cross_client_contract',
  'backend_build',
]);

export const GATE_CATALOG = Object.freeze({
  brain_unit: {
    cwd: 'packages/server-v2',
    command: ['npm', 'test', '--', 'src/brain/brain.controller.spec.ts', '--runInBand'],
    description: 'Brain controller 定向单测',
  },
  governance_unit: {
    cwd: 'packages/server-v2',
    command: [
      'npm',
      'test',
      '--',
      'src/brain/brain.controller.spec.ts',
      'src/brain/governance/brain-governance-resource.service.spec.ts',
      'src/brain/governance/brain-release.service.spec.ts',
      '--runInBand',
    ],
    description: 'Brain 治理与发布定向单测',
  },
  permission_unit: {
    cwd: '.',
    command: ['npm', 'run', 'test', '--', 'src/test/permissions.test.ts'],
    description: '前端权限目录单测',
  },
  frontend_brain_unit: {
    cwd: '.',
    command: ['npm', 'run', 'test', '--', 'src/app/pages/brain/BrainGovernanceCenter.test.tsx'],
    description: '治理中心组件单测',
  },
  frontend_typecheck: {
    cwd: '.',
    command: ['npm', 'run', 'typecheck:test'],
    description: '管理端类型检查',
  },
  backend_build: {
    cwd: 'packages/server-v2',
    command: ['npm', 'run', 'build'],
    description: '统一后端构建',
  },
  prisma_validate: {
    cwd: 'packages/server-v2',
    command: ['npx', 'prisma', 'validate', '--schema=prisma/schema.prisma'],
    description: 'Prisma schema 校验',
  },
  brain_contract: {
    cwd: 'packages/server-v2',
    command: ['npm', 'run', 'brain:release:acceptance:test'],
    description: 'Brain 候选合同门禁',
  },
  action_contract: {
    cwd: 'packages/server-v2',
    command: ['node', '--test', 'scripts/ami-brain-action-release-contract.test.mjs'],
    description: 'Brain Action 发布合同',
  },
  cross_client_contract: {
    cwd: '.',
    command: ['npm', 'run', 'check:ami-brain-cross-client-contract'],
    description: 'Brain 跨端合同',
  },
  migration_contract: {
    cwd: 'packages/server-v2',
    command: ['npm', 'run', 'brain:migration:acceptance', '--', '--apply', '--yes'],
    description: 'Brain 隔离迁移验收',
  },
  release_acceptance: {
    cwd: 'packages/server-v2',
    command: ['npm', 'run', 'brain:release:acceptance'],
    description: 'Brain 正式发布签收',
  },
  full_domain_observe: {
    cwd: 'packages/server-v2',
    command: ['npm', 'run', 'brain:eval:full-domain'],
    description: 'Brain 全领域观察评测',
  },
  brain_check_unit: {
    cwd: 'packages/server-v2',
    command: [
      'node',
      '--test',
      'scripts/ami-brain-check.test.mjs',
      'scripts/ami-brain-candidate-identity-core.test.mjs',
      'scripts/ami-brain-release-candidate.test.mjs',
    ],
    description: '统一门禁编排器单测',
  },
});

export function parseArgs(argv) {
  const options = {
    stage: 'dev',
    dryRun: false,
    force: false,
    json: false,
    uploadReceipt: false,
    consumeGateReceipts: [],
    prevalidatedGates: [],
  };
  for (const argument of argv) {
    if (argument.startsWith('--stage=')) options.stage = argument.slice('--stage='.length);
    else if (argument === '--dry-run') options.dryRun = true;
    else if (argument === '--force') options.force = true;
    else if (argument === '--json') options.json = true;
    else if (argument === '--upload-receipt') options.uploadReceipt = true;
    else if (argument.startsWith('--scope=')) {
      options.scope = argument.slice('--scope='.length).split(',').map((item) => item.trim()).filter(Boolean);
    } else if (argument.startsWith('--repository=')) options.repository = argument.slice('--repository='.length).trim();
    else if (argument.startsWith('--branch=')) options.branch = argument.slice('--branch='.length).trim();
    else if (argument.startsWith('--workflow=')) options.workflow = argument.slice('--workflow='.length).trim();
    else if (argument.startsWith('--event-name=')) options.eventName = argument.slice('--event-name='.length).trim();
    else if (argument.startsWith('--base-commit=')) options.baseCommit = argument.slice('--base-commit='.length).trim();
    else if (argument.startsWith('--head-commit=')) options.headCommit = argument.slice('--head-commit='.length).trim();
    else if (argument.startsWith('--merge-base=')) options.mergeBaseCommit = argument.slice('--merge-base='.length).trim();
    else if (argument.startsWith('--candidate-key=')) options.candidateKey = argument.slice('--candidate-key='.length).trim();
    else if (argument.startsWith('--eval-run-id=')) options.evalRunId = Number(argument.slice('--eval-run-id='.length));
    else if (argument.startsWith('--evaluation-release-id=')) options.evaluationReleaseId = Number(argument.slice('--evaluation-release-id='.length));
    else if (argument.startsWith('--receipt-output=')) options.receiptOutput = argument.slice('--receipt-output='.length).trim();
    else if (argument.startsWith('--candidate-lock=')) options.candidateLock = argument.slice('--candidate-lock='.length).trim();
    else if (argument.startsWith('--consume-gate-receipt=')) {
      const path = argument.slice('--consume-gate-receipt='.length).trim();
      if (path) options.consumeGateReceipts.push(path);
    } else if (argument.startsWith('--prevalidated-gate=')) {
      const gate = argument.slice('--prevalidated-gate='.length).trim();
      if (gate) options.prevalidatedGates.push(gate);
    } else if (argument === '--help' || argument === '-h') options.help = true;
    else throw new Error(`unknown_argument:${argument}`);
  }
  if (!STAGES.includes(options.stage)) throw new Error(`invalid_stage:${options.stage}`);
  for (const [key, value] of [['evalRunId', options.evalRunId], ['evaluationReleaseId', options.evaluationReleaseId]]) {
    if (value !== undefined && (!Number.isInteger(value) || value <= 0)) throw new Error(`invalid_${key}`);
  }
  return options;
}

export function selectPlanFiles({ stage, detectedFiles, scope = [] }) {
  const explicitScope = [...new Set(scope.filter(Boolean))].sort();
  if (stage === 'dev' && explicitScope.length) return explicitScope;
  return [...new Set([...detectedFiles, ...explicitScope].filter(Boolean))].sort();
}

export function matchesPattern(file, pattern) {
  const escaped = pattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*\*/g, '\u0000')
    .replace(/\*/g, '[^/]*')
    .replace(/\u0000/g, '.*');
  return new RegExp(`^${escaped}$`).test(file);
}

export function createImpactPlan({ files, stage, manifest }) {
  const matchedFiles = [];
  const ignoredFiles = [];
  const unknownSensitiveFiles = [];
  const matchedRuleIds = new Set();
  const domains = new Set();
  const contracts = new Set();
  const capabilityImpacts = new Set();
  const gateIds = new Set();
  const gateFiles = new Map();
  let riskLevel = 'low';

  for (const file of files) {
    const rules = manifest.rules.filter((rule) => rule.patterns.some((pattern) => matchesPattern(file, pattern)));
    if (!rules.length) {
      if (manifest.sensitivePrefixes.some((prefix) => file.startsWith(prefix))) {
        unknownSensitiveFiles.push(file);
        matchedFiles.push(file);
        riskLevel = maxRisk(riskLevel, 'high');
        capabilityImpacts.add('all_runtime');
        addGate(gateIds, gateFiles, 'backend_build', file);
        addGate(gateIds, gateFiles, 'brain_contract', file);
      } else ignoredFiles.push(file);
      continue;
    }
    matchedFiles.push(file);
    for (const rule of rules) {
      matchedRuleIds.add(rule.id);
      riskLevel = maxRisk(riskLevel, rule.riskLevel);
      for (const value of rule.domains ?? rule.capabilities ?? []) domains.add(value);
      if (rule.capabilityImpact) capabilityImpacts.add(rule.capabilityImpact);
      for (const value of rule.contracts ?? []) contracts.add(value);
      for (const value of rule.gates?.[stage] ?? []) addGate(gateIds, gateFiles, value, file);
    }
  }

  if (!matchedFiles.length) addGate(gateIds, gateFiles, 'brain_check_unit');
  const gates = [...gateIds].map((id) => {
    const gate = GATE_CATALOG[id];
    if (!gate) throw new Error(`unknown_gate:${id}`);
    return { id, ...gate, files: [...(gateFiles.get(id) ?? [])].sort() };
  });
  return {
    stage,
    riskLevel,
    files: [...new Set(matchedFiles)].sort(),
    ignoredFiles: [...new Set(ignoredFiles)].sort(),
    unknownSensitiveFiles: [...new Set(unknownSensitiveFiles)].sort(),
    matchedRuleIds: [...matchedRuleIds].sort(),
    domains: [...domains].sort(),
    capabilities: [],
    capabilityImpacts: [...capabilityImpacts].sort(),
    contracts: [...contracts].sort(),
    gates,
  };
}

export function withResolvedCapabilities(plan, capabilityKeys) {
  return {
    ...plan,
    capabilities: [...new Set(capabilityKeys.filter((key) => /^[a-z][a-z0-9_]{1,127}$/.test(key)))].sort(),
  };
}

export function withReleaseCandidateCloseGate(plan, candidateLock) {
  if (plan.stage !== 'release') return plan;
  if (!candidateLock) throw new Error('release_candidate_lock_required');
  const existing = plan.gates.filter((gate) => gate.id !== 'release_candidate_close');
  return {
    ...plan,
    gates: [
      ...existing,
      {
        id: 'release_candidate_close',
        cwd: 'packages/server-v2',
        command: [
          'npm',
          'run',
          'brain:release:candidate',
          '--',
          'close',
          `--candidate-lock=${candidateLock}`,
        ],
        description: 'Ami Brain 同候选证据关闭门禁',
        files: [],
      },
    ],
  };
}

export function releaseIdentityBlockers(identity) {
  if (identity.stage !== 'release') return [];
  const blockers = [];
  if (!identity.evalRunId || !identity.evaluationReleaseId) blockers.push('release_evaluation_identity_required');
  if (!identity.releaseFingerprint || !identity.dataSnapshot || !identity.provider || !identity.model) {
    blockers.push('release_runtime_identity_required');
  }
  if (!identity.candidateId) blockers.push('release_candidate_id_required');
  return blockers;
}

export function extractCapabilityKeys(source) {
  const keys = new Set();
  let cursor = 0;
  while (cursor < source.length) {
    const decoratorStart = source.indexOf('@BrainCapability', cursor);
    if (decoratorStart < 0) break;
    const openParen = source.indexOf('(', decoratorStart + '@BrainCapability'.length);
    if (openParen < 0) break;
    const objectStart = skipWhitespace(source, openParen + 1);
    if (source[objectStart] !== '{') {
      cursor = openParen + 1;
      continue;
    }
    const objectEnd = findBalancedObjectEnd(source, objectStart);
    if (objectEnd < 0) {
      cursor = objectStart + 1;
      continue;
    }
    const objectSource = source.slice(objectStart, objectEnd + 1);
    const match = objectSource.match(/(?:^|[,{]\s*)key\s*:\s*['"]([a-z][a-z0-9_]{1,127})['"]/);
    if (match) keys.add(match[1]);
    cursor = objectEnd + 1;
  }
  return [...keys].sort();
}

export function maxRisk(left, right) {
  return RISK_ORDER.indexOf(left) >= RISK_ORDER.indexOf(right) ? left : right;
}

export function checksum(value) {
  const text = typeof value === 'string' ? value : stableStringify(value);
  return createHash('sha256').update(text).digest('hex');
}

export function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

export function createIdentity({ plan, source, environment }) {
  const suiteChecksum = checksum(plan.gates.map((gate) => ({
    id: gate.id,
    cwd: gate.cwd,
    command: gate.command,
  })));
  const identity = {
    stage: plan.stage,
    riskLevel: plan.riskLevel,
    changedFilesChecksum: checksum(plan.files),
    diffChecksum: source.diffChecksum,
    sourceFingerprint: source.sourceFingerprint,
    releaseFingerprint: environment.releaseFingerprint ?? null,
    suiteChecksum,
    dataSnapshot: environment.dataSnapshot ?? null,
    provider: environment.provider ?? null,
    model: environment.model ?? null,
    timeout: environment.timeout ?? null,
    repository: source.repository ?? null,
    branch: source.branch ?? null,
    workflow: source.workflow ?? null,
    eventName: source.eventName ?? null,
    baseCommit: source.baseCommit ?? null,
    mergeBaseCommit: source.mergeBaseCommit ?? null,
    headCommit: source.headCommit ?? source.head ?? null,
    candidateKey: source.candidateKey ?? null,
    candidateId: environment.candidateId ?? null,
    evalRunId: source.evalRunId ?? null,
    evaluationReleaseId: source.evaluationReleaseId ?? null,
  };
  return { ...identity, identityChecksum: checksum(identity) };
}

export function createGateInputChecksum({ gate, identity, fileFingerprints = {} }) {
  const gateFiles = gate.files ?? [];
  return checksum({
    gateKey: gate.id,
    cwd: gate.cwd,
    command: gate.command,
    stage: identity.stage,
    riskLevel: identity.riskLevel,
    files: gateFiles,
    fileFingerprints: Object.fromEntries(gateFiles.map((file) => [file, fileFingerprints[file] ?? null])),
    releaseFingerprint: identity.releaseFingerprint,
    dataSnapshot: identity.dataSnapshot,
    provider: identity.provider,
    model: identity.model,
    timeout: identity.timeout,
    baseCommit: identity.baseCommit,
    mergeBaseCommit: identity.mergeBaseCommit,
    headCommit: identity.headCommit,
    candidateId: identity.candidateId,
    evalRunId: identity.evalRunId,
    evaluationReleaseId: identity.evaluationReleaseId,
  });
}

export function isReusableReceipt(receipt, identity, now = Date.now()) {
  if (!receipt || receipt.schemaVersion !== 3 || receipt.status !== 'passed') return false;
  if (identity.stage === 'release') {
    if (!identity.candidateId || !receipt.candidateId) return false;
    if (receipt.candidateId !== identity.candidateId) return false;
  }
  if (receipt.identityChecksum !== identity.identityChecksum) return false;
  return Number.isFinite(Date.parse(receipt.expiresAt)) && Date.parse(receipt.expiresAt) > now;
}

export function isReusableGateResult(result, inputChecksum, expiresAt, now = Date.now()) {
  if (!result || result.status !== 'passed' || result.inputChecksum !== inputChecksum) return false;
  return Number.isFinite(Date.parse(expiresAt)) && Date.parse(expiresAt) > now;
}

export function createPrevalidatedGateResult({ gate, inputChecksum, pipelineEvidence, now = new Date() }) {
  if (!PREVALIDATED_GATE_ALLOWLIST.includes(gate.id)) throw new Error(`prevalidated_gate_not_allowed:${gate.id}`);
  const outputChecksum = checksum({ source: 'required_pipeline_jobs', pipelineEvidence, gateKey: gate.id });
  return {
    gateId: gate.id,
    gateKey: gate.id,
    description: gate.description,
    command: gate.command,
    status: 'passed',
    exitCode: 0,
    inputChecksum,
    outputChecksum,
    resultChecksum: checksum({ gateId: gate.id, inputChecksum, exitCode: 0, outputChecksum }),
    durationMs: 0,
    modelInvocationCount: 0,
    reused: true,
    reusedFromPipeline: true,
    pipelineEvidence,
    startedAt: now.toISOString(),
    finishedAt: now.toISOString(),
  };
}

export function validatePrevalidatedGateSelection({ stage, gateIds, githubActions, allowed }) {
  const selected = [...new Set(gateIds)];
  if (!selected.length) return [];
  const blockers = [];
  if (stage !== 'candidate' || githubActions !== 'true' || allowed !== 'true') {
    blockers.push('prevalidated_gates_require_trusted_candidate_pipeline');
  }
  for (const gateId of selected) {
    if (!PREVALIDATED_GATE_ALLOWLIST.includes(gateId)) blockers.push(`prevalidated_gate_not_allowed:${gateId}`);
  }
  return blockers;
}

function addGate(gateIds, gateFiles, gateId, file) {
  gateIds.add(gateId);
  if (!gateFiles.has(gateId)) gateFiles.set(gateId, new Set());
  if (file) gateFiles.get(gateId).add(file);
}

function skipWhitespace(source, start) {
  let cursor = start;
  while (cursor < source.length && /\s/.test(source[cursor])) cursor += 1;
  return cursor;
}

function findBalancedObjectEnd(source, start) {
  let depth = 0;
  let quote = null;
  let escaped = false;
  let lineComment = false;
  let blockComment = false;
  for (let cursor = start; cursor < source.length; cursor += 1) {
    const character = source[cursor];
    const next = source[cursor + 1];
    if (lineComment) {
      if (character === '\n') lineComment = false;
      continue;
    }
    if (blockComment) {
      if (character === '*' && next === '/') {
        blockComment = false;
        cursor += 1;
      }
      continue;
    }
    if (quote) {
      if (escaped) escaped = false;
      else if (character === '\\') escaped = true;
      else if (character === quote) quote = null;
      continue;
    }
    if (character === '/' && next === '/') {
      lineComment = true;
      cursor += 1;
      continue;
    }
    if (character === '/' && next === '*') {
      blockComment = true;
      cursor += 1;
      continue;
    }
    if (character === "'" || character === '"' || character === '`') {
      quote = character;
      continue;
    }
    if (character === '{') depth += 1;
    else if (character === '}') {
      depth -= 1;
      if (depth === 0) return cursor;
    }
  }
  return -1;
}
