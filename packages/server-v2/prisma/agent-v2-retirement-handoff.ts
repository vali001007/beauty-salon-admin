import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, relative, resolve } from 'path';

type GateStatus = 'pass' | 'fail' | 'blocked';

type HandoffGate = {
  id: string;
  title: string;
  expected: string;
  actual: string;
  status: GateStatus;
  owner: string;
  nextAction: string;
};

type ReportValue = Record<string, any>;

const workspaceRoot = resolve(process.cwd(), '../..');
const docsRoot = resolve(workspaceRoot, 'docs/04-测试数据/Agent评测与知识治理-2026-06-30至07-03');
const outputJsonPath = resolve(docsRoot, 'agent-v2-retirement-handoff.json');
const outputMdPath = resolve(docsRoot, 'agent-v2-retirement-handoff.md');

const reportFiles = {
  evalGate: 'agent-v2-eval-gate-report.json',
  diffAttribution: 'agent-v2-legacy-diff-attribution.json',
  legacyDependencyAudit: 'agent-v2-legacy-dependency-audit.json',
  rollbackDrill: 'agent-v2-rollback-drill.json',
  productionConfigReadiness: 'agent-v2-production-config-readiness.json',
  retirementPreflight: 'agent-v2-legacy-retirement-preflight.json',
  productionEvidenceCheck: 'agent-v2-legacy-retirement-production-evidence-check.json',
  productionEvidenceExample: 'agent-v2-legacy-retirement-production-evidence.example.json',
  shadowEvidenceExample: 'agent-v2-shadow-evidence-export.example.json',
};

function main() {
  const reports = readReports();
  const gates = buildGates(reports);
  const localReady = gates
    .filter((gate) => gate.id.startsWith('local_'))
    .every((gate) => gate.status === 'pass');
  const productionReady = gates
    .filter((gate) => gate.id.startsWith('production_'))
    .every((gate) => gate.status === 'pass');
  const handoffReady = localReady && !productionReady && gates.some((gate) => gate.id === 'production_evidence_blocked' && gate.status === 'blocked');
  const blockers = gates.filter((gate) => gate.status !== 'pass');
  const report = {
    generatedAt: formatShanghaiTime(new Date()),
    summary: {
      handoffReady,
      localReady,
      productionReady,
      gateCount: gates.length,
      blockerCount: blockers.length,
      recommendation: handoffReady
        ? '本地退役交接包已就绪：可以进入生产/准生产证据采集阶段，但不能删除旧正则或切 legacy_retired。'
        : productionReady
          ? '生产证据已齐备；可进入旧正则删除前最终人工审批。'
          : '退役交接包仍有本地缺口；先补齐失败门禁。',
    },
    source: Object.fromEntries(Object.entries(reportFiles).map(([key, name]) => [key, relativePath(reportPath(name))])),
    gates,
    blockers,
    productionEvidenceChecklist: [
      '生产或准生产连续 7 天 shadow / kg_llm_preferred / kg_llm_only 运行导出。',
      '线上用户有用率样本，且新链路有用率不低于旧链路。',
      '生产 LLM 延迟 P99、失败率、成本和失败样本观测。',
      '高风险自动执行为 0 的线上证据。',
      '真实回滚验证：从 kg_llm_only / legacy_retired 回到 legacy_regex 或 kg_llm_preferred，记录时间、方法和执行人。',
      '生产 DB migration 授权执行与管理员 core:agent-governance:view/manage 权限授予记录。',
      '生产 API hook URL、deploy token、GitHub Secrets、后端环境变量和调度任务配置记录。',
    ],
    nextCommands: [
      'npm.cmd --prefix packages/server-v2 run agent-v2:legacy-retirement-shadow-export -- --dry-run --days 7 --environment production',
      'npm.cmd --prefix packages/server-v2 run agent-v2:legacy-retirement-shadow-evidence -- --input <production-export.json>',
      'npm.cmd --prefix packages/server-v2 run agent-v2:legacy-retirement-evidence -- --input <validated-production-evidence.json>',
      'npm.cmd --prefix packages/server-v2 run agent-v2:legacy-retirement-evidence -- --input <validated-production-evidence.json> --write-canonical',
      'npm.cmd --prefix packages/server-v2 run agent-v2:legacy-retirement-preflight -- --strict-retirement',
    ],
  };

  writeJson(outputJsonPath, report);
  writeMarkdown(outputMdPath, report);
  console.log(JSON.stringify(report.summary, null, 2));

  if (process.argv.includes('--strict') && !handoffReady && !productionReady) process.exit(1);
}

function buildGates(reports: Record<string, ReportValue | null>): HandoffGate[] {
  const evalSummary = reports.evalGate?.summary ?? {};
  const diffSummary = reports.diffAttribution?.summary ?? {};
  const dependencySummary = reports.legacyDependencyAudit?.summary ?? {};
  const rollbackSummary = reports.rollbackDrill?.summary ?? {};
  const configSummary = reports.productionConfigReadiness?.summary ?? {};
  const preflightSummary = reports.retirementPreflight?.summary ?? {};
  const evidenceSummary = reports.productionEvidenceCheck?.summary ?? {};

  return [
    gate(
      'local_strict_eval',
      '650 题 strict gate 通过',
      'pass=true，P0 未映射/权限待审/契约失败/错路由均为 0，高风险自动发布为 0',
      `pass=${evalSummary.pass}, p0=${evalSummary.p0Questions ?? 'n/a'}, unmapped=${evalSummary.p0Unmapped ?? 'n/a'}, permission=${evalSummary.p0PermissionNeedsReview ?? 'n/a'}, contract=${evalSummary.p0ContractNotPass ?? 'n/a'}, wrongRoute=${evalSummary.p0WrongRouteRisk ?? 'n/a'}, highRisk=${evalSummary.highRiskAutoPublish ?? 'n/a'}`,
      evalSummary.pass === true
        && Number(evalSummary.p0Unmapped ?? 1) === 0
        && Number(evalSummary.p0PermissionNeedsReview ?? 1) === 0
        && Number(evalSummary.p0ContractNotPass ?? 1) === 0
        && Number(evalSummary.p0WrongRouteRisk ?? 1) === 0
        && Number(evalSummary.highRiskAutoPublish ?? 1) === 0,
      '研发',
      '继续保持 strict gate 作为旧正则删除前置门禁。',
    ),
    gate(
      'local_diff_attribution',
      'KG-only 与 legacy 差异已归因且 KG 无待修',
      'safeToRetireByAttribution=true，needsKgFix=0',
      `safe=${diffSummary.safeToRetireByAttribution}, needsKgFix=${diffSummary.needsKgFix ?? 'n/a'}, diffTotal=${diffSummary.diffTotal ?? 'n/a'}`,
      diffSummary.safeToRetireByAttribution === true && Number(diffSummary.needsKgFix ?? 1) === 0,
      '研发',
      '生产 shadow 期间继续观察真实问法差异。',
    ),
    gate(
      'local_dependency_boundary',
      '旧正则依赖边界审计通过',
      'legacy dependency audit pass=true，blockerCount=0',
      `pass=${dependencySummary.pass}, blockers=${dependencySummary.blockerCount ?? 'n/a'}, predicates=${dependencySummary.legacyRegexPredicateCount ?? 'n/a'}`,
      dependencySummary.pass === true && Number(dependencySummary.blockerCount ?? 1) === 0,
      '研发',
      '后续新增能力不得继续扩张旧 isXxx 谓词。',
    ),
    gate(
      'local_rollback_drill',
      '本地回滚演练通过',
      'rollback drill pass=true，blockerCount=0',
      `pass=${rollbackSummary.pass}, blockers=${rollbackSummary.blockerCount ?? 'n/a'}`,
      rollbackSummary.pass === true && Number(rollbackSummary.blockerCount ?? 1) === 0,
      '研发/运维',
      '生产或准生产仍需执行真实回滚验证并写入证据。',
    ),
    gate(
      'local_config_readiness',
      '生产配置预留 readiness 通过',
      'production config readiness pass=true，blockerCount=0',
      `pass=${configSummary.pass}, blockers=${configSummary.blockerCount ?? 'n/a'}`,
      configSummary.pass === true && Number(configSummary.blockerCount ?? 1) === 0,
      '研发/运维',
      '生产域名和 token 稳定后再填 GitHub Secrets / 后端环境变量。',
    ),
    gate(
      'local_preflight',
      '旧正则退役本地预检通过',
      'localPreflightPass=true，retirementSafetyBlockers=0',
      `local=${preflightSummary.localPreflightPass}, safetyBlockers=${preflightSummary.retirementSafetyBlockers ?? 'n/a'}, ready=${preflightSummary.retirementReady}`,
      preflightSummary.localPreflightPass === true && Number(preflightSummary.retirementSafetyBlockers ?? 1) === 0,
      '研发',
      '本地门禁通过后进入生产证据采集，不删除旧正则。',
    ),
    blockedGate(
      'production_evidence_blocked',
      '生产证据仍阻塞旧正则删除',
      'retirementReady=false 且 productionEvidenceBlockers>0，production evidence check pass=false',
      `ready=${preflightSummary.retirementReady}, productionBlockers=${preflightSummary.productionEvidenceBlockers ?? 'n/a'}, evidencePass=${evidenceSummary.pass}, evidenceBlockers=${evidenceSummary.blockerCount ?? 'n/a'}`,
      preflightSummary.retirementReady === false
        && Number(preflightSummary.productionEvidenceBlockers ?? 0) > 0
        && evidenceSummary.pass === false,
      '产品/运维/研发',
      '补齐 7 天 shadow、线上有用率、LLM 观测和真实回滚验证后再写正式生产证据。',
    ),
    gate(
      'production_evidence_templates',
      '生产证据模板和 shadow 导出样例已存在',
      'production evidence example 与 shadow export example 文件存在',
      Object.entries({
        productionEvidenceExample: existsSync(reportPath(reportFiles.productionEvidenceExample)),
        shadowEvidenceExample: existsSync(reportPath(reportFiles.shadowEvidenceExample)),
      }).map(([key, exists]) => `${key}=${exists}`).join(', '),
      existsSync(reportPath(reportFiles.productionEvidenceExample))
        && existsSync(reportPath(reportFiles.shadowEvidenceExample)),
      '研发/运维',
      '按模板导出真实生产证据，不手工伪造样本。',
    ),
  ];
}

function gate(
  id: string,
  title: string,
  expected: string,
  actual: string,
  pass: boolean,
  owner: string,
  nextAction: string,
): HandoffGate {
  return { id, title, expected, actual, status: pass ? 'pass' : 'fail', owner, nextAction };
}

function blockedGate(
  id: string,
  title: string,
  expected: string,
  actual: string,
  blocked: boolean,
  owner: string,
  nextAction: string,
): HandoffGate {
  return { id, title, expected, actual, status: blocked ? 'blocked' : 'fail', owner, nextAction };
}

function readReports() {
  return Object.fromEntries(Object.entries(reportFiles).map(([key, name]) => {
    if (name.endsWith('.example.json')) return [key, existsSync(reportPath(name)) ? { exists: true } : null];
    const path = reportPath(name);
    return [key, existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : null];
  })) as Record<string, ReportValue | null>;
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
  summary: Record<string, unknown>;
  source: Record<string, string>;
  gates: HandoffGate[];
  productionEvidenceChecklist: string[];
  nextCommands: string[];
}) {
  mkdirSync(dirname(path), { recursive: true });
  const lines = [
    '# Agent V2 旧正则退役交接包',
    '',
    `生成时间：${report.generatedAt}`,
    '',
    '## 结论',
    '',
    `- 本地交接就绪：${report.summary.handoffReady ? '是' : '否'}`,
    `- 本地门禁通过：${report.summary.localReady ? '是' : '否'}`,
    `- 生产退役就绪：${report.summary.productionReady ? '是' : '否'}`,
    `- 阻塞项：${report.summary.blockerCount}`,
    `- 建议：${report.summary.recommendation}`,
    '',
    '## 报告来源',
    '',
    ...Object.entries(report.source).map(([key, value]) => `- ${key}: \`${value}\``),
    '',
    '## 交接门禁',
    '',
    '| 门禁 | 状态 | 期望 | 当前 | 责任方 | 下一步 |',
    '| --- | --- | --- | --- | --- | --- |',
    ...report.gates.map((gate) => [
      escapeMd(gate.title),
      statusLabel(gate.status),
      escapeMd(gate.expected),
      escapeMd(gate.actual),
      escapeMd(gate.owner),
      escapeMd(gate.nextAction),
    ].join(' | ')).map((line) => `| ${line} |`),
    '',
    '## 生产证据清单',
    '',
    ...report.productionEvidenceChecklist.map((item) => `- ${item}`),
    '',
    '## 后续命令',
    '',
    '```powershell',
    ...report.nextCommands,
    '```',
    '',
    '## 边界',
    '',
    '- 本交接包只汇总本地报告和生产缺口，不连接生产库、不调用生产 API、不写正式生产证据。',
    '- 通过交接包只代表可以进入生产/准生产证据采集阶段，不代表旧正则已可删除。',
  ];
  writeFileSync(path, `${lines.join('\n')}\n`, 'utf8');
}

function statusLabel(status: GateStatus) {
  if (status === 'pass') return '通过';
  if (status === 'blocked') return '生产证据阻塞';
  return '失败';
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
