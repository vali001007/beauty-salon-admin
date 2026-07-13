import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, relative, resolve } from 'path';
import { AgentV2GrayStrategyService, defaultAgentV2GrayMode, type AgentV2GrayStrategy } from '../src/agent-v2/agent-v2-gray-strategy.service.js';

type DrillStatus = 'pass' | 'fail';

type DrillGate = {
  id: string;
  title: string;
  expected: string;
  actual: string;
  status: DrillStatus;
  impact: string;
};

const workspaceRoot = resolve(process.cwd(), '../..');
const docsRoot = resolve(workspaceRoot, 'docs/04-测试数据/Agent评测与知识治理-2026-06-30至07-03');
const outputJsonPath = resolve(docsRoot, 'agent-v2-rollback-drill.json');
const outputMdPath = resolve(docsRoot, 'agent-v2-rollback-drill.md');
const productionEnvExamplePath = resolve(workspaceRoot, '.env.production.example');

const actor = {
  storeId: 1,
  userId: 1,
  role: 'manager' as const,
  entrypoint: 'kiosk',
  personaCode: 'manager',
};

const envKeys = [
  'NODE_ENV',
  'AGENT_V2_GRAY_MODE',
  'AGENT_V2_GRAY_RULES',
  'AGENT_V2_LEGACY_RETIREMENT_CONFIRMED',
  'AGENT_INTENT_ENGINE',
  'AGENT_INTENT_SHADOW_COMPARE',
];

async function main() {
  const originalEnv = snapshotEnv();
  try {
    const productionEnvExample = parseEnvExample(readText(productionEnvExamplePath));
    const gates = await buildGates(productionEnvExample);
    const pass = gates.every((gate) => gate.status === 'pass');
    const blockers = gates.filter((gate) => gate.status !== 'pass');
    const report = {
      generatedAt: formatShanghaiTime(new Date()),
      summary: {
        pass,
        gateCount: gates.length,
        blockerCount: blockers.length,
        recommendation: pass
          ? '本地回滚演练通过：生产默认、全局/规则/DB 回退、DB 规则刷新和 legacy_retired 防误启均可用。真实生产回滚仍需在生产或准生产执行并写入生产证据。'
          : '本地回滚演练存在失败项；先修复灰度/回滚开关，再继续生产灰度。',
      },
      source: {
        grayStrategy: 'packages/server-v2/src/agent-v2/agent-v2-gray-strategy.service.ts',
        productionEnvExample: relativePath(productionEnvExamplePath),
      },
      gates,
      blockers,
      boundary: {
        connectsDatabase: false,
        callsProductionApi: false,
        mutatesProductionState: false,
        writesCanonicalProductionEvidence: false,
      },
    };

    writeJson(outputJsonPath, report);
    writeMarkdown(outputMdPath, report);
    console.log(JSON.stringify(report.summary, null, 2));

    if (process.argv.includes('--strict') && !pass) process.exit(1);
  } finally {
    restoreEnv(originalEnv);
  }
}

async function buildGates(productionEnvExample: Record<string, string>): Promise<DrillGate[]> {
  const gates: DrillGate[] = [];

  const productionDefault = withEnv({ NODE_ENV: 'production' }, () => defaultAgentV2GrayMode());
  gates.push(gate(
    'production_default_rollback_baseline',
    '生产无显式灰度配置时默认回到旧链路',
    'defaultAgentV2GrayMode() 在 production 下返回 legacy_regex',
    `mode=${productionDefault.mode}`,
    productionDefault.mode === 'legacy_regex',
    '生产配置缺失或被清空时，默认不直接切新架构。',
  ));

  const nonProductionDefault = withEnv({ NODE_ENV: 'test' }, () => defaultAgentV2GrayMode());
  gates.push(gate(
    'non_production_default_new_chain',
    '非生产默认保持新链路优先',
    'defaultAgentV2GrayMode() 在 test/development 下返回 kg_llm_preferred',
    `mode=${nonProductionDefault.mode}`,
    nonProductionDefault.mode === 'kg_llm_preferred',
    '本地和 CI 继续靠近新架构验收，不影响生产默认。',
  ));

  const productionEnvRollback = {
    gray: productionEnvExample.AGENT_V2_GRAY_MODE,
    engine: productionEnvExample.AGENT_INTENT_ENGINE,
    confirmed: productionEnvExample.AGENT_V2_LEGACY_RETIREMENT_CONFIRMED,
  };
  gates.push(gate(
    'production_env_example_rollback_ready',
    '生产环境样例保留回滚基线',
    'AGENT_V2_GRAY_MODE=legacy_regex，AGENT_INTENT_ENGINE=legacy_regex，AGENT_V2_LEGACY_RETIREMENT_CONFIRMED=false',
    `gray=${display(productionEnvRollback.gray)}, engine=${display(productionEnvRollback.engine)}, confirmed=${display(productionEnvRollback.confirmed)}`,
    productionEnvRollback.gray === 'legacy_regex'
      && productionEnvRollback.engine === 'legacy_regex'
      && productionEnvRollback.confirmed === 'false',
    '后续生产配置可通过环境变量回到旧链路，且默认不确认最终退役。',
  ));

  const contextRollback = withEnv({ NODE_ENV: 'production', AGENT_V2_GRAY_MODE: 'kg_llm_only' }, () => {
    const service = new AgentV2GrayStrategyService();
    return service.resolve({ actor, context: { agentV2GrayMode: 'legacy_regex' } });
  });
  gates.push(strategyGate(
    'context_rollback_override',
    '调试上下文可临时回退旧链路',
    'context.agentV2GrayMode=legacy_regex 优先于 AGENT_V2_GRAY_MODE=kg_llm_only',
    contextRollback,
    { mode: 'legacy_regex', source: 'context', engine: 'legacy_regex' },
    '治理调试和人工排障可以临时验证旧链路。',
  ));

  const envGlobalRollback = withEnv({ NODE_ENV: 'production', AGENT_V2_GRAY_MODE: 'legacy_regex' }, () => {
    const service = new AgentV2GrayStrategyService();
    return service.resolve({ actor });
  });
  gates.push(strategyGate(
    'env_global_rollback',
    '全局环境变量可回退旧链路',
    'AGENT_V2_GRAY_MODE=legacy_regex 返回 legacy_regex',
    envGlobalRollback,
    { mode: 'legacy_regex', source: 'env_global', engine: 'legacy_regex' },
    '生产异常时可先用全局开关恢复旧链路。',
  ));

  const envRuleRollback = withEnv({
    NODE_ENV: 'production',
    AGENT_V2_GRAY_MODE: 'kg_llm_only',
    AGENT_V2_GRAY_RULES: JSON.stringify([
      {
        name: 'rollback-card-capability',
        mode: 'legacy_regex',
        entrypoints: ['kiosk'],
        capabilityIds: ['card.package.inactive-customers.list'],
      },
    ]),
  }, () => {
    const service = new AgentV2GrayStrategyService();
    return service.resolve({ actor, capabilityIds: ['card.package.inactive-customers.list'] });
  });
  gates.push(strategyGate(
    'env_rule_scoped_rollback',
    '环境规则可按入口/能力回退旧链路',
    '匹配 capabilityId + entrypoint 的 AGENT_V2_GRAY_RULES 优先于全局 kg_llm_only',
    envRuleRollback,
    { mode: 'legacy_regex', source: 'env_rule', engine: 'legacy_regex', matchedRule: 'rollback-card-capability' },
    '可对单能力或单入口回滚，避免全量切回影响新链路灰度。',
  ));

  const dbRuleRollback = await withEnvAsync({
    NODE_ENV: 'production',
    AGENT_V2_GRAY_RULES: JSON.stringify([{ name: 'env-kg-only', mode: 'kg_llm_only', entrypoints: ['kiosk'] }]),
  }, async () => {
    const prisma = mockPrisma([
      {
        id: 1,
        name: 'db-rollback-card',
        mode: 'legacy_regex',
        status: 'active',
        priority: 1,
        storeIds: [],
        personaCodes: [],
        roles: [],
        entrypoints: ['kiosk'],
        capabilityIds: ['card.package.inactive-customers.list'],
      },
    ]);
    const service = new AgentV2GrayStrategyService(prisma as any);
    return service.resolveAsync({ actor, capabilityIds: ['card.package.inactive-customers.list'] });
  });
  gates.push(strategyGate(
    'db_rule_scoped_rollback',
    '治理表规则可优先于环境规则回退旧链路',
    'active DB rule 匹配时返回 legacy_regex/db_rule',
    dbRuleRollback,
    { mode: 'legacy_regex', source: 'db_rule', engine: 'legacy_regex', matchedRule: 'db-rollback-card' },
    '后续生产治理中心可用更细粒度规则回滚，不必修改全局环境变量。',
  ));

  const dbRefresh = await withEnvAsync({ NODE_ENV: 'production' }, async () => {
    let rows: Array<Record<string, unknown>> = [
      { id: 1, name: 'db-canary-kg-only', mode: 'kg_llm_only', status: 'active', priority: 1, storeIds: [], personaCodes: [], roles: [], entrypoints: ['kiosk'], capabilityIds: ['card.package.inactive-customers.list'] },
    ];
    const prisma = mockPrismaProvider(() => rows);
    const service = new AgentV2GrayStrategyService(prisma as any);
    const before = await service.resolveAsync({ actor, capabilityIds: ['card.package.inactive-customers.list'] });
    rows = [
      { id: 2, name: 'db-refresh-rollback', mode: 'legacy_regex', status: 'active', priority: 1, storeIds: [], personaCodes: [], roles: [], entrypoints: ['kiosk'], capabilityIds: ['card.package.inactive-customers.list'] },
    ];
    await service.refreshDbRules();
    const after = await service.resolveAsync({ actor, capabilityIds: ['card.package.inactive-customers.list'] });
    return { before, after };
  });
  gates.push(gate(
    'db_rule_refresh_rollback',
    'DB 灰度规则刷新后可从新链路回滚旧链路',
    'refreshDbRules() 后由 kg_llm_only 变为 legacy_regex',
    `before=${dbRefresh.before.mode}/${dbRefresh.before.source}/${dbRefresh.before.matchedRule ?? '-'}, after=${dbRefresh.after.mode}/${dbRefresh.after.source}/${dbRefresh.after.matchedRule ?? '-'}`,
    dbRefresh.before.mode === 'kg_llm_only'
      && dbRefresh.before.source === 'db_rule'
      && dbRefresh.after.mode === 'legacy_regex'
      && dbRefresh.after.source === 'db_rule',
    '治理中心改规则后，Runtime 可刷新缓存并快速回退。',
  ));

  const unconfirmedRetired = withEnv({ NODE_ENV: 'production', AGENT_V2_GRAY_MODE: 'legacy_retired' }, () => {
    const service = new AgentV2GrayStrategyService();
    return service.resolve({ actor });
  });
  gates.push(strategyGate(
    'legacy_retired_unconfirmed_guard',
    '未确认退役时 legacy_retired 自动降级',
    '生产 legacy_retired 且未设置确认开关时返回 kg_llm_preferred',
    unconfirmedRetired,
    { mode: 'kg_llm_preferred', source: 'env_global', engine: 'kg_llm' },
    '误配置最终退役不会直接切到不可回退状态。',
  ));

  const confirmedRetired = withEnv({
    NODE_ENV: 'production',
    AGENT_V2_GRAY_MODE: 'legacy_retired',
    AGENT_V2_LEGACY_RETIREMENT_CONFIRMED: 'true',
  }, () => {
    const service = new AgentV2GrayStrategyService();
    return service.resolve({ actor });
  });
  gates.push(strategyGate(
    'legacy_retired_confirmed_allowed',
    '证据确认后才允许 legacy_retired',
    '生产 legacy_retired + AGENT_V2_LEGACY_RETIREMENT_CONFIRMED=true 返回 legacy_retired',
    confirmedRetired,
    { mode: 'legacy_retired', source: 'env_global', engine: 'kg_llm', legacyRetired: true },
    '最终退役需要显式确认，避免把本地演练当生产授权。',
  ));

  return gates;
}

function strategyGate(
  id: string,
  title: string,
  expected: string,
  actualStrategy: AgentV2GrayStrategy,
  expectedStrategy: Partial<AgentV2GrayStrategy>,
  impact: string,
) {
  const pass = Object.entries(expectedStrategy).every(([key, value]) => (actualStrategy as any)[key] === value);
  return gate(id, title, expected, formatStrategy(actualStrategy), pass, impact);
}

function gate(id: string, title: string, expected: string, actual: string, pass: boolean, impact: string): DrillGate {
  return { id, title, expected, actual, status: pass ? 'pass' : 'fail', impact };
}

function mockPrisma(rows: Array<Record<string, unknown>>) {
  return mockPrismaProvider(() => rows);
}

function mockPrismaProvider(provider: () => Array<Record<string, unknown>>) {
  return {
    agentV2GrayRule: {
      findMany: async () => provider(),
    },
  };
}

function formatStrategy(strategy: AgentV2GrayStrategy) {
  return [
    `mode=${strategy.mode}`,
    `source=${strategy.source}`,
    `engine=${strategy.engine}`,
    `fallback=${strategy.allowLegacyFallback}`,
    `shadow=${strategy.recordShadow}`,
    `retired=${strategy.legacyRetired}`,
    `rule=${strategy.matchedRule ?? '-'}`,
  ].join(', ');
}

function snapshotEnv() {
  return Object.fromEntries(envKeys.map((key) => [key, process.env[key]]));
}

function restoreEnv(snapshot: Record<string, string | undefined>) {
  for (const key of envKeys) {
    const value = snapshot[key];
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
}

function withEnv<T>(env: Record<string, string>, callback: () => T): T {
  const snapshot = snapshotEnv();
  try {
    restoreEnv({});
    for (const [key, value] of Object.entries(env)) process.env[key] = value;
    return callback();
  } finally {
    restoreEnv(snapshot);
  }
}

async function withEnvAsync<T>(env: Record<string, string>, callback: () => Promise<T>): Promise<T> {
  const snapshot = snapshotEnv();
  try {
    restoreEnv({});
    for (const [key, value] of Object.entries(env)) process.env[key] = value;
    return await callback();
  } finally {
    restoreEnv(snapshot);
  }
}

function parseEnvExample(text: string): Record<string, string> {
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

function display(value: string | undefined) {
  return value === undefined ? '<missing>' : value || '<empty>';
}

function readText(path: string) {
  if (!existsSync(path)) throw new Error(`缺少回滚演练文件：${relativePath(path)}`);
  return readFileSync(path, 'utf8');
}

function writeJson(path: string, value: unknown) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function writeMarkdown(path: string, report: {
  generatedAt: string;
  summary: { pass: boolean; blockerCount: number; recommendation: string };
  source: Record<string, string>;
  gates: DrillGate[];
  boundary: Record<string, boolean>;
}) {
  mkdirSync(dirname(path), { recursive: true });
  const lines = [
    '# Agent V2 本地回滚演练',
    '',
    `生成时间：${report.generatedAt}`,
    '',
    '## 结论',
    '',
    `- 通过：${report.summary.pass ? '是' : '否'}`,
    `- 阻塞项：${report.summary.blockerCount}`,
    `- 建议：${report.summary.recommendation}`,
    '',
    '## 检查来源',
    '',
    ...Object.entries(report.source).map(([key, value]) => `- ${key}: \`${value}\``),
    '',
    '## 演练门禁',
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
    `- 连接生产数据库：${report.boundary.connectsDatabase ? '是' : '否'}`,
    `- 调用生产 API：${report.boundary.callsProductionApi ? '是' : '否'}`,
    `- 修改生产状态：${report.boundary.mutatesProductionState ? '是' : '否'}`,
    `- 写入正式生产证据：${report.boundary.writesCanonicalProductionEvidence ? '是' : '否'}`,
    '- 本演练只证明回滚开关和规则刷新路径在本地可执行；真实生产回滚验证仍需线上/准生产执行并纳入正式生产证据。',
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

await main();
