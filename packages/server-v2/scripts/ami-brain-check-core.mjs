import { createHash } from 'node:crypto';

export const STAGES = ['dev', 'candidate', 'release', 'observe'];
export const RISK_ORDER = ['low', 'medium', 'high', 'critical'];

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
    command: ['npm', 'run', 'brain:migration:acceptance'],
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
    command: ['node', '--test', 'scripts/ami-brain-check.test.mjs'],
    description: '统一门禁编排器单测',
  },
});

export function parseArgs(argv) {
  const options = { stage: 'dev', dryRun: false, force: false, json: false };
  for (const argument of argv) {
    if (argument.startsWith('--stage=')) options.stage = argument.slice('--stage='.length);
    else if (argument === '--dry-run') options.dryRun = true;
    else if (argument === '--force') options.force = true;
    else if (argument === '--json') options.json = true;
    else if (argument.startsWith('--scope=')) {
      options.scope = argument.slice('--scope='.length).split(',').map((item) => item.trim()).filter(Boolean);
    } else if (argument === '--help' || argument === '-h') options.help = true;
    else throw new Error(`unknown_argument:${argument}`);
  }
  if (!STAGES.includes(options.stage)) throw new Error(`invalid_stage:${options.stage}`);
  return options;
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
  const capabilities = new Set();
  const contracts = new Set();
  const gateIds = new Set();
  let riskLevel = 'low';

  for (const file of files) {
    const rules = manifest.rules.filter((rule) => rule.patterns.some((pattern) => matchesPattern(file, pattern)));
    if (!rules.length) {
      if (manifest.sensitivePrefixes.some((prefix) => file.startsWith(prefix))) {
        unknownSensitiveFiles.push(file);
        matchedFiles.push(file);
        riskLevel = maxRisk(riskLevel, 'high');
        gateIds.add('backend_build');
        gateIds.add('brain_contract');
      } else ignoredFiles.push(file);
      continue;
    }
    matchedFiles.push(file);
    for (const rule of rules) {
      matchedRuleIds.add(rule.id);
      riskLevel = maxRisk(riskLevel, rule.riskLevel);
      for (const value of rule.capabilities ?? []) capabilities.add(value);
      for (const value of rule.contracts ?? []) contracts.add(value);
      for (const value of rule.gates?.[stage] ?? []) gateIds.add(value);
    }
  }

  if (!matchedFiles.length) gateIds.add('brain_check_unit');
  const gates = [...gateIds].map((id) => {
    const gate = GATE_CATALOG[id];
    if (!gate) throw new Error(`unknown_gate:${id}`);
    return { id, ...gate };
  });
  return {
    stage,
    riskLevel,
    files: [...new Set(matchedFiles)].sort(),
    ignoredFiles: [...new Set(ignoredFiles)].sort(),
    unknownSensitiveFiles: [...new Set(unknownSensitiveFiles)].sort(),
    matchedRuleIds: [...matchedRuleIds].sort(),
    capabilities: [...capabilities].sort(),
    contracts: [...contracts].sort(),
    gates,
  };
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
  const suiteChecksum = checksum(plan.gates.map((gate) => gate.id));
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
  };
  return { ...identity, identityChecksum: checksum(identity) };
}

export function isReusableReceipt(receipt, identity, now = Date.now()) {
  if (!receipt || receipt.status !== 'passed') return false;
  if (receipt.identityChecksum !== identity.identityChecksum) return false;
  return Number.isFinite(Date.parse(receipt.expiresAt)) && Date.parse(receipt.expiresAt) > now;
}
