import { execFileSync } from 'child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { request } from 'https';
import { dirname, relative, resolve } from 'path';

type GateStatus = 'pass' | 'fail';

type DeploymentGate = {
  id: string;
  title: string;
  expected: string;
  actual: string;
  status: GateStatus;
  impact: string;
};

type HealthProbe = {
  attempted: boolean;
  url: string;
  ok: boolean;
  statusCode: number | null;
  body: Record<string, any> | null;
  rawPreview: string | null;
  error: string | null;
};

const workspaceRoot = resolve(process.cwd(), '../..');
const docsRoot = resolve(workspaceRoot, 'docs/04-测试数据/Agent评测与知识治理-2026-06-30至07-03');
const outputJsonPath = resolve(docsRoot, 'agent-v2-production-deployment-sync-audit.json');
const outputMdPath = resolve(docsRoot, 'agent-v2-production-deployment-sync-audit.md');
const backendEnvPath = resolve(workspaceRoot, 'packages/server-v2/.env');
const trackedBranch = process.env.AGENT_V2_ZEABUR_TRACKED_BRANCH || 'main';

async function main() {
  const backendEnv = parseEnv(readTextIfExists(backendEnvPath));
  const hookUrl = backendEnv.AGENT_V2_DEPLOY_HOOK_URL || 'https://ami-service.zeabur.app/api/agent-v2/capability-center/auto-publish/deploy-hook';
  const healthUrl = deriveHealthUrlFromHookUrl(hookUrl) ?? 'https://ami-service.zeabur.app/api/health';
  const git = readGitState();
  const health = await requestJson(healthUrl, 8000);
  const deployment = health.body?.deployment ?? null;
  const productionCommit = typeof deployment?.commit === 'string' && deployment.commit ? deployment.commit : null;
  const gates = buildGates({ git, health, productionCommit });
  const blockers = gates.filter((gate) => gate.status !== 'pass');
  const report = {
    generatedAt: formatShanghaiTime(new Date()),
    summary: {
      deploymentSyncProven: blockers.length === 0,
      gateCount: gates.length,
      blockerCount: blockers.length,
      trackedBranch,
      currentBranch: git.currentBranch,
      localHead: git.localHead,
      localChangedEntryCount: git.changedEntryCount,
      productionHealthReady: health.ok,
      productionCommit,
      productionCommitMatchesLocalHead: Boolean(productionCommit && git.localHead && sameCommit(productionCommit, git.localHead)),
      recommendation: buildRecommendation({ git, health, productionCommit }),
    },
    source: {
      backendEnv: relativePath(backendEnvPath),
      productionHealth: healthUrl,
      trackedBranch,
    },
    git,
    health,
    gates,
    blockers,
    boundaries: [
      '本审计只读取本地 Git 状态和生产 GET /api/health，不触发 deploy hook，不写生产库。',
      'Zeabur 自动部署负责代码同步、构建和服务重启；Agent V2 deploy hook 只用于可选 auto-publish 运营动作。',
      '当前生产 health 如果缺少 deployment.commit，只能证明服务可达，不能证明已运行目标 Git commit。',
    ],
  };

  writeJson(outputJsonPath, report);
  writeMarkdown(outputMdPath, report);
  console.log(JSON.stringify(report.summary, null, 2));

  if (process.argv.includes('--strict') && blockers.length > 0) process.exit(1);
}

function buildGates(input: {
  git: ReturnType<typeof readGitState>;
  health: HealthProbe;
  productionCommit: string | null;
}): DeploymentGate[] {
  return [
    gate(
      'production_health_reachable',
      'Zeabur 生产 health 可达',
      'GET /api/health 返回 2xx',
      input.health.ok ? `status=${input.health.statusCode}` : `status=${input.health.statusCode ?? '<none>'}, error=${input.health.error ?? '<none>'}`,
      input.health.ok,
      '证明 Zeabur 后端服务在线，代码部署平台本身可访问。'
    ),
    gate(
      'production_health_exposes_commit',
      '生产 health 暴露非敏感 commit 元信息',
      'response.deployment.commit 非空',
      input.productionCommit ?? '<missing>',
      Boolean(input.productionCommit),
      '没有 commit 元信息时，无法只读证明生产运行的是哪一次 GitHub 提交。'
    ),
    gate(
      'local_worktree_pushed_boundary',
      '当前本地改动已进入可部署提交',
      'git status changedEntryCount=0',
      `changedEntryCount=${input.git.changedEntryCount}`,
      input.git.changedEntryCount === 0,
      'Zeabur 只能部署 GitHub 上的提交；当前本地未提交/未推送改动不会自动进入生产。'
    ),
    gate(
      'tracked_branch_alignment',
      '当前分支与 Zeabur 跟踪分支一致',
      `currentBranch=${trackedBranch}`,
      `currentBranch=${input.git.currentBranch}`,
      input.git.currentBranch === trackedBranch,
      '如果 Zeabur 跟踪 main，当前本地分支的改动需要合入 main 后才会自动部署。'
    ),
    gate(
      'production_commit_matches_local_head',
      '生产运行 commit 与本地目标提交一致',
      'production deployment.commit 与 localHead 匹配',
      `production=${input.productionCommit ?? '<missing>'}, local=${input.git.localHead ?? '<missing>'}`,
      Boolean(input.productionCommit && input.git.localHead && sameCommit(input.productionCommit, input.git.localHead)),
      '只有 commit 匹配，才能证明 Zeabur 已部署到当前目标提交。'
    ),
  ];
}

function buildRecommendation(input: {
  git: ReturnType<typeof readGitState>;
  health: HealthProbe;
  productionCommit: string | null;
}) {
  if (!input.health.ok) return 'Zeabur health 不可达；先恢复生产后端访问，再判断部署同步。';
  if (!input.productionCommit) {
    return 'Zeabur 后端在线，但当前生产 health 尚不能返回 commit；本轮已补本地 health 元信息，需等代码推送并由 Zeabur 自动部署后再只读确认 commit。';
  }
  if (input.git.changedEntryCount > 0) {
    return '当前 Agent V2 改动仍在本地工作区；Zeabur 自动部署只会读取 GitHub 提交，需提交并合入 Zeabur 跟踪分支后才能自动部署。';
  }
  if (input.git.currentBranch !== trackedBranch) {
    return `当前分支不是 Zeabur 默认跟踪分支 ${trackedBranch}；需确认 Zeabur 跟踪分支或把变更合入该分支。`;
  }
  if (!sameCommit(input.productionCommit, input.git.localHead)) {
    return '生产 commit 与本地目标提交不一致；等待 Zeabur 自动部署完成或检查它跟踪的 GitHub 分支。';
  }
  return 'Zeabur 生产部署已可只读证明运行当前目标提交；之后再进入生产 shadow 和旧正则退役证据采集。';
}

function readGitState() {
  return {
    currentBranch: gitOutput(['rev-parse', '--abbrev-ref', 'HEAD']),
    localHead: gitOutput(['rev-parse', 'HEAD']),
    upstream: gitOutput(['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{u}']),
    trackedBranch,
    changedEntryCount: gitOutput(['status', '--porcelain=v1', '-uall']).split(/\r?\n/).filter(Boolean).length,
    originMain: gitOutput(['rev-parse', '--verify', 'origin/main']),
  };
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

function sameCommit(left: string | null, right: string | null) {
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

function gate(id: string, title: string, expected: string, actual: string, pass: boolean, impact: string): DeploymentGate {
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
  source: Record<string, string>;
  gates: DeploymentGate[];
  boundaries: string[];
}) {
  mkdirSync(dirname(path), { recursive: true });
  const lines = [
    '# Agent V2 生产部署同步审计',
    '',
    `生成时间：${report.generatedAt}`,
    '',
    '## 结论',
    '',
    `- 部署同步已证明：${report.summary.deploymentSyncProven ? '是' : '否'}`,
    `- 阻塞项：${report.summary.blockerCount}`,
    `- Zeabur 跟踪分支假设：${report.summary.trackedBranch}`,
    `- 当前本地分支：${report.summary.currentBranch}`,
    `- 当前本地 HEAD：${report.summary.localHead}`,
    `- 本地未提交/未跟踪条目：${report.summary.localChangedEntryCount}`,
    `- 生产 health：${report.summary.productionHealthReady ? '可达' : '不可达'}`,
    `- 生产 commit：${report.summary.productionCommit ?? '<missing>'}`,
    `- 生产 commit 匹配本地 HEAD：${report.summary.productionCommitMatchesLocalHead ? '是' : '否'}`,
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
    ...Object.entries(report.source).map(([key, value]) => `- ${key}: \`${value}\``),
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
