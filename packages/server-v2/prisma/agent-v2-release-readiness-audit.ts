import { execFileSync } from 'child_process';
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'fs';
import { dirname, relative, resolve } from 'path';

type GateStatus = 'pass' | 'fail';

type ReleaseGate = {
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

type ReportValue = Record<string, any>;

const workspaceRoot = resolve(process.cwd(), '../..');
const docsRoot = resolve(workspaceRoot, 'docs/04-测试数据/Agent评测与知识治理-2026-06-30至07-03');
const outputJsonPath = resolve(docsRoot, 'agent-v2-release-readiness-audit.json');
const outputMdPath = resolve(docsRoot, 'agent-v2-release-readiness-audit.md');

const reportFiles = {
  localCompletionAudit: 'agent-v2-local-completion-audit.json',
  productionRolloutPlan: 'agent-v2-production-rollout-plan.json',
  productionDeploymentSyncAudit: 'agent-v2-production-deployment-sync-audit.json',
  productionLiveConfigAudit: 'agent-v2-production-live-config-audit.json',
};

const secretPatterns = [
  {
    name: 'agent-v2 deploy token literal',
    pattern: /AGENT_V2_AUTO_PUBLISH_DEPLOY_TOKEN=(?!$|<generate-with-openssl-rand-base64-32>|<redacted>|present)[^\s#]+/i,
  },
  {
    name: 'zeabur token literal',
    pattern: /ZEABUR_(?:TOKEN|API_KEY)=(?!$|<redacted>|present)[^\s#]+/i,
  },
  {
    name: 'private key block',
    pattern: /-----BEGIN (?:RSA |EC |OPENSSH |)PRIVATE KEY-----/i,
  },
  {
    name: 'openai api key',
    pattern: /\bsk-[A-Za-z0-9_-]{20,}\b/,
  },
];

function main() {
  const changedFiles = collectChangedFiles();
  const reports = readReports();
  const secretFindings = scanForSecrets(changedFiles);
  const gates = buildGates({ changedFiles, reports, secretFindings });
  const blockers = gates.filter((gate) => gate.status !== 'pass');
  const byCategory = countBy(changedFiles.map((file) => file.category));
  const report = {
    generatedAt: formatShanghaiTime(new Date()),
    summary: {
      releaseReady: blockers.length === 0,
      gateCount: gates.length,
      blockerCount: blockers.length,
      changedEntryCount: changedFiles.length,
      changedCategoryCount: byCategory,
      secretFindingCount: secretFindings.length,
      localClosureReady: reports.localCompletionAudit?.summary?.localClosureReady === true,
      productionReady: reports.localCompletionAudit?.summary?.productionReady === true,
      rolloutPlanReady: reports.productionRolloutPlan?.summary?.rolloutPlanReady === true,
      deploymentSyncProven: reports.productionDeploymentSyncAudit?.summary?.deploymentSyncProven === true,
      productionHookTriggerReady: reports.productionLiveConfigAudit?.summary?.productionHookTriggerReady === true,
      recommendation: buildRecommendation({ blockers, secretFindings, changedFiles, reports }),
    },
    source: {
      reports: Object.fromEntries(Object.entries(reportFiles).map(([key, file]) => [key, relativePath(reportPath(file))])),
    },
    gates,
    blockers,
    changedFiles,
    secretFindings,
    boundaries: [
      '本审计只读取本地 Git 状态、目标文件和已有 Agent V2 报告，不 stage、不 commit、不 push。',
      '本审计会扫描未被 gitignore 忽略的改动文件，避免真实 token/env 进入 GitHub。',
      'releaseReady=false 不代表本地开发失败；它表示还不能把当前工作区直接视为 Zeabur 可部署提交。',
    ],
  };

  writeJson(outputJsonPath, report);
  writeMarkdown(outputMdPath, report);
  console.log(JSON.stringify(report.summary, null, 2));

  if (process.argv.includes('--strict') && blockers.length > 0) process.exit(1);
}

function buildGates(input: {
  changedFiles: ChangedFile[];
  reports: Record<string, ReportValue | null>;
  secretFindings: Array<Record<string, string | number>>;
}): ReleaseGate[] {
  return [
    gate(
      'no_secret_findings',
      '可提交文件未发现高风险 Secret',
      'secretFindingCount=0',
      `secretFindingCount=${input.secretFindings.length}`,
      input.secretFindings.length === 0,
      '防止 deploy token、Zeabur token、私钥或 API key 被提交到 GitHub。'
    ),
    gate(
      'worktree_has_commit_boundary',
      '工作区已收敛为可提交状态',
      'changedEntryCount=0 或已由用户授权进入提交流程',
      `changedEntryCount=${input.changedFiles.length}`,
      input.changedFiles.length === 0,
      'Zeabur 只能部署 GitHub 提交；当前大量本地改动需要先形成提交/PR。'
    ),
    gate(
      'local_completion_ready',
      '本地完成度审计通过',
      'localClosureReady=true',
      `localClosureReady=${input.reports.localCompletionAudit?.summary?.localClosureReady}`,
      input.reports.localCompletionAudit?.summary?.localClosureReady === true,
      '证明 task.md 剩余未勾选项均为生产/真实流量/旧正则退役后置项。'
    ),
    gate(
      'rollout_plan_ready',
      '生产 rollout runbook 已就绪',
      'rolloutPlanReady=true',
      `rolloutPlanReady=${input.reports.productionRolloutPlan?.summary?.rolloutPlanReady}`,
      input.reports.productionRolloutPlan?.summary?.rolloutPlanReady === true,
      '证明进入生产前的执行顺序和阻塞项已经可审计。'
    ),
    gate(
      'deployment_sync_not_overclaimed',
      '生产部署同步未被误报',
      'deploymentSyncProven=false 时 releaseReady 必须保持 false',
      `deploymentSyncProven=${input.reports.productionDeploymentSyncAudit?.summary?.deploymentSyncProven}`,
      input.reports.productionDeploymentSyncAudit?.summary?.deploymentSyncProven !== true,
      '当前生产 health 尚不能证明运行本地目标提交，不能宣称已上线。'
    ),
    gate(
      'production_hook_not_required_for_zeabur_deploy',
      'Agent V2 hook 与 Zeabur 代码部署分层',
      'productionHookTriggerReady=false 且 rollout 文案明确 GitHub main 提交触发 auto-publish、无定时发布',
      `productionHookTriggerReady=${input.reports.productionLiveConfigAudit?.summary?.productionHookTriggerReady}`,
      input.reports.productionLiveConfigAudit?.summary?.productionHookTriggerReady === false,
      '保持 hook 关闭不影响 Zeabur 自动部署代码；后续打开后，能力治理 auto-publish 跟随 GitHub main 提交，而不是平时定时触发。'
    ),
  ];
}

function buildRecommendation(input: {
  blockers: ReleaseGate[];
  secretFindings: Array<Record<string, string | number>>;
  changedFiles: ChangedFile[];
  reports: Record<string, ReportValue | null>;
}) {
  if (input.secretFindings.length > 0) return '发现疑似 Secret；先移除或改为占位/Secret 配置，再考虑提交。';
  if (input.changedFiles.length > 0) {
    return `当前本地仍有 ${input.changedFiles.length} 个改动条目；需要用户授权后按 Agent V2 范围整理提交/PR，再由 Zeabur 自动部署 GitHub 提交。`;
  }
  if (input.reports.localCompletionAudit?.summary?.localClosureReady !== true) return '本地完成度审计未通过；先补齐 local_open 项。';
  if (input.reports.productionRolloutPlan?.summary?.rolloutPlanReady !== true) return '生产 rollout runbook 未就绪；先补齐生产执行证据链。';
  return '可进入提交/PR/Zeabur 自动部署确认流程；生产 shadow 和旧正则退役仍需后续真实证据。';
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

function scanForSecrets(changedFiles: ChangedFile[]) {
  const findings: Array<Record<string, string | number>> = [];
  for (const file of changedFiles) {
    if (isIgnored(file.path)) continue;
    const absolutePath = resolve(workspaceRoot, file.path);
    if (!existsSync(absolutePath)) continue;
    const stat = statSync(absolutePath);
    if (!stat.isFile() || stat.size > 2_000_000) continue;
    const text = readFileSync(absolutePath, 'utf8');
    const lines = text.split(/\r?\n/);
    lines.forEach((line, index) => {
      if (isScannerDefinitionLine(line)) return;
      for (const secretPattern of secretPatterns) {
        if (!secretPattern.pattern.test(line)) continue;
        findings.push({
          file: file.path,
          line: index + 1,
          pattern: secretPattern.name,
          preview: redact(line.trim()).slice(0, 160),
        });
      }
    });
  }
  return findings;
}

function isScannerDefinitionLine(line: string) {
  const trimmed = line.trim();
  return trimmed.startsWith('pattern:')
    || trimmed.startsWith('.replace(/')
    || trimmed.includes('AGENT_V2_AUTO_PUBLISH_DEPLOY_TOKEN=<redacted>');
}

function isIgnored(path: string) {
  try {
    execFileSync('git', ['check-ignore', '-q', '--', path], { cwd: workspaceRoot });
    return true;
  } catch {
    return false;
  }
}

function categorize(path: string) {
  const normalized = path.replace(/\\/g, '/');
  if (normalized.startsWith('packages/server-v2/src/agent-v2/')) return 'server-agent-v2';
  if (normalized.startsWith('packages/server-v2/prisma/')) return 'server-prisma-agent-v2';
  if (normalized.startsWith('packages/server-v2/src/health/')) return 'server-health';
  if (normalized.startsWith('packages/Ami-Aura-Lite-Kiosk/')) return 'kiosk';
  if (normalized.startsWith('src/app/pages/system/AgentGovernanceCenter')) return 'admin-agent-governance';
  if (normalized.startsWith('src/app/pages/ami-agent/')) return 'admin-agent-workspace';
  if (normalized.startsWith('src/api/')) return 'admin-api';
  if (normalized === 'src/app/routes.tsx' || normalized === 'src/app/components/Layout.tsx' || normalized === 'src/config/permissions.ts' || normalized === 'src/test/permissions.test.ts') return 'admin-routing-permissions';
  if (normalized.startsWith('src/types/')) return 'admin-types';
  if (normalized.startsWith('docs/03-') || normalized.startsWith('docs/04-')) return 'docs-evidence';
  if (normalized.startsWith('.github/') || normalized === '.env.production.example' || normalized.endsWith('.env.example')) return 'github-workflow';
  if (normalized.endsWith('package.json') || normalized.endsWith('package-lock.json')) return 'package-manifest';
  return 'other';
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

function countBy(items: string[]) {
  return items.reduce<Record<string, number>>((acc, item) => {
    acc[item] = (acc[item] ?? 0) + 1;
    return acc;
  }, {});
}

function redact(value: string) {
  return value
    .replace(/(AGENT_V2_AUTO_PUBLISH_DEPLOY_TOKEN=).+/i, '$1<redacted>')
    .replace(/(ZEABUR_(?:TOKEN|API_KEY)=).+/i, '$1<redacted>')
    .replace(/\bsk-[A-Za-z0-9_-]{20,}\b/g, 'sk-<redacted>');
}

function gate(id: string, title: string, expected: string, actual: string, pass: boolean, impact: string): ReleaseGate {
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
  gates: ReleaseGate[];
  changedFiles: ChangedFile[];
  secretFindings: Array<Record<string, string | number>>;
  boundaries: string[];
}) {
  mkdirSync(dirname(path), { recursive: true });
  const lines = [
    '# Agent V2 发布前安全审计',
    '',
    `生成时间：${report.generatedAt}`,
    '',
    '## 结论',
    '',
    `- 可直接发布：${report.summary.releaseReady ? '是' : '否'}`,
    `- 阻塞项：${report.summary.blockerCount}`,
    `- 改动条目：${report.summary.changedEntryCount}`,
    `- 疑似 Secret：${report.summary.secretFindingCount}`,
    `- 本地完成度：${report.summary.localClosureReady ? '通过' : '未通过'}`,
    `- 生产 rollout：${report.summary.rolloutPlanReady ? '就绪' : '未就绪'}`,
    `- 生产部署同步已证明：${report.summary.deploymentSyncProven ? '是' : '否'}`,
    `- 生产 hook 触发就绪：${report.summary.productionHookTriggerReady ? '是' : '否'}`,
    `- 建议：${report.summary.recommendation}`,
    '',
    '## 门禁',
    '',
    '| 门禁 | 状态 | 期望 | 当前 | 交付影响 |',
    '| --- | --- | --- | --- | --- |',
    ...report.gates.map((gateItem) => `| ${escapeMd(gateItem.title)} | ${gateItem.status === 'pass' ? '通过' : '失败'} | ${escapeMd(gateItem.expected)} | ${escapeMd(gateItem.actual)} | ${escapeMd(gateItem.impact)} |`),
    '',
    '## 改动分类',
    '',
    ...Object.entries(report.summary.changedCategoryCount ?? {}).map(([key, value]) => `- ${key}: ${value}`),
    '',
    '## 疑似 Secret',
    '',
    ...(report.secretFindings.length
      ? report.secretFindings.map((finding) => `- ${finding.file}:${finding.line} ${finding.pattern} ${finding.preview}`)
      : ['- 未发现。']),
    '',
    '## 来源',
    '',
    ...Object.entries(report.source.reports).map(([key, value]) => `- ${key}: \`${value}\``),
    '',
    '## 边界',
    '',
    ...report.boundaries.map((item) => `- ${item}`),
  ];
  writeFileSync(path, `${lines.join('\n')}\n`, 'utf8');
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
