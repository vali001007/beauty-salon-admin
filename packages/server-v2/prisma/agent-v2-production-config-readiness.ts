import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, relative, resolve } from 'path';

type GateStatus = 'pass' | 'fail';

type ReadinessGate = {
  id: string;
  title: string;
  expected: string;
  actual: string;
  status: GateStatus;
  impact: string;
};

const workspaceRoot = resolve(process.cwd(), '../..');
const docsRoot = resolve(workspaceRoot, 'docs/04-测试数据/Agent评测与知识治理-2026-06-30至07-03');
const outputJsonPath = resolve(docsRoot, 'agent-v2-production-config-readiness.json');
const outputMdPath = resolve(docsRoot, 'agent-v2-production-config-readiness.md');

const files = {
  localEnvExample: resolve(workspaceRoot, 'packages/server-v2/.env.example'),
  productionEnvExample: resolve(workspaceRoot, '.env.production.example'),
  workflow: resolve(workspaceRoot, '.github/workflows/agent-v2.yml'),
  deployHookGuard: resolve(workspaceRoot, 'packages/server-v2/src/agent-v2/capability-center/agent-v2-deploy-hook.guard.ts'),
  grayStrategy: resolve(workspaceRoot, 'packages/server-v2/src/agent-v2/agent-v2-gray-strategy.service.ts'),
  governanceService: resolve(workspaceRoot, 'packages/server-v2/src/agent-v2/governance/agent-v2-governance.service.ts'),
};

function main() {
  const sources = Object.fromEntries(Object.entries(files).map(([key, path]) => [key, readText(path)]));
  const gates = buildGates(sources);
  const pass = gates.every((gate) => gate.status === 'pass');
  const blockers = gates.filter((gate) => gate.status !== 'pass');
  const report = {
    generatedAt: formatShanghaiTime(new Date()),
    summary: {
      pass,
      gateCount: gates.length,
      blockerCount: blockers.length,
      recommendation: pass
        ? '生产配置入口已按 GitHub 提交触发 auto-publish 预留；后端 Cron 保持关闭，仍需等生产 API、Secrets、Zeabur env、DB migration 授权和生产证据齐备后再启用生产 hook。'
        : '生产配置预留不完整；先修复失败门禁，再配置生产 URL/token/Secrets。',
    },
    source: Object.fromEntries(Object.entries(files).map(([key, path]) => [key, relativePath(path)])),
    gates,
    blockers,
  };

  writeJson(outputJsonPath, report);
  writeMarkdown(outputMdPath, report);
  console.log(JSON.stringify(report.summary, null, 2));

  if (process.argv.includes('--strict') && !pass) process.exit(1);
}

function buildGates(sources: Record<string, string>): ReadinessGate[] {
  const localEnv = parseEnvExample(sources.localEnvExample);
  const productionEnv = parseEnvExample(sources.productionEnvExample);
  const workflow = sources.workflow;
  const deployHookGuard = sources.deployHookGuard;
  const grayStrategy = sources.grayStrategy;
  const governanceService = sources.governanceService;
  const workflowIfLine = workflow.split(/\r?\n/).find((line) => line.includes('env.AGENT_V2_DEPLOY_HOOK_URL')) ?? '';

  return [
    gate(
      'env_placeholders_local',
      '本地环境样例预留生产 hook 变量但默认不启用',
      '`AGENT_V2_DEPLOY_HOOK_URL`、token、Zeabur env 确认位存在，`AGENT_V2_AUTO_PUBLISH_CRON=false`',
      [
        `url=${displayEnv(localEnv.AGENT_V2_DEPLOY_HOOK_URL)}`,
        `token=${displayEnv(localEnv.AGENT_V2_AUTO_PUBLISH_DEPLOY_TOKEN)}`,
        `zeaburEnv=${displayEnv(localEnv.AGENT_V2_PRODUCTION_BACKEND_ENV_CONFIRMED)}`,
        `cron=${displayEnv(localEnv.AGENT_V2_AUTO_PUBLISH_CRON)}`,
      ].join(', '),
      hasKey(localEnv, 'AGENT_V2_DEPLOY_HOOK_URL')
        && hasKey(localEnv, 'AGENT_V2_AUTO_PUBLISH_DEPLOY_TOKEN')
        && localEnv.AGENT_V2_PRODUCTION_BACKEND_ENV_CONFIRMED === 'false'
        && localEnv.AGENT_V2_AUTO_PUBLISH_CRON === 'false',
      '本地开发不会因为缺少生产 URL/token 被阻塞，也不会默认开启定时自动发布。',
    ),
    gate(
      'env_placeholders_production',
      '生产环境样例只给占位值，不携带真实 token',
      '生产样例包含 hook URL/token/Zeabur env 确认位/cron/baseRef，token 是空值或生成提示占位',
      [
        `url=${displayEnv(productionEnv.AGENT_V2_DEPLOY_HOOK_URL)}`,
        `token=${displaySecret(productionEnv.AGENT_V2_AUTO_PUBLISH_DEPLOY_TOKEN)}`,
        `zeaburEnv=${displayEnv(productionEnv.AGENT_V2_PRODUCTION_BACKEND_ENV_CONFIRMED)}`,
        `cron=${displayEnv(productionEnv.AGENT_V2_AUTO_PUBLISH_CRON)}`,
        `baseRef=${displayEnv(productionEnv.AGENT_V2_AUTO_PUBLISH_BASE_REF)}`,
      ].join(', '),
      hasKey(productionEnv, 'AGENT_V2_DEPLOY_HOOK_URL')
        && hasKey(productionEnv, 'AGENT_V2_AUTO_PUBLISH_DEPLOY_TOKEN')
        && productionEnv.AGENT_V2_PRODUCTION_BACKEND_ENV_CONFIRMED === 'false'
        && isPlaceholderSecret(productionEnv.AGENT_V2_AUTO_PUBLISH_DEPLOY_TOKEN)
        && productionEnv.AGENT_V2_AUTO_PUBLISH_CRON === 'false'
        && Boolean(productionEnv.AGENT_V2_AUTO_PUBLISH_BASE_REF),
      '后续配置有明确变量位，同时避免把真实生产 token 写进仓库。',
    ),
    gate(
      'workflow_secret_condition',
      'GitHub workflow 仅在显式开关、URL 和 token 同时满足时触发生产 hook',
      'hook step 使用 Secrets + Variable，跳过 pull_request，并要求 main push 或 workflow_dispatch、显式开关为 true、URL/token 非空',
      normalizeWhitespace(workflowIfLine),
      workflow.includes('secrets.AGENT_V2_DEPLOY_HOOK_URL')
        && workflow.includes('secrets.AGENT_V2_AUTO_PUBLISH_DEPLOY_TOKEN')
        && workflow.includes('vars.AGENT_V2_PRODUCTION_HOOK_ENABLED')
        && workflow.includes("github.event_name != 'pull_request'")
        && workflow.includes("github.ref == 'refs/heads/main' || github.event_name == 'workflow_dispatch'")
        && workflow.includes("env.AGENT_V2_PRODUCTION_HOOK_ENABLED == 'true'")
        && workflow.includes("env.AGENT_V2_DEPLOY_HOOK_URL != ''")
        && workflow.includes("env.AGENT_V2_AUTO_PUBLISH_DEPLOY_TOKEN != ''"),
      '生产自动发布不会在 PR、缺少 Secrets 或未显式打开生产 hook 开关时被误触发。',
    ),
    gate(
      'workflow_github_commit_trigger',
      '自动发布策略为 GitHub 提交触发',
      'workflow 有 push 入口；生产 hook 只在 main push 或 workflow_dispatch 后执行；push 默认 git_diff 扫描',
      [
        workflow.includes('push:') ? 'push=present' : 'push=missing',
        workflow.includes("github.ref == 'refs/heads/main' || github.event_name == 'workflow_dispatch'") ? 'hook=main_or_manual' : 'hook=missing',
        workflow.includes('scan_mode="git_diff"') ? 'pushScan=git_diff' : 'pushScan=missing',
      ].join(', '),
      workflow.includes('push:')
        && workflow.includes("github.ref == 'refs/heads/main' || github.event_name == 'workflow_dispatch'")
        && workflow.includes('scan_mode="git_diff"'),
      '满足“每次提交 GitHub 后自动发布能力治理结果”的方向，同时只让 main 分支生产 hook 进入发布链路。',
    ),
    gate(
      'workflow_no_schedule',
      '当前 workflow 不做定时自动发布',
      '只允许 push、pull_request、workflow_dispatch；没有 schedule',
      workflow.includes('schedule:') ? 'found schedule' : 'no schedule',
      !workflow.includes('schedule:'),
      '满足“平时不做定时自动化发布”，避免 GitHub schedule 或后端 Cron 双重发布。',
    ),
    gate(
      'workflow_hook_payload',
      '生产 hook 调用携带专用 header 和 scanMode',
      'curl POST 使用 `x-agent-v2-deploy-token`，payload 包含 scanMode',
      workflow.includes('x-agent-v2-deploy-token') && workflow.includes('scanMode') ? 'header and scanMode present' : 'missing header or scanMode',
      workflow.includes('curl --fail')
        && workflow.includes('-X POST "$AGENT_V2_DEPLOY_HOOK_URL"')
        && workflow.includes('x-agent-v2-deploy-token: $AGENT_V2_AUTO_PUBLISH_DEPLOY_TOKEN')
        && workflow.includes('scanMode'),
      '后续真正启用时，后端能识别来源并按增量策略执行。',
    ),
    gate(
      'deploy_hook_guard',
      '后端 deploy hook 有专用 token guard',
      '缺少或错误 token 会 Forbidden，比较使用安全等值方法',
      deployHookGuard.includes('AGENT_V2_AUTO_PUBLISH_DEPLOY_TOKEN') && deployHookGuard.includes('safeEqual') ? 'guard configured' : 'guard incomplete',
      deployHookGuard.includes('AGENT_V2_AUTO_PUBLISH_DEPLOY_TOKEN')
        && deployHookGuard.includes('x-agent-v2-deploy-token')
        && deployHookGuard.includes('ForbiddenException')
        && deployHookGuard.includes('safeEqual'),
      '外部自动发布入口不会复用普通用户 token，也不会无 token 执行。',
    ),
    gate(
      'production_default_legacy',
      '生产默认仍保留旧链路，不随本地默认一起切换',
      '`AGENT_V2_GRAY_MODE=legacy_regex`，`AGENT_INTENT_ENGINE=legacy_regex`',
      [
        `gray=${displayEnv(productionEnv.AGENT_V2_GRAY_MODE)}`,
        `engine=${displayEnv(productionEnv.AGENT_INTENT_ENGINE)}`,
      ].join(', '),
      productionEnv.AGENT_V2_GRAY_MODE === 'legacy_regex'
        && productionEnv.AGENT_INTENT_ENGINE === 'legacy_regex',
      '生产接管仍由治理表/灰度规则和证据门禁控制，不被本地默认影响。',
    ),
    gate(
      'legacy_retirement_confirmation',
      '旧正则最终退役需要显式确认开关',
      'env 样例默认 false，运行时和治理保存入口均检查 `AGENT_V2_LEGACY_RETIREMENT_CONFIRMED`',
      [
        `env=${displayEnv(productionEnv.AGENT_V2_LEGACY_RETIREMENT_CONFIRMED)}`,
        `runtime=${grayStrategy.includes('AGENT_V2_LEGACY_RETIREMENT_CONFIRMED') ? 'present' : 'missing'}`,
        `governance=${governanceService.includes('AGENT_V2_LEGACY_RETIREMENT_CONFIRMED') ? 'present' : 'missing'}`,
      ].join(', '),
      productionEnv.AGENT_V2_LEGACY_RETIREMENT_CONFIRMED === 'false'
        && grayStrategy.includes('AGENT_V2_LEGACY_RETIREMENT_CONFIRMED')
        && governanceService.includes('AGENT_V2_LEGACY_RETIREMENT_CONFIRMED'),
      '后续即使误配 `legacy_retired`，也不会绕过生产证据和授权。',
    ),
  ];
}

function gate(id: string, title: string, expected: string, actual: string, pass: boolean, impact: string): ReadinessGate {
  return { id, title, expected, actual, status: pass ? 'pass' : 'fail', impact };
}

function parseEnvExample(text: string): Record<string, string> {
  const values: Record<string, string> = {};
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const index = trimmed.indexOf('=');
    if (index < 0) continue;
    const key = trimmed.slice(0, index).trim();
    const value = trimmed.slice(index + 1).trim();
    values[key] = value;
  }
  return values;
}

function hasKey(values: Record<string, string>, key: string) {
  return Object.prototype.hasOwnProperty.call(values, key);
}

function isPlaceholderSecret(value: string | undefined) {
  const normalized = String(value ?? '').trim().toLowerCase();
  return !normalized || normalized.includes('generate') || normalized.includes('placeholder') || normalized.includes('<');
}

function displayEnv(value: string | undefined) {
  return value === undefined ? '<missing>' : value || '<empty>';
}

function displaySecret(value: string | undefined) {
  if (value === undefined) return '<missing>';
  if (!value) return '<empty>';
  return isPlaceholderSecret(value) ? value : '<configured-secret-redacted>';
}

function normalizeWhitespace(value: string) {
  return value.trim().replace(/\s+/g, ' ');
}

function readText(path: string) {
  if (!existsSync(path)) throw new Error(`缺少生产配置预留检查文件：${relativePath(path)}`);
  return readFileSync(path, 'utf8');
}

function writeJson(path: string, value: unknown) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function writeMarkdown(path: string, report: { generatedAt: string; summary: { pass: boolean; blockerCount: number; recommendation: string }; source: Record<string, string>; gates: ReadinessGate[] }) {
  mkdirSync(dirname(path), { recursive: true });
  const lines = [
    '# Agent V2 生产配置预留 Readiness',
    '',
    `生成时间：${report.generatedAt}`,
    '',
    '## 结论',
    '',
    `- 通过：${report.summary.pass ? '是' : '否'}`,
    `- 阻塞项：${report.summary.blockerCount}`,
    `- 建议：${report.summary.recommendation}`,
    '',
    '## 检查文件',
    '',
    ...Object.entries(report.source).map(([key, value]) => `- ${key}: \`${value}\``),
    '',
    '## 门禁',
    '',
    '| 门禁 | 状态 | 期望 | 当前 | 交付影响 |',
    '| --- | --- | --- | --- | --- |',
    ...report.gates.map((gate) => [
      escapeMd(gate.title),
      gate.status === 'pass' ? '通过' : '失败',
      escapeMd(gate.expected),
      escapeMd(gate.actual),
      escapeMd(gate.impact),
    ].join(' | ')).map((line) => `| ${line} |`),
    '',
    '## 边界',
    '',
    '- 本检查只读取本地文件，不连接生产数据库，不调用生产 API，不触发 deploy hook。',
    '- 通过只代表后续生产配置入口已安全预留，不代表生产 shadow、线上有用率或旧正则退役已完成。',
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
