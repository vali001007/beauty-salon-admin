import { execFileSync } from 'child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { request } from 'https';
import { dirname, relative, resolve } from 'path';

type GateStatus = 'pass' | 'fail';

type VerifyGate = {
  id: string;
  title: string;
  expected: string;
  actual: string;
  status: GateStatus;
  impact: string;
};

type ReportValue = Record<string, any>;

type HealthProbe = {
  attempted: boolean;
  url: string;
  ok: boolean;
  statusCode: number | null;
  body: Record<string, any> | null;
  rawPreview: string | null;
  error: string | null;
};

type WorkflowProbe = {
  attempted: boolean;
  ok: boolean;
  command: string;
  run: Record<string, any> | null;
  error: string | null;
};

const workspaceRoot = resolve(process.cwd(), '../..');
const docsRoot = resolve(workspaceRoot, 'docs/04-测试数据/Agent评测与知识治理-2026-06-30至07-03');
const backendEnvPath = resolve(workspaceRoot, 'packages/server-v2/.env');
const outputJsonPath = resolve(docsRoot, 'agent-v2-post-merge-deploy-verify.json');
const outputMdPath = resolve(docsRoot, 'agent-v2-post-merge-deploy-verify.md');
const targetBranch = process.env.AGENT_V2_ZEABUR_TRACKED_BRANCH || 'main';

const reportFiles = {
  githubReleaseHandoff: 'agent-v2-github-release-handoff.json',
  releaseReadinessAudit: 'agent-v2-release-readiness-audit.json',
  productionRolloutPlan: 'agent-v2-production-rollout-plan.json',
  productionLiveConfigAudit: 'agent-v2-production-live-config-audit.json',
  productionDeploymentSyncAudit: 'agent-v2-production-deployment-sync-audit.json',
  productionConfigReadiness: 'agent-v2-production-config-readiness.json',
};

async function main() {
  const reports = readReports();
  const backendEnv = parseEnv(readTextIfExists(backendEnvPath));
  const hookUrl = backendEnv.AGENT_V2_DEPLOY_HOOK_URL || 'https://ami-service.zeabur.app/api/agent-v2/capability-center/auto-publish/deploy-hook';
  const healthUrl = deriveHealthUrlFromHookUrl(hookUrl) ?? 'https://ami-service.zeabur.app/api/health';
  const git = readGitState();
  const targetCommit = resolveTargetCommit(git);
  const health = await requestJson(healthUrl, 8000);
  const workflow = readLatestWorkflowRun(targetBranch);
  const productionCommit = readProductionCommit(health);
  const gates = buildGates({ reports, git, targetCommit, health, workflow, productionCommit });
  const blockers = gates.filter((gateItem) => gateItem.status !== 'pass');
  const report = {
    generatedAt: formatShanghaiTime(new Date()),
    summary: {
      verifierReady: requiredReportsMissing(reports).length === 0 && Boolean(targetCommit),
      postMergeProductionVerified: blockers.length === 0,
      gateCount: gates.length,
      blockerCount: blockers.length,
      targetBranch,
      targetCommit,
      currentBranch: git.currentBranch,
      localHead: git.localHead,
      originTargetBranch: git.originTargetBranch,
      localChangedEntryCount: git.changedEntryCount,
      githubWorkflowChecked: workflow.attempted,
      githubWorkflowOk: workflow.ok,
      githubWorkflowHeadSha: workflow.run?.headSha ?? null,
      githubWorkflowConclusion: workflow.run?.conclusion ?? null,
      productionHealthReady: health.ok,
      productionCommit,
      productionCommitMatchesTarget: Boolean(targetCommit && productionCommit && sameCommit(productionCommit, targetCommit)),
      productionHookTriggerReady: reports.productionLiveConfigAudit?.summary?.productionHookTriggerReady === true,
      githubProductionHookEnabled: reports.productionLiveConfigAudit?.summary?.githubProductionHookEnabled === true,
      recommendation: buildRecommendation({
        blockers,
        git,
        targetCommit,
        workflow,
        health,
        productionCommit,
      }),
    },
    source: {
      reports: Object.fromEntries(Object.entries(reportFiles).map(([key, name]) => [key, relativePath(reportPath(name))])),
      productionHealth: healthUrl,
      targetBranch,
      backendEnv: relativePath(backendEnvPath),
    },
    git,
    workflow,
    health,
    gates,
    blockers,
    boundaries: [
      '本验收器只读取本地 Git 状态、已有 Agent V2 报告、GitHub workflow 最近运行和 Zeabur GET /api/health。',
      '本验收器不会执行 git add / commit / push，不触发 deploy hook，不写生产库，不删除旧正则。',
      'Zeabur 自动部署负责代码同步、构建和服务重启；Agent V2 deploy hook 只负责可选的能力治理 auto-publish。',
      '当前策略为 GitHub main 提交后触发 auto-publish，workflow 不配置 schedule，后端 AGENT_V2_AUTO_PUBLISH_CRON 保持 false。',
    ],
  };

  writeJson(outputJsonPath, report);
  writeMarkdown(outputMdPath, report);
  console.log(JSON.stringify(report.summary, null, 2));

  if (process.argv.includes('--strict') && !report.summary.postMergeProductionVerified) process.exit(1);
}

function buildGates(input: {
  reports: Record<string, ReportValue | null>;
  git: ReturnType<typeof readGitState>;
  targetCommit: string | null;
  health: HealthProbe;
  workflow: WorkflowProbe;
  productionCommit: string | null;
}): VerifyGate[] {
  const missingReports = requiredReportsMissing(input.reports);
  const liveSummary = input.reports.productionLiveConfigAudit?.summary ?? {};
  const workflowRun = input.workflow.run;
  return [
    gate(
      'required_reports_present',
      '发布后验收依赖报告已生成',
      'release handoff、rollout、live config、deployment sync、config readiness 报告存在',
      missingReports.length > 0 ? missingReports.join(', ') : 'all present',
      missingReports.length === 0,
      '缺少前置报告时，无法判断发布后验收是否覆盖了本地闭环、生产配置和部署同步。'
    ),
    gate(
      'github_release_handoff_ready',
      'GitHub 发布交接包仍就绪',
      'handoffReady=true',
      `handoffReady=${input.reports.githubReleaseHandoff?.summary?.handoffReady}`,
      input.reports.githubReleaseHandoff?.summary?.handoffReady === true,
      '证明待发布文件清单、PR brief 和 stage dry-run 仍可复用。'
    ),
    gate(
      'rollout_plan_ready',
      '生产 rollout runbook 仍就绪',
      'rolloutPlanReady=true',
      `rolloutPlanReady=${input.reports.productionRolloutPlan?.summary?.rolloutPlanReady}`,
      input.reports.productionRolloutPlan?.summary?.rolloutPlanReady === true,
      '发布后继续进入 Zeabur 部署确认、shadow 和旧正则退役证据链。'
    ),
    gate(
      'clean_post_merge_worktree',
      '运行环境是合并后的干净提交',
      'git status changedEntryCount=0',
      `changedEntryCount=${input.git.changedEntryCount}`,
      input.git.changedEntryCount === 0,
      'Zeabur 只能部署 GitHub 提交；本地仍有改动时，不能证明这些改动已经进入生产。'
    ),
    gate(
      'target_commit_resolved',
      'Zeabur 跟踪分支目标提交可解析',
      `origin/${targetBranch} 或 AGENT_V2_POST_MERGE_TARGET_COMMIT 非空`,
      input.targetCommit ?? '<missing>',
      Boolean(input.targetCommit),
      '没有目标 commit，就无法判断生产 health 返回的 commit 是否正确。'
    ),
    gate(
      'local_head_matches_target_commit',
      '本地运行上下文对齐目标提交',
      'localHead 与 targetCommit 匹配',
      `local=${input.git.localHead ?? '<missing>'}, target=${input.targetCommit ?? '<missing>'}`,
      Boolean(input.git.localHead && input.targetCommit && sameCommit(input.git.localHead, input.targetCommit)),
      '发布后验收应在合入后的目标提交上运行，避免拿未合并分支判断生产状态。'
    ),
    gate(
      'github_agent_v2_gate_success',
      'GitHub Agent V2 Gate 在目标提交成功',
      '最近 main 分支 Agent V2 Gate completed/success 且 headSha=targetCommit',
      workflowRun
        ? `status=${workflowRun.status ?? '<missing>'}, conclusion=${workflowRun.conclusion ?? '<missing>'}, headSha=${workflowRun.headSha ?? '<missing>'}`
        : input.workflow.error ?? '<missing>',
      Boolean(
        input.workflow.ok
        && workflowRun
        && workflowRun.status === 'completed'
        && workflowRun.conclusion === 'success'
        && input.targetCommit
        && sameCommit(workflowRun.headSha, input.targetCommit)
      ),
      'Zeabur 自动部署前必须先确认 GitHub 侧 Agent V2 gate 对目标提交放行。'
    ),
    gate(
      'production_health_reachable',
      'Zeabur 生产 health 可达',
      'GET /api/health 返回 2xx',
      input.health.ok ? `status=${input.health.statusCode}` : `status=${input.health.statusCode ?? '<none>'}, error=${input.health.error ?? '<none>'}`,
      input.health.ok,
      '证明生产后端在线；不可达时无法继续判断部署版本。'
    ),
    gate(
      'production_health_exposes_commit',
      '生产 health 暴露部署 commit',
      'response.deployment.commit 非空',
      input.productionCommit ?? '<missing>',
      Boolean(input.productionCommit),
      '没有 commit 元信息时，只能证明服务在线，不能证明 Zeabur 已部署目标提交。'
    ),
    gate(
      'production_commit_matches_target',
      '生产运行 commit 匹配目标提交',
      'production deployment.commit 与 targetCommit 匹配',
      `production=${input.productionCommit ?? '<missing>'}, target=${input.targetCommit ?? '<missing>'}`,
      Boolean(input.productionCommit && input.targetCommit && sameCommit(input.productionCommit, input.targetCommit)),
      '这是证明 Zeabur 已部署目标 GitHub 提交的核心证据。'
    ),
    gate(
      'commit_driven_no_schedule_policy',
      '自动发布策略仍是 GitHub 提交触发且无定时发布',
      'production config readiness pass=true',
      `pass=${input.reports.productionConfigReadiness?.summary?.pass}`,
      input.reports.productionConfigReadiness?.summary?.pass === true,
      '确认 workflow 无 schedule、后端 Cron 关闭，符合“提交后发布、平时不定时发布”的产品口径。'
    ),
    gate(
      'production_hook_state_explicit',
      '生产 hook 开关状态可审计',
      'live config audit present，hook enabled/ready 状态明确',
      `enabled=${liveSummary.githubProductionHookEnabled}, triggerReady=${liveSummary.productionHookTriggerReady}`,
      typeof liveSummary.githubProductionHookEnabled === 'boolean'
        && typeof liveSummary.productionHookTriggerReady === 'boolean',
      '发布代码不等于开启运营自动发布；hook 是否打开必须有独立证据。'
    ),
  ];
}

function buildRecommendation(input: {
  blockers: VerifyGate[];
  git: ReturnType<typeof readGitState>;
  targetCommit: string | null;
  workflow: WorkflowProbe;
  health: HealthProbe;
  productionCommit: string | null;
}) {
  if (input.git.changedEntryCount > 0) {
    return `当前仍有 ${input.git.changedEntryCount} 个本地改动条目，尚未形成合并后的干净 GitHub 提交；先获得授权 stage/commit/PR，再由 Zeabur 自动部署。`;
  }
  if (!input.targetCommit) return `无法解析 origin/${targetBranch} 目标提交；先同步 GitHub 远端后再验收 Zeabur 部署。`;
  if (!input.workflow.ok) return 'GitHub 最近 Agent V2 Gate 未能只读确认为目标提交成功；先检查 GitHub workflow，再等待 Zeabur 自动部署。';
  if (!input.health.ok) return 'Zeabur health 不可达；先恢复生产 API 后再做发布后验收。';
  if (!input.productionCommit) return 'Zeabur 后端在线，但生产 health 尚未返回 deployment.commit；需等待 health 元信息代码上线后再只读验收。';
  if (!sameCommit(input.productionCommit, input.targetCommit)) {
    return '生产 commit 与目标 GitHub 提交不一致；继续等待 Zeabur 自动部署或检查它跟踪的分支。';
  }
  if (input.blockers.length > 0) return '发布后验收仍有阻塞；按失败门禁逐项补证据。';
  return '发布后验收通过：GitHub gate、Zeabur health 和生产 commit 均证明目标提交已上线；可进入生产 shadow/观测阶段。';
}

function readReports() {
  return Object.fromEntries(Object.entries(reportFiles).map(([key, name]) => {
    const path = reportPath(name);
    return [key, existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : null];
  })) as Record<string, ReportValue | null>;
}

function requiredReportsMissing(reports: Record<string, ReportValue | null>) {
  return Object.entries(reports)
    .filter(([, report]) => !report)
    .map(([key]) => key);
}

function reportPath(name: string) {
  return resolve(docsRoot, name);
}

function readGitState() {
  return {
    currentBranch: gitOutput(['rev-parse', '--abbrev-ref', 'HEAD']),
    localHead: gitOutput(['rev-parse', 'HEAD']),
    upstream: gitOutput(['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{u}']),
    originTargetBranch: gitOutput(['rev-parse', '--verify', `origin/${targetBranch}`]),
    changedEntryCount: gitOutput(['status', '--porcelain=v1', '-uall']).split(/\r?\n/).filter(Boolean).length,
  };
}

function resolveTargetCommit(git: ReturnType<typeof readGitState>) {
  return process.env.AGENT_V2_POST_MERGE_TARGET_COMMIT || git.originTargetBranch || git.localHead;
}

function readLatestWorkflowRun(branch: string): WorkflowProbe {
  const command = `gh run list --workflow "Agent V2 Gate" --branch ${branch} --limit 1 --json status,conclusion,headSha,createdAt,url,event,databaseId`;
  try {
    const raw = execFileSync('gh', [
      'run',
      'list',
      '--workflow',
      'Agent V2 Gate',
      '--branch',
      branch,
      '--limit',
      '1',
      '--json',
      'status,conclusion,headSha,createdAt,url,event,databaseId',
    ], {
      cwd: workspaceRoot,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim();
    const runs = raw ? JSON.parse(raw) : [];
    return {
      attempted: true,
      ok: Array.isArray(runs) && runs.length > 0,
      command,
      run: Array.isArray(runs) && runs.length > 0 ? runs[0] : null,
      error: Array.isArray(runs) && runs.length > 0 ? null : 'no workflow runs returned',
    };
  } catch (error) {
    return {
      attempted: true,
      ok: false,
      command,
      run: null,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function gitOutput(args: string[]) {
  try {
    return execFileSync('git', args, {
      cwd: workspaceRoot,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim();
  } catch {
    return null;
  }
}

function readProductionCommit(health: HealthProbe) {
  const commit = health.body?.deployment?.commit;
  return typeof commit === 'string' && commit ? commit : null;
}

function sameCommit(left: string | null | undefined, right: string | null | undefined) {
  if (!left || !right) return false;
  return left === right || left.startsWith(right) || right.startsWith(left);
}

function parseEnv(text: string): Record<string, string> {
  const values: Record<string, string> = {};
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const index = trimmed.indexOf('=');
    if (index < 0) continue;
    values[trimmed.slice(0, index).trim()] = trimmed.slice(index + 1).trim();
  }
  return values;
}

function deriveHealthUrlFromHookUrl(hookUrl: string | undefined) {
  if (!hookUrl) return null;
  try {
    const url = new URL(hookUrl);
    return `${url.origin}${url.pathname.startsWith('/api/') ? '/api/health' : '/health'}`;
  } catch {
    return null;
  }
}

function requestJson(url: string, timeoutMs: number): Promise<HealthProbe> {
  return new Promise((resolveProbe) => {
    const req = request(url, { method: 'GET', timeout: timeoutMs }, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
      res.on('end', () => {
        const raw = Buffer.concat(chunks).toString('utf8').trim();
        let body: Record<string, any> | null = null;
        try {
          body = raw ? JSON.parse(raw) : null;
        } catch {
          body = null;
        }
        resolveProbe({
          attempted: true,
          url,
          ok: Boolean(res.statusCode && res.statusCode >= 200 && res.statusCode < 300),
          statusCode: res.statusCode ?? null,
          body,
          rawPreview: raw ? raw.slice(0, 200) : null,
          error: null,
        });
      });
    });
    req.on('timeout', () => req.destroy(new Error(`timeout after ${timeoutMs}ms`)));
    req.on('error', (error) => {
      resolveProbe({
        attempted: true,
        url,
        ok: false,
        statusCode: null,
        body: null,
        rawPreview: null,
        error: error.message,
      });
    });
    req.end();
  });
}

function gate(id: string, title: string, expected: string, actual: string, pass: boolean, impact: string): VerifyGate {
  return { id, title, expected, actual, status: pass ? 'pass' : 'fail', impact };
}

function readTextIfExists(path: string) {
  return existsSync(path) ? readFileSync(path, 'utf8') : '';
}

function writeJson(path: string, value: unknown) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function writeMarkdown(path: string, report: {
  generatedAt: string;
  summary: Record<string, any>;
  source: { reports: Record<string, string>; productionHealth: string; targetBranch: string; backendEnv: string };
  gates: VerifyGate[];
  boundaries: string[];
}) {
  mkdirSync(dirname(path), { recursive: true });
  const lines = [
    '# Agent V2 合并后 Zeabur 部署验收',
    '',
    `生成时间：${report.generatedAt}`,
    '',
    '## 结论',
    '',
    `- 验收器就绪：${report.summary.verifierReady ? '是' : '否'}`,
    `- 发布后生产已验证：${report.summary.postMergeProductionVerified ? '是' : '否'}`,
    `- 阻塞项：${report.summary.blockerCount}`,
    `- Zeabur 跟踪分支：${report.summary.targetBranch}`,
    `- 目标提交：${report.summary.targetCommit ?? '<missing>'}`,
    `- 当前分支：${report.summary.currentBranch}`,
    `- 本地 HEAD：${report.summary.localHead}`,
    `- origin/${report.summary.targetBranch}：${report.summary.originTargetBranch}`,
    `- 本地改动条目：${report.summary.localChangedEntryCount}`,
    `- GitHub workflow：${report.summary.githubWorkflowOk ? '最近运行可用' : '未确认'}`,
    `- GitHub workflow conclusion：${report.summary.githubWorkflowConclusion ?? '<missing>'}`,
    `- GitHub workflow headSha：${report.summary.githubWorkflowHeadSha ?? '<missing>'}`,
    `- 生产 health：${report.summary.productionHealthReady ? '可达' : '不可达'}`,
    `- 生产 commit：${report.summary.productionCommit ?? '<missing>'}`,
    `- 生产 commit 匹配目标：${report.summary.productionCommitMatchesTarget ? '是' : '否'}`,
    `- GitHub 生产 hook 开关：${report.summary.githubProductionHookEnabled ? '已开启' : '关闭'}`,
    `- 生产 hook 触发条件：${report.summary.productionHookTriggerReady ? '就绪' : '未就绪'}`,
    `- 建议：${report.summary.recommendation}`,
    '',
    '## 门禁',
    '',
    '| 门禁 | 状态 | 期望 | 当前 | 交付影响 |',
    '| --- | --- | --- | --- | --- |',
    ...report.gates.map((gateItem) => `| ${escapeMd(gateItem.title)} | ${gateItem.status === 'pass' ? '通过' : '失败'} | ${escapeMd(gateItem.expected)} | ${escapeMd(gateItem.actual)} | ${escapeMd(gateItem.impact)} |`),
    '',
    '## 来源',
    '',
    ...Object.entries(report.source.reports).map(([key, value]) => `- ${key}: \`${value}\``),
    `- productionHealth: \`${report.source.productionHealth}\``,
    `- targetBranch: \`${report.source.targetBranch}\``,
    `- backendEnv: \`${report.source.backendEnv}\``,
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

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
