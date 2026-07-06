import { execFileSync } from 'child_process';
import { createHash } from 'crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { request } from 'https';
import { dirname, relative, resolve } from 'path';

type GateStatus = 'pass' | 'fail';

type LiveConfigGate = {
  id: string;
  title: string;
  expected: string;
  actual: string;
  status: GateStatus;
  impact: string;
};

const workspaceRoot = resolve(process.cwd(), '../..');
const docsRoot = resolve(workspaceRoot, 'docs/04-测试数据/Agent评测与知识治理-2026-06-30至07-03');
const outputJsonPath = resolve(docsRoot, 'agent-v2-production-live-config-audit.json');
const outputMdPath = resolve(docsRoot, 'agent-v2-production-live-config-audit.md');
const backendEnvPath = resolve(workspaceRoot, 'packages/server-v2/.env');
const serverGitignorePath = resolve(workspaceRoot, 'packages/server-v2/.gitignore');
const workflowPath = resolve(workspaceRoot, '.github/workflows/agent-v2.yml');
const repo = process.env.AGENT_V2_GITHUB_REPO || 'vali001007/beauty-salon-admin';

type HttpProbe = {
  attempted: boolean;
  url: string | null;
  ok: boolean;
  statusCode: number | null;
  contentType: string | null;
  bodyPreview: string | null;
  error: string | null;
};

async function main() {
  const backendEnv = parseEnv(readTextIfExists(backendEnvPath));
  const gitignore = readTextIfExists(serverGitignorePath);
  const workflow = readTextIfExists(workflowPath);
  const githubSecrets = listGithubSecrets(repo);
  const githubVariables = listGithubVariables(repo);
  const productionApiHealth = await probeProductionHealth(backendEnv.AGENT_V2_DEPLOY_HOOK_URL);
  const gates = buildGates({ backendEnv, gitignore, workflow, githubSecrets, githubVariables, productionApiHealth });
  const blockers = gates.filter((gate) => gate.status !== 'pass');
  const backendToken = backendEnv.AGENT_V2_AUTO_PUBLISH_DEPLOY_TOKEN;
  const productionBackendEnvConfirmed = backendEnv.AGENT_V2_PRODUCTION_BACKEND_ENV_CONFIRMED === 'true';
  const githubProductionHookEnabled = githubVariables.values.AGENT_V2_PRODUCTION_HOOK_ENABLED === 'true';
  const productionApiHealthReady = productionApiHealth.ok;
  const productionHookTriggerReady = githubSecrets.names.includes('AGENT_V2_DEPLOY_HOOK_URL')
    && githubSecrets.names.includes('AGENT_V2_AUTO_PUBLISH_DEPLOY_TOKEN')
    && githubProductionHookEnabled
    && Boolean(backendEnv.AGENT_V2_DEPLOY_HOOK_URL)
    && Boolean(backendToken)
    && productionApiHealthReady
    && productionBackendEnvConfirmed;
  const report = {
    generatedAt: formatShanghaiTime(new Date()),
    summary: {
      pass: blockers.length === 0,
      gateCount: gates.length,
      blockerCount: blockers.length,
      githubSecretCount: githubSecrets.names.length,
      githubTokenSecretPresent: githubSecrets.names.includes('AGENT_V2_AUTO_PUBLISH_DEPLOY_TOKEN'),
      githubHookUrlSecretPresent: githubSecrets.names.includes('AGENT_V2_DEPLOY_HOOK_URL'),
      backendTokenPresent: Boolean(backendToken),
      backendTokenFingerprint: backendToken ? fingerprint(backendToken) : null,
      backendHookUrlPresent: Boolean(backendEnv.AGENT_V2_DEPLOY_HOOK_URL),
      productionApiHealthReady,
      productionApiHealthStatus: productionApiHealth.statusCode,
      productionBackendEnvConfirmed,
      githubProductionHookEnabled,
      productionHookTriggerReady,
      recommendation: buildRecommendation({
        blockers,
        githubHookUrlSecretPresent: githubSecrets.names.includes('AGENT_V2_DEPLOY_HOOK_URL'),
        backendHookUrlPresent: Boolean(backendEnv.AGENT_V2_DEPLOY_HOOK_URL),
        productionApiHealthReady,
        productionBackendEnvConfirmed,
      }),
    },
    source: {
      githubRepo: repo,
      backendEnv: relativePath(backendEnvPath),
      serverGitignore: relativePath(serverGitignorePath),
      workflow: relativePath(workflowPath),
      productionHealthProbe: productionApiHealth.url ?? '<not attempted>',
    },
    productionApiHealth,
    gates,
    blockers,
    boundaries: [
      '本审计只读取 GitHub Secret 名称和本机后端 env 键状态，不读取 GitHub Secret 明文。',
      '本审计只对生产 API 执行 GET /api/health 只读探测，不触发 deploy hook，不连接生产数据库，不删除旧正则。',
      'token 只输出 SHA-256 短指纹用于同轮配置核对，不输出明文。',
      'Zeabur 后端是否已设置同轮 token 需要通过部署平台环境变量确认，本审计不会读取 Zeabur Secret 明文。',
    ],
  };

  writeJson(outputJsonPath, report);
  writeMarkdown(outputMdPath, report);
  console.log(JSON.stringify(report.summary, null, 2));

  if (process.argv.includes('--strict') && blockers.length > 0) process.exit(1);
}

function buildGates(input: {
  backendEnv: Record<string, string>;
  gitignore: string;
  workflow: string;
  githubSecrets: { ok: boolean; names: string[]; error?: string };
  githubVariables: { ok: boolean; values: Record<string, string>; error?: string };
  productionApiHealth: HttpProbe;
}): LiveConfigGate[] {
  const token = input.backendEnv.AGENT_V2_AUTO_PUBLISH_DEPLOY_TOKEN;
  const backendHookUrl = input.backendEnv.AGENT_V2_DEPLOY_HOOK_URL;
  const productionBackendEnvConfirmed = input.backendEnv.AGENT_V2_PRODUCTION_BACKEND_ENV_CONFIRMED === 'true';
  const githubProductionHookEnabled = input.githubVariables.values.AGENT_V2_PRODUCTION_HOOK_ENABLED === 'true';
  return [
    gate(
      'github_secret_readback',
      '可只读读取 GitHub Secret 名称',
      '`gh secret list` 成功执行',
      input.githubSecrets.ok ? `secrets=${input.githubSecrets.names.join(', ') || '<empty>'}` : `error=${input.githubSecrets.error}`,
      input.githubSecrets.ok,
      '证明后续配置不是只写本地文档，而是能从 GitHub 回读 Secret 名称。',
    ),
    gate(
      'github_deploy_token_secret_present',
      'GitHub 已配置 deploy token Secret',
      '`AGENT_V2_AUTO_PUBLISH_DEPLOY_TOKEN` 存在',
      input.githubSecrets.names.includes('AGENT_V2_AUTO_PUBLISH_DEPLOY_TOKEN') ? 'present' : 'missing',
      input.githubSecrets.names.includes('AGENT_V2_AUTO_PUBLISH_DEPLOY_TOKEN'),
      'GitHub workflow 触发生产 hook 时具备鉴权 token 来源。',
    ),
    gate(
      'github_variable_readback',
      '可只读读取 GitHub Variable',
      '`gh variable list` 成功执行',
      input.githubVariables.ok
        ? `AGENT_V2_PRODUCTION_HOOK_ENABLED=${displayEnv(input.githubVariables.values.AGENT_V2_PRODUCTION_HOOK_ENABLED)}`
        : `error=${input.githubVariables.error}`,
      input.githubVariables.ok,
      '生产 hook 显式开关使用 GitHub Variable，避免 URL/token 配好后自动误触发。'
    ),
    gate(
      'github_production_hook_switch_safe',
      'GitHub 生产 hook 显式开关当前保持关闭',
      '`AGENT_V2_PRODUCTION_HOOK_ENABLED` 未设置为 true',
      displayEnv(input.githubVariables.values.AGENT_V2_PRODUCTION_HOOK_ENABLED),
      !githubProductionHookEnabled,
      '按 GitHub 提交触发 auto-publish 的策略启用前，先确认 Zeabur 后端同轮 token，避免下一次 main push 误触发失败。'
    ),
    gate(
      'github_hook_url_secret_present',
      'GitHub 已配置生产 hook URL Secret',
      '`AGENT_V2_DEPLOY_HOOK_URL` 存在',
      input.githubSecrets.names.includes('AGENT_V2_DEPLOY_HOOK_URL') ? 'present' : 'missing',
      input.githubSecrets.names.includes('AGENT_V2_DEPLOY_HOOK_URL'),
      '缺少该 Secret 时 workflow 条件不会满足，生产 hook 不会触发；当前仍需生产 API 域名。',
    ),
    gate(
      'backend_env_ignored',
      '后端真实 env 文件不进入 Git',
      '`packages/server-v2/.gitignore` 忽略 `.env`',
      input.gitignore.includes('.env') ? 'ignored' : 'not ignored',
      input.gitignore.includes('.env'),
      '真实 deploy token 不会因本机 env 同步被提交到仓库。',
    ),
    gate(
      'backend_deploy_token_present',
      '后端 env 已配置同轮 deploy token',
      '`AGENT_V2_AUTO_PUBLISH_DEPLOY_TOKEN` 非空',
      token ? `present fingerprint=${fingerprint(token)}` : 'missing',
      Boolean(token),
      '后端 deploy hook guard 能校验来自 GitHub 的专用 token。',
    ),
    gate(
      'backend_hook_url_present',
      '后端 env 已配置生产 hook URL',
      '`AGENT_V2_DEPLOY_HOOK_URL` 非空',
      backendHookUrl ? normalizeUrlForDisplay(backendHookUrl) : 'missing',
      Boolean(backendHookUrl),
      '本机配置和 GitHub Secret 采用同一个生产 hook URL，便于审计和后续 smoke。'
    ),
    gate(
      'production_api_health_reachable',
      '生产 API health 只读可达',
      '`GET <生产 API>/api/health` 返回 2xx',
      input.productionApiHealth.attempted
        ? `status=${input.productionApiHealth.statusCode ?? '<none>'}, url=${input.productionApiHealth.url}, body=${input.productionApiHealth.bodyPreview ?? '<empty>'}`
        : 'not attempted',
      input.productionApiHealth.ok,
      '证明该域名是可访问的 server-v2 后端，而不是前端站点或错误域名。'
    ),
    gate(
      'zeabur_backend_env_confirmed',
      'Zeabur 后端同轮 token 环境变量已确认',
      '`AGENT_V2_PRODUCTION_BACKEND_ENV_CONFIRMED=true`',
      displayEnv(input.backendEnv.AGENT_V2_PRODUCTION_BACKEND_ENV_CONFIRMED),
      productionBackendEnvConfirmed,
      '只有确认部署平台后端也持有同轮 token，GitHub workflow 才能安全进入 hook smoke。'
    ),
    gate(
      'backend_cron_disabled',
      '后端 Cron 自动发布保持关闭',
      '`AGENT_V2_AUTO_PUBLISH_CRON=false`',
      displayEnv(input.backendEnv.AGENT_V2_AUTO_PUBLISH_CRON),
      input.backendEnv.AGENT_V2_AUTO_PUBLISH_CRON === 'false',
      '当前策略是 GitHub 提交触发 auto-publish，平时不做后端定时自动发布。',
    ),
    gate(
      'github_commit_trigger_policy',
      'auto-publish 采用 GitHub 提交触发',
      'workflow 有 push 入口、无 schedule；生产 hook 限 main push 或 workflow_dispatch；push 默认 git_diff',
      [
        input.workflow.includes('push:') ? 'push=present' : 'push=missing',
        input.workflow.includes('schedule:') ? 'schedule=present' : 'schedule=absent',
        input.workflow.includes("github.ref == 'refs/heads/main' || github.event_name == 'workflow_dispatch'") ? 'hook=main_or_manual' : 'hook=missing',
        input.workflow.includes('scan_mode="git_diff"') ? 'pushScan=git_diff' : 'pushScan=missing',
      ].join(', '),
      input.workflow.includes('push:')
        && !input.workflow.includes('schedule:')
        && input.workflow.includes("github.ref == 'refs/heads/main' || github.event_name == 'workflow_dispatch'")
        && input.workflow.includes('scan_mode="git_diff"'),
      '把能力治理 auto-publish 绑定到 GitHub 提交流水线，不启用日常定时自动发布。',
    ),
    gate(
      'backend_gray_mode_safe',
      '生产灰度默认仍走旧链路',
      '`AGENT_V2_GRAY_MODE=legacy_regex` 且 `AGENT_INTENT_ENGINE=legacy_regex`',
      `gray=${displayEnv(input.backendEnv.AGENT_V2_GRAY_MODE)}, engine=${displayEnv(input.backendEnv.AGENT_INTENT_ENGINE)}`,
      input.backendEnv.AGENT_V2_GRAY_MODE === 'legacy_regex'
        && input.backendEnv.AGENT_INTENT_ENGINE === 'legacy_regex',
      '配置 token 不会把生产问答直接切到 KG/LLM 正式接管。',
    ),
    gate(
      'legacy_retirement_still_locked',
      '旧正则退役确认开关保持关闭',
      '`AGENT_V2_LEGACY_RETIREMENT_CONFIRMED=false`',
      displayEnv(input.backendEnv.AGENT_V2_LEGACY_RETIREMENT_CONFIRMED),
      input.backendEnv.AGENT_V2_LEGACY_RETIREMENT_CONFIRMED === 'false',
      '即使后续误配 legacy_retired，也不会绕过生产证据和授权。',
    ),
    gate(
      'workflow_requires_url_and_token',
      'workflow 仍要求显式开关、URL 和 token 同时满足才触发 hook',
      '条件包含 explicit enable、URL/token 非空、非 PR、main 或 workflow_dispatch',
      input.workflow.includes("env.AGENT_V2_DEPLOY_HOOK_URL != ''")
        && input.workflow.includes("env.AGENT_V2_AUTO_PUBLISH_DEPLOY_TOKEN != ''")
        && input.workflow.includes("env.AGENT_V2_PRODUCTION_HOOK_ENABLED == 'true'")
        ? 'condition present'
        : 'condition missing',
      input.workflow.includes("github.event_name != 'pull_request'")
        && input.workflow.includes("env.AGENT_V2_PRODUCTION_HOOK_ENABLED == 'true'")
        && input.workflow.includes("env.AGENT_V2_DEPLOY_HOOK_URL != ''")
        && input.workflow.includes("env.AGENT_V2_AUTO_PUBLISH_DEPLOY_TOKEN != ''"),
      '当前显式开关未打开时，即使 URL/token 已配置也不会调用生产 hook。',
    ),
    gate(
      'production_hook_not_overclaimed',
      '生产 hook 不在后端 env 未确认时误放行',
      'hook trigger ready 需要 GitHub URL/token、后端 URL/token、health 和 Zeabur env 确认同时满足',
      `githubUrl=${input.githubSecrets.names.includes('AGENT_V2_DEPLOY_HOOK_URL')}, githubToken=${input.githubSecrets.names.includes('AGENT_V2_AUTO_PUBLISH_DEPLOY_TOKEN')}, hookEnabled=${githubProductionHookEnabled}, backendUrl=${Boolean(backendHookUrl)}, backendToken=${Boolean(token)}, health=${input.productionApiHealth.ok}, zeaburEnv=${productionBackendEnvConfirmed}`,
      input.githubSecrets.names.includes('AGENT_V2_DEPLOY_HOOK_URL')
        && input.githubSecrets.names.includes('AGENT_V2_AUTO_PUBLISH_DEPLOY_TOKEN')
        && githubProductionHookEnabled
        && Boolean(backendHookUrl)
        && Boolean(token)
        && input.productionApiHealth.ok
        && productionBackendEnvConfirmed,
      '把“URL 已配置”和“可触发生产 hook”拆开，避免仅凭 GitHub Secret 就误判生产已接通。'
    ),
  ];
}

function buildRecommendation(input: {
  blockers: LiveConfigGate[];
  githubHookUrlSecretPresent: boolean;
  backendHookUrlPresent: boolean;
  productionApiHealthReady: boolean;
  productionBackendEnvConfirmed: boolean;
}) {
  if (input.blockers.length === 0) return 'Agent V2 auto-publish hook 触发配置已具备最小条件；仍需先做受控 hook smoke，再进入 shadow 观察。Zeabur 代码自动部署不依赖该 hook。';
  if (!input.githubHookUrlSecretPresent || !input.backendHookUrlPresent) {
    return 'deploy token 已可审计；生产 API hook URL 仍需配置到 GitHub Secret 和后端 env 后，再进入 Zeabur 后端 env 确认。';
  }
  if (!input.productionApiHealthReady) {
    return '生产 API hook URL 已配置，但生产 API health 未通过；需先修复后端域名或 API 前缀。';
  }
  if (!input.productionBackendEnvConfirmed) {
    return '生产 API hook URL 已配置且 health 可达；当前策略改为 GitHub main 提交后自动触发 Agent V2 auto-publish，后端 Cron 保持 false。下一步需先在 Zeabur 后端确认同轮 deploy token，再受控打开 GitHub 生产 hook 开关并做 hook smoke。';
  }
  return '仍存在生产配置阻塞项；按失败门禁逐项处理。';
}

function listGithubSecrets(githubRepo: string) {
  try {
    const output = execFileSync('gh', ['secret', 'list', '--repo', githubRepo], {
      cwd: workspaceRoot,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const names = output
      .split(/\r?\n/)
      .map((line) => line.trim().split(/\s+/)[0])
      .filter(Boolean);
    return { ok: true, names };
  } catch (error) {
    return { ok: false, names: [], error: error instanceof Error ? error.message : String(error) };
  }
}

function listGithubVariables(githubRepo: string) {
  try {
    const output = execFileSync('gh', ['variable', 'list', '--repo', githubRepo], {
      cwd: workspaceRoot,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const values: Record<string, string> = {};
    for (const line of output.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      const [name, value] = trimmed.split(/\s+/, 2);
      if (name) values[name] = value ?? '';
    }
    return { ok: true, values };
  } catch (error) {
    return { ok: false, values: {}, error: error instanceof Error ? error.message : String(error) };
  }
}

function parseEnv(text: string): Record<string, string> {
  const values: Record<string, string> = {};
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const index = trimmed.indexOf('=');
    if (index < 0) continue;
    const key = trimmed.slice(0, index).trim();
    let value = trimmed.slice(index + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    values[key] = value;
  }
  return values;
}

function gate(id: string, title: string, expected: string, actual: string, pass: boolean, impact: string): LiveConfigGate {
  return { id, title, expected, actual, status: pass ? 'pass' : 'fail', impact };
}

function fingerprint(value: string) {
  return createHash('sha256').update(value).digest('hex').slice(0, 16);
}

function displayEnv(value: string | undefined) {
  return value === undefined ? '<missing>' : value || '<empty>';
}

function normalizeUrlForDisplay(value: string) {
  return value.replace(/\?.*$/, '').replace(/\/+$/, '');
}

function deriveHealthUrlFromHookUrl(hookUrl: string | undefined) {
  if (!hookUrl) return null;
  try {
    const url = new URL(hookUrl);
    if (!url.protocol.startsWith('https')) return null;
    const prefix = url.pathname.startsWith('/api/') ? '/api/health' : '/health';
    return `${url.origin}${prefix}`;
  } catch {
    return null;
  }
}

async function probeProductionHealth(hookUrl: string | undefined): Promise<HttpProbe> {
  const healthUrl = deriveHealthUrlFromHookUrl(hookUrl);
  if (!healthUrl) {
    return {
      attempted: false,
      url: null,
      ok: false,
      statusCode: null,
      contentType: null,
      bodyPreview: null,
      error: hookUrl ? 'invalid hook URL' : null,
    };
  }
  return requestText(healthUrl, 8000);
}

function requestText(url: string, timeoutMs: number): Promise<HttpProbe> {
  return new Promise((resolveProbe) => {
    const req = request(url, { method: 'GET', timeout: timeoutMs }, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
      res.on('end', () => {
        const body = Buffer.concat(chunks).toString('utf8').replace(/\s+/g, ' ').trim();
        resolveProbe({
          attempted: true,
          url,
          ok: Boolean(res.statusCode && res.statusCode >= 200 && res.statusCode < 300),
          statusCode: res.statusCode ?? null,
          contentType: Array.isArray(res.headers['content-type'])
            ? res.headers['content-type'].join(',')
            : res.headers['content-type'] ?? null,
          bodyPreview: body ? body.slice(0, 160) : null,
          error: null,
        });
      });
    });
    req.on('timeout', () => {
      req.destroy(new Error(`timeout after ${timeoutMs}ms`));
    });
    req.on('error', (error) => {
      resolveProbe({
        attempted: true,
        url,
        ok: false,
        statusCode: null,
        contentType: null,
        bodyPreview: null,
        error: error.message,
      });
    });
    req.end();
  });
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
  summary: Record<string, unknown>;
  source: Record<string, string>;
  gates: LiveConfigGate[];
  boundaries: string[];
}) {
  mkdirSync(dirname(path), { recursive: true });
  const lines = [
    '# Agent V2 生产 live 配置审计',
    '',
    `生成时间：${report.generatedAt}`,
    '',
    '## 结论',
    '',
    `- 通过：${report.summary.pass ? '是' : '否'}`,
    `- 阻塞项：${report.summary.blockerCount}`,
    `- GitHub deploy token Secret：${report.summary.githubTokenSecretPresent ? '已配置' : '未配置'}`,
    `- GitHub hook URL Secret：${report.summary.githubHookUrlSecretPresent ? '已配置' : '未配置'}`,
    `- 后端 token：${report.summary.backendTokenPresent ? '已配置' : '未配置'}`,
    `- 后端 token 指纹：${report.summary.backendTokenFingerprint ?? '<none>'}`,
    `- 生产 API health：${report.summary.productionApiHealthReady ? '可达' : '不可达'} (${report.summary.productionApiHealthStatus ?? '<none>'})`,
    `- Zeabur 后端 env 已确认：${report.summary.productionBackendEnvConfirmed ? '是' : '否'}`,
    `- GitHub 生产 hook 开关：${report.summary.githubProductionHookEnabled ? '已开启' : '关闭'}`,
    `- 生产 hook 触发条件就绪：${report.summary.productionHookTriggerReady ? '是' : '否'}`,
    `- 建议：${report.summary.recommendation}`,
    '',
    '## 来源',
    '',
    ...Object.entries(report.source).map(([key, value]) => `- ${key}: \`${value}\``),
    '',
    '## 门禁',
    '',
    '| 门禁 | 状态 | 期望 | 当前 | 交付影响 |',
    '| --- | --- | --- | --- | --- |',
    ...report.gates.map((gateItem) => [
      escapeMd(gateItem.title),
      gateItem.status === 'pass' ? '通过' : '失败',
      escapeMd(gateItem.expected),
      escapeMd(gateItem.actual),
      escapeMd(gateItem.impact),
    ].join(' | ')).map((line) => `| ${line} |`),
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
