import { execFileSync } from 'child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, relative, resolve } from 'path';

type GateStatus = 'pass' | 'fail';

type HandoffGate = {
  id: string;
  title: string;
  expected: string;
  actual: string;
  status: GateStatus;
  impact: string;
};

type ChangedFile = {
  status: string;
  path: string;
  category: string;
};

type ReleaseBatch = {
  id: string;
  title: string;
  purpose: string;
  fileCount: number;
  categories: string[];
  files: string[];
  validation: string[];
  risk: string;
};

type ReportValue = Record<string, any>;

type StageDryRun = {
  ok: boolean;
  expectedFileCount: number;
  dryRunEntryCount: number;
  command: string;
  outputPreview: string[];
  error: string | null;
};

const workspaceRoot = resolve(process.cwd(), '../..');
const docsRoot = resolve(workspaceRoot, 'docs/04-测试数据/Agent评测与知识治理-2026-06-30至07-03');
const outputJsonPath = resolve(docsRoot, 'agent-v2-github-release-handoff.json');
const outputMdPath = resolve(docsRoot, 'agent-v2-github-release-handoff.md');
const outputPrBriefPath = resolve(docsRoot, 'agent-v2-github-pr-brief.md');
const outputStageManifestPath = resolve(docsRoot, 'agent-v2-github-stage-manifest.txt');
const outputStageManifestJsonPath = resolve(docsRoot, 'agent-v2-github-stage-manifest.json');

const reportFiles = {
  releaseReadinessAudit: 'agent-v2-release-readiness-audit.json',
  localCompletionAudit: 'agent-v2-local-completion-audit.json',
  productionRolloutPlan: 'agent-v2-production-rollout-plan.json',
  productionConfigReadiness: 'agent-v2-production-config-readiness.json',
  productionLiveConfigAudit: 'agent-v2-production-live-config-audit.json',
  productionDeploymentSyncAudit: 'agent-v2-production-deployment-sync-audit.json',
};

function main() {
  const changedFiles = collectChangedFiles();
  const reports = readReports();
  const batches = buildReleaseBatches(changedFiles);
  const stageManifestFiles = collectBatchFiles(batches);
  writeStageManifestText(outputStageManifestPath, stageManifestFiles);
  const stageDryRun = runStageDryRun(outputStageManifestPath, stageManifestFiles.length);
  const gates = buildGates({ changedFiles, reports, batches, stageDryRun });
  const blockers = gates.filter((gate) => gate.status !== 'pass');
  const handoffReady = blockers.length === 0;
  const report = {
    generatedAt: formatShanghaiTime(new Date()),
    summary: {
      handoffReady,
      gateCount: gates.length,
      blockerCount: blockers.length,
      authorizationRequired: true,
      changedEntryCount: changedFiles.length,
      releaseBatchCount: batches.length,
      secretFindingCount: reports.releaseReadinessAudit?.summary?.secretFindingCount ?? 'n/a',
      localClosureReady: reports.localCompletionAudit?.summary?.localClosureReady === true,
      rolloutPlanReady: reports.productionRolloutPlan?.summary?.rolloutPlanReady === true,
      productionConfigReady: reports.productionConfigReadiness?.summary?.pass === true,
      productionHookTriggerReady: reports.productionLiveConfigAudit?.summary?.productionHookTriggerReady === true,
      deploymentSyncProven: reports.productionDeploymentSyncAudit?.summary?.deploymentSyncProven === true,
      stageManifestReady: handoffReady,
      stageManifestPath: relativePath(outputStageManifestPath),
      stageManifestJsonPath: relativePath(outputStageManifestJsonPath),
      stageDryRunReady: stageDryRun.ok,
      stageDryRunEntryCount: stageDryRun.dryRunEntryCount,
      stageDryRunExpectedCount: stageDryRun.expectedFileCount,
      recommendedReleaseShape: changedFiles.length > 0
        ? '单个 Agent V2 发布 PR，必要时按报告批次拆分提交。'
        : '当前没有待提交改动。',
      recommendation: handoffReady
        ? 'GitHub 发布交接已就绪；下一步需要用户授权 stage/commit/PR，再由 Zeabur 自动部署 GitHub 提交。'
        : 'GitHub 发布交接仍有阻塞；先修复失败门禁后再进入提交/PR 授权。',
    },
    source: {
      reports: Object.fromEntries(Object.entries(reportFiles).map(([key, file]) => [key, relativePath(reportPath(file))])),
      prBrief: relativePath(outputPrBriefPath),
      stageManifest: relativePath(outputStageManifestPath),
      stageManifestJson: relativePath(outputStageManifestJsonPath),
    },
    gates,
    blockers,
    batches,
    changedFiles,
    stageDryRun,
    proposedCommandsAfterAuthorization: [
      'git diff --check',
      'npm.cmd --prefix packages/server-v2 run agent-v2:release-readiness-audit',
      'npm.cmd --prefix packages/server-v2 run agent-v2:github-release-handoff:strict',
      `git add --pathspec-from-file "${relativePath(outputStageManifestPath)}"`,
      'git diff --cached --stat',
      'git diff --cached --check',
      'git commit -m "feat(agent-v2): complete knowledge graph llm governance rollout"',
      'git push origin <branch>',
    ],
    boundaries: [
      '本交接报告只读取本地 Git 状态和已有 Agent V2 报告，不 stage、不 commit、不 push。',
      'handoffReady=true 只代表提交/PR 交接材料齐备，不代表生产已上线。',
      '生产 hook、生产 DB 写入、旧正则删除和 Zeabur 配置变更仍必须等待明确授权。',
    ],
  };

  writeJson(outputJsonPath, report);
  writeMarkdown(outputMdPath, report);
  writePrBrief(outputPrBriefPath, report);
  writeStageManifest(outputStageManifestPath, outputStageManifestJsonPath, report);
  console.log(JSON.stringify(report.summary, null, 2));

  if (process.argv.includes('--strict') && !handoffReady) process.exit(1);
}

function buildGates(input: {
  changedFiles: ChangedFile[];
  reports: Record<string, ReportValue | null>;
  batches: ReleaseBatch[];
  stageDryRun: StageDryRun;
}): HandoffGate[] {
  const releaseSummary = input.reports.releaseReadinessAudit?.summary ?? {};
  return [
    gate(
      'release_readiness_present',
      '发布前安全审计已生成',
      'release readiness audit report exists',
      input.reports.releaseReadinessAudit ? 'present' : 'missing',
      Boolean(input.reports.releaseReadinessAudit),
      '发布交接必须基于最新可提交文件和 Secret 扫描结果。',
    ),
    gate(
      'no_secret_findings',
      '发布范围未发现疑似 Secret',
      'secretFindingCount=0',
      `secretFindingCount=${releaseSummary.secretFindingCount ?? '<missing>'}`,
      releaseSummary.secretFindingCount === 0,
      '避免 deploy token、Zeabur token、私钥或 API key 进入 GitHub。',
    ),
    gate(
      'local_completion_ready',
      '本地完成度审计通过',
      'localClosureReady=true',
      `localClosureReady=${input.reports.localCompletionAudit?.summary?.localClosureReady}`,
      input.reports.localCompletionAudit?.summary?.localClosureReady === true,
      '证明 task.md 本地开发闭环已收口，剩余项属于生产/真实流量/旧正则退役。',
    ),
    gate(
      'production_rollout_ready',
      '生产 rollout runbook 就绪',
      'rolloutPlanReady=true',
      `rolloutPlanReady=${input.reports.productionRolloutPlan?.summary?.rolloutPlanReady}`,
      input.reports.productionRolloutPlan?.summary?.rolloutPlanReady === true,
      '发布后能继续按 D0-D9 证据链推进生产灰度。',
    ),
    gate(
      'production_config_ready',
      '生产配置策略门禁通过',
      'production config readiness pass=true',
      `pass=${input.reports.productionConfigReadiness?.summary?.pass}`,
      input.reports.productionConfigReadiness?.summary?.pass === true,
      '确认 GitHub 提交触发 auto-publish、无 schedule、Cron 关闭和旧正则退役锁均已审计。',
    ),
    gate(
      'changed_files_grouped',
      '待发布改动已分组',
      'changedEntryCount>0 且所有改动都进入发布批次',
      `changedEntryCount=${input.changedFiles.length}, releaseBatchCount=${input.batches.length}, grouped=${new Set(input.batches.flatMap((batch) => batch.files)).size}`,
      input.changedFiles.length > 0
        && input.batches.length > 0
        && new Set(input.batches.flatMap((batch) => batch.files)).size === input.changedFiles.length,
      '后续授权提交时可按批次检查范围，避免把无关脏改混入 Agent V2 发布。',
    ),
    gate(
      'stage_manifest_dry_run',
      'Stage manifest 可被 Git dry-run 识别',
      'git add --dry-run --pathspec-from-file 成功，输出数量等于 manifest 文件数',
      `ok=${input.stageDryRun.ok}, entries=${input.stageDryRun.dryRunEntryCount}/${input.stageDryRun.expectedFileCount}`,
      input.stageDryRun.ok,
      '授权后使用同一 pathspec 文件执行 git add 的风险已提前验证；本门禁不实际 stage 文件。',
    ),
  ];
}

function buildReleaseBatches(changedFiles: ChangedFile[]): ReleaseBatch[] {
  const definitions = [
    {
      id: 'release_controls',
      title: '发布控制、workflow 与环境样例',
      categories: ['workflow-env', 'package-manifest'],
      purpose: '让 GitHub gate、auto-publish hook 条件、无定时发布策略和脚本入口可随代码一起交付。',
      validation: [
        'npm.cmd --prefix packages/server-v2 run agent-v2:production-config-readiness:strict',
        'npm.cmd --prefix packages/server-v2 run agent-v2:release-readiness-audit',
      ],
      risk: '会影响 CI 和后续生产 auto-publish 条件；当前仍不会打开生产 hook。',
    },
    {
      id: 'server_schema_scripts',
      title: '后端 schema、migration 与审计脚本',
      categories: ['server-schema', 'server-prisma-scripts'],
      purpose: '交付知识图谱、灰度规则、治理观测、生产 runbook、发布审计和旧正则退役证据链。',
      validation: [
        'npm.cmd --prefix packages/server-v2 run db:generate',
        'npm.cmd --prefix packages/server-v2 run agent-v2:local-completion-audit:strict',
        'npm.cmd --prefix packages/server-v2 run agent-v2:production-rollout-plan:strict',
      ],
      risk: '包含 Prisma migration 和生产证据脚本；提交后仍不能自动写生产库。',
    },
    {
      id: 'server_runtime',
      title: 'Agent V2 后端运行时和治理服务',
      categories: ['server-agent-v2', 'server-agent-knowledge', 'server-health'],
      purpose: '交付图谱 + LLM 意图抽取、能力映射、通用查询、Policy/Evidence/Contract、治理 API 和 health 部署元信息。',
      validation: [
        'npm.cmd --prefix packages/server-v2 run test -- --runTestsByPath src/agent-v2/agent-v2-runtime.service.spec.ts src/agent-v2/intent/agent-v2-intent-extraction.service.spec.ts src/agent-v2/query-engine/generic-query-engine.service.spec.ts src/agent-v2/governance/agent-v2-governance.service.spec.ts src/health/health.controller.spec.ts --runInBand',
        'npm.cmd --prefix packages/server-v2 run build',
      ],
      risk: '影响 Agent V2 主运行链路；生产默认仍由 gray mode 保持旧链路回退。',
    },
    {
      id: 'admin_governance',
      title: '管理端治理中心、API 与权限入口',
      categories: ['admin-agent-governance', 'admin-api', 'admin-routing-permissions'],
      purpose: '交付 Agent 治理中心、前端 API facade、路由、菜单和权限测试。',
      validation: [
        'npx.cmd vitest run src/app/pages/system/AgentGovernanceCenter.test.tsx src/test/permissions.test.ts',
        'npm.cmd run build',
      ],
      risk: '影响系统菜单和治理入口；普通门店角色仍不默认开放治理权限。',
    },
    {
      id: 'kiosk_agent_entry',
      title: 'Kiosk Agent 入口与终端适配',
      categories: ['kiosk'],
      purpose: '交付终端 agent_v1/agent_v2 选择、KG/LLM 架构透传和快捷动作保护。',
      validation: [
        'npm.cmd --prefix packages/Ami-Aura-Lite-Kiosk run build',
      ],
      risk: '影响终端 Agent 使用体验；快捷收银/核销动作仍保留。',
    },
    {
      id: 'docs_and_evidence',
      title: '开发计划、方案与测试证据',
      categories: ['docs-plan', 'docs-evidence'],
      purpose: '交付 task.md 计划闭环、方案来源、评测报告、图谱报告、发布审计和生产 runbook 证据。',
      validation: [
        'npm.cmd --prefix packages/server-v2 run agent-v2:release-readiness-audit',
        'npm.cmd --prefix packages/server-v2 run agent-v2:github-release-handoff:strict',
      ],
      risk: '主要是交付证据；报告应与代码门禁结果保持同步。',
    },
  ];

  return definitions
    .map((definition) => {
      const files = changedFiles
        .filter((file) => definition.categories.includes(file.category))
        .map((file) => file.path)
        .sort((a, b) => a.localeCompare(b));
      return {
        id: definition.id,
        title: definition.title,
        purpose: definition.purpose,
        fileCount: files.length,
        categories: definition.categories,
        files,
        validation: definition.validation,
        risk: definition.risk,
      };
    })
    .filter((batch) => batch.fileCount > 0);
}

function collectBatchFiles(batches: ReleaseBatch[]) {
  return Array.from(new Set(batches.flatMap((batch) => batch.files))).sort((a, b) => a.localeCompare(b));
}

function runStageDryRun(path: string, expectedFileCount: number): StageDryRun {
  const command = `git add --dry-run --pathspec-from-file "${relativePath(path)}"`;
  try {
    const output = execFileSync('git', ['add', '--dry-run', '--pathspec-from-file', relativePath(path)], {
      cwd: workspaceRoot,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const lines = output.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    return {
      ok: lines.length === expectedFileCount,
      expectedFileCount,
      dryRunEntryCount: lines.length,
      command,
      outputPreview: lines.slice(0, 20),
      error: null,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      ok: false,
      expectedFileCount,
      dryRunEntryCount: 0,
      command,
      outputPreview: [],
      error: message,
    };
  }
}

function collectChangedFiles(): ChangedFile[] {
  const output = gitOutput(['status', '--porcelain=v1', '-z', '-uall']);
  const entries = output.split('\0').filter(Boolean);
  const files: ChangedFile[] = [];
  for (let index = 0; index < entries.length; index += 1) {
    const entry = entries[index];
    const status = entry.slice(0, 2).trim();
    let path = entry.slice(2).trimStart();
    if ((status.includes('R') || status.includes('C')) && entries[index + 1]) {
      path = entries[index + 1];
      index += 1;
    }
    files.push({ status, path, category: categorize(path) });
  }
  return files;
}

function categorize(path: string) {
  const normalized = path.replace(/\\/g, '/');
  if (normalized.startsWith('.github/') || normalized.endsWith('.env.example') || normalized === '.env.production.example') return 'workflow-env';
  if (normalized.endsWith('package.json') || normalized.endsWith('package-lock.json')) return 'package-manifest';
  if (normalized.startsWith('packages/server-v2/prisma/migrations/') || normalized === 'packages/server-v2/prisma/schema.prisma') return 'server-schema';
  if (normalized.startsWith('packages/server-v2/prisma/')) return 'server-prisma-scripts';
  if (normalized.startsWith('packages/server-v2/src/agent-v2/')) return 'server-agent-v2';
  if (normalized.startsWith('packages/server-v2/src/agent/')) return 'server-agent-knowledge';
  if (normalized.startsWith('packages/server-v2/src/health/')) return 'server-health';
  if (normalized.startsWith('packages/Ami-Aura-Lite-Kiosk/')) return 'kiosk';
  if (normalized.startsWith('src/app/pages/system/AgentGovernanceCenter')) return 'admin-agent-governance';
  if (normalized.startsWith('src/api/') || normalized.startsWith('src/types/agentGovernance')) return 'admin-api';
  if (
    normalized === 'src/app/routes.tsx'
    || normalized === 'src/app/components/Layout.tsx'
    || normalized === 'src/app/pages/ami-agent/AmiAgentWorkspace.tsx'
    || normalized === 'src/config/permissions.ts'
    || normalized === 'src/test/permissions.test.ts'
    || normalized === 'src/types/product.ts'
  ) {
    return 'admin-routing-permissions';
  }
  if (normalized.startsWith('docs/03-')) return 'docs-plan';
  if (normalized.startsWith('docs/04-')) return 'docs-evidence';
  return 'unclassified';
}

function readReports() {
  return Object.fromEntries(Object.entries(reportFiles).map(([key, file]) => {
    const path = reportPath(file);
    return [key, existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : null];
  })) as Record<string, ReportValue | null>;
}

function gitOutput(args: string[]) {
  try {
    return execFileSync('git', args, {
      cwd: workspaceRoot,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim();
  } catch {
    return '';
  }
}

function gate(id: string, title: string, expected: string, actual: string, pass: boolean, impact: string): HandoffGate {
  return { id, title, expected, actual, status: pass ? 'pass' : 'fail', impact };
}

function reportPath(name: string) {
  return resolve(docsRoot, name);
}

function writeJson(path: string, value: unknown) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function writeMarkdown(path: string, report: {
  generatedAt: string;
  summary: Record<string, any>;
  source: { reports: Record<string, string> };
  gates: HandoffGate[];
  blockers: HandoffGate[];
  batches: ReleaseBatch[];
  changedFiles: ChangedFile[];
  stageDryRun: StageDryRun;
  proposedCommandsAfterAuthorization: string[];
  boundaries: string[];
}) {
  mkdirSync(dirname(path), { recursive: true });
  const lines = [
    '# Agent V2 GitHub 发布交接包',
    '',
    `生成时间：${report.generatedAt}`,
    '',
    '## 结论',
    '',
    `- 交接就绪：${report.summary.handoffReady ? '是' : '否'}`,
    `- 仍需授权：${report.summary.authorizationRequired ? '是' : '否'}`,
    `- 改动条目：${report.summary.changedEntryCount}`,
    `- 发布批次：${report.summary.releaseBatchCount}`,
    `- 疑似 Secret：${report.summary.secretFindingCount}`,
    `- 本地完成度：${report.summary.localClosureReady ? '通过' : '未通过'}`,
    `- 生产 rollout：${report.summary.rolloutPlanReady ? '就绪' : '未就绪'}`,
    `- 生产配置策略：${report.summary.productionConfigReady ? '通过' : '未通过'}`,
    `- 生产 hook 触发就绪：${report.summary.productionHookTriggerReady ? '是' : '否'}`,
    `- 生产部署同步已证明：${report.summary.deploymentSyncProven ? '是' : '否'}`,
    `- Stage manifest：${report.summary.stageManifestReady ? '就绪' : '未就绪'}`,
    `- Stage manifest 文件：\`${report.summary.stageManifestPath}\``,
    `- Stage dry-run：${report.summary.stageDryRunReady ? '通过' : '失败'} (${report.summary.stageDryRunEntryCount}/${report.summary.stageDryRunExpectedCount})`,
    `- 推荐发布形态：${report.summary.recommendedReleaseShape}`,
    `- 建议：${report.summary.recommendation}`,
    '',
    '## 门禁',
    '',
    '| 门禁 | 状态 | 期望 | 当前 | 交付影响 |',
    '| --- | --- | --- | --- | --- |',
    ...report.gates.map((gateItem) => `| ${escapeMd(gateItem.title)} | ${gateItem.status === 'pass' ? '通过' : '失败'} | ${escapeMd(gateItem.expected)} | ${escapeMd(gateItem.actual)} | ${escapeMd(gateItem.impact)} |`),
    '',
    '## 推荐发布批次',
    '',
    ...report.batches.flatMap((batch) => [
      `### ${batch.title}`,
      '',
      `- 批次 ID：${batch.id}`,
      `- 文件数：${batch.fileCount}`,
      `- 目的：${batch.purpose}`,
      `- 风险：${batch.risk}`,
      '',
      '验证：',
      '',
      ...batch.validation.map((command) => `- \`${command}\``),
      '',
      '文件：',
      '',
      ...batch.files.map((file) => `- \`${file}\``),
      '',
    ]),
    '## 授权后建议命令',
    '',
    '```powershell',
    ...report.proposedCommandsAfterAuthorization,
    '```',
    '',
    '## 来源',
    '',
    ...Object.entries(report.source.reports).map(([key, value]) => `- ${key}: \`${value}\``),
    `- stageDryRunCommand: \`${report.stageDryRun.command}\``,
    '',
    '## 边界',
    '',
    ...report.boundaries.map((item) => `- ${item}`),
  ];
  writeFileSync(path, `${lines.join('\n')}\n`, 'utf8');
}

function writePrBrief(path: string, report: {
  generatedAt: string;
  summary: Record<string, any>;
  batches: ReleaseBatch[];
  stageDryRun: StageDryRun;
  proposedCommandsAfterAuthorization: string[];
  boundaries: string[];
}) {
  mkdirSync(dirname(path), { recursive: true });
  const validationCommands = Array.from(new Set(report.batches.flatMap((batch) => batch.validation)));
  const lines = [
    '# Agent V2 GitHub PR Brief',
    '',
    `生成时间：${report.generatedAt}`,
    '',
    '## PR Title',
    '',
    'feat(agent-v2): complete knowledge graph llm governance rollout',
    '',
    '## Summary',
    '',
    '- 完成 Agent V2 知识图谱 + LLM 意图抽取 + Manifest 映射 + 通用查询引擎 + 治理中心本地闭环。',
    '- 接入 GitHub main 提交触发的 Agent V2 auto-publish hook 预留，保持无 schedule、后端 Cron 关闭和生产显式开关保护。',
    '- 补齐生产 rollout、发布安全审计、部署同步审计、GitHub 发布交接和旧正则退役证据链。',
    '',
    '## Release Batches',
    '',
    '| Batch | Files | Purpose | Risk |',
    '| --- | ---: | --- | --- |',
    ...report.batches.map((batch) => `| ${escapeMd(batch.title)} | ${batch.fileCount} | ${escapeMd(batch.purpose)} | ${escapeMd(batch.risk)} |`),
    '',
    '## Validation',
    '',
    ...validationCommands.map((command) => `- [ ] \`${command}\``),
    '',
    '## Current Gates',
    '',
    `- GitHub release handoff: ${report.summary.handoffReady ? 'ready' : 'blocked'}`,
    `- Secret findings: ${report.summary.secretFindingCount}`,
    `- Local completion: ${report.summary.localClosureReady ? 'ready' : 'blocked'}`,
    `- Production rollout: ${report.summary.rolloutPlanReady ? 'ready' : 'blocked'}`,
    `- Production hook trigger ready: ${report.summary.productionHookTriggerReady ? 'yes' : 'no'}`,
    `- Deployment sync proven: ${report.summary.deploymentSyncProven ? 'yes' : 'no'}`,
    `- Stage manifest: ${report.summary.stageManifestReady ? report.summary.stageManifestPath : 'not ready'}`,
    `- Stage dry-run: ${report.summary.stageDryRunReady ? 'ready' : 'blocked'} (${report.summary.stageDryRunEntryCount}/${report.summary.stageDryRunExpectedCount})`,
    '',
    '## Production Boundary',
    '',
    '- This PR should not enable production hook by itself.',
    '- Keep `AGENT_V2_PRODUCTION_HOOK_ENABLED=false` until Zeabur backend token env is confirmed and hook smoke is authorized.',
    '- Keep `AGENT_V2_LEGACY_RETIREMENT_CONFIRMED=false`; old regex removal still requires production shadow, useful-rate, LLM observability and rollback evidence.',
    '',
    '## After Authorization',
    '',
    '```powershell',
    ...report.proposedCommandsAfterAuthorization,
    '```',
    '',
    '## Boundaries',
    '',
    ...report.boundaries.map((item) => `- ${item}`),
  ];
  writeFileSync(path, `${lines.join('\n')}\n`, 'utf8');
}

function writeStageManifest(path: string, jsonPath: string, report: {
  generatedAt: string;
  summary: Record<string, any>;
  batches: ReleaseBatch[];
  stageDryRun: StageDryRun;
}) {
  mkdirSync(dirname(path), { recursive: true });
  const files = collectBatchFiles(report.batches);
  writeStageManifestText(path, files);
  writeJson(jsonPath, {
    generatedAt: report.generatedAt,
    fileCount: files.length,
    command: `git add --pathspec-from-file "${relativePath(path)}"`,
    dryRunCommand: report.stageDryRun.command,
    dryRunReady: report.stageDryRun.ok,
    dryRunEntryCount: report.stageDryRun.dryRunEntryCount,
    handoffReady: report.summary.handoffReady,
    authorizationRequired: report.summary.authorizationRequired,
    files,
    boundary: 'This manifest is generated only for future authorized staging. The script does not run git add.',
  });
}

function writeStageManifestText(path: string, files: string[]) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${files.join('\n')}\n`, 'utf8');
}

function escapeMd(value: string) {
  return value.replace(/\|/g, '\\|').replace(/\r?\n/g, '<br>');
}

function relativePath(path: string) {
  return relative(workspaceRoot, path).replace(/\\/g, '/');
}

function formatShanghaiTime(date: Date) {
  const formatter = new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
  return `${formatter.format(date).replace(/\//g, '-')} Asia/Shanghai`;
}

main();
